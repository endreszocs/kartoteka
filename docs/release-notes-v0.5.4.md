# Kartotéka v0.5.4

Endre 8 megfigyelése közül a megvalósítható részt Sprint P keretében javítva.

## 🐛 Javítások

- **Offline-first auto-reload** — a percenkénti háttér-szinkron befejezése után az oldalak **automatikusan újratöltik az adatokat** a lokális cache-ből. Eddig a frissített számok csak oldalváltás után jelentek meg.
- **Manuális „Frissítés" gombok eltávolítva** a Tagnyilvántartás és Családok oldalról — a háttér-szinkron percenként frissít, a státuszsáv mutatja az állapotot, módosításnál azonnal újratöltődik a lista.
- **„Gyülekezeti weboldal" KPI-kártya eltávolítva** a desktop főoldalról — webes-only feature.
- **Demográfiai stat-ok** (Férfiak / Nők / Gyermekek / Átlagéletkor / Fizetők / Presbiterek / Egyenleg) eltávolítva a desktop főoldalról — a Korelosztás widget részletesebben mutatja az életkor-megoszlást.

## ✨ UX javítások

- **Beállítások dialog: oldalsáv MINDEN méretben** — eddig kis ablakon a fülek vízszintesen jelentek meg. Mostantól mindig vertikálisan a dialog bal oldalán (web és desktop egyaránt).
- **Member-detail dialog vizuális paritás a webes verzióval**:
  - Avatar gradient háttérrel + monogram
  - Eyebrow „Tag-portré" + serif font cím + dekoratív háttér
  - Chip-sor: CNP / kor / családfő / választó / rejtett — színkódolt kártyákkal
  - DetailGroup szekciók kis kártyákban, lila eyebrow-val
  - Gradient „Szerkesztés" gomb

## 📌 v0.5.5 backlog

- Naptárnézet a „Gyülekezeti programok" widgetben
- Pénzügyi áttekintés grafikon a desktop főoldalon
- Frissítés gombok eltávolítása a maradék olvasási oldalakról

A frissítés adat-vesztés nélkül és automatikusan települ az auto-updater-en keresztül.

---

Részletek: `docs/CHANGELOG.md`
