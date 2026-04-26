/**
 * @kartoteka/ui-app — Pénzügyi modul közös rétege (Sprint Q Fázis 1).
 *
 * Egyetlen igazság-forrás (single source of truth) a pénzügyi modulhoz:
 *   - típusok (BealitasRow, BefitetesRow, KiadasRow, BankAccount, ...)
 *   - konstansok (RECEIPT_TYPES, TRANSFER_TYPES, RENTAL_*, FX_REVAL_*)
 *   - tiszta-függvények (formatCurrency, calculateBalances, parseHungarianWomensName, ...)
 *   - UI-komponensek (FinanceDashboard, DebtTab, AccountingTab, RentalTab,
 *     TransactionsTab, MonetaryTab, ...)
 *
 * A web és desktop EGYARÁNT INNEN importál — nincs duplikáció.
 */

export * from './types'
export * from './helpers'
export * from './FinanceDashboard'
export * from './DebtTab'
export * from './AccountingTab'
export * from './RentalTab'
export * from './TransactionsTab'
export * from './MonetaryTab'
export * from './BudgetTab'
export * from './CashbookTab'
export * from './BankTab'
export * from './FinanceSugoChecklist'
export * from './FinanceSugoTab'
export * from './FinancePrintDialogBody'
export * from './BudgetPrintDialogBody'
export * from './oblio'
