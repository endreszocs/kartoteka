/**
 * @kartoteka/ui-app — alkalmazás-szintű React komponens-könyvtár.
 *
 * 1. hullám (2026-04-25): UI-paritás alapozás. Az új alapelv (web–desktop
 * 100% közös codebase) szerint az itt definiált komponenseket a web és a
 * desktop egyaránt importálja — egy UI két csomagolásban.
 *
 * Mappák:
 *   - layout/       — oldal-szintű layout-elemek (PageHero, …)
 *   - form/         — domain-szintű form-primitívek (ModalField, …)
 *   - indicators/   — globális státusz-jelzők (SessionStatusBadge, SyncStatusBadge)
 *
 * Szabályok:
 *   - minden komponens kliens-oldali ('use client' kötelező)
 *   - adat-fetch NEM ide való — props-szal kapja a komponens
 *   - UI primitív @kartoteka/ui-ből (Button, Input, Dialog, cn, …)
 *   - reszponzív kötelező: mobil + tablet + desktop
 *
 * Jelenlegi tartalom (2026-07-24 frissítve — a korábbi komment félrevezetett):
 *   - members/      — MemberAvatar, FamilyCardModern, AvatarEditorBody,
 *                     family-card-print, social-avatar (a member-form/detail
 *                     dialógusok NEM közösek: web és desktop külön implementál)
 *   - finance/      — finance-modálok és tabok
 *   - dashboard/    — StatCard, dashboard-tabok, BirthdayListDialog
 *   - layout/       — PageHero, ColorTabs, …
 */

export * from './layout/PageHero'
// 2026-06-10 (B-hullám): közös színes tab-sor (web ⇄ desktop azonos tab-bar)
export * from './layout/ColorTabs'
export * from './form/ModalField'
// 2026-08-11 (K5-#12): közös indoklás-bekérő dialógus a `window.prompt` helyett
// (a natív prompt mobilon egysoros, Firefoxban letiltható → néma elérhetetlenség).
export * from './form/ReasonPromptDialog'
// 2026-08-15 (Endre 4. szakasz): EGYSÉGES véglegesítés-gomb mind a 6 irat-típushoz
// (számadás, költségvetés, módosítás, vagyonleltár, választók, lelkészi jelentés).
export * from './shared/FinalizeButton'
// Sprint R · Vizuális megújulás (v0.8.1) — téma-választó réteg
export * from './theme'
// Sprint R · Vizuális megújulás (v0.8.2) — Missziós Műhely home
export * from './missziosmuhely'
// Sprint R · Vizuális megújulás (v0.8.3) — mikro-interakciók
export * from './loading'
// Sprint R · Vizuális megújulás (v0.8.4) — onboarding wizard (csak web)
export * from './onboarding'
// Sprint R · Vizuális megújulás (v0.8.5) — Telepítő wizard UI (preview)
export * from './installer'
export * from './indicators/SessionStatusBadge'
export * from './indicators/SyncStatusBadge'
export * from './indicators/OnlineStatePill'
// 2026-06-12 (Endre #5 — dashboard-paritás): új dashboard-fájlok a barrel-en át
export * from './dashboard'
export * from './dashboard/HeroBannerScripture'
export * from './dashboard/KpiCards'
export * from './dashboard/BottomStats'
export * from './dashboard/Celebrations'
export * from './dashboard/RecentActivity'
export * from './dashboard/UpcomingPrograms'
export * from './dashboard/AgeDistribution'

// Pénzügyi modul közös réteg (Sprint Q Fázis 1, 2026-04-25)
// Web és desktop egyaránt INNEN importál minden finance-típust és helpert.
export * from './finance'
// Tagnyilvántartás közös darabjai (D-hullám, 2026-06-11): avatar + családi kártya + karton-print
export * from './members'
// Kuka közös rétege (2026-08-15, desktop-paritás 3. szelet): visszaszámláló,
// címkék, táblalista + RecycleBinBody — a web és a desktop Kuka EGY felület.
export * from './recycle-bin'
// Leltár közös rétege (2026-08-15, desktop-paritás 4. szelet): kategóriák,
// érték-számítás, kétnyelvű fisa-builder, mentés-szabályok — web ⇄ desktop
// egy forrásból (a webes lib/constants/inventory.next.ts innen re-exportál).
export * from './inventory'
// Munkanapló közös rétege (2026-08-15, desktop-paritás 4. szelet): a hivatalos
// Katekézis + Családlátogatás naplólapok (kis naplók) és a nyomtatvány-keret.
export * from './worklog'
