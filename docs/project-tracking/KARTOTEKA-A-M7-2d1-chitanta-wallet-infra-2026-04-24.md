# A-M7.2d1 — Offline szám-tárca (chitanța wallet) infrastruktúra

**Dátum:** 2026-04-24
**Scope:** desktop wallet-infra — SQL RPC, Rust v10 migráció, core use-case, desktop wallet-panel UI (a tényleges offline-kiállítás-logika az A-M7.2d2-ben jön)
**Státusz:** ✅ kód + migrációk kész, SQL Endre futtatandó
**Kapcsolódó fázisok:** A-M7.2b (issueChitantaUseCase, online-only), A-M7.2c (desktop form), A-M7.2e (lista + sztornó), A-M7.2f (nyomtatás)

---

## 1. Miért?

Az **A-M7.2b issue-chitanta** tudatosan online-only maradt: a szerver-oldali `next_chitanta_number()` RPC garantálja az egyediséget, de hálózat nélkül nem fut. A lelkész *offline* scenario-ja (látogatás falun, gyenge net, alkalom közben kiállított nyugta) **előre-foglalt sorszámokat** igényel — a szerver **atomikusan** kioszt N sorszámot a kliensnek, a kliens elmenti a *wallet*-be, offline-módban onnan fogyaszt.

Ez az **A-M7.2d** kör első fele:

- **A-M7.2d1** — wallet-infra (most): SQL RPC + Rust schema + core use-case + UI-státusz
- **A-M7.2d2** — offline-kiállítás-logika (köv.): `chitantak_local` + `issueChitantaUseCase` offline-ága + outbox-push + konfliktus-dedup

**Konzisztencia garancia:** a `reserve_chitanta_numbers()` és a `next_chitanta_number()` **ugyanazt** az `oblio_fiokok.chitanta_kovetkezo_szam` mezőt pörgeti, row-lock védi — a párhuzamos online-issue és a wallet-foglalás nem ütközik.

---

## 2. Mi változott?

### 2.1 SQL — `reserve_chitanta_numbers()` RPC

**Fájl:** `migration-docs/sql/2026-04-24-a-m7-2d1-reserve-chitanta-numbers.sql`

```sql
CREATE OR REPLACE FUNCTION public.reserve_chitanta_numbers(
  p_congregation_id uuid,
  p_sorozat text,
  p_count integer
) RETURNS integer[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- 1) Scope check: current_user_can_access_congregation(p_congregation_id)
-- 2) Input check: 1 <= p_count <= 100
-- 3) Row-lock az oblio_fiokok soron (FOR UPDATE)
-- 4) Inkrement: chitanta_kovetkezo_szam += p_count
-- 5) Return: int[] — a kiosztott sorszámok
$$;
```

- **SECURITY DEFINER** + a saját `current_user_can_access_congregation()` helper → scope-védelem
- **FOR UPDATE** → párhuzamos wallet-foglalás + online-issue nem ütközik
- **1–100 korlát** → rate-limit a véletlen `+1000`-es hívásra
- Ha a gyülekezetnek még nincs `oblio_fiokok` sora, létrejön egy minimális (`chitanta_sorozat_default` = kliens-kért sorozat vagy 'CHIT' fallback, `chitanta_kovetkezo_szam` = 1 + p_count)
- Engedély: `GRANT EXECUTE TO authenticated`

A fájl végén 3 ellenőrző SELECT (fn-regisztráció + DEFINER flag + EXECUTE-jog).

**→ Endre futtatja** a Supabase SQL Editorban.

### 2.2 Rust — v10 migráció (`chitanta_wallet_local`)

**Fájl:** `apps/desktop/src-tauri/src/db.rs`

```sql
CREATE TABLE IF NOT EXISTS chitanta_wallet_local (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  congregation_id TEXT NOT NULL,
  sorozat TEXT NOT NULL,
  szam INTEGER NOT NULL,
  reserved_at TEXT NOT NULL DEFAULT (datetime('now')),
  used INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  used_for_chitanta_local_id TEXT,
  UNIQUE (congregation_id, sorozat, szam)
);
CREATE INDEX idx_chitanta_wallet_available
  ON chitanta_wallet_local (congregation_id, sorozat, used, szam);
PRAGMA user_version = 10;
```

