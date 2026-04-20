// ── Pénznem és formázás ──────────────────────────────────────

export function formatCurrency(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return '0,00'
  const parts = Number(num).toFixed(2).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return parts[0] + ',' + parts[1]
}

// ── Irattípusok ──────────────────────────────────────────────

export const RECEIPT_TYPES = ['Készpénz', 'Banki'] as const
export type ReceiptType = typeof RECEIPT_TYPES[number]

// ── Belső mozgás típusok ─────────────────────────────────────

export const TRANSFER_TYPES = ['kassza_bank', 'bank_kassza', 'bank_bank', 'valutacsere'] as const
export type TransferType = typeof TRANSFER_TYPES[number]

export const TRANSFER_TYPE_LABELS: Record<TransferType, string> = {
  kassza_bank: 'Kassza → Bank',
  bank_kassza: 'Bank → Kassza',
  bank_bank: 'Bank → Bank',
  valutacsere: 'Valutacsere',
}

// ── Leltár kategória kulcsszavak ─────────────────────────────

const INVENTORY_KEYWORDS = [
  'beruházás',
  'felszerelés',
  'leltár',
  'alapeszköz',
  'eszköz',
  'gép',
  'bútor',
  'vasarlas',
  'vásárlás',
  'ertekesites',
  'értékesítés',
  'eladas',
  'eladás',
]

export function isInventoryCategory(categoryName: string): boolean {
  const lower = categoryName.toLowerCase()
  return INVENTORY_KEYWORDS.some(kw => lower.includes(kw))
}

// ── Bérleti szerződés gyakoriság ─────────────────────────────
// FONTOS: A DB CHECK constraint csak 'havi' és 'eves' értéket enged
// (berleti_szerzodes.fizetesi_ciklus). Ha később bővítjük, a DB constraint-et
// is frissíteni kell.

export const RENTAL_FREQUENCIES = ['havi', 'eves'] as const
export type RentalFrequency = typeof RENTAL_FREQUENCIES[number]

export const RENTAL_FREQ_LABELS: Record<RentalFrequency, string> = {
  havi: 'Havi',
  eves: 'Éves',
}

// ── Bérleti szerződés típusa (terület vagy épület) ───────────

export const RENTAL_TIPUS = ['terulet', 'epulet'] as const
export type RentalTipus = typeof RENTAL_TIPUS[number]

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
// 2026-04-16 óta a rendszer megkülönbözteti a különböző jogi formákat, mert
// TVA-plafon és e-Factura szempontból eltérően kezelődnek.

export const RENTAL_JOGI_TIPUS = ['locatiune', 'arendare', 'comodat', 'concesiune'] as const
export type RentalJogiTipus = typeof RENTAL_JOGI_TIPUS[number]

export const RENTAL_JOGI_TIPUS_LABELS: Record<RentalJogiTipus, string> = {
  locatiune: 'Bérleti (locațiune)',
  arendare: 'Mezőgazdasági bérlet (arendare)',
  comodat: 'Haszonkölcsön (comodat — ingyenes)',
  concesiune: 'Koncesszió (concesiune)',
}

export const RENTAL_JOGI_TIPUS_LEIRAS: Record<RentalJogiTipus, string> = {
  locatiune: 'Ellenérték fejében adott használat (ház, iroda, eszköz). Számít a TVA-plafonba, de e-Factura alól kivétel.',
  arendare: 'Mezőgazdasági terület bérbeadása gazdálkodónak. Számít a TVA-plafonba, consiliul local-nál 15 napon belül regisztrálni kell.',
  comodat: 'Ingyenes használatba adás (pl. Diaconia, ifjúsági csoport). NEM számít a TVA-plafonba, nem kell számlát kiállítani.',
  concesiune: 'Hosszú távú koncesszió (ritka). Számít a TVA-plafonba, könyvelővel egyeztetendő.',
}

// ── Bérleti szerződés bérlő típusa (magánszemély vagy cég) ───

export const RENTAL_BERLO_TIPUS = ['szemely', 'ceg'] as const
export type RentalBerloTipus = typeof RENTAL_BERLO_TIPUS[number]

export const RENTAL_BERLO_TIPUS_LABELS: Record<RentalBerloTipus, string> = {
  szemely: 'Magánszemély',
  ceg: 'Cég / Szervezet',
}

// ── Bérleti szerződés típusok ────────────────────────────────

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
export type FxRevaluationTipus = typeof FX_REVAL_TIPUS[number]

export const FX_REVAL_TIPUS_LABELS: Record<FxRevaluationTipus, string> = {
  nyereseg: 'Árfolyam-nyereség',
  veszteseg: 'Árfolyam-veszteség',
  nulla: 'Nincs változás',
}

export const FX_ARFOLYAM_FORRAS = ['BNR', 'manual'] as const
export type FxArfolyamForras = typeof FX_ARFOLYAM_FORRAS[number]

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

export function normalizeDebtCalcMode(value: unknown): DebtCalcMode {
  return value === 'aktualis' ? 'aktualis' : 'akkori'
}

// ── Típusok ──────────────────────────────────────────────────

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

export interface ReceiptHealth {
  missingNumbers: number[]
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
  deleted: boolean
  /** Stornózott tételek: a listában maradnak, de a számításokból kimaradnak. */
  stornozott?: boolean
  stornozott_indok?: string | null
  stornozott_at?: string | null
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
  deleted: boolean
  /** Stornózott tételek: a listában maradnak, de a számításokból kimaradnak. */
  stornozott?: boolean
  stornozott_indok?: string | null
  stornozott_at?: string | null
}

export function getTransactionDocumentNumber(row: {
  iratszam?: string | null
  bizonylatszam?: string | null
  nyugta?: string | null
  nyugtaszam?: string | null
}): string | null {
  return row.iratszam || row.nyugta || row.bizonylatszam || row.nyugtaszam || null
}

export function getExpensePartnerName(row: {
  kedvezmenyzett?: string | null
  atvevo?: string | null
}): string | null {
  return row.kedvezmenyzett || row.atvevo || null
}

// ── Hierarchikus rendezés ────────────────────────────────────

export function sortCellsHierarchically(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (va !== vb) return va - vb
  }
  return 0
}
