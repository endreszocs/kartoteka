/**
 * Nyomtatási motor v2
 * - PDF mentés html2pdf.js-szel
 * - közvetlen böngészős nyomtatás a rendszer nyomtatójára
 * A nyomtatás izolált iframe-ben történik, így nem örökli a teljes app CSS-ét.
 */

async function createPrintIframe(
  htmlContent: string,
  orientation: 'portrait' | 'landscape' = 'portrait',
) {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-9999px'
  iframe.style.top = '0'
  // 2026-08-14 (16. pont, gyökérok-javítás): az iframe a TÁJOLÁSHOZ igazodik.
  // Korábban FIXEN 210×297 (álló) volt — a fekvő nyomtatványok (Registru
  // Casa/Banca, Registrul-Jurnal, Csoportnapló: 297mm széles .page) egy
  // 210mm-es viewportban raszterizálódtak, ezért a PDF nem egyezett az
  // előnézettel (elcsúszott margók, más tördelés).
  iframe.style.width = orientation === 'landscape' ? '297mm' : '210mm'
  iframe.style.height = orientation === 'landscape' ? '210mm' : '297mm'

  // A valódi `load` eseményre várunk (srcdoc), nem fix időzítőre — így a
  // tartalom biztosan készen van, mielőtt nyomtatunk (megbízható dialog).
  const loaded = new Promise<void>((resolve) => {
    iframe.addEventListener('load', () => resolve(), { once: true })
  })
  document.body.appendChild(iframe)
  iframe.srcdoc = htmlContent

  // 2026-07-24 (PR-14, „1 lapos PDF" gyökérok): a korábbi FIX 1200 ms-os
  // versenyfutás lassabb gépen/nagy dokumentumnál FÉLBEHAGYOTT DOM-mal ment
  // tovább — a PDF-be csak az addig beparsolt lapok kerültek. Mostantól a
  // TÉNYLEGES készenlétet várjuk: load-esemény VAGY readyState==='complete',
  // legfeljebb 15 mp-ig pollozva; utána betű-betöltés + dupla layout-tick.
  const deadline = Date.now() + 15000
  let ready = false
  const markReady = () => { ready = true }
  void loaded.then(markReady)
  while (!ready && Date.now() < deadline) {
    const doc = iframe.contentDocument
    if (doc && doc.readyState === 'complete' && doc.body) ready = true
    else await new Promise((r) => window.setTimeout(r, 100))
  }
  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
  if (!iframeDoc || !iframeDoc.body) {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    throw new Error('A nyomtatási előnézet nem hozható létre.')
  }
  // Betűtípusok (ha a böngésző támogatja) + két képkocka a layout stabilizálódásához.
  try {
    const fonts = (iframeDoc as Document & { fonts?: { ready: Promise<unknown> } }).fonts
    if (fonts?.ready) await Promise.race([fonts.ready, new Promise((r) => window.setTimeout(r, 2000))])
  } catch { /* nem kritikus */ }
  await new Promise((resolve) => window.setTimeout(resolve, 120))

  return { iframe, iframeDoc }
}

/**
 * 2026-07-24 (PR-13, „üres PDF" gyökérok): laponkénti PDF-render.
 *
 * A html2pdf a TELJES dokumentumot EGYETLEN canvasra rasterizálja — egy
 * 10+ lapos névjegyzéknél ez ~30 000 px magas canvas, ami sok gépen túllépi
 * a GPU textúra-plafonját (~16 384 px) → a canvas némán ÜRES lesz, a mentett
 * PDF pedig fehér lapokból áll. A lapozott (.sheet) dokumentumainknál ehelyett
 * MINDEN lapot KÜLÖN (~3 000 px-es) canvasra renderelünk és külön PDF-oldalként
 * adunk hozzá — nincs canvas-plafon, és a lap-tördelés pixelpontos.
 *
 * A html2canvas + jspdf a html2pdf.js tranzitív függőségei (a lockfile rögzíti
 * őket) — közvetlenül importáljuk, új függőség nélkül.
 */
