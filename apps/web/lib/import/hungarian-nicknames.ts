/**
 * Magyar/erdélyi keresztnév-becenév ekvivalencia-szótár a tag-párosításhoz.
 *
 * 2026-06-19 (P2-1 / kutatás #2): a párosító mag pontos kulcs-egyezésre épül, így
 * a becenéven befizetők (pl. „Pista" a tagnyilvántartásbeli „István" helyett) nem
 * találnak párt. Ez a szótár KÉTIRÁNYÚ ekvivalencia-klaszterekbe szervezi a
 * gyakori beceneveket, és a `knevVariants` mindkét oldalon (index + lekérdezés)
 * kibővíti velük a keresztnév-variánsokat — így a meglévő DETERMINISZTIKUS
 * (exact-kulcs) lánc kapja el a becenevet, fuzzy/heurisztika nélkül.
 *
 * Minden név NORMALIZÁLT formában (kisbetű, ékezet nélkül), mert a
 * `normalizeNameForQuad` is így kulcsol.
 *
 * KONZERVATÍV lista: csak nagy biztonságú, NEM kétértelmű becenevek. A kétértelmű
 * diminutívumok (pl. „manci" = Margit VAGY Mária, „viki" = Viktória VAGY Veronika,
 * „niki" = Nikolett VAGY Veronika) szándékosan KIMARADTAK, hogy ne okozzanak téves
 * párosítást. Bővíthető — új klasztert egyszerűen hozzá lehet adni.
 */

/** Ekvivalencia-klaszterek: minden tömb egymással felcserélhető névalakokat tartalmaz. */
const NICKNAME_CLUSTERS: string[][] = [
  // ── Férfi ───────────────────────────────────────────────────────────────
  ['istvan', 'pista', 'pisti', 'isti'],
  ['jozsef', 'jozsi', 'joska', 'joco'],
  ['janos', 'jani', 'jancsi'],
  ['ferenc', 'feri', 'ferko'],
  ['laszlo', 'laci', 'lacko'],
  ['sandor', 'sanyi', 'sandi'],
  ['gyorgy', 'gyuri', 'gyurka'],
  ['karoly', 'karcsi', 'kari'],
  ['mihaly', 'misi', 'miska'],
  ['pal', 'pali', 'palko'],
  ['peter', 'peti', 'petike'],
  ['zoltan', 'zoli', 'zolika'],
  ['andras', 'andris', 'bandi'],
  ['gabor', 'gabi', 'gabika'],
  ['tamas', 'tomi'],
  ['lajos', 'lajcsi', 'lali'],
  ['marton', 'marci'],
  ['vilmos', 'vili'],
  ['zsolt', 'zsolti'],
  ['daniel', 'dani', 'danika'],
  ['norbert', 'norbi'],
  ['robert', 'robi'],
  ['tibor', 'tibi'],
  ['imre', 'imi'],
  ['antal', 'anti', 'toni'],
  ['levente', 'levi'],
  ['arpad', 'arpi'],
  ['bela', 'belus'],
  ['kalman', 'kalmi'],
  ['miklos', 'miki'],

  // ── Női ─────────────────────────────────────────────────────────────────
  ['katalin', 'kati', 'katica', 'kata', 'katus'],
  ['maria', 'mari', 'marika', 'mara'],
  ['erzsebet', 'erzsi', 'bozsi', 'boske', 'erzsike'],
  ['julianna', 'juli', 'julika', 'jucus'],
  ['julia', 'juli', 'julika'],
  ['terezia', 'teri', 'terike'],
  ['terez', 'teri', 'terike'],
  ['eszter', 'eszti', 'esztike'],
  ['agnes', 'agi', 'agika'],
  ['zsuzsanna', 'zsuzsa', 'zsuzsi', 'zsuzsika'],
  ['zsofia', 'zsofi', 'zsofika'],
  ['eva', 'evi', 'evike', 'evus'],
  ['gizella', 'gizi', 'gizike'],
  ['piroska', 'piri', 'pirike'],
  ['ilona', 'ilus', 'ilonka', 'iluska'],
  ['margit', 'margitka'],
  ['anna', 'annus', 'panni', 'annuska'],
  ['judit', 'jutka', 'judi'],
  ['rozalia', 'rozi', 'rozika'],
  ['veronika', 'vera', 'verus', 'veronka'],
  ['hajnalka', 'hajni'],
  ['monika', 'moni'],
  ['aniko', 'ani'],
  ['orsolya', 'orsi', 'orsika'],
  ['beata', 'bea'],
  ['brigitta', 'brigi'],
  ['klara', 'klari', 'klarika'],
  ['emese', 'emi'],
  ['timea', 'timi'],
  ['ibolya', 'ibi'],
]

/** name (normalizált) → a klaszter összes alakja (önmagát is beleértve). */
const CLUSTER_BY_NAME: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>()
  for (const cluster of NICKNAME_CLUSTERS) {
    for (const name of cluster) {
      const existing = m.get(name)
      if (existing) {
        // Egy becenév több klaszterhez is tartozhat (pl. "juli" = Julianna/Júlia) —
        // egyesítjük az alakokat (uniós halmaz).
        for (const alt of cluster) if (!existing.includes(alt)) existing.push(alt)
      } else {
        m.set(name, [...cluster])
      }
    }
  }
  return m
})()

/**
 * Egy NORMALIZÁLT (kisbetűs, ékezet nélküli) egytokenes keresztnévhez visszaadja
 * az ekvivalens alakokat (önmagát is beleértve). Ha nincs a szótárban, csak
 * önmagát adja vissza.
 */
export function expandNickname(normalizedToken: string): string[] {
  if (!normalizedToken) return []
  return CLUSTER_BY_NAME.get(normalizedToken) ?? [normalizedToken]
}
