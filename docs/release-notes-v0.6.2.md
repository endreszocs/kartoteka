# Kartotéka v0.6.2

## 🏗️ Pénzügy Fázis 1 — AccountingTab port

A Számadás-tab átkerült a `@kartoteka/ui-app/finance/` shared package-be, **proper callback-abstraction-nel**:

- `budgetData` + `loading` props — a szülő tölti be (web: Supabase, desktop: Tauri SQLite)
- `onRequestUnlock(year, reason)` — javítási kérelem callback
- `onRefresh()` — újratöltés (web: router.refresh)
- `onToast(msg, kind)` — UI-feedback (web: sonner)
- `finalizeWizardSlot({...})` — modal slot-prop (web: AccountingFinalizeWizard)

Ez a **server-coupled tabok template-je** — a maradék 7 tab ugyanezen mintával kerül át a következő release-ekben.

## 📋 Fázis 1 előrehaladás

3 tab átkerült (FinanceDashboard, DebtTab, AccountingTab), 7 még hátra van.

A frissítés adat-vesztés nélkül és automatikusan települ.

---

Részletek: `docs/CHANGELOG.md`
