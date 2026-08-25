// 2026-08-25: Gyülekezeti egységek (anya–leány–missziói–szórvány) —
// KÖZÖS ADAT-KONTRAKTUS.
//
// Ez a fájl a szervezeti modell minden rétegének közös nyelve:
//  - a congregations.szervezeti_tipus / anya_congregation_id hivatalos réteg
//    (admin kezeli — egyházmegyei javaslat + kerületi jóváhagyás a való életben),
//  - a gyulekezeti_egysegek tábla (az anya kartotékán BELÜLI leány/szórvány
//    egységek; a munkanaplo.egyseg_id és szemely.egyseg_id címkék erre mutatnak;
//    NULL címke = anyaközpont),
//  - a lelkészi jelentés „Gyülekezetenkénti bontás" cellakulcsai
//    (`egyseg:<uuid>:<mezoId>` a lelkeszi_jelentes kezi_adatok/felulirasok
//    jsonb-iben — append-only, a meglévő mezoId-k nem sérülnek).
//
// A 'use server' szabály miatt (Next.js 16: 'use server' fájl CSAK async
// function-t exportálhat) a típusok/konstansok ITT élnek, az akciók a
// megfelelő actions-fájlokban.

export type SzervezetiTipus = 'anya' | 'leany' | 'misszioi' | 'tars'
export type EgysegTipus = 'leany' | 'szorvany' | 'egyhazresz'

export const SZERVEZETI_TIPUS_CIMKEK: Record<SzervezetiTipus, string> = {
  anya: 'Anyaegyházközség',
  leany: 'Leányegyházközség',
  misszioi: 'Missziói egyházközség',
  tars: 'Társegyházközség',
}

/** Rövid magyarázat a súgókhoz / tooltipekhez. */
export const SZERVEZETI_TIPUS_LEIRAS: Record<SzervezetiTipus, string> = {
  anya: 'Önálló egyházközség saját lelkészi állással; leányegyházközségek és szórványok kapcsolódhatnak hozzá.',
  leany: 'Szervezett gyülekezet saját presbitériummal, amely lelkipásztori ellátás és egyházigazgatás tekintetében egy anyaegyházközséghez tartozik.',
  misszioi: 'Több település szórtan élő reformátusaiból szervezett egyházközség közös lelkészi állással, egyházi támogatással.',
  tars: 'Két vagy több, egymással egyenrangú egyházrész közös egyházközsége: közösen fenntartott lelkészi állás, közös jogi személy; a viszonyukat az egyházmegyei közgyűlés által jóváhagyott írásos megállapodás rendezi.',
}

export const EGYSEG_TIPUS_CIMKEK: Record<EgysegTipus, string> = {
  leany: 'Leányegyházközség',
  szorvany: 'Szórvány',
  egyhazresz: 'Egyházrész',
}

/** Az anyaközpont oszlop felirata a bontás-táblában (nem tárolt egység). */
export const ANYAKOZPONT_CIMKE = 'Anyaegyházközség'

/**
 * A „központ" (NULL-címkés adat) felirata a szervezeti forma szerint:
 * anya/missziói gyülekezetnél az anyaegyházközség maga; TÁRSEGYHÁZKÖZSÉGNÉL
 * nincs kitüntetett központ — ott a címke nélküli adat a KÖZÖS (minden
 * egyházrészt érintő) tétel. Ismeretlen/még-nem-beállított formánál a
 * hagyományos felirat.
 */
export function kozpontCimke(szervezetiTipus?: string | null): string {
  return szervezetiTipus === 'tars' ? 'Közös (egész egyházközség)' : ANYAKOZPONT_CIMKE
}

/** A központ rövid felirata a helyszín-választókhoz (munkanapló, tag-karton). */
export function kozpontValasztoCimke(szervezetiTipus?: string | null): string {
  return szervezetiTipus === 'tars'
    ? 'Közös / egész egyházközség'
    : 'Anyaegyházközség (központ)'
}

export interface GyulekezetiEgyseg {
  id: string
  congregation_id: string
  nev: string
  tipus: EgysegTipus
  adrlocality_id: number | null
  linked_congregation_id: string | null
  sorrend: number
  aktiv: boolean
  megjegyzes: string | null
}

/** A gyulekezeti_hierarchia() RPC egy egység-eleme (jsonb-ből). */
export interface HierarchiaEgyseg {
  id: string
  nev: string
  tipus: EgysegTipus
  aktiv: boolean
  /** Élő aktív-tag létszám — CSAK rendszergazdának / saját családra; máshol hiányzik. */
  letszam?: number | null
}

/** A gyulekezeti_hierarchia() RPC egy sora. */
export interface HierarchiaSor {
  congregation_id: string
  name: string
  nev_hu: string | null
  szervezeti_tipus: SzervezetiTipus
  anya_congregation_id: string | null
  diocese_id: string | null
  diocese_name: string | null
  district_id: string | null
  district_name: string | null
  /** Az aktív, jóváhagyott lelkész(ek) neve vesszővel; null, ha nincs regisztrált lelkész. */
  lelkesz_nevek: string | null
  sajat: boolean
  /** Élő aktív-tag létszám (I.10 kanonikus szűrő) — csak rendszergazda/saját családnál. */
  letszam_elo: number | null
  egysegek: HierarchiaEgyseg[]
}

