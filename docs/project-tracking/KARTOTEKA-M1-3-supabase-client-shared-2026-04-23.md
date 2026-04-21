# M1.3 teljesítési jelentés — Közös @kartoteka/supabase-client csomag

**Dátum**: 2026-04-23
**Fázis**: M1.3 — közös Supabase-kliens factory
**Kódolási ciklus**: ~20 perc
**Státusz**: ✅ KÉSZ, minden tsc check 0 hiba, web dev indítás OK
**Branch**: `feat/m1-1-monorepo` (M1 fázis folytatása)

---

## 1. Vezetői összefoglaló

A webes app és a Tauri desktop kliens most már **ugyanazt a Supabase böngésző-oldali
kliens-factory-t** használja, a `packages/supabase-client/` közös csomagból.

Ez:
- **Elkerüli a kód-duplikációt** (egy hely, ahol a `createBrowserClient` hívódik)
- **Platform-független** — a csomag nem olvas env-változókat, hanem paraméterként kapja a konfigurációt (a caller Next.js / Vite adja át)
- **Visszafelé kompatibilis** — a 15 meglévő web-fájl változatlan marad

Szerkezeti munka, nem funkcionális változás.

---

## 2. Mit emeltünk ki közös csomagba, mit nem

| Fájl | Hely M1.3 előtt | Hely M1.3 után | Indoklás |
|---|---|---|---|
| Browser client factory | `apps/web/lib/supabase/client.ts` (23 sor) | `packages/supabase-client/src/browser.ts` (közös) | Mindkét platform használja |
| `SupabaseBrowserConfig` típus | — | `packages/supabase-client/src/browser.ts` | Új, közös kontrakt |
| `Database` típus placeholder | — | `packages/supabase-client/src/types.ts` | M1.5-ben feltöltjük |
| Web env-bekötés | `apps/web/lib/supabase/client.ts` | `apps/web/lib/supabase/client.ts` (15 soros wrapper) | Next.js-specifikus (`process.env`) |
| Desktop env-bekötés | — | `apps/desktop/src/lib/supabase.ts` (új) | Vite-specifikus (`import.meta.env`) |
| Server client (SSR) | `apps/web/lib/supabase/server.ts` | marad | `cookies()` Next.js-only |
| Admin client (service_role) | `apps/web/lib/supabase/admin-client.ts` | marad | `'server-only'`, csak apps/web |
| Auth middleware | `apps/web/lib/supabase/middleware.ts` | marad | Next.js Edge Runtime |
| Secret vault (pgcrypto) | `apps/web/lib/supabase/secret-vault.ts` | marad | `'server-only'`, csak apps/web |

## 3. A csomag API-ja

```ts
// packages/supabase-client/src/index.ts
export {
  createKartotekaBrowserClient,
  type SupabaseBrowserConfig,
} from './browser'
export type { Database } from './types'
```

```ts
// Használat — apps/web/lib/supabase/client.ts
import { createKartotekaBrowserClient } from '@kartoteka/supabase-client'

export function createClient() {
  return createKartotekaBrowserClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  })
}
```

```ts
// Használat — apps/desktop/src/lib/supabase.ts
import { createKartotekaBrowserClient } from '@kartoteka/supabase-client'

export function getDesktopSupabase() {
  return createKartotekaBrowserClient({
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  })
}
```

## 4. Workspace-függőségi gráf

```
apps/web         → @kartoteka/supabase-client (symlink → packages/supabase-client)
apps/desktop     → @kartoteka/supabase-client (symlink → packages/supabase-client)
packages/supabase-client
                 → @supabase/ssr ^0.10.0
                 → @supabase/supabase-js ^2.101.1
```

A `package.json` dependency-kben:
- `apps/web`: `"@kartoteka/supabase-client": "*"`
- `apps/desktop`: `"@kartoteka/supabase-client": "*"`
- `packages/supabase-client`: a saját `package.json` v0.1.0

