/**
 * Jaro–Winkler hasonlóság — ÁTKERÜLT a `@kartoteka/core`-ba (2026-08-27).
 *
 * MIÉRT: a hasonló-tétel figyelmeztetés (Endre 8. kérése) a weben ÉS a desktopon
 * is fut. Ha a név-hasonlóságból két példány lenne, a két felület előbb-utóbb
 * MÁST tekintene „kb. ugyanaz"-nak — ez a repóban már megégett hibaosztály
 * („a második felület a régi implementációt őrzi").
 *
 * Ez a fájl ezért CSAK ÁTIRÁNYÍTÁS: a 6 meglévő webes hívási hely változatlanul
 * innen importálhat, de EGYETLEN implementáció van.
 */

export {
  jaroWinkler,
  normalizeNameForMatch,
  nameSimilarity,
} from '@kartoteka/core'
