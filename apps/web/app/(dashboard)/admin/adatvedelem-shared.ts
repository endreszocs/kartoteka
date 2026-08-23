/**
 * Adatvédelmi fedezet — ÉRINTETTI KÉRELMEK + ÁSZF-elfogadások: KÖZÖS MAG.
 * (2026-08-23, „Adatvédelmi fedezet, 2. rész")
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A FÁJL — ÉS MIÉRT IMPORT-MENTES
 * ════════════════════════════════════════════════════════════════════════════
 * Két oka van:
 *
 *  (1) Next.js-szabály: a `'use server'` fájl KIZÁRÓLAG async függvényt
 *      exportálhat. A típusok, a konstansok és a tiszta függvények tehát nem
 *      maradhatnak az `adatvedelem-actions.ts`-ben.
 *
 *  (2) ⚠️ A HATÁRIDŐ-SZÁMÍTÁS A FELÜLET LEGKÉNYESEBB SZÁMA. Az új Adatvédelmi
 *      tájékoztató EGY HÓNAPOS határidőt ígér az érintetti kérelmekre, a GDPR
 *      5(2) cikke pedig ELSZÁMOLTATHATÓSÁGOT követel: bizonyítani kell tudni,
 *      hogy a határidőt tartottuk. Ha ezt a számítást a szerver és a kliens
 *      külön-külön írja meg, a két felület NÉMÁN SZÉTHÚZ (a projekt már
 *      megfizetett hibaosztálya) — és a széthúzás pont ott derülne ki, ahol a
 *      legdrágább: egy hatósági kérdésnél.
 *
 * Ezért a mag TISZTA és IMPORT-MENTES:
 *   · nincs projekt-import (így az őrszem önállóan be tudja tölteni),
 *   · nincs `new Date()` — a „ma" MINDIG paraméter. Enélkül a szerver (UTC) és
 *     a böngésző (helyi idő) egy naptári napot is eltérhetne, és a „lejárt"
 *     jelölés a nap végén hol megjelenne, hol nem (hidratálás-eltérés).
 *   · a naptár-aritmetika egész számokon fut (nincs időzóna, nincs nyári
 *     időszámítás) — a `Date` objektum nélkül nincs mit elrontani.
 *
 * Az őrszem: `node scripts/selftest-adatvedelmi-naplo.mjs`
 */

// ────────────────────────────────────────────────────────────────────────────
// 1. KÉRELEM-TÍPUSOK — a GDPR III. fejezete szerinti érintetti jogok
// ────────────────────────────────────────────────────────────────────────────

export type KerelemTipus =
  | 'hozzaferes'
  | 'helyesbites'
  | 'torles'
  | 'korlatozas'
  | 'tiltakozas'
  | 'adathordozhatosag'
  | 'hozzajarulas_visszavonas'
  | 'egyeb'

/** A DB CHECK-constraint sorrendje — a kettőt EGYSZERRE kell módosítani. */
export const KERELEM_TIPUSOK: readonly KerelemTipus[] = [
  'hozzaferes',
  'helyesbites',
  'torles',
  'korlatozas',
  'tiltakozas',
  'adathordozhatosag',
  'hozzajarulas_visszavonas',
  'egyeb',
]

/** Lelkészbarát magyar címkék — a szakkifejezés zárójelben, ahol kell. */
export const KERELEM_TIPUS_CIMKE: Record<KerelemTipus, string> = {
  hozzaferes: 'Hozzáférés (másolat az adatairól)',
  helyesbites: 'Helyesbítés (téves adat javítása)',
  torles: 'Törlés („elfeledtetés")',
  korlatozas: 'Korlátozás (zárolás)',
  tiltakozas: 'Tiltakozás az adatkezelés ellen',
  adathordozhatosag: 'Adathordozhatóság (adatok kiadása)',
  hozzajarulas_visszavonas: 'Hozzájárulás visszavonása',
  egyeb: 'Egyéb kérelem',
}

