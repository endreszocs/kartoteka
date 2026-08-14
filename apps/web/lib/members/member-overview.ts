import { AGE_GROUPS, type EnrichedMember } from '@/lib/constants/members'
import { isAdult } from '@/lib/members/age'
// 2026-08-15 (átvilágítás #22): a tag-státusz KANONIKUS predikátumai — ugyanaz a
// forrás, amire a Személyek fül (registry-list-actions.ts) is köt.
import { hasLeftMember, isActiveMember, isMovedMember } from '@/lib/members/member-status'

export interface MemberOverviewPerson {
  id: number
  csaladnev: string | null
  k_nev: string | null
  sz_datum: string | null
}

export interface MemberOverviewNameDay {
  honap: number
  nap: number
  nevek: string[]
}

export interface MemberOverviewSnapshot {
  birthdays: Array<{
    id: number
    name: string
    day: number
    turning: number
  }>
  nameDays: MemberOverviewNameDay[]
  nameDayMembers: string[]
  stats: {
    total: number
    men: number
    women: number
    groups: Record<string, number>
    ageSum: number
    ageCount: number
    menAgeSum: number
    menAgeCount: number
    womenAgeSum: number
    womenAgeCount: number
    f5: { konfirmando: number; valaszto: number; idos75: number; idos80: number }
    f10: { konfirmando: number; valaszto: number; idos75: number; idos80: number }
    oldest: MemberOverviewPerson | null
    youngest: MemberOverviewPerson | null
    topLocs: Array<[string, number]>
    dead: number
    moved: number
    left: number
    topFam: Array<[string, number]>
    topFirst: Array<[string, number]>
    currentVoters: number
    currentKonfirmando: number
  }
}

