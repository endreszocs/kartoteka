import type { DebtCalcMode } from './types'

export interface JarulekDiscountRule {
  id?: string
  ev: number
  tipus: 'idoszak' | 'kor' | 'jovedelem' | 'foglalkozas'
  aktiv: boolean
  /** 2026-06-05: időablak kezdő dátuma (HH-NN). NULL → régi (kumulatív) mód. */
  kezdet?: string | null
  hatarid: string | null
  kedv_osszeg: number | null
  kor_tol: number | null
  szazalek: number | null
  fix_osszeg: number | null
  jov_leiras: string | null
}

export interface JarulekYearSetting {
  year: number
  eves_jarulek: number
  jarulek_kedvezmenyes: number | null
  jarulek_hatarid: string | null
}

export interface JarulekMemberLike {
  id: number
  sz_datum: string | null
  familyId?: number | null
  /** 2026-06-05: foglalkozás-alapú kedvezményhez (pl. tanuló/diák). Szabad
   *  szöveg a `szemely.foglalkozas` mezőből. */
  foglalkozas?: string | null
}

export interface JarulekPaymentLike {
  id_szemely?: number | null
  id_csalad?: number | null
  datum?: string | null
  fizetettev: number | null
  osszeg: number
}

export interface JarulekExemption {
  id_szemely: number | null
  id_csalad: number | null
  kezdete: number | null
  vege: number | null
}

export interface JarulekComputationResult {
  expected: number
  paid: number
  debt: number
  appliedRules: string[]
  usedYear: number
}

function normalizeAmount(value: unknown) {
  return Math.max(0, Number(value) || 0)
}

