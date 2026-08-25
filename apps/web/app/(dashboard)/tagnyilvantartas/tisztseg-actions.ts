'use server'

/**
 * Nem-presbiteri gyülekezeti tisztségek (tisztsegek tábla) — CRUD
 * (2026-08-26, 5. kör). Kántor, diakónus, nőszövetségi/IKE-elnök, önkéntes,
 * bizottsági tagok (gazdasági/leltározó/diakóniai), egyházmegyei küldött.
 *
 * A mandátum-lezárás itt is a `vege` kitöltése (a sor megmarad); a törlés a
 * téves rögzítésé (is_deleted — Kuka-kompatibilis jelölés).
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logAuditEvent } from '@/lib/audit/log'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { tisztsegSchema, type TisztsegInput } from '@/lib/validations/members'

export interface TisztsegRow {
  id: string
  tipus: string
  bizottsag: string | null
  bizottsagi_szerep: string | null
  jelleg: string | null
  egyeb_megnevezes: string | null
  kezdete: string | null
  vege: string | null
  publikus: boolean
  megjegyzes: string | null
  szemely: {
    id: number; csaladnev: string; k_nev: string; ferfi: boolean
    sz_datum: string | null; telefon: string | null
    nev_publikalas_consent: boolean | null
  } | null
}

const HIANYZO_TABLA_UZENET =
  'A tisztségek táblája még nincs létrehozva az adatbázisban — futtasd le a ' +
  '2026-08-26-presbiterium-tisztsegek.sql migrációt, majd frissítsd az oldalt.'

function hianyzoTabla(message?: string | null): boolean {
  const m = (message || '').toLowerCase()
  return m.includes('tisztsegek') && (m.includes('does not exist') || m.includes('schema cache'))
}

export async function getTisztsegek(): Promise<{ rows: TisztsegRow[]; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { rows: [] }
  const { data, error } = await supabase
    .from('tisztsegek')
    .select('id, tipus, bizottsag, bizottsagi_szerep, jelleg, egyeb_megnevezes, kezdete, vege, publikus, megjegyzes, szemely:szemely!id_szemely!inner(id, csaladnev, k_nev, ferfi, sz_datum, telefon, nev_publikalas_consent)')
    .eq('congregation_id', congregationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
  if (error) {
    if (hianyzoTabla(error.message)) return { rows: [], error: HIANYZO_TABLA_UZENET }
    return { rows: [], error: `A tisztségek betöltése nem sikerült: ${error.message}` }
  }
  return { rows: (data || []) as unknown as TisztsegRow[] }
}

export async function saveTisztseg(input: TisztsegInput) {
  const parsed = tisztsegSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data

  const { supabase: scoped, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  if (d.tipus === 'bizottsagi_tag' && !d.bizottsag) {
    return { error: 'Bizottsági tagnál a bizottság kiválasztása kötelező.' }
  }
  if (d.kezdete && d.vege && d.vege < d.kezdete) {
    return { error: 'A mandátum vége nem előzheti meg a kezdetét.' }
  }

  // A személy az aktív gyülekezethez tartozik? (a DB-trigger is őrzi, de itt
  // beszédes magyar üzenetet adunk)
  const { data: szemely } = await scoped
    .from('szemely')
    .select('id, nev_publikalas_consent')
    .eq('id', d.id_szemely)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (!szemely) return { error: 'A kiválasztott személy nem az aktív gyülekezethez tartozik.' }

  const supabase = await createClient()
  const record = {
    congregation_id: congregationId,
    id_szemely: d.id_szemely,
    tipus: d.tipus,
    bizottsag: d.tipus === 'bizottsagi_tag' ? d.bizottsag : null,
    bizottsagi_szerep: d.tipus === 'bizottsagi_tag' ? (d.bizottsagi_szerep || 'tag') : null,
    jelleg: d.tipus === 'kantor' ? d.jelleg || null : null,
    egyeb_megnevezes: d.tipus === 'egyeb' ? d.egyeb_megnevezes?.trim() || null : null,
    kezdete: d.kezdete || null,
    vege: d.vege || null,
    publikus: d.publikus,
    megjegyzes: d.megjegyzes?.trim() || null,
    updated_at: new Date().toISOString(),
  }

  let error: { message: string } | null = null
  if (d.id) {
    const res = await supabase.from('tisztsegek').update(record)
      .eq('id', d.id).eq('congregation_id', congregationId)
    error = res.error
  } else {
    const res = await supabase.from('tisztsegek').insert(record)
    error = res.error
  }
  if (error) {
    if (hianyzoTabla(error.message)) return { error: HIANYZO_TABLA_UZENET }
    return { error: `Hiba: ${error.message}` }
  }

  let warning: string | undefined
  if (d.publikus && (szemely as { nev_publikalas_consent?: boolean | null }).nev_publikalas_consent !== true) {
    warning = 'A tisztség publikusra jelölve, de a személynek NINCS rögzített név-publikálási hozzájárulása — a weboldalon addig nem jelenik meg, amíg a személyi kartonon be nem pipálod a hozzájárulást.'
  }

  await logAuditEvent({ action: 'tisztseg.save', targetTable: 'tisztsegek', targetId: d.id || null, metadata: { tipus: d.tipus } }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { success: true, warning }
}

/** Mandátum lezárása — a sor megmarad (történet). */
export async function lezarTisztsegMandatum(id: string, vege: string) {
  const { congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vege)) return { error: 'Érvénytelen dátum.' }

  const supabase = await createClient()
  const { data, error } = await supabase.from('tisztsegek')
    .update({ vege, updated_at: new Date().toISOString() })
    .eq('id', id).eq('congregation_id', congregationId)
    .select('id')
  if (error) return { error: `Hiba: ${error.message}` }
  if (!data || data.length === 0) return { error: 'A tisztség-sor nem található az aktív gyülekezetben.' }
  await logAuditEvent({ action: 'tisztseg.mandatum_lezaras', targetTable: 'tisztsegek', targetId: id, metadata: { vege } }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

/** Téves rögzítés — Kuka-jelölés (is_deleted), nem fizikai törlés. */
export async function deleteTisztseg(id: string) {
  const { congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  const supabase = await createClient()
  const { data, error } = await supabase.from('tisztsegek')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id).eq('congregation_id', congregationId)
    .select('id')
  if (error) return { error: `Hiba: ${error.message}` }
  if (!data || data.length === 0) return { error: 'A tisztség-sor nem található az aktív gyülekezetben.' }
  await logAuditEvent({ action: 'tisztseg.delete', targetTable: 'tisztsegek', targetId: id }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}