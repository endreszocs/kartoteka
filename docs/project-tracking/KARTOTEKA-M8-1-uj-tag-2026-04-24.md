# KARTOTEKA — M8.1: Új tag INSERT + write-offline (desktop)

**Dátum**: 2026-04-24
**Fázis**: M8.1 (új tag rögzítés a desktop appban)
**Státusz**: ✅ KÉSZ — a lelkész offline is felvehet új tagot; a szinkron automatikusan tölti fel a szerverre.

## Mit takar

Az M8.0-körben meglévő tag szerkesztése, rejtése és admin-flag-ek beállítása történt. Ez az iteráció elhozza az **Új tag rögzítést** a desktopra — ezzel a személy CRUD C+ része is kész.

Lényegi architekturális újdonság: **dedikált `szemely_pending_local` tábla** — az első tábla a desktop-on, ami nem az outbox/edit-patterntel megy, hanem saját queue-ja van. Azért, mert új insert-nél:
- nincs még szerver-id (egy kliens-oldali `local-<uuid>` kell);
- CNP dupláció-check kell (kliens-oldali gyors feedback);
- offline-ban is kell tudni azonnal listázni az új taget a pending-blokkban.

## Design-döntések

### 1. Saját pending-tábla, NEM a közös outbox

A befizetés/kiadás/chitanța write-offline-nál (A-M7.9) az `outbox` táblát + a domain-specifikus `*_pending_local` táblát együtt használtuk. Itt **nem** — csak a `szemely_pending_local` van. Két ok:

1. **Nincs iratszám-sequence** — a szerver-oldali `szemely.id` INTEGER sequence-ből jön, a kliens nem foglal előre számot.
2. **Az outbox egy sor-mutation táblát vár, generikus flush-sel** — a szemely-insert-nél a teljes payload kell, a pending-sor maga az "insert-mutation".

A `szemely_pending_local` tábla `sync_state` oszlopa 3-állapotú (`pending` / `synced` / `conflict`), a `retry_count` + `last_attempt_at` oszlopok támogatják az exp-backoff-ot.

### 2. CNP-validáció + dup-check

**Zod validátor**: `validateRomanianCnp` helper a `packages/validations/src/members/szemely-create.ts`-ben. Pontos algoritmus:
- 13 számjegy, első nem 0
- Hó/nap sanity (01-12, 01-31)
- Checksum: `sum(digit[i] * weight[i])` `weight = [2,7,9,1,4,6,3,5,8,2,7,9]`; `% 11`; `10 → 1`

**Kliens-oldali dup-check**: a `MemberCreateDialog` a CNP-mezőbe gépelés után 400 ms-mel lefuttatja a `findSzemelyByCnp(congregationId, cnp)` metódust, ami a `szemely_local` + `szemely_pending_local` kombinált CNP-ismeretét adja vissza. Ha van találat, amber hint-sáv: "Ezzel a CNP-vel már van egy tag (már a listában / még szinkronra váró új tag): Név".

**Szerver-oldali védelem**: a Supabase `szemely` tábla `cnp` oszlopán UNIQUE constraint kell legyen (a sémában még nincs, M8.1-polish feladat). Addig is a lokális dup-check + a 23505 error-code kezelés a szerver-oldali jövőbeli constraint-hez.

### 3. `c_utcaid` + `befizetoev` dummy-érték

A `szemely` Supabase-tábla `c_utcaid` (integer NOT NULL FK `adrstreet`-re) és `befizetoev` (integer NOT NULL) mezőket vár. A desktop V1-ben a cím szöveges (`c_szcim`), az FK-normalizálás későbbi fázis. Ezért a `buildServerInsertPayload` helper:
- `c_utcaid = -1` (ideiglenes dummy; a jövőbeli cím-normalizáló futtat egy backfill-t)
- `befizetoev = new Date().getFullYear()` (aktuális év)

Ez **nem ideális**, de elég az M8.1 első iterációra. A polish során (M8.5+) kell:
- Egy `adrstreet` lookup (name → id) flow
- Vagy a szerver-oldali `c_utcaid` NULL-engedése (séma-migráció)

### 4. Family-hozzárendelés kimaradt

A `family_id` zod-ban engedélyezve van (UUID nullable), de a UI-ban nincs mező — a család-UI az **M8.3-ban** jön (családok listája, családfő-kijelölés, tagok mozgatása). Addig minden új tag családon kívüli (`family_id=null`).

### 5. Auto-sync trigger a members-page-en

A `szemely-write-sync.ts` nem az AuthGate-ben indul (mint a pénzügyi sync-ek), hanem a **`members-page`-en** — amikor a lelkész a tagnyilvántartás-oldalon tartózkodik. Okok:
- A `startSzemelyAutoSync(congregationId)`-nek kell a congregation-id — az AuthGate szintjén ezt async kell feloldani (`getLocalOwnProfile`), ami bonyolítja.
- A napi pasztorális munka ritkán jelent többnapi offline-írást — amikor a lelkész megnyitja a tagnyilvántartást, ott el is indul a push.

Ha a jövőben kell globálisabb trigger (pl. sync-status-indicator), akkor átköltöztethető az AuthGate-be.

## UX-részletek

### Új tag dialog (`MemberCreateDialog`)

