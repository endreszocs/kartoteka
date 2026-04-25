# A-M7.4b — `saveExpenseUseCase` + 2 kiegészítő use-case (iratszám, duplikátum)

**Dátum:** 2026-04-24
**Scope:** A kiadás-kör **write use-case-e** + 2 kiegészítő. A befizetés-kör `saveIncomeUseCase`-ének tükörképe.
**Státusz:** ✅ kész — a kiadás-backend most 5 use-case-t (list, list-cel, save, next-receipt, duplicate-check)
**Kapcsolódó:** A-M7.4a (list), A-M7.3b (befizetés save minta)

---

## 1. Mit ad ma a fejlesztőnek?

A kiadás-kör **backend CRUD fele teljes**: a web-ről vagy a desktopról most már rögzíthető új kiadás shared-use-case-en keresztül. A `saveIncomeUseCase` mintája követve, a kiadás-specifikus mezőkkel.

### Az 5 kiadás-use-case

| # | Use-case | Célja |
|---|---|---|
| 1 | `listExpenseUseCase` (A-M7.4a) | Kiadás-lista PostgREST-join-nal |
| 2 | `listKiadasCelekUseCase` (A-M7.4a) | Kategória-dropdown |
| 3 | `saveExpenseUseCase` | Új kiadás rögzítése |
| 4 | `getNextReceiptNumberForExpenseUseCase` | Iratszám-gen (Készpénz, adott év) |
| 5 | `checkExpenseReceiptDuplicateUseCase` | Duplikátum-ellenőrzés |

**A tag-kereső és család-resolver nem duplikálva** — a befizetés-kör `searchMembersForFinanceUseCase` és `getFamilyIdForPersonUseCase` is használható a kiadás-formban (ugyanazok a tagok, ugyanaz a gyülekezet).

---

## 2. Mi változott?

### 2.1 Zod sémák — `kiadas-save.ts` (új fájl)

**Fájl:** `packages/validations/src/finance/kiadas-save.ts` (~90 sor)

3 input-séma:

```ts
saveExpenseInputSchema                          // SaveExpenseInput
nextExpenseReceiptNumberInputSchema             // NextExpenseReceiptNumberInput
checkExpenseReceiptDuplicateInputSchema         // CheckExpenseReceiptDuplicateInput
```

**Fő kiadás-validációk a `saveExpenseInputSchema`-n:**

1. `datum ≤ today()` — jövőbeli dátum blokkolva (mint a befizetésnél)
2. **`atvevoid || (atvevo && atvevo.trim().length > 0)`** — meg kell adni vagy tag-FK-t vagy szöveges átvevő-nevet. Ez a kiadás-specifikus validáció (a befizetés-ben nincs ilyen).
3. `kedvezmenyezett_cui` — opcionális, max 32 char (TVA-követelmény cég esetén)
4. `vonatkozo_idoszak` — opcionális, max 50 char (pl. „2026 01")

### 2.2 Core — `saveExpenseUseCase`

**Fájl:** `packages/core/src/finance/kiadas/save.ts` (~170 sor)

Ugyanaz a flow, mint a `saveIncomeUseCase`-nél:
1. Zod-validálás
2. Iratszám-eldöntés (`getNextReceiptNumberForExpenseUseCase` ha üres)
3. `checkExpenseReceiptDuplicateUseCase`
4. Payload (modern + legacy kompat)
5. Insert + `isMissingColumnError` retry
6. 23505 → `duplicateReceipt: true`

**Kiadás-specifikus:**
- **`datum` TIMESTAMP** — a `YYYY-MM-DD` inputot `YYYY-MM-DDT00:00:00` formára egészítjük ki (Supabase kliens lefordítja)
- Payload-mezők: `atvevoid`, `atvevo`, `kedvezmenyezett_cui`, `vonatkozo_idoszak`
- Nincs `csalad`, `fizetettev`, `id_befizetescel` — helyette `id_kiadascel`

### 2.3 Core — `getNextReceiptNumberForExpenseUseCase`

**Fájl:** `packages/core/src/finance/kiadas/next-receipt-number.ts` (~70 sor)

A `getNextReceiptNumberUseCase` (befizetés) tükörképe a `kiadas` táblára. Ugyanaz a logika (Készpénz + nem-törölt + nem-belső-mozgás + év-szűrő → max iratszám + 1).

**Fontos:** a befizetés és a kiadás iratszám-szekvenciája **szeparált**. A gyülekezet két külön nyilvántartást vezet; az egyik sorszám `BEF-2026-042`, a másik `KIA-2026-038` nem ütközhet.

### 2.4 Core — `checkExpenseReceiptDuplicateUseCase`

**Fájl:** `packages/core/src/finance/kiadas/check-receipt-duplicate.ts` (~60 sor)

A `checkReceiptDuplicateUseCase` (befizetés) tükörképe a `kiadas` táblára.

### 2.5 Core re-export

**Fájl:** `packages/core/src/index.ts` — 3 új use-case + típusok exportálva.

### 2.6 Web Server Action adapterek

**Fájl:** `apps/web/app/(dashboard)/penzugy/kiadas-actions.ts` — 3 új thin wrapper:

- `saveExpenseAction(input)`
- `getNextExpenseReceiptNumberAction(year)`
- `checkExpenseReceiptDuplicateAction(iratszam, excludeId?)`

Minden: effective-access-ből a congregationId + user ID.

---

## 3. Verifikáció

| Check | Eredmény |
|---|---|
| `npx tsc --noEmit` (packages/validations) | ✅ 0 error |
| `npx tsc --noEmit` (packages/core) | ✅ 0 error |
| `npx tsc --noEmit` (apps/web) | ✅ 0 error |
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ 37 fájl, 0 tiltott |

---

## 4. Biztonsági szempontok

1. **RLS** — `kiadas` és `kiadascel` RLS-védett, a congregation_id-scope explicit
2. **Iratszám-szeparáltság** — a befizetés-iratszám-pool és a kiadás-iratszám-pool független egymástól
3. **Unique constraint** — a szerveren (`kiadas (iratszam, congregation_id)`) a 23505 védi a race-eket
4. **`atvevoid` FK validáció** — a szerver rejct-eli, ha a tag-ID nem a saját gyülekezetben van (RLS)
5. **`userid` audit** — minden insert rögzíti a rögzítő user UUID-ját

---

## 5. Mi marad hátra

### A-M7.4c — `softDeleteExpenseUseCase` + `stornoExpenseUseCase`
- Ugyanaz a minta, mint a befizetésnél
- Cascade: a `kiadasikiseroiv` tábla is érintett (kísérőív), a storno ezt is sztornózza

### A-M7.4d — Desktop `/penzugy/kiadas` oldal
- Lista + form + sztornó + Excel export
- A `/penzugy/befizetes` minta szerint
- `PenzugyLandingPage`-en új kártya hozzáadása

### A-M7.4e — Offline-capability
- Rust v13 `kiadas_local` + `kiadascel_local` + pull-sync

---

## 6. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — NEM kerül be: backend, még nincs UI
3. **Obsidian** — az A-M7.4 kör lezárultával atomic-note
