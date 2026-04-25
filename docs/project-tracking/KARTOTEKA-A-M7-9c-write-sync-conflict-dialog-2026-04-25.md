# A-M7.9c — Konfliktus-feloldó dialog (befizetés + kiadás)

**Dátum:** 2026-04-25
**Wave:** A-M7 (pénzügy desktop)
**Státusz:** ✅ Kész (smoke-check zöld; nincs új SQL migráció, nincs új Rust migráció)
**Megelőző:** A-M7.9b (kiadás write-offline)
**Következő:** Bank-import (BCR/Raiffeisen/BT CSV) vagy Oblio Edge Fn — külön session

---

## Kontextus

Az A-M7.9a befizetés és A-M7.9b kiadás write-offline lezárása után az utolsó hiányzó UX-darab a konfliktus-feloldás volt. A `befizetes_pending_local` és `kiadas_pending_local` táblák `sync_state='conflict'` állapotú soraira nem volt aktív UI — csak a sync_error magyarázat látszott.

A chitanta `ChitantaConflictDialog` (A-M7.2d2d) már megvolt; ezt **általánosítottam** közös komponenssé `entity: 'befizetes' | 'kiadas'` paraméterrel. A backend és a sync-helperek mindkét entityre megduplikálódtak — érthető szétválás (entity-specifikus payload-mezők), de azonos szerkezet.

---

## Új fájlok

- `apps/desktop/src/components/write-sync-conflict-dialog.tsx` — közös konfliktus-dialog (~270 sor)
- `docs/project-tracking/KARTOTEKA-A-M7-9c-write-sync-conflict-dialog-2026-04-25.md` — ez a fájl

## Módosított fájlok

- `apps/desktop/src/lib/tauri-sqlite-backend.ts` — 4 új metódus (`deleteLocalBefizetes`, `updateLocalBefizetesNumber`, `deleteLocalKiadas`, `updateLocalKiadasNumber`); `listLocalPendingBefizetes` mostantól `fizetettev` mezőt is ad, `listLocalPendingKiadas` az `ev` mezőt is — a reassign helyes wallet-szegmensből allokál
- `apps/desktop/src/lib/befizetes-write-sync.ts` — új `resolveBefizetesConflict` helper (`BefizetesConflictResolution` + `BefizetesConflictResolutionResult` típusok)
- `apps/desktop/src/lib/kiadas-write-sync.ts` — új `resolveKiadasConflict` helper (azonos minta)
- `apps/desktop/src/pages/befizetes-page.tsx` — `WriteSyncConflictDialog` import + `conflictRow` state + dialog renderelés + `PendingIncomeBlock` props + sor `onClick`/`onKeyDown` (Enter/Space) + `(kattints a feloldáshoz)` címke
- `apps/desktop/src/pages/kiadas-page.tsx` — azonos minta a kiadás-oldalon
- `docs/CHANGELOG.md` — A-M7.9c bejegyzés

---

## Architektúra

### Közös vs. entity-specifikus szétválás

A **TS típusok** (`BefizetesConflictResolution` vs. `KiadasConflictResolution`) és a **sync-helper függvények** (`resolveBefizetesConflict` vs. `resolveKiadasConflict`) szándékosan **két különálló**:

- A reassign-ágban a `enqueueMutation` payload-ja entity-specifikus (befizetés: `id_befizetescel` + `id_szemely` + `id_csalad` + `csalad` + `fizetettev`; kiadás: `id_kiadascel` + `atvevoid` + `atvevo` + `kedvezmenyezett_cui` + `vonatkozo_idoszak`). Egy közös függvény generikusan nehezen kezelné a payload-szerkezetet — két különálló helper világosabb és karbantartható.
- A backend metódusok (`deleteLocalBefizetes` / `deleteLocalKiadas`) szintén entity-specifikusak (két különböző DELETE FROM), és a `updateLocalBefizetesNumber` / `updateLocalKiadasNumber` is két különböző UPDATE-et futtat.

A **közös rétegek**:
- `WriteSyncConflictDialog` UI — `entity` prop alapján döntve hívja a megfelelő helpert; a magyar entitás-címke (`befizetés` / `kiadás`, `befizetést` / `kiadást`) egy `ENTITY_LABEL` const-ban
- `iratszam_wallet_local` Rust tábla és `iratszam_wallet_claim_next` command — közös `tipus` paraméterrel
- `iratszam_pointers` szerver-tábla és `reserve_iratszam` RPC — közös `p_tipus` paraméterrel (ezt már az A-M7.9a kiépítette)

### Ev-mező a pending sorokban

A reassign-flow-nak tudnia kell, melyik **év** wallet-szegmenséből allokáljon (a wallet és a pointer per év). A pending sorokban ez a `fizetettev` (befizetés, FK az `id_befizetescel`-hoz nem kapcsolódik közvetlenül) és `ev` (kiadás, kényelmi mező a Rust DB-ben). Mindkét listing-függvényt bővítettem ezzel a mezővel, és a `WriteSyncConflictDialog`-nak `ev: number` prop-ot adok át.

A befizetésnél a `fizetettev` és a `RecentIncomeSection.year` szűrő **általában egyezik** (a UI csak a kiválasztott évre listáz), de a user másik évre is rögzíthet — ezért a sor saját `fizetettev`-jét használjuk a dialog-hívásban, nem a komponens-szintű `year`-t.

### Conflict-flow folyam (reassign ág)

