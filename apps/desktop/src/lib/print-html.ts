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
  await new Promise((resolve) => setTimeout(resolve, 300))
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
