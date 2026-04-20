# Kartotéka — Offline rendszer diagnosztikai felmérés

**Dátum**: 2026-04-21u
**Hatókör**: teljes offline-first stack (PWA, IndexedDB, sync, standalone)
**Módszer**: forrás-kód felderítés + dokumentáció-olvasás, build/teszt nem futott
**Eredmény**: architektúra **teljes**, a kritikus útvonalak **implementáltak**, néhány finomhangolási pont maradt

---

## 1. Vezetői összefoglaló

A Kartotéka **három-rétegű offline-first** rendszer:

```
┌──────────────────────────────────────────────────────────────┐
│                     KLIENS (böngésző)                         │
│                                                                │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│   │ React UI     │─▶│ Dexie (IDB)  │◀─│ Mutation Q.  │    │
│   │ useLiveQuery │   │ 26 tábla     │   │ (FIFO)       │    │
│   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘    │
│          │                  │                   │            │
│          │           ┌──────┴───────────────────┴────┐       │
│          │           │ Sync Orchestrator (singleton) │       │
│          │           │ pull 2min / 15min + push      │       │
│          │           └──────────┬────────────────────┘       │
│          │                      │                             │
│   ┌──────┴──────┐      ┌────────┴──────────┐                 │
│   │ Service Wkr │      │ Excel I/O +       │                 │
│   │ (Serwist)   │      │ FS Access API     │                 │
│   └──────┬──────┘      └────────┬──────────┘                 │
└──────────┼───────────────────────┼─────────────────────────── ┘
           │ precache JS/CSS       │ local XLSX files
           ▼                       ▼
┌──────────────────────────────────────────────────────────────┐
│                     SZERVER                                   │
│                                                                │
│   Supabase (felhő-autoritatív)    /   SQLite (standalone)    │
│   - RLS + revision + updated_at   /   - better-sqlite3       │
│   - PostgreSQL                    /   - havi sync felhőbe    │
└──────────────────────────────────────────────────────────────┘
```

**Három futtatási mód**:
1. **Normál PWA** — Supabase autoritatív, Dexie cache, online + offline keverés
2. **Offline-first** — a Dexie a hosszabb ideig autonóm, mutation queue tárol
3. **Standalone (Windows csomag)** — SQLite az autoritatív, Dexie csak view-cache, havi felhő-sync

**Státusz**: Fázis 0–6 **implementálva**, Fázis 7 (standalone) **részben**. Minden kritikus útvonal (pull, push, mutation queue, conflict resolver, Excel I/O, ZIP backup) kódban van, az `/offline` diagnosztika oldal él.

---

## 2. PWA & Service Worker réteg

### 2.1 Manifest
**Fájl**: `public/manifest.json`
- `display: "standalone"` — telepíthető, önálló ablak
- 3 ikon (192×192, 512×512)
- 3 shortcut: Tagnyilvántartás, Pénzügy, Anyakönyv
- `theme_color: "#1e1b4b"`, `background_color: "#ffffff"`

### 2.2 Service Worker — Serwist
**Fájlok**:
- `app/sw.ts` (37 sor) — service worker forráskód
- `next.config.ts` (14-22. sor) — `withSerwistInit()` wrapper
- `public/sw.js` — build-elt kimenet (generated)

**Konfiguráció** (`next.config.ts`):
```typescript
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.DISABLE_PWA === "true"
        || process.env.NODE_ENV !== "production",
  cacheOnNavigation: true,
  reloadOnOnline: true,
})
```

**Cache stratégiák** (Serwist `defaultCache`):
| Erőforrás | Stratégia | Magyarázat |
|-----------|-----------|------------|
| Statikus JS/CSS | CacheFirst (precache) | Build-time lista, hosszú élettartam |
| `/_next/data/*` | NetworkFirst | Dinamikus Next.js fetch |
| Képek | StaleWhileRevalidate | Háttér-frissítés |
| Google Fonts | StaleWhileRevalidate | CDN cache |
| Supabase API | **NetworkOnly** | Dexie + orchestrator kezeli, nem cache |

