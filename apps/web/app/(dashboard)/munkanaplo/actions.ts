'use server'

import { revalidatePath } from 'next/cache'
import { worklogSchema, type WorklogInput } from '@/lib/validations/worklog'
import type { WorklogEntry } from '@/lib/constants/worklog'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { isMissingDeletedColumn } from '@/lib/worklog/registry-sync'

async function getCongId() {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  return { supabase, congId: congregationId }
}

/**
 * Munkanapló-bejegyzések lekérdezése.
 *
 * 2026-06-12 (Endre #3 munkanapló): a `period` lehet
 *  - 'YYYY-MM' → adott hónap (eddigi viselkedés)
 *  - 'YYYY'    → teljes év (az év/típus-szűrőhöz és a nyomtatási központhoz)
 *
 * A `deleted` szűrő fallback-kel fut: ha az oszlop még nem létezik a DB-ben
 * (a 2026-06-12c SQL lefuttatásáig), oszlop nélkül kérdezünk — különben a
 * teljes lista üresen jönne vissza (ez volt a modul fő hibája).
 */
export async function getWorklogs(period: string): Promise<WorklogEntry[]> {
  const { supabase, congId } = await getCongId()
  if (!congId) return []
  const isFullYear = /^\d{4}$/.test(period)
  const startDate = isFullYear ? `${period}-01-01` : `${period}-01`
  const endDate = isFullYear ? `${period}-12-31` : `${period}-31`

  const base = () => supabase.from('munkanaplo').select('*')
    .eq('congregation_id', congId)
    .gte('idopont', startDate).lte('idopont', endDate)
    .order('idopont', { ascending: false })

  let res = await base().eq('deleted', false)
  if (res.error && isMissingDeletedColumn(res.error)) res = await base()
  if (res.error) {
    console.warn('[getWorklogs] lekérdezés hiba:', res.error.message)
    return []
  }
  return (res.data || []) as unknown as WorklogEntry[]
}

/** Teljes éves lista — a nyomtatási központ (éves lelkészi jelentés) adatforrása. */
export async function getWorklogsForYear(year: number): Promise<WorklogEntry[]> {
  return getWorklogs(String(year))
}

export async function saveWorklog(data: WorklogInput) {
  const parsed = worklogSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const d = parsed.data
  // jelenlet_osszesen NOT NULL — automatikusan számítjuk ha nem adott
  const sumJelenlet =
    d.jelenlet_osszesen ??
    ((d.jelenlet_ferfi ?? 0) + (d.jelenlet_no ?? 0) + (d.jelenlet_gyermek ?? 0))

  const record: Record<string, unknown> = {
    idopont: d.idopont,
    jellege: d.jellege,
    kategoria: d.kategoria || 'szolgalat',
    id_jellege: d.id_jellege || null,
    bibliaolvasas: d.bibliaolvasas || null,
    alapige: d.alapige || null,
    cim: d.cim || null,
    enekek: d.enekek || null,
    jelenlet_ferfi: d.jelenlet_ferfi ?? null,
    jelenlet_no: d.jelenlet_no ?? null,
    jelenlet_gyermek: d.jelenlet_gyermek ?? null,
    jelenlet_osszesen: sumJelenlet,
    szolgalt: d.szolgalt || null,
    persely: d.persely ?? null,
    mediapath: d.mediapath || null,
    du: d.du ?? false,
    megjegyzes: d.megjegyzes || null,
    deleted: false,
    congregation_id: congId,
  }
  if (d.id) {
    // 2026-06-12: szerkesztéskor az id_jellege-t NEM nulláznánk ki — abban él
    // az anyakönyvi forrás-marker (pl. `keresztseg:123`). A dialog nem küldi,
    // ezért csak akkor írjuk, ha ténylegesen jött érték.
    if (!d.id_jellege) delete record.id_jellege
    let upd = await supabase.from('munkanaplo').update(record).eq('id', d.id).eq('congregation_id', congId)
    if (upd.error && isMissingDeletedColumn(upd.error)) {
      delete record.deleted
      upd = await supabase.from('munkanaplo').update(record).eq('id', d.id).eq('congregation_id', congId)
    }
    if (upd.error) return { error: `Hiba: ${upd.error.message}` }
  } else {
    let ins = await supabase.from('munkanaplo').insert([record])
    if (ins.error && isMissingDeletedColumn(ins.error)) {
      delete record.deleted
      ins = await supabase.from('munkanaplo').insert([record])
    }
    if (ins.error) return { error: `Hiba: ${ins.error.message}` }
  }
  revalidatePath('/munkanaplo')
  return { success: true }
}

export async function deleteWorklog(id: number) {
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  // Soft-delete; ha a `deleted` oszlop még nem létezik, hard-delete fallback.
  let res = await supabase.from('munkanaplo').update({ deleted: true }).eq('id', id).eq('congregation_id', congId)
  if (res.error && isMissingDeletedColumn(res.error)) {
    res = await supabase.from('munkanaplo').delete().eq('id', id).eq('congregation_id', congId)
  }
  if (res.error) return { error: `Hiba: ${res.error.message}` }
  revalidatePath('/munkanaplo')
  return { success: true }
}
