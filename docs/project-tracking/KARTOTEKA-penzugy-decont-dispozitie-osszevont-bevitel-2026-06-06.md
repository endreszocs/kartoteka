# KARTOTÉKA — Pénzügyi modul: összevont bevitel + hivatalos Decont + Dispoziție

**Dátum:** 2026-06-06
**Kérte:** Endre
**Státusz:** folyamatban

## Cél (3 funkció + 1 keresztmetszeti követelmény)

1. **Összevont Bevétel/Kiadás bevitel** — a két külön gomb (`+ Bevétel`, `+ Kiadás`)
   helyett **egyetlen gomb**. A modalon belül **Bevétel / Kiadás fülek**; egyszerre
   több bevétel és kiadás is rögzíthető; a **Mentés** gomb dátum szerint rendezi és
   mindent a helyére ír (`saveIncomeBatch` + `saveExpenseBatch`).
2. **Hivatalos Decont (Elszámolás)** — az `Elszamolas_2026.xlsx` nyomtatási képét
   reprodukáló, **román nyelvű** nyomtatott dokumentum, **magyar magyarázattal**
   kitöltés közben. Tételek **1-től** számozva. Évente/gyülekezetenként **sorszámozott**.
   A tételek **valódi kiadás rekordot is létrehoznak** (döntés: „Kiadásokat is rögzítsen").
3. **Dispoziție de plată / încasare** — kétpéldányos, román nyelvű bizonylat,
   **román betűs összegkiírással**. Külön **plata** és **incasare** sorozat, évente
   1-től. **Önállóan** kitölthető ÉS **kassza-tételből** generálható (döntés).
4. **Keresztmetszeti:** minden felület **reszponzív** (telefon/tablet/PC), és minden
   fejlesztés bekerül a **`docs/CHANGELOG.md`-be** lelkész-barát megfogalmazással
   (admin → Frissítések → broadcast).

## Architektúra-térkép (meglévő)

- Hero gombok: `apps/web/components/finance/finance-tabs.tsx:255`
- Bevétel/Kiadás body (megosztott, batch-képes): `packages/ui-app/src/finance/{IncomeDialogBody,ExpenseDialogBody}.tsx`
- Batch actions: `apps/web/app/(dashboard)/penzugy/actions.ts` — `saveIncomeBatch` (1360), `saveExpenseBatch` (1397)
- Jelenlegi Decont (csak nyomtatás, nincs sorszám/mentés): `packages/ui-app/src/finance/DecontTabBody.tsx`
- Nyomtatómotor: `apps/web/lib/utils/print-engine-v2.ts` (`printToBrowser`/`printToPdf`)
- Hivatalos román riportok mintastílusa: `apps/web/lib/finance/reporting.ts`
- CHANGELOG parser/format: `apps/web/lib/broadcasts/changelog-parser.ts`, minta: `docs/CHANGELOG.md`
- Bealitas (intézménynév, szám, lelkész): a `bealitas` tábla (Database_schema.sql:101)

## Excel-sablonok kivonata

### Elszamolas_2026.xlsx (Decont)
Fejléc (egyszer/elszámolás): Unitate (gyül. név), DECONT DE CHELTUIELI / ELSZÁMOLÁS,
`nr/ÉÉÉÉ.HH.NN.`, Nume (név), Elszámolás jellege, Avans primit (kapott előleg),
Total cheltuieli (összköltség), Diferența de plată/încasare (kifizetni/visszafizetni).
Tételtábla 1-től: Nr | Act nr (irat sz.) | Act (irat típ.) | Data | Emitent (kiállító) |
Explicația (magyarázat) | Suma (RON) + Total sor. Lábléc: Decontat de / Aprobat aláírások +
nyilatkozat-sor a különbözetről.

### Dispozitie de plata_2026.xlsx (DP)
Két azonos példány egymás mellett. „Dispoziţie de plată/incasare către caserie",
`nr. N din DÁTUM`, „Parohia Reformată <név>", Numele şi prenumele, Funcţia (calitatea),
Suma: <összeg> lei <összeg betűvel románul>, Scopul încasării-plăţii. Aláírások:
Conducătorul unităţii / Viza de control financiar-preventiv / Compartimentul financiar-contabil.
Csak pl-nál: DATE SUPLIMENTARE (Actul de identitate: Seria/Nr, Am primit suma de, Data, Semnătura).
Casier blokk: Plătit/Incasat suma de, Data, Semnătura.

## Adatbázis (SQL: migration-docs/sql/2026-06-06-decont-dispozitie-sorszam.sql)

- `penzugyi_bizonylat_sorszam(congregation_id, ev, tipus, utolso_szam)` + `next_bizonylat_szam()` RPC (atomikus).
- `decont` fejléc + `tetelek` jsonb snapshot (újranyomtatáshoz).
- `dispozitie` (plata/incasare, sorszám, név, összeg, cél, CI, kassza-link).
- `kiadas.decont_id` oszlop (decont→kiadás kapcsolat, együttes storno-hoz).

## Implementációs fájlok

- `apps/web/lib/finance/ron-in-words.ts` — román szám→betű (lei + bani).
- `apps/web/lib/finance/official-documents.ts` — Decont + Dispoziție HTML builderek.
- `apps/web/app/(dashboard)/penzugy/decont-actions.ts` — sorszám, mentés (+kiadás), lista.
- `apps/web/app/(dashboard)/penzugy/dispozitie-actions.ts` — sorszám, mentés, kassza-lista.
- `packages/ui-app/src/finance/DecontTabBody.tsx` — átírás a hivatalos sablonra (élő előnézet).
- `packages/ui-app/src/finance/DispozitieDialogBody.tsx` — új.
- `packages/ui-app/src/finance/CombinedEntryBody.tsx` — új (összevont bevitel).
- `apps/web/components/modals/*` + `finance-tabs.tsx` — wrapperek és gomb-összevonás.

## Döntések (megerősítve 2026-06-06)
- Decont: tételek kiadás rekordot is létrehoznak.
- Dispoziție: önálló + kassza-tételből generálható.
- Hero: egy közös „+ Tétel" gomb váltja fel a két régit.
