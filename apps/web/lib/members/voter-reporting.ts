/**
 * Választók névjegyzéke hivatalos nyomtatvány.
 *
 * A Valasztok_nevjegyzeke_minta.pdf struktúráját követi:
 * - Portré A4
 * - Fejléc: gyülekezet neve, cím, telefon
 * - Cím: "Választók névjegyzéke [ ÉÉÉÉ - ÉÉÉÉ+1 ]"
 * - Tábla: S.sz., Választó neve, Foglalkozás, Lakcím, Lakhelye, Felszólamás (Presb.hat, Esper.hat.)
 * - Záró szöveg + aláírások (lelkipásztor, gondnok)
 *
 * 2026-07-17 (PR-2 F2.1) — WYSIWYG LAPOZOTT séma (a lelkészi jelentés
 * print.ts + official-journal.ts bizonyított mintája):
 *   - @page margin 0; a lap-margót a .sheet padding adja (bal 18mm = lefűzés)
 *   - lap = .sheet div (210×297mm, page-break-after: always)
 *   - determinisztikus sor-tördelés lapokra, MINDEN lapon ismételt táblázat-fejléc
 *   - laponkénti "Oldal X / Y" lábléc (a CSS counter(page) Chromiumban element-
 *     tartalomban NEM működik — a korábbi minta emiatt sosem mutatott oldalszámot)
 *   - a záró szöveg + aláírások fixen az utolsó lapon (ha nem fér, saját lapon)
 * Ez egyszerre javítja: dupla margó, hiányzó oldalszám, PDF-beli sor-félbevágás
 * és a 2. oldaltól hiányzó táblázat-fejléc.
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
  /** 2026-07-24 (PR-12): a lapok száma — az előnézet fölött jelezzük, hogy a
   *  dokumentum többlapos és görgethető (a user az 1. lap 22 sorát látta csak). */
  sheetCount: number
}