export function ervenyesKerelemTipus(ertek: unknown): ertek is KerelemTipus {
  return typeof ertek === 'string' && (KERELEM_TIPUSOK as readonly string[]).includes(ertek)
}

// ────────────────────────────────────────────────────────────────────────────
// 2. ÁLLAPOTOK
// ────────────────────────────────────────────────────────────────────────────

export type KerelemAllapot = 'uj' | 'folyamatban' | 'teljesitve' | 'elutasitva' | 'reszben'

export const KERELEM_ALLAPOTOK: readonly KerelemAllapot[] = [
  'uj',
  'folyamatban',
  'teljesitve',
  'elutasitva',
  'reszben',
]

export const KERELEM_ALLAPOT_CIMKE: Record<KerelemAllapot, string> = {
  uj: 'Új — még nem foglalkoztunk vele',
  folyamatban: 'Folyamatban',
  teljesitve: 'Teljesítve',
  elutasitva: 'Elutasítva (indokolással)',
  reszben: 'Részben teljesítve',
}

/**
 * LEZÁRT állapotok — ezeknél a határidő már nem ketyeg.
 *
 * ⚠️ A `reszben` SZÁNDÉKOSAN lezárt: a GDPR szerint a részleges teljesítés is
 * ÉRDEMI VÁLASZ (az elutasított rész indokolásával együtt). Ha nyitottnak
 * számítanánk, az összesítő örökké „lejárt"-at mutatna olyan ügyekre, amelyek
 * papíron rendben lezárultak.
 */
export const LEZART_ALLAPOTOK: readonly KerelemAllapot[] = ['teljesitve', 'elutasitva', 'reszben']

export function lezartAllapot(allapot: unknown): boolean {
  return typeof allapot === 'string' && (LEZART_ALLAPOTOK as readonly string[]).includes(allapot)
}

export function ervenyesAllapot(ertek: unknown): ertek is KerelemAllapot {
  return typeof ertek === 'string' && (KERELEM_ALLAPOTOK as readonly string[]).includes(ertek)
}

/**
 * Az az állapot-halmaz, amelyhez KÖTELEZŐ teljesítés-dátum, illetve amelyhez
 * TILOS. A DB ugyanezt CHECK-constraintként őrzi — a kettőnek egyeznie kell,
 * különben a mentés kriptikus 23514-gyel bukna.
 */
export function kellTeljesitesDatum(allapot: KerelemAllapot): boolean {
  return lezartAllapot(allapot)
}

// ────────────────────────────────────────────────────────────────────────────
// 3. NAPTÁR-ARITMETIKA — egész számokon, `Date` nélkül
// ────────────────────────────────────────────────────────────────────────────

export interface DatumReszek {
  ev: number
  ho: number
  nap: number
}

export function szokoev(ev: number): boolean {
  return (ev % 4 === 0 && ev % 100 !== 0) || ev % 400 === 0
}

const HONAP_NAPJAI = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function honapNapjai(ev: number, ho: number): number {
  if (ho < 1 || ho > 12) return 0
  if (ho === 2 && szokoev(ev)) return 29
  return HONAP_NAPJAI[ho - 1]
}

/** `YYYY-MM-DD` (vagy ISO időbélyeg dátum-előtagja) → részek. Hibás bemenet → null. */
export function parseIsoDatum(ertek: unknown): DatumReszek | null {
  if (typeof ertek !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ertek.trim())
  if (!m) return null
  const ev = Number(m[1])
  const ho = Number(m[2])
  const nap = Number(m[3])
  if (!Number.isFinite(ev) || !Number.isFinite(ho) || !Number.isFinite(nap)) return null
  if (ho < 1 || ho > 12) return null
  if (nap < 1 || nap > honapNapjai(ev, ho)) return null
  return { ev, ho, nap }
}

function ketJegy(n: number): string {
  return n < 10 ? '0' + String(n) : String(n)
}