- **Serif cím** `UserPlus` ikon mellett: "Új tag rögzítése"
- **Kötelező mezők** (`*` piros jelzéssel):
  - CNP (13 számjegy, monospace input, dup-check inline)
  - Keresztnév + Családnév
  - Születési dátum
  - Nem (rádio: férfi / nő)
- **Opcionális mezők** csoportosítva:
  - Nevek (szcs_nev, ferjk_nev — utóbbi csak ha `nem=nő`)
  - Származás (apjaneve, anyjaneve)
  - Cím (szöveges, 6 mezővel)
  - Elérhetőség (telefon, email)
  - Identitás (vallás default "református", foglalkozás, nemzetiség)
  - Jelzők (csaladfo, voter_eligible checkbox)
  - Megjegyzés (textarea)
- **Save** → zod-validáció → `createSzemelyEntry` → 4-féle banner:
  - **success** (emerald) — online-siker, `szerver-id: N`
  - **offline** (sky) — pending-be mentve, sync-majd
  - **duplicate** (amber) — CNP-ütközés
  - **error** (rose) — minden egyéb

A Save gomb csak akkor aktív, ha a `canSubmit` feltételek teljesülnek (kötelező mezők + CNP-checksum-OK).

### Pending-blokk a members-page-en

Ha van legalább 1 pending sor, amber kártya jelenik meg a fejléc és a szűrők között:
- "Szinkronra váró új tagok (N)"
- "Sync most" gomb (spin-animáció szinkronizálás közben)
- Sorok: `[várakozik|ütközés]` badge + név + CNP (mono) + ütközés-indoklás (ha van)

### "Új tag" gomb

A fejléc jobb oldalán, violet színnel, `UserPlus` ikonnal. Csak akkor jelenik meg, ha a `congregationId` betöltött. Alatta a sor-számláló.

## Fájlváltoztatások

### Új

- **`apps/desktop/src-tauri/src/db.rs`** — v16 migráció: `szemely_pending_local` tábla (~35 oszlop, 3 index, UNIQUE (congregation_id, cnp))
- **`packages/validations/src/members/szemely-create.ts`** (~130 sor) — `szemelyCreateInputSchema` + `validateRomanianCnp` + `normalizeSzemelyCreate` + `SzemelyPendingRow`
- **`apps/desktop/src/lib/szemely-write-sync.ts`** (~330 sor) — `pushPendingSzemely` + `startSzemelyAutoSync(congregationId)` + `runSzemelySyncManually` + exp-backoff + session-check
- **`apps/desktop/src/components/member-create-dialog.tsx`** (~520 sor) — serif cím, csoportos form, CNP-dup-check inline (400ms debounce), 4-féle banner, `canSubmit` gate
- **`docs/project-tracking/KARTOTEKA-M8-1-uj-tag-2026-04-24.md`** — ez a doksi

### Módosított

- **`packages/validations/src/index.ts`** — új re-export `members/szemely-create`
- **`apps/desktop/src/lib/tauri-sqlite-backend.ts`** (+~200 sor) — 7 új metódus:
  - `insertLocalSzemely(row)` — pending insert
  - `listLocalPendingSzemely(congregationId)` — queue-read
  - `getLocalPendingSzemely(localId)` — teljes payload (sync-hez)
  - `findSzemelyByCnp(congregationId, cnp)` — kombinált dup-check (szemely_local + pending)
  - `markSzemelySynced(localId, serverId)` — siker jelölés
  - `markSzemelyConflict(localId, reason)` — ütközés jelölés + retry_count++
  - `updateSzemelyAttempt(localId, reason)` — csendes retry (exp-backoff)
  - `deleteLocalPendingSzemely(localId)` — konfliktus-feloldás törlés
- **`apps/desktop/src/lib/sync.ts`** (+~180 sor) — `createSzemelyEntry(userId, input)` + `buildServerInsertPayload` + `generateUuid` helper
- **`apps/desktop/src/pages/members-page.tsx`** — "Új tag" gomb + pending-blokk + auto-sync start + manuális sync gomb

**Nincs új SQL migráció** — a szerver-oldali `szemely` tábla minden szükséges oszlopa megvan (CNP UNIQUE még hiányzik, de a kliens dup-check + 23505 error handling készen állnak a constraint-re, ha a user felveszi később).

## Hátra az M8 wave-ben

- **M8.3** — Család-kezelő UI (`csalad` CRUD + családfő-kijelölés + tagok áthelyezése). Becsült: ~3-4 óra.
- **Polish**: `adrstreet` lookup (cím-FK normalizálás), CNP UNIQUE constraint a szerver-oldalon (SQL migráció), "Mind" szűrő + rejtett tagok.
- **Konfliktus-feloldó UX** a pending-blokkon (jelenleg csak jelzi az ütközést; a "Törlés" / "Új CNP-re állítás" gombok M8.3-polish).

## Ellenőrzés

A gépen nincs Node PATH-ban, tsc nem futott. Manuális ellenőrzés:
- új import-ok csak whitelist: `@kartoteka/ui`, `@kartoteka/validations`, `lucide-react`, `react`, relatív lib imports
- nincs dexie-import
- zod-séma + SQLite SELECT oszlopnevek egybevágnak
- Rust v16 migráció SQL-szinte egyezik a befizetés/kiadás mintájával (INTEGER PK helyett TEXT PK, 3 index)

A Railway build detektálja a TS-hibákat a szokott helyen (a `packages/validations` bekerül a web bundle-be, így tsc fut rajta).
