# A-M7.9a — Befizetés write-offline (iratszám-tárca rendszer)

**Dátum:** 2026-04-25
**Wave:** A-M7 (pénzügy desktop)
**Státusz:** ✅ Kész (smoke-check zöld; SQL migrációt Endre futtatja)
**Megelőző:** A-M7.8 (offline read-cache befizetés/kiadás listához)
**Következő:** A-M7.9b (kiadás write-offline, közös infrastruktúrán) **+** A-M7.9c (konfliktus-feloldó dialog a befizetésre, a chitanța A-M7.2d2d minta szerint)

---

## Kontextus

A 2026-04-24-i 26 alfázis után az **A-M7 pénzügyi wave** összes read-flow-ja és online write-flow-ja kész volt — a hiányzó téma az **offline write** (befizetés + kiadás Készpénzes rögzítés hálózat nélkül). Endre a chitanța A-M7.2d minta szerinti megvalósítást kérte, „3-4 órás tiszta scope, egy session".

A felderítés feltárta, hogy a chitanța-minta **közvetlen átemelése nem lehetséges**:
- A chitanța-walletnek **van** szerver-oldali atomic pointer (`oblio_fiokok.chitanta_kovetkezo_szam`) + RPC (`next_chitanta_number()`, `reserve_chitanta_numbers(N)`) + UNIQUE constraint az `oblio_szamlak (sorozat, szam)`-on
- A `befizetes`/`kiadas` táblákon **nincs** sem szerver-pointer, sem UNIQUE constraint, sem atomic RPC; a `getNextReceiptNumberUseCase` regex-MAX+1, **nem concurrency-safe** (a use-case kommentje is jelzi)
- A `Database_schema.sql` ráadásul elavult lehet (Endre figyelmeztetése), így nem hagyatkozhatunk csak rá

**Választott stratégia (B opció):** szerver-pointer-rendszer (új `iratszam_pointers` tábla + RPC) + lokális SQLite wallet. Csak Készpénz. Befizetés-elsőként, kiadás A-M7.9b-ben ugyanezen az infrastruktúrán.

---

## SQL migráció

**Fő fájl:** `migration-docs/sql/2026-04-25-a-m7-9a-iratszam-pointers.sql`
**Futtató:** Endre (Supabase SQL Editor)

> **2026-04-25 friss kontextus**: az első futtatáskor az 1. BEGIN-COMMIT (iratszam_pointers + 3 RPC + RLS) sikerült, de a 2. BEGIN-COMMIT (defensive UNIQUE INDEX) **rollback-elt** valós duplikátum miatt (gyülekezet `43cff37f…`, fizetettev `2024`, iratszam `887`). Ezért a duplikáció-rendezést szétszedtük 4 lépéses külön fájlokra:
>
> - `2026-04-25-a-m7-9a-LEPES-1-DIAG.sql` — diagnosztika (csak SELECT)
> - `2026-04-25-a-m7-9a-LEPES-2A-AUTO-UJRASZAMOZAS.sql` — fiatalabb sor új iratszámra
> - `2026-04-25-a-m7-9a-LEPES-2B-AUTO-SOFT-DELETE.sql` — fiatalabb sor `deleted=true`
> - `2026-04-25-a-m7-9a-LEPES-3-UNIQUE-INDEX.sql` — UNIQUE INDEX-ek (csak miután 0 a duplikátum)
>
> A pointer-rendszer már él, a write-offline flow használható nélküle is — a defensive INDEX csak extra szerver-szintű paranoia. A régi `2026-04-25-a-m7-9a-FIX-duplikatumok.sql` ELAVULT (csak figyelmeztető üzenetet ad).

### Új objektumok

1. **`iratszam_pointers` tábla** — per (congregation × típus × év) atomic pointer:
   - `id uuid PK`, `congregation_id uuid REFERENCES congregations`, `iratszam_tipus text CHECK IN ('befizetes','kiadas')`, `ev integer`, `next_szam integer`, `updated_at timestamptz`
   - `UNIQUE (congregation_id, iratszam_tipus, ev)` — egy pointer szegmensonként
   - **RLS engedélyezve**: SELECT a `current_user_can_access_congregation()`-en, INSERT/UPDATE direkten **tiltva** (csak a SECURITY DEFINER RPC-k írhatnak)

