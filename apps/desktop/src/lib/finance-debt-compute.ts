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
  computeJarulekForMemberYear,
  JARULEK_MINOR_RULE,
  type DebtRow,
  type DebtCalcMode,
  type JarulekExemption,
  type JarulekDiscountRule,
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

// A web a member_status='kitért' + meghalt + elkoltozott tagokat zárja ki. A
// desktop cache nincs külön `elkoltozott` boolean — a member_status fedi le.
const EXCLUDED_STATUS = ['elhunyt', 'elköltözött', 'elkoltozott', 'kitért', 'törölt']

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

  return members
    .filter((m) => m.meghalt !== 1 && !EXCLUDED_STATUS.includes(m.member_status || ''))
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
        payments: maintenancePayments,
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
