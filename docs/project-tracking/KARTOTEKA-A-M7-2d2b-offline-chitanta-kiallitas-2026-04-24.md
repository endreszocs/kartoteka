# A-M7.2d2b — Offline chitanța-kiállítás (kliens-oldali flow)

**Dátum:** 2026-04-24
**Scope:** `issueChitantaUseCase` offline-ág, desktop form + lista UI, pending chitanța megjelenítése
**Státusz:** ✅ kliens-flow kész, az outbox-push (A-M7.2d2c) a következő
**Kapcsolódó fázisok:** A-M7.2d1 (wallet-infra), A-M7.2d2a (chitantak_local tábla + claim command)

---

## 1. Mit ad ma a lelkésznek?

**Offline chitanța-kiállítás első felhasználható formában.**

Ha a gép offline és a szám-tárcában van legalább 1 szabad sorszám:
- A `/penzugy/chitanta` oldalon a kiállítás form **engedélyezve marad**
- A "Chitanță kiállítása" gomb felirata → „Chitanță kiállítása offline"
- A form alatt kék tájékoztató sáv: „Offline mód: a sorszám automatikusan a szám-tárcából kerül ki…"
- Sikeres beküldés után **borostyán színű sikersáv** (nem a zöld online-sikersáv): „Chitanță offline rögzítve." + magyarázat a szinkronra
- Az „Utolsó chitantáim" szekció fölött **borostyán blokk jelenik meg**: „🕓 Szinkronizálásra várnak (N)" — az `offline` címkés sorokkal

**Ami NEM változott (még):**
- A szerver-oldali `oblio_szamlak.insert` nem történik meg — az offline chitanța a `chitantak_local` táblában + az outbox-ban vár
- A push-sync (A-M7.2d2c) még nem fut — a user a *visszakapcsolt hálózattal* még nem fogja automatikusan látni a szerveren a kiállított chitanțákat. A lokális pending lista marad, míg manuálisan újra nem kattintunk (az A-M7.2d2c hozza az automatikus push-ot)

---

## 2. Mi változott?

### 2.1 Core — `issueChitantaUseCase` offline-ág

**Fájl:** `packages/core/src/finance/chitanta/issue.ts`

Új típusok:

```ts
export interface OfflineChitantaBackend {
  claimNextWalletNumber(
    congregationId: string,
    sorozat: string | null,
    chitantaLocalId: string,
  ): Promise<{ id: number; szam: number; sorozat: string } | null>

  releaseWalletNumber(walletId: number): Promise<void>

  insertLocalChitanta(row: LocalChitantaRow): Promise<void>

  enqueueMutation(mutation: OfflineMutation): Promise<void>
}

export interface LocalChitantaRow { /* 14 mező — a chitanta-insert payload */ }

export interface OfflineMutation { /* @kartoteka/offline-sync Mutation-kompat shape */ }
```

Új ctx-mezők:

```ts
export interface IssueChitantaCtx {
  // ... meglévő mezők
  /** Hálózati állapot (default: true). */
  isOnline?: boolean
  /** Desktop offline-backend. Web-en undefined. */
  offlineBackend?: OfflineChitantaBackend
}
```

Új result-flag:

```ts
export type IssueChitantaResult =
  | { success: true; chitantaId: string; sorozat: string; szam: number; pending?: boolean }
  | { success: false; error: string; offlineNotSupported?: boolean;
      duplicateNumber?: boolean; walletEmpty?: boolean }
```

**Flow:**

