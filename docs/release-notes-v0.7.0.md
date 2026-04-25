# Kartotéka v0.7.0

## 🏗️ Pénzügy Fázis 1 — MonetaryTab + BudgetTab port (7/11 tab kész, 64%)

A `@kartoteka/ui-app/finance/` package két új komponenssel bővült:

- **MonetaryTab** (~400 sor): címlet-számoló bankjegyekkel + érmékkel, eltérés-mutatás. Új típus: `MonetaryDenomination`.
- **BudgetTab** (~500 sor): 4-fázisos költségvetés (alap + 3 módosítás), véglegesítés flow. Új típus: `BudgetCompatRow`. 8 callback-prop (load/save/finalize/submit/unlock/refresh/toast).

## 📋 Fázis 1 előrehaladás

✅ FinanceDashboard, DebtTab, AccountingTab, RentalTab, TransactionsTab, **MonetaryTab**, **BudgetTab** (7 tab)

⏳ CashbookTab, BankTab, FinanceSugoTab (v0.7.1) — OblioEllenorzesTab (v0.7.2, 1637 sor) — 5 dialog (v0.7.3)

## 📋 Fázis 2-3-4 (jövőbeli)

- v0.8.0: desktop Tauri SQLite finance read-helperek
- v0.8.1: desktop /penzugy közös FinanceTabs mount
- v0.8.2: offline outbox bekötés (write-flow)

A frissítés adat-vesztés nélkül és automatikusan települ.

---

Részletek: `docs/CHANGELOG.md`
