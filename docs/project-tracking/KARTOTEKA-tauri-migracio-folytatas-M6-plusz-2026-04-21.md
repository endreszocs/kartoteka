# EREK Kartotéka — Tauri Desktop Migrációs Terv (M6 → M16)

## Context

A **KARTOTEKA** egy magyar református egyházi nyilvántartó rendszer (Next.js 16.2.2 + Supabase), amit 1000 lelkész napi használatára tervezünk. A biztonság gyülekezeti / egyházmegyei / egyházkerületi szinten is kritikus, a napi adminisztrációt pedig élménnyé kell tenni — offline, gyorsan, magyarul.

A Tauri desktop migráció **M0–M5 fázisai már éles állapotban vannak** (2026-04-23-ig): monorepo, Tauri 2 + Rust backend, SQLCipher titkosított lokális DB, Windows keyring, Ed25519 device-bind, MSI installer, auto-updater. **M7 (`szemely` 37 oszlop) és M8 (`munkanaplo` 22 oszlop) is fut**. A szakértő V4 terv (`docs/project-tracking/KARTOTEKA-tauri-migracio-terv-2026-04-21.docx`) ~90%-ban megvalósult.

**A hátralévő munka mértéke:** 22 további dashboard modul, **77 Server Action fájl** (`'use server'` direktívával), 8 API route, 302 komponens (275 `"use client"`), 139 `lib/` fájl. Ezek desktopon egyelőre nem futnak.

**Probléma, amit ez a terv megold:** a jelenlegi `apps/web/` (Next.js App Router) és `apps/desktop/` (React + Vite + Tauri) **két különálló frontend kódbázis**. A felhasználó (Endre) kifejezett igénye: a desktop app ugyanazt a közös frontend + business logic réteget használja, mint a web — ezt kell architekturálisan kiépíteni és a hátralévő modulokat e közös réteg alatt migrálni, úgy hogy az offline-first működés és a biztonsági kényszerek (RLS, Edge Function secret gateway, self-signed install) konzisztensek maradjanak.

**Felhasználói döntések (kötelező érvényű):**
- Architektúra: **Hibrid A** — shared packages (`packages/ui-app`, `packages/core`, stb.), Next.js marad SSR-kritikus helyeken (publikus `/gy/[slug]`, auth entry, admin).
- Modul prioritás: **biztonsági súly szerint** — P0 pénzügy → tagnyilvántartás → anyakönyv; P1 jegyzőkönyvek, iktato, leltar, éves jelentés, profile, dashboard, congregation, notifications; P2 sirhelyek, programs, kuka, delegated-import, offline-UI, egyéb; admin + god-mode + publikus-oldal szerkesztő **web-only**.
- Offline scope: **mind a 22 modul offline-capable** (SQLCipher mirror + sync orchestrator).
- Default viselkedés: **online-first, offline-capable fallback**.
- Admin modul: **csak web**, desktopról deep-link.
- Code sign: **self-signed EREK cert marad** (zárt beta, későbbi EV/Azure Trusted Signing opció).
- Külső API: **Supabase Edge Function gateway** minden Oblio / Brevo / Resend / Anthropic Claude hívásra — secret NEM kerül desktopra.

---

## 1. Célarchitektúra

### 1.1 Web és desktop szerepe

| Szerep | `apps/web` (Next.js) | `apps/desktop` (Tauri) |
|---|---|---|
| Publikus / SEO (`/gy/[slug]`, `/magazine`) | **elsődleges**, SSR/SSG | nincs |
| Auth flow (signup, access-request, forgot-password) | **elsődleges** | deep-link web-re |
| Admin + god-mode + publikus-oldal szerkesztő | **csak web** | deep-link |
| Napi lelkész dashboard (22 modul) | másodlagos (fallback) | **elsődleges, offline-first** |
| Offline DB | PWA Dexie (limitált) | SQLCipher (teljes 22-modulos mirror) |
| Fájlkezelés (PDF, Excel, blob) | Browser File API | Tauri FS plugin + dialog |
| Külső API (Oblio/Brevo/Resend/Claude) | → Supabase Edge Fn | → Supabase Edge Fn |

### 1.2 Shared-first bontás

**A 77 Server Action átalakul use-case függvényekké** a `packages/core` alatt. Két vékony adapter:
- **Web**: `'use server'` wrapper `apps/web/app/(dashboard)/{modul}/*-actions.ts`-ben, csak a `createServerSupabaseClient()`-et injektálja + a formData-t parszolja.
- **Desktop**: közvetlen hívás a kliens-komponensből, injekt: `getDesktopSupabase()`; szükség esetén Tauri command (pl. FS művelet).