```
handleSubmit
  ↓
zod-validálás (mindkét ág)
  ↓
sorozat-eldöntés (input / default / 'CHIT' fallback)
  ↓
isOnline?
├─ true → online-ág (meglévő A-M7.2b logika)
└─ false
    ├─ offlineBackend undefined → {error, offlineNotSupported}
    ├─ input.szam megadva → {error} (kézi override offline-ban tilos)
    └─ offlineBranch:
        ├─ claim next wallet number (atomikus)
        │  ├─ null → {error, walletEmpty}
        │  └─ claim ok
        ├─ insertLocalChitanta
        │  └─ HIBA → releaseWalletNumber + {error}
        ├─ enqueueMutation (oblio_szamlak insert)
        │  └─ HIBA → {error} (wallet-szám benne marad,
        │                     lokális sor létezik — user retry)
        └─ {success: true, chitantaId: 'local-<uuid>', pending: true}
```

**Tervezési döntések:**
- **Duck-typing interface** — a core nem importál `@kartoteka/offline-sync`-ből; a `TauriSqliteBackend` osztály strukturálisan kielégíti az `OfflineChitantaBackend` kontraktot.
- **`releaseWalletNumber` csak pre-outbox** — ha a lokális insert bukik, a szám visszakerül a pool-ba. Ha az outbox enqueue bukik, a szám **benne marad** használtnak, mert a lokális sor létezik → user retry a "Sync most" gombbal (A-M7.2d2c).
- **`befizetes_id` string-ként tárolva** — a szerver-oldalon integer, offline-ban szöveg (UUID-kompat). A pusher a push előtt parse-olja.
- **Nincs szerver-RPC hívás offline-ban** — a `navigator.onLine === false` esetén **egyáltalán nem** próbálja a `next_chitanta_number()` RPC-t. Ez megakadályozza a DNS-timeout-os 5-10 mp-es lagekodást.

### 2.2 TauriSqliteBackend — 2 új metódus

**Fájl:** `apps/desktop/src/lib/tauri-sqlite-backend.ts`

```ts
async insertLocalChitanta(row: LocalChitantaRow): Promise<void>
async listLocalPendingChitantas(congregationId: string): Promise<LocalPendingChitanta[]>
```

- **`insertLocalChitanta`** — 14 oszlopos INSERT a `chitantak_local`-ba, `sync_state='pending'` default-tal
- **`listLocalPendingChitantas`** — a `pending` és `conflict` state-ű sorok, rendezve `szamla_datum DESC, created_at DESC`. A `RecentChitantasSection` kettős-listájához.

### 2.3 Desktop UI — `chitanta-page.tsx` 4 változás

1. **`ChitantaWalletPanel.onStatusChange` callback** — a panel a `getWalletStatus` minden sikeres betöltése után értesíti a parent-et a szabad-szám-mennyiségről. A parent (`ChitantaPage`) `walletAvailable` state-be menti.

2. **`canIssue` feltétel bővítés** — `isOnline` helyett `(isOnline || walletAvailable > 0)`. Offline-módban is engedélyezzük a formot, ha van szám.

3. **`OfflineWarning` 2-állapotú:**
   - `walletAvailable > 0`: kék „a tárcából állítunk ki" tájékoztató
   - `walletAvailable === 0`: klasszikus narancs „kiállítás szünetel" + instrukció a tárca-feltöltésre

4. **`IssueChitantaForm` offline-flow:**
   - Új prop: `isOnline`, `walletAvailable`
   - Új state: `walletEmptyError`
   - A ctx-be `isOnline` + `offlineBackend` (conditional a `isOnline` alapján)
   - Gomb-felirat dinamikus: „Kiállítás…" ↔ „Offline mentés…" / „Chitanță kiállítása" ↔ „…offline"
   - Új error-stílus: `walletEmpty` → narancs sáv (a klasszikus offline-warning-gal egyezik)
   - Új info-sáv: ha `!isOnline && walletAvailable > 0 && !error` → kék tájékoztató

5. **Siker-banner bővítés:**
   - `success.pending === true` → borostyán (`amber-`) stílus
   - Szöveg: „Chitanță offline rögzítve." + magyarázat a push-ról
   - `success.pending === false` → eredeti zöld (`emerald-`) stílus

### 2.4 Desktop UI — `RecentChitantasSection` bővítés

**3 változás:**

