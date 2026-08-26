/**
 * Leltar 3_43 — az import ÁTNÉZŐ (review) rétege (2026-08-27).
 *
 * MIÉRT KÜLÖN, TISZTA MODUL: a varázsló javító-lépése a KLIENSEN fut (élő
 * visszajelzés gépelés közben), a végleges import viszont a SZERVEREN — és a
 * kettőnek betűre ugyanazt kell gondolnia arról, hogy mi számít hibának.
 * Ha a kliens „rendben"-t mutat, a szerver pedig kidobja a sort, az pontosan
 * az a néma adatvesztés, ami miatt Endre 217 kihagyott tételt kapott.
 * Ezért itt NINCS IO és NINCS React: ugyanez a fájl fut mindkét oldalon és a
 * selftestben is.
 *
 * A FOLYAMAT:
 *   1. a szerver beolvassa a munkafüzetet (leltar343-parse) és feldolgozza
 *      (leltar343-shared) → rekordok + hibák;
 *   2. `epitReviewSorok` MINDKETTŐBŐL egyetlen, egységes sorlistát épít — az
 *      elutasított sorok is bekerülnek, szerkeszthető alakban;
 *   3. a kliens javít (mező-szerkesztés + feloldás-választás);
 *   4. `alkalmazJavitasok` + `ellenorizSorok` mindkét oldalon lefut;
 *   5. `osztSzamokat` determinisztikusan kiadja az új leltári számokat.
 */

import {
  INVENTORY_CATEGORY_PREFIXES,
  nextLeltariSzam,
  type InventoryCategory,
} from '@kartoteka/ui-app'
import type {
  Leltar343Hiba,
  Leltar343HibaKod,
  Leltar343Lap,
  Leltar343LapEredmeny,
  Leltar343NyersSor,
} from './leltar343-shared'
import { osszerakDatum, splitHelyszinFelelos } from './leltar343-shared'

// ---------------------------------------------------------------------------
// Típusok
// ---------------------------------------------------------------------------

/**
 * Mi történjen a sorral?
 *   import   — menjen be új tételként (üres leltári szám esetén a rendszer számoz)
 *   uj_szam  — menjen be, de a rendszer ADJON NEKI ÚJ számot (ütközés feloldása)
 *   felulir  — a MÁR LÉTEZŐ, azonos leltári számú tételt frissítsük ezzel a sorral
 *   kihagy   — ne menjen be
 */
export type Leltar343Feloldas = 'import' | 'uj_szam' | 'felulir' | 'kihagy'

export const LELTAR343_FELOLDASOK: Leltar343Feloldas[] = ['import', 'uj_szam', 'felulir', 'kihagy']

export const LELTAR343_FELOLDAS_CIMKE: Record<Leltar343Feloldas, string> = {
  import: 'Bevitel',
  uj_szam: 'Új leltári számmal',
  felulir: 'Meglévő frissítése',
  kihagy: 'Kihagyás',
}

/** A varázslóban SZERKESZTHETŐ mezők (a többi a fájlból jön, változatlanul). */
export const LELTAR343_SZERKESZTHETO_MEZOK = [
  'megnevezes',
  'szerzo',
  'megjegyzes',
  'leltari_szam',
  'helyszin',
  'felelos_neve',
  'beszerzes_datuma',
  'beszerzesi_ertek',
  'mennyiseg',
  'mertekegyseg',
  'beszerzes_bizonylat',
] as const

export type Leltar343Mezo = typeof LELTAR343_SZERKESZTHETO_MEZOK[number]

export interface Leltar343ReviewUzenet {
  szint: 'hiba' | 'figyelmeztetes'
  kod?: Leltar343HibaKod
  uzenet: string
}

