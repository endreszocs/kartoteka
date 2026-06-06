/**
 * Nyomtatási motor v2
 * - PDF mentés html2pdf.js-szel
 * - közvetlen böngészős nyomtatás a rendszer nyomtatójára
 * A nyomtatás izolált iframe-ben történik, így nem örökli a teljes app CSS-ét.
 */

async function createPrintIframe(htmlContent: string) {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-9999px'
  iframe.style.top = '0'
  iframe.style.width = '210mm'
  iframe.style.height = '297mm'

  // A valódi `load` eseményre várunk (srcdoc), nem fix időzítőre — így a
  // tartalom biztosan készen van, mielőtt nyomtatunk (megbízható dialog).
  const loaded = new Promise<void>((resolve) => {
    iframe.addEventListener('load', () => resolve(), { once: true })
  })
  document.body.appendChild(iframe)
  iframe.srcdoc = htmlContent

  // Biztonsági időkorlát, ha a load esemény valamiért nem érkezne meg.
  await Promise.race([loaded, new Promise((r) => window.setTimeout(r, 1200))])
  // Egy extra tick a layout/betűk stabilizálódásához.
  await new Promise((resolve) => window.setTimeout(resolve, 120))

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
  if (!iframeDoc) {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    throw new Error('A nyomtatási előnézet nem hozható létre.')
  }

  return { iframe, iframeDoc }
}

export async function printToPdf(
  htmlContent: string,
  filename: string,
  options?: {
    orientation?: 'portrait' | 'landscape'
    margin?: number[]
    format?: string
  },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html2pdf = (await import('html2pdf.js' as any)).default
  const { iframe, iframeDoc } = await createPrintIframe(htmlContent)

  const opt = {
    margin: options?.margin || [0, 0],
    filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: {
      unit: 'mm',
      format: options?.format || 'a4',
      orientation: options?.orientation || 'portrait',
    },
    // A CSS oldaltörések (.page / break-after / break-inside:avoid) tiszteletben
    // tartása — így a sorok nem csúsznak ketté az oldalhatáron.
    pagebreak: { mode: ['css', 'legacy'] },
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (html2pdf as any)().set(opt).from(iframeDoc.body).save()
  } finally {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe)
    }
  }
}

export async function printToBrowser(
  htmlContent: string,
  options?: {
    cleanupDelayMs?: number
  },
) {
  const { iframe } = await createPrintIframe(htmlContent)
  const printWindow = iframe.contentWindow

  if (!printWindow) {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe)
    }
    throw new Error('A böngészős nyomtatás nem indítható el.')
  }

  const cleanup = () => {
    window.setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe)
      }
    }, options?.cleanupDelayMs ?? 800)
  }

  printWindow.addEventListener('afterprint', cleanup, { once: true })
  printWindow.focus()
  printWindow.print()
}
