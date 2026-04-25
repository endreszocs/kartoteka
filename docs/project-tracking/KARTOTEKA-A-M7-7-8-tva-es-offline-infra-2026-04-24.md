# A-M7.7 + A-M7.8 — TVA-plafon figyelmeztető + offline-olvasási infra (befizetés/kiadás)

**Dátum:** 2026-04-24
**Scope:** Két polish-lépés: TVA-plafon figyelmeztető a dashboard-ra + offline read-mirror a befizetés/kiadás táblákra (Rust v12/v13 + pull-sync + fallback)
**Státusz:** ✅ kész. Bank-import és Oblio külön session-re defer-elve (scope túl nagy).
**Kapcsolódó:** A-M7.5 (dashboard), A-M7.3 (befizetés), A-M7.4 (kiadás), A-M7.2d (chitanta offline-minta)

---

## 1. Mit ad ma a lelkésznek?

### 🚨 A-M7.7 — TVA-plafon figyelmeztető

A pénzügyi áttekintés oldalon **automatikus figyelmeztetés** jelenik meg, ha az éves bevétel közelít vagy eléri a román **TVA-plafont (395.000 RON / év)**.

**4 szint:**

| % | Szín | Üzenet |
|---|---|---|
| < 50% | (elrejtve) | nincs figyelmeztetés |
| 50-75% | sárga | Tájékoztató, „egyelőre nyugodt" |
| 75-90% | narancs | „Közeledik" — érdemes kezdeni gondolni |
| 90-100% | piros | „Közel!" — sürgős lépés |
| > 100% | piros + 🚨 | „Plafon elérve" — azonnali intézkedés |

