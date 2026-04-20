# Fázis 9 — Véglegesítés — Elemzés

**Fázis 9 — rendszerszintű lezárás**

| Modul | Forrás | Sor | Függvény | Tábla |
|-------|--------|:---:|:--------:|:-----:|
| Service Worker (PWA) | `sw.js` | 230 | 5 | — |
| PWA Manifest | `manifest.json` | 29 | — | — |
| Offline DB (IndexedDB) | `offline_db.js` | 347 | 14 | 19 store |
| Offline Sync | `offline_sync.js` | 243 | 7 | 16 tábla |
| Data Cache | `data_cache.js` | 101 | 4 | — |
| Smart Query | `smart_query.js` | 222 | 4 | — |
| Capacitor Config | `capacitor.config.json` | 21 | — | — |
| **Összesen** | **7 fájl** | **1193** | **34** | **19** |

**Plusz: hátramaradt placeholder-ek az 1–8 fázisokból.**

---

## 1. Modul célja

A Fázis 9 NEM egyetlen modul, hanem a teljes rendszer véglegesítése. Három fő terület:

### A) Offline/PWA infrastruktúra
A régi rendszerben teljes offline működés van: Service Worker (cache stratégiák), IndexedDB tükrözés (19 store), szinkronizálási motor (sync queue + push), smart query wrapper (átlátszó online/offline váltás). A Next.js rendszerben ezek teljesen hiányoznak.

### B) Hátramaradt placeholder-ek
Az 1–8 fázisokból befejezetlen modulok:
- **Pénzügy 4b** — Költségvetés + Számadás (forrás: 958 sor)
- **Pénzügy 4c** — Bank + Belső mozgás (forrás: 1461 sor)
- **Pénzügy 4d** — Nyomtatás + Audit (forrás: 1440 sor)
- **Missziós Műhely** — teljes modul (forrás: 4332 sor, 5 fájl)
- **Admin Import** — tömeges Excel import (4 típus)
- **Anyakönyv áttekintő statisztika** — 1 placeholder

### C) Deploy + tesztelés
Élesítés előtti feladatok: build optimalizáció, Vercel deploy, biztonsági audit.

---

## 2. Fő funkciók

### 2.1 Service Worker (`sw.js`)

- **Precache** — 30+ statikus asset (vendor CSS/JS, bundle-ök, HTML oldalak, képek) telepítéskor
- **Cache verziózás** — `kartoteka-v23` prefix, régi cache automatikus törlése aktiváláskor
- **3 cache stratégia:**
  - **Cache-first** — statikus assetek (CSS, font, kép, CDN könyvtárak)
  - **Network-first** — Supabase REST API, JS bundle-ök, HTML komponensek
  - **Stale-while-revalidate** — HTML oldalak, Supabase Storage
- **Auth kizárás** — `/auth/` és `/token` útvonalak SOHA nem cache-elődnek
- **Üzenet API** — `skipWaiting` (azonnali frissítés) + `clearCache` (teljes törlés)

### 2.2 Offline DB (`offline_db.js`)

- **IndexedDB absztrakció** — 19 object store az összes fontos Supabase táblának
- **CRUD műveletek** — `put`, `putAll`, `get`, `getAll`, `delete`, `clear`
- **Index-alapú lekérdezés** — `query(store, indexName, value)`
- **Sync queue** — offline mutációk (insert/update/delete) sorba állítása
- **Meta store** — kulcs-érték párok (utolsó szinkronizálás, stb.)

### 2.3 Offline Sync (`offline_sync.js`)

- **Supabase → IndexedDB szinkronizálás** — 16 tábla konfigurálva
- **Kétfázisú sync:** referencia táblák (párhuzamos) + congregation-szintű adatok
- **Sync queue push** — online visszakapcsolódáskor szekvenciális feldolgozás
- **Háttér szinkronizálás** — 5 percenként automatikus
- **`online` event listener** — visszakapcsolódáskor: push queue → sync all
- **Állapotjelzés** — online/offline, utolsó sync, várakozó mutációk száma

### 2.4 Data Cache (`data_cache.js`)

- **TTL-alapú memória cache** — alapértelmezés 2 perc
- **IndexedDB fallback** — hálózati hiba esetén az offline adatokból szolgál
- **Cache invalidáció** — kulcs, prefix, vagy teljes törlés
- **Debug statisztika** — cache bejegyzések és koruk

### 2.5 Smart Query (`smart_query.js`)

- **Átlátszó online/offline kezelés** — a hívó kód nem tudja/nem is kell tudnia melyik forrásból jön
- **`smartQuery(table, select, filters, options)`** — lekérdezés
  - Online: Supabase query + háttérben IDB mentés
  - Offline: IndexedDB-ből kliens-oldali szűrés, rendezés, limit
