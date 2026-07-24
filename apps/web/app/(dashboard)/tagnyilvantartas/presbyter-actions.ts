'use server'

import { createClient } from '@/lib/supabase/server'
import { logAuditEvent } from '@/lib/audit/log'
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
  // 2026-06-01 (hibrid család-modell Fázis 2): az új haztartas-ot olvassuk —
  // a congregation_id direkt szűrhető, és a legacy_csalad_id visszafelé
  // kompat a régi csalad.id-vel.
  const { data: csaladData } = await supabase
    .from('haztartas')
    .select('legacy_csalad_id, id_csoport')
    .eq('congregation_id', congregationId)
    .is('ervenyes_ig', null)
    .not('legacy_csalad_id', 'is', null)
    .not('id_csoport', 'is', null)
  const korzetek = districts
  const csaladok = ((csaladData || []) as Array<{ legacy_csalad_id: number; id_csoport: number }>)
    .map((r) => ({ id: r.legacy_csalad_id, id_csoport: r.id_csoport }))

  // 2026-07-24 (PR-10): a körzethez KÖZVETLENÜL rendelt (család nélküli)
  // személyek száma — ellenálló az oszlop hiányára (PR-10 migráció előtt).
  const singleCountByCsoport = new Map<number, number>()
  {
    const { data: soloData, error: soloError } = await supabase
      .from('szemely')
      .select('id_csoport')
      .eq('congregation_id', congregationId)
      .eq('isvisible', true)
      .eq('meghalt', false)
      .not('id_csoport', 'is', null)
    if (soloError) {
      console.warn('[districts] szemely.id_csoport nem olvasható (PR-10 migráció?):', soloError.message)
    } else {
      for (const r of (soloData || []) as Array<{ id_csoport: number }>) {
        singleCountByCsoport.set(r.id_csoport, (singleCountByCsoport.get(r.id_csoport) || 0) + 1)
      }
    }
  }

  return korzetek.map(k => ({
    ...k,
    familyCount: csaladok.filter(c => c.id_csoport === k.id).length,
    singleCount: singleCountByCsoport.get(k.id) || 0,
  }))
}

export async function saveDistrict(data: DistrictInput) {
  const parsed = districtSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return { error: 'Nincs aktiv gyulekezet kivalasztva.' }

  // 2026-06-10 (Fázis 1): a csoport mostantól congregation_id-scoped — insertnél
  // kötelező, update-nél a legacy NULL-os sorokat fokozatosan begyógyítja.
  const payload = { nev: parsed.data.nev, isaktiv: parsed.data.isaktiv, iskorzet: true, congregation_id: congregationId }

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
  await logAuditEvent({
    action: 'district.save',
    targetTable: 'csoport',
    targetId: parsed.data.id ? String(parsed.data.id) : null,
    metadata: { mode: parsed.data.id ? 'update' : 'create' },
  }, supabase)
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

  // 2026-06-01 (hibrid család-modell Fázis 2): dual-write — a régi csalad és
  // az új haztartas táblákon is nullázzuk az id_csoport mezőt.
  await supabase.from('csalad').update({ id_csoport: null }).eq('id_csoport', id)
  await supabase.from('haztartas').update({ id_csoport: null }).eq('id_csoport', id).eq('congregation_id', congregationId)

  const [remainingFamilies, remainingPresbyters] = await Promise.all([
    supabase.from('haztartas').select('id', { count: 'exact', head: true })
      .eq('id_csoport', id).eq('congregation_id', congregationId).is('ervenyes_ig', null),
    supabase.from('presbiter').select('id', { count: 'exact', head: true }).eq('id_csoport', id),
  ])

  if ((remainingFamilies.count || 0) > 0 || (remainingPresbyters.count || 0) > 0) {
    return { error: 'A korzethez meg mas adatok kapcsolodnak, ezert a globalis rekord nem torolheto biztonsagosan.' }
  }

  const { error } = await supabase.from('csoport').delete().eq('id', id)
  if (error) return { error: `Hiba: ${error.message}` }
  await logAuditEvent({ action: 'district.delete', targetTable: 'csoport', targetId: String(id) }, supabase)
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

  // 2026-06-01 (hibrid család-modell Fázis 2): dual-write — régi csalad +
  // új haztartas (legacy_csalad_id alapján).
  const { error } = await supabase.from('csalad').update({ id_csoport: districtId }).eq('id', familyId)
  if (error) return { error: `Hiba: ${error.message}` }
  await supabase.from('haztartas').update({ id_csoport: districtId })
    .eq('legacy_csalad_id', familyId).eq('congregation_id', congregationId).is('ervenyes_ig', null)
  await logAuditEvent({ action: 'district.assign_family', targetTable: 'csalad', targetId: String(familyId), metadata: { districtId } }, supabase)
  return { success: true }
}

