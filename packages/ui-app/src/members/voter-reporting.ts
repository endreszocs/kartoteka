/**
 * Választók névjegyzéke hivatalos nyomtatvány — KÖZÖS építő (web + desktop).
 *
 * A Valasztok_nevjegyzeke_minta.pdf struktúráját követi:
 * - Portré A4, WYSIWYG lapozott séma (@page margin 0; lap = .sheet div)
 * - Tábla: S.sz., Választó neve, Foglalkozás, Lakcím, Lakhelye, Felszólamás
 * - Záró szöveg + aláírások (lelkipásztor, gondnok)
 *
 * 2026-07-24 (PR-13 — felhasználói észrevételek):
 *   - MINDEN lapon teljes fejléc: egyházközség LOGÓJA + neve + címe + telefonja
 *     (nincs többé „folytatás" felirat)
 *   - a lap TELJES kihasználása: a cellák egysorosak (ellipszis), így a
 *     sormagasság determinisztikus és a kapacitás biztonsággal növelhető
 *   - oldalszám „1/8" formátumban minden lap alján
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
  /** A lapok száma — az előnézet fölött jelezzük, hogy a dokumentum többlapos. */
  sheetCount: number
}

function esc(v: string) {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

// Lap-kapacitások — a cellák EGYSOROSAK (nowrap + ellipszis), ezért a
// sormagasság determinisztikus (~21px). A4 hasznos magasság ~1009px
// (297mm − 14+16mm padding); fejléc+cím+táblafejléc ~150px → ~40 sor férne,
// 36-tal biztonsági ráhagyást tartunk.
const ROWS_PER_SHEET = 36
/** Ha az utolsó táblázat-lapon ennél több sor van, a záró blokk külön lapra kerül. */
const CLOSING_FITS_UNTIL_ROWS = 28

function voterStyles() {
  return `
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Times New Roman', serif; color: #111827; margin: 0; background: #e2e8f0; padding: 18px 0; }
    /* Bal 18mm: lefűzési (lyukasztás-)margó — a lelkészi jelentés mintája. */
    .sheet { width: 210mm; min-height: 297mm; margin: 0 auto 18px; background: #fff; box-shadow: 0 18px 40px rgba(15,23,42,.12); padding: 12mm 14mm 16mm 18mm; page-break-after: always; position: relative; overflow: hidden; }
    .sheet:last-child { page-break-after: auto; margin-bottom: 0; }
    .letterhead { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #334155; padding-bottom: 6px; margin-bottom: 8px; }
    .letterhead img { width: 15mm; height: 15mm; object-fit: contain; flex: 0 0 auto; }
    .letterhead .lh-text { font-size: 11px; line-height: 1.35; color: #1f2937; }
    .letterhead .lh-name { font-size: 13px; font-weight: bold; }
    .note { font-size: 10px; font-style: italic; color: #475569; margin: 2px 0 4px; }
    .title { text-align: center; font-size: 15px; font-weight: bold; margin: 8px 0 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 2px; table-layout: fixed; }
    th, td { border: 1px solid #334155; padding: 3px 6px; font-size: 10px; vertical-align: top; }
    /* Egysoros cellák: determinisztikus sormagasság → tele lap, átfolyás nélkül. */
    td { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    th { background: #e2e8f0; text-align: center; font-weight: bold; }
    .text-center { text-align: center; }
    .closing { margin-top: 14px; font-size: 11px; line-height: 1.6; text-align: justify; }
    .date-line { margin-top: 12px; font-size: 11px; }
    .signature-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 24px; margin-top: 24px; }
    .signature-box { text-align: center; font-size: 11px; }
    .signature-line { margin-top: 30px; border-top: 1px solid #0f172a; padding-top: 4px; }
    .sheet-footer { position: absolute; bottom: 7mm; left: 18mm; right: 14mm; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
    @media print {
      body { background: #fff; padding: 0; }
      /* 296mm: 1mm ráhagyás, hogy a nyomtató lap-rácsán ne szülessen üres közlap. */
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
    <td title="${esc(v.name)}">${esc(v.name)}</td>
    <td>${esc(v.occupation || '')}</td>
    <td title="${esc(v.address || '')}">${esc(v.address || '')}</td>
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
  /** Az egyházközség címere/logója — data-URL ajánlott (a PDF-render és a
   *  nyomtatás is biztosan látja); http(s) URL is működik betöltés után. */
  logoUrl?: string | null
  /** Opcionális dőlt megjegyzés-sor az 1. lap fejléce alatt
   *  (pl. a desktop-nyomtatvány adatforrás-megjegyzése). */
  note?: string | null
}): VoterPrintResult {
  const { voters, year, congregationName, address, phone, city, logoUrl, note } = params
  const yearRange = `${year} - ${year + 1}`

  // 2026-07-24 (PR-13): teljes fejléc MINDEN lapon — logó + adatok.
  const letterhead = `<div class="letterhead">
    ${logoUrl ? `<img src="${esc(logoUrl)}" alt="" />` : ''}
    <div class="lh-text">
      <div class="lh-name">${esc(congregationName)}</div>
      ${address ? `<div>${esc(address)}</div>` : ''}
      ${phone ? `<div>Tel: ${esc(phone)}</div>` : ''}
    </div>
  </div>`

  const closing = `<div class="closing">
    Jelen &bdquo;Választók névjegyzéke&rdquo; a Kánon I. Rész 3. Fejezete 37 §§. értelmében kettő megegyező példányban elkészült, a Kánon által előírt időben közszemlére bocsáttatott, és miután ellene felszólamás nem történt, a Presbitérium a maga részéről <strong>${voters.length}</strong> sorszámmal lezártnak tekinti, és az Esperesi Hivatal felé hitelesítés végett felterjeszti.
  </div>`

  const dateLine = `<div class="date-line">${esc(city || congregationName.split(' ')[0] || '')}, ${year}, május hó ___-én.</div>`

  const signatures = `<div class="signature-grid">
    <div class="signature-box"><div class="signature-line">lelkipásztor</div></div>
    <div class="signature-box"><div class="signature-line">gondnok</div></div>
  </div>`

  // ── Determinisztikus lapokra tördelés (egységes kapacitás minden lapon,
  //    mert a fejléc minden lapon azonos helyet foglal) ──────────────────
  const chunks: VoterRow[][] = []
  if (voters.length === 0) {
    chunks.push([])
  } else {
    let cursor = 0
    while (cursor < voters.length) {
      chunks.push(voters.slice(cursor, cursor + ROWS_PER_SHEET))
      cursor += ROWS_PER_SHEET
    }
  }

  const lastChunkRows = chunks[chunks.length - 1].length
  const closingOnOwnSheet = lastChunkRows > CLOSING_FITS_UNTIL_ROWS
  const totalSheets = chunks.length + (closingOnOwnSheet ? 1 : 0)

  // 2026-07-24 (PR-13): oldalszám „1/8" formátumban.
  const footer = (page: number) =>
    `<div class="sheet-footer"><span>Kartotéka · ${esc(congregationName)}</span><span>${page}/${totalSheets}</span></div>`

  const closingBlock = `${closing}${dateLine}${signatures}`

  let rowOffset = 0
  const sheets: string[] = chunks.map((chunk, sheetIdx) => {
    const isFirst = sheetIdx === 0
    const isLastChunk = sheetIdx === chunks.length - 1
    const rowsHtml = chunk.map((v, i) => voterTr(v, rowOffset + i)).join('')
    rowOffset += chunk.length
    return `<div class="sheet">
      ${letterhead}
      ${isFirst && note ? `<div class="note">${esc(note)}</div>` : ''}
      <div class="title">Választók névjegyzéke [ ${yearRange} ]</div>
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
      ${letterhead}
      <div class="title">Választók névjegyzéke [ ${yearRange} ] — lezárás</div>
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
