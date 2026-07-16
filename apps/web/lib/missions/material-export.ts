'use client'

/**
 * Missziós Műhely segédanyag-export.
 *
 * A jelenlegi segédanyagok tartalma plain text. Minden adatot HTML escape után
 * illesztünk a saját, statikus dokumentumsablonunkba; felhasználói HTML-t vagy
 * scriptet soha nem futtatunk. A PDF egy script nélküli, sandboxolt iframe-ben
 * készül, a Word-változat pedig Word által megnyitható, UTF-8-as HTML `.doc`.
 */

type MaterialCategoryReference = {
  mm_kategoriak?: { nev?: string | null } | null
}

export type WorkshopMaterialExportInput = {
  id?: string
  cim: string
  leiras?: string | null
  forras_url?: string | null
  forras_nev?: string | null
  formatum?: string | null
  feltolto_nev?: string | null
  feltolto_gyulekezet?: string | null
  created_at?: string | null
  mm_segedanyag_kategoriak?: readonly MaterialCategoryReference[]
}

type ExportTarget = 'pdf' | 'word'

type MaterialTextBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'labelled'; label: string; text: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }

const FORMAT_LABELS: Record<string, string> = {
  PDF: 'PDF dokumentum',
  DOCX: 'Word dokumentum',
  PPTX: 'Prezentáció',
  video: 'Videó',
  link: 'Webes hivatkozás',
  csomag: 'Segédanyagcsomag',
}

const MAX_FILENAME_LENGTH = 72

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function safeHttpUrl(value?: string | null): string | null {
  if (!value) return null

  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.toString()
      : null
  } catch {
    return null
  }
}

function formatHungarianDate(value?: string | null): string {
  if (!value) return 'Nincs megadva'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Nincs megadva'

  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

function materialBaseFilename(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_FILENAME_LENGTH)
    .replace(/-+$/g, '')

  return slug || 'misszios-muhely-segedanyag'
}

function isEmojiLedHeading(line: string): boolean {
  if (line.length > 110) return false
  const firstCodePoint = line.codePointAt(0)
  if (firstCodePoint === undefined) return false

  return (
    (firstCodePoint >= 0x2600 && firstCodePoint <= 0x27bf) ||
    (firstCodePoint >= 0x1f300 && firstCodePoint <= 0x1faff)
  )
}

function parsePlainText(content?: string | null): MaterialTextBlock[] {
  const lines = String(content || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')

  const blocks: MaterialTextBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index].trim()
    if (!line) {
      index += 1
      continue
    }

    const markdownHeading = line.match(/^(#{1,3})\s+(.+)$/)
    if (markdownHeading) {
      blocks.push({
        type: 'heading',
        level: markdownHeading[1].length >= 3 ? 3 : 2,
        text: markdownHeading[2].trim(),
      })
      index += 1
      continue
    }

    const bulletItem = line.match(/^(?:[-*•])\s+(.+)$/)
    if (bulletItem) {
      const items: string[] = []
      while (index < lines.length) {
        const match = lines[index].trim().match(/^(?:[-*•])\s+(.+)$/)
        if (!match) break
        items.push(match[1].trim())
        index += 1
      }
      blocks.push({ type: 'list', ordered: false, items })
      continue
    }

    const orderedItem = line.match(/^\d+[.)]\s+(.+)$/)
    if (orderedItem) {
      const items: string[] = []
      while (index < lines.length) {
        const match = lines[index].trim().match(/^\d+[.)]\s+(.+)$/)
        if (!match) break
        items.push(match[1].trim())
        index += 1
      }
      blocks.push({ type: 'list', ordered: true, items })
      continue
    }

    const quote = line.match(/^>\s*(.+)$/)
    if (quote) {
      blocks.push({ type: 'quote', text: quote[1].trim() })
      index += 1
      continue
    }

    if (isEmojiLedHeading(line)) {
      blocks.push({ type: 'heading', level: 3, text: line })
      index += 1
      continue
    }

    const labelled = line.match(/^([^:]{2,36}):\s+(.+)$/)
    const normalizedLabel = labelled?.[1].trim().toLowerCase()
    if (labelled && normalizedLabel !== 'http' && normalizedLabel !== 'https') {
      blocks.push({
        type: 'labelled',
        label: labelled[1].trim(),
        text: labelled[2].trim(),
      })
      index += 1
      continue
    }

    blocks.push({ type: 'paragraph', text: line })
    index += 1
  }

  return blocks
}

