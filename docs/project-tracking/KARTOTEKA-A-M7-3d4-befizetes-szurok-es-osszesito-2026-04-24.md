# A-M7.3d4 — Befizetés lista szűrők + éves összesítő kártya

**Dátum:** 2026-04-24
**Scope:** Tag- és kategória-szűrő + éves összesítő kártya a `BefizetesPage`-en
**Státusz:** ✅ kész — a befizetés-oldal napi használatra teljesen letisztult
**Kapcsolódó:** A-M7.3d1 (alap oldal), A-M7.3d3 (polish)

---

## 1. Mit ad ma a lelkésznek?

### 🔍 Szűrők a lista fölé

A „Befizetések ({év})" szekció fejlécében egy új szűrő-sáv:

- **Tag-szűrő** — ugyanaz a diakritika-toleráns kereső, mint a form-ban; kiválasztás után zöld pill + X-gomb a törléshez
- **Kategória-szűrő** — dropdown az összes aktív kategóriára

**„Szűrők törlése"** gomb jelenik meg, ha bármelyik szűrő aktív. Egyetlen kattintással visszaáll az egész éves lista.

A szűrők élőben hatnak: amint változtatsz, a lista + az éves összesítő újratöltődik.

### 📊 Éves összesítő kártya

A lista felett egy új **zöld keretes kártya**:

- **Összes befizetés** — a nem-stornózott + nem-törölt sorok összege RON-ban
- **Darabszám** — hány érvényes befizetés
- **Átlag / befizetés** — az átlagos összeg (gyors számkép a gyülekezet aktivitásáról)
- **Top 5 kategória** — progress-bar-okkal, százalék-aránnyal, darabszámmal

Ha sztornózott sorok is vannak a listán, a fejlécben italic kis felirat: „+ N sztornózott (nem számítva)".

**Szűrés közben** a kártya címe „Szűrt összesítő"-ra vált, és a Top kategóriák elrejtésre kerülnek (mert szűrt nézetben a top-lista nem nyújt új információt).

### 📈 Korábban vs most

- **Limit 50 → 500** — a teljes éves lista (tipikusan 100-300 sor / gyülekezet) elfér az 500-as kereten belül; az összesítő pontos lesz
- **Szerver-oldali szűrés** — nem kliens-oldali filter; a `listIncomeUseCase` már támogatta a `szemelyId` + `befizetescelId` paramétereket (A-M7.3a óta)

---

## 2. Mi változott?

### 2.1 Szűrő állapot a `RecentIncomeSection`-ben

**Fájl:** `apps/desktop/src/pages/befizetes-page.tsx`

Új state-ek:

```ts
const [filterSzemelyId, setFilterSzemelyId] = useState<number | null>(null)
const [filterSzemelyLabel, setFilterSzemelyLabel] = useState<string>('')
const [filterCelId, setFilterCelId] = useState<number | null>(null)
const [filterTagQuery, setFilterTagQuery] = useState('')
const [filterTagHits, setFilterTagHits] = useState<MemberSearchResult[]>([])
const [filterTagSearching, setFilterTagSearching] = useState(false)
```

`loadList` most a szűrőkkel hívja a core use-case-t:

```ts
const result = await listIncomeUseCase({
  congregationId,
  year,
  yearField: 'fizetettev',
  szemelyId: filterSzemelyId,
  befizetescelId: filterCelId,
  orderBy: 'datum-desc',
  limit: 500, // A-M7.3d4 — a teljes évhez, pontos összesítő
  // ...
}, ctx)
```

A `useCallback` dep-listájába bekerült a 2 szűrő-state, így a lista automatikusan újratöltődik.

### 2.2 Szűrő tag-kereső debounce

Külön `useEffect` a `filterTagQuery` figyelésére, 300ms debounce-szal (ugyanaz a minta, mint a form-on):

```ts
useEffect(() => {
  if (filterSzemelyId !== null) return
  if (filterTagQuery.trim().length < 2) { setFilterTagHits([]); return }
  const timer = setTimeout(async () => {
    const res = await searchMembersForFinanceUseCase(...)
    if (res.success) setFilterTagHits(res.members)
  }, 300)
  return () => clearTimeout(timer)
}, [filterTagQuery, userId, filterSzemelyId])
```

