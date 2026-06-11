/**
 * Pénzügyi nyomtatvány-builderek — RE-EXPORT SHIM.
 *
 * 2026-06-11 (desktop nyomtatási központ): az implementáció a
 * `@kartoteka/ui-app` finance package-be költözött (`finance/reporting.ts`),
 * hogy a desktop is ugyanazokat a hivatalos nyomtatványokat építse.
 */
export {
  FINANCE_PRINT_TYPES,
  buildFinancePrintDocument,
  buildKiadasiKiseroiv,
  type FinancePrintType,
  type FinancePrintResult,
  type FinanceReportFilters,
  type FinanceReportData,
  type NyugtatombReportRow,
} from '@kartoteka/ui-app'
