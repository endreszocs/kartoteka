/**
 * Pénzügyi modul — közös típusok (Sprint Q Fázis 1, 2026-04-25, v0.6.0).
 *
 * Web és desktop EGYFORMÁN ezt importálja. Korábban csak a webben élt
 * (`apps/web/lib/constants/finance.ts`); az átvitel a `feedback_web_desktop_parity`
 * elv szerint történik — egyetlen igazság-forrás a finance modulhoz.
 *
 * Itt a TÍPUSOK + KONSTANSOK élnek. A pure-utility függvények és a UI-komponensek
 * külön fájlokban (helpers.ts / FinanceDashboard.tsx stb.).
 */

// ── Irattípusok ──────────────────────────────────────────────

export const RECEIPT_TYPES = ['Készpénz', 'Banki'] as const
export type ReceiptType = (typeof RECEIPT_TYPES)[number]

// ── Belső mozgás típusok ─────────────────────────────────────

export const TRANSFER_TYPES = [
  'kassza_bank',
  'bank_kassza',
  'bank_bank',
  'valutacsere',
] as const
export type TransferType = (typeof TRANSFER_TYPES)[number]

export const TRANSFER_TYPE_LABELS: Record<TransferType, string> = {
  kassza_bank: 'Kassza → Bank',
  bank_kassza: 'Bank → Kassza',
  bank_bank: 'Bank → Bank',
  valutacsere: 'Valutacsere',
}

// ── Bérleti szerződés gyakoriság ─────────────────────────────
// FONTOS: A DB CHECK constraint csak 'havi' és 'eves' értéket enged
// (berleti_szerzodes.fizetesi_ciklus). Ha később bővítjük, a DB constraint-et
// is frissíteni kell.

export const RENTAL_FREQUENCIES = ['havi', 'eves'] as const
export type RentalFrequency = (typeof RENTAL_FREQUENCIES)[number]

export const RENTAL_FREQ_LABELS: Record<RentalFrequency, string> = {
  havi: 'Havi',
  eves: 'Éves',
}

// ── Bérleti szerződés típusa (terület vagy épület) ───────────

export const RENTAL_TIPUS = ['terulet', 'epulet'] as const
export type RentalTipus = (typeof RENTAL_TIPUS)[number]

export const RENTAL_TIPUS_LABELS: Record<RentalTipus, string> = {
  terulet: 'Terület',
  epulet: 'Épület',
}

/**
 * Bérleti típus → számadási cél kód térképe.
 *
 * A befizetéseket a `befizetescel.id_szamadasicel` mező alapján párosítjuk
 * a szerződéshez. Terület bérlet = 104.05, épület bérlet = 104.04.
 */
export const RENTAL_SZAMADASICEL_MAP: Record<RentalTipus, string> = {
  terulet: '104.05',
  epulet: '104.04',
}

// A számadási cél kódok listája — lekérdezésekhez hasznos (pl. befizetések
// szűrése bérleti díjakra)
export const RENTAL_SZAMADASICEL_CODES = Object.values(RENTAL_SZAMADASICEL_MAP)

// ── Bérleti szerződés JOGI típusa (TVA-kezelés, e-Factura kötelezettség) ────

export const RENTAL_JOGI_TIPUS = ['locatiune', 'arendare', 'comodat', 'concesiune'] as const
export type RentalJogiTipus = (typeof RENTAL_JOGI_TIPUS)[number]

export const RENTAL_JOGI_TIPUS_LABELS: Record<RentalJogiTipus, string> = {
  locatiune: 'Bérleti (locațiune)',
  arendare: 'Mezőgazdasági bérlet (arendare)',
  comodat: 'Haszonkölcsön (comodat — ingyenes)',
  concesiune: 'Koncesszió (concesiune)',
}