- **`smartMutate(table, action, data)`** — mutáció
  - Online: Supabase mutation + IDB frissítés
  - Offline: IDB mutáció + sync queue-ba állítás (ideiglenes `temp_` ID generálás)

### 2.6 PWA Manifest (`manifest.json`)

- App név: „Kartotéka — Egyházi Nyilvántartási Rendszer"
- Display: `standalone`
- Theme color: `#0ca678` (zöld)
- Ikonok: 192×192 + 512×512 (maskable)
- Scope: `/`

### 2.7 Capacitor Config

- App ID: `hu.erek.kartoteka`
- Android/iOS hybrid app wrapper
- Splash screen (2000ms, zöld háttér)

---

## 3. Használt adatok

### IndexedDB Store-ok (19 db)

| Store | Key | Indexek | Forrás tábla |
|-------|-----|---------|-------------|
| `szemely` | id | congregation_id, meghalt | szemely |
| `csalad` | id | congregation_id | csalad |
| `befizetes` | id | congregation_id, datum, id_szemely | befizetes |
| `kiadas` | id | congregation_id, datum | kiadas |
| `munkanaplo` | id | congregation_id, idopont | munkanaplo |
| `gyulekezeti_programok` | id | congregation_id, datum | gyulekezeti_programok |
| `anyakonyv` | id | congregation_id | anyakönyv táblák |
| `iktato` | id | congregation_id | iktato |
| `leltar_tetelek` | id | congregation_id | leltar_tetelek |
| `szamadasicel` | id | sorszam | szamadasicel |
| `befizetescel` | id | — | befizetescel |
| `kiadascel` | id | — | kiadascel |
| `nevnap` | id (auto) | honap_nap (compound) | nevnap |
| `elkoltozott` | id | id_szemely | elkoltozott |
| `presbiter` | id | — | presbiter |
| `felmentes` | id | id_szemely | felmentes |
| `gyerek` | id | id_szemely, id_csalad | gyerek |
| `sync_queue` | id (auto) | table, status | (belső) |
| `meta` | key | — | (belső) |

### Szinkronizált Supabase táblák (16 db)

Referencia (congregation-független): `szamadasicel`, `befizetescel`, `kiadascel`, `nevnap`, `elkoltozott`, `presbiter`, `felmentes`, `gyerek`

Congregation-szintű: `szemely`, `csalad`, `befizetes`, `kiadas`, `munkanaplo`, `gyulekezeti_programok`, `iktato`, `leltar_tetelek`

---

## 4. Függvények listája

### Service Worker (5 db)

| Függvény | Leírás |
|----------|--------|
| `install` handler | Precache telepítése (30+ URL) |
| `activate` handler | Régi cache törlése, `clients.claim()` |
| `fetch` handler | Kérés-típus alapú routing (5 ág) |
| `cacheFirst(request, cacheName)` | Cache-ből szolgál, fallback: hálózat |
| `networkFirst(request)` | Hálózatról szolgál, fallback: cache |
| `staleWhileRevalidate(request)` | Cache-ből azonnal + háttérben frissít |

### Offline DB (14 db)

| Függvény | Leírás |
|----------|--------|
| `open()` | IndexedDB megnyitása/létrehozása |
| `put(store, record)` | Egy rekord írása/frissítése |
| `putAll(store, rows)` | Tömeges írás |
| `getAll(store)` | Összes rekord |
| `get(store, id)` | Egy rekord ID alapján |
| `delete(store, id)` | Rekord törlése |
| `query(store, indexName, value)` | Index-alapú lekérdezés |
| `count(store)` | Rekordszám |
| `clear(store)` | Store teljes törlése |
| `addToSyncQueue(entry)` | Offline mutáció sorba állítása |
| `getSyncQueue()` | Várakozó mutációk listája |
| `removeSyncEntry(id)` | Szinkronizált bejegyzés törlése |
| `setMeta(key, value)` | Metaadat írása |
| `getMeta(key)` | Metaadat olvasása |

### Offline Sync (7 db)

| Függvény | Leírás |
|----------|--------|
| `syncTable(tableDef)` | Egy tábla Supabase → IDB szinkronizálása |
| `syncAll()` | Összes tábla szinkronizálása (referencia + congregation) |
| `queueMutation(table, action, data)` | Offline mutáció sync queue-ba |
| `pushQueue()` | Várakozó mutációk push-olása Supabase-be |
| `_processSyncEntry(entry)` | Egy sync entry feldolgozása (insert/update/delete) |
| `getStatus()` | Szinkronizálási állapot (online, lastSync, pending) |
| `startBackgroundSync()` | 5 perces háttér-szinkronizálás indítása |

### Data Cache (4 db)

