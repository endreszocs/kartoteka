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
// 2026-06-10: tartozás-számító motor (web↔desktop közös — determinizmus garancia)
export * from './jarulek-calculation'
export * from './rental-calculation'
// 2026-06-10 (B-hullám): közös Pénzügy-hero (web ⇄ desktop azonos fejléc)
export * from './FinanceHero'
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
// Nyomtatvány-builderek (a webes lib/finance/reporting + budget-reporting
// áthelyezve, 2026-06-11 — web/desktop közös nyomtatási központ)
export * from './reporting'
export * from './budget-reporting'
export * from './DecontTabBody'
export * from './ExpenseDialogBody'
export * from './IncomeDialogBody'
export * from './ron-in-words'
export * from './date-parse'
export * from './official-documents'
export * from './finance-export'
export * from './FinanceTableToolbar'
export * from './SearchableSelect'
// 2026-06-12 (Endre #4 bank-import): a webes BCR-import wizard közös törzse +
// a kereshető kategória-választó — a desktop bank-import oldal innen importálja.
export * from './SearchableCategorySelect'
export * from './BcrImportWizardBody'
export * from './CombinedEntryBody'
export * from './FamilyReceiptModal'
export * from './DispozitieDialogBody'
export * from './inventory'
export * from './oblio'
