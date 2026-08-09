/**
 * 2026-08-10 — Térkép-hivatkozás a gyülekezet szabad szöveges címéből.
 *
 * A cím a `public_sites.address` mezőből jön, tetszőleges szöveg lehet, ezért
 * kizárólag URL-kódolt keresőparaméterként adjuk tovább — soha nem
 * illesztjük be nyersen az útvonalba.
 */
export function buildMapSearchUrl(address: string | null | undefined): string | null {
  const trimmed = address?.trim()
  if (!trimmed || trimmed.length < 4 || trimmed.length > 300) return null

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`
}
