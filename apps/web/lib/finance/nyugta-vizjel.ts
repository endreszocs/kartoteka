/**
 * Nyugta (Chitanță) háttér-vízjel választó — egyházkerület szerint.
 *
 * 2026-07-17 (Q3 döntés): a nyugta háttér-címere egyházkerület-függő —
 * Királyhágómelléki (KREK / Eparhia Reformată de pe lângă Piatra Craiului)
 * gyülekezetnél a KEREK címer, különben az EREK. Mindkét asset a web
 * `public/` mappájában él (a splash képernyő is ugyanezeket használja).
 *
 * 2026-08-25: a választó a `chitanta-print-template.tsx`-ből került ide,
 * hogy önállóan, renderelés nélkül is mérhető legyen
 * (`scripts/selftest-kerulet-nyomtatvany.mjs`).
 *
 * ⚠️ A NÉV-MINTA CSAK KÉP-DÖNTÉSRE VALÓ: a `districts` táblának nincs
 * kerület-típus kulcsa (id, name, nev_ro, created_at), ezért a kerület
 * NEVÉBEN keressük a „Királyhágó" / „Piatra Craiului" mintát —
 * ékezet-érzéketlenül. NÉV-adatot ebből levezetni TILOS (az a 2026-08-22-es
 * hibaosztály: kitalált kerületnév egy aláírható bizonylaton) — kizárólag
 * azt dönti el, MELYIK KÉP kerüljön halványan a papír mögé.
 *
 * FAIL-CLOSED: ismeretlen vagy hiányzó kerületnél a mai (EREK) viselkedés
 * marad — a nyugta sosem marad címer nélkül, és sosem kap találgatott címert.
 */

/** Az Erdélyi Református Egyházkerület címere (alapértelmezés). */
export const EREK_VIZJEL = '/EREK.png'

/** A Királyhágómelléki Református Egyházkerület címere. */
export const KEREK_VIZJEL = '/KEREK.png'

/**
 * Ékezet-érzéketlenül eltávolítja a diakritikusokat. Hasznos annak
 * ellenőrzésére, hogy egy név már tartalmazza-e a hivatalos prefixet
 * (pl. "Parohia Reformată Brateș" vs "parohia reformata brates").
 */
export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/** A választáshoz elég a kerület két név-mezője — a teljes nyugta-adat nem kell. */
export type NyugtaVizjelKerulet = {
  egyhazkeruletNevHu?: string | null
  egyhazkeruletNevRo?: string | null
}

/**
 * A nyugta háttér-vízjelének képútvonala a kerületnevek alapján.
 * Királyhágómelléki minta (magyar VAGY román névben) → KEREK; minden más
 * (Erdélyi, ismeretlen, üres) → EREK — fail-closed, a mai viselkedés.
 */
export function districtEmblemSrc(data: NyugtaVizjelKerulet): string {
  const kerulet = stripDiacritics(
    `${data.egyhazkeruletNevHu || ''} ${data.egyhazkeruletNevRo || ''}`,
  )
  return kerulet.includes('kiralyhago') || kerulet.includes('piatra craiului')
    ? KEREK_VIZJEL
    : EREK_VIZJEL
}
