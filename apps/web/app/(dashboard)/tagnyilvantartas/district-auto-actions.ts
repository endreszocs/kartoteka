'use server'

/**
 * Automatikus körzetesítés — szerver-akciók (2026-07-24, PR-7 F4.2/F4.4).
 *
 * getAutoDistrictInput(): egy körben összegyűjti a tervező-motor bemenetét
 *   (aktív háztartások + utca/település + lélekszám + legidősebb felnőtt +
 *   presbiterek). Minden lekérdezés congregation-szűrt, chunkolt és hibát DOB
 *   (néma-üres hibaosztály ellen).
 *
 * applyDistrictPlan(): a wizard előnézetében jóváhagyott tervet írja be —
 *   csoport-batch-insert + körzetenként chunked família-UPDATE (csalad +
 *   haztartas dual-write) + presbiter-kiosztás + EGY összegző audit-event.
 *   A família-ID-k szerver-oldalon újra-származtatott engedélylistával
 *   metszve (a kliens nem írhat idegen gyülekezetet).
 */

import { revalidatePath } from 'next/cache'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { logAuditEvent } from '@/lib/audit/log'
import type { AutoDistrictFamily } from '@/lib/members/auto-district'

const CHUNK = 100

function* chunks<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size)
}

export interface AutoDistrictInput {
  families: AutoDistrictFamily[]
  presbyters: Array<{ id: number; nev: string; currentCsoportId: number | null }>
  unassignedFamilyCount: number
}

