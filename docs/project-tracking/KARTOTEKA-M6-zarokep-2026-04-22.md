# M6 — Tauri desktop architektúra-konszolidáció: ZÁRÓKEP

**Dátum:** 2026-04-22
**Fázis:** M6 (teljes fázis lezárva)
**Státusz:** ✅ Kész — az M7 pénzügyi wave **indulhat**

A teljes roadmap: [`KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md`](KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md).

---

## M6 áttekintés — mi készült el (8 allépés)

| # | Fázis | Tartalom | Státusz | Dokumentum |
|---|---|---|---|---|
| M6.1 | Packages skeleton | 5 új `@kartoteka/*` csomag (core, ui-app, offline-sync, auth, validations) | ✅ | [M6-1](KARTOTEKA-M6-1-packages-skeleton-es-M6-2-rls-audit-2026-04-21.md) |
| M6.2  | 113-tábla RLS audit | P0-P3 audit, P0=38/38, P1=26/26 (M6.2a fix után), P2=6/6, P3=1/1 | ✅ | M6-1 |
| M6.2a | P1 RLS fix | 4 jegyzőkönyv-tábla RLS + policy (parent + 3 child) | ✅ | [M6-2a](KARTOTEKA-M6-2a-rls-fix-jegyzokonyv-2026-04-21.md) |
| M6.2b | P1 diagnostic | 4 fail-rls-off tábla azonosítása | ✅ | M6-2a |
| M6.3  | Standalone kivezetés | 0 aktív portable user → teljes kód-eltávolítás + refaktor | ✅ | ez a dokumentum |
| M6.4a | mail-send Edge Fn | Brevo + Resend fallback secret-gateway | ✅ deploy-olva | [M6-4a](KARTOTEKA-M6-4a-mail-send-edge-function-2026-04-22.md) |
| M6.4b | core mail wrapper | `sendMailUseCase` az első valódi use-case | ✅ | CHANGELOG-ban |
| M6.5  | middleware → proxy | Next.js 16 deprecation + 4 ESLint error fix | ✅ | [M6-5](KARTOTEKA-M6-5-middleware-proxy-es-lint-2026-04-21.md) |
| M6.6  | Desktop auth keyring | Rust `auth.rs` + TS adapter (OS-szintű keyring) | ✅ | [M6-6](KARTOTEKA-M6-6-desktop-auth-keyring-2026-04-22.md) |
| M6.7  | Dexie tiltás desktop | Node.js preventive import-check | ✅ | [M6-7](KARTOTEKA-M6-7-dexie-tiltas-desktopon-2026-04-22.md) |
| M6.8a | offline-sync skeleton | `StorageBackend` interface + típusok | ✅ (skeleton, valós impl M7) | ez a dokumentum |

---

## M6.3 — Standalone (Inno Setup portable) kivezetés

### Diagnostic eredmény (Endre, Supabase SQL Editor)

| aktiv_portable_license | portable_aktiv_30nap | portable_aktiv_7nap | aktiv_tauri_eszkoz |
|-----------------------:|---------------------:|--------------------:|-------------------:|
|                      0 |                    0 |                   0 |                  1 |

**✅ Zöld jelzés — azonnali kivezetés lehetséges.** Nincs aktív portable user, csak 1 Tauri eszköz regisztrálva.

### Scope — mi távolodott el

**Törölt mappák** (teljes):
- [`apps/web/app/api/standalone/`](../../apps/web/app/api/standalone) — 6 API route (activate, initial-pull, license-status, monthly-sync, save-initial, write-license)
- [`apps/web/lib/standalone/`](../../apps/web/lib/standalone) — 9 fájl + `sqlite-migrations/` (is-standalone-client, license-check, license-jwt, license-types, machine-fingerprint, monthly-sync, offline-supabase-wrapper, runtime-detect, sqlite-db)
- [`standalone-build/`](../../standalone-build) — 3 elem (build-portable.ps1, installer.iss, installer-resources/)
- [`apps/web/components/standalone/`](../../apps/web/components/standalone) — portable-specifikus komponensek (license-banner, license-status-card, monthly-sync-panel, wizard/step-1-license, wizard/step-5-finish)