export async function removeFamilyFromDistrict(familyId: number) {
  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return { error: 'Nincs aktiv gyulekezet kivalasztva.' }
  const { error } = await supabase.from('csalad').update({ id_csoport: null }).eq('id', familyId)
  if (error) return { error: `Hiba: ${error.message}` }
  await supabase.from('haztartas').update({ id_csoport: null })
    .eq('legacy_csalad_id', familyId).eq('congregation_id', congregationId).is('ervenyes_ig', null)
  await logAuditEvent({ action: 'district.remove_family', targetTable: 'csalad', targetId: String(familyId) }, supabase)
  return { success: true }
}

export async function getDistrictFamilies(districtId: number) {
  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return { families: [], assignedIds: [] }

  const { visibleIds } = await getVisibleDistrictState(supabase, congregationId)
  if (!visibleIds.has(districtId)) return { families: [], assignedIds: [] }

  // 2026-06-01 (hibrid család-modell Fázis 2): az új haztartas + haztartas_tag
  // szerinti aktív családok. Backward-kompat: a `families[*].id` továbbra is
  // a régi `csalad.id` (legacy_csalad_id), hogy a UI változatlanul működjön.
  const { data: haztartasok } = await supabase
    .from('haztartas')
    .select(`
      legacy_csalad_id, id_csoport,
      cim:cim!id_cim(szam, utca:adrstreet!id_utca(name)),
      tagok:haztartas_tag(szerep, szemely:szemely!id_szemely(csaladnev, k_nev, ferfi))
    `)
    .eq('congregation_id', congregationId)
    .is('ervenyes_ig', null)
    .not('legacy_csalad_id', 'is', null)

  type FamilyOut = {
    id: number
    c_szam: string | null
    id_csoport: number | null
    ferfi: { csaladnev: string; k_nev: string } | null
    no: { csaladnev: string; k_nev: string } | null
    utca: { name: string } | null
  }
  const families: FamilyOut[] = []
  const assignedIds: number[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const h of (haztartasok || []) as any[]) {
    const legacyId = h.legacy_csalad_id as number
    let ferfi: FamilyOut['ferfi'] = null
    let no: FamilyOut['no'] = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (h.tagok || []) as any[]) {
      if (t.szerep !== 'csaladfo' && t.szerep !== 'hazastars') continue
      const szRaw = t.szemely
      const sz = Array.isArray(szRaw) ? szRaw[0] : szRaw
      if (!sz) continue
      if (sz.ferfi === true && !ferfi) ferfi = { csaladnev: sz.csaladnev, k_nev: sz.k_nev }
      else if (sz.ferfi === false && !no) no = { csaladnev: sz.csaladnev, k_nev: sz.k_nev }
    }
    const cimRaw = h.cim
    const cim = Array.isArray(cimRaw) ? cimRaw[0] : cimRaw
    const utcaRaw = cim?.utca
    const utca = Array.isArray(utcaRaw) ? utcaRaw[0] : utcaRaw
    families.push({
      id: legacyId,
      c_szam: cim?.szam ?? null,
      id_csoport: h.id_csoport ?? null,
      ferfi,
      no,
      utca: utca ?? null,
    })
    if (h.id_csoport === districtId) assignedIds.push(legacyId)
  }
  return { families, assignedIds }
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
    congregation_id: congregationId,
    tisztseg: parsed.data.tisztseg || 'Presbiter',
    id_csoport: parsed.data.id_csoport || null,
  })
  if (error) return { error: `Hiba: ${error.message}` }
  await logAuditEvent({ action: 'presbyter.save', targetTable: 'presbiter', targetId: String(parsed.data.id_szemely) }, supabase)
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
  await logAuditEvent({ action: 'presbyter.delete', targetTable: 'presbiter', targetId: String(szemelId) }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}
