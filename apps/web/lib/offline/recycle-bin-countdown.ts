/**
 * Kuka visszaszámláló — TISZTA függvények (2026-08-14, 6. pont 2. ütem).
 *
 * SZÁNDÉKOSAN nulla importtal készül, hogy a scripts/selftest-kuka.mjs
 * önállóan, build nélkül fordíthassa és futtathassa (a keszpenz-korlatok
 * mintája).
 *
 * Két üzemmód:
 *  - PONTOS: a sornak van `deleted_at`-ja (a kuka-deleted-at migráció
 *    triggere bélyegzi) → „N nap múlva törlődik véglegesen"
 *  - BECSLÉS: nincs `deleted_at` (a migráció még nem futott le, vagy a
 *    helyi Dexie-másolat nem hordozza) → az `updated_at`-ból számolunk.
 *    Mivel a soft-delete maga is update, az updated_at LEGFELJEBB a törlés
 *    időpontja lehet → a napszám FELSŐ becslés: „legfeljebb N nap".
 */

/**
 * A szerver-oldali megőrzési idő (napokban). Ennél régebben törölt sorokat
 * a purge_recycle_bin() (napi pg_cron, 03:15 UTC) véglegesen töröl.
 */
export const RECYCLE_BIN_RETENTION_DAYS = 30

const NAP_MS = 24 * 60 * 60 * 1000

/**
 * Hány nap van hátra a végleges törlésig.
 * A felső vágás azért kell, mert a kliens órája járhat a szerveré MÖGÖTT:
 * egy frissen bélyegzett deleted_at ilyenkor „jövőbeli", és vágás nélkül
 * 31 nap jönne ki — miközben mindenhol 30 napot ígérünk.
 * @returns 0..30 közti egész, vagy null, ha nincs értelmezhető dátum.
 */
export function purgeCountdownDays(
  deletedAtIso: string | null | undefined,
  nowMs: number,
): number | null {
  if (!deletedAtIso) return null
  const t = new Date(deletedAtIso).getTime()
  if (!Number.isFinite(t)) return null
  const elapsedDays = (nowMs - t) / NAP_MS
  return Math.min(
    RECYCLE_BIN_RETENTION_DAYS,
    Math.max(0, Math.ceil(RECYCLE_BIN_RETENTION_DAYS - elapsedDays)),
  )
}

/**
 * A visszaszámláló felirata. Pontos dátumnál nem ígérünk „legfeljebb"-et,
 * becslésnél viszont KÖTELEZŐ a „legfeljebb" — nem hazudunk pontosságot,
 * amink nincs.
 */
export function purgeCountdownLabel(
  days: number | null,
  exact: boolean,
): string | null {
  if (days === null) return null
  if (days === 0) return 'Bármikor törlődhet véglegesen!'
  return exact
    ? `${days} nap múlva törlődik véglegesen`
    : `legfeljebb ${days} nap múlva törlődik véglegesen`
}

/** A „Törölve: …" sor kiegészítője becslésnél. */
export function deletedDateSuffix(exact: boolean): string {
  return exact ? '' : ' (a legutóbbi módosítás napja)'
}

/** Egységes kulcs a pontos-dátum térképhez (tábla + rekord-azonosító). */
export function exactKey(table: string, id: string | number): string {
  return `${table}:${id}`
}
