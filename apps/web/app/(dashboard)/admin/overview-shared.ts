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
 *
 * ⚠️ A `hibasAgak` a `hibasAgakSzama()`-ból jön, NEM a `nemFutottLe.length`-ből.
 *    A kettő nem ugyanaz, és a különbség pont a legfontosabb bukásokat rejtette
 *    el — lásd a `hibasAgakSzama()` docstringjét.
 */
export function fejlecMondat(args: {
  riadokSzama: number
  hibasAgak: number
}): string {
  if (args.riadokSzama === 0 && args.hibasAgak > 0) {
    return `Nem találtam teendőt, de ${args.hibasAgak} ellenőrzés most nem adott választ — a kép hiányos.`
  }
  if (args.riadokSzama === 0) return 'Ma nincs teendő.'
  const alap =
    args.riadokSzama === 1 ? 'Ma 1 dolog vár rád.' : `Ma ${args.riadokSzama} dolog vár rád.`
  if (args.hibasAgak > 0) {
    return `${alap} Ezen felül ${args.hibasAgak} ellenőrzés nem adott választ.`
  }
  return alap
}

/**
 * HÁNY ELLENŐRZÉS NEM ADOTT VÁLASZT — a lap FŐ ÍTÉLETÉNEK egyetlen nevezője.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ MIÉRT NEM ELÉG A `nemFutottLe.length` (2026-08-12-i javítás)
 * ════════════════════════════════════════════════════════════════════════════
 * A bukások KÉT csatornán érkeznek, és a fejléc korábban csak az egyiket nézte:
 *
 *   (a) `nemFutottLe` — az ÁG egésze elhasalt (pl. a harang-üzenetek
 *       lekérdezése). Ezt a lap külön, piros dobozban is felsorolja.
 *   (b) a téma-csoportok `hianyzo` tömbjei — az ág lefutott, de EGY SZÁM nem
 *       jött meg belőle. Ide esik a legfontosabb három eset:
 *         · a mentés-lefedettség számítása hibázott (az ág maga „ok" volt),
 *         · az `admin_overview_member_counts` RPC nem futott le élesben,
 *         · az országos head-count-ok részleges bukásai.
 *
 * A régi kód a (b) csatornát figyelmen kívül hagyta, ezért riadó nélküli napon
 * a lap tetején zöld kerettel az állt, hogy „Ma nincs teendő" + „Ezeket néztem
 * meg: … biztonsági mentés …", KÖZVETLENÜL egy piros doboz fölött, ami
 * kimondta: „NEM nulla, hanem nem tudjuk". Pontosan az a hamis megnyugtatás,
 * amit a `fejlecMondat` docstringje megtilt.
 */
export function hibasAgakSzama(adat: {
  nemFutottLe: ReadonlyArray<unknown>
  szamCsoportok: ReadonlyArray<{ hianyzo: ReadonlyArray<unknown> }>
}): number {
  return (
    adat.nemFutottLe.length +
    adat.szamCsoportok.reduce((n, cs) => n + cs.hianyzo.length, 0)
  )
}

/**
 * VERZIÓ-FELIRAT — a kiírható alak EGYETLEN helyen (2026-08-12).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ MIÉRT NEM ELÉG EGY `replace(/^v/i, '')`
 * ════════════════════════════════════════════════════════════════════════════
 * A verziószám KÉT, egymástól eltérő alakban érkezik:
 *   · `apps/web/package.json` → `0.9.164`
 *   · `docs/CHANGELOG.md`     → `web v0.9.162` (a `<!-- version: ... -->` metaadat
 *                               MINDEN sora `web `/`desktop ` előtaggal áll)
 * A régi kód a `.replace(/^v/i, '')` után elé tett egy `v`-t. A `^v` a
 * `web v0.9.162`-re NEM illeszkedik, tehát a csempén szó szerint ez állt:
 * `vweb v0.9.162`. Ugyanaz a hibaosztály, mint a „10.650685 órája": nyers,
 * formázatlan érték a tulajdonos szeme előtt.
 *
 * @returns `null`, ha nincs mit kiírni — nullát/üres `v`-t nem írunk ki.
 */
