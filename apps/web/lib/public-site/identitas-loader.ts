import { createPublicServerClient } from '@/lib/supabase/public-server'
import type { PublicIdentitas } from './identitas-shared'

export type { PublicIdentitas } from './identitas-shared'
export { ketNyelvenMegjelenitve } from './identitas-shared'

/** Üres/whitespace szöveg = nincs érték. */
function nemUres(ertek: unknown): string | null {
  const trimmelt = typeof ertek === 'string' ? ertek.trim() : ''
  return trimmelt ? trimmelt : null
}

/**
 * A gyülekezet hivatalos, KÉTNYELVŰ azonosító adatai (2026-08-27).
 *
 * Endre kérése: „az elérhetőségek az a gyülekezet román és magyar
 * megnevezése, a pontos cím két nyelven, a gyülekezeti e-mail és
 * telefonszám" + „lehet-e esetleg az egyházmegyét és a kerületet is".
 *
 * ⚠️ AMI HIÁNYZIK, AZT NEM TALÁLJUK KI. Az éles felmérés szerint az
 * egyházmegye és az egyházkerület ROMÁN neve nincs kitöltve. Egy hivatalos
 * egyházi megnevezésnek pontos alakja van — egy kitalált fordítás rosszabb,
 * mint a hiánya. Ahol nincs román név, ott a magyar áll egyedül. (Ugyanez az
 * elv él a leltári nyomtatványoknál: `entitasNevEgyNyelven`.)
 *
 * ⚠️ HIÁNYZÓ RPC = NÉMA TARTALÉK: a migráció a frontend UTÁN is telepíthető.
 * Ilyenkor `null` jön, és az elérhetőség-blokk a korábbi, egynyelvű alakjában
 * jelenik meg — nem hibázik és nem is hazudik.
 */
export async function loadPublicIdentitas(slug: string): Promise<PublicIdentitas | null> {
  const supabase = createPublicServerClient()
  const { data, error } = await supabase
    .rpc('public_site_identitas', { p_slug: slug })
    .maybeSingle()

  if (error || !data) return null

  const sor = data as Record<string, unknown>
  return {
    nev_hu: nemUres(sor.nev_hu),
    nev_ro: nemUres(sor.nev_ro),
    cim_hu: nemUres(sor.cim_hu),
    cim_ro: nemUres(sor.cim_ro),
    email: nemUres(sor.email),
    telefon: nemUres(sor.telefon),
    egyhazmegye_hu: nemUres(sor.egyhazmegye_hu),
    egyhazmegye_ro: nemUres(sor.egyhazmegye_ro),
    egyhazkerulet_hu: nemUres(sor.egyhazkerulet_hu),
    egyhazkerulet_ro: nemUres(sor.egyhazkerulet_ro),
  }
}

