# M2.4 teljesítési jelentés — Első Supabase → SQLite szinkron (saját profil)

**Dátum**: 2026-04-23
**Fázis**: M2.4 — pull-sync minimális inkrement (1 sor, saját user)
**Kódolási ciklus**: ~25 perc (minden már a helyén volt az M2.3-ból)
**Státusz**: ✅ KÉSZ, tsc + cargo check + vite build zöld
**Branch**: `feat/m1-1-monorepo`

---

## 1. Vezetői összefoglaló

Az M2.4 az első alfázis, ahol a desktop-kliens **valódi adatot** tárol a
lokális SQLCipher DB-ben (az M2.1–M2.3-ig csak a kulcs-kezelő +
settings/outbox placeholder táblák voltak).

A scope **szándékosan kicsi**: csak a bejelentkezett user saját profilja,
egy sor. Ez elég ahhoz, hogy:

1. Bizonyítsuk az end-to-end flow-t (Supabase → RLS → TS-kliens → Tauri
   invoke → Rust → SQLCipher)
2. Az alap-infrastruktúrát (`sync.ts`, `profiles_local` tábla) felépítsük
   a következő domain-tábláknak

**Nem** része a delta-sync (updated_at > last_pull), mert a Supabase
`profiles` tábla még **nem** rendelkezik `updated_at + revision`
oszlopokkal. Ez külön SQL-migrációt igényelne a webes oldalon, amit M2.5-ben
veszünk elő.

---

## 2. Változtatások

### 2.1 Rust — v2 migráció

`apps/desktop/src-tauri/src/db.rs`:

```sql
CREATE TABLE IF NOT EXISTS profiles_local (
    id              TEXT PRIMARY KEY,    -- uuid
    email           TEXT,
    full_name       TEXT,
    phone           TEXT,
    role            TEXT,
    status          TEXT,
    congregation_id TEXT,                 -- uuid
    diocese_id      TEXT,                 -- uuid
    district_id     TEXT,                 -- uuid
    synced_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_profiles_local_congregation ON profiles_local(congregation_id);
PRAGMA user_version = 2;
```

A migráció a szokott verzió-alapú stratégiával fut (a v1 után, ha
`PRAGMA user_version < 2`).

### 2.2 TypeScript — sync modul

Új fájl: `apps/desktop/src/lib/sync.ts`

Főbb exportok:
```ts
export async function pullOwnProfile(userId: string): Promise<PullResult>
export async function getLocalOwnProfile(userId: string): Promise<ProfileLocalRow | null>
export async function getLastPullIso(): Promise<string | null>
export interface ProfileLocalRow { id, email, full_name, phone, role, status, congregation_id, diocese_id, district_id, synced_at }
```

`pullOwnProfile` folyamata:
1. Supabase `SELECT id, email, ... FROM profiles WHERE id = userId` — `.maybeSingle()`
2. Ha nincs sor (pl. invite még nem aktivált): graceful return `pulledRows: 0`
3. Ha van sor: `INSERT OR REPLACE INTO profiles_local` a lokális DB-be
4. `setSetting('sync:profiles:last_pull', now.toISOString())` — az utolsó sync ideje

### 2.3 Dashboard bővítés

`apps/desktop/src/pages/dashboard-page.tsx`:

- Új „Saját profil — offline cache" Card
- Három state: nincs profil yet (instrukció) / loading / kitöltött tábla
- Pull gomb + hiba-display
- 10-oszlopos profil-tábla a lokális adatokkal

A meglévő „Lokális adatbázis" kártya frissítve: a description most
említi az M2.3-as Credential Manager-integrációt.

---

## 3. Biztonság

- A `pullOwnProfile` **nem** kerüli meg az RLS-t — a Supabase szűri a
  SELECT-et: a bejelentkezett user csak saját sorát kapja meg.
- A kliens-oldali `.eq('id', userId)` **dupla-védelem** (ha az RLS
  valamiért enyhülne egy jövőbeli hibában).
