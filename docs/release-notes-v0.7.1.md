# Kartotéka v0.7.1

## 🏗️ Pénzügy Fázis 1 — CashbookTab port (8/11 = 73%)

**CashbookTab** (~650 sor): Készpénzes bevétel + kiadás unified lista hónapok szerint, nyitó/záró egyenleg, sortálható oszlopok. 3 callback + 5 slot prop:
- Callbacks: `onAutoIssueChitanta`, `loadChitantakForBefizetesek`, `onUndoStorno`, `onTransactionChanged`, `onToast`
- Slots: ChitantaTombokPanel, ChitantaSilentPrint, ChitantaTombRequiredDialog, TransactionEditDialog, StornoConfirmDialog

A frissítés adat-vesztés nélkül és automatikusan települ.

---

Részletek: `docs/CHANGELOG.md`
