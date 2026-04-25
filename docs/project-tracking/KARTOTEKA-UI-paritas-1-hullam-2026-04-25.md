# UI-paritás 1. hullám — `packages/ui-app` alapozás

**Dátum**: 2026-04-25
**Fázis**: UI-paritás 1. hullám — közös domain-szintű komponens-réteg
**Kódolási ciklus**: ~40 perc (4 új komponens, 7 desktop oldal import-csere, 2 indicator-wrapper refaktor, 1 web re-export)
**Státusz**: ✅ KÉSZ — TS-ellenőrzés Endre futtatja
**Alapelv-forrás**: új `feedback_web_desktop_parity.md` (2026-04-25 frissítés) — *„egy UI két csomagolásban"*

---

## 1. Vezetői összefoglaló

Új ALAPELV (2026-04-25): **a webapplikáció és a desktop UI 100%-ban egyezzen meg**. Egy közös frontend codebase, egy design rendszer, ugyanazok a komponensek, tokenek és layout. Nem külön webes és desktop UI, hanem egy UI két csomagolásban — a desktop a webes felület csomagolt változata, vizuális eltérés nélkül.

Az 1. hullám az **alapozás**: feltöltöttük a `packages/ui-app` domain-szintű réteget az első közös komponensekkel, és lecseréltük a desktop oldalak duplikációit. **0 funkcionális változás** a felhasználó számára (refaktor), de strukturálisan ettől kezdve az új komponensek **csak közös rétegbe kerülhetnek**.

---

## 2. Mit migráltunk

### Új fájlok — `packages/ui-app/src/`

| Fájl | Réteg | Forrás | Indok |
|---|---|---|---|
| `layout/PageHero.tsx` | layout | `apps/desktop/src/components/page-hero.tsx` | 7 desktop oldalon használt prémium fejléc — webes oldalakra is alkalmazandó |
| `form/ModalField.tsx` | form | `apps/web/components/ui/modal-field.tsx` | 22 web modal/dialog használja (303 előfordulás) — desktop modálok is használhatják |
| `indicators/SessionStatusBadge.tsx` | indicators | `apps/desktop/src/components/session-status-indicator.tsx` (UI része) | Pure UI, props alapján vezérelt: `tone`, `label`, `isOnline` |
| `indicators/SyncStatusBadge.tsx` | indicators | `apps/desktop/src/components/sync-status-indicator.tsx` (UI része) | Pure UI: `pending`, `conflict`, `onClick` — a logika a wrapperben marad |

`packages/ui-app/src/index.ts` — barrel-export az új komponensekre + dokumentált mappa-szabályok (layout / form / indicators / members / families / finance / dashboard).

### Refaktorált fájlok

| Fájl | Mi változott |
|---|---|
| `apps/desktop/src/components/session-status-indicator.tsx` | Logika változatlan; render-réteg → `<SessionStatusBadge tone={info.tone} label={info.label} isOnline={info.kind === 'online'} />` |
| `apps/desktop/src/components/sync-status-indicator.tsx` | Logika változatlan; render-réteg → `<SyncStatusBadge pending conflict onClick />` |
| `apps/web/components/ui/modal-field.tsx` | Egyszerű re-export: `export { ModalField, type ModalFieldProps } from '@kartoteka/ui-app'`. A 22 használati hely import-útvonala változatlan, de az implementáció már a közös csomagban él. |

### Törölt fájl

- `apps/desktop/src/components/page-hero.tsx` — a 7 desktop oldal mostantól `@kartoteka/ui-app`-ból importálja.

### Módosított package.json-ek

- `apps/desktop/package.json` — új dep: `"@kartoteka/ui-app": "*"`
- `apps/web/package.json` — új dep: `"@kartoteka/ui-app": "*"`

### Átírt importok — 7 desktop oldal

`apps/desktop/src/pages/` alatt:

- `families-page.tsx`
- `belsomozgas-page.tsx`
- `kiadas-page.tsx`
- `befizetes-page.tsx`
- `chitanta-tombok-page.tsx`
- `bank-import-page.tsx`
- `chitanta-page.tsx`

`from '../components/page-hero'` → `from '@kartoteka/ui-app'`.

---

## 3. Architektúra: `packages/ui` vs `packages/ui-app`