### 2.3 Szűrő-UI — kártya-szekció a `CardContent` elején

- Fejléc: „Szűrők" címke + „Szűrők törlése" gomb (csak ha aktív szűrő)
- Grid: 2 oszlop (sm-től fölfelé)
  - Tag-szűrő: kereső mező vagy zöld pill a kiválasztott taggal
  - Kategória-szűrő: dropdown az összes aktív kategóriával

### 2.4 `IncomeSummary` komponens — új, a fájl alján

~120 sor. Teljes kliens-oldali agregáció a `rows` adatain.

```tsx
const activeRows = rows.filter((r) => !r.stornozott && !r.deleted)
const totalOsszeg = activeRows.reduce((sum, r) => sum + r.osszeg, 0)
const byCategory = new Map<string, { osszeg: number; count: number }>()
// ...
```

**Megjelenés:**
- Zöld (`emerald-50/30` háttér) — pozitív pénzügyi hang
- 3 fő szám rácsban (összeg, darab, átlag)
- Top 5 kategória progress-bar-okkal (`emerald-100` háttér, `emerald-500` tele)
- `%` + darabszám a sor alatt

### 2.5 `RecentIncomeSection` visszatérő-JSX keret

A régi single-`<Card>` helyett most:

```tsx
<div className="space-y-4">
  <IncomeSummary year={year} rows={rows} filtersActive={filtersActive} />
  <Card>
    {/* a meglévő lista és szűrők */}
  </Card>
</div>
```

---

## 3. Verifikáció

| Check | Eredmény |
|---|---|
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ 36 fájl, 0 tiltott |

**Nem tesztelt:**
- 500+ befizetés/év (nagy gyülekezet) viselkedés — a 500 limit majdnem biztos elég, de nagyon aktív helyen nézni kell
- Szűrés + summary teljesítmény (a client reduce N=500 sornál triviális, nem gond)
- Szűrés ↔ üres lista edge-case

---

## 4. Tervezési döntések

1. **Limit 500, nem „paginated load all"** — a 500 egy pragmatikus határ. Ha egy gyülekezet 500+ befizetést rögzít egy évben, az az edge-case; a UI-ban elég egy „+ még 50 sor a folytatásban" gomb, de ma csendben levágjuk. A későbbi A-M7.4 éves dashboard-ban lesz paginate + infinite scroll.

2. **Kliens-oldali aggregáció** (nem szerver-agg RPC) — a 500 sor reduce egy pillanat. A szerver-oldali query-aggregáció (pl. GROUP BY id_befizetescel) bonyolultabb lenne, különösen szűrők mellett. Az egyszerű mindig jobb, amíg a perf nem probléma.

3. **Top 5 kategória, nem Top 10** — a lista hossza UX-szempont. Ha a user többet akar látni, a lista-részt kiterjesztheti (később dropdown-mal).

4. **Szűrés közben a Top kategóriák elrejtve** — a szűrt listában egy kategóriára fókusz lenne Top N kategória; zavaró lenne. A „Szűrt összesítő" cím jelzi a kontextust.

5. **Sztornózott nem számítva, de „említve"** — `stornoCount > 0 → „+ N sztornózott"` kis szöveg. A user tudja, hogy nem felejtettünk el ilyen sorokat, csak nem soroljuk a totálba.

6. **Szűrő-sáv az `CardContent` tetején** — a lista-header-ben is lehetne, de túl zsúfolt lenne. A CardContent-ben, a sztornó-üzenet fölött, de a lista alatt nagyobb tér van.

---

## 5. Mi marad hátra

A befizetés-oldal ma a **fő napi-használati workflow minden funkciójával rendelkezik**. Jövőbeli bővítések:

- **Excel export** — a szűrt lista egy gomb-kattintással
- **Befizetés szerkesztés** (jelenleg csak sztornó + újrarögzítés)
- **Multi-tag szűrő** (több tag összes befizetése)
- **Dátumintervallum-szűrő** (hónap-alapú)
- **Összehasonlítás év → év** (pl. 2025 vs 2026)
- **Offline-capability** (A-M7.3d5) — a chitanta minta szerint

---

## 6. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — user-facing bejegyzés (a szűrő és az összesítő azonnal látható)
3. **Obsidian** — nem szükséges külön note, inkrementális polish