1. **Dupla load** — `listChitantasUseCase` (szerver) + `listLocalPendingChitantas` (lokális) egymás után. A szerver-lista hálózati hibáját tudatosan elnyeli (offline-módban nem hiba, csak üres).

2. **Lokális-blokk megjelenítése** — ha van `localPending` sor, a szerver-lista **fölött** borostyán-keretes blokk:
   - Címke: „🕓 Szinkronizálásra várnak (N)"
   - Sor-megjelenítés: sorozat/szám + dátum + összeg + átvevő + (konfliktus esetén) indoklás
   - „offline" chip a jobb oldalon
   - Ha `sync_state === 'conflict'` → piros „Konfliktus" label

3. **Üres-állapot check bővítés** — `rows.length === 0 && localPending.length === 0` (nem csak `rows.length === 0`).

---

## 3. Verifikáció

| Check | Eredmény |
|---|---|
| `npx tsc --noEmit` (packages/core) | ✅ 0 error |
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `npx tsc --noEmit` (apps/web) | ✅ 0 error (a web adapter változatlanul működik — az `isOnline` default-oltan `true`, az `offlineBackend` undefined) |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ 31 fájl, 0 tiltott |
| `cargo check` nem futott újra — nincs Rust-változás | — |

### Nem tesztelt
- **E2E funkcionális smoke test** — a kliens offline-módba kapcsolása + form-beküldés + SQLite inspect még nem fut (a dev-runtime futtatása a **következő** Endre-ellenőrzés része)
- **Outbox tartalom a push-ra** — a mutation bekerül a `outbox` táblába, de a pusher (A-M7.2d2c) még nem olvassa
- **Konfliktus-UX** — a `conflict` state megjelenítése megy, de a rendbe-rakás (A-M7.2d2d) még nincs

---

## 4. Szerverre még nem ment fel

A **kliens-oldali flow teljes**, de a szerver-oldali push még **nincs implementálva** (A-M7.2d2c):

1. User offline: form kitöltés → submit → `chitantak_local`-ba bekerül, outbox-ban sor
2. User online-ra vált → **jelenleg NEM történik semmi** — a pending lista ott marad, a szerver nem tud róla
3. Következő fázis (A-M7.2d2c): háttér-task vagy „Sync most" gomb, ami olvassa az outboxot + küldi a `oblio_szamlak.insert`-eket
4. Sikeres push → `sync_state='synced'`, `server_id=<szerver-uuid>`; a pending-listáról eltűnik
5. Sikertelen push: ha hálózati → retry exp-backoff; ha unique-constraint-ütközés (a szerveren időközben más számot adtak ki) → `sync_state='conflict'`, user-dönti szükséges

Fontos: **a lelkésznek világos kommunikáció** megy ehhez (`feedback_lelkesz_informalas`):
- A sikersáv explicit: „A chitanță lokálisan elmentve…amint a gép online lesz, automatikusan feltöltjük."
- A RecentChitantasSection pending-blokkja félrevezetés-mentes: „Szinkronizálásra várnak (N)"

---

## 5. Tovább — A-M7.2d2c (következő iteráció)

- [ ] Outbox-pusher implementáció: periodikusan (online-váltáskor + 30s-onként) olvassa az outbox-ot
- [ ] `oblio_szamlak.insert` call szerveren a mutation payload-dal
- [ ] Siker: `UPDATE chitantak_local SET sync_state='synced', server_id=?` + `removeMutation`
- [ ] Sikertelenség: exp-backoff retry max 5x → conflict
- [ ] UI: „Sync most" gomb manuális kiváltáshoz + sync-status indicator a shell-ben

---

## 6. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — user-facing bejegyzés a következő commitban (a A-M7.2d2b már látható a UI-n, érdemes kommunikálni)
3. **Obsidian (Kartotéka AGY)** — az A-M7.2d2 teljes-kör (d2a+d2b+d2c+d2d) után összevont atomic note; most még nincs