| Csomag | Felelősség | Példák |
|---|---|---|
| `@kartoteka/ui` | **Primitívek** — design-system alap (shadcn-mintán, @base-ui/react primitíveken) | Button, Input, Dialog, Card, Tabs, cn() helper |
| `@kartoteka/ui-app` | **Domain-szintű** kompozíciók — több primitívet kombináló, projekt-specifikus, de platform-agnosztikus | PageHero, ModalField, SessionStatusBadge, SyncStatusBadge, később member/family form-ok, finance modálok, dashboard StatCard… |
| `apps/desktop`, `apps/web` | **Platform-csomagolás** — Tauri Rust integráció, Supabase-hookok, react-router/Next.js routing | session/sync indicator wrapperek (logika), Tauri SQLite hívások, Next.js RSC oldalak |

**Szabály**: új vizuális komponens **alapból `packages/ui-app`-ba kerül**, kivéve ha igazán platform-specifikus (pl. PIN-input, Tauri-tray-vezérlő, Next.js link-hook).

---

## 4. Hatás és kockázat

- **Funkcionális változás**: 0. A user a refaktor után pontosan ugyanazt látja, mint előtte.
- **TS-ellenőrzés**: a desktop és web `tsc --noEmit` futtatandó (Endre, mert a node-binary nincs PATH-ban a session shell-ben).
- **Build-tszt**: `npm run build --workspace=@kartoteka/web` és `npm run desktop:build`.
- **Visuális tszt**: PageHero render-jét összevetni az előtte-utána screenshot-tal a 7 desktop oldalon.
- **Backward compat**: a 22 web ModalField használati helye **változatlan import-útvonalat használ** (`@/components/ui/modal-field`), de már a közös csomag exportját kapja.
- **Kockázat**: minimális. Az új `@kartoteka/ui-app` workspace-package a root `node_modules/@kartoteka/`-ban már szim-linkelt — a két új dependency-deklaráció (desktop, web `package.json`) csak formális, nem új npm install kell hozzá. Ha mégis, `npm install` a monorepo gyökerében.

---

## 5. Hátralévő / következő lépések

### 1. hullám záró lépései (Endre):

1. `npm install` a monorepo gyökerében — ha a `@kartoteka/ui-app` szim-link még nem mind a 2 app `node_modules/`-jában van
2. `npm run build --workspace=@kartoteka/web` — webapp típusellenőrzés
3. `npm run desktop:build` — desktop bundle + Tauri build
4. Visuális screenshot-összevetés a desktop 7 oldalán

### 2. hullám (következő sprint):

- **member-form unified**: `apps/desktop/src/components/member-create-dialog.tsx` + `apps/web/components/modals/member-form-dialog.tsx` → `packages/ui-app/src/members/MemberFormDialog.tsx`
- **family-form unified**: `apps/desktop/src/components/csalad-form-dialog.tsx` + `apps/web/components/modals/family-form-dialog.tsx` → `packages/ui-app/src/families/FamilyFormDialog.tsx`
- **Web PageHero** alkalmazása a webes dashboard oldalakra (`/penzugy`, `/tagnyilvantartas`, stb.) — valódi paritás visszafelé is

### 3+ hullám (későbbi sprintek):

- members-page tábla → `packages/ui-app/src/members/MembersTable.tsx`
- StatCard, dashboard tabok → `packages/ui-app/src/dashboard/`
- 50+ finance modál (befizetés, kiadás, chitanță, oblio) hullámonként
- `packages/design-tokens` valódi feltöltése (most az index `export {}`)

---

## 6. Dokumentáció (3-réteg modell)

- **Operatív** (ez a fájl): `docs/project-tracking/KARTOTEKA-UI-paritas-1-hullam-2026-04-25.md` ✅
- **Strukturált / user-facing**: NEM kerül a `docs/CHANGELOG.md`-be — refaktor, nem user-facing változás. Majd a 2. hullám (web PageHero) UX-impactos része kerül CHANGELOG-ba.
- **Gondolati**: Notion → Kartotéka projekt → új napló-oldal: *„Egy UI két csomagolásban — packages/ui-app felépítése"* (Endre vezeti)

---

## 7. Memória-frissítések (ugyanezen a napon)

- `feedback_web_desktop_parity.md` — radikálisan átírva: *„ne hagyd lemaradni"* helyett *„építsd közösbe"*
- `feedback_obsidian_filozofia.md` → `feedback_notion_filozofia.md` — átalakítva, alapelvek átörökítve
- `feedback_changelog_mentes.md`, `feedback_dokumentalj_mindent.md` — Notion → Kartotéka projekt rögzítve
- `MEMORY.md` index frissítve

---

**Aláírás**: Claude (Opus 4.7, 1M context) Endrével együtt, 2026-04-25