export function verzioFelirat(nyers: string | null | undefined): string | null {
  if (!nyers) return null
  const tiszta = nyers
    .trim()
    .replace(/^(web|desktop)\s+/i, '')
    .replace(/^v/i, '')
    .trim()
  return tiszta ? `v${tiszta}` : null
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

/**
 * TÉMA SZERINTI SZÁM-CSOPORT (2026-08-12).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT CSOPORTOK, ÉS NEM EGY HOSSZÚ SOR CSEMPE
 * ════════════════════════════════════════════════════════════════════════════
 * A tulajdonos kérése: „legyen MINÉL TÖBB statisztika és érdekesség a rendszerről
 * a rendszergazda szeme előtt". Csakhogy 25 egyforma csempe egy rácsban nem
 * információ, hanem tapéta: a szem nem tudja, hol keresse, amit keres.
 *
 * A csoport adja vissza azt, amit a sűrűség elvesz. A CSOPORTOK SORRENDJE FIX
 * (Gyülekezetek → Emberek → Anyakönyv → Rendszer), és a csoporton BELÜLI
 * sorrend is az — ugyanaz az izommemória-szabály, mint a riadóknál.
 */
export interface SzamCsoport {
  id: string
  cim: string
  /**
   * A csoport NEVEZŐJE vagy korlátja, ha van. Pl. „2 gyülekezet nyilvántartásából".
   *
   * ⚠️ EZ NEM DÍSZ. 783 gyülekezet van, de országosan 606 élő tag: minden
   * „országos" összesítő valójában egy-két gyülekezet adata. Nevező nélkül az
   * ilyen szám HAZUGSÁG — ugyanaz a hibaosztály, mint a néma nulla.
   */
  megjegyzes: string | null
  sorok: PulzusCsempe[]
  /**
   * Amit ebben a csoportban NEM sikerült lekérdezni — a felület KIÍRJA a
   * csoport alján. Nulla SOHA nem helyettesítheti a „nem tudjuk"-öt.
   */
  hianyzo: string[]
}

/** Egy nap a 14 napos mentés-pulzusban (a felület mini oszlopcsíkot rajzol). */
export interface MentesPulzusNap {
  nap: string
  igazolt: number
  hibas: number
  varhato: number
  /** ⚠️ `false` = a rendszer akkor még nem létezett: SEMLEGES, nem piros. */
  letezett: boolean
}

/** Egy sor a „legnagyobb gyülekezetek" listában. */
export interface GyulekezetMeret {
  nev: string
  tagok: number
}

// ────────────────────────────────────────────────────────────────────────────
// Tiszta számítások az új csempékhez — az önteszt EZEKET védi
// ────────────────────────────────────────────────────────────────────────────

/**
 * HÁNY NAPJA MEGY HIBÁTLANUL A MENTÉS — a 14 napos pulzusból visszafelé.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * HÁROM DÖNTÉS, AMI NEM ÖNKÉNYES
 * ════════════════════════════════════════════════════════════════════════════
 * (1) A MAI NAP KIMARAD. A napi mentés hajnali cronból fut; ha valaki reggel
 *     08:00-kor nézi meg, a mai nap még nyitva van. A mai napot beszámítva a
 *     sorozat minden reggel 0-ra esne — vagyis a csempe MINDEN NAP hazudna.
 * (2) A `letezett: false` nap NEM SZAKÍTJA MEG a sorozatot, hanem LEZÁRJA:
 *     a rendszer telepítése előtti napokért nem hibáztatunk, de nem is
 *     számoljuk bele. Ilyenkor a `teljesAblak` `false`, és a felület ezt
 *     „legalább N napja" alakban mondja ki.
 * (3) A `varhato === 0` nap ISMERETLEN, nem sikeres. Ha nem tudjuk, hány
 *     hatókörnek KELLETT volna mentés, akkor azt sem tudjuk, hogy megvan-e —
 *     a sorozat itt megáll. „Nem tudom" soha nem lehet zöld.
 *
 * @returns `null`, ha egyáltalán nincs kiértékelhető nap.
 */
export function hibatlanSorozat(
  pulzus: MentesPulzusNap[],
): { napok: number; teljesAblak: boolean } | null {
  if (pulzus.length < 2) return null
  let napok = 0
  let teljesAblak = true
  // A tömb a legrégebbitől a maiig tart; a MAI (utolsó) elem kimarad.
  for (let i = pulzus.length - 2; i >= 0; i -= 1) {
    const n = pulzus[i]
    if (!n.letezett) {
      // A rendszer még nem létezett — a sorozat itt véget ér, de nem hibából.
      teljesAblak = false
      break
    }
    if (n.varhato <= 0) {
      teljesAblak = false
      break
    }
    if (n.hibas > 0 || n.igazolt < n.varhato) break
    napok += 1
  }
  return { napok, teljesAblak: teljesAblak && napok === pulzus.length - 1 }
}

/**
 * KÉT `YYYY-MM-DD` NAP KÖZTI TELJES NAPOK SZÁMA.
 *
 * ⚠️ SZÁNDÉKOSAN `Date.UTC`-vel számol, NEM `new Date('2026-08-12')`
 *    összehasonlítással: így az óraátállítás (Europe/Bucharest UTC+2/+3) nem
 *    csúsztat el egy napot. A bemenet MÁR bukaresti naptári nap.
 *
 * @returns `null`, ha bármelyik bemenet nem `YYYY-MM-DD` alakú.
 */
export function napKulonbseg(korabbi: string, kesobbi: string): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(korabbi)
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(kesobbi)
  if (!a || !b) return null
  const ta = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]))
  const tb = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]))
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null
  return Math.round((tb - ta) / NAP_MS)
}

