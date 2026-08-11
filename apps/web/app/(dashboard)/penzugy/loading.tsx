import { RouteLoadingScreen } from '@/components/layout/route-loading-screen'

/**
 * A /penzugy fő route betöltő-állapota.
 *
 * 2026-08-11 (user-észrevétel: „A pénzügyi betöltő oldal hasonló legyen mint a
 * többi oldalnál!"): eddig EGYEDÜLI kivételként a `FinanceLoadingState`-et
 * használta, miközben mind a 10 többi modul — az Irányítópult, Tagnyilvántartás,
 * Anyakönyv, Leltár, Sírhelyek, Jegyzőkönyvek, Admin, sőt a Pénzügy SAJÁT
 * Befizetés/Kiadás alroutejai is — a közös `RouteLoadingScreen`-t. Modult váltva
 * ezért egy pillanatra más arculat villant fel, mintha másik alkalmazás töltene.
 *
 * (Előzmény: 2026-07-11 S6-#2 — a lényeg akkor az volt, hogy egyáltalán LEGYEN
 * visszajelzés év-váltásnál; a komponens megválasztása mellékes volt.)
 */
export default function Loading() {
  return <RouteLoadingScreen module="Pénzügy" />
}