2. **`reserve_iratszam(p_congregation_id, p_tipus, p_ev, p_count)` RPC** — N sorszám atomic előre-foglalás:
   - SECURITY DEFINER + scope-check
   - Limitek: `p_count` 1–100; `p_tipus` 'befizetes' vagy 'kiadas'
   - Return: `integer[]` (a lefoglalt sorszámok növekvő sorrendben)
   - Alulról: `bootstrap_iratszam_pointer()` helper indítja az új sorszám-szegmensek pointerét a meglévő `MAX(iratszam regex) + 1`-ből

3. **`next_iratszam(p_congregation_id, p_tipus, p_ev)` RPC** — egyetlen szám atomic foglalás (online-flow jövőbeli újraírásához). Most nem használt, az online save még a régi regex-MAX-szal megy.

4. **`bootstrap_iratszam_pointer()` privát helper** — első hozzáférés a (congregation, típus, év) hármasra; a meglévő `befizetes`/`kiadas` táblából `MAX(SUBSTRING(iratszam FROM '[0-9]+')::int) + 1`-et inicializál. Idempotens: ha már van pointer-sor, csak visszaadja a `next_szam`-ot.

5. **Defensive `UNIQUE PARTIAL INDEX`-ek** (külön tranzakcióban):
   - `uniq_befizetes_iratszam_year_congregation` ON `befizetes (congregation_id, fizetettev, iratszam) WHERE deleted=false AND irattipus ILIKE '%észpénz%' AND belso_mozgas_xkey IS NULL`
   - `uniq_kiadas_iratszam_year_congregation` ON `kiadas (congregation_id, EXTRACT(YEAR FROM datum)::int, iratszam) WHERE … (azonos szűrés)`
   - **CREATE INDEX IF NOT EXISTS** + külön tranzakció: ha duplikált adat van, az egyik index hibára fut, de a pointer-rendszer már él (a fájl elején lévő ellenőrző SELECT 0. mutatja az esetleges duplikátumokat — kézi rendezést igényel)

### Ellenőrző SELECT-ek a fájl végén

6 szakasz, futtatható formában:
- 0: duplikátum-keresés a CREATE INDEX előtt
- 1: `iratszam_pointers` tábla columns
- 2: 3 RPC SECURITY DEFINER ellenőrzés
- 3: authenticated EXECUTE jog
- 4: PARTIAL INDEX-ek létrejötte
- 5: RLS engedélyezve
- 6: smoke-test példa (manuális)

---

## Rust (apps/desktop/src-tauri)

### v14 migráció (`db.rs`)

**`iratszam_wallet_local`** — közös wallet a befizetés és kiadás között:
```sql
CREATE TABLE iratszam_wallet_local (
  id INTEGER PK AUTOINCREMENT,
  congregation_id TEXT, iratszam_tipus TEXT CHECK IN ('befizetes','kiadas'),
  ev INTEGER, szam INTEGER,
  reserved_at TEXT DEFAULT now, used INTEGER DEFAULT 0, used_at TEXT,
  used_for_local_id TEXT,                   -- audit-trail: pending-sor PK
  UNIQUE (congregation_id, iratszam_tipus, ev, szam)
);
CREATE INDEX idx_iratszam_wallet_available ON ... (congregation_id, tipus, ev, used, szam);
```

**`befizetes_pending_local`** — offline-rögzített befizetés sorok:
```sql
CREATE TABLE befizetes_pending_local (
  id TEXT PK,                               -- 'local-<uuid>'
  server_id INTEGER,                        -- pgint8, NULL amíg nincs sync
  congregation_id TEXT, xkey TEXT,
  osszeg REAL, datum TEXT, id_befizetescel INTEGER,
  id_szemely INTEGER, id_csalad INTEGER, forrasa TEXT,
  iratszam TEXT, irattipus TEXT, fizetettev INTEGER, megjegyzes TEXT,
  csalad INTEGER DEFAULT 0, is_potlas INTEGER DEFAULT 0, bankszamla_id INTEGER,
  wallet_id INTEGER,                        -- iratszam_wallet_local.id audit
  userid TEXT,
  sync_state TEXT DEFAULT 'pending' CHECK IN ('pending','synced','conflict'),
  sync_error TEXT, created_at TEXT, updated_at TEXT,
  UNIQUE (congregation_id, fizetettev, iratszam)  -- lokál-szintű duplikáció-védelem
);
+ 3 index (congregation+date, sync_state, server_id)
```

A kiadás-pending tábla az **A-M7.9b**-ben jön — a wallet már most felkészült a 'kiadas' típusra is.

### Rust commands (`db.rs` + `lib.rs`)