**RLS a biztonsági alapréteg**: a közvetlen desktop → Supabase hívás csak azért biztonságos, mert a Phase 0 RLS hardening (2026-04-12+) minden releváns táblára érvényes. Kivétel nélkül csak az RLS-védett use-case-ek mennek desktopra; a `service_role` kulcsot igénylő admin műveletek a webre maradnak.

**Secret gateway**: minden külső API (Oblio OAuth + invoice, Brevo/Resend email, Claude AI) Supabase Edge Function-be költözik (`supabase/functions/*`). A desktop és web egyaránt ezeket hívja — semmilyen külső API kulcs nincs a Tauri bundle-ban.

### 1.3 Build pipeline

1. **Shared**: `tsc --build` a root monorepo-workspace alatt.
2. **Web**: `next build --webpack` (Serwist PWA), `output: 'standalone'`.
3. **Desktop**: `vite build` → `tauri build` → MSI + NSIS + `.sig` → Supabase Storage `updates/` bucket + GitHub Release (M15 után CI-ben).

---

## 2. Monorepo mappastruktúra (célkép)

```
KARTOTEKA/
├── apps/
│   ├── web/                                   (megvan)
│   │   ├── app/
│   │   │   ├── (auth)/                        — SSR auth entry (web-only)
│   │   │   ├── (dashboard)/{modul}/
│   │   │   │   ├── page.tsx                   — csak <ModulView /> @kartoteka/ui-app-ból
│   │   │   │   └── *-actions.ts               — thin 'use server' wrapper core-ra
│   │   │   ├── (public)/                      — SEO (web-only)
│   │   │   ├── (setup)/                       — welcome (web-only)
│   │   │   ├── admin/                         — web-only
│   │   │   └── api/ai/chat, daily-verse       — API route-ok: M6.3-ban áttelepítve Edge Fn-re
│   │   ├── lib/                               — csak web-specifikus server helper
│   │   └── proxy.ts                           — átnevezve middleware.ts-ből (Next.js 16)
│   └── desktop/                               (megvan)
│       ├── src/
│       │   ├── routes/                        — React Router v7 config + RBAC guard
│       │   ├── pages/{modul}-page.tsx         — import + <ModulView /> render
│       │   ├── lib/
│       │   │   ├── tauri-bridge.ts            — Rust IPC wrapper
│       │   │   ├── desktop-storage.ts         — @kartoteka/storage backend impl
│       │   │   ├── desktop-sqlite-backend.ts  — @kartoteka/offline-sync backend impl
│       │   │   └── auth-gate.tsx
│       │   └── main.tsx
│       └── src-tauri/
│           └── src/
│               ├── lib.rs                     (megvan) — új command-ok itt regisztrálódnak
│               ├── db.rs                      (megvan) — SQLCipher
│               ├── device.rs                  (megvan) — fingerprint + keypair
│               ├── auth.rs                    (🆕 M6)  — session store a keyring-ben
│               ├── sync.rs                    (🆕 M9)  — natív sync accelerator (opcionális)
│               └── crypto.rs                  (🆕 M13) — DEK wrap E2E doc titkosításhoz
├── packages/
│   ├── supabase-client/                       (megvan)
│   ├── schema-types/                          (megvan)
│   ├── design-tokens/                         (megvan)
│   ├── ui/                                    (megvan, bővítendő)
│   ├── ui-app/                                (🆕 M6)  — app-szintű komponensek (modalok, táblák, dashboard tabok)
│   ├── core/                                  (🆕 M6)  — use-case függvények, domain kalkulátorok
│   ├── offline-sync/                          (🆕 M6)  — StorageBackend absztrakció + orchestrator
│   ├── auth/                                  (🆕 M6)  — RBAC helper, scope builder
│   ├── validations/                           (🆕 M6)  — zod sémák
│   ├── storage/                               (🆕 M10) — blob/PDF/Excel absztrakció
│   ├── pdf/                                   (🆕 M10) — html2pdf wrapper → Typst roadmap
│   └── excel/                                 (🆕 M10) — exceljs + xlsx wrapper
├── supabase/
│   └── functions/                             — secret gateway (Edge Fn-ök)
│       ├── oblio-oauth/
│       ├── oblio-invoice/
│       ├── mail-send/                         — Brevo + Resend fallback
│       └── ai-chat/                           — Claude routing (Aladár)
├── migration-docs/sql/                        — Endre futtatja (SQL + végi check-SELECT)
└── docs/project-tracking/                     — minden fázis után rögzítés
```

