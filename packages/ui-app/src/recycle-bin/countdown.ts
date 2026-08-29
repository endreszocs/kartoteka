/**
 * Kuka visszaszámláló — TISZTA függvények (2026-08-14, 6. pont 2. ütem;
 * 2026-08-15, desktop-paritás 3. szelet: ide, a közös csomagba emelve).
 *
 * KANONIKUS PÉLDÁNY: a web (`apps/web/lib/offline/recycle-bin-countdown.ts`)
 * és a desktop egyaránt INNEN importál — a webes fájl csak re-export.
 * A `scripts/selftest-kuka.mjs` is EZT a fájlt fordítja és futtatja.
 *
 * SZÁNDÉKOSAN nulla importtal készül, hogy a selftest önállóan, build nélkül
 * fordíthassa (a keszpenz-korlatok mintája).
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

/**
 * P4-26 (audit 2026-08-28, Endre döntése 2026-08-29): a PÉNZÜGYI bizonylat-
 * sorok 5 ÉVIG maradnak a Kukában (bizonylat-megőrzés) — a purge_recycle_bin
 * táblánkénti megőrzési térképének kliens-oldali tükre.
 */
export const PENZUGYI_RETENTION_DAYS = 1825
const PENZUGYI_TABLAK = new Set(['befizetes', 'kiadas', 'belsomozgas'])

/** A tábla szerver-oldali megőrzési ideje napokban (a purge-térkép tükre). */
export function retentionDaysFor(table: string): number {
  return PENZUGYI_TABLAK.has(table) ? PENZUGYI_RETENTION_DAYS : RECYCLE_BIN_RETENTION_DAYS
}

const NAP_MS = 24 * 60 * 60 * 1000

/**
 * Hány nap van hátra a végleges törlésig.
 * A felső vágás azért kell, mert a kliens órája járhat a szerveré MÖGÖTT:
 * egy frissen bélyegzett deleted_at ilyenkor „jövőbeli", és vágás nélkül
 * eggyel több nap jönne ki, mint amennyit ígérünk.
 * @param retentionDays a tábla megőrzési ideje — `retentionDaysFor(table)`;
 *        elhagyva a 30 napos alapérték (visszafelé kompatibilis).
 * @returns 0..retentionDays közti egész, vagy null, ha nincs értelmezhető dátum.
 */
export function purgeCountdownDays(
  deletedAtIso: string | null | undefined,
  nowMs: number,
  retentionDays: number = RECYCLE_BIN_RETENTION_DAYS,
): number | null {
  if (!deletedAtIso) return null
  const t = new Date(deletedAtIso).getTime()
  if (!Number.isFinite(t)) return null
  const elapsedDays = (nowMs - t) / NAP_MS
  return Math.min(
    retentionDays,
    Math.max(0, Math.ceil(retentionDays - elapsedDays)),
  )
}

/**
 * A visszaszámláló felirata. Pontos dátumnál nem ígérünk „legfeljebb"-et,
 * becslésnél viszont KÖTELEZŐ a „legfeljebb" — nem hazudunk pontosságot,
 * amink nincs. Egy évnél hosszabb hátralévő időnél évben beszélünk
 * (P4-26: a pénzügyi sorok 5 éves megőrzése napokban olvashatatlan volna).
 */
export function purgeCountdownLabel(
  days: number | null,
  exact: boolean,
): string | null {
  if (days === null) return null
  if (days === 0) return 'Bármikor törlődhet véglegesen!'
  if (days > 365) {
    const evek = Math.round((days / 365) * 10) / 10
    return exact
      ? `kb. ${evek} év múlva törlődik véglegesen`
      : `legfeljebb kb. ${evek} év múlva törlődik véglegesen`
  }
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
