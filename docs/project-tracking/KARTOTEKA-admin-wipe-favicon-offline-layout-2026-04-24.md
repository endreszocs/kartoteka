# KARTOTEKA — Admin wipe + favicon V3 + /offline dobozos + web-desktop parity szabály

**Dátum**: 2026-04-24 (este)
**Fázis**: polish + új feature (4-in-1 user-kérés)
**Státusz**: ✅ KÉSZ

## Összefoglaló

A lelkész 4 feladatot jelzett:

1. **Favicon**: az éles `kartotekaweb-production.up.railway.app` a Kartotéka V3 ikont mutassa
2. **`/offline` layout**: legyen dobozos, ne minden egymás alatt
3. **Web–desktop paritás szabály** — **MEMÓRIÁBA MENTVE**: ha egy módosítás érint mindkettőt, egyszerre frissüljön
4. **Admin „gyülekezeti adatok törlése" gomb** — tiszta lap a teszt-fázis után éles indulás előtt

Mind lezárva.

## 1. Favicon — KARTOTEKA V3

### Változás

- `apps/web/app/icon.png` → KARTOTEKA_V3.png (a Next.js App Router file-convention)
- `apps/web/app/apple-icon.png` → KARTOTEKA_V3.png (új fájl, Apple touch icon)
- `apps/web/app/favicon.ico` → **törölve** (hibás PNG-as ICO volt, zavart böngésző-cache)
- `apps/web/app/icon-v2-backup.png` → **törölve** (felesleges backup)
- `apps/web/public/kartoteka-icon.png` → KARTOTEKA_V3.png (PWA manifest forrása)
- `apps/web/app/layout.tsx` — az explicit `icons: { icon: '/EREK.png' }` metadata blokk eltávolítva; a Next.js automatikusan a convention-re támaszkodik
- `apps/web/public/manifest.json` — minden icon-URL-t `/kartoteka-icon.png`-re cseréltem (korábban `/EREK.png`-re mutattak)

### Hatás

Railway deploy után a `/favicon` és `/icon` automatikusan a V3-at szolgálja ki. A lelkész böngésző-cache-tisztítással látja azonnal, különben 1-2 nap után a CDN-frissülés után.

## 2. `/offline` dobozos layout

### Változás

Előző állapot: minden egymás alatt (hero → DesktopDownloadCard → BrowserOfflineCard → diagnosztika link).

Új szerkezet:

```
┌──────────────────────────────────────────┐
│   ModuleHero (teljes szélesség)          │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│   DesktopDownloadCard (hangsúlyos CTA)   │
└──────────────────────────────────────────┘
┌────────────────────┬──────────────────────┐
│                    │  HelpResourcesCard   │
│  BrowserOfflineCard│  (segédanyagok)      │
│                    ├──────────────────────┤
│                    │  DiagnosticsLink     │
│                    │  (admin-only)        │
└────────────────────┴──────────────────────┘
```

A `grid lg:grid-cols-2` mobile-first — kisebb képernyőn egymás alatt, nagyobbon mellette.

Új komponensek a page-en belül (nem külön fájlban): `HelpResourcesCard` (segédanyagok 3 ponttal) + `DiagnosticsLinkCard` (a meglévő admin link új dizájnnal).

## 3. Web–desktop paritás szabály

### Memória-bejegyzés

Új fájl: [`memory/feedback_web_desktop_parity.md`](memory/feedback_web_desktop_parity.md) — **ALAPELV**: ha egy módosítás logikailag érinti mindkét platformot (web + Tauri desktop), mindkettőt együtt frissíteni kell.

Listázza:
- **Mikor érintett mindkettő**: shared packages (core/validations/ui), új mező a sémán, új flag, új use-case, új API-endpoint
- **Mikor nem kell sync**: webapp-specifikus UI-polish, desktop-specifikus Rust/Tauri mechanika, admin-felület
- **Ellenőrző kérdés**: "Ha ezt a webhez tettem, a desktop lelkésze érezni fogja-e a hiányt?"
- **Dokumentálás**: CHANGELOG `<!-- targets: ... -->` explicit jelezze

