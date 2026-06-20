'use server'

/**
 * Pénzügyi tétel szerkesztés és stornó server akciók.
 *
 * Két fő művelet:
 *   1. updateTransactionBasic — az alapadatok (dátum, összeg, jogcím,
 *      partner, iratszám, megjegyzés) módosítása egy meglévő tételen.
 *   2. stornoTransaction — stornózás kötelező indoklással. A tétel
 *      stornózott=true jelzéssel marad a listában, de az összesítőből
 *      és az egyenlegből kimarad.
 *
 * 2026-04-18 SCOPE-AWARE REFAKTOR: diocese és congregation scope-on is
 * működik. A scope-specifikus táblaneveket és oszlopokat a
 * `getFinanceScopeContext` + `tablesFor(scope)` helper adja.
 *
 * FONTOS: a véglegesített (számadás lezárva) évekre vonatkozó tételek
 *         NEM szerkeszthetők — a felhasználó előbb javítási kérelmet ad.
 */

import { revalidatePath } from 'next/cache'
import {
  getFinanceScopeContext,
  tablesFor,
  isYearFinalized,
  type FinanceScopeContext,
} from '@/lib/auth/finance-scope'

export type TransactionType = 'befizetes' | 'kiadas'

/**
 * Megmondja, hogy egy tétel az ADOTT TÍPUSÚ utolsó-e az éveben + scope-ban.
 * A dátum-szerkesztést csak az utolsó tételre engedjük: ha valaki köztes
 * dátumot írna, az ELRONTANÁ a kronológiát és a nyugtaszámozást.
 *
 * Kliens oldali UI-ból hívjuk meg, mielőtt megmutatja a szerkesztő dialogot.
 */
