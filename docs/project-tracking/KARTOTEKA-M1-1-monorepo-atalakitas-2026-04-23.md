# M1.1 teljesítési jelentés — Monorepo átalakítás (apps/web + packages/*)

**Dátum**: 2026-04-23
**Fázis**: M1.1 — monorepo szerkezeti előkészítés
**Kódolási ciklus**: ~45 perc (rutinfeladat, de kritikus az M1 folytatásához)
**Státusz**: ✅ KÉSZ, dev-server + TypeScript verify átment
**Branch**: `feat/m1-1-monorepo` (baseline: `ae5fa02d`)

---

## 1. Vezetői összefoglaló

Az M0 (backend biztonsági alapvonal) lezárultával az M1 fázis első lépése a repo
**npm workspaces-alapú monorepo-vá** alakítása volt. Ez szerkezeti művelet — **semmi
nem változott a felhasználói oldalon**, de előkészíti a terepet az M1.2–M1.5 lépéseknek
(Tauri 2 desktop kliens + közös csomagok).

**Fő eredmény**: a teljes Next.js app átkerült az `apps/web/` alá, és 4 placeholder
csomag lett létrehozva a `packages/` alatt. A root `package.json` workspaces-meta
lett. A fejlesztői workflow (`npm run dev`, `npm run build`) változatlan — csak
most a root-ról delegál a web-workspace-be.

**Nem-triviális pontok**:
- Eredetileg megakadt a `git mv` a futó dev-server miatt (fájl-lock) — leállítás után simán ment
- A `.env.local` és `.env.example` is átkerült `apps/web/` alá (Next.js a saját workspace-ből olvassa)
- A `scripts/audit-safety.mjs` szintén átkerült (web-specifikus), a `scripts/build-adr-seed.mjs` maradt rooton (migration-docs/ adatokon dolgozik)

---

## 2. Új repo szerkezet

```
KARTOTEKA/
├── apps/
│   └── web/                    (@kartoteka/web — Next.js 16 app)
│       ├── app/                 (App Router — 24 dashboard modul)
│       ├── components/          (236+ komponens)
│       ├── lib/                 (core libraries)
│       ├── public/              (statikus assetek)
│       ├── scripts/
│       │   └── audit-safety.mjs
│       ├── .env.local
│       ├── .env.example
│       ├── next.config.ts
│       ├── tsconfig.json
│       ├── middleware.ts
│       ├── eslint.config.mjs
│       ├── postcss.config.mjs
│       ├── components.json
│       ├── next-env.d.ts
│       └── package.json         (lokális deps + scripts)
├── packages/                    (közös kód — M1.3/M1.4-ben tölt fel)
│   ├── ui/                      (@kartoteka/ui)
│   ├── supabase-client/         (@kartoteka/supabase-client)
│   ├── design-tokens/           (@kartoteka/design-tokens)
│   └── schema-types/            (@kartoteka/schema-types)
├── docs/                        (projekt-dokumentáció — rooton marad)
├── migration-docs/              (SQL + séma — rooton marad)
├── supabase/                    (Edge functions — rooton marad, közös)
├── standalone-build/            (legacy portable build — M3 után törölhető)
├── icon/                        (alkalmazás-ikonok — rooton, több app közös)
├── scripts/
│   └── build-adr-seed.mjs       (rooton, mert migration-docs/ adatokon dolgozik)
├── node_modules/                (hoisted deps + @kartoteka/* symlinks)
├── package.json                 (root workspace config)
├── package-lock.json
└── .gitignore
```

## 3. Végrehajtott lépések (időrendben)

1. **Baseline commit** (`ae5fa02d`): M0 teljes állapot rögzítése
2. **Új branch**: `feat/m1-1-monorepo`
3. **Könyvtárak létrehozása**: `apps/web/`, `packages/{ui,supabase-client,design-tokens,schema-types}/`
4. **Dev-server leállítás** (fájl-lock feloldása)
5. **Build cache törlés**: `.next/`, `tsconfig.tsbuildinfo` (regenerálódik)
6. **Git mv** — 4 fő dir (`app`, `components`, `lib`, `public`) + 7 konfig-fájl + `scripts/audit-safety.mjs`
7. **Env fájlok**: `.env.local` és `.env.example` → `apps/web/` alá (utóbbit `git mv`-vel, előbbit sima `mv`-vel mert nincs tracking-ben)
8. **`apps/web/package.json`** létrehozva `@kartoteka/web` névvel (egykori root deps)
9. **Root `package.json`** átírva workspaces-meta-ra (név: `kartoteka`, scripts delegálnak az `@kartoteka/web`-be)
10. **Placeholder `package.json` + `src/index.ts`** minden `packages/*` mappában
11. **`rm -rf node_modules`** + **`npm install`** — 968 csomag hoist-olva, workspace-symlinkek létrejöttek
12. **Verify**: `npx tsc --noEmit` (0 hiba), `npm run dev` (Ready in 386ms, `.env.local` betöltve)