export function isoDatum(ev: number, ho: number, nap: number): string {
  return String(ev).padStart(4, '0') + '-' + ketJegy(ho) + '-' + ketJegy(nap)
}

/**
 * Napok száma az 1970-01-01 óta (Howard Hinnant „days_from_civil" algoritmusa).
 * Tiszta egész-aritmetika: se időzóna, se nyári időszámítás nem torzítja.
 */
export function napSorszam(ev: number, ho: number, nap: number): number {
  const y = ho <= 2 ? ev - 1 : ev
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (ho + (ho > 2 ? -3 : 9)) + 2) / 5) + nap - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

/** `b - a` napokban. Bármelyik hibás dátum → null (nem 0! a 0 „ma"-t jelentene). */
export function napKulonbseg(a: unknown, b: unknown): number | null {
  const pa = parseIsoDatum(a)
  const pb = parseIsoDatum(b)
  if (!pa || !pb) return null
  return napSorszam(pb.ev, pb.ho, pb.nap) - napSorszam(pa.ev, pa.ho, pa.nap)
}

// ────────────────────────────────────────────────────────────────────────────
// 4. A HATÁRIDŐ — beérkezés + 1 hónap
// ────────────────────────────────────────────────────────────────────────────

/**
 * A törvényes válaszadási határidő: a beérkezéstől számított EGY HÓNAP.
 *
 * ⚠️ HÓNAP, NEM 30 NAP. A GDPR 12(3) cikke és az Adatvédelmi tájékoztatónk is
 * „egy hónap"-ot mond. A hónap-vég kezelése: ha a célhónapban nincs annyiadik
 * nap (jan. 31. + 1 hónap), a hónap UTOLSÓ napjára esik — ez a jogban is a
 * bevett megoldás, és a 30 napos közelítésnél KÉSŐBBRE sosem csúszik.
 */
export function hataridoSzamitas(beerkezes: unknown): string | null {
  const p = parseIsoDatum(beerkezes)
  if (!p) return null
  let ev = p.ev
  let ho = p.ho + 1
  if (ho > 12) {
    ho = 1
    ev += 1
  }
  const nap = Math.min(p.nap, honapNapjai(ev, ho))
  return isoDatum(ev, ho, nap)
}

/** Hány nappal a határidő előtt kezdjünk sárgán figyelmeztetni. */
export const HATARIDO_FIGYELMEZTETES_NAP = 7

export type HataridoSzint = 'lezart' | 'lejart' | 'kozelgo' | 'rendben' | 'ismeretlen'

/** A StatusBadge `intent` értékkészletével egyező szöveges hangulat. */
export type HataridoJelvenyIntent = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export interface HataridoErtekeles {
  szint: HataridoSzint
  /** Hány nap van még hátra (0 = épp ma jár le, negatív = lejárt). */
  hatralevoNapok: number | null
  cimke: string
  intent: HataridoJelvenyIntent
}

export interface HataridoBemenet {
  hatarido: unknown
  /** A mai nap `YYYY-MM-DD` alakban — SOHA nem a mag számolja ki. */
  ma: unknown
  allapot?: unknown
}

/**
 * A határidő besorolása. HATÁRESETEK (az őrszem pontosan ezeket méri):
 *   · pontosan a határidőn (0 nap)  → KÖZELGŐ, nem lejárt
 *   · 1 nappal előtte (+1 nap)      → KÖZELGŐ
 *   · 1 nappal utána  (−1 nap)      → LEJÁRT
 *   · pontosan 7 nap                → KÖZELGŐ (a küszöb BELE tartozik)
 *   · 8 nap                         → RENDBEN
 */
