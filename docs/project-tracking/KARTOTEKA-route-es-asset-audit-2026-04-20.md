# KARTOTEKA - Route és asset audit

**Dátum:** 2026-04-20  
**Fókusz:** framework-kezelt speciális fájlok, verziózott legacy klaszterek, publikus assetek és precache-hatásuk  
**Kapcsolódó dokumentumok:**  
- `docs/project-tracking/KARTOTEKA-repo-higienia-diagnosztika-2026-04-20.md`
- `docs/project-tracking/KARTOTEKA-diagnosztika-folytatas-2026-04-20.md`
- `docs/project-tracking/KARTOTEKA-schema-drift-es-arva-komponens-audit-2026-04-20.md`  
**Állapot:** elemzés kész, kódmódosítás és törlés NEM történt

---

## 1. Vezetői összefoglaló

Ebben a diagnosztikai körben azt választottam szét, ami a holt kód-ellenőrzés egyik legveszélyesebb csapdája:

1. **mi látszik árva fájlnak, de valójában framework által kezelt speciális entrypoint**, és
2. **mi látszik ártatlan publikus maradványnak, de valójában minden klienshez lecache-elve kimegy a PWA-n keresztül**.

A legfontosabb eredmények:

- az `app/favicon.ico`, `app/icon.png`, `app/robots.ts`, `app/sitemap.ts` típusú fájlokat **nem szabad árva fájlnak minősíteni**, mert a Next speciális file conventionként kezeli őket;
- az admin/god-mode körben már jól látszik az aktív `v4/v5` ág és a régi `v2/v3` legacy klaszter szétválása;
- a `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` fájlok nemcsak láthatóan használaton kívüliek, hanem a service worker jelenleg **precache-eli is őket**, tehát valódi cache-zajt okoznak;
- a `public/downloads/*` mappa **nem árva**, mert az offline fejlesztői felületen élő letöltési pontként szerepel.

---

## 2. Framework által kezelt speciális fájlok

