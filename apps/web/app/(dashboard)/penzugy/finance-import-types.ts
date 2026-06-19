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
  /** XML-overlay (bevételek xml referencia): a TÉNYLEGES befizetett év
   *  (col 11 „Befizetett év") — a több-éves hátralék helyes besorolásához.
   *  Ha nincs XML-pár, undefined → az item-builder a dátum évére esik vissza. */
  fizetettevOverride?: number | null
  /** XML-overlay: a hivatalos (5-jegyű) iratszám (col 8) — stabil dedup-kulcs. */
  iratszamHivatalos?: string | null
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
  /** A feloldott befizetescel.id (income vagy internal-transfer esetén) */
  befizetescelId?: number | null
  /** A feloldott kiadascel.id (expense vagy internal-transfer esetén) */
  kiadascelId?: number | null
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
  /** A tagnyilvántartási cím (pl. "Főút 27") — segíti a vizuális
   *  egyeztetést, ha több jelölt illik */
  cim: string | null
}

// ────────────────────────────────────────────────────────────────────────
// 5. Import végrehajtás (a `executeFinanceImport` action — Fázis 6)
// ────────────────────────────────────────────────────────────────────────

export interface FinanceImportItem {
  /** Klasszifikációs kategória.
   *
   * - 'income' / 'expense' — sima kassza-oldali bevétel/kiadás
   * - 'pending-bank-deposit' (400.xx kód, kassza→bank várakozó) — kassza-oldali
   *   `kiadas` rekord, `belso_mozgas_xkey` UUID-vel és pasztorális
   *   "várakozó banki egyeztetésre" jelöléssel; a Bank A/B import (v2) majd
   *   összeg + dátum alapján párba állítja
   * - 'pending-bank-withdrawal' (400.xx kód, bank→kassza várakozó) — kassza-oldali
   *   `befizetes` rekord, ugyanígy várakozó */
  kind: 'income' | 'expense' | 'pending-bank-deposit' | 'pending-bank-withdrawal'
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
  /** Belső mozgás esetén az egyedi UUID — a meglévő `belso_mozgas_xkey`
   *  mezőbe kerül, így a meglévő nyugta-egészség és párosítás logika
   *  (bank-import) helyesen kihagyja / megtalálja. */
  belsoMozgasXkey?: string
  /** Banki tétel esetén a cél bankszámla (bankszamlak.id). Kassza-oldali tételnél null. */
  bankszamlaId?: number | null
}

export interface FinanceImportResult {
  success?: boolean
  error?: string
  inserted?: number
  skipped?: number
  /** Duplikáció miatt kihagyott tételek (újraimportnál a már létező sorok). */
  skippedDuplicates?: number
  errors?: Array<{ rowIndex: number; reason: string }>
}