export function hataridoAllapot(bemenet: HataridoBemenet): HataridoErtekeles {
  if (lezartAllapot(bemenet.allapot)) {
    return { szint: 'lezart', hatralevoNapok: null, cimke: 'Lezárva', intent: 'success' }
  }
  const hatralevo = napKulonbseg(bemenet.ma, bemenet.hatarido)
  if (hatralevo === null) {
    return {
      szint: 'ismeretlen',
      hatralevoNapok: null,
      cimke: 'Nincs határidő rögzítve',
      intent: 'neutral',
    }
  }
  if (hatralevo < 0) {
    const napja = Math.abs(hatralevo)
    return {
      szint: 'lejart',
      hatralevoNapok: hatralevo,
      cimke: napja === 1 ? 'Lejárt — 1 napja' : 'Lejárt — ' + String(napja) + ' napja',
      intent: 'danger',
    }
  }
  if (hatralevo <= HATARIDO_FIGYELMEZTETES_NAP) {
    return {
      szint: 'kozelgo',
      hatralevoNapok: hatralevo,
      cimke:
        hatralevo === 0
          ? 'Ma jár le'
          : hatralevo === 1
            ? 'Holnap jár le'
            : String(hatralevo) + ' nap van hátra',
      intent: 'warning',
    }
  }
  return {
    szint: 'rendben',
    hatralevoNapok: hatralevo,
    cimke: String(hatralevo) + ' nap van hátra',
    intent: 'info',
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 5. SOR-TÍPUSOK + összesítő
// ────────────────────────────────────────────────────────────────────────────

export interface AdatvedelmiKerelemSor {
  id: string
  congregationId: string | null
  congregationNev: string | null
  erintettNeve: string
  erintettEmail: string | null
  kerelemTipusa: KerelemTipus
  beerkezesDatuma: string
  hatarido: string
  allapot: KerelemAllapot
  teljesitesDatuma: string | null
  intezteProfileId: string | null
  intezteNev: string | null
  megjegyzes: string | null
  letrehozva: string | null
}

export interface KerelemOsszesito {
  osszes: number
  nyitott: number
  kozelgo: number
  lejart: number
  lezart: number
}

/** Az admin fejléc-számai. A „ma" itt is paraméter (lásd a fájl fejlécét). */
export function kerelemOsszesito(
  sorok: readonly AdatvedelmiKerelemSor[],
  ma: unknown,
): KerelemOsszesito {
  const eredmeny: KerelemOsszesito = { osszes: 0, nyitott: 0, kozelgo: 0, lejart: 0, lezart: 0 }
  for (const sor of sorok) {
    eredmeny.osszes += 1
    const ert = hataridoAllapot({ hatarido: sor.hatarido, ma, allapot: sor.allapot })
    if (ert.szint === 'lezart') {
      eredmeny.lezart += 1
      continue
    }
    eredmeny.nyitott += 1
    if (ert.szint === 'lejart') eredmeny.lejart += 1
    else if (ert.szint === 'kozelgo') eredmeny.kozelgo += 1
  }
  return eredmeny
}

/**
 * Rendezés: a legsürgetőbb elöl (legkorábbi határidő), a lezártak leghátul.
 * Determinisztikus: azonos határidőnél a beérkezés, végül az azonosító dönt —
 * enélkül a lista két frissítés között „ugrálna".
 */
export function rendezdKerelmeket(
  sorok: readonly AdatvedelmiKerelemSor[],
): AdatvedelmiKerelemSor[] {
  return [...sorok].sort((a, b) => {
    const aLezart = lezartAllapot(a.allapot) ? 1 : 0
    const bLezart = lezartAllapot(b.allapot) ? 1 : 0
    if (aLezart !== bLezart) return aLezart - bLezart
    if (a.hatarido !== b.hatarido) return a.hatarido < b.hatarido ? -1 : 1
    if (a.beerkezesDatuma !== b.beerkezesDatuma) {
      return a.beerkezesDatuma < b.beerkezesDatuma ? -1 : 1
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

// ────────────────────────────────────────────────────────────────────────────
// 6. ÁSZF-elfogadások
// ────────────────────────────────────────────────────────────────────────────

export interface AszfElfogadasSor {
  id: string
  profileId: string
  nev: string | null
  email: string | null
  verzio: string
  elfogadvaAt: string
}

/**
 * A verzió-sztring alakja. A forrás EGYETLEN helyen él: a jogi dialógus
 * `LEGAL_VERSION` konstansa. SZÁNDÉKOSAN NINCS itt másolat belőle — egy
 * második konstans némán széthúzna a jogi szövegtől, és épp azt a bizonyítékot
 * rontaná el, amiért a napló készült („ki, mikor, MELYIK verziót fogadta el").
 * A böngésző küldi föl az éppen kirajzolt verziót, a szerver csak az ALAKJÁT
 * ellenőrzi (fail-closed: bármi más elutasítva).
 */
export function ervenyesAszfVerzio(ertek: unknown): ertek is string {
  return typeof ertek === 'string' && /^[0-9]{1,3}(\.[0-9]{1,3}){0,2}$/.test(ertek.trim())
}

// ────────────────────────────────────────────────────────────────────────────
// 7. HIÁNYZÓ TÁBLA — a kód ELŐBB megy élesbe, mint az SQL
// ────────────────────────────────────────────────────────────────────────────

/** A migrációs fájl útja — a magyarázó üzenet ezt nevezi meg. */
export const ADATVEDELEM_SQL_FAJL = 'migration-docs/sql/2026-08-23-adatvedelmi-kerelmek.sql'

export const TABLA_HIANYZIK_UZENET =
  'Ez a napló még nincs bekapcsolva — a rendszergazdának le kell futtatnia a hozzá tartozó adatbázis-lépést.'

export type LekerdezesHibaFajta = 'nincs_hiba' | 'tabla_hianyzik' | 'egyeb'

export interface LekerdezesHibaErtelmezes {
  fajta: LekerdezesHibaFajta
  /** Magyar, felhasználónak mutatható üzenet. `null`, ha nincs hiba. */
  uzenet: string | null
}

/**
 * HIÁNYZÓ TÁBLA vagy VALÓDI HIBA? — ez a fájl legfontosabb elágazása.
 *
 * ⚠️ Ez a kód ELŐBB megy élesbe, mint a hozzá tartozó SQL. Amíg a migráció nem
 * futott le, a Supabase `42P01` (undefined_table) hibakóddal válaszol, a
 * PostgREST séma-gyorsítótára pedig `PGRST205`-tel („Could not find the table
 * … in the schema cache"). Ha ezt nem fogjuk el, a felület PIROS HIBAOLDALT
 * fest — miközben a helyes viselkedés egy nyugodt magyar mondat.
 *
 * ⚠️ ÉS A MÁSIK IRÁNYBAN IS ŐRIZNI KELL: minden MÁS hiba maradjon HANGOS. A
 * „nyeljünk el minden hibát" javítás néma üres listát adna — a projekt
 * visszatérő, már megfizetett hibaosztálya.
 */
export function ertelmezdLekerdezesHibat(
  error: { code?: string | null; message?: string | null } | null | undefined,
): LekerdezesHibaErtelmezes {
  if (!error) return { fajta: 'nincs_hiba', uzenet: null }
  const kod = typeof error.code === 'string' ? error.code : ''
  const uzenet = typeof error.message === 'string' ? error.message : ''
  const hianyzik =
    kod === '42P01' ||
    kod === 'PGRST205' ||
    /relation .* does not exist/i.test(uzenet) ||
    /schema cache/i.test(uzenet)
  if (hianyzik) return { fajta: 'tabla_hianyzik', uzenet: TABLA_HIANYZIK_UZENET }
  return {
    fajta: 'egyeb',
    uzenet: uzenet.trim().length > 0 ? uzenet : 'Ismeretlen adatbázis-hiba.',
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 8. Szerver-akciók visszatérési alakjai
// ────────────────────────────────────────────────────────────────────────────

/** Miért nem látható a lista — a felület ebből ír érthető magyar magyarázatot. */
export type AdatvedelemAkadaly =
  | 'nincs_akadaly'
  /** A tábla még nincs bekapcsolva (az SQL nem futott le). */
  | 'tabla_hianyzik'
  /** Kerületi szintű felhasználó: K4 döntés szerint nem lát gyülekezeti adatot. */
  | 'kerulet_nem_lathatja'
  /** A hatókört nem tudtuk feloldani → fail-closed, nem néma üres lista. */
  | 'hatokor_ismeretlen'
  | 'nincs_jogosultsag'
  | 'adatbazis_hiba'

export interface KerelemListaEredmeny {
  sorok?: AdatvedelmiKerelemSor[]
  osszesGyulekezet?: Array<{ id: string; nev: string }>
  akadaly?: AdatvedelemAkadaly
  /** Magyar magyarázat, ha `akadaly !== 'nincs_akadaly'`. */
  uzenet?: string
  /** A rendszergazda az egész országot látja, más csak a saját gyülekezetét. */
  rendszergazda?: boolean
  /** A bejelentkezett felhasználó saját gyülekezete (az űrlap alapértelmezése). */
  sajatCongregationId?: string | null
}

export interface AszfListaEredmeny {
  sorok?: AszfElfogadasSor[]
  akadaly?: AdatvedelemAkadaly
  uzenet?: string
  /** Hány külön verziót fogadtak már el (a fejléc-számhoz). */
  verziok?: string[]
}

export interface MuveletEredmeny {
  siker?: boolean
  /** Magyar hibaüzenet. Ha ez van, a felület TOAST-tal mutatja. */
  hiba?: string
  akadaly?: AdatvedelemAkadaly
}

export interface UjKerelemBemenet {
  congregationId: string | null
  erintettNeve: string
  erintettEmail: string | null
  kerelemTipusa: string
  beerkezesDatuma: string
  megjegyzes: string | null
}

export interface AllapotValtasBemenet {
  id: string
  allapot: string
  /** `YYYY-MM-DD`. Lezárt állapotnál kötelező. */
  teljesitesDatuma: string | null
  megjegyzes: string | null
}

/**
 * Az űrlap-ellenőrzés TISZTA magja — ugyanaz fut a böngészőben (azonnali
 * visszajelzés) és a szerveren (a valódi kapu). Egy nyelv, egy szabály.
 * `null` = rendben.
 */
export function ellenorizdUjKerelmet(bemenet: UjKerelemBemenet): string | null {
  if (!bemenet.erintettNeve || bemenet.erintettNeve.trim().length < 2) {
    return 'Az érintett nevét kérjük megadni (legalább 2 karakter).'
  }
  if (!ervenyesKerelemTipus(bemenet.kerelemTipusa)) {
    return 'Válaszd ki, milyen kérelemről van szó.'
  }
  if (!parseIsoDatum(bemenet.beerkezesDatuma)) {
    return 'A beérkezés dátuma hiányzik vagy hibás (éééé-hh-nn).'
  }
  if (
    bemenet.erintettEmail &&
    bemenet.erintettEmail.trim().length > 0 &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bemenet.erintettEmail.trim())
  ) {
    return 'Az e-mail-cím alakja hibás.'
  }
  return null
}

/** Az állapot-váltás TISZTA ellenőrzése. `null` = rendben. */
export function ellenorizdAllapotValtast(bemenet: AllapotValtasBemenet): string | null {
  if (!bemenet.id || bemenet.id.trim().length === 0) return 'Hiányzik a kérelem azonosítója.'
  if (!ervenyesAllapot(bemenet.allapot)) return 'Ismeretlen állapot.'
  const lezar = kellTeljesitesDatum(bemenet.allapot)
  if (lezar && !parseIsoDatum(bemenet.teljesitesDatuma)) {
    return 'A lezáráshoz kérjük a teljesítés (válaszadás) dátumát is megadni.'
  }
  if (!lezar && bemenet.teljesitesDatuma) {
    return 'Nyitott állapothoz nem tartozhat teljesítés-dátum.'
  }
  return null
}
