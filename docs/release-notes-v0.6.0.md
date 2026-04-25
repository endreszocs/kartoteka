# Kartotéka v0.6.0

## 🏗️ Pénzügyi modul Fázis 1 — közös réteg megalapozva

A *„web és desktop 100% paritás"* alapelv megvalósításának 1. fázisa. Felhasználói szemmel változás csekély (web és desktop ugyanúgy működnek), de **a következő fázisok alapja most került a helyére**.

### Mi került át a `@kartoteka/ui-app/finance` shared package-be

- **Típusok** (~270 sor): minden pénzügyi `BealitasRow`, `BefitetesRow`, `KiadasRow`, `BankAccount`, `DebtRow`, `RentalContractRow`, `FxRevaluationRow` stb.
- **Tiszta-függvények** (~200 sor): `formatCurrency`, `calculateBalances`, `parseHungarianWomensName`, `sortCellsHierarchically` és társai.
- **Első UI-komponens** (~200 sor): `FinanceDashboard` (4 KPI + egyenleg + utolsó 10 mozgás). Server-action mentes — propsokon kap adatot.

A web változatlanul működik (re-export shimmek a régi import-pathokon). A desktop most már importálhatja a típusokat a shared package-ből.

### Mi jön a következő fázisokban

- **Fázis 2**: 10 további finance-tab port (Cashbook, Bank, Budget, Accounting, Debt, Transactions, Monetary, Rental, Oblio, Súgó)
- **Fázis 3**: desktop Tauri SQLite read-helperek minden tabhoz
- **Fázis 4**: desktop `/penzugy` route a közös `<FinanceTabs>`-ot mountolja (100% paritás)
- **Fázis 5**: modális ablakok port (IncomeDialog, ExpenseDialog, stb.)

A frissítés adat-vesztés nélkül és automatikusan települ az auto-updater-en keresztül.

---

Részletek: `docs/CHANGELOG.md`
