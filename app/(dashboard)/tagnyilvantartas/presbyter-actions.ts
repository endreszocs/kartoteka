'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { districtSchema, presbyterSchema, type DistrictInput, type PresbyterInput } from '@/lib/validations/members'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { getVisibleDistrictState, type DistrictRow } from '@/lib/members/district-visibility'

export type { DistrictRow } from '@/lib/members/district-visibility'

// ── Körzetek ─────────────────────────────────────────────────

export interface PresbiterRow {
  id: number
  tisztseg: string | null
  id_csoport: number | null
  szemely: { id: number; csaladnev: string; k_nev: string; ferfi: boolean; sz_datum: string | null; telefon: string | null } | null
  csoport: { id: number; nev: string } | null
}

async function getScopedContext() {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  return { supabase, congregationId }
}

async function memberBelongsToCongregation(
  szemelyId: number,
  congregationId: string | null,
) {
  if (!congregationId) return false

  const supabase = await createClient()
  const { data } = await supabase
    .from('szemely')
    .select('id')
    .eq('id', szemelyId)
    .eq('congregation_id', congregationId)
    .maybeSingle()

  return !!data
}

export async function getDistricts(): Promise<DistrictRow[]> {
  const { supabase, congregationId } = await getScopedContext()
  const { districts } = await getVisibleDistrictState(supabase, congregationId)
  return districts
}

export async function getDistrictsWithCounts() {
  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return []
  const { districts } = await getVisibleDistrictState(supabase, congregationId)
  const { data: csaladData } = await supabase
    .from('csalad')
    .select('id, id_csoport')
    .eq('congregation_id', congregationId)
    .not('id_csoport', 'is', null)
  const korzetek = districts
  const csaladok = (csaladData || []) as { id: number; id_csoport: number }[]
  return korzetek.map(k => ({
    ...k,
    familyCount: csaladok.filter(c => c.id_csoport === k.id).length,
  }))
}

