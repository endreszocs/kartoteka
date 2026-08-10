'use server'

import { revalidatePath } from 'next/cache'
import { selectAllPaged } from '@kartoteka/supabase-client'
import { divorceSchema, familySchema, type DivorceInput, type FamilyInput } from '@/lib/validations/members'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { fetchFamilyPaymentsCompat, fetchPaymentsByMemberIdsCompat } from '@/lib/finance/payment-compat'
import { getVisibleDistrictState, sanitizeDistrictReference } from '@/lib/members/district-visibility'
import { applyStreetLocalityFallback } from '@/lib/members/street-locality-fallback'
import { logAuditEvent } from '@/lib/audit/log'
import { syncRegistryWorklogLink } from '@/lib/worklog/registry-sync'
import {
  closePartnershipForDivorce,
  closeSyncKinshipEdges,
  findMembershipConflicts,
  foreignMembershipWarning,
  getAllowedFamilyIds,
  loadFamilyDisplayNames,
  loadFamilyMemberships,
  moveChildMemberships,
  protectParentEdgesAfterDivorce,
  reconcileKinshipForPersons,
  syncHouseholdFromCsalad,
  DIVORCE_EDGE_MARKER,
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
  // tagság — pl. átjelentkezés maradványa — nem blokkol és nem mutálódik).
  // Fail-closed: olvasási hibánál nem rendelünk hozzá.
  let guard: Awaited<ReturnType<typeof findMembershipConflicts>>
  try {
    guard = await findMembershipConflicts(supabase, congregationId, [memberId], familyId)
  } catch (e) {
    console.warn('[assignMemberToFamily] tagsági ellenőrzés sikertelen:', e instanceof Error ? e.message : e)
    return { error: 'A családtagsági ellenőrzés nem sikerült — próbáld újra. Ha a hiba ismétlődik, jelezd a rendszergazdának.' }
  }
  const { blocked, movable, foreign, allowed } = guard
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

  // 2026-08-04 (PR-35): KÜLÖN HÁZTARTÁSBAN ÉLŐ FELNŐTT GYERMEKEK. A karton
  // gyermek-listája (haztartas_tag) szándékosan csak az együtt élőket mutatja —
  // a saját családot alapított gyermek eddig NÉMÁN hiányzott róla. Most a vér
  // szerinti kapcsolatból (szemely_kapcsolat) kigyűjtjük őket, jelöléssel.
  interface FelnottGyermek {
    id: number
    csaladnev: string | null
    k_nev: string | null
    ferfi: boolean | null
    sz_datum: string | null
    namepattern: string | null
    /** A saját családi kartonja (ahol felnőtt tag) — ha van */
    sajatCsalad: { id: number; name: string } | null
  }
  let felnottGyermekek: FelnottGyermek[] = []
  try {
    const szulok = [family?.id_ferfi, family?.id_no].filter((v): v is number => v != null)
    if (szulok.length > 0) {
      const { data: elek } = await supabase
        .from('szemely_kapcsolat')
        .select('id_szemely_2')
        .eq('tipus', 'szulo_gyermek')
        .is('ervenyes_ig', null)
        .in('id_szemely_1', szulok)
      const haztartasbanLevok = new Set(children.map((c) => c.id as number))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const kulsoIds = [...new Set(((elek || []) as any[]).map((e) => e.id_szemely_2 as number))]
        .filter((cid) => !haztartasbanLevok.has(cid) && cid !== family?.id_ferfi && cid !== family?.id_no)
      if (kulsoIds.length > 0) {
        const [{ data: szemelyek }, { data: sajatCsaladok }] = await Promise.all([
          supabase.from('szemely')
            .select('id, csaladnev, k_nev, ferfi, sz_datum, namepattern')
            .eq('congregation_id', congregationId)
            .in('id', kulsoIds),
          supabase.from('csalad').select('id, id_ferfi, id_no').eq('isaktiv', true)
            .or(`id_ferfi.in.(${kulsoIds.join(',')}),id_no.in.(${kulsoIds.join(',')})`),
        ])
        const csaladIdk = new Map<number, number>()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const f of (sajatCsaladok || []) as any[]) {
          for (const pid of [f.id_ferfi, f.id_no]) {
            if (pid != null && kulsoIds.includes(pid as number)) csaladIdk.set(pid as number, f.id as number)
          }
        }
        const nevek = await loadFamilyDisplayNames(supabase, [...new Set(csaladIdk.values())])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        felnottGyermekek = ((szemelyek || []) as any[]).map((sz) => {
          const cid = csaladIdk.get(sz.id as number) ?? null
          return {
            id: sz.id as number,
            csaladnev: sz.csaladnev ?? null,
            k_nev: sz.k_nev ?? null,
            ferfi: sz.ferfi ?? null,
            sz_datum: sz.sz_datum ?? null,
            namepattern: sz.namepattern ?? null,
            sajatCsalad: cid ? { id: cid, name: nevek.get(cid) ?? `Család #${cid}` } : null,
          }
        })
      }
    }
  } catch (e) {
    console.warn('[getFamilyDetails] felnőtt gyermekek lekérdezése sikertelen:',
      e instanceof Error ? e.message : e)
  }

  return {
    family,
    children,
    felnottGyermekek,
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
  // 2026-08-04 (PR-32): a FELNŐTT gyermek (aki már saját családi karton
  // családfője/házastársa) NEM kerülhet be a háztartásba gyermekként — az
  // „egy aktív háztartás" szabály a járulék-számítás alapja. A ROKONI
  // kapcsolatot viszont rögzítjük: a családfán megjelenik a szüleinél.
  const felnottGyermekIds: number[] = []
  if (d.gyerekIds.length > 0) {
    const { data: adultRows, error: adultErr } = await supabase
      .from('csalad')
      .select('id, id_ferfi, id_no')
      .eq('isaktiv', true)
      .or(`id_ferfi.in.(${d.gyerekIds.join(',')}),id_no.in.(${d.gyerekIds.join(',')})`)
    if (adultErr) return { error: `A családtagsági ellenőrzés nem sikerült: ${adultErr.message}` }
    const adultElsewhere = new Set<number>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const f of (adultRows || []) as any[]) {
      if (f.id === d.id) continue
      for (const pid of [f.id_ferfi, f.id_no]) {
        if (pid != null && d.gyerekIds.includes(pid as number)) adultElsewhere.add(pid as number)
      }
    }
    if (adultElsewhere.size > 0) {
      felnottGyermekIds.push(...adultElsewhere)
      d.gyerekIds = d.gyerekIds.filter((id) => !adultElsewhere.has(id))
    }
  }
  const selectedMemberIds = [d.id_ferfi, d.id_no, ...d.gyerekIds].filter(Boolean) as number[]
  // A nevek a hibaüzenetekhez kellenek (lásd humanizeFamilyRpcError)
  const nameOfSelected = new Map<number, string>()
  if (selectedMemberIds.length > 0) {
    const { data: scopedMembers } = await supabase
      .from('szemely')
      .select('id, csaladnev, k_nev')
      .eq('congregation_id', congregationId)
      .in('id', selectedMemberIds)

    if ((scopedMembers || []).length !== selectedMemberIds.length) {
      return { error: 'A család csak az aktuális gyülekezet tagjaiból állhat.' }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (scopedMembers || []) as any[]) {
      nameOfSelected.set(p.id as number, `${p.csaladnev ?? ''} ${p.k_nev ?? ''}`.trim() || `#${p.id}`)
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
    // Fail-closed: ha a tagsági ellenőrzés olvasása elbukik, NEM mentünk
    // (elnyelt hibával az őr némán kikapcsolna).
    let guard: Awaited<ReturnType<typeof findMembershipConflicts>>
    try {
      guard = await findMembershipConflicts(supabase, congregationId, selectedMemberIds, d.id ?? null)
    } catch (e) {
      console.warn('[saveFamily] tagsági ellenőrzés sikertelen:', e instanceof Error ? e.message : e)
      return { error: 'A családtagsági ellenőrzés nem sikerült — próbáld újra. Ha a hiba ismétlődik, jelezd a rendszergazdának.' }
    }
    const { blocked, movable, foreign, allowed } = guard
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

  // Az unoka-védelemhez + a rokonsági él-lezáráshoz: a mentés ELŐTTI
  // gyermek-lista és házaspár — az explicit eltávolítottak unoka-tagját a
  // sync lezárja, a sync-eredetű rokonsági éleiket pedig mi (lásd lentebb).
  let removedChildIds: number[] = []
  let prevChildIds: number[] = []
  let prevFerfi: number | null = null
  let prevNo: number | null = null
  if (d.id) {
    const [{ data: prevGyerek }, { data: prevFam }] = await Promise.all([
      supabase.from('gyerek').select('id_szemely').eq('id_csalad', d.id),
      supabase.from('csalad').select('id_ferfi, id_no').eq('id', d.id).maybeSingle(),
    ])
    prevFerfi = (prevFam as { id_ferfi: number | null } | null)?.id_ferfi ?? null
    prevNo = (prevFam as { id_no: number | null } | null)?.id_no ?? null
    const nextSet = new Set(d.gyerekIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prevChildIds = [...new Set(((prevGyerek || []) as any[]).map((g) => g.id_szemely as number))]
    removedChildIds = prevChildIds.filter((id) => !nextSet.has(id))
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
  // 2026-08-04 (PR-44): a nyers Postgres-üzenet (pl. „duplicate key value
  // violates unique constraint csalad_id_ferfi_idx") helyett emberi mondat —
  // eddig a lelkész ebből nem tudta kitalálni, hogy a válást kell rögzítenie.
  const rpcNames = {
    ferfi: d.id_ferfi ? nameOfSelected.get(d.id_ferfi) ?? null : null,
    no: d.id_no ? nameOfSelected.get(d.id_no) ?? null : null,
  }
  if (rpcErr) {
    return { error: `Hiba: ${humanizeFamilyRpcError(rpcErr.message, rpcNames)}` }
  }
  const rpcRes = rpcData as { status?: string; family_id?: number; message?: string } | null
  if (rpcRes?.status === 'forbidden') {
    return { error: 'Nincs jogosultsága ennek a családnak a szerkesztéséhez.' }
  }
  if (rpcRes?.status !== 'ok' || !rpcRes.family_id) {
    return { error: humanizeFamilyRpcError(rpcRes?.message, rpcNames) || 'A család mentése nem sikerült.' }
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

  // 2026-08-04 (PR-32): FELNŐTT GYERMEK — a háztartásba nem került be, de a
  // vér szerinti kapcsolatot rögzítjük, hogy a családfán a szüleinél lássuk.
  if (felnottGyermekIds.length > 0) {
    const szulok = [d.id_ferfi, d.id_no].filter((v): v is number => v != null)
    const nevek: string[] = []
    try {
      const { data: nevRows } = await supabase
        .from('szemely').select('id, csaladnev, k_nev').in('id', felnottGyermekIds)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (nevRows || []) as any[]) {
        nevek.push(`${r.csaladnev ?? ''} ${r.k_nev ?? ''}`.trim() || `#${r.id}`)
      }
      for (const gyermekId of felnottGyermekIds) {
        for (const szuloId of szulok) {
          if (szuloId === gyermekId) continue
          const { data: van } = await supabase
            .from('szemely_kapcsolat').select('id')
            .eq('id_szemely_1', szuloId).eq('id_szemely_2', gyermekId)
            .eq('tipus', 'szulo_gyermek').is('ervenyes_ig', null).limit(1)
          if (van?.length) continue
          const { error: insErr } = await supabase.from('szemely_kapcsolat').insert([{
            id_szemely_1: szuloId, id_szemely_2: gyermekId,
            tipus: 'szulo_gyermek', ver_szerinti: true,
            congregation_id: congregationId,
          }])
          if (insErr) throw new Error(insErr.message)
        }
      }
      syncWarning = (syncWarning ? syncWarning + ' ' : '')
        + `${nevek.join(', ')} saját családot alapított, ezért a háztartáshoz nem adtuk hozzá — a szülő–gyermek kapcsolatot viszont rögzítettük, így a családfán a szülőknél megjelenik.`
    } catch (e) {
      syncWarning = (syncWarning ? syncWarning + ' ' : '')
        + `A felnőtt gyermek rokoni kapcsolatának rögzítése nem sikerült (${e instanceof Error ? e.message : 'ismeretlen hiba'}) — próbáld újra.`
    }
  }

  // 2026-08-04 (PR-27): PÁRKAPCSOLAT jellege és kezdete. A szinkron alapból
  // 'hazastars' élt ír a felnőtt párra; ha a lelkész élettársi kapcsolatot
  // jelölt, azt itt vezetjük át (a típus és a dátum a rokonsági élen él, mert
  // a családfa is abból épül). Best-effort: a mentést nem buktatja el.
  if (d.parkapcsolat && d.id_ferfi && d.id_no && d.id_ferfi !== d.id_no) {
    try {
      const { data: parRows, error: parErr } = await supabase
        .from('szemely_kapcsolat')
        .select('id, tipus, ervenyes_tol')
        .in('tipus', ['hazastars', 'elettars'])
        .is('ervenyes_ig', null)
        .eq('congregation_id', congregationId)
        .or(`and(id_szemely_1.eq.${d.id_ferfi},id_szemely_2.eq.${d.id_no}),and(id_szemely_1.eq.${d.id_no},id_szemely_2.eq.${d.id_ferfi})`)
        // Determinisztikus sorrend: az ANYAKÖNYVI eredetű él (megjegyzes NULL,
        // rajta a valódi esküvői dátummal) legyen a megtartott
        .order('megjegyzes', { nullsFirst: true })
        .order('id')
      if (parErr) throw new Error(parErr.message)
      const datum = d.parkapcsolat_datum?.trim() ? d.parkapcsolat_datum.trim() : null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (parRows || []) as any[]
      if (rows.length > 0) {
        const target = rows[0]
        // A felesleges pár-éleket ELŐBB zárjuk le — különben a target típus-
        // váltása az aktív-pár egyediségi indexbe ütközne (egy pár = egy él)
        for (const extra of rows.slice(1)) {
          await supabase.from('szemely_kapcsolat')
            .update({ ervenyes_ig: new Date().toISOString().slice(0, 10), megjegyzes: 'csalad-szerkesztes-eltavolitas' })
            .eq('id', extra.id)
        }
        const patch: Record<string, unknown> = {}
        if (target.tipus !== d.parkapcsolat) patch.tipus = d.parkapcsolat
        // A meglévő (pl. anyakönyvből származó) dátumot csak akkor írjuk felül,
        // ha a felületen tényleg megadtak egyet.
        if (datum && target.ervenyes_tol !== datum) patch.ervenyes_tol = datum
        if (Object.keys(patch).length > 0) {
          const { error } = await supabase.from('szemely_kapcsolat').update(patch).eq('id', target.id)
          if (error) throw new Error(error.message)
        }
      } else {
        const { error } = await supabase.from('szemely_kapcsolat').insert([{
          id_szemely_1: d.id_ferfi,
          id_szemely_2: d.id_no,
          tipus: d.parkapcsolat,
          ver_szerinti: false,
          ervenyes_tol: datum,
          congregation_id: congregationId,
          megjegyzes: 'haztartas-sync',
        }])
        if (error) throw new Error(error.message)
      }
    } catch (e) {
      console.warn('[saveFamily] párkapcsolat-jelölés sikertelen (nem blokkoló):',
        e instanceof Error ? e.message : e)
      syncWarning = (syncWarning ? syncWarning + ' ' : '')
        + 'A párkapcsolat jellegét (házastárs/élettárs) nem sikerült elmenteni — próbáld újra.'
    }
  }

  // 2026-08-02 (PR-20): a szerkesztéssel ELTÁVOLÍTOTT tagok sync-eredetű
  // rokonsági éleit lezárjuk — a CSALÁDFA így követi a szerkesztést (user-
  // észrevétel: „szerkesztettem a családokat, de a családfák nem frissültek").
  // A kereszteléses/szülő-választásos vér szerinti élek érintetlenek; az
  // Áthelyezés útvonal nem zár (ott a rokonság megmarad); visszatételkor a
  // sync újranyitja a lezárt élt.
  try {
    const closePairs: Array<{ id1: number; id2: number; tipus: 'szulo_gyermek' | 'hazastars' }> = []
    const nextAdults = new Set([d.id_ferfi, d.id_no].filter(Boolean) as number[])
    // a) eltávolított GYERMEK: a korábbi pár mindkét tagjához fűző él zárul
    for (const childId of removedChildIds) {
      if (prevFerfi) closePairs.push({ id1: prevFerfi, id2: childId, tipus: 'szulo_gyermek' })
      if (prevNo) closePairs.push({ id1: prevNo, id2: childId, tipus: 'szulo_gyermek' })
    }
    // b) lecserélt FELNŐTT (review D3): aki kikerült a párból, annak a
    //    megmaradt gyermekekhez fűző sync-élei is zárulnak — különben a fa
    //    a régi ÉS az új szülőt is mutatná
    const keptChildIds = prevChildIds.filter((id) => d.gyerekIds.includes(id))
    for (const removedAdult of [prevFerfi, prevNo]) {
      if (removedAdult && !nextAdults.has(removedAdult)) {
        for (const childId of keptChildIds) {
          closePairs.push({ id1: removedAdult, id2: childId, tipus: 'szulo_gyermek' })
        }
      }
    }
    // c) megváltozott pár: a régi házastársi él zárul — de csak ha tényleg
    //    más a páros (halmaz-összevetés: az esetleges slot-csere nem zárás)
    if (prevFerfi && prevNo && !(nextAdults.has(prevFerfi) && nextAdults.has(prevNo))) {
      closePairs.push({ id1: prevFerfi, id2: prevNo, tipus: 'hazastars' })
    }
    await closeSyncKinshipEdges(supabase, congregationId, closePairs)
  } catch (e) {
    console.warn('[saveFamily] rokonsági él-lezárás sikertelen (nem blokkoló):',
      e instanceof Error ? e.message : e)
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
  // 2026-08-04 (PR-34): a PostgREST szűrő-szintaxist törő karakterek kiszűrése
  // (vessző/zárójel/idézőjel/backslash) — enélkül egy „Kovács, Béla" alakú
  // beírás PARSE-hibát adott, ami NÉMÁN üres listaként jelent meg.
  const sanitize = (v: string) => v.replace(/[,()"\%]/g, ' ').trim()
  const parts = query.trim().split(/\s+/).map(sanitize).filter(Boolean)
  if (parts.length === 0) return []

  let q = supabase.from('szemely')
    .select('id, csaladnev, k_nev, ferfi, sz_datum, c_szam, c_utcaid, c_helysegid, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name, adrlocality!localityid(name))')
    .eq('congregation_id', congregationId).eq('isvisible', true).eq('meghalt', false)

  if (role === 'ferfi') q = q.eq('ferfi', true)
  else if (role === 'no') q = q.eq('ferfi', false)

  if (parts.length === 1) q = q.or(`csaladnev.ilike.%${parts[0]}%,k_nev.ilike.%${parts[0]}%`)
  else q = q.ilike('csaladnev', `%${parts[0]}%`).ilike('k_nev', `%${parts.slice(1).join(' ')}%`)

  // A limit a szűrés ELŐTT hat, ezért tágabb merítés kell (a házas-szűrés után
  // maradó találatokat a hívó úgyis 10-ig mutatja).
  const { data: membersRaw, error: membersError } = await q.limit(30)
  // FAIL-LOUD: az elnyelt hiba eddig „nincs találat"-nak látszott — ez az egyik
  // forrása volt a bejelentett „eltűnik, amit keresek" tünetnek.
  if (membersError) throw new Error(`A tag-keresés nem sikerült: ${membersError.message}`)
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
  // 2026-08-04 (PR-34): eddig az ÖSSZES aktív családot behúztuk limit nélkül —
  // a PostgREST 1000-soros plafonja némán levágta, így a „házas" és a „máshol
  // felnőtt" halmaz hiányos lett (dupla tagságot engedett át). Most csak az
  // érintett személyek családjait kérdezzük le, plusz a szerkesztett családot.
  // 2026-08-04 (PR-44): a LEZÁRT kartonok is jönnek. A három egyediségi index
  // (csalad_id_ferfi_idx / csalad_id_no_idx) a lezárt kartonokra IS érvényes,
  // ezért a rajtuk férjként/feleségként ragadt személy kiválasztása eddig nyers
  // „duplicate key" hibába futott. A szűrőt nem lazítjuk (a lezárt kartonos
  // személy továbbra sem választható), de MEGMONDJUK, miért — és mi a teendő.
  const talalatIds = members.map((m) => m.id as number)
  const [relFamRes, editFamRes] = await Promise.all([
    talalatIds.length > 0
      ? supabase.from('csalad').select('id, id_ferfi, id_no, isaktiv')
          .or(`id_ferfi.in.(${talalatIds.join(',')}),id_no.in.(${talalatIds.join(',')})`)
      : Promise.resolve({ data: [], error: null }),
    editFamilyId !== undefined
      ? supabase.from('csalad').select('id, id_ferfi, id_no, isaktiv').eq('id', editFamilyId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (relFamRes.error) throw new Error(`A családtagsági ellenőrzés nem sikerült: ${relFamRes.error.message}`)
  type CsaladSor = { id: number; id_ferfi: number | null; id_no: number | null; isaktiv: boolean | null }
  const allFamilies: CsaladSor[] = [
    ...((relFamRes.data || []) as CsaladSor[]),
    ...(editFamRes.data ? [editFamRes.data as CsaladSor] : []),
  ]
  const marriedIds = new Set<number>()
  const anyAdultIds = new Set<number>()
  const currentFamilyMemberIds = new Set<number>()
  /** Aki egy LEZÁRT kartonon foglalja a férj/feleség helyet — az index miatt
   *  ő sem választható, de eddig ezt csak a mentés hibája árulta el. */
  const lezartKartonIds = new Set<number>()
  ;(allFamilies || []).forEach((f: CsaladSor) => {
    const aktiv = f.isaktiv !== false
    if (!aktiv) {
      if (role === 'ferfi' && f.id_ferfi) lezartKartonIds.add(f.id_ferfi)
      if (role === 'no' && f.id_no) lezartKartonIds.add(f.id_no)
      // A lezárt karton NEM számít aktív tagságnak — a régi viselkedést
      // (marriedIds / anyAdultIds csak aktív kartonokból) megőrizzük.
      if (!(editFamilyId !== undefined && f.id === editFamilyId)) return
    }
    if (aktiv) {
      if (role === 'ferfi' && f.id_ferfi) marriedIds.add(f.id_ferfi)
      if (role === 'no' && f.id_no) marriedIds.add(f.id_no)
      if (f.id_ferfi) anyAdultIds.add(f.id_ferfi)
      if (f.id_no) anyAdultIds.add(f.id_no)
    }
    if (editFamilyId !== undefined && f.id === editFamilyId) {
      if (f.id_ferfi) currentFamilyMemberIds.add(f.id_ferfi)
      if (f.id_no) currentFamilyMemberIds.add(f.id_no)
    }
  })

  // 2026-08-04 (PR-32): a máshol FELNŐTT (saját családot alapított) személyt
  // eddig teljesen ELREJTETTÜK a gyermek-keresőből — így a lelkész a felnőtt
  // gyermekét sehogy nem tudta a szülei kartonjához kapcsolni. Most megjelenik,
  // `felnottMashol` jelöléssel: kiválasztva CSAK a rokoni kapcsolat (családfa)
  // jön létre, a háztartáshoz NEM adjuk hozzá — az „egy aktív háztartás"
  // szabály (a járulék-számítás alapja) így sértetlen marad.
  const filtered = role === 'gyerek'
    ? members
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
    const felnottMashol = role === 'gyerek' && anyAdultIds.has(m.id as number)
    const other = (memberships.get(m.id as number) ?? []).find(
      (ms) => allowedForBadge.has(ms.familyId) && (editFamilyId === undefined || ms.familyId !== editFamilyId),
    )
    return {
      ...m,
      felnottMashol,
      /** 2026-08-04 (PR-44): lezárt kartonon foglalja a férj/feleség helyet */
      lezartKartonon: lezartKartonIds.has(m.id as number) && !currentFamilyMemberIds.has(m.id as number),
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
  // 2026-08-02 (PR-21): a törlés ELŐTT megjegyezzük az érintetteket, hogy a
  // tagság-eredetű rokonsági éleiket az egyeztető lezárhassa (eddig a törölt
  // család házaspár/szülő-gyerek élei örökre aktívak maradtak a családfán).
  const [delFamRes, delGyerekRes] = await Promise.all([
    supabase.from('csalad').select('id_ferfi, id_no').eq('id', id).maybeSingle(),
    supabase.from('gyerek').select('id_szemely').eq('id_csalad', id),
  ])
  if (delFamRes.error || delGyerekRes.error) {
    // A törlés elsődleges — de a kimaradó egyeztetés ne legyen néma
    console.warn('[deleteFamily] érintettek kiolvasása sikertelen — a rokonsági egyeztetés kimarad:',
      delFamRes.error?.message || delGyerekRes.error?.message)
  }
  const delFam = delFamRes.data as { id_ferfi: number | null; id_no: number | null } | null
  const affectedIds = [
    ...([delFam?.id_ferfi, delFam?.id_no].filter(Boolean) as number[]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(((delGyerekRes.data || []) as any[]).map((g) => g.id_szemely as number)),
  ]
  await supabase.from('gyerek').delete().eq('id_csalad', id)
  const { error } = await supabase.from('csalad').delete().eq('id', id)
  if (error) return { error: `Hiba: ${error.message}` }

  try {
    await reconcileKinshipForPersons(supabase, congregationId, affectedIds)
  } catch (e) {
    console.warn('[deleteFamily] rokonsági egyeztetés sikertelen (nem blokkoló):',
      e instanceof Error ? e.message : e)
  }

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

// ── VÁLÁS / kapcsolat felbontása (2026-08-04, PR-44) ────────
//
// A válás életesemény, nem adatjavítás. Amit a rendszer csinál:
//   1. lezárja a pár kapcsolatát a válás napjával (a családfán „elvált"),
//   2. MEGVÉDI a gyermekek vér szerinti szülő-kapcsolatát MINDKÉT szülővel,
//   3. lezárja a távozó fél háztartás-tagságát,
//   4. felszabadítja a helyét a családi kartonon (így ÚJRAHÁZASODHAT),
//   5. (házasságnál) mindkét félre ráírja az „elvált" családi állapotot.
//
// Amit SOHA nem csinál: nem töröl és nem ír át EGYETLEN befizetést sem, nem
// törli és nem zárja le a családi kartont.

/**
 * A KARTONHOZ (és nem személyhez) könyvelt, élő befizetések összesítése —
 * LAPOZVA, mert a PostgREST 1000-soros plafonja némán levágná a listát, és a
 * lelkész a valóságosnál kevesebb tételt látna a figyelmeztető dobozban.
 * Hibánál DOB (fail-closed) — a hívó `error`-ré alakítja.
 */
async function countFamilyOnlyPayments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  congregationId: string,
  familyId: number,
): Promise<{ db: number; osszeg: number; evek: number[]; csonkolt: boolean }> {
  // 2026-08-11 (5. kör, P3 #15): KÖZÖS `selectAllPaged` a kézi ciklus helyett.
  // KÉT baja volt a réginek, és a második súlyosabb: (1) a `list.length < PAGE`
  // stop-feltétel, (2) a FIX lépésköz (`page * PAGE`). Ha a Supabase „Max Rows"
  // 1000 alá kerül (mondjuk 500-ra), az első lap 0–499-et hoz, a második viszont
  // az 1000–1999 ablakot kéri — az 500–999 közti befizetések ÁTUGRANAK. A helper
  // a TÉNYLEGESEN kapott sorszámmal lép, így ez nem fordulhat elő.
  // A `csonkolt` jelző megmarad: a `maxRows` szelepnél a helper `truncated`-et ad.
  const MAX_ROWS = 20_000
  const res = await selectAllPaged<{ osszeg: number | null; fizetettev: number | null }>(
    supabase
      .from('befizetes')
      .select('osszeg, fizetettev')
      .eq('congregation_id', congregationId)
      .eq('id_csalad', familyId)
      .is('id_szemely', null)
      .eq('deleted', false)
      .eq('stornozott', false),
    { maxRows: MAX_ROWS },
  )
  // A `truncated` NEM hiba (a régi kód is csak jelzett) — minden MÁS hiba dob.
  if (res.error && !res.truncated) throw new Error(res.error.message)

  let db = 0
  let osszeg = 0
  const evek = new Set<number>()
  for (const r of res.data) {
    db += 1
    osszeg += Number(r.osszeg || 0)
    const ev = Number(r.fizetettev)
    if (Number.isFinite(ev) && ev > 0) evek.add(ev)
  }
  return { db, osszeg, evek: [...evek].sort((a, b) => a - b), csonkolt: res.truncated }
}

/** A nyers Postgres-hibaüzenetet lelkész-barát mondattá fordítja. */
function humanizeFamilyRpcError(
  raw: string | null | undefined,
  names: { ferfi?: string | null; no?: string | null },
): string {
  const msg = (raw ?? '').toString()
  const lower = msg.toLowerCase()
  const ferfiUtkozes = lower.includes('csalad_id_ferfi_idx')
  const noUtkozes = lower.includes('csalad_id_no_idx')
  if (ferfiUtkozes || noUtkozes || lower.includes('duplicate key')) {
    const nev = ferfiUtkozes ? (names.ferfi || 'A férj') : noUtkozes ? (names.no || 'A feleség') : 'A kiválasztott személy'
    const szerep = ferfiUtkozes ? 'férjként' : noUtkozes ? 'feleségként' : 'felnőtt tagként'
    return `${nev} már szerepel egy másik családi kartonon ${szerep}. A nyilvántartásban egy személy csak EGY kartonon lehet felnőtt — akkor is, ha az a karton már le van zárva. Rögzítsd előbb a válást a másik kartonon, vagy vedd le róla a felnőtt tagok közül.`
  }
  return msg || 'A művelet nem sikerült.'
}

/**
 * A dialógus előszámlálása: mennyi CSALÁDI befizetés van a kartonon (ezek a
 * válás után a maradó fél és a gyermekek járulék-jóváírásában számítanak), és
 * milyen kapcsolat áll fenn a pár között. Az adat a figyelmeztető dobozba megy.
 *
 * FAIL-CLOSED: bármelyik olvasás hibája `error`-t ad — a felület ilyenkor
 * letiltja a mentést (a néma üres lista a projekt ismert hibaosztálya).
 */
export async function getDivorceImpact(familyId: number): Promise<{
  error?: string
  /** 'hazastars' | 'elettars' | null (nincs rögzített kapcsolat) */
  partnership?: 'hazastars' | 'elettars' | null
  /** A pár-él kezdete — a válás dátuma ennél korábbi nem lehet */
  parKezdet?: string | null
  /** Tisztán CSALÁDI (személyhez nem kötött) befizetések */
  penzugy?: { db: number; osszeg: number; evek: number[]; csonkolt: boolean }
  /** A két fél saját lakcíme — az új karton előtöltéséhez */
  cimek?: Record<number, { utca: string | null; c_utcaid: number | null; c_szam: string | null }>
}> {
  if (!Number.isInteger(familyId) || familyId <= 0) return { error: 'Érvénytelen családazonosító.' }
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  let allowedFamilyIds: Set<number>
  try {
    allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId, { throwOnError: true })
  } catch (e) {
    console.warn('[getDivorceImpact] getAllowedFamilyIds sikertelen:', e instanceof Error ? e.message : e)
    return { error: 'A családi kartonok jogosultság-ellenőrzése nem sikerült — próbáld újra.' }
  }
  if (!allowedFamilyIds.has(familyId)) return { error: 'Nincs jogosultsága ehhez a családi kartonhoz.' }

  const { data: family, error: familyErr } = await supabase
    .from('csalad')
    .select('id, id_ferfi, id_no')
    .eq('id', familyId)
    .maybeSingle()
  if (familyErr) return { error: `A családi karton lekérdezése nem sikerült (${familyErr.message}) — próbáld újra.` }
  if (!family) return { error: 'A családi karton nem található.' }

  const ferfiId = (family.id_ferfi as number | null) ?? null
  const noId = (family.id_no as number | null) ?? null

  // 1) Párkapcsolat jellege + kezdete (az aktív élből)
  let partnership: 'hazastars' | 'elettars' | null = null
  let parKezdet: string | null = null
  if (ferfiId && noId) {
    const { data: parRows, error: parErr } = await supabase
      .from('szemely_kapcsolat')
      .select('tipus, ervenyes_tol')
      .eq('congregation_id', congregationId)
      .in('tipus', ['hazastars', 'elettars'])
      .is('ervenyes_ig', null)
      .or(`and(id_szemely_1.eq.${ferfiId},id_szemely_2.eq.${noId}),and(id_szemely_1.eq.${noId},id_szemely_2.eq.${ferfiId})`)
      .order('megjegyzes', { nullsFirst: true })
      .order('id')
      .limit(1)
    if (parErr) return { error: `A pár kapcsolatának lekérdezése nem sikerült (${parErr.message}) — próbáld újra.` }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = ((parRows || []) as any[])[0]
    partnership = (row?.tipus as 'hazastars' | 'elettars' | undefined) ?? null
    parKezdet = (row?.ervenyes_tol as string | null | undefined) ?? null
  }

  // 2) Tisztán CSALÁDI befizetések (fail-closed)
  let penzugy: { db: number; osszeg: number; evek: number[]; csonkolt: boolean }
  try {
    penzugy = await countFamilyOnlyPayments(supabase, congregationId, familyId)
  } catch (e) {
    return {
      error: `A karton befizetéseinek összesítése nem sikerült (${e instanceof Error ? e.message : 'ismeretlen hiba'}), ezért a válást biztonságból nem indítjuk el — próbáld újra.`,
    }
  }

  // 3) A két fél saját lakcíme (az új karton előtöltéséhez)
  const cimek: Record<number, { utca: string | null; c_utcaid: number | null; c_szam: string | null }> = {}
  const adultIds = [ferfiId, noId].filter((v): v is number => v != null)
  if (adultIds.length > 0) {
    const { data: personRows, error: personErr } = await supabase
      .from('szemely')
      .select('id, c_utcaid, c_szam, adrstreet:adrstreet!c_utcaid(name)')
      .eq('congregation_id', congregationId)
      .in('id', adultIds)
    if (personErr) return { error: `A felek lakcímének lekérdezése nem sikerült (${personErr.message}) — próbáld újra.` }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (personRows || []) as any[]) {
      const utca = Array.isArray(p.adrstreet) ? p.adrstreet[0] : p.adrstreet
      cimek[p.id as number] = {
        utca: (utca?.name as string | null | undefined) ?? null,
        c_utcaid: (p.c_utcaid as number | null) ?? null,
        c_szam: (p.c_szam as string | null) ?? null,
      }
    }
  }

  return { partnership, parKezdet, penzugy, cimek }
}

export interface FormerPartner {
  id: number
  name: string
  /** A kapcsolat lezárásának napja */
  datum: string | null
  /** 'valas' = válás, 'elhunyt' = a másik fél elhunyt */
  ok: 'valas' | 'elhunyt'
  /** 'hazastars' | 'elettars' */
  tipus: string
  /** A volt házastárs jelenlegi (aktív) családi kartonja, ha van */
  csaladId: number | null
}

/**
 * KORÁBBI HÁZASTÁRS(AK) egy személyhez — a személyi karton „Családi háttér"
 * paneljébe. A LEZÁRT pár-élekből olvas.
 *
 * Csak ÉLETESEMÉNY jelenik meg: válás ('valas' jelölő) vagy a másik fél
 * elhunyta. Az adatjavításból származó lezárások (pl.
 * 'csalad-szerkesztes-eltavolitas') SZÁNDÉKOSAN kimaradnak — különben a régi
 * szinkron-zárások zajként öntenék el a kartont.
 */
export async function getFormerPartners(memberId: number): Promise<FormerPartner[]> {
  if (!Number.isInteger(memberId) || memberId <= 0) return []
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return []

  const { data: edges, error: edgeErr } = await supabase
    .from('szemely_kapcsolat')
    .select('id_szemely_1, id_szemely_2, tipus, ervenyes_ig, megjegyzes')
    .eq('congregation_id', congregationId)
    .in('tipus', ['hazastars', 'elettars'])
    .not('ervenyes_ig', 'is', null)
    .or(`id_szemely_1.eq.${memberId},id_szemely_2.eq.${memberId}`)
    .order('ervenyes_ig', { ascending: false })
    .limit(20)
  if (edgeErr) {
    console.warn('[getFormerPartners] a lezárt pár-élek olvasása sikertelen:', edgeErr.message)
    return []
  }
  interface EdgeRow { id_szemely_1: number; id_szemely_2: number; tipus: string; ervenyes_ig: string | null; megjegyzes: string | null }
  const rows = (edges || []) as EdgeRow[]
  if (rows.length === 0) return []

  const otherIds = [...new Set(rows.map((r) => (r.id_szemely_1 === memberId ? r.id_szemely_2 : r.id_szemely_1)))]
  const [{ data: persons, error: personErr }, { data: families }] = await Promise.all([
    supabase
      .from('szemely')
      .select('id, csaladnev, k_nev, meghalt')
      .eq('congregation_id', congregationId)
      .in('id', otherIds),
    supabase
      .from('csalad')
      .select('id, id_ferfi, id_no')
      .eq('isaktiv', true)
      .or(`id_ferfi.in.(${otherIds.join(',')}),id_no.in.(${otherIds.join(',')})`),
  ])
  if (personErr) {
    console.warn('[getFormerPartners] a volt házastársak lekérdezése sikertelen:', personErr.message)
    return []
  }
  interface PersonRow { id: number; csaladnev: string | null; k_nev: string | null; meghalt: boolean | null }
  const byId = new Map<number, PersonRow>(((persons || []) as PersonRow[]).map((p) => [p.id, p]))
  const csaladByPerson = new Map<number, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const f of (families || []) as any[]) {
    for (const pid of [f.id_ferfi, f.id_no]) {
      if (pid != null && otherIds.includes(pid as number)) csaladByPerson.set(pid as number, f.id as number)
    }
  }

  const result: FormerPartner[] = []
  const seen = new Set<number>()
  for (const r of rows) {
    const otherId = r.id_szemely_1 === memberId ? r.id_szemely_2 : r.id_szemely_1
    const person = byId.get(otherId)
    if (!person) continue // más gyülekezet tagja / RLS-rejtett — nem mutatjuk
    const valas = (r.megjegyzes ?? '') === DIVORCE_EDGE_MARKER
    const elhunyt = person.meghalt === true
    if (!valas && !elhunyt) continue // adatjavítás-eredetű zárás — nem életesemény
    if (seen.has(otherId)) continue
    seen.add(otherId)
    result.push({
      id: otherId,
      name: `${person.csaladnev ?? ''} ${person.k_nev ?? ''}`.trim() || `#${otherId}`,
      datum: r.ervenyes_ig,
      ok: valas ? 'valas' : 'elhunyt',
      tipus: r.tipus,
      csaladId: csaladByPerson.get(otherId) ?? null,
    })
  }
  return result
}

export interface RecordDivorceResult {
  success?: boolean
  error?: string
  warning?: string
  message?: string
  /** A távozó félnek létrehozott új, egyszemélyes karton id-ja (ha kérték) */
  ujFamilyId?: number
}

/**
 * VÁLÁS RÖGZÍTÉSE — a lépések sorrendje KÖTÖTT (lásd a szekció fejlécét).
 *
 * A `saveFamily`-t SZÁNDÉKOSAN NEM hívjuk: annak `closeSyncKinshipEdges` ága a
 * kikerült felnőtt × megmaradt gyermek éleit is lezárná, azaz elvágná a
 * gyermekek vér szerinti szülő-kapcsolatát. Helyette közvetlenül a kanonikus
 * mentő RPC-t hívjuk (az NULL-t tud írni az id_ferfi/id_no mezőbe, így
 * felszabadul az egyediségi index helye → a távozó fél újraházasodhat).
 */
export async function recordDivorce(input: DivorceInput): Promise<RecordDivorceResult> {
  const parsed = divorceSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data

  const { supabase, congregationId, userId } = await getFamilyAccessContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  // ── 0. lépés — FAIL-CLOSED előellenőrzések ───────────────────────────────
  let allowedFamilyIds: Set<number>
  try {
    allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId, { throwOnError: true })
  } catch (e) {
    console.warn('[recordDivorce] getAllowedFamilyIds sikertelen:', e instanceof Error ? e.message : e)
    return { error: 'A családi kartonok jogosultság-ellenőrzése nem sikerült — próbáld újra.' }
  }
  if (!allowedFamilyIds.has(d.familyId)) return { error: 'Nincs jogosultsága ehhez a családi kartonhoz.' }

  const [famRes, gyerekRes] = await Promise.all([
    supabase.from('csalad').select('id, id_ferfi, id_no, c_utcaid, c_szam, id_csoport, isaktiv').eq('id', d.familyId).maybeSingle(),
    supabase.from('gyerek').select('id_szemely').eq('id_csalad', d.familyId),
  ])
  if (famRes.error) return { error: `A családi karton lekérdezése nem sikerült (${famRes.error.message}) — próbáld újra.` }
  if (gyerekRes.error) {
    // A mentő RPC a gyerek-sorokat TÖRLI és újraírja — egy elnyelt olvasási
    // hiba az összes gyermeket levinné a kartonról.
    return { error: `A karton gyermeklistája nem olvasható (${gyerekRes.error.message}), ezért biztonságból semmit nem módosítottunk — próbáld újra.` }
  }
  const csalad = famRes.data
  if (!csalad) return { error: 'A családi karton nem található.' }
  if (csalad.isaktiv === false) {
    return { error: 'Ez a családi karton már le van zárva, ezért válás nem rögzíthető rajta. Nyisd meg a Családok fülön, és ellenőrizd.' }
  }

  const ferfiId = (csalad.id_ferfi as number | null) ?? null
  const noId = (csalad.id_no as number | null) ?? null
  if (!ferfiId || !noId) {
    return { error: 'Ehhez a kartonhoz csak egy felnőtt tartozik — válás nem rögzíthető. (Ha a másik fél hiányzik, előbb a családi karton szerkesztőjében vedd fel.)' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevGyerekIds = [...new Set(((gyerekRes.data || []) as any[]).map((g) => g.id_szemely as number))]
    .filter((id) => id !== ferfiId && id !== noId)

  const { data: adultRows, error: adultErr } = await supabase
    .from('szemely')
    .select('id, csaladnev, k_nev, meghalt, allapot, congregation_id')
    .in('id', [ferfiId, noId])
  if (adultErr) return { error: `A felek adatainak lekérdezése nem sikerült (${adultErr.message}) — próbáld újra.` }
  interface AdultRow { id: number; csaladnev: string | null; k_nev: string | null; meghalt: boolean | null; allapot: string | null; congregation_id: string | null }
  const adultById = new Map<number, AdultRow>(((adultRows || []) as AdultRow[]).map((p) => [p.id, p]))
  const ferfi = adultById.get(ferfiId)
  const no = adultById.get(noId)
  if (!ferfi || !no) return { error: 'A karton valamelyik felének adatai nem olvashatók — biztonságból nem módosítottunk semmit.' }
  if (ferfi.congregation_id !== congregationId || no.congregation_id !== congregationId) {
    return { error: 'A karton felei nem az aktuális gyülekezet tagjai — a válást ott kell rögzíteni, ahol a tagságuk van.' }
  }
  if (ferfi.meghalt === true || no.meghalt === true) {
    return { error: 'Elhunyt házastárs esetén nem válást kell rögzíteni: használd az Anyakönyv → Temetés, vagy a Tag kivezetése → Elhunyt útvonalat. Az a kapcsolatot magától lezárja.' }
  }

  const nameOf = (p: AdultRow) => `${p.csaladnev ?? ''} ${p.k_nev ?? ''}`.trim() || `#${p.id}`
  const ferfiNev = nameOf(ferfi)
  const noNev = nameOf(no)

  // A pár AKTÍV kapcsolata — a típusból dől el, jár-e az „elvált" jelző, a
  // kezdete pedig a dátum alsó korlátja.
  const { data: parRows, error: parErr } = await supabase
    .from('szemely_kapcsolat')
    .select('tipus, ervenyes_tol')
    .eq('congregation_id', congregationId)
    .in('tipus', ['hazastars', 'elettars'])
    .is('ervenyes_ig', null)
    .or(`and(id_szemely_1.eq.${ferfiId},id_szemely_2.eq.${noId}),and(id_szemely_1.eq.${noId},id_szemely_2.eq.${ferfiId})`)
    .order('megjegyzes', { nullsFirst: true })
    .order('id')
  if (parErr) return { error: `A pár kapcsolatának lekérdezése nem sikerült (${parErr.message}) — próbáld újra.` }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parList = (parRows || []) as any[]
  const partnership = (parList[0]?.tipus as 'hazastars' | 'elettars' | undefined) ?? null
  const parKezdet = parList
    .map((r) => (r.ervenyes_tol as string | null) ?? null)
    .filter((v): v is string => !!v)
    .sort()[0] ?? null
  if (parKezdet && d.datum < parKezdet) {
    return { error: `A válás dátuma (${d.datum}) nem lehet korábbi, mint a kapcsolat kezdete (${parKezdet}).` }
  }

  // A pénzügyi előszámlálás olvasási hibája is BLOKKOL (fail-closed) — a
  // lelkész csak akkor dönthet, ha a hatás számokkal is látszik.
  let penzugy: { db: number; osszeg: number; evek: number[]; csonkolt: boolean }
  try {
    penzugy = await countFamilyOnlyPayments(supabase, congregationId, d.familyId)
  } catch (e) {
    return {
      error: `A karton befizetéseinek összesítése nem sikerült (${e instanceof Error ? e.message : 'ismeretlen hiba'}), ezért a válást biztonságból nem rögzítettük — próbáld újra.`,
    }
  }

  // A karton HÁZTARTÁSA — a 3. lépéshez, és a védendő gyermekek halmazához
  // (a kartonon lehet olyan gyermek, aki csak a háztartás-tagok közt szerepel).
  const { data: haztRows, error: haztErr } = await supabase
    .from('haztartas')
    .select('id')
    .eq('congregation_id', congregationId)
    .eq('legacy_csalad_id', d.familyId)
    .is('ervenyes_ig', null)
  if (haztErr) {
    return { error: `A háztartás lekérdezése nem sikerült (${haztErr.message}) — biztonságból semmit nem módosítottunk. Próbáld újra.` }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const haztartasIds = ((haztRows || []) as any[]).map((h) => h.id as string)
  const vedendoGyermekIds = new Set<number>(prevGyerekIds)
  if (haztartasIds.length > 0) {
    const { data: tagRows, error: tagReadErr } = await supabase
      .from('haztartas_tag')
      .select('id_szemely')
      .in('id_haztartas', haztartasIds)
      .in('szerep', ['gyermek', 'unoka'])
      .is('ervenyes_ig', null)
    if (tagReadErr) {
      return { error: `A háztartás tagjainak lekérdezése nem sikerült (${tagReadErr.message}) — biztonságból semmit nem módosítottunk. Próbáld újra.` }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (tagRows || []) as any[]) {
      const pid = t.id_szemely as number
      if (pid !== ferfiId && pid !== noId) vedendoGyermekIds.add(pid)
    }
  }

  const tavozoId = d.marad === 'ferfi' ? noId : ferfiId
  const maradoId = d.marad === 'ferfi' ? ferfiId : noId
  const tavozoNev = d.marad === 'ferfi' ? noNev : ferfiNev
  const maradoNev = d.marad === 'ferfi' ? ferfiNev : noNev
  const tavozoFerfi = tavozoId === ferfiId

  // ── 1. lépés — a PÁR-ÉL lezárása a válás dátumával (hazastars ÉS elettars) ─
  try {
    await closePartnershipForDivorce(supabase, congregationId, ferfiId, noId, d.datum)
  } catch (e) {
    return {
      error: `A pár kapcsolatának lezárása nem sikerült (${e instanceof Error ? e.message : 'ismeretlen hiba'}) — a válást nem rögzítettük. Próbáld újra.`,
    }
  }

  // ── 2. lépés — a GYERMEK-ÉLEK MEGVÉDÉSE (P0) ─────────────────────────────
  try {
    await protectParentEdgesAfterDivorce(supabase, congregationId, tavozoId, [...vedendoGyermekIds])
  } catch (e) {
    return {
      error: `A gyermekek szülő-kapcsolatának védelme nem sikerült (${e instanceof Error ? e.message : 'ismeretlen hiba'}), ezért a válás rögzítését megszakítottuk. A pár kapcsolata már lezárult — indítsd újra a rögzítést ugyanezzel a dátummal.`,
    }
  }

  // ── 3. lépés — a TÁVOZÓ fél háztartás-tagságának lezárása ────────────────
  // Ez KÖTELEZŐEN a 4. lépés ELŐTT van: (a) a háztartás-szinkron a MAI nappal
  // zárna, nem a válás napjával; (b) ha a távozó új kartont kap, két nyitott
  // háztartás-tagsága lenne, amitől a járulék-számítás nemdeterminisztikussá
  // válik („egy aktív háztartás" invariáns).
  if (haztartasIds.length > 0) {
    const { error: tagErr } = await supabase
      .from('haztartas_tag')
      .update({ ervenyes_ig: d.datum })
      .in('id_haztartas', haztartasIds)
      .eq('id_szemely', tavozoId)
      .is('ervenyes_ig', null)
    if (tagErr) {
      return { error: `${tavozoNev} háztartás-tagságának lezárása nem sikerült (${tagErr.message}) — a válás rögzítését megszakítottuk. Próbáld újra.` }
    }
  }

  // ── 4/a. lépés — a HELY FELSZABADÍTÁSA a meglévő kartonon ────────────────
  // Az RPC az id_ferfi/id_no mezőt COALESCE NÉLKÜL írja, tehát a NULL átmegy.
  // A körzetet viszont FELTÉTEL NÉLKÜL felülírja, a gyerek-sorokat pedig
  // törli+újraírja → mindkettőt kötelező átadni.
  const { data: rpcData, error: rpcErr } = await supabase.rpc('tagnyilvantartas_csalad_mentes', {
    p_id: d.familyId,
    p_id_ferfi: d.marad === 'ferfi' ? ferfiId : null,
    p_id_no: d.marad === 'no' ? noId : null,
    p_gyerek_ids: prevGyerekIds,
    p_c_utcaid: null,
    p_c_szam: null,
    p_id_csoport: (csalad.id_csoport as number | null) ?? null,
  })
  if (rpcErr) {
    return { error: `A karton frissítése nem sikerült: ${humanizeFamilyRpcError(rpcErr.message, { ferfi: ferfiNev, no: noNev })}` }
  }
  const rpcRes = rpcData as { status?: string; family_id?: number; message?: string } | null
  if (rpcRes?.status === 'forbidden') {
    return { error: 'Nincs jogosultsága ennek a családi kartonnak a szerkesztéséhez (jelentkezz be újra, vagy válts profilt a fejlécben).' }
  }
  if (rpcRes?.status !== 'ok' || !rpcRes.family_id) {
    return { error: `A karton frissítése nem sikerült: ${humanizeFamilyRpcError(rpcRes?.message, { ferfi: ferfiNev, no: noNev })}` }
  }

  const warnings: string[] = []

  // ── 4/b. lépés — ÚJ, egyszemélyes karton a távozónak (csak ha kérték) ─────
  let ujFamilyId: number | undefined
  if (d.ujKartonATavozonak) {
    const { data: ujData, error: ujErr } = await supabase.rpc('tagnyilvantartas_csalad_mentes', {
      p_id: null,
      p_id_ferfi: tavozoFerfi ? tavozoId : null,
      p_id_no: tavozoFerfi ? null : tavozoId,
      p_gyerek_ids: [],
      // A csalad.c_utcaid NOT NULL — ha a távozó fél utcája nem olvasható,
      // az eredeti karton utcája a tartalék (a lelkész utólag átírhatja).
      p_c_utcaid: d.ujKarton?.c_utcaid ?? (csalad.c_utcaid as number | null) ?? null,
      p_c_szam: d.ujKarton?.c_szam?.trim() || null,
      p_id_csoport: (csalad.id_csoport as number | null) ?? null,
    })
    const ujRes = ujData as { status?: string; family_id?: number; message?: string } | null
    if (ujErr || ujRes?.status !== 'ok' || !ujRes.family_id) {
      warnings.push(
        `A válás rögzült, de ${tavozoNev} új családi kartonja nem jött létre (${humanizeFamilyRpcError(ujErr?.message ?? ujRes?.message, { ferfi: ferfiNev, no: noNev })}). A Családok fülön az „Új család" gombbal pótolható.`,
      )
    } else {
      ujFamilyId = ujRes.family_id
      try {
        await syncHouseholdFromCsalad(supabase, ujFamilyId, congregationId)
      } catch (e) {
        console.warn('[recordDivorce] az új karton háztartás-szinkronja sikertelen:', e instanceof Error ? e.message : e)
        warnings.push(`${tavozoNev} új kartonja létrejött, de a háztartás-nézet szinkronizálása nem sikerült — nyisd meg a kartont, és mentsd el egyszer.`)
      }
    }
  }

  // ── 4/c. lépés — a meglévő karton háztartás-szinkronja (best-effort) ─────
  try {
    await syncHouseholdFromCsalad(supabase, d.familyId, congregationId, [tavozoId])
  } catch (e) {
    console.warn('[recordDivorce] syncHouseholdFromCsalad sikertelen:', e instanceof Error ? e.message : e)
    warnings.push('A válás rögzült, de a háztartás-nézet szinkronizálása nem sikerült — nyisd meg a családi kartont, és mentsd el újra.')
  }

  // ── 5. lépés — az „elvált" családi állapot (best-effort) ─────────────────
  // A jelölő PONTOSAN 'elvált' (kisbetű, ékezettel, pont nélkül) — a
  // névformázó szigorú egyezést vizsgál, ebből lesz az „elv." előtag.
  const elvaltIrva = d.elvaltJelzo && partnership !== 'elettars'
  if (elvaltIrva) {
    const { error: allapotErr } = await supabase
      .from('szemely')
      .update({ allapot: 'elvált' })
      .eq('congregation_id', congregationId)
      .in('id', [ferfiId, noId])
    if (allapotErr) {
      console.warn('[recordDivorce] az „elvált" jelző írása sikertelen:', allapotErr.message)
      warnings.push('A válás rögzült, de az „elvált" jelző nem került rá a két félre — a tag szerkesztőjében pótolható.')
    }
  }

  // ── Ellenőrző olvasás: „egy aktív háztartás" invariáns a távozó félnél ───
  const { data: nyitottTagok, error: nyitottErr } = await supabase
    .from('haztartas_tag')
    .select('id')
    .eq('congregation_id', congregationId)
    .eq('id_szemely', tavozoId)
    .is('ervenyes_ig', null)
  if (nyitottErr) {
    console.warn('[recordDivorce] az ellenőrző olvasás sikertelen:', nyitottErr.message)
  } else if (((nyitottTagok || []) as unknown[]).length > 1) {
    warnings.push(`${tavozoNev} egyszerre több háztartásban szerepel nyitott tagsággal — nyisd meg az érintett kartonokat, és rendezd (a járulék-számítás ezt egyértelműnek várja).`)
  }

  // ── 6. lépés — audit + revalidate ───────────────────────────────────────
  await logAuditEvent({
    action: 'family.divorce',
    targetTable: 'csalad',
    targetId: String(d.familyId),
    metadata: {
      datum: d.datum,
      marad: d.marad,
      tavozo_id: tavozoId,
      marado_id: maradoId,
      partnership,
      uj_karton_id: ujFamilyId ?? null,
      gyermekek: prevGyerekIds.length,
      megjegyzes: d.megjegyzes || null,
      elvalt_jelzo: elvaltIrva,
      elozo_allapot_ferfi: ferfi.allapot ?? null,
      elozo_allapot_no: no.allapot ?? null,
      penzugyi_tetelek: penzugy.db,
      penzugyi_osszeg: penzugy.osszeg,
    },
  }, supabase)

  revalidatePath('/tagnyilvantartas')

  const fejlec = partnership === 'elettars' ? 'A kapcsolat felbontása rögzítve.' : 'A válás rögzítve.'
  const message = `${fejlec} ${tavozoNev} lekerült a(z) #${d.familyId} kartonról`
    + (ujFamilyId ? ` és megkapta a saját kartonját (#${ujFamilyId})` : '')
    + `; ${maradoNev}${prevGyerekIds.length > 0 ? ` és a gyermekek (${prevGyerekIds.length} fő)` : ''} a kartonon maradtak.`
    + ' A gyermekek szülő–gyermek kapcsolata MINDKÉT szülővel megmaradt, és egyetlen befizetés sem módosult.'

  return {
    success: true,
    message,
    ujFamilyId,
    warning: warnings.length > 0 ? warnings.join(' ') : undefined,
  }
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

/**
 * A felnőtt pár AKTUÁLIS párkapcsolat-jelölése (2026-08-04, PR-27) — a családi
 * karton szerkesztője ezzel tölti fel a „Házasság / Élettársi kapcsolat"
 * választót, hogy a mentés ne írja felül a meglévő (pl. anyakönyvi) adatot.
 */
export async function getFamilyPartnership(input: { ferfiId: number; noId: number }) {
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return { tipus: null as 'hazastars' | 'elettars' | null, datum: null as string | null }
  const { ferfiId, noId } = input
  if (!Number.isInteger(ferfiId) || !Number.isInteger(noId) || ferfiId === noId) {
    return { tipus: null as 'hazastars' | 'elettars' | null, datum: null as string | null }
  }
  const { data } = await supabase
    .from('szemely_kapcsolat')
    .select('tipus, ervenyes_tol')
    .in('tipus', ['hazastars', 'elettars'])
    .is('ervenyes_ig', null)
    .eq('congregation_id', congregationId)
    .or(`and(id_szemely_1.eq.${ferfiId},id_szemely_2.eq.${noId}),and(id_szemely_1.eq.${noId},id_szemely_2.eq.${ferfiId})`)
    .order('megjegyzes', { nullsFirst: true })
    .order('id')
    .limit(1)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = ((data || []) as any[])[0]
  return {
    tipus: (row?.tipus as 'hazastars' | 'elettars' | undefined) ?? null,
    datum: (row?.ervenyes_tol as string | null | undefined) ?? null,
  }
}

/**
 * 2026-08-04 (PR-38): A HIÁNYZÓ SZÜLŐ FELVÉTELE a fél családi kartonra —
 * a lelkész EGY KATTINTÁSSAL jóváhagyja azt, amit a rendszer szándékosan nem
 * végzett el automatikusan.
 *
 * Miért nem automatikus? A háztartás-szinkron a kartonon lévő MINDKÉT felnőttől
 * VÉR SZERINTI szülő-élt húz a kartonon szereplő ÖSSZES gyermekre. Ha a már
 * fent lévő gyermekek egy korábbi kapcsolatból valók, a beírt felnőtt
 * mostohaszülő lenne — az egyeztető pedig ezt az élt soha nem zárná le
 * (PR-23 P0). Ezért a döntés a lelkészé; ez az action csak VÉGREHAJTJA.
 *
 * FAIL-CLOSED őrök: saját gyülekezeti szülő + nem-egyezés tiltása, aktív és
 * hozzáférhető karton, a megcélzott hely TÉNYLEGESEN üres (közben kitölthették),
 * a szülő máshol nem felnőtt tag, és a gyermek-lista olvasási hibája MEGÁLLÍTJA
 * a mentést (az RPC a p_id-s ágon újraírja a gyerek-sorokat).
 */
export async function completeFamilyParent(input: {
  familyId: number
  parentId: number
  slot: 'apa' | 'anya'
}): Promise<{ success?: true; error?: string; warning?: string; message?: string }> {
  const { familyId, parentId, slot } = input
  if (!Number.isInteger(familyId) || familyId <= 0 || !Number.isInteger(parentId) || parentId <= 0) {
    return { error: 'Érvénytelen azonosító.' }
  }
  if (slot !== 'apa' && slot !== 'anya') return { error: 'Érvénytelen szülői hely.' }

  const { supabase, congregationId, userId } = await getFamilyAccessContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const slotLabel = slot === 'apa' ? 'édesapa' : 'édesanya'

  // 1) A szülő a SAJÁT gyülekezet tagja legyen, és a neme egyezzen a hellyel
  const { data: parent, error: parentErr } = await supabase
    .from('szemely')
    .select('id, csaladnev, k_nev, ferfi')
    .eq('id', parentId)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (parentErr) {
    return { error: `A szülő adatainak lekérdezése nem sikerült (${parentErr.message}) — próbáld újra.` }
  }
  if (!parent) return { error: 'A megadott szülő nem található az aktív gyülekezetben.' }
  const parentName = `${parent.csaladnev ?? ''} ${parent.k_nev ?? ''}`.trim() || `#${parentId}`
  const expectedFerfi = slot === 'apa'
  if (parent.ferfi !== expectedFerfi) {
    return {
      error: parent.ferfi == null
        ? `${parentName} neme nincs rögzítve, ezért ${slotLabel}ként nem vehető fel — előbb add meg a nemét a tag szerkesztőjében.`
        : `${parentName} neme nem egyezik a(z) ${slotLabel} hellyel — ellenőrizd a tag adatlapját.`,
    }
  }

  // 2) A karton legyen a saját gyülekezeté (a csalad táblán nincs congregation_id)
  let allowedFamilyIds: Set<number>
  try {
    allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId, { throwOnError: true })
  } catch (e) {
    console.warn('[completeFamilyParent] getAllowedFamilyIds sikertelen:', e instanceof Error ? e.message : e)
    return { error: 'A családi kartonok jogosultság-ellenőrzése nem sikerült — próbáld újra.' }
  }
  if (!allowedFamilyIds.has(familyId)) {
    return {
      error: 'Nincs jogosultsága ehhez a családi kartonhoz (vagy a kartonhoz még nem tartozik háztartás-bejegyzés). Nyisd meg a Családok fülön, és mentsd el egyszer.',
    }
  }

  const { data: family, error: familyErr } = await supabase
    .from('csalad')
    .select('id, id_ferfi, id_no, id_csoport, isaktiv')
    .eq('id', familyId)
    .maybeSingle()
  if (familyErr) {
    return { error: `A családi karton lekérdezése nem sikerült (${familyErr.message}) — próbáld újra.` }
  }
  if (!family) return { error: 'A családi karton nem található.' }
  if (family.isaktiv === false) {
    return { error: 'Ez a családi karton már le van zárva, ezért nem egészíthető ki. Nyisd meg a Családok fülön, és ellenőrizd.' }
  }

  // 3) A megcélzott hely TÉNYLEGESEN üres-e (közben kitölthették egy másik gépen)
  const currentFerfi = (family.id_ferfi as number | null) ?? null
  const currentNo = (family.id_no as number | null) ?? null
  const occupied = slot === 'apa' ? currentFerfi : currentNo
  if (occupied != null) {
    if (occupied === parentId) {
      return { error: `${parentName} már szerepel a kartonon ${slotLabel}ként — nincs teendő.` }
    }
    const { data: other } = await supabase
      .from('szemely').select('csaladnev, k_nev').eq('id', occupied).maybeSingle()
    const otherName = `${other?.csaladnev ?? ''} ${other?.k_nev ?? ''}`.trim() || `#${occupied}`
    return {
      error: `A(z) ${slotLabel} helyére időközben ${otherName} került, ezért ${parentName} felvételét nem hajtottuk végre. Nyisd meg a családi kartont, és nézd át.`,
    }
  }

  // 4) A szülő ne legyen MÁSIK aktív karton felnőtt tagja — az „egy aktív
  //    háztartás" szabály a járulék-számítás alapja (fail-closed olvasás).
  const { data: adultRows, error: adultErr } = await supabase
    .from('csalad')
    .select('id, id_ferfi, id_no')
    .eq('isaktiv', true)
    .or(`id_ferfi.eq.${parentId},id_no.eq.${parentId}`)
  if (adultErr) {
    return { error: `A családtagsági ellenőrzés nem sikerült (${adultErr.message}) — próbáld újra.` }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const masikKarton = ((adultRows || []) as any[])
    .find((f) => (f.id as number) !== familyId && allowedFamilyIds.has(f.id as number))
  if (masikKarton) {
    const names = await loadFamilyDisplayNames(supabase, [masikKarton.id as number])
    const masikNev = names.get(masikKarton.id as number) ?? `Család #${masikKarton.id}`
    return {
      error: `${parentName} már a(z) ${masikNev} felnőtt tagja (családfő vagy házastárs). Egy személy egyszerre csak egy család felnőtt tagja lehet — előbb a másik karton felnőtt tagjait rendezd.`,
    }
  }

  // 5) A JELENLEGI gyermek-lista FAIL-CLOSED olvasása: az RPC a p_id-s ágon
  //    TÖRLI és újraírja a gyerek-sorokat, ezért egy elnyelt olvasási hiba az
  //    összes gyermeket levinné a kartonról.
  const { data: gyerekRows, error: gyerekErr } = await supabase
    .from('gyerek')
    .select('id_szemely')
    .eq('id_csalad', familyId)
  if (gyerekErr) {
    return {
      error: `A karton gyermeklistája nem olvasható (${gyerekErr.message}), ezért biztonságból nem módosítottuk a kartont — próbáld újra.`,
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gyerekIds = [...new Set(((gyerekRows || []) as any[]).map((r) => r.id_szemely as number))]
  // Ugyanaz a személy nem lehet EGYSZERRE felnőtt és gyermek a kartonon
  const nextGyerekIds = gyerekIds.filter((id) => id !== parentId && id !== currentFerfi && id !== currentNo)

  const warnings: string[] = []
  if (gyerekIds.includes(parentId)) {
    warnings.push(`${parentName} gyermekként is szerepelt ezen a kartonon — ezt a téves sort eltávolítottuk.`)
  }

  // 6) Mentés a kanonikus úton (ugyanaz az RPC, mint a Családok fül mentése).
  //    A cím NULL-ként megy: az RPC COALESCE-szal megőrzi a meglévőt. A körzetet
  //    viszont FELTÉTEL NÉLKÜL felülírja, ezért a jelenlegi értéket adjuk vissza.
  const { data: rpcData, error: rpcErr } = await supabase.rpc('tagnyilvantartas_csalad_mentes', {
    p_id: familyId,
    p_id_ferfi: slot === 'apa' ? parentId : currentFerfi,
    p_id_no: slot === 'anya' ? parentId : currentNo,
    p_gyerek_ids: nextGyerekIds,
    p_c_utcaid: null,
    p_c_szam: null,
    p_id_csoport: (family.id_csoport as number | null) ?? null,
  })
  if (rpcErr) return { error: `A karton kiegészítése nem sikerült: ${rpcErr.message}` }
  const rpcRes = rpcData as { status?: string; family_id?: number; message?: string } | null
  if (rpcRes?.status === 'forbidden') {
    return { error: 'Nincs jogosultsága ennek a családi kartonnak a szerkesztéséhez (jelentkezz be újra, vagy válts profilt a fejlécben).' }
  }
  if (rpcRes?.status !== 'ok' || !rpcRes.family_id) {
    return { error: rpcRes?.message || 'A karton kiegészítése nem sikerült.' }
  }

  // 7) Háztartás-szinkron (innen jönnek a vér szerinti szülő-élek is) —
  //    best-effort: a mentés már megtörtént, a hibát figyelmeztetésként visszük.
  try {
    await syncHouseholdFromCsalad(supabase, familyId, congregationId)
  } catch (e) {
    console.warn('[completeFamilyParent] syncHouseholdFromCsalad sikertelen:',
      e instanceof Error ? e.message : e)
    warnings.push('A szülő felkerült a kartonra, de a háztartás- és családfa-szinkron nem sikerült — nyisd meg a családi kartont, és mentsd el újra.')
  }

  // 8) Visszaigazolás: ki, hova, milyen szerepben — és kiket érint még
  const [famNames, { data: gyerekNevRows }] = await Promise.all([
    loadFamilyDisplayNames(supabase, [familyId]),
    nextGyerekIds.length > 0
      ? supabase.from('szemely').select('id, csaladnev, k_nev').in('id', nextGyerekIds)
      : Promise.resolve({ data: [] }),
  ])
  const familyName = famNames.get(familyId) ?? `Család #${familyId}`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gyerekNevek = ((gyerekNevRows || []) as any[])
    .map((r) => `${r.csaladnev ?? ''} ${r.k_nev ?? ''}`.trim() || `#${r.id}`)
  const tobbGyerek = gyerekNevek.length > 1
  const message = `${parentName} felkerült a(z) ${familyName} kartonra ${slotLabel}ként.`
    + (gyerekNevek.length > 0
      ? ` A kartonon szereplő ${tobbGyerek ? 'gyermekek' : 'gyermek'} (${gyerekNevek.join(', ')})`
        + ` mostantól az ő gyermekeként is ${tobbGyerek ? 'szerepelnek' : 'szerepel'} a családfán.`
      : '')

  await logAuditEvent({
    action: 'family.complete_parent',
    targetTable: 'csalad',
    targetId: String(familyId),
    metadata: { parentId, slot, gyerekIds: nextGyerekIds },
  }, supabase)

  revalidatePath('/tagnyilvantartas')
  return {
    success: true,
    message,
    warning: warnings.length > 0 ? warnings.join(' ') : undefined,
  }
}
