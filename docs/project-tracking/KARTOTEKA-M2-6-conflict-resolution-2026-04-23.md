# M2.6 teljesítési jelentés — Konfliktus-kezelés (revision + updated_at)

**Dátum**: 2026-04-23
**Fázis**: M2.6 — optimistic-concurrency conflict detection
**Kódolási ciklus**: ~45 perc (a legkomplexebb M2-alfázis eddig)
**Státusz**: ✅ KÉSZ, tsc + cargo check + vite build zöld
**Branch**: `feat/m1-1-monorepo`
**⚠ Endre kézi lépése**: `migration-docs/sql/2026-04-23-m2-6-profiles-revision.sql` futtatása

---

## 1. Vezetői összefoglaló

Az M2.6 bevezeti az **optimistic concurrency control**-t a desktop-kliens
írás-útvonalába: a profil-szerkesztés ellenáll a párhuzamos módosításoknak.

**Fenyegetési forgatókönyv, amit az M2.6 oldja meg:**

> Egy lelkész a desktop-on módosítja a telefonját, de közben az irodában
> valaki a webes felületen is átírja. Két független írás ugyanarra a sorra.
> Az M2.5-ig a második írás **csendben felülírta** az elsőt. Az M2.6 óta
> a kliens felismeri, re-pull-olja a szerver-változatot, és kérdezi
> a user-t: „A szerveren időközben megváltozott, folytatod?"

A megoldás **iparági standard**: `revision` mező minden íráskor inkrementálódik, a kliens-oldali UPDATE feltételes (`WHERE revision = expected`).

---

## 2. Mit változtattunk

### 2.1 Supabase SQL-migráció (kézi futtatás)

**Fájl**: `migration-docs/sql/2026-04-23-m2-6-profiles-revision.sql`

Tartalom:
- `ALTER TABLE profiles ADD COLUMN revision bigint NOT NULL DEFAULT 0` (idempotens)
- `ALTER TABLE profiles ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()` (idempotens)
- `CREATE OR REPLACE FUNCTION public.tg_profiles_bump_revision()` — plpgsql trigger
- `CREATE TRIGGER profiles_bump_revision BEFORE UPDATE ON profiles`
- `CREATE INDEX idx_profiles_updated_at ON profiles(updated_at)` — a jövőbeli delta-sync-hez

A fájl végén **futtatható ellenőrzések** (a feedback memória-note szerint: ne kommentben, hanem SELECT-ként):
- `information_schema.columns` — oszlopok létezése
- `information_schema.triggers` — trigger aktív
- `pg_proc` — trigger-függvény létezése
- `pg_indexes` — index létezése
- `SELECT COUNT(*), MIN(revision), MAX(revision) FROM profiles` — sample

### 2.2 Rust v3 migráció

`apps/desktop/src-tauri/src/db.rs`:

```sql
ALTER TABLE profiles_local ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles_local ADD COLUMN updated_at TEXT;
PRAGMA user_version = 3;
```

Verziósítás: ha `user_version < 3`, lefut. Idempotens: a `user_version` megakadályozza a dupla-futást.

### 2.3 TS `sync.ts` bővítés

**`ProfileLocalRow`** típus frissítve:
```ts
export interface ProfileLocalRow {
  ... (korábbi mezők)
  revision: number
  updated_at: string | null
  synced_at: string
}
```

**`pullOwnProfile`** frissítve:
- A SELECT most lekéri a `revision` + `updated_at` oszlopokat is
- Ha a Supabase még nem futtatta az SQL-migrációt, a mezők hiányoznak a válaszból — `??` fallback 0 / null

**`updateOwnProfile`** refaktor:
```ts
// 1. Optimistic local UPDATE (revision NEM változik)
// 2. expectedRevision = profiles_local.revision
// 3. Online?
//    → supabase.update(patch).eq('id', id).eq('revision', expectedRev).select('revision, updated_at')
//    → ha data.length === 0: KONFLIKTUS → pullOwnProfile() re-sync, return { conflict: true }
//    → ha data.length === 1: frissítsük a lokális revision-t a szerver-értékkel
// 4. Offline: outbox { patch, expected_revision }
```

**`processOutbox`** refaktor:
- Az outbox-ba most `{ patch, expected_revision }` kerül (M2.6 forma)
- Legacy-kompat: ha a payload csak patch (pre-M2.6), unconditional update megy
- M2.6 payload esetén `.eq('revision', expected)` feltételes WHERE
- Ha 0 sor frissül: `status='failed', last_error='conflict: a szerver-oldali revision eltér'`, `retry_count+1`
- Visszatérési típus kibővítve: `{ attempted, sent, failed, conflicts }`

**Új export-ok**:
- `getFailedOutboxRows()` — felsorolja a failed sorokat (legutóbbi 20)
- `retryOutboxRow(id)` — `status='pending'`-re állítja, `last_error=NULL`
- `dismissOutboxRow(id)` — DELETE outbox WHERE id=?

### 2.4 Dashboard kiegészítés

- **Revision + updated_at** megjelenítése a profil-táblázatban
- **Conflict-banner**: ⚠ amber-színű alert a form alatt, ha a mentés konfliktust dobott
- **„Hibás / konfliktusos sorok" tábla** az Outbox kártyában:
  - Minden failed sorhoz: op, target_table, truncate-olt `last_error`, `retry_count`
  - Retry gomb (`Button size="xs" variant="outline"`)
  - Elvetés gomb (`Button size="xs" variant="destructive"`)
