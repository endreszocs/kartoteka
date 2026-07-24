/**
 * Kliens/szerver-oldali név-normalizálás — BIT-AZONOS a SQL `public.normalize_name`-mel
 * (migration-docs/sql/2026-04-26-cross-congregation-matching.sql):
 *   lower(btrim(regexp_replace(immutable_unaccent(input), '\s+', ' ', 'g')))
 *
 * 2026-07-17 (PR-1, település-P0): a tagnyilvántartás-import wizard a helység-map
 * kulcsát eddig ékezetESen képezte (`toLowerCase().trim()`), miközben az
 * import_family_head_batch RPC `normalize_name`-mel (unaccent) keresett a mapban —
 * magyar településnévnél ('Barátos' → 'barátos' ≠ 'baratos') a lookup SOHA nem
 * talált, ezért a szemely.c_helysegid NULL maradt. Ez a helper az EGYETLEN
 * kanonikus kulcsképző; minden import-lépés ezt használja.
 */
export function normalizeNameClient(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