- **`iratszam_wallet_claim_next(congregation_id, iratszam_tipus, ev, local_id)`** — atomic SELECT MIN + UPDATE egy `BEGIN/COMMIT` blokkban (`rusqlite::Transaction`), race-mentes a párhuzamos kliens-hívásokra. Visszaadja: `Ok(Some(IratszamClaim))` vagy `Ok(None)` (üres wallet) vagy `Err(_)`.
- **`iratszam_wallet_release(wallet_id)`** — release a pool-ba, csak pre-outbox hibánál hívható.

`cargo check` 2.99s, `cargo clippy -- -D warnings` 11.22s, mindkettő tiszta.

---

## Core (`packages/core`)

### Új fájl: `finance/iratszam-wallet/refill.ts`

**`refillIratszamWalletUseCase`** — szerver-RPC + visszaad lefoglalt számokat:
- Belső validáció (zod-mentes, mint a `refillChitantaWallet`): `tipus` enum, `ev` 2000–2100, `count` 1–100
- Hívja `supabase.rpc('reserve_iratszam', { p_congregation_id, p_tipus, p_ev, p_count })`
- Hibakezelés: hálózati pattern → `offlineNotSupported: true`
- Result: `{ success: true, numbers: number[], tipus, ev }` vagy `{ success: false, error, offlineNotSupported? }`

### `finance/befizetes/save.ts` bővítés

**Új típusok:**
- `OfflineIncomeMutation` — duck-type a `@kartoteka/offline-sync.Mutation`-nal
- `LocalBefizetesRow` — a `befizetes_pending_local` sor shape-je
- `OfflineIncomeBackend` interface — 4 metódus (`claimNextIratszamNumber`, `releaseIratszamNumber`, `insertLocalBefizetes`, `enqueueMutation`)

**Új ctx mezők:** `isOnline?` + `offlineBackend?` (web-en undefined → backward-kompat, default online).

**Új result mezők:** `pending?` (true ha offline-mentve), `walletEmpty?`, `offlineNotSupported?`.

**Új helper:** `saveIncomeOfflineBranch()` — wallet-claim → insertLocal → enqueueMutation. Ha az insertLocal vagy enqueue meghiúsul: `releaseIratszamNumber()` a number visszadobására, hogy ne vesszen el. Ha az enqueue után dob: a lokál sor megmarad (sync_state='pending'), a user „Sync most"-tal újra-enqueue-olhatja.

**Offline-csak Készpénz:** `if (!/észpénz/i.test(clean.irattipus))` → `offlineNotSupported: true` magyarázattal.

**Offline-ban manuális iratszám tiltva:** `if (clean.iratszam?.trim())` → hibaüzenet a wallet-flow használatára.

---

## TauriSqliteBackend bővítés (`tauri-sqlite-backend.ts`)

7 új metódus a wallet- és pending-kezelésre:

- `insertIratszamWalletNumbers(congregation, tipus, ev, numbers[])` — szerver-RPC eredmény tárolás
- `claimNextIratszamNumber(congregation, tipus, ev, localId)` — Tauri invoke wrapper, atomic
- `releaseIratszamNumber(walletId)` — release wrapper
- `getIratszamWalletStatus(congregation, tipus, ev)` → `{ availableCount, usedCount, nextNumber, oldestReservedAt }`
- `insertLocalBefizetes(row: LocalBefizetesRow)` — INSERT a `befizetes_pending_local`-ba
- `listLocalPendingBefizetes(congregation, fizetettev)` — pending + conflict sorok listája egy évre
- `getLocalBefizetes(localId)` — egyetlen sor lekérdezése (a sync-payload újra-építéséhez)
- `markBefizetesSynced(localId, serverId)` / `markBefizetesConflict(localId, reason)` — sync-állapot átírás

A `LocalBefizetesRow` és `IratszamTipus` típusok a `@kartoteka/core` index-ből re-exportáltak.

---

## UI

### Új komponens: `components/iratszam-wallet-panel.tsx`

**`IratszamWalletPanel`** — a `ChitantaWalletPanel` (chitanta-page.tsx inline) általánosított változata:
- Props: `congregationId`, `tipus: IratszamTipus`, `ev: number`, `isOnline`, `onStatusChange?`, `refillCount?`
- Háromállapotú: üres (red), kevés (1–3, amber), rendben (≥4, indigo)
- `+10 szám` gomb csak online-módban (a refill RPC online-only)
- `RefreshCw` gomb a status újraolvasáshoz
- Lelkész-informálási alapelv: pasztorális magyar üzenetek, technikai szleng nélkül

