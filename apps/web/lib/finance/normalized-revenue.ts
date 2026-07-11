/**
 * Előfizetési bevétel — KÖZÖS, tiszta számítás-helper.
 *
 * Ez a fájl SZÁNDÉKOSAN nem 'use server' — tisztán determinisztikus,
 * mellékhatás-mentes függvényeket exportál, hogy a summary, a tier-bontás és
 * a forecast MIND ugyanazt a logikát használja. Így a korábbi három hiba
 * (a/b/c) egy helyen, strukturálisan szűnik meg:
 *
 *   (a) minden `tipus` a maga díja szerint ad bevételt (teszt/ingyenes = 0,
 *       kedvezmény = dij_ron), nem csak a havi/eves;
 *   (b) az éves díj MINDIG /12 kerül a havi bucketbe (nincs 12× túlbecslés);
 *   (c) csak az érvényes időszakú (kezdet ≤ asOf ≤ veg) és hozzáférés-aktív
 *       (access_status ∈ {active, trial, grace}) előfizetés ad bevételt.
 *
 * A `felar_ron` (speciális igény havi felára) a havi értékhez hozzáadódik,
 * és éves szinten ×12.
 */

export type SubscriptionAccessStatus =
  | 'active' | 'trial' | 'free' | 'suspended' | 'grace'

export type NormalizableSubscriptionType =
  | 'havi' | 'eves' | 'teszt' | 'kedvezmeny' | 'ingyenes'

/** Bevétel-számításhoz minimálisan szükséges előfizetés-mezők. */
export interface NormalizableSubscription {
  tipus: string | null | undefined
  dij_ron?: number | null
  /** Kezdő dátum ('YYYY-MM-DD'). null → mindig érvényes eleje. */
  kezdet?: string | null
  /** Vég dátum ('YYYY-MM-DD'). null → határozatlan (∞). */
  veg?: string | null
  /** Hozzáférés-státusz. Hiányzó/ismeretlen → 'active' (biztonságos default). */
  access_status?: string | null
  /** Speciális igény havi felára (RON). */
  felar_ron?: number | null
}

/** Az árazási sáv díjai (fallback, ha a subscription dij_ron NULL). */
export interface NormalizableTier {
  havi_dij_ron?: number | null
  eves_dij_ron?: number | null
}

/**
 * Azok az access_status értékek, amelyek bevételt generálnak.
 * A 'free' és 'suspended' NEM (ingyenes hozzáférés / leállítva).
 */
const REVENUE_STATUSES = new Set<string>(['active', 'trial', 'grace'])

function numOrZero(v: number | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Nem-null explicit díj vagy null (a fallback eldöntéséhez). */
function explicitFee(v: number | null | undefined): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/** Dátum-szerű érték → 'YYYY-MM-DD' (nap-granularitás, TZ-biztos összevetéshez). */
function toIsoDate(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Igaz, ha az előfizetés az `asOf` napon bevételt generál:
 *   - access_status ∈ {active, trial, grace} (hiányzó → 'active'), ÉS
 *   - kezdet ≤ asOf ≤ (veg ?? ∞).
 *
 * BIZTONSÁGOS DEFAULT: hiányzó/ismeretlen access_status → 'active' (bevétel),
 * hiányzó kezdet → nincs alsó korlát, hiányzó veg → határozatlan.
 */
export function isSubscriptionRevenueActive(
  sub: NormalizableSubscription,
  asOf: Date | string = new Date(),
): boolean {
  const status = (sub.access_status ?? 'active') || 'active'
  if (!REVENUE_STATUSES.has(status)) return false

  const asOfIso = toIsoDate(asOf)
  if (sub.kezdet) {
    const startIso = toIsoDate(sub.kezdet)
    if (asOfIso < startIso) return false
  }
  if (sub.veg) {
    const endIso = toIsoDate(sub.veg)
    if (asOfIso > endIso) return false
  }
  return true
}

/**
 * Az előfizetés HAVI alapdíja (felár nélkül), időszűrés/access nélkül —
 * pusztán a `tipus` + díjak alapján. Az éves díjat /12-vel osztja.
 */
function baseMonthlyFeeRon(
  sub: NormalizableSubscription,
  tier: NormalizableTier | null | undefined,
): number {
  const dij = explicitFee(sub.dij_ron)
  switch (sub.tipus) {
    case 'havi':
      return dij ?? numOrZero(tier?.havi_dij_ron)
    case 'eves':
      return (dij ?? numOrZero(tier?.eves_dij_ron)) / 12
    case 'kedvezmeny':
      // Kedvezményes havi díj — az explicit dij_ron a mérvadó, fallback a
      // sáv havi díja.
      return dij ?? numOrZero(tier?.havi_dij_ron)
    case 'teszt':
    case 'ingyenes':
      // Teszt / ingyenes = 0, akkor is, ha dij_ron véletlenül ki van töltve.
      return 0
    default:
      // Ismeretlen típus — bevétel-oldalon konzervatív 0.
      return 0
  }
}

/**
 * NORMALIZÁLT HAVI bevétel RON-ban egyetlen előfizetésre.
 * A summary, a tier-bontás és a forecast KÖZÖS belépési pontja.
 *
 * @param sub    Előfizetés (tipus + dij_ron + kezdet/veg + access_status + felar_ron)
 * @param tier   A kapcsolt árazási sáv (díj-fallbackhez), vagy null
 * @param asOf   Melyik napra számolunk (default: ma)
 */
export function normalizedMonthlyRevenueRon(
  sub: NormalizableSubscription,
  tier: NormalizableTier | null | undefined = null,
  asOf: Date | string = new Date(),
): number {
  if (!isSubscriptionRevenueActive(sub, asOf)) return 0
  const base = baseMonthlyFeeRon(sub, tier)
  const felar = numOrZero(sub.felar_ron)
  return round2(base + felar)
}

/**
 * NORMALIZÁLT ÉVES bevétel RON-ban egyetlen előfizetésre.
 * Definíció szerint = havi × 12 (a havi típusnál 12×havi, az éves típusnál a
 * teljes éves díj, mert a havi már /12). A felár is évesítve (×12).
 */
export function normalizedAnnualRevenueRon(
  sub: NormalizableSubscription,
  tier: NormalizableTier | null | undefined = null,
  asOf: Date | string = new Date(),
): number {
  if (!isSubscriptionRevenueActive(sub, asOf)) return 0
  const base = baseMonthlyFeeRon(sub, tier) * 12
  const felar = numOrZero(sub.felar_ron) * 12
  return round2(base + felar)
}
