/**
 * „ÖRÖKÖLT SZEREPKÖR" — a Fázis-1 backfill sorának PONTOS aláírása
 * (2026-09-05, P3-utómunka, profil).
 *
 * A 2026-04-17-es profile_roles Fázis-1 backfill a meglévő `profiles.role`
 * skalárból hozott létre sort úgy, hogy `approved_by = NULL` és
 * `approved_at = a fiók created_at-ja` (ugyanaz az időbélyeg, nem „aznap").
 * A profil-dialógus ezt a sort „a fiókkal együtt kapott (örökölt) szerepkör"
 * felirattal mutatja, a többinél a jóváhagyás/kiosztás dátumát.
 *
 * MIÉRT PONTOS EGYEZÉS, NEM NAPRA-EGYEZÉS: a korábbi jelzés a bukaresti
 * naptári napot hasonlította (`ugyanazABukarestiNap`), ezért egy AZNAP admin
 * által kiosztott és jóváhagyott szerep is „örökölt"-nek látszott — a
 * felhasználó nem látta, ki és mikor hagyta jóvá. A backfill aláírása
 * másodpercre azonos időbélyeg; a kis tűrés (5 mp) csak az esetleges
 * kerekítés/replikáció-eltolódásra való, egy emberi jóváhagyás soha nem esik
 * a fiók létrejöttének 5 másodpercébe.
 *
 * Direktíva-mentes, tiszta függvény — az önteszt közvetlenül tölti be.
 */

export const OROKOLT_SZEREP_TURES_MS = 5_000

export interface OrokoltSzerepBemenet {
  /** `profile_roles.approved_by` — a backfill sorában NULL. */
  approvedBy: string | null | undefined
  /** `profile_roles.approved_at` (timestamptz ISO). */
  approvedAt: string | null | undefined
  /** `profiles.created_at` (timestamptz ISO) — a fiók létrejötte. */
  fiokLetrejott: string | null | undefined
}

function idobelyegMs(v: string | null | undefined): number | null {
  if (!v) return null
  const ms = new Date(v).getTime()
  return Number.isNaN(ms) ? null : ms
}

/**
 * Igaz, ha a sor a backfill aláírását viseli: nincs jóváhagyó ÉS a jóváhagyás
 * időbélyege a fiók létrejöttével azonos (±tűrés). Hiányzó/érvénytelen
 * időbélyegnél `false` — bizonytalan állapotban NEM állítjuk, hogy örökölt.
 */
export function orokoltSzerepE(be: OrokoltSzerepBemenet, turesMs: number = OROKOLT_SZEREP_TURES_MS): boolean {
  if (be.approvedBy != null) return false
  const jovahagyva = idobelyegMs(be.approvedAt)
  const letrejott = idobelyegMs(be.fiokLetrejott)
  if (jovahagyva == null || letrejott == null) return false
  return Math.abs(jovahagyva - letrejott) <= turesMs
}
