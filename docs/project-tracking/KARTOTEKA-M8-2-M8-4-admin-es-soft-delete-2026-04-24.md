# KARTOTEKA — M8.2 + M8.4: Soft-delete + admin-jelzők (desktop)

**Dátum**: 2026-04-24
**Fázis**: M8.2 (soft-delete a `isvisible` flag-en) + M8.4 (admin-jelzők UI)
**Státusz**: ✅ KÉSZ — a `MemberDetailDialog` most teljes CRUD-szerű UX-et ad a tagokra: lista + olvasás + szerkesztés + rejtés/visszahozás + admin-jelzők.

## Mit takar

Az M8.0b-ben az edit-dialog csak a "nem-érzékeny" mezőket (név, cím, kontakt, identitás) engedte szerkeszteni. Ez az iteráció beemeli a lelkészi napi munkához szükséges admin-flag-eket (elhunyt, választó, családfő, tagsági kategória), és bevezet egy **soft-delete** flow-t a `isvisible` flag-re.

## UX-döntések

### M8.4 — Admin-jelzők szekció az edit-módban

Új csoport a form-ban: **"Tag-jelzők (adminisztratív)"**. Ez `CheckboxRow` komponensekkel jeleníti meg:

- **Elhunyt** (`meghalt: boolean`) — ha bejelölve, a listán `†` jellel + áthúzott névvel jelenik meg.
- **Választó** (`voter_eligible: boolean`) — ki jogosult presbitérium-, lelkész- és gondnokválasztásra.
- **Családfő** (`csaladfo: boolean`) — a család hivatalos képviselője; általában egy a család-egységben.
- **Tagsági kategória** (`member_status: string` select) — opciók: `aktív` / `kitért` / `törölt` / `mas_vallasu` + "— nincs beállítva —" fallback.

**Ki férhet hozzá?** Jelenleg minden, aki a tagot szerkesztheti (a szerver-oldali RLS csak a saját gyülekezetre enged írási jogot). Szerepkör-specifikus szűkítés (pl. csak admin/lelkész) későbbi körbe halasztható; most a pasztorális munkához mind elengedhetetlen.

**Pasztorális hangnem**: a szekció bevezetője kérdezteti a gondnokot/presbitériumot, ha a lelkész bizonytalan egy beállításban.

### M8.2 — Soft-delete: "Elrejtés / Visszahozás" gomb

A `view-mode` gombsor most két gombot mutat:
- **Szerkesztés** — a meglévő edit-flow
- **Elrejtés** (ha `isvisible=1`) vagy **Visszahozás** (ha `isvisible=0`) — **új gomb**

### "Elrejtés" flow
1. Browser-confirm: `Elrejted a "${név}" nevű tagot? A tag adatai megmaradnak — a "Rejtett" szűrővel bármikor visszahozhatod.`
2. `updateSzemelyEntry(userId, id, { isvisible: false }, revision)` — ugyanaz a sync-helper, mint az edit-hez.
3. Eredmény: banner (sikeres / offline / conflict), majd 800ms után `onClose()` (a tag eltűnt a default listából, a dialog becsukódik).

### "Visszahozás" flow
Ugyanígy, csak `isvisible: true` patch-csel, és a `"Rejtett"` szűrőben látható tagot újra aktívvá teszi.

### Miért külön gomb, miért nem checkbox az admin-szekcióban?

- Az `isvisible` toggle **nem tagsági jelzés**, hanem lista-szintű megjelenítési döntés.
- Külön gomb → külön confirm → kevesebb tévedés. A lelkész nem véletlenül rejti el a tagot egy szerkesztés-menet közben.
- A "Rejtett" szűrővel visszaszerezhető — a tag nem tűnik el végleg.

### Header-badge-ek bővítése

A dialog fejlécében a meglévő badge-ek (családfő, választó) mellé bekerültek:
- **rejtett** (slate-200, csak ha `isvisible=0`)
- **`member_status` nem-'aktív' érték** (indigo-100, pl. "kitért", "törölt", "mas_vallasu")

