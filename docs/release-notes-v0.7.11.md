# Kartotéka v0.7.11 — Sprint Q Fázis 3.2 (Sprint Q F3 LEZÁRVA)

## 🏁 Bevétel-rögzítő dialog közös csomagba — Sprint Q F3 lezárul

A Pénzügy → **Bevétel** dialog 873 soros forma logikája átkerült a
`@kartoteka/ui-app/finance/IncomeDialogBody`-be. Ezzel a Sprint Q Fázis 3
**2/2 sub-sprintje teljes**, és a teljes pénzügyi modul vizuális rétege a
sharedban él (12/12 = 100%).

## Felhasználói szempontból

A frissítés UI-szempontból **nem hoz látható változást** — a Pénzügy hero
**Bevétel** gombja ugyanúgy nyitja a megszokott dialógot:

- Egyesével és táblázatos bevitel-mód
- Bankba letét speciális logika (kassza → bank belső mozgás)
- Autocomplete tagkereső a befizető mezőhöz
- Bérleti quick-pick (B1.7) — aktív szerződésből előtöltés
- Kapcsolt leltári alapeszköz form a leltári kategóriáknál
- Iratszám duplikáció-ellenőrzés
- Dátum-figyelmeztetés (jövő / korábbi mint legutóbb rögzített)

## Háttérben (Sprint Q F3.2)

**Új shared elemek a `@kartoteka/ui-app/finance/` mappában:**

- `IncomeDialogBody` (~870 sor) — teljes UI body, callback-pattern
- `inventory.ts` — `INVENTORY_AMORTIZATION_CATALOG` (10 tétel) +
  `getInventoryAmortizationCatalogEntry` helper

**10 server-action callback prop:**

- Mentés: `onSaveIncome`, `onSaveIncomeWithLinkedInventory`,
  `onSaveIncomeBatch`, `onSaveInternalTransfer`
- Lekérdezés: `onGetNextReceiptNumber`, `onGetLastRecordedDate`,
  `onSearchMembers`, `onGetFamilyIdForPerson`,
  `onCheckReceiptDuplicate`, `onGetRentalContracts`

**1 toast callback:** `onToast: (type, message) => void` — három típus
(`success` / `error` / `warning`)

**Webes wrapper átalakult:** 873 sor → ~100 sor (Dialog shell + 10
server-action + sonner toast).

## Sprint Q áttekintés (3 fázis lezárva)

| Fázis | Verziók | Hatókör |
|-------|---------|---------|
| **F1** | v0.7.0–v0.7.5 | 9 finance UI shared (Dashboard, Debt, …, BudgetPrint) |
| **F2** | v0.7.7–v0.7.9 | Oblio modul TELJESEN (10 lib + 4 modal + 2 sub-komp + 1 tab + OblioFileSystem) |
| **F3** | v0.7.10–v0.7.11 | 3 form-dialog (Expense + Decont + Income) |

A teljes pénzügyi modul vizuális rétege **12/12 = 100%-a** a sharedban él.

## iOS-future-proof állapot

A teljes pénzügyi modul callback-pattern + slot-pattern + platform-független
interface-ek (`OblioFileSystem`) mögé burkolva. A web ma a sonner / Next.js
server actions / File System Access API-val szolgálja ki — Tauri-mobile alatt
majd natív adapter-ekkel cserélhető (UIAlertController, URLSession,
sandbox folder), kódváltoztatás nélkül a body komponensekben.

## Hátralévő (Sprint Q után)

- **v0.8.x**: Tauri SQLite mirror + offline outbox + finance write flow.
  A teljes pénzügy UI most már desktop-mountolható közös `<FinanceTabs>`
  formában — a következő fázis a write-side offline-szinkronizáció.

---

Részletek: `docs/CHANGELOG.md`