- **Refresh** minden sync-műveletnél: `getFailedOutboxRows()` újrafut

---

## 3. Kipróbálási forgatókönyvek

### 3.1 Happy path (egyedüli gép)

1. Endre futtatja az SQL-migrációt a Supabase Studio-ban
2. `npm run desktop:dev` → login
3. „Pull profil" → revision=0 látható
4. Módosítsd a telefont → Mentés → „Elmentve (új revision: 1)" zöld üzenet
5. A Supabase Studio-ban a `profiles` sorban a `revision` már 1

### 3.2 Párhuzamos módosítás (konfliktus-szimulálás)

1. Pull profil a desktopon → revision=1
2. Supabase Studio-ban manuálisan UPDATE: `UPDATE profiles SET phone = '+36…' WHERE id = '…'` → revision=2
3. A desktop-on nem pull-ol, nem tudja, hogy már 2
4. Módosítsd valamelyik mezőt → Mentés
5. → ⚠ amber banner: „A szerveren időközben megváltozott…"
6. A helyi cache automatikusan frissült a szerver-változatra
7. Ha továbbra is változtatni akarsz, mentsd újra — most már revision=2-vel megy

### 3.3 Offline konfliktus

1. Offline módban szerkeszted → mentés kerül outbox-ba
2. Online-ban a sor kimegy, de **ha közben a szerver-oldali revision már megnőtt**,
   a conditional UPDATE 0 sort frissít
3. A sor `failed` lesz `last_error='conflict: a szerver-oldali revision eltér'`
4. A Dashboard-on a „Hibás / konfliktusos sorok" táblában megjelenik
5. Retry-ra próbálja újra; elvetésre eldobja

---

## 4. Biztonság

- **Conditional update RLS-biztonsága**: a policy `id = auth.uid()` feltételt ír elő — a `revision`-check csak **additív** feltétel, nem gyengíti az RLS-t. A user csak saját sorát módosíthatja, és csak ha az általa ismert revision nem stale.
- **Trigger biztonsága**: a `tg_profiles_bump_revision` `SECURITY INVOKER` alapértelmezésben (a DEFAULT), tehát a trigger a hívó user jogain fut. Biztonság szempontjából ugyanolyan, mint egy kézi `SET revision = OLD.revision + 1`.
- **Offline payload támadás**: az outbox-ban a JSON-payload módosítható, ha a támadó hozzáfér a lokális SQLCipher-DB-hez. De a támadó amúgy is hozzáférne a user session-tokenéhez — RLS védi a szerver-oldalon. Jövő feladat (talán M5): payload-aláírás a user-keypair-rel.

## 5. Mit NEM csináltunk (scope-határok)

- ❌ **Delta-sync** (`updated_at > last_pull`) — az infrastruktúra kész, csak a `pullOwnProfile`-t kell bővíteni. M2.7 vagy helyébe lépő alfázis.
- ❌ **Több domain-tábla** — minden egy, hasonló SQL-migrációt igényel. M2.7+
- ❌ **Konfliktus-UI** részletek — most egy sima re-pull + banner. Jövőben „diff-view" (melyik mező változott a szerveren vs a klienseden) szebb lenne.
- ❌ **Merge-stratégia** — jelenleg „server-wins" a pull-kor. Az utolsó-írás-nyer is lehetne, de az rossz ötlet (csendes adatvesztés).
- ❌ **Retry backoff** — 1-klikk retry, exponential backoff nincs. Rendben M2.6-nak.

## 6. Verify

```bash
# TypeScript
npx tsc --noEmit           # 0 hiba

# Rust
cargo check                # 32 s (v3 ALTER + új kód, minden más cache)

# Vite prod build
npm run desktop:build      # 505 kB JS, 57 kB CSS, 3.18 s
```

---

## 7. Architektúrai tanulságok

1. **Az optimistic concurrency control a legszebb, amit egy "egyszerű" offline-first sync-stack-be belerakhatsz**. Minimális szerver-oldali teher (egy sor triggerben), nagyon erős garancia: két kliens soha nem írja felül egymást csendben.
2. **Az M2.1-ben előre fel van készítve az outbox** — most már látszik, hogy a legjobb design-döntés volt. Minden M2.x-ben csak kliens-oldali logikát kellett hozzá rakni.
3. **A `{ patch, expected_revision }` payload-formátum legacy-kompatibilis** — a régi M2.5-ös pending sorok unconditional update-tel mennek át, nem bomlanak fel.

---

## 8. M2 fázis haladási állapot (2026-04-23)

- ✅ M2.1 SQLite bootstrap
- ✅ M2.2 SQLCipher csere
- ✅ M2.3 OS-szintű kulcs (Credential Manager)
- ✅ M2.4 Pull-sync (saját profil)
- ✅ M2.5 Push-sync (outbox drain)
- ✅ M2.6 Konfliktus-kezelés (revision + updated_at) ← MOST
- ⏳ M2.7 (opcionális): delta-sync + több domain-tábla mint follow-up

Az M2 **összes kötelező lépése kész**. Az M2.7 inkrementális bővítés lehet, vagy átugorhatunk M3-ra (updater + code-signing + MVP-felkészülés).
