/**
 * Pénzügyi import — szerver↔kliens megosztott típusok.
 *
 * Ezek a típusok a `finance-import-actions.ts` server action-ök bemenetére /
 * kimenetére vonatkoznak. A `finance-import-wizard.tsx` (kliens) ugyanezeket
 * használja.
 *
 * 2026-05-02 (Fázis 3): első verzió.
 */

// ────────────────────────────────────────────────────────────────────────
// 1. Fájl-parse + preview (a `parseAndPreviewFinance` action visszatérése)
// ────────────────────────────────────────────────────────────────────────

export interface FinanceParseResult {
  success?: boolean
  error?: string
  fileName?: string
  isCsv?: boolean
  /** A fájl összes sheet-jének előnézete */
  sheets?: FinanceSheetPreview[]
}

export interface FinanceSheetPreview {
  sheetName: string
  headers: string[]
  rowCount: number
  /** A `PROFILE_KASSZA` matchel-e? Igen, ha sheetName = 'Kassza' */
  isKasszaSheet: boolean
  /** Az első 5 minta-sor (oszlopnév → érték) */
  sampleRows: Array<Record<string, unknown>>
}

// ────────────────────────────────────────────────────────────────────────
// 2. Sor-szétválasztó analízis (a `analyzeKasszaRows` action visszatérése)
// ────────────────────────────────────────────────────────────────────────

export interface KasszaAnalysisResult {
  success?: boolean
  error?: string
  /** Klasszifikáció statisztikák */
  stats?: KasszaStats
  /** Klasszifikált sorok (a teljes Kassza-fülről) */
  rows?: ClassifiedKasszaRow[]
  /** Egyedi költségvetési kódok a fájlban */
  uniqueBudgetCodes?: string[]
  /** Egyedi donor-stringek a fájlban */
  uniqueDonorStrings?: string[]
}

export interface KasszaStats {
  income: number
  expense: number
  internalTransferIn: number
  internalTransferOut: number
  skip: number
  total: number
}

export interface ClassifiedKasszaRow {
  /** Sor-index a Kassza fülön (0-alapú, header-sor utáni) */
  rowIndex: number
  /** Az osztályozási kategória */
  kind: 'income' | 'expense' | 'internal-transfer-in' | 'internal-transfer-out' | 'skip'
  /** Skip ok (ha kind=skip) */
  skipReason?: string
  /** Tételösszeg (income/expense/internal-transfer esetén) */
  amount?: number
  /** Donor szöveg (az eredeti Név oszlop) */
  donorString?: string | null
  /** Költségvetési cél név (Bev/Kia cél név oszlopokból) */
  celNev?: string | null
  /** Költségvetési kód (101.01, 400.01 stb. — normalizált) */
  budgetCode?: string | null
  /** ISO-formátumú dátum (ÉÉÉÉ-HH-NN) */
  datum?: string | null
  /** Iratszám (raw stringként) */
  iratszam?: string | null
  /** Irattípus (Chit. / Fact. / OP / stb.) */
  irattipus?: string | null
  /** Megjegyzés szöveges */
  megjegyzes?: string | null
}

// ────────────────────────────────────────────────────────────────────────
// 3. Költségvetési kód-feloldás (a `resolveBudgetCodes` action visszatérése)
// ────────────────────────────────────────────────────────────────────────

export interface BudgetCodeResolutionResult {
  success?: boolean
  error?: string
  /** Egyedi kódok a fájlban a feloldási státusszal */
  resolutions?: BudgetCodeResolution[]
}

export interface BudgetCodeResolution {
  rawKod: string
  normalizedKod: string | null
  kind: 'income' | 'expense' | 'internal-transfer' | 'unknown'
  /** A feloldott befizetescel.id (ha kind=income) */
  befizetescelId?: number
  /** A feloldott kiadascel.id (ha kind=expense) */
  kiadascelId?: number
  /** A szamadasicel név (ha találtunk a szamadasicel-ben) */
  szamadasicelNev?: string
  /** Reason (ha kind=unknown) */
  reason?: string
  /** Hány sor használja ezt a kódot */
  occurrenceCount: number
}

// ────────────────────────────────────────────────────────────────────────
// 4. Donor-feloldás (a `resolveDonors` action visszatérése)
// ────────────────────────────────────────────────────────────────────────

export interface DonorResolutionResult {
  success?: boolean
  error?: string
  /** Egyedi donor-stringek a fájlban a feloldási státusszal */
  resolutions?: DonorResolution[]
}

export interface DonorResolution {
  /** Az eredeti donor-string */
  raw: string
  /** Cég/intézmény flag */
  isCompany: boolean
  /** Pasztorális ötlet: ha cég, ide a céget rakjuk */
  csaladnev?: string | null
  k_nev?: string | null
  husbandFamilyName?: string | null
  husbandName?: string | null
  szcs_nev?: string | null
  prefix?: string | null
  street?: string | null
  houseNumber?: string | null
  parseConfidence: 'high' | 'medium' | 'low'
  /** A feloldási státusz */
  status: 'resolved' | 'ambiguous' | 'not-found' | 'company' | 'unparsed'
  /** A feloldott szemely.id (ha status=resolved) */
  szemelyId?: string
  /** Több jelölt esetén (ha status=ambiguous) */
  candidates?: ResolvedSzemelyCandidate[]
  /** Hány sor használja ezt a stringet */
  occurrenceCount: number
}

export interface ResolvedSzemelyCandidate {
  id: string
  csaladnev: string | null
  k_nev: string | null
  szcs_nev: string | null
  sz_datum: string | null
  ferfi: boolean | null
}

// ────────────────────────────────────────────────────────────────────────
// 5. Import végrehajtás (a `executeFinanceImport` action — Fázis 6)
// ────────────────────────────────────────────────────────────────────────

export interface FinanceImportItem {
  /** Klasszifikációs kategória */
  kind: 'income' | 'expense' | 'internal-transfer-in' | 'internal-transfer-out'
  /** ISO dátum */
  datum: string
  /** Tételösszeg (mindig pozitív) */
  osszeg: number
  /** Befizetescel/kiadascel ID */
  celId?: number
  /** Forrás szöveg (befizetes.forrasa / kiadas.atvevo) */
  forrasa?: string
  /** A feloldott szemely.id (ha van) */
  szemelyId?: number | null
  /** A feloldott csalad.id (ha van) */
  csaladId?: number | null
  /** Iratszám (legacy NOT NULL — üres string is elfogadott) */
  iratszam?: string
  /** Nyugta szám (legacy NOT NULL — üres string is elfogadott) */
  nyugta?: string
  /** Irattípus (Chit. / Fact. / OP / stb.) */
  irattipus?: string
  /** Megjegyzés */
  megjegyzes?: string
  /** Melyik évre vonatkozik (a könyvelési év) */
  fizetettev: number
  /** Belső mozgás esetén a forrás-bankszámla ID-ja vagy 'kassza' */
  belsoForras?: string
  /** Belső mozgás esetén a cél-bankszámla ID-ja vagy 'kassza' */
  belsoCel?: string
}

export interface FinanceImportResult {
  success?: boolean
  error?: string
  inserted?: number
  skipped?: number
  errors?: Array<{ rowIndex: number; reason: string }>
}
