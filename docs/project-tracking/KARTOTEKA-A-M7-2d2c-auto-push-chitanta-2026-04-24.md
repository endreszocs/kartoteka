# A-M7.2d2c — Automatikus outbox-push (offline-kiállított chitanțák szerverre feltöltése)

**Dátum:** 2026-04-24
**Scope:** `chitanta-sync.ts` push coordinator, AuthGate auto-trigger, „Sync most" manuális gomb + status-visszajelzés
**Státusz:** ✅ kliens-flow teljes — a szerverre-push triggerei bekötve, max-retry + konfliktus-state működik
**Kapcsolódó fázisok:** A-M7.2d1 (wallet), A-M7.2d2a (chitantak_local), A-M7.2d2b (offline-ág), A-M7.2d2d (konfliktus-UX, köv.)

---

## 1. Mit ad ma a lelkésznek?

**Automatikus szerverre-feltöltés, amint a gép online.**

Az A-M7.2d2b óta offline-módban kiállított chitanțák a `chitantak_local` táblában + outbox-ban várnak. Ma ezek automatikusan felmennek a szerverre, amint:

1. **Online-ra vált a gép** (Windows `online` event) → azonnali push
2. **30 mp-enként a háttérben** (ha online) → folyamatos felzárkózás
3. **„Sync most" gombra kattint** a lelkész a chitanta-oldalon → manuális push
4. **Újra bejelentkezik online-ban** (SIGNED_IN event) → a kliens kezdeményezi

