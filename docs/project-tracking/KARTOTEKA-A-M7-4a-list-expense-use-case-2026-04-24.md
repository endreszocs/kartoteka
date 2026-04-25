# A-M7.4a — Kiadás (expense) wave indítás: `listExpenseUseCase` + `listKiadasCelekUseCase`

**Dátum:** 2026-04-24
**Scope:** A kiadás-kör (expense) első use-case-ei — lista + kategória-lista. A befizetés-minta tükörképe, shared-re szedve.
**Státusz:** ✅ kész — online-only ebben a fázisban
**Kapcsolódó:** A-M7.3 befizetés-kör minta (ugyanezek a patterns)

---

## 1. Miért most ez a lépés?

A befizetés-kör (A-M7.3a-d5) **teljes** — rögzítés, lista, sztornó, szűrők, export, család-detekt. A gyülekezet pénzügyi képe azonban **nem teljes** kiadás-követés nélkül:

- **Befizetés** = bejövő pénz (tagok járulék, persely, adomány)
- **Kiadás** = kimenő pénz (eszközök, segélyezés, utazás, fűtés)

A könyvelés, TVA-jelentés, éves számadás — mindezek a **két oldal** egymás mellettlátását igénylik.

Az A-M7.4 kör ezt pótolja. Ma az első lépés: a **lista** (és a kategória-lista). Az A-M7.4b-c-d-ben jön a save, storno, UI.

---

## 2. `kiadas` tábla különbségek a `befizetes`-től

A két tábla ~80%-ban azonos (pénzmozgás-rögzítés), de a kiadás:

- **`atvevoid`** (FK szemely) — ki kapta a pénzt, ha tag (pl. lelkész, gondnok)
- **`atvevo`** (text) — ha nem-tag (idegen cég, kereskedő)
- **`kedvezmenyezett_cui`** — CUI/adószám cég esetén (TVA-követelmény)
- **`vonatkozo_idoszak`** — pl. „2026 01" (melyik időszakra szól a fűtés-számla)
- **NINCS `csalad` / `id_csalad`** — a kiadás nem család-szintű
- **NINCS `fizetettev`** — a kiadás mindig az aktuális évhez tartozik (tipikusan)
- **`datum` timestamp** (nem date) — pontosabb időbélyeg

A `kiadascel` tábla a `befizetescel`-lel majdnem azonos felépítésű (50-80 kategória).

---

## 3. Mi változott?

### 3.1 Zod sémák — `kiadas-list.ts` (új fájl)

**Fájl:** `packages/validations/src/finance/kiadas-list.ts` (~120 sor)

Négy séma:

```ts
kiadasListRowSchema          // teljes kiadás-sor (27 mező)
listExpenseInputSchema       // szűrő-input (year, atvevoId, kiadasceId, …)
kiadasCelRowSchema           // kategória-sor (7 mező)
listKiadasCelekInputSchema   // kategória-input (onlyActive?)
```

Re-exportálva a `packages/validations/src/index.ts`-ből.

### 3.2 Core use-case — `listExpenseUseCase`

**Fájl:** `packages/core/src/finance/kiadas/list.ts` (~140 sor)

A `listIncomeUseCase` tükörképe:
- PostgREST-join: `kiadascel`, `szemely!kiadas_atvevoid_fk` (mint `atvevo_szemely`), `bankszamlak`
- `normalizeRow` helper — a nested objekteket flat `kiadascel_nev`, `atvevo_nev`, `bankszamla_nev` mezőkké
- Drift-graceful safeParse
- Szűrők: év, atvevoId, kiadasceId, includeDeleted (default false), includeStornozott (default true)
- Rendezés: datum-desc (default), datum-asc, osszeg-desc
- Limit: 1-2000 (default 500)

**Szerver-oldali szűrés** — a `year` paraméter `>= year-01-01` és `<= year-12-31T23:59:59` (a timestamp-mezőre igazítva).

### 3.3 Core use-case — `listKiadasCelekUseCase`

**Fájl:** `packages/core/src/finance/kiadas/list-cel.ts` (~60 sor)

A `listBefizetesCelekUseCase` minimális portja a `kiadascel` táblára.

### 3.4 Core re-export

**Fájl:** `packages/core/src/index.ts` — mindkét új use-case + típusok exportálva.

### 3.5 Web Server Action adapterek

**Fájl:** `apps/web/app/(dashboard)/penzugy/kiadas-actions.ts` (új, ~55 sor)

Két action-függvény:
- `listExpenseAction(input)` — congregationId az effective-access-ből
- `listKiadasCelekAction(onlyActive?)`

Thin wrapper-ek a core-hívások köré. A meglévő ~2400 soros `penzugy/actions.ts` kiadás-kódja **változatlan** (backward-compat, a fokozatos migráció a kör lezárultával).

---

## 4. Verifikáció

| Check | Eredmény |
|---|---|
| `npx tsc --noEmit` (packages/validations) | ✅ 0 error |
| `npx tsc --noEmit` (packages/core) | ✅ 0 error |
| `npx tsc --noEmit` (apps/web) | ✅ 0 error |
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ 37 fájl, 0 tiltott |

---

## 5. Biztonsági szempontok

1. **RLS** — `kiadas`, `kiadascel`, `szemely`, `bankszamlak` mind RLS-védett (A-M6.2 audit)
2. **congregationId soha kliens-oldalon** — a web adapter az effective-access-ből injektál
3. **Drift-tolerancia** — sikertelen zod-parse-ok csendben kihagyva, nem borítja a listát
4. **PII scope** — csak név-mezők (csaladnev, k_nev, ferjk_nev) az atvevo szemelyből

---

## 6. Mi marad hátra — a kiadás-kör folytatása

### A-M7.4b — `saveExpenseUseCase` + kiegészítők
- saveExpense (analóg a befizetéshez)
- `getNextReceiptNumberForExpenseUseCase` (külön iratszám-szekvencia a kiadásokra?)
- A web-oldalon a `saveExpense` már meglévő — port kell a core-ba

### A-M7.4c — `softDeleteExpenseUseCase` + `stornoExpenseUseCase`
- Soft-delete (`deleted=true`)
- Sztornó (kötelező indoklás, cascade a `kiadasikiseroiv`-re, év-véglegesítés check)

### A-M7.4d — Desktop `/penzugy/kiadas` oldal
- Lista + form + sztornó + export
- A befizetés-page.tsx mintájára

### A-M7.4e — Offline-capability
- Rust v13 `kiadas_local` + `kiadascel_local` + pull-sync

---

## 7. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — NEM kerül be: backend use-case-ek, még nincs UI
3. **Obsidian** — az A-M7.4 kör teljes lezárása után atomic-note