### `pages/befizetes-page.tsx` bővítés

**`BefizetesPage` (top-level):**
- Új state `walletAvailable` (a panel `onStatusChange`-ből)
- IratszamWalletPanel beillesztve a fejléc + kategória-betöltés-hiba között
- `OfflineWarning` komponens **átírva**: két állapot — `walletAvailable > 0` (kék, informatív) vs. üres (narancs, kritikus)
- `congregationId` átadva az `IncomeForm` és `RecentIncomeSection`-nek (props-ban, hogy ne minden child külön olvassa a `getLocalOwnProfile`-ból)

**`IncomeForm`:**
- Új props: `congregationId`, `walletAvailable`
- Save-flow: `isOnline` + `offlineBackend` átadás a `saveIncomeUseCase` ctx-be; offline ágban iratszám = null (a backend-wallet adja)
- Új flag-kezelés: `walletEmpty`, `offlineNotSupported` magyar üzenetekkel
- Success-banner kibővítve: ` · Szinkronizálásra vár, a hálózatra csatlakozáskor felmegy.`
- `formDisabled` finomítva: offline + Készpénz + walletAvailable > 0 → engedélyezve

**`RecentIncomeSection`:**
- Új state `pendingRows` + `syncBusy`
- `loadPending()` → `backend.listLocalPendingBefizetes(congregation, year)` (a refresh signal-ra is fut)
- `handleSyncNow()` → `runBefizetesSyncManually()` + lista-újratöltés
- Új komponens (a fájl alján): `PendingIncomeBlock` — borostyán Card, sorok darabszám + sync_state badge, egy „Sync most" gomb a fejlécben

---

## Sync (új fájl: `lib/befizetes-write-sync.ts`)

A `chitanta-sync.ts` **direkt mintáját követi**, kivéve:
- Tábla: `befizetes` (nem `oblio_szamlak`)
- PK: int8 server-generált → a `markBefizetesSynced(pk, serverId)` Number-rel hív
- 23505 → AZONNAL conflict, üzenet utal a `uniq_befizetes_iratszam_year_congregation` PARTIAL INDEX-re

**Funkciók:**
- `pushPendingBefizetes(supabase, ignoreBackoff=false)` — egy push-kör (max 50 mutation), hibák a `result.errors`-ba
- `startBefizetesAutoSync()` — idempotens, `window.online` listener + 30s setInterval + első runOnceGuarded
- `runBefizetesSyncManually()` — `inFlight` guard-os, `ignoreBackoff=true` (a user explicit kéri)
- `getBefizetesSyncStatus()` — lokál snapshot
- `BACKOFF_MS_BY_ATTEMPT` = {1: 30s, 2: 1m, 3: 2m, 4: 5m, 5: 15m}; `MAX_ATTEMPTS = 5` után conflict

**Bekötés (`auth-gate.tsx`):**
- `startBefizetesAutoSync()` mount-kor (a `startChitantaAutoSync()` mellett)
- `runBefizetesSyncManually()` az `onAuthStateChange('SIGNED_IN')` event-ben

---

## Sync-status indicator bővítés (`components/sync-status-indicator.tsx`)

A jobb-felső sávban lévő pending-jelölő mostantól **mind a chitanță, mind a befizetés** pending sorokat mutatja:
- `Promise.all([listLocalPendingChitantas(c), listLocalPendingBefizetes(c, currentYear)])`
- Új `primaryRoute` mező: amelyik domainben több a pending+conflict, oda navigál a kattintás
- Címke általánosítva: „N tétel szinkronra vár" (korábban „chitanță")

---

## Smoke check eredmények

- ✅ `node scripts/check-desktop-banned-imports.mjs` — 44 fájl, 0 tiltott (Dexie nem szivárog desktopra)
- ✅ `npx tsc --noEmit` packages/core — tiszta
- ✅ `npx tsc --noEmit` apps/desktop — tiszta
- ✅ `cargo check` apps/desktop/src-tauri — 2.99s
- ✅ `cargo clippy -- -D warnings` apps/desktop/src-tauri — 11.22s
- ✅ Security secret-grep `grep -rE "OBLIO_|BREVO_|RESEND_|ANTHROPIC_|SUPABASE_SERVICE_ROLE" apps/desktop` — 0 találat
- ⚠ `cargo fmt --check` — meglévő (nem általam okozott) divergenciák `auth_pin.rs`, `device.rs` és `db.rs` régebbi részeiben; saját új blokkjaim fmt-konzisztensek

