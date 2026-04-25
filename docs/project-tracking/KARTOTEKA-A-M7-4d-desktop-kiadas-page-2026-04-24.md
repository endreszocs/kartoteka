# A-M7.4d — Desktop kiadás oldal (`/penzugy/kiadas`)

**Dátum:** 2026-04-24
**Scope:** Kiadás-kör első user-facing UI — teljes CRUD + lista + szűrő + összesítő + export
**Státusz:** ✅ kész — a pénzügyi desktop UI mostantól E2E napi használatra alkalmas
**Kapcsolódó:** A-M7.4a/b/c (backend), A-M7.3d1-d5 (befizetés-oldal minta)

---

## 1. Mit ad ma a lelkésznek?

Új desktop oldal `/penzugy/kiadas` — a kiadások rögzítése és kezelése egy helyen. A befizetés-oldal tükörképe, de kiadás-specifikus mezőkkel:

### Új kiadás form

- **Dátum** + **kategória** (~50 kiadás-cél)
- **Átvevő mód-toggle**:
  - **Külső** (cég, magánszemély): név + CUI/adószám (opcionális)
  - **Gyülekezeti tag**: diakritika-toleráns autocomplete (300 ms debounce)
- **Összeg (RON)** + **típus** (Készpénz / Banki) + **iratszám** (automatikus)
- **Vonatkozó időszak** opcionális (pl. „2026 01" januári fűtés-számla)
- **Megjegyzés**

### Lista szekció

- Év-szűrő a fejlécben (elmúlt 6 év)
- Kategória-szűrő a lista fölött
- Maximum 500 sor az adott évre
- Sztornózott sorok áthúzva
- **Sztornó inline-panel** indoklással (min 5 char) → cascade-visszajelzés a belső-mozgás párjára
- **Soft-delete** browser-confirm-mal
- **Excel export** (CSV) — 12 oszlopos

### Összesítő kártya

Rose-színű kártya a lista fölött:
- **Összes kiadás** RON-ban
- **Darabszám**

A befizetés emerald-kártyája vizuálisan tisztán elkülöníthető a kiadás-kártyától — a lelkész egy pillantásra látja, hogy ez a lista bevétel vagy kiadás.

---

## 2. Mi változott?

### 2.1 Új CSV export helper — `kiadas-csv.ts`

**Fájl:** `apps/desktop/src/lib/export/kiadas-csv.ts` (~80 sor)

A befizetés-CSV tükörképe, kiadás-specifikus oszlopokkal:

| Oszlop | Forrás |
|---|---|
| Dátum | `r.datum.slice(0, 10)` (ISO timestamp → YYYY-MM-DD) |
| Iratszám | r.iratszam |
| Típus | r.irattipus |
| Átvevő (tag) | r.atvevo_nev |
| Átvevő (név) | r.atvevo |
| CUI | r.kedvezmenyezett_cui |
| Kategória | r.kiadascel_nev |
| Összeg (RON) | r.osszeg |
| Vonatkozó időszak | r.vonatkozo_idoszak |
| Sztornó | r.stornozott |
| Sztornó indoklás | r.stornozott_indok |
| Megjegyzés | r.megjegyzes |

Filename: `kiadasok-{year}.csv` vagy `kiadasok-{year}-szurt.csv`.

### 2.2 Új desktop oldal — `KiadasPage`

**Fájl:** `apps/desktop/src/pages/kiadas-page.tsx` (~820 sor)

Három sub-komponens (a befizetés-oldal struktúrája):

**a) `KiadasPage` (root):** auth + congregationId + évszűrő + celek + offline-tracking.

**b) `ExpenseForm`:**
- **Átvevő mód-toggle** (`'tag' | 'szoveges'`) — kiadás-specifikus. A toggle kizárólagos: ha tag, a szöveges mező nincs; ha szöveges, a tag-kereső nincs.
- Tag-módban a befizetés-formból ismert keresővel
- Szöveges-módban: név + CUI/adószám input
- Közös: összeg, típus, iratszám (auto-gen Készpénznél), időszak, megjegyzés
- Save: `saveExpenseUseCase` + `duplicateReceipt` flag kezelése

