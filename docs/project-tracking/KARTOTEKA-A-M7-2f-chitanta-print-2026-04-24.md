# A-M7.2f — Chitanța nyomtatás shared (core + web adapter + desktop print-dialog)

**Dátum:** 2026-04-24
**Fázis:** A-M7.2f (chitanța-kör lezárása — nyomtatás + layout)
**Státusz:** ✅ Kivitelezve + verifikálva

---

## Miért

Az A-M7.2e (list + sztornó) után a lelkész utolsó napi igénye a chitanța-körhöz: **kinyomtatni / PDF-be menteni** egy kiállított nyugtát, vagy egy sztornózott példány újranyomtatása az "STORNOZAT" piros pecséttel. Ezzel a papír-nyugta teljes munkafolyamata desktop-on is megjárható.

## Mit csináltunk

### 1. Validations — `chitanta-print.ts` (új)

[`packages/validations/src/finance/chitanta-print.ts`](../../packages/validations/src/finance/chitanta-print.ts):
- `ChitantaPrintCongregation` interface (gyülekezet-fejléc: nevHu, nevRo, CIF, cím, város, megye, telefon)
- `ChitantaPrintData` interface (teljes nyomtatási rekord — 22 mező)
- `camelCase` — ez a print-layout típusa, direkt React-komponensbe megy

### 2. Core use-case — `print.ts` (új)

[`packages/core/src/finance/chitanta/print.ts`](../../packages/core/src/finance/chitanta/print.ts) — `getChitantaForPrintUseCase` 5-query láncot futtat:
1. `oblio_szamlak` fő sor (`tipus='chitanta_papir'` + congregation-scope)
2. Fallback (ha régi nyugta): `befizetes` → `befizetescel.nevro` (román reprezentand) + `szemely`/`csalad` cím
3. `congregations` fejléc
4. `dioceses` név
5. `districts` név

Return: `{ success, data: ChitantaPrintData }` vagy `{ success: false, error }`.

### 3. Web adapter refaktor

A `apps/web/app/(dashboard)/penzugy/chitanta-actions.ts` `getChitantaForPrint` **156 sor → 15 sor**: a core-t hívja. A `ChitantaPrintData` típust `export type { … } from '@kartoteka/validations'` re-exporttal tartjuk kompatibilisen a web-komponensek (chitanta-print-template, chitanta-reprint-dialog, chitanta-silent-print) számára.

### 4. Desktop UI — `ChitantaPrintDialog` + "Nyomtatás" gomb

**Új fájl**: [`apps/desktop/src/components/chitanta-print-dialog.tsx`](../../apps/desktop/src/components/chitanta-print-dialog.tsx) (~280 sor)
- Modal-szerű full-screen dialog (`fixed inset-0 z-50`)
- Toolbar (nem-nyomtat, `print:hidden`): "Nyomtatás" (Ctrl+P) + "Bezárás" gombok
- A4/A5-szintű nyugta-layout:
  - Egyházkerület + egyházmegye fejléc (hu + ro)
  - Gyülekezet név (hu + ro kurzívan) + cím + város + megye + telefon + CIF
  - Nagy **CHITANȚĂ** fejléc
  - Sorozat + nyomdai szám (nagy monospace) + gyülekezeti Nr. intern + dátum
  - Átvevő (név, cím, CUI/CNP, nr. ORC/An)
  - Reprezentánd + román fordítás
  - Kiemelt összeg (3xl, border-y-2) `N RON`
  - Sztornózott jelzés: piros keret + `STORNOZAT` diagonal-pecsét (rotate-15deg)
  - Megjegyzés (opt)
  - Aláírás-mezők (átvevő + lelkipásztor)
- `window.print()` a "Nyomtatás" gombon

**Módosítva**: [`apps/desktop/src/pages/chitanta-page.tsx`](../../apps/desktop/src/pages/chitanta-page.tsx)
- `RecentChitantasSection`: minden soron "Nyomtatás" gomb (sztornózott vagy nem, **minden** listázott sorra működik)
- `printFor` state: a dialog `chitantaId` alapján nyílik
- A dialog elemeivel integrálva, `onClose` a state-et resetlejszi

