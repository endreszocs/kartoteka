# Kartotéka v0.7.7 — OblioEllenőrzés 10 lib közös csomagba

## 🏗️ Sprint Q Fázis 2.1 (3 sub-sprintből 1)

A Pénzügy modul **OblioEllenőrzés** moduljának első port-szakasza. A 14
belső lib-ből 10 átkerült a `@kartoteka/ui-app/finance/oblio/` shared
csomagba — a fix matchelési algoritmus, az XML parser, a PDF tartalom-
elemző, a Dexie cache és a print HTML-builder.

### Felhasználói szempontból

A frissítés UI-szempontból **nem hoz látható változást** — az e-Factura
ellenőrzés (XML lista, kézi párosítás, diagnosztika 3 fül, kiadás-
bevezetés wizard) pontosan ugyanúgy működik, mint v0.7.6-ban. Adatvesztés
nincs, az auto-update zökkenőmentes.

### Háttérben (paritás-előkészítés)

- **10 lib átemelve** a sharedba: types, status-labels, errors, matcher,
  ubl-parser, pdf-content-parser, pdf-xml-name-matcher, pdf-xml-content-matcher,
  print-builder, cache.
- **Új npm deps**: `dexie` + `pdfjs-dist` a shared csomagban
  (mindkettő iOS WKWebView-kompatibilis).
- **TypeScript target**: ES2020 → ES2022 (Error.cause szintaxis).
- **Webes kompatibilitás**: a 10 webes lib re-exporttá alakult — minden
  meglévő import-hely változatlanul működik.

### Mi marad webnél (v0.7.8 + v0.7.9-be)

- 4 modal (manuális párosítás, számla nyomtatás, diagnosztika,
  kiadás-bevezetés wizard)
- 2 sub-komp (mappa-állapot card, figyelmeztetések)
- 1 tab (1637 sor)
- File System Access API kezelő (`oblio-folder.ts`) — interface mögé
  v0.7.9-ben (iOS-felkészülés)
- 3 server-only lib (auth, client, invoice-builder) — secret kezelés

---

Részletek: `docs/CHANGELOG.md`
