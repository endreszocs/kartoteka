/**
 * Adatlap-grafikonok — beágyazott SVG a nyomtatható lelkészi jelentéshez
 * (2026-08-14, 18. pont 4. szelet).
 *
 * MIÉRT SAJÁT SVG: a nyomtatható HTML-ben nincs helye külső libnek — a
 * print-engine (html2canvas) az inline SVG-t laponként pixelre raszterizálja,
 * így a PDF-ben pontosan az jelenik meg, ami az előnézetben. SZÁNDÉKOSAN
 * nulla importtal készül (selftest önállóan fordítja).
 */

export interface AdatlapPont {
  ev: number
  ertek: number | null
}

function esc(v: string): string {
  return v
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function fmtErtek(n: number): string {
  const kerek = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10
  const parts = String(kerek).split('.')
  parts[0] = (parts[0] || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return parts.join(',')
}

/**
 * Egyszerű oszlopdiagram évek szerint (nyomtatásbarát: fekete-szürke, keret,
 * érték a oszlop fölött, évszám alatta). Hiányzó évre (ertek: null) halvány,
 * áthúzott jelölés kerül — a hiány LÁTSSZON, ne csússzon össze az idősor.
 * @returns SVG-sztring, vagy '' ha nincs egyetlen értékes pont sem.
 */
export function epitOszlopdiagram(cim: string, pontok: AdatlapPont[], egyseg: string): string {
  const ertekes = pontok.filter((p) => p.ertek !== null && Number.isFinite(p.ertek))
  if (ertekes.length === 0) return ''

  const W = 640
  const H = 200
  const M = { fent: 28, lent: 26, bal: 10, jobb: 10 }
  const belsoW = W - M.bal - M.jobb
  const belsoH = H - M.fent - M.lent
  const max = Math.max(...ertekes.map((p) => p.ertek as number), 1)

  const n = pontok.length
  const sav = belsoW / n
  const oszlopW = Math.min(56, sav * 0.6)

  let oszlopok = ''
  pontok.forEach((p, i) => {
    const cx = M.bal + sav * i + sav / 2
    const evY = H - 8
    if (p.ertek === null || !Number.isFinite(p.ertek)) {
      // hiányzó év: pontozott alapvonal-jel + halvány évszám
      oszlopok += `<text x="${cx}" y="${H - M.lent - 4}" text-anchor="middle" font-size="11" fill="#999">–</text>
        <text x="${cx}" y="${evY}" text-anchor="middle" font-size="10" fill="#999">${p.ev}</text>`
      return
    }
    const h = Math.max(1, Math.round((p.ertek / max) * belsoH))
    const y = M.fent + (belsoH - h)
    oszlopok += `<rect x="${(cx - oszlopW / 2).toFixed(1)}" y="${y}" width="${oszlopW.toFixed(1)}" height="${h}" fill="#4a5568" />
      <text x="${cx}" y="${y - 4}" text-anchor="middle" font-size="10" fill="#111">${esc(fmtErtek(p.ertek))}</text>
      <text x="${cx}" y="${evY}" text-anchor="middle" font-size="10" fill="#333">${p.ev}</text>`
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(cim)}">
    <text x="${M.bal}" y="16" font-size="12" font-weight="bold" fill="#111">${esc(cim)}${egyseg ? ` (${esc(egyseg)})` : ''}</text>
    <line x1="${M.bal}" y1="${H - M.lent}" x2="${W - M.jobb}" y2="${H - M.lent}" stroke="#333" stroke-width="1" />
    ${oszlopok}
  </svg>`
}
