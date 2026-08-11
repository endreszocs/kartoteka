/**
 * RÉSZSZÁMADÁS — időszaki nyitó/záró egyenlegek levezetése (2026-08-11, 6. kör).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ KEMÉNY MEGKÖTÉS: EZ A FÁJL NULLA FUTÁSIDEJŰ IMPORTTAL KÉSZÜL.
 *    A `scripts/selftest-reszszamadas.mjs` ezt a fájlt ÖNÁLLÓAN transpile-olja
 *    (`ts.transpileModule`), build és bundler nélkül. Egyetlen `import` (még egy
 *    típus-import is, ha nem `import type`) elrontaná az önellenőrzést. Ezért
 *    minden típus HELYBEN, `interface`-ként van definiálva.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * MIÉRT KELL EZ EGYÁLTALÁN
 *   A régi részszámadás a JANUÁR 1-i nyitóból indult, és ahhoz adta hozzá az
 *   IDŐSZAKI forgalmat. Egy II. félévi papíron ez számtani képtelenség: a záró
 *   egyenleg NEM a január 1-i pénzkészlet + a július–decemberi forgalom.
 *   Itt a nyitó az IDŐSZAK ELEJÉRE vezetődik le: az évi nyitó + a január 1. és
 *   az időszak kezdete KÖZÖTTI (a kezdőnapot NEM tartalmazó) forgalom.
 *
 * A KÉT SZABÁLY, AMIT SOHA NEM SZABAD ÖSSZEKEVERNI
 *   · EGYENLEG-szabály (nyitó/záró): a BELSŐ MOZGÁS BENNE VAN. A kassza→bank
 *     letét valóban csökkenti a kasszát és növeli a bankot. Ezért itt MINDEN
 *     nem stornózott, nem törölt tétel számít — jogcímtől függetlenül.
 *   · FOLYAM-szabály (1xx/2xx rovat): a belső mozgás KINT van. Ez a
 *     `collectBudgetRows` kód-szűréséből (1xx≠100, 2xx) adódik — azt NEM
 *     változtatjuk. A `reconcileDelta` pontosan a két szabály különbségét méri:
 *     tiszta adaton 0, jogcím nélküli tételnél nem 0 → lábjegyzet a papíron.
 *
 * TOVÁBBI KIMONDOTT SZABÁLYOK
 *   · Az összeg MINDIG a RON-ekvivalens: `osszeg_ron ?? osszeg`. Devizás banki
 *     tételnél a nyers `osszeg` (pl. 100 EUR) hamis egyenleget adna.
 *   · Számla-azonosító: `bankszamla_id == null` → KASSZA. SOHA nem az
 *     `irattipus` szövegmező (az `initFinanceDiocese` pont ezen bukik el).
 *   · Ismeretlen bankszámla-kulcs a nyitó-térképben → 0. Év közben nyitott
 *     számlánál ez a HELYES érték.
 *   · Kerekítés: számlánként EGYSZER, a végén (a `resolve-nyito.ts` mintája).
 *   · Fail-closed: érvénytelen időszakot SOHA nem csonkítunk az évhatárra —
 *     `{ error }` jön vissza, és a nyomtatás letiltódik.
 */

/** A kassza „számla-azonosítója" a belső térképekben (a bank-id-k pozitívak). */
export const KASSZA = -1 as const

/** Egy befizetés/kiadás sor MINIMÁLIS alakja, amit az egyenleg-levezetés használ. */
export interface PeriodRow {
  datum: string | null
  osszeg: number | null
  osszeg_ron?: number | null
  bankszamla_id: number | null
  deleted?: boolean | null
  stornozott?: boolean | null
}

/** Egy „számla" (kassza vagy bankszámla) időszaki egyenlege. */
export interface AccountBalance {
  /** Az időszak ELEJÉN. */
  opening: number
  /** Az időszaki forgalom (bevétel − kiadás). */
  net: number
  /** Az időszak VÉGÉN (opening + net). */
  closing: number
}

export interface PeriodBalances {
  year: number
  periodFrom: string
  periodTo: string
  cash: AccountBalance
  bankById: Record<number, AccountBalance>
  bank: AccountBalance
  total: AccountBalance
  /** closing.total − (opening.total + Σ1xx tény − Σ2xx tény). 0 = egyezik. */
  reconcileDelta: number
  /** Hány NEM stornózott/törölt tétel esett az időszakba (0 → „nem volt pénzmozgás"). */
  movementCount: number
}