/**
 * A szervezeti térkép szerver-akcióinak közös eredmény-alakja (2026-08-25).
 *
 * NÉGY, EGYMÁSTÓL MEGKÜLÖNBÖZTETETT ÁLLAPOT — a projekt visszatérő
 * hibaosztálya ellen („a néma üres lista »nincs adat«-ot hazudik a
 * »nem tudjuk« helyett"):
 *   · `sorok: []`        → tényleg nincs gyülekezet a hatókörben (üres adat);
 *   · `nincsHatokor`     → a hívónak nincs feloldható hatóköre (fail-closed);
 *   · `rpcHianyzik`      → a gyulekezeti_hierarchia() RPC nincs telepítve —
 *                          a felület a migráció nevét mondja ki;
 *   · `error` (egyedül)  → egyéb hiba — SOHA nem jeleníthető üres listaként.
 */
export interface SzervezetTerkepEredmeny {
  sorok?: HierarchiaSor[]
  /** Magyar hibaüzenet — hibánál a hívó KÖTELES kiírni, nem üres listát mutatni. */
  error?: string
  /** true = a gyulekezeti_hierarchia() RPC hiányzik (a 2026-08-25-ös migráció nem futott le). */
  rpcHianyzik?: boolean
  /** true = a hívónak nincs feloldható hatóköre (≠ üres adat, ≠ hiba). */
  nincsHatokor?: boolean
}

// ─────────────────────────────────────────────────────────────────────────
// Bontás-cella kulcsok a lelkeszi_jelentes kezi_adatok / felulirasok jsonb-iben
// ─────────────────────────────────────────────────────────────────────────

export const EGYSEG_KULCS_PREFIX = 'egyseg:'

const UUID_MINTA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Az anyaközpont oszlop kulcs-azonosítója (nem tárolt egység, nincs uuid-ja). */
export const ANYA_OSZLOP_ID = 'anya'

/**
 * `egyseg:<egysegId>:<mezoId>` kulcs a bontás-cellákhoz.
 * Az anyaközpont oszlopa: `egyseg:anya:<mezoId>`.
 */
export function egysegMezoKulcs(egysegId: string, mezoId: string): string {
  return `${EGYSEG_KULCS_PREFIX}${egysegId}:${mezoId}`
}

/**
 * Kulcs-felbontás. null, ha nem érvényes bontás-kulcs (nem `egyseg:` prefixű,
 * nem uuid/'anya' az egység-azonosító, vagy üres a mezőazonosító).
 */
export function parseEgysegMezoKulcs(
  kulcs: string,
): { egysegId: string; mezoId: string } | null {
  if (!kulcs.startsWith(EGYSEG_KULCS_PREFIX)) return null
  const maradek = kulcs.slice(EGYSEG_KULCS_PREFIX.length)
  const elvalaszto = maradek.indexOf(':')
  if (elvalaszto <= 0 || elvalaszto === maradek.length - 1) return null
  const egysegId = maradek.slice(0, elvalaszto)
  if (egysegId !== ANYA_OSZLOP_ID && !UUID_MINTA.test(egysegId)) return null
  return { egysegId, mezoId: maradek.slice(elvalaszto + 1) }
}

/**
 * A bontás-tábla mutató-készlete (a terv D2 pontja) — mezoId-k a
 * JELENTES_MEZOK katalógusból. Append-only: sorrend = a tábla sor-sorrendje.
 *  - I.10 lélekszám · I.11 választók · I.2c keresztelt · I.3c temetett ·
 *    I.16 esketett · V.7c konfirmált
 *  - II.1a vasárnapi alkalmak · II.1b vasárnapi átlagjelenlét ·
 *    II.6a hétköznapi alkalmak · II.12 úrvacsoraosztások
 *  - V.3 katekézis-alkalmak · III.7 családlátogatások
 *  - VII.1 egyházfenntartói járulék (a befizető személy egysége szerinti
 *    JAVASLAT) · VII.3 perselypénz (a munkanapló alkalom-soraiból)
 */
export const BONTAS_MEZO_IDS = [
  'I.10',
  'I.11',
  'I.2c',
  'I.3c',
  'I.16',
  'V.7c',
  'II.1a',
  'II.1b',
  'II.6a',
  'II.12',
  'V.3',
  'III.7',
  'VII.1',
  'VII.3',
] as const

export type BontasMezoId = (typeof BONTAS_MEZO_IDS)[number]

/**
 * Nem összegezhető (átlag-jellegű) mutatók — ezeknél a Σ oszlop nem a cellák
 * összege, hanem a fő jelentés (teljes gyülekezetre számolt) értéke.
 */
export const BONTAS_NEM_OSSZEGZO_MEZOK: ReadonlySet<string> = new Set(['II.1b'])
