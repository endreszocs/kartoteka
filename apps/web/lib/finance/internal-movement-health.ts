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

/**
 * A kanonikus belső-mozgás számadási kódok.
 *
 * SZÁNDÉKOSAN itt, helyben — ez a modul tiszta számítás, nem függhet a UI-csomagtól
 * (a `@/lib/constants/finance` a teljes `@kartoteka/ui-app` barrelt re-exportálja,
 * benne React-komponensekkel).
 *
 * A széthúzás ellen ŐRSZEM véd: a `scripts/selftest-belso-mozgas-figyelmeztetes.mjs`
 * összeveti ezt a készletet a `BELSO_MOZGAS_ROGZITO_KODS`-szal
 * (packages/ui-app/src/finance/types.ts), és bukik, ha eltérnek.
 */
export const BELSO_MOZGAS_KODOK: ReadonlySet<string> = new Set([
  '300.01',
  '301.01',
  '400.01',
  '401.01',
  '402.02',
])

export interface InternalMovementRow {
  id: number
  osszeg: number
  /** 2026-07-11 (S11): RON-ekvivalens — a KERESZT-DEVIZÁS párosításhoz. Egy EUR→RON
   *  átutalásnál a két fél összege KÜLÖNBÖZŐ (1000 EUR ↔ ~4970 RON), ezért NEM a nyers
   *  összegre, hanem a RON-értékre kell párosítani. RON számlán == osszeg. */
  osszeg_ron?: number | null
  /** Átváltási árfolyam (devizás = ≠1). A tolerancia-alapú (kereszt-devizás) párosítás
   *  csak akkor lép be, ha legalább az egyik fél devizás. */
  arfolyam?: number | null
  datum: string | null
  belso_mozgas_xkey: string | null
  deleted?: boolean
  stornozott?: boolean
  /** 2026-07-10 (ÚJ #1): kassza (null) vs bank (id) oldal — a párosítás CSAK ellentétes
   *  helyszínű feleket köthet össze (kassza↔bank, vagy két KÜLÖNBÖZŐ bankszámla). */
  bankszamla_id?: number | null
  /** 2026-08-27: a tétel számadási kódja (pl. '301.01'). AZÉRT KELL, mert egy sor akkor is
   *  belső mozgás, ha `belso_mozgas_xkey` NÉLKÜL keletkezett — élesben pontosan ez történt:
   *  a banki import 7 db kassza→bank letétet SIMA BEVÉTELKÉNT írt be a 301.01 kódra,
   *  párosító kulcs nélkül, és az egészség-ellenőrzés ezért NEM LÁTTA ŐKET. */
  szamadasicelKod?: string | null
}

export interface UnpairedMovement {
  datum: string
  osszeg: number
  /** 'expense' = a KIADÁS-oldal párja hiányzik (pl. kasszai letétel, de a bankban még nincs).
   *  'income'  = a BEFIZETÉS-oldal párja hiányzik (pl. banki jóváírás, de a kasszában/másik számlán nincs). */
  side: 'income' | 'expense'
  description: string
  /** 2026-08-27: nincs párosító kulcsa — NEM a belső mozgás rögzítőn keresztül készült.
   *  Ez NEM oldódik meg magától egy banki importtól: emberi döntés kell hozzá. */
  orphan: boolean
  /** 2026-09-02 (Endre 4.): a párosítatlan sor azonosítója — a rögzítőben
   *  felkínált „párját rögzítem" listához (a kiválasztott tételt kell átvenni). */
  id: number
  /** Melyik számlán áll a párosítatlan fél (`null` = kassza). A rögzítő ebből
   *  tudja előre kitölteni a bankszámla-választót. */
  bankszamlaId: number | null
  /**
   * 2026-09-03: RON-ekvivalens és deviza-jelző. ⛔ MIÉRT KELL: a `toHalf` (177-188)
   * MÁR KISZÁMOLJA a `ronCents`-et és a `foreign` jelzőt, de eddig egyiket sem
   * vitte tovább az `items`-be — így a rögzítő választója a NYERS deviza-összeget
   * kínálta fel „RON" címkével, a mentés pedig `arfolyam: 1`-gyel könyvelte el.
   */
  osszegRon: number
  devizas: boolean
}

