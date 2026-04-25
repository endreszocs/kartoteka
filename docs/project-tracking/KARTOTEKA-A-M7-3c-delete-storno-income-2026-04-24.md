# A-M7.3c — `softDeleteIncomeUseCase` + `stornoIncomeUseCase`

**Dátum:** 2026-04-24
**Scope:** A befizetés-kör CRUD lezárása — két külön művelet (soft-delete vs. sztornó) eltérő szemantikával
**Státusz:** ✅ A-M7.3 alap CRUD TELJES (lista + save + 4 helper + soft-delete + sztornó)
**Kapcsolódó:** A-M7.3a (list), A-M7.3b (save + 4 helper)

---

## 1. A két művelet szétválasztása

| | **Soft-delete** | **Sztornó** |
|---|---|---|
| DB-flag | `deleted = true` | `stornozott = true` + `stornozott_at` + `stornozott_indok` + `stornozott_by` |
| Szemantika | „sosem kellett volna rögzíteni" (elírás, dupla-entry) | „érvénytelenítés" (könyvelési fogalom) |
| Indoklás | nem kötelező | **kötelező** (min 5 char) |
| Lista-visibility | `includeDeleted` flag (default: false) | `includeStornozott` (default: true, áthúzva) |
| Kapcsolt chitantak | nem érinti | cascade sztornózás (opt-in) |
| Belső mozgás párja | nem érinti | cascade sztornózás (opt-in) |
| Év-véglegesítés check | nincs | **van** (`bealitas.accounting_finalized`) |
| Visszafordítható | igen (`deleted = false`) | nem (audit-trail) |

**Üzleti döntés:** a chitantákhoz hasonlóan a sztornó a „komoly" művelet, indoklással + audit-trail-lel. A soft-delete könnyebb — eltüntetés a listából, később visszahozható.

---

## 2. Mi változott?

### 2.1 Zod sémák — `befizetes-delete.ts` (új fájl)

**Fájl:** `packages/validations/src/finance/befizetes-delete.ts` (~60 sor)

Két input-séma:

```ts
softDeleteIncomeInputSchema = z.object({
  congregationId: z.string().uuid(),
  befizetesId: z.number().int().positive(),
})

stornoIncomeInputSchema = z.object({
  congregationId: z.string().uuid(),
  befizetesId: z.number().int().positive(),
  indok: z.string().trim().min(5).max(500),
  cascadeChitantas: z.boolean().optional(),              // default true
  cascadeInternalTransfer: z.boolean().optional(),       // default true
  skipYearFinalizedCheck: z.boolean().optional(),        // default false — admin-override
})
```

### 2.2 Core — `softDeleteIncomeUseCase`

**Fájl:** `packages/core/src/finance/befizetes/soft-delete.ts` (~60 sor)

Egyszerű UPDATE (`deleted=true`) + scope check. Return:
- `{ success: true }` — OK
- `{ success: false, error, notFound?: true }` — a sor nem található vagy másik gyülekezet

### 2.3 Core — `stornoIncomeUseCase`

**Fájl:** `packages/core/src/finance/befizetes/storno.ts` (~180 sor)

**Flow:**

```
stornoIncomeUseCase
  ↓ 1. Zod-validálás (indok ≥ 5 char)
  ↓ 2. Befizetés lekérdezése (datum, belso_mozgas_xkey, stornozott, deleted)
  ↓ 3. notFound → error
  ↓ 4. alreadyStorno (stornozott=true már) → error + alreadyStorno: true
  ↓ 5. Év-véglegesítés check (ha !skipYearFinalizedCheck)
     └─ finalized=true → error + yearFinalized: true
  ↓ 6. Fő UPDATE: stornozott, stornozott_at, stornozott_indok, stornozott_by
  ↓ 7. Belső-mozgás pár (ha cascadeInternalTransfer && belso_mozgas_xkey)
     └─ UPDATE belső mozgás párját ugyanazzal a payload-dal
  ↓ 8. Kapcsolt chitantak (ha cascadeChitantas)
     └─ UPDATE oblio_szamlak WHERE befizetes_id = ? AND stornozott = false
  ↓ return { success: true, cascadedChitantas, cascadedInternalTransfer }
```

**Kulcs tervezési döntések:**

1. **Saját `isYearFinalized` helper** — a web-oldali `lib/auth/finance-scope.ts`-ben lévő `isYearFinalized` használ egy komplex `tablesFor` absztrakciót (dicese/congregation scope). A core-ban nem akartuk ezt átemelni; egyszerű direkt query a `bealitas` táblára (`id = String(year)`, `congregation_id`, `accounting_finalized` oszlop).

2. **Cascade NEM atomikus** — a szerver nem csomagolja tranzakcióba a 3 UPDATE-et. Ha a fő sztornó után a belső-mozgás vagy chitanta UPDATE elbukik, a fő már sztornó-állapotban marad, és a felhasználó a hibaüzenetből tudja, mit kell manuálisan ellenőrizni. A kockázat kicsi, és a tranzakciós rollback implementálása a core-ban nem trivi (egy külön RPC kellene hozzá).

3. **`cascadeChitantas=true` default** — a web-oldali `edit-storno-actions.ts` mintája szerint: ha befizetést sztornózunk, a hozzá kapcsolódó papír-nyugtákat is.