1. `claimNextIratszamNumber(congregationId, 'befizetes' | 'kiadas', ev, localId)` — atomic szám-kivétel a wallet-ből (Rust tranzakció)
2. `updateLocalBefizetesNumber` / `updateLocalKiadasNumber` — pending sorban iratszam UPDATE + sync_state visszaáll `'pending'`-re + sync_error törölve
3. `removeMutation(localId)` — régi outbox-mutation törlése (csendes, ha már nem létezik)
4. `getLocalBefizetes` / `getLocalKiadas` — friss pending-sor olvasás (a payload-újraépítéshez)
5. `enqueueMutation(...)` — új outbox sor a frissített payload-dal
6. `runBefizetesSyncManually()` / `runKiadasSyncManually()` — fire-and-forget azonnali push trigger

A 1-2 szigorúan sorrendben fut (a wallet-claim atomic), a 3-6 best-effort. Ha a 6 sikertelen: a sor 'pending' marad, a 30 mp-es háttér-poll majd újra próbálja.

### Conflict-flow folyam (delete ág)

1. `deleteLocalBefizetes` / `deleteLocalKiadas` — Rust UPDATE (wallet-release: `used=0`) + DELETE pending sor. Két külön `dbExecute` (a `lib/local-db.ts` nem támogat tranzakciót egy hívásban). Ritka művelet, részleges állapot kockázata elfogadható (ghost wallet-sor, vagy árva pending-sor — mindkettő recover-elhető újra-futtatással).
2. `removeMutation(localId)` — outbox törlése (csendes)

A user felé: 1.2 mp success-üzenet, majd dialog auto-close + parent reload.

### Browser-confirm a delete-en

A delete CTA két lépcsős: első kattintás → `window.confirm()` magyar üzenettel (a chitanta-mintával azonos), majd ha igent mond → a Rust művelet. Ez véletlen-kattintás védelem, és Endre korábban explicit kérte a hard-delete-eknél (a chitanta-flow-ban).

---

## Smoke check eredmények

- ✅ `node scripts/check-desktop-banned-imports.mjs` — 46 fájl, 0 tiltott (45 → 46)
- ✅ `npx tsc --noEmit` packages/core — tiszta
- ✅ `npx tsc --noEmit` apps/desktop — tiszta
- ✅ `cargo check` apps/desktop/src-tauri — 0.74s (nincs Rust változás, csak újra-build)
- ✅ Security secret-grep — 0 találat

---

## Manuális tesztelés (Endre runs)

A konfliktus-flow tesztelése **valós ütközést igényel**, ami szándékosan nehezen reprodukálható:

**1) Mesterséges ütközés — két desktop:**
1. Mindkét desktop offline. Mindkettőn a tárcából foglalsz pl. 5 sorszámot előre (online-módban).
2. Mindkettőn rögzítesz egy befizetést (vagy kiadást) ugyanarra az évre — egy adott számon (pl. mindkettő `887`-et).
3. Az első desktop online → felmegy `887`. A második online → 23505 ütközés → conflict.
4. A második desktop pending blokkjában a `887`-es sor pirossal megjelenik. Kattintásra: dialog.
5. „Másik iratszámra állítás" → wallet-ből új szám pl. `888` → automatikus push → sikerüzenet → reload → a sor kiürül.

**2) Ugyanaz, törléssel:**
- A 4. lépésben „Lokális tétel törlése" → confirm-dialog → wallet-szám visszakerül a pool-ba (a tárca-panel `available` count + 1) → a pending blokk kiürül.

**3) Üres wallet eset:**
- Ha a reassign-pillanatban a wallet üres (mert a többi szám már elfogyott), `walletEmpty: true` flag → magyar üzenet a dialog-ban: „Üres az offline iratszám-tárca a kért évre. Csatlakozz a hálózatra, és tölts fel legalább egy új sorszámot, mielőtt újra próbálkozol."

A 23505-ös valós ütközés ritka — a defensive PARTIAL UNIQUE INDEX (lépés 3 fájl) megvédi, de napi gyakorlatban legtöbbször a `sorozat+szám` szegmens szegmentált, így a két lelkész nem ütközik. A delete-stratégia pedig hibás-rögzítés esetén (lelkész duplán-kattint) használható közvetlenül a Pending blokkból.

---

## Wave-státusz

A pénzügyi **desktop write-offline + konfliktus-feloldás** TELJES:

| Modul | Online write | Offline write | Konfliktus-feloldó UI |
|---|---|---|---|
| chitanță | A-M7.2b ✅ | A-M7.2d ✅ | A-M7.2d2d ✅ |
| befizetés | A-M7.3 ✅ | A-M7.9a ✅ | A-M7.9c ✅ |
| kiadás | A-M7.4 ✅ | A-M7.9b ✅ | A-M7.9c ✅ |
| belső mozgás | A-M7.6 ✅ | (offline-N/A — nem iratszám-alapú) | — |

**Mi marad az A-M7 wave-en belül?**
- **Bank-import** (BCR / Raiffeisen / BT CSV-parsek + matcher + UI) — külön session, ~5 óra
- **Oblio / e-Factura Edge Fn** — secret-gateway építés, ~2-3 nap
- **A-M7.x későbbi UX-polish** — pl. wallet-feltöltés batch méret-választás, conflict-dialog history, sync-indicator click-to-route fine-tuning

A roadmap szerinti következő wave (M8: tagnyilvántartás-write és anyakönyv) már elkezdhető — a write-offline minta most már **bizonyított és újra-felhasználható** (három entity, közös shell-szintű sync-indicator, közös wallet-rendszer évente, közös konfliktus-feloldó UX). Új entity hozzáadása ~3-4 óra (Rust migráció + core save offline-ág + sync-modul + UI integráció).