function renderTextBlocks(content?: string | null): string {
  const blocks = parsePlainText(content)
  if (blocks.length === 0) {
    return '<p class="empty-copy">Ehhez a segédanyaghoz még nem tartozik részletes leírás.</p>'
  }

  return blocks
    .map((block) => {
      if (block.type === 'heading') {
        const tag = block.level === 2 ? 'h2' : 'h3'
        return `<${tag}>${escapeHtml(block.text)}</${tag}>`
      }

      if (block.type === 'labelled') {
        return `<p class="labelled"><strong>${escapeHtml(block.label)}:</strong> ${escapeHtml(block.text)}</p>`
      }

      if (block.type === 'quote') {
        return `<blockquote>${escapeHtml(block.text)}</blockquote>`
      }

      if (block.type === 'list') {
        const tag = block.ordered ? 'ol' : 'ul'
        const items = block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
        return `<${tag}>${items}</${tag}>`
      }

      return `<p>${escapeHtml(block.text)}</p>`
    })
    .join('\n')
}

function exportStyles(target: ExportTarget): string {
  const root = '[data-material-export-root]'
  const pageStyles = target === 'word'
    ? `
      @page Section1 { size: 595.3pt 841.9pt; margin: 49.6pt 49.6pt 56.7pt; }
      ${root} { page: Section1; width: auto; min-height: 0; padding: 0; }
    `
    : `
      @page { size: A4 portrait; margin: 16mm 17mm; }
      ${root} { width: 176mm; min-height: 265mm; padding: 0; }
    `

  return `
    ${root}, ${root} * { box-sizing: border-box; }
    ${root} {
      margin: 0 auto;
      padding: 0;
      color: #26382f;
      background: #ffffff;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 11.25pt;
      line-height: 1.62;
      overflow-wrap: anywhere;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    ${pageStyles}
    ${root} .brand {
      margin: 0 0 10pt;
      color: #647a52;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8.5pt;
      font-weight: 700;
      letter-spacing: 1.4pt;
      text-transform: uppercase;
    }
    ${root} h1 {
      margin: 0 0 9pt;
      color: #26382f;
      font-size: 27pt;
      font-weight: 700;
      line-height: 1.12;
      page-break-after: avoid;
      break-after: avoid;
    }
    ${root} .subtitle-rule {
      width: 42mm;
      height: 2pt;
      margin: 0 0 14pt;
      border: 0;
      background: #d3a45e;
    }
    ${root} .category-row { margin: 0 0 12pt; }
    ${root} .category {
      display: inline-block;
      margin: 0 5pt 4pt 0;
      padding: 2.5pt 7pt;
      border: 0.75pt solid #d8cbb8;
      border-radius: 10pt;
      color: #526943;
      background: #f4ebdd;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8pt;
      font-weight: 700;
    }
    ${root} .meta-table {
      width: 100%;
      margin: 0 0 18pt;
      border-collapse: separate;
      border-spacing: 5pt;
      table-layout: fixed;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    ${root} .meta-table td {
      width: 50%;
      padding: 7pt 8pt;
      border: 0.75pt solid #e2d8ca;
      border-radius: 7pt;
      color: #35443a;
      background: #f8f2e9;
      vertical-align: top;
    }
    ${root} .meta-label {
      display: block;
      margin-bottom: 1pt;
      color: #7b7468;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.5pt;
      text-transform: uppercase;
    }
    ${root} .meta-value { font-size: 9.5pt; line-height: 1.35; }
    ${root} .content h2, ${root} .content h3 {
      color: #314b3b;
      page-break-after: avoid;
      break-after: avoid;
    }
    ${root} .content h2 { margin: 18pt 0 7pt; font-size: 17pt; line-height: 1.24; }
    ${root} .content h3 { margin: 14pt 0 6pt; font-size: 13pt; line-height: 1.3; }
    ${root} .content p { margin: 0 0 8pt; orphans: 3; widows: 3; }
    ${root} .content .labelled { margin-bottom: 5pt; }
    ${root} .content ul, ${root} .content ol { margin: 3pt 0 10pt 18pt; padding-left: 8pt; }
    ${root} .content li { margin: 0 0 4pt; page-break-inside: avoid; break-inside: avoid; }
    ${root} .content blockquote {
      margin: 12pt 0;
      padding: 7pt 11pt;
      border-left: 3pt solid #d3a45e;
      color: #4f5e53;
      background: #fbf5e9;
      font-style: italic;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    ${root} .empty-copy { color: #747b72; font-style: italic; }
    ${root} .source {
      margin-top: 17pt;
      padding: 9pt 11pt;
      border: 0.75pt solid #d9cebc;
      color: #526157;
      background: #faf7f0;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8.75pt;
      line-height: 1.45;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    ${root} .source strong { color: #314b3b; }
    ${root} a { color: #526943; text-decoration: underline; }
    ${root} .footer {
      margin-top: 24pt;
      padding-top: 8pt;
      border-top: 0.75pt solid #ded2c0;
      color: #7a8077;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 7.5pt;
      text-align: center;
    }
  `
}

