# A-M7.3b — `saveIncomeUseCase` + 4 kiegészítő use-case

**Dátum:** 2026-04-24
**Scope:** A befizetés-kör **write use-case-e** + 4 kiegészítő (iratszám-gen, duplikátum-check, tag-kereső, család-resolver)
**Státusz:** ✅ kód + web adapterek kész, desktop UI későbbi iterációban
**Kapcsolódó:** A-M7.3a (list use-case)

---

## 1. Mit ad ma a fejlesztőnek (és webes lelkésznek)?

A befizetés-kör most **teljesen shared-re van szedve** — 6 use-case a `@kartoteka/core`-ban, a web Server Action-ök ultrathin wrapper-ek. A desktop ugyanezeket közvetlenül hívhatja, ha UI épül rá.

### A 6 use-case

| # | Use-case | Célja |
|---|---|---|
| 1 | `listIncomeUseCase` (A-M7.3a) | Befizetés-lista szűrőkkel + join-okkal |
| 2 | `saveIncomeUseCase` | Új befizetés rögzítése |
| 3 | `getNextReceiptNumberUseCase` | Következő szabad iratszám (Készpénz, adott év) |
| 4 | `checkReceiptDuplicateUseCase` | Iratszám-duplikátum ellenőrzés |
| 5 | `searchMembersForFinanceUseCase` | Tag-kereső diakritika-normalizálással |
| 6 | `getFamilyIdForPersonUseCase` | Tag ID → család FK resolve |

### A save-flow belső lánca

```
saveIncomeAction (web) / saveIncomeUseCase (core)
  ↓ zod validálás (datum ≤ today, id_szemely & id_csalad kölcsönös kiz.)
  ↓ iratszám-eldöntés
      ├─ input.iratszam megvan → használjuk
      └─ üres → getNextReceiptNumberUseCase(year) → N+1
  ↓ checkReceiptDuplicateUseCase
      └─ ütközés → { error, duplicateReceipt: true }
  ↓ payload (modern + legacy kompat)
  ↓ supabase.from('befizetes').insert
      ├─ isMissingColumnError → retry modern payload-dal
      ├─ 23505 → { error, duplicateReceipt: true }
      └─ siker → { data: { id, iratszam } }
```

---

## 2. Mi változott?

### 2.1 Zod sémák — `befizetes-save.ts` (új fájl)

**Fájl:** `packages/validations/src/finance/befizetes-save.ts` (~130 sor)

5 input-séma:

```ts
saveIncomeInputSchema              // SaveIncomeInput — a befizetes INSERT payload
nextReceiptNumberInputSchema       // NextReceiptNumberInput
checkReceiptDuplicateInputSchema   // CheckReceiptDuplicateInput
searchMembersForFinanceInputSchema // SearchMembersForFinanceInput
familyIdForPersonInputSchema       // FamilyIdForPersonInput
```

+ 2 eredmény-type (`SaveIncomeResult` és `MemberSearchResult`).

Kulcs validációk a `saveIncomeInputSchema`-n:
- `refine(d => d.datum <= today())` — jövőbeli dátum blokkolva
- `refine(d => !(d.id_szemely && d.id_csalad))` — kölcsönös kizárólagosság

### 2.2 Core use-case-ek — 5 új fájl

**Fájl:** `packages/core/src/finance/befizetes/*.ts` (5 fájl, ~500 sor össz.)

1. **`save.ts`** (`saveIncomeUseCase`, ~180 sor):
   - `generateXkey()` — `globalThis.crypto.randomUUID()` + fallback
   - `buildDocumentNumber()` — a web `buildDocumentNumber` portja (`replace(/-/g)` nem `replaceAll`-al a konzervatívabb tsconfig-hoz)
   - `isMissingColumnError()` — legacy-kompat fallback
   - Modern + legacy payload, retry logic
   - `duplicateReceipt: true` flag 23505-re vagy pre-check-re

2. **`next-receipt-number.ts`** (`getNextReceiptNumberUseCase`, ~70 sor):
   - `SELECT iratszam FROM befizetes WHERE congregation_id = ? AND deleted = false AND irattipus ILIKE '%észpénz%' AND belso_mozgas_xkey IS NULL AND datum BETWEEN year-01-01 AND year-12-31`
   - Regex-extract a max számot, +1
   - **Nem concurrency-safe** — a 23505 a valódi védelem

3. **`check-receipt-duplicate.ts`** (`checkReceiptDuplicateUseCase`, ~60 sor):
   - `SELECT id FROM befizetes WHERE congregation_id = ? AND iratszam = ? AND deleted = false LIMIT 1`
   - Opcionális `excludeId` az update-flow-hoz

4. **`search-members.ts`** (`searchMembersForFinanceUseCase`, ~100 sor):
   - Diakritika-normalizálás (`normalize('NFD').replace(/[\u0300-\u036f]/g)`)
   - Egyetlen szó → OR (csaladnev ILIKE OR k_nev ILIKE)
   - Több szó → csaladnev + k_nev
   - Adrlocality + adrstreet join-nal a `cim_nev` összerakás
   - `MemberSearchResult` flat shape (id, csaladnev, k_nev, sz_datum, cim_nev)

