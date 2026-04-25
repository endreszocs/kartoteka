# A-M7.2c — Desktop chitanța-kiállítás oldal (`/penzugy/chitanta`)

**Dátum:** 2026-04-23
**Fázis:** A-M7.2c (chitanța-kiállítás desktop UI — A-M7.2b lezárása)
**Státusz:** ✅ Kivitelezve + verifikálva (TS 0 error, banned-imports tiszta 30 fájl)

---

## Miért

Az A-M7.2b megadta a shared `issueChitantaUseCase`-t (online-only korláttal). Az A-M7.2c bevezeti a **desktop UI-t**, ami a napi bizonylat-kiállítás fő pénzügyi érintkezési pontja a lelkésszel.

A UI-t a **lelkész-informálási alapelv** (feedback_lelkesz_informalas.md) szerint építettük: minden állapotban tiszta, pasztorális feedback.

## Mit csináltunk

### 1. Komponens-extrakció — `components/active-chitanta-tomb-panel.tsx` (új)

Az A-M7.2a-ban a chitanta-tombok-page-ben inline `function ActiveChitantaTombPanel(...)` volt. Most külön fájlba került, hogy a chitanta-kiállítás oldal is tudja használni. Tartalom-változás nincs — ugyanaz a 4-állapotú pasztorális UI (rendben / kevés / elfogyott / nincs aktív tömb). A chitanta-tombok-page-ben a fájlból importáljuk.

### 2. Új oldal — `pages/chitanta-page.tsx` (új, ~440 sor)

Felépítés:
- **Header** + "Frissítés" gomb
- **Offline-warning panel** (narancs) — ha `navigator.onLine === false`: magyarázó szöveg + utalás a jövőbeli szám-tárcára
- **Aktív tömb panel** (a `listChitantaTombokUseCase`-ből derivált `activeTomb`-bal)
- **Siker-banner** — az utolsó kiállítás sorozat + szám + összeg + átvevő + "Új chitanță" gomb
- **IssueChitantaForm** (inline kártya) — 9 input-mező:
  - Kiállítás dátuma * (default ma)
  - Sorozat (opcionális)
  - Átvevő neve *
  - Lakcím (opcionális)
  - CUI / adószám (opcionális)
  - Bruttó összeg (RON) *
  - Reprezentánd (címén)
  - Belső megjegyzés

A form **conditional-disabled**:
- `!isOnline` → "Jelenleg nincs internet-kapcsolat…"
- `!activeTomb` → "Nincs aktív nyugtatömb — rögzíts új tömböt…"
- A `disabledReason` amber-paneloddal jelezzük, a form-mezők pedig `disabled={formDisabled}`

### 3. Pasztorális hibakezelés (3 eset)

A form az `issueChitantaUseCase` result-objektum flag-jei szerint differenciál:

| Flag | Szín | Üzenet |
|---|---|---|
| `offlineNotSupported: true` | 🟠 narancs | "A chitanță-kiállításhoz internetes kapcsolat szükséges…" |
| `duplicateNumber: true` | 🟡 sárga | "A ${sorozat} sorozat ${szam} száma már létezik. Ellenőrizd a tömböt, vagy próbáld újra." |
| egyéb error | 🔴 piros | "Mentés sikertelen: ${msg}" / "Az összeg pozitív szám legyen." |

### 4. App.tsx — új route `/penzugy/chitanta`

Az auth-gate mögött, de **a navigator-láncban még nincs** sidebar-link — a dashboard-navigáció A-M8-ban épül ki (memória: "Tauri migráció UI-polírozás").

### 5. Core javítás (kisebb)

A `packages/core/src/finance/chitanta/issue.ts` `catch (err)`-je unused `msg` változót deklarált — törölve, a hibaüzenet amúgy is általános (offline-specifikus). `cargo test` nem érintett (Rust változatlan), TS `noUnusedLocals` mostmár tiszta.

## Lelkész-informálási alapelv — tételes ellenőrzés

| Pont | Megoldás |
|---|---|
| Loading | "Nyugtatömbök betöltése…" spinner |
| Success | Zöld banner sorozat + szám + összeg + átvevő megjelenítéssel + "Új chitanță" CTA |
| Error - validáció | Piros banner, pasztorális magyar üzenet |
| Error - offline | Narancs banner + jövőbeli offline-stratégia említése |
| Error - duplicate | Sárga banner + javaslat |
| Offline-state | Explicit `OfflineWarning` panel + form-disabling |
| Nincs aktív tömb | `ActiveChitantaTombPanel` piros infója + form-disabling |

## Verifikáció

```bash
cd apps/desktop && npx tsc --noEmit              # 0 error
cd packages/core && npm run typecheck            # 0 error
cd apps/web && npx tsc --noEmit                   # 0 error

node scripts/check-desktop-banned-imports.mjs    # 30 fájl, 0 tiltott
```

## Mi NEM volt scope-ban

- **Offline-chitanța kiállítás** → A-M7.2d (sorszám-range előre-foglalás RPC)
- **Lista + sztornó + nyomtatás** → A-M7.2e (a `getChitantaForPrint`, `stornoChitanta`, `listChitantak` Server Action-ök ~600 sor)
- **Befizetés-kapcsolás** (`befizetes_id` select autocomplete) — később, a befizetés-modul A-M7.3+ refaktorja mellett
- **Sidebar-link** az új route-ra → A-M8 dashboard-nav polírozás

## Kapcsolódó fájlok

- [`apps/desktop/src/components/active-chitanta-tomb-panel.tsx`](../../apps/desktop/src/components/active-chitanta-tomb-panel.tsx) (új, extraktált)
- [`apps/desktop/src/pages/chitanta-tombok-page.tsx`](../../apps/desktop/src/pages/chitanta-tombok-page.tsx) (inline panel törölve, import az új fájlból)
- [`apps/desktop/src/pages/chitanta-page.tsx`](../../apps/desktop/src/pages/chitanta-page.tsx) (új, ~440 sor)
- [`apps/desktop/src/App.tsx`](../../apps/desktop/src/App.tsx) (+ import + route)
- [`packages/core/src/finance/chitanta/issue.ts`](../../packages/core/src/finance/chitanta/issue.ts) (`noUnusedLocals` fix)

## Következő

- **A-M7.2d** — offline-chitanta: a project-log A-M7.2b-ben javasolt **A opció** (sorszám-range előre-foglalás). Tervezett munka: ~2-3 óra (új SQL RPC + TS wallet + core-kód offline-branch).
- **A-M7.2e** — chitanța-lista + sztornó + nyomtatás (a chitanta-actions.ts ~600 sor maradék) core-ra
