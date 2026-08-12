/**
 * Admin ÁTTEKINTÉS — típusok és TISZTA döntési logika (2026-08-12).
 *
 * ⚠️ Next.js 16: a `use server` fájl CSAK async függvényt exportálhat, ezért a
 *    típusok és a szinkron függvények ITT élnek.
 *
 * ⚠️ Ez a fájl SZÁNDÉKOSAN import-mentes. A `scripts/selftest-attekintes.mjs`
 *    közvetlenül betölti és állításokat tesz a sürgősség-sorrendre és az
 *    újdonság-számításra. Ha ide valaha projekt-import kerül, az önteszt
 *    LÁTHATÓAN elbukik.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * KÉT SZABÁLY, AMI AZ EGÉSZ OLDALT VEZÉRLI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 1. NINCS NÉMA NULLA. Minden ág HÁROM állapotot tud: van adat / nincs
 *    jogosultságod hozzá / nem sikerült lekérdezni. A harmadik SOHA nem
 *    látszhat nullának, mert a nulla megnyugtat. Ez a projekt visszatérő
 *    hibaosztálya: „öt gyökeresen különböző eset ugyanúgy nézett ki: sehogy".
 *
 * 2. AZ „ÚJDONSÁG" MINDIG KIMONDJA A FORRÁSÁT. Az egész rendszerben EGYETLEN
 *    adat mondja meg, hogy a rendszergazda LÁTOTT-e valamit: az
 *    `ertesitesek.olvasva`. Minden más csempén csak időablakot („2 új az
 *    elmúlt 24 órában") vagy érintetlenséget („2 jegyet még senki nem nyitott
 *    meg") állíthatunk. A „még nem láttad" felirat máshol HAZUGSÁG lenne.
 */

// ────────────────────────────────────────────────────────────────────────────
// Ág-állapot: minden csempe maga mondja meg, mi van vele
// ────────────────────────────────────────────────────────────────────────────

export type AgHibaFajta =
  /** A néző profilja nem fér hozzá ehhez az adathoz. NEM hiba — a csempe elmarad. */
  | 'nincs_jog'
  /** A hozzá tartozó SQL még nem futott le éles adatbázisban. TEENDŐ, nem hiba. */
  | 'nincs_sql'
  /** Bármi más: a felület LÁTHATÓAN jelzi. */
  | 'hiba'

export type Ag<T> =
  | { ok: true; adat: T }
  | { ok: false; fajta: AgHibaFajta; uzenet: string }

export function agOk<T>(adat: T): Ag<T> {
  return { ok: true, adat }
}

export function agHiba<T>(fajta: AgHibaFajta, uzenet: string): Ag<T> {
  return { ok: false, fajta, uzenet }
}

/** Segéd a felületnek: van-e használható adat. */
export function agAdat<T>(ag: Ag<T> | undefined): T | null {
  return ag && ag.ok ? ag.adat : null
}

// ────────────────────────────────────────────────────────────────────────────
// Újdonság-jelvények — HÁROM engedélyezett forrás, más nincs
// ────────────────────────────────────────────────────────────────────────────

export type UjdonsagFajta =
  /** `ertesitesek.olvasva = false` — az EGYETLEN valódi „még nem láttad". */
  | 'olvasatlan'
  /** `created_at` időablak — „N új az elmúlt 24 órában". */
  | 'ido24'
  /** `created_at` időablak — „N új az elmúlt 7 napban". */
  | 'ido7'
  /** Érintetlen állapot — `status='new'` / `pending`, „még senki nem nyúlt hozzá". */
  | 'erintetlen'

export interface UjdonsagJelveny {
  fajta: UjdonsagFajta
  /** A KIÍRT felirat. Kötelezően megmondja a forrást. */
  szoveg: string
}

const ORA_MS = 60 * 60 * 1000
const NAP_MS = 24 * ORA_MS

/** Hány teljes nap telt el az ISO időpont óta. `null` bemenetre `null`. */
export function eltelt_nap(iso: string | null | undefined, most: number): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((most - t) / NAP_MS)
}

/** Beleesik-e az ISO időpont az elmúlt `ora` órába. */
export function ablakban(
  iso: string | null | undefined,
  most: number,
  ora: number,
): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return false
  return most - t <= ora * ORA_MS && t <= most
}

/** Hány elem esik az elmúlt `ora` órába. */
export function ablakban_szamol(
  isok: Array<string | null | undefined>,
  most: number,
  ora: number,
): number {
  return isok.filter((i) => ablakban(i, most, ora)).length
}