---

## 3. Funkció leltár — web vs. desktop jelenlegi státusz

### 3.1 Dashboard modulok (24 db)

| # | Modul | Web | Desktop UI | Offline sync | Prioritás |
|---|---|---|---|---|---|
| 1 | tagnyilvántartás (`szemely`, family, presbyter, voter) | ✅ | ❌ | ✅ M7 (szemely) | **P0** |
| 2 | anyakönyv | ✅ | ❌ | ❌ | **P0** |
| 3 | pénzügy (chitanta, Oblio, e-Factura, bank, tva, tartozas, finalization) | ✅ | ❌ | ❌ | **P0** |
| 4 | jegyzőkönyvek | ✅ | ❌ | ❌ | P1 |
| 5 | iktato (+ template) | ✅ | ❌ | ❌ | P1 |
| 6 | sírhelyek | ✅ | ❌ | ❌ | P2 |
| 7 | leltar (+ anyagraktar) | ✅ | ❌ | ❌ | P1 |
| 8 | munkanapló | ✅ | ✅ | ✅ M8 | — |
| 9 | éves jelentés (+ prezentacio) | ✅ | ❌ | ❌ | P1 |
| 10 | **admin** (access-req, broadcasts, devices-licenses, profile-roles, profile-congregations, system-finance) | ✅ | **web-only** | N/A | — |
| 11 | **publikus-oldal szerkesztő** (+ magazin, upload) | ✅ | **web-only** | N/A | — |
| 12 | profile (+ preferences, walkthrough, switch-context, kapcsolatok) | ✅ | 🟡 részleges | ✅ (profiles) | P1 |
| 13 | offline (Dexie UI) | ✅ | N/A | N/A | **desktop-specifikus saját UI** |
| 14 | programs | ✅ | ❌ | ❌ | P2 |
| 15 | misszios-muhely (+ project, community) | ✅ | ❌ | ❌ | P3 |
| 16–18 | dashboard + egyházmegye + kerület | ✅ | 🟡 placeholder | ❌ | P1 |
| 19 | kuka (recycle-bin) | ✅ | ❌ | ❌ | P2 |
| 20 | support | ✅ | ❌ | ❌ | P3 |
| 21 | congregation | ✅ | ❌ | ✅ (congregations_local van) | P1 |
| 22 | notifications | ✅ | ❌ | ❌ | P1 |
| 23 | delegated-import | ✅ | ❌ | ❌ | P2 |
| 24 | **god-mode, admin-override** (v1-v4) | ✅ | **web-only** | N/A | — |

### 3.2 Server Actions: 77 fájl, 80 előfordulás

Validálva Grep-pel (`'use server'` az `apps/web` alatt). Főbb csoportok:
- **pénzügy**: 13 fájl (actions, bank-import, bank-nyito-egyenleg, chitanta + chitanta-tombok, edit-storno, finalization, monetary, oblio + oblio-config + oblio-ellenorzes + oblio-lookup, tartozas, tva)
- **admin**: 8 fájl (access-requests + shared, broadcasts, devices-licenses + shared, profile-congregations, profile-roles, system-finance, actions)
- **profile**: 6 fájl (actions, preferences, walkthrough, switch-context, kapcsolatok, profile-congregations)
- **tagnyilvántartás**: 4 (actions, family, presbyter, voter)
- **god-mode**: 4 (v1-v4)
- **dashboard-egyhazmegye**: 3 (diocese, document, chitanta-tombok)
- **publikus-oldal**: 3 (actions, magazin, upload)
- **misszios-muhely**: 3 (actions, project, community)
- **eves-jelentes**: 2 (actions, prezentacio)
- **iktato**: 2 (actions, template)
- **leltar**: 2 (actions, anyagraktar)
- **auth flow** (web-only marad): 5 (login, register, pending, forgot-password, oauth-complete)
- **egyéb single**: anyakonyv, jegyzokonyvek, sirhelyek, support, programs, notifications, congregation, munkanaplo, delegated-import, admin-override, (dashboard) root, welcome, hozzaferes-kerese
- **lib-szintű**: `lib/address/actions.ts`, `lib/import/batch-import-actions.ts`, `lib/email/types.ts` (deklaratív), `lib/constants/documents.ts`, `lib/broadcasts/types.ts`

**Tétel**: egy átlagos use-case migráció (action → core + web wrapper + desktop import) ~30-90 perc. 77 action × 60 perc = ~77 órányi tiszta refaktor idő, szétosztva 6 modul-wave-re (~12-13 óra / wave).