export async function getAutoDistrictInput(): Promise<AutoDistrictInput> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { families: [], presbyters: [], unassignedFamilyCount: 0 }

  // 1) Aktív háztartások (legacy családdal) + cím-hivatkozás
  const { data: households, error: hhError } = await supabase
    .from('haztartas')
    .select('id, legacy_csalad_id, id_csoport, cim:cim!id_cim(id_utca)')
    .eq('congregation_id', congregationId)
    .is('ervenyes_ig', null)
    .not('legacy_csalad_id', 'is', null)
    .limit(2000)
  if (hhError) throw new Error(`A háztartások lekérdezése sikertelen: ${hhError.message}`)

  type HouseholdRow = {
    id: string
    legacy_csalad_id: number
    id_csoport: number | null
    cim: { id_utca: number | null } | Array<{ id_utca: number | null }> | null
  }
  const householdRows = (households || []) as unknown as HouseholdRow[]
  const legacyIds = householdRows.map((h) => h.legacy_csalad_id)
  // 2026-07-24 (PR-10): NINCS korai return üres családlistánál — a család
  // nélküli személyek (egyedülállók) akkor is körzetesítendők.

  // 2) csalad-fallback utca + fejek (megjelenítési névhez)
  type CsaladRow = {
    id: number
    c_utcaid: number | null
    ferfi: { csaladnev: string | null; k_nev: string | null } | Array<{ csaladnev: string | null; k_nev: string | null }> | null
    no: { csaladnev: string | null; k_nev: string | null } | Array<{ csaladnev: string | null; k_nev: string | null }> | null
  }
  const csaladRows: CsaladRow[] = []
  for (const part of chunks(legacyIds, CHUNK)) {
    const { data, error } = await supabase
      .from('csalad')
      .select('id, c_utcaid, ferfi:szemely!id_ferfi(csaladnev, k_nev), no:szemely!id_no(csaladnev, k_nev)')
      .in('id', part)
    if (error) throw new Error(`A családok lekérdezése sikertelen: ${error.message}`)
    csaladRows.push(...((data || []) as unknown as CsaladRow[]))
  }
  const csaladById = new Map(csaladRows.map((c) => [c.id, c]))
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

  // 2/b) 2026-07-24 (PR-10): MINDEN élő, látható személy — a háztartáson kívüliek
  // (egyedülállók/özvegyek/elváltak) is körzetesítendők. Az id_csoport oszlop a
  // PR-10 migrációval jön — ha még nincs, oszlop nélkül olvasunk (ellenálló út).
  type PersonRow = {
    id: number
    csaladnev: string | null
    k_nev: string | null
    sz_datum: string | null
    c_utcaid: number | null
    id_csoport?: number | null
  }
  let personRows: PersonRow[] = []
  {
    const baseSelect = 'id, csaladnev, k_nev, sz_datum, c_utcaid'
    const { data, error } = await supabase
      .from('szemely')
      .select(`${baseSelect}, id_csoport`)
      .eq('congregation_id', congregationId)
      .eq('isvisible', true)
      .eq('meghalt', false)
      .limit(3000)
    if (error) {
      console.warn('[auto-district] szemely.id_csoport nem olvasható (lefutott a PR-10 migráció?) — oszlop nélkül olvasunk:', error.message)
      const retry = await supabase
        .from('szemely')
        .select(baseSelect)
        .eq('congregation_id', congregationId)
        .eq('isvisible', true)
        .eq('meghalt', false)
        .limit(3000)
      if (retry.error) throw new Error(`A személyek lekérdezése sikertelen: ${retry.error.message}`)
      personRows = (retry.data || []) as unknown as PersonRow[]
    } else {
      personRows = (data || []) as unknown as PersonRow[]
    }
  }

  // 3) Utcák (név + település)
  const utcaIds = new Set<number>()
  for (const h of householdRows) {
    const cim = one(h.cim)
    const csalad = csaladById.get(h.legacy_csalad_id)
    const utcaId = cim?.id_utca ?? csalad?.c_utcaid ?? null
    if (utcaId != null) utcaIds.add(utcaId)
  }
  // 2026-07-24 (PR-10): az egyedülállók utcái is kellenek a névsorhoz/tervhez
  for (const p of personRows) {
    if (p.c_utcaid != null) utcaIds.add(p.c_utcaid)
  }
  type StreetRow = {
    id: number
    name: string | null
    adrlocality: { name: string | null } | Array<{ name: string | null }> | null
  }
  const streetById = new Map<number, StreetRow>()
  for (const part of chunks([...utcaIds], CHUNK)) {
    const { data, error } = await supabase
      .from('adrstreet')
      .select('id, name, adrlocality!localityid(name)')
      .in('id', part)
    if (error) throw new Error(`Az utcák lekérdezése sikertelen: ${error.message}`)
    for (const s of (data || []) as unknown as StreetRow[]) streetById.set(s.id, s)
  }

  // 4) Háztartás-tagok — lélekszám + legidősebb felnőtt + KI van háztartásban
  type TagRow = {
    id_haztartas: string
    id_szemely: number
    szerep: string | null
    szemely: { sz_datum: string | null } | Array<{ sz_datum: string | null }> | null
  }
  const { data: tags, error: tagError } = await supabase
    .from('haztartas_tag')
    .select('id_haztartas, id_szemely, szerep, szemely:szemely!id_szemely(sz_datum)')
    .eq('congregation_id', congregationId)
    .is('ervenyes_ig', null)
    .limit(5000)
  if (tagError) throw new Error(`A háztartás-tagok lekérdezése sikertelen: ${tagError.message}`)
  const memberCountByHousehold = new Map<string, number>()
  const oldestAdultByHousehold = new Map<string, string>()
  // 2026-07-24 (PR-10): akinek VAN aktív háztartás-tagsága, az a családjával
  // körzetesül — az egyedülálló-lista a többiekből épül.
  const inHouseholdIds = new Set<number>()
  for (const t of (tags || []) as unknown as TagRow[]) {
    memberCountByHousehold.set(t.id_haztartas, (memberCountByHousehold.get(t.id_haztartas) || 0) + 1)
    inHouseholdIds.add(t.id_szemely)
    if (t.szerep === 'csaladfo' || t.szerep === 'hazastars') {
      const szDatum = one(t.szemely)?.sz_datum
      if (szDatum) {
        const current = oldestAdultByHousehold.get(t.id_haztartas)
        if (!current || szDatum < current) oldestAdultByHousehold.set(t.id_haztartas, szDatum)
      }
    }
  }

  // 5) Presbiterek (több presbiter is oszthat egy körzetet — D3a)
  const { data: presbyterRows, error: presError } = await supabase
    .from('presbiter')
    .select('id, id_csoport, szemely:szemely!inner(csaladnev, k_nev, congregation_id, meghalt)')
    .eq('szemely.congregation_id', congregationId)
    .eq('szemely.meghalt', false)
  if (presError) throw new Error(`A presbiterek lekérdezése sikertelen: ${presError.message}`)
  type PresRow = {
    id: number
    id_csoport: number | null
    szemely: { csaladnev: string | null; k_nev: string | null } | Array<{ csaladnev: string | null; k_nev: string | null }> | null
  }
  const presbyters = ((presbyterRows || []) as unknown as PresRow[]).map((p) => {
    const sz = one(p.szemely)
    return {
      id: p.id,
      nev: `${sz?.csaladnev || ''} ${sz?.k_nev || ''}`.trim() || `Presbiter #${p.id}`,
      currentCsoportId: p.id_csoport ?? null,
    }
  })

  // 6) Motor-bemenet összeállítása
  const seenLegacy = new Set<number>()
  const families: AutoDistrictFamily[] = []
  for (const h of householdRows) {
    if (seenLegacy.has(h.legacy_csalad_id)) continue
    seenLegacy.add(h.legacy_csalad_id)
    const csalad = csaladById.get(h.legacy_csalad_id)
    const cim = one(h.cim)
    const utcaId = cim?.id_utca ?? csalad?.c_utcaid ?? null
    const street = utcaId != null ? streetById.get(utcaId) : undefined
    const ferfi = one(csalad?.ferfi ?? null)
    const no = one(csalad?.no ?? null)
    const fej = ferfi ?? no
    families.push({
      id: h.legacy_csalad_id,
      utcaNev: street?.name ?? null,
      telepules: one(street?.adrlocality ?? null)?.name ?? null,
      memberCount: memberCountByHousehold.get(h.id) || 1,
      oldestBirthDate: oldestAdultByHousehold.get(h.id) ?? null,
      currentCsoportId: h.id_csoport ?? null,
      displayName: fej ? `${fej.csaladnev || ''} ${fej.k_nev || ''}`.trim() : `Család #${h.legacy_csalad_id}`,
    })
  }

  // 6/b) 2026-07-24 (PR-10): CSALÁD NÉLKÜLI személyek mint önálló egységek —
  // a teljes gyülekezet körzetesül, nem csak a családok.
  for (const p of personRows) {
    if (inHouseholdIds.has(p.id)) continue
    const street = p.c_utcaid != null ? streetById.get(p.c_utcaid) : undefined
    families.push({
      kind: 'szemely',
      id: p.id,
      utcaNev: street?.name ?? null,
      telepules: one(street?.adrlocality ?? null)?.name ?? null,
      memberCount: 1,
      oldestBirthDate: p.sz_datum ?? null,
      currentCsoportId: p.id_csoport ?? null,
      displayName: `${p.csaladnev || ''} ${p.k_nev || ''}`.trim() || `Személy #${p.id}`,
    })
  }

  return {
    families,
    presbyters,
    unassignedFamilyCount: families.filter((f) => f.currentCsoportId == null).length,
  }
}

