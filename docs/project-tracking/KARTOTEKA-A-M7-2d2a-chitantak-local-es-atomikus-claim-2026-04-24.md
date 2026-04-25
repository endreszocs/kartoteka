# A-M7.2d2a — `chitantak_local` tábla + atomikus wallet-szám fogyasztás

**Dátum:** 2026-04-24
**Scope:** desktop offline-kiállítás alapok — Rust v11 migráció, atomikus `chitanta_wallet_claim_next` command, TS wrapperek
**Státusz:** ✅ kész
**Kapcsolódó fázisok:** A-M7.2d1 (wallet-infra), A-M7.2d2b (köv: `issueChitantaUseCase` offline-ág + desktop form)

---

## 1. Miért?

Az A-M7.2d1-ben a **szám-tárca** (`chitanta_wallet_local`) létrejött — a lelkész online-módban előre-foglalhat 10-10 sorszámot. A következő lépés az **offline chitanța-kiállítás** logika, amihez kell:

1. Egy **lokális tárhely** a még-nem-sync-elt chitanțáknak — `chitantak_local` SQLite tábla
2. Egy **atomikus művelet** a wallet-ből: "vedd ki a következő szabad számot, jelöld használtnak" — race-mentesen
3. **Release-út**: ha a kiállítás félúton elbukik (pl. validációs hiba a form-on), a szám visszakerüljön a pool-ba

Ez az A-M7.2d2a szállítja — a kiállítási flow (`issueChitantaUseCase` offline-ág + desktop form) az A-M7.2d2b-ben jön.

---

## 2. Mi változott?

### 2.1 Rust v11 migráció — `chitantak_local`

**Fájl:** `apps/desktop/src-tauri/src/db.rs` (új `if current < 11` blokk)

```sql
CREATE TABLE IF NOT EXISTS chitantak_local (
  id              TEXT PRIMARY KEY,   -- 'local-<uuid>'
  server_id       TEXT,               -- uuid, NULL amíg nincs sync
  congregation_id TEXT NOT NULL,
  sorozat         TEXT NOT NULL,
  szam            INTEGER NOT NULL,
  szamla_datum    TEXT NOT NULL,      -- ISO 'YYYY-MM-DD'
  klienesseg_nev  TEXT NOT NULL,
  klienesseg_cui  TEXT,
  klienesseg_cim  TEXT,
  osszeg_brut     REAL NOT NULL,
  reprezentand    TEXT,
  befizetes_id    TEXT,               -- uuid | NULL
  megjegyzes      TEXT,
  issued_by       TEXT NOT NULL,      -- user uuid
  collected_at    TEXT NOT NULL,      -- ISO timestamp
  sync_state      TEXT NOT NULL DEFAULT 'pending'
                    CHECK (sync_state IN ('pending','synced','conflict')),
  sync_error      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (congregation_id, sorozat, szam)
);

CREATE INDEX idx_chitantak_local_congregation_date
  ON chitantak_local(congregation_id, szamla_datum DESC);
CREATE INDEX idx_chitantak_local_sync_state
  ON chitantak_local(sync_state, created_at);
CREATE INDEX idx_chitantak_local_server_id
  ON chitantak_local(server_id);

PRAGMA user_version = 11;
```

**Tervezési döntések:**
- **TEXT PK `local-<uuid>`** — a szerver-oldali `oblio_szamlak` UUID-t ad, de azt csak a sync után kapjuk. Addig egy **kliens-generált ID** azonosít. A `server_id` mezőbe kerül a szerver-UUID a push sikerelteszi után.
- **UNIQUE (congregation_id, sorozat, szam)** — a wallet már garantálja, hogy a szám nem ütközik, de a chitanta-oldali unique-constraint egy második védelmi réteg (pl. ha a user manuálisan overrride-olja a számot).
- **`sync_state` enum** — `pending` / `synced` / `conflict`. A `conflict` eset az A-M7.2d2c-ben jön teljesen kidolgozva (user-dönti hogy újra-sorszámoztatja vagy törli).
- **3 index:**
  - `(congregation_id, szamla_datum DESC)` → a chitanta-lista lekérdezése
  - `(sync_state, created_at)` → az outbox-pusher lekér a `pending`-ekre
  - `(server_id)` → a server-oldali pull-ok a már sync-elt sorokra mapelhetők

### 2.2 Rust command — `chitanta_wallet_claim_next`

**Fájl:** `apps/desktop/src-tauri/src/db.rs` (új szekció)

```rust
#[tauri::command]
pub fn chitanta_wallet_claim_next(
    state: State<'_, DbState>,
    congregation_id: String,
    sorozat: Option<String>,
    chitanta_local_id: String,
) -> Result<Option<WalletClaim>, String> {
    // BEGIN tranzakció (rusqlite::Transaction)
    // 1) SELECT id, szam, sorozat FROM chitanta_wallet_local
    //    WHERE congregation_id = ?1 AND used = 0 [AND sorozat = ?2]
    //    ORDER BY szam ASC LIMIT 1
    // 2) Ha nincs sor → rollback + Ok(None)
    // 3) UPDATE used = 1, used_at = now(), used_for_chitanta_local_id = ?chitanta_local_id
    //    WHERE id = ?row_id
    // 4) COMMIT → Ok(Some(WalletClaim))
}
```

**Miért Rust-oldali command, nem több TS-invoke?**

A TS-oldalon 2 külön `dbExecute` hívással (SELECT + UPDATE) a két utasítás **nem egy tranzakció** — a `Mutex<Connection>` minden invoke-nál elenged, és egy másik kliens-kérés közbeékelődhet. Egy tipikus valós scenario: a user véletlen duplán-kattint a "Kiállít" gombon → két claim ugyanarra a számra.

