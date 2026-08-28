/**
 * Desktop HTML-nyomtatás (2026-06-11, Endre #4 — nyomtatási központ).
 *
 * A webes `print-engine-v2` (printToBrowser/printToPdf) desktop megfelelője:
 * a kész HTML-dokumentumot rejtett iframe-be írjuk és a rendszer
 * nyomtatás-párbeszédét nyitjuk (Tauri WebView2-kompatibilis). PDF-be mentés
 * a párbeszédből választható („Microsoft Print to PDF" nyomtató).
 */

export async function printHtmlViaIframe(html: string): Promise<void> {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (!doc) {
    document.body.removeChild(iframe)
    throw new Error('A nyomtatási nézet nem hozható létre.')
  }
  doc.open()
  doc.write(html)
  doc.close()

  // P3-18 (audit 2026-08-28): a FIX 300 ms versenyfutás volt — lassabb gépen
  // / nagy, többlapos hivatalos ívnél a print() FÉLBEHAGYOTT DOM-mal futott,
  // és a nyomtatvány csonkán jött ki. A webes print-engine-v2 bevált mintája:
  // TARTALOM-alapú készenlét (readyState + body.childElementCount), legfeljebb
  // 15 mp; ha a dokumentum lapszám-őrt kért (data-sheet-count), a lapoknak
  // TÉNYLEGESEN ott kell lenniük, különben HANGOS hiba — nem csonka papír.
  const deadline = Date.now() + 15000
  const bodyBetoltve = () => {
    const d = iframe.contentDocument
    return !!(d && d.body && d.body.childElementCount > 0)
  }
  while (Date.now() < deadline) {
    const d = iframe.contentDocument
    if (d && d.readyState === 'complete' && bodyBetoltve()) break
    await new Promise((r) => setTimeout(r, 100))
  }
  const keszDoc = iframe.contentDocument
  if (!keszDoc || !keszDoc.body || keszDoc.body.childElementCount === 0) {
    document.body.removeChild(iframe)
    throw new Error('A nyomtatási nézet nem töltött be (üres dokumentum) — próbáld újra.')
  }
  const vartLapszam = Number(keszDoc.body.dataset.sheetCount || '0')
  if (vartLapszam > 0) {
    let lapok = 0
    while (Date.now() < deadline) {
      lapok = keszDoc.querySelectorAll('body .sheet, body .page').length
      if (lapok >= vartLapszam) break
      await new Promise((r) => setTimeout(r, 100))
    }
    if (lapok < vartLapszam) {
      document.body.removeChild(iframe)
      throw new Error(
        `A nyomtatvány ${vartLapszam} lapjából csak ${lapok} töltött be — a csonka ` +
          'nyomtatás helyett megállítottuk. Próbáld újra.',
      )
    }
  }
  // Betűtípusok + rövid layout-stabilizáció (a web-engine mintája).
  try {
    const fonts = (keszDoc as Document & { fonts?: { ready: Promise<unknown> } }).fonts
    if (fonts?.ready) await Promise.race([fonts.ready, new Promise((r) => setTimeout(r, 2000))])
  } catch { /* nem kritikus */ }
  await new Promise((resolve) => setTimeout(resolve, 120))

  try {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
  } finally {
    // A print-dialógus modális — pár perc után takarítunk.
    setTimeout(() => {
      try {
        document.body.removeChild(iframe)
      } catch {
        /* már eltávolítva */
      }
    }, 60_000)
  }
}
