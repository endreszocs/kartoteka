'use client'

/**
 * PDF tartalom-elemző az ANAF e-Factura PDF-ekhez.
 *
 * A `pdfjs-dist` segítségével kinyerjük a PDF teljes szövegét, majd
 * regex-ekkel kihalászgatjuk a számla kulcsadatait:
 *   - Beszállító CUI (CIF / CUI / Cod TVA)
 *   - Számlaszám (Nr. / Seria + Nr.)
 *   - Bruttó összeg (Total de plată / Total / TOTAL)
 *   - Beszállító név (a fejléc első sorai alapján)
 *   - Dátum (Data / Data emiterii)
 *
 * Ezeket az adatokat összevetjük az UBL XML-ek metaadataival
 * → tartalom-alapú párosítás (fájlnévtől függetlenül).
 *
 * Lazy import — a pdfjs-dist nagy package, csak az első hívásnál tölti be.
 */

export type PdfExtractedMeta = {
  /** A kinyert teljes szöveg (debugoláshoz). */
  fullText: string
  /** Beszállító CUI normalizálva (RO prefix nélkül, csak digit). */
  cui: string | null
  /** Beszállító név (best effort — a fejléc első sora). */
  supplierName: string | null
  /** Számlaszám / iratszám. */
  invoiceNumber: string | null
  /** Bruttó összeg RON-ban. */
  amount: number | null
  /** Kibocsátási dátum (YYYY-MM-DD) ha kinyerhető. */
  issueDate: string | null
  /** Hibaüzenet ha a parse sikertelen. */
  parseError: string | null
}

/** CUI normalizálás: levágja a "RO" prefixet és trim-eli. */
function normalizeCui(raw: string | null): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/^RO/i, '').replace(/\s/g, '').trim()
  if (!/^\d{2,12}$/.test(cleaned)) return null
  return cleaned
}

/** Összeg-string parse-olás (`1.234,56` vagy `1,234.56` → 1234.56). */
function parseAmount(raw: string | null): number | null {
  if (!raw) return null
  const s = raw.replace(/\s/g, '').trim()
  if (!s) return null
  // Ha tartalmaz vesszőt ÉS pontot, a vessző tizedes (RO formátum):
  // 1.234,56 → 1234.56
  // 1,234.56 → 1234.56 (US formátum)
  let normalized: string
  if (s.includes(',') && s.includes('.')) {
    const lastComma = s.lastIndexOf(',')
    const lastDot = s.lastIndexOf('.')
    if (lastComma > lastDot) {
      // RO: 1.234,56 — ezreselválasztó pont, tizedesvessző
      normalized = s.replace(/\./g, '').replace(',', '.')
    } else {
      // US: 1,234.56 — ezreselválasztó vessző, tizedespont
      normalized = s.replace(/,/g, '')
    }
  } else if (s.includes(',')) {
    // 1234,56 — tizedesvessző
    normalized = s.replace(',', '.')
  } else {
    normalized = s
  }
  const n = parseFloat(normalized)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Dátum-string parse-olás (DD.MM.YYYY / YYYY-MM-DD / DD/MM/YYYY). */
function parseDate(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()

  // YYYY-MM-DD
  let m = trimmed.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`

  // DD.MM.YYYY (RO szabvány)
  m = trimmed.match(/(\d{1,2})[.\\/](\d{1,2})[.\\/](\d{4})/)
  if (m) {
    const dd = m[1].padStart(2, '0')
    const mm = m[2].padStart(2, '0')
    return `${m[3]}-${mm}-${dd}`
  }

  return null
}

// ─────────────────────────────────────────────────────────────
// PDF.js singleton + worker setup
// ─────────────────────────────────────────────────────────────

let pdfjsModulePromise: Promise<typeof import('pdfjs-dist')> | null = null

async function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = (async () => {
      const mod = await import('pdfjs-dist')
      // Worker URL — a CDN-ről töltjük, hogy a Next.js bundle-be ne kerüljön.
      // FONTOS: csak akkor, ha a hívó (pl. a Tauri-desktop) NEM állított be előzőleg
      // egy lokálisan bundle-ölt worker-URL-t — offline desktopon a CDN nem érhető el.
      try {
        if (!mod.GlobalWorkerOptions.workerSrc) {
          mod.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${mod.version}/pdf.worker.min.mjs`
        }
      } catch {
        // Néhány Next.js runtime-on a worker setup nem szükséges (main thread)
      }
      return mod
    })()
  }
  return pdfjsModulePromise
}

// ─────────────────────────────────────────────────────────────
// A fő extrakciós függvény
// ─────────────────────────────────────────────────────────────

