# A-M7.2b — `issueChitantaUseCase` (papír-nyugta kiállítás, online-only)

**Dátum:** 2026-04-23
**Fázis:** A-M7.2b (chitanta-kiállítás core-ra portolva)
**Státusz:** ✅ Kivitelezve + verifikálva (core + web adapter, **online-only** erőforrás-szabály)

Roadmap: [`KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md`](KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md).

---

## Miért

Az A-M7.1 (chitanta_tombok CRUD) és A-M7.2a (aktív-tömb követő) után most a **legértékesebb napi pénzügyi művelet**: a papír-chitanță (nyugta) kiállítása. Ez az `oblio_szamlak` táblába kerül `tipus='chitanta_papir'`-ral (NEM Oblio-invoice), a sorszámozást a szerver-oldali `next_chitanta_number()` PL/pgSQL RPC kezeli concurrency-safe módon.

## Mit csináltunk

### 1. Zod séma — `packages/validations/src/finance/chitanta-issue.ts` (új)

- `chitantaIssueInputSchema` — 10 mező (sorozat, szám, dátum, kliens név/cím/CUI, összeg, reprezentánd, befizetés-id, megjegyzés) zod-validációval
- `ChitantaIssueInput` + `ChitantaIssueResult` típusok
- Re-export a `@kartoteka/validations/src/index.ts`-ből

### 2. Core use-case — `packages/core/src/finance/chitanta/issue.ts` (új)

- `IssueChitantaCtx` — `{ supabase, runtime, userId, defaultSorozat? }`
- `IssueChitantaResult` — discriminated union, extra flags:
  - `offlineNotSupported: true` — offline-hálózati hiba, a UI felajánlja az online-váltást
  - `duplicateNumber: true` — párhuzamos kiállításnál a szám már létezik
- `issueChitantaUseCase(input, ctx)`:
  1. Zod-validálás (pasztorális hibaüzenet mezőnként)
  2. Sorozat eldöntése (input → `ctx.defaultSorozat` → `'CHIT'` fallback)
  3. Szám lefoglalás: `rpc('next_chitanta_number', …)` — hálózati hiba esetén az errorüzenet `offlineNotSupported`-ra mappelődik (**pasztorális magyarázat**)
  4. `insert` az `oblio_szamlak` táblába az A-M7 mintával (revision + updated_at a trigger kezeli)
  5. Unique constraint 23505 → `duplicateNumber: true`

Exportálva a core index-ből.

### 3. Web Server Action refaktor

A `apps/web/app/(dashboard)/penzugy/chitanta-actions.ts` `issueChitanta` 77 sor → ~50 sor. A thin adapter:
- `getChitantaConfig()`-ból `defaultSorozat` kiolvasása
- `issueChitantaUseCase` hívás
- `revalidatePath('/penzugy')`

A return-struktúra **változatlan** (backward-compat a meglévő UI-val).

## ⚠️ Online-kötelező korlát (dokumentált)

A `next_chitanta_number()` PL/pgSQL RPC **szerver-oldali, concurrency-safe** sorszám-foglalást végez. Ennek offline-verziója komoly tervezést igényel, és az A-M7.2b-ben **szándékosan nincs**.

**Jelenlegi viselkedés offline-ban**:
- A use-case az RPC-hívásnál kap egy hálózati hibát (fetch/network/connect/timeout)
- A `IssueChitantaResult` `offlineNotSupported: true` flaggel tér vissza
- A hibaüzenet **pasztorális magyar**: "A chitanță-kiállításhoz internetes kapcsolat szükséges (a sorszámot a szerver osztja ki). Csatlakozz online, és próbáld újra."
- A desktop UI-réteg (A-M7.2c-ben) erre egy dedikált info-panelt jelenít meg: "Most nem tudsz chitantát kiállítani — csatlakozz a hálózatra"

## Jövőbeli offline-stratégiák (A-M7.2d)

Három lehetőség, amit mérlegelünk:

### Opció A — Sorszám-range előre-foglalás
Online állapotban a desktop lekér egy **előre-foglalt 10-50 sorszámos block-ot** a szerverről (egy új RPC: `reserve_chitanta_numbers(count)` — a `next_chitanta_number` inkrementálja az aktuális-számot, de nem hoz létre `oblio_szamlak` sort). A block mind a kliens-oldali storage-ban tárolódik. Offline-ban a kliens a block első szabad sorát adja. Online-visszacsatlakozáskor a nem-használt számokat eldobjuk (a szerver-pointer nem ugrik vissza — ez elveszett sorszámokat okoz, de elfogadható).

