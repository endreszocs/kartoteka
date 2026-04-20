# KARTOTEKA - Repo-higiénia diagnosztika

**Dátum:** 2026-04-20  
**Fókusz:** használaton kívüli fájlok, árva kód, generált maradványok, kézi referenciaanyagok szétválasztása  
**Bemeneti források:** `app/`, `components/`, `lib/`, `public/`, `scripts/`, `standalone-build/`, `supabase/`, `migration-docs/Database_schema.sql`, meglévő audit-dokumentumok, Obsidian vault (`C:\Users\Barátosi Egyház\Documents\Kartotéka AGY`)  
**Állapot:** elemzés és dokumentálás kész, törlés NEM történt

---

## 1. Vezetői összefoglaló

A mostani körben **nem töröltem semmit**. Előbb teljes repo-higiéniai diagnózist készítettem, hogy a rendszerből csak azt emeljük ki, ami tényleg fölösleges, és ne sérüljön se a gyülekezeti működés, se a biztonsági réteg, se a standalone/offline ág.

Az audit alapján négy jól elkülöníthető csoport rajzolódik ki:

1. **Biztosan újragenerálható helyi állományok** - cache, log és build-maradványok.
2. **Magas biztonsággal árva forrásfájlok** - nincs rájuk bejövő import, nem Next.js entrypointok, és nem konfigurációs belépési pontok.
3. **Nem használt publikus assetek** - a futó alkalmazás nem hivatkozza őket, mégis bekerülnek a PWA precache-be.
4. **Kézi referencia- vagy forrásanyagok** - nem runtime fájlok, de üzletileg vagy dizájn szempontból még értékesek lehetnek.

A legfontosabb óvatossági tanulság: **a verziózott fájlnév önmagában nem bizonyíték a halott kódra**. Ebben a kódbázisban több aktív komponens is `v2`, `v3`, `v4` vagy `refined` néven él production-ben. Emiatt csak az importgráf, a route-belépési pontok, a config-hivatkozások és a build-ellenőrzés együtt adnak biztonságos képet.

---

## 2. Módszertan

Az audit több rétegben készült, hogy ne csak szöveges rákeresésből szülessen ítélet:

- `rg` alapú teljes szöveges keresés a forrásfákon.
- kézi route- és layout-feltérképezés az `app/` alatt.
- konfigurációs ellenőrzés: `package.json`, `next.config.ts`, `middleware.ts`, `app/layout.tsx`, PWA-fájlok, standalone build-scriptek.
- importgráf jellegű vizsgálat `app`, `components`, `lib`, `scripts`, `supabase` területeken, külön kezelve a Next.js entrypoint-konvenciókat.
- futtatási validáció:
  - `npx tsc --noEmit` -> sikeres
  - `npm run build` -> sikeres
  - `npm run lint` -> 1 error + 72 warning
- külön ellenőrzés a publikus assetekre, az `icon/`, `docs/sablonok/`, `migration-docs/`, `standalone-build/` és `supabase/functions/` ágakra.
- adatmodell-kontekstus ellenőrzése a `migration-docs/Database_schema.sql` alapján.

Az importgráf-vizsgálatnál **élőnek** vettem az alábbiakat, még akkor is, ha kevés vagy nulla bejövő importjuk van:

- Next.js route entrypointok: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`
- middleware / proxy réteg
- `public/manifest.json`, `app/sw.ts`, `public/sw.js`
- standalone build és installer lánc
- Supabase Edge Function entrypointok
- dokumentált kézi letöltések és telepítő-fájlok

---

## 3. Futtatási és minőségi állapot

### Pozitív ellenőrzések

- `npx tsc --noEmit` jelenleg tisztán lefut.
- `npm run build` jelenleg sikeres.
- A PWA service worker ténylegesen generálódik, a route-ok nagy része build-szinten egészséges.

### Nyitott technikai figyelmeztetések

- `npm run lint` jelenleg **nem tiszta**.
- Az egyetlen blokkoló hiba:
  - `components/presentation/motion-primitives.tsx:145`
  - szabály: `react-hooks/set-state-in-effect`
- Emellett sok a `@typescript-eslint/no-unused-vars` figyelmeztetés, ami részben ráerősít az árva/átmeneti kódrétegek jelenlétére.

### Next.js 16-hoz kapcsolódó megjegyzések

- A `next.config.ts` még tartalmazza az elavult `experimental.serverComponentsExternalPackages` kulcsot. Next 16 alatt ennek helye `serverExternalPackages`.
- A `middleware.ts` fájlminta deprecált, a friss Next dokumentáció szerint a jövőbeni konvenció `proxy`.

Ez a két pont nem "szemétfájl"-kérdés, de fontos diagnosztikai mellékszál, mert a jelenlegi repo-higiénia része a framework-frissítési adósság is.

---

## 4. Biztosan újragenerálható helyi állományok

Ezek **nem üzleti forrásfájlok**, hanem helyi build- vagy fejlesztői maradványok. Törölhetők, mert újra előállnak:

- `.next/`
- `.dev-server.log`
- `.dev-server.err.log`
- `lint-output.log`
- `tsconfig.tsbuildinfo`

Megjegyzés:

- A `.gitignore` már lefedi a `.next/`, `*.log` és `*.tsbuildinfo` mintákat.
- Ezek törlése **nem tartozik a kódtakarítási döntések közé**, ez sima helyi higiéniai lépés.

---

## 5. Magas biztonsággal árva forrásfájlok

Az alábbi fájloknál a jelenlegi audit alapján:

- nincs bejövő import a releváns forrásfákból,
- nem Next.js konvenciós entrypointok,
- nem konfigurációs belépési pontok,
- és nem találtam olyan futó route-ot, amely közvetve elérné őket.

Ez **nem azonnali törlési lista**, hanem **első számú jelöltlista** a kontrollált takarításhoz.

### Admin

- `components/admin/admin-tabs-v2.tsx`
- `components/admin/admin-tabs.tsx`
- `components/admin/import-tab.tsx`
- `components/admin/overview-tab.tsx`

### Dashboard és gyülekezeti kezdőfelület

- `components/dashboard/charts.tsx`
- `components/dashboard/congregation-overview-card.tsx`
- `components/dashboard/daily-verse.tsx`
- `components/dashboard/hero-banner-refined.tsx`
- `components/dashboard/hero-banner-scripture.tsx`
- `components/dashboard/hero-banner.tsx`
- `components/dashboard/public-site-widget.tsx`
- `components/dashboard/scope-financial-section.tsx`
- `components/dashboard/scope-vital-stats-section.tsx`
- `components/dashboard/unlock-requests-card.tsx`

### Finance

- `components/finance/accounting-tab.tsx`
- `components/finance/audit-tab.tsx`
- `components/finance/chitanta-print-center.tsx`
- `components/finance/debt-tab.tsx`
- `components/finance/empty-categories-cta.tsx`
- `components/finance/erek-finance-guide-tab.tsx`
- `components/finance/finance-pdf-library.tsx`
- `components/finance/monetary-tab.tsx`

### Inventory

- `components/inventory/inventory-help-section.tsx`
- `components/inventory/inventory-main-v2.tsx`
- `components/inventory/inventory-main.tsx`
- `components/inventory/inventory-print-dialog.tsx`

### Layout és globális shell

- `components/layout/god-mode-banner-v2.tsx`
- `components/layout/god-mode-banner.tsx`
- `components/layout/header-refined-v2.tsx`
- `components/layout/header-refined.tsx`
- `components/layout/header.tsx`
- `components/layout/sidebar-adaptive-v2.tsx`
- `components/layout/sidebar-adaptive-v3.tsx`
- `components/layout/sidebar-adaptive.tsx`
- `components/layout/sidebar-refined.tsx`
- `components/layout/sidebar.tsx`

### Member registry

- `components/members/families-tab.tsx`
- `components/members/member-admin-import-tab.tsx`
- `components/members/member-tabs-v2.tsx`
- `components/members/member-tabs-v3.tsx`
- `components/members/member-tabs.tsx`

### Missziós Műhely - régi ág

- `components/missions/mission-workshop-v2.tsx`
- `components/missions/mission-workshop.tsx`
- `components/misszios-muhely/bookmark-toggle.tsx`

Megjegyzés:

- A jelenlegi élő missziós route-ok a `components/muhely/*` ágat használják, nem a `components/missions/*` és nem a `components/misszios-muhely/*` ágakat.

### Modálok

- `components/modals/chitanta-issue-dialog.tsx`
- `components/modals/chitanta-reprint-dialog.tsx`
- `components/modals/congregation-dialog.tsx`
- `components/modals/expense-dialog.tsx`
- `components/modals/family-details-dialog.tsx`
- `components/modals/fx-revaluation-dialog.tsx`
- `components/modals/god-mode-dialog-v2.tsx`
- `components/modals/god-mode-dialog-v3.tsx`
- `components/modals/god-mode-dialog-v4.tsx`
- `components/modals/god-mode-dialog.tsx`
- `components/modals/income-dialog-v2.tsx`
- `components/modals/income-dialog.tsx`
- `components/modals/internal-transfer-dialog.tsx`
- `components/modals/member-details-dialog-refined.tsx`
- `components/modals/member-details-dialog.tsx`

### Shared / UI / helper

- `components/shared/kuka-badge.tsx`
- `components/shared/module-admin-import-tab.tsx`
- `components/ui/help-tooltip.tsx`
- `components/ui/select.tsx`
- `lib/offline/hooks/use-sync-mutation.ts`

### App actions

- `app/(dashboard)/god-mode/actions-v3.ts`

Megjegyzés:

- A `components/ui/help-tooltip.tsx` és a `lib/offline/hooks/use-sync-mutation.ts` dokumentációban már szerepelnek, de a jelenlegi kód nem importálja őket.
- Az ilyen fájloknál különösen fontos a "kód él-e, vagy csak előkészített tartalék?" kérdés, ezért csak ellenőrzött körben szabad hozzányúlni.

---

## 6. Verzióláncok, amelyek félrevezetők lehetnek

Az alábbi minta végigvonul a repón:

- `v2`
- `v3`
- `v4`
- `v5`
- `refined`

Ezek **nem egyformán elavultak**. Több közülük a production-ben élő "jelenlegi" verzió. Emiatt tilos a `v2/v3/refined` fájlokat tömbösen törölni.

### Biztosan aktív verziózott fájlok

- `app/(dashboard)/god-mode/actions-v4.ts`
- `components/admin/admin-tabs-v3.tsx`
- `components/admin/security-settings-tab-v2.tsx`
- `components/dashboard/hero-banner-scripture-v2.tsx`
- `components/finance/accounting-tab-v2.tsx`
- `components/finance/debt-tab-v2.tsx`
- `components/finance/monetary-tab-v2.tsx`
- `components/inventory/inventory-main-v3.tsx`
- `components/layout/god-mode-banner-v3.tsx`
- `components/layout/header-refined-v3.tsx`
- `components/layout/sidebar-adaptive-v4.tsx`
- `components/members/member-tabs-v4.tsx`
- `components/modals/congregation-dialog-v2.tsx`
- `components/modals/expense-dialog-v2.tsx`
- `components/modals/god-mode-dialog-v5.tsx`
- `components/modals/income-dialog-v3.tsx`
- `components/modals/member-details-dialog-v2.tsx`

### Különösen fontos összefüggés

- `components/layout/dashboard-shell.tsx` jelenleg a `HeaderRefinedV3`, `GodModeBannerV3`, `CongregationDialogV2` és `GodModeDialogV5` komponenseket használja.
- `app/(dashboard)/admin/page.tsx` a `AdminTabsV3` komponenst használja.
- `app/(dashboard)/tagnyilvantartas/page.tsx` a `MemberTabsV4` komponenst használja.
- `app/(dashboard)/dashboard/page.tsx` a `HeroBannerScriptureV2` komponenst használja.

Következtetés:

- A névben szereplő verzió alapján **nem** lehet dönteni.
- A takarítást mindig **csoportonként, importellenőrzéssel** kell végezni.

---

## 7. Nem használt publikus assetek

Az alábbi fájlokra a forráskódban nem találtam tényleges alkalmazás-hivatkozást:

- `public/file.svg`
- `public/globe.svg`
- `public/next.svg`
- `public/vercel.svg`
- `public/window.svg`

Miért fontos ez?

- Ezek nem csak "ott maradt" fájlok.
- A generált `public/sw.js` jelenleg **precache-eli** őket, ezért minden kliens letöltési listájába is bekerülnek.
- Vagyis ez kis, de valós PWA-terhelés és zaj.

### Aktív publikus assetek - ne töröljük

- `public/EREK.png`
- `public/kartoteka-icon.png`
- `public/manifest.json`
- `public/downloads/install-resend.bat`
- `public/downloads/README.md`

### Generált publikus fájlok

- `public/sw.js`
- `public/swe-worker-ab00d3c7d2d59769.js`

Ezeket kézzel szerkeszteni nem szabad; build által generált állományok.

---

## 8. Kézi referencia- és forrásanyagok

Ezekre a futó app nem hivatkozik, de jelen állapotban **nem szemétnek**, hanem **kézi forrásanyagnak** tekintem őket.

### Branding / grafikai források

- `icon/1.png`
- `icon/2.png`
- `icon/3.png`
- `icon/4.png`
- `icon/EREK.png`
- `icon/Gyülekezeti logo.png`
- `icon/icon (transparent).png`
- `icon/icon.png`

Megjegyzés:

- A runtime jelenleg a `public/EREK.png` és `public/kartoteka-icon.png` fájlokat használja.
- Az `icon/` mappa inkább forrás- vagy munkaanyag-tárolónak látszik.
- Törlés előtt külön el kell dönteni, hogy ez a brand eredeti "mesterforrása"-e.

### Dokumentációs sablonok

- `docs/sablonok/Minta - Házasság - Üres.svg`
- `docs/sablonok/Minta - Házasság.svg`
- `docs/sablonok/Minta - Keresztelő.svg`
- `docs/sablonok/Minta - Konfirmáció - EREK - üres.svg`
- `docs/sablonok/Minta - Konfirmáció - EREK.svg`
- `docs/sablonok/Minta - Konfirmáció - KREK - Üres.svg`
- `docs/sablonok/Minta - Konfirmáció - KREK.svg`
- `docs/sablonok/Minta - Üres.svg`

Megjegyzés:

- Ezekre nem találtam runtime-hivatkozást.
- Mivel tartalmuk egyházi okmány- és nyomtatványjellegű, valószínűbb, hogy kézi minták vagy vizuális alapanyagok.

### Egyéb referencia-gyanús állomány

- `migration-docs/EREK.png`

Valószínűleg duplikált logó- vagy dokumentációs kép, de törlés előtt össze kell vetni a tényleges forrásszereppel.

---

## 9. Olyan területek, amelyeket MOST nem szabad törlési jelöltnek tekinteni

### Standalone és telepítő ág

- `standalone-build/**`
- `app/api/standalone/**`
- `components/standalone/**`
- `lib/standalone/**`
- `supabase/functions/issue-license/index.ts`

Ezek több helyen is dokumentált, élő üzleti funkcionalitás részei.

### Offline és backup

- `components/offline/full-backup-panel.tsx`
- `components/offline/full-backup-panel-client.tsx`
- `lib/offline/full-backup.ts`

Ezek importlánca nem annyira széles, de jelenleg aktív rendszerághoz tartoznak.

### Trükkös, de aktív helper

- `lib/constants/inventory.next.ts`

A név megtévesztő, de jelenleg használatban van. Nem jelölt.

### Letöltések

- `public/downloads/install-resend.bat`
- `public/downloads/README.md`

Ezeket a `components/offline/developer-downloads-card.tsx` ténylegesen hivatkozza.

---

## 10. Obsidian second brain - illeszkedési megfigyelések

Az Obsidian vault jelenlegi szerkezete alapján a rendszer tudásoldala már most jó irányban áll:

- `10-Napló` - operatív és napi gondolkodási nyom
- `20-Fogalmak` - atomi tudáselemek
- `30-MOC` - Maps of Content
- `00 — Belépő.md` - emberi belépési pont és index

Ez a gyakorlatban **link-alapú, MOC-os, második agy jellegű** működés, nem pusztán fájlarchívum. A repo-higiéniai diagnózis emiatt két szinten él tovább:

- a technikai tények a repóban,
- az elvi tanulságok a vault naplójában.

---

## 11. Javasolt takarítási sorrend

### Fázis 1 - azonnal, kockázatmentesen

- helyi generált állományok törlése:
  - `.next/`
  - `*.log`
  - `tsconfig.tsbuildinfo`

### Fázis 2 - nagyon alacsony kockázat

- a nem használt publikus SVG-k eltávolítása:
  - `public/file.svg`
  - `public/globe.svg`
  - `public/next.svg`
  - `public/vercel.svg`
  - `public/window.svg`

Utána kötelező:

- `npx tsc --noEmit`
- `npm run build`
- PWA smoke-check

### Fázis 3 - modulonkénti árva kód takarítás

Javasolt sorrend:

1. `components/misszios-muhely/*` és `components/missions/*`
2. régi `components/layout/*` ág
3. régi `components/modals/*` ág
4. árva `components/ui/*` és offline helper-ek

Szabály:

- mindig **egy domaincsoport egyszerre**
- build + lint + kézi smoke-check minden csomag után
- előbb törlési patch, utána csak akkor merge, ha nincs route-regresszió

### Fázis 4 - kézi referenciaanyagok rendezése

Nem törlés, hanem szétválasztás:

- mi a runtime asset,
- mi a design source,
- mi a dokumentációs minta,
- mi az archívum.

Itt érdemes lehet külön mappastruktúrát kialakítani, például:

- `branding/source/`
- `docs/sablonok/`
- `archive/manual-assets/`

---

## 12. Javasolt döntési szabályok a további tisztításhoz

1. **Semmit ne töröljünk csak név alapján.**
2. **A `v2/v3/v4/refined` csak stílusjelölő, nem életciklus-bizonyíték.**
3. **A nullás bejövő import még nem elég - ellenőrizni kell a Next konvenciós belépési pontokat is.**
4. **A `public/` fájlokra külön figyelni kell, mert a PWA precache miatt a látszólag ártatlan maradék is költséget jelent.**
5. **A `docs/`, `migration-docs/`, `icon/` és Obsidian tartalmak sokszor nem runtime-elemek, hanem tudás- és forrásvagyon.**
6. **Minden cleanup után újra kell futtatni a TypeScriptet, a buildet és legalább a kritikus route-ok kézi ellenőrzését.**

---

## 13. Következő ajánlott lépés

Ha a következő körben már tényleges takarítást is szeretnénk, a legbiztonságosabb első csomag ez:

1. helyi generált fájlok törlése,
2. az 5 nem használt `public/*.svg` törlése,
3. `components/misszios-muhely/bookmark-toggle.tsx` és a teljes régi `components/missions/*` ág külön ellenőrzése,
4. új validációs kör:
   - `npx tsc --noEmit`
   - `npm run build`
   - `npm run lint`
   - manuális route smoke-check

Ez a sorrend adja a legjobb arányt a gyors nyereség és a minimális üzleti kockázat között.
