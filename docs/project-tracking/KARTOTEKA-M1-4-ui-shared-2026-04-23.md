# M1.4 teljesítési jelentés — Közös @kartoteka/ui komponens-könyvtár

**Dátum**: 2026-04-23
**Fázis**: M1.4 — közös shadcn-komponens csomag
**Kódolási ciklus**: ~40 perc (13 fájl mozgatás + import-fix + tsconfig + verify)
**Státusz**: ✅ KÉSZ, tsc 0 hiba, web dev GET /login 200
**Branch**: `feat/m1-1-monorepo`

---

## 1. Vezetői összefoglaló

Az M1.4 a harmadik közös csomag a monorepóban (M1.1 struktúra, M1.3 Supabase-kliens, **M1.4 UI**).
**Strukturális** refaktor — 0 funkcionális változás, 0 kód-módosítás a hívó-oldalon.

**13 alapkomponenst** emeltünk ki a `apps/web/components/ui/`-ból egy közös `packages/ui/` csomagba,
hogy a Tauri desktop kliens ugyanazt használja. A meglévő `@/components/ui/button` stílusú
importok **változatlanul működnek** egy `tsconfig.json` paths alias-nak köszönhetően.

**Tailwind 4 integráció**: egy `@source` direktíva a globals.css-ben biztosítja, hogy a JIT scanner
a közös csomag TSX fájlait is megnézze és a szükséges utility class-okat generálja.

---

## 2. Mit mozgattunk, mit nem

### Áthelyezett — `packages/ui/src/components/` (13 komponens)

| Fájl | Függőségek | Megjegyzés |
|---|---|---|
| avatar.tsx | @base-ui/react | cn → `../lib/utils` |
| badge.tsx | cva | cn → `../lib/utils` |
| button.tsx | @base-ui/react, cva | cn → `../lib/utils` |
| card.tsx | — | cn → `../lib/utils` |
| dialog.tsx | @base-ui/react, lucide-react | Button-import: `@/components/ui/button` → `./button` |
| dropdown-menu.tsx | @base-ui/react, lucide-react | cn → `../lib/utils` |
| input.tsx | — | cn → `../lib/utils` |
| label.tsx | @base-ui/react | cn → `../lib/utils` |
| select.tsx | @base-ui/react, lucide-react | cn → `../lib/utils` |
| separator.tsx | — | cn → `../lib/utils` |
| sheet.tsx | @base-ui/react, lucide-react | Button-import: `@/components/ui/button` → `./button` |
| tabs.tsx | @base-ui/react, cva | cn → `../lib/utils` |
| textarea.tsx | — | cn → `../lib/utils` |

### Maradt — `apps/web/components/ui/` (7 projekt-specifikus)

| Fájl | Miért marad |
|---|---|
| address-form.tsx | Romániai cím-hierarchia, web-specifikus actions (`@/lib/address/*`) |
| color-tabs.tsx | Projekt-specifikus `card-raised` custom CSS class, nincs shadcn-minta |
| help-tooltip.tsx | `next/link` import — Next.js-specifikus |
| modal-field.tsx | Projekt-specifikus magyar label+required |
| searchable-category-select.tsx | Projekt-specifikus pénzügyi kategória-kereső |
| splash-screen.tsx | Magyar kezdő splash — Next.js-specifikus |
| sonner.tsx | `next-themes` import — Next.js-specifikus |

### Helpers — `packages/ui/src/lib/utils.ts`

Az összes komponens használja a `cn()` helper-t (clsx + tailwind-merge). Ez is közös.

## 3. A csomag struktúrája

```
packages/ui/
├── package.json          @kartoteka/ui v0.1.0
├── tsconfig.json
└── src/
    ├── index.ts          — barrel: export * from './components/*' + cn
    ├── lib/
    │   └── utils.ts      — cn() helper
    └── components/
        ├── avatar.tsx
        ├── badge.tsx
        ├── button.tsx
        ├── card.tsx
        ├── dialog.tsx
        ├── dropdown-menu.tsx
        ├── input.tsx
        ├── label.tsx
        ├── select.tsx
        ├── separator.tsx
        ├── sheet.tsx
        ├── tabs.tsx
        └── textarea.tsx
```

## 4. Kompatibilitás a régi kóddal