**Vizuálisan:** progress-bar (0 → 395.000 RON) + százalék + üzenet + italic magyarázat („a konzervatív becslés overcounts").

### 📱 A-M7.8 — Offline-olvasás a befizetés + kiadás listákhoz

A pénzügyi áttekintés oldal mostantól **működik offline**, a lokális SQLCipher cache-ből. Amikor a lelkész online volt legutóbb, a rendszer automatikusan lesyncelte az éves befizetéseket és kiadásokat. Offline-módban:

1. Megnyitod `/penzugy/attekintes`-t
2. A stat-kártyák azonnal megjelennek (a lokális cache-ből)
3. Sárga figyelmeztető sáv: „Offline munkamenet — lokális adatot mutatunk"
4. Amikor visszakapcsolódsz, az oldal automatikusan frissül friss szerver-adattal

**Fontos:**
- **Csak READ** — offline módban nem rögzíthetsz új befizetést/kiadást (a form disabled marad)
- A lokális cache az **online használatkor töltődik** (minden sikeres dashboard-load után)
- Max 500 befizetés + 500 kiadás / év tárolódik lokálisan

---

## 2. A-M7.7 — TVA-plafon — Mi változott?

### 2.1 Új komponens — `TvaPlafonWarning`

**Fájl:** `apps/desktop/src/pages/penzugy-dashboard-page.tsx` (inline, ~100 sor)

Logika:

```tsx
const percentage = (totalIncome / 395_000) * 100
if (percentage < 50) return null  // Nyugodt, nem zavar

let tone: 'yellow' | 'orange' | 'rose' =
  percentage >= 90 ? 'rose' : percentage >= 75 ? 'orange' : 'yellow'

// 4 üzenet-szövegblokkol (100%+, 90-99%, 75-89%, 50-74%)
```

**Render:**
- Ikon: `AlertTriangle`
- Háttér: tone-specifikus
- Progress-bar (0 → 395.000 RON) a százalékkal
- Footer-szöveg: „konzervatív becslés, a valós TVA-alap kisebb lehet"

**Miért konzervatív?** A pontos TVA-számítás a `szamadasicel.tva_plafonba_szamit` flag-et is figyelembe veszi (pl. tagdíj nem számít). A dashboard egyszerűsít: a teljes bevételt nézi. Ha ez alapján nyugodt vagy, **biztosan** nyugodt; ha piros, a pontos számítás web-oldalon is érdemes ellenőrizni.

---

## 3. A-M7.8 — Offline infra — Mi változott?

### 3.1 Rust v12 — `befizetes_local` tábla

**Fájl:** `apps/desktop/src-tauri/src/db.rs`

29 oszlopos SQLite tábla a `befizetes` tükörképéhez:

```sql
CREATE TABLE befizetes_local (
  id INTEGER PRIMARY KEY,
  xkey TEXT NOT NULL,
  id_csalad INTEGER, id_szemely INTEGER, forrasa TEXT,
  id_befizetescel INTEGER NOT NULL, datum TEXT NOT NULL, osszeg REAL NOT NULL,
  nyugta TEXT, iratszam TEXT NOT NULL, irattipus TEXT NOT NULL,
  csalad INTEGER NOT NULL DEFAULT 0, megjegyzes TEXT,
  deleted INTEGER NOT NULL DEFAULT 0, created TEXT,
  fizetettev INTEGER NOT NULL, userid TEXT NOT NULL,
  is_potlas INTEGER NOT NULL DEFAULT 0, bankszamla_id INTEGER,
  stornozott INTEGER NOT NULL DEFAULT 0, stornozott_at TEXT,
  stornozott_indok TEXT, stornozott_by TEXT,
  osszeg_ron REAL, arfolyam REAL,
  congregation_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6 index: congregation, datum, fizetettev, updated_at, szemely, cel
PRAGMA user_version = 12;
```

### 3.2 Rust v13 — `kiadas_local` tábla

Hasonló minta 27 oszloppal. `atvevoid`, `atvevo`, `kedvezmenyezett_cui`, `vonatkozo_idoszak` — kiadás-specifikus mezők.

5 index: congregation, datum, updated_at, atvevoid, cel.

### 3.3 Új modul — `finance-sync.ts`

**Fájl:** `apps/desktop/src/lib/finance-sync.ts` (~270 sor)

4 exportált függvény:

```ts
pullBefizetesek(congregationId, year) → PullBefizetesekResult
pullKiadasok(congregationId, year) → PullBefizetesekResult
getLocalBefizetesek(congregationId, year) → LocalBefizetesRow[]
getLocalKiadasok(congregationId, year) → LocalKiadasRow[]
```

**Pull-logika:** szerver → SELECT minden sor → UPSERT a lokálba (`ON CONFLICT(id) DO UPDATE`). A sztornózott és törölt sorok is szinkronizálódnak (hogy a konzisztencia megmaradjon), csak a lokális olvasás-view szűri őket.

**Limit 500** — egyszerűsítés; nagyobb gyülekezeteknél delta-pull + cursor kell (jövőbeli optimalizáció).

**NINCS write-offline** — a bejegyzés szerver-oldali `revision` + `updated_at` automatikusan frissül a szerveren; a lokálból csak olvasunk.

### 3.4 Dashboard-integráció

**Fájl:** `apps/desktop/src/pages/penzugy-dashboard-page.tsx`

A `loadData` callback bővítése:

```
online-ág:
  Promise.all[listIncomeUseCase + listExpenseUseCase]
  ↓ sikeres
  setIncomeRows(serverResult.rows) + setExpenseRows(...)
  setDataSource('server')
  void pullBefizetesek(...) // háttér
  void pullKiadasok(...)
  ↓ részleges/teljes hiba
  loadLocalFallback() — a hiányzó oldalon
  setDataSource('mixed' | 'local')
  ↓ catch (hálózati exception)
  loadLocalFallback() — teljes
  setDataSource('local')

offline-ág:
  loadLocalFallback()
  setDataSource('local')
```

**`localToIncomeRow` + `localToExpenseRow` konverterek** — a SQLite integer (0/1 boolean) → TS boolean, a join-nevek `null`-ok (a lokális cache nem tárolja). Az `IncomeSummary` és a dashboard-komponensek a `befizetescel_nev ?? 'Kategória #N'` fallback-kel kezelik.

### 3.5 Adat-forrás indikátor

3 állapot a `dataSource` state alapján:

- `'server'` — zöld, alap (nincs külön üzenet)
- `'mixed'` — amber „Részleges adat: egyes oldalak lokális cache-ből"
- `'local'` — offline banner + amber „A szerver nem elérhető — lokális adat látszik"

---

## 4. Verifikáció

| Check | Eredmény |
|---|---|
| `cargo check` (apps/desktop/src-tauri) | ✅ 43.78s (Rust v12+v13 OK) |
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ **42 fájl**, 0 tiltott |

**Nem tesztelt (smoke):**
- E2E: online → offline → online ciklus + adat konzisztencia
- Pull-sync teljesítmény 500+500 sornál (kb. 1000 INSERT kell lefusson)
- TVA-progress-bar 100%+ esetén (piros + emoji)

---

## 5. Biztonsági szempontok

1. **RLS** — a szerver-lekérdezések (listIncomeUseCase / listExpenseUseCase) RLS-védettek
2. **Lokális titkosítás** — a `befizetes_local` és `kiadas_local` SQLCipher AES-256-ban van, user-specifikus kulcs a Windows Credential Manager-ben
3. **Congregation-scope** — minden pull explicit `congregation_id` filter-rel; a lokális olvasás is így
4. **Pull-timeouts** — a Supabase kliens default ~30 mp timeout; ha hibás, a fallback-logika lokálist mutat

---

## 6. Tervezési döntések — részletek

### A-M7.7 TVA-plafon

1. **Konzervatív egyszerűsítés** — nem `tva_plafonba_szamit` filter. A pontos számítás a web-oldalon (`lib/finance/tva-plafon.ts`) komplex join-okkal fut; a dashboard „piros lámpa" jellege ezt nem igényli.
2. **Nyugodt-nézet elrejtve** — < 50% esetén nem mutatunk semmit, hogy ne zavarjon. Az 50%-os küszöb egy pragmatikus választás.
3. **Százalék kerekítve** — `Math.round()`, nem tizedes. A user nem igényel precizitást.
4. **RON fix** — a plafon RON-ban van megadva; nemzetközi esetben a `osszeg_ron` mezőt kellene használni, de a bevétel-összegzés már `osszeg` (RON) — a devizás bevételek az `arfolyam`-mal vannak átváltva a web-oldalon.

### A-M7.8 offline-infra

1. **Read-only csak most** — a write-offline iratszám-wallet rendszert igényelne (a chitanta A-M7.2d mintája szerint). Ez külön 3-4 órás munka, ezért kimaradt.
2. **Teljes-év pull, nem delta** — 500-as limittel a teljes évre egy hívás; delta-pull (csak `revision > last`) későbbi optimalizáció nagy gyülekezetekhez.
3. **Nincs cache-expiry** — a lokális adat addig él, amíg a következő pull felül nem írja. Ha a user hónapokig offline, a lista elavul. Ez elfogadható.
4. **Konverter-fn-ek `null`-okkal** — a lokális row nem tárolja a join-neveket; a `befizetescel_nev` / `szemely_nev` / `bankszamla_nev` → null. A UI a `?? 'Kategória #N'` fallback-kel kezeli (meglévő minta a `RecentIncomeSection`-ben).
5. **Pull a sztornózott + törölt sorokat is** — a konzisztencia megőrzéséhez. Az olvasás kizárja ezeket (`stornozott = 0 AND deleted = 0`).

---

## 7. Mi marad hátra

### Bank-import (új session)
- BCR, Raiffeisen, BT CSV-parserek
- Előnézet + kategorizálás
- Tag-matchelés + manual fallback
- Ez egyetlen parser is 1-2 óra; mind a 3 egyetlen session 4-5 óra. Külön alkalomra.

### Oblio / e-Factura (új session)
- Supabase Edge Function az OAuth-hoz (secret gateway!)
- Edge Function az invoice-kiállításhoz
- UI a számlák listájához + kiállításhoz
- Ez egy 2-3 napos munka a teljes kör.

### Write-offline (befizetés + kiadás)
- Iratszám-wallet rendszer (mint a chitanta A-M7.2d1)
- `befizetes_local` + `kiadas_local` insert + outbox
- Auto-push + konfliktus-UX
- A chitanta-minta követi — ismert flow, de 3-4 óra

### Finomítások
- A-M7.5 polish: év-év összehasonlítás a dashboard-on
- Delta-pull optimalizáció (csak revision > last)
- Nagyobb gyülekezetek: limit 500 → lapozható lista

---

## 8. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — user-facing bejegyzés KELL: TVA-figyelmeztető + offline-nézet a dashboard-on
3. **Obsidian** — az A-M7 egész wave lezárását egy atomic-note-ban (egy későbbi összegző session-ben)
