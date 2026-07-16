import type { DebtCalcMode } from './types'
import { formatMonthDay, formatMonthDayRange } from './month-day'

/**
 * A MAI naptári nap Romániában (Europe/Bucharest), UTC-éjfélre normalizálva.
 *
 * MIÉRT KELL: a szerver UTC-ben jár (Railway), Románia UTC+2/+3. Nyers `new Date()`
 * mellett romániai július 2-án 01:30-kor a szerver még július 1-et látna → a lejárt
 * kedvezményes ablakot még érvényesnek hinné. A `parseMonthDay` UTC-éjfelet ad, ezért
 * itt is UTC-éjfélre normalizálunk — hogy almát almával hasonlítsunk.
 *
 * A SZERVER hívja (a szerver-action), SOHA a kliens: (1) különben a szerver-render és
 * a kliens-hidratáció eltérő összeget adna, (2) egy elállított gépóra megváltoztatná a
 * számlázott összeget, (3) megtörne a „web = desktop bit-azonos" szerződés.
 */
export function todayInBucharest(): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date())
  return new Date(`${ymd}T00:00:00Z`)
}

/**
 * Az egyházfenntartói járulék HIVATALOSAN 18 éves kortól jár (egyháztörvény —
 * Szőcs Endre, 2026-07-16). Ezért nem gyülekezetenként állítható paraméter.
 *
 * 2026-07-16 előtt a rendszernek EGYÁLTALÁN nem volt korhatára: egy újszülöttre
 * is a teljes éves díjat várta el. A régi Excel-könyvelés sem ismerte, tehát a
 * történeti adat is így terhelte a gyerekeket — a korhatár ezért VISSZAMENŐLEG
 * is érvényes (user-döntés): a régi szám volt hibás, a javítás helyreállítja.
 *
 * Az életkor ÉVKÜLÖNBSÉGGEL számolódik (getAgeForYear: year - birthYear), nem
 * pontos születésnappal — „aki abban az évben tölti a 18-at, arra az évre már
 * fizet". Ez konzisztens a kódbázis többi 18-as kapujával (választói névjegyzék,
 * éves jelentés) és a járulék év-szintű természetével (nincs „fél évig fizet").
 */
export const JARULEK_MIN_AGE = 18

/** A kiskorúság saját címkéje — SZÁNDÉKOSAN nem „Felmentett”, mert az a
 *  `felmentes` tábla szerinti, presbitériumi méltányossági mentesség. A kettő
 *  összemosása ~300 gyereket tüntetne fel „felmentettként” a listán. */
export const JARULEK_MINOR_RULE = 'Kiskorú (18 év alatt)'

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

/**
 * A kedvezmény-mezők KÉT eltérő szemantikájú családba esnek, és ezt a UI feliratai
 * rögzítik (fee-discounts-manager.tsx):
 *   - SZÁZALÉK (`szazalek`)  → LEVONANDÓ kedvezmény.  „Kedvezmény (%)" /
 *     „a kedvezmény százalékával kevesebbet fizet" → a fizetendő a MARADÉK.
 *   - RON-ÖSSZEG (`kedv_osszeg`, `fix_osszeg`) → maga a FIZETENDŐ összeg.
 *     „Kedvezményes összeg (RON)" / „Fizetendő összeg (RON) — 0 = mentesül".
 *
 * 2026-07-16: a `kor` ág korábban a százalékot is fizetendőként értelmezte
 * (baseFee * szazalek / 100), tehát pont fordítva: 0% → 0 RON (ingyen),
 * 100% → teljes díj. Az űrlap 50%-os alapértéke elrejtette (ott a két képlet
 * egybeesik). A százalékot 100-ra vágjuk, hogy a fizetendő ne mehessen 0 alá.
 */
