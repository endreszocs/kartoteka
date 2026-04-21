/**
 * Nyomtatás motor — html2pdf.js wrapper
 * FONTOS: A html2canvas nem támogatja a lab()/oklch() CSS színfüggvényeket,
 * ezért a nyomtatás egy izolált iframe-ben történik, ahol nincs Tailwind CSS.
 */

export async function printToPdf(
  htmlContent: string,
  filename: string,
  options?: {
    orientation?: 'portrait' | 'landscape'
    margin?: number[]
    format?: string
  }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html2pdf = (await import('html2pdf.js' as any)).default

  // Izolált iframe — nem örökli a Tailwind CSS oklch/lab változókat
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-9999px'
  iframe.style.top = '0'
  iframe.style.width = '210mm'
  iframe.style.height = '297mm'
  document.body.appendChild(iframe)

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
  if (!iframeDoc) { document.body.removeChild(iframe); return }

  iframeDoc.open()
  iframeDoc.write(htmlContent)
  iframeDoc.close()

  // Várjuk meg amíg renderel
  await new Promise(r => setTimeout(r, 200))

  const opt = {
    margin: options?.margin || [10, 10],
    filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: {
      unit: 'mm',
      format: options?.format || 'a4',
      orientation: options?.orientation || 'portrait',
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (html2pdf as any)().set(opt).from(iframeDoc.body).save()
  document.body.removeChild(iframe)
}

/**
 * Közös nyomtatás stílus — CSAK hex színek, nincs oklch/lab!
 */
export const PRINT_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4 portrait; margin: 15mm; }
  body { font-family: 'Times New Roman', serif; color: #000000; background: #ffffff; font-size: 11pt; line-height: 1.4; }
  h1 { text-align: center; text-transform: uppercase; border-bottom: 2px solid #000000; padding-bottom: 10px; margin-bottom: 20px; color: #000000; }
  h2 { font-size: 13pt; margin-top: 20px; margin-bottom: 8px; color: #000000; }
  .section-title { font-weight: bold; background-color: #e2e8f0; border: 1px solid #000000; padding: 6px 10px; margin-top: 20px; text-transform: uppercase; font-size: 10pt; color: #000000; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10pt; }
  th, td { border: 1px solid #000000; padding: 5px; text-align: left; vertical-align: middle; color: #000000; }
  th { background-color: #f1f5f9; font-weight: bold; text-align: center; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .bold { font-weight: bold; }
  .group-row { font-weight: bold; background-color: #f9f9f9; }
  .total-row { font-weight: bold; background-color: #e2e8f0; border-top: 2px solid #000000; }
  .meta { text-align: right; font-style: italic; margin-bottom: 20px; font-size: 9pt; color: #666666; }
  .footer { margin-top: 30px; font-size: 9pt; color: #666666; text-align: center; }
`
