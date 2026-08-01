'use server'

import { revalidatePath } from 'next/cache'
import { familySchema, type FamilyInput } from '@/lib/validations/members'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { fetchFamilyPaymentsCompat, fetchPaymentsByMemberIdsCompat } from '@/lib/finance/payment-compat'
import { getVisibleDistrictState, sanitizeDistrictReference } from '@/lib/members/district-visibility'
import { applyStreetLocalityFallback } from '@/lib/members/street-locality-fallback'
import { logAuditEvent } from '@/lib/audit/log'
import { syncRegistryWorklogLink } from '@/lib/worklog/registry-sync'
import {
  findMembershipConflicts,
  foreignMembershipWarning,
  getAllowedFamilyIds,
  loadFamilyDisplayNames,
  loadFamilyMemberships,
  moveChildMemberships,
  syncHouseholdFromCsalad,
  type AssignConflict,
  type FamilyMembershipInfo,
} from '@/lib/family/family-membership'

export interface FamilyRow {
  id: number
  c_utcaid: number | null
  c_szam: string | null
  isaktiv: boolean
  id_csoport: number | null
  ferfi: { id: number; csaladnev: string; k_nev: string; ferfi: boolean; sz_datum: string | null; allapot: string | null; meghalt: boolean; namepattern: string | null; vallas: string | null; kep?: string | null } | null
  no: { id: number; csaladnev: string; k_nev: string; ferfi: boolean; sz_datum: string | null; allapot: string | null; meghalt: boolean; namepattern: string | null; vallas: string | null; kep?: string | null } | null
  utca: { name: string } | null
  /** 2026-06-11 (modern kártyanézet): a háztartás gyermekei avatarhoz/létszámhoz. */
  gyerekek?: Array<{ id: number; csaladnev: string | null; k_nev: string | null; sz_datum: string | null; meghalt: boolean | null; kep?: string | null }>
}

export interface MemberFamilySummaryPerson {
  id: number
  csaladnev: string | null
  k_nev: string | null
  sz_datum: string | null
}

export interface MemberFamilySummary {
  id: number
  displayName: string
  memberCount: number
  /** 2026-07-24 (PR-4 F5.5): a szerep is jön — a karton címkéi eddig tippeltek. */
  adults: Array<MemberFamilySummaryPerson & { role: 'csaladfo' | 'hazastars' }>
  children: Array<MemberFamilySummaryPerson & { role: 'gyermek' | 'unoka' }>
  childrenCount: number
}

async function getFamilyAccessContext() {
  const { supabase, congregationId, userId } = await getEffectiveCongregationContext()
  return { supabase, congregationId, userId }
}

// ── Család-tagsági őr + háztartás-szinkron (2026-08-01, PR-18) ──────────────
//
// Egy személy a rendszer szándéka szerint EGYSZERRE csak EGY aktív család
// tagja lehet (felnőttként vagy gyermekként). A közös helperek (háztartás-
// szinkron, tagsági lekérdezés, dupla-tagsági őr, áthelyezés) a
// lib/family/family-membership.ts-ben élnek — innen és az anyakönyvi/tag-
// mentési utakról is ugyanazok futnak.

/** Egy tag aktív családtagságai — a személyi karton hozzárendelő dialógusához. */
export async function getMemberFamilyMemberships(personId: number): Promise<FamilyMembershipInfo[]> {
  if (!Number.isInteger(personId) || personId <= 0) return []
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return []
  const { data: owned } = await supabase
    .from('szemely')
    .select('id')
    .eq('id', personId)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (!owned) return []
  const map = await loadFamilyMemberships(supabase, [personId])
  return map.get(personId) ?? []
}

export interface AssignableFamily {
  id: number
  displayName: string
  address: string | null
  hasFerfi: boolean
  hasNo: boolean
  childrenCount: number
}

/**
 * Család-kereső a személyi karton „Családhoz rendelés" dialógusához: a felnőtt
 * tagok neve alapján keres az aktuális gyülekezet AKTÍV családjai között.
 */