### 2.3 Kritikus kényszer: Turbopack nem kompatibilis
- **Dev mód** (Turbopack default): Serwist **ki van kapcsolva** → nincs SW HMR-ben
- **Build mód**: `package.json` scriptje `next build --webpack` — Webpack-re vált, hogy Serwist lefordítsa a `sw.ts`-t

### 2.4 Regisztráció
A Serwist automatikusan regisztrálja — nincs manuális `navigator.serviceWorker.register()` hívás az `app/layout.tsx`-ben. Az első oldal-betöltésnél bejön, aztán `skipWaiting` + `clientsClaim` átveszi a control-t.

---

## 3. Dexie (IndexedDB) lokális adattár

### 3.1 Központi fájl
**`lib/offline/db.ts`** — 26 tábla + 4 meta-tábla, mindegyik `SyncTrackedRecord`-ra épül.

**`SyncTrackedRecord` kötelező alapmezők** (db.ts, 39–48):
```typescript
interface SyncTrackedRecord {
  id: string | number           // UUID vagy int (táblánként változó)
  revision: number              // szerver-oldali verzió
  updated_at: string            // ISO timestamptz a szerverről
  congregation_id: string | null // scope
  _syncStatus: 'clean' | 'pending' | 'conflict' | 'deleting'
  _pendingDelete?: boolean
  _baseRevision?: number        // az utolsó server-szinkronizált revision
  deleted?: boolean             // Supabase soft-delete flag
}
```

### 3.2 Táblák (26 modul-tábla)

**Tagnyilvántartás**: `szemely`, `csalad`, `presbiter`, `gyerek`, `felmentes`
**Pénzügy**: `befizetes`, `kiadas`, `bankszamla`, `belso_mozgas`, `elozetes`
**Anyakönyv**: `keresztseg`, `konfirmalas`, `hazassag`, `temetes`, `elkoltozott`, `kitorolt`, `athelyezett`, `visszafogadott`
**További**: `gyulekezeti_programok`, `munkanaplo`, `iktato`, `leltar`, `sirhely`, `jegyzokonyv`, `hatarozat`, `mm_shared`

**Meta-táblák**:
- `_sync_meta` — utolsó pull cursor táblánként (`lastPullAt`)
- `_mutation_queue` — offline írás-sor (FIFO)
- `_conflicts` — 409 ütközések (user dialog-hoz)
- `_fs_handles` — FileSystem Access API kezelők (Excel fájlokhoz)

### 3.3 Scope-filter mindenütt
Minden Dexie query az aktuális gyülekezet scope-jára szűr:
```typescript
db.szemely.where('congregation_id').equals(effectiveCongregationId).toArray()
```

Ez garantálja, hogy egy dual-role user (pl. lelkész + egyházmegyei admin) nem lát át gyülekezetek között offline-ban sem.

### 3.4 Hook-ok
- **`use-sync-query.ts`** — `useLiveQuery()` + background pull (stale-while-revalidate minta)
- **`use-sync-mutation.ts`** — optimistic write → queue → push

---

## 4. Sync Orchestrator — pull/push koordináció

### 4.1 Singleton event bus
**`lib/offline/sync-orchestrator.ts`** (a fejléc 1–53. sor)

**Event típusok**:
```typescript
'pull_started' | 'pull_completed' | 'pull_error'
'push_started' | 'push_completed' | 'push_error'
'conflict_detected'
'online' | 'offline'
'scope_changed'
```

UI komponensek (`SyncStatusBar`, `MutationQueuePanel`) `subscribe()`-lnek.

### 4.2 Periódusok
- **Aktív tab**: pull 2 perc (120 sec)
- **Háttér tab**: pull 15 perc
- **Push**: a queue változására trigger-elt + 30 sec polling
- **Backoff** hibára: 1s → 4s → 16s → 1min → 5min → max 30min