async function renderSheetsToPdf(
  sheets: HTMLElement[],
  filename: string,
): Promise<void> {
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  for (let i = 0; i < sheets.length; i++) {
    // Mért kompromisszum (2026-07-24, 292 soros teszt): scale 2.5 + JPEG 0.85
    // → 3 mp / 4,8 MB / ~240 DPI; a scale 3 + PNG 29 mp-et és 5,4 MB-ot adott.
    const canvas = await html2canvas(sheets[i], {
      scale: 2.5,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    })
    const img = canvas.toDataURL('image/jpeg', 0.85)
    if (i > 0) pdf.addPage('a4', 'portrait')
    pdf.addImage(img, 'JPEG', 0, 0, 210, 297)
  }
  // Védőháló: a PDF-oldalszámnak BETŰRE egyeznie kell a lapszámmal — különben
  // inkább hiba, mint csonka hivatalos dokumentum.
  const pageCount = (pdf as unknown as { getNumberOfPages(): number }).getNumberOfPages()
  if (pageCount !== sheets.length) {
    throw new Error(`PDF-oldalszám-eltérés (${pageCount}/${sheets.length}).`)
  }
  pdf.save(filename)
}

// 2026-07-17 (F3 P1 gyökérok): a html2pdf 0.14 a `.from(iframeDoc.body)` hívásnál
// CSAK a body-részfát klónozza — az iframe <head>-jében ülő <style> (a wrap()
// teljes stíluslapja) KIMARADT, így minden PDF stílus nélkül raszterizálódott
// (nincs táblázat-keret, rossz betű, elveszett oldaltörés). A stíluslapokat a
// body ELEJÉRE másoljuk (sorrendtartóan, fragmenttel), hogy a klónnal együtt
// utazzanak — és a .page:last-child/.sheet:last-child szelektorok is épek
// maradjanak (a lapok maradnak az utolsó elem-gyerekek).
// A html2canvas a KÉPERNYŐS médiát rendereli — a @media print szabályok maguktól
// nem élnek. Valódi print-emuláció: a dokumentum SAJÁT @media print szabályait
// emeljük be feltétel nélküli szabályként (a fragment végén → felülírják a
// képernyős értékeket).
function applyPrintStyles(iframeDoc: Document) {
  const styleFrag = iframeDoc.createDocumentFragment()
  iframeDoc.querySelectorAll('head style').forEach((el) => {
    styleFrag.appendChild(el.cloneNode(true))
  })
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
  // 2026-07-24 (PR-13): lapozott (.sheet) A4-dokumentumnál laponkénti render —
  // csak akkor, ha MINDEN lap ténylegesen lap-méretű (a túlnövő lapokat — pl.
  // egy-lapos „vizuális" nézetek — a bevált teljes-dokumentum útvonal viszi).
  if ((options?.orientation ?? 'portrait') === 'portrait') {
    const { iframe, iframeDoc } = await createPrintIframe(htmlContent)
    try {
      applyPrintStyles(iframeDoc)
      // ⛔ 2026-08-15 (Endre: „a PDF mentése üres dokumentumot ment") — GYÖKÉROK.
      // A laponkénti render eddig CSAK a `.sheet` osztályú lapokat ismerte fel,
      // a pénzügyi nyomtatványaink zöme viszont `.page`-et használ (Számadás,
      // Részszámadás, Költségvetés, Költségvetés-módosítás, Kiadási kísérőív —
      // budget-reporting.ts és reporting.ts). Ezek tehát MINDIG a régi,
      // teljes-dokumentumos útra estek, ami az egész iratot EGYETLEN canvasra
      // rasterizálja: egy 4–5 lapos A4 dokumentum ~15–19 ezer px magas, ami sok
      // gépen túllépi a GPU textúra-plafonját (~16 384 px) — a canvas ilyenkor
      // NÉMÁN ÜRES lesz, a mentett PDF pedig fehér lapokból áll. Pontosan az a
      // hibamód, amit ez a fájl a 62–69. sorban már leír, csak a szelektor nem
      // fedte le a `.page`-es dokumentumokat.
      // A `.page` felvétele biztonságos: a lentebbi `allPageSized` őr úgyis
      // visszaejt a régi útra, ha bármelyik lap nem lap-méretű, és ez az ág
      // csak ÁLLÓ tájolásnál fut (a fekvő Registru-k változatlanul a régi úton).
      const sheetEls = Array.from(
        iframeDoc.querySelectorAll<HTMLElement>('body .sheet, body .page'),
      )
      // 2026-07-24 (PR-14): a dokumentum a body-n hordozza a VÁRT lapszámot —
      // ha a DOM-ban kevesebb lap van (félbeszakadt betöltés), SOSEM mentünk
      // csonka hivatalos dokumentumot: hangos hibát adunk újrapróbálkozáshoz.
      const expected = Number(iframeDoc.body.dataset.sheetCount || '0')
      if (expected > 0 && sheetEls.length !== expected) {
        throw new Error(
          `A nyomtatvány nem töltött be hiánytalanul (${sheetEls.length}/${expected} lap) — kérlek, próbáld újra.`,
        )
      }
      if (sheetEls.length > 0) {
        const pageHeightPx = sheetEls[0].offsetWidth * (297 / 210)
        const allPageSized = sheetEls.every((s) => s.offsetHeight <= pageHeightPx * 1.02)
        if (allPageSized) {
          await renderSheetsToPdf(sheetEls, filename)
          return
        }
      }
    } catch (e) {
      // Ismert lapszámú (data-sheet-count) dokumentumnál NINCS néma fallback —
      // a teljes-dokumentum útvonal GPU-plafonos gépen üres PDF-et adna. A hibát
      // a hívó felszínre viszi (toast), a felhasználó újrapróbálhatja.
      if (iframeDoc.body?.dataset.sheetCount) {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
        throw e
      }
      // Lapszám-jelzés nélküli (régi) dokumentumok: visszaesés a bevált útra.
      console.warn('[printToPdf] laponkénti render sikertelen, fallback html2pdf-re:', e instanceof Error ? e.message : e)
    } finally {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }
  }
  return printToPdfLegacy(htmlContent, filename, options)
}