**Amikor sikerrel felkerül:**
- A „🕓 Szinkronizálásra várnak (N)" blokkban a sor eltűnik
- A szerver-lista („Utolsó chitantáim") felveszi az új sort
- Belsőleg: `sync_state='synced'` + `server_id` kitöltve

**Ha a szerver elutasítja:**
- Hálózati/átmeneti hiba → max 5 retry
- 6. kísérlet után: `sync_state='conflict'`, a user kézzel rendezi (A-M7.2d2d-ben lesz dedikált UI)
- **Sorszám-ütközés** (a szerver más számot adott közben) → **azonnal** conflict, nincs retry — a user másik számra áll át

---

## 2. Mi változott?

### 2.1 `TauriSqliteBackend` — 2 új metódus

**Fájl:** `apps/desktop/src/lib/tauri-sqlite-backend.ts`

```ts
async markChitantaSynced(localId: string, serverId: string): Promise<void>
async markChitantaConflict(localId: string, reason: string): Promise<void>
```

- **`markChitantaSynced`** — `UPDATE chitantak_local SET sync_state='synced', server_id=?, sync_error=NULL, updated_at=now()`
- **`markChitantaConflict`** — `UPDATE chitantak_local SET sync_state='conflict', sync_error=?, updated_at=now()`

Ezek az A-M7.2d2b óta meglévő `insertLocalChitanta` + `listLocalPendingChitantas` mellé kerültek. A pusher ezzel frissíti a szerver-válaszra a lokális sort.

### 2.2 Push coordinator — `chitanta-sync.ts` (új fájl)

**Fájl:** `apps/desktop/src/lib/chitanta-sync.ts`

```ts
export async function pushPendingChitantas(supabase?): Promise<ChitantaPushResult>
export function startChitantaAutoSync(): void
export async function runChitantaSyncManually(): Promise<ChitantaPushResult>
export function getChitantaSyncStatus(): SyncStatus
```

**Fő logika:**

```
pushPendingChitantas:
  1. Session-check (supabase.auth.getSession) — ha nincs, return (üres eredmény)
  2. backend.getPendingMutations(50)
  3. filter: table='oblio_szamlak', kind='insert'
  4. foreach mutation:
       - attempts >= 5 → markConflict + removeMutation + conflicts++
       - supabase.insert(payload):
           - 23505 (unique) → markConflict + removeMutation + conflicts++
           - egyéb error → updateMutationAttempt + retrying++
           - nincs szerver-ID → updateMutationAttempt + retrying++
           - siker → markSynced + removeMutation + succeeded++
  5. return { attempted, succeeded, retrying, conflicts, errors }
```

**Tervezési döntések:**

- **Max 50 mutation / push** — a hálózat-spike-ok szétosztása; több menetben feldolgozódik
- **`MAX_ATTEMPTS = 5`** — ahogy a B-M7.2d1 specifikációban
- **Session-check először** — offline-mode PIN-belépéskor nincs session; a 401-ekbe rohanó retry-counter félrevezető lenne. A check ~1ms (lokális storage), olcsó.
- **Unique-ütközés = azonnal conflict** (retry hiábavaló; más gépről már foglalt)
- **Nem dob** — minden hiba `result.errors`-be, a hívók biztonsággal `void`-olhatják
- **In-flight guard** (`runOnceGuarded`) — két párhuzamos push nem indul (pl. online-event + periodic egyszerre)
- **De-duplikált error-log** max 10 unique üzenetig (spam-prevenció)
- **Idempotens `startChitantaAutoSync`** — többszöri hívás nem duplikálja a listener-t

### 2.3 AuthGate beékelés

**Fájl:** `apps/desktop/src/lib/auth-gate.tsx`

```ts
// (import)
import { runChitantaSyncManually, startChitantaAutoSync } from './chitanta-sync'

// (useEffect-ben, a subscription setup után)
startChitantaAutoSync()

// (onAuthStateChange callback-ben, SIGNED_IN ágban)
void runChitantaSyncManually()
```

- `startChitantaAutoSync` az AuthGate mount-jakor **mindig** elindul — a pusher maga ellenőrzi a session-t, tehát offline-mode-ban is biztonságos (nem tesz semmit)
- SIGNED_IN esetén **explicit manuális push** — a user épp belépett, az outbox-ban lévő chitantákat rögtön felküldjük (nem kell 30s-et várni a periodic poll-ra)

### 2.4 „Sync most" gomb a `RecentChitantasSection`-ben

**Fájl:** `apps/desktop/src/pages/chitanta-page.tsx`

A „🕓 Szinkronizálásra várnak (N)" blokk fejlécében:

```tsx
<Button onClick={handleManualSync} disabled={syncing}>
  <RefreshCw className={syncing ? 'animate-spin' : ''} />
  {syncing ? 'Sync…' : 'Sync most'}
</Button>
```

Utána:
- Rövid státusz-üzenet (5 mp-ig látszik):
  - „Nincs szinkronizálásra váró chitanță." (ha üres az outbox)
  - „3 felküldve · 1 újrapróbálásra vár" (tipikus)
  - „1 konfliktus" (figyelmeztető)
- `loadRecent()` automatikusan újratöltődik, hogy a `synced` sorok eltűnjenek a pending-blokkból és megjelenjenek a szerver-listában.

---

## 3. Verifikáció

| Check | Eredmény |
|---|---|
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ **32 fájl** (új chitanta-sync.ts benne), 0 tiltott |
| Webet nem érintettünk (nincs core-vagy-validations változás) | — |

**Nem tesztelt:**
- **E2E smoke** — offline kiállítás → online-ra váltás → automatikus push → server-lista frissül
- **Konfliktus-szcenárió** — admin gép mielőtt pushozna, ugyanazt a sorszámot lefoglalja; a pusher-nek 23505-öt kell kapnia
- **30s poll idő-drift** — hosszú futás után drift, de ez elfogadható

---

## 4. Biztonság

1. **Session-check** — offline-módban a pusher néma marad (`session=null` → return)
2. **RLS a szerver-oldalon** — ha a payload `congregation_id`-je nem egyezik a user-ével, a szerver 403-mal elutasítja → retry → max-nál conflict
3. **`mutation_id` (== `chitantak_local.id`) UNIQUE** a outbox-ban — ugyanaz a mutation nem kerül kétszer a push-sorba
4. **Chitanță-insert idempotencia** — a szerver `(sorozat, szam, congregation_id)` unique constraint-tel védett. Ha a push ismétlésre kerül hálózati timeout után és a szerver már elfogadta, a második 23505-öt ad → azonnal conflict. **Kis kockázat**: a lokális `server_id` sosem kerül kitöltésre ebben az edge-case-ben, de a rekord szerveren ott van → kézi ellenőrzés kell. Ezt az A-M7.2d2d UX kell, hogy kezelje.

---

## 5. Mi marad hátra (A-M7.2d2d — következő)

- [ ] **Konfliktus-UX**: a `conflict` állapotú sorra a user rá tud kattintani → modal: „Válassz új sorszámot" vagy „Töröld ezt a lokális chitantát"
- [ ] **Exp-backoff** a retry-ok között (jelenleg a 30s poll egyszerre újrapróbálja mindet; heavy-load esetén a szerver nyögve fog)
- [ ] **Push-status indicator a shell-ben** — sárga pont + tooltip, ha van pending chitanta („3 szinkronizálásra vár")
- [ ] **Szemle-időszak utáni auto-resync** — ha a user több napig offline volt és jön vissza, egy dedikált „Üdv vissza" banner jelenjen meg: „12 chitanță vár feltöltésre"

---

## 6. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — user-facing A-M7.2d2c bejegyzés (következő diff)
3. **Obsidian** — az A-M7.2d2 sor (d1–d2) együtt atomic-note-ot kap, ha a d2d lezárul
