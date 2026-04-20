'use server'

import { revalidatePath } from 'next/cache'
import { filingEntrySchema, type FilingEntryInput } from '@/lib/validations/filing'
import type { FilingEntry } from '@/lib/constants/filing'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'

async function getCongId() {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  return { supabase, congId: congregationId }
}

export async function getFilingEntries(year: number, direction: string): Promise<FilingEntry[]> {
  const { supabase, congId } = await getCongId()
  if (!congId) return []
  let query = supabase.from('iktato').select('*').eq('congregation_id', congId).eq('year', year).eq('deleted', false)
  if (direction === 'incoming' || direction === 'outgoing') query = query.eq('direction', direction)
  const { data } = await query.order('sequence_number', { ascending: false })
  return (data || []) as unknown as FilingEntry[]
}

export async function getNextSequenceNumber(year: number): Promise<number> {
  const { supabase, congId } = await getCongId()
  if (!congId) return 1
  const { data } = await supabase.from('iktato').select('sequence_number').eq('congregation_id', congId).eq('year', year).order('sequence_number', { ascending: false }).limit(1)
  return (data?.[0]?.sequence_number || 0) + 1
}

export async function saveFilingEntry(data: FilingEntryInput) {
  const parsed = filingEntrySchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const d = parsed.data
  const year = new Date(d.kelt).getFullYear()
  const record: Record<string, unknown> = {
    direction: d.direction, kelt: d.kelt, subject: d.subject,
    sender_or_recipient: d.sender_or_recipient || null, file_folder: d.file_folder,
    targykivonat: d.targykivonat || null, elintezes_ideje: d.elintezes_ideje || null,
    elintezes_modja: d.elintezes_modja || null, irattarijel: d.irattarijel || null,
    megjegyzes: d.megjegyzes || null, deleted: false, congregation_id: congId, year,
  }
  if (d.id) {
    const { error } = await supabase.from('iktato').update(record).eq('id', d.id).eq('congregation_id', congId)
    if (error) return { error: `Hiba: ${error.message}` }
  } else {
    record.sequence_number = await getNextSequenceNumber(year)
    const { error } = await supabase.from('iktato').insert([record])
    if (error) return { error: `Hiba: ${error.message}` }
  }
  revalidatePath('/iktato')
  return { success: true }
}

export async function deleteFilingEntry(id: string) {
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const { error } = await supabase.from('iktato').update({ deleted: true }).eq('id', id).eq('congregation_id', congId)
  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/iktato')
  return { success: true }
}

export async function getFilingStats(year: number) {
  const { supabase, congId } = await getCongId()
  if (!congId) return { total: 0, incoming: 0, outgoing: 0, pending: 0 }
  const { data } = await supabase.from('iktato').select('direction, elintezes_ideje').eq('congregation_id', congId).eq('year', year).eq('deleted', false)
  const entries = data || []
  return {
    total: entries.length,
    incoming: entries.filter((e: { direction: string }) => e.direction === 'incoming').length,
    outgoing: entries.filter((e: { direction: string }) => e.direction === 'outgoing').length,
    pending: entries.filter((e: { elintezes_ideje: string | null }) => !e.elintezes_ideje).length,
  }
}