/**
 * Tiszta, determinisztikus HTML dokumentum. Tesztelhető külön is; az eredmény
 * kizárólag escape-elt adatot és a saját statikus sablonunkat tartalmazza.
 */
export function buildMaterialExportHtml(
  material: WorkshopMaterialExportInput,
  target: ExportTarget = 'pdf',
): string {
  const documentStyles = exportStyles(target)
  const categories = Array.from(new Set(
    (material.mm_segedanyag_kategoriak || [])
      .map((entry) => entry.mm_kategoriak?.nev?.trim())
      .filter((name): name is string => Boolean(name)),
  ))

  const categoryHtml = categories.length > 0
    ? `<div class="category-row">${categories.map((name) => `<span class="category">${escapeHtml(name)}</span>`).join('')}</div>`
    : ''

  const formatLabel = FORMAT_LABELS[material.formatum || ''] || material.formatum || 'Segédanyag'
  const safeSourceUrl = safeHttpUrl(material.forras_url)
  const sourceName = material.forras_nev?.trim()
  const sourceHtml = safeSourceUrl || sourceName
    ? `
      <aside class="source">
        <strong>Forrás:</strong>
        ${sourceName ? escapeHtml(sourceName) : ''}
        ${safeSourceUrl ? `${sourceName ? '<br>' : ''}<a href="${escapeHtml(safeSourceUrl)}">${escapeHtml(safeSourceUrl)}</a>` : ''}
      </aside>
    `
    : ''

  const wordNamespaces = target === 'word'
    ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"'
    : ''

  const wordSettings = target === 'word'
    ? `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom></w:WordDocument></xml><![endif]-->`
    : ''

  return `<!doctype html>
<html lang="hu"${wordNamespaces}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(material.cim)}</title>
  ${wordSettings}
  <style>${documentStyles}</style>
</head>
<body>
  <main class="export-page" data-material-export-root>
    <!-- A html2pdf a forráselemet a fő dokumentumba klónozza. A stíluslapot
         ezért a klónozott gyökérben is visszük, nem csak az iframe headjében. -->
    <style data-material-export-styles>${documentStyles}</style>
    <p class="brand">Missziós Műhely · Kartotéka</p>
    <h1>${escapeHtml(material.cim)}</h1>
    <hr class="subtitle-rule">
    ${categoryHtml}
    <table class="meta-table" role="presentation">
      <tr>
        <td><span class="meta-label">Feltöltötte</span><span class="meta-value">${escapeHtml(material.feltolto_nev || 'Ismeretlen')}</span></td>
        <td><span class="meta-label">Gyülekezet</span><span class="meta-value">${escapeHtml(material.feltolto_gyulekezet || 'Nincs megadva')}</span></td>
      </tr>
      <tr>
        <td><span class="meta-label">Megosztva</span><span class="meta-value">${escapeHtml(formatHungarianDate(material.created_at))}</span></td>
        <td><span class="meta-label">Eredeti forma</span><span class="meta-value">${escapeHtml(formatLabel)}</span></td>
      </tr>
    </table>
    <article class="content">${renderTextBlocks(material.leiras)}</article>
    ${sourceHtml}
    <footer class="footer">Közös tapasztalat a szolgálathoz · Missziós Műhely · Kartotéka</footer>
  </main>
</body>
</html>`
}