| Függvény | Leírás |
|----------|--------|
| `cachedQuery(key, queryFn, ttlMs)` | Lekérdezés TTL-alapú cache-eléssel + IDB fallback |
| `invalidateCache(key)` | Cache törlése (kulcs vagy teljes) |
| `invalidateCachePrefix(prefix)` | Prefix-alapú cache törlés |
| `getCacheStats()` | Cache statisztika (debug) |

### Smart Query (4 db)

| Függvény | Leírás |
|----------|--------|
| `smartQuery(table, select, filters, options)` | Online/offline átlátszó lekérdezés |
| `smartMutate(table, action, data)` | Online/offline átlátszó mutáció |
| `_networkQuery(table, select, filters, options)` | Supabase query + IDB háttérmentés |
| `_offlineQuery(table, filters, options)` | IDB kliens-oldali szűrés/rendezés |

---

## 5. Függőségek

| Könyvtár/Szolgáltatás | Modul | Használat |
|----------------------|-------|-----------|
| **IndexedDB** (böngésző API) | Offline DB | Lokális adattárolás |
| **Cache API** (böngésző API) | Service Worker | HTTP válaszok cache-elése |
| **Supabase JS** | Offline Sync, Smart Query | Szerver-oldali adatforrás |
| **navigator.onLine** | Offline Sync, Smart Query | Online/offline állapot detektálás |
| **Capacitor** | Config | Hybrid mobil app wrapper |

### Next.js-ben szükséges cserekörnyezetek

| Régi | Új (Next.js) |
|------|-------------|
| `sw.js` (kézi Service Worker) | `next-pwa` vagy `@serwist/next` |
| `manifest.json` (kézi) | `app/manifest.ts` (Next.js Metadata API) |
| `offline_db.js` (IndexedDB kézi) | Ugyanaz — böngésző API, nem függ a framework-től |
| `offline_sync.js` (globális) | React Context / zustand + Supabase SSR |
| `data_cache.js` (memória cache) | Next.js Server Component cache / React Query |
| `smart_query.js` (wrapper) | Server Actions + offline hook |
| `capacitor.config.json` | Opcionális — PWA standalone elegendő lehet |

---

## 6. Állapotkezelés

### Service Worker
| Változó | Tartalom |
|---------|----------|
| `CACHE_VERSION` | 'kartoteka-v23' — cache invalidáció |
| `STATIC_CACHE` | Statikus assetek cache neve |
| `DYNAMIC_CACHE` | Dinamikus válaszok cache neve |

### Offline DB
| Változó | Tartalom |
|---------|----------|
| `_db` | IndexedDB connection reference |
| `DB_NAME` | 'kartoteka_offline' |
| `DB_VERSION` | 1 |

### Offline Sync
| Változó | Tartalom |
|---------|----------|
| `_syncInProgress` | boolean — szinkronizálás folyamatban |
| `_lastSyncTime` | ISO timestamp — utolsó sikeres sync |
| `_bgSyncInterval` | setInterval ID — 5 perces háttér sync |

### Data Cache
| Változó | Tartalom |
|---------|----------|
| `_cache` | `{ [key]: { result, ts } }` — TTL-alapú cache |

---

## 7. UI kapcsolatok

### PWA
- **Telepítési prompt** — nincs explicit „Telepítés" gomb a régi rendszerben (a böngésző natív prompt-ja)
- **Offline banner** — nincs dedikált UI az offline állapothoz a régi rendszerben
- **App ikon** — 192×192 és 512×512 PNG, maskable
- **Splash screen** — Capacitor: 2000ms, zöld háttér

### Offline állapot
- A felhasználó **nem veszi észre** az offline/online váltást — a smart query wrapper átlátszóan kezeli
- Az `online` event visszakapcsolódáskor **automatikus szinkronizálás** indul — nincs felhasználói beavatkozás
- A sync queue **csendben feldolgozódik** — nincs progress jelzés

### Next.js-ben szükséges UI elemek
- Offline állapot indikátor (header-ben vagy toast)
- Sync állapot jelzés (pending mutációk száma)
- PWA install prompt (opcionális, de hasznos)

---

## 8. Hibakezelés

| Modul | Helyzet | Viselkedés |
|-------|---------|-----------|
| SW | Precache hiba | A Service Worker nem települ — a böngésző az előző verziót használja |
| SW | Fetch hiba (offline + nincs cache) | 503 Offline válasz (JSON vagy szöveg) |
| Offline DB | IndexedDB megnyitási hiba | `console.error`, az offline funkciók nem működnek |
| Offline Sync | Supabase szinkron hiba | `console.warn`, a tábla kihagyódik, a többi folytatódik |
| Offline Sync | Push queue hiba (egy entry) | Az entry a queue-ban marad, a többi feldolgozódik |
| Smart Query | Hálózati hiba | Automatikus IndexedDB fallback |
| Smart Mutate | Hálózati hiba | Automatikus offline mode (IDB + sync queue) |
| Data Cache | IndexedDB fallback hiba | `throw` — a hívónak kell kezelnie |

