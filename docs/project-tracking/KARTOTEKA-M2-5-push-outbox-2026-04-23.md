# M2.5 teljesítési jelentés — Push-sync: offline írás + outbox drain

**Dátum**: 2026-04-23
**Fázis**: M2.5 — offline írás-útvonal az outbox mintán keresztül
**Kódolási ciklus**: ~30 perc
**Státusz**: ✅ KÉSZ, tsc + vite build zöld (Rust változatlan)
**Branch**: `feat/m1-1-monorepo`

---

## 1. Vezetői összefoglaló

A desktop kliens most **offline is képes módosítani** a saját profilját (telefon, teljes név). Az írás:
- azonnal megjelenik a lokális UI-ban (optimistic update)
- ha van kapcsolat, azonnal a Supabase-nek is küldi
- ha nincs, az outbox táblába kerül, és a következő online-kapcsolat alkalmával szinkronizálódik

Ez a legegyszerűbb push-sync minta, ami elég szilárd alap további domain-táblákhoz.

---

## 2. Mit változtattunk

### 2.1 TypeScript — `sync.ts` bővítés

Új exportok:
```ts
export async function updateOwnProfile(userId: string, patch: Partial<Pick<ProfileLocalRow, 'phone' | 'full_name'>>): Promise<{ queuedToOutbox: boolean }>
export async function processOutbox(): Promise<{ attempted: number; sent: number; failed: number }>
export async function enqueueOutbox(op, targetTable, targetId, payload): Promise<void>
export async function isOnline(): Promise<boolean>
export interface OutboxRow { id, op, target_table, target_id, payload, status, created_at, retry_count, last_error }
```

### 2.2 `updateOwnProfile` flowja

```
                ┌─── optimistic UPDATE profiles_local (mindig)
                │
                ├─── isOnline()? 
                │       ├─── YES: supabase.from('profiles').update(patch).eq('id', userId)
                │       │         └─── if error → fallback-to-outbox
                │       │
                │       └─── NO:  enqueueOutbox('update', 'profiles', userId, patch)
                │
                └─── return { queuedToOutbox }
```

Kulcsmomentumok:
- **Optimistic local**: az UI-ban azonnal látszik a változás, nem várunk a Supabase RTT-re
- **Dupla-hálózat-check**: `navigator.onLine` + HEAD-ping a Supabase `/auth/v1/health`-re (2 mp timeout)
- **Ha az online `update` mégis failelne** (RLS, 5xx stb.) → biztonsági fallback outbox-ba

### 2.3 `processOutbox` flowja

```
                ┌─── isOnline()? NO → return {0,0,0}
                │
                ├─── SELECT * FROM outbox WHERE status='pending' ORDER BY created_at
                │
                └─── foreach row:
                       ├─── JSON.parse(payload)       → ha invalid: mark failed
                       ├─── dispatch by op:
                       │      'update' → supabase.from(t).update(p).eq('id', id)
                       │      'insert' → supabase.from(t).insert(p)
                       │      'delete' → supabase.from(t).delete().eq('id', id)
                       ├─── success  → UPDATE outbox SET status='sent'
                       └─── error    → UPDATE outbox SET status='failed', last_error, retry_count+1
```

A függvény **idempotens** — sent + failed sorokat átlépi, csak `pending`-et dolgoz fel.

### 2.4 `isOnline()` — valódi connectivity

```ts
export async function isOnline(): Promise<boolean> {
  if (navigator.onLine === false) return false
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 2000)
    const res = await fetch(`${VITE_SUPABASE_URL}/auth/v1/health`, {
      method: 'HEAD',
      signal: ctrl.signal,
    }).catch(() => null)
    clearTimeout(t)
    return Boolean(res)
  } catch {
    return false
  }
}
```

A `navigator.onLine`-nak hátránya, hogy VPN / captive portal / local network esetén is `true`-t ad, pedig a Supabase elérhetetlen. A HEAD-ping egy lightweight reality-check.

### 2.5 Dashboard UI

- **OnlineBadge** (fejlécen): kis színes dot + "Online" / "Offline" címke. `window.addEventListener('online'|'offline')`-ra reagál.
- **Szerkeszthető mezők űrlapja** a „Saját profil" kártyában: telefon + teljes név `<Input>`-jel + „Mentés" gombbal.
- **Outbox kártya**: 4-tile (pending / sent / failed / total) + „Szinkronizálás most" gomb (manual drain).
- **Auto-drain**: a dashboard `useEffect`-ben mount-kor egyszer lefuttatja a `processOutbox()`-ot.

---