4. **`stornozott_indok` chitantara:** `"A befizetés stornózva: {indok}"` — a lelkész egy pillantásra látja, hogy miért van sztornózva.

5. **`skipYearFinalizedCheck`** — admin-override flag, az A-M7.4-ben várható `adminOverrideStornoAction` fog ezzel működni.

### 2.4 Core re-export

**Fájl:** `packages/core/src/index.ts`

```ts
export { softDeleteIncomeUseCase, type SoftDeleteIncomeCtx, type SoftDeleteIncomeResult } from './finance/befizetes/soft-delete'
export { stornoIncomeUseCase, type StornoIncomeCtx, type StornoIncomeResult } from './finance/befizetes/storno'
```

### 2.5 Web adapterek

**Fájl:** `apps/web/app/(dashboard)/penzugy/befizetes-actions.ts` — 2 új:

```ts
softDeleteIncomeAction(befizetesId: number): Promise<SoftDeleteIncomeResult>
stornoIncomeAction(input: StornoIncomeWebInput): Promise<StornoIncomeResult>
```

---

## 3. Verifikáció

| Check | Eredmény |
|---|---|
| `npx tsc --noEmit` (packages/validations) | ✅ 0 error |
| `npx tsc --noEmit` (packages/core) | ✅ 0 error |
| `npx tsc --noEmit` (apps/web) | ✅ 0 error |
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ 34 fájl, 0 tiltott |

**Nem tesztelt (funkcionális smoke):**
- Sztornó évzárás-checkkel (`accounting_finalized = true`)
- Cascade chitantak száma (`oblio_szamlak.befizetes_id` → N sor sztornózva)
- Belső-mozgás pár sztornózás (`belso_mozgas_xkey` keresés)
- Duplikált sztornó (második hívás → `alreadyStorno: true`)

---

## 4. Biztonsági szempontok

1. **RLS** — `befizetes`, `oblio_szamlak`, `bealitas` mind RLS-védett. A congregation_id-scope szigorúan érvényesül a core-ban is (explicit `.eq('congregation_id', ...)` minden queryn).
2. **userId a sztornó audit-trail-nek** — `stornozott_by` kitöltve, visszakereshető.
3. **Év-véglegesítés = hard-block** — a sztornó NEM megy át véglegesített évre. Ez a szabályt a korábbi finance-scope.ts tartotta; most a core-ban is érvényesül. Az `accounting_finalized = true` gyülekezeti beállítás az egyházmegyei admin által kap feloldást.
4. **Cascade opt-in, nem opt-out** — a caller explicit dönthet, hogy a kapcsolt tételeket is sztornózza vagy sem. Default `true` (a valószínűbb szándék), de kikapcsolható.
5. **Soft-delete visszafordítható** — sose hajtunk végre hard `DELETE`-et a `befizetes`-re. A `deleted=true` legrosszabb esetben is visszaállítható (`deleted=false`).

---

## 5. A A-M7.3 kör CRUD lezárása

**Most kész a teljes shared befizetés CRUD:**

| Művelet | Use-case | Web action |
|---|---|---|
| LIST | `listIncomeUseCase` | `listIncomeAction` |
| SAVE (új) | `saveIncomeUseCase` | `saveIncomeAction` |
| next receipt | `getNextReceiptNumberUseCase` | `getNextReceiptNumberAction` |
| duplicate check | `checkReceiptDuplicateUseCase` | `checkReceiptDuplicateAction` |
| member search | `searchMembersForFinanceUseCase` | `searchMembersForFinanceAction` |
| family resolve | `getFamilyIdForPersonUseCase` | `getFamilyIdForPersonAction` |
| SOFT-DELETE | `softDeleteIncomeUseCase` | `softDeleteIncomeAction` |
| STORNÓ | `stornoIncomeUseCase` | `stornoIncomeAction` |

**8 use-case + 8 web adapter.** A desktop már ma tud ezekre épülni — csak UI kell a `/penzugy/befizetes` route-ra.

---

## 6. Mi marad hátra (a befizetés-kör folytatása)

### A-M7.3d (jövőbeli, offline-capability)
- Rust v12 migráció: `befizetes_local` + `befizetescel_local` SQLite táblák
- Pull-szink (`pullBefizetesek`)
- Offline write (iratszam-wallet, ha szükséges)

### Desktop `/penzugy/befizetes` oldal (jövőbeli, ha elhatározzuk)
- Lista-view (listIncomeAction alapú)
- Rögzítő form (tag-autocomplete → save → duplicate-check)
- Sztornó modal (mint a chitanta conflict-modal)
- Sztornóztal cascade-visszajelzés

### Update-flow (jövőbeli, ha kell)
- `updateIncomeUseCase` — egy meglévő befizetés módosítása
- A szerver-oldali `edit-storno-actions.ts` portja

### Egyéb
- A meglévő ~2400 soros `actions.ts` fokozatos refaktorálása — a befizetés-rész törölhető az A-M7.3 kör lezárultával (de ez a lépés a desktop + web-UI migrációja után jön)

---

## 7. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — NEM kerül be: backend use-case-ek, még nincs UI (sem desktop, sem új web). Az A-M7.3 kör UI-jével együtt kommunikáljuk.
3. **Obsidian** — az A-M7.3a+b+c kör záróakkordjaként egy atomic-note: „Befizetés shared CRUD — 8 use-case". Endre vagy a köv. session.
