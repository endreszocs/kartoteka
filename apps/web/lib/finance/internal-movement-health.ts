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
}

function key(datum: string, osszeg: number): string {
  // Az összeget centre kerekítjük a lebegőpontos eltérések elkerülésére.
  return `${datum}|${Math.round(osszeg * 100)}`
}

/**
 * Kiszámolja a párosítatlan belső mozgásokat a befizetés + kiadás listából.
 * Csak a `belso_mozgas_xkey != null`, nem törölt, nem sztornózott sorok számítanak.
 */
export function computeInternalMovementHealth(
  income: InternalMovementRow[],
  expense: InternalMovementRow[],
): InternalMovementHealth {
  const isActive = (r: InternalMovementRow) =>
    !!r.belso_mozgas_xkey && !r.deleted && !r.stornozott && !!r.datum

  // (dátum, összeg) → { income: n, expense: n }
  const groups = new Map<string, { income: number; expense: number; datum: string; osszeg: number }>()

  for (const r of income) {
    if (!isActive(r)) continue
    const k = key(r.datum!, r.osszeg)
    const g = groups.get(k) ?? { income: 0, expense: 0, datum: r.datum!, osszeg: r.osszeg }
    g.income++
    groups.set(k, g)
  }
  for (const r of expense) {
    if (!isActive(r)) continue
    const k = key(r.datum!, r.osszeg)
    const g = groups.get(k) ?? { income: 0, expense: 0, datum: r.datum!, osszeg: r.osszeg }
    g.expense++
    groups.set(k, g)
  }

  const items: UnpairedMovement[] = []
  for (const g of groups.values()) {
    const diff = g.income - g.expense
    if (diff === 0) continue
    const count = Math.abs(diff)
    if (diff > 0) {
      // Több befizetés-oldal, mint kiadás-oldal → a KIADÁS-oldali párok hiányoznak
      for (let i = 0; i < count; i++) {
        items.push({
          datum: g.datum,
          osszeg: g.osszeg,
          side: 'income',
          description:
            'Belső mozgás befizetés-oldala rögzítve, de a kiadás-oldali párja (honnan érkezett a pénz) még hiányzik — importáld/egyeztesd a másik számlát.',
        })
      }
    } else {
      // Több kiadás-oldal → a BEFIZETÉS-oldali párok hiányoznak (pl. kasszai letétel, bank nincs)
      for (let i = 0; i < count; i++) {
        items.push({
          datum: g.datum,
          osszeg: g.osszeg,
          side: 'expense',
          description:
            'Belső mozgás kiadás-oldala rögzítve (pl. kasszai letétel a bankba), de a fogadó oldal (banki jóváírás) még nincs egyeztetve — importáld a banki kivonatot.',
        })
      }
    }
  }

  // Rendezés: legújabb dátum elöl
  items.sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0))

  return { unpairedCount: items.length, items }
}
