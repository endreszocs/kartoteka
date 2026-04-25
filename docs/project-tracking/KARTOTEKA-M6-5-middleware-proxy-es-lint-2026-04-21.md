# M6.5 — Next.js 16 middleware→proxy átnevezés + 4 ESLint error javítása

**Dátum:** 2026-04-21
**Fázis:** M6.5 (Next.js 16 deprecation housekeeping) — Tauri migrációs roadmap része
**Státusz:** ✅ Kivitelezve; `0 TS error`, `0 ESLint error`, `68 ESLint warning` (non-blocking)

A teljes Tauri desktop migrációs roadmap itt: [`KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md`](KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md).

---

## Miért kellett

A Next.js 16 a file-convention `middleware.ts`-t deprecated-nak jelzi; az új név **`proxy.ts`** és a függvénynek is `proxy` (vagy default export). A funkcionalitás változatlan, csak a konvenció szigorodott. A docs ezt írja:

> **Good to know**: Starting with Next.js 16, Middleware is now called Proxy to better reflect its purpose. The functionality remains the same.
> — `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`

A memóriában (`feedback_nextjs_16`) kiemelt szabály: *"ez NEM a megszokott Next.js — olvasd a docs-ot a módosítás előtt"*. A proxy docs (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`) részletesen tárgyalja a kompatibilitást.

## Mit csináltunk

### 1. Fájl átnevezés: `apps/web/middleware.ts` → `apps/web/proxy.ts`

- A tartalom változatlan, csak a függvénynév lett `middleware` → `proxy`
- A `matcher` config szó szerint megmaradt
- Az `import { updateSession } from '@/lib/supabase/middleware'` **szándékosan nem** változott — az a saját helper modul (a Supabase SSR session-kezelő), nem Next.js file convention
- Részletes komment a proxy.ts-ben dokumentálja a névütközést

### 2. `apps/web/package.json` lint script frissítése

```diff
- "lint": "eslint app components lib middleware.ts next.config.ts eslint.config.mjs",
+ "lint": "eslint app components lib proxy.ts next.config.ts eslint.config.mjs",
```

### 3. 4 ESLint error javítása

| # | Fájl | Szabály | Javítás |
|---|---|---|---|
| 1 | `components/admin/access-request-approve-dialog.tsx:111` | `react/no-unescaped-entities` | `„...”` → `&bdquo;...&rdquo;` |
| 2 | `components/admin/access-requests-table.tsx:125` | `react/no-unescaped-entities` | `„...”` → `&bdquo;...&rdquo;` |
| 3 | `components/presentation/motion-primitives.tsx:145` | `react-hooks/set-state-in-effect` | Refactor: render-time derived `staticDisplay` + két `useEffect` (az első csak `motionValue.set`-et hív, a második csak non-reduced-motion esetén subscribe-ol a spring-re). Nincs többé synchronous setState az effect body-ban. |
| 4 | `components/ui/splash-screen.tsx:33` | `react-hooks/set-state-in-effect` | Két fázisú javítás: (a) a felesleges `mounted` state törölve (`visible` flag önmagában elég a hydration safety-hez), (b) a maradék conditional `setVisible(true)` — session-specifikus SSR-hydration minta — `eslint-disable-next-line` + részletes indoklás. Teljes `useSyncExternalStore`-refactor M15 UI-polírozási fázisban. |

### 4. Verifikáció

```bash
cd apps/web
npm run lint              # 0 errors, 68 warnings (non-blocking)
npx tsc --noEmit          # 0 errors
```

## Hátralévő 68 warning

Nem blokkoló figyelmeztetések, a legtöbb `@next/next/no-img-element` (Image helyett img). Helyek:
- `components/public/public-*.tsx` (4) — gyülekezeti publikus oldal képek
- `components/ui/splash-screen.tsx` (1) — EREK címer (remote URL)
- Egyéb 63 warning — egyéb oldalak

**Jövőbeli megoldás**: M10 `@kartoteka/storage` absztrakció részeként vagy külön web-optimization fázisban. Nem blokkolja az M7 modul-wave indulását.

## Kapcsolódó fájlok

- [`apps/web/proxy.ts`](../../apps/web/proxy.ts) (új)
- [`apps/web/package.json`](../../apps/web/package.json)
- [`apps/web/components/admin/access-request-approve-dialog.tsx`](../../apps/web/components/admin/access-request-approve-dialog.tsx)
- [`apps/web/components/admin/access-requests-table.tsx`](../../apps/web/components/admin/access-requests-table.tsx)
- [`apps/web/components/presentation/motion-primitives.tsx`](../../apps/web/components/presentation/motion-primitives.tsx)
- [`apps/web/components/ui/splash-screen.tsx`](../../apps/web/components/ui/splash-screen.tsx)

## Kapcsolódó: M6.2b diagnostic SQL

Az M6.2 teljes audit zöld (P0=38/38, P2=6/6, P3=1/1) — **kivéve P1-ben 4 tábla `fail_rls_off`**. A pontos azonosításra írt targetált diagnostic:

[`migration-docs/sql/2026-04-21-m6-2b-diagnostic-p1-fail.sql`](../../migration-docs/sql/2026-04-21-m6-2b-diagnostic-p1-fail.sql)

Csak a 26 P1 tábla közül listázza azokat, ahol `relrowsecurity=false` vagy a tábla hiányzik. Endre futtatja Supabase Studio-ban, a válasz alapján születik az **M6.2a fix-migráció** (`2026-04-22-m6-2a-rls-fix-p1.sql`).

## Következő M6 lépések

- **M6.2a** — fix-migráció a 4 P1 táblára (amint a diagnostic visszatér)
- **M6.3** — `/api/standalone/*` 6 route törlése + `next.config.ts` standalone konfig egyszerűsítése
- **M6.4** — Supabase Edge Function gateway: `oblio-oauth`, `oblio-invoice`, `mail-send`, `ai-chat`
- **M6.6** — Desktop auth Tauri keyring-be (`src-tauri/src/auth.rs` új modul)
- **M6.7** — Dexie import tiltása desktopon (tsconfig + ESLint rule)
- **M6.8** — Offline orchestrator átemelése `apps/web/lib/offline/*` → `packages/offline-sync/src/*`

Az M6 fázis lezárása után indul **M7 (Wave 1: Pénzügy)**.