**Az `apps/web/` meglévő 15+ fájlja nulla változtatás nélkül működik tovább**:

### a) `tsconfig.json` paths alias

```jsonc
"paths": {
  "@/components/ui/avatar":        ["../../packages/ui/src/components/avatar"],
  "@/components/ui/badge":         ["../../packages/ui/src/components/badge"],
  // ... 13 sor a 13 átemelt komponensre
  "@/*":                           ["./*"]   // minden más: apps/web-en belül
}
```

A TypeScript a **specifikus** match-et választja a wildcard előtt. Így:
- `@/components/ui/button` → `packages/ui/src/components/button.tsx` ✓ közös
- `@/components/ui/address-form` → `apps/web/components/ui/address-form.tsx` (wildcard → apps/web)
- `@/lib/auth/session` → `apps/web/lib/auth/session.ts` (wildcard)

### b) `apps/web/lib/utils.ts` — re-export

```ts
export { cn } from '@kartoteka/ui'
```

Egy sor — `@/lib/utils`-ra való minden meglévő import automatikusan a közös csomagot találja.

### c) `apps/web/package.json` — dependency

```json
"@kartoteka/ui": "*"
```

Az npm workspaces a `*` wildcard-dal a helyi csomagra link-el.

## 5. Tailwind CSS 4 integráció

A Tailwind 4 a CSS-first configot használja. A JIT scanner csak azokat a fájlokat látja, amiket az
`@source` direktívák explicit engedélyeznek.

Az `apps/web/app/globals.css`-be hozzáadva:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

/* M1.4 — a `@kartoteka/ui` közös komponenseket is scannelje a Tailwind JIT. */
@source "../../../packages/ui/src";
```

Három `..`: `app/globals.css` → `apps/web/` → `apps/` → `KARTOTEKA/` → `packages/ui/src`.

Ezzel a scanner lát minden osztály-használatot a `packages/ui/src`-ben, és a generált CSS
tartalmazza mindet.

## 6. Belső import-javítás a `packages/ui`-ban

Két komponens (`dialog.tsx` és `sheet.tsx`) a saját csomagon belül hivatkozott a Button-re
— eredetileg `@/components/ui/button`-al, ami csak apps/web-ben volt érvényes alias. A
csomagban relatív útra változtatva:

```ts
// dialog.tsx / sheet.tsx
import { Button } from "./button"   // volt: @/components/ui/button
```

## 7. Verify

```bash
# 1. Csomag tsc
cd packages/ui && npx tsc --noEmit   # 0 hiba

# 2. Web tsc
cd ../../apps/web && npx tsc --noEmit   # 0 hiba

# 3. Dev-szerver
cd ../..
npm run dev
# ✓ Ready in 357ms, Environments: .env.local

# 4. Login oldal GET
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
# 200
```

## 8. Mit NEM csináltunk (scope-határok)

- ❌ **Desktop oldali Tailwind setup** — M1.5 task. Jelenleg a Tauri desktop
  még semmi UI-t nem renderel (placeholder `App.tsx`), a közös UI csak a web-ben
  van éles használatban.
- ❌ `@kartoteka/design-tokens` feltöltés — M1.5 task (ott kerülnek bele
  a közös CSS változók)
- ❌ Projekt-specifikus komponensek (modal-field, address-form stb.) közös
  csomagba emelése — ezek web-specifikusak, külön csomag csak ha a desktopnak
  is kell belőlük
- ❌ `sonner.tsx` közös csomagba emelése — `next-themes` miatt Next-only.
  Lehetne egy theme-agnostic wrapper M1.5-ben
- ❌ Storybook / komponens-doc — M5 előkészítés
- ❌ Export mode: az `index.ts` egyetlen barrel, nincs per-komponens entry point.
  Ha tree-shaking-gond lesz (M5 bundle-méret), akkor érdemes lesz feltenni
  külön exports a `package.json`-ba.

---

**Végállapot**:
- `packages/ui` v0.1.0 — 13 komponens + cn(), ~400 sor TSX/TS
- 0 TypeScript hiba sehol a monorepóban
- GET /login → 200 OK, 45 KB
- Következő: **M1.5** — közös design-tokenek + apps/desktop valódi UI (login képernyő)