export const RENTAL_JOGI_TIPUS_LEIRAS: Record<RentalJogiTipus, string> = {
  locatiune:
    'Ellenérték fejében adott használat (ház, iroda, eszköz). Számít a TVA-plafonba, de e-Factura alól kivétel.',
  arendare:
    'Mezőgazdasági terület bérbeadása gazdálkodónak. Számít a TVA-plafonba, consiliul local-nál 15 napon belül regisztrálni kell.',
  comodat:
    'Ingyenes használatba adás (pl. Diaconia, ifjúsági csoport). NEM számít a TVA-plafonba, nem kell számlát kiállítani.',
  concesiune:
    'Hosszú távú koncesszió (ritka). Számít a TVA-plafonba, könyvelővel egyeztetendő.',
}

// ── Bérleti szerződés bérlő típusa ───────────────────────────

export const RENTAL_BERLO_TIPUS = ['szemely', 'ceg'] as const
export type RentalBerloTipus = (typeof RENTAL_BERLO_TIPUS)[number]

export const RENTAL_BERLO_TIPUS_LABELS: Record<RentalBerloTipus, string> = {
  szemely: 'Magánszemély',
  ceg: 'Cég / Szervezet',
}

// ── Bérleti szerződés sorok ──────────────────────────────────

export interface RentalContractRow {
  id: string
  congregation_id: string
  berlo_nev: string
  id_szemely: number | null
  targy: string | null
  leiras: string
  tipus: RentalTipus
  /** Jogi típus — TVA-plafon és e-Factura kezeléséhez. Alapértelmezés: locatiune. */
  jogi_tipus?: RentalJogiTipus
  osszeg: number
  fizetesi_ciklus: RentalFrequency
  kezdet: string // ISO date
  vege: string | null // ISO date | null
  id_szamadasicel: string
  leltari_szam: string | null
  telekkonyvi_szam: string | null
  ceg_nev: string | null
  ceg_adoszam: string | null
  aktiv: boolean
  megjegyzes: string | null
  created_at: string | null
  userid: string | null
  deleted: boolean
}

export interface RentalDebtRow {
  contractId: string
  berlo_nev: string
  leiras: string
  tipus: RentalTipus
  evesDij: number
  fizett: number
  hatralek: number
}

// ── Devizás átértékelés (FX revaluation, B2 modul) ───────────

/**
 * A számadási cél kódok az árfolyam-nyereséghez és -veszteséghez.
 * A KARTOTEKA gyülekezetekben ezeknek a befizetescel / kiadascel táblákban
 * léteznie kell. Ha hiányzik, a B2 modal warning toast-ot ad.
 */
export const FX_REVAL_NYERESEG_KOD = '103.04'
export const FX_REVAL_VESZTESEG_KOD = '203.03'

export const FX_REVAL_TIPUS = ['nyereseg', 'veszteseg', 'nulla'] as const
export type FxRevaluationTipus = (typeof FX_REVAL_TIPUS)[number]

export const FX_REVAL_TIPUS_LABELS: Record<FxRevaluationTipus, string> = {
  nyereseg: 'Árfolyam-nyereség',
  veszteseg: 'Árfolyam-veszteség',
  nulla: 'Nincs változás',
}

export const FX_ARFOLYAM_FORRAS = ['BNR', 'manual'] as const
export type FxArfolyamForras = (typeof FX_ARFOLYAM_FORRAS)[number]

export interface FxRevaluationRow {
  id: string
  congregation_id: string
  bankszamla_id: number
  ev: number
  valuta: string
  deviza_egyenleg: number
  regi_arfolyam: number | null
  regi_ron_ertek: number
  uj_arfolyam: number
  uj_ron_ertek: number
  kulonbozet: number
  tipus: FxRevaluationTipus
  arfolyam_datum: string
  arfolyam_forras: FxArfolyamForras
  befizetes_id: number | null
  kiadas_id: number | null
  megjegyzes: string | null
  userid: string
  created_at: string | null
  deleted: boolean
}

// ── Tartozás számítási mód ───────────────────────────────────

export type DebtCalcMode = 'akkori' | 'aktualis'

// ── Pénzügyi alap-beállítások (gyülekezet) ───────────────────

