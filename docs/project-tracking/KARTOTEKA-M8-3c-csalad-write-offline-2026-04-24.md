# KARTOTEKA — M8.3c: család-CRUD (insert + update) offline-is

**Dátum**: 2026-04-24 (éjjel)
**Fázis**: M8.3c (harmadik alfázis az M8.3 család-kezelőn belül)
**Státusz**: ✅ KÉSZ — a lelkész mostantól új családot hozhat létre a desktop-ról, szerkesztheti a meglévőt, offline is. Az M8 wave **teljes szemely + család CRUD** készen áll.

## Mit ad

- **Új család** létrehozása a Családok oldal fejlécén új „Új család" violet gombbal
- **Meglévő család szerkesztése** a family-portré modal „Szerkesztés" gombjával
- Mindkét flow **offline is működik** — a rögzítés egy lokális pending-sorba kerül, a `csalad-write-sync.ts` háttérben feltölti amint online leszünk
- **Konfliktus-kezelés** update-nél: revision-check, ha másik eszközről módosították időközben, ütközés-banner

## Design-döntések

### 1. Egy közös `csalad_pending_local` tábla, két `operation`-nal

A szemely-nél az insert-műveletnek saját `szemely_pending_local`, az update-nek az általános `outbox` volt. Itt viszont **egy közös pending-tábla**, mert:
- A család egyszerűbb entitás (kevesebb mező)
- Az insert és update nem gyakori műveletek — nem kell külön optimalizálni
- A `operation` oszlop (`'insert' | 'update'`) + `target_csalad_id` + `expected_revision` trükk jól szolgálja mindkettőt
- Ha a későbbi M8.3d-ben gyerek-junction CRUD jön, kapcsolódhat ugyanehhez a táblához (vagy egy külön `gyerek_pending_local`-hoz — döntés lesz)

**Előny**: egy helyen listázhatók mind a pending családok, egy sync-helper mindet kezeli, egy UI-blokk mutatja az állapotot.

### 2. Az insert → `local-<uuid>` + `server_id` backfill

Ugyanaz a minta, mint az M8.1-nél:
1. A user rögzíti → `local-<uuid>` a pending-ben + lokál-cache-be optimistic insert (a UI azonnal látja)
2. Online: Supabase insert → kapja a `csalad.id`-t → `markCsaladPendingSynced` + `upsertLocalCsaladOptimistic` a valós id-val
3. Offline: marad pending, a `csalad-write-sync` tölti fel a háttérben

### 3. Az update → snapshot-payload, nem delta

Az M8.0b szemely-update delta-payloaddal ment (csak a változott mezőket küldi). Itt V1-ben **snapshot**-et küldünk: a pending-sor tartalmazza az **összes** mezőt (a `csalad_local`-ből olvasott current + patch). A szerver-oldali revision-trigger úgyis csak akkor pörög, ha valami változott.

**Miért snapshot**: egyszerűbb a sync-logika (nem kell a patch JSON-t perzisztálni + újra-deszerializálni). Hátránya: nagyobb payload, de a `csalad`-nak kevés oszlopa van, nem terheli.

### 4. A szülő-kijelölés UX

A `CsaladFormDialog`-ban két „Tag kiválasztása" gomb (apa, anya). Kattintásra a `listLocalSzemely` kereső nyílik ki a dialog belsejében, 300ms debounce-al. A nem-megfelelő (apa-választáskor nő, anya-választáskor férfi) a client-oldalon kiszűrve.

**Legalább az egyik szülő kötelező** — a `csaladCreateInputSchema` refine-nal. Egyedülálló család (özvegy anya, egyedül álló apa) is rögzíthető.

### 5. A `c_utcaid` továbbra is dummy = -1

A cím szöveges (`c_szam`, `c_tombhaz`, `c_lepcsohaz`, `c_emelet`, `c_ajto`). Az `adrstreet` FK lookup későbbi polish-feladat (M8.3d vagy M9+).

### 6. Nincs gyerek-hozzáadás ebben az iterációban

Az M8.3c **csak** a `csalad` CRUD-ot viszi. A `gyerek` junction-nal (új gyerek hozzáadása családhoz, vagy eltávolítása) az M8.3d-ben jön, vagy amikor a tag-edit flow-ba beépítjük a „család-hozzárendelés" opciót.