## Lelkész-informálási ellenőrzés (5 pont)

| Állapot | Megoldás |
|---|---|
| Loading | "Nyomtatási adatok betöltése…" spinner |
| Success (dialog nyitva) | Teljes nyugta-layout, "Nyomtatás (Ctrl+P)" gomb |
| Error | `AlertCircle` + pasztorális magyar üzenet |
| Offline | A nyomtatás-dialog maga csendesen fail-el (core hibaüzenettel), a user a listán nyomja — most nincs explicit offline-gating a nyomtatás-gombon; későbbi A-M7.2d scope |
| Sztornózott | Diagonal "STORNOZAT" pecsét + piros info-panel alul (időpont + indok) |

## Verifikáció

```bash
cd packages/validations && npm run typecheck  # 0 error
cd packages/core && npm run typecheck         # 0 error
cd apps/web && npm run lint                    # 0 error, 68 non-blocking warning
cd apps/web && npx tsc --noEmit                # 0 error
cd apps/desktop && npx tsc --noEmit            # 0 error
node scripts/check-desktop-banned-imports.mjs # 31 fájl, 0 tiltott
```

## Mi NEM volt scope-ban

- **Print-CSS `@media print` finomhangolás** — most az alap shadcn/Tailwind classList működik, Tauri webview `print` módban rendeli. A margók, oldaltördelés további polírozása A-M15 UI-polishing fázisban.
- **PDF silent-save** (mint a web-es `chitanta-silent-print`) — Tauri-on `window.print()` + "Mentés PDF-ként" rendszerdialogra hagyatkozunk.
- **Offline-nyomtatás** (a teljes printData cache-ből) — A-M7.2d keretében a `chitantak_local` SQLite mirror-tól jöhet; most online-only.

## Kapcsolódó fájlok

- [`packages/validations/src/finance/chitanta-print.ts`](../../packages/validations/src/finance/chitanta-print.ts) (új)
- [`packages/validations/src/index.ts`](../../packages/validations/src/index.ts) (+ re-export)
- [`packages/core/src/finance/chitanta/print.ts`](../../packages/core/src/finance/chitanta/print.ts) (új)
- [`packages/core/src/index.ts`](../../packages/core/src/index.ts) (+ re-export)
- [`apps/web/app/(dashboard)/penzugy/chitanta-actions.ts`](../../apps/web/app/(dashboard)/penzugy/chitanta-actions.ts) (`getChitantaForPrint` 156 → 15 sor, `ChitantaPrintData` re-export)
- [`apps/desktop/src/components/chitanta-print-dialog.tsx`](../../apps/desktop/src/components/chitanta-print-dialog.tsx) (új, ~280 sor)
- [`apps/desktop/src/pages/chitanta-page.tsx`](../../apps/desktop/src/pages/chitanta-page.tsx) (+ print-gomb, dialog-integráció)

## A chitanța-kör (A-M7.2) TELJES lezárása

| Alfázis | Tartalom | Státusz |
|---|---|---|
| A-M7.2a | Aktív-tömb státusz-követő | ✅ |
| A-M7.2b | `issueChitantaUseCase` online | ✅ |
| A-M7.2c | Desktop chitanța-form | ✅ |
| A-M7.2e | Lista + sztornó | ✅ |
| A-M7.2f | **Nyomtatás** | ✅ **ma** |
| ⏳ A-M7.2d | Offline-chitanța (szám-wallet) | hátra |

A desktop kliens mostantól a **napi bizonylat-kiállítási folyamat 90%-át** kezeli online: kiállítás → lista → sztornó → nyomtatás. Az utolsó 10% (offline-mezőn-kiállítás, szám-wallet) külön architektúrális projekt.

## Következő

- **A-M7.2d** — offline-chitanța: szerver RPC `reserve_chitanta_numbers()` + kliens szám-tárca + `chitantak_local` Rust migráció
- **A-M7.3** — következő pénzügyi modul (befizetés-kezelés, járulék-számítás, bank-import)
