/**
 * Választók névjegyzéke hivatalos nyomtatvány.
 *
 * A Valasztok_nevjegyzeke_minta.pdf struktúráját követi:
 * - Portré A4
 * - Fejléc: gyülekezet neve, cím, telefon
 * - Cím: "Választók névjegyzéke [ ÉÉÉÉ - ÉÉÉÉ+1 ]"
 * - Tábla: S.sz., Választó neve, Foglalkozás, Lakcím, Lakhelye, Felszólamás (Presb.hat, Esper.hat.)
 * - Záró szöveg + aláírások (lelkipásztor, gondnok)
 */

export interface VoterRow {
  name: string
  occupation: string | null
  address: string | null
  settlement: string | null
}

export interface VoterPrintResult {
  title: string
  filename: string
  orientation: 'portrait' | 'landscape'
  html: string
}

function esc(v: string) {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function voterStyles() {
  return `
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; color: #111827; margin: 0; background: #e2e8f0; padding: 18px 0; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto 18px; background: #fff; box-shadow: 0 18px 40px rgba(15,23,42,.12); padding: 12mm; break-after: page; position: relative; }
    .page:last-child { break-after: auto; }
    .header { text-align: left; font-size: 11px; font-style: italic; margin-bottom: 8px; color: #475569; }
    .title { text-align: center; font-size: 16px; font-weight: bold; margin: 16px 0 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #334155; padding: 4px 6px; font-size: 10px; vertical-align: top; }
    th { background: #e2e8f0; text-align: center; font-weight: bold; }
    thead { display: table-header-group; }
    tr, td, th { page-break-inside: avoid; }
    .text-center { text-align: center; }
    .closing { margin-top: 16px; font-size: 11px; line-height: 1.6; text-align: justify; }
    .date-line { margin-top: 12px; font-size: 11px; }
    .signature-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 24px; margin-top: 24px; }
    .signature-box { text-align: center; font-size: 11px; }
    .signature-line { margin-top: 30px; border-top: 1px solid #0f172a; padding-top: 4px; }
    .page-footer { position: absolute; bottom: 12mm; left: 12mm; right: 12mm; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
    @media print { body { background: #fff; padding: 0; } .page { width: auto; min-height: auto; margin: 0; box-shadow: none; } }
  `
}

export function buildVoterListReport(params: {
  voters: VoterRow[]
  year: number
  congregationName: string
  address?: string | null
  phone?: string | null
}): VoterPrintResult {
  const { voters, year, congregationName, address, phone } = params
  const yearRange = `${year} - ${year + 1}`

  let rows = ''
  voters.forEach((v, i) => {
    rows += `<tr>
      <td class="text-center">${i + 1}</td>
      <td>${esc(v.name)}</td>
      <td>${esc(v.occupation || '')}</td>
      <td>${esc(v.address || '')}</td>
      <td>${esc(v.settlement || '')}</td>
      <td></td>
      <td></td>
    </tr>`
  })

  const header = `<div class="header">
    <div>${esc(congregationName)}</div>
    ${address ? `<div>${esc(address)}</div>` : ''}
    ${phone ? `<div>Tel: ${esc(phone)}</div>` : ''}
  </div>`

  const closing = `<div class="closing">
    Jelen &bdquo;Választók névjegyzéke&rdquo; a Kánon I. Rész 3. Fejezete 37 §§. értelmében kettő megegyező példányban elkészült, a Kánon által előírt időben közszemlére bocsáttatott, és miután ellene felszólamás nem történt, a Presbitérium a maga részéről <strong>${voters.length}</strong> sorszámmal lezártnak tekinti, és az Esperesi Hivatal felé hitelesítés végett felterjeszti.
  </div>`

  const dateLine = `<div class="date-line">${esc(congregationName.split(' ')[0] || '')}, ${year}, május hó ___-én.</div>`

  const signatures = `<div class="signature-grid">
    <div class="signature-box"><div class="signature-line">lelkipásztor</div></div>
    <div class="signature-box"><div class="signature-line">gondnok</div></div>
  </div>`

  const content = `<div class="page">
    ${header}
    <div class="title">Választók névjegyzéke [ ${yearRange} ]</div>
    <table>
      <thead>
        <tr>
          <th style="width:6%">S.sz.</th>
          <th style="width:28%">Választó neve</th>
          <th style="width:14%">Foglalkozás</th>
          <th style="width:20%">Lakcím</th>
          <th style="width:14%">Lakhelye</th>
          <th colspan="2" style="width:18%">Felszólamás esetén</th>
        </tr>
        <tr>
          <th></th><th></th><th></th><th></th><th></th>
          <th>Presb.hat.</th>
          <th>Esper.hat.</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${closing}
    ${dateLine}
    ${signatures}
    <div class="page-footer">
      <span>Kartotéka</span>
      <span></span>
    </div>
  </div>`

  return {
    title: `Választók névjegyzéke ${yearRange}`,
    filename: `Valasztok_nevjegyzeke_${year}.pdf`,
    orientation: 'portrait',
    html: `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>Választók névjegyzéke</title><style>${voterStyles()}</style></head><body>${content}</body></html>`,
  }
}
