'use server'

import { revalidatePath } from 'next/cache'
import { worklogSchema, type WorklogInput } from '@/lib/validations/worklog'
import type { WorklogEntry } from '@/lib/constants/worklog'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'

async function getCongId() {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  return { supabase, congId: congregationId }
}

export async function getWorklogs(month: string): Promise<WorklogEntry[]> {
  const { supabase, congId } = await getCongId()
  if (!congId) return []
  const startDate = `${month}-01`
  const endDate = `${month}-31`
  const { data } = await supabase.from('munkanaplo').select('*')
    .eq('congregation_id', congId).eq('deleted', false)
    .gte('idopont', startDate).lte('idopont', endDate)
    .order('idopont', { ascending: false })
  return (data || []) as unknown as WorklogEntry[]
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
    const { error } = await supabase.from('munkanaplo').update(record).eq('id', d.id).eq('congregation_id', congId)
    if (error) return { error: `Hiba: ${error.message}` }
  } else {
    const { error } = await supabase.from('munkanaplo').insert([record])
    if (error) return { error: `Hiba: ${error.message}` }
  }
  revalidatePath('/munkanaplo')
  return { success: true }
}

export async function deleteWorklog(id: number) {
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const { error } = await supabase.from('munkanaplo').update({ deleted: true }).eq('id', id).eq('congregation_id', congId)
  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/munkanaplo')
  return { success: true }
}

// Publikus API az anyakönyv modulnak
export async function triggerWorklogFromRegistry(sourceTable: string, date: string, jellege: string, cim: string) {
  const { supabase, congId } = await getCongId()
  if (!congId) return null
  const { data, error } = await supabase.from('munkanaplo').insert([{
    idopont: date, jellege, cim, deleted: false, congregation_id: congId,
  }]).select('id')
  if (error || !data?.[0]) return null
  return data[0].id
}