/** Egy átnézhető/szerkeszthető sor a varázslóban (JSON-barát: állapot-hordozó). */
export interface Leltar343ReviewSor {
  /** Stabil azonosító: `${lap}:${excel-sor}` — a javítás-térkép kulcsa. */
  id: string
  lap: string
  lapCimke: string
  sor: number
  kategoria: InventoryCategory
  megnevezes: string
  szerzo: string | null
  megjegyzes: string | null
  leltari_szam: string | null
  helyszin: string | null
  felelos_neve: string | null
  beszerzes_datuma: string | null
  /** EGYSÉGÁR (a munkafüzet L oszlopa / mennyiség). */
  beszerzesi_ertek: number
  mennyiseg: number
  mertekegyseg: string
  beszerzes_bizonylat: string | null
  torles_datuma: string | null
  torles_bizonylat: string | null
  is_deleted: boolean
  hasznalati_ido_ev: number | null
  alapeszkoz_csoport: 1 | 2 | 3 | null
  ertek_modositas: number
  ertek_modositas_megjegyzes: string | null
  /** A beolvasáskor keletkezett üzenetek (kontextus; nem szerkeszthető). */
  uzenetek: Leltar343ReviewUzenet[]
  /** true = a beolvasás ELUTASÍTOTTA a sort — csak javítás után mehet be. */
  elutasitott: boolean
  /** Mi történjen vele (a felhasználó dönti el; alapérték a beolvasásból). */
  feloldas: Leltar343Feloldas
}

export type Leltar343GondKod =
  | Leltar343HibaKod
  | 'ures_megnevezes'
  | 'ervenytelen_mennyiseg'
  | 'negativ_ertek'
  | 'szam_utkozes_db'
  | 'szam_utkozes_kivezetett'
  | 'szam_utkozes_fajl'
  | 'felulirhatatlan'
  | 'veglegesitett_ev'
  | 'automatikus_szam'

export interface Leltar343Gond {
  szint: 'hiba' | 'figyelmeztetes'
  kod: Leltar343GondKod
  uzenet: string
  /** Melyik mezőt kell javítani (a varázsló ide fókuszál). */
  mezo?: Leltar343Mezo
}

export interface Leltar343EllenorzesCtx {
  /** A rendszerben MÁR kiadott, AKTÍV leltári számok. */
  aktivSzamok: string[]
  /**
   * Véglegesítve van-e a CÉL-gyülekezet tárgyévi vagyonleltári jelentése?
   *
   * ⚠️ Endre döntése (2026-08-27): ilyenkor a MEGLÉVŐ tétel felülírása TILOS —
   * „azt csak egyházmegyei engedéllyel lehetséges". Az engedély a rendszerben
   * a meglévő feloldás-kérelem útja: a lelkész feloldást kér, az egyházmegye
   * jóváhagyja, és ezzel a `leltar_finalized` visszaáll `false`-ra
   * (dashboard-egyhazmegye/actions.ts) — vagyis ez a zászló EGYBEN az
   * engedély állapota is. Új tétel bevitele NEM tilos: a véglegesítés a
   * JELENTÉST zárja le, nem a tétel-rögzítést (a rendszer saját szövege).
   */
  veglegesitve?: boolean
  /**
   * KIVEZETETT (soft-deleted) tételek számai. A DB részleges egyediségi
   * indexe (leltar_tetelek_cong_leltari_szam_key … WHERE is_deleted = false)
   * ezeket ÚJRA KIADHATÓNAK tekinti — ezért itt csak figyelmeztetünk.
   */
  kivezetettSzamok?: string[]
}

export interface Leltar343Osszegzes {
  osszes: number
  /** Új tételként beszúrandó sorok. */
  beszurando: number
  /** Meglévő tételt frissítő sorok. */
  felulirando: number
  /** Rendszer által kiadott új számot kapó sorok (a beszúrandók részhalmaza). */
  ujSzamos: number
  kihagyando: number
  /** Blokkoló hibás sorok (ezek NEM mehetnek be javítás nélkül). */
  hibas: number
  /** Figyelmeztetett, de importálható sorok. */
  figyelmeztetett: number
}

export interface Leltar343Ellenorzes {
  /** sor.id → gondok (üres tömb is lehet). */
  gondok: Record<string, Leltar343Gond[]>
  osszegzes: Leltar343Osszegzes
}

/** Egy sor javítása: mező-felülírások + feloldás. */
export interface Leltar343Javitas {
  feloldas?: Leltar343Feloldas
  mezok?: Partial<Record<Leltar343Mezo, string | number | null>>
}