A Rust-oldalon a `rusqlite::Transaction` explicit `BEGIN/COMMIT`-et ad, amíg a `Mutex` fogva van — atomikus.

**Release-command (`chitanta_wallet_release`):**

```rust
#[tauri::command]
pub fn chitanta_wallet_release(
    state: State<'_, DbState>,
    wallet_id: i64,
) -> Result<(), String> {
    // UPDATE chitanta_wallet_local
    // SET used = 0, used_at = NULL, used_for_chitanta_local_id = NULL
    // WHERE id = ?1
}
```

Csak akkor hívjuk, ha a claim után **még az outbox-ra kerülés előtt** meghiúsul a kiállítás (pl. zod validáció). Az outbox-ba került mutation-ök már nem release-elhetők — azokat a sync-konfliktus-UX kezeli.

### 2.3 TS wrapper — `TauriSqliteBackend` bővítés

**Fájl:** `apps/desktop/src/lib/tauri-sqlite-backend.ts`

Új import: `import { invoke } from '@tauri-apps/api/core'` (már más 4 lib-file-ban is ez a minta)

Új metódusok:

```ts
async claimNextWalletNumber(
  congregationId: string,
  sorozat: string | null,
  chitantaLocalId: string,
): Promise<{ id: number; szam: number; sorozat: string } | null>

async releaseWalletNumber(walletId: number): Promise<void>
```

Szándékosan **nem** a `dbExecute/dbSelect` útvonalon mennek — a Rust-tranzakciós command közvetlen `invoke`-ja a garancia az atomicitásra.

### 2.4 `lib.rs` regisztráció

```rust
use db::{
    chitanta_wallet_claim_next, chitanta_wallet_release, db_execute, db_select, db_status,
    open_and_migrate, DbState,
};
// ...
.invoke_handler(tauri::generate_handler![
    greet, db_execute, db_select, db_status, device_info,
    auth_store_item, auth_read_item, auth_clear_item,
    auth_pin_has, auth_pin_set, auth_pin_verify, auth_pin_clear, auth_pin_status,
    chitanta_wallet_claim_next,
    chitanta_wallet_release
])
```

---

## 3. Verifikáció

| Check | Eredmény |
|---|---|
| `cargo check` | ✅ 1.77s (tisztán) |
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `npx tsc --noEmit` (packages/core) | ✅ 0 error (nincs core-érintés) |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ 31 fájl, 0 tiltott |
| v11 migráció a `user_version` ladder-ben | ✅ (sorrendi pozíció: a v10 után) |

---

## 4. Mi marad hátra (A-M7.2d2b — következő)

- [ ] **Core `issueChitantaUseCase` offline-ág bevezetése:**
  - Új ctx-mező: `backend?: OfflineChitantaBackend` (ha jelen van + `!online` → offline-ág)
  - Az `OfflineChitantaBackend` egy minimális interface: `claimNextWalletNumber`, `insertLocalChitanta`, `enqueueMutation` — csak azokat a metódusokat, amiket a use-case használ (ne kösse magához a teljes `TauriSqliteBackend`-et)
  - Offline ágon: claim → lokális insert → outbox-mutation → return `{ success: true, chitantaId: local-ID, szam, sorozat, pending: true }`
  - Eredmény-típus bővítés: `pending?: boolean` flag a hívónak
- [ ] **Desktop chitanta-form integráció:**
  - `!isOnline` esetén a "szám" mező read-only + a `nextNumber` jön a wallet-ből
  - Sikeres offline-kiállítás: "A chitanța helyileg rögzítve — online-módban automatikusan feltöltjük a szerverre." üzenet
  - A `RecentChitantasSection` bővítése: lokális chitanțák megjelenítése `🕓 Várakozik szinkronra` címkével
- [ ] **Outbox-push flow** (A-M7.2d2c):
  - Háttér-task vagy manuális "Sync most" gomb
  - `getPendingMutations` olvassa az outbox-ból → `oblio_szamlak.insert` hívás
  - Siker: `markChitantaSynced(localId, serverId)` + `removeMutation`
  - Sikertelenség: `updateMutationAttempt` retry-counterrel; 5 kísérlet után `conflict`
- [ ] **Konfliktus-UX** (A-M7.2d2d):
  - Modal: "A 204. sorszám már létezik a szerveren — válassz másik számot vagy töröld ezt a lokális chitantát"

---

## 5. Biztonsági megfontolások

1. **Tranzakciós védelem** — a claim-lock a `Mutex<Connection>` + SQL `BEGIN/COMMIT` kombinációval sorosít. Kétszeres kattintás esetén a második invoke várakozik az elsőre, ami már átírta a rekord `used` flag-jét → a második SELECT nem találja meg ugyanazt.
2. **RLS nem érintett** — a chitantak_local kliens-oldali, a sync után a szerver-oldali RLS kezeli (A-M7.2b óta létező `oblio_szamlak` RLS).
3. **Release csak pre-outbox** — az `outbox` rekordok `mutation_id`-val rendelkeznek, onnantól a konfliktus-UX hivatott a rendbe-rakásért. A release a "még nem mentünk ki" esetre.

---

## 6. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — egyelőre NEM kerül be user-facing bejegyzés: az A-M7.2d2a **kizárólag backend-infra**, a user nem lát semmit belőle. A CHANGELOG-ba az A-M7.2d2b kerül, amikor a form valóban offline-módban működik.
3. **Obsidian AGY** — egyelőre atomic note nélkül; az A-M7.2d2 teljes kör (d2a+d2b+d2c+d2d) egy jegyzetben lesz, ha a flow éles.
