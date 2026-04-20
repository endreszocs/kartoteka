# KARTOTEKA - Séma drift és árva komponens audit

**Dátum:** 2026-04-20  
**Fókusz:** adatbázis-séma és futó kód eltérései, magas biztonságú árva komponensek azonosítása  
**Kapcsolódó dokumentumok:**  
- `docs/project-tracking/KARTOTEKA-repo-higienia-diagnosztika-2026-04-20.md`
- `docs/project-tracking/KARTOTEKA-diagnosztika-folytatas-2026-04-20.md`  
**Állapot:** elemzés kész, kódmódosítás és törlés NEM történt

---

## 1. Vezetői összefoglaló

A harmadik diagnosztikai kör két külön kategóriát választott szét:

1. **Valódi futásidejű kockázatot jelentő séma-drift**
2. **Olyan örökölt vagy alternatív komponensek, amelyek jelenleg nagy valószínűséggel nincsenek használatban**

A legfontosabb megállapítás:

- az éves jelentés prezentációs adatgyűjtése jelenleg `programs` táblára kérdez rá,
- miközben a sémában és az aktív programmodulban következetesen `gyulekezeti_programok` szerepel,
- ezért ez **valós, javítandó drift-gyanú**, nem puszta dokumentációs zaj.

Emellett több olyan komponensfájl is előkerült, amelyekre a futó forráskódból nem találtam bejövő hivatkozást. Ezeket **nem töröltem**, csak magas biztonságú karantén-jelöltekként dokumentáltam.

---

## 2. Módszertan

Ebben a körben az alábbiakat ellenőriztem:

- `migration-docs/Database_schema.sql` tábláinak kinyerése
- a teljes repó `.from('...')` Supabase-hivatkozásainak szkennelése
- a storage bucket-használat elkülönítése a valódi adatbázis-táblahivatkozásoktól
- a gyanús találatok kézi visszaellenőrzése
- kiválasztott `v2`, `refined`, `dialog`, `tab` komponensek importláncának ellenőrzése
- az aktív route-ok és shell-komponensek beolvasása, hogy a valóban használt alternatívák is azonosíthatók legyenek

Fontos korlát:

- a "nincs rá import" **nem ugyanaz**, mint a "biztosan törölhető"
- csak azokat minősítettem magas biztonságú árva jelöltnek, ahol az aktív helyettesítő útvonal is látszik

---

## 3. Valódi séma-drift gyanú

### 3.1. `programs` vs `gyulekezeti_programok`

Megfigyelés:

- `app/(dashboard)/eves-jelentes/prezentacio/actions.ts`
  - a prezentációs aggregáció `programs` táblára kérdez rá
- `app/(dashboard)/programs/actions.ts`
  - az aktív programmodul minden CRUD művelete `gyulekezeti_programok` táblát használ
- `migration-docs/Database_schema.sql`
  - a séma `CREATE TABLE public.gyulekezeti_programok` definíciót tartalmaz
  - a szükséges mezők ott vannak: `congregation_id`, `datum`, `tipus`, `teljesitett`

Diagnózis:

- ez **nem névadási stílusbeli eltérés**, hanem nagy valószínűséggel hibás táblanév a prezentációs action-ben
- ha a lekérdezés tényleg `programs` táblára fut éles környezetben, akkor az adatgyűjtés:
  - hibára futhat,
  - vagy üres eredményt adhat,
  - vagy csendes statisztikai torzulást okozhat

Kockázat:

- magas, mert az éves jelentés és prezentáció vezetői döntéstámogató felület
- különösen veszélyes azért, mert egy üres vagy hiányos statisztika könnyen "hihető" marad

Ajánlott következő lépés:

1. kézi javítás előtt ellenőrizni, hogy nincs-e adatbázis oldali alias vagy view
2. ha nincs, a lekérdezést `gyulekezeti_programok`-ra átállítani
3. utána célzott verifikáció:
   - éves jelentés prezentáció betöltés
   - programszám / teljesítési arány ellenőrzés
   - `npm run build`
   - `npm run lint`

---

## 4. Hamis pozitív találatok, amelyeket NEM szabad futó hibának nézni

### 4.1. `csoporttagok`

Automata találat:

- `migration-docs/source-links/member_api.js`

Kézi ellenőrzés:

- az aktív app-kódban nem ez a hivatkozás él
- a `migration-docs/source-links/**` mappa örökölt, referencia célú Vanilla JS forrásokat tartalmaz
- ezt az `eslint.config.mjs` is kizárja a modern lintelésből
- a legacy cleanup SQL-ek már külön foglalkoznak a tábla archíválásával

Diagnózis:

- ez **nem aktív runtime drift**, hanem archív forrásmaradvány

### 4.2. `korzetfilter`

Automata találat:

- `migration-docs/source-links/presbiter_korzet_api.js`

Kézi ellenőrzés:

- ugyanaz a helyzet, mint `csoporttagok` esetén
- a dokumentáció és a cleanup SQL-ek alapján ez legacy/adatmentési örökség

Diagnózis:

- ez sem aktív futásidejű hiba

Következtetés:

- a generikus `.from('...')` keresés hasznos volt,
- de a `migration-docs/source-links/**` mappa találatait külön kell kezelni,
- különben fals pánikot okoznak

---

## 5. Magas biztonságú árva komponens-jelöltek

Az alábbi fájlokra a futó kódban nem találtam bejövő hivatkozást a vizsgálat során.

### 5.1. Layout és shell alternatívák

- `components/layout/sidebar-refined.tsx`
- `components/layout/sidebar-adaptive-v2.tsx`
- `components/layout/header-refined-v2.tsx`

Miért magas biztonságú jelöltek:

- az aktív dashboard shell a `DashboardLayoutClient` -> `SidebarAdaptiveV4` útvonalat használja
- az aktív header a `DashboardShell` -> `HeaderRefinedV3`

### 5.2. Dashboard és modul előző generációk

- `components/dashboard/hero-banner-refined.tsx`
- `components/inventory/inventory-main-v2.tsx`
- `components/members/member-tabs-v2.tsx`

Aktív alternatívák:

- dashboard: `HeroBannerScriptureV2`
- leltár: `InventoryMain` az `inventory-main-v3` fájlból
- tagnyilvántartás: `MemberTabsV4`

### 5.3. Pénzügyi árva tabok

- `components/finance/audit-tab.tsx`
- `components/finance/erek-finance-guide-tab.tsx`

Megfigyelés:

- az aktív pénzügyi belépési pont `app/(dashboard)/penzugy/page.tsx`
- ez `FinanceTabs`-ot használ
- a `FinanceTabs` importlistájában ezek a tabok nem szerepelnek

### 5.4. Valószínűleg leváltott vagy félbehagyott modálok

- `components/modals/chitanta-issue-dialog.tsx`
- `components/modals/chitanta-reprint-dialog.tsx`
- `components/modals/income-dialog-v2.tsx`
- `components/modals/internal-transfer-dialog.tsx`
- `components/modals/member-details-dialog-refined.tsx`

Megjegyzés:

- ezeknél jelenleg csak a "nincs élő kód-ref" állítást teszem meg
- törlés előtt minden egyes fájlnál külön funkcionális ellenőrzés kell

### 5.5. Speciális eset: kompatibilitási alias fájl

- `components/missions/mission-workshop-v2.tsx`

Külön megjegyzés:

- ez nem klasszikus árva komponensnek tűnik
- a fájl végén `MissionWorkshopV3 as MissionWorkshopV2` re-export látszik
- jelenleg nincs rá aktív hivatkozás, de formálisan inkább **nem használt kompatibilitási adapter**

---

## 6. Mit NEM mond ki ez az audit

Az audit **nem állítja**, hogy a fenti fájlok azonnal törölhetők.

Csak ezt állítja:

- jelenleg nincs látható élő importláncuk a modern futó kódban
- több esetben az újabb, aktív alternatíva is azonosítható
- emiatt ezek jó jelöltek egy következő, kontrollált "karantén majd törlés" folyamatra

Javasolt biztonsági sorrend:

1. előbb a valódi séma-drift javítása
2. utána az árva komponensek karanténlistája
3. majd fájlonként:
   - törlés
   - `npm run build`
   - `npm run lint`
   - érintett route kézi végigpróbálása

---

## 7. Ajánlott következő lépések

### Első prioritás

- `app/(dashboard)/eves-jelentes/prezentacio/actions.ts` ellenőrzött javítása `programs` -> `gyulekezeti_programok`

### Második prioritás

- külön "karantén-jegyzet" készítése az árva komponensekről
- minden fájlt három címkével ellátni:
  - `biztosan árva`
  - `adapter/kompatibilitási maradvány`
  - `még ellenőrizendő`

### Harmadik prioritás

- a `migration-docs/source-links/**` mappa státuszának egyértelmű dokumentálása:
  - referencia
  - nem futó app-kód
  - fals pozitív forrás lehet automatizált auditnál

---

## 8. Rövid döntési javaslat

Jelen állapot alapján a legbiztonságosabb út:

- **nem törlünk még semmit**, csak címkézünk és dokumentálunk
- **először a `programs` driftet javítjuk**
- utána kontrollált, modulonkénti árva-fájl takarítást végzünk

Ez illeszkedik ahhoz az alapelvhez, hogy a rendszerből csak azt vegyük ki, amiről bizonyítottuk, hogy a mai működéshez már nem kell.
