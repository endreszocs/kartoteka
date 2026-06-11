/**
 * Költségvetés/számadás nyomtatvány-builderek — RE-EXPORT SHIM.
 *
 * 2026-06-11 (desktop nyomtatási központ): az implementáció a
 * `@kartoteka/ui-app` finance package-be költözött (`finance/budget-reporting.ts`).
 */
export {
  BUDGET_PRINT_TYPES,
  buildBudgetPrintDocument,
  buildBudgetReport,
  buildBudgetModificationReport,
  buildSzamadasReport,
  buildReszszamadasReport,
  type BudgetPrintType,
  type BudgetPrintResult,
  type BudgetPrintData,
} from '@kartoteka/ui-app'
