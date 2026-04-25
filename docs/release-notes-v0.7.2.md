# Kartotéka v0.7.2

## 🏗️ Pénzügy Fázis 1 — BankTab port (9/11 = 82%)

**BankTab** (~840 sor): banki bevétel + kiadás listája hónapok szerint, nyitó/záró egyenleg, BCR Excel import wizard, bankszámla felvétel/szerkesztés, stornózás. A vizuális réteg most már a `@kartoteka/ui-app` közös csomagból érkezik — a webes és (a jövőben) a desktop és iOS oldal is ugyanazt a UI-t használja.

### Felhasználói szempontból

A frissítés UI-szempontból **nem hoz látható változást** — a banki forgalom, a BCR import wizard és minden modal pontosan ugyanúgy működik, mint v0.7.1-ben. Adatvesztés nincs, a frissítés automatikusan települ az auto-update-en keresztül.

### Háttérben (paritás-előkészítés)

- 4 callback prop + 4 modal slot pattern (BCR import wizard, bankszámla dialog, stornó confirm, tranzakció edit dialog)
- `NyitoEgyenlegRow` típus átkerült a `@kartoteka/ui-app` shared csomagba — egyetlen igazság-forrás web és desktop között
- **iOS-felkészültség**: a `@kartoteka/ui-app/finance/BankTab` platform-független React komponens, semmilyen Next.js / Supabase / Tauri import — ha a jövőben Tauri-mobilon iOS app készül, ugyanez a UI ott is rendelkezésre áll

---

Részletek: `docs/CHANGELOG.md`