A `MEMORY.md` index is frissítve a mutatóval.

## 4. Admin „gyülekezeti adatok törlése" — tiszta lap

### Cél

A lelkész a teszt-fázis során sok fiktív adatot vitt be. Éles használat előtt tiszta lappal szeretne indulni. A funkció:

- **Megtartja**: a gyülekezet alapadatait (`congregations`), a felhasználók profiljait és hozzárendeléseit, előfizetési/tagdíj-konfigokat
- **Törli**: minden `congregation_id`-ra szűrt sor (tagok, családok, pénzügyi tranzakciók, munkanapló, anyakönyv, leltár, jegyzőkönyvek, bankszámlák, stb.)

### SQL RPC: `public.wipe_congregation_data(UUID, TEXT)`

**Fájl**: [`migration-docs/sql/2026-04-24-admin-wipe-congregation-data.sql`](migration-docs/sql/2026-04-24-admin-wipe-congregation-data.sql)

Védelmi rétegek:

1. **SECURITY DEFINER** + role-check: csak `admin`/`egyhazkeruleti_admin`/`egyhazmegyei_admin` hívhatja
2. **Scope-check**: admin globális, a többi csak a saját (profile_congregations vagy profiles.congregation_id fallback)
3. **Confirm-név**: a hívónak be kell írnia a gyülekezet pontos nevét (`nev_hu` vagy `name`)
4. **Audit-log**: új `data_wipe_log` tábla (RLS-védett) — minden wipe-művelet egy új sort kap

**Működés**:

```sql
-- Először: gyerek + csalad (ezekben nincs congregation_id direkt)
DELETE FROM gyerek WHERE id_szemely IN (...) OR id_csalad IN (...);
DELETE FROM csalad WHERE id_ferfi IN (...) OR id_no IN (...);

-- Dinamikus loop: minden public.* tábla, ami congregation_id oszloppal rendelkezik,
-- kivéve a megtartandó halmaz
FOR rec IN SELECT table_name FROM information_schema.columns
           WHERE column_name = 'congregation_id'
             AND table_name NOT IN (keep_tables) LOOP
  EXECUTE format('DELETE FROM public.%I WHERE congregation_id = $1', rec.table_name)
    USING target_congregation_id;
END LOOP;

-- Utoljára: szemely
DELETE FROM szemely WHERE congregation_id = target_congregation_id;

-- Audit
INSERT INTO data_wipe_log (...);
```

**Megtartandó táblák** (explicit lista):

- `congregations`
- `profile_congregations` (user-hozzárendelések)
- `admin_access_requests`
- `congregation_subscriptions` (előfizetés)
- `congregation_annual_fees` (éves tagdíj)
- `congregation_custom_fees` (egyedi díjak)
- `data_wipe_log` (maga az audit)

**Returns**: `TABLE(deleted_table TEXT, rows_deleted BIGINT)` — a UI ebből listázza, melyik táblából mennyi sor tűnt el.

### Szerver-action: `wipe-actions.ts`

**Fájl**: [`apps/web/app/(dashboard)/admin/wipe-actions.ts`](apps/web/app/(dashboard)/admin/wipe-actions.ts)

- `wipeCongregationDataAction(congregationId, confirmName)` — RPC-hívás + hibaüzenet-honosítás
- `listRecentWipesAction(limit)` — jövőbeli history panelhez (admin log-olvasáshoz)
- Hiba-barátságosítás: pl. `'insufficient_privilege'` → "Csak admin szerepkör végezheti el…"
- `revalidatePath` több útvonalra (admin + tagnyilv + penzugy + munkanaplo)

### UI: `WipeCongregationPanel` + `DataWipeTab`

