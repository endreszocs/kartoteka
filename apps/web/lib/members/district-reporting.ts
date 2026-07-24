/**
 * Körzet-névsor nyomtatvány (2026-07-24, PR-10, 3. észrevétel).
 *
 * A választói névjegyzék WYSIWYG lapozott sémáját követi (voter-reporting.ts):
 *   @page margin 0 + .sheet 210×297mm + laponkénti „Oldal X / Y".
 *
 * Két nézet:
 *  - 'list'  : egyszerű, tömör névsor táblázat (nyomtatásbarát).
 *  - 'visual': a családok VIZUÁLIS kártyaként (a családtagok együtt) + külön
 *              szekció az egyedülállóknak — a user kérése a „névsor vizuális
 *              megjelenítővel családok esetén".
 */

import type { DistrictPrintData, DistrictPrintPerson } from '@/app/(dashboard)/tagnyilvantartas/district-print-actions'

export interface DistrictPrintResult {
  title: string
  filename: string
  orientation: 'portrait'
  html: string
}

function esc(v: string) {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function ageOf(szDatum: string | null): string {
  if (!szDatum) return ''
  const b = new Date(szDatum)
  if (Number.isNaN(b.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const had = now.getMonth() > b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() >= b.getDate())
  if (!had) age -= 1
  return `${age} é`
}

function allapotBadge(allapot: string | null): string {
  if (allapot === 'özvegy') return '<span class="badge badge-w">özv.</span>'
  if (allapot === 'elvált') return '<span class="badge badge-d">elv.</span>'
  return ''
}

const ROWS_FIRST = 26
const ROWS_PER = 34

function styles() {
  return `
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Times New Roman', serif; color: #111827; margin: 0; background: #e2e8f0; padding: 18px 0; }
    .sheet { width: 210mm; min-height: 297mm; margin: 0 auto 18px; background: #fff; box-shadow: 0 18px 40px rgba(15,23,42,.12); padding: 14mm 14mm 16mm 18mm; page-break-after: always; position: relative; overflow: hidden; }
    .sheet:last-child { page-break-after: auto; margin-bottom: 0; }
    @media print { body { background: #fff; padding: 0; } .sheet { margin: 0; box-shadow: none; min-height: 296mm; } }
    .header { font-size: 11px; color: #475569; }
    .title { text-align: center; font-size: 16px; font-weight: bold; margin: 8px 0 4px; }
    .subtitle { text-align: center; font-size: 11px; color: #475569; margin-bottom: 10px; }
    .stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin: 8px 0 12px; }
    .stat { border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 4px; text-align: center; }
    .stat .num { font-size: 15px; font-weight: bold; color: #0f766e; }
    .stat .lbl { font-size: 8px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #334155; padding: 3px 6px; font-size: 10px; vertical-align: top; }
    th { background: #e2e8f0; text-align: left; font-weight: bold; }
    .text-center { text-align: center; }
    .fam-head td { background: #f0fdfa; font-weight: bold; }
    .badge { display: inline-block; border-radius: 4px; padding: 0 4px; font-size: 8px; font-weight: bold; margin-left: 3px; }
    .badge-w { background: #fef3c7; color: #92400e; }
    .badge-d { background: #ffe4e6; color: #9f1239; }
    .sheet-footer { position: absolute; bottom: 7mm; left: 18mm; right: 14mm; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
    .section-title { font-size: 12px; font-weight: bold; margin: 12px 0 4px; color: #0f766e; }
    /* Vizuális családkártyák */
    .fam-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
    .fam-card { border: 1px solid #99f6e4; border-radius: 8px; padding: 6px 8px; break-inside: avoid; }
    .fam-card .fc-name { font-weight: bold; font-size: 11px; color: #134e4a; margin-bottom: 3px; }
    .fam-card .fc-member { font-size: 10px; display: flex; justify-content: space-between; gap: 6px; padding: 1px 0; border-top: 1px dotted #cbd5e1; }
    .fam-card .fc-member:first-of-type { border-top: none; }
    .fc-role { color: #64748b; font-size: 8px; }
  `
}

function statsBlock(stats: DistrictPrintData['stats']): string {
  return `<div class="stats">
    <div class="stat"><div class="num">${stats.families}</div><div class="lbl">Család</div></div>
    <div class="stat"><div class="num">${stats.people}</div><div class="lbl">Fő összesen</div></div>
    <div class="stat"><div class="num">${stats.standalone}</div><div class="lbl">Egyedülálló</div></div>
    <div class="stat"><div class="num">${stats.single}</div><div class="lbl">Ebből egyedül</div></div>
    <div class="stat"><div class="num">${stats.widowed}</div><div class="lbl">Özvegy</div></div>
    <div class="stat"><div class="num">${stats.divorced}</div><div class="lbl">Elvált</div></div>
  </div>`
}

function personRow(p: DistrictPrintPerson, index: number): string {
  return `<tr>
    <td class="text-center">${index}</td>
    <td>${esc(p.nev)}${allapotBadge(p.allapot)}</td>
    <td class="text-center">${p.ferfi === true ? '♂' : p.ferfi === false ? '♀' : ''}</td>
    <td class="text-center">${ageOf(p.sz_datum)}</td>
    <td>${esc(p.lakcim)}</td>
  </tr>`
}

/** Egyszerű, lapozott névsor-táblázat. */
function buildListReport(data: DistrictPrintData): DistrictPrintResult {
  const tableHead = `<thead><tr>
    <th style="width:6%">#</th><th style="width:38%">Név</th>
    <th style="width:8%" class="text-center">Nem</th><th style="width:10%" class="text-center">Kor</th>
    <th style="width:38%">Lakcím</th>
  </tr></thead>`

  const chunks: DistrictPrintPerson[][] = []
  let cursor = 0
  const people = data.persons
  if (people.length === 0) chunks.push([])
  while (cursor < people.length) {
    const cap = chunks.length === 0 ? ROWS_FIRST : ROWS_PER
    chunks.push(people.slice(cursor, cursor + cap))
    cursor += cap
  }
  const total = chunks.length

  let rowOffset = 0
  const sheets = chunks.map((chunk, i) => {
    const first = i === 0
    const rows = chunk.map((p, j) => personRow(p, rowOffset + j + 1)).join('')
    rowOffset += chunk.length
    return `<div class="sheet">
      ${first ? `<div class="header">${esc(data.congregationName)}</div>
        <div class="title">${esc(data.districtName)} — körzeti névsor</div>
        <div class="subtitle">${new Date().toLocaleDateString('hu-HU')}</div>
        ${statsBlock(data.stats)}` : `<div class="subtitle">${esc(data.districtName)} — folytatás</div>`}
      <table>${tableHead}<tbody>${rows}</tbody></table>
      <div class="sheet-footer"><span>Kartotéka · ${esc(data.congregationName)}</span><span>Oldal ${i + 1} / ${total}</span></div>
    </div>`
  })

  return {
    title: `${data.districtName} — körzeti névsor`,
    filename: `Korzet_${data.districtName.replace(/[^\p{L}\p{N}]+/gu, '_')}.pdf`,
    orientation: 'portrait',
    html: `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>${esc(data.districtName)}</title><style>${styles()}</style></head><body>${sheets.join('')}</body></html>`,
  }
}

/** Vizuális: családkártyák + egyedülállók szekció (egyetlen görgő lap, a
 *  böngésző/PDF tördeli a kártyák break-inside:avoid szabálya szerint). */
function buildVisualReport(data: DistrictPrintData): DistrictPrintResult {
  // Családonként csoportosítás
  const byFamily = new Map<number, DistrictPrintPerson[]>()
  const singles: DistrictPrintPerson[] = []
  for (const p of data.persons) {
    if (p.standalone || p.familyId == null) singles.push(p)
    else {
      const arr = byFamily.get(p.familyId) || []
      arr.push(p)
      byFamily.set(p.familyId, arr)
    }
  }

  const famCards = [...byFamily.entries()]
    .sort((a, b) => (a[1][0]?.familyName || '').localeCompare(b[1][0]?.familyName || '', 'hu'))
    .map(([fid, members]) => {
      const name = members[0]?.familyName || `Család #${fid}`
      const memberRows = members
        .sort((a, b) => (b.ferfi === true ? 1 : 0) - (a.ferfi === true ? 1 : 0))
        .map((m) => `<div class="fc-member"><span>${m.ferfi === true ? '♂' : m.ferfi === false ? '♀' : '•'} ${esc(m.nev)}${allapotBadge(m.allapot)}</span><span class="fc-role">${ageOf(m.sz_datum)}</span></div>`)
        .join('')
      return `<div class="fam-card"><div class="fc-name">${esc(name)} <span class="fc-role">(${members.length} fő)</span></div>${memberRows}</div>`
    })
    .join('')

  const singleRows = singles
    .map((p) => `<tr><td>${esc(p.nev)}${allapotBadge(p.allapot)}</td><td class="text-center">${p.ferfi === true ? '♂' : p.ferfi === false ? '♀' : ''}</td><td class="text-center">${ageOf(p.sz_datum)}</td><td>${esc(p.lakcim)}</td></tr>`)
    .join('')

  const content = `<div class="sheet" style="page-break-after:auto;min-height:auto">
    <div class="header">${esc(data.congregationName)}</div>
    <div class="title">${esc(data.districtName)} — körzeti névsor (családi nézet)</div>
    <div class="subtitle">${new Date().toLocaleDateString('hu-HU')}</div>
    ${statsBlock(data.stats)}
    ${famCards ? `<div class="section-title">Családok (${byFamily.size})</div><div class="fam-grid">${famCards}</div>` : ''}
    ${singles.length > 0 ? `<div class="section-title">Egyedülállók, özvegyek, elváltak (${singles.length})</div>
      <table><thead><tr><th style="width:44%">Név</th><th style="width:8%" class="text-center">Nem</th><th style="width:10%" class="text-center">Kor</th><th style="width:38%">Lakcím</th></tr></thead><tbody>${singleRows}</tbody></table>` : ''}
    <div class="sheet-footer"><span>Kartotéka · ${esc(data.congregationName)}</span><span>${esc(data.districtName)}</span></div>
  </div>`

  return {
    title: `${data.districtName} — körzeti névsor (családi nézet)`,
    filename: `Korzet_${data.districtName.replace(/[^\p{L}\p{N}]+/gu, '_')}_csaladi.pdf`,
    orientation: 'portrait',
    html: `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>${esc(data.districtName)}</title><style>${styles()}</style></head><body>${content}</body></html>`,
  }
}

export function buildDistrictReport(data: DistrictPrintData, view: 'list' | 'visual'): DistrictPrintResult {
  return view === 'visual' ? buildVisualReport(data) : buildListReport(data)
}
