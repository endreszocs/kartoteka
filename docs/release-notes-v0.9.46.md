# Kartotéka v0.9.46 — Pénzügyi import-wizard

**Dátum**: 2026-05-03
**Csak webes release** (Railway auto-deploy). Desktop NEM érintett.

## Mit hoztunk

A pénzügyi modulban új admin-eszközt indítunk: a hivatalos EREK könyvelési
Excel-fájl ("Kassza" füle) **közvetlenül beolvasható és bementhető a
Kartotékába**. A `/admin/finance-import` URL-en, god-mode aktiválás után érhető
el.

A wizard 9 lépésen át vezet:
1. **Forrás** — fájl feltöltés (a v1-ben csak a Kassza fül aktív)
2. **Munkalap** — a "Kassza" sheet kiválasztása (auto-pick)
3. **Oszlopok** — fejléc → DB mező mapping ellenőrzése
4. **Sor-bontás** — a wizard automatikusan szétválogatja a sorokat bevétel /
   kiadás / belső mozgás / kihagyott kategóriákra
5. **Kódok** — a költségvetési számokat (101.01, 201.13 stb.) össze-rendeli a
   befizetescel / kiadascel rekordokkal. Az ismeretlen kódoknál te döntöd el,
   hogy átugrod-e
6. **Befizetők** — minden donor-stringet ("Beder Győzőné Elvira - Főút 27")
   megpróbál a tagnyilvántartáshoz kötni. A több jelölt eseteket te választod
   ki, a cégek külön listára kerülnek
7. **Előnézet** — Monetar diagnosztikai panel (kasszaegyenleg-ellenőrzés) +
   első 8 példa-tétel a végleges DB-formátumban
8. **Importálás** — a wizard egy tranzakcióban menti a tételeket
9. **Eredmény** — KpiCard, hibás sorok, és **az adott évben szereplő cégek
   listája**

## Miért érdemes

- **994 sor egy gombnyomással**: a 2025-ös teljes Kassza-fájl egy ülésben
  beolvasható (~478 bevétel + ~64 kiadás)
- **Tagnyilvántartással egyezett**: minden befizetőt megpróbál a meglévő tag-
  rekordhoz kötni (quad-lookup: családnév + keresztnév + lánykori név + nem)
- **Cég-lista**: az év végén felsorolva minden szállító/szervezet, akivel a
  gyülekezet együttműködött
- **Monetar diagnosztika**: a kasszaegyenleg eltérése (Kassza fülről kalkulált
  vs. Monetar fülön szereplő) azonnal látszik
- **Audit trail**: minden import futás egy auditsorrá válik

## Mi NEM kerül v1-be

A következő iterációk hozzák:
- Bank A (RON) és Bank B (EUR) fülek (a belső mozgások valódi rögzítése)
- XML egyházfenntartás import duplikáció-ellenőrzéssel
- Költségvetés (Koltsegvetes lap) import
- Inline befizetescel/kiadascel létrehozás a wizardon belül

## Biztonsági megjegyzés

- A wizard csak **rendszergazdai módban** érhető el (god-mode aktiválás)
- A server action-ök `master` / `admin` / `egyhazkeruletiAdmin` / `konyvelo`
  szerepkört ellenőrzik
- Az `import_finance_batch` RPC `SECURITY DEFINER` és a `profile_roles` táblát
  ellenőrzi minden hívásnál
- Az importálás **visszavonhatatlan** a wizardon keresztül — a tételek
  egyenként sztornózhatók a tranzakciók fülön

## Verzió-bump

- `apps/web/package.json` v0.9.45 → v0.9.46
- Desktop NEM kap bump-ot (a v1 csak webes)

## SQL migrációk (Endre futtatja)

1. `migration-docs/sql/2026-05-02-finance-dup-lookup-indexes.sql` — partial
   indexek a duplikáció-detektáláshoz (befizetes + kiadas)
2. `migration-docs/sql/2026-05-02-finance-import-rpc.sql` — `import_finance_batch`
   RPC

(Az 1-est minden futtatás után jó újra futtatni az indexstatisztika frissítéséhez.)