export async function parsePdfContent(blob: Blob): Promise<PdfExtractedMeta> {
  const result: PdfExtractedMeta = {
    fullText: '',
    cui: null,
    supplierName: null,
    invoiceNumber: null,
    amount: null,
    issueDate: null,
    parseError: null,
  }

  try {
    const pdfjs = await getPdfjs()
    const arrayBuffer = await blob.arrayBuffer()
    const pdf = await pdfjs.getDocument({
      data: arrayBuffer,
      // Kicsi PDF-ekhez (1-3 oldal) elég
      disableAutoFetch: true,
      disableStream: true,
    }).promise

    // Csak az első 3 oldalt olvassuk (a számla fejléce + összesítés ott van)
    const maxPages = Math.min(pdf.numPages, 3)
    const lines: string[] = []
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      // Items-eket sor-szerűen csoportosítjuk Y-koordináta alapján
      // (egyszerűsítés: minden item-et külön sornak veszünk)
      for (const item of textContent.items) {
        if ('str' in item && item.str.trim()) {
          lines.push(item.str.trim())
        }
      }
    }

    const fullText = lines.join('\n')
    result.fullText = fullText

    // ─── CUI / CIF kinyerés ───
    // Tipikus minták:
    //   "Cod TVA: RO28909028"
    //   "CUI: 12345678"
    //   "CIF RO12345678"
    //   "CUI/CIF: RO12345678"
    // A FELADÓ (FURNIZOR/Beszállító) CUI-ja kell — ami a PDF tetején van,
    // NEM a vevőé (CLIENT).
    //
    // Egyszerű heurisztika: az ELSŐ CUI-t vesszük (általában a fejlécben
    // a kibocsátó áll). Ha "FURNIZOR" / "CLIENT" markerek vannak, akkor
    // a FURNIZOR utáni CUI-t.
    const cuiPattern = /(?:Cod\s*TVA|CIF|CUI)[\s:.\\/]*(?:RO\s*)?(\d{2,12})/gi
    const allCuis: { cui: string; index: number }[] = []
    let cuiMatch
    while ((cuiMatch = cuiPattern.exec(fullText)) !== null) {
      const c = normalizeCui(cuiMatch[1])
      if (c) allCuis.push({ cui: c, index: cuiMatch.index })
    }

    if (allCuis.length > 0) {
      // Ha találunk CLIENT marker-t, akkor a CLIENT ELŐTTI CUI-t választjuk
      // (= furnizor CUI). Egyébként az elsőt.
      const clientMarker = fullText.search(/\bCLIENT\b|\bCUMP[ĂA]R[ĂA]TOR\b|\bDESTINATAR\b/i)
      if (clientMarker > 0) {
        const beforeClient = allCuis.filter((c) => c.index < clientMarker)
        result.cui = (beforeClient.length > 0 ? beforeClient[0] : allCuis[0]).cui
      } else {
        result.cui = allCuis[0].cui
      }
    }

    // ─── Számlaszám ───
    // Tipikus minták:
    //   "Seria FCT Nr. 123456"
    //   "FACTURA Nr.: 123456"
    //   "Nr. factură: 12345"
    //   "Nr. ECC0042"
    const invoicePatterns = [
      /Seria\s+([A-Z0-9]+)\s+(?:Nr\.?\s*)?(\d+)/i,
      /(?:Factura|FACTURA)\s+(?:Nr\.?\s*)?[:.]?\s*([A-Z0-9-]+)/i,
      /Nr\.?\s*factur[aă][:.]?\s*([A-Z0-9-]+)/i,
      /Nr\.?\s*([A-Z]{2,5}\d{3,8})/,
    ]
    for (const pat of invoicePatterns) {
      const m = fullText.match(pat)
      if (m) {
        result.invoiceNumber = m[2] ? `${m[1]}${m[2]}` : m[1]
        break
      }
    }

    // ─── Bruttó összeg ───
    // Tipikus minták:
    //   "Total de plată: 534,65"
    //   "TOTAL: 1.234,56 RON"
    //   "Total general: 534,65"
    //   "TOTAL DE PLATĂ 534,65 lei"
    const amountPatterns = [
      /Total\s+(?:de\s+)?plat[aă][\s:.]*?([\d.,]+)\s*(?:RON|LEI|lei)?/i,
      /Total\s+general[\s:.]*?([\d.,]+)/i,
      /TOTAL[\s:.]*?([\d.,]+)\s*(?:RON|LEI|lei)/i,
    ]
    for (const pat of amountPatterns) {
      const m = fullText.match(pat)
      if (m) {
        const n = parseAmount(m[1])
        if (n !== null) {
          result.amount = n
          break
        }
      }
    }

    // ─── Dátum ───
    // Tipikus minták:
    //   "Data: 03.03.2026"
    //   "Data emiterii: 2026-03-03"
    //   "Data factură: 03/03/2026"
    const datePatterns = [
      /Data\s+(?:emiterii|factur[aă])?[\s:.]*?(\d{1,2}[.\\/-]\d{1,2}[.\\/-]\d{4})/i,
      /Data\s+(?:emiterii|factur[aă])?[\s:.]*?(\d{4}-\d{2}-\d{2})/i,
      /Data[\s:.]+?(\d{1,2}[.\\/-]\d{1,2}[.\\/-]\d{4})/i,
    ]
    for (const pat of datePatterns) {
      const m = fullText.match(pat)
      if (m) {
        const d = parseDate(m[1])
        if (d) {
          result.issueDate = d
          break
        }
      }
    }

    // ─── Beszállító név (legfelső szöveg-sorok közül) ───
    // Az első 3-5 nem-üres sor általában a beszállító neve
    const headerLines = lines.slice(0, 8).filter((l) => l.length > 3)
    // Az első sor ami NEM "S.C.", "FURNIZOR", "FACTURA" markerszó
    for (const line of headerLines) {
      if (/^(?:S\.C\.|FURNIZOR|FACTUR[AĂ]|FACTURA|Cod|CIF|CUI|Adresa|Nr\.|Seria)/i.test(line)) {
        continue
      }
      if (line.length >= 5 && !/^\d/.test(line)) {
        result.supplierName = line
        break
      }
    }
  } catch (e) {
    result.parseError = e instanceof Error ? e.message : String(e)
  }

  return result
}
