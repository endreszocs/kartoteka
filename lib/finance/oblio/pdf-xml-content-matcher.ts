'use client'

/**
 * PDF ↔ XML tartalom-alapú párosító.
 *
 * Akkor használjuk, amikor a fájlnév-alapú párosítás nem sikerült (vagyis
 * a ZIP vegyes volt — több XML/PDF, és nem 1+1).
 *
 * Az árva PDF-eken futtatjuk a `parsePdfContent`-et, és az XML metadataival
 * összevetjük a kinyert CUI / összeg / számlaszám / dátum értékeket.
 */

import type { UblInvoiceMeta } from './ubl-parser'
import type { PdfExtractedMeta } from './pdf-content-parser'
import { parsePdfContent } from './pdf-content-parser'

export type OrphanPdfFile = {
  name: string
  handle: FileSystemFileHandle
}

export type XmlForContentMatch = {
  fileName: string
  meta: UblInvoiceMeta
}

export type ContentMatchResult = {
  /** A PDF fájl neve. */
  pdfName: string
  /** A párosított XML fájl neve, vagy null ha nincs. */
  xmlFileName: string | null
  /** Magyarázat a párosításhoz (debug + UI). */
  reason: string
  /** Confidence — high (CUI + összeg) / medium (csak CUI vagy csak összeg+dátum) / none. */
  confidence: 'high' | 'medium' | 'low' | 'none'
  /** A PDF-ből kinyert metadata — debugoláshoz. */
  pdfMeta: PdfExtractedMeta
}

const AMOUNT_TOL = 0.5
const DATE_TOL_DAYS = 7

function daysBetween(a: string, b: string): number {
  const da = new Date(a + (a.length <= 10 ? 'T00:00:00Z' : '')).getTime()
  const db = new Date(b + (b.length <= 10 ? 'T00:00:00Z' : '')).getTime()
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Number.POSITIVE_INFINITY
  return Math.abs((da - db) / 86_400_000)
}

function normalizeCui(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/^RO/i, '').replace(/\s/g, '').trim()
}

/**
 * Egy árva PDF-et megpróbál párosítani egy XML-lel a tartalom alapján.
 *
 * Stratégia (sorrendben):
 *   1. CUI + összeg ± 0.5 RON → high confidence
 *   2. CUI egyezés (összeg vagy dátum nem stimmel) → medium
 *   3. Számlaszám egyezés (CUI nélkül) → medium
 *   4. Csak összeg + dátum (egyetlen jelölt) → low
 */