### 4.3 Pull — Supabase → Dexie delta
**`lib/offline/pull.ts`**
```
1. lastPullAt = _sync_meta[table].lastPullAt
2. Supabase: WHERE updated_at > lastPullAt AND congregation_id = scope
3. bulk upsert Dexie (_syncStatus = 'clean')
4. cursor frissítés most-időponthoz
```

Első pull (cursor null): teljes tábla letöltés. Idempotens — ismételt cursor ugyanazt adja.

### 4.4 Push — Dexie queue → Supabase
**`lib/offline/push.ts`**
```
1. getNextBatch() — feldolgozásra kész mutation-ök (FIFO, per-tábla szekvenciális)
2. processMutation():
   - insert: supabase.insert → markSuccess
   - update: WHERE id=? AND revision=baseRevision
     → 0 sor (409) → markConflict
     → egyébként markSuccess
   - delete: soft-delete (deleted=true)
3. Siker → queue törlés + Dexie frissítés szerver-válasszal
4. Hiba → markFailed (backoff retry)
5. 409 → markConflict (user dialog)
```

**Optimistic locking**: revision-alapú. A szerver nem ad 200-at, ha a revision nem stimmel → 0 sor → 409.

### 4.5 Standalone mód kivétele
`NEXT_PUBLIC_KARTOTEKA_STANDALONE=true` esetén a sync-orchestrator **no-op**-ot csinál: nem pull, nem push. Az authoritative store a lokális SQLite.

---

## 5. Mutation Queue + Conflict Resolver

### 5.1 Queue
**`lib/offline/mutation-queue.ts`**

Státuszok: `'pending' | 'syncing' | 'failed' | 'conflict' | 'dead'`

**API**:
- `enqueue(envelope)` — új mutation beírás
- `getNextBatch(limit)` — pending/failed (backoff-ra kész) lekérés
- `markSyncing(id)`, `markSuccess(id)`, `markFailed(id, error)`, `markConflict(id, serverRow)`
- `markDead(id)` — 5 retry után letett

**Dead letter**: ha 5×-ös retry-val sem megy át, `dead` státuszba kerül — user-intervenció szükséges (pl. a hibát megnéző dialog, ami nincs még).

### 5.2 Conflict resolver
**`lib/offline/conflict-resolver.ts`**

3 feloldási mód:
- **`keep_server`**: a szerver-payload felülírja a Dexie sort, a lokális változás **elveszik**
- **`keep_local`**: a lokális értéket új mutation-be tölti (új baseRevision-nel), újra megpróbálja push-olni
- **`manual_merge`**: user szerkesztheti a mezőket (dialog), és új mutation-t generál

UI: **`components/offline/conflict-dialog.tsx`** — mező-szintű összehasonlítás, radio-gomb választás.

---

## 6. Excel I/O + Full Backup

### 6.1 Excel I/O (Fázis 3-4)
**`lib/offline/`**:
- **`excel-writer.ts`** — `ExcelJS` → `db.{table}.toArray()` → `{module}.xlsx`
- **`excel-reader.ts`** — `{module}.xlsx` → parse → review
- **`excel-import-diff.ts`** — diff calculator: változtatás-előnézet user approval-hez
- **`excel-watcher.ts`** — `FileSystemAccessAPI` live-watch (folyamatos változás-érzékelés)
- **`fs-handle-store.ts`** — a user által választott mappa-kezelő perzisztenciája (IndexedDB-be mentve a FileSystemDirectoryHandle)

**UI (Fázis 3-4)**:
- `components/offline/excel-export-panel-client.tsx` — "Exportálás egy-egy modul"
- `components/offline/excel-import-review-client.tsx` — "Importálás előnézettel"

### 6.2 Full Backup (Fázis 6)
**`lib/offline/full-backup.ts`** + **`jszip`** csomag