/**
 * Időablak-jelvény. `null`, ha nincs mit jelezni — üres jelvényt nem teszünk ki.
 * A szöveg SOHA nem mondja azt, hogy „amit nem láttál".
 */
export function idoJelveny(darab: number, ora: 24 | 168): UjdonsagJelveny | null {
  if (darab <= 0) return null
  return {
    fajta: ora === 24 ? 'ido24' : 'ido7',
    szoveg:
      ora === 24
        ? `${darab} új az elmúlt 24 órában`
        : `${darab} új az elmúlt 7 napban`,
  }
}

/** Érintetlenség-jelvény („még senki nem nyúlt hozzá"). */
export function erintetlenJelveny(darab: number, mit: string): UjdonsagJelveny | null {
  if (darab <= 0) return null
  return { fajta: 'erintetlen', szoveg: `${darab} ${mit}` }
}

/**
 * Olvasatlan harang-üzenet — ez az EGYETLEN hely, ahol „neked szól, még nem
 * olvastad" kiírható.
 */
export function olvasatlanJelveny(darab: number): UjdonsagJelveny | null {
  if (darab <= 0) return null
  return {
    fajta: 'olvasatlan',
    szoveg: `${darab} neked szól, még nem olvastad`,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Riadók — FIX ikon, FIX alapsúly, ezért STABIL sorrend
// ────────────────────────────────────────────────────────────────────────────

export type RiadoAzonosito =
  | 'god_mode'
  | 'mentes'
  | 'adattorles'
  | 'kerelem'
  | 'jegy'
  | 'licenc'
  | 'import'
  | 'duplikatum'
  | 'arva_gyulekezet'
  | 'frissites'
  | 'nincs_sql'

/**
 * Négy fokozat, NÉGY KÜLÖNBÖZŐ IKONALAK (WCAG 1.4.1: az állapot sosem csak
 * szín — szürkeárnyalatos nyomtatásban és színtévesztéssel is megkülönböztethető).
 */
export type RiadoFokozat = 'kritikus' | 'figyelem' | 'tajekoztato'

/**
 * A fokozat SÁVOT ad, az azonosító a sávon BELÜLI helyet.
 *
 * ⚠️ EZ A KONCEPCIÓ LEGFONTOSABB ENGEDMÉNYE. Az eredeti terv tisztán a mért
 * súly szerint rendezett volna — csakhogy az elveszi az izommemóriát pont
 * attól a felhasználótól (55+ éves lelkész, gyakran telefonon), akinek a
 * legnagyobb szüksége van rá: „minden nap máshol van minden" nem izgalmat
 * kelt, hanem bizonytalanságot. Ezért a sorrend FIX: egy adott riadó-típus
 * MINDIG ugyanott áll a többihez képest; csak az változik, hogy megjelenik-e.
 */
const FOKOZAT_SAV: Record<RiadoFokozat, number> = {
  kritikus: 1000,
  figyelem: 500,
  tajekoztato: 0,
}

const ALAPSULY: Record<RiadoAzonosito, number> = {
  god_mode: 99, // korlátlan hozzáférés minden gyülekezet adatához
  mentes: 95, // az egyetlen visszafordíthatatlan veszteség
  adattorles: 80, // visszafordíthatatlan művelet
  kerelem: 70, // a másik oldalon egy ember VÁR
  jegy: 65, // egy lelkész elakadt és kérdezett
  licenc: 60, // hétfő reggel nem tud belépni az asztali programba
  import: 50, // csendes adatromlás
  duplikatum: 40, // kettős nyilvántartás
  frissites: 30, // kiküldésre váró fejlesztés
  arva_gyulekezet: 20, // néma torzítás az összesítőkben
  nincs_sql: 10, // tartós rendszerállapot, nem esemény
}

export interface Riado {
  id: RiadoAzonosito
  fokozat: RiadoFokozat
  /** Rövid cím — a csempe fejléce. */
  cim: string
  /** EGY magyar mondat a MÉRT adatból. Általános bölcsesség SOHA. */
  mondat: string
  /** Nagy szám, ha van értelme. `null`, ha az állapot maga az információ. */
  szam: number | null
  gombFelirat: string
  ut: string
  jelvenyek: UjdonsagJelveny[]
  /** További, halkabb sorok (pl. „a legrégebbi 9 napja vár"). */
  alsorok: string[]
}

export function riadoSuly(r: Pick<Riado, 'id' | 'fokozat'>): number {
  return FOKOZAT_SAV[r.fokozat] + ALAPSULY[r.id]
}

/**
 * Riadók sorba állítása. STABIL és DETERMINISZTIKUS: azonos bemenetre mindig
 * ugyanaz a sorrend, és a bemeneti tömböt nem módosítja.
 */
export function riadokSorrendben(riadok: Riado[]): Riado[] {
  return [...riadok].sort((a, b) => riadoSuly(b) - riadoSuly(a))
}

/**
 * „EGY DOLOG, AMIT MA MEGTEHETSZ" — a legsúlyosabb riadó.
 *
 * Nem tanács-motor: a mondat egy MÉRT számhoz kötött feltételes állítás. Ha
 * egyetlen riadó sincs, `null` — ilyenkor a felület nem tanácsol, hanem
 * felsorolja, MIT ellenőrzött.
 */
export function napTeendoje(riadok: Riado[]): Riado | null {
  return riadokSorrendben(riadok)[0] ?? null
}

// ────────────────────────────────────────────────────────────────────────────
// A fejléc egyetlen mondata
// ────────────────────────────────────────────────────────────────────────────

/**
 * A lap legfontosabb szövege. Tegezés, magyar számnév-egyeztetés.
 *
 * ⚠️ Ha BÁRMELYIK ág elbukott, a mondat NEM állíthatja, hogy nincs teendő —
 * a kép hiányos, és ezt ki kell mondani. A hamis megnyugtatás rosszabb, mint
 * a hiányzó információ.
 */
export function fejlecMondat(args: {
  riadokSzama: number
  hibasAgak: number
}): string {
  if (args.riadokSzama === 0 && args.hibasAgak > 0) {
    return `Nem találtam teendőt, de ${args.hibasAgak} ellenőrzés most nem futott le — a kép hiányos.`
  }
  if (args.riadokSzama === 0) return 'Ma nincs teendő.'
  const alap =
    args.riadokSzama === 1 ? 'Ma 1 dolog vár rád.' : `Ma ${args.riadokSzama} dolog vár rád.`
  if (args.hibasAgak > 0) {
    return `${alap} Ezen felül ${args.hibasAgak} ellenőrzés nem futott le.`
  }
  return alap
}

// ────────────────────────────────────────────────────────────────────────────
// A csempék adatai
// ────────────────────────────────────────────────────────────────────────────

/** Egy nyugodt „pulzus" csempe: szám + címke, riadó-szerep nélkül. */
export interface PulzusCsempe {
  id: string
  cimke: string
  ertek: string
  /** Halkabb alsor. `null`, ha nincs mit mondani — nullát nem írunk ki. */
  alsor: string | null
  ut: string | null
}

export interface IdovonalSor {
  id: string
  szoveg: string
  ki: string | null
  mikor: string
  /** Kiemelt sor: visszafordíthatatlan vagy jogosultsági esemény. */
  kiemelt: boolean
}

export interface UzenetSor {
  id: string
  cim: string
  mikor: string | null
  olvasatlan: boolean
}

export interface ModulPirula {
  href: string
  szam: number
  /** Mértékegységgel együtt, sosem csupasz szám. */
  felirat: string
}

export interface EgyhazmegyeSor {
  nev: string
  gyulekezetek: number
  tagok: number
}

export interface EgyhazmegyeBontas {
  sorok: EgyhazmegyeSor[]
  /**
   * ⚠️ HA `false`, A TAGSZÁM-OSZLOP NEM IGAZ. Az egyházmegyénkénti tagszám egy
   * RPC-ből jön (`admin_overview_member_counts`); ha az SQL nem futott le éles
   * adatbázisban, a régi kód NÉMÁN 0-t mutatott minden egyházmegyénél. A
   * felület ebből LÁTHATÓ hiba-állapotot csinál, nem nullát.
   */
  tagszamElerheto: boolean
}

export interface AttekintesAdat {
  /** Mikor készült a mérés (ISO). A felület kiírja. */
  mertAt: string
  /** A gyorsítótárból jött-e (a „Frissítés" gomb ezt üríti). */
  gyorsitotarbol: boolean
  riadok: Riado[]
  pulzus: PulzusCsempe[]
  idovonal: Ag<IdovonalSor[]>
  uzenetek: Ag<UzenetSor[]>
  egyhazmegyek: Ag<EgyhazmegyeBontas>
  modulPirulak: ModulPirula[]
  /** Mit ellenőriztünk sikeresen — az üres állapot ezt sorolja fel. */
  ellenorizve: string[]
  /** Mi nem futott le — a felület KIÍRJA, nem hallgatja el. */
  nemFutottLe: Array<{ mi: string; miert: string; fajta: AgHibaFajta }>
  /** Rendszer-szintű admin-e a néző (a Rendszer/Veszélyes zóna kártyákhoz). */
  rendszerAdmin: boolean
}
