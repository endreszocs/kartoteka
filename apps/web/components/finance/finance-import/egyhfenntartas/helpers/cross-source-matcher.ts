/**
 * Cross-source matcher: xlsx Kassza-sheet + xml bevételek-fájl párosítása.
 *
 * 2026-05-06 — egyházfenntartás-import wizardhoz.
 *
 * **A KULCS-EGYEZÉS:**
 *   `xlsx.Iratszam` (1-329 sorszám)  ⇆  `xml.Nyugta` (1-329 sorszám)
 *
 * Ha a kettő egyezik ÉS az összeg azonos ÉS a név egy normalizált egyezésben van,
 * akkor egyetlen tranzakció — csak EGYSZER importálandó. Ilyenkor az XML adatait
 * használjuk (több info: Befizetett év, Megjegyzés, hivatalos Iratszám).
 *
 * 5 kategória:
 *   🟢 Match (mindkét fájlban)
 *   🔵 Csak xlsx (xml-ben hiányzik)
 *   🟠 Csak xml (xlsx-ben hiányzik)
 *   🟡 Bizonytalan (Iratszam egyezik, de az összeg vagy név eltér)
 *   🔴 Hiba (parse-konfliktus, hiányzó kulcsmező)
 */

import type { XlsxEgyhfRow } from './xlsx-egyhf-parser'
import type { XmlBevetelekRow } from './xml-bevetelek-parser'

export type MatchKind = 'match' | 'only-xlsx' | 'only-xml' | 'uncertain'

export interface MatchedRow {
  kind: MatchKind
  /** Xlsx-eredetű sor (csak ha kind ∈ {match, only-xlsx, uncertain}) */
  xlsxRow?: XlsxEgyhfRow
  /** Xml-eredetű sor (csak ha kind ∈ {match, only-xml, uncertain}) */
  xmlRow?: XmlBevetelekRow
  /**
   * Bizonytalan eseten az eltérés rövid leírása
   * (pl. "Összeg eltér: xlsx 130, xml 150")
   */
  uncertaintyReason?: string
}

export interface CrossMatchResult {
  matched: MatchedRow[]
  /** Statisztika (a UI-ban jelenik meg) */
  stats: {
    matchCount: number
    onlyXlsxCount: number
    onlyXmlCount: number
    uncertainCount: number
    xlsxTotal: number
    xmlTotal: number
  }
}

/**
 * Név normalizálás a duplikáció-szűréshez.
 * - Kisbetűsítés
 * - Magyar ékezetek levágása
 * - Többszörös szóközök → egy
 * - Trim
 * - Prefixek (Özv., Elv., id., ifj., Dr.) levágása
 */
export function normalizeNameForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // ékezetek le
    .replace(/^(özv\.|elv\.|dr\.|id\.|ifj\.|br\.|gr\.)\s+/i, '')
    .replace(/[^a-z0-9 -]/g, ' ') // csak betűk, számok, szóköz, kötőjel
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Levenshtein-távolság — kis stringeknél elég gyors O(m*n).
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }
  return matrix[b.length][a.length]
}

/**
 * Nevek "rokonsága": 0 (nem hasonló) → 1 (azonos).
 * Ha a normalizált nevek azonosak: 1.
 * Ha a Levenshtein-távolság kicsi (≤2 a hosszhoz képest): 0.9.
 */
function nameSimilarity(a: string, b: string): number {
  const na = normalizeNameForMatch(a)
  const nb = normalizeNameForMatch(b)
  if (na === nb) return 1
  if (na.length === 0 || nb.length === 0) return 0
  const dist = levenshtein(na, nb)
  const maxLen = Math.max(na.length, nb.length)
  const ratio = 1 - dist / maxLen
  return ratio
}

/**
 * Két sor egyezésének kiértékelése.
 * Visszaad egy score-t (0..3) és az eltérések listáját.
 *
 * Score komponensek:
 *   1 pont — Iratszam == Nyugta
 *   1 pont — Összeg pontosan egyezik
 *   1 pont — Név hasonló (similarity ≥ 0.85)
 *
 * 3 pont = MATCH (biztos)
 * 2 pont = UNCERTAIN (egy eltérés)
 * <2 pont = nem ugyanaz a tranzakció
 */
