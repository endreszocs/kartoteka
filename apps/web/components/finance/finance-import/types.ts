/**
 * Pénzügyi import-wizard belső típusai.
 *
 * Ezek nem szerver-kliens megosztott típusok (azokhoz lásd
 * `apps/web/app/(dashboard)/penzugy/finance-import-types.ts`-t),
 * hanem a wizard UI állapotgépét, lépés-azonosítóit és UI-szintű props-okat
 * írják le.
 *
 * 2026-05-02: szkelet (Fázis 1). A teljes WizardState a Fázis 4-ben.
 */

/**
 * Forrástípus — a v1-ben csak a 'kassza' aktív, a többi szürkítve "v2-ben".
 */
export type FinanceImportSourceType = 'kassza' | 'xml-egyhazfenntartas' | 'bank-ron' | 'bank-eur'

/**
 * Wizard lépés-azonosítók (a tagnyilvántartás-import mintájára).
 */
export type FinanceWizardStage =
  | 'source-type'
  | 'sheet-pick'
  | 'column-mapping'
  | 'kassza-split'
  | 'budget-code'
  | 'donor-resolve'
  | 'preview'
  | 'importing'
  | 'result'

/**
 * Wizard mode (admin vs module — most csak admin).
 */
export type FinanceWizardMode = 'admin'