- A lokális DB **SQLCipher-titkosított**, kulcs a Credential Manager-ben
  (M2.3). Tehát a pulled adat offline olvasható, de kompromittált (pl.
  kilopott) DB-fájl nélkül.
- **Nincs olyan új adat** a lokális DB-ben, amit ne a user láthatna — ez
  legális offline cache, GDPR-adatminimalizálási szempontból is rendben.

## 4. Biztosítékok a hibáknál

- **Hálózati hiba a pull-kor**: a Supabase SDK `error` objektum, a
  frontend szépen megjeleníti. A lokális DB változatlan.
- **Nincs `profiles` sor**: pl. új user invite után, akinek még nem
  futott le a trigger-szerű setup. `pullOwnProfile` visszaad `pulledRows: 0`,
  a UI „még nincs cache-elt sor" üzenetet mutat.
- **Lokális DB nem elérhető** (böngésző-mód): a UI „DB nem elérhető"
  hibát mutat (M2.1 óta meglévő kezelés), a pull gomb is fail-safe.

## 5. Verify

```bash
# TypeScript
npx tsc --noEmit       # 0 hiba

# Rust
cargo check            # 1.03 s (csak a migrations() vector változott)

# Vite
npm run desktop:build  # 2117 modul (+1 sync.ts), 3.29 s
```

## 6. Kipróbálás

```powershell
cd "D:\Egyházi APP\KARTOTEKA"
npm run desktop:dev
```

1. Natív Tauri ablak nyílik
2. Login képernyő — jelentkezz be a szokott fiókoddal
3. Dashboard — új „Saját profil — offline cache" kártya
4. „Pull profil" gomb → a táblázat kitöltődik
5. Teszt: kapcsold le az internetet, és indítsd újra az app-ot.
   A dashboard betöltéskor a **lokális DB-ből olvassa** a sort — a
   táblázat megjelenik, ellentétben a Supabase-hívásokkal, amik
   offline-ban timeoutolnának.

## 7. Mit NEM csináltunk (scope-határok)

- ❌ Delta-sync (`updated_at > last_pull`) — a `profiles` táblán nincs
  `updated_at` oszlop. M2.5-ben veszünk egy olyan domain-táblát, ami
  már készen van (pl. `presbiter` vagy `congregations`), és ott
  mutatjuk be a delta pull-t
- ❌ Több domain-tábla — külön alfázisokban (M2.5–M2.6)
- ❌ Push-sync (offline írás → outbox → Supabase) — M2.5 fő témája
- ❌ Konfliktus-kezelés (revision-összevetés) — M2.6
- ❌ Ütemezett automatikus sync — manuális Pull-gomb csak
- ❌ Részleges mezők kiemelése — most minden oszlop átkerül. Optimalizálni
  M5 táján, ha a performance-méréseken indokolt

## 8. Tanulságok

1. **Supabase-séma-audit kötelező minden sync-tábla előtt**. Nem
   feltételezem hogy `updated_at` van; ellenőrzöm a `Database_schema.sql`-ban.
2. **A `.maybeSingle()`** a Supabase JS-SDK-ban a „0 vagy 1 sor"
   szemantikát tisztán fejezi ki. Nincs `error` hamis-pozitív, ha
   nincs találat.
3. **A `settings` tábla, mint utolsó-sync-idő tároló**, remek design.
   Nem kell külön tábla a sync-state-nek, amíg csak egy-két sort
   tárolunk.

---

## 9. M2 fázis haladási állapot (2026-04-23)

- ✅ M2.1 SQLite bootstrap (tauri-plugin-sql)
- ✅ M2.2 SQLCipher csere (rusqlite + vendored OpenSSL + statikus kulcs)
- ✅ M2.3 OS-szintű kulcs (Credential Manager)
- ✅ M2.4 Első pull-sync (saját profil) ← MOST
- ⏳ M2.5 Push-sync (outbox + első írás-útvonal) + delta-sync egy
  felkészített táblára (pl. presbiter)
- ⏳ M2.6 Konfliktus-kezelés + esetleg user-jelszó alapú derived kulcs