---

## 9. Rejtett működés

### Service Worker — differenciált cache stratégiák
Nem minden kérést kezel egyformán:
- Auth útvonalak **SOHA** nem cache-elődnek (biztonsági okokból)
- CDN erőforrások **cache-first** (ritkán változnak)
- JS bundle-ök **network-first** (mindig friss kód kell)
- HTML oldalak **stale-while-revalidate** (gyors betöltés + háttér-frissítés)
- Supabase REST API **network-first** (adat konzisztencia)
- Supabase Storage **stale-while-revalidate** (képek, fájlok)

### Smart Query — ideiglenes ID generálás
Offline insert esetén `temp_` prefixű ID-t generál (`temp_1704067200000_abc123`). Amikor a szinkronizálás megtörténik, a Supabase valódi UUID-t ad — de a lokális IDB-ben a temp ID marad. Ez potenciális konzisztencia-probléma: ha más modulok a temp ID-t referenciálják.

### Offline Sync — szekvenciális push
A sync queue **szekvenciálisan** dolgozódik fel (nem párhuzamosan), mert a sorrend fontos: pl. egy családot előbb létre kell hozni, mielőtt gyerekeket adunk hozzá.

### Data Cache — automatikus IDB mentés
A `cachedQuery` **háttérben** elmenti a Supabase választ IndexedDB-be is. Ez azt jelenti, hogy a cache réteg egyben az offline adatbázis feltöltője is — a felhasználónak nem kell explicit szinkronizálást kérnie.

### Capacitor — nem prioritás
A régi rendszer Capacitor-t használ Android/iOS wrapper-ként. A Next.js PWA standalone mód helyettesítheti — nem szükséges natív alkalmazás.

### Háttér szinkronizálás — 5 perces ciklus
Az `offline_sync.js` 5 percenként automatikusan futtatja a teljes szinkronizálást (ha online). Ez az oldal betöltése után 3 másodperccel indul — nem blokkolja a kezdeti renderelést.

---

## 10. Hátramaradt placeholder-ek összesítése

| Modul | Fázis | Forrás sorok | Jelenlegi állapot | Prioritás |
|-------|-------|:------------:|-------------------|:---------:|
| Pénzügy: Költségvetés | 4b | 372 | placeholder tab | Magas |
| Pénzügy: Számadás | 4b | 586 | placeholder tab | Magas |
| Pénzügy: Bank | 4c | 1183 | placeholder tab | Magas |
| Pénzügy: Belső mozgás | 4c | 278 | backend kész, UI nincs | Magas |
| Pénzügy: Nyomtatás | 4d | 956 | nem létezik | Közepes |
| Pénzügy: Audit | 4d | 484 | nem létezik | Közepes |
| Pénzügy: Kassza tab | 4d | — | placeholder tab | Közepes |
| Pénzügy: Tartozások | 4d | — | placeholder tab | Alacsony |
| Pénzügy: Monetár | 4d | — | placeholder tab | Alacsony |
| Missziós Műhely | 7 | 4332 (5 fájl) | placeholder page | Alacsony |
| Admin Import | 8 | — | placeholder tab | Közepes |
| Anyakönyv áttekintő | 5 | — | placeholder szöveg | Alacsony |
| **Összesen** | | **~8191** | | |

---

## 11. Deploy infrastruktúra állapot

| Elem | Régi rendszer | Next.js jelenlegi | Szükséges |
|------|-------------|-------------------|-----------|
| Service Worker | `sw.js` (230 sor) | Nincs | `@serwist/next` vagy `next-pwa` |
| PWA Manifest | `manifest.json` | Nincs | `app/manifest.ts` |
| Offline DB | `offline_db.js` (347 sor) | Nincs | Adaptálás (böngésző API) |
| Offline Sync | `offline_sync.js` (243 sor) | Nincs | Újratervezés (Server Actions + hook) |
| Data Cache | `data_cache.js` (101 sor) | Nincs (SC cache van) | Részben felesleges (Next.js SC) |
| Smart Query | `smart_query.js` (222 sor) | Nincs | Offline hook wrapper |
| Build | `build.js` (esbuild) | Next.js Turbopack | Kész |
| Deployment | Nincs (lokális) | Nincs | Vercel config |
| Tesztelés | Manuális (Playwright mention) | Nincs | Vitest + Playwright |
| PWA ikonok | 192+512 PNG | Nincs | Átmásolás + manifest |
| Capacitor | `capacitor.config.json` | Nincs | Opcionális (PWA elég) |