### Opció B — Optimistic kliens-szám + ütközés-feloldás
A kliens a `chitanta_tombok.szam_kezdet + felhasznalt_darabszam`-ot használja mint tippelt sorszám. Online-ban az INSERT-kor, ha 23505 konfliktus jön, a UI egy "válassz új sorszámot" dialogot ad. Kockázat: a lelkész a papír-nyugtán már felírta a számot, és akkor két helyen változtatni kell.

### Opció C — Lokális foglalás a chitanta_tombok-ban
A `chitanta_tombok.felhasznalt_darabszam` a lokális SQLCipher-ben optimisticen nő a kliensnél. A következő push-kor a szerver konszolidálja a számokat (revision-alapon). Fontos: a papírnyugtán levő szám + a szerveren érkező szám eltérhet, ami elfogadhatatlan.

**Javaslatom (döntés később az A-M7.2d-ben)**: az **A opció** a legbiztonságosabb. Egy új SQL RPC + kliens-oldali "szám-wallet" logika.

## Informálási alapelv (feedback_lelkesz_informalas.md)

A core use-case **pasztorális magyar** hibaüzeneteket ad mind az 5 kötelező állapotra:

| Állapot | Üzenet |
|---|---|
| Loading (kiállítás folyamatban) | "Kiállítás…" (a UI-réteg) |
| Success | "A ${sorozat}/${szam} számú chitanță elmentve" (UI) |
| Error - validáció | "Az összeg pozitív szám legyen." / "Adj meg dátumot." stb. |
| Error - offline | "A chitanță-kiállításhoz internetes kapcsolat szükséges…" + offline-panel |
| Error - duplicate | "A ${sorozat} sorozat ${szam} száma már létezik. Ellenőrizd a tömböt, vagy próbáld újra (másik sorszámmal)." |
| Error - general | "Mentés sikertelen: …" |

Az összes hibát a `IssueChitantaResult` flag-ekkel expresszálja — a UI-réteg specifikus cselekvést tud kínálni (offline → online-váltás, duplikáció → új szám kérés).

## Verifikáció

```bash
cd packages/validations && npm run typecheck    # 0 error
cd packages/core && npm run typecheck           # 0 error
cd apps/web && npx tsc --noEmit                 # 0 error
cd apps/web && npm run lint                     # 0 error (68 non-blocking warning)
node scripts/check-desktop-banned-imports.mjs   # 28 fájl, 0 tiltott
```

## Mi NEM volt scope-ban

- **Offline-issue** (A-M7.2d) — a fenti 3 stratégia közül az A opció megvalósítása
- **Desktop chitanta-form** (A-M7.2c) — a desktopi issue-kiállító form komponens, ami hívja a use-case-t
- **Lista + sztornó + nyomtatás** (A-M7.2e) — a `getChitantaForPrint`, `listChitantak`, `stornoChitanta` Server Action-ök (a chitanta-actions.ts további ~600 sora)

## Kapcsolódó fájlok

- [`packages/validations/src/finance/chitanta-issue.ts`](../../packages/validations/src/finance/chitanta-issue.ts) (új)
- [`packages/validations/src/index.ts`](../../packages/validations/src/index.ts) (+ re-export)
- [`packages/core/src/finance/chitanta/issue.ts`](../../packages/core/src/finance/chitanta/issue.ts) (új)
- [`packages/core/src/index.ts`](../../packages/core/src/index.ts) (+ re-export)
- [`apps/web/app/(dashboard)/penzugy/chitanta-actions.ts`](../../apps/web/app/(dashboard)/penzugy/chitanta-actions.ts) (`issueChitanta` 77 → 50 sor)

## Következő

- **A-M7.2c** — desktop chitanta-form (listázás + issue-form), `offlineNotSupported` esetén felhasználóbarát panel
- **A-M7.2d** — offline-chitanta: "A opció" szám-range előre-foglalás (új SQL RPC + kliens wallet)
- **A-M7.2e** — chitanta-lista + sztornó + nyomtatás core-ra
