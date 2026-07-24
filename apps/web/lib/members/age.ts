/**
 * Dátum-pontos életkor-számítás (2026-07-17, PR-2 F1.4).
 *
 * A korábbi évszám-alapú számítás (`currentYear - getFullYear()`) azt is
 * felnőttnek vette, aki az idén tölti a 18-at, de még nem volt születésnapja —
 * miközben a recompute_voter_eligibility RPC dátum-pontosan
 * (`sz_datum <= CURRENT_DATE - 18 years`) számol. Ez a helper a SQL-lel
 * BIT-AZONOS szemantikát ad a TS-oldalon.
 */

/** Betöltött évek száma a referencia-napon (default: ma). Hibás dátumra null. */
export function exactAge(szDatum: string | null | undefined, ref: Date = new Date()): number | null {
  if (!szDatum) return null
  const birth = new Date(szDatum)
  if (Number.isNaN(birth.getTime())) return null
  let age = ref.getFullYear() - birth.getFullYear()
  const hadBirthday =
    ref.getMonth() > birth.getMonth() ||
    (ref.getMonth() === birth.getMonth() && ref.getDate() >= birth.getDate())
  if (!hadBirthday) age -= 1
  return age
}

/** Betöltötte-e a 18. életévét (dátum-pontosan, a SQL-szabállyal egyezően). */
export function isAdult(szDatum: string | null | undefined, ref: Date = new Date()): boolean {
  const age = exactAge(szDatum, ref)
  return age !== null && age >= 18
}
