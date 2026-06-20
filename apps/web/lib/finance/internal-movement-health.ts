/**
 * Belső mozgás párosítás-egészség (2026-06-10, felhasználói kérés).
 *
 * A felhasználó kérése: „ha a kasszában rögzítünk letételt a bankba, de a bankban még nem
 * jelenik meg (mert nem importáltuk/egyeztettük össze), akkor a pénzügyi oldalon piros
 * felkiáltójel jelzi a hibát. Amint a banki import + egyeztetés rögzítette a banki oldalt is,
 * a hiba törlődik. Ugyanígy fordítva, vagy bank-bank mozgásnál."
 *
 * **Származtatott (migráció nélküli) megközelítés — önjavító:**
 * Minden TELJES belső mozgás kettős könyvelés: pontosan EGY belső befizetés (pénz érkezik
 * valahová) ÉS EGY belső kiadás (pénz távozik valahonnan), AZONOS dátummal és összeggel.
 *   - Kassza→Bank letétel:  kassza KIADÁS (400.01) + bank BEFIZETÉS (301.01)
 *   - Bank→Kassza felvét:   kassza BEFIZETÉS (300.01/401.01) + bank KIADÁS (401.01)
 *   - Bank→Bank átutalás:   egyik bank KIADÁS + másik bank BEFIZETÉS (402.02)
 *
 * Ezért egy adott (dátum, összeg) párnál a belső befizetések és belső kiadások SZÁMÁNAK
 * EGYEZNIE kell. Ha nem egyezik → annyi PÁROSÍTATLAN mozgás van, amennyi a különbség.
 * A jelzés AUTOMATIKUSAN eltűnik, amint a hiányzó oldal (pl. banki import) bekerül — mert
 * mindig a valós adatból számolunk, nincs beragadó státusz.
 */

export interface InternalMovementRow {
  id: number
  osszeg: number
  datum: string | null
  belso_mozgas_xkey: string | null
  deleted?: boolean
  stornozott?: boolean
}

export interface UnpairedMovement {
  datum: string
  osszeg: number
  /** 'expense' = a KIADÁS-oldal párja hiányzik (pl. kasszai letétel, de a bankban még nincs).
   *  'income'  = a BEFIZETÉS-oldal párja hiányzik (pl. banki jóváírás, de a kasszában/másik számlán nincs). */
  side: 'income' | 'expense'
  description: string
}

export interface InternalMovementHealth {
  unpairedCount: number
  items: UnpairedMovement[]
  /** A párosítatlan belső-mozgás sorok azonosítói (befizetes/kiadas id) — a táblában a piros
   *  „nincs banki párja" jelzéshez. Ami NINCS benne, az párosítva van (nem „várakozik"). */
  unpairedIds: Set<number>
}

/** Két dátum-string (nap) közti különbség napokban; NaN/üres → végtelen (nem párosít). */
function dayDiff(a: string, b: string): number {
  const ta = Date.parse((a || '').slice(0, 10))
  const tb = Date.parse((b || '').slice(0, 10))
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.POSITIVE_INFINITY
  return Math.abs(ta - tb) / 86_400_000
}

/** Azonos összegű ellenoldal keresésekor megengedett dátumeltérés (nap). A banki jóváírás
 *  gyakran 1-2 nappal a kasszai letét után/előtt jelenik meg — ettől még EGY mozgás párja. */
const PAIRING_WINDOW_DAYS = 7

/**
 * Kiszámolja a párosítatlan belső mozgásokat a befizetés + kiadás listából.
 * Csak a `belso_mozgas_xkey != null`, nem törölt, nem sztornózott sorok számítanak.
 *
 * Párosítás: minden KIADÁS-félhez megkeressük a legközelebbi, AZONOS ÖSSZEGŰ, még szabad
 * BEVÉTEL-felet, ha a dátumeltérés a `PAIRING_WINDOW_DAYS`-en belül van (a két fél dátuma
 * eltérhet a banki átfutás miatt). A párba nem állók maradnak „párosítatlan"-ként.
 */
export function computeInternalMovementHealth(
  income: InternalMovementRow[],
  expense: InternalMovementRow[],
): InternalMovementHealth {
  const isActive = (r: InternalMovementRow) =>
    !!r.belso_mozgas_xkey && !r.deleted && !r.stornozott && !!r.datum

  type Half = { id: number; datum: string; cents: number; osszeg: number; matched: boolean }
  const incomes: Half[] = income
    .filter(isActive)
    .map((r) => ({ id: r.id, datum: r.datum!, cents: Math.round(r.osszeg * 100), osszeg: r.osszeg, matched: false }))
  const expenses: Half[] = expense
    .filter(isActive)
    .map((r) => ({ id: r.id, datum: r.datum!, cents: Math.round(r.osszeg * 100), osszeg: r.osszeg, matched: false }))

  for (const e of expenses) {
    let best = -1
    let bestDist = Number.POSITIVE_INFINITY
    for (let i = 0; i < incomes.length; i++) {
      const inc = incomes[i]
      if (inc.matched || inc.cents !== e.cents) continue
      const dist = dayDiff(e.datum, inc.datum)
      if (dist <= PAIRING_WINDOW_DAYS && dist < bestDist) {
        best = i
        bestDist = dist
      }
    }
    if (best >= 0) {
      incomes[best].matched = true
      e.matched = true
    }
  }

  const unpairedIds = new Set<number>()
  const items: UnpairedMovement[] = []
  for (const e of expenses) {
    if (e.matched) continue
    unpairedIds.add(e.id)
    items.push({
      datum: e.datum.slice(0, 10),
      osszeg: e.osszeg,
      side: 'expense',
      description:
        'Belső mozgás kiadás-oldala rögzítve (pl. kasszai letétel a bankba), de a fogadó oldal (banki jóváírás) még nincs egyeztetve — importáld a banki kivonatot.',
    })
  }
  for (const inc of incomes) {
    if (inc.matched) continue
    unpairedIds.add(inc.id)
    items.push({
      datum: inc.datum.slice(0, 10),
      osszeg: inc.osszeg,
      side: 'income',
      description:
        'Belső mozgás befizetés-oldala rögzítve, de a kiadás-oldali párja (honnan érkezett a pénz) még hiányzik — importáld/egyeztesd a másik számlát.',
    })
  }

  // Rendezés: legújabb dátum elöl
  items.sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0))

  return { unpairedCount: items.length, items, unpairedIds }
}