**Áthelyezett és átnevezett** (a web-onboarding ág megmarad):
- `components/standalone/welcome-wizard-client.tsx` → `components/onboarding/welcome-wizard-client.tsx`
- `components/standalone/wizard/step-2-congregation.tsx` → `components/onboarding/wizard/step-2-congregation.tsx`
- `components/standalone/wizard/step-3-pastor.tsx` → `components/onboarding/wizard/step-3-pastor.tsx`
- `components/standalone/wizard/step-4-finance.tsx` → `components/onboarding/wizard/step-4-finance.tsx`
- `components/standalone/wizard/step-5-finish-web.tsx` → `components/onboarding/wizard/step-5-finish.tsx` (és export `Step5FinishWeb` → `Step5Finish`)

### Cross-module ref-eltávolítás (12 fájl)

| Fájl | Mit törölt |
|---|---|
| `apps/web/lib/supabase/server.ts` | `KARTOTEKA_STANDALONE` env-branch + `wrapSupabaseForOfflineUse` dinamikus import |
| `apps/web/lib/supabase/middleware.ts` | `isStandaloneMode` helpers + `SETUP_ROUTES` `/api/standalone/` + standalone fast-path |
| `apps/web/lib/supabase/client.ts` | Standalone kommentek |
| `apps/web/lib/offline/sync-orchestrator.ts` | `isStandaloneMode` import + 5 db `if (STANDALONE) …` branch + a komment-blokk |
| `apps/web/lib/offline/recycle-bin-actions.ts` | Standalone kommentek és átmeneti minta-szöveg |
| `apps/web/components/offline/sync-status-bar.tsx` | `isStandaloneMode()` + null-return-branch |
| `apps/web/components/offline/sync-provider.tsx` | `standalone` változó + conditional orchestrator-start |
| `apps/web/components/offline/offline-menu-item-badge.tsx` | ua. |
| `apps/web/components/offline/mutation-queue-panel.tsx` | `standalone` változó + `!standalone` UI-conditional |
| `apps/web/components/offline/cache-overview.tsx` | `standalone` változó + duális UI ("Havi sync aktív" vs "Teljes szinkron most") |
| `apps/web/components/shared/recycle-bin-view.tsx` | `isStandaloneMode()` banner |
| `apps/web/app/(dashboard)/layout.tsx` | `LicenseBanner` import + render |
| `apps/web/app/(dashboard)/offline/page.tsx` | `LicenseStatusCard`, `MonthlySyncPanel` import + render + `isStandaloneMode()` gate |
| `apps/web/app/(setup)/layout.tsx` | Dual-mode logika (standalone-ág) — csak web-ág marad |
| `apps/web/app/(setup)/welcome/page.tsx` | `mode` prop — csak web |
| `apps/web/app/(setup)/welcome/actions.ts` | `isStandaloneMode` import + `startingStep` conditional |
| `apps/web/components/onboarding/welcome-wizard-client.tsx` | teljes átírás — `mode` prop, Step1License import, STEPS első elem, INITIAL_DATA standalone mezői |

### Konfigurációs / meta-cleanup

- `apps/web/next.config.ts` — `outputFileTracingIncludes` standalone-specific includes törölve; `serverExternalPackages: ['better-sqlite3','node-machine-id']` törölve; a komment tisztázza, hogy a `output: 'standalone'` Next.js build mode (NEM Kartotéka portable)
- `apps/web/eslint.config.mjs` — `"standalone-build/**"` ignore törölve
- `apps/web/scripts/audit-safety.mjs` — `IGNORE_DIR_NAMES`-ból `standalone-build` törölve
- `apps/web/package.json` — `better-sqlite3`, `node-machine-id` deps törölve + `@types/better-sqlite3` devDep törölve
- `package.json` (root) — `build:portable` npm script törölve
- `public/manifest.json "display": "standalone"` — **MARAD** (ez PWA Web App Manifest spec, nem Kartotéka portable)

### Supabase oldalon (Endre külön futtatja, ha akarja)

- `supabase functions delete issue-license` — opcionális; a kliens már nem hívja
- `licenses` SQL tábla — **MARAD** audit-célra (nem drop-oljuk; később külön SQL-migráció ha indokolt)

---

## M6.8a — offline-sync skeleton

### Scope-döntés

A teljes `apps/web/lib/offline/*` átemelése (`~18 fájl, ~180 KB`) **premature refactor** lett volna ponton, amikor még nincsen konkrét M7-es use-case, ami kipróbálja. Helyette:

- **Most (M6.8a)**: csak **interface + közös típusok** — hogy a `@kartoteka/core` jövőbeli use-case-ei tudjanak rá hivatkozni
- **M7 alatt (inkrementálisan)**: a tényleges backend-ek (`DexieBackend`, `TauriSqliteBackend`) és orchestrator a pénzügyi modul-átemeléssel párhuzamosan kerülnek be, a valós scenáriókkal tesztelve

