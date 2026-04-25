# A-M7.3a — `listIncomeUseCase` (befizetés lista, shared-re)

**Dátum:** 2026-04-24
**Scope:** A befizetés (pénzbeszedés) kör **első use-case**-e — read-only lista a `befizetes` táblából, foreign-key join-okkal (`szemely`, `befizetescel`, `bankszamlak`)
**Státusz:** ✅ kód + típusok + web adapter kész, desktop UI későbbi iterációban
**Kapcsolódó:** A-M7 pénzügyi wave indítása (chitanta-kör A-M7.2e után)

---

## 1. Miért ez volt az első lépés?

A chitanta-kör befejezése után (6 alfázis + polish) a befizetes-kör a logikus folytatás: a lelkész napi szinten tag-/család-befizetéseket rögzít és listáz (járulék, persely, adomány). A `befizetes` tábla 33 oszlopos, ~13 Server Action érinti.

**Read-only lista az első lépés**, mert:
- A zod-séma + use-case minta reusable a következő write-use-case-eknél (save, delete)
- A web-oldalon már ma is hasznos (thin adapter, elavult `initFinance`-hoz alternative)
- Nincs bonyolult iratszám-generálás, hálózati race, vagy offline-kérdés

**Online-only ebben a fázisban.** Az offline-cache-elés a jövőbeli A-M7.3d alfázisban jön (befizetes_local SQLCipher mirror + pull-szink), mint a chitanta A-M7.2d1–d2 körében.

---

## 2. Mi változott?

### 2.1 Zod séma — `befizetes-list.ts` (új fájl)

**Fájl:** `packages/validations/src/finance/befizetes-list.ts` (~100 sor)

Két séma:

```ts
export const befizetesListRowSchema = z.object({
  id: z.number().int(),
  xkey: z.string(),
  datum: z.string(),              // ISO YYYY-MM-DD
  fizetettev: z.number().int(),
  osszeg: z.number(),
  osszeg_ron: z.number().nullable(),
  arfolyam: z.number().nullable(),
  forrasa: z.string(),
  iratszam: z.string(),
  irattipus: z.string(),
  nyugta: z.string(),
  is_potlas: z.boolean(),
  csalad: z.boolean(),
  id_csalad: z.number().int().nullable(),
  id_szemely: z.number().int().nullable(),
  id_befizetescel: z.number().int(),
  bankszamla_id: z.number().int().nullable(),
  megjegyzes: z.string().nullable(),
  deleted: z.boolean(),
  stornozott: z.boolean(),
  stornozott_indok: z.string().nullable(),
  stornozott_at: z.string().nullable(),
  // join-eredmények
  befizetescel_nev: z.string().nullable(),
  szemely_nev: z.string().nullable(),
  bankszamla_nev: z.string().nullable(),
  // technikai metadat
  userid: z.string().uuid(),
  congregation_id: z.string().uuid(),
  revision: z.number().int(),
  updated_at: z.string(),
  created: z.string().nullable(),
})

export const listIncomeInputSchema = z.object({
  congregationId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100).optional(),
  yearField: z.enum(['fizetettev', 'datum']).optional(),
  szemelyId: z.number().int().positive().optional().nullable(),
  csaladId: z.number().int().positive().optional().nullable(),
  befizetescelId: z.number().int().positive().optional().nullable(),
  includeDeleted: z.boolean().optional(),
  includeStornozott: z.boolean().optional(),
  orderBy: z.enum(['datum-desc', 'datum-asc', 'osszeg-desc']).optional(),
  limit: z.number().int().min(1).max(2000).optional(),
})
```

Re-exportálva a `packages/validations/src/index.ts`-ből.

### 2.2 Core use-case — `listIncomeUseCase`

**Fájl:** `packages/core/src/finance/befizetes/list.ts` (~180 sor)

```ts
export async function listIncomeUseCase(
  input: ListIncomeInput,
  ctx: ListIncomeCtx,
): Promise<ListIncomeResult>
```

**Kulcs tervezési döntések:**

1. **Single-query PostgREST-join** — a `befizetescel.nev`, `szemely.{csaladnev, k_nev, ferjk_nev}`, `bankszamlak.nev` egy lekérdezésben jön. A Supabase nested-select szintaxisa (pl. `szemely:szemely!befizetes_id_szemely_fk ( csaladnev, k_nev, ferjk_nev )`) kerülte ki a külön fetch-eket.

2. **`normalizeRow` helper** — a Supabase-válaszban a nested object-ek (pl. `r.befizetescel.nev`) a flat `BefizetesListRow.befizetescel_nev` mezővé konvertálódnak. A zod-parse a normalizált alakon fut. A nested objekteket explicit törlöm a normalizált object-ről, hogy ne zavarja az esetleges strict-parse-t.

3. **Szemely-név építés** — magyar névkonvenció: ha `ferjk_nev` kitöltött (férjezett asszony), azt használjuk, különben `csaladnev`. Utána `k_nev` (keresztnév). Ez a web-oldalon már alkalmazott minta megismételése.

