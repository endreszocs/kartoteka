/**
 * Automatikus körzetesítés — TERVEZŐ-MOTOR (2026-07-24, PR-7 F4.1 — D3 döntések).
 *
 * PURE modul (nincs DB, nincs 'use server') — unit-tesztelhető, és később a
 * desktop is ugyanezt importálhatja.
 *
 * D3 döntések:
 *  (a) egy körzethez TÖBB presbiter is tartozhat (a kiosztás a wizardban)
 *  (b) kiegyensúlyozás: LÉLEKSZÁM szerint (default), családot NEM szakítunk
 *      szét — a hozzárendelés család-szintű marad
 *  (c) korosztály-mód is van (a család legidősebb felnőttje szerint)
 *  (d) a körzet-nevek személyre szabhatók (itt csak default-javaslat készül)
 *  (e) MINDENKI elosztásra kerül — ami nem osztható (nincs utca / nincs
 *      születési dátum), az a `unassigned` listába kerül OKKAL, és kézzel
 *      rendezhető
 *
 * Algoritmus: csoportosítás kulcs szerint (utca vagy korosztály-sáv) →
 * csoportok súly szerint csökkenőben → greedy bin-packing N körzetbe
 * (legkisebb terhelés először) → a túl nagy csoportok (> 1,5 × célméret)
 * részekre bontva, hogy egyetlen hosszú utca ne torzítsa el a kiosztást.
 */

export interface AutoDistrictFamily {
  /** legacy csalad.id */
  id: number
  utcaNev: string | null
  telepules: string | null
  /** A háztartás lélekszáma (felnőttek + gyermekek) */
  memberCount: number
  /** A legidősebb felnőtt születési dátuma (korosztály-módhoz) */
  oldestBirthDate: string | null
  /** Jelenlegi körzet (null = besorolatlan) */
  currentCsoportId: number | null
  /** Megjelenítéshez: a családfő neve */
  displayName: string
}

export interface AutoDistrictParams {
  districtCount: number
  mode: 'utca' | 'korosztaly'
  balance: 'lelekszam' | 'csaladszam'
  /** true = csak a körzet nélkülieket osztja el; false (D3e default) = mindenkit */
  onlyUnassigned: boolean
}

export interface PlannedDistrict {
  /** Stabil kulcs a UI-nak (index-alapú) */
  key: string
  /** Default név — a wizard előnézetében szerkeszthető (D3d) */
  name: string
  familyIds: number[]
  familyCount: number
  memberCount: number
  /** A körzetbe került csoportok címkéi (utcák vagy korosztály-sávok) */
  groupLabels: string[]
}

export interface DistrictPlan {
  districts: PlannedDistrict[]
  unassigned: Array<{ familyId: number; displayName: string; reason: string }>
  /** Összesítő a wizard fejlécéhez */
  totalFamilies: number
  totalMembers: number
}

const AGE_BANDS: Array<{ label: string; minAge: number; maxAge: number }> = [
  { label: 'Fiatal családok (40 év alatt)', minAge: 0, maxAge: 39 },
  { label: 'Középkorúak (40–59 év)', minAge: 40, maxAge: 59 },
  { label: 'Idősödők (60–74 év)', minAge: 60, maxAge: 74 },
  { label: 'Idősek (75 év felett)', minAge: 75, maxAge: 200 },
]

function ageBandLabel(birthDate: string, now: Date): string | null {
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return null
  let age = now.getFullYear() - birth.getFullYear()
  const hadBirthday =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate())
  if (!hadBirthday) age -= 1
  const band = AGE_BANDS.find((b) => age >= b.minAge && age <= b.maxAge)
  return band?.label ?? null
}

interface Group {
  label: string
  families: AutoDistrictFamily[]
  weight: number
}