async function printToPdfLegacy(
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
  // 2026-08-14 (16. pont): a raszterizáló iframe a dokumentum tájolását kapja.
  const { iframe, iframeDoc } = await createPrintIframe(htmlContent, options?.orientation ?? 'portrait')
  applyPrintStyles(iframeDoc)

  // A html2pdf a klónt a FŐDOKUMENTUMBA fűzi a raszterizálás idejére (láthatatlan
  // overlay-ben) — a klónnal utazó <style>-ok viszont globálisak, és másodpercekre
  // átstílusoznák az app élő UI-ját. Fehér fátylat teszünk fölé, amíg a mentés fut.
  const veil = document.createElement('style')
  veil.textContent =
    'body > *:not(.html2pdf__overlay){visibility:hidden!important}body{background:#fff!important}'
  document.head.appendChild(veil)

  // 2026-07-17 (PR-2 F2.2, canvas-limit őr): a html2canvas EGY canvasra rendereli
  // a teljes dokumentumot; a Chromium canvas-dimenzió plafonja ~32 767px. Hosszú
  // (10+ oldalas) nyomtatványnál a fix scale:3 ezt túllépné → csonka/üres PDF.
  // A skálát a mért tartalom-magassághoz igazítjuk (rövid dokumentumnál marad 3).
  const MAX_CANVAS_PX = 30000
  const contentHeight = Math.max(iframeDoc.body.scrollHeight, 1)
  const safeScale = Math.max(1.25, Math.min(3, MAX_CANVAS_PX / contentHeight))

  const opt = {
    margin: options?.margin || [0, 0],
    filename,
    // PNG (veszteségmentes) + nagyobb felbontás → éles szöveg, JPEG-artefaktok nélkül.
    // (A korábbi JPEG/scale:2 adott „fapados", elmosódott eredményt.)
    image: { type: 'png' },
    html2canvas: {
      scale: safeScale,
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
