/**
 * Program-típusok — az ASZTALI alkalmazás saját konstans-forrása
 * (2026-09-05, P3-utómunka, desktop 2. fázis).
 *
 * MIÉRT VAN KÜLÖN FÁJL: a desktop NEM importálhat az `apps/web`-ből (a webes
 * `lib/constants/dashboard.ts` a kanonikus forrás). Ez a fájl CSAK azt tartja,
 * amit az asztali app maga OLVAS: a típus-listákat (21 típus: a 16 klasszikus +
 * a 2026-09-05-ös 5 új: tervezett anyakönyvi alkalmak + a lelkész szabadsága)
 * és a nyilvános-jelölés szabályát. A címke/emoji/szín térképek SZÁNDÉKOSAN
 * NINCSENEK itt (2026-09-05, bíráló P3): a kezdőlap a `@kartoteka/ui-app`
 * `UpcomingPrograms` saját tükréből rajzol, és egy harmadik, senki által nem
 * olvasott másolat csak mért, de holt adat lett volna — a rajzoló forrást a
 * PR1f őr méri a webhez.
 *
 * ŐR: a `scripts/selftest-desktop-szinkron.mjs` PR1 őre a webes fájlból
 * kinyert listákat hasonlítja ehhez a modulhoz — ha a web bővül vagy a magán /
 * anyakönyvi lista eltér, az őr pirosra vált, és ide is át kell vezetni; azt
 * is méri, hogy térkép NEM került ide vissza. Két igazságforrás helyett így
 * EGY forrás + egy mért tükör van.
 *
 * MAGÁN TÍPUSOK (szabadság + anyakönyvi): az asztali app a lelkész SAJÁT gépe,
 * ezért ezek látszanak a helyi közelgő programokban — de a NYILVÁNOS jelölés
 * rajtuk SOHA nem lehet igaz (a web mentése és a DB-trigger is kikapcsolja; a
 * tükörbe írás és a tükörből olvasás itt ugyanezt a szabályt tartja, fail-closed:
 * ha a szerverről mégis `publikus = true` jönne egy magán sorra, a gépen 0 lesz).
 */

export const PROGRAM_TIPUSOK = [
  'istentisztelet', 'bibliaora', 'imaora', 'ifjusagi', 'gyerekprogram',
  'konferencia', 'hangverseny', 'kozossegi', 'presbiteri', 'latogatas',
  'unnep', 'tabor', 'evangelizacio', 'diakoniai', 'noszovetseg', 'egyeb',
  'kereszteles', 'eskuvo', 'konfirmacio', 'temetes', 'szabadsag',
] as const

export type ProgramTipus = (typeof PROGRAM_TIPUSOK)[number]

/** MAGÁN típusok — SOHA nem publikusak (a webes `MAGAN_PROGRAM_TIPUSOK` tükre). */
export const MAGAN_PROGRAM_TIPUSOK = ['szabadsag', 'kereszteles', 'eskuvo', 'konfirmacio', 'temetes'] as const satisfies readonly ProgramTipus[]
export type MaganProgramTipus = (typeof MAGAN_PROGRAM_TIPUSOK)[number]

/** A tervezett anyakönyvi alkalom típusai — ezekhez köthető anyakönyvi bejegyzés. */
export const ANYAKONYVI_PROGRAM_TIPUSOK = ['kereszteles', 'eskuvo', 'konfirmacio', 'temetes'] as const satisfies readonly ProgramTipus[]
export type AnyakonyviProgramTipus = (typeof ANYAKONYVI_PROGRAM_TIPUSOK)[number]

export function isProgramTipus(t: string | null | undefined): t is ProgramTipus {
  return (PROGRAM_TIPUSOK as readonly string[]).includes(t ?? '')
}

export function isMaganProgramTipus(t: string | null | undefined): t is MaganProgramTipus {
  return (MAGAN_PROGRAM_TIPUSOK as readonly string[]).includes(t ?? '')
}

export function isAnyakonyviProgramTipus(t: string | null | undefined): t is AnyakonyviProgramTipus {
  return (ANYAKONYVI_PROGRAM_TIPUSOK as readonly string[]).includes(t ?? '')
}

/**
 * A NYILVÁNOS jelölés TÉNYLEGES értéke egy programon.
 *
 * Magán típuson (szabadság + anyakönyvi) SOHA nem igaz — bármit is mond a
 * tárolt `publikus` mező. Minden más típuson a tárolt érték dönt (a SQLite
 * 0/1-et és a Postgres booleant egyaránt elfogadja; hiányzó érték = nem publikus).
 */
export function programNyilvanos(
  tipus: string | null | undefined,
  publikus: boolean | number | null | undefined,
): boolean {
  if (isMaganProgramTipus(tipus)) return false
  return publikus === true || publikus === 1
}

/** A tükörbe írandó / tükörből olvasott `publikus` oszlop értéke (SQLite INTEGER 0/1). */
export function programPublikusTukorErtek(
  tipus: string | null | undefined,
  publikus: boolean | number | null | undefined,
): 0 | 1 {
  return programNyilvanos(tipus, publikus) ? 1 : 0
}
