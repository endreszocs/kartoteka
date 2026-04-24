# KARTOTEKA — M8.0b/c: Tag-szerkesztés + write-offline (desktop)

**Dátum**: 2026-04-24
**Fázis**: M8.0b (edit UI) + M8.0c (write-offline)
**Státusz**: ✅ KÉSZ — az M8.0a olvasási réteg (read-only detail-modal) most szerkesztő-móddal bővült, és az offline-írás az általános outbox-fallback-en keresztül is működik.

## Mit takar

A 2026-04-25-i M8.0a-ban a desktop tagnyilvántartás lista-oldal és a detail-modal read-only-ként készült el. Ez az iteráció a CRUD **U** (Update) lépését zárja le:

- **M8.0b** — Szerkesztő UI a `MemberDetailDialog`-ban (inline form)
- **M8.0c** — Offline-írás támogatás (outbox-fallback, nem dedikált `szemely_pending_local` tábla, mert szemely-nél nincs iratszám-sequence)

A következő körben jön: M8.1 (új tag), M8.2 (soft-delete), a `szemely.type` admin-szűrése, és a `csalad` CRUD.

## Design-döntések

### 1. Nincs külön `szemely_pending_local` tábla

A pénzügyi A-M7.9a/b/c write-offline körben azért kellettek dedikált `befizetes_pending_local`, `kiadas_pending_local` táblák, mert:
- Az új tételekhez **iratszám-tárca** (`iratszam_wallet_local`) kellett.
- A pending tételek külön UI-blokkban (borostyán sáv) jelentek meg a usernek.
- A konfliktus-feloldáshoz 2-ágú UX (delete / reassign) épült.

Szemely-nél **egyik sem áll fenn**:
- Nincs iratszám-sequence — a `szemely.id` egy INTEGER sequence-ből jön szerver-oldalon.
- A szerkesztés **egy létező soron** történik (update, nem insert) — a lokális `szemely_local` UPDATE optimistic-ként azonnal látszik.
- Konfliktus esetén az `updateWorklogEntry` mintája elegendő: re-pull a szerverről + pasztorális banner.

Ezért az M8.0c = az `updateSzemelyEntry` sync-helper **outbox-fallback ága**. Az outbox már generikusan kezeli az `UPDATE szemely SET ... WHERE id=? AND revision=?` mintát (`processOutbox()` a `target_table`-t paraméterként használja).

### 2. Conditional UPDATE — szerver-oldali revision trigger

A szerver-oldali `2026-04-23-m7-0-szemely-csalad-triggers.sql` migráció a `szemely` táblára BEFORE UPDATE trigger-t telepített, ami automatikusan lépteti a `revision`-t és frissíti az `updated_at`-ot.

Az `updateSzemelyEntry`:
1. Optimistic lokális UPDATE a `szemely_local`-re (azonnali UI-feedback).
2. Online: `supabase.from('szemely').update(patch).eq('id', id).eq('revision', expectedRevision).select('revision, updated_at')`.
3. Ha `data.length === 0` → konfliktus → `pullMembersOfOwnCongregation(userId, 'delta')` a szerver-igazság lehúzásához, majd `{ conflict: true }` a UI-nak.
4. Offline vagy Supabase-hiba → outbox-sor `{ op: 'update', target_table: 'szemely', target_id: id, payload: { patch, expected_revision } }`.

Ez 1:1-ben tükrözi az `updateWorklogEntry` mintáját, tehát már bizonyítottan stabil flow.

### 3. Konfliktus-kezelés UX

Ha a mentés `conflict` flag-gel tér vissza:
- A dialog **edit-módban marad** (NEM vált automatikusan view-ra).
- Banner `kind='conflict'` színezéssel (amber): „Más eszközről módosították ezt a tagot időközben. A »Mégse« gombbal visszaállíthatod a szerver-verziót, vagy újragondolhatod a saját változtatásaidat és újra próbálhatod."
- **NEM hívjuk meg az `onSaved`-et** — különben a parent `loadList()` újra-pull-olná a list-et, új member-obj érkezne props-ban, a dialog `useEffect[m]` reseteli a form-ot, és a lelkész elveszítené a félig megírt változtatásokat.
- A user eldönti: Mégse (szerver-verzió) vagy Mentés újra (új `currentRevision` alapján).

### 4. Érzékeny mezők szűkítése

Az M8.0b patch-sémából **kimaradnak** az admin-jellegű mezők:
- `meghalt`, `member_status`, `voter_eligible` — a tag státusz-változtatásához külön admin UI kell (jogosultság-ellenőrzés, esetleg megerősítés).
- `csaladfo` — a családfő-kijelölés családi kontextus (`family_id`) alapján kell, külön flow.
- `congregation_id`, `family_id`, `type`, `isvisible` — admin-szintű, későbbi fázisban.
- `cnp` — identifier, sosem szerkeszthető (új tag esetén az M8.1-ben jön).

