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
 * Későbbi hullámok (2026-04-25u):
 *   - members/      — member-form-dialog, member-detail-dialog
 *   - families/     — family-form-dialog, family-detail-dialog
 *   - finance/      — 50+ finance-modál és tab
 *   - dashboard/    — StatCard, dashboard-tabok
 *   - …
 */

export * from './layout/PageHero'
// 2026-06-10 (B-hullám): közös színes tab-sor (web ⇄ desktop azonos tab-bar)
export * from './layout/ColorTabs'
export * from './form/ModalField'
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