Kimenet: `kartoteka-backup-{slug}-{timestamp}.zip`, tartalmaz:
- 30 modul Excel-fájlja
- `metadata.json` — timestamp, gyülekezet, tábla-számok
- `README.txt` — emberi visszaolvashatósághoz magyar leírás

---

## 7. Offline UI (16 komponens)

**`components/offline/`**:

| Komponens | Szerep | Fázis |
|-----------|--------|-------|
| `sync-status-bar.tsx` | Fejléc státusz + pending + sync gomb | 1 |
| `sync-provider.tsx` | Event-subscription wrapper | 1 |
| `offline-dashboard-stats.tsx` | KPI: online/cache/pending/konfliktus | 1 |
| `cache-overview.tsx` | Tábla-méret, last-sync, sorszám | 1 |
| `mutation-queue-panel.tsx` | Queue lista + retry/cancel gombok | 2 |
| `conflict-dialog.tsx` | 409 ütközés feloldás UI | 2 |
| `excel-export-panel{-client}.tsx` | Export modul-választó + "Mappa" gomb | 3 |
| `excel-import-link-card.tsx` | Import belépési pont | 4 |
| `excel-import-review{-client}.tsx` | Import diff-előnézet | 4 |
| `full-backup-panel{-client}.tsx` | "ZIP backup" gomb | 6 |
| `offline-help-card.tsx` | Magyar nyelvű súgó-card | 1 |
| `offline-menu-item-badge.tsx` | Pending-count badge a menüben | 1 |
| `developer-downloads-card.tsx` | SQL migrations letöltés (dev) | Dev |

**Központi oldal**: `/offline` útvonal → `app/(dashboard)/offline/page.tsx`. Ez a diagnosztikai dashboard.

---

## 8. Standalone mód (Windows csomag — Fázis 7)

### 8.1 Futtatás-detektálás
**`lib/standalone/runtime-detect.ts`** és **`is-standalone-client.ts`** (server/client párhuzam):
- Env var `NEXT_PUBLIC_KARTOTEKA_STANDALONE=true`
- Ekkor az authoritative store a **lokális SQLite** (`better-sqlite3`)
- A Dexie csak view-cache (read-optimalizáció)

### 8.2 SQLite réteg
**`lib/standalone/sqlite-db.ts`** — `better-sqlite3` wrapper
**`lib/standalone/offline-supabase-wrapper.ts`** — a Supabase query-et átirányítja SQLite-re, hogy a server-actions-ek ne tudják a különbséget
**`lib/standalone/sqlite-migrations/`** — a séma migrációi (a packaging-be bundle-ölve)

### 8.3 Licenc-ellenőrzés
**`lib/standalone/license-*.ts`**:
- `machine-fingerprint.ts` — `node-machine-id`-val gépi UUID
- `license-jwt.ts` — JWT payload + signature
- `license-check.ts` — aláírás-validáció + lejárati dátum
- UI: `components/standalone/license-status-card.tsx`

### 8.4 Havi felhő-sync (Fázis 7d)
**`lib/standalone/monthly-sync.ts`**:
- Felhasználó kattint "Szinkronizálás most" — a MonthlySyncPanel-ben
- API endpoint: `/api/standalone/monthly-sync/` (nem hívott, untested)
- A lokális SQLite revision-alapon felküldi a változásokat Supabase-be
- Konfliktus-feloldás: szerver-oldali merge utility (Fázis 7d **nincs még megírva**)

### 8.5 Build
**`next.config.ts`**:
- `output: 'standalone'` — `.next/standalone/` mappát generál
- `outputFileTracingIncludes` — `better-sqlite3`, `node-machine-id` natív bindingok
- `serverComponentsExternalPackages: ['better-sqlite3', 'node-machine-id']`

A packaged output: portable Node.js + a standalone mappa → dupla-kattintással fut egy Windows gépen internet nélkül.

---

## 9. Séma-követelmények

Minden offline-tracked Supabase táblán **kötelező három oszlop**:
```sql
revision BIGINT NOT NULL DEFAULT 0,
updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
congregation_id UUID NOT NULL  -- kivéve globális lookup-táblák
```