export type Leltar343Javitasok = Record<string, Leltar343Javitas>

// ---------------------------------------------------------------------------
// Segédek
// ---------------------------------------------------------------------------

export function reviewSorId(lap: string, sor: number): string {
  return `${lap}:${sor}`
}

function tisztitSzam(szam?: string | null): string {
  return String(szam ?? '').trim()
}

function szam(ertek: unknown, alap = 0): number {
  const n = Number(ertek)
  return Number.isFinite(n) ? n : alap
}

function kerekit2(n: number): number {
  return Math.round(n * 100) / 100
}

// ---------------------------------------------------------------------------
// 1. Review-sorok építése (szerver-oldal)
// ---------------------------------------------------------------------------

/**
 * A nyers (elutasított) Excel-sorból szerkeszthető vázlat.
 *
 * A számított mezőket (dátum, egységár, helyszín/felelős) ugyanazokkal a
 * szabályokkal állítjuk elő, mint az elfogadott sorokét — a felhasználó így
 * ugyanazt látja, csak javíthatóan. A NEGATÍV értéket SZÁNDÉKOSAN meghagyjuk:
 * a validáció majd hangosan kéri a javítást (a néma `Math.abs` az eredeti sor
 * jelentését hamisítaná meg).
 */
function vazlatNyersSorbol(
  lap: Leltar343Lap,
  nyers: Leltar343NyersSor,
  helyszinKatalogus?: Map<string, { helyszin: string | null; felelos: string | null }>,
): Omit<Leltar343ReviewSor, 'uzenetek' | 'elutasitott' | 'feloldas'> {
  const konyvLap = lap.category === 'konyv'
  const megnevezes = ((konyvLap ? nyers.fOszlop : nyers.eOszlop) || '').trim()
  const szerzo = konyvLap ? (nyers.eOszlop || '').trim() || null : null
  const megjegyzes = konyvLap ? null : (nyers.fOszlop || '').trim() || null
  const mennyiseg = nyers.mennyiseg == null ? 1 : szam(nyers.mennyiseg, 1)
  const teljesErtek = szam(nyers.ertek, 0)
  const { helyszin, felelos } = splitHelyszinFelelos(nyers.helyszinFelelos, helyszinKatalogus)
  const torlesDatum = osszerakDatum(nyers.torlesEv, nyers.torlesHo, nyers.torlesNap)

  return {
    id: reviewSorId(lap.sheet, nyers.sor),
    lap: lap.sheet,
    lapCimke: lap.cimke,
    sor: nyers.sor,
    kategoria: lap.category,
    megnevezes: megnevezes || szerzo || '',
    szerzo,
    megjegyzes,
    leltari_szam: tisztitSzam(nyers.leltariSzam) || null,
    helyszin,
    felelos_neve: felelos,
    beszerzes_datuma: osszerakDatum(nyers.ev, nyers.ho, nyers.nap),
    beszerzesi_ertek: mennyiseg !== 0 ? kerekit2(teljesErtek / mennyiseg) : teljesErtek,
    mennyiseg,
    mertekegyseg: (nyers.mertekegyseg || '').trim() || 'db',
    beszerzes_bizonylat: (nyers.beszerzesiIrat || '').trim() || null,
    torles_datuma: torlesDatum,
    torles_bizonylat: (nyers.torlesSzoveg || '').trim() || null,
    is_deleted: Boolean(torlesDatum),
    hasznalati_ido_ev:
      lap.alapeszkozOszlopok && nyers.hasznalatiIdo != null && szam(nyers.hasznalatiIdo) > 0
        ? Math.round(szam(nyers.hasznalatiIdo))
        : null,
    alapeszkoz_csoport: null,
    ertek_modositas: 0,
    ertek_modositas_megjegyzes: null,
  }
}

/**
 * A feldolgozott lapok → EGYETLEN átnézhető sorlista.
 *
 * Az elfogadott rekordok és az ELUTASÍTOTT sorok is bekerülnek: a varázsló
 * javító lépése épp az utóbbiakról szól (ezeket dobta el eddig némán az
 * import). A sorrend a munkafüzet sorrendje (lap, majd Excel-sorszám).
 */