5. **`family-id-for-person.ts`** (`getFamilyIdForPersonUseCase`, ~70 sor):
   - 1. `csalad WHERE id_ferfi = ? OR id_no = ?` — szülő
   - 2. `gyerek WHERE id_szemely = ?` → `csalad.id` — gyerek
   - 3. Ha sehol → `familyId: null`

### 2.3 Core re-export

**Fájl:** `packages/core/src/index.ts`

Minden 5 új use-case exportálva, plusz a típusuk.

### 2.4 Web Server Action adapterek — 5 új + 1 meglévő

**Fájl:** `apps/web/app/(dashboard)/penzugy/befizetes-actions.ts` (~180 sor)

6 action-függvény:
- `listIncomeAction(input)` — meglévő (A-M7.3a)
- `saveIncomeAction(input)` — új
- `getNextReceiptNumberAction(year)` — új
- `checkReceiptDuplicateAction(iratszam, excludeId?)` — új
- `searchMembersForFinanceAction(query, limit?)` — új
- `getFamilyIdForPersonAction(personId)` — új

Mind thin: `effective-access` → core-use-case-hívás. A kliens soha nem küld `congregationId`-t; a biztonsági réteg a server-oldalon garantált.

---

## 3. Verifikáció

| Check | Eredmény |
|---|---|
| `npx tsc --noEmit` (packages/validations) | ✅ 0 error |
| `npx tsc --noEmit` (packages/core) | ✅ 0 error |
| `npx tsc --noEmit` (apps/web) | ✅ 0 error |
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ 34 fájl, 0 tiltott |

**Nem tesztelt (jövőbeli smoke-test):**
- Funkcionális insert + retrieval
- 23505 ütközés szcenárió (két user egy időben)
- Diakritika-kereső („Kovács" vs „Kovacs")
- Gyerek-család resolve (amikor a `gyerek.id_szemely` jelen van)
- Legacy-fallback — a `isMissingColumnError` runtime-viselkedése

---

## 4. Biztonsági szempontok

1. **RLS** — a `befizetes`, `szemely`, `csalad`, `gyerek` táblák mind RLS-védettek (A-M6.2 113-tábla audit után igazolt). A `saveIncomeUseCase` a hívó kontextusában fut, nem `service_role`-ban.
2. **congregationId soha nem kliens-oldali** — az `effective-access`-ből tölti a web adapter. Desktopon a user saját profile-jéből.
3. **userId a use-case ctx-ben kötelező** — a `befizetes.userid` oszlopot töltjük vele (audit).
4. **Duplikátum-ellenőrzés kétszintű** — (a) pre-check a `checkReceiptDuplicateUseCase`-ben, (b) szerver-oldali unique constraint (23505). A (a) csak segít, nem elég — a (b) a valódi védelem race-ek ellen.
5. **`userid` FK-ra az `auth.users`** — a save-use-case `ctx.userId`-jét kapjuk, amit az `auth.uid()` vagy a session user adja. Ha egy rossz `userId` jön (nem létező user), a FK constraint borítja.

---

## 5. Mi marad hátra (a befizetés-kör A-M7.3c + d)

### A-M7.3c — `deleteIncomeUseCase` (soft-delete / sztornó) (köv. session)
- `softDeleteIncomeUseCase` — a `deleted=true` flag beállítása
- `stornoIncomeUseCase` — `stornozott=true` + indok (mint a chitanta-stornó)

### A-M7.3d — offline-capability (jövőbeli)
- Rust v12 migráció: `befizetes_local` SQLite tábla
- Pull-szink
- Offline write (iratszam-wallet?)

### Desktop `/penzugy/befizetes` oldal (jövőbeli)
- Lista + form + tag-kereső
- A chitanta-page.tsx mintájára

---

## 6. A meglévő `actions.ts` refaktor státusza

**Jelenleg:** a `apps/web/app/(dashboard)/penzugy/actions.ts` ~2400 soros fájlban a befizetés-műveletek (insertIncomeRecord, saveIncome, saveIncomeBatch, getNextReceiptNumber, searchMembersForFinance, getFamilyIdForPerson, checkReceiptDuplicate) **még mindig élnek**. A meglévő web-UI (app/(dashboard)/penzugy/_components/*) ezeket hívja.

**Migráció-stratégia:**

1. **A jelenlegi web-UI-t NEM nyúljuk hozzá** — a régi actions.ts export-ok megmaradnak (backward compat).
2. Az új `befizetes-actions.ts` a desktop + új web-komponensek számára elérhető.
3. Amikor az új befizetés-flow kész a desktopon (A-M7.3 teljes + UI), a web-UI **fokozatosan** áthelyezhető az új wrapper-re.
4. A legacy `actions.ts`-ből a befizetés-részek törölhetők utolsó lépésként (külön PR).

Ez a megközelítés:
- Nem tör semmit (a web-UI folytonosságát nem érinti)
- Lehetővé teszi a desktop build-et a chitanta-mintát követve
- Fokozatos cleanup

---

## 7. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — NEM kerül be user-facing bejegyzés: **backend use-case-ek, még nincs új UI**. Amikor a desktop `/penzugy/befizetes` oldal feláll vagy a web-UI átáll, akkor kommunikáljuk.
3. **Obsidian** — az A-M7.3 kör teljes része után (a-b-c-d végén), egyetlen atomic-note
