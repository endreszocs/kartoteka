# A-M7.6 — Belső mozgás (internal transfer) shared CRUD + desktop oldal

**Dátum:** 2026-04-24
**Scope:** A `belsomozgas` tábla — kassza ↔ bank, bank ↔ bank, valutacsere rögzítése. Shared use-case-ek + desktop UI.
**Státusz:** ✅ kész — backend + UI egyben (MVP scope)
**Kapcsolódó:** A-M7.3/A-M7.4 minta (befizetés/kiadás)

---

## 1. Miért most ez a lépés?

A befizetés + kiadás + chitanța oldalak minden napi rögzítést kezelnek, **kivéve** a gyülekezeti pénz belső helyváltoztatását: a perselypénz bankba vitele, pénzfelvétel a bankból a kasszába, bank-bank átutalás, valutacsere.

Ez egy **napi rutin-művelet** (hétfőn a vasárnapi persely bekerül a bankba, péntekenként pénzfelvétel a bérezéshez stb.), amit eddig a desktop nem támogatott — csak a web. Ma ez is elérhetővé válik.

---

## 2. Mit ad a lelkésznek?

### Új desktop oldal `/penzugy/belsomozgas`

**Rögzítő form:**
- Dátum + **típus-választó** (4 opció magyarul):
  - „Kassza → Bank (perselyfölözés)"
  - „Bank → Kassza (pénzfelvétel)"
  - „Bank → Bank (átutalás)"
  - „Valutacsere (pl. EUR → RON)"