## 4. Nem-változások (fontos!)

Amit **NEM** módosítottunk, hogy a változás minimál-invazív maradjon:

- ❌ A `@/...` import-paths változatlanok (a `tsconfig.json` a workspace-ben van, a `"@/*": ["./*"]` továbbra is `apps/web/` relatív)
- ❌ A `next.config.ts` tartalmi rész változatlan (a Serwist `swSrc: "app/sw.ts"` a workspace-en belüli relatív út)
- ❌ A Supabase URL-ek, Brevo API kulcs, RLS policy-k — **teljesen változatlan** (a `.env.local` csak átkerült, tartalom ugyanaz)
- ❌ A 236+ komponens, 72 Server Action — **nem refaktor** (minden ugyanazt a logikát futtatja, csak más mappában)
- ❌ A `middleware.ts` tartalma változatlan
- ❌ A `standalone-build/` és `icon/` rooton maradt (későbbi fázis fogja tisztítani)

## 5. Ellenőrzés (Endre lépésről lépésre követheti)

```bash
# 1. Workspace-link ellenőrzés
ls node_modules/@kartoteka/
# Várt: design-tokens  schema-types  supabase-client  ui  web

# 2. TypeScript check
cd apps/web && npx tsc --noEmit
# Várt: 0 hiba, 0 output

# 3. Dev-server indítás root-ról
cd ../..
npm run dev
# Várt: "▲ Next.js 16.2.2 (Turbopack)" + "Environments: .env.local" + "Ready in <1s"

# 4. Nyisd meg a http://localhost:3000/login-t — ugyanúgy kell működjön, mint eddig

# 5. Admin oldal — /admin — a hozzáférés-kérelmek fül jelenjen meg
```

## 6. Következő lépés — M1.2 (Tauri projekt init)

A következő alfázis az **`apps/desktop/`** könyvtár inicializálása:

- `cargo install create-tauri-app`
- `cd apps/ && cargo create-tauri-app desktop --template react-ts`
- Alap auth-flow a közös `@kartoteka/supabase-client`-tel (M1.3-ban töltjük fel)

Ez már **új projekt**, a `apps/web/` Next.js-hez nem nyúl — párhuzamosan fejleszthető.

## 7. Tanulságok

**Jó döntés volt az M0.6 utáni baseline-commit**: a branch clean-állapotból indult, bármikor visszaállítható.

**Dev-server fájl-lock**: a Turbopack watcher lock-olja a `app/` mappa fájljait — minden `git mv` előtt le kell állítani a dev-servert. Ez Windows-specifikus, Linuxon nem lenne baj.

**npm workspaces egyszerű**: nem kellett Turborepo/Nx — a natív workspaces elég ehhez a méretű monorepóhoz.

**Hoisting kérdés**: a `better-sqlite3` és `node-machine-id` natív csomagok a root `node_modules/`-ba hoist-olódtak. A `next.config.ts` `outputFileTracingIncludes` útjai (`node_modules/better-sqlite3/**/*`) továbbra is működnek, mert a Next.js a workspace-ben futva is a teljes `node_modules/` fát scanneli. Ha később mégis probléma lesz, a `outputFileTracingRoot` beállítással root-ra lehet bővíteni.

---

**Összes git-állapot ennek az M1.1-nek a commit-jekor**:
- 572+ fájl rename (`git mv`)
- 5 új package.json + 4 új `src/index.ts` (placeholder csomagok)
- 1 módosított root `package.json`
- 1 módosított `package-lock.json` (npm install)
- 1 módosított `docs/CHANGELOG.md`
- 1 új `docs/project-tracking/KARTOTEKA-M1-1-monorepo-atalakitas-2026-04-23.md` (ez a fájl)
