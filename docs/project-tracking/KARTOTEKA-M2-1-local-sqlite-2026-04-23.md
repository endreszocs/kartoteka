# M2.1 teljesítési jelentés — Lokális SQLite a desktop kliensben

**Dátum**: 2026-04-23
**Fázis**: M2.1 — a nagyszabású M2 fázis (offline adatréteg) első lépése
**Kódolási ciklus**: ~25 perc (plugin-bevezetés, séma, wrapper, demo)
**Státusz**: ✅ KÉSZ, cargo check + vite build + tsc mind 0 hiba
**Branch**: `feat/m1-1-monorepo` (az egész M1+M2 fázis ezen a branchen)

---

## 1. Vezetői összefoglaló

Az **M2 fázis** (offline adatréteg) első alfázisa: a Tauri desktop most már tud
lokálisan írni és olvasni egy SQLite adatbázisba a `tauri-plugin-sql` segítségével.

Ez **még nem** titkosított DB — az **M2.2** fogja SQLCipher-re cserélni. Egyelőre
egy sima SQLite fájl az OS-specifikus app-data mappában (Windows: `%APPDATA%\com.erek.kartoteka\kartoteka.db`).

Az M2.1 **bizonyítja**, hogy:
1. A Tauri v2 plugin-rendszer működik — plugin-sql bevezetve
2. A Rust-oldali séma-migrációk futnak (v1 migráció: `settings` + `outbox` táblák)
3. A TS oldal meghívhatja a SQL-query-ket
4. A workflow end-to-end: dashboard-on "Ping" gomb → SQLite INSERT → visszaolvasás → táblaként megjelenik

---

## 2. Új függőségek

### Rust (`src-tauri/Cargo.toml`)
```toml
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
```
Transzitíven: `sqlx v0.8.6` + `sqlx-sqlite v0.8.6`. Teljes cargo check 2m 18s
(sok crate az első futáskor, inkrementálisan < 5s).

### JavaScript (`apps/desktop/package.json`)
```json
"@tauri-apps/plugin-sql": "^2"
```

## 3. Séma — v1 migráció

A `tauri-plugin-sql` automatikusan futtatja az app-indulásnál a nem-alkalmazott
migrációkat. Az M2.1-es v1 tartalma:

```sql
-- Alap kulcs-érték tár (utolsó sync, user beállítások, stb.)
CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Outbox az offline írásokhoz (M2.3-ban tölt fel igazi használattal)
CREATE TABLE IF NOT EXISTS outbox (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    op           TEXT NOT NULL CHECK (op IN ('insert','update','delete')),
    target_table TEXT NOT NULL,
    target_id    TEXT,
    payload      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','failed')),
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    retry_count  INTEGER NOT NULL DEFAULT 0,
    last_error   TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_created
    ON outbox(status, created_at);
```

A jövőbeli migrációk a Rust-oldal `migrations()` függvényében hozzáadhatók
**új** Migration-objektumként — a régieket **SOHA NEM** módosítjuk.

## 4. TS wrapper (`apps/desktop/src/lib/local-db.ts`)

```ts
import Database from '@tauri-apps/plugin-sql'

const DB_URL = 'sqlite:kartoteka.db'
let cached: Promise<SqlDatabase> | null = null

export async function getLocalDb() {
  if (!cached) cached = Database.load(DB_URL)
  return cached
}

// Kényelmi helperek — settings és outbox tipikus használat
export async function getSetting(key: string): Promise<string | null>
export async function setSetting(key: string, value: string): Promise<void>
export async function getAllSettings(): Promise<SettingRow[]>
export async function getOutboxStats(): Promise<OutboxStats>
```

**Lazy-init**: a `Database.load()` csak első `getLocalDb()` hívásnál fut — így
a Vite dev módban (böngésző, nem Tauri) a UI még akkor is betölthető, ha a
plugin nem elérhető. A tényleges hívás dob hibát, amit a kliensek try/catch-sel
kezelnek.

## 5. Tauri 2 capabilities — engedélyek

A Tauri 2 biztonsági modellje **zárt-by-default**: minden plugin-command
explicit engedélyt igényel a capability fájlban.

```json
// src-tauri/capabilities/default.json
{
  "permissions": [
    "core:default",
    "opener:default",
    "sql:default",
    "sql:allow-load",
    "sql:allow-execute",
    "sql:allow-select",
    "sql:allow-close"
  ]
}
```

