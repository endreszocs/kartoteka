# Kartotéka v0.6.3

## 🏗️ Pénzügy Fázis 1 — RentalTab + TransactionsTab port

A `@kartoteka/ui-app/finance/` package két nagyobb komponenssel bővült:

- **RentalTab**: Bérleti szerződések listázása, szűrés, KPI, törlés + e-Factura kiállítás (slot-prop modalokkal)
- **TransactionsTab**: Bevétel+kiadás unified lista, hónaponkénti csoportosítás, kísérőív-nyomtatás, Oblio státusz ikonok (4 slot prop-pal)

Új közös helper: `calculateEvesDij(contract)`.

## 📋 Fázis 1 előrehaladás

5 / 11 tab portolva (45%):
- ✅ FinanceDashboard, DebtTab, AccountingTab, RentalTab, TransactionsTab
- ⏳ CashbookTab, BankTab, BudgetTab, MonetaryTab, OblioEllenorzesTab, FinanceSugoTab

A frissítés adat-vesztés nélkül és automatikusan települ az auto-updater-en keresztül.

---

Részletek: `docs/CHANGELOG.md`