export interface InternalMovementHealth {
  unpairedCount: number
  /** 2026-08-27: ebből hány ÁRVA (párosító kulcs nélküli) — ezek NEM oldódnak meg
   *  maguktól egy banki importtól, emberi döntést igényelnek. */
  orphanCount: number
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
 * Az adott nap a SAJÁT évének határához közel esik-e (a párosítási ablakon belül)?
 *
 * ⛔ MIÉRT KELL (2026-08-27): a Pénzügy fül az adott ÉV sorait tölti be, és erre
 * a halmazra hívja az egészség-ellenőrzőt. Egy évfordulós átvezetés két lába
 * viszont ELTÉRŐ évre eshet — a kassza-láb december 31., a banki jóváírás
 * január 2. („úton lévő pénz"). Ilyenkor a ±7 napos ablak SOHA nem tud átnyúlni
 * az évhatáron: a kassza-láb a régi év nézetében, a bank-láb az új év nézetében
 * áll, MINDKETTŐ párosítatlanként — és a jelzés SOHA nem tűnik el magától,
 * mert nincs mit importálni. Örökké villogó piros riasztás egy HELYES páron.
 *
 * Ezért az évhatár közelébe eső, PÁROSÍTÓ KULCCSAL rendelkező sorokra nem
 * riasztunk: a kulcs léte bizonyítja, hogy a pár szabályosan létrejött, csak a
 * másik lába a szomszédos év nézetében van. (A kulcs NÉLKÜLI „árva" sorokra
 * továbbra is riasztunk — azok valóban hibásak, és nem oldódnak meg maguktól.)
 */
function evhatarKozeleben(datum: string): boolean {
  const d = (datum || '').slice(0, 10)
  const t = Date.parse(d)
  if (Number.isNaN(t)) return false
  const ev = Number(d.slice(0, 4))
  if (!Number.isFinite(ev)) return false
  const evElso = Date.parse(`${ev}-01-01`)
  const evUtolso = Date.parse(`${ev}-12-31`)
  const nap = 86_400_000
  return (t - evElso) / nap <= PAIRING_WINDOW_DAYS || (evUtolso - t) / nap <= PAIRING_WINDOW_DAYS
}

/**
 * Kiszámolja a párosítatlan belső mozgásokat a befizetés + kiadás listából.
 *
 * Egy sor akkor belső mozgás, ha VAN `belso_mozgas_xkey`-e, VAGY a `szamadasicelKod`-ja
 * a kanonikus belső-mozgás kódok egyike. (2026-08-27 előtt CSAK az első feltétel élt —
 * ezért a párosító kulcs nélkül keletkezett sorok láthatatlanok voltak az őr számára,
 * pedig épp azok a hibásak.) Törölt és sztornózott sorok mindkét esetben kimaradnak.
 *
 * Párosítás: minden KIADÁS-félhez megkeressük a legközelebbi, AZONOS ÖSSZEGŰ, még szabad
 * BEVÉTEL-felet, ha a dátumeltérés a `PAIRING_WINDOW_DAYS`-en belül van (a két fél dátuma
 * eltérhet a banki átfutás miatt). A párba nem állók maradnak „párosítatlan"-ként.
 */
export function computeInternalMovementHealth(
  income: InternalMovementRow[],
  expense: InternalMovementRow[],
): InternalMovementHealth {
  // 2026-08-27 — VAKFOLT JAVÍTVA. A korábbi feltétel `!!r.belso_mozgas_xkey` volt,
  // vagyis az őr CSAK a MÁR PÁROSÍTOTT sorokat nézte, és pontosan azokat szűrte ki,
  // amiket jeleznie kellett volna. Élesben így maradt néma 7 db kassza→bank letét
  // (65 425 RON), amit a banki import sima bevételként írt be a 301.01 kódra.
  // Egy sor MOSTANTÓL akkor is belső mozgás, ha csak a KATEGÓRIÁJA az.
  const isInternal = (r: InternalMovementRow) =>
    !!r.belso_mozgas_xkey ||
    (!!r.szamadasicelKod && BELSO_MOZGAS_KODOK.has(r.szamadasicelKod))
  const isActive = (r: InternalMovementRow) =>
    isInternal(r) && !r.deleted && !r.stornozott && !!r.datum

  type Half = {
    id: number
    datum: string
    cents: number
    /** RON-ekvivalens fillérben — a kereszt-devizás párosítás ezen egyezik. */
    ronCents: number
    /** Devizás fél? (árfolyam ≠ 1, vagy osszeg_ron ≠ osszeg) → tolerancia-alapú párosítás. */
    foreign: boolean
    osszeg: number
    matched: boolean
    bank: number | null | undefined
    /** 2026-08-27: nincs párosító kulcsa — vagyis NEM a belső mozgás rögzítőn
     *  keresztül keletkezett (pl. a banki import sima bevételként hozta be).
     *  Más üzenetet érdemel, mint a „a másik oldal még nincs importálva" eset. */
    orphan: boolean
  }
  const toHalf = (r: InternalMovementRow): Half => {
    const ron = Number(r.osszeg_ron ?? r.osszeg) || 0
    const cents = Math.round(r.osszeg * 100)
    const ronCents = Math.round(ron * 100)
    const foreign =
      (r.arfolyam != null && Number(r.arfolyam) !== 1) ||
      (r.osszeg_ron != null && ronCents !== cents)
    return {
      id: r.id, datum: r.datum!, cents, ronCents, foreign, osszeg: r.osszeg,
      matched: false, bank: r.bankszamla_id, orphan: !r.belso_mozgas_xkey,
    }
  }
  const incomes: Half[] = income.filter(isActive).map(toHalf)
  const expenses: Half[] = expense.filter(isActive).map(toHalf)

  // 2026-07-11 (S11): összeg-egyezés. HA mindkét fél RON (nem devizás) → PONTOS nyers
  // összeg egyezés (a régi, minden-RON viselkedés, false-pozitívok nélkül). HA legalább
  // az egyik fél DEVIZÁS → a RON-ekvivalensek közelségét nézzük toleranciával, mert a
  // banki átváltási árfolyam a BNR-től pár %-kal eltérhet (pl. 1000 EUR ↔ ~4970 RON).
  const amountsMatch = (a: Half, b: Half): boolean => {
    if (!a.foreign && !b.foreign) return a.cents === b.cents
    if (a.ronCents <= 0 || b.ronCents <= 0) return false
    // Tolerancia: a kisebbik RON-érték 5%-a (banki rés + kerekítés), min. 2 fillér.
    const tol = Math.max(2, Math.round(Math.min(a.ronCents, b.ronCents) * 0.05))
    return Math.abs(a.ronCents - b.ronCents) <= tol
  }

  // 2026-07-10 (ÚJ #1): egy pár két fele NEM lehet ugyanazon a helyszínen — a letétel
  // kassza-kiadás + bank-bevétel (ellentétes), bank↔bank mozgásnál pedig KÉT KÜLÖNBÖZŐ
  // számla. Enélkül egy párosítatlan kasszai letétel tévesen párba állt egy másik,
  // azonos összegű belső bevétellel. Ha a hívó nem ad bankszamla_id-t (legacy), a
  // helyszín-ellenőrzés kimarad (régi viselkedés).
  const sameLocation = (a: Half, b: Half): boolean => {
    if (a.bank === undefined || b.bank === undefined) return false
    if (a.bank === null && b.bank === null) return true
    return a.bank !== null && b.bank !== null && a.bank === b.bank
  }

  for (const e of expenses) {
    let best = -1
    let bestDist = Number.POSITIVE_INFINITY
    for (let i = 0; i < incomes.length; i++) {
      const inc = incomes[i]
      if (inc.matched || !amountsMatch(e, inc)) continue
      if (sameLocation(e, inc)) continue
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
    // Évhatáron átnyúló, SZABÁLYOS pár (van kulcsa) → nem riasztunk, lásd
    // az `evhatarKozeleben` magyarázatát. Az ÁRVA sorokra viszont igen.
    if (!e.orphan && evhatarKozeleben(e.datum)) continue
    unpairedIds.add(e.id)
    items.push({
      datum: e.datum.slice(0, 10),
      osszeg: e.osszeg,
      side: 'expense',
      orphan: e.orphan,
      id: e.id,
      bankszamlaId: e.bank ?? null,
      osszegRon: e.ronCents / 100,
      devizas: e.foreign,
      description: e.orphan
        ? 'Ez a tétel belső mozgás kategóriába került (pénz átvezetése két saját számla között), de NINCS párja, és nem is a belső mozgás rögzítőn keresztül készült. Ellenőrizd: valóban átvezetés, vagy tévedésből került ebbe a kategóriába? Amíg pár nélkül áll, torzítja a kiadás-összesent.'
        : 'Belső mozgás kiadás-oldala rögzítve (pl. kasszai letétel a bankba), de a fogadó oldal (banki jóváírás) még nincs egyeztetve — importáld a banki kivonatot.',
    })
  }
  for (const inc of incomes) {
    if (inc.matched) continue
    if (!inc.orphan && evhatarKozeleben(inc.datum)) continue
    unpairedIds.add(inc.id)
    items.push({
      datum: inc.datum.slice(0, 10),
      osszeg: inc.osszeg,
      side: 'income',
      orphan: inc.orphan,
      id: inc.id,
      bankszamlaId: inc.bank ?? null,
      osszegRon: inc.ronCents / 100,
      devizas: inc.foreign,
      description: inc.orphan
        ? 'Ez a tétel belső mozgás kategóriába került (pl. „Készpénzletétel a kasszából"), de NINCS párja, és nem is a belső mozgás rögzítőn keresztül készült — tipikusan banki importból származik. Amíg a kassza-oldali párja hiányzik, a rendszer ÚJ BEVÉTELNEK látja, pedig csak a saját pénz átvezetése: ez felfújja a bevétel-összesent.'
        : 'Belső mozgás befizetés-oldala rögzítve, de a kiadás-oldali párja (honnan érkezett a pénz) még hiányzik — importáld/egyeztesd a másik számlát.',
    })
  }

  // Rendezés: legújabb dátum elöl
  items.sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0))

  return {
    unpairedCount: items.length,
    orphanCount: items.filter((i) => i.orphan).length,
    items,
    unpairedIds,
  }
}