export interface ComputePeriodBalancesInput {
  income: PeriodRow[]
  expense: PeriodRow[]
  year: number
  periodFrom: string
  periodTo: string
  /** A január 1-i kassza-nyitó (feloldott, RON). */
  yearOpeningCash: number
  /** A január 1-i bank-nyitók SZÁMLÁNKÉNT (feloldott, RON). Hiányzó kulcs = 0. */
  yearOpeningBankById: Record<number, number>
  /** Az IDŐSZAKI tény-bevétel jogcím-kódonként (a `reconcileDelta`-hoz). */
  actualIncomeByCode?: Record<string, number>
  /** Az IDŐSZAKI tény-kiadás jogcím-kódonként (a `reconcileDelta`-hoz). */
  actualExpenseByCode?: Record<string, number>
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function round2(n: number): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Number(v.toFixed(2))
}

/** RON-ekvivalens: `osszeg_ron ?? osszeg`, nem szám → 0. */
function ronOf(r: PeriodRow): number {
  const raw = r.osszeg_ron == null ? r.osszeg : r.osszeg_ron
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

/** A tétel napja 'YYYY-MM-DD' alakban ('' = nincs dátum → kihagyjuk). */
function dayOf(r: PeriodRow): string {
  return (r.datum || '').slice(0, 10)
}

/** Stornózott/törölt tétel SEMMILYEN hivatalos összegbe nem számít. */
function isValid(r: PeriodRow): boolean {
  return !r.deleted && !r.stornozott
}

/** `bankszamla_id == null` → KASSZA. SOHA nem az irattípus szöveg. */
function accountOf(r: PeriodRow): number {
  if (r.bankszamla_id == null) return KASSZA
  const id = Number(r.bankszamla_id)
  return Number.isFinite(id) ? id : KASSZA
}

/**
 * Az időszak nyitó/záró egyenlegei számlánként — TISZTA FÜGGVÉNY.
 *
 * Az ablakok (a leggyakoribb hibaforrás, ezért kimondva):
 *   pre(r)  =  `${Y}-01-01` <= d  <  periodFrom   ← FÉLIG NYÍLT, a kezdőnapot NEM tartalmazza
 *   in(r)   =  periodFrom    <= d <= periodTo     ← MINDKÉT VÉG INKLUZÍV
 *
 * Ebből következik a legfontosabb invariáns: `periodFrom = ${Y}-01-01` és
 * `periodTo = ${Y}-12-31` esetén a `pre` ablak ÜRES, tehát az időszaki nyitó
 * PONTOSAN az évi nyitó, a záró pedig pontosan az éves záró → a teljes évre
 * kiadott részszámadás számai megegyeznek az éves Számadáséval.
 */
export function computePeriodBalances(
  input: ComputePeriodBalancesInput,
): PeriodBalances | { error: string } {
  const year = Number(input.year)
  const periodFrom = String(input.periodFrom || '')
  const periodTo = String(input.periodTo || '')

  // ── Fail-closed validáció ────────────────────────────────────────────────
  if (!Number.isInteger(year) || year < 1900 || year > 3000) {
    return { error: `Érvénytelen év: „${String(input.year)}".` }
  }
  if (!ISO_DATE_RE.test(periodFrom)) {
    return { error: 'A kezdő dátum hiányzik vagy nem ÉÉÉÉ-HH-NN alakú.' }
  }
  if (!ISO_DATE_RE.test(periodTo)) {
    return { error: 'A záró dátum hiányzik vagy nem ÉÉÉÉ-HH-NN alakú.' }
  }
  const y = String(year)
  if (periodFrom.slice(0, 4) !== y || periodTo.slice(0, 4) !== y) {
    return {
      error:
        `A részszámadás időszaka nem nyúlhat át az évhatáron. A(z) ${y}. évhez a ` +
        `${y}-01-01 és ${y}-12-31 közötti időszakot adj meg. Ha az elszámolás átnyúlik ` +
        `az évhatáron, nyomtass két részszámadást — a második nyitója pontosan az első zárója lesz.`,
    }
  }
  if (periodFrom > periodTo) {
    return { error: 'A kezdő dátum későbbi, mint a záró dátum.' }
  }

  const yearStart = `${y}-01-01`

  // ── Számlánkénti felhalmozás ─────────────────────────────────────────────
  const openingBy: Record<number, number> = {}
  const netBy: Record<number, number> = {}

  // A kassza MINDIG szerepel (akkor is, ha nulla és nincs forgalma).
  openingBy[KASSZA] = Number(input.yearOpeningCash) || 0
  const yearBank = input.yearOpeningBankById || {}
  for (const key of Object.keys(yearBank)) {
    const id = Number(key)
    if (!Number.isFinite(id) || id === KASSZA) continue
    openingBy[id] = (openingBy[id] || 0) + (Number(yearBank[id]) || 0)
  }

  let movementCount = 0
  const apply = (rows: PeriodRow[] | undefined, sign: number) => {
    for (const r of rows || []) {
      if (!r || !isValid(r)) continue
      const d = dayOf(r)
      if (!d) continue
      const k = accountOf(r)
      const amount = sign * ronOf(r)
      if (d >= yearStart && d < periodFrom) {
        openingBy[k] = (openingBy[k] || 0) + amount
      } else if (d >= periodFrom && d <= periodTo) {
        netBy[k] = (netBy[k] || 0) + amount
        movementCount++
      }
      // Az időszak UTÁNI (és az év előtti) tételek egyik ablakba sem esnek.
    }
  }
  apply(input.income, 1)
  apply(input.expense, -1)

  // ── Összeállítás (kerekítés számlánként EGYSZER, a végén) ────────────────
  const ids: number[] = []
  const seen: Record<number, boolean> = {}
  for (const key of Object.keys(openingBy)) {
    const id = Number(key)
    if (!seen[id]) { seen[id] = true; ids.push(id) }
  }
  for (const key of Object.keys(netBy)) {
    const id = Number(key)
    if (!seen[id]) { seen[id] = true; ids.push(id) }
  }

  let cash: AccountBalance = { opening: 0, net: 0, closing: 0 }
  const bankById: Record<number, AccountBalance> = {}
  let bankOpening = 0
  let bankNet = 0
  for (const id of ids) {
    const opening = round2(openingBy[id] || 0)
    const net = round2(netBy[id] || 0)
    const bal: AccountBalance = { opening, net, closing: round2(opening + net) }
    if (id === KASSZA) {
      cash = bal
    } else {
      bankById[id] = bal
      bankOpening += opening
      bankNet += net
    }
  }
  const bank: AccountBalance = {
    opening: round2(bankOpening),
    net: round2(bankNet),
    closing: round2(bankOpening + bankNet),
  }
  const total: AccountBalance = {
    opening: round2(cash.opening + bank.opening),
    net: round2(cash.net + bank.net),
    closing: round2(cash.closing + bank.closing),
  }

  // ── Egyeztetés: EGYENLEG-szabály vs FOLYAM-szabály ───────────────────────
  // A jogcím-kódos szűrés PONTOSAN a `collectBudgetRows` / `buildSzamadasExtraRows`
  // szabálya: bevétel 1xx (a 100.xx belső-mozgás nélkül), kiadás 2xx.
  const hasFlow =
    input.actualIncomeByCode != null || input.actualExpenseByCode != null
  let reconcileDelta = 0
  if (hasFlow) {
    let flowIncome = 0
    const inc = input.actualIncomeByCode || {}
    for (const code of Object.keys(inc)) {
      if (code.charAt(0) === '1' && code.slice(0, 3) !== '100') flowIncome += Number(inc[code]) || 0
    }
    let flowExpense = 0
    const exp = input.actualExpenseByCode || {}
    for (const code of Object.keys(exp)) {
      if (code.charAt(0) === '2') flowExpense += Number(exp[code]) || 0
    }
    reconcileDelta = round2(total.closing - round2(total.opening + flowIncome - flowExpense))
  }

  return {
    year,
    periodFrom,
    periodTo,
    cash,
    bankById,
    bank,
    total,
    reconcileDelta,
    movementCount,
  }
}