export async function saveDistrict(data: DistrictInput) {
  const parsed = districtSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return { error: 'Nincs aktiv gyulekezet kivalasztva.' }

  const payload = { nev: parsed.data.nev, isaktiv: parsed.data.isaktiv, iskorzet: true }

  if (parsed.data.id) {
    const { visibleIds, usage } = await getVisibleDistrictState(supabase, congregationId)
    if (!visibleIds.has(parsed.data.id)) {
      return { error: 'A kivalasztott korzet nem erheto el az aktiv gyulekezetben.' }
    }
    if (usage.foreignIds.has(parsed.data.id)) {
      return { error: 'Ez a korzet mas gyulekezet adataihoz is kapcsolodik, ezert itt nem szerkesztheto biztonsagosan.' }
    }

    const { error } = await supabase.from('csoport').update(payload).eq('id', parsed.data.id)
    if (error) return { error: `Hiba: ${error.message}` }
  } else {
    const { error } = await supabase.from('csoport').insert(payload)
    if (error) return { error: `Hiba: ${error.message}` }
  }
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

export async function deleteDistrict(id: number) {
  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return { error: 'Nincs aktiv gyulekezet kivalasztva.' }

  const { visibleIds, usage } = await getVisibleDistrictState(supabase, congregationId)
  if (!visibleIds.has(id)) {
    return { error: 'A kivalasztott korzet nem erheto el az aktiv gyulekezetben.' }
  }
  if (usage.foreignIds.has(id)) {
    return { error: 'Ez a korzet mas gyulekezet adataihoz is kapcsolodik, ezert nem torolheto biztonsagosan.' }
  }

  const { data: presbyterRows } = await supabase
    .from('presbiter')
    .select('id, szemely:szemely!inner(congregation_id)')
    .eq('id_csoport', id)
    .eq('szemely.congregation_id', congregationId)

  const presbyterIds = ((presbyterRows || []) as { id: number }[]).map(row => row.id)
  if (presbyterIds.length > 0) {
    await supabase.from('presbiter').delete().in('id', presbyterIds)
  }

  await supabase.from('csalad').update({ id_csoport: null }).eq('id_csoport', id).eq('congregation_id', congregationId)

  const [remainingFamilies, remainingPresbyters] = await Promise.all([
    supabase.from('csalad').select('id', { count: 'exact', head: true }).eq('id_csoport', id),
    supabase.from('presbiter').select('id', { count: 'exact', head: true }).eq('id_csoport', id),
  ])

  if ((remainingFamilies.count || 0) > 0 || (remainingPresbyters.count || 0) > 0) {
    return { error: 'A korzethez meg mas adatok kapcsolodnak, ezert a globalis rekord nem torolheto biztonsagosan.' }
  }

  const { error } = await supabase.from('csoport').delete().eq('id', id)
  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

// ── Család–körzet hozzárendelés ──────────────────────────────

export async function assignFamilyToDistrict(familyId: number, districtId: number) {
  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return { error: 'Nincs aktiv gyulekezet kivalasztva.' }

  const { visibleIds, usage } = await getVisibleDistrictState(supabase, congregationId)
  if (!visibleIds.has(districtId)) {
    return { error: 'A kivalasztott korzet nem erheto el az aktiv gyulekezetben.' }
  }
  if (usage.foreignIds.has(districtId)) {
    return { error: 'Ez a korzet mas gyulekezethez kapcsolodik, ezert ide nem rendelheto csalad.' }
  }

  const { error } = await supabase.from('csalad').update({ id_csoport: districtId }).eq('id', familyId).eq('congregation_id', congregationId)
  if (error) return { error: `Hiba: ${error.message}` }
  return { success: true }
}

export async function removeFamilyFromDistrict(familyId: number) {
  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return { error: 'Nincs aktiv gyulekezet kivalasztva.' }
  const { error } = await supabase.from('csalad').update({ id_csoport: null }).eq('id', familyId).eq('congregation_id', congregationId)
  if (error) return { error: `Hiba: ${error.message}` }
  return { success: true }
}

export async function getDistrictFamilies(districtId: number) {
  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return { families: [], assignedIds: [] }

  const { visibleIds } = await getVisibleDistrictState(supabase, congregationId)
  if (!visibleIds.has(districtId)) return { families: [], assignedIds: [] }

  const [allFamRes, assignedRes] = await Promise.all([
    supabase.from('csalad').select('id, c_szam, id_csoport, ferfi:szemely!id_ferfi(csaladnev, k_nev), no:szemely!id_no(csaladnev, k_nev), utca:adrstreet!c_utcaid(name)').eq('congregation_id', congregationId),
    supabase.from('csalad').select('id').eq('congregation_id', congregationId).eq('id_csoport', districtId),
  ])
  const assignedIds = new Set((assignedRes.data || []).map((f: { id: number }) => f.id))
  return {
    families: (allFamRes.data || []) as unknown as { id: number; c_szam: string | null; id_csoport: number | null; ferfi: { csaladnev: string; k_nev: string } | null; no: { csaladnev: string; k_nev: string } | null; utca: { name: string } | null }[],
    assignedIds: [...assignedIds],
  }
}

// ── Presbiterek ──────────────────────────────────────────────

export async function getPresbyters(): Promise<PresbiterRow[]> {
  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return []
  const { data } = await supabase.from('presbiter')
    .select('id, tisztseg, id_csoport, szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum, telefon), csoport:csoport!id_csoport(id, nev)')
    .eq('szemely.congregation_id', congregationId)
  return (data || []) as unknown as PresbiterRow[]
}

export async function savePresbyter(data: PresbyterInput) {
  const parsed = presbyterSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase: scopedSupabase, congregationId } = await getScopedContext()
  if (!congregationId) return { error: 'Nincs aktiv gyulekezet kivalasztva.' }

  const memberExists = await memberBelongsToCongregation(parsed.data.id_szemely, congregationId)
  if (!memberExists) return { error: 'A kivalasztott szemely nem az aktiv gyulekezethez tartozik.' }

  const { data: existingPresbyterRows } = await scopedSupabase
    .from('presbiter')
    .select('id_csoport')
    .eq('id_szemely', parsed.data.id_szemely)

  const existingDistrictIds = new Set(
    ((existingPresbyterRows || []) as { id_csoport: number | null }[])
      .map(row => row.id_csoport)
      .filter((value): value is number => value !== null)
  )

  if (parsed.data.id_csoport) {
    const { visibleIds, usage } = await getVisibleDistrictState(scopedSupabase, congregationId)
    if (!visibleIds.has(parsed.data.id_csoport)) {
      return { error: 'A kivalasztott korzet nem erheto el az aktiv gyulekezetben.' }
    }
    if (usage.foreignIds.has(parsed.data.id_csoport) && !existingDistrictIds.has(parsed.data.id_csoport)) {
      return { error: 'Ez a korzet mas gyulekezethez kapcsolodik, ezert nem rendelheto presbiterhez.' }
    }
  }

  const supabase = await createClient()
  // Korábbi bejegyzések törlése ennél a személynél
  await supabase.from('presbiter').delete().eq('id_szemely', parsed.data.id_szemely)

  const { error } = await supabase.from('presbiter').insert({
    id_szemely: parsed.data.id_szemely,
    tisztseg: parsed.data.tisztseg || 'Presbiter',
    id_csoport: parsed.data.id_csoport || null,
  })
  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

export async function deletePresbyter(szemelId: number) {
  const { congregationId } = await getScopedContext()
  if (!congregationId) return { error: 'Nincs aktiv gyulekezet kivalasztva.' }

  const memberExists = await memberBelongsToCongregation(szemelId, congregationId)
  if (!memberExists) return { error: 'A kivalasztott szemely nem az aktiv gyulekezethez tartozik.' }

  const supabase = await createClient()
  const { error } = await supabase.from('presbiter').delete().eq('id_szemely', szemelId)
  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}