function evaluatePair(
  xlsx: XlsxEgyhfRow,
  xml: XmlBevetelekRow,
): { score: number; differences: string[] } {
  let score = 0
  const differences: string[] = []

  // 1) Iratszam (xlsx) == Nyugta (xml)
  if (xlsx.iratszam !== null && xml.nyugta !== null) {
    if (xlsx.iratszam === xml.nyugta) {
      score++
    } else {
      differences.push(`Sorszám eltér: xlsx Iratszám=${xlsx.iratszam}, xml Nyugta=${xml.nyugta}`)
    }
  } else {
    differences.push('Sorszám hiányzik az egyik fájlból')
  }

  // 2) Összeg
  if (Math.abs(xlsx.osszeg - xml.osszeg) < 0.01) {
    score++
  } else {
    differences.push(`Összeg eltér: xlsx ${xlsx.osszeg}, xml ${xml.osszeg}`)
  }

  // 3) Név hasonlóság
  const sim = nameSimilarity(xlsx.rawName, xml.rawForrasa)
  if (sim >= 0.85) {
    score++
  } else {
    differences.push(
      `Név eltér (${Math.round(sim * 100)}% hasonlóság): xlsx "${xlsx.rawName}", xml "${xml.rawForrasa}"`,
    )
  }

  return { score, differences }
}

/**
 * Két lista párosítása. A xlsx.Iratszam == xml.Nyugta a fő kulcs, de
 * az összeg és név is súlyoz.
 *
 * Algoritmus:
 *   1. Indexeljük az XML-t Nyugta szerint
 *   2. Az xlsx soronként:
 *      - Ha Iratszam alapján van XML párja:
 *        - score=3 → match
 *        - score=2 → uncertain
 *        - score<2 → only-xlsx (nem ugyanaz a tranzakció, csak iratszam-egyezés)
 *      - Ha nincs Iratszam párja: only-xlsx
 *   3. Az XML maradék (nem felhasznált) sorai: only-xml
 */
export function matchSources(
  xlsxRows: XlsxEgyhfRow[],
  xmlRows: XmlBevetelekRow[],
): CrossMatchResult {
  // Index XML by nyugta number
  const xmlByNyugta = new Map<number, XmlBevetelekRow[]>()
  for (const xml of xmlRows) {
    if (xml.nyugta === null) continue
    const list = xmlByNyugta.get(xml.nyugta) ?? []
    list.push(xml)
    xmlByNyugta.set(xml.nyugta, list)
  }

  const matched: MatchedRow[] = []
  const consumedXml = new Set<XmlBevetelekRow>()

  let matchCount = 0
  let onlyXlsxCount = 0
  let uncertainCount = 0
  let xlsxTotal = 0
  let xmlTotal = 0

  for (const xlsx of xlsxRows) {
    xlsxTotal += xlsx.osszeg

    if (xlsx.iratszam === null) {
      matched.push({ kind: 'only-xlsx', xlsxRow: xlsx })
      onlyXlsxCount++
      continue
    }

    const candidates = xmlByNyugta.get(xlsx.iratszam) ?? []
    if (candidates.length === 0) {
      // XML-ben nincs ilyen Nyugta-számú sor
      matched.push({ kind: 'only-xlsx', xlsxRow: xlsx })
      onlyXlsxCount++
      continue
    }

    // Több XML-sor lehet ugyanazon nyugta-szám alatt (családi befizetés
    // egy tömbös nyugtán). Mind ugyanannak az iratszámnak a része —
    // a legjobb (score) párját választjuk a név alapján.
    let bestXml: XmlBevetelekRow | null = null
    let bestScore = -1
    let bestDifferences: string[] = []
    for (const candidate of candidates) {
      if (consumedXml.has(candidate)) continue
      const { score, differences } = evaluatePair(xlsx, candidate)
      if (score > bestScore) {
        bestScore = score
        bestXml = candidate
        bestDifferences = differences
      }
    }

    if (bestXml === null) {
      // Minden candidate fel van használva (más xlsx már elvitte)
      matched.push({ kind: 'only-xlsx', xlsxRow: xlsx })
      onlyXlsxCount++
      continue
    }

    consumedXml.add(bestXml)

    if (bestScore === 3) {
      matched.push({ kind: 'match', xlsxRow: xlsx, xmlRow: bestXml })
      matchCount++
    } else if (bestScore >= 2) {
      matched.push({
        kind: 'uncertain',
        xlsxRow: xlsx,
        xmlRow: bestXml,
        uncertaintyReason: bestDifferences.join('; '),
      })
      uncertainCount++
    } else {
      matched.push({ kind: 'only-xlsx', xlsxRow: xlsx })
      onlyXlsxCount++
    }
  }

  // XML maradék (nem felhasznált sorok)
  let onlyXmlCount = 0
  for (const xml of xmlRows) {
    xmlTotal += xml.osszeg
    if (consumedXml.has(xml)) continue
    matched.push({ kind: 'only-xml', xmlRow: xml })
    onlyXmlCount++
  }

  return {
    matched,
    stats: {
      matchCount,
      onlyXlsxCount,
      onlyXmlCount,
      uncertainCount,
      xlsxTotal,
      xmlTotal,
    },
  }
}
