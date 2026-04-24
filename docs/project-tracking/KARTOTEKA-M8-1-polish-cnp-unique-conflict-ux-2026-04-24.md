# KARTOTEKA — M8.1 polish: CNP UNIQUE + konfliktus-feloldó UX

**Dátum**: 2026-04-24
**Fázis**: M8.1-polish (CNP server-side UNIQUE + pending-conflict UX)
**Státusz**: ✅ KÉSZ — az M8.1 új-tag wave első polish-köre: szerver-oldali védelem + lelkészi konfliktus-feloldás.

## Két különálló darab

### 1. Szerver-oldali CNP UNIQUE (PARTIAL INDEX)

Az M8.1 kliens-oldali CNP-dup-check csak a helyi kombinált (`szemely_local` + `szemely_pending_local`) ismeretet nézte. Ha két lelkész **egyidejűleg** vesz fel ugyanazt a CNP-t (egyik online, másik offline), akkor a `szemely-write-sync` push-ja sikeres lenne **mindkét oldalról** — és duplikát sor keletkezne a szerveren.

**Megoldás**: `CREATE UNIQUE INDEX ... ON szemely (congregation_id, cnp) WHERE isvisible = true`.

Miért PARTIAL:
- A soft-delete (`isvisible=false`) esetén a CNP **"felszabadul"** — ha egy rejtett tagot újra fel akarunk venni, nem ütközünk.
- A halott (meghalt=true, de isvisible=true) tagok CNP-je továbbra is unique marad.

**SQL fájl**: [`migration-docs/sql/2026-04-24-m8-1-szemely-cnp-unique.sql`](migration-docs/sql/2026-04-24-m8-1-szemely-cnp-unique.sql)

Védelem a migrációban:
1. `DO $$` blokk ellenőrzi, hogy vannak-e létező duplikátumok (isvisible=true + ugyanaz a CNP). Ha igen, `RAISE EXCEPTION` — a migráció nem fut le, előbb kézi rendezés kell.
2. A fájl végén `SELECT` lekérdezi a duplikátumokat (ha mégis kellene debug-olni).
3. Ellenőrző `SELECT` az index-létrejöttet verifikálja.

Az index neve: `uniq_szemely_cnp_congregation_visible`.

Endre futtatja majd manuálisan ([memóriás szabály](feedback_supabase_access)).

### 2. Konfliktus-feloldó UX a pending-blokkon

Az M8.1 alapban a pending-blokkban csak **jelezte** a konfliktust: piros "⚠ ütközés" badge + a szerver-üzenet egy sorában. A feloldást a user magának kellett megoldania — pl. `szemely_pending_local` sort SQL-ben törölnie. Ez nem felhasználóbarát.

**Megoldás**: `SzemelyConflictDialog` — kattinthatóvá vált a conflict-sor, a lelkész modális dialogot kap:

- **Fejléc**: piros `AlertCircle` ikon + "Ütközés a szinkronizálásnál" + tag-név + CNP (mono)
- **Szerver-üzenet panel**: piros háttér, a `sync_error` szövegével + retry_count
- **Útmutatás**: mikor melyik opció
- **Akciók** (2 gomb + Mégse):
  - **Törlés** (rose bg, Trash2 ikon) — browser-confirm + `deleteLocalPendingSzemely`
  - **Újrapróbálkozás** (sky border, RotateCw ikon) — `resetSzemelyPendingStatus` → `sync_state='pending'`, `retry_count=0`
- **Success banner** 900 ms-ig, majd auto-close + parent list-refresh

**Design-döntés — NINCS "reassign" ág**:

A pénzügyi `WriteSyncConflictDialog` (A-M7.9c) 2-ágú volt: delete / reassign. A reassign új iratszámot allokált a walletből és újraküldte. Szemely-nél **nincs iratszám**, és a CNP maga a tag azonosítója — másik CNP-re állítani tévedés lenne (az már egy **másik személy** lenne). Ha új CNP-vel akar felvenni egy tagot a lelkész, az "Új tag" gombbal megteheti.

**Új TauriSqliteBackend metódus**: `resetSzemelyPendingStatus(localId)`:
```sql
UPDATE szemely_pending_local
   SET sync_state = 'pending', retry_count = 0,
       sync_error = NULL, last_attempt_at = NULL,
       updated_at = datetime('now')
 WHERE id = ?1
```

### Pending-blokk integrációja

A members-page `pendingRows.map`-je:
- A `div` most conditional `role="button"` + `tabIndex={0}` + `onClick` + `onKeyDown` (Enter/Space) a conflict sorokra
- Hover: `hover:bg-rose-100/60`
- "kattints a feloldáshoz →" felirat jobb oldalt a conflict-sorokon
- A pending (`várakozik`) sorok **nem kattinthatók** — nincs mit feloldani, a sync majd megpróbálja

A dialog render a members-page alján, feltételesen a `conflictRow` state alapján. `onResolved` → `void loadPending() + void loadList()`.

## Fájlváltoztatások

### Új

- `migration-docs/sql/2026-04-24-m8-1-szemely-cnp-unique.sql` — PARTIAL UNIQUE INDEX + duplikátum-check + ellenőrző SELECT-ek
- `apps/desktop/src/components/szemely-conflict-dialog.tsx` (~175 sor) — delete / retry / mégse, pasztorális UX
- `docs/project-tracking/KARTOTEKA-M8-1-polish-cnp-unique-conflict-ux-2026-04-24.md` — ez a doksi

### Módosított

- `apps/desktop/src/lib/tauri-sqlite-backend.ts` — új `resetSzemelyPendingStatus(localId)` metódus
- `apps/desktop/src/pages/members-page.tsx` — `conflictRow` state + dialog render + pending-sorok kattinthatósága (csak conflict-nál)
- `docs/CHANGELOG.md` — 2026-04-24 M8.1-polish bejegyzés

## Ellenőrzés

- Manuális kódellenőrzés (tsc nem futott, Node nincs PATH-ban):
  - Új imports csak whitelist
  - A `deleteLocalPendingSzemely` és `resetSzemelyPendingStatus` mindkettő csak a `szemely_pending_local`-t érinti (nem a szerver)
  - A members-page JSX a feltételes `role="button"` trükköt használja (a pending sor csak akkor kattintható ha conflict)

## Hátra az M8 wave-ben

- **M8.3** — Család-kezelő UI (~4-6 óra): `csalad` tábla pull (Rust v17 migráció: `csalad_local` + `gyerek_local` junction), család-lista + család-detail dialog, családfő-kijelölés, tagok hozzáadása/eltávolítása. Nagyobb iteráció, friss session-re javasolt.
- **Tauri v2 auto-updater aktiválása** — a /offline flow polish-a, a GitHub Releases source-of-truth-hoz kapcsolódik
- **`adrstreet` cím-FK lookup** — a kliens V1-ben a `c_utcaid=-1` dummy-t küld; jövőbeli polish lookup UI + backfill script