4. **Tag vs család kölcsönösen kizárólagos** — ha mindkét ID megadva, a use-case `error`-t ad. Ez megakadályozza a félig-szűkített lekérdezéseket.

5. **Deleted default = false**, **stornozott default = true** — a lelkész többnyire az aktív befizetéseket akarja látni, de a sztornózottakat is (áthúzott sorok).

6. **Drift-tolerancia** — a zod-parse safeParse-et használ minden soron; a sikertelenek csendben kihagyva (nem borítja az egész listát egy sémafuttáshelyű szerver-változás).

### 2.3 Core re-export

**Fájl:** `packages/core/src/index.ts`

```ts
export {
  listIncomeUseCase,
  type ListIncomeCtx,
  type ListIncomeResult,
} from './finance/befizetes/list'
```

### 2.4 Web Server Action adapter

**Fájl:** `apps/web/app/(dashboard)/penzugy/befizetes-actions.ts` (új, ~60 sor)

```ts
'use server'

export async function listIncomeAction(
  input: ListIncomeWebInput,
): Promise<ListIncomeResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  return listIncomeUseCase(
    { congregationId: access.effectiveCongregationId, ...input },
    { supabase: access.supabase, runtime: 'web' },
  )
}
```

A kliens-szintű `ListIncomeWebInput` shape az `Omit<ListIncomeInput, 'congregationId'>` — a congregation ID-t az effective-access-ből tölti, így a kliens nem küldhet másik gyülekezet ID-ját (biztonsági réteg).

---

## 3. Verifikáció

| Check | Eredmény |
|---|---|
| `npx tsc --noEmit` (packages/validations) | ✅ 0 error |
| `npx tsc --noEmit` (packages/core) | ✅ 0 error |
| `npx tsc --noEmit` (apps/web) | ✅ 0 error |
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error (az új re-export nem tör semmit) |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ 34 fájl, 0 tiltott |

**Nem tesztelt:**
- Funkcionális SQL-query smoke-test (a Supabase FK-nevek `befizetes_id_befizetescel_fk`, `befizetes_id_szemely_fk`, `befizetes_bankszamla_id_fkey` hitelessége — a `Database_schema.sql` alapján helyes, de runtime-ban még nem futott)
- Large-list perf (500-2000 sor) — a limit-clamp az inputon OK, a DB-oldalon index kell `(congregation_id, datum)`-ra, ami már létezik
- Deleted/stornozott toggle kombinációk

---

## 4. Biztonsági szempontok

1. **RLS** — a `befizetes` tábla RLS-védett a `current_user_can_access_congregation()` helper-rel (A-M6.2 113-tábla audit után igazolt). A use-case `ctx.supabase` kliensen fut, tehát a lelkész saját gyülekezetén kívül nem látja a sorokat.
2. **Congregation-override védelem** — a web adapter *nem* fogadja el kliens-szintű `congregationId`-t. Ez az A-M7.2 óta alkalmazott minta.
3. **Drift-graceful** — egy új oszlop a szerveren nem borítja a listát, csak a sorok kihagyódnak; a lelkésznek üres vagy hiányos lista jelenik meg, amit könnyen észrevesz
4. **PII scope** — a szemely-join csak `csaladnev`, `k_nev`, `ferjk_nev` — nincs CNP, születési dátum vagy telefon

---

## 5. Mi marad hátra (a befizetés-kör folytatása)

### A-M7.3b — `saveIncomeUseCase` (köv. session)
- Új befizetés rögzítése
- `getNextReceiptNumber(year)` use-case (szerver-oldali iratszám-generálás)
- `searchMembersForFinance(query)` use-case (tag-autocomplete)
- `getFamilyIdForPerson(id)` use-case (FK-resolver)
- `checkReceiptDuplicate(iratszam)` use-case
- Online-only (az iratszám-wallet az A-M7.3d-ben)

### A-M7.3c — `deleteIncomeUseCase` (soft-delete)

### A-M7.3d — offline-képesség (később)
- Rust v12 migráció: `befizetes_local` SQLite tábla
- Pull-szink (`pullBefizetesek`)
- Offline write (ha szükséges, iratszam-wallet)

### Desktop `/penzugy/befizetes` oldal (később)
- Lista-view (ListIncomeUseCase)
- Rögzítő form (SaveIncomeUseCase) — a chitanta-form mintájára
- Tag-család kereső
- Az A-M7.3a-b-c use-case-ek után

---

## 6. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — NEM kerül be a mai bejegyzés: **read-only use-case, még nincs user-facing UI**. Amikor a desktop `/penzugy/befizetes` oldal feláll, akkor kommunikáljuk. A web-oldalon a meglévő `initFinance(year)` flow egyelőre változatlan.
3. **Obsidian** — az A-M7.3 kör teljes része után (a-b-c végén), egyetlen atomic-note