/** Foglalkozás-egyezéshez: kisbetűs, ékezet nélküli, trimmelt forma. */
function normalizeOccupation(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

function parseMonthDay(year: number, monthDay?: string | null) {
  if (!monthDay) return null

  const trimmed = monthDay.trim()
  const parts = trimmed.split('-')
  if (parts.length !== 2) return null

  const month = Number(parts[0])
  const day = Number(parts[1])
  if (!month || !day) return null

  const date = new Date(Date.UTC(year, month - 1, day))
  return Number.isNaN(date.getTime()) ? null : date
}

function parseComparableDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function getAgeForYear(member: JarulekMemberLike, year: number) {
  if (!member.sz_datum) return null
  const birthYear = Number(String(member.sz_datum).slice(0, 4))
  if (!birthYear || birthYear < 1900) return null
  return year - birthYear
}

function getYearSetting(
  year: number,
  yearSettings: Record<number, JarulekYearSetting>,
  debtCalcMode: DebtCalcMode,
  currentYear: number,
) {
  const usedYear = debtCalcMode === 'aktualis' ? currentYear : year
  return {
    usedYear,
    setting: yearSettings[usedYear] || yearSettings[year] || null,
  }
}

function isExemptForYear(memberId: number, familyId: number | null | undefined, exemptions: JarulekExemption[], year: number) {
  return exemptions.some((item) => {
    const fromYear = item.kezdete || 0
    const toYear = item.vege || 2099
    if (year < fromYear || year > toYear) return false
    return item.id_szemely === memberId || (!!familyId && item.id_csalad === familyId)
  })
}

function getRelevantPayments(
  payments: JarulekPaymentLike[],
  memberId: number,
  familyId: number | null | undefined,
  year: number,
) {
  return payments.filter((payment) => {
    if (payment.fizetettev !== year) return false
    if (payment.id_szemely === memberId) return true
    if (familyId && payment.id_csalad === familyId) return true
    return false
  })
}

function sumPaymentsUntil(payments: JarulekPaymentLike[], deadline: Date | null) {
  if (!deadline) return 0
  return payments.reduce((sum, payment) => {
    const paymentDate = parseComparableDate(payment.datum)
    if (!paymentDate) return sum
    return paymentDate.getTime() <= deadline.getTime() ? sum + normalizeAmount(payment.osszeg) : sum
  }, 0)
}

/** A [start, end] időablakba eső befizetések összege. Ha start null, az ablak
 *  alsó határa nyitott (≙ a régi „határidőig" kumulatív viselkedés). */
function sumPaymentsInRange(payments: JarulekPaymentLike[], start: Date | null, end: Date | null) {
  if (!end) return 0
  return payments.reduce((sum, payment) => {
    const paymentDate = parseComparableDate(payment.datum)
    if (!paymentDate) return sum
    if (paymentDate.getTime() > end.getTime()) return sum
    if (start && paymentDate.getTime() < start.getTime()) return sum
    return sum + normalizeAmount(payment.osszeg)
  }, 0)
}

function getAgeAdjustedFee(
  member: JarulekMemberLike,
  year: number,
  baseFee: number,
  discounts: JarulekDiscountRule[],
) {
  const age = getAgeForYear(member, year)
  if (age === null) return { amount: baseFee, labels: [] as string[] }

  let bestAmount = baseFee
  const labels: string[] = []

  discounts
    .filter((discount) => discount.tipus === 'kor' && discount.aktiv)
    .forEach((discount) => {
      const ageThreshold = Number(discount.kor_tol) || 0
      if (age < ageThreshold) return

      const candidate =
        discount.fix_osszeg != null
          ? normalizeAmount(discount.fix_osszeg)
          : discount.szazalek != null
            ? Math.round((baseFee * normalizeAmount(discount.szazalek)) / 100)
            : baseFee

      if (candidate < bestAmount) {
        bestAmount = candidate
        labels.length = 0
        labels.push(`Kor kedvezmény (${ageThreshold}+ év)`)
      }
    })

  return { amount: bestAmount, labels }
}

function getOccupationAdjustedFee(
  member: JarulekMemberLike,
  baseFee: number,
  discounts: JarulekDiscountRule[],
) {
  const memberOccupation = normalizeOccupation(member.foglalkozas)
  if (!memberOccupation) return { amount: baseFee, labels: [] as string[] }

  let bestAmount = baseFee
  const labels: string[] = []

  discounts
    .filter((discount) => discount.tipus === 'foglalkozas' && discount.aktiv)
    .forEach((discount) => {
      // jov_leiras = vesszővel elválasztott foglalkozás-kulcsszavak.
      // Teljes (token) egyezés, ékezet/kisbetű-érzéketlenül — a részleges
      // egyezés (pl. "tanulmányi" → "tanul") téves találatot adna.
      const keywords = String(discount.jov_leiras ?? '')
        .split(',')
        .map(normalizeOccupation)
        .filter(Boolean)
      if (keywords.length === 0) return
      if (!keywords.includes(memberOccupation)) return

      const candidate =
        discount.fix_osszeg != null
          ? normalizeAmount(discount.fix_osszeg)
          : discount.szazalek != null
            ? Math.round((baseFee * normalizeAmount(discount.szazalek)) / 100)
            : baseFee

      if (candidate < bestAmount) {
        bestAmount = candidate
        labels.length = 0
        labels.push(`Foglalkozás-kedvezmény (${discount.jov_leiras})`)
      }
    })

  return { amount: bestAmount, labels }
}

function getEarlyPaymentAdjustedFee(
  year: number,
  baseFee: number,
  yearSetting: JarulekYearSetting | null,
  discounts: JarulekDiscountRule[],
  relevantPayments: JarulekPaymentLike[],
  // (B/J6, Endre 2026-06-21) PROSPEKTÍV mód: ha megadva (a Tétel-rögzítő auto-összegénél a beírni
  // kívánt befizetés DÁTUMA), a korai-fizetés/időszaki kedvezmény NEM a már befizetett összeghez,
  // hanem ahhoz kötődik, hogy a befizetés dátuma a határidő/ablak ELŐTT van-e. Ha null/undefined
  // (Tartozás-lista, retrospektív), a régi „csak megfizetve jár" viselkedés marad — bit-azonos.
  prospectiveDate?: Date | null,
) {
  let bestAmount = baseFee
  const labels: string[] = []

  const defaultDiscountAmount = normalizeAmount(yearSetting?.jarulek_kedvezmenyes)
  const defaultDeadline = parseMonthDay(year, yearSetting?.jarulek_hatarid)
  if (defaultDiscountAmount > 0 && defaultDeadline) {
    const earlyOk = prospectiveDate
      ? prospectiveDate.getTime() <= defaultDeadline.getTime() + 24 * 60 * 60 * 1000 - 1 // a határidő napja is jár
      : sumPaymentsUntil(relevantPayments, defaultDeadline) >= defaultDiscountAmount
    if (earlyOk && defaultDiscountAmount < bestAmount) {
      bestAmount = defaultDiscountAmount
      labels.length = 0
      labels.push(`Kedvezményes határidő (${yearSetting?.jarulek_hatarid})`)
    }
  }

  discounts
    .filter((discount) => discount.tipus === 'idoszak' && discount.aktiv)
    .forEach((discount) => {
      const deadline = parseMonthDay(year, discount.hatarid)
      if (!deadline) return

      // 2026-06-05: dátum-tartomány. Ha van kezdő dátum, a befizetésnek a
      // [kezdet, hatarid] ablakba kell esnie. Ha nincs, az alsó határ nyitott
      // (régi viselkedés). Az ablak végét egy nappal kiterjesztjük (a vég-nap
      // is beleszámít, 23:59-ig).
      const windowStart = parseMonthDay(year, discount.kezdet)
      const windowEnd = new Date(deadline.getTime() + 24 * 60 * 60 * 1000 - 1)

      const candidate =
        discount.kedv_osszeg != null
          ? normalizeAmount(discount.kedv_osszeg)
          : discount.szazalek != null
            ? Math.round((baseFee * normalizeAmount(discount.szazalek)) / 100)
            : 0

      if (candidate <= 0) return

      const inWindow = prospectiveDate
        ? (windowStart ? prospectiveDate >= windowStart : true) && prospectiveDate <= windowEnd
        : sumPaymentsInRange(relevantPayments, windowStart, windowEnd) >= candidate
      if (inWindow && candidate < bestAmount) {
        bestAmount = candidate
        labels.length = 0
        labels.push(
          windowStart
            ? `Időszaki kedvezmény (${discount.kezdet}–${discount.hatarid})`
            : `Időszaki kedvezmény (${discount.hatarid})`,
        )
      }
    })

  return { amount: bestAmount, labels }
}

export function computeJarulekForMemberYear(params: {
  member: JarulekMemberLike
  year: number
  currentYear: number
  debtCalcMode: DebtCalcMode
  yearSettings: Record<number, JarulekYearSetting>
  discounts: JarulekDiscountRule[]
  exemptions: JarulekExemption[]
  payments: JarulekPaymentLike[]
  // (B/J6) PROSPEKTÍV mód a Tétel-rögzítő auto-összegéhez: a beírni kívánt befizetés dátuma. Ha
  // megadva, a korai-fizetés/időszaki kedvezmény a dátum alapján jár (nem a már befizetett alapján).
  // A Tartozás-lista NE adja meg → ott bit-azonos marad a viselkedés.
  prospectiveDate?: Date | null
}) {
  const { member, year, currentYear, debtCalcMode, yearSettings, discounts, exemptions, payments, prospectiveDate } = params

  if (isExemptForYear(member.id, member.familyId, exemptions, year)) {
    return {
      expected: 0,
      paid: getRelevantPayments(payments, member.id, member.familyId, year).reduce((sum, item) => sum + normalizeAmount(item.osszeg), 0),
      debt: 0,
      appliedRules: ['Felmentett'],
      usedYear: year,
    } satisfies JarulekComputationResult
  }

  const { usedYear, setting } = getYearSetting(year, yearSettings, debtCalcMode, currentYear)
  const baseFee = normalizeAmount(setting?.eves_jarulek)
  const relevantPayments = getRelevantPayments(payments, member.id, member.familyId, year)
  const paid = relevantPayments.reduce((sum, item) => sum + normalizeAmount(item.osszeg), 0)

  if (baseFee <= 0) {
    return {
      expected: 0,
      paid,
      debt: 0,
      appliedRules: [],
      usedYear,
    } satisfies JarulekComputationResult
  }

  const activeDiscounts = discounts.filter((discount) => discount.aktiv && discount.ev === year)
  const ageAdjusted = getAgeAdjustedFee(member, year, baseFee, activeDiscounts)
  const occupationAdjusted = getOccupationAdjustedFee(member, baseFee, activeDiscounts)
  // A kor- és foglalkozás-alapú kedvezmény közül a kedvezőbb (kisebb) megy
  // tovább az időszaki (early-payment) számításba.
  const bestBeforeEarly = Math.min(ageAdjusted.amount, occupationAdjusted.amount)
  const earlyAdjusted = getEarlyPaymentAdjustedFee(year, bestBeforeEarly, setting, activeDiscounts, relevantPayments, prospectiveDate)

  const expected = Math.min(baseFee, ageAdjusted.amount, occupationAdjusted.amount, earlyAdjusted.amount)
  const appliedRules = [...ageAdjusted.labels, ...occupationAdjusted.labels, ...earlyAdjusted.labels]

  return {
    expected,
    paid,
    debt: Math.max(0, expected - paid),
    appliedRules,
    usedYear,
  } satisfies JarulekComputationResult
}