export interface BealitasRow {
  id: string
  congregation_id: string
  eves_jarulek: number | null
  jarulek_kedvezmenyes: number | null
  jarulek_hatarid: string | null
  budget_finalized: boolean
  accounting_finalized: boolean
  unlock_requested: boolean
  unlock_reason: string | null
  accounting_unlock_requested: boolean
  accounting_unlock_reason: string | null
  leltar_unlock_requested?: boolean
  leltar_unlock_reason?: string | null
  szamadas_zaro_adatok: Record<string, unknown> | null
  // Költségvetés módosítás flagek (3 kör)
  budget_mod1_finalized?: boolean
  budget_mod2_finalized?: boolean
  budget_mod3_finalized?: boolean
  budget_mod1_date?: string | null
  budget_mod2_date?: string | null
  budget_mod3_date?: string | null
  budget_mod1_hatarozat?: string | null
  budget_mod2_hatarozat?: string | null
  budget_mod3_hatarozat?: string | null
}

export interface SzamadasiCel {
  id: string
  nev: string
  kod: string
  type: 'B' | 'K'
  sorszam: number
  /** A tétel hatóköre: gyulekezet (default), egyhazmegye, kerulet.
   *  A gyülekezeti pénzügyi felületeken csak a 'gyulekezet' szintű tételek jelennek meg. */
  szint?: 'gyulekezet' | 'egyhazmegye' | 'kerulet'
}

export interface BankAccount {
  id: number
  bank_neve: string
  iban: string | null
  valuta: string
  aktiv: boolean
  nyito_egyenleg: number | null
  szin: string | null
  ikon: string | null
  is_default: boolean
}

// ── Bankszámla nyitó egyenleg (év elejei pozíció) ────────────

/**
 * Egy bankszámla éves nyitó egyenlege a `bankszamla_nyito_egyenleg` táblából.
 *
 * Valutás számláknál a RON ekvivalens is rögzítve (árfolyammal).
 * Forrás:
 *   - `manual` — lelkész manuálisan rögzítette
 *   - `import` — banki kivonat (BCR Excel) wizardja állította be
 *   - `carryover` — előző évi záró → következő évi nyitó automata átvitel
 */
export interface NyitoEgyenlegRow {
  id: number
  bankszamla_id: number
  eve: number
  nyito_egyenleg_valuta: number
  nyito_egyenleg_ron: number
  arfolyam: number | null
  forrasa: 'manual' | 'import' | 'carryover'
  megjegyzes: string | null
  created_at: string
  updated_at: string
}

export interface InternalTransferRow {
  id: number
  datum: string
  tipus: TransferType
  forras: string
  cel: string
  osszeg: number
  cel_osszeg: number | null
  arfolyam: number | null
  megjegyzes: string | null
  deleted: boolean | null
}

export interface DebtRow {
  memberId: number
  familyId: number | null
  name: string
  expected: number
  paid: number
  debt: number
  status: 'rendezve' | 'hatralekos' | 'felmentett'
  appliedRules: string[]
}

export interface ReceiptChronologyIssue {
  previousNumber: number
  previousDate: string
  currentNumber: number
  currentDate: string
}

// #Endre (issue 2): egy hiányzó gyülekezeti Irat sz. + a szomszédokból KIKÖVETKEZTETETT
// kerületi (nyomdai) szám. A kerületi és a gyülekezeti sorszám éven belül együtt lép (+1/+1),
// ezért a hiányzó nyugta kerületi száma a legközelebbi ismert szomszédokból interpolálható.
export interface MissingReceipt {
  iratSz: number
  keruletiSz: string | null
}

export interface ReceiptHealth {
  missingNumbers: number[]
  /** #Endre (issue 2): iratSz + (kikövetkeztetett) keruletiSz párok — a bevételezés-wizard előtöltéséhez. */
  missingReceipts: MissingReceipt[]
  duplicateNumbers: number[]
  chronologyIssues: ReceiptChronologyIssue[]
  trackedReceiptCount: number
  highestReceiptNumber: number | null
}

