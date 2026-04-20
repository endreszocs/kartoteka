/**
 * Congregation név → fájlrendszer-biztonságos slug.
 *
 * **KRITIKUS**: minden olyan rendszer, ami a KARTOTEKA helyi mappa
 * almappáit használja (Excel export/import, Oblio ellenőrzés, chitanță,
 * stb.), UGYANEZT a slugify-t kell használja, különben **több helyen**
 * lesznek a fájlok.
 *
 * Példa:
 *   "Kolozsvári Belvárosi Református Egyházközség"
 *     → "kolozsvari-belvarosi-reformatus-egyhazkozseg"
 *   "Brátosi Református Egyházközség"
 *     → "bratosi-reformatus-egyhazkozseg"
 */
export function slugifyCongregationName(name: string | null | undefined): string {
  if (!name) return 'ismeretlen'
  return name
    .toLowerCase()
    .replace(/á/g, 'a')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i')
    .replace(/[óöő]/g, 'o')
    .replace(/[úüű]/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'ismeretlen'
}