Így a lelkész egy pillantással látja a tag összes státusz-flag-jét.

## Technikai részletek

### `EditableFields` bővítés

A form-state most 4 új kulcsot tárol: `meghalt`, `voter_eligible`, `csaladfo`, `member_status`. A boolean flag-ek **stringként** tárolódnak (`'0'` / `'1'`), hogy a `EditableFields` típus egységes `Record<string, string>` szerkezetet tartson — az `extractEditable` és `buildPatch` konvertálja boolean-ná a patch-be.

### `EDITABLE_KEYS` → `EDITABLE_TEXT_KEYS` + `EDITABLE_BOOL_KEYS`

A korábbi egységes `EDITABLE_KEYS` tömb **kettévált**:
- `EDITABLE_TEXT_KEYS` — 20 string-típusú mező (beleértve `member_status`)
- `EDITABLE_BOOL_KEYS` — 3 boolean-típusú mező (`meghalt`, `voter_eligible`, `csaladfo`)

A `buildPatch` külön-külön megy végig rajtuk, a boolean-diffet explicit összeveti (`1 === 1` → stabil, nem csak string-identitás).

### Zod-séma bővítés (`szemelyUpdateInputSchema`)

Új mező: `isvisible: z.boolean().optional()`. Ez szükséges, mert a `handleToggleVisibility` a `updateSzemelyEntry`-nek közvetlenül `{ isvisible: boolean }` patch-et küld — a zod-sémához hozzáadjuk a konzisztenciáért (később a web Server Action is validálhatja ugyanazt).

### `CheckboxRow` komponens

Egységes megjelenésű checkbox-sor: bal oldalt a natív `<input type="checkbox">` (violet-600 accent-szín), jobb oldalt `label` + hint-szöveg. A hint-szöveg a pasztorális UX-elvek mentén magyaráz, nem pedig parancsol.

## Fájlváltoztatások

- `packages/validations/src/members/szemely-save.ts` — `isvisible: z.boolean().optional()` hozzáadva
- `apps/desktop/src/components/member-detail-dialog.tsx` — főbb bővítések:
  - `EditableFields` + 4 új kulcs
  - `MEMBER_STATUS_OPTIONS` konstans
  - `handleToggleVisibility` async fn (M8.2)
  - `EditBody` — új "Tag-jelzők" szekció 3 `CheckboxRow` + 1 `select`-tel
  - `CheckboxRow` komponens
  - Header-badge-ek bővítése (rejtett + member_status)
  - Footer view-mode 2 gombra bővült (Szerkesztés + Elrejtés/Visszahozás)
  - `EDITABLE_TEXT_KEYS` + `EDITABLE_BOOL_KEYS` szétválasztás
  - `extractEditable` + `buildPatch` boolean-kezelés

- `docs/project-tracking/KARTOTEKA-M8-2-M8-4-admin-es-soft-delete-2026-04-24.md` **[új]** — ez a dokumentum
- `docs/CHANGELOG.md` — 2026-04-24 M8.2/M8.4 bejegyzés

**Nincs új SQL/Rust migráció** — a `szemely` tábla `isvisible` + `meghalt` + `voter_eligible` + `csaladfo` + `member_status` mezői már az eredeti sémában megvoltak. A `szemely_local` Rust v5 migrációban szintén szerepelnek.

## Hátra az M8 wave-ben

- **M8.1** — Új tag (INSERT) — itt MÁR kell `szemely_pending_local` tábla, mert az id-t lokálisan nem tudjuk. Becsült: ~4-5 óra.
- **M8.3** — Család-CRUD (család-hozzárendelés, családfő-kijelölés). Becsült: ~3-4 óra.
- **Kisebb polish**: a "Mind" szűrő felülbírálata, hogy a rejtett tagokat is mutassa (jelenleg kizárja).