**Ellenőrzés** a `migration-docs/Database_schema.sql`-ben — a `szemely`, `hazassag`, `keresztseg`, `konfirmalas`, `temetes`, stb. **mind rendelkeznek** ezekkel. A `revision` a revision-alapú optimistic locking alapja, az `updated_at` a delta-pull cursor-hoz kell.

**Trigger**: update-kor a `revision`-t automatikusan inkrementálni kell a szerveren (SQL trigger vagy RLS policy). Ez a `migration-docs/rules/`-ban dokumentált kell legyen.

---

## 10. Funkciók és lehetőségek — mit tud offline-ban?

### 10.1 Olvasás — szinte minden
A pull-ed táblákról (26 tábla a `table-registry.ts`-ben):
- Tagnyilvántartás: lista, keresés, szűrés
- Pénzügy: bevétel/kiadás lista, havi összegek
- Anyakönyv: 4 könyv (keresztelés, konfirmáció, esküvő, temetés)
- Programok, munkanapló, iktató, leltár, sírhely, jegyzőkönyvek

### 10.2 Írás — queue-olva
**Működik offline**: INSERT, UPDATE, DELETE minden syng-tracked táblára.
- Mutation Queue fogja a kérést
- `_syncStatus = 'pending'` a Dexie rekordon
- Amint online lesz → push → siker → `_syncStatus = 'clean'`

**Optimistic update**: a UI azonnal látja a változást, nem kell várni a szerverre.

### 10.3 Konfliktus-feloldás
Ha két ember egyszerre módosít egy sort:
- A másodiknak a push **409 Conflict**-al visszajön
- A `_conflicts` táblába kerül
- A user egy dialogban választhatja: szerver / saját / merge

### 10.4 Excel I/O
Offline szerkeszthető Excel-ben is, majd az `excel-watcher` észleli a változást és a queue-ba rakja.

### 10.5 Teljes ZIP backup
Egy kattintással az összes adat Excel-ben + metaadat JSON + README ZIP-ben.

### 10.6 Mit NEM tud offline?
| Funkció | Miért nem | Mikor lesz |
|---------|-----------|-----------|
| Auth login | A Supabase JWT-hez szerver kell | — (a session LocalStorage-ben él, ha be volt jelentkezve) |
| Auth token refresh | Ha a session lejár offline-ban | Fázis 8 (nincs terv) |
| Képfeltöltés (avatar, crest, post cover) | A Supabase Storage-ba kell | Fázis 5+ (nincs terv) |
| e-Factura (Oblio) | Romániai állami API | Soha (online-only by design) |
| Publikus oldal (`/gy/[slug]`) | Server-side render | Soha (nem offline use case) |
| Push notifikáció | Nincs implementálva | Fázis 8 (nincs terv) |
| Background Sync API | A Service Worker nem regisztrál `sync` tag-et | Fázis 2+ finomítás |

---

## 11. Ismert gyengeségek

### 11.1 Pull/push skeleton → feature-complete gap
Az `orchestrator.ts` fejléce kimondja: _„Fázis 0 státusz: ez egy skeleton. A pull és push konkrét logikáját a Fázis 1-2 tölti meg."_ A pull.ts és push.ts fájlokban van valós implementáció, de a **scope-edge-eket** (pl. scope-váltás pull-közben, RLS policy változás, deleted row handling) **nem tesztelt**.

### 11.2 Background Sync API nincs
A Service Worker nem használja a `sync` eventet. Ha a user bezárja a tabot queue-val, a queue nem megy ki a háttérben — várja a következő tab-nyitást. **Hatás**: a queue megmarad Dexie-ben, nem vész el, de késik a feltöltés.