export async function searchAssignableFamilies(query: string): Promise<AssignableFamily[]> {
  // A PostgREST .or() szűrő a vesszőt/zárójelet szintaxisként értelmezné —
  // az ilyen karaktereket szóközre cseréljük (különben néma „Nincs találat").
  const q = query.trim().replace(/[,()"\\]/g, ' ').replace(/\s+/g, ' ').trim()
  if (q.length < 2) return []
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return []

  const { data: persons } = await supabase
    .from('szemely')
    .select('id')
    .eq('congregation_id', congregationId)
    .or(`csaladnev.ilike.%${q}%,k_nev.ilike.%${q}%`)
    .limit(40)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const personIds = ((persons || []) as any[]).map((p) => p.id as number)
  if (personIds.length === 0) return []

  const { data: familiesRaw } = await supabase
    .from('csalad')
    .select('id, id_ferfi, id_no, c_szam, utca:adrstreet!c_utcaid(name)')
    .eq('isaktiv', true)
    .or(`id_ferfi.in.(${personIds.join(',')}),id_no.in.(${personIds.join(',')})`)
    .limit(12)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const families = (familiesRaw || []) as any[]
  if (families.length === 0) return []

  // Csak a saját gyülekezet családjai (a csalad táblán nincs congregation_id)
  const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
  const scoped = families.filter((f) => allowedFamilyIds.has(f.id as number))
  if (scoped.length === 0) return []

  const familyIds = scoped.map((f) => f.id as number)
  const [names, gyerekRes] = await Promise.all([
    loadFamilyDisplayNames(supabase, familyIds),
    supabase.from('gyerek').select('id_csalad').in('id_csalad', familyIds),
  ])
  const childCount = new Map<number, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const g of (gyerekRes.data || []) as any[]) {
    childCount.set(g.id_csalad, (childCount.get(g.id_csalad) ?? 0) + 1)
  }

  return scoped.map((f) => {
    const utca = Array.isArray(f.utca) ? f.utca[0] : f.utca
    return {
      id: f.id as number,
      displayName: names.get(f.id) ?? `Család #${f.id}`,
      address: [utca?.name, f.c_szam].filter(Boolean).join(' ') || null,
      hasFerfi: f.id_ferfi != null,
      hasNo: f.id_no != null,
      childrenCount: childCount.get(f.id) ?? 0,
    }
  })
}

export interface AssignMemberInput {
  memberId: number
  familyId: number
  mode: 'felnott' | 'gyermek'
  /** true = a tag korábbi (gyermek-) tagságát áthelyezzük az új családba */
  confirmMove?: boolean
}

export interface AssignMemberResult {
  success?: boolean
  familyId?: number
  error?: string
  /** Figyelmeztetés: a tag már máshol tag — megerősítés (confirmMove) kell */
  conflicts?: AssignConflict[]
  warning?: string
}

/**
 * 2026-08-01 (PR-18): tag hozzárendelése meglévő családhoz a SZEMÉLYI KARTONRÓL.
 * A kanonikus írási úton megy (tagnyilvantartas_csalad_mentes RPC + háztartás-
 * szinkron), dupla-tagsági őrrel: felnőttként máshol szereplő tagot nem enged,
 * gyermekként máshol szereplőt csak explicit áthelyezéssel.
 */
export async function assignMemberToFamily(input: AssignMemberInput): Promise<AssignMemberResult> {
  const { memberId, familyId, mode } = input
  if (!Number.isInteger(memberId) || memberId <= 0 || !Number.isInteger(familyId) || familyId <= 0) {
    return { error: 'Érvénytelen azonosító.' }
  }
  const { supabase, congregationId, userId } = await getFamilyAccessContext()
  if (!congregationId || !userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { data: person } = await supabase
    .from('szemely')
    .select('id, csaladnev, k_nev, ferfi')
    .eq('id', memberId)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (!person) return { error: 'A tag nem található az aktív gyülekezetben.' }
  const personName = `${person.csaladnev ?? ''} ${person.k_nev ?? ''}`.trim() || `#${memberId}`

  const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
  if (!allowedFamilyIds.has(familyId)) return { error: 'Nincs jogosultsága ehhez a családhoz.' }

  const { data: familyRow } = await supabase
    .from('csalad')
    .select('id, id_ferfi, id_no, c_utcaid, c_szam, id_csoport')
    .eq('id', familyId)
    .maybeSingle()
  if (!familyRow) return { error: 'A család nem található.' }

  // Már tagja ennek a családnak?
  const ownMemberships = (await loadFamilyMemberships(supabase, [memberId])).get(memberId) ?? []
  if (ownMemberships.some((m) => m.familyId === familyId)) {
    return { error: `${personName} már tagja ennek a családnak.` }
  }

  // Dupla-tagsági őr (gyülekezet-hatókörrel: az idegen gyülekezetben maradt
  // tagság — pl. átjelentkezés maradványa — nem blokkol és nem mutálódik)
  const { blocked, movable, foreign, allowed } = await findMembershipConflicts(supabase, congregationId, [memberId], familyId)
  if (blocked.length > 0) {
    const b = blocked[0]
    return {
      error: `${personName} már a(z) ${b.familyName} felnőtt tagja (családfő vagy házastárs). Egy személy egyszerre csak egy család tagja lehet — előbb a másik család kartonján módosítsd a felnőtt tagokat.`,
    }
  }
  if (movable.length > 0 && !input.confirmMove) {
    const m = movable[0]
    return {
      conflicts: movable,
      warning: `${personName} jelenleg a(z) ${m.familyName} tagja (gyermekként). Egy személy egyszerre csak egy család tagja lehet. Áthelyezed az új családba? A korábbi tagsága lezárul.`,
    }
  }

  // Cél-szerep ellenőrzés
  let nextFerfi = familyRow.id_ferfi as number | null
  let nextNo = familyRow.id_no as number | null
  const { data: gyerekRows } = await supabase
    .from('gyerek')
    .select('id_szemely')
    .eq('id_csalad', familyId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalGyerekIds = [...new Set(((gyerekRows || []) as any[]).map((g) => g.id_szemely as number))]
  let nextGyerekIds = originalGyerekIds

  if (mode === 'felnott') {
    if (person.ferfi === true) {
      if (nextFerfi != null) return { error: 'Ebben a családban már van rögzített férj/családfő. Előbb a családi kartonon módosítsd a felnőtt tagokat.' }
      nextFerfi = memberId
    } else if (person.ferfi === false) {
      if (nextNo != null) return { error: 'Ebben a családban már van rögzített feleség/házastárs. Előbb a családi kartonon módosítsd a felnőtt tagokat.' }
      nextNo = memberId
    } else {
      return { error: 'A tag neme nincs rögzítve — felnőttként így nem rendelhető családhoz. Előbb add meg a nemét a tag szerkesztőjében.' }
    }
    nextGyerekIds = nextGyerekIds.filter((id) => id !== memberId)
  } else {
    if (nextFerfi === memberId || nextNo === memberId) {
      return { error: `${personName} ennek a családnak már felnőtt tagja — gyermekként nem vehető fel ugyanoda.` }
    }
    nextGyerekIds = [...new Set([...nextGyerekIds, memberId])]
  }

  // 2026-08-01 (PR-18 review): ELŐBB a cél-család mentése, és csak SIKER után
  // a korábbi gyermek-tagságok lezárása. Fordított sorrendnél egy elbukó RPC
  // családtalanul hagyta volna a tagot (a régi tagság már törölve, az új nem
  // jött létre); az átmeneti dupla tagság ezzel szemben látható és a következő
  // mentésnél újra felajánlott áthelyezéssel javítható.
  const { data: rpcData, error: rpcErr } = await supabase.rpc('tagnyilvantartas_csalad_mentes', {
    p_id: familyId,
    p_id_ferfi: nextFerfi,
    p_id_no: nextNo,
    p_gyerek_ids: nextGyerekIds,
    p_c_utcaid: familyRow.c_utcaid ?? null,
    p_c_szam: familyRow.c_szam ?? null,
    p_id_csoport: familyRow.id_csoport ?? null,
  })
  if (rpcErr) return { error: `Hiba: ${rpcErr.message}` }
  const rpcRes = rpcData as { status?: string; family_id?: number; message?: string } | null
  if (rpcRes?.status !== 'ok') {
    return { error: rpcRes?.message || 'A hozzárendelés mentése nem sikerült.' }
  }

  const warnings: string[] = []

  // Áthelyezés: a korábbi gyermek-tagságok lezárása (csak saját gyülekezet)
  if (movable.length > 0 && input.confirmMove) {
    try {
      await moveChildMemberships(supabase, congregationId, movable, allowed)
    } catch (e) {
      console.warn('[assignMemberToFamily] moveChildMemberships sikertelen:',
        e instanceof Error ? e.message : e)
      warnings.push('A hozzárendelés mentve, de a korábbi családtagság lezárása nem sikerült — nyisd meg a régi család kartonját, és távolítsd el onnan a tagot.')
    }
  }

  try {
    // A felnőtté váló tag korábbi gyerek-sorát a sync explicit eltávolításként
    // kezeli (unoka-védelem miatt kell a lista)
    const removedIds = mode === 'felnott' && originalGyerekIds.includes(memberId) ? [memberId] : []
    await syncHouseholdFromCsalad(supabase, familyId, congregationId, removedIds)
  } catch (e) {
    console.warn('[assignMemberToFamily] syncHouseholdFromCsalad sikertelen:',
      e instanceof Error ? e.message : e)
    warnings.push('A hozzárendelés mentve, de a háztartás-nézet szinkronizálása nem sikerült — mentsd el újra a családot, vagy jelezd a rendszergazdának.')
  }

  const foreignNote = foreignMembershipWarning(foreign)
  if (foreignNote) warnings.push(foreignNote)

  await logAuditEvent({
    action: 'family.assign_member',
    targetTable: 'csalad',
    targetId: String(familyId),
    metadata: { memberId, mode, moved: movable.length > 0 && !!input.confirmMove },
  }, supabase)

  revalidatePath('/tagnyilvantartas')
  return { success: true, familyId, warning: warnings.length > 0 ? warnings.join(' ') : undefined }
}

export async function getFamilies(): Promise<FamilyRow[]> {
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return []

  // 2026-06-01 (hibrid család-modell Fázis 2): a Családok lista most az ÚJ
  // modellből (haztartas + haztartas_tag + cim) olvas. A `FamilyRow.id` mező
  // továbbra is a `legacy_csalad_id` (int) marad — így a többi action
  // (saveFamily, getFamilyDetails, deleteFamily) érintetlenül futnak a régi
  // `csalad.id`-vel, amíg a Fázis 2 fokozatosan átáll.
  //
  // 2026-06-02: Diagnózis után kiderült, hogy az új `haztartas → cim` lánc
  // valahol szakad (vagy a backfill subquery nem találta a megfelelő cim-rekordot,
  // vagy a cim-rekordok üres `id_utca`/`szam` mezőkkel jöttek létre).
  // Megoldás: az új haztartas-ból olvassuk a struktúrát (legacy_csalad_id alapján),
  // DE a CÍMET a régi `csalad.c_utcaid + c_szam` mezőkből szedjük FALLBACK-kel.
  // Az új `cim` táblát PRIORITÁSSAL próbáljuk; ha üres, visszanyúlunk a régire.
  const { data: haztartasok } = await supabase
    .from('haztartas')
    .select('id, isaktiv, id_csoport, legacy_csalad_id, id_cim')
    .eq('congregation_id', congregationId)
    .is('ervenyes_ig', null)
    .not('legacy_csalad_id', 'is', null)

  if (!haztartasok?.length) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const haztartasIds = haztartasok.map((h: any) => h.id as string)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cimIds = haztartasok.map((h: any) => h.id_cim as string | null).filter((v): v is string => !!v)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacyCsaladIds = haztartasok.map((h: any) => h.legacy_csalad_id as number | null).filter((v): v is number => v != null)

  // ─── ÚJ MODELL: cim + adrstreet az haztartas.id_cim-en keresztül ────────
  const { data: cimekRaw } = cimIds.length > 0
    ? await supabase
        .from('cim')
        .select('id, szam, id_utca')
        .in('id', cimIds)
    : { data: [] }

  // ─── RÉGI MODELL FALLBACK: csalad.c_utcaid + c_szam ─────────────────────
  const { data: csaladokRaw } = legacyCsaladIds.length > 0
    ? await supabase
        .from('csalad')
        .select('id, c_utcaid, c_szam')
        .in('id', legacyCsaladIds)
    : { data: [] }

  // Mindkét forrás utca-ID-it egyesítjük az adrstreet lekérdezéshez
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const utcaIdsUj = ((cimekRaw || []) as any[]).map((c) => c.id_utca as number | null).filter((v): v is number => v != null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const utcaIdsRegi = ((csaladokRaw || []) as any[]).map((c) => c.c_utcaid as number | null).filter((v): v is number => v != null)
  const utcaIdsUnique = Array.from(new Set([...utcaIdsUj, ...utcaIdsRegi]))

  const { data: utcakRaw } = utcaIdsUnique.length > 0
    ? await supabase
        .from('adrstreet')
        .select('id, name')
        .in('id', utcaIdsUnique)
    : { data: [] }

  // Mappingok
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const utcaNameById = new Map<number, string>(((utcakRaw || []) as any[]).map((u) => [u.id, u.name]))

  // cim_id (uuid) → { szam, utca_name } — új modell
  const cimById = new Map<string, { szam: string | null; utca_id: number | null; utca_name: string | null }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (cimekRaw || []) as any[]) {
    cimById.set(c.id, {
      szam: c.szam ?? null,
      utca_id: c.id_utca ?? null,
      utca_name: c.id_utca != null ? utcaNameById.get(c.id_utca) ?? null : null,
    })
  }

  // csalad_id (int) → { szam, utca_name } — régi modell (FALLBACK forrás)
  const csaladCimById = new Map<number, { szam: string | null; utca_id: number | null; utca_name: string | null }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (csaladokRaw || []) as any[]) {
    csaladCimById.set(c.id, {
      szam: c.c_szam ?? null,
      utca_id: c.c_utcaid ?? null,
      utca_name: c.c_utcaid != null ? utcaNameById.get(c.c_utcaid) ?? null : null,
    })
  }

  // Aktív családfők + házastársak ezekhez a háztartásokhoz
  const { data: tagok } = await supabase
    .from('haztartas_tag')
    .select(`
      id_haztartas, szerep, is_primary,
      szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum, allapot, meghalt, namepattern, vallas, kep)
    `)
    .in('id_haztartas', haztartasIds)
    .is('ervenyes_ig', null)
    .in('szerep', ['csaladfo', 'hazastars', 'gyermek', 'unoka'])

  // Map: haztartas_id → { ferfi, no, gyerekek }
  type SzemelyRef = FamilyRow['ferfi']
  type GyerekRef = NonNullable<FamilyRow['gyerekek']>[number]
  const tagokByHaztartas = new Map<string, { ferfi: SzemelyRef; no: SzemelyRef; gyerekek: GyerekRef[] }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const tag of (tagok || []) as any[]) {
    const szemelyRaw = tag.szemely
    const sz = (Array.isArray(szemelyRaw) ? szemelyRaw[0] : szemelyRaw) as (SzemelyRef & GyerekRef) | null
    if (!sz) continue
    const entry = tagokByHaztartas.get(tag.id_haztartas) ?? { ferfi: null, no: null, gyerekek: [] }
    if (tag.szerep === 'gyermek' || tag.szerep === 'unoka') {
      entry.gyerekek.push({
        id: sz.id,
        csaladnev: sz.csaladnev ?? null,
        k_nev: sz.k_nev ?? null,
        sz_datum: sz.sz_datum ?? null,
        meghalt: sz.meghalt ?? null,
        kep: sz.kep ?? null,
      })
    } else if (sz.ferfi === true && !entry.ferfi) entry.ferfi = sz
    else if (sz.ferfi === false && !entry.no) entry.no = sz
    tagokByHaztartas.set(tag.id_haztartas, entry)
  }
  // Gyermekek életkor szerint (legidősebb elöl)
  for (const entry of tagokByHaztartas.values()) {
    entry.gyerekek.sort((a, b) => (a.sz_datum || '9999').localeCompare(b.sz_datum || '9999'))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return haztartasok.map((h: any) => {
    const ujCim = h.id_cim ? cimById.get(h.id_cim) ?? null : null
    const regiCim = h.legacy_csalad_id != null ? csaladCimById.get(h.legacy_csalad_id) ?? null : null

    // PRIORITÁS: új cim, ha van utca-név. Ha NEM, fallback a régi csalad-ra.
    // (Külön ellenőrzés a szam-ra és az utca-névre, mert előfordulhat hogy
    // az új cim-en csak az egyik mező van kitöltve.)
    const utca_name = ujCim?.utca_name ?? regiCim?.utca_name ?? null
    const utca_id = ujCim?.utca_id ?? regiCim?.utca_id ?? null
    const szam = ujCim?.szam ?? regiCim?.szam ?? null

    const entry = tagokByHaztartas.get(h.id as string) ?? { ferfi: null, no: null, gyerekek: [] }
    return {
      id: h.legacy_csalad_id as number,
      c_utcaid: utca_id,
      c_szam: szam,
      isaktiv: h.isaktiv as boolean,
      id_csoport: h.id_csoport as number | null,
      ferfi: entry.ferfi,
      no: entry.no,
      utca: utca_name ? { name: utca_name } : null,
      gyerekek: entry.gyerekek,
    } satisfies FamilyRow
  })
}

/**
 * A személyi kartonhoz szükséges, kis méretű családi összefoglaló.
 * Csak az aktuális gyülekezet aktív háztartásából olvas, és nem tölti be
 * a teljes családi karton pénzügyi/anyakönyvi adatait.
 */
export async function getMemberFamilySummary(id: number): Promise<MemberFamilySummary | null> {
  if (!Number.isInteger(id) || id <= 0) return null
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return null

  const householdResult = await supabase
    .from('haztartas')
    .select('id')
    .eq('congregation_id', congregationId)
    .eq('legacy_csalad_id', id)
    .is('ervenyes_ig', null)
    .limit(1)
    .maybeSingle()

  if (householdResult.error) throw new Error('A családi összefoglaló nem tölthető be.')
  if (!householdResult.data?.id) return null

  const tagResult = await supabase
    .from('haztartas_tag')
    .select('szerep, szemely:szemely!id_szemely(id, csaladnev, k_nev, sz_datum)')
    .eq('congregation_id', congregationId)
    .eq('id_haztartas', householdResult.data.id)
    .is('ervenyes_ig', null)
    .in('szerep', ['csaladfo', 'hazastars', 'gyermek', 'unoka'])
    .order('id_szemely', { ascending: true })

  if (tagResult.error) {
    throw new Error('A családi összefoglaló nem tölthető be.')
  }

  type PersonRelation = MemberFamilySummaryPerson | MemberFamilySummaryPerson[] | null
  type TagRelation = {
    szerep: string | null
    szemely: PersonRelation
  }

  const pickPerson = (value: PersonRelation): MemberFamilySummaryPerson | null =>
    Array.isArray(value) ? value[0] ?? null : value

  const adultMap = new Map<number, MemberFamilySummary['adults'][number]>()
  const childMap = new Map<number, MemberFamilySummary['children'][number]>()
  for (const row of (tagResult.data ?? []) as unknown as TagRelation[]) {
    const person = pickPerson(row.szemely)
    if (!person) continue
    if (row.szerep === 'csaladfo' || row.szerep === 'hazastars') {
      // 2026-07-24 (PR-4 F5.5): a tényleges szerep megy a kartonra (nem heurisztika)
      adultMap.set(person.id, { ...person, role: row.szerep })
    } else if (row.szerep === 'gyermek' || row.szerep === 'unoka') {
      childMap.set(person.id, { ...person, role: row.szerep })
    }
  }

  const adults = [...adultMap.values()]
  const allChildren = [...childMap.values()]
  const childrenCount = allChildren.length
  // 2026-07-24 (PR-4 F5.5): kor szerinti rendezés a slice ELŐTT — eddig a
  // DB-id-sorrend miatt a „4 megjelenített gyermek" önkényes részhalmaz volt.
  const children = allChildren
    .sort((a, b) => String(a.sz_datum || '9999').localeCompare(String(b.sz_datum || '9999')))
    .slice(0, 4)
  const uniqueMembers = new Set([...adultMap.keys(), ...childMap.keys()])
  const surnames = [...new Set(adults.map((person) => person.csaladnev?.trim()).filter(Boolean))]
  const displayName = surnames.length > 0 ? `${surnames.join('–')} család` : `Család #${id}`

  return {
    id,
    displayName,
    memberCount: uniqueMembers.size,
    adults,
    children,
    childrenCount,
  }
}

export async function getFamilyDetails(id: number) {
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return null
  const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
  if (!allowedFamilyIds.has(id)) return null

  // 2026-06-01 (hibrid család-modell Fázis 2): a `family` alapadat továbbra
  // is a régi `csalad`-ról jön (visszafelé kompatibilitás — a UI a family.id_ferfi
  // / family.id_no / family.c_utcaid mezőket használja a saveFamily-hez és
  // hasonlókhoz). A gyerekeket viszont az ÚJ modellből (haztartas_tag) szedjük,
  // mert a `haztartas_tag.ervenyes_ig` szűréssel automatikusan kihagyjuk a
  // költözött / elhalálozott / lezárt tagokat.
  const [familyRes, haztartasRes, districtState] = await Promise.all([
    supabase.from('csalad').select('*, ferfi:szemely!id_ferfi(id, csaladnev, k_nev, ferfi, sz_datum, meghalt, telefon, foglalkozas, vallas, namepattern, allapot, kep, social_profil_url), no:szemely!id_no(id, csaladnev, k_nev, ferfi, sz_datum, meghalt, telefon, foglalkozas, vallas, namepattern, allapot, kep, social_profil_url), utca:adrstreet!c_utcaid(name), csoport:csoport!id_csoport(nev)').eq('id', id).single(),
    // A `legacy_csalad_id = id` alapján megtaláljuk az új háztartást.
    supabase.from('haztartas').select('id').eq('legacy_csalad_id', id).is('ervenyes_ig', null).limit(1).maybeSingle(),
    getVisibleDistrictState(supabase, congregationId),
  ])

  const family = familyRes.data
    ? sanitizeDistrictReference(
        familyRes.data as typeof familyRes.data & { id_csoport: number | null; csoport?: { nev: string } | null },
        districtState.visibleIds,
      )
    : null

  // A háztartás-tagok közül a gyerekeket szedjük ki — aktív (ervenyes_ig IS NULL)
  // + szerep IN ('gyermek', 'unoka'). Ez automatikusan kihagyja a már nem-tagokat.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const haztartasId = (haztartasRes.data as any)?.id as string | undefined
  let children: { id: number; csaladnev: string; k_nev: string; ferfi: boolean; sz_datum: string | null; meghalt: boolean; vallas: string | null; foglalkozas?: string | null; namepattern?: string | null; allapot?: string | null; kep?: string | null; social_profil_url?: string | null }[] = []
  if (haztartasId) {
    const { data: tagok } = await supabase
      .from('haztartas_tag')
      .select('szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum, meghalt, vallas, foglalkozas, namepattern, allapot, kep, social_profil_url)')
      .eq('id_haztartas', haztartasId)
      .is('ervenyes_ig', null)
      .in('szerep', ['gyermek', 'unoka'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    children = (tagok || []).map((t: any) => Array.isArray(t.szemely) ? t.szemely[0] : t.szemely).filter(Boolean)
  } else {
    // Fallback: ha a háztartás nincs az új modellben (még nem backfill-elt vagy
    // valami baj van), a régi `gyerek` táblát olvassuk.
    const { data: gyerekek } = await supabase
      .from('gyerek')
      .select('id_szemely, szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum, meghalt, vallas, foglalkozas, namepattern, allapot, kep, social_profil_url)')
      .eq('id_csalad', id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    children = (gyerekek || []).map((c: any) => c.szemely).filter(Boolean)
  }
  // 2026-08-01 (PR-18): dedup id szerint — a korábban némán létrejött dupla
  // tagságok (gyermek+unoka tag, dupla gyerek-sor) ne listázzák kétszer.
  children = [...new Map(children.map((c) => [c.id, c])).values()]

  // 2. Tagok ID-k összegyűjtése az anyakönyvi lekérdezésekhez
  const memberIds = [family?.id_ferfi, family?.id_no, ...children.map(c => c.id)].filter(Boolean) as number[]

  // 3. Anyakönyvi adatok + családlátogatások
  const [directFamilyPayments, memberLinkedPayments, keresztRes, konfirmRes, hazassagRes, temetesRes] = await Promise.all([
    fetchFamilyPaymentsCompat(supabase, id),
    fetchPaymentsByMemberIdsCompat(supabase, memberIds),
    memberIds.length > 0 ? supabase.from('keresztseg').select('id_szemely, datum, adrlocality!helyid(name), lelkeszneve').in('id_szemely', memberIds) : Promise.resolve({ data: [] }),
    memberIds.length > 0 ? supabase.from('konfirmalas').select('id_szemely, datum, adrlocality!helyid(name), lelkeszneve').in('id_szemely', memberIds) : Promise.resolve({ data: [] }),
    family?.id_ferfi && family?.id_no
      // 2026-08-01 (PR-18 D8): duplikált anyakönyvi sor esetén a maybeSingle
      // hibát adott → az esketés némán eltűnt a kartonról. limit(1)-gyel a
      // legkorábbi (eredeti) rekord jelenik meg.
      ? supabase.from('hazassag').select('datum, adrlocality!helyid(name), lelkeszneve').eq('id_ferfi', family.id_ferfi).eq('id_no', family.id_no).order('datum', { ascending: true }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    memberIds.length > 0 ? supabase.from('temetes').select('id_szemely, hdatum').in('id_szemely', memberIds) : Promise.resolve({ data: [] }),
  ])

  const paymentsById = new Map<number, (typeof directFamilyPayments)[number]>()
  ;[...directFamilyPayments, ...memberLinkedPayments].forEach((payment) => {
    if (!paymentsById.has(payment.id)) {
      paymentsById.set(payment.id, payment)
    }
  })
  const payments = [...paymentsById.values()].sort((left, right) =>
    String(right.datum || '').localeCompare(String(left.datum || '')),
  )

  return {
    family,
    children,
    payments: payments,
    keresztelesek: (keresztRes.data || []) as unknown as { id_szemely: number; datum: string; adrlocality?: { name: string } | null; lelkeszneve?: string }[],
    konfirmaciok: (konfirmRes.data || []) as unknown as { id_szemely: number; datum: string; adrlocality?: { name: string } | null; lelkeszneve?: string }[],
    hazassag: hazassagRes.data as unknown as { datum?: string; adrlocality?: { name: string } | null; lelkeszneve?: string } | null,
    temetesek: (temetesRes.data || []) as unknown as { id_szemely: number; hdatum: string }[],
  }
}

export interface SaveFamilyResult {
  success?: boolean
  error?: string
  warning?: string
  /** 2026-08-01 (PR-18): a mentett/létrehozott család id-ja */
  familyId?: number
  /** 2026-08-01 (PR-18): dupla-tagsági ütközés — megerősítés (allowMoves) kell */
  conflicts?: AssignConflict[]
}

export async function saveFamily(data: FamilyInput): Promise<SaveFamilyResult> {
  const parsed = familySchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, congregationId, userId } = await getFamilyAccessContext()
  const user = userId ? { id: userId } : null
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const d = parsed.data
  // 2026-08-01 (PR-18): gyerekIds dedup + a felnőtt slotok kizárása a gyerek-
  // listából — a mentő RPC (delete+unnest-insert) a duplikátumokat szó nélkül
  // beszúrta volna, és egy személy ugyanabban a családban felnőtt ÉS gyermek
  // sem lehet.
  d.gyerekIds = [...new Set(d.gyerekIds)].filter((id) => id !== d.id_ferfi && id !== d.id_no)
  const selectedMemberIds = [d.id_ferfi, d.id_no, ...d.gyerekIds].filter(Boolean) as number[]
  if (selectedMemberIds.length > 0) {
    const { data: scopedMembers } = await supabase
      .from('szemely')
      .select('id')
      .eq('congregation_id', congregationId)
      .in('id', selectedMemberIds)

    if ((scopedMembers || []).length !== selectedMemberIds.length) {
      return { error: 'A család csak az aktuális gyülekezet tagjaiból állhat.' }
    }
  }

  // 2026-06-10 (Fázis 2, P1-5) + 2026-08-01 (PR-18 review): a jogosultság-
  // ellenőrzés MINDEN más lépés (dupla-őr, áthelyezés) ELŐTT fut — korábban
  // egy jogosulatlan/érvénytelen d.id mellett az allowMoves-ág már törölte a
  // gyermek régi tagságát, mielőtt a hibát visszaadtuk volna.
  if (d.id) {
    const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
    if (!allowedFamilyIds.has(d.id)) {
      return { error: 'Nincs jogosultsága ennek a családnak a szerkesztéséhez.' }
    }
  }

  // 2026-08-01 (PR-18): dupla-tagsági őr SZERVEROLDALON. Eddig csak a felnőtt-
  // kereső szűrt kliensoldalon; a gyermek-ág egyáltalán nem — így ugyanaz a
  // személy némán két család tagja lehetett. Az idegen gyülekezetben maradt
  // tagság (foreign) nem blokkol és nem mutálódik, csak figyelmeztetünk rá.
  let preexistingAdultWarning: string | undefined
  let foreignWarning: string | undefined
  let movesToApply: AssignConflict[] = []
  let movesAllowed: Set<number> = new Set()
  if (selectedMemberIds.length > 0) {
    const { blocked, movable, foreign, allowed } = await findMembershipConflicts(supabase, congregationId, selectedMemberIds, d.id ?? null)
    foreignWarning = foreignMembershipWarning(foreign)
    // A KORÁBBRÓL bennlévő felnőttek ütközése (régi, hibás adat) nem blokkol —
    // különben a család kartonja menthetetlenné válna (mindkét érintett család
    // szerkesztése hibára futna). Csak az ÚJONNAN hozzáadott felnőttre tiltunk.
    let newlyBlocked = blocked
    if (d.id) {
      const { data: currentFam } = await supabase
        .from('csalad')
        .select('id_ferfi, id_no')
        .eq('id', d.id)
        .maybeSingle()
      const preexisting = new Set([currentFam?.id_ferfi, currentFam?.id_no].filter(Boolean) as number[])
      newlyBlocked = blocked.filter((c) => !preexisting.has(c.personId))
      const kept = blocked.filter((c) => preexisting.has(c.personId))
      if (kept.length > 0) {
        preexistingAdultWarning = `Figyelem: ${kept.map((c) => `${c.personName} a(z) ${c.familyName} felnőtt tagjaként is szerepel`).join('; ')}. Ez korábbi dupla rögzítés — a másik család kartonján érdemes rendezni.`
      }
    }
    if (newlyBlocked.length > 0) {
      const b = newlyBlocked[0]
      return {
        error: `${b.personName} már a(z) ${b.familyName} felnőtt tagja (családfő vagy házastárs). Egy személy egyszerre csak egy család tagja lehet — előbb a másik család kartonján módosítsd a felnőtt tagokat.`,
      }
    }
    if (movable.length > 0 && !d.allowMoves) {
      return {
        conflicts: movable,
        warning: movable.length === 1
          ? `${movable[0].personName} jelenleg a(z) ${movable[0].familyName} tagja (gyermekként). Egy személy egyszerre csak egy család tagja lehet — az „Áthelyezés és mentés" gombbal a korábbi tagsága lezárul.`
          : `${movable.length} kiválasztott személy már egy másik család tagja (gyermekként). Egy személy egyszerre csak egy család tagja lehet — az „Áthelyezés és mentés" gombbal a korábbi tagságuk lezárul.`,
      }
    }
    movesToApply = d.allowMoves ? movable : []
    movesAllowed = allowed
  }

  // Az unoka-védelemhez: a mentés ELŐTTI gyermek-lista — az explicit
  // eltávolítottak (removed) unoka-tagját a sync lezárhatja.
  let removedChildIds: number[] = []
  if (d.id) {
    const { data: prevGyerek } = await supabase
      .from('gyerek')
      .select('id_szemely')
      .eq('id_csalad', d.id)
    const nextSet = new Set(d.gyerekIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removedChildIds = [...new Set(((prevGyerek || []) as any[]).map((g) => g.id_szemely as number))]
      .filter((id) => !nextSet.has(id))
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc('tagnyilvantartas_csalad_mentes', {
    p_id: d.id ?? null,
    p_id_ferfi: d.id_ferfi,
    p_id_no: d.id_no,
    p_gyerek_ids: d.gyerekIds,
    p_c_utcaid: d.c_utcaid || null,
    p_c_szam: d.c_szam || null,
    p_id_csoport: d.id_csoport || null,
  })
  if (rpcErr) {
    return { error: `Hiba: ${rpcErr.message} (Lefutott már a 2026-06-10-es Fázis 2-3 adatbázis-migráció?)` }
  }
  const rpcRes = rpcData as { status?: string; family_id?: number; message?: string } | null
  if (rpcRes?.status === 'forbidden') {
    return { error: 'Nincs jogosultsága ennek a családnak a szerkesztéséhez.' }
  }
  if (rpcRes?.status !== 'ok' || !rpcRes.family_id) {
    return { error: rpcRes?.message || 'A család mentése nem sikerült.' }
  }
  const familyId = rpcRes.family_id

  // 2026-08-01 (PR-18 review): az áthelyezés (régi gyerek-sorok törlése) csak
  // a SIKERES mentés UTÁN fut — fordítva egy elbukó RPC családtalanul hagyta
  // volna az áthelyezett gyermeket. Ha itt bukik el, átmeneti dupla tagság
  // marad, amit a következő mentés újra felajánl rendezésre.
  let moveWarning: string | undefined
  if (movesToApply.length > 0) {
    try {
      await moveChildMemberships(supabase, congregationId, movesToApply, movesAllowed)
    } catch (e) {
      console.warn('[saveFamily] moveChildMemberships sikertelen:',
        e instanceof Error ? e.message : e)
      moveWarning = 'A család mentve, de az áthelyezett tag korábbi családtagságának lezárása nem sikerült — nyisd meg a régi család kartonját, és távolítsd el onnan.'
    }
  }

  // 2026-06-01 (hibrid család-modell Fázis 2): az új modellt is naprakésszé
  // tesszük (haztartas + cim + haztartas_tag). Ha a saveFamily új csalad-ot
  // hozott létre vagy a meglévőt változtatta, a háztartás-szinkron lefut.
  // 2026-06-10 (Fázis 2): a hibrid-sync hibája többé nem néma — figyelmeztetés
  // formájában visszajut a felületre (P2-10 részleges).
  let syncWarning: string | undefined
  try {
    await syncHouseholdFromCsalad(supabase, familyId, congregationId, removedChildIds)
  } catch (e) {
    console.warn('[saveFamily] syncHouseholdFromCsalad sikertelen:',
      e instanceof Error ? e.message : e)
    syncWarning = 'A család mentve, de a háztartás-nézet szinkronizálása nem sikerült — mentsd el újra a családot, vagy jelezd a rendszergazdának.'
  }

  await logAuditEvent({
    action: 'family.save',
    targetTable: 'csalad',
    targetId: String(familyId),
    metadata: { mode: d.id ? 'update' : 'create', gyerekek: d.gyerekIds.length, sync_ok: !syncWarning, moved: movesToApply.length },
  }, supabase)

  revalidatePath('/tagnyilvantartas')
  const combinedWarning = [preexistingAdultWarning, moveWarning, syncWarning, foreignWarning].filter(Boolean).join(' ') || undefined
  return { success: true, warning: combinedWarning, familyId }
}

// ── Szabad személy keresés (házasok kiszűrve) ────────────────

export async function searchFamilyMember(query: string, role: 'ferfi' | 'no' | 'gyerek', editFamilyId?: number) {
  if (query.trim().length < 2) return []
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return []
  const parts = query.trim().split(/\s+/)

  let q = supabase.from('szemely')
    .select('id, csaladnev, k_nev, ferfi, sz_datum, c_szam, c_utcaid, c_helysegid, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name, adrlocality!localityid(name))')
    .eq('congregation_id', congregationId).eq('isvisible', true).eq('meghalt', false)

  if (role === 'ferfi') q = q.eq('ferfi', true)
  else if (role === 'no') q = q.eq('ferfi', false)

  if (parts.length === 1) q = q.or(`csaladnev.ilike.%${parts[0]}%,k_nev.ilike.%${parts[0]}%`)
  else q = q.ilike('csaladnev', `%${parts[0]}%`).ilike('k_nev', `%${parts.slice(1).join(' ')}%`)

  const { data: membersRaw } = await q.limit(10)
  // 2026-07-17 (PR-1): település-fallback az utca-láncból a kereső-találatokban is.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members = ((membersRaw || []) as any[]).map((row) => applyStreetLocalityFallback(row))
  if (!members.length) return []

  // Házasok kiszűrése — csak AKTÍV családok számítanak.
  // 2026-07-24 (PR-4 F5.7): szerkesztésnél eddig a szűrő TELJESEN kikapcsolt
  // (bármely más családban házas személy kiválasztható volt → dupla
  // családtagság). Mostantól csak a SZERKESZTETT család saját tagjai
  // engedélyezettek a házasok közül.
  // 2026-08-01 (PR-18): a GYEREK-keresés is szűr — máshol felnőttként (családfő/
  // házastárs) szereplő személy gyermekként sehová nem vehető fel. A máshol
  // GYERMEKKÉNT szereplőket nem rejtjük el, hanem figyelmeztető jelvényt kapnak
  // (masikCsalad) — kiválasztásuk a mentéskor áthelyezési megerősítést kér.
  const { data: allFamilies } = await supabase.from('csalad').select('id, id_ferfi, id_no').eq('isaktiv', true)
  const marriedIds = new Set<number>()
  const anyAdultIds = new Set<number>()
  const currentFamilyMemberIds = new Set<number>()
  ;(allFamilies || []).forEach((f: { id: number; id_ferfi: number | null; id_no: number | null }) => {
    if (role === 'ferfi' && f.id_ferfi) marriedIds.add(f.id_ferfi)
    if (role === 'no' && f.id_no) marriedIds.add(f.id_no)
    if (f.id_ferfi) anyAdultIds.add(f.id_ferfi)
    if (f.id_no) anyAdultIds.add(f.id_no)
    if (editFamilyId !== undefined && f.id === editFamilyId) {
      if (f.id_ferfi) currentFamilyMemberIds.add(f.id_ferfi)
      if (f.id_no) currentFamilyMemberIds.add(f.id_no)
    }
  })

  const filtered = role === 'gyerek'
    ? members.filter(m => !anyAdultIds.has(m.id))
    : members.filter(m => !marriedIds.has(m.id) || currentFamilyMemberIds.has(m.id))
  if (!filtered.length) return []

  // Figyelmeztető annotáció: melyik MÁSIK (saját gyülekezeti) családnak tagja
  // már a találat — az idegen gyülekezetben maradt tagságot nem jelvényezzük,
  // mert arra az áthelyezés-folyamat úgysem tud (és nem is szabad) ráhatni.
  const [memberships, allowedForBadge] = await Promise.all([
    loadFamilyMemberships(supabase, filtered.map(m => m.id as number)),
    getAllowedFamilyIds(supabase, congregationId),
  ])
  return filtered.map(m => {
    const other = (memberships.get(m.id as number) ?? []).find(
      (ms) => allowedForBadge.has(ms.familyId) && (editFamilyId === undefined || ms.familyId !== editFamilyId),
    )
    return {
      ...m,
      masikCsalad: other
        ? { id: other.familyId, name: other.familyName, role: other.role }
        : null,
    }
  })
}

/**
 * 2026-06-02: Veszélyes művelet — a teljes családi struktúrát törli a
 * gyülekezetben, hogy a rendszergazda újra importálhassa Excel-ből (vagy
 * újra-építhesse a felületen) az új modell szerint.
 *
 * MIT törölünk:
 *   - haztartas_tag (M:N kapcsolótábla)
 *   - szemely_kapcsolat (rokoni viszonyok)
 *   - haztartas (háztartások)
 *   - cim (címek)
 *   - csalad + gyerek (régi modell)
 *
 * MIT NEM törölünk:
 *   - szemely (személyek — az anyakönyvek + befizetések rájuk hivatkoznak!)
 *   - keresztseg, hazassag, temetes (anyakönyvi rekordok érintetlen)
 *   - befizetes, csaladlatogatas (érintetlenek)
 *
 * Védelmek:
 *   - csak admin / egyházkerületi admin használhatja
 *   - megerősítés-szöveg kötelező ('TÖRLÉS')
 *   - csak a saját gyülekezet adatai
 */
export async function wipeFamilyStructure(confirmation: string) {
  if (confirmation !== 'TÖRLÉS') {
    return { error: 'Hibás megerősítés. A „TÖRLÉS" szót kell pontosan beírni.' }
  }
  const { supabase, congregationId, userId } = await getFamilyAccessContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  // Csak admin / egyházkerületi admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (profile as any)?.role
  if (role !== 'admin' && role !== 'egyhazkeruleti_admin') {
    return { error: 'Csak rendszergazda használhatja ezt a funkciót.' }
  }

  // 1. Saját gyülekezet szemely-id-i (a régi csalad+gyerek szűréshez)
  const { data: szemely } = await supabase
    .from('szemely').select('id')
    .eq('congregation_id', congregationId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const szemIds = ((szemely || []) as any[]).map((s) => s.id as number)

  // 2. Új modell törlés (congregation_id-vel direkt)
  const stats = { haztartas_tag: 0, szemely_kapcsolat: 0, haztartas: 0, cim: 0, csalad: 0, gyerek: 0 }

  const t1 = await supabase.from('haztartas_tag').delete({ count: 'exact' }).eq('congregation_id', congregationId)
  stats.haztartas_tag = t1.count ?? 0
  const t2 = await supabase.from('szemely_kapcsolat').delete({ count: 'exact' }).eq('congregation_id', congregationId)
  stats.szemely_kapcsolat = t2.count ?? 0

  // cim: csak a saját gyülekezet háztartásaihoz tartozó címeket töröljük
  const { data: hRows } = await supabase
    .from('haztartas').select('id_cim').eq('congregation_id', congregationId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cimIds = ((hRows || []) as any[]).map((h) => h.id_cim).filter((v): v is string => !!v)

  const t3 = await supabase.from('haztartas').delete({ count: 'exact' }).eq('congregation_id', congregationId)
  stats.haztartas = t3.count ?? 0

  if (cimIds.length > 0) {
    const t4 = await supabase.from('cim').delete({ count: 'exact' }).in('id', cimIds)
    stats.cim = t4.count ?? 0
  }

  // 3. Régi csalad + gyerek (a csalad táblán nincs congregation_id, a szemely-en keresztül szűrünk)
  if (szemIds.length > 0) {
    const t5 = await supabase.from('gyerek').delete({ count: 'exact' }).in('id_szemely', szemIds)
    stats.gyerek = t5.count ?? 0
    const t6 = await supabase.from('csalad').delete({ count: 'exact' })
      .or(`id_ferfi.in.(${szemIds.join(',')}),id_no.in.(${szemIds.join(',')})`)
    stats.csalad = t6.count ?? 0
  }

  await logAuditEvent({ action: 'family.wipe_structure', targetTable: 'csalad', metadata: { ...stats } }, supabase)
  revalidatePath('/tagnyilvantartas')
  return {
    success: true,
    message: 'Családi struktúra törölve. A személyek, anyakönyvek, befizetések érintetlenek maradtak.',
    stats,
  }
}

export async function deleteFamily(id: number) {
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }
  const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
  if (!allowedFamilyIds.has(id)) return { error: 'Nincs jogosultsága ennek a családnak a törléséhez.' }
  await supabase.from('gyerek').delete().eq('id_csalad', id)
  const { error } = await supabase.from('csalad').delete().eq('id', id)
  if (error) return { error: `Hiba: ${error.message}` }

  // 2026-06-01 (hibrid család-modell Fázis 2): a hozzátartozó haztartas-t
  // NEM töröljük (mert anyakönyvi rekordok, családlátogatási naplók
  // hivatkozhatnak rá), hanem ARCHIVÁLJUK — isaktiv=false, ervenyes_ig=today,
  // és minden aktív tagság is lezárul.
  try {
    const today = new Date().toISOString().slice(0, 10)
    const { data: haztartas } = await supabase
      .from('haztartas')
      .select('id')
      .eq('legacy_csalad_id', id)
      .is('ervenyes_ig', null)
      .limit(1)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const haztartasId = (haztartas as any)?.id as string | undefined
    if (haztartasId) {
      await supabase
        .from('haztartas')
        .update({ isaktiv: false, ervenyes_ig: today })
        .eq('id', haztartasId)
      await supabase
        .from('haztartas_tag')
        .update({ ervenyes_ig: today })
        .eq('id_haztartas', haztartasId)
        .is('ervenyes_ig', null)
    }
  } catch (e) {
    console.warn('[deleteFamily] haztartas archiválás sikertelen (nem blokkoló):',
      e instanceof Error ? e.message : e)
  }

  await logAuditEvent({ action: 'family.delete', targetTable: 'csalad', targetId: String(id) }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

// ── Családlátogatás ─────────────────────────────────────────

export async function getFamilyVisits(familyId: number) {
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return []
  const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
  if (!allowedFamilyIds.has(familyId)) return []
  const { data } = await supabase.from('csaladlatogatas')
    .select('*')
    .eq('id_csalad', familyId)
    .eq('congregation_id', congregationId)
    .order('datum', { ascending: false })
  return (data || []) as { id: string; datum: string; lelkesz: string; alapige: string | null; megjegyzes: string | null }[]
}

export async function saveFamilyVisit(data: { familyId: number; datum: string; lelkesz: string; alapige?: string; megjegyzes?: string; toMunkanaplo?: boolean }) {
  const { supabase, congregationId, userId } = await getFamilyAccessContext()
  const user = userId ? { id: userId } : null
  if (!user || !congregationId) return { error: 'Nincs bejelentkezve.' }
  if (!data.datum || !data.lelkesz) return { error: 'A dátum és a lelkész neve kötelező.' }

  const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
  if (!allowedFamilyIds.has(data.familyId)) return { error: 'Nincs jogosultsága ehhez a családhoz.' }

  // Családlátogatás mentés
  const { error, data: insData } = await supabase.from('csaladlatogatas').insert({
    id_csalad: data.familyId,
    datum: data.datum,
    lelkesz: data.lelkesz,
    alapige: data.alapige || null,
    megjegyzes: data.megjegyzes || null,
    congregation_id: congregationId,
  }).select('id')
  if (error) return { error: error.message }

  // Munkanapló szinkron (2026-06-12, Endre #3-4 munkanapló): a közös
  // registry-sync helperrel — a korábbi insert a munkanaplo.jelenlet_osszesen
  // NOT NULL oszlop miatt NÉMÁN elbukott (a try/catch nem fogta, mert a
  // Supabase nem dob, hanem error-t ad vissza). Most a csaladlatogatas sor
  // `munkanaplo_id` linkje is kitöltődik (a séma eddig is tartalmazta).
  const visitId = (insData?.[0]?.id as number | undefined) ?? null
  if (data.toMunkanaplo && visitId) {
    await syncRegistryWorklogLink(supabase, congregationId, {
      sourceTable: 'csaladlatogatas',
      sourceId: visitId,
      currentWorklogId: null,
      munkanaploba: true,
      payload: {
        idopont: data.datum,
        jellege: 'Családlátogatás',
        kategoria: 'latogatas',
        alapige: data.alapige || null,
        szolgalt: data.lelkesz,
        megjegyzes: data.megjegyzes || null,
      },
    })
    revalidatePath('/munkanaplo')
  }

  await logAuditEvent({ action: 'family.visit_save', targetTable: 'csaladlatogatas', targetId: String(data.familyId) }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

// ── Egyetlen tag minimális EnrichedMember-ként ───────────────────────────
// 2026-06-02: A családi kartonon a felhasználó a személyekre kattintva
// nyithatja meg a `MemberDetailsDialogV2`-t. Ez az action visszaadja az
// alapadatokat — a payment-status és átjelentkezés-info nem fontos itt,
// mert a dialog belül `getMemberDetails(id)`-vel úgyis lekéri a részletes
// adatokat (anyakönyv, befizetések, hátralék).
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getEnrichedMemberById(id: number, familyId: number | null): Promise<any> {
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return null
  const { data, error } = await supabase
    .from('szemely')
    .select('*, adrstreet!c_utcaid(name, adrlocality!localityid(name)), adrlocality!c_helysegid(name)')
    .eq('id', id)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (error || !data) return null

  return {
    // 2026-07-17 (PR-1): település-fallback az utca-láncból (c_helysegid-hiány pótlása).
    ...applyStreetLocalityFallback(data as Parameters<typeof applyStreetLocalityFallback>[0]),
    paymentStatus: 'rendezve',
    familyId,
    pendingTransfer: null,
    hasEverPaid: false,
  }
}

// ── Családi karton nyomtatási adatok (2026-06-10) ────────────
// A nyomtatható (lefűzhető) családi kartonhoz egy menetben összegyűjti:
// szülők + gyermekek, anyakönyvi dátumaik, megjegyzéseik, a házasság,
// az utolsó évek egyházfenntartói befizetései és a családlátogatások.

export type FamilyCardPrintPerson = {
  szerep: string
  nev: string
  szuletes: string | null
  keresztseg: string | null
  konfirmacio: string | null
  megjegyzes: string | null
  meghalt: boolean
}

export async function getFamilyCardPrintData(familyId: number) {
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return null
  const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
  if (!allowedFamilyIds.has(familyId)) return null

  const { data: family } = await supabase
    .from('csalad')
    .select('id, id_ferfi, id_no, c_szam, id_csoport, adrstreet!c_utcaid(name, adrlocality!localityid(name)), csoport!id_csoport(nev)')
    .eq('id', familyId)
    .maybeSingle()
  if (!family) return null

  type FamilyRow2 = {
    id: number
    id_ferfi: number | null
    id_no: number | null
    c_szam: string | null
    adrstreet: { name: string | null; adrlocality: { name: string | null } | { name: string | null }[] | null } | { name: string | null; adrlocality: { name: string | null } | null }[] | null
    csoport: { nev: string | null } | { nev: string | null }[] | null
  }
  const fam = family as unknown as FamilyRow2
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] || null : v)

  const { data: childRows } = await supabase
    .from('gyerek')
    .select('id_szemely')
    .eq('id_csalad', familyId)
  const childIds = ((childRows || []) as { id_szemely: number }[]).map((r) => r.id_szemely)
  const adultIds = [fam.id_ferfi, fam.id_no].filter(Boolean) as number[]
  const allIds = [...adultIds, ...childIds]
  if (allIds.length === 0) return null

  const currentYear = new Date().getFullYear()
  const [personsRes, keresztRes, konfirmRes, hazassagRes, paymentsRes, visitsRes, congRes] = await Promise.all([
    supabase.from('szemely')
      .select('id, csaladnev, k_nev, szcs_nev, ferfi, sz_datum, foglalkozas, telefon, megjegyzes, meghalt')
      .in('id', allIds).eq('congregation_id', congregationId),
    supabase.from('keresztseg').select('id_szemely, datum').in('id_szemely', allIds).eq('congregation_id', congregationId),
    supabase.from('konfirmalas').select('id_szemely, datum').in('id_szemely', allIds).eq('congregation_id', congregationId),
    fam.id_ferfi && fam.id_no
      ? supabase.from('hazassag').select('datum, lelkeszneve')
          .eq('id_ferfi', fam.id_ferfi).eq('id_no', fam.id_no)
          .eq('congregation_id', congregationId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('befizetes')
      .select('datum, osszeg, fizetettev, id_szemely, id_csalad, befizetescel(nev)')
      .eq('congregation_id', congregationId)
      .or(`id_csalad.eq.${familyId},id_szemely.in.(${allIds.join(',')})`)
      .or('deleted.eq.false,deleted.is.null')
      .gte('fizetettev', currentYear - 4)
      .order('datum', { ascending: false })
      .limit(60),
    supabase.from('csaladlatogatas')
      .select('datum, lelkesz, megjegyzes')
      .eq('id_csalad', familyId).eq('congregation_id', congregationId)
      .order('datum', { ascending: false }).limit(6),
    supabase.from('congregations').select('name, nev_hu').eq('id', congregationId).maybeSingle(),
  ])

  type PersonRow = { id: number; csaladnev: string | null; k_nev: string | null; szcs_nev: string | null; ferfi: boolean | null; sz_datum: string | null; foglalkozas: string | null; telefon: string | null; megjegyzes: string | null; meghalt: boolean | null }
  const persons = (personsRes.data || []) as PersonRow[]
  const keresztMap = new Map(((keresztRes.data || []) as { id_szemely: number; datum: string | null }[]).map((r) => [r.id_szemely, r.datum]))
  const konfirmMap = new Map(((konfirmRes.data || []) as { id_szemely: number; datum: string | null }[]).map((r) => [r.id_szemely, r.datum]))

  const personName = (p: PersonRow) => `${p.csaladnev || ''} ${p.k_nev || ''}`.trim() + (p.szcs_nev ? ` (szül. ${p.szcs_nev})` : '')
  const toPrint = (p: PersonRow, szerep: string): FamilyCardPrintPerson => ({
    szerep,
    nev: personName(p),
    szuletes: p.sz_datum,
    keresztseg: keresztMap.get(p.id) || null,
    konfirmacio: konfirmMap.get(p.id) || null,
    megjegyzes: p.megjegyzes,
    meghalt: !!p.meghalt,
  })

  const husband = persons.find((p) => p.id === fam.id_ferfi)
  const wife = persons.find((p) => p.id === fam.id_no)
  const children = childIds
    .map((id) => persons.find((p) => p.id === id))
    .filter(Boolean) as PersonRow[]
  children.sort((a, b) => (a.sz_datum || '9999').localeCompare(b.sz_datum || '9999'))

  const street = one(fam.adrstreet)
  const locality = street ? one((street as { adrlocality?: unknown }).adrlocality as { name: string | null } | { name: string | null }[] | null) : null
  const congregation = congRes.data as { name: string | null; nev_hu: string | null } | null
  const marriage = hazassagRes.data as { datum: string | null; lelkeszneve: string | null } | null

  return {
    familyId,
    familyName: [husband ? personName(husband) : null, wife ? personName(wife) : null].filter(Boolean).join(' és ') || 'Család',
    address: [locality?.name, street?.name, fam.c_szam].filter(Boolean).join(', ') || null,
    district: one(fam.csoport)?.nev || null,
    congregation: congregation?.nev_hu || congregation?.name || '',
    marriage: marriage ? { datum: marriage.datum, lelkesz: marriage.lelkeszneve } : null,
    adults: [
      ...(husband ? [toPrint(husband, 'Családfő')] : []),
      ...(wife ? [toPrint(wife, 'Házastárs')] : []),
    ],
    children: children.map((c) => toPrint(c, c.ferfi ? 'Fiú' : 'Lány')),
    payments: ((paymentsRes.data || []) as { datum: string | null; osszeg: number | string | null; fizetettev: number | null; befizetescel: { nev: string | null } | { nev: string | null }[] | null }[]).map((r) => ({
      datum: r.datum,
      ev: r.fizetettev,
      osszeg: Number(r.osszeg || 0),
      cel: one(r.befizetescel)?.nev || null,
    })),
    visits: ((visitsRes.data || []) as { datum: string | null; lelkesz: string | null; megjegyzes: string | null }[]).map((v) => ({
      datum: v.datum,
      lelkesz: v.lelkesz,
      megjegyzes: v.megjegyzes,
    })),
  }
}