/**
 * ÜRES CSOPORTOK KISZŰRÉSE — a csend elve a szám-zónában is érvényes.
 *
 * Egy csoport akkor marad meg, ha van legalább egy KIÍRHATÓ száma, VAGY van
 * bevallott hiánya. Ami se nem tud, se nem hiányzik, az nem foglal helyet.
 */
export function csoportokSorrendben(csoportok: SzamCsoport[]): SzamCsoport[] {
  return csoportok.filter((cs) => cs.sorok.length > 0 || cs.hianyzo.length > 0)
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
  /**
   * A nyugodt számok, TÉMA SZERINT csoportosítva (2026-08-12-től; korábban egy
   * lapos `pulzus` tömb volt 5 csempével).
   */
  szamCsoportok: SzamCsoport[]
  idovonal: Ag<IdovonalSor[]>
  uzenetek: Ag<UzenetSor[]>
  egyhazmegyek: Ag<EgyhazmegyeBontas>
  /** A legnagyobb gyülekezetek — NULLA extra lekérdezés (`getAdminOverview.top10`). */
  legnagyobbak: Ag<GyulekezetMeret[]>
  /** 14 napos mentés-pulzus — NULLA extra lekérdezés (`computeCoverage`). */
  mentesPulzus: Ag<MentesPulzusNap[]>
  modulPirulak: ModulPirula[]
  /** Mit ellenőriztünk sikeresen — az üres állapot ezt sorolja fel. */
  ellenorizve: string[]
  /** Mi nem futott le — a felület KIÍRJA, nem hallgatja el. */
  nemFutottLe: Array<{ mi: string; miert: string; fajta: AgHibaFajta }>
  /** Rendszer-szintű admin-e a néző (a Rendszer/Veszélyes zóna kártyákhoz). */
  rendszerAdmin: boolean
}