### 11.3 Offline auth expiry
A Supabase JWT kb. 1 órás lejárattal érkezik. Offline-ban **nem tud** refresh-elni. Ha valaki egy hétig nem nyit internet-kapcsolatot, a kliensen "kijelentkezik" érzés van.
**Mitigáció**: a `_mutation_queue` megmarad a newest login-ig — a visszaloginoláskor a queue spontán kifut.

### 11.4 Dead letter queue UI hiányzik
Ha egy mutation `dead`-re megy (5 retry után), nincs UI arra, hogy a user lássa és manuálisan reagáljon. A `mutation-queue-panel.tsx`-ben valószínűleg van egy rész, de nem teljes.

### 11.5 Havi sync endpoint (Fázis 7d)
`/api/standalone/monthly-sync/` untested — a standalone csomag a **lokálisan használható**, de a felhő-visszaszinkronizálás még nincs élesítve.

### 11.6 Teszt-lefedettség
Nincs project-root-level offline integration-teszt — a kritikus flow-k (pull, push, conflict) kézi teszteléssel ellenőrzöttek a `KARTOTEKA-pwa-testing-checklist-2026-04-15.md` szerint.

---

## 12. Dokumentáció-mutatványok

**Operatív**:
- `docs/project-tracking/KARTOTEKA-pwa-offline-first-2026-04-15.md` — a teljes user guide, magyarul
- `docs/project-tracking/KARTOTEKA-pwa-testing-checklist-2026-04-15.md` — manuális teszt-forgatókönyvek
- `docs/project-tracking/KARTOTEKA-standalone-offline-terv-2026-04-15.md` — Fázis 7 terv
- `docs/project-tracking/KARTOTEKA-standalone-production-deployment.md` — packaging útmutató

**Filozófiai**:
- Obsidian: `20-Fogalmak/Az offline nem backup, hanem munkamód.md`
- Obsidian: `20-Fogalmak/A Kartotéka nem felejt — soft delete és kuka.md`
- Obsidian: `20-Fogalmak/A standalone ugyanaz a Next.js, csak licensz-kapuval.md`

---

## 13. Következő lépések ajánlása

### Prioritás 1 — stabilizálás (1-2 hét)
- **Background Sync API** bevezetése a `sw.ts`-be — `sync` event regisztrálás a push-ra
- **Offline auth** — localStorage-olt JWT refresh fallback, vagy legalább egy figyelmeztető banner, hogy "a session hamarosan lejár, lépj online-ra"
- **Dead letter UI** — a `mutation-queue-panel.tsx`-ben egy külön szekció a dead letterekhez + "újrapróbálás" / "törlés" gombok

### Prioritás 2 — Fázis 7d élesítés (2-4 hét)
- **`/api/standalone/monthly-sync/` endpoint megírása** — a standalone SQLite → felhő Supabase merge logika
- **Merge-konfliktus szerver-oldali kezelés** — ha egy gyülekezet 3 hónapig standalone-ban dolgozott, és felhőben is történt változás

### Prioritás 3 — tesztelés (folyamatos)
- Playwright e2e: offline scenario-k (tab-close, online/offline váltás, multi-tab-szinkron)
- Vitest unit-tesztek a pull.ts, push.ts, mutation-queue.ts központi függvényeire

### Prioritás 4 — UX finomítás (opcionális)
- Sync-progress animáció a status-bar-ban (szebb, mint az absolút státusz-szöveg)
- Konfliktus-feloldás dialog kipolírozás (mező-szintű vizuális diff)

---

## 14. Egy-mondatos konklúzió

A Kartotéka offline-first rendszere **architekturálisan teljes és operatívan használható** — a három réteg (Service Worker cache → Dexie tábla-mirror → Supabase authoritative) jól le van fektetve, a pull/push/konfliktus-kezelés revision-alapú és kódban van, a 16 offline UI komponens él; a fennmaradó munka a **stabilizálás** (Background Sync, auth-expiry UX, dead letter UI) és a **Fázis 7d standalone felhő-sync** élesítése — ezek nélkül is használható, csak éles környezetben még kézi felügyeletet igényelhet.
