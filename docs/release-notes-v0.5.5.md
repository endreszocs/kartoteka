# Kartotéka v0.5.5

## 🐛 Javítások

- **Üres sávok teljes képernyőn — most már MINDEN oldalon javítva**. A v0.5.1-ben a shell-szintű cap eltüntettem, de **11 oldal** lokálisan tartotta a max-szélesség wrappert (Bank-import, Befizetés, Belső mozgás, Chitanță, Chitanță-tömbök, Kiadás, Pénzügy-dashboard, Pénzügy-landing, Munkanapló, Dashboard, Placeholder). Mostantól **mind a 11 oldal a teljes szélességet használja** — a beágyazott rács-komponensek (KPI-kártyák, statisztikák, listák) maguk osztják el a helyet.

## 📋 Pénzügyi modul paritás — fázisos terv

A *„web és desktop 100% paritás"* alapelvre építve a pénzügyi modul portolása fázisos terv szerint indul:

- **Fázis 1**: finance-* komponensek átvétele a `@kartoteka/ui-app` shared package-be
- **Fázis 2**: desktop adatréteg — Tauri SQLite read-helperek minden tabhoz
- **Fázis 3**: UI bekötés — közös `<FinanceTabs>` mount a desktop `/penzugy` route-on
- **Fázis 4**: modális ablakok port (IncomeDialog, ExpenseDialog, DecontDialog stb.)

A jelenlegi desktop pénzügyi oldalak párhuzamosan üzemelnek a portolás során — sose veszítesz funkcionalitást.

A frissítés adat-vesztés nélkül és automatikusan települ az auto-updater-en keresztül.

---

Részletek: `docs/CHANGELOG.md`