function esc(v: string) {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

// Konzervatív lap-kapacitások (a sorok hosszú címnél 2 sorba törhetnek —
// a keret inkább hagyjon alul levegőt, mint hogy a tartalom átcsorogjon):
const ROWS_FIRST_SHEET = 22
const ROWS_PER_SHEET = 30
/** Ha az utolsó táblázat-lapon ennél több sor van, a záró blokk külön lapra kerül. */
const CLOSING_FITS_UNTIL_ROWS = 24

function voterStyles() {
  return `
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Times New Roman', serif; color: #111827; margin: 0; background: #e2e8f0; padding: 18px 0; }
    /* Bal 18mm: lefűzési (lyukasztás-)margó — a lelkészi jelentés mintája. */
    .sheet { width: 210mm; min-height: 297mm; margin: 0 auto 18px; background: #fff; box-shadow: 0 18px 40px rgba(15,23,42,.12); padding: 14mm 14mm 16mm 18mm; page-break-after: always; position: relative; overflow: hidden; }
    .sheet:last-child { page-break-after: auto; margin-bottom: 0; }
    .header { text-align: left; font-size: 11px; font-style: italic; margin-bottom: 8px; color: #475569; }
    .title { text-align: center; font-size: 16px; font-weight: bold; margin: 12px 0 10px; }
    .title-cont { text-align: center; font-size: 11px; font-weight: bold; margin: 0 0 6px; color: #475569; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th, td { border: 1px solid #334155; padding: 4px 6px; font-size: 10px; vertical-align: top; }
    th { background: #e2e8f0; text-align: center; font-weight: bold; }
    .text-center { text-align: center; }
    .closing { margin-top: 16px; font-size: 11px; line-height: 1.6; text-align: justify; }
    .date-line { margin-top: 12px; font-size: 11px; }
    .signature-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 24px; margin-top: 24px; }
    .signature-box { text-align: center; font-size: 11px; }
    .signature-line { margin-top: 30px; border-top: 1px solid #0f172a; padding-top: 4px; }
    .sheet-footer { position: absolute; bottom: 7mm; left: 18mm; right: 14mm; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
    @media print {
      body { background: #fff; padding: 0; }
      /* 296mm: 1mm ráhagyás, hogy a html2pdf lap-rácsán ne szülessen üres közlap. */
      .sheet { margin: 0; box-shadow: none; min-height: 296mm; }
    }
  `
}

function tableHead(): string {
  return `<thead>
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
  </thead>`
}

function voterTr(v: VoterRow, index: number): string {
  return `<tr>
    <td class="text-center">${index + 1}</td>
    <td>${esc(v.name)}</td>
    <td>${esc(v.occupation || '')}</td>
    <td>${esc(v.address || '')}</td>
    <td>${esc(v.settlement || '')}</td>
    <td></td>
    <td></td>
  </tr>`
}

export function buildVoterListReport(params: {
  voters: VoterRow[]
  year: number
  congregationName: string
  address?: string | null
  phone?: string | null
  /** Keltezés helysége (congregations.varos); fallback: a gyülekezetnév első szava. */
  city?: string | null
}): VoterPrintResult {
  const { voters, year, congregationName, address, phone, city } = params
  const yearRange = `${year} - ${year + 1}`

  const header = `<div class="header">
    <div>${esc(congregationName)}</div>
    ${address ? `<div>${esc(address)}</div>` : ''}
    ${phone ? `<div>Tel: ${esc(phone)}</div>` : ''}
  </div>`

  const closing = `<div class="closing">
    Jelen &bdquo;Választók névjegyzéke&rdquo; a Kánon I. Rész 3. Fejezete 37 §§. értelmében kettő megegyező példányban elkészült, a Kánon által előírt időben közszemlére bocsáttatott, és miután ellene felszólamás nem történt, a Presbitérium a maga részéről <strong>${voters.length}</strong> sorszámmal lezártnak tekinti, és az Esperesi Hivatal felé hitelesítés végett felterjeszti.
  </div>`

  const dateLine = `<div class="date-line">${esc(city || congregationName.split(' ')[0] || '')}, ${year}, május hó ___-én.</div>`

  const signatures = `<div class="signature-grid">
    <div class="signature-box"><div class="signature-line">lelkipásztor</div></div>
    <div class="signature-box"><div class="signature-line">gondnok</div></div>
  </div>`

  // ── Determinisztikus lapokra tördelés ────────────────────────────────
  const chunks: VoterRow[][] = []
  if (voters.length === 0) {
    chunks.push([])
  } else {
    let cursor = 0
    while (cursor < voters.length) {
      const capacity = chunks.length === 0 ? ROWS_FIRST_SHEET : ROWS_PER_SHEET
      chunks.push(voters.slice(cursor, cursor + capacity))
      cursor += capacity
    }
  }

  const lastChunkRows = chunks[chunks.length - 1].length
  const closingOnOwnSheet = lastChunkRows > CLOSING_FITS_UNTIL_ROWS
  const totalSheets = chunks.length + (closingOnOwnSheet ? 1 : 0)

  const footer = (page: number) =>
    `<div class="sheet-footer"><span>Kartotéka</span><span>Oldal ${page} / ${totalSheets}</span></div>`

  const closingBlock = `${closing}${dateLine}${signatures}`

  let rowOffset = 0
  const sheets: string[] = chunks.map((chunk, sheetIdx) => {
    const isFirst = sheetIdx === 0
    const isLastChunk = sheetIdx === chunks.length - 1
    const rowsHtml = chunk.map((v, i) => voterTr(v, rowOffset + i)).join('')
    rowOffset += chunk.length
    return `<div class="sheet">
      ${isFirst ? header : ''}
      ${isFirst
        ? `<div class="title">Választók névjegyzéke [ ${yearRange} ]</div>`
        : `<div class="title-cont">Választók névjegyzéke [ ${yearRange} ] — folytatás</div>`}
      <table>
        ${tableHead()}
        <tbody>${rowsHtml}</tbody>
      </table>
      ${isLastChunk && !closingOnOwnSheet ? closingBlock : ''}
      ${footer(sheetIdx + 1)}
    </div>`
  })

  if (closingOnOwnSheet) {
    sheets.push(`<div class="sheet">
      <div class="title-cont">Választók névjegyzéke [ ${yearRange} ] — lezárás</div>
      ${closingBlock}
      ${footer(totalSheets)}
    </div>`)
  }

  return {
    title: `Választók névjegyzéke ${yearRange}`,
    filename: `Valasztok_nevjegyzeke_${year}.pdf`,
    orientation: 'portrait',
    html: `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>Választók névjegyzéke</title><style>${voterStyles()}</style></head><body>${sheets.join('')}</body></html>`,
    sheetCount: totalSheets,
  }
}