Helyi Next dokumentáció ellenőrzése alapján:

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/robots.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.md`

Megállapítás:

- a `favicon`, `icon`, `robots.ts`, `sitemap.ts` és más metadata-fájlok különleges file conventionként működnek
- ezeknek **nem kell hagyományos importlánccal rendelkezniük**
- az App Router önálló entrypointként kezeli őket

Ezért az alábbi fájlok jelenleg **aktívnak tekintendők akkor is, ha nincs rájuk klasszikus import**:

- `app/favicon.ico`
- `app/icon.png`
- `app/robots.ts`
- `app/sitemap.ts`

Diagnózis:

- ezeket árva fájlként jelölni hibás lenne
- a takarítási auditban külön kategóriát kell kapniuk: `framework-managed runtime file`

---

## 3. Aktív és leváltott verziózott UI-ágak

### 3.1. Aktív admin / god-mode ág

Az élő útvonal jelenleg:

- `app/(dashboard)/admin/page.tsx` -> `AdminTabsV3`
- `components/admin/admin-tabs-v3.tsx` -> `SecuritySettingsTabV2`
- `components/layout/dashboard-shell.tsx` -> `HeaderRefinedV3`
- `components/layout/dashboard-shell.tsx` -> `GodModeBannerV3`
- `components/layout/dashboard-shell.tsx` -> dinamikus import: `GodModeDialogV5`
- ezek az aktív elemek a `app/(dashboard)/god-mode/actions-v4.ts` ágra támaszkodnak

Diagnózis:

- ez a jelenlegi, élő admin/god-mode vonal

### 3.2. Leváltott legacy klaszter

Az alábbi elemek egy régebbi, részben még együtt maradt ágat alkotnak:

- `components/admin/admin-tabs-v2.tsx`
- `components/admin/security-settings-tab.tsx`
- `components/layout/god-mode-banner-v2.tsx`
- `components/modals/god-mode-dialog-v2.tsx`
- `components/modals/god-mode-dialog-v3.tsx`
- `app/(dashboard)/god-mode/actions-v2.ts`

Lényeges megfigyelés:

- az `actions-v2.ts` saját fejléce is explicit deprecated-ként jelöli ezt az ágat
- ugyanakkor ez a fájl még **nem tekinthető önálló árva állománynak**, mert a fenti régi UI-elemek továbbra is erre hivatkoznak

Következtetés:

- ezt a klasztert csak **egyben** szabad később karanténozni vagy törölni
- itt a “csak az actiont kivesszük” megközelítés veszélyes lenne

### 3.3. Nagyon erős jövőbeli törlésjelölt: `actions-v3.ts`

Megfigyelés:

- `app/(dashboard)/god-mode/actions-v3.ts`
- saját kommentje szerint deprecated
- a vizsgálatban nem találtam rá élő UI-komponens hivatkozást

Diagnózis:

- ez jelenleg az egyik legerősebb **szerveroldali legacy jelölt**
- de törlés előtt egy utolsó teljes-repós ellenőrzés még szükséges

---

## 4. Verziózott komponensek, ahol az új ág már azonosítható

### 4.1. Layout

Aktív:

- `components/layout/sidebar-adaptive-v4.tsx`
- `components/layout/header-refined-v3.tsx`

Leváltható jelöltek:

- `components/layout/sidebar-adaptive-v2.tsx`
- `components/layout/sidebar-adaptive-v3.tsx`
- `components/layout/header-refined-v2.tsx`
- `components/layout/sidebar-refined.tsx`

### 4.2. Tagnyilvántartás

Aktív:

- `app/(dashboard)/tagnyilvantartas/page.tsx` -> `MemberTabsV4`

Leváltható jelöltek:

- `components/members/member-tabs-v2.tsx`
- `components/members/member-tabs-v3.tsx`

### 4.3. Leltár

Aktív:

- `app/(dashboard)/leltar/page.tsx` -> `InventoryMain` a `inventory-main-v3.tsx` fájlból

Leváltható jelölt:

- `components/inventory/inventory-main-v2.tsx`

Megjegyzés:

- `components/inventory/inventory-print-dialog-v2.tsx` **nem árva**, mert az `inventory-main-v3.tsx` még használja

---

## 5. Publikus assetek: mi aktív és mi cache-zaj

### 5.1. Biztosan aktív publikus assetek

Az alábbi elemekről élő hivatkozást találtam:

- `public/EREK.png`
  - `app/layout.tsx`
  - auth layout
  - sidebarok
  - nyomtatási sablonok
  - manifest
- `public/kartoteka-icon.png`
  - sidebar variánsok
  - manifest maskable icon
- `public/manifest.json`
  - `app/layout.tsx`
- `public/sw.js`
  - PWA service worker build output
- `public/swe-worker-ab00d3c7d2d59769.js`
  - Serwist worker runtime kiegészítő

### 5.2. Nem árva, bár könnyen félrenézhető

`public/downloads/*`

Megfigyelés:

- `components/offline/developer-downloads-card.tsx` élő linkeket ad:
  - `/downloads/install-resend.bat`
  - `/downloads/README.md`
- `app/(dashboard)/offline/page.tsx` ezt a kártyát ténylegesen kirendereli

Diagnózis:

- a `public/downloads` mappa nem törlési jelölt
- ez fejlesztői/üzemeltetői letöltési csatorna

### 5.3. Magas biztonságú árva asset-jelöltek

Az alábbi fájlokra továbbra sem találtam élő alkalmazás-hivatkozást:

- `public/file.svg`
- `public/globe.svg`
- `public/next.svg`
- `public/vercel.svg`
- `public/window.svg`

Ezek tipikusan sablonmaradványnak tűnnek.

---

## 6. Rejtett költség: a service worker precache

Az `app/sw.ts` jelenleg ezt használja:

- `precacheEntries: self.__SW_MANIFEST`
- `runtimeCaching: defaultCache`

A generált `public/sw.js` alapján a precache listába jelenleg bekerül:

- a hasznos ikonok
- a developer letöltések
- és a fenti, valószínűleg felesleges SVG-k is

Diagnózis:

- a holt `public/*.svg` fájlok nemcsak helyet foglalnak a repóban,
- hanem minden PWA-klienst érintő cache-zajt is okoznak

Következmény:

- a jövőbeli asset-cleanup nemcsak repo-higiénia,
- hanem offline cache-optimalizálás is

Külön megjegyzés:

- a `public/downloads/*` fájlok is bekerülnek a precache-be
- ez funkcionálisan nem hiba, de érdemes eldönteni, hogy valóban minden kliensnek offline elérhetővé kell-e tenni őket

---

## 7. Amit ebből NEM szabad levonni

Nem szabad azt mondani, hogy:

- “ami nincs importálva, az törölhető”

Mert külön kategóriák vannak:

- framework-managed special files
- direct URL-es public assetek
- dinamikusan importált komponensek
- deprecated, de még klaszterszinten összedrótozott legacy ágak

---

## 8. Ajánlott következő lépések

### Első prioritás

- a korábban azonosított `programs` -> `gyulekezeti_programok` drift javítása

### Második prioritás

- a legacy `god-mode/admin v2` klaszter külön karanténlistája:
  - `admin-tabs-v2`
  - `security-settings-tab`
  - `god-mode-banner-v2`
  - `god-mode-dialog-v2`
  - `god-mode-dialog-v3`
  - `actions-v2`

### Harmadik prioritás

- a magas biztonságú publikus SVG maradványok célzott takarítása
- utána teljes rebuild, hogy a Serwist újragenerálja a precache listát

### Negyedik prioritás

- eldönteni, hogy a `public/downloads/*` kerüljön-e továbbra is minden kliens offline cache-ébe

---

## 9. Rövid döntési javaslat

Jelenleg a legbiztonságosabb ütemezés:

1. drift-javítás
2. legacy klaszterek címkézése
3. publikus asset-cleanup
4. új build és PWA-cache verifikáció

Így a rendszerből továbbra sem érzésre, hanem bizonyított működési kontextus alapján veszünk ki bármit.
