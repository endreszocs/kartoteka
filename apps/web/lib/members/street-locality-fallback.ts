/**
 * Település-fallback az utca-láncból (2026-07-17, PR-1 település-P0).
 *
 * Háttér: a hibás import-normalizálás miatt sok szemely-sor c_helysegid-je NULL,
 * miközben a c_utcaid-en keresztül az utca (adrstreet.localityid) PONTOSAN tudja
 * a települést. A lekérdezések a beágyazott
 *   adrstreet!c_utcaid(name, adrlocality!localityid(name))
 * joinnal lehozzák az utca települését is (bizonyítottan működő minta:
 * family-actions getFamilies), ez a helper pedig a sor-normalizáláskor pótolja a
 * hiányzó adrlocality-t — így MINDEN fogyasztó (lista, karton, export, útvonal)
 * változtatás nélkül helyes települést lát.
 */

type NameObj = { name: string | null }
type Rel<T> = T | T[] | null | undefined

export type StreetWithLocalityRel = NameObj & { adrlocality?: Rel<NameObj> }

/** PostgREST-embed: objektum VAGY egyelemű tömb — az elsőt vesszük. */
export function firstRel<T>(rel: Rel<T>): T | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

/**
 * A sor adrstreet/adrlocality mezőit lapos `{ name } | null` alakra hozza, és ha
 * a közvetlen (c_helysegid) település hiányzik, az utca településével pótolja.
 */
export function applyStreetLocalityFallback<
  T extends { adrstreet?: Rel<StreetWithLocalityRel>; adrlocality?: Rel<NameObj> },
>(row: T): T & { adrstreet: { name: string } | null; adrlocality: { name: string } | null } {
  const street = firstRel(row.adrstreet)
  const direct = firstRel(row.adrlocality)
  const fromStreet = street ? firstRel(street.adrlocality) : null
  return {
    ...row,
    adrstreet: street?.name ? { name: street.name } : null,
    adrlocality: direct?.name ? { name: direct.name } : fromStreet?.name ? { name: fromStreet.name } : null,
  }
}
