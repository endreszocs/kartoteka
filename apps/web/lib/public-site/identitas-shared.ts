/**
 * A gyülekezet hivatalos, KÉTNYELVŰ azonosító adatai — TÍPUS és TISZTA
 * FÜGGVÉNYEK (2026-08-27).
 *
 * ⚠️ MIÉRT KÜLÖN FÁJL: a betöltő (`identitas-loader.ts`) szerver-oldali
 * Supabase-klienst importál (`server-only`). Ha a megjelenítő komponens onnan
 * venné a TÍPUST vagy a tiszta segédfüggvényt, az egész szerver-modult
 * magával rántaná — és a build elszáll: „You're importing a module that
 * depends on server-only". Ez a ház bevett szabálya: típus és konstans külön
 * `*-shared.ts` fájlba.
 */

export interface PublicIdentitas {
  nev_hu: string | null
  nev_ro: string | null
  cim_hu: string | null
  cim_ro: string | null
  email: string | null
  telefon: string | null
  egyhazmegye_hu: string | null
  egyhazmegye_ro: string | null
  egyhazkerulet_hu: string | null
  egyhazkerulet_ro: string | null
}

/**
 * Két nyelvi változat megjelenítendő alakja.
 *
 * ⚠️ HÁROM eset, és mindhárom FONTOS:
 *   · mindkettő megvan és KÜLÖNBÖZIK → mindkettőt mutatjuk
 *   · mindkettő megvan, de AZONOS    → egyszer mutatjuk (nem ismételjük)
 *   · csak az egyik van meg           → azt mutatjuk EGYEDÜL, jelölés nélkül
 * Sosem írunk oda „hiányzik" feliratot: egy gyülekezet hivatalos oldalán a
 * hiány nem hibaüzenet.
 */
export function ketNyelvenMegjelenitve(
  hu: string | null,
  ro: string | null,
): { elsodleges: string; masodlagos: string | null } | null {
  if (!hu && !ro) return null
  if (hu && ro && hu !== ro) return { elsodleges: hu, masodlagos: ro }
  return { elsodleges: (hu || ro) as string, masodlagos: null }
}
