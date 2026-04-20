'use client'

/**
 * PDF ↔ XML párosító — FÁJLNÉV-ALAPÚ, deterministic.
 *
 * Az ANAF SPV (Oblio Wallet exportok) konzisztens fájlnév-mintát követnek:
 *
 *   XML: `<BESZÁLLÍTÓ>_<SZÁMLASOROZAT>_<UPLOAD-INDEX>.xml`
 *     pl. `SOCIETATEAELECTRICAFURNIZARESA_EFI2601416270_5852740042.xml`
 *
 *   PDF: `<UPLOAD-INDEX>_<SZÁMLASOROZAT>.pdf`
 *     pl. `5852740042_EFI2601416270.pdf`
 *
 * Megfigyelés: az XML utolsó 2 része (`<SOROZAT>_<UUID>`) megegyezik a PDF
 * 2 részével (`<UUID>_<SOROZAT>`) — csak fordított sorrendben. Ezzel
 * 100%-osan biztos a párosítás, semmilyen tartalom-elemzés nem kell.
 *
 * Ez a párosítás MINDIG a tartalom-elemzés ELŐTT fut — gyors, deterministic,
 * nem igényel PDF.js-t.
 */

export type FileBaseIds = {
  uuid: string
  series: string
}

/**
 * XML fájlnévből kinyeri az utolsó 2 underscore-elválasztott részt:
 *   `SOCIETATEAELECTRICAFURNIZARESA_EFI2601416270_5852740042.xml`
 *     → { series: 'EFI2601416270', uuid: '5852740042' }
 *
 * Ha a fájlnév nem felel meg a mintának (kevesebb mint 2 underscore),
 * `null`-t ad vissza.
 */
export function extractIdsFromXmlName(xmlName: string): FileBaseIds | null {
  const base = xmlName.replace(/\.xml$/i, '')
  const parts = base.split('_')
  if (parts.length < 3) return null
  const uuid = parts[parts.length - 1].trim()
  const series = parts[parts.length - 2].trim().toUpperCase()
  if (!uuid || !series) return null
  return { uuid, series }
}

/**
 * PDF fájlnévből kinyeri a 2 underscore-elválasztott részt:
 *   `5852740042_EFI2601416270.pdf`
 *     → { uuid: '5852740042', series: 'EFI2601416270' }
 */
export function extractIdsFromPdfName(pdfName: string): FileBaseIds | null {
  const base = pdfName.replace(/\.pdf$/i, '')
  const parts = base.split('_')
  if (parts.length < 2) return null
  const uuid = parts[0].trim()
  const series = parts[1].trim().toUpperCase()
  if (!uuid || !series) return null
  return { uuid, series }
}

export type NameMatchResult = {
  pdfName: string
  xmlFileName: string | null
  reason: string
  /**
   * 'high': mind UUID, mind sorozat egyezik
   * 'medium': csak UUID egyezik (sorozat eltér)
   * 'low': csak sorozat egyezik (UUID eltér)
   * 'none': nincs egyezés
   */
  confidence: 'high' | 'medium' | 'low' | 'none'
  pdfIds: FileBaseIds | null
}

/**
 * Egy árva PDF-et fájlnév-minta alapján próbál párosítani egy XML-lel.
 */
export function matchPdfToXmlByName(
  pdfName: string,
  xmlFileNames: string[],
  alreadyMatchedXmlNames: Set<string>,
): NameMatchResult {
  const pdfIds = extractIdsFromPdfName(pdfName)
  if (!pdfIds) {
    return {
      pdfName,
      xmlFileName: null,
      reason: 'A PDF fájlnév nem felel meg az ANAF mintának (UUID_SOROZAT.pdf)',
      confidence: 'none',
      pdfIds: null,
    }
  }

  const available = xmlFileNames.filter((n) => !alreadyMatchedXmlNames.has(n))

  // 1. Kétfelőli egyezés (UUID + SOROZAT)
  for (const xmlName of available) {
    const xmlIds = extractIdsFromXmlName(xmlName)
    if (!xmlIds) continue
    if (xmlIds.uuid === pdfIds.uuid && xmlIds.series === pdfIds.series) {
      return {
        pdfName,
        xmlFileName: xmlName,
        reason: `Pontos fájlnév-egyezés: UUID=${pdfIds.uuid}, sorozat=${pdfIds.series}`,
        confidence: 'high',
        pdfIds,
      }
    }
  }

  // 2. Csak UUID egyezik (gyengébb)
  for (const xmlName of available) {
    const xmlIds = extractIdsFromXmlName(xmlName)
    if (!xmlIds) continue
    if (xmlIds.uuid === pdfIds.uuid) {
      return {
        pdfName,
        xmlFileName: xmlName,
        reason: `Csak UUID egyezik (${pdfIds.uuid}) — sorozat eltér: PDF=${pdfIds.series} vs XML=${xmlIds.series}`,
        confidence: 'medium',
        pdfIds,
      }
    }
  }

  // 3. Csak sorozat egyezik (még gyengébb)
  for (const xmlName of available) {
    const xmlIds = extractIdsFromXmlName(xmlName)
    if (!xmlIds) continue
    if (xmlIds.series === pdfIds.series) {
      return {
        pdfName,
        xmlFileName: xmlName,
        reason: `Csak sorozat egyezik (${pdfIds.series}) — UUID eltér: PDF=${pdfIds.uuid} vs XML=${xmlIds.uuid}`,
        confidence: 'low',
        pdfIds,
      }
    }
  }

  return {
    pdfName,
    xmlFileName: null,
    reason: `Nincs XML ezzel az UUID-val (${pdfIds.uuid}) vagy sorozattal (${pdfIds.series})`,
    confidence: 'none',
    pdfIds,
  }
}

/**
 * Csoportos fájlnév-alapú párosítás. Szigorúan csak a high és medium
 * confidence match-eket adja vissza — a low confidence-eket is kísérletként
 * jelzi, de a hívó dönti el, mit csinál vele.
 */
export function batchMatchPdfsToXmlsByName(
  pdfNames: string[],
  xmlFileNames: string[],
): NameMatchResult[] {
  const results: NameMatchResult[] = []
  const matchedXmlNames = new Set<string>()
  for (const pdfName of pdfNames) {
    const r = matchPdfToXmlByName(pdfName, xmlFileNames, matchedXmlNames)
    if (r.xmlFileName && (r.confidence === 'high' || r.confidence === 'medium')) {
      matchedXmlNames.add(r.xmlFileName)
    }
    results.push(r)
  }
  return results
}
