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

  // 2026-07-17 (F3 P1 gyökérok): a html2pdf 0.14 a `.from(iframeDoc.body)` hívásnál
  // CSAK a body-részfát klónozza — az iframe <head>-jében ülő <style> (a wrap()
  // teljes stíluslapja) KIMARADT, így minden PDF stílus nélkül raszterizálódott
  // (nincs táblázat-keret, rossz betű, elveszett oldaltörés). A stíluslapokat a
  // body ELEJÉRE másoljuk (sorrendtartóan, fragmenttel), hogy a klónnal együtt
  // utazzanak — és a .page:last-child/.sheet:last-child szelektorok is épek
  // maradjanak (a lapok maradnak az utolsó elem-gyerekek).
  const styleFrag = iframeDoc.createDocumentFragment()
  iframeDoc.querySelectorAll('head style').forEach((el) => {
    styleFrag.appendChild(el.cloneNode(true))
  })
  // A html2canvas a KÉPERNYŐS médiát rendereli — a @media print szabályok maguktól
  // nem élnek. Valódi print-emuláció: a dokumentum SAJÁT @media print szabályait
  // emeljük be feltétel nélküli szabályként (a fragment végén → felülírják a
  // képernyős értékeket). Így minden dokumentum a saját nyomtatási értékeit kapja
  // (pl. .page min-height 208/295mm — a képernyős 297mm túllógna a html2pdf
  // lap-rácsán és üres közlapokat szúrna be), a body-paddinggel margózó
  // dokumentumok (pl. iratcsomó-leltár) pedig érintetlenek maradnak.
  let printCss = ''
  for (const sheet of Array.from(iframeDoc.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        const mediaRule = rule as CSSMediaRule
        if (mediaRule.media && mediaRule.media.mediaText.includes('print')) {
          printCss += Array.from(mediaRule.cssRules).map((r) => r.cssText).join('\n') + '\n'
        }
      }
    } catch {
      /* nem olvasható stíluslap — kihagyjuk */
    }
  }
  if (printCss) {
    const printEmu = iframeDoc.createElement('style')
    printEmu.textContent = printCss
    styleFrag.appendChild(printEmu)
  }
  iframeDoc.body.insertBefore(styleFrag, iframeDoc.body.firstChild)

  // A html2pdf a klónt a FŐDOKUMENTUMBA fűzi a raszterizálás idejére (láthatatlan
  // overlay-ben) — a klónnal utazó <style>-ok viszont globálisak, és másodpercekre
  // átstílusoznák az app élő UI-ját. Fehér fátylat teszünk fölé, amíg a mentés fut.
  const veil = document.createElement('style')
  veil.textContent =
    'body > *:not(.html2pdf__overlay){visibility:hidden!important}body{background:#fff!important}'
  document.head.appendChild(veil)

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
    veil.remove()
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

    // 2026-07-17 (F3): guard a dupla nyomtatás ellen — a load-listener ÉS az
    // 1200ms-os tartalék időzítő közül csak az első hathat (az iframe-ágban a
    // 'done' zászló már régóta ezt csinálja, a popup-ágból kimaradt).
    let printed = false
    const triggerPrint = () => {
      if (printed) return
      printed = true
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
