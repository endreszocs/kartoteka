# Kartotéka v0.7.10 — Sprint Q Fázis 3.1

## 🏗️ Kiadás-dialog és Decont-tab közös csomagba

A Pénzügy hero **Kiadás** és **Decont** gombjai mögötti két dialog/tab
átkerült a `@kartoteka/ui-app/finance/` shared csomagba — body-pattern és
callback-prop módon. A Sprint Q F3 első sub-sprintje ezzel kész; az
`IncomeDialog` port a v0.7.11-be kerül.

### Felhasználói szempontból

A frissítés UI-szempontból **nem hoz látható változást** — a Kiadás-rögzítő
egyesével/táblázatosan, a bankból kivétel speciális mód, a leltári
felismerés, az elszámolás-sablon (kapott előleg + tételek + különbözet),
a nyomtatás és a PDF-mentés pontosan ugyanúgy működik, mint v0.7.9-ben.

### Háttérben (Sprint Q F3.1 paritás-előkészítés)

**Új shared komponensek a `@kartoteka/ui-app/finance/` mappában:**

- `ExpenseDialogBody` (~530 sor) — kiadás-rögzítő dialog body
  (Dialog shell webnél marad)
- `DecontTabBody` (~330 sor) — Decont elszámolási sablon body

**Új shared típusok:**

- `ExpenseCategory`, `SaveExpensePayload`, `SaveExpenseBatchRow`,
  `SaveInternalTransferPayload`, `ExpenseToastFn`, `DecontToastFn`

**Callback-prop konvenciók:**

- 3 server-action a Kiadás-dialogban: `onSaveExpense`,
  `onSaveExpenseBatch`, `onSaveInternalTransfer`
- 1 nyomtatási callback a Decont-tab-ban: `onPrint({ mode, html, filename })`
- Mindkét helyen `onToast(type, message)` — wrapper sonner / Tauri-toast /
  iOS UIAlertController-rel implementálja

### Mi marad webnél a v0.7.11-re

- `IncomeDialog` v3 (873 sor) — bevétel-rögzítő dialog
- 10+ server-action callback (saveIncome, saveIncomeBatch,
  saveIncomeWithLinkedInventory, saveInternalTransfer, getNextReceiptNumber,
  getLastRecordedDate, searchMembersForFinance, getFamilyIdForPerson,
  checkReceiptDuplicate, getRentalContracts)
- Bérleti quick-pick + leltári felismerés + tagkereső

### iOS-future-proof állapot

A két új body pure UI: csak React + lucide-react + relatív shared-importok.
Nincs `next/*`, nincs `@/components/ui/*`, nincs `sonner`. A Tauri-mobile
alatt majd egy natív wrapper hívja a callback-eket — kódváltoztatás nélkül
fut iOS WKWebView-ban.

---

Részletek: `docs/CHANGELOG.md`
