# A-M7.4c — `softDeleteExpenseUseCase` + `stornoExpenseUseCase`

**Dátum:** 2026-04-24
**Scope:** A kiadás-kör **CRUD lezárása** — 7 use-case együtt (5 befizetés-párja + 2 új)
**Státusz:** ✅ kész
**Kapcsolódó:** A-M7.4a/b, A-M7.3c (befizetés-sztornó minta)

---

## 1. A kiadás-sztornó egyszerűbb a befizetésnél

| | Befizetés-sztornó | Kiadás-sztornó |
|---|---|---|
| Fő UPDATE | ✅ stornozott + at + indok + by | ✅ ua. |
| Év-véglegesítés check | ✅ `bealitas.accounting_finalized` | ✅ ua. |
| Belső-mozgás pár cascade | ✅ `belso_mozgas_xkey` alapján (csak befizetes-en) | ✅ `belso_mozgas_xkey` alapján (mindkét táblán: kiadas + befizetes) |
| Chitanta cascade | ✅ `oblio_szamlak.befizetes_id` | ❌ — a kiadás nem ad ki papír-nyugtát |
| Kísérőív cascade | — | ❌ — `kiadasikiseroiv`-nak nincs stornozott oszlopa |
| Result cascade-mezői | `cascadedChitantas` + `cascadedInternalTransfer` | csak `cascadedInternalTransfer` |

**Kulcs különbség a belső-mozgásnál:** A kiadás sztornója **két irányba** kereshet a párjára — ha a kiadás „kassza → bank" transzfer volt, a befizetés-táblában van a párja (bank-oldal). Ezért a kiadás-sztornó mindkét táblát frissíti (`kiadas` + `befizetes`).

---

## 2. Mi változott?

### 2.1 Zod sémák — `kiadas-delete.ts` (új fájl)

**Fájl:** `packages/validations/src/finance/kiadas-delete.ts` (~50 sor)

```ts
softDeleteExpenseInputSchema  // { congregationId, kiadasId }
stornoExpenseInputSchema      // { congregationId, kiadasId, indok, cascadeInternalTransfer?, skipYearFinalizedCheck? }
```

A befizetés-verzióhoz képest a `cascadeChitantas` flag **nincs** — a kiadás nem érinti a chitantákat.

### 2.2 Core — `softDeleteExpenseUseCase`

**Fájl:** `packages/core/src/finance/kiadas/soft-delete.ts` (~60 sor)

Egyszerű `UPDATE deleted=true`. Teljesen ugyanaz a minta, mint a befizetésnél.

### 2.3 Core — `stornoExpenseUseCase`

**Fájl:** `packages/core/src/finance/kiadas/storno.ts` (~150 sor)

**Flow:**

```
stornoExpenseUseCase
  ↓ 1. Zod-validálás (indok ≥ 5 char)
  ↓ 2. Kiadás lekérdezése (datum, belso_mozgas_xkey, stornozott, deleted)
  ↓ 3. notFound / alreadyStorno / yearFinalized flag-ek
  ↓ 4. Év-véglegesítés check (`bealitas.accounting_finalized`)
  ↓ 5. Fő UPDATE (stornozott, at, indok, by)
  ↓ 6. Belső-mozgás pár cascade (cascadeInternalTransfer opt-in)
     ├─ UPDATE kiadas WHERE belso_mozgas_xkey = ? AND id != this
     └─ UPDATE befizetes WHERE belso_mozgas_xkey = ?
  ↓ return { success: true, cascadedInternalTransfer }
```

**Fontos részlet a belső-mozgás pár cascade-nél:**

A `belso_mozgas_xkey` egy UUID, ami köti a transzfer két oldalát. A típusok:
- `kassza_bank`: kassza-oldali kiadás + bank-oldali befizetés
- `bank_kassza`: bank-oldali kiadás + kassza-oldali befizetés
- `bank_bank`: két bank-oldali bejegyzés (ugyanabban a táblában lehet — pl. valutacsere)
- `valutacsere`: bonyolultabb (nem érinti a sztornót tipikusan)

Ezért a kiadás-sztornó **mindkét táblán** frissít: a `kiadas` táblában a sajátját (kivéve az eredeti id-t), és a `befizetes` táblában a párját (ha van).

### 2.4 Core re-export + Web adapterek

A `softDeleteExpenseAction` és `stornoExpenseAction` a `kiadas-actions.ts`-be kerül thin-wrapper-ként.

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

## 4. A-M7.4 kiadás-kör CRUD lezárva

7 use-case együtt:

| # | Művelet | Use-case |
|---|---|---|
| 1 | LIST | `listExpenseUseCase` (A-M7.4a) |
| 2 | kategória-lista | `listKiadasCelekUseCase` (A-M7.4a) |
| 3 | SAVE | `saveExpenseUseCase` (A-M7.4b) |
| 4 | next receipt | `getNextReceiptNumberForExpenseUseCase` (A-M7.4b) |
| 5 | duplicate check | `checkExpenseReceiptDuplicateUseCase` (A-M7.4b) |
| 6 | SOFT-DELETE | `softDeleteExpenseUseCase` (A-M7.4c) |
| 7 | STORNÓ | `stornoExpenseUseCase` (A-M7.4c) |

**A shared pénzügyi backend most:**
- **13 befizetés-use-case** (list, save, delete, sztornó + 9 helper/sub)
- **7 kiadás-use-case**

Összesen **20 shared use-case a pénzügy-domainben**, mindegyik zod-validált, Result-fajtájú.

---

## 5. Mi marad hátra

### A-M7.4d — Desktop `/penzugy/kiadas` oldal
- Ugyanaz a struktúra, mint a `befizetes-page.tsx`: rögzítő form + lista + szűrők + összesítő + Excel export
- `PenzugyLandingPage`-re új „Kiadás" kártya

### A-M7.4e — Offline-capability
- Rust v13 `kiadas_local` + `kiadascel_local` + pull-sync
- A chitanta A-M7.2d minta szerint

### Közös pénzügyi nézetek (A-M7.5+)
- Éves dashboard (bevétel vs kiadás, kategória-breakdown mindkét oldalról)
- Havi összehasonlítás év-év
- TVA-plafon figyelő riasztás

---

## 6. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — NEM kerül be: backend, még nincs UI
3. **Obsidian** — a teljes A-M7.4 kör (a+b+c+d) után atomic-note
