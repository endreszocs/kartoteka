/**
 * 2026-08-10 — Térkép-hivatkozás a gyülekezet szabad szöveges címéből.
 *
 * A cím a `public_sites.address` mezőből jön, tetszőleges szöveg lehet, ezért
 * kizárólag URL-kódolt keresőparaméterként adjuk tovább — soha nem
 * illesztjük be nyersen az útvonalba.
 *
 * ⚠️ 2026-08-11: MÁSODIK fogyasztója lett — a személyi karton cím-egyeztető
 *    ablaka (`components/modals/address-verify-dialog.tsx`) ezzel nyitja meg a
 *    térképet „keresés" módban. A publikus gyülekezeti oldal három helye
 *    (`public-site-footer`, `public-service-times`, `/gy/[slug]/rolunk`)
 *    változatlanul használja, ezért a SZIGNATÚRA NEM változhat.
 */
export function buildMapSearchUrl(address: string | null | undefined): string | null {
  const trimmed = address?.trim()
  if (!trimmed || trimmed.length < 4 || trimmed.length > 300) return null

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`
}