export function epitReviewSorok(params: {
  lapok: Array<{ lap: Leltar343Lap; eredmeny: Leltar343LapEredmeny }>
  helyszinKatalogus?: Map<string, { helyszin: string | null; felelos: string | null }>
}): Leltar343ReviewSor[] {
  const { lapok, helyszinKatalogus } = params
  const sorok: Leltar343ReviewSor[] = []

  for (const { lap, eredmeny } of lapok) {
    // ⚠️ LAPONKÉNT gyűjtünk és laponként rendezünk. Egy közös, „ha más a lap,
    // adj 0-t" komparátor NEM teljes rendezés (nem tranzitív), és a motor
    // sort-algoritmusától függően összekeverné a lapokat.
    const lapSorok: Leltar343ReviewSor[] = []
    // Figyelmeztetések sor szerint, hogy a rekordhoz tudjuk csatolni.
    const figyelmeztetesSorok = new Map<number, Leltar343ReviewUzenet[]>()
    for (const f of eredmeny.figyelmeztetesek) {
      const lista = figyelmeztetesSorok.get(f.sor) || []
      lista.push({ szint: 'figyelmeztetes', kod: f.kod, uzenet: f.uzenet })
      figyelmeztetesSorok.set(f.sor, lista)
    }

    for (const r of eredmeny.rekordok) {
      lapSorok.push({
        id: reviewSorId(lap.sheet, r.sor),
        lap: lap.sheet,
        lapCimke: lap.cimke,
        sor: r.sor,
        kategoria: r.kategoria,
        megnevezes: r.megnevezes,
        szerzo: r.szerzo,
        megjegyzes: r.megjegyzes,
        leltari_szam: r.leltari_szam,
        helyszin: r.helyszin,
        felelos_neve: r.felelos_neve,
        beszerzes_datuma: r.beszerzes_datuma,
        beszerzesi_ertek: r.beszerzesi_ertek,
        mennyiseg: r.mennyiseg,
        mertekegyseg: r.mertekegyseg,
        beszerzes_bizonylat: r.beszerzes_bizonylat,
        torles_datuma: r.torles_datuma,
        torles_bizonylat: r.torles_bizonylat,
        is_deleted: r.is_deleted,
        hasznalati_ido_ev: r.hasznalati_ido_ev,
        alapeszkoz_csoport: r.alapeszkoz_csoport,
        ertek_modositas: r.ertek_modositas,
        ertek_modositas_megjegyzes: r.ertek_modositas_megjegyzes,
        uzenetek: figyelmeztetesSorok.get(r.sor) || [],
        elutasitott: false,
        feloldas: 'import',
      })
    }

    for (const h of eredmeny.hibak) {
      if (!h.nyers) continue // rekordhoz tartozó hiba — nincs mit külön javítani
      const vazlat = vazlatNyersSorbol(lap, h.nyers, helyszinKatalogus)
      lapSorok.push({
        ...vazlat,
        uzenetek: [{ szint: 'hiba', kod: h.kod, uzenet: h.uzenet }],
        elutasitott: true,
        // A beolvasás elutasította — alapból NEM megy be; a felhasználó
        // dönthet másképp, miután javította.
        feloldas: 'kihagy',
      })
    }

    lapSorok.sort((a, b) => a.sor - b.sor)
    sorok.push(...lapSorok)
  }

  return sorok
}

/** A rekordhoz NEM köthető (nyers nélküli) hibák — a teljes ellenőrzés része. */
export function egyebHibak(hibak: Leltar343Hiba[]): Leltar343Hiba[] {
  return hibak.filter(h => !h.nyers)
}

// ---------------------------------------------------------------------------
// 2. Javítások alkalmazása
// ---------------------------------------------------------------------------

/** Szöveges mező-érték normalizálása: üres → null. */
function szovegVagyNull(ertek: string | number | null | undefined): string | null {
  const t = ertek == null ? '' : String(ertek).trim()
  return t || null
}