export async function isLastTransactionOfType(args: {
  type: TransactionType
  id: number
}): Promise<{ isLast?: boolean; error?: string }> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return { error: ctx.error }
  const T = tablesFor(ctx.scope)
  const table = args.type === 'befizetes' ? T.befizetes : T.kiadas

  // Lekérjük a tétel dátumát
  const { data: current } = await ctx.supabase
    .from(table)
    .select('datum')
    .eq('id', args.id)
    .eq(T.scopeCol, ctx.scopeId)
    .maybeSingle()

  if (!current?.datum) return { isLast: false }

  // Van-e ugyanabban az évben és a jelen tételnél későbbi dátumú tétel?
  const year = new Date(current.datum as string).getFullYear()
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`

  const { data: later } = await ctx.supabase
    .from(table)
    .select('id')
    .eq(T.scopeCol, ctx.scopeId)
    .eq('deleted', false)
    .gt('datum', current.datum as string)
    .lte('datum', yearEnd)
    .gte('datum', yearStart)
    .limit(1)

  return { isLast: !later || later.length === 0 }
}

/**
 * Egy befizetés jelenlegi tag-hozzárendelésének lekérdezése a szerkesztő dialóghoz
 * (ki van/nincs hozzárendelve). Csak congregation scope + befizetés esetén értelmes.
 */
export async function getTransactionPersonInfo(args: {
  type: TransactionType
  id: number
}): Promise<{ id_szemely?: number | null; id_csalad?: number | null; nev?: string | null; forrasa?: string | null; error?: string }> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return { error: ctx.error }
  if (ctx.scope !== 'congregation' || args.type !== 'befizetes') return {}
  const T = tablesFor(ctx.scope)

  const { data } = await ctx.supabase
    .from(T.befizetes)
    .select('id_szemely, id_csalad, forrasa')
    .eq('id', args.id)
    .eq(T.scopeCol, ctx.scopeId)
    .maybeSingle()
  if (!data) return {}
  const row = data as { id_szemely: number | null; id_csalad: number | null; forrasa: string | null }

  let nev: string | null = null
  if (row.id_szemely) {
    const { data: sz } = await ctx.supabase
      .from('szemely')
      .select('csaladnev, k_nev')
      .eq('id', row.id_szemely)
      .maybeSingle()
    if (sz) {
      const s = sz as { csaladnev: string | null; k_nev: string | null }
      nev = [s.csaladnev, s.k_nev].filter(Boolean).join(' ').trim() || null
    }
  }
  return { id_szemely: row.id_szemely, id_csalad: row.id_csalad, nev, forrasa: row.forrasa }
}

export interface UpdateTransactionInput {
  type: TransactionType
  id: number
  datum?: string
  osszeg?: number
  megjegyzes?: string | null
  /** Kassza/bank jogcím kategória — a befizetescel/kiadascel PK-ja
   * (congregation) vagy a szamadasicel kód-indexe (diocese). */
  id_cel?: number | null
  /** Iratszám (chitanta sorszám vagy számla sorszám). */
  iratszam?: string | null
  /** Partner — vagy szemely FK, vagy szabad szöveges forrás. */
  id_szemely?: number | null
  id_csalad?: number | null
  forrasa?: string | null
}

export async function updateTransactionBasic(
  input: UpdateTransactionInput,
): Promise<{ success?: boolean; error?: string }> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return { error: ctx.error }
  const T = tablesFor(ctx.scope)
  const table = input.type === 'befizetes' ? T.befizetes : T.kiadas

  // Véglegesített év védelme
  if (input.datum) {
    const year = new Date(input.datum).getFullYear()
    const finalized = await isYearFinalized(ctx, year)
    if (finalized) {
      return {
        error: `A ${year}. évi számadás már véglegesítve van. Először kérj javítási engedélyt az egyházmegyétől.`,
      }
    }
  }

  // Alap update objektum — csak azokat írjuk, amelyek meg vannak adva
  const updateData: Record<string, unknown> = {}
  if (input.datum !== undefined) updateData.datum = input.datum
  if (input.osszeg !== undefined) updateData.osszeg = input.osszeg
  if (input.megjegyzes !== undefined) updateData.megjegyzes = input.megjegyzes?.trim() || null
  if (input.iratszam !== undefined) {
    updateData.iratszam = input.iratszam?.trim() || null
  }

  // Kategória oszlop scope-specifikus
  if (input.type === 'befizetes') {
    if (input.id_cel !== undefined) {
      updateData[T.categoryColBefizetes] = await resolveCategoryValue(ctx, input.id_cel)
    }
    // A tag-referenciák csak congregation módban léteznek
    if (ctx.scope === 'congregation') {
      if (input.id_szemely !== undefined) updateData.id_szemely = input.id_szemely
      if (input.id_csalad !== undefined) updateData.id_csalad = input.id_csalad
    }
    if (input.forrasa !== undefined) updateData.forrasa = input.forrasa?.trim() || null
  } else {
    if (input.id_cel !== undefined) {
      updateData[T.categoryColKiadas] = await resolveCategoryValue(ctx, input.id_cel)
    }
  }

  // Update timestamp
  updateData.updated_at = new Date().toISOString()

  if (Object.keys(updateData).length === 1) {
    // Csak updated_at → nincs valódi változás
    return { error: 'Nem adtál meg módosítandó mezőt.' }
  }

  const { error } = await ctx.supabase
    .from(table)
    .update(updateData)
    .eq('id', input.id)
    .eq(T.scopeCol, ctx.scopeId)

  if (error) return { error: `Mentés sikertelen: ${error.message}` }

  revalidatePath('/penzugy')
  return { success: true }
}

/**
 * Diocese-scope-ban a kategória oszlop `id_szamadasicel` (string kód),
 * congregation-scope-ban `id_befizetescel`/`id_kiadascel` (int). A UI
 * int-et küld — diocese módban ezt kóddá konvertáljuk a szamadasicel.sorszam
 * alapján (ua. mint az insertDioceseIncomeRecord-ban).
 */
async function resolveCategoryValue(
  ctx: FinanceScopeContext,
  id_cel: number | null,
): Promise<number | string | null> {
  if (id_cel == null) return null
  if (ctx.scope === 'congregation') return id_cel

  // Diocese: int → kód konverzió
  const { data: cells } = await ctx.supabase
    .from('szamadasicel')
    .select('id, sorszam')
    .order('sorszam')
  const rows = (cells || []) as Array<{ id: string; sorszam: number }>
  const found = rows.find((c) => c.sorszam === id_cel)
  if (found) return found.id
  const direct = rows.find((c) => c.id === String(id_cel))
  if (direct) return direct.id
  return null
}

export async function stornoTransaction(args: {
  type: TransactionType
  id: number
  indok: string
}): Promise<{ success?: boolean; error?: string }> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return { error: ctx.error }
  const T = tablesFor(ctx.scope)
  const table = args.type === 'befizetes' ? T.befizetes : T.kiadas

  const indok = (args.indok || '').trim()
  if (indok.length < 5) {
    return { error: 'A stornó indoklás legalább 5 karakter legyen.' }
  }

  // Először lekérdezzük a tétel dátumát a véglegesítés-ellenőrzéshez
  // Diocese módban nincs belso_mozgas_xkey — a select konditionálisan
  const selectCols =
    ctx.scope === 'diocese' ? 'datum, stornozott' : 'datum, belso_mozgas_xkey, stornozott'

  const { data: row } = await ctx.supabase
    .from(table)
    .select(selectCols)
    .eq('id', args.id)
    .eq(T.scopeCol, ctx.scopeId)
    .maybeSingle()

  if (!row) return { error: 'A tétel nem található.' }
  const r = row as { datum?: string; belso_mozgas_xkey?: string | null; stornozott?: boolean }
  if (r.stornozott) return { error: 'Ez a tétel már stornózva van.' }

  if (r.datum) {
    const year = new Date(r.datum).getFullYear()
    const finalized = await isYearFinalized(ctx, year)
    if (finalized) {
      return {
        error: `A ${year}. évi számadás már véglegesítve van. Először kérj javítási engedélyt az egyházmegyétől.`,
      }
    }
  }

  const payload = {
    stornozott: true,
    stornozott_at: new Date().toISOString(),
    stornozott_indok: indok,
    stornozott_by: ctx.userId,
    updated_at: new Date().toISOString(),
  }

  // Belső mozgás pairing csak congregation scope-ban releváns
  if (ctx.scope === 'congregation' && r.belso_mozgas_xkey) {
    const { error: bErr } = await ctx.supabase
      .from('befizetes')
      .update(payload)
      .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
      .eq('congregation_id', ctx.scopeId)
    if (bErr) return { error: `Stornózás sikertelen: ${bErr.message}` }

    const { error: kErr } = await ctx.supabase
      .from('kiadas')
      .update(payload)
      .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
      .eq('congregation_id', ctx.scopeId)
    if (kErr) return { error: `Stornózás sikertelen: ${kErr.message}` }
  } else {
    const { error } = await ctx.supabase
      .from(table)
      .update(payload)
      .eq('id', args.id)
      .eq(T.scopeCol, ctx.scopeId)
    if (error) return { error: `Stornózás sikertelen: ${error.message}` }
  }

  // Ha a befizetéshez tartozott oblio számla, azt is stornózzuk — csak congregation scope
  if (args.type === 'befizetes' && ctx.scope === 'congregation') {
    await ctx.supabase
      .from('oblio_szamlak')
      .update({
        stornozott: true,
        stornozott_at: new Date().toISOString(),
        stornozott_indok: `A befizetés stornózva: ${indok}`,
      })
      .eq('befizetes_id', args.id)
      .eq('congregation_id', ctx.scopeId)
      .eq('stornozott', false)
  }

  revalidatePath('/penzugy')
  return { success: true }
}

export async function undoStornoTransaction(args: {
  type: TransactionType
  id: number
}): Promise<{ success?: boolean; error?: string }> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return { error: ctx.error }
  const T = tablesFor(ctx.scope)
  const table = args.type === 'befizetes' ? T.befizetes : T.kiadas

  const selectCols =
    ctx.scope === 'diocese' ? 'stornozott_by, datum' : 'stornozott_by, belso_mozgas_xkey, datum'

  const { data: row } = await ctx.supabase
    .from(table)
    .select(selectCols)
    .eq('id', args.id)
    .eq(T.scopeCol, ctx.scopeId)
    .maybeSingle()

  if (!row) return { error: 'A tétel nem található.' }
  const r = row as { stornozott_by?: string | null; belso_mozgas_xkey?: string | null; datum?: string }

  if (r.datum) {
    const year = new Date(r.datum).getFullYear()
    const finalized = await isYearFinalized(ctx, year)
    if (finalized) {
      return { error: `A ${year}. évi számadás véglegesítve van — a stornó nem vonható vissza.` }
    }
  }

  const payload = {
    stornozott: false,
    stornozott_at: null,
    stornozott_indok: null,
    stornozott_by: null,
    updated_at: new Date().toISOString(),
  }

  if (ctx.scope === 'congregation' && r.belso_mozgas_xkey) {
    await ctx.supabase
      .from('befizetes')
      .update(payload)
      .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
      .eq('congregation_id', ctx.scopeId)
    await ctx.supabase
      .from('kiadas')
      .update(payload)
      .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
      .eq('congregation_id', ctx.scopeId)
  } else {
    const { error } = await ctx.supabase
      .from(table)
      .update(payload)
      .eq('id', args.id)
      .eq(T.scopeCol, ctx.scopeId)
    if (error) return { error: `Visszavonás sikertelen: ${error.message}` }
  }

  revalidatePath('/penzugy')
  return { success: true }
}