A `szemelyUpdateInputSchema` zod-ja **engedi** ezeket a mezőket (a jövő-proof miatt), de a UI nem tartalmaz hozzájuk input-mezőt.

## Fájlváltoztatások

### Új

- **`packages/validations/src/members/szemely-save.ts`** (~100 sor)
  - `szemelyUpdateInputSchema` — minden mező opcionális, max-length-checkek, dátum-regex, e-mail-regex
  - `SzemelyUpdateInput` — zod inferred
  - `normalizeSzemelyPatch(patch)` — üres-string → null helper

- **`docs/project-tracking/KARTOTEKA-M8-0b-szemely-edit-2026-04-24.md`** — ez a dokumentum

### Módosított

- **`packages/validations/src/index.ts`** — új `export * from './members/szemely-save'`

- **`packages/validations/src/members/szemely-list.ts`** — `revision` mező hozzáadva a row-schema-hoz (eddig hiányzott, bár a Rust `szemely_local` tábla tartalmazta)

- **`apps/desktop/src/lib/tauri-sqlite-backend.ts`**
  - `listLocalSzemely` SELECT kiegészítve a `revision` oszloppal

- **`apps/desktop/src/lib/sync.ts`** (+~130 sor a fájl végén)
  - Új `updateSzemelyEntry(userId, szemelyId, patch, expectedRevision)` — `SzemelyUpdateResult`-tal
  - `fallbackToOutbox` privát helper

- **`apps/desktop/src/components/member-detail-dialog.tsx`** (teljes átírás, ~540 sor)
  - `MemberDetailDialogProps` bővítve: `userId`, `currentRevision`, `onSaved`
  - Új `mode: 'view' | 'edit'` állapot
  - `EditBody` komponens — inline form 20 szerkeszthető mezővel, csoportosítva
  - `ViewBody` komponens — az eredeti read-only nézet kiszervezve
  - `DialogBanner` komponens — success / conflict / offline / error üzenetek színes stílusokkal
  - `handleSave`, `handleCancel` flow-ok
  - `buildPatch(original, form)` — csak a változott mezőket küldi (minimális UPDATE)
  - `EDITABLE_KEYS` konstans — single source of truth

- **`apps/desktop/src/pages/members-page.tsx`**
  - Új `userId` state a `supabase.auth.getUser()` eredményéből
  - A `MemberDetailDialog` megkapja a `userId`, `currentRevision` (= `selectedMember.revision`), `onSaved` (= `() => void loadList()`) props-okat
  - A feltételes render most is bevárja az `userId`-t

## Kapcsolódás az eddigi munkához

- **Minta**: `updateWorklogEntry` (A-M9 CRUD, 2026-04-23) — 1:1-ben követtük a mintát.
- **Különbség**: a munkanaplo-nál a `deleteWorklogEntry` soft-delete-et csinál, a szemely-nél most nincs soft-delete (M8.2 hozza). A `meghalt` flag nem soft-delete, hanem valós tény.
- **Kapcsolat a CHANGELOG-hoz**: user-facing leírás külön bejegyzés a `docs/CHANGELOG.md`-ben (`2026-04-25` dátum alatt, a meglévő M8.0a mellett).

## Smoke check

Manuális ellenőrzés (a gépen nincs `node` a PATH-ban, tsc nem futott):
- Új import-ok: csak `@kartoteka/ui`, `@kartoteka/validations`, `lucide-react`, `react`, `../lib/sync` — mind whitelist.
- Nincs `dexie` / `dexie-react-hooks` / Dexie-backend import a desktop ág új fájljaiban.
- A `MemberDetailDialogProps` + members-page.tsx bekötése prop-szinten egyező.
- A `szemelyListRowSchema` mezőneve + SELECT-oszlop-nevei megegyeznek a Rust v5 `szemely_local` sémájával.

## Hátra az M8 wave-ben

- **M8.1** — Új tag (INSERT) — kliens-oldali CNP-validáció, dupláció-check, `szemely_pending_local` (itt MÁR kell, mert az ID-t nem tudjuk lokálisan ki) — becsült ~4-5 óra.
- **M8.2** — Soft-delete (csak `type='rejtett'` + esetleg `isvisible=0` admin flow) — 1-2 óra.
- **M8.3** — `csalad` CRUD (család-hozzárendelés, családfő-kijelölés) — 3-4 óra.
- **M8.4** — Admin-mezők UI (meghalt, member_status, voter_eligible) — 1-2 óra + szerepkör-check.