/**
 * A felhasználói javítások rávetítése a sorokra — TISZTA függvény (új tömböt
 * ad, a bemenetet nem módosítja). A szerver UGYANEZT hívja a friss beolvasásra,
 * ezért a kliens sosem tud olyan mezőt átírni, amit itt nem engedünk.
 *
 * ⚠️ SZÁNDÉKOSAN mezőnként, KÉZZEL írva (nem `(uj as Record<string, unknown>)`
 * indexeléssel): így minden egyes írás típusellenőrzött, és egy elgépelt
 * mezőnév fordítási hiba, nem néma nem-működés. A whitelist (a
 * LELTAR343_SZERKESZTHETO_MEZOK tömb) és ez a törzs együtt jár — a selftest
 * G-őre azt is ellenőrzi, hogy minden whitelistelt mező TÉNYLEGESEN át is megy.
 */
export function alkalmazJavitasok(
  sorok: Leltar343ReviewSor[],
  javitasok: Leltar343Javitasok | undefined | null,
): Leltar343ReviewSor[] {
  if (!javitasok) return sorok.map(s => ({ ...s }))
  return sorok.map(s => {
    const j = javitasok[s.id]
    if (!j) return { ...s }
    const uj: Leltar343ReviewSor = { ...s }

    if (j.feloldas && LELTAR343_FELOLDASOK.includes(j.feloldas)) {
      uj.feloldas = j.feloldas
    }

    const m = j.mezok
    if (m) {
      if (m.megnevezes !== undefined) uj.megnevezes = szovegVagyNull(m.megnevezes) || ''
      if (m.szerzo !== undefined) uj.szerzo = szovegVagyNull(m.szerzo)
      if (m.megjegyzes !== undefined) uj.megjegyzes = szovegVagyNull(m.megjegyzes)
      if (m.leltari_szam !== undefined) uj.leltari_szam = szovegVagyNull(m.leltari_szam)
      if (m.helyszin !== undefined) uj.helyszin = szovegVagyNull(m.helyszin)
      if (m.felelos_neve !== undefined) uj.felelos_neve = szovegVagyNull(m.felelos_neve)
      if (m.beszerzes_datuma !== undefined) uj.beszerzes_datuma = szovegVagyNull(m.beszerzes_datuma)
      if (m.beszerzes_bizonylat !== undefined) uj.beszerzes_bizonylat = szovegVagyNull(m.beszerzes_bizonylat)
      if (m.mertekegyseg !== undefined) uj.mertekegyseg = szovegVagyNull(m.mertekegyseg) || 'db'
      if (m.beszerzesi_ertek !== undefined) {
        const n = Number(m.beszerzesi_ertek)
        // Értelmezhetetlen szám → a fájlból jövő érték marad (soha nem NaN).
        if (Number.isFinite(n)) uj.beszerzesi_ertek = n
      }
      if (m.mennyiseg !== undefined) {
        const n = Number(m.mennyiseg)
        if (Number.isFinite(n)) uj.mennyiseg = n
      }
    }

    return uj
  })
}

// ---------------------------------------------------------------------------
// 3. Ellenőrzés
// ---------------------------------------------------------------------------

/** A sor bemegy-e valamilyen formában (nem 'kihagy')? */
export function importalando(sor: Leltar343ReviewSor): boolean {
  return sor.feloldas !== 'kihagy'
}

/** Kap-e a sor a rendszertől ÚJ leltári számot? */
export function ujSzamotKap(sor: Leltar343ReviewSor): boolean {
  if (sor.feloldas === 'uj_szam') return true
  return sor.feloldas === 'import' && !tisztitSzam(sor.leltari_szam)
}

/**
 * TELJES ellenőrzés — minden sorra, csonkolás nélkül.
 *
 * ⚠️ Ez a függvény a felület „Ellenőrzés" lépésének EGYETLEN igazságforrása,
 * és a szerver is ezzel dönt import előtt. Ha itt „rendben", ott is bemegy.
 */
