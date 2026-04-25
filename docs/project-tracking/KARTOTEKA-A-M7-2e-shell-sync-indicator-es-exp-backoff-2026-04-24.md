# A-M7.2e — Shell-szintű sync-indicator + exp-backoff (polish)

**Dátum:** 2026-04-24
**Scope:** globális sync-indicator komponens + exponenciális backoff a retry-okhoz
**Státusz:** ✅ kész — a chitanța-offline kör UX-e lekerekítve
**Kapcsolódó fázisok:** A-M7.2d2c (auto-push), A-M7.2d2d (konfliktus-UX)

---

## 1. Mit ad ma a lelkésznek?

**1. Globális szinkronizáció-státusz jelző** a jobb-felső sávban, minden autentikált oldalon:

- **Elrejtve** — ha nincs offline-chitanta várakozóban (tiszta állapot)
- **🟡 Borostyán** — „3 chitanță szinkronra vár" — normál offline-gyűjtés után
- **🔴 Rózsa** — „1 konfliktus feloldást vár" — kiemelt figyelmeztetés, akciót igényel
- **Kattintásra** → azonnal a `/penzugy/chitanta` oldalra visz, ahol a feloldás zajlik

Eddig a lelkész csak a chitanța-oldalon látta a pending állapotot. Most **akárhol** dolgozik (tagnyilvántartás, jegyzőkönyv, stb.), rögtön észreveszi, ha szinkron vár.

**2. Exponenciális backoff a retry-okhoz.** Eddig minden 30 mp-es poll **minden** sikertelen mutation-t újrapróbált — ha 5 chitanta ütközött párhuzamosan, 5 egymásba ágyazott retry fut a szerverre 30s-enként. Most:

| Kísérlet | Következő után várakozik |
|---|---|
| 1 | 30 mp |
| 2 | 1 perc |
| 3 | 2 perc |
| 4 | 5 perc |
| 5 | 15 perc |
| 6 | → conflict (végleges) |

Így a szerver nem kap burst-szerű újra-beszúrásokat, és a hálózat is kíméletesebb.

A **„Sync most" manuális gomb** átlépi a backoff-ot — ha a user azonnal akarja próbálni, nem kell 15 percet várnia.

---

## 2. Mi változott?

### 2.1 `SyncStatusIndicator` — új komponens

**Fájl:** `apps/desktop/src/components/sync-status-indicator.tsx` (~130 sor)

- **Adatforrás:** `TauriSqliteBackend.listLocalPendingChitantas()` — nem új API, a meglévőt használja, JS-ben count-ol
- **Polling:** 15 s-enként (a 30 s push-poll felénél, hogy a vizuális feedback gyorsabb)
- **Event-alapú frissítés:** `window.online` eseményre 500 ms delay után refresh (ad időt a push-nak elindulni)
- **Session-derive:** a `supabase.auth.getUser()` + `getLocalOwnProfile(userId)` adja a `congregationId`-t
- **Elrejtési logika:** 0 pending + 0 conflict → `return null`. Nincs „zöld pipa" állapot — tiszta állapot = láthatatlan (ne zavarja a figyelmet, UX-alapelv)
- **Navigáció:** `useNavigate()` → `/penzugy/chitanta`
- **Stílus:** a `SessionStatusIndicator` mellé (24 px-rel lejjebb, `top-12`), konzisztens pill-tervezés

### 2.2 AuthGate bekötés

**Fájl:** `apps/desktop/src/lib/auth-gate.tsx`

```tsx
import { SyncStatusIndicator } from '../components/sync-status-indicator'

// 1. kapu (session):
<>
  <SessionStatusIndicator />
  <SyncStatusIndicator />
  <Outlet />
</>

// 2. kapu (offline-mode):
<>
  <SessionStatusIndicator />
  <SyncStatusIndicator />
  <Outlet />
</>
```

**Hol NEM jelenik meg:** `/login`, `/pin-entry`, `/pin-setup` — ezek az authentikáció előtti oldalak, ahol a user még nem ér el a DB-hez. Ez tudatos: az indicator csak azután jelenik meg, hogy a user bent van.

### 2.3 Exp-backoff a `chitanta-sync.ts`-ben

**Fájl:** `apps/desktop/src/lib/chitanta-sync.ts`

Új konstans + helper:

```ts
const BACKOFF_MS_BY_ATTEMPT: Record<number, number> = {
  0: 0,          // első futás
  1: 30_000,     // 30 s
  2: 60_000,     // 1 perc
  3: 120_000,    // 2 perc
  4: 300_000,    // 5 perc
  5: 900_000,    // 15 perc
}

function shouldSkipByBackoff(mutation): boolean {
  // true, ha a last_attempt_at + backoff(attempts) > now
}
```

`pushPendingChitantas` új paraméter: `ignoreBackoff = false` (default).

A for-loop legelején:

```ts
for (const mutation of chitantaMutations) {
  if (!ignoreBackoff && shouldSkipByBackoff(mutation)) {
    continue
  }
  result.attempted += 1
  // ...
}
```

`runChitantaSyncManually` hívja: `pushPendingChitantas(getDesktopSupabase(), true)` — manuális trigger átlépi a backoff-ot.

---

## 3. Verifikáció

| Check | Eredmény |
|---|---|
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ **34 fájl**, 0 tiltott |
| Rust, core, web nem érintett | — |

**Nem tesztelt (de low-risk):**
- Indicator-refresh latencia különféle network conditions esetén
- Backoff-viselkedés 6+ konkurens mutation-nel (elméletileg kulccsal védett; nem láttam race-t)
- Indicator „tiszta állapot" (0+0) kontra „frissen sync-elt" átmenet — gyakorlatban instant

---

## 4. UX-sejtések

**A indicator ikon-választás:**
- `Cloud` — „felhő, aminek tartalma van, még nem küldtük fel" — semleges, pozitív pending
- `AlertTriangle` — „figyelem" — conflict-nél aktív válasz kell

**A pill pozíciója:**
- `top-12` (a session alatt) — nem blokkolja a main content-et
- `right-3` — vertikális sávban illeszkedik
- `fixed + z-40` — minden oldal fölött van (de a modal-ok `z-50`, tehát nem blokkolják a dialógokat)

**Szöveg formula:**
- „1 chitanță szinkronra vár" (egyes szám)
- „3 chitanță szinkronra vár" (többes)
- „1 konfliktus feloldást vár" (single conflict dominál, a pending-et elnyomja)
- „2 konfliktus feloldást vár" (többes conflict)

---

## 5. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — user-facing A-M7.2e bejegyzés (minden lelkész látja az új indicator-t, érdemes kommunikálni)
3. **Obsidian** — az A-M7.2d kör + A-M7.2e polish egy atomic-note-ba: „Offline chitanța — szinkron-indicator viselkedés". Endre vagy köv. session.

---

## 6. Következő lépés — A-M7.3

Az A-M7 pénzügyi wave **következő alfázisa: befizetés (pénzbeszedés).** A chitanta-kör most lezárt (1 + 6 + polish alfázis); a következő domain a `befizetes` tábla és a hozzá kapcsolódó use-case-ek (tag-fizetés rögzítése, járulék-befizetés, lista, sztornó).

Felderítés első lépése: a meglévő `apps/web/app/(dashboard)/penzugy/` Server Action-ök közül a `befizetes`/`jarulek` fájlokat végignézni, a table schema (`befizetes`, `jarulek`) oszlopait, és egy szkópolt A-M7.3a tervet írni az első use-case-hez.