export interface BefitetesRow {
  id: number
  osszeg: number
  datum: string
  id_befizetescel: number | null
  id_szemely: number | null
  id_csalad: number | null
  forrasa: string | null
  nyugta: string | null
  iratszam: string | null
  irattipus: string | null
  fizetettev: number | null
  megjegyzes: string | null
  belso_mozgas_xkey: string | null
  /** Bankszámla azonosító: NULL = kassza (készpénz), kitöltve = banki tétel. */
  bankszamla_id: number | null
  deleted: boolean
  /** Stornózott tételek: a listában maradnak, de a számításokból kimaradnak. */
  stornozott?: boolean
  stornozott_indok?: string | null
  stornozott_at?: string | null
}

// ── Költségvetés (BudgetTab) ─────────────────────────────────

/**
 * Egy költségvetési cél (számadási cel-id) értékei: alap-tervezett +
 * 3 lehetséges módosítás (mod1, mod2, mod3) a 4-fázisos költségvetés-flow-hoz.
 */
export interface BudgetCompatRow {
  szamadasicelid: string
  /** Alap-tervezett összeg. */
  tervezett: number
  /** 1. módosítás (null, ha még nincs). */
  modositott: number | null
  /** 2. módosítás (null, ha még nincs). */
  mod2: number | null
  /** 3. módosítás (null, ha még nincs). */
  mod3: number | null
}

// ── Monetár (címlet-számoló) ─────────────────────────────────

export interface MonetaryDenomination {
  id: number
  category: 'bankjegy' | 'erme'
  /** A címlet RON-ban (pl. 100, 50, 0.5). */
  value: number
  /** Megjelenítési alak (pl. „100 RON", „50 bani"). */
  displayValue: string
  /** Magyar név (pl. „100 lejes", „50 banis"). */
  name: string
}

export interface KiadasRow {
  id: number
  osszeg: number
  datum: string
  id_kiadascel: number | null
  kedvezmenyzett: string | null
  atvevo: string | null
  id_szemely: number | null
  atvevoid: number | null
  nyugta: string | null
  iratszam: string | null
  bizonylatszam: string | null
  irattipus: string | null
  megjegyzes: string | null
  belso_mozgas_xkey: string | null
  /** Bankszámla azonosító: NULL = kassza (készpénz), kitöltve = banki tétel. */
  bankszamla_id: number | null
  deleted: boolean
  /** Stornózott tételek: a listában maradnak, de a számításokból kimaradnak. */
  stornozott?: boolean
  stornozott_indok?: string | null
  stornozott_at?: string | null
}

// ── Pénzügyi nyomtatási központ típusai (Sprint Q F1 v0.7.5) ────

/**
 * A `FinancePrintDialog` nyomtatványtípusai.
 * - `registru_casa`: kasszanapló
 * - `registru_banca`: banki napló (bankszámla választóval)
 * - `registru_jurnal`: főnapló
 * - `nyugtatomb_kimutatas`: éves nyugtatömb-kimutatás
 * - `kiadasi_kiseroiv`: kiadási kísérőív
 */
export type FinancePrintType =
  | 'registru_casa'
  | 'registru_banca'
  | 'registru_jurnal'
  | 'csoport_naplo'
  | 'nyugtatomb_kimutatas'
  | 'kiadasi_kiseroiv'
  | 'decont_reprint'
  | 'dispozitie_reprint'
  | 'koltsegvetes'
  | 'koltsegvetes_modositas'
  | 'szamadas'

/**
 * Egy korábban mentett bizonylat opció a nyomtatási központ újranyomtatás-
 * listájához (Decont / Dispoziție). A `data` a HTML-építéshez szükséges
 * teljes pillanatkép — a wrapper értelmezi.
 */
export interface SavedDocOption {
  id: string
  label: string
  kind: 'decont' | 'dispozitie'
  data: unknown
}

export interface FinancePrintTypeMeta {
  id: FinancePrintType
  title: string
  subtitle: string
  description: string
}

/**
 * Egy elkészített pénzügyi nyomtatvány — a print engine kapja meg.
 */