Az `*` wildcard npm workspaces-sel automatikusan a helyi csomagra link-el.

## 5. Verify

```bash
# 1. TypeScript check — mindhárom helyen
cd packages/supabase-client && npx tsc --noEmit  # 0 hiba
cd ../../apps/web && npx tsc --noEmit            # 0 hiba
cd ../desktop && npx tsc --noEmit                # 0 hiba

# 2. Workspace link
ls node_modules/@kartoteka/
# design-tokens  desktop  schema-types  supabase-client  ui  web

# 3. Web dev-szerver
cd ../..
npm run dev
# ✓ Ready in 453ms, Environments: .env.local
```

## 6. Desktop-env beállítás (Endre-nek)

Ahhoz, hogy az `apps/desktop/src/lib/supabase.ts`-t valóban használni tudd, létre kell hoznod egy `apps/desktop/.env` fájlt:

```bash
cd apps/desktop
cp .env.example .env
# Majd szerkeszd — a VITE_SUPABASE_URL és a VITE_SUPABASE_ANON_KEY értékeket
# add meg. Ugyanazok, mint az apps/web/.env.local-ban.
```

**Ezt még NEM kötelező megtenni** — az M1.3 desktop-oldala csak előkészítés. Az M1.5-ben (auth flow) fogjuk először ténylegesen hívni a `getDesktopSupabase()`-t.

## 7. Miért paraméterként kapja a config-ot (és nem env-ből olvas)?

A TypeScript + Vite környezetben a `import.meta.env` csak **build-időben** értelmezett (Vite statikusan inline-olja). Node.js server-oldalon ez szintaktikusan hibát dobhat.

A Next.js viszont `process.env`-et használ — a `import.meta.env` nem működik.

Megoldások:
- **A)** Két külön factory (`createBrowserClientFromNextEnv` + `createBrowserClientFromViteEnv`) — fölösleges duplikáció
- **B)** Tryoljuk mindkettőt — `import.meta.env` miatt a Next.js build-je figyelmeztet/hibázik
- **C)** ✅ **Paraméterként kapjuk** — a csomag nem tud a környezetről, a caller intézi

A C-t választottuk — ez a legtisztább, és a **tesztelhetőséget** is növeli (unit tesztben tetszőleges URL-t adhatsz át).

## 8. Biztonsági megjegyzések

- **Csak az anon kulcs** jár a közös csomagnak — **sosem** a service_role. A service_role admin-jogokat ad, megkerüli az RLS-t, és **csak server-oldalon** futhat (Next.js server actions).
- A `@kartoteka/supabase-client` soha nem tartalmaz `SUPABASE_SERVICE_ROLE_KEY`-et olvasó kódot. Aki a desktop-ba beleírná: **ne tegye!**
- Az anon kulcs publikus (a böngészőben amúgy is látható a Network-tabon), de RLS-szel védve a DB.

## 9. Mit NEM csináltunk (scope-határok)

- ❌ Server-oldali kliens (SSR) kiemelés — nem is lehet, Next.js-specifikus
- ❌ Admin client (service_role) — csak server-oldalon
- ❌ `Database` típusok generálása — M1.5 task
- ❌ Auth flow (sign in, sign out, OAuth) — M1.5
- ❌ Desktop-specifikus auth (OAuth deep-link) — M1.5
- ❌ `apps/desktop/.env` létrehozása — Endre kézi lépése (nem commit-olható)

---

**Végállapot**:
- `packages/supabase-client` v0.1.0 — ~70 sor TS, 3 exports, 0 env-olvasás
- `apps/web/lib/supabase/client.ts` refaktor — 15 soros wrapper
- `apps/desktop/src/lib/supabase.ts` új — lazy-init singleton
- 0 TypeScript hiba sehol
- Web dev-szerver indul, minden működik
- Következő: **M1.4** — közös `@kartoteka/ui` csomag (shadcn-alapú komponensek)