export function planDistricts(
  allFamilies: AutoDistrictFamily[],
  params: AutoDistrictParams,
  now: Date = new Date(),
): DistrictPlan {
  const unassigned: DistrictPlan['unassigned'] = []
  const weightOf = (f: AutoDistrictFamily) =>
    params.balance === 'lelekszam' ? Math.max(1, f.memberCount) : 1

  const families = params.onlyUnassigned
    ? allFamilies.filter((f) => f.currentCsoportId == null)
    : allFamilies

  // ── 1. Csoportosítás kulcs szerint ────────────────────────────────────
  const groups = new Map<string, Group>()
  for (const family of families) {
    let label: string | null
    if (params.mode === 'utca') {
      label = family.utcaNev
        ? [family.telepules, family.utcaNev].filter(Boolean).join(' — ')
        : null
      if (!label) {
        unassigned.push({ familyId: family.id, displayName: family.displayName, reason: 'Nincs utca rögzítve a családnál' })
        continue
      }
    } else {
      label = family.oldestBirthDate ? ageBandLabel(family.oldestBirthDate, now) : null
      if (!label) {
        unassigned.push({ familyId: family.id, displayName: family.displayName, reason: 'Nincs születési dátum a család felnőttjeinél' })
        continue
      }
    }
    const group = groups.get(label) || { label, families: [], weight: 0 }
    group.families.push(family)
    group.weight += weightOf(family)
    groups.set(label, group)
  }

  const districtCount = Math.max(1, Math.floor(params.districtCount))
  const totalWeight = [...groups.values()].reduce((sum, g) => sum + g.weight, 0)
  const targetWeight = totalWeight / districtCount

  // ── 2. Túl nagy csoportok felosztása (> 1,5 × célméret) ───────────────
  // Egy hosszú utca / népes korosztály KETTÉOSZTHATÓ (a user kérése), hogy
  // ne toljon el egyetlen körzetet. A darabok „(1. rész)" címkét kapnak.
  const splitGroups: Group[] = []
  for (const group of groups.values()) {
    if (districtCount > 1 && group.weight > targetWeight * 1.5 && group.families.length > 1) {
      const parts = Math.min(
        group.families.length,
        Math.max(2, Math.round(group.weight / targetWeight)),
      )
      const sorted = [...group.families].sort((a, b) => a.id - b.id)
      const buckets: Group[] = Array.from({ length: parts }, (_, i) => ({
        label: `${group.label} (${i + 1}. rész)`,
        families: [],
        weight: 0,
      }))
      // Greedy: mindig a legkönnyebb részbe (egyenletes darabolás)
      for (const family of sorted) {
        const lightest = buckets.reduce((min, b) => (b.weight < min.weight ? b : min), buckets[0])
        lightest.families.push(family)
        lightest.weight += weightOf(family)
      }
      splitGroups.push(...buckets.filter((b) => b.families.length > 0))
    } else {
      splitGroups.push(group)
    }
  }

  // ── 3. Greedy bin-packing N körzetbe (legnehezebb csoport először) ────
  const bins: Array<{ groups: Group[]; weight: number }> = Array.from(
    { length: districtCount },
    () => ({ groups: [], weight: 0 }),
  )
  const orderedGroups = splitGroups.sort((a, b) => b.weight - a.weight)
  for (const group of orderedGroups) {
    const lightest = bins.reduce((min, b) => (b.weight < min.weight ? b : min), bins[0])
    lightest.groups.push(group)
    lightest.weight += group.weight
  }

  // ── 4. Kimenet ────────────────────────────────────────────────────────
  const districts: PlannedDistrict[] = bins
    .filter((bin) => bin.groups.length > 0)
    .map((bin, index) => {
      const binFamilies = bin.groups.flatMap((g) => g.families)
      return {
        key: `district-${index + 1}`,
        name: `${index + 1}. körzet`,
        familyIds: binFamilies.map((f) => f.id),
        familyCount: binFamilies.length,
        memberCount: binFamilies.reduce((sum, f) => sum + Math.max(1, f.memberCount), 0),
        groupLabels: bin.groups.map((g) => g.label).sort((a, b) => a.localeCompare(b, 'hu')),
      }
    })

  return {
    districts,
    unassigned,
    totalFamilies: families.length,
    totalMembers: families.reduce((sum, f) => sum + Math.max(1, f.memberCount), 0),
  }
}
