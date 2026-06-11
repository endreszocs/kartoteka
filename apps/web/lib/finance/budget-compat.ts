/**
 * Költségvetés-kompat réteg — RE-EXPORT SHIM.
 *
 * 2026-06-11 (desktop paritás #5): a tényleges implementáció a
 * `@kartoteka/core` package-be költözött (`finance/budget-compat.ts`),
 * hogy a desktop Költségvetés-fül is ugyanazt a load/save logikát használja.
 * A webes import-helyek (budget-tab, budget-print-dialog, accounting-tab-v2,
 * finance-print-dialog) változatlanul innen importálnak.
 */
export {
  loadBudgetRowsCompat,
  saveBudgetRowsCompat,
  saveBudgetModification,
  type BudgetCompatRow,
} from '@kartoteka/core'