## 3. Kipróbálási forgatókönyv

### Happy path (online)
1. `npm run desktop:dev` → login → Pull profil
2. Módosítsd a telefon mezőt → „Mentés"
3. UI azonnal mutatja a változást + „Elmentve a szerverre és lokálisan"
4. Nyisd meg a Supabase Studio-t → `profiles` tábla → a `phone` mező frissült

### Offline path
1. Kapcsold le az internetet (Windows → Network → Disconnect, vagy wifi off)
2. A badge „Offline"-ra vált 1-2 másodpercen belül
3. Módosítsd a telefont → „Mentés" — UI: „Elmentve offline — következő online-csatlakozáskor szinkronizálódik"
4. Az Outbox kártya: pending=1
5. Kapcsold vissza az internetet → badge „Online"
6. Kattints „Szinkronizálás most" → pending=0, sent=1
7. Supabase-ben is megjelenik a változás

### Graceful failure (pl. RLS block)
1. Ha a user role-ot próbálnánk módosítani (ami RLS-tiltott), az outbox sor fail-el marad
2. failed állapot: `status='failed'`, `last_error='Row level security policy violated'`, `retry_count=1`
3. A user látja az Outbox hibás-számlálón
4. M2.6-ban: a failed soroknak lesz UI-ja (retry-gomb, törlés, error-részlet)

---

## 4. Biztonság

- **RLS**: a `profiles_write` policy (2026-04-13-rls-ALL-FIXED.sql) szerint a user csak `id = auth.uid()` sorát írhatja. Az outbox által küldött UPDATE ugyanezzel az id-vel megy — nem lehet idegen sort írni.
- **Lokális adat**: SQLCipher-titkosított DB, kulcs a Credential Manager-ben (M2.3).
- **Outbox payload**: JSON-string a DB-ben, **semmilyen titkos adat** nincs benne (csak a user saját által szerkesztett mezők, pl. phone/name).
- **Offline-rezidens támadás**: ha a támadó hozzáfér a lokális DB-hez és módosítja az outbox-ot, a Supabase-nek tetszőleges payload-ot küldhet a jelen session-tokeből. Az M2.6+ kezelésre vár (outbox-payload aláírás user-keypair-rel). Jelen gyenge pont elfogadható M2.5 szinten.

## 5. Mit NEM csináltunk (scope-határok)

- ❌ **Konfliktus-kezelés** (revision / updated_at összevetés) — M2.6
- ❌ **Retry-policy** (exponential backoff) — most minden Fail marad fail, kézi retry kell. M2.6-ban jön.
- ❌ **Failed sorok UI** (retry gomb, törlés, részletes hiba) — M2.6
- ❌ **Több domain-tábla** (members, finance, anyakonyv) — M2.6+, fokozatosan
- ❌ **Outbox-payload szerzővégi aláírás** — későbbi biztonsági lépés (talán M5)
- ❌ **Auto-drain ütemező** (pl. minden 5 perc) — most csak login után egyszer + manual. Elég lehet M5-ig.

## 6. Verify

```bash
# TypeScript
npx tsc --noEmit          # 0 hiba

# Vite prod build
npm run desktop:build     # 501 kB JS, 56 kB CSS, 3.46 s
# (>500 kB warning — M5 code-split feladat)

# Rust (cargo check) — nem kell, a Rust oldal változatlan
```

## 7. Architektúrai tanulságok

1. **Az `outbox` séma az M2.1-ben volt előre beállítva** — nagyon hasznosnak bizonyult, hogy akkor ezt már létrehoztuk. Az M2.5-ben nem kellett új tábla, csak a kliens oldali logika.
2. **Az optimistic-UX kulcs a kellemes offline-első érzésért** — a user sosem vár, mindig azonnali visszajelzést kap. A sync a háttérben történik.
3. **`navigator.onLine` önmagában nem elég** — a Supabase HEAD-ping adja a valódi bizonyosságot. Ezt az M2.6-ban még finomíthatjuk (pl. a response-status-check, ha 200, 401, 403, akkor online).

---

## 8. M2 fázis haladási állapot (2026-04-23)

- ✅ M2.1 SQLite bootstrap (tauri-plugin-sql)
- ✅ M2.2 SQLCipher csere (rusqlite + vendored OpenSSL + statikus kulcs)
- ✅ M2.3 OS-szintű kulcs (Credential Manager)
- ✅ M2.4 Első pull-sync (saját profil)
- ✅ M2.5 Push-sync + outbox-drain ← MOST
- ⏳ M2.6 Konfliktus-kezelés + delta-sync + retry-policy