**c) `RecentExpenseSection`:**
- `listExpenseUseCase` hívás évszűrővel + kategória-szűrővel (limit 500)
- Rose-színű összesítő a lista fölött (ha van active sor)
- Kategória-szűrő a lista CardContent-jén belül (egyszerűbb mint a befizetés tag+kategória dupla-szűrő)
- Sztornó inline panel cascade-visszajelzéssel (`cascadedInternalTransfer` boolean)
- Soft-delete browser-confirm-mal
- Excel export gomb

### 2.3 Route + landing-page kártya

**App.tsx:**
```tsx
<Route path="/penzugy/kiadas" element={<KiadasPage />} />
```

**PenzugyLandingPage:** új kártya „Kiadás rögzítése" — `MinusCircle` ikon, `rose-50` háttér, „Új" badge. A befizetés-kártya mellé rendezve; a landing-page most 4 modul-kártyát mutat:

1. Befizetés (amber)
2. Kiadás 🟢Új (rose)
3. Chitanța (sky)
4. Nyugtatömbök (emerald)

---

## 3. Verifikáció

| Check | Eredmény |
|---|---|
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ **39 fájl**, 0 tiltott |
| Rust, core, web nem érintett | — |

---

## 4. Tervezési döntések — a befizetés-mintától való eltérések

1. **Átvevő mód-toggle** (nincs a befizetés-ben) — mert a kiadás-ban a „külső cég" és „tag" radikálisan más UX. A befizetésnél alapértelmezetten minden tag; a kiadásnál a „külső" a default (mert a gyülekezet legtöbbet külső beszállítónak fizet).

2. **Rose-színű összesítő** — vizuálisan kódolt, hogy a kiadás „piros" (negatív pénzmozgás), szemben a befizetés „zöldjével". A lelkész akárhol van, a szín alapján azonnal érti.

3. **Nincs Top N kategória bontás** az összesítőben — a kiadás-kategóriák heterogének (fűtés, segélyezés, utazás), a befizetés-kategóriák pedig jellemzően 3-4 domináns kategóriára összpontosulnak. A kiadás-breakdown későbbi polish (ha user kéri).

4. **Nincs család-támogatás** — kiadás nem család-szintű.

5. **Nincs fizetettev** — a kiadás mindig az aktuális pénzügyi időszakhoz tartozik; a `vonatkozo_idoszak` opcionális szöveg ellátja ezt a szerepet (pl. „2026 01" fűtés).

6. **Egyszerűbb szűrő** — csak kategória-szűrő (nem tag + kategória, mint a befizetésnél). Az átvevő-szűrés később, ha valós igény jön.

---

## 5. A-M7.4 kiadás-kör backend + UI TELJES

4 alfázis 1 napon:

| Alfázis | Szállítás |
|---|---|
| A-M7.4a | shared list + list-cel use-case-ek + web adapter |
| A-M7.4b | saveExpense + 2 helper (iratszám, duplicate) + web adapter |
| A-M7.4c | softDelete + sztornó + web adapter |
| A-M7.4d | desktop UI: kiadas-page.tsx + CSV export + landing-card |

**A pénzügyi desktop UI most E2E használható**: befizetés + kiadás + chitanța + nyugtatömbök. A lelkész napi pénzügyi munkája kiszolgálható offline a desktop-ról (chitanța-körben) vagy online (befizetés + kiadás).

---

## 6. Mi marad hátra

- **A-M7.4e** — offline-capability (Rust v13 `kiadas_local` + pull-sync) — a chitanta minta szerint
- **A-M7.5** — finance-dashboard (bevétel vs kiadás, év-év összehasonlítás, TVA-plafon)
- **A-M7.6** — bank-import, batch-rögzítés, Oblio/e-Factura

---

## 7. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — **KELL** bejegyzés: user-facing új oldal
3. **Obsidian** — A-M7.4 teljes kör atomic-note-ja: „Kiadás-kezelés desktopon"