### 3.3 API route-ok (8 db)

| Route | Jövőbeli hely |
|---|---|
| `/api/ai/chat` | **Edge Fn `ai-chat`** — Claude routing, shared secret vault |
| `/api/daily-verse` | marad `apps/web/app/api` (cache-elt, SSR-friendly, desktopon fetch-elt) |
| `/api/standalone/*` (6) | **M6.3-ban törlés** — Tauri-val redundáns, a portable build kivezetésével együtt |

### 3.4 Külső integrációk → Edge Function gateway

| Integráció | Jelenlegi | Cél (M6–M7) |
|---|---|---|
| Oblio OAuth | `apps/web/lib/finance/oblio/*` server-side | `supabase/functions/oblio-oauth` |
| Oblio invoice + lookup + ellenőrzés | server action | `supabase/functions/oblio-invoice` |
| Brevo email (broadcast, access-req notify) | `apps/web/lib/email/providers/brevo.ts` | `supabase/functions/mail-send` |
| Resend email (fallback) | `apps/web/lib/email/providers/resend.ts` | `supabase/functions/mail-send` (ua.) |
| Claude AI (Aladár) | `app/api/ai/chat` | `supabase/functions/ai-chat` |

### 3.5 Offline orchestrator (meglévő érték — a tervezett `@kartoteka/offline-sync` magja)

`apps/web/lib/offline/` **18 fájl, ~180 KB** kód, M6.1-ben közös package-be emelendő:
- `db.ts` (28 KB) — Dexie schema definíció
- `sync-orchestrator.ts` (16 KB), `pull.ts`, `push.ts`, `mutation-queue.ts`, `conflict-resolver.ts`
- `table-registry.ts` (15 KB) — **minden offline-szinkronizált tábla regisztrálva**
- `excel-reader.ts`, `excel-writer.ts`, `excel-watcher.ts`, `excel-import-diff.ts`, `excel-schema/` — Excel sync réteg (külön `packages/excel`-be megy)
- `fs-handle-store.ts`, `full-backup.ts`, `recycle-bin-actions.ts`, `recycle-bin-labels.ts`
- `hooks/` — React hook-ok (`useSyncQuery`, `useSyncMutation`, stb.)

Ez a réteg már révbe ért logikailag — a migráció lényege absztraktálni egy `StorageBackend` interface mögé (web: Dexie, desktop: SQLCipher via Tauri command).

---

## 4. Technikai döntések

### 4.1 Dexie vs. SQLCipher — desktop CSAK SQLCipher

A web marad Dexie-n (browser nem tud SQLCipher-t). Desktop oldalon minden Dexie import **kitiltva** `apps/desktop/tsconfig.json` eslint-rule-lal (`no-restricted-imports: dexie`). A `@kartoteka/offline-sync` csomag `StorageBackend` interface-e absztraktálja a különbséget.

### 4.2 Server Action → use-case refaktor minta

```ts
// packages/core/src/finance/chitanta/issue-chitanta.ts
export interface IssueChitantaInput { /* zod-validated */ }
export interface IssueChitantaCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  audit: AuditLogger
}
export async function issueChitantaUseCase(
  input: IssueChitantaInput,
  ctx: IssueChitantaCtx,
): Promise<IssueChitantaResult> { /* RLS-védett logika */ }
```

```ts
// apps/web/app/(dashboard)/penzugy/chitanta-actions.ts
'use server'
import { issueChitantaUseCase } from '@kartoteka/core'
import { createServerSupabaseClient } from '@/lib/supabase/server'
export async function issueChitantaAction(fd: FormData) {
  const supabase = await createServerSupabaseClient()
  return issueChitantaUseCase(parseFd(fd), { supabase, runtime: 'web', audit: webAudit })
}
```

```ts
// apps/desktop/src/pages/penzugy/chitanta-form.tsx (kliens)
import { issueChitantaUseCase } from '@kartoteka/core'
const supabase = getDesktopSupabase()
await issueChitantaUseCase(input, { supabase, runtime: 'desktop', audit: desktopAudit })
```

### 4.3 Auth — Tauri keyring session

Új Rust command: `auth_store_session(jwt, refresh_token)`, `auth_read_session()`, `auth_clear_session()` → `apps/desktop/src-tauri/src/auth.rs`. A supabase-js kliens a `storage` opcióval ezt használja `localStorage` helyett. **Offline-login**: a 30 napos refresh token lejárta után a user csak olvasni tud a SQLCipher-ből, minden push outbox-ba kerül; UI-ban tiszta jelzés ("Offline munkamenet, kérlek csatlakozz és lépj be").

