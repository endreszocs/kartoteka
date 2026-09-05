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
// 2026-08-11 (5. kör, P3 #4): a befizetés-cél kód kibontása + a 101.01
// (egyházfenntartói járulék) felismerése — eddig NÉGY kézzel karbantartott
// másolatban élt, egyikük eltérő (`??`) fallback-szemantikával.
export * from './payment-goal-code'
export * from './rental-calculation'
// 2026-09-03 (Endre 2.): a rogzites-biztato (igevers) IDE koltozott az apps/web-bol,
// hogy a DESKTOP is ugyanazt lassa — eddig ott egyaltalan nem volt igevers.
// A komponens hook-mentes es SAJAT 'use client' direktivaval kezdodik (a barrel nem visz direktivat).
export { RogzitesBiztato } from './RogzitesBiztato'
// 2026-06-10 (B-hullám): közös Pénzügy-hero (web ⇄ desktop azonos fejléc)
export * from './FinanceHero'
export * from './FinanceLoadingState'
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
// 2026-08-22 (6. pont): a kiállító hivatalos, KÉTNYELVŰ megnevezése — EGY
// forrásból minden ívnek (a `nev_ro || magyar` néma visszaesés helyett).
export * from './entity-name'
// 2026-08-22 (8. pont): a nyomtatási központok betöltés-állapotgépe — import-mentes
// mag, hogy az őrszem futtatni tudja (a `tolt / kesz / ures / hiba` négy ága a
// korábbi kétállapotú `loading` helyett).
export * from './print-loading-core'
// Nyomtatvány-builderek (a webes lib/finance/reporting + budget-reporting
// áthelyezve, 2026-06-11 — web/desktop közös nyomtatási központ)
export * from './reporting'
export * from './budget-reporting'
export * from './DecontTabBody'
export * from './ExpenseDialogBody'
export * from './IncomeDialogBody'
export * from './ron-in-words'
export * from './date-parse'
// 2026-07-16: „HH-NN" → „július 1." formázás (a date-parse ikerpárja: parse ⇄ format).
// A járulék-motor címkéi is ezt használják → web és desktop ugyanazt a szöveget kapja.
export * from './month-day'
export * from './official-documents'
export * from './finance-export'
export * from './FinanceTableToolbar'
export * from './SearchableSelect'
// 2026-06-12 (Endre #4 bank-import): a webes BCR-import wizard közös törzse +
// a kereshető kategória-választó — a desktop bank-import oldal innen importálja.
export * from './SearchableCategorySelect'
export * from './BcrImportWizardBody'
export * from './CombinedEntryBody'
// 2026-08-27 (Endre 5. kérése): Adományozók és szponzorok fül — KÖZÖS
// megjelenítő (web + desktop). Adatot nem kér le, mindent propsból kap.
export * from './AdomanyozokBody'
export * from './FamilyReceiptModal'
export * from './DispozitieDialogBody'
export * from './inventory'
export * from './oblio'
