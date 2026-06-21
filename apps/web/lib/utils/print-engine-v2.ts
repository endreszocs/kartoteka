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
    // PNG (veszteségmentes) + nagyobb felbontás → éles szöveg, JPEG-artefaktok nélkül.
    // (A korábbi JPEG/scale:2 adott „fapados", elmosódott eredményt.)
    image: { type: 'png' },
    html2canvas: {
      scale: 3,
      useCORS: true,
      letterRendering: true,
      backgroundColor: '#ffffff',
    },
    jsPDF: {
      unit: 'mm',
      format: options?.format || 'a4',
      orientation: options?.orientation || 'portrait',
      compress: true,
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

/**
 * Böngészős nyomtatás.
 *
 * ELSŐDLEGES: külön ablak (`window.open`) — ez a legmegbízhatóbb módszer, a
 * rejtett iframe egyes környezetekben (és Tauri webview-ban) NEM nyitotta meg
 * a nyomtatási dialogot. A felhasználó gomb-kattintása ad user-activationt,
 * ezért a popup engedélyezett.
 *
 * TARTALÉK: ha a `window.open` null-t ad (popup-blokkoló), rejtett iframe-mel
 * próbálkozunk.
 */
export async function printToBrowser(
  htmlContent: string,
  options?: {
    cleanupDelayMs?: number
  },
) {
  const win = window.open('', '_blank', 'width=980,height=1100')

  if (win) {
    win.document.open()
    win.document.write(htmlContent)
    win.document.close()

    const triggerPrint = () => {
      try {
        win.focus()
        win.print()
      } catch {
        /* a felhasználó bezárhatta az ablakot */
      }
    }
    // Nyomtatás után zárjuk az ablakot.
    win.onafterprint = () => { try { win.close() } catch { /* ignore */ } }

    if (win.document.readyState === 'complete') {
      window.setTimeout(triggerPrint, 300)
    } else {
      win.addEventListener('load', () => window.setTimeout(triggerPrint, 300), { once: true })
      window.setTimeout(triggerPrint, 1200) // tartalék, ha a load nem jönne meg
    }
    return
  }

  // ── Tartalék: rejtett iframe (ha a popup blokkolva van) ──
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const fwin = iframe.contentWindow
  const doc = iframe.contentDocument || fwin?.document
  if (!fwin || !doc) {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    throw new Error('A böngészős nyomtatás nem indítható el. Engedélyezd a felugró ablakokat.')
  }

  doc.open()
  doc.write(htmlContent)
  doc.close()

  await new Promise<void>((resolve) => {
    let done = false
    const finish = () => { if (!done) { done = true; resolve() } }
    if (doc.readyState === 'complete') window.setTimeout(finish, 150)
    else iframe.addEventListener('load', () => window.setTimeout(finish, 150), { once: true })
    window.setTimeout(finish, 1200)
  })

  const cleanup = () => {
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }, options?.cleanupDelayMs ?? 1000)
  }
  fwin.addEventListener('afterprint', cleanup, { once: true })
  try {
    fwin.focus()
    fwin.print()
  } catch {
    cleanup()
    throw new Error('A nyomtatás indítása nem sikerült.')
  }
  window.setTimeout(cleanup, 60000)
}
