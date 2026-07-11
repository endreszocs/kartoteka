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
  // 2026-07-11 (P1 hónap-vég): a korábbi `${period}-31` februárra/30-napos
  // hónapokra Postgres 'date/time field value out of range' hibát dobott →
  // üres lista. Helyette exkluzív felső határ: a következő időszak 1-je.
  let startDate: string
  let endExclusive: string
  if (isFullYear) {
    startDate = `${period}-01-01`
    endExclusive = `${Number(period) + 1}-01-01`
  } else {
    const [y, m] = period.split('-').map(Number)
    startDate = `${period}-01`
    endExclusive = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  }

  const base = () => supabase.from('munkanaplo').select('*')
    .eq('congregation_id', congId)
    .gte('idopont', startDate).lt('idopont', endExclusive)
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
    du: d.du ?? false,
    megjegyzes: d.megjegyzes || null,
    deleted: false,
    congregation_id: congId,
  }
  // 2026-07-11 (mediapath-védelem): a dialog sosem küld mediapath-ot — ha a
  // kulcs feltétel nélkül szerepelne, minden szerkesztés NULL-ra írná a
  // meglévő csatolmány-útvonalat. Csak akkor írjuk, ha ténylegesen érkezett.
  if (d.mediapath !== undefined) record.mediapath = d.mediapath || null
  if (d.id) {
    // 2026-06-12: szerkesztéskor az id_jellege-t NEM nulláznánk ki — abban él
    // az anyakönyvi forrás-marker (pl. `keresztseg:123`). A dialog nem küldi,
    // ezért csak akkor írjuk, ha ténylegesen jött érték.
    if (!d.id_jellege) delete record.id_jellege
    // 2026-07-11 (konkurencia): ha a kliens revision-t küld, csak az azonos
    // revision-ű sort frissítjük (a DB bump-triggere lépteti) — így a
    // desktop/web párhuzamos szerkesztés nem írja felül egymást némán.
    const runUpdate = () => {
      let q = supabase.from('munkanaplo').update(record).eq('id', d.id!).eq('congregation_id', congId)
      if (d.revision !== undefined) q = q.eq('revision', d.revision)
      return q.select('id')
    }
    let upd = await runUpdate()
    if (upd.error && isMissingDeletedColumn(upd.error)) {
      delete record.deleted
      upd = await runUpdate()
    }
    if (upd.error) return { error: `Hiba: ${upd.error.message}` }
    if (!upd.data || upd.data.length === 0) {
      return { error: 'A bejegyzést időközben máshol módosították. Frissítse a listát, és próbálja újra.' }
    }
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