---

## Manuális tesztelés (Endre runs)

1. **SQL migráció**: futtasd `2026-04-25-a-m7-9a-iratszam-pointers.sql`-t a Supabase SQL Editor-ben. Ellenőrző SELECT-ek 0–6 átmegy.
2. **Iratszám-tárca feltöltés**: nyisd meg a `/penzugy/befizetes` oldalt online. A panel „+10 szám" gombbal foglalj sorszámokat. A panel zöldül (indigo).
3. **Offline rögzítés**: Dev Console → Network → Offline. Készpénzes befizetés rögzítése. Sikerbanner: „pending, szinkronizálásra vár". A pending blokk megjelenik.
4. **Online-visszatérés**: Network → Online. A pending blokk 30 mp-en belül üresül (auto-sync), vagy kattints „Sync most"-ra azonnali push-hoz. A szerver-listában megjelenik az új sor.
5. **Cross-device race teszt**: két desktop egyidejűleg ugyanazt az évre offline rögzít → mindkét push megjön → az egyik 23505-re billen, a másik conflict-szövegben jelez.
6. **Sync indicator**: jobb-felső jelölő pending-en sárga, conflict-en piros.

---

## Kockázatok / nyitott kérdések

- **Year ↔ fizetettev kettőzés**: a wallet az aktuális év-szűrőre szól, de az `IncomeForm`-ban a `fizetettev` mező eltérhet. Ha a user másik évre rögzít offline-ban, és arra nincs wallet → `walletEmpty` hibát kap. A jövőbeli polish-ban a wallet megnyithatóvá tehető több évre, vagy a fizetettev-szűrésnek wallet-évvel kell egyeznie. Most a UI ezt jelzi; a user megérti.
- **Konfliktus-feloldó dialog hiánya**: az A-M7.9c-ben jön (a chitanța A-M7.2d2d minta szerint). Most a conflict sor csak láthatóvá válik a pending-blokkban + sync_error magyarázattal. A user manuálisan: a tévedt sort megnyitja, az iratszámot kézzel átírja, majd „Sync most"-tal újra-push-olja.
- **Bank-átutalás offline-szabályozás**: most explicit tiltva (csak Készpénz). A bank-import wave (külön A-M7.10) hozza majd a banki tranzakciók delta-pull-ját és a manuális rögzítés helyettesítését.
- **fmt-divergencia a régi Rust kódban**: nem ebben a session-ben javítandó (független scope). Ajánlott jövőbeli külön taszk.

---

## Fájl-leltár

**Új fájlok:**
- `migration-docs/sql/2026-04-25-a-m7-9a-iratszam-pointers.sql`
- `packages/core/src/finance/iratszam-wallet/refill.ts`
- `apps/desktop/src/components/iratszam-wallet-panel.tsx`
- `apps/desktop/src/lib/befizetes-write-sync.ts`
- `docs/project-tracking/KARTOTEKA-A-M7-9a-befizetes-write-offline-2026-04-25.md` (ez a fájl)

**Módosított fájlok:**
- `apps/desktop/src-tauri/src/db.rs` — v14 migráció + 2 új command + IratszamClaim struct
- `apps/desktop/src-tauri/src/lib.rs` — 2 új command regisztrálva
- `packages/core/src/finance/befizetes/save.ts` — offline-ág + interfaces
- `packages/core/src/index.ts` — új type re-exportok
- `apps/desktop/src/lib/tauri-sqlite-backend.ts` — 7 új wallet/pending metódus + LocalBefizetesRow import
- `apps/desktop/src/lib/auth-gate.tsx` — startBefizetesAutoSync + runBefizetesSyncManually bekötés
- `apps/desktop/src/pages/befizetes-page.tsx` — IratszamWalletPanel + OfflineWarning + IncomeForm props + offline save + RecentIncomeSection pending-blokk + PendingIncomeBlock komponens (~250 sor új)
- `apps/desktop/src/components/sync-status-indicator.tsx` — befizetés-pending count + primaryRoute
- `docs/CHANGELOG.md` — A-M7.9a bejegyzés

---

**Következő lépés:** A-M7.9b (kiadás write-offline) — közös infrastruktúra, csak `kiadas_pending_local` Rust v15 + `saveExpenseUseCase` offline-ág + UI duplikáció a kiadás-page-en. Becsült munka: 2-3 óra (a wallet + indicator már megvan).