- **Egy sor = egy sorszám** (nem range) — a használat és dedup nyomonkövetése egyszerű
- **`used=0/1` + `used_at` + `used_for_chitanta_local_id`** — az A-M7.2d2-ben a chitanta-kiállításkor a szám `used=1`-re billen, és rögzítjük melyik lokális chitantához került
- **UNIQUE (congregation_id, sorozat, szam)** — duplikált foglalás kliens-oldalon is blokkolva (belátás: ha a user két gépen párhuzamosan foglalt, az RPC a szerveren eldönti, de a lokális insert is védve)
- **Index (available-filter + szám-sorrend)** — a "következő szabad szám" O(log n) lekérdezés
- `cargo check` zöld (0.65 s cache-elt build)

### 2.3 Core — `refillChitantaWalletUseCase`

**Fájl:** `packages/core/src/finance/chitanta-wallet/refill.ts`

```ts
export async function refillChitantaWalletUseCase(
  input: RefillChitantaWalletInput,
  ctx: RefillChitantaWalletCtx,
): Promise<RefillChitantaWalletResult>
```

- Input: `{ congregationId, sorozat?, count }`
- Validáció: `count` 1..100 közötti integer
- Hívás: `ctx.supabase.rpc('reserve_chitanta_numbers', { p_congregation_id, p_sorozat, p_count })`
- Return-típusok:
  - `{ success: true, numbers: number[], sorozat }` — a szerver kiosztotta
  - `{ success: false, error }` — validáció vagy szerver-oldali hiba
  - `{ success: false, error, offlineNotSupported: true }` — hálózati hiba, a UI felajánlja az online-váltást
- Re-export: `packages/core/src/index.ts`

Ez a **9. core use-case** a `@kartoteka/core`-ban (az 5 chitanța + 3 chitanța-tömb + 1 mail mellé).

### 2.4 `TauriSqliteBackend` bővítés

**Fájl:** `apps/desktop/src/lib/tauri-sqlite-backend.ts`

Két új publikus metódus:

```ts
async insertWalletNumbers(
  congregationId: string,
  sorozat: string,
  numbers: number[],
): Promise<void>

async getWalletStatus(
  congregationId: string,
  sorozat?: string,
): Promise<{
  availableCount: number
  usedCount: number
  nextNumber: number | null
  oldestReservedAt: string | null
}>
```

- **insertWalletNumbers** — a refill-core eredményét a lokális táblába menti. `INSERT OR IGNORE` biztosítja, hogy duplikált foglalás (két gép, hálózat-jitter) nem hibázik el.
- **getWalletStatus** — a panel 3-állapotát (üres / kevés / rendben) meghajtó összesítő lekérdezés. `nextNumber` = a legkisebb `szam` ahol `used=0` → a chitanța-form később innen fogja olvasni az offline-szám jelöltet.

Jelenleg csak a wallet-panel használja; az A-M7.2d2-ben egy `takeNextWalletNumber()` metódus jön az offline-kiállításhoz (`used=1` flag + `used_for_chitanta_local_id`).

### 2.5 Desktop UI — `ChitantaWalletPanel`

**Fájl:** `apps/desktop/src/pages/chitanta-page.tsx` (inline komponens)

- Beépítés az `ActiveChitantaTombPanel` után (a chitanța-oldal bal-felső kontextus-sávjában)
- **3 tone állapot:**
  - `empty` (0 szám) → piros-keretes "Üres" figyelmeztetés + CTA
  - `low` (1–3 szám) → sárga-keretes "Kevés — érdemes feltölteni" jelzés
  - `rendben` (4+) → indigo-keretes semleges állapot, `szabad sorszám · következő: N · legrégibb foglalás: YYYY-MM-DD`
- **Gombok:**
  - `+10 szám` (primary az empty/low állapotban, outline egyébként) — hívja a `refillChitantaWalletUseCase`-t + `insertWalletNumbers`-t; `disabled` ha `!isOnline` (+ tooltip magyarázat)
  - `frissítés` (outline) — újra-olvassa a státuszt a lokális DB-ből
