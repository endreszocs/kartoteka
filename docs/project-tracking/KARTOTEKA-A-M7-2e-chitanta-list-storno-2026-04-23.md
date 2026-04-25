# A-M7.2e — Chitanță-lista + sztornó (core + web adapter + desktop lista-szekció)

**Dátum:** 2026-04-23
**Fázis:** A-M7.2e (chitanța-kiállítási kör lezárása — ma nyomtatás nélkül)
**Státusz:** ✅ Kivitelezve + verifikálva (tsc + banned-imports mind zöld, 30 fájl)

---

## Miért

Az A-M7.2c desktop kiállító-oldal UI-ja után a lelkész hiányolta a **múltbeli chitantáinak listáját** és a **sztornó gombot**. A mai iteráció mindkettőt shared-re teszi: zod + core + web adapter + desktop UI.

A **nyomtatás** (`getChitantaForPrint`, 156 soros fallback-láncokkal) az A-M7.2f külön alfázis lesz — ott a román-fordítás + befizetés-/szemely-fallback logika, ami külön tervezést igényel.

## Mit csináltunk

### 1. Zod — `packages/validations/src/finance/chitanta-row.ts` (új)

- `chitantaListRowSchema` — a `oblio_szamlak` tábla azon 14 oszlopa, amire a list-UI-nak szüksége van
- `listChitantasInputSchema` — filter: `congregationId`, `yearFrom`, `yearTo`, `sorozat`, `includeStornozott`
- `stornoChitantaInputSchema` — `congregationId`, `chitantaId`, `indok` (min 5 char, pasztorális hiba)

### 2. Core use-case-ek (új)

- [`packages/core/src/finance/chitanta/list.ts`](../../packages/core/src/finance/chitanta/list.ts) — `listChitantasUseCase`
  - Online-only (az A-M7.2d előtt nincs `chitantak_local` SQLite tábla)
  - Zod drift-check a sor-oknál (csendes kihagyás a drift-soragokra)
  - Dátum szerint csökkenő rendezés, szűrők opcionálisak
- [`packages/core/src/finance/chitanta/storno.ts`](../../packages/core/src/finance/chitanta/storno.ts) — `stornoChitantaUseCase`
  - Zod-validálás (indok min 5 char)
  - RLS-védett UPDATE (`stornozott=true`, `stornozott_at=now()`, `stornozott_indok`)
  - `offlineNotSupported: true` hibaflag hálózati hiba esetén

### 3. Web Server Action refaktor

- `listChitantas` — 30+ sor → 15 sor: a core-t hívja, backward-compat `ChitantaRow[]` cast
- `stornoChitanta` — 25 sor → 15 sor: a core-t hívja, a validálás + UPDATE ott fut

### 4. Desktop UI — `RecentChitantasSection` a chitanta-page-en

Új inline komponens a `chitanta-page.tsx`-ben:
- **10 legújabb chitanța** list-view (divide-y, áttekinthető)
- Sztornózott sorok **áthúzva** + indok kis piros szöveggel
- Minden nem-sztornózott sor mellett **"Sztornó" gomb**
- **Inline sztornó dialog**: confirm + indok-textarea + "Jóváhagyás" / "Mégse"
- Sikeres kiállítás után a lista automatikusan frissül (a `refreshKey` prop a `success.chitantaId`-ra bindolt)
- Loading / error / empty / sztornózott-indok megjelenítés — mind pasztorálisan

## Informálási alapelv

| Állapot | Megoldás |
|---|---|
| Lista loading | "Lista betöltése…" |
| Lista error | Piros banner, `AlertCircle` ikon |
| Lista empty | "Még nincs kiállított chitanță a gyülekezeten." |
| Sztornózott sor | `line-through` + indok ("Sztornózva: ...") szürke opacitással |
| Sztornó confirm | Amber panel: "Biztosan sztornózod a {sorozat}/{szam} chitantát?" + adat-összefoglaló |
| Sztornó validáció | "A sztornó indoklás legalább 5 karakter legyen." |
| Sztornó submitting | "Sztornózás…" disabled gombokkal |
| Sztornó után | Lista auto-refresh, a sor sztornózottként jelenik meg |

## Verifikáció

```bash
cd packages/validations && npm run typecheck   # 0 error
cd packages/core && npm run typecheck          # 0 error
cd apps/web && npx tsc --noEmit                 # 0 error
cd apps/desktop && npx tsc --noEmit             # 0 error
node scripts/check-desktop-banned-imports.mjs  # 30 fájl, 0 tiltott
```

## Mi NEM volt scope-ban

- **Nyomtatás** (`getChitantaForPrint`, 156 sor) → A-M7.2f
- **Offline-lista** (chitantak_local SQLCipher mirror) → A-M7.2d
- **Szűrő-UI** (év-től / év-ig / sorozat) a desktop-on — ma csak az utolsó 10
- **Befizetés-lookup batch** (`getChitantakForBefizetesek`) — a befizetés-modul refaktorjához
- **Külön `/penzugy/chitantak` oldal** teljes szűréssel + oldalszámozással — a sidebar-nav polírozásnál (A-M8)

## Kapcsolódó fájlok

- [`packages/validations/src/finance/chitanta-row.ts`](../../packages/validations/src/finance/chitanta-row.ts) (új)
- [`packages/validations/src/index.ts`](../../packages/validations/src/index.ts) (+ re-export)
- [`packages/core/src/finance/chitanta/list.ts`](../../packages/core/src/finance/chitanta/list.ts) (új)
- [`packages/core/src/finance/chitanta/storno.ts`](../../packages/core/src/finance/chitanta/storno.ts) (új)
- [`packages/core/src/index.ts`](../../packages/core/src/index.ts) (+ 2 re-export)
- [`apps/web/app/(dashboard)/penzugy/chitanta-actions.ts`](../../apps/web/app/(dashboard)/penzugy/chitanta-actions.ts) (listChitantas + stornoChitanta refaktor)
- [`apps/desktop/src/pages/chitanta-page.tsx`](../../apps/desktop/src/pages/chitanta-page.tsx) (+ `RecentChitantasSection` komponens)

## A chitanța-kör státusza

| Alfázis | Tartalom | Státusz |
|---|---|---|
| A-M7.1a-c | chitanta_tombok teljes E2E | ✅ |
| A-M7.2a | Aktív-tömb státusz-követő | ✅ |
| A-M7.2b | `issueChitantaUseCase` online | ✅ |
| A-M7.2c | Desktop kiállító form | ✅ |
| A-M7.2e | List + sztornó | ✅ **ma** |
| A-M7.2d | Offline-chitanta (szám-wallet) | ⏳ hátra |
| A-M7.2f | Nyomtatás (getChitantaForPrint) | ⏳ hátra |

## Következő

- **A-M7.2f** — nyomtatás-adat-összeállítás (~156 sor fallback-logika) core-ra; desktop-on egyszerű "Nyomtatás" gomb + html2pdf
- **A-M7.2d** — offline-chitanta: szerver-oldali `reserve_chitanta_numbers()` RPC + kliens szám-wallet + lokális SQLCipher mirror
- **A-M7.3+** — a következő pénzügyi Server Action (befizetés / járulék / bank-import, stb.)
