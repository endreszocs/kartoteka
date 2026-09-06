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
// 2026-09-05 (P3-utómunka): az ÉVES PROGRAMTERV DOM-mentes építője a barrelből
// is elérhető — a desktop ugyanezt hívja. TISZTA modul (nincs hook, nincs
// böngésző-API, nincs import), ezért 'use client' nélkül is deploy-biztos.
// A web mély importtal hívja (@kartoteka/ui-app/src/dashboard/eves-naptar-print)
// — az is marad. A névsor szándékosan a NYILVÁNOS felület: a belső segédek
// (esc, ymdUTC, hetNapja, honapNapjai, HU_*) nem kerülnek a barrelbe, hogy az
// `export *`-os gyökér-index más moduljaival ne ütközzenek.
export {
  buildEvesNaptar,
  EVES_NAPTAR_HASAB_KAPACITAS,
  EVES_NAPTAR_HASAB_PER_LAP,
  type EvesNaptarElofordulas,
  type EvesNaptarTipusMeta,
  type EvesNaptarUnnep,
  type EvesNaptarAnyakonyv,
  type EvesNaptarSzuletesnap,
  type EvesNaptarNevnap,
  type EvesNaptarRetegek,
  type EvesNaptarValtozat,
  type EvesNaptarKapcsolok,
  type EvesNaptarInput,
  type EvesNaptarEredmeny,
} from './eves-naptar-print'