### 4.4 Routing + state management

- **Routing**: React Router v7 marad (már ez van). RBAC guard komponens: `<RequireRole roles={['lelkesz','esperes']}>`.
- **State**: Supabase kliens + `@kartoteka/offline-sync` `useSyncQuery(tableName, filter)` hook, ami DI-val kapja a backendet (Dexie vagy SQLite). Az existing `useLiveQuery` minta átkerül a package-be.

### 4.5 PDF és Excel

**Rövidtávon** (M10): `html2pdf.js` + `pdfjs-dist` + `exceljs` + `xlsx` + `jszip` kliens-oldalon mindkét platformon, a `@kartoteka/storage` adja a fájl I/O absztrakciót. **Hosszútávon** (M16+ opcionális): Typst-alapú Rust PDF engine az éves jelentés és jogszabály-kompatibilis dokumentumokhoz.

### 4.6 Code signing

Marad **self-signed EREK cert** a beta alatt (M16 végéig). A Windows SmartScreen figyelmeztetést a beta-tesztelők tudomásul veszik (dokumentált „Több info → Mégis futtatás" kattintás). M16 utáni döntés: Azure Trusted Signing (havi díj, ha bővül a felhasználói kör 1000-re), vagy DigiCert EV.

### 4.7 next.js 16 migráció-házimunka

- `apps/web/middleware.ts` → `apps/web/proxy.ts` (Next.js 16 deprecation) — M6.5
- 4 meglévő ESLint warning kijavítása — M6.5

---

## 5. Top 10 kockázat

| # | Kockázat | Súly | Mitigáció |
|---|---|---|---|
| 1 | **77 Server Action refaktor** blokkolja az összes wave-t | P0 | Modul-onként, 5-6 action-enként review; nincs big-bang refaktor |
| 2 | **RLS lyuk feltárul** a közvetlen desktop → Supabase hívásoknál (eddig server-only action) | P0 | M6.2 kötelező 113-tábla audit SQL (ellenőrző SELECT a migration-docs/sql-ben) |
| 3 | **Oblio/Brevo/Claude titok leak** desktop bundle-ba | P0 | CI grep-policy: `grep -rE "OBLIO_|BREVO_|RESEND_|ANTHROPIC_" apps/desktop` fail |
| 4 | **Mind a 22 modul offline-capable scope** túlnő (user choice) | P1 | 3 wave-be tagolva (P0 → P1 → P2+P3), wave-végi ellenőrzés |
| 5 | **SQL migráció hibás táblára hivatkozik** | P1 | Minden migrációfájl végén futtatható check-SELECT (memory `feedback_sql_ellenorzes_egyben`) |
| 6 | **Konfliktus-megoldás UX** 22 modulon keresztül inkonzisztens | P1 | Közös `conflict-resolver.ts` a @kartoteka/offline-sync-ben, UI pattern dokumentálva |
| 7 | **Excel import nagy fájl (50 MB+)** memóriából kifut | P2 | Streaming exceljs reader, progress-UI — `packages/excel` már ezt támogatja |
| 8 | **Self-signed SmartScreen** visszaveti a béta résztvevőket | P2 | Dokumentált telepítési útmutató, video bemutató, beta-user briefing |
| 9 | **Rust fordítási idő** lassítja a release-t (15-25 perc) | P3 | `swatinem/rust-cache` GitHub Actions-ben, incremental build |
| 10 | **Tauri 2 Windows system dialog angol** | P3 | Locale config + M16 lokalizáció |

---

## 6. Roadmap (M6 → M16)

### M6 — Architektúra konszolidáció (2-3 hét)

| Feladat | Fájl |
|---|---|
| M6.1 `packages/{core,ui-app,offline-sync,auth,validations}` skeleton | `packages/*/package.json`, `tsconfig.json` |
| M6.2 RLS audit 113 táblára + migration | `migration-docs/sql/NN_rls_audit_2026-04-xx.sql` (with check-SELECTs) |
| M6.3 `/api/standalone/*` törlés + portable build kivezetés | `apps/web/app/api/standalone/*`, `apps/web/next.config.ts` |
| M6.4 Edge Fn-ök: `oblio-oauth`, `oblio-invoice`, `mail-send`, `ai-chat` | `supabase/functions/*` |
| M6.5 Next.js 16: `middleware.ts → proxy.ts`, lint-fix | `apps/web/proxy.ts` |
| M6.6 Desktop auth session Tauri keyring-be | `apps/desktop/src-tauri/src/auth.rs`, `apps/desktop/src/lib/supabase.ts` |
| M6.7 Dexie tiltás desktop oldalon | `apps/desktop/tsconfig.json`, eslint rule |
| M6.8 Offline orchestrator → `@kartoteka/offline-sync` | átemelés `apps/web/lib/offline/*` → `packages/offline-sync/src/*` |

**Acceptance:** 5 package fordul, RLS-audit riport kész, Edge Fn-ök deployolva, desktop-on Dexie import build-error, session Tauri keyring-ben perzisztens restart után.

### M7 — Wave 1: Pénzügy (3-4 hét, P0)

- 13 pénzügyi Server Action refaktor use-case-ekké
- 34 `components/finance/*` átemelés `packages/ui-app/finance/`-be
- Oblio integrációk az Edge Fn-eken keresztül
- Bank-import desktop FS-en (tauri-plugin-dialog + exceljs)
- Chitanta print html2pdf kliens-oldali, mindkét platform
- SQLCipher migráció: `bank_tranzakciok`, `oblio_invoices`, `chitanta`, `chitanta_tombok`, `decont`, `budget`, `szamadasicel`, `jarulek`, `tva_tombok` táblák offline-mirror
- Desktop pénzügy route + komponensek

**Acceptance:** offline chitanta-kiállítás, Oblio-szinkronizáció Edge Fn-en, bank-import működik, pénzügy dashboard desktop-on teljes. Projekt log + CHANGELOG + Obsidian AGY bejegyzés.

### M8 — Wave 2: Tagnyilvántartás + Anyakönyv + Profile (2-3 hét, P0)

- 4 tagnyilvántartás action (actions, family, presbyter, voter) use-case
- `components/members/*` (9) átemelés
- Anyakönyv (keresztelő, házasság, temetés) action + UI
- Profile 6 action + UI
- SQLCipher: `anyakonyv_keresztelesek`, `anyakonyv_hazassagok`, `anyakonyv_temetesek`, `szemely_family`, `szemely_presbyter`, `szemely_voter`
- M7 (`szemely`) komplett UI a desktop oldalon

**Acceptance:** offline tag- és anyakönyv-kezelés, push-sync.

### M9 — Wave 3: Jegyzőkönyvek + Iktato + Leltar + Éves jelentés (3-4 hét, P1)

- 4 action-csoport refaktor (7 action fájl)
- 7 `components/minutes/*` + 7 `components/inventory/*` + 4 `components/filing/*` + 2 `components/annual-report/*` átemelés
- SQLCipher táblák: `jegyzokonyvek`, `iktato_dokumentumok`, `iktato_sablonok`, `leltar_targyak`, `anyagraktar`, `annual_reports`
- Iktato template-kliens-oldali evaluation

**Acceptance:** 4 új modul offline, template-generátor fut desktopon.

### M10 — `@kartoteka/storage` + `/pdf` + `/excel` (1-2 hét, infrastruktúra)

- `StorageBackend` interface: `readFile`, `writeFile`, `pickFile`, `saveAs`
- Web impl: Browser FS API + download link
- Desktop impl: `@tauri-apps/plugin-fs` + `@tauri-apps/plugin-dialog`
- `html2pdf`, `pdfjs-dist`, `exceljs`, `xlsx`, `jszip` hívások átírva közös wrapper-re
- Delegated-import wizard desktop-kompatibilis

**Acceptance:** minden PDF/Excel export ugyanúgy fut mindkét platformon.

### M11 — Wave 4: Dashboard + Congregation + Notifications + Kuka (2-3 hét, P1+P2)

- 5 action refaktor
- Dashboard egyházmegye, kerület, root 32 komponens átemelés
- SQLCipher: `notifications`, `kuka` (soft-delete) táblák
- Supabase realtime a notifications-hez (desktop WebSocket)

**Acceptance:** dashboard valós adatokkal, értesítések real-time desktop-on.

### M12 — Wave 5: Sirhelyek + Programs + Delegated-import + Misszios-muhely + Support (2-3 hét, P2+P3)

- 10 action refaktor
- `components/muhely/*` (31) átemelés → `packages/ui-app/muhely/`
- SQLCipher: `sirhelyek`, `programok`, `muhely_*`, `support_tickets`
- Delegated-import wizard desktop (nagy Excel pick + streaming)

**Acceptance:** 22/22 hátralévő modul desktop-on offline-capable.

### M13 — E2E dokumentum-titkosítás (2 hét, biztonság)

- Rust `crypto.rs`: DEK per document + KEK user-jelszóból (argon2) + SQLCipher key
- Storage bucket-ok (documents, minutes, annual_reports) kliens-oldali titkosítás pre-upload
- Szakértő V4 terv részletes átvétele + auditálás

**Acceptance:** szerver-oldali admin sem olvassa el a feltöltött dokumentumokat.

### M14 — Release pipeline + update csatornák (1-2 hét)

- GitHub Actions: PR: lint/typecheck/test; tag: full release (web + desktop), upload Supabase Storage, GitHub Release
- Tauri delta-update (patch MSI, Tauri 2 natív támogatás)
- Rollback: health-check update után, ha fail → előző verzió visszaállítás
- Stable + beta csatorna (`stable/windows-x86_64/latest.json`, `beta/windows-x86_64/latest.json`) + UI opt-in

**Acceptance:** delta-MSI 2-5 MB, beta csatorna aktív, rollback tesztelve.

### M15 — Magyar lokalizáció + UI polírozás (1 hét)

- Tauri system dialog + menü magyar
- 22 modul modal, placeholder, error-state polírozása (memory `feedback_ux_philosophy`, `feedback_modal_design_system`)
- Accessibility + reszponzív auditálás (memory `feedback_responsive`)

**Acceptance:** magyar nyelvű desktop, accessibility WCAG AA.

### M16 — Beta + rollout (4-6 hét)

- Beta: 5-10 lelkész (1 egyházkerületi admin, 1-2 egyházmegyei admin, 5-7 lelkész), 2 hét aktív használat
- Bug-fix iterációk (2 hét)
- Fokozatos rollout: 50 → 200 → 500 → 1000 lelkész
- Code-sign döntés (Azure Trusted Signing vs. DigiCert EV) költségvetés alapján

**Acceptance:** 1000 lelkész desktop-on, crash-rate < 0.5%, support-ticket < 5/hét.

---

## 7. Kritikus fájlok (módosítási pontok)

| Fájl | Szerep | Mikor |
|---|---|---|
| `D:\Egyházi APP\KARTOTEKA\apps\desktop\src\lib\sync.ts` | Jelenlegi profil-sync, átkerül `@kartoteka/offline-sync`-be | M6.8 |
| `D:\Egyházi APP\KARTOTEKA\apps\desktop\src-tauri\src\lib.rs` | Új command regisztráció (`auth_*`, `crypto_*`) | M6.6, M13 |
| `D:\Egyházi APP\KARTOTEKA\apps\desktop\src-tauri\tauri.conf.json` | Updater endpoint, locale, bundle config | M14 |
| `D:\Egyházi APP\KARTOTEKA\apps\web\app\(dashboard)\penzugy\chitanta-actions.ts` | **Wave 1 referencia-refaktor fájl**, minta a 77 többi action számára | M7 |
| `D:\Egyházi APP\KARTOTEKA\apps\web\lib\offline\sync-orchestrator.ts` | Átköltözik `packages/offline-sync/src/orchestrator.ts` | M6.8 |
| `D:\Egyházi APP\KARTOTEKA\apps\web\lib\offline\table-registry.ts` | Átköltözik, új táblák minden wave-ben | M6-M12 |
| `D:\Egyházi APP\KARTOTEKA\packages\supabase-client\src\browser.ts` | Kliens factory, minden use-case ezt kapja ctx-ben | M6 |
| `D:\Egyházi APP\KARTOTEKA\apps\web\middleware.ts` | Átnevezés `proxy.ts`-re | M6.5 |
| `D:\Egyházi APP\KARTOTEKA\supabase\functions\*` | Edge Fn gateway Oblio/mail/AI-ra | M6.4 |
| `D:\Egyházi APP\KARTOTEKA\migration-docs\sql\NN_rls_audit_2026-04-xx.sql` | 113 tábla RLS ellenőrzés (memory `feedback_supabase_access`) | M6.2 |

---

## 8. Dokumentációs kötelezettségek (memory-kötelező 3 réteg)

**Minden fázis (M6.x-M16.x) után:**
1. **Project log** — `D:\Egyházi APP\KARTOTEKA\docs\project-tracking\KARTOTEKA-M{x.y}-{slug}-{YYYY-MM-DD}.md` (létező konvenció)
2. **CHANGELOG** — `D:\Egyházi APP\KARTOTEKA\docs\CHANGELOG.md` user-facing bejegyzés Keep a Changelog formátumban (memory `feedback_changelog_mentes`)
3. **Obsidian AGY** — Kartotéka vault-ban atomi jegyzet + projekt-kártya frissítés (memory `feedback_obsidian_filozofia`, `feedback_dokumentalj_mindent`)

**Minden SQL migráció (memory `feedback_supabase_access`, `feedback_sql_ellenorzes_egyben`, `feedback_verify_ask_document`):**
- `D:\Egyházi APP\KARTOTEKA\migration-docs\sql\NN_{slug}.sql`
- UP + DOWN + ellenőrző SELECT (futtatható blokk) a fájl végén
- Minden hivatkozott tábla és oszlop **tényleges létezésének ellenőrzése** a `Database_schema.sql`-ben, **sose feltételezz**
- **Endre futtatja**, nem mi — kész fájlt adunk át

**Minden Rust változás:** `cargo fmt`, `cargo clippy` tisztán; release-time növekedés rögzítve a CHANGELOG-ban, ha >1 perc.

---

## 9. Verification (hogyan ellenőrizzük minden fázis végén)

### Lokális desktop tesztelés
```
cd "D:\Egyházi APP\KARTOTEKA"
npm run desktop:dev                        # Tauri dev, hot-reload a Vite + Rust ágon
```
- Login → dashboard → érintett modul flow végigjátszás
- Offline teszt: task manager-ből Supabase blokkolása host fájllal vagy dev-console-ban `network: offline`
- Sync tesztelés: offline edit → online jön → push outbox → conflict scenario → conflict-resolver UI

### Web tesztelés
```
cd "D:\Egyházi APP\KARTOTEKA\apps\web"
npm run dev
```
- Ugyanaz a use-case fut ugyanúgy (use-case parity check)

### Shared package fordulás
```
cd "D:\Egyházi APP\KARTOTEKA"
npm run build --workspaces --if-present
```
- Egyetlen `tsc` hiba sem megengedett

### RLS audit (M6.2)
- Endre futtatja `migration-docs/sql/NN_rls_audit_2026-04-xx.sql`-t Supabase SQL editorban
- A végi check-SELECT-ek minden tábláról sor-szintű RLS státuszt adnak (`has_rls`, `policies_count`, `insert_allowed_for_lelkesz`, stb.)
- Ha bármelyik P0/P1 tábla RLS-e hiányzik → blokkoló, nem megy tovább a wave

### Build + release (M14)
- Release tag push → GitHub Actions Windows runner
- Build-output: `apps/desktop/src-tauri/target/release/bundle/msi/*.msi`
- Bundle méret-ellenőrzés, updater manifest (`latest.json`) validálás, signature ellenőrzés
- Egy desktop gépen installálás + auto-updater próba

### Security regression (minden release előtt)
```
# Tiltott secret nevek az apps/desktop alatt
grep -rE "OBLIO_|BREVO_|RESEND_|ANTHROPIC_|SUPABASE_SERVICE_ROLE" apps/desktop && exit 1
```
- Null eredmény = OK

### Béta fázis (M16)
- 5-10 lelkész, 4-6 hét
- Telemetria (opcionális, opt-in): crash report, sync conflict rate
- Heti check-in meeting + support ticket audit

---

## 10. 3 fő kockázat és 3 legfontosabb javaslat

### Top 3 kockázat
1. **77 Server Action refaktor** — M6-M12 teljes időtartamát érinti. A hullámokat nem lehet gyorsítani; iteratív, modul-enkénti megközelítés az egyetlen reális út.
2. **RLS policy hiány egy P0 táblán** — ha a 113-tábla auditból valami kimaradt, az első desktop-user közvetlen hívás leakelhet cross-congregation adatot. M6.2 kötelező minden mást blokkol, amíg át nem megy.
3. **Mind a 22 modul offline scope** (user választás) — nagyobb SQL migrációs felület, több konfliktus-scenario, több tesztelés. Mitigálható modul-wave-kkel, de a teljes M7-M12 tartomány ezzel fut.

### Top 3 javaslat
1. **M6 legyen elsőre architektúra, NE modul-UI.** A 2-3 hét shared packages + RLS audit + Edge Fn gateway megspórol 4-6 hónapot a későbbi modul-wave-kben.
2. **Supabase Edge Function legyen a titok-gateway.** Egy helyen auditálható minden Oblio / Brevo / Resend / Claude hívás; a desktop bundle soha nem tartalmaz titkot; a CI grep-policy automata védelem.
3. **Az admin, god-mode, publikus-oldal MARAD web-only.** Ez nem kompromisszum, hanem tiszta szerep-határ: a desktop a napi lelkészi munka, a web az adminisztrációs és publikus réteg. Offline-olni sincs értelme.
