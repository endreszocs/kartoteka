# A-M7.2a — Aktív nyugtatömb státusz-követő (shared + UI panel)

**Dátum:** 2026-04-22
**Fázis:** A-M7.2a (a chitanta-kiállítás előkészítése)
**Státusz:** ✅ Kivitelezve + verifikálva

---

## Miért

A napi chitanta-kiállítás (bizonylat) előfeltétele, hogy a lelkész **azonnal lássa**, melyik az aktív tömb, mi a következő szám, mennyi van hátra, és hogy új tömböt kell-e nyitni. Ez a státusz pasztorálisan értékes (a memóriába írt "lelkész mindenről informálva" alapelv szerint).

A meglévő Server Action `getActiveChitantaTombStatus` (70 sor) most shared-re kerül, és a desktop oldalon **derived** jelenik meg (nincs dupla Supabase hívás).

## Mit csináltunk

### 1. Core use-case — `packages/core/src/finance/chitanta-tomb/active-status.ts` (új)

- `GetActiveChitantaTombStatusCtx` — `{ supabase, storage?, runtime }`
- `GetActiveChitantaTombStatusResult` — discriminated union, `source: 'supabase' | 'local'`, `active: ChitantaTombStatus | null`
- `getActiveChitantaTombStatusUseCase(input, ctx)`:
  1. Online-first: Supabase query `aktiv=true`, `order szam_kezdet ASC`, `limit 1`
  2. Zod drift-check, `computeChitantaTombStatus()` a derived mezőkre
  3. Cache-update ha `ctx.storage` adott
  4. **Offline fallback**: `ctx.storage.findAll(filter)` + JS-oldali rendezés

Exportálva a core index-ből.

### 2. Web Server Action refaktor

A `getActiveChitantaTombStatus` 70-ről ~15 sorra csökkent: a core-t hívja, a return-struktúra változatlan (backward-compat a meglévő UI-val).

### 3. Desktop UI — `ActiveChitantaTombPanel`

A `chitanta-tombok-page.tsx`-ben egy új komponens (~60 sor), **a SourceBadge alatt, a kártyarács előtt**. Ez NEM külön Supabase-query — a már betöltött `rows`-ból deriválja az aktív tömböt kliens-oldalon (`rows.filter(aktiv).sort(szam_kezdet)[0]`), és a `computeChitantaTombStatus()` segédfn-nel számol.

**3 állapota**:

| Helyzet | Színkód | Üzenet |
|---|---|---|
| Elfogyott (maradek === 0) | 🔴 piros | "Elfogyott — új tömböt kell megnyitni, mielőtt bizonylatot állíthatnál ki." |
| Kevés (maradek ≤ 5) | 🟡 sárga | "Következő szám: X · Maradék: Y db ⚠ hamarosan elfogy" |
| Rendben (maradek > 5) | 🟢 zöld | "Következő szám: X · Maradék: Y db" |
| **Nincs aktív** (minden lezárt) | 🔴 piros info-panel | "Nincs aktív nyugtatömb. Új tömb rögzítése szükséges." |

A panel mindig mutatja a kiállított/összes arányt is ("X / Y kiállítva").

## Informálási alapelv

A lelkész egy pillantással látja:
- Van-e kiállítható nyugta? → nincs aktív tömb: piros figyelmeztetés
- Mi a következő szám? → monospace számmal, szembeötlő
- Mennyi van hátra? → színnel kódolt (zöld / sárga / piros)
- Hány százaléka van meg? → "X / Y kiállítva" másodlagos info

A pasztorális hangvétel: nem "ERROR: NO ACTIVE BLOCK", hanem "Új tömböt kell megnyitni, mielőtt bizonylatot állíthatnál ki".

## Verifikáció

```bash
cd packages/core && npm run typecheck        # 0 error
cd apps/web && npx tsc --noEmit               # 0 error
cd apps/web && npm run lint                   # 0 error (68 non-blocking warning)
cd apps/desktop && npx tsc --noEmit           # 0 error
node scripts/check-desktop-banned-imports.mjs # 28 fájl, 0 tiltott
```

## Kapcsolódó fájlok

- [`packages/core/src/finance/chitanta-tomb/active-status.ts`](../../packages/core/src/finance/chitanta-tomb/active-status.ts) (új)
- [`packages/core/src/index.ts`](../../packages/core/src/index.ts) (+ re-export)
- [`apps/web/app/(dashboard)/penzugy/chitanta-tombok-actions.ts`](../../apps/web/app/(dashboard)/penzugy/chitanta-tombok-actions.ts) (getActiveChitantaTombStatus: 70 → 15 sor)
- [`apps/desktop/src/pages/chitanta-tombok-page.tsx`](../../apps/desktop/src/pages/chitanta-tombok-page.tsx) (+ ActiveChitantaTombPanel komponens)

## Következő

- **A-M7.2b** — `issueChitantaUseCase`: az egyetlen chitanta (bizonylat) kiállítása, ami az aktív tömb `felhasznalt_darabszam`-át 1-gyel növeli és létrehoz egy `chitanta` tábla-sort. Ez a **legfontosabb napi funkció** offline szempontból.
- **A-M7.2c** — chitanta-lista a desktopon (datum + összeg + sorszám + sztornó)
- **A-M7.3** — a 12 további pénzügyi Server Action inkrementálisan