export async function matchPdfToXmls(
  pdf: OrphanPdfFile,
  candidateXmls: XmlForContentMatch[],
  alreadyMatchedXmlNames: Set<string>,
): Promise<ContentMatchResult> {
  const blob = await pdf.handle.getFile()
  const pdfMeta = await parsePdfContent(blob)

  const result: ContentMatchResult = {
    pdfName: pdf.name,
    xmlFileName: null,
    reason: 'Nincs egyezés',
    confidence: 'none',
    pdfMeta,
  }

  if (pdfMeta.parseError) {
    result.reason = `PDF parse hiba: ${pdfMeta.parseError}`
    return result
  }

  // Csak még nem párosított XML-eket vizsgáljuk
  const available = candidateXmls.filter((x) => !alreadyMatchedXmlNames.has(x.fileName))

  // ─── 1. CUI + összeg ± tolerancia ───
  if (pdfMeta.cui && pdfMeta.amount !== null) {
    const pdfCui = normalizeCui(pdfMeta.cui)
    const cuiAndAmount = available.filter((x) => {
      const xmlCui = normalizeCui(x.meta.supplier.cui)
      if (!xmlCui || xmlCui !== pdfCui) return false
      if (x.meta.amounts.brut === null) return false
      return Math.abs(x.meta.amounts.brut - pdfMeta.amount!) <= AMOUNT_TOL
    })
    if (cuiAndAmount.length === 1) {
      result.xmlFileName = cuiAndAmount[0].fileName
      result.confidence = 'high'
      result.reason = `CUI (${pdfMeta.cui}) + összeg egyezik (${pdfMeta.amount.toFixed(2)} RON)`
      return result
    }
    if (cuiAndAmount.length > 1 && pdfMeta.issueDate) {
      // Több jelölt CUI+összeggel — szűrjünk dátumra
      const withDate = cuiAndAmount.filter((x) => {
        if (!x.meta.issueDate) return false
        return daysBetween(x.meta.issueDate, pdfMeta.issueDate!) <= DATE_TOL_DAYS
      })
      if (withDate.length === 1) {
        result.xmlFileName = withDate[0].fileName
        result.confidence = 'high'
        result.reason = `CUI + összeg + dátum egyezik`
        return result
      }
    }
  }

  // ─── 2. CUI egyezés (gyengébb) ───
  if (pdfMeta.cui) {
    const pdfCui = normalizeCui(pdfMeta.cui)
    const cuiOnly = available.filter((x) => {
      const xmlCui = normalizeCui(x.meta.supplier.cui)
      return xmlCui && xmlCui === pdfCui
    })
    if (cuiOnly.length === 1) {
      result.xmlFileName = cuiOnly[0].fileName
      result.confidence = 'medium'
      result.reason = `Csak CUI egyezik (${pdfMeta.cui}) — összeg/dátum nem ellenőrizhető`
      return result
    }
  }

  // ─── 3. Számlaszám egyezés ───
  if (pdfMeta.invoiceNumber) {
    const pdfInv = pdfMeta.invoiceNumber.toUpperCase().replace(/\s/g, '')
    const invMatch = available.filter((x) => {
      const xmlInv = (x.meta.invoiceNumber || '').toUpperCase().replace(/\s/g, '')
      return xmlInv && (xmlInv === pdfInv || xmlInv.includes(pdfInv) || pdfInv.includes(xmlInv))
    })
    if (invMatch.length === 1) {
      result.xmlFileName = invMatch[0].fileName
      result.confidence = 'medium'
      result.reason = `Számlaszám egyezik (${pdfMeta.invoiceNumber})`
      return result
    }
  }

  // ─── 4. Csak összeg + dátum (low) ───
  if (pdfMeta.amount !== null && pdfMeta.issueDate) {
    const amountAndDate = available.filter((x) => {
      if (x.meta.amounts.brut === null || !x.meta.issueDate) return false
      if (Math.abs(x.meta.amounts.brut - pdfMeta.amount!) > AMOUNT_TOL) return false
      return daysBetween(x.meta.issueDate, pdfMeta.issueDate!) <= DATE_TOL_DAYS
    })
    if (amountAndDate.length === 1) {
      result.xmlFileName = amountAndDate[0].fileName
      result.confidence = 'low'
      result.reason = `Csak összeg + dátum egyezik (gyenge — kérlek erősítsd meg)`
      return result
    }
  }

  result.reason = pdfMeta.cui
    ? `Nincs XML ezzel a CUI-val (${pdfMeta.cui}) — vagy a beszállító még nincs könyvelve`
    : 'A PDF-ből nem sikerült CUI-t kinyerni'
  return result
}

/**
 * Csoportos tartalom-párosítás. Visszaadja az összes árva PDF eredményét.
 */
export async function batchMatchPdfsToXmls(
  orphanPdfs: OrphanPdfFile[],
  candidateXmls: XmlForContentMatch[],
): Promise<ContentMatchResult[]> {
  const results: ContentMatchResult[] = []
  const matchedXmlNames = new Set<string>()
  for (const pdf of orphanPdfs) {
    const r = await matchPdfToXmls(pdf, candidateXmls, matchedXmlNames)
    if (r.xmlFileName) matchedXmlNames.add(r.xmlFileName)
    results.push(r)
  }
  return results
}