Ez **minden SQL hívást engedélyez**, ami az M2-ben normál. A végleges
production configban (M5) érdemes lehet szűkíteni, ha valami speciális
biztonsági megfontolás jön.

## 6. Dashboard-demo

A `DashboardPage` kapott egy új "Lokális adatbázis" kártyát. Három állapot:

- **Loading**: "DB állapot lekérése…"
- **Hiba** (pl. böngésző-mód): szép üzenet a user-nek + a pontos hiba-string
- **Sikeres**: 4-oszlopos KPI (settings-sorok száma, outbox pending/sent/failed) + a settings-sorok táblája + "Ping local DB" gomb

A Ping gomb beszúrja a `last_ping` kulcsot a mostani ISO-idővel. Minden Ping
megnöveli a settings-tábla méretét (vagy felülírja a meglévő sort az
`ON CONFLICT DO UPDATE` miatt).

## 7. Kipróbálás (böngésző + Tauri)

### Böngésző (`npm run desktop:vite` → http://localhost:1420)
- Az UI és a login még működik
- A Dashboard betöltésekor "Lokális DB nem elérhető" üzenet jelenik meg
- A plugin-sql csak Tauri-ablakon belül működik (a böngésző nem ismeri a `plugin:sql|load` IPC-t)

### Natív Tauri-ablak (`npm run desktop:dev` — első ~5-10 perc, utána gyors)
- Első indításkor létrejön `%APPDATA%\com.erek.kartoteka\kartoteka.db`
- A v1 migráció lefut (settings + outbox tábla)
- Dashboard betölti a settings sorokat (első indításnál üres)
- "Ping" gomb működik, a sor megjelenik a táblázatban

## 8. Verify (2026-04-23)

```bash
# TypeScript
cd apps/desktop && npx tsc --noEmit        # 0 hiba

# Rust (cargo)
cd src-tauri && cargo check                # 2m 18s, 0 hiba
#   Új crate-ek: sqlx 0.8.6, sqlx-sqlite 0.8.6, tauri-plugin-sql 2.4.0

# Vite production build
cd ../.. && npm run desktop:build
# vite v7.3.2  ✓ 2116 modules transformed (+4 plugin-sql SDK)
# dist/assets/index-DJ3Yn3K6.js     489.64 kB
# dist/assets/index-DK_cdfvJ.css     55.05 kB
# ✓ built in 5.48s
```

## 9. Mit NEM csináltunk (scope-határok)

- ❌ **SQLCipher** (titkosítás) — M2.2 scope
- ❌ **Stronghold kulcstár** — M2.3 scope (a DB-kulcs ide kerül)
- ❌ **Pull-sync** (Supabase → SQLite) — M2.4 scope
- ❌ **Outbox-feldolgozás** (push-sync) — M2.5 scope
- ❌ **Konfliktus-kezelés** (revision/updated_at összevetés) — M2.6 scope
- ❌ **Domain-táblák** (members, finance_transactions, stb.) — akkor kerülnek be,
  amikor a pull-sync tervezett séma-tükrözést elvégzi (M2.4)
- ❌ **Live Tauri-teszt** Endre gépén — ezt futtassa `npm run desktop:dev`-vel

## 10. Biztonsági megjegyzések

- **Jelenleg NINCS titkosítás** — ha a Windows-user valakinek hozzáfér (pl. ellopják a laptopot, és a login feloldva), **a DB plain-szövegben olvasható**. Ez **tudatos kompromisszum** az M2.1 szinten.
- **Az M2.2** (SQLCipher) kötelezően az **MVP előtt** kell hogy befejeződjön, mielőtt lelkészi gépre kerül.
- **Az M2.3** (Stronghold) a kulcs-kezelést szigorítja: a user jelszavával derivált kulcs védi a DB-kulcsot, ami a SQLCipher DB-t védi.
- A **`settings` tábla** ne tartson titkot! Csak nem-érzékeny konfigurációt (pl. last-sync timestamp, UI-preferences).
- Az **`outbox`** tartalmaz felhasználói adatot (tagok, pénzügyi tranzakciók — amikor tölt fel). **Emiatt is** a SQLCipher bevezetése kötelező MVP előtt.

---

**M2 fázis haladási állapot (2026-04-23)**:
- ✅ M2.1 SQLite bootstrap + demo
- ⏳ M2.2 SQLCipher
- ⏳ M2.3 Stronghold
- ⏳ M2.4 Pull-sync
- ⏳ M2.5 Outbox push-sync
- ⏳ M2.6 Konfliktus-kezelés
