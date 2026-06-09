/**
 * Jaro–Winkler hasonlóság — név-egyeztetéshez.
 *
 * A korábbi `cross-source-matcher.ts` Levenshtein-távolságot használt. Record-linkage
 * best practice (Splink/Fellegi–Sunter, dataladder fuzzy-matching guide) szerint a
 * **Jaro–Winkler** jobb személyneveknél: prefix-egyezést jutalmaz (a vezetéknév eleje
 * stabilabb), és kevésbé érzékeny a vég-toldalékokra (asszonynév-variánsok, rövidítések).
 *
 * Küszöbök (a kutatás alapján kalibrálva):
 *   - ≥ 0.92  → biztos egyezés
 *   - 0.88–0.92 → emberi megerősítés (review)
 *   - < 0.88  → nem egyezés
 *
 * Források:
 *   - https://www.robinlinacre.com/fellegi_sunter_accuracy/
 *   - https://dataladder.com/fuzzy-matching-101/
 */

/** Nyers Jaro-hasonlóság két stringre (0..1). */
function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1
  const len1 = s1.length
  const len2 = s2.length
  if (len1 === 0 || len2 === 0) return 0

  const matchDistance = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1)
  const s1Matches = new Array<boolean>(len1).fill(false)
  const s2Matches = new Array<boolean>(len2).fill(false)

  let matches = 0
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance)
    const end = Math.min(i + matchDistance + 1, len2)
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue
      if (s1[i] !== s2[j]) continue
      s1Matches[i] = true
      s2Matches[j] = true
      matches++
      break
    }
  }
  if (matches === 0) return 0

  // Transzpozíciók számolása
  let transpositions = 0
  let k = 0
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }
  transpositions = Math.floor(transpositions / 2)

  return (
    (matches / len1 + matches / len2 + (matches - transpositions) / matches) / 3
  )
}

/**
 * Jaro–Winkler hasonlóság (0..1). A közös prefix (max 4 karakter) extra súlyt kap.
 * @param p Winkler-skálázó (alap 0.1).
 */
export function jaroWinkler(s1: string, s2: string, p = 0.1): number {
  const j = jaro(s1, s2)
  if (j === 0) return 0
  let prefix = 0
  const maxPrefix = Math.min(4, Math.min(s1.length, s2.length))
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }
  return j + prefix * p * (1 - j)
}

/**
 * Név normalizálás egyeztetéshez: kisbetű, ékezet-levágás (NFD), prefix-eltávolítás
 * (Özv./Elv./Dr./id./ifj./Br./Gr.), csak betű/szám/szóköz/kötőjel, szóköz-összevonás.
 */
export function normalizeNameForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // kombináló ékezetek
    .replace(/^(özv\.|elv\.|dr\.|id\.|ifj\.|br\.|gr\.)\s+/i, '')
    .replace(/[^a-z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Két név hasonlósága normalizálás után (0..1). A token-halmazokat is összeveti
 * (sorrend-független), és a jobbik értéket adja vissza — így a „Beder Győzőné Elvira"
 * vs „Elvira Beder" típusú sorrend-eltérés is jól matchel.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeNameForMatch(a)
  const nb = normalizeNameForMatch(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  const direct = jaroWinkler(na, nb)

  // Token-rendezett változat (sorrend-független)
  const sortTokens = (s: string) => s.split(' ').filter(Boolean).sort().join(' ')
  const sorted = jaroWinkler(sortTokens(na), sortTokens(nb))

  return Math.max(direct, sorted)
}

/** Egyezés-szint a kalibrált küszöbök szerint. */
export type NameMatchLevel = 'match' | 'review' | 'no-match'
export function nameMatchLevel(similarity: number): NameMatchLevel {
  if (similarity >= 0.92) return 'match'
  if (similarity >= 0.88) return 'review'
  return 'no-match'
}
