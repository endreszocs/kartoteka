'use server'

import { revalidatePath } from 'next/cache'
import { filingEntrySchema, type FilingEntryInput } from '@/lib/validations/filing'
import type { FilingEntry, IktatoYearlyClosure } from '@/lib/constants/filing'
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

/**
 * Preview-becslés a következő iktato-sorszámra. **NEM atomic** — két párhuzamos
 * hívás ugyanazt a számot adhatja. Csak UI-előnézethez használható, az
 * INSERT-nél a `next_iktato_sequence` SECURITY DEFINER RPC-t kell hívni
 * (lásd `saveFilingEntry`, DIAGNOSTICS P3-5).
 */
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

  // 2026-05-29 Fázis 3: lezárt évre tilos új bejegyzést felvenni vagy meglévőt módosítani.
  const { data: closure } = await supabase
    .from('iktato_yearly_closures')
    .select('closed_at')
    .eq('congregation_id', congId)
    .eq('year', year)
    .maybeSingle()
  if (closure) {
    return {
      error: `A ${year}-es iktatókönyv ${closure.closed_at?.slice(0, 10)} óta lezárt — nem lehet új bejegyzést felvenni vagy módosítani. Lezárás feloldása csak admin/master jogosultsággal lehetséges.`,
    }
  }

  const record: Record<string, unknown> = {
    direction: d.direction, kelt: d.kelt, subject: d.subject,
    sender_or_recipient: d.sender_or_recipient || null,
    file_folder: d.file_folder || null,
    targykivonat: d.targykivonat || null, elintezes_ideje: d.elintezes_ideje || null,
    elintezes_modja: d.elintezes_modja || null, irattarijel: d.irattarijel || null,
    megjegyzes: d.megjegyzes || null, deleted: false, congregation_id: congId, year,
    // 2026-05-28: EREK 2024-es ügykörjegyzék szerinti új mezők
    external_ref_szam: d.external_ref_szam || null,
    external_ref_kelt: d.external_ref_kelt || null,
    beerkezes_ideje: d.beerkezes_ideje || null,
    mellekletek_szama: d.mellekletek_szama ?? null,
    valasz_iktatoszam: d.valasz_iktatoszam || null,
    ugykor_kod: d.ugykor_kod || null,
    retention_type: d.retention_type || null,
    // 2026-05-29 Fázis 3: másodpéldány-flag
    has_duplicate: d.has_duplicate ?? false,
  }
  if (d.id) {
    const { error } = await supabase.from('iktato').update(record).eq('id', d.id).eq('congregation_id', congId)
    if (error) return { error: `Hiba: ${error.message}` }
  } else {
    // DIAGNOSTICS P3-5: atomic per-(cong, year) sorszám az RPC-ből.
    // A korábbi `getNextSequenceNumber(year)` SELECT MAX + INSERT két lépéses
    // mintát használt — két párhuzamos hívás ugyanazt a sorszámot kaphatta.
    // Az új RPC INSERT...ON CONFLICT DO UPDATE RETURNING-gel row-szintű
    // lock-kal sorosít. A migráció: 2026-05-17-iktato-sequence-pointer-rpc.sql
    const { data: nextSeq, error: rpcErr } = await supabase.rpc('next_iktato_sequence', {
      p_congregation_id: congId,
      p_year: year,
    })
    if (rpcErr || nextSeq === null || nextSeq === undefined) {
      return {
        error: `Sorszám lekérése sikertelen: ${rpcErr?.message ?? 'a next_iktato_sequence RPC nem adott vissza értéket'}`,
      }
    }
    record.sequence_number = nextSeq as number
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

// ─── 2026-05-29 Fázis 3: Évvégi iktatókönyv-lezárás ─────────────────────

/** Az aktuális gyülekezetre vonatkozó összes évzárás. */
export async function getYearlyClosures(): Promise<IktatoYearlyClosure[]> {
  const { supabase, congId } = await getCongId()
  if (!congId) return []
  const { data } = await supabase
    .from('iktato_yearly_closures')
    .select('*')
    .eq('congregation_id', congId)
    .order('year', { ascending: false })
  return (data || []) as IktatoYearlyClosure[]
}

/** Egy adott évre vonatkozó lezárás (ha létezik). */
export async function getYearClosure(year: number): Promise<IktatoYearlyClosure | null> {
  const { supabase, congId } = await getCongId()
  if (!congId) return null
  const { data } = await supabase
    .from('iktato_yearly_closures')
    .select('*')
    .eq('congregation_id', congId)
    .eq('year', year)
    .maybeSingle()
  return (data as IktatoYearlyClosure | null) ?? null
}

/**
 * Évvégi lezárás. A megadott évre vonatkozóan lezárja az iktatókönyvet —
 * onnantól se új bejegyzést, se módosítást nem fogad el a `saveFilingEntry`.
 * Csak a folyó év vagy korábbi év zárható le (jövőre vonatkozó lezárás tilos).
 */
export async function closeFilingYear(params: { year: number; closingNote?: string }) {
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const currentYear = new Date().getFullYear()
  if (params.year > currentYear) {
    return { error: `Jövőre vonatkozó évvégi lezárás nem engedélyezett (${params.year} > ${currentYear}).` }
  }
  const existing = await getYearClosure(params.year)
  if (existing) {
    return { error: `A ${params.year}-es év már lezárva (${existing.closed_at?.slice(0, 10)}).` }
  }
  // A lezárás pillanatában lévő bejegyzések száma — audit-célból tároljuk.
  const { data: countData } = await supabase
    .from('iktato')
    .select('id', { count: 'exact', head: true })
    .eq('congregation_id', congId)
    .eq('year', params.year)
    .eq('deleted', false)
  const totalEntries = (countData as unknown as { count?: number })?.count ?? null

  const { error } = await supabase.from('iktato_yearly_closures').insert([
    {
      congregation_id: congId,
      year: params.year,
      closing_note: params.closingNote || null,
      total_entries_at_close: totalEntries,
    },
  ])
  if (error) return { error: `Lezárás sikertelen: ${error.message}` }
  revalidatePath('/iktato')
  return { success: true, totalEntries }
}

/**
 * Évvégi lezárás feloldása. Csak god mode / admin használhatja (a UI gating
 * + RLS POLICY együtt biztosítja). Ha a frontend hív, az RLS dönti el.
 */
export async function reopenFilingYear(year: number) {
  const { supabase, congId } = await getCongId()
  if (!congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const { error } = await supabase
    .from('iktato_yearly_closures')
    .delete()
    .eq('congregation_id', congId)
    .eq('year', year)
  if (error) return { error: `Feloldás sikertelen: ${error.message}` }
  revalidatePath('/iktato')
  return { success: true }
}