- **Forrás** + **cél** szövegmező (auto-fill a típus alapján: kassza_bank → „Kassza" forrás)
- **Összeg (RON)**
- **Valutacsere esetén:** cél-összeg + árfolyam (a zod-séma ezt ellenőrzi)
- Megjegyzés opcionális

**Lista:**
- Az év utolsó 500 belső mozgása
- Típus-szűrő a lista fölött
- Minden sor: típus-chip („K→B" indigo) + forrás → cél + összeg + dátum
- Valutacserénél a cél-összeg + árfolyam is látszik
- Soft-delete (browser-confirm-mal)

### Pénzügy-landing bővítés
Új kártya „Belső mozgás" — indigo-50 háttér, `ArrowLeftRight` ikon, 🟢Új badge. A landing most **6 modult** mutat.

---

## 3. Mi változott?

### 3.1 Zod sémák — `belsomozgas.ts` (új fájl)

**Fájl:** `packages/validations/src/finance/belsomozgas.ts` (~110 sor)

4 séma:

```ts
belsomozgasListRowSchema          // teljes sor (16 mező)
listInternalTransfersInputSchema  // szűrők (year, tipus, includeDeleted, orderBy, limit)
saveInternalTransferInputSchema   // új rögzítés (+ 3 refine)
softDeleteInternalTransferInputSchema  // { congregationId, transferId }
```

**Kulcs validáció a save-en:**

1. `datum <= today()` — jövőbeli dátum blokkolva
2. `forras !== cel` — forrás és cél nem lehet ugyanaz
3. **valutacsere esetén**: `cel_osszeg` + `arfolyam` kötelező

### 3.2 Core use-case-ek — 3 új fájl

**Fájlok:** `packages/core/src/finance/belsomozgas/{list,save,soft-delete}.ts`

```ts
listInternalTransfersUseCase(input, ctx): ListInternalTransfersResult
saveInternalTransferUseCase(input, ctx): SaveInternalTransferResultOrError
softDeleteInternalTransferUseCase(input, ctx): SoftDeleteInternalTransferResult
```

A befizetés / kiadás mintájához hasonlóan: explicit congregation_id, RLS-védett, Result-fajtájú, drift-graceful.

**Megjegyzés az architektúráról:**

A web-oldali `saveInternalTransfer` (meglévő, ~2400 soros actions.ts-ben) **csak a `belsomozgas` master-táblát érinti**. A `befizetes` + `kiadas` tükör-sorok nem jönnek létre automatikusan — a `belso_mozgas_xkey` mechanizmus későbbi refaktor. Ezt a mintát követjük a core use-case-ben is.

**Következménye:** a belső mozgás a `listIncomeUseCase` / `listExpenseUseCase`-ben NEM jelenik meg (mert csak a `belsomozgas` táblát érinti). Ez egyezik a jelenlegi web-beállítással.

### 3.3 Web Server Action adapterek

**Fájl:** `apps/web/app/(dashboard)/penzugy/belsomozgas-actions.ts` (új, ~80 sor)

3 thin-wrapper: `listInternalTransfersAction`, `saveInternalTransferAction`, `softDeleteInternalTransferAction`.

A meglévő `actions.ts` `saveInternalTransfer` **változatlan marad** (backward-compat).

### 3.4 Desktop oldal — `BelsomozgasPage`

**Fájl:** `apps/desktop/src/pages/belsomozgas-page.tsx` (~500 sor)

Három sub-komponens:

- `BelsomozgasPage` (root) — auth, congregation, év-szűrő, online-tracking
- `TransferForm` — a rögzítő form, auto-fill forrás/cél a típus-váltáskor, valutacsere-konfiguráció
- `RecentTransfersSection` — lista típus-szűrővel + soft-delete

**UX-döntések:**

1. **Típus-dropdown magyar leírással** — a lelkész nem kell hogy ismerje a `kassza_bank` enum-értéket; a „Kassza → Bank (perselyfölözés)" azonnal érthető.

2. **Auto-fill forrás/cél** — amikor a user kiválaszt egy típust, a „Kassza"-t automatikusan beírjuk a megfelelő mezőbe. Ha más értéket akar (pl. „Házi kassza"), felülírhatja.

3. **Valutacsere conditional mezők** — a cél-összeg + árfolyam csak akkor jelenik meg, ha `tipus === 'valutacsere'`. Nem zavarja a napi kassza-bank rögzítést.

4. **Típus-chip a listán** (`K→B`, `B→K`, `B→B`, `Cs`) — tömör, színes, egy pillantásra érthető.

5. **Soft-delete browser-confirm-mal** — nincs sztornó-flow (a belső mozgás nem érint tagokat, csak belső pénzmozgás, ezért egyszerű törlés elég).

### 3.5 Route + landing kártya

**App.tsx:**
```tsx
<Route path="/penzugy/belsomozgas" element={<BelsomozgasPage />} />
```

**PenzugyLandingPage:** új kártya „Belső mozgás", indigo-50 háttér, `ArrowLeftRight` ikon, 🟢Új badge. Az Áttekintés-kártyáról elvettem az „Új"-t és a színét slate-50-re kevertem (már nem új, de fontos).

A landing most 6 modul-kártyát mutat:
1. Pénzügyi áttekintés (slate)
2. Befizetés (amber)
3. Kiadás (rose)
4. **Belső mozgás** 🟢Új (indigo)
5. Chitanța (sky)
6. Nyugtatömbök (emerald)

---

## 4. Verifikáció

| Check | Eredmény |
|---|---|
| `npx tsc --noEmit` (packages/validations) | ✅ 0 error |
| `npx tsc --noEmit` (packages/core) | ✅ 0 error |
| `npx tsc --noEmit` (apps/web) | ✅ 0 error |
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ **41 fájl**, 0 tiltott |

---

## 5. Mi marad hátra

### Közeli polish
- **Bank-számla autocomplete** — a forrás/cél mezőkhöz a gyülekezet bank-számláinak listája dropdown-ként
- **Összesítő** a lista fölé: „2026-ban 8 kassza→bank transzfer, összesen 12.500 RON"

### Bonyolultabb bővítések (későbbi sessionök)
- **`belso_mozgas_xkey` mechanizmus** — a `befizetes` és `kiadas` tükör-sorok automatikus létrehozása (ez a jelenlegi web-minta is NEM kezeli így; ez egy FUTURE-refaktor)
- **`bank_bank` összekötése `befizetes`/`kiadas`-sal** — jelenleg csak `belsomozgas`-ban jelenik meg
- **Offline-capability** a chitanta minta szerint

---

## 6. A-M7 pénzügyi wave haladás

| Kör | Tartalom | Státusz |
|---|---|---|
| A-M7.1 | Nyugtatömbök | ✅ |
| A-M7.2 | Chitanța (offline flow) | ✅ |
| A-M7.3 | Befizetés (CRUD + desktop + polish) | ✅ |
| A-M7.4 | Kiadás (CRUD + desktop) | ✅ |
| A-M7.5 | Pénzügyi áttekintés | ✅ |
| **A-M7.6** | **Belső mozgás (CRUD + desktop)** | **✅** |

**A gyülekezet napi pénzügyi teljes tranzakció-rögzítése a desktopról lehetséges.** A bank-import, Oblio, TVA-monitor az A-M7.7+ tárgya.

---

## 7. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — user-facing bejegyzés kell
3. **Obsidian** — a teljes A-M7 wave lezárultával atomic-note (egyelőre egyben)
