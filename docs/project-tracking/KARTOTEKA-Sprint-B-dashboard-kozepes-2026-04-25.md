# Sprint B — Dashboard „Közepes" csoport

**Dátum**: 2026-04-25 (este, Sprint A után)
**Fázis**: Dashboard paritás közepes csoportja — élesen kalkulált adatok
**Kódolási ciklus**: ~1 óra (1 új sync helper + 1 új JS-helper + 2 új közös komponens + home-page bővítés)
**Státusz**: ✅ KÉSZ — build verifikáció Endre futtatja a végén

---

## 1. Vezetői összefoglaló

A Sprint A vázat adott, a Sprint B **megtölti adatokkal**. A desktop home-page most már a webes /dashboard adatgazdagságához közelít:

- **Demográfiai stat-ok élesek** (férfiak, nők, gyermekek, átlagéletkor, presbiterek) — JS-aggregáció a `getLocalMembersOfOwnCongregation` listából
- **Családok-szám éles** — új `getLocalCsaladokCount` SQL helper
- **Születésnapok widget** (mai + következő 14 nap) — új `Celebrations` közös komponens
- **Friss munkanapló widget** (10 utolsó bejegyzés) — új `RecentActivity` közös komponens

A két új widget egy 2-oszlopos grid-ben jelenik meg a BottomStats alatt (lg+ képernyőn). Mobilon egymás alá kerülnek.

**Még mindig nem éles** (Sprint C+):
- `monthlyIncome / monthlyExpense / yearlyIncome / yearlyExpense` — a befizetés/kiadás-aggregátum offline-ban még nem kalkulálható; a `befizetes_local` / `kiadas_local` adatok megvannak, de SUM-funkció kell
- `payersCount` — szintén pénzügyi
- `balance` — szintén pénzügyi
- `publicSiteStatus` — külön sync-tábla kell
- Névnapok a Hero banner-ben — naptári lookup kell (`name-meanings.ts` átemelése + sync)

---

## 2. Új fájlok

### Új sync-helper

| Fájl | Új helper |
|------|-----------|
| `apps/desktop/src/lib/sync.ts` | `getLocalCsaladokCount(userId)` — aktív (`isaktiv = 1`) családok száma a saját gyülekezetben, EXISTS-szűréssel a `szemely_local.family_id`-re |

### Új JS-helper

| Fájl | Mit |
|------|-----|
| `apps/desktop/src/lib/dashboard-helpers.ts` | `calculateDemographicStats(members) → { men, women, childrenCount, avgAge, presbCount }` (JS-aggregáció)<br>`extractUpcomingBirthdays(members, daysAhead) → BirthdayEntry[]` (mai + következő N nap)<br>Belső helperek: `ageFromDateString`, `parseISODate`, `formatMemberFullName` |

### Új közös komponensek — `packages/ui-app/src/dashboard/`

| Fájl | Mit | Forrás |
|------|-----|--------|
| `Celebrations.tsx` | Születésnapok widget (mai szekció kiemelve sárga gradient-tel + következő 14 nap szekció pink-akcent), `onEntryClick` és `onPrintClick` callbackek | webes `apps/web/components/dashboard/celebrations.tsx` (egyszerűsítve) |
| `RecentActivity.tsx` | Friss napló-bejegyzések lista, dátum + jellege chip + cím + jelenlét-szám, üres-state kezelve | webes `apps/web/components/dashboard/recent-activity.tsx` (egyszerűsítve) |

`packages/ui-app/src/index.ts` — barrel-export bővítve a 2 új komponenssel + a hozzájuk tartozó type-okkal (`CelebrationEntry`, `RecentActivityEntry`).

### Desktop integráció

`apps/desktop/src/pages/home-page.tsx` bővítve:

- Új state-ek: `familyCount`, `demographicStats`, `birthdays`, `recentActivity`
- Egyetlen kombinált `Promise.all` 5 párhuzamos lokális adat-fetch-hez
- Új JSX szekciók: 2-oszlopos `<Celebrations>` + `<RecentActivity>` grid a BottomStats alatt
- A KpiCards `familyCount={familyCount}` (eddig 0 volt)
- A BottomStats demográfiai stat-jai élesen átadva

---

## 3. Architektúra-döntések

### Miért JS-oldali demográfiai aggregáció (és nem új SQL GROUP BY)?