export interface ApplyDistrictInput {
  districts: Array<{
    name: string
    familyIds: number[]
    /** 2026-07-24 (PR-10): család nélküli személyek (szemely.id) a körzetben */
    personIds: number[]
    /** D3a: egy körzethez TÖBB presbiter is rendelhető */
    presbyterIds: number[]
  }>
}

export async function applyDistrictPlan(
  input: ApplyDistrictInput,
): Promise<{ success?: boolean; error?: string; createdDistricts?: number; assignedFamilies?: number; assignedSingles?: number }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }
  const districts = (input.districts || []).filter(
    (d) => d.name.trim() && (d.familyIds.length > 0 || (d.personIds || []).length > 0),
  )
  if (districts.length === 0) return { error: 'Nincs alkalmazható körzet a tervben.' }

  // BIZTONSÁG: az engedélyezett família-ID-k szerver-oldali újra-származtatása —
  // a kliensről érkező ID-k ezzel metszve (idegen gyülekezet nem írható).
  const { data: allowedRows, error: allowedError } = await supabase
    .from('haztartas')
    .select('legacy_csalad_id')
    .eq('congregation_id', congregationId)
    .is('ervenyes_ig', null)
    .not('legacy_csalad_id', 'is', null)
    .limit(2000)
  if (allowedError) return { error: `Az engedély-lista lekérdezése sikertelen: ${allowedError.message}` }
  const allowedFamilyIds = new Set(
    ((allowedRows || []) as Array<{ legacy_csalad_id: number }>).map((r) => r.legacy_csalad_id),
  )

  // 1) Körzetek létrehozása (batch)
  const { data: created, error: createError } = await supabase
    .from('csoport')
    .insert(districts.map((d) => ({
      nev: d.name.trim().slice(0, 100),
      iskorzet: true,
      isaktiv: true,
      congregation_id: congregationId,
    })))
    .select('id, nev')
  if (createError) return { error: `A körzetek létrehozása sikertelen: ${createError.message}` }
  const createdRows = (created || []) as Array<{ id: number; nev: string }>
  if (createdRows.length !== districts.length) {
    return { error: 'A körzet-létrehozás hiányos eredményt adott — a kiosztás nem folytatódik.' }
  }

  // 2) Család- ÉS személy-hozzárendelés körzetenként (chunked) + presbiterek
  let assignedFamilies = 0
  let assignedSingles = 0
  for (let i = 0; i < districts.length; i += 1) {
    const district = districts[i]
    const csoportId = createdRows[i].id
    const familyIds = district.familyIds.filter((id) => allowedFamilyIds.has(id))
    for (const part of chunks(familyIds, CHUNK)) {
      const { error: hazError } = await supabase
        .from('haztartas')
        .update({ id_csoport: csoportId })
        .eq('congregation_id', congregationId)
        .is('ervenyes_ig', null)
        .in('legacy_csalad_id', part)
      if (hazError) return { error: `A(z) „${district.name}" háztartás-frissítése sikertelen: ${hazError.message}` }
      const { error: csaladError } = await supabase
        .from('csalad')
        .update({ id_csoport: csoportId })
        .in('id', part)
      if (csaladError) return { error: `A(z) „${district.name}" család-frissítése sikertelen: ${csaladError.message}` }
      assignedFamilies += part.length
    }
    // 2026-07-24 (PR-10): család nélküli személyek — szemely.id_csoport
    // (congregation-guard közvetlenül az update-en).
    for (const part of chunks(district.personIds || [], CHUNK)) {
      const { error: personError } = await supabase
        .from('szemely')
        .update({ id_csoport: csoportId })
        .eq('congregation_id', congregationId)
        .in('id', part)
      if (personError) return { error: `A(z) „${district.name}" személy-kiosztása sikertelen: ${personError.message} (Lefutott a 2026-07-24-es PR-10 migráció?)` }
      assignedSingles += part.length
    }
    if (district.presbyterIds.length > 0) {
      const { error: presError } = await supabase
        .from('presbiter')
        .update({ id_csoport: csoportId })
        .in('id', district.presbyterIds)
      if (presError) return { error: `A(z) „${district.name}" presbiter-kiosztása sikertelen: ${presError.message}` }
    }
  }

  await logAuditEvent({
    action: 'district.auto_plan_applied',
    targetTable: 'csoport',
    metadata: {
      districtCount: createdRows.length,
      assignedFamilies,
      assignedSingles,
      districtNames: createdRows.map((r) => r.nev),
    },
  }, supabase)

  revalidatePath('/tagnyilvantartas')
  return { success: true, createdDistricts: createdRows.length, assignedFamilies, assignedSingles }
}