export function ellenorizSorok(
  sorok: Leltar343ReviewSor[],
  ctx: Leltar343EllenorzesCtx,
): Leltar343Ellenorzes {
  const aktiv = new Set(ctx.aktivSzamok.map(tisztitSzam).filter(Boolean))
  const kivezetett = new Set((ctx.kivezetettSzamok || []).map(tisztitSzam).filter(Boolean))

  // Fájlon belüli szám-ütközések: csak a TÉNYLEGESEN bemenő, saját számmal
  // rendelkező sorok számítanak (az új számot kapók nem ütközhetnek).
  const fajlSzamok = new Map<string, string[]>()
  for (const s of sorok) {
    if (!importalando(s) || ujSzamotKap(s)) continue
    const sz = tisztitSzam(s.leltari_szam)
    if (!sz) continue
    const lista = fajlSzamok.get(sz) || []
    lista.push(s.id)
    fajlSzamok.set(sz, lista)
  }

  const gondok: Record<string, Leltar343Gond[]> = {}
  const osszegzes: Leltar343Osszegzes = {
    osszes: sorok.length,
    beszurando: 0,
    felulirando: 0,
    ujSzamos: 0,
    kihagyando: 0,
    hibas: 0,
    figyelmeztetett: 0,
  }

  for (const s of sorok) {
    const lista: Leltar343Gond[] = []

    if (!importalando(s)) {
      osszegzes.kihagyando += 1
      gondok[s.id] = lista
      continue
    }

    if (!s.megnevezes.trim()) {
      lista.push({
        szint: 'hiba',
        kod: 'ures_megnevezes',
        mezo: 'megnevezes',
        uzenet: 'A megnevezés kötelező — írd be, vagy hagyd ki a sort.',
      })
    }

    if (!(szam(s.mennyiseg, 0) > 0)) {
      lista.push({
        szint: 'hiba',
        kod: 'ervenytelen_mennyiseg',
        mezo: 'mennyiseg',
        uzenet: 'A mennyiségnek nullánál nagyobbnak kell lennie.',
      })
    }

    if (szam(s.beszerzesi_ertek, 0) < 0) {
      lista.push({
        szint: 'hiba',
        kod: 'negativ_ertek',
        mezo: 'beszerzesi_ertek',
        uzenet: 'A beszerzési érték nem lehet negatív — javítsd, vagy hagyd ki a sort.',
      })
    }

    const sz = tisztitSzam(s.leltari_szam)

    if (ujSzamotKap(s)) {
      osszegzes.ujSzamos += 1
      if (s.feloldas === 'import') {
        lista.push({
          szint: 'figyelmeztetes',
          kod: 'automatikus_szam',
          mezo: 'leltari_szam',
          uzenet: 'Nincs leltári szám a fájlban — a rendszer automatikusan sorszámoz.',
        })
      }
    } else if (s.feloldas === 'felulir') {
      if (ctx.veglegesitve) {
        // ⚠️ A VÉGLEGESÍTETT ÉV ZÁRA (Endre döntése, 2026-08-27). Szándékosan
        // az ELSŐ ellenőrzés a felülíró ágon: hiába létezik a szám, lezárt
        // évben akkor sem nyúlhatunk a tételhez. A kiút NEM fejlesztői —
        // az üzenet megnevezi az egyházmegyei feloldás útját.
        lista.push({
          szint: 'hiba',
          kod: 'veglegesitett_ev',
          mezo: 'leltari_szam',
          uzenet:
            'A tárgyévi vagyonleltári jelentés VÉGLEGESÍTVE van — meglévő tételt csak az egyházmegye feloldásával lehet felülírni. Kérj feloldást a Leltári nyilvántartás fülön, majd indítsd újra az importot. (Új tétel bevitele nincs zárolva.)',
        })
      } else if (!sz) {
        lista.push({
          szint: 'hiba',
          kod: 'felulirhatatlan',
          mezo: 'leltari_szam',
          uzenet: 'Felülíráshoz meg kell adni azt a leltári számot, amelyik tételt frissítjük.',
        })
      } else if (!aktiv.has(sz)) {
        lista.push({
          szint: 'hiba',
          kod: 'felulirhatatlan',
          mezo: 'leltari_szam',
          uzenet: `Nincs „${sz}" leltári számú AKTÍV tétel a rendszerben, amit felül lehetne írni.`,
        })
      }
    } else if (sz && aktiv.has(sz)) {
      lista.push({
        szint: 'hiba',
        kod: 'szam_utkozes_db',
        mezo: 'leltari_szam',
        uzenet: `A(z) „${sz}" leltári szám már ki van adva a rendszerben. Válassz: új szám, a meglévő frissítése, vagy kihagyás.`,
      })
    } else if (sz && kivezetett.has(sz)) {
      lista.push({
        szint: 'figyelmeztetes',
        kod: 'szam_utkozes_kivezetett',
        mezo: 'leltari_szam',
        uzenet: `A(z) „${sz}" számot korábban egy KIVEZETETT tétel viselte — a szám újra kiadható, de ellenőrizd.`,
      })
    }

    if (sz && !ujSzamotKap(s) && (fajlSzamok.get(sz)?.length || 0) > 1) {
      lista.push({
        szint: 'hiba',
        kod: 'szam_utkozes_fajl',
        mezo: 'leltari_szam',
        uzenet: `A fájlban ${fajlSzamok.get(sz)?.length} sor viseli a(z) „${sz}" leltári számot — csak egy maradhat.`,
      })
    }

    // A beolvasáskor keletkezett, még feloldatlan elutasítási ok is hiba
    // marad, ha a felhasználó nem javított rajta (pl. duplikált tétel).
    if (s.elutasitott && lista.every(g => g.szint !== 'hiba')) {
      const eredeti = s.uzenetek.find(u => u.szint === 'hiba')
      if (eredeti && eredeti.kod === 'duplikalt_tetel' && !sz) {
        lista.push({
          szint: 'hiba',
          kod: 'duplikalt_tetel',
          mezo: 'leltari_szam',
          uzenet: 'Duplikált tétel: adj neki saját leltári számot, vagy kérj újat a rendszertől.',
        })
      }
    }

    gondok[s.id] = lista

    if (lista.some(g => g.szint === 'hiba')) {
      osszegzes.hibas += 1
      continue
    }
    if (lista.some(g => g.szint === 'figyelmeztetes') || s.uzenetek.length > 0) {
      osszegzes.figyelmeztetett += 1
    }
    if (s.feloldas === 'felulir') osszegzes.felulirando += 1
    else osszegzes.beszurando += 1
  }

  return { gondok, osszegzes }
}

