# KARTOTEKA — M8.3d: gyerek-junction CRUD (desktop, offline-is)

**Dátum**: 2026-04-24 (éjjel-kora reggel)
**Fázis**: M8.3d (az M8.3 család-kezelő negyedik és záró alfázisa)
**Státusz**: ✅ KÉSZ — a lelkész mostantól gyerekeket rendelhet egy családhoz és el is távolíthat onnan.

## Az M8 szemely+család wave ezzel teljes

- ✅ **M8.0a/b/c** — tag lista + szerkesztés + write-offline
- ✅ **M8.1** — új tag CNP-validátorral + konfliktus-feloldás
- ✅ **M8.2** — soft-delete
- ✅ **M8.4** — admin-jelzők
- ✅ **M8.3a** — család-olvasás
- ✅ **M8.3b** — családfő-kijelölés
- ✅ **M8.3c** — család CRUD offline-is
- ✅ **M8.3d** — gyerek-junction CRUD (ez)

## Mit ad

A **család-portré modal** Gyermekek szekciója most:

- Minden gyerek mellett **Trash-ikon** („Eltávolítás a családból") — browser-confirm → optimistic lokál delete + pending sync
- A szekció alján **„Gyermek hozzáadása a családhoz"** gomb → kereső-mező nyílik
- Keresés a gyülekezet **aktív tagjai közül** (a már családban levőket kiszűrve)
- Kattintás a találatra → azonnali optimistic-insert + background sync

Minden offline is működik.

## Design-döntések

### 1. `gyerek_pending_local` — egyszerűbb mint a csalad_pending_local

A `gyerek` tábla junction; nincs update művelet (nem módosítunk egy sor `id_csalad` vagy `id_szemely` mezőjét — inkább delete + insert egy új sorban). Ezért a pending-tábla **csak 2 operation-t** támogat: `insert` és `delete`.

Rust v19:
- `id TEXT PK` (`'local-<uuid>'`)
- `server_id INTEGER` — insert után a `gyerek.id`
- `operation TEXT CHECK IN ('insert', 'delete')`
- `id_csalad INTEGER` + `id_szemely INTEGER` (insert-hez)
- `target_gyerek_id INTEGER` (delete-hez)
- Standard sync-metaadatok

### 2. Optimistic delete azonnal

A `removeGyerekFromCsalad` **azonnal törli** a `gyerek_local`-ból (a UI azonnal frissül), függetlenül attól, hogy online vagy offline van. A pending-sor tárolja a művelet tényét — a sync-helper végül a szerveren is törli.

Ha a lokál-delete sikerül de a szerver-delete elbukik (pl. a sor már nem létezik, vagy hálózati hiba), a következő delta-pull **újra beemelheti** a gyerek-sort. V1-ben ez OK-feltétel — nagyon ritka edge-case.

### 3. Optimistic insert is

A `addGyerekToCsalad` online ága:
1. `gyerek_pending_local` insert (pending)
2. Supabase insert → kapja az `id`-t
3. `markGyerekPendingSynced` + `insertLocalGyerekOptimistic` (a lokál-cache-be is bekerül)

Offline ág: csak az 1. lépés. A `gyerek-write-sync` később elintézi.

### 4. Szűrő: már családban levőket kizár

A gyerek-kereső a `listLocalSzemely` (aktív tagok) listából dolgozik, de **kiszűri** azokat, akik már:
- A család apja (`detail.ferfi.id`)
- A család anyja (`detail.no.id`)
- A család gyereke (`detail.gyermekek.*.szemely_id`)

Így a user nem tudja véletlenül kétszer rendelni ugyanazt a tagot ugyanahhoz a családhoz.

### 5. Nincs „családba-áthelyezés" flow

Ha egy gyereket át kell tenni egyik családból egy másikba:
1. Az eredeti családban: **Eltávolítás** (Trash-ikon)
2. Az új családban: **Hozzáadás** (Plus-gomb)

Egy lépéses „áthelyezés" UX későbbi polish, ha kiderül, hogy gyakori művelet.

## Fájlváltoztatások

### Új

- **Rust v19 migráció** (`apps/desktop/src-tauri/src/db.rs`): `gyerek_pending_local` tábla 3 indexszel
- **`packages/validations/src/members/gyerek-save.ts`**: `gyerekAddInputSchema`, `gyerekRemoveInputSchema`
- **`apps/desktop/src/lib/gyerek-write-sync.ts`** (~210 sor): `pushPendingGyerek` (insert + delete branches), auto-sync, manuális sync
- **`docs/project-tracking/KARTOTEKA-M8-3d-gyerek-junction-2026-04-24.md`**

### Módosított

- **`packages/validations/src/index.ts`** — új re-export
- **`apps/desktop/src/lib/tauri-sqlite-backend.ts`** (+~120 sor):
  - `insertPendingGyerekAdd`, `insertPendingGyerekRemove`
  - `insertLocalGyerekOptimistic`, `deleteLocalGyerekOptimistic`
  - `listPendingGyerek`, `markGyerekPendingSynced`, `markGyerekPendingConflict`, `updateGyerekPendingAttempt`
- **`apps/desktop/src/lib/sync.ts`** (+~130 sor): `addGyerekToCsalad`, `removeGyerekFromCsalad`
- **`apps/desktop/src/components/family-detail-dialog.tsx`**: gyerek-kezelés UI — Trash-ikonok a gyerekek mellett, „Gyermek hozzáadása" gomb + kereső, optimistic UX, startGyerekAutoSync mount-kor

## Hátra

- **Anyakönyv** (keresztelés, házasság, temetés) desktop paritás — nagyobb munka, külön fázis
- **Leltár**, **jegyzőkönyvek**, **éves jelentés** — ezek is desktop-ra
- **adrstreet lookup** — cím-FK normalizálás (M8.3 polish)
- **Bank-import Raiffeisen + BT** — A-M7.10d
- **Oblio Edge Fn** — román e-Factura

De ezek már **az M8 szemely+család wave-en túli** feladatok. Az M8 maga **teljes**.

## Endre teendői

- `npm run desktop:build` → a Rust v19 migráció automatikusan fut
- Új GitHub release (pl. `v0.4.0`) — az M8 wave teljes zárása lehet egy major verzió-lépés
- Tesztelés: Családok → sor-kattintás → detail-modal → gyerek-kezelés (hozzáadás + eltávolítás, online + offline)