### Új fájlok

- [`packages/offline-sync/src/types.ts`](../../packages/offline-sync/src/types.ts) — `ScopeFilter`, `ModuleKey`, `TableRegistryEntry`, `SyncStatus`, `SyncMeta`, `Mutation`, `MutationKind`, `PullResult`, `PushOutcome`
- [`packages/offline-sync/src/backend.ts`](../../packages/offline-sync/src/backend.ts) — `StorageBackend` interface + `SimpleFilter`, `Platform` típusok
- [`packages/offline-sync/src/index.ts`](../../packages/offline-sync/src/index.ts) — re-export

### A `StorageBackend` interface (11 metódus)

- **Pull-side**: `upsertServerRows`
- **Write-side**: `writeLocal`, `deleteLocal`
- **Query-side**: `findByPk`, `findAll`
- **Outbox**: `enqueueMutation`, `getPendingMutations`, `removeMutation`, `updateMutationAttempt`
- **Settings**: `getSetting`, `setSetting`

Két majdani impl:
- `DexieBackend` (web, IndexedDB) — az `apps/web/lib/offline/db.ts` logikája portálva
- `TauriSqliteBackend` (desktop, SQLCipher) — a már meglévő Tauri `db_execute`/`db_select` command-okra építve, SQL-generátorral

---

## Verifikáció (minden passing)

```bash
# Web oldal
cd apps/web
npx tsc --noEmit           # 0 error
npm run lint               # 0 error, 68 warning (img/Image nem-blokkoló)

# Shared packages
cd ../..
npm run typecheck --workspace=@kartoteka/supabase-client   # 0 error
npm run typecheck --workspace=@kartoteka/core              # 0 error
npm run typecheck --workspace=@kartoteka/offline-sync      # 0 error
npm run typecheck --workspace=@kartoteka/auth              # 0 error
npm run typecheck --workspace=@kartoteka/validations       # 0 error
npm run typecheck --workspace=@kartoteka/ui-app            # 0 error

# Desktop oldal
node scripts/check-desktop-banned-imports.mjs              # ✅ 21 fájl, 0 tiltott
cd apps/desktop && npx tsc --noEmit                         # 0 error
cd src-tauri && cargo check                                 # Finished in 5s
cd src-tauri && cargo test auth::                           # 4 passed

# Dependency-delta
# Előtte: 303 package, utána (M6.3 dep-törlés): 299 package
```

---

## Mi MARAD az M6-ból (kisebb tisztítások)

- `lib/offline/` kommentek amelyek megemlítenek "standalone" vagy "Fázis 7" szöveget — szövegmódosítás, nem funkcionális; nem blokkoló
- `docs/` legacy fájlok, amelyek a portable-ről szólnak — az M7 alatt opcionálisan átnézzük

---

## Az M7 pénzügyi wave indulási feltételei — MIND TELJESÜL

- ✅ RLS audit: P0-P3 teljes zöld
- ✅ Edge Function secret-gateway minta működik (mail-send éles)
- ✅ Desktop auth OS-szintű keyring-ben
- ✅ Dexie tiltás desktopon (preventív)
- ✅ Shared packages skeleton (core, ui-app, offline-sync, auth, validations)
- ✅ Proxy (Next.js 16 compat) + lint 0 error
- ✅ Standalone portable megszüntetve — tiszta kódbázis

## M7 elindítási terve (röviden)

1. **M7.0 — előkészítés**: a M6.8a `StorageBackend` interface alapján a `DexieBackend` és `TauriSqliteBackend` első valós impl-je (csak az M7 pénzügyi táblákhoz szükséges metódusok)
2. **M7.1 — első use-case**: `issueChitantaUseCase` a `packages/core/src/finance/chitanta/`-ban, mintája a `sendMailUseCase`-nek
3. **M7.2 — web adapter**: `apps/web/app/(dashboard)/penzugy/chitanta-actions.ts` thin `'use server'` wrapper
4. **M7.3 — desktop adapter**: `apps/desktop/src/pages/penzugy/` React Router route + form komponens
5. **M7.4** és tovább: a többi 12 pénzügyi Server Action hasonló pattern, bank-import, tva, tartozas, stb.

Cél: **a pénzügy offline is fut mindkét platformon ugyanabból a use-case rétegből**, a szakértő V4 terv szerinti teljes E2E átemelés mintadarabja.