export interface PrintReport {
  html: string
  title: string
  filename: string
  orientation: 'portrait' | 'landscape'
}

/**
 * Nyugtatömb riport sor a `getChitantaTombokReport` server actionből.
 * Pontosan megegyezik a webes `apps/web/lib/finance/reporting.ts`-ben
 * definiálttal (Sprint Q F1, v0.7.5).
 */
export interface NyugtatombReportRow {
  sorszam: number
  block_nr: string | null
  seria: string
  nyomdai_kezdet: number
  nyomdai_veg: number
  datum_kezdet: string | null
  datum_veg: string | null
  sajat_kezdet: number | null
  sajat_veg: number | null
  felhasznalt_darabszam: number
  darabszam_ossz: number
  aktiv: boolean
}

// ── Költségvetés / számadás nyomtatási központ ────────────────

/**
 * A `BudgetPrintDialog` nyomtatványtípusai.
 * - `koltsegvetes`: éves költségvetés (terv)
 * - `koltsegvetes_modositas`: költségvetés-módosítás (mod1/2/3)
 * - `szamadas`: év végi számadás (tény vs terv)
 * - `reszszamadas`: időszakos részszámadás (dátumtartomány-szűrővel)
 */
export type BudgetPrintType =
  | 'koltsegvetes'
  | 'koltsegvetes_modositas'
  | 'szamadas'
  | 'reszszamadas'

export interface BudgetPrintTypeMeta {
  id: BudgetPrintType
  title: string
  subtitle: string
  description: string
}

// ─────────────────────────────────────────────────────────────────────────
// Könyvelhető kategóriák szűrése (2026-06-11, Endre észrevétele nyomán)
//
// A szamadasicel tábla AGGREGÁT sorokat is tartalmaz — pl. „Egyházi
// tevékenységből származó bevételek (5+...+12)", „Múlt évi pénztármaradvány
// (2+3)" —, amelyek NEM könyvelhető tételek, csak összesítő kategóriafejek,
// valamint egyházmegyei/kerületi szintű tételeket is. A rögzítő legördülőkben
// kizárólag a hivatalos EREK-katalógus LEVÉL-kategóriái jelenhetnek meg:
//   bevétel: 101.xx–107.xx (39 db) · kiadás: 201.xx–207.xx (48 db)
// (Ellenőrizve a hivatalos Adatok_2026.xlsx katalógusa ellen: pontosan 87.)
// A 100.xx egyenleg-sorok és a pont nélküli aggregátok (100, 101…207) kiesnek.
// ─────────────────────────────────────────────────────────────────────────

/** A gyülekezeti rögzítőben könyvelhető levél-kódok mintája. */
export const GYULEKEZETI_KONYVELHETO_KOD_RE = /^(10[1-7]|20[1-7])\.\d+$/

/**
 * A kanonikus belső-mozgás kódok — ezek NEM levél-kategóriák, de az összevont
 * rögzítő belső-mozgás sor-típusához kellenek (a CombinedEntryBody kezeli őket,
 * bank megléte szerint mutatva/rejtve).
 */
export const BELSO_MOZGAS_ROGZITO_KODS = new Set([
  '300.01',
  '301.01',
  '400.01',
  '401.01',
  '402.02',
])

/**
 * Könyvelhető-e a kategória a GYÜLEKEZETI rögzítőben?
 *   - hivatalos levél-kód (101.xx–107.xx / 201.xx–207.xx), ÉS
 *   - gyülekezeti szintű (szint hiánya = gyülekezeti, kompatibilitásból).
 * Egyházmegyei módban NE használd — ott az egyházmegyei készlet érvényes.
 */
export function isGyulekezetiKonyvelhetoKod(
  kod: string,
  szint?: 'gyulekezet' | 'egyhazmegye' | 'kerulet' | null,
): boolean {
  if (!GYULEKEZETI_KONYVELHETO_KOD_RE.test(kod)) return false
  if (szint && szint !== 'gyulekezet') return false
  return true
}