function applyPercentDiscount(baseFee: number, szazalek: unknown) {
  const percent = Math.min(100, normalizeAmount(szazalek))
  return Math.round((baseFee * (100 - percent)) / 100)
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
            ? applyPercentDiscount(baseFee, discount.szazalek)
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

/** Egy időszak-szabály „ára" = a fizetendő összeg. 0/érvénytelen → null (nem szabály). */
function getWindowPrice(discount: JarulekDiscountRule, baseFee: number): number | null {
  const price =
    discount.kedv_osszeg != null
      ? normalizeAmount(discount.kedv_osszeg)
      : discount.szazalek != null
        ? applyPercentDiscount(baseFee, discount.szazalek)
        : 0
  return price > 0 ? price : null
}

/**
 * A korai-fizetési (határidős / időszaki) kedvezmény.
 *
 * 2026-07-16 — ÁTALAKÍTVA. Két KÜLÖN kérdést teszünk fel, és a kedvezőbbet vesszük:
 *
 *   MEGSZERZETT (earned)      — „melyik ablak árát szerezte meg a TÉNYLEGES befizetéseivel?”
 *                               Csak a múltbeli befizetésektől függ → IDŐBEN ÁLLANDÓ.
 *   ELÉRHETŐ  (attainable)    — „ha `asOf`-kor fizetne, mennyibe kerülne?”
 *                               A még LE NEM JÁRT ablakok legolcsóbbika.
 *
 *   elvárt = min(megszerzett, elérhető)
 *
 * MIÉRT ÍGY (Szőcs Endre kérése: „ha még a kedvezményes időszakban vagyunk, vegye
 * figyelembe, melyik időszakban vagyunk”): eddig a kedvezmény CSAK akkor járt, ha a
 * tag már ki is fizette — aki januárban még nem fizetett, annál a teljes díj állt,
 * pedig javában a kedvezményes ablakban voltunk.
 *
 * A CSAPDA, amit ez a szerkezet kizár: ha naivan „a mai nap ára” lenne az elvárás,
 * akkor aki január 15-én kifizette a 160-at, november 16-án hirtelen 60 lej
 * tartozást kapna (elvárt 220 − fizetett 160). Ez minden korán fizetőnél, minden év
 * november 2-től bekövetkezne. A `min` ezt SZERKEZETILEG zárja ki: a `megszerzett`
 * konstans, az `elérhető` az idővel monoton nem csökken, tehát a minimumuk soha nem
 * emelkedhet a `megszerzett` fölé → aki egyszer megfizette az ablak árát, annak a
 * tartozása nem fordulhat pozitívba.
 *
 * FONTOS (D4): az elérhetőségnél az ablak VÉGE számít (`vég >= asOf`), NEM az, hogy
 * „a mai nap az ablakban van-e”. A `kezdet` a befizetés BESOROLÁSÁHOZ kell (melyik
 * ablakban landolt a pénz), az ÁRAZÁSHOZ nem. Különben (a) két ablak közti résnél,
 * és (b) a jövő évi nézetben (ahol az ablakok még el sem kezdődtek) hamis teljes díj
 * villanna. Régi évnél minden ablak vége < asOf → elérhető = teljes díj, magától.
 */
function getEarlyPaymentAdjustedFee(
  year: number,
  baseFee: number,
  yearSetting: JarulekYearSetting | null,
  discounts: JarulekDiscountRule[],
  relevantPayments: JarulekPaymentLike[],
  /**
   * Mely NAPRA árazunk?
   *  - Tétel-rögzítő: a beírni kívánt befizetés dátuma („ha ekkor fizet, mennyi?”)
   *  - Tartozás-lista: a MAI nap (a szervertől, Europe/Bucharest szerint)
   *  - null/undefined: nincs prospektív árazás → csak a `megszerzett` számít
   *    (a 2026-07-16 előtti viselkedés, a régi hívók bit-azonosan működnek tovább).
   */
  asOfDate?: Date | null,
) {
  // ── 1) MEGSZERZETT — csak a tényleges befizetésekből, időben állandó ──────────
  let earned = baseFee
  let earnedLabel: string | null = null

  const defaultDiscountAmount = normalizeAmount(yearSetting?.jarulek_kedvezmenyes)
  const defaultDeadline = parseMonthDay(year, yearSetting?.jarulek_hatarid)
  if (defaultDiscountAmount > 0 && defaultDeadline) {
    const paidByDeadline = sumPaymentsUntil(relevantPayments, defaultDeadline)
    if (paidByDeadline >= defaultDiscountAmount && defaultDiscountAmount < earned) {
      earned = defaultDiscountAmount
      earnedLabel = `Kedvezményes határidő (${formatMonthDay(yearSetting?.jarulek_hatarid)})`
    }
  }

  // ── 2) ELÉRHETŐ — a még le nem járt ablakok legolcsóbbika ─────────────────────
  let attainable = baseFee
  let attainableLabel: string | null = null

  if (asOfDate && defaultDiscountAmount > 0 && defaultDeadline) {
    // A határidő NAPJA is jár (23:59:59-ig).
    const deadlineEnd = new Date(defaultDeadline.getTime() + 24 * 60 * 60 * 1000 - 1)
    if (asOfDate.getTime() <= deadlineEnd.getTime() && defaultDiscountAmount < attainable) {
      attainable = defaultDiscountAmount
      attainableLabel = `Kedvezményes határidő (${formatMonthDay(yearSetting?.jarulek_hatarid)})`
    }
  }

  for (const discount of discounts) {
    if (discount.tipus !== 'idoszak' || !discount.aktiv) continue

    const deadline = parseMonthDay(year, discount.hatarid)
    if (!deadline) continue

    const price = getWindowPrice(discount, baseFee)
    if (price == null) continue

    // A kezdet a BESOROLÁSHOZ kell; ha nincs, az alsó határ nyitott (régi viselkedés).
    const windowStart = parseMonthDay(year, discount.kezdet)
    const windowEnd = new Date(deadline.getTime() + 24 * 60 * 60 * 1000 - 1)
    const label = discount.kezdet
      ? `Időszaki kedvezmény (${formatMonthDayRange(discount.kezdet, discount.hatarid)})`
      : `Időszaki kedvezmény (${formatMonthDay(discount.hatarid)})`

    // MEGSZERZETT: befizetett-e eleget EBBEN az ablakban?
    if (sumPaymentsInRange(relevantPayments, windowStart, windowEnd) >= price && price < earned) {
      earned = price
      earnedLabel = label
    }

    // ELÉRHETŐ: az ablak még NEM járt le (a `kezdet` itt szándékosan nem számít).
    if (asOfDate && asOfDate.getTime() <= windowEnd.getTime() && price < attainable) {
      attainable = price
      attainableLabel = label
    }
  }

  // ── 3) A kedvezőbb nyer ───────────────────────────────────────────────────────
  const amount = Math.min(earned, attainable)
  // Egyenlőségnél a MEGSZERZETT címkéje nyer: az már tény, nem lehetőség.
  const label = earned <= attainable ? earnedLabel : attainableLabel
  return { amount, labels: label ? [label] : [] }
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
  /**
   * (B/J6) A Tétel-rögzítő auto-összegéhez: a beírni kívánt befizetés DÁTUMA
   * („ha ekkor fizet, mennyi?”).
   *
   * 2026-07-16: ez már nem hagyja figyelmen kívül a MÁR befizetett összeget — a
   * motor a `min(megszerzett, elérhető)`-t adja. Ez egyben megszüntet egy élő
   * hibát: a jan. 15-én 160-at fizető tagnak nov. 15-én 60 lejt ajánlott fel.
   */
  prospectiveDate?: Date | null
  /**
   * 2026-07-16 — a MAI nap (a szervertől, Europe/Bucharest szerint), hogy a
   * Tartozás-lista az AKTUÁLIS kedvezményes időszak árát mutassa a még nem
   * fizetőknél is. Ha nincs megadva, a 2026-07-16 előtti viselkedés marad
   * (csak a már megfizetett kedvezmény jár) — a régi hívók bit-azonosak.
   * A `prospectiveDate` erősebb: ha az meg van adva, azt árazzuk.
   */
  asOfDate?: Date | null
}) {
  const { member, year, currentYear, debtCalcMode, yearSettings, discounts, exemptions, payments, prospectiveDate, asOfDate } = params

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

  // 18 éves korhatár. Az ÉLETKORT mindig a `year`-ből számoljuk, SOHA az
  // `usedYear`-ből: a debtCalcMode='aktualis' a DÍJAT tolja a mai évre, az
  // életkort nem. Aki 2020-ban 10 éves volt, a 2020-as sorra kiskorú akkor is,
  // ha ma már 16. A `paid` szándékosan megmarad: a családi befizetés a gyereknél
  // is látszik, és ha lenulláznánk, a lelkész azt hinné, a család nem fizetett.
  // sz_datum hiányában (age === null, ide értve az 1900 előtti évet is) MARAD a
  // teljes díj: a néma alulszámlázás rosszabb, mint a látható túlszámlázás — így
  // a hiányzó dátum a listán feltűnik és pótolható.
  const age = getAgeForYear(member, year)
  if (age !== null && age < JARULEK_MIN_AGE) {
    return {
      expected: 0,
      paid,
      debt: 0,
      appliedRules: [JARULEK_MINOR_RULE],
      usedYear,
    } satisfies JarulekComputationResult
  }

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
  // A 'jovedelem' (szociális) típusnak SZÁNDÉKOSAN nincs ága — NE add hozzá!
  // A `jarulek_kedvezmeny` táblán nincs `id_szemely`/`id_csalad` (csak
  // `congregation_id`), tehát egy ilyen szabály nem szűkíthető egy tagra: az
  // egész gyülekezetre érvényesülne. Egy „súlyos beteg tag 100%" szabály így
  // MINDENKIT ingyenessé tenne. A személyre szóló szociális mentesség helye a
  // `felmentes` tábla (id_szemely + év-intervallum + indok), amit a fenti
  // isExemptForYear() már érvényesít. Részleges (pl. 50%) személyre szóló
  // kedvezményhez előbb a séma kell hogy bővüljön.
  //
  // A kor- és foglalkozás-alapú kedvezmény közül a kedvezőbb (kisebb) megy
  // tovább az időszaki (early-payment) számításba.
  const bestBeforeEarly = Math.min(ageAdjusted.amount, occupationAdjusted.amount)
  // A `prospectiveDate` erősebb: ha a Tétel-rögzítő megadta a beírni kívánt befizetés
  // dátumát, ARRA a napra árazunk; egyébként a MAI napra (asOfDate). Ha egyik sincs,
  // marad a régi „csak megfizetve jár" viselkedés.
  const earlyAdjusted = getEarlyPaymentAdjustedFee(
    year,
    bestBeforeEarly,
    setting,
    activeDiscounts,
    relevantPayments,
    prospectiveDate ?? asOfDate ?? null,
  )

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