// ---------------------------------------------------------------------------
// 4. Új leltári számok determinisztikus kiosztása
// ---------------------------------------------------------------------------

/**
 * Melyik sor MILYEN új leltári számot kap — a kliens előnézete és a szerveri
 * import UGYANEZT a függvényt hívja, ezért a felületen mutatott szám nem
 * hazudhat. A számsor a kategória-előtag szerint fut (AE-, CS-, K-, …).
 */
export function osztSzamokat(
  sorok: Leltar343ReviewSor[],
  ctx: Leltar343EllenorzesCtx,
): Record<string, string> {
  const foglalt = new Set(
    [...ctx.aktivSzamok, ...(ctx.kivezetettSzamok || [])].map(tisztitSzam).filter(Boolean),
  )
  // A fájlban KÉZZEL megadott, bemenő számok is foglalják a helyet.
  for (const s of sorok) {
    if (!importalando(s) || ujSzamotKap(s)) continue
    const sz = tisztitSzam(s.leltari_szam)
    if (sz) foglalt.add(sz)
  }

  const kiosztott: Record<string, string> = {}
  for (const s of sorok) {
    if (!importalando(s) || !ujSzamotKap(s)) continue
    const prefix = INVENTORY_CATEGORY_PREFIXES[s.kategoria]
    const uj = nextLeltariSzam(
      [...foglalt].filter(x => x.startsWith(`${prefix}-`)),
      s.kategoria,
    )
    foglalt.add(uj)
    kiosztott[s.id] = uj
  }
  return kiosztott
}

/** Van-e olyan sor, amit javítani KELL, mielőtt az import indulhat? */
export function vanBlokkoloHiba(ellenorzes: Leltar343Ellenorzes): boolean {
  return ellenorzes.osszegzes.hibas > 0
}