export function buildMemberOverviewSnapshot(
  members: EnrichedMember[],
  nameDays: MemberOverviewNameDay[],
  now = new Date(),
): MemberOverviewSnapshot {
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  const birthdays = members
    .filter((member) => {
      if (member.meghalt || !member.sz_datum) return false
      return new Date(member.sz_datum).getMonth() === currentMonth
    })
    .map((member) => {
      const birthDate = new Date(member.sz_datum as string)
      return {
        id: member.id,
        name: `${member.csaladnev || ''} ${member.k_nev || ''}`.trim(),
        day: birthDate.getDate(),
        turning: currentYear - birthDate.getFullYear(),
      }
    })
    .sort((left, right) => left.day - right.day)

  const nameSet = new Set(nameDays.flatMap((day) => day.nevek).map((name) => name.toLocaleLowerCase('hu-HU')))
  const nameDayMembers = nameSet.size === 0
    ? []
    : members
        .filter((member) => {
          if (member.meghalt || !member.k_nev) return false
          const firstName = member.k_nev.trim().split(/\s+/)[0]?.toLocaleLowerCase('hu-HU')
          return !!firstName && nameSet.has(firstName)
        })
        .map((member) => `${member.csaladnev || ''} ${member.k_nev || ''}`.trim())

  // 2026-08-15 (átvilágítás #22): itt korábban KÉZI, nyers összevetés állt:
  // `member.elkoltozott` (NEM LÉTEZŐ oszlop → mindig undefined) és az ÉKEZET
  // NÉLKÜLI `member_status !== 'elkoltozott'` — miközben a kivezetés ÉKEZETES
  // 'elköltözött'-et ír. Az elköltözött tag ezért bennmaradt az aktív
  // lélekszámban (és a nem/kor-bontásban, a választó-számban, az 5/10 éves
  // előrejelzésben is), a Személyek fül viszont — amely már normalizálva szűrt —
  // kihagyta: ugyanazon a képernyőn két különböző lélekszám. A `vallas`
  // összevetése ugyanezért volt hibás: az importált, ékezet nélküli
  // 'Reformatus' vallású tag itt NEM számított aktívnak. Mindkettő mostantól
  // a közös, ékezet-érzéketlen `isActiveMember`-en megy.
  const activeMembers = members.filter(isActiveMember)

  const groups: Record<string, number> = {}
  AGE_GROUPS.forEach((group) => { groups[group.key] = 0 })

  let ageSum = 0
  let ageCount = 0
  let menAgeSum = 0
  let menAgeCount = 0
  let womenAgeSum = 0
  let womenAgeCount = 0

  for (const member of activeMembers) {
    if (!member.sz_datum) continue
    const age = currentYear - new Date(member.sz_datum).getFullYear()
    if (age < 0) continue

    ageSum += age
    ageCount += 1
    if (member.ferfi) {
      menAgeSum += age
      menAgeCount += 1
    } else {
      womenAgeSum += age
      womenAgeCount += 1
    }

    if (age <= 6) groups['0-6'] += 1
    else if (age <= 12) groups['7-12'] += 1
    else if (age <= 14) groups['13-14'] += 1
    else if (age <= 18) groups['15-18'] += 1
    else if (age <= 30) groups['19-30'] += 1
    else if (age <= 40) groups['31-40'] += 1
    else if (age <= 65) groups['41-65'] += 1
    else if (age <= 75) groups['66-75'] += 1
    else if (age <= 80) groups['76-80'] += 1
    else if (age <= 100) groups['81-100'] += 1
    else groups['100+'] += 1
  }

  const ages = activeMembers
    .filter((member) => !!member.sz_datum)
    .map((member) => currentYear - new Date(member.sz_datum as string).getFullYear())

  const forecast = (years: number) => {
    let konfirmando = 0
    let valaszto = 0
    let idos75 = 0
    let idos80 = 0
    for (const age of ages) {
      const futureAge = age + years
      if (futureAge >= 13 && futureAge <= 15 && age < 13) konfirmando += 1
      if (futureAge >= 18 && age < 18) valaszto += 1
      if (futureAge > 75) idos75 += 1
      if (futureAge > 80) idos80 += 1
    }
    return { konfirmando, valaszto, idos75, idos80 }
  }

  let oldest: MemberOverviewPerson | null = null
  let youngest: MemberOverviewPerson | null = null
  for (const member of activeMembers) {
    if (!member.sz_datum) continue
    const compact = {
      id: member.id,
      csaladnev: member.csaladnev,
      k_nev: member.k_nev,
      sz_datum: member.sz_datum,
    }
    if (!oldest || member.sz_datum < (oldest.sz_datum as string)) oldest = compact
    if (!youngest || member.sz_datum > (youngest.sz_datum as string)) youngest = compact
  }

  const localities: Record<string, number> = {}
  const familyNames: Record<string, number> = {}
  const firstNames: Record<string, number> = {}
  for (const member of activeMembers) {
    const locality = member.adrlocality?.name
    if (locality) localities[locality] = (localities[locality] || 0) + 1
    if (member.csaladnev) familyNames[member.csaladnev] = (familyNames[member.csaladnev] || 0) + 1
    if (member.k_nev) {
      const firstName = member.k_nev.split(' ')[0]
      firstNames[firstName] = (firstNames[firstName] || 0) + 1
    }
  }

  const total = activeMembers.length
  const men = activeMembers.filter((member) => member.ferfi).length

  return {
    birthdays,
    nameDays,
    nameDayMembers,
    stats: {
      total,
      men,
      women: total - men,
      groups,
      ageSum,
      ageCount,
      menAgeSum,
      menAgeCount,
      womenAgeSum,
      womenAgeCount,
      f5: forecast(5),
      f10: forecast(10),
      oldest,
      youngest,
      topLocs: Object.entries(localities).sort((left, right) => right[1] - left[1]).slice(0, 5),
      dead: members.filter((member) => member.meghalt).length,
      // 2026-08-15 (átvilágítás #22): az „Elköltözött" pirula MINDIG 0-t mutatott —
      // ékezet nélküli sztringre és a nem létező `elkoltozott` oszlopra hasonlított.
      // A „Kitért" ág ékezetezése ugyan helyes volt, de az importált, ékezet nélküli
      // 'kitert' státuszú tagot nem számolta; mindkettő a közös predikátumra köt.
      moved: members.filter(isMovedMember).length,
      left: members.filter(hasLeftMember).length,
      topFam: Object.entries(familyNames).sort((left, right) => right[1] - left[1]).slice(0, 10),
      topFirst: Object.entries(firstNames).sort((left, right) => right[1] - left[1]).slice(0, 10),
      // 2026-07-17 (PR-2 F1.4): dátum-pontos 18+ (a voter-RPC szemantikájával
      // egyezően) — az évszám-alapú számítás a szülinap előtt is felnőttnek vett.
      currentVoters: activeMembers.filter((member) => isAdult(member.sz_datum)).length,
      currentKonfirmando: groups['13-14'],
    },
  }
}
