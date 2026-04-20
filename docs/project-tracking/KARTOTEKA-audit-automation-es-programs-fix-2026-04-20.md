# KARTOTEKA - Audit automatizálás és programs drift javítás

**Dátum:** 2026-04-20  
**Fókusz:** újrafuttatható biztonsági audit eszköz + egyetlen valós séma-drift kontrollált javítása  
**Kapcsolódó dokumentumok:**  
- `docs/project-tracking/KARTOTEKA-schema-drift-es-arva-komponens-audit-2026-04-20.md`
- `docs/project-tracking/KARTOTEKA-route-es-asset-audit-2026-04-20.md`  
**Állapot:** script hozzáadva, drift javítva, 5 publikus sablon-asset törölve, build és audit verifikálva

---

## 1. Mi történt ebben a körben?

Ebben a körben három dolgot végeztem el:

1. létrehoztam egy **csak-olvasó, újrafuttatható biztonsági audit scriptet**
2. kijavítottam a korábban azonosított **egyetlen valós séma-driftet**
3. eltávolítottam az első, bizonyítottan biztonságos publikus sablonmaradvány-csomagot

Az alapelv végig ugyanaz maradt:

- előbb bizonyítás,
- aztán a lehető legkisebb, legjobban körülhatárolt javítás,
- majd azonnali visszaellenőrzés.

---

## 2. Új audit script

### 2.1. Új fájl

- `scripts/audit-safety.mjs`

### 2.2. Új npm parancs

- `package.json`
  - új script: `audit:safety`

### 2.3. Mit tud a script?

Az audit kizárólag olvas:

- kinyeri a `migration-docs/Database_schema.sql` tábláit
- végignézi a repó Supabase `.from(...)` hivatkozásait
- elkülöníti a Storage bucketeket a valódi DB-tábláktól
- külön kezeli a `migration-docs/source-links/**` örökölt Vanilla JS forrásokat
- listázza a magas biztonságú árva komponens-jelölteket
- listázza a láthatóan nem hivatkozott publikus asset-jelölteket
- külön megőrzi a framework-kezelte Next-fájlokat:
  - `app/favicon.ico`
  - `app/icon.png`
  - `app/robots.ts`
  - `app/sitemap.ts`

### 2.4. Fontos finomítások

A script második iterációban pontosítva lett, hogy:

- a `supabase.storage.from(...)` hívásokat **bucketként** kezelje, ne táblaként
- a generált `public/sw.js` ne számítson valódi használati referenciának a publikus asseteknél
- a `public/swe-worker-*.js` fájlok ne kerüljenek hamisan árva listára

---

## 3. A valós drift javítása

### 3.1. Probléma

A prezentációs adatgyűjtés itt:

- `app/(dashboard)/eves-jelentes/prezentacio/actions.ts`

korábban ezt használta:

- `.from('programs')`

Miközben:

- a séma `gyulekezeti_programok` táblát definiál
- az aktív programmodul is `gyulekezeti_programok`-ra dolgozik

### 3.2. Javítás

Módosítás:

- `app/(dashboard)/eves-jelentes/prezentacio/actions.ts`
  - `programs` -> `gyulekezeti_programok`

Ez szándékosan egyetlen, izolált sorcsere volt.

---

## 4. Verifikáció

Futtatott ellenőrzések:

- `npm run audit:safety`
- `npm run build`
- `npm run lint`

### 4.1. Audit eredmény

Az új állapotban:

- **futó kódban hiányzó táblahivatkozások: 0**
- **árva publikus asset-jelöltek: 0**
- legacy/source-links hamis pozitívok maradtak:
  - `csoporttagok`
  - `korzetfilter`

Vagyis a valós runtime séma-drift ezen a tengelyen most megszűnt.

### 4.2. Build eredmény

- a build **sikeresen lefutott**
- a PWA service worker bundling is sikeres

### 4.3. Lint eredmény

- a globális lintállapot továbbra is:
  - **1 error**
  - **72 warning**

Fontos:

- a mostani módosítás **nem hozott be új lint-hibát**
- a blokkolo error továbbra is a már ismert:
  - `components/presentation/motion-primitives.tsx`
  - `react-hooks/set-state-in-effect`

### 4.4. Továbbra is fennálló framework-adósság

A build továbbra is jelzi:

- `experimental.serverComponentsExternalPackages` -> át kell majd állítani `serverExternalPackages`-re
- a `middleware` file convention deprecated, a jövőbeni irány a `proxy`

Ezeket ebben a körben nem módosítottam, mert a cél most a minimális kockázatú drift-javítás volt.

---

## 5. Mit nyertünk ezzel?

### Röviden

- a séma-drift nemcsak kézzel lett megtalálva, hanem automatizáltan újraellenőrizhető lett
- a prezentációs modul egy valós adatforrás-hibája megszűnt
- az 5 bizonyítottan nem használt publikus sablon-SVG kikerült a repóból és a PWA cache-zajból
- a későbbi takarítás most már stabilabb alapra támaszkodhat

## 5.1. Eltávolított publikus assetek

Az első kontrollált cleanup körben az alábbi fájlok törlése történt meg:

- `public/file.svg`
- `public/globe.svg`
- `public/next.svg`
- `public/vercel.svg`
- `public/window.svg`

Miért volt ez biztonságos:

- nem framework-speciális fájlok
- nem route entrypointok
- nem volt rájuk élő alkalmazás-hivatkozás
- az audit-script a törlés után már `0` árva publikus asset-jelöltet mutat

### Különösen fontos eredmény

A rendszerben most már van egy olyan beépített, újrafuttatható diagnosztikai eszköz, ami segít elválasztani:

- a valódi veszélyt,
- a legacy zajt,
- és a túl agresszív törlés kockázatát.

---

## 6. Következő legbiztonságosabb lépések

### Első

- a `audit:safety` script eredményét használni alapnak minden további cleanup előtt

### Második

- a legacy admin/god-mode klaszter külön karanténlistájának kialakítása

### Harmadik

- külön körben kezelni a meglévő globális lint-adósságot és a Next 16 config debtet

---

## 7. Rövid döntési összegzés

Ez a kör már nemcsak diagnózis volt, hanem:

- **diagnózis automatizálás**
- és **egy bizonyítottan helyes, minimális kockázatú javítás**

Pont ez az a ritmus, amivel a Kartotéka úgy tehető egyre tisztábbá, hogy közben nem veszélyeztetjük a precízen összerakott rendszer működését.
