# Kartotéka v0.7.5 — Sprint Q F1 lezárás

## 🎉 9/11 finance modul közös csomagban

**Sprint Q Fázis 1 lezárul.** A pénzügyi modul vizuális rétegének 82%-a
átkerült a `@kartoteka/ui-app/finance` shared package-be. A webes és (a
jövőben) desktop és iOS oldal ugyanazt a UI-t fogja használni.

## 🆕 v0.7.5: Pénzügyi nyomtatási központok

**FinancePrintDialogBody + BudgetPrintDialogBody** (~770 sor együtt):

- **Pénztár nyomtatás (Pénzügy fejléc → „Pénztár nyomtatás")**: Registru Casa,
  Registru Banca (bankszámla-választóval), Registrul-Jurnal, Nyugtatömb-kimutatás.
  Hónap/év szűrő, élő iframe-előnézet, A4 fekvő, PDF mentés + direkt nyomtatás.
- **Költségvetés nyomtatás (Pénzügy fejléc → „Költségvetés nyomtatás")**:
  költségvetés (terv), számadás (tény vs terv), részszámadás (dátumtartománnyal
  és gyorsbeállításokkal: I. félév, II. félév, I. negyedév, év eleje → ma).

### Felhasználói szempontból

A frissítés UI-szempontból **nem hoz látható változást** — minden nyomtatvány,
előnézet, PDF kimenet pontosan ugyanúgy működik, mint v0.7.3-ban.

### Háttérben (paritás-előkészítés)

- **Slot-pattern a Dialog shell-re**: a shadcn-radix Dialog webnél marad,
  a tartalom shared.
- **Print engine callback-ek**: a html2pdf.js + iframe kombináció a webes
  wrapperben él, iOS-jövőben Tauri-mobile saját engine-t kap.
- **HTML builder callback-en**: a `buildFinancePrintDocument` és
  `buildBudgetPrintDocument` web-only marad — a sharedba csak a UI réteg.
- **iOS-felkészültség**: a komponensek platform-függetlenek, semmilyen
  Next.js / Supabase / Tauri import.

---

## 📊 Sprint Q F1 zárás — 9/11 modul shared

| # | Modul | Verzió |
|---|-------|--------|
| 1 | FinanceDashboard | v0.6.0 |
| 2 | DebtTab | v0.6.1 |
| 3 | AccountingTab | v0.6.2 |
| 4 | RentalTab | v0.6.3 |
| 5 | TransactionsTab | v0.6.3 |
| 6 | MonetaryTab | v0.7.0 |
| 7 | BudgetTab | v0.7.0 |
| 8 | CashbookTab | v0.7.1 |
| 9 | BankTab | v0.7.2 |
| 10 | FinanceSugoTab + Checklist | v0.7.3 |
| 11 | **FinancePrintDialog + BudgetPrintDialog** | **v0.7.5** |

### 🛑 Külön sprintbe halasztva

Az alapos elemzés alapján a következők **NEM kerültek** ebbe a sprintbe:

- **OblioEllenőrzésTab** (~7500 sor: 1637 tab + 14 lib + 4 modal + 2 sub):
  25+ runtime callback (File System Access API + Dexie cache + PDF.js +
  szerver actionök) — egy session-ben magas hibakockázat.
- **3 form-dialog** (IncomeDialog 873 sor + ExpenseDialogV2 473 sor +
  DecontDialog wrapper): 12+ server-action callback, sok shadcn-radix
  form-input-csere.

Mindkettő egy-egy dedikált sprintet kap, ahol a fókuszált idő és figyelem
biztosítja a biztonságos végrehajtást.

---

Részletek: `docs/CHANGELOG.md`