- **Sikeres feltöltés után:** `+10 sorszám a tárcában (EREKC24 201-210).` — 4 mp után eltűnik, a státusz újra-töltődik
- **Hibakezelés:** a `result.error` egyenesen megjelenik a user-nek (a pasztorális hibaszövegek a core-ban vannak: "A szám-tárca feltöltéséhez internetes kapcsolat szükséges.")

Kulcs UI-alapelv (memory `feedback_lelkesz_informalas`): a lelkész *rögtön* látja a tárca állapotát, nem kell "rejtett" modalba bemennie — a panel a chitanța-oldal fejlécénél van.

---

## 3. Verifikáció

| Check | Eredmény |
|---|---|
| `cargo check` (apps/desktop/src-tauri) | ✅ 0.65s (cache hit) |
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `npx tsc --noEmit` (packages/core) | ✅ 0 error |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ 31 fájl, 0 tiltott |
| `refillChitantaWalletUseCase` re-export a `@kartoteka/core`-ban | ✅ |
| `ChitantaWalletPanel` render a `/penzugy/chitanta` oldalon | ✅ (grep 9 kapcsolódási pont) |

**Nem teszteltünk még:**
- Funkcionális smoke-test (Endre a `reserve_chitanta_numbers` SQL-futtatás után teszteli)
- Több-kliens-foglalás race (szerver row-lock a védelem)

---

## 4. Biztonsági szempontok

1. **RPC scope** — `current_user_can_access_congregation()` **kötelező** ellenőrzés a fn első blokkjában (memory `feedback_tauri_rls_kotelezo`)
2. **Rate-limit** — max 100 szám / hívás; UI-oldali gomb 10-esével foglal (defense-in-depth)
3. **Sorozat-default** — ha a kliens nem küld `sorozat`-ot, a fn 'CHIT' fallback-re vált (soha nincs NULL sorozat)
4. **Nincs service_role** a hívásban — a Supabase kliens az auth-user JWT-jét használja
5. **Lokális DB** — a `chitanta_wallet_local` a SQLCipher-ben titkosítva tárolódik (AES-256, key a keyring-ben)

---

## 5. Mi marad hátra?

### Rövidtávon (A-M7.2d2, köv. fázis)

- [ ] Rust v11 migráció: `chitantak_local` tábla (chitanta-issue lokális mirror + outbox ref)
- [ ] `issueChitantaUseCase` offline-ág: ha `!navigator.onLine` → lokális ID generálás + wallet-szám fogyasztás (`used=1`) + outbox `mutations_pending` sor
- [ ] `TauriSqliteBackend.takeNextWalletNumber()` — atomikus "vedd ki a következő szabad számot + jelöld használatnak"
- [ ] Outbox-push: ha a gép újra online, a `mutations_pending` chitanta-sorok szerverre küldése (`issue-chitanta` RPC a már lefoglalt számmal)
- [ ] Konfliktus-UX: ha a szerver mégsem fogadja el (pl. időközben admin másik sorszámot adott), a lokális chitanta *áthelyezése* egy új számra (user-tájékoztatás)
- [ ] Desktop chitanța-form: offline-módban a "következő szám" automatikusan a wallet-ből jön (olvasva a `nextNumber`-ből), nem a szerverről

### Hosszabb-távon

- Wallet-számok *adási* opció: egy szám eldobása (pl. rossz papír) — `used=1` + `used_for_chitanta_local_id=null` + note
- Wallet-életciklus UI: "elmúlt X napja használtuk, dobjuk el?" figyelmeztetés
- Admin-oldali audit: hány szám lebeg walletekben → szerveroldali jelentés

---

## 6. Memory-frissítés

- `project_aktiv_fejlesztes.md`: új A-M7.2d1 sor a Tauri A-M6 táblázatban
- Új alapelv nincs — a meglévő `feedback_tauri_rls_kotelezo` és `feedback_lelkesz_informalas` érvényesülnek

## 7. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — 2026-04-24 bejegyzés a következő commitban ✅ (lásd köv. diff)
3. **Obsidian (Kartotéka AGY)** — atomic note: `A-M7.2d1 - offline wallet infra.md` (Endre manuálisan, vagy a köv. session)