- A tag-lista általában <2000 sor — JS-aggregáció <5 ms (`reduce` egyszer-átfutás).
- Egyszerűbb karbantartani: nincs új migráció, nincs új SQL trigger, a logika tesztelhető pure-function-ként.
- Egyetlen `getLocalMembersOfOwnCongregation` hívás elég, és az eredményt 3 helyen használjuk (memberCount + demographicStats + birthdays). Külön SQL-aggregátum 3× lekérdezést jelentene.
- Konzisztens minden gyülekezet-szintű kalkulációval (M8 minta — JS-aggregáció a default).

### Miért nem nyitja a Celebrations a tag-detail modalt közvetlenül?

A `Celebrations` komponens platform-agnosztikus (pure UI a packages-ben). A modal-nyitás platform-specifikus (router + state + props). Ezért a komponens **csak callback-et ad ki** (`onEntryClick(entry)`); a desktop home-page navigál a `/tagnyilvantartas?member=<id>`-re. (A web wrapper máshogy kezelheti, pl. inline modal.)

### Miért fix `daysAhead = 14`?

A webes verzió is így szűr — egyhetes előretekintés túl kevés (sok a hét vége), egy hónap túl sok zaj. 14 nap = 2 hét, jó balance. Ha kell, prop-ként override-olható (most nem, egyszerűsítve).

---

## 4. Hatás és kockázat

- **Funkcionális változás (user-facing)**: a desktop home-page most **valódi adatokkal** működik, gazdagabb. A 2 új widget (születésnapok + friss munkanapló) közvetlen lelkészi értéket ad — *„ki lesz holnap szülinapos"* azonnal látható.
- **TS-ellenőrzés**: a `MemberLocalRow` és `WorklogLocalRow` típusok már léteznek a `sync.ts`-ben, és exportálva vannak. A `dashboard-helpers.ts` `import type { MemberLocalRow } from './sync'`-szel hozza.
- **Build-tszt**: Endre futtatja a Sprint A+B együtt.
- **Performance**: a 5 párhuzamos `Promise.all` ~50-100 ms a lokális SQLCipher-ből (gyors). A JS-aggregáció <5 ms.
- **Üres-state kezelve**: ha nincs tag/munkanapló, mindkét widget barátságos „még nincs" üzenetet mutat.

---

## 5. Hátralévő / következő lépések

### Sprint C — Anyakönyv (5-7 nap, P0)

- Web SQL séma elemzése (3 tábla: `keresztelo`, `eskuvo`, `temetes`)
- `*_local` Rust-tábla generálás → új migráció a `apps/desktop/src-tauri/src/db.rs`-ben
- `@kartoteka/core/anyakonyv/` use-case-ek (list + write + storno)
- Desktop UI: `apps/desktop/src/pages/anyakonyv-*.tsx` + offline write-sync
- M8 minta követése

### Későbbi (Sprint D+) — Pénzügyi aggregátumok a dashboard-ra

- `getLocalIncomeYearTotal(userId, year)` — `befizetes_local` SUM
- `getLocalExpenseYearTotal(userId, year)` — `kiadas_local` SUM
- `getLocalIncomeMonthTotal(userId, year, month)` — havi
- `KpiCards monthlyIncome/yearlyIncome/etc` éles bekötés
- BottomStats `payersCount` és `balance` éles bekötés

### Webes paritás visszafelé

A webes `/dashboard/page.tsx` jelenleg a saját, gazdagabb komponenseket használja. Ha a 100% paritás-alapelv azt diktálja, hogy mindkét platform a közös réteget használja, a webes átállást egy későbbi sprint elvégzi (1-2 óra).

---

## 6. Dokumentáció (3-réteg modell)

- **Operatív** (ez a fájl): `docs/project-tracking/KARTOTEKA-Sprint-B-dashboard-kozepes-2026-04-25.md` ✅
- **Strukturált / user-facing**: a már meglévő `docs/CHANGELOG.md` `2026-04-25-sprint-a-stabilitas-dashboard` bejegyzése bővítve a Sprint B widgetekkel (egyetlen broadcast a lelkészeknek)
- **Gondolati**: Notion → Kartotéka projekt → új napló-oldal: *„Sprint B — Demográfiai aggregáció JS-ben"* (Endre vezeti)

---

**Aláírás**: Claude (Opus 4.7, 1M context) Endrével együtt, 2026-04-25 este
