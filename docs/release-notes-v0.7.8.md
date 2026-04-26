# Kartotéka v0.7.8 — Sprint Q Fázis 2.2

## 🏗️ OblioEllenőrzés modal-ok és sub-komponensek közös csomagba

A Pénzügy → OblioEllenőrzés moduljában a **4 dialog-modal** és a **2 sub-komp**
átkerült a `@kartoteka/ui-app/finance/oblio/` shared csomagba. Sprint Q F2-ből
2/3 sub-sprint kész — a v0.7.9-ben jön a tab maga és a File System interface.

### Felhasználói szempontból

A frissítés UI-szempontból **nem hoz látható változást** — a kézi párosítás,
a 3-fülű diagnosztika, a kiadás-bevezetés wizard, és a nyomtatási központ
(KARTOTEKA összefoglaló + ANAF PDF tab) pontosan ugyanúgy működik, mint
v0.7.7-ben.

### Háttérben (Sprint Q F2.2 paritás-előkészítés)

**Új shared komponensek a `@kartoteka/ui-app/finance/oblio/` mappában:**

- `OblioEllenorzesWarnings` + `OblioFormatGuideCard` — figyelmeztető sávok és
  letöltési útmutató kártya
- `OblioEllenorzesFolderCard` — FSAccess-jelző UI (4 állapot: nem támogatott,
  nincs root, nincs permission, üzemkész), copy-clipboard, ANAF 60 napos
  határidő-számláló
- `OblioManualMatchDialogBody` — kézi párosítás dialog tartalom (body-pattern)
- `OblioMatchDiagnosticDialogBody` — 3 fülre osztott diagnosztika dialog (70-100% /
  40-69% / <40% confidence + tömeges akciók)
- `OblioKiadasWizardDialogBody` — kronológiai kiadás-bevezetés wizard
- `OblioInvoicePrintDialogBody` — nyomtatási központ (KARTOTEKA + ANAF PDF
  tabok, iframe + `window.print()`)

**Új shared típusok:**

- `OblioFolderStatus`, `OblioLocalFile` (folder-types.ts) — eddig a webes
  `oblio-folder.ts`-ben éltek; most a sharedban, a webes verzió re-exportál
- `WizardXmlItem`, `ExpenseCategoryOption`, `OblioCreateKiadasPayload`,
  `OblioManualMatchKiadas`, `OblioManualMatchSavePayload`

### Mi marad webnél v0.7.9-be

- 1637 soros `OblioEllenorzesTab` (Sprint Q F2.3)
- `oblio-folder.ts` File System Access API logika → `OblioFileSystem`
  interface absztrakcióval (iOS-future-proof)
- 3 server-only lib (auth, client, invoice-builder)

---

Részletek: `docs/CHANGELOG.md`
