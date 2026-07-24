/**
 * Tartozás-sorok összeállítása (2026-06-10, paritás A4).
 *
 * A KÖZÖS `computeJarulekForMemberYear` motort hívja (web == desktop), pontosan
 * a web `penzugy/actions.ts:893-960` wiringjét követve: szűrés (élő, nem
 * elköltözött/kitért), per-tag számítás, status, rendezés.
 *
 * Tiszta függvény (nincs DB-hívás) — a hívó betölti a lokális adatot.
 */

import {
  allocateFamilyPayments,
  computeBaseExpectedForMemberYear,
  computeJarulekForMemberYear,
  isJarulekExcludedMemberStatus,
  todayInBucharest,
  JARULEK_MINOR_RULE,
  type DebtRow,
  type DebtCalcMode,
  type JarulekExemption,
  type JarulekDiscountRule,
  type JarulekMemberLike,
  type JarulekYearSetting,
  type JarulekPaymentLike,
} from '@kartoteka/ui-app'

export interface DebtMemberLike {
  id: number
  csaladnev: string | null
  k_nev: string | null
  sz_datum: string | null
  foglalkozas: string | null
  meghalt: number
  member_status: string | null
  family_id: string | null
}

// 2026-07-17 (F5): a kizárt-státusz döntés a KÖZÖS motor kanonikus predikátumával
// (isJarulekExcludedMemberStatus) — a régi literál-lista a 'kitert'/'torolt'
// (ékezet nélküli) írásmódokat nem fogta meg, és a felosztási roster is eltért a webtől.

const STATUS_PRIORITY: Record<DebtRow['status'], number> = {
  hatralekos: 0,
  rendezve: 1,
  felmentett: 2,
  // A kiskorúak a lista végére — nem járulékkötelesek (bit-azonos a webbel).
  kiskoru: 3,
}

export function buildDebtRows(params: {
  members: DebtMemberLike[]
  maintenancePayments: JarulekPaymentLike[]
  exemptions: JarulekExemption[]
  discounts: JarulekDiscountRule[]
  yearSettings: Record<number, JarulekYearSetting>
  year: number
  debtCalcMode: DebtCalcMode
}): DebtRow[] {
  const { members, maintenancePayments, exemptions, discounts, yearSettings, year, debtCalcMode } = params

  // 2026-07-16: bit-azonos a webbel — a korai-fizetési kedvezmény az AKTUÁLIS időszak
  // árát mutatja a még nem fizetőknél is. Offline is a romániai naptári nap számít.
  const asOfDate = todayInBucharest()

  const eligible = members.filter(
    (m) => m.meghalt !== 1 && !isJarulekExcludedMemberStatus(m.member_status),
  )
  // 2026-07-17 (F5, Q7 — web-bit-azonos): a tisztán családi befizetések felosztása
  // a tagok közt (idősebb előbb, alap-elvárásig) — a családi tétel többé nem
  // jelenik meg minden tagnál teljes összegként.
  const calcMembers: JarulekMemberLike[] = eligible.map((m) => {
    const famRaw = m.family_id ? Number(m.family_id) : null
    return {
      id: m.id,
      sz_datum: m.sz_datum,
      familyId: famRaw != null && !Number.isNaN(famRaw) ? famRaw : null,
      foglalkozas: m.foglalkozas,
    }
  })
  const allocatedPayments = allocateFamilyPayments(maintenancePayments, calcMembers, (mem, y) =>
    computeBaseExpectedForMemberYear({
      member: mem,
      year: y,
      currentYear: year,
      debtCalcMode,
      yearSettings,
      discounts,
      exemptions,
    }),
  )

  return eligible
    .map((m) => {
      const famRaw = m.family_id ? Number(m.family_id) : null
      const familyId = famRaw != null && !Number.isNaN(famRaw) ? famRaw : null
      const result = computeJarulekForMemberYear({
        member: { id: m.id, sz_datum: m.sz_datum, familyId, foglalkozas: m.foglalkozas },
        year,
        currentYear: year,
        debtCalcMode,
        yearSettings,
        discounts,
        exemptions,
        payments: allocatedPayments,
        asOfDate,
      })
      const name = [m.csaladnev, m.k_nev].filter(Boolean).join(' ')
      // 2026-07-16: bit-azonos a webbel (penzugy/actions.ts) — a kiskorúság ELŐBB
      // dől el, mint a „felmentett”: a 18 alattira is 0 az elvárás, de ő nem a
      // presbitérium által felmentett. A motor saját címkéjéből ismerjük fel.
      const isMinor = result.appliedRules.includes(JARULEK_MINOR_RULE)
      const status: DebtRow['status'] = isMinor
        ? 'kiskoru'
        : result.expected === 0
          ? 'felmentett'
          : result.debt > 0
            ? 'hatralekos'
            : 'rendezve'
      return {
        memberId: m.id,
        familyId,
        name,
        expected: result.expected,
        paid: result.paid,
        debt: result.debt,
        status,
        appliedRules: result.appliedRules,
      }
    })
    .sort((a, b) => {
      if (a.status !== b.status) return STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]
      if (a.debt !== b.debt) return b.debt - a.debt
      return a.name.localeCompare(b.name, 'hu')
    })
}