**Fájlok**:
- [`apps/web/components/admin/wipe-congregation-panel.tsx`](apps/web/components/admin/wipe-congregation-panel.tsx) (~230 sor)
- [`apps/web/components/admin/data-wipe-tab.tsx`](apps/web/components/admin/data-wipe-tab.tsx) (~90 sor)

**2-szintű megerősítés**:
1. Gyülekezet-dropdown választás
2. Név-begépelés (a gomb csak pontos egyezésre aktív)
3. Browser `confirm()` a végső "BIZTOS, hogy törlöd…"-ra
4. Szerver-oldali RPC még egyszer ellenőrzi mindent

**Pasztorális UX**:
- Piros háttér (border-rose-300)
- Két lista: "Ami megmarad" vs "Ami törlődik" (uppercase-underline)
- A név-input alatt hint: `Elvárt: <pontos név>`
- Kétnyelvű gomb: "Törlés folyamatban…" spinner-rel
- Eredmény-panel: zöld sikerkép + részletek expandable (`<details>`) a törölt táblák listájával

### Admin integráció

Az `AdminTabsV3` bővítve:
- Új tab `{ value: 'data-wipe', label: 'Veszélyes zóna', color: 'red' }` a tab-listán utolsóként
- `<TabsContent value="data-wipe">` az új `DataWipeTab`-bal

**Hozzáférés**: a `/admin` oldal `isMasterAdmin(user.email)` check-je szűr — tehát csak master user látja a tabbot. A szerver-oldali RPC a role-check alapján enged minden admin-szintűnek (nem csak master). Ha később más admin-oknak is meg akarjuk mutatni a tabbot, a page-check-et kell lazítani.

## Futtatás (Endre teendői)

1. **SQL**: [`migration-docs/sql/2026-04-24-admin-wipe-congregation-data.sql`](migration-docs/sql/2026-04-24-admin-wipe-congregation-data.sql) futtatása Supabase SQL editorban
2. **Favicon-cache frissítés**: a böngésző-cache-t tisztítani, különben a régi `/EREK.png` maradhat
3. **Wipe-próba**: az admin oldalon → "Veszélyes zóna" tab → egy teszt-gyülekezet kiválasztása → név-begépelés → "Végleges törlés" → ellenőrzés, hogy a tagok/pénzügy/munkanapló valóban eltűnt

## Fájlváltoztatások

### Új

- `memory/feedback_web_desktop_parity.md` — parity ALAPELV
- `apps/web/app/apple-icon.png` — KARTOTEKA V3
- `apps/web/components/offline/browser-offline-card.tsx` — (már korábbi, layoutra bővítve)
- `migration-docs/sql/2026-04-24-admin-wipe-congregation-data.sql` — RPC + audit-log
- `apps/web/app/(dashboard)/admin/wipe-actions.ts` — server action
- `apps/web/components/admin/wipe-congregation-panel.tsx` — 2-szintű megerősítés
- `apps/web/components/admin/data-wipe-tab.tsx` — congregation-fetch + WipeCongregationPanel wrapper
- `docs/project-tracking/KARTOTEKA-admin-wipe-favicon-offline-layout-2026-04-24.md`

### Módosított

- `apps/web/app/icon.png` — V3-ra csere
- `apps/web/public/kartoteka-icon.png` — V3-ra csere
- `apps/web/public/manifest.json` — minden icon-URL `/kartoteka-icon.png`-re
- `apps/web/app/layout.tsx` — explicit `icons` metadata-blokk eltávolítva
- `apps/web/app/(dashboard)/offline/page.tsx` — dobozos grid layout (+`HelpResourcesCard` inline)
- `apps/web/components/admin/admin-tabs-v3.tsx` — új "Veszélyes zóna" tab
- `memory/MEMORY.md` — parity-szabály mutató
- `docs/CHANGELOG.md` — 2026-04-24 esti bejegyzés

### Törölve

- `apps/web/app/favicon.ico` — hibás PNG-as ICO
- `apps/web/app/icon-v2-backup.png` — felesleges backup
