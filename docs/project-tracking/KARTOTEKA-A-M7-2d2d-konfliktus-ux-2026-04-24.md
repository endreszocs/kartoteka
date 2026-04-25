# A-M7.2d2d — Konfliktus-UX (lokális chitanța rendezése szerver-elutasítás után)

**Dátum:** 2026-04-24
**Scope:** `ChitantaConflictDialog` komponens + 2 feloldó útvonal (új szám / törlés) + backend + helper
**Státusz:** ✅ kész, funkcionálisan zárt A-M7.2d2 kör
**Kapcsolódó fázisok:** A-M7.2d1 (wallet), A-M7.2d2a (chitantak_local), A-M7.2d2b (offline-ág), A-M7.2d2c (auto-push)

---

## 1. Mit ad ma a lelkésznek?

**A-M7.2d2c** óta ha a push-ban konfliktus jön (sorszám-ütközés vagy 5× retry), a sor `sync_state='conflict'` állapotba billen. Addig csak *látta* a lelkész a piros „Konfliktus" címkét — ma **fel tudja oldani**:

1. Kattint a piros „Konfliktus — kattints a feloldáshoz" feliratú sorra
2. Modal nyílik: „Szinkronizációs konfliktus"
   - Mutatja a chitanta adatait (sorozat/szám, dátum, befizető, összeg)
   - Rózsaszín keretben idézi a szerver-üzenetet (pl. „A EREKC24/204 sorszám a szerveren már foglalt…")
3. Két megoldási út:
   - **Másik sorszámra állítás** (primary) — új sorszámot vesz a walletből, a chitanta adatai változatlanok, a szinkronizációs sor újra-enqueue-olva, auto-sync azonnal fut
   - **Lokális chitanta törlése** (destructive) — browser confirm + chitanta törlése + wallet-szám visszakerül a pool-ba

**UX-alapelvek** (`feedback_modal_design_system` + `feedback_lelkesz_informalas`):
- Serif cím, overlay blur, X-gomb
- Két nagy CTA gomb, minden gombnak 2-soros leírása (a lelkész nem technikai háttérrel is megérti)
- Loading-state (spinner a gomb ikonon), success-state (zöld sáv 1.2-1.5 mp-ig), error-state
- „Mégse" ghost-gomb jobbra lent
- A feloldás után automatikusan újratöltődik a lista, a sor eltűnik a pending-blokkból

---

## 2. Mi változott?

### 2.1 `TauriSqliteBackend` — 3 új metódus

**Fájl:** `apps/desktop/src/lib/tauri-sqlite-backend.ts`

```ts
async deleteLocalChitanta(localId: string): Promise<void>
async updateLocalChitantaNumber(
  localId: string,
  newSorozat: string,
  newSzam: number,
): Promise<void>
async getLocalChitanta(localId: string): Promise<LocalChitanta | null>
```

- **`deleteLocalChitanta`** — 2 SQL: (1) wallet-szám `used=0` visszaadás a `used_for_chitanta_local_id` ref alapján, (2) `DELETE FROM chitantak_local`. Külön hívások, mert a Rust `dbExecute` nem támogat több utasítást egy hívásban; a részleges állapot kockázata elfogadható (ritka művelet, a user újra tudja futtatni).
- **`updateLocalChitantaNumber`** — `UPDATE` a sorozat+szám mezőkön, `sync_state='pending'` + `sync_error=NULL` visszaállítás; a retry újra nekifut
- **`getLocalChitanta`** — egyetlen sor lekérdezés `SELECT` + ID — a `resolveChitantaConflict` reassign-ágához kell az új outbox-mutation payload-hoz. (Alternatíva: a core `StorageBackend.findByPk` signature-t használnánk, de az `TableRegistryEntry`-t igényel, amit nem akarok itt kitalálni — a direct `dbSelect` egyszerűbb.)

### 2.2 `chitanta-sync.ts` bővítés — `resolveChitantaConflict` helper

**Fájl:** `apps/desktop/src/lib/chitanta-sync.ts`

Új típusok + függvény:

```ts
export type ConflictResolution =
  | { action: 'delete'; localId: string }
  | { action: 'reassign'; localId: string; congregationId: string; sorozat?: string | null }

export type ConflictResolutionResult =
  | { success: true; action: 'delete' }
  | { success: true; action: 'reassign'; newSorozat: string; newSzam: number }
  | { success: false; error: string; walletEmpty?: boolean }

export async function resolveChitantaConflict(
  input: ConflictResolution,
): Promise<ConflictResolutionResult>
```

**Delete-ág flow:**

```
deleteLocalChitanta(localId)
  → wallet-szám used=0 visszaadás + row törlés
  → mutation törlés (csendes, ha már nincs)
  → { success: true, action: 'delete' }
```

**Reassign-ág flow:**

```
claimNextWalletNumber
  ├─ null → { success: false, error, walletEmpty: true }
  └─ claim ok
updateLocalChitantaNumber(localId, newSorozat, newSzam)
removeMutation(old) csendes
getLocalChitanta(localId)  (a fresh payload-hoz)
  └─ null → { success: false, error }
enqueueMutation(új, frissített payload-dal)
void runChitantaSyncManually()  (háttérben azonnal push)
  → { success: true, action: 'reassign', newSorozat, newSzam }
```

**Kulcs tervezési döntés:** a **régi wallet-szám `used=1` marad** reassign után — ez az „audit-trail". A szerver elvette az eredeti számot (23505-ös ütközés), a kliens-oldali wallet-sor nem szabadul vissza, mert nem akarunk olyan látszatot, hogy a szám újra-használható. Ez a „dead" wallet-sor egyszerűen statisztikai ghost-sor, ami a debug-nál segít.

### 2.3 `ChitantaConflictDialog` komponens — új fájl

**Fájl:** `apps/desktop/src/components/chitanta-conflict-dialog.tsx` (~200 sor)

- Fix overlay-modal (z-50) + központosított kártya
- Cím: „Szinkronizációs konfliktus" (serif + bold)
- Ikon: `AlertTriangle` rózsaszín
- Chitanta-infó slate háttéren
- Szerver-üzenet (`sync_error`) rose háttéren
- 2 nagy CTA (Button primary + Button outline destructive-themed)
- Mégse ghost-gomb
- `submitting: null | 'reassign' | 'delete'` state a gombok disabled-láncához
- Browser `confirm()` a delete előtt (double-opt-in)
- `onResolved()` callback a parent-felé (reload-trigger)

### 2.4 `RecentChitantasSection` integráció

**Fájl:** `apps/desktop/src/pages/chitanta-page.tsx`

- Új import: `ChitantaConflictDialog`
- Új state: `conflictFor: LocalPendingChitanta | null`
- A pending-blokk listájában a `sync_state === 'conflict'` sorra `cursor-pointer` + `hover:bg-rose-50/60` + `onClick` handler
- A piros címke szöveg-bővítés: „Konfliktus — kattints a feloldáshoz"
- A sor `title` tooltip: „Kattints a konfliktus feloldásához (új sorszám vagy törlés)"
- A sztornó-dialog után a conflict-modal renderelése (feltételes)

---

## 3. Verifikáció

| Check | Eredmény |
|---|---|
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ **33 fájl** (új chitanta-conflict-dialog.tsx), 0 tiltott |
| Web / core / Rust nem érintett | — |

**Nem tesztelt:**
- E2E: offline kiállítás → unique-conflict scenario → modal → reassign → sikeres resync
- Modal ARIA-kezelés (screen reader) — pasztorálisan OK, nem mélyítve
- Parallel reassign (két gyors kattintás) — a `submitting` state védi

---

## 4. Biztonság

1. **Wallet-szám referencia** — a `deleteLocalChitanta` SQL `WHERE used_for_chitanta_local_id = ?` szelektív, más user wallet-számát nem érinti (a wallet table-ban a congregation_id-n keresztül van szeparáció)
2. **Reassign nem duplikál** — először töröljük a régi mutation-t (ha van), aztán enqueue-oljuk az újat. Ha a régi már a szerveren volt (ritka: 23505 másik irányból), az új is 23505-re megy → újra conflict, a user ismételheti
3. **Delete-confirm** — `window.confirm()` védi a véletlen kattintást
4. **Session-check nem szükséges** — a feloldás csak a LOKÁLIS DB-t érinti (az enqueue a megfelelő helyre teszi a mutation-t, a push maga ellenőrzi a session-t)

---

## 5. Jövőbeli bővítések (A-M7.2d2e és később)

**Nem blokkoló, nice-to-have-ek:**

- **Shell-szintű sync-indicator** — sárga pont + tooltip a sidebar top-ján, ha van `pending > 0`. Minden oldalon látható, nem csak a `/penzugy/chitanta`-n.
- **„Üdv vissza" banner** — ha 5+ pending chitanta van és most jön online a user (pl. több napos offline után), dedikált welcome-banner: „12 chitanța vár feltöltésre. Sync indítása…"
- **Exp-backoff** — a jelenlegi 30s poll minden pending sort újrapróbál. 5 retry-ig ez nem baj, de 5 konkurens chitanta esetén burst. Egyszerű javítás: a `pushPendingChitantas` skippelje azt a mutation-t, aminek `last_attempt_at` a megfelelő backoff-sáv alatt van.
- **Konfliktus-log** — admin oldalon a server-side audit: „N conflict history rekord az utóbbi 7 napban". Ez a `congregations.config.audit_chitanta_conflicts` táblához lenne kötve (később).

---

## 6. A-M7.2d2 kör — ÖSSZEGZÉS

**4 alfázis, 2 nap, teljes offline→online→conflict-resolve kör:**

| Alfázis | Státusz | Szállítás |
|---|---|---|
| A-M7.2d1 | ✅ | Wallet-infra: RPC `reserve_chitanta_numbers`, Rust v10 `chitanta_wallet_local`, core `refillChitantaWalletUseCase`, desktop `ChitantaWalletPanel` |
| A-M7.2d2a | ✅ | Rust v11 `chitantak_local` tábla, atomikus `chitanta_wallet_claim_next` + `chitanta_wallet_release` commands |
| A-M7.2d2b | ✅ | Core `issueChitantaUseCase` offline-ág, `OfflineChitantaBackend` interface, desktop form offline-flow, borostyán sikersáv, pending-blokk UI |
| A-M7.2d2c | ✅ | Auto-push (`chitanta-sync.ts`): window.online listener + 30s poll + manuális „Sync most" gomb, markSynced/markConflict backend, session-check védelem |
| A-M7.2d2d | ✅ | Konfliktus-UX: `ChitantaConflictDialog` modal, `resolveChitantaConflict` helper (delete + reassign ágak), `deleteLocalChitanta` + `updateLocalChitantaNumber` + `getLocalChitanta` backend |

**A-M7.2 chitanța-kör 6 alfázis után TELJES LEZÁRVA.** A következő A-M7.3+ a többi pénzügyi use-case (befizetés, járulék, bank-import).

---

## 7. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — user-facing A-M7.2d2d bejegyzés a következő diff-ben
3. **Obsidian (Kartotéka AGY)** — az A-M7.2d1-d2 teljes kör (most már lezárt) egyetlen atomic-note-ot kaphat: „Offline chitanta-kiállítás élet-ciklusa — kiállítás, szerverre-push, konfliktus-feloldás". Ezt Endre manuálisan, vagy a köv. session írhatja.
