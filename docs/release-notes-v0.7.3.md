# Kartotéka v0.7.3

## 🏗️ Pénzügy Fázis 1 — FinanceSugoTab port (10/11 = 91%)

**FinanceSugoTab + FinanceSugoChecklist** (~1280 sor együtt): a Pénzügy modul Súgó füle (5 kategorizált szekció, 20+ téma, lelkészbarát magyarázat) és az élő év végi zárás checklist (localStorage-alapú pipák) átkerültek a `@kartoteka/ui-app` közös csomagba — a webes és (a jövőben) desktop és iOS oldal is ugyanazt a UI-t használja.

### Felhasználói szempontból

A frissítés UI-szempontból **nem hoz látható változást** — a súgó kategóriái, a print/PDF kimenet és az élő checklist pontosan ugyanúgy működnek, mint v0.7.2-ben. A korábbi pipálások megmaradnak (localStorage-ban tárolódnak, évenkénti bontásban).

### Háttérben (paritás-előkészítés)

- **Print/PDF callback pattern**: a wrapper a webes oldalon a `html2pdf.js`-t és a `print-engine-v2.ts`-t köti be — a sharedban csak a topic adatait adjuk át, a tényleges renderelés platform-specifikus
- **localStorage-os checklist**: működik mind a webes, mind a desktop WebView2-ben, mind az iOS WKWebView-ban
- **iOS-felkészültség**: a `@kartoteka/ui-app/finance/FinanceSugoTab` és a `FinanceSugoChecklist` platform-független React komponensek

---

Részletek: `docs/CHANGELOG.md`
