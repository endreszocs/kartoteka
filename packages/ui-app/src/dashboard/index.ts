/**
 * Dashboard-modul barrel (2026-06-12, Endre #5 — dashboard-paritás).
 *
 * A régebbi dashboard-komponenseket (HeroBannerScripture, KpiCards, BottomStats,
 * Celebrations, RecentActivity, UpcomingPrograms, AgeDistribution) a fő
 * `packages/ui-app/src/index.ts` fájlonként exportálja — azok itt NEM
 * szerepelnek újra (duplikált `export *` név-ütközést okozna).
 * Az ÚJ dashboard-fájlok ezen a barrel-en át jutnak ki.
 */

export * from './BirthdayListDialog'