function requireBrowser(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('A dokumentum letöltése csak böngészőben indítható.')
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

async function createSandboxedPdfFrame(html: string): Promise<{
  iframe: HTMLIFrameElement
  content: HTMLElement
}> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  // A tartalom nem futtathat scriptet és nem navigálhat. A same-origin kizárólag
  // azért kell, hogy a html2canvas hozzáférjen a kész dokumentum DOM-jához.
  iframe.setAttribute('sandbox', 'allow-same-origin')
  iframe.style.position = 'fixed'
  iframe.style.left = '-10000px'
  iframe.style.top = '0'
  iframe.style.width = '210mm'
  iframe.style.height = '297mm'
  iframe.style.border = '0'
  iframe.style.pointerEvents = 'none'

  const loaded = new Promise<void>((resolve) => {
    iframe.addEventListener('load', () => resolve(), { once: true })
  })

  iframe.srcdoc = html
  // A srcdoc-ot még a DOM-ba illesztés előtt állítjuk be. Ellenkező esetben
  // egyes böngészők az üres about:blank első load eseményét jelzik késznek.
  document.body.appendChild(iframe)

  await Promise.race([loaded, delay(1500)])

  const iframeDocument = iframe.contentDocument
  const content = iframeDocument?.querySelector<HTMLElement>('.export-page')
  if (!iframeDocument || !content) {
    iframe.remove()
    throw new Error('A PDF dokumentum előkészítése nem sikerült.')
  }

  if (iframeDocument.fonts) {
    await Promise.race([iframeDocument.fonts.ready.then(() => undefined), delay(800)])
  }
  await delay(80)

  return { iframe, content }
}

/**
 * A4-es PDF mentése a meglévő html2pdf.js motorral.
 * Telefonon kisebb canvas-scale védi a böngészőt a memóriaelfogyástól.
 */
export async function downloadMaterialAsPdf(material: WorkshopMaterialExportInput): Promise<void> {
  requireBrowser()

  // A csomagnak nincs saját TypeScript deklarációja; a projekt más nyomtatási
  // motorjai is dinamikusan, kizárólag kliensoldalon töltik be.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html2pdf = (await import('html2pdf.js' as any)).default
  const html = buildMaterialExportHtml(material, 'pdf')
  const { iframe, content } = await createSandboxedPdfFrame(html)
  const isCompactScreen = window.matchMedia('(max-width: 640px)').matches
  const contentLength = material.leiras?.length || 0
  const canvasScale = isCompactScreen
    ? (contentLength > 15_000 ? 1.25 : 1.5)
    : (contentLength > 30_000 ? 1.75 : 2)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (html2pdf as any)()
      .set({
        // A html2pdf margin minden új oldalon megismétlődik; így a hosszú
        // segédanyag második és további oldalai sem tapadnak a papír széléhez.
        margin: [16, 17, 16, 17],
        filename: `${materialBaseFilename(material.cim)}.pdf`,
        image: { type: 'png' },
        html2canvas: {
          scale: canvasScale,
          useCORS: false,
          letterRendering: true,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: 0,
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait',
          compress: true,
        },
        pagebreak: { mode: ['css', 'legacy'] },
      })
      .from(content)
      .save()
  } finally {
    iframe.remove()
  }
}

/**
 * UTF-8-as, Microsoft Word által megnyitható `.doc` letöltés.
 * Nem használ külső konvertert, ezért telefonon is kis memóriaigényű.
 */
export function downloadMaterialAsWord(material: WorkshopMaterialExportInput): void {
  requireBrowser()

  const html = buildMaterialExportHtml(material, 'word')
  const blob = new Blob(['\ufeff', html], {
    type: 'application/msword;charset=utf-8',
  })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = `${materialBaseFilename(material.cim)}.doc`
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()

  // Mobil Safari esetén a letöltés később veszi át a Blob URL-t; ezért nem
  // vonjuk vissza azonnal, de hosszú életű erőforrást sem hagyunk hátra.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}