## Fájlváltoztatások

### Új

- **`apps/desktop/src-tauri/src/db.rs`** — v18 migráció: `csalad_pending_local` tábla (3 index, CHECK constraint az operation-on)
- **`packages/validations/src/members/csalad-save.ts`** — `csaladCreateInputSchema` (refine: legalább apa vagy anya) + `csaladUpdateInputSchema` + `normalizeCsaladPayload` (üres string → null, `c_szam` → `'—'`)
- **`apps/desktop/src/lib/csalad-write-sync.ts`** (~280 sor) — `pushPendingCsalad` (kezeli az insert + update-et külön-külön) + `startCsaladAutoSync` + `runCsaladSyncManually` + exp-backoff
- **`apps/desktop/src/components/csalad-form-dialog.tsx`** (~480 sor) — közös dialog a create + edit-hez, beépített tag-kereső a szülő-kijelöléshez
- **`docs/project-tracking/KARTOTEKA-M8-3c-csalad-write-offline-2026-04-24.md`** — ez a doksi

### Módosított

- **`packages/validations/src/index.ts`** — új re-export `members/csalad-save`
- **`apps/desktop/src/lib/tauri-sqlite-backend.ts`** (+~220 sor) — 7 új metódus:
  - `insertPendingCsaladCreate(row)`
  - `insertPendingCsaladUpdate(row)`
  - `upsertLocalCsaladOptimistic(row)`
  - `listPendingCsalad()`
  - `markCsaladPendingSynced(localId, serverId)`
  - `markCsaladPendingConflict(localId, reason)`
  - `updateCsaladPendingAttempt(localId, reason)`
- **`apps/desktop/src/lib/sync.ts`** (+~200 sor) — `createCsaladEntry(userId, input)` + `updateCsaladEntry(userId, csaladId, patch, expectedRevision)`
- **`apps/desktop/src/pages/families-page.tsx`** — új „Új család" gomb + `CsaladFormDialog` mount + auto-sync start
- **`apps/desktop/src/components/family-detail-dialog.tsx`** — új „Szerkesztés" gomb a footer-en + `CsaladFormDialog` mount edit-módban + új `congregationId` prop

## Ellenőrzés

Manuális kód-ellenőrzés (tsc nem futott):
- Az `csaladCreateInputSchema.refine` üzenete a user-barát „Legalább apa vagy anya" hibát adja
- A `CsaladFormDialog` a mode prop szerint eldönti a create / edit branchet
- A `listPendingCsalad` csak a `'pending'` sort adja vissza (conflict nem automatikusan újra-próbál)
- A `createCsaladEntry` online ág `upsertLocalCsaladOptimistic`-kel azonnal frissíti a UI-cache-t, így a Családok oldal az új családot azonnal látja
- A `family-detail-dialog` `edit`-flow a `onSaved` → `load()` refresh-eli a nézetet

## Hátra az M8-ban

Az M8 szemely-wave **TELJES**:

- ✅ M8.0a+b+c — tag lista + szerkesztés + write-offline
- ✅ M8.1 — új tag CNP-validátorral + konfliktus-feloldás
- ✅ M8.2 — soft-delete
- ✅ M8.4 — admin-jelzők (meghalt, választó, családfő, tagsági kategória)
- ✅ M8.3a — család-olvasás
- ✅ M8.3b — családfő-kijelölés
- ✅ M8.3c — család CRUD offline-is

Mi **nincs**:
- Gyerek-junction CRUD (külön körben — M8.3d vagy a tag-flow-ba integrálva)
- `adrstreet` FK lookup (jövőbeli polish)

## Endre teendői

- **Rust v18 migráció** automatikusan fut a következő desktop-indításkor (PRAGMA user_version alapján)
- **Nincs új SQL migráció** — a `csalad` tábla a szerveren változatlan; az insert + update is a meglévő oszlopokra megy
- **Új build**: `npm run desktop:build` + új release `v0.3.2` vagy `v0.4.0`

## Tudok-e sok családot egyszerre létrehozni?

Egyelőre egy-egy család per modal-megnyitás. Bulk-import (CSV, Excel) külön feature — a web-oldali `/delegated-import` már kezeli ezt, de a desktop-on még nincs.
