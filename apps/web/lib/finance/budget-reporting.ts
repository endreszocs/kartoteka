/**
 * Költségvetés / Számadás hivatalos nyomtatványok.
 *
 * A hivatalos minta (költségvetés_Minta.pdf, v7.4a) elrendezését követi:
 *  - tiszta, monokróm A4 álló űrlap (festéktakarékos, nincs színes kitöltés)
 *  - kétnyelvű oszlopok: Denumire (román) | Megnevezés (magyar)
 *  - Nr. rând / Sorszám · Capitol/subcapitol / Fejezet · Prevederi / Költségvetés
 *  - félkövér csoport- és összegsorok, jobbra igazított összegek
 *  - hivatalos aláírási blokk (Lelkipásztor, Főgondnok, Számvevő)
 */

import type { SzamadasiCel } from '@/lib/constants/finance'
import type { BudgetCompatRow } from '@/lib/finance/budget-compat'

// ---------------------------------------------------------------------------
// Típusok
// ---------------------------------------------------------------------------

export type BudgetPrintType =
  | 'koltsegvetes'
  | 'koltsegvetes_modositas'
  | 'szamadas'
  | 'reszszamadas'

export interface BudgetPrintResult {
  title: string
  filename: string
  orientation: 'portrait' | 'landscape'
  html: string
}

export const BUDGET_PRINT_TYPES: Array<{
  id: BudgetPrintType
  title: string
  subtitle: string
  description: string
}> = [
  {
    id: 'koltsegvetes',
    title: 'Költségvetés',
    subtitle: 'Végleges költségvetési terv',
    description: 'Az éves költségvetés hivatalos nyomtatványa az egyházmegye számára.',
  },
  {
    id: 'koltsegvetes_modositas',
    title: 'Költségvetés módosítás',
    subtitle: 'Módosított költségvetés',
    description: 'A költségvetés módosítás előző és módosított értékek összehasonlításával.',
  },
  {
    id: 'szamadas',
    title: 'Számadás',
    subtitle: 'Éves zárszámadás',
    description: 'A költségvetés és tényleges végrehajtás összehasonlítása a hivatalos formátumban.',
  },
  {
    id: 'reszszamadas',
    title: 'Részszámadás',
    subtitle: 'Időszaki elszámolás',
    description: 'Kiválasztott időszakra szűrt részleges számadás.',
  },
]

// ---------------------------------------------------------------------------
// Segédfüggvények
// ---------------------------------------------------------------------------

function esc(v: string) {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function fmtNum(n: number): string {
  if (!n && n !== 0) return ''
  const parts = Math.abs(n).toFixed(2).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return (n < 0 ? '-' : '') + parts[0] + ',' + parts[1]
}

/** Egy szamadasicel román megnevezése (a `nevro` runtime-mező), magyar fallback. */
function roName(c: SzamadasiCel): string {
  const ro = (c as { nevro?: string | null }).nevro
  return ro && ro.trim() ? ro : c.nev
}

// ---------------------------------------------------------------------------
// Stílusok — tiszta, monokróm A4 álló (a hivatalos minta szerint)
// ---------------------------------------------------------------------------

function budgetStyles() {
  return `
    @page { size: A4 portrait; margin: 12mm 10mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', Georgia, serif; color: #111; margin: 0; background: #eef1f5; }
    @media screen { body { padding: 16px 0; } }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto 16px; background: #fff; box-shadow: 0 8px 30px rgba(15,23,42,.10); padding: 14mm 12mm; position: relative; break-after: page; }
    .page:last-child { break-after: auto; }

    /* Borító */
    .cv-entity { font-weight: bold; font-size: 15px; letter-spacing: .4px; }
    .cv-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 8px; font-size: 12px; }
    .cv-line { display: inline-block; min-width: 150px; border-bottom: 1px solid #111; }
    .cv-title { text-align: center; font-size: 23px; font-weight: bold; }
    .cv-title-ro { text-align: center; font-size: 14px; font-weight: bold; }
    .cv-note { font-size: 11px; color: #444; }
    .cv-ver { text-align: right; font-size: 10px; color: #888; }

    /* Táblázat */
    table.bt { width: 100%; border-collapse: collapse; }
    .bt th, .bt td { border: 1px solid #4b5563; padding: 4px 6px; font-size: 9.5px; vertical-align: middle; }
    .bt th { font-weight: bold; font-size: 9px; text-align: center; background: #fff; line-height: 1.25; }
    .bt thead { display: table-header-group; }
    .bt tr, .bt td, .bt th { page-break-inside: avoid; }
    .bt .r { text-align: right; }
    .bt .c { text-align: center; }
    .bt .ro { color: #333; }
    .bt .grp td { font-weight: bold; }
    .bt .grp .name { text-align: center; }
    .bt .sec td { font-weight: bold; text-align: center; text-transform: uppercase; font-size: 10px; letter-spacing: .5px; }
    .bt .tot td { font-weight: bold; border-top: 2px solid #111; }

    /* Aláírások */
    .decl { margin-top: 14px; font-size: 11px; font-style: italic; line-height: 1.6; }
    .sig { display: flex; justify-content: space-between; gap: 26px; margin-top: 44px; font-size: 11px; }
    .sig .col { flex: 1; text-align: center; }
    .sig .label { color: #333; }
    .sig .line { border-top: 1px solid #111; margin-top: 32px; padding-top: 4px; font-weight: 600; }
    .page-footer { position: absolute; bottom: 8mm; left: 12mm; right: 12mm; display: flex; justify-content: space-between; font-size: 9px; color: #9aa3af; }

    @media print { body { background: #fff; padding: 0; } .page { width: auto; min-height: auto; margin: 0; box-shadow: none; padding: 0; } }
  `
}

function wrapBudget(title: string, content: string) {
  return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${budgetStyles()}</style></head><body>${content}</body></html>`
}

// ---------------------------------------------------------------------------
// Adatok
// ---------------------------------------------------------------------------

export interface BudgetPrintData {
  cellek: SzamadasiCel[]
  budgetRows: Record<string, BudgetCompatRow>
  actualIncome?: Record<string, number>
  actualExpense?: Record<string, number>
  congregationName: string
  year: number
  iktatoszam?: string
  hatarozatSzam?: string
  hatarozatDatum?: string
  modNumber?: number
  carryoverCash?: number
  carryoverBank?: number
  periodFrom?: string
  periodTo?: string
}

function getVal(data: BudgetPrintData, celId: string): number {
  return data.budgetRows[celId]?.tervezett || 0
}
function getModVal(data: BudgetPrintData, celId: string): number {
  return data.budgetRows[celId]?.modositott || 0
}
function getActual(data: BudgetPrintData, celId: string): number {
  const cel = data.cellek.find((c) => c.id === celId)
  if (!cel) return 0
  if (cel.type === 'B') return data.actualIncome?.[celId] || 0
  return data.actualExpense?.[celId] || 0
}
function sumGroup(data: BudgetPrintData, groupId: string, getter: (d: BudgetPrintData, id: string) => number): number {
  const prefix = groupId + '.'
  return data.cellek.filter((c) => c.id.startsWith(prefix)).reduce((sum, c) => sum + getter(data, c.id), 0)
}

type BudgetMode = 'single' | 'modification' | 'szamadas'
const valueColCount = (mode: BudgetMode) => (mode === 'modification' ? 3 : mode === 'szamadas' ? 2 : 1)
const totalCols = (mode: BudgetMode) => 4 + valueColCount(mode) // 2 név + sorszám + fejezet + értékek

// ---------------------------------------------------------------------------
// Belépési pontok
// ---------------------------------------------------------------------------

export function buildBudgetReport(data: BudgetPrintData): BudgetPrintResult {
  const { year } = data
  const total = 4 // borító + 3 táblázatoldal → 2 lap kétoldalasan
  const coverPage = buildCoverPage(data, 'KÖLTSÉGVETÉS', 'BUGET DE VENITURI ȘI CHELTUIELI', null, total)
  const tablePages = buildBudgetTable(data, 'single', { startPage: 2, total, withSignatures: true })
  return {
    title: `Költségvetés ${year}`,
    filename: `Koltsegvetes_${year}.pdf`,
    orientation: 'portrait',
    html: wrapBudget(`Költségvetés ${year}`, coverPage + tablePages),
  }
}

export function buildBudgetModificationReport(data: BudgetPrintData): BudgetPrintResult {
  const { year, modNumber } = data
  const modLabel = modNumber || 1
  const total = 4
  const coverPage = buildCoverPage(data, `${modLabel}. KÖLTSÉGVETÉS-MÓDOSÍTÁS`, 'MODIFICARE BUGET DE VENITURI ȘI CHELTUIELI', modLabel, total)
  const tablePages = buildBudgetTable(data, 'modification', { startPage: 2, total, withSignatures: true })
  return {
    title: `${modLabel}. Költségvetés módosítás ${year}`,
    filename: `Koltsegvetes_modositas_${modLabel}_${year}.pdf`,
    orientation: 'portrait',
    html: wrapBudget(`${modLabel}. Költségvetés módosítás ${year}`, coverPage + tablePages),
  }
}

export function buildSzamadasReport(data: BudgetPrintData): BudgetPrintResult {
  const { year } = data
  const total = 5 // borító + 3 táblázat + záró/aláírás oldal
  const coverPage = buildCoverPage(data, 'SZÁMADÁS', 'EXECUȚIA BUGETARĂ', null, total)
  const tablePages = buildBudgetTable(data, 'szamadas', { startPage: 2, total, withSignatures: false })
  const extraSection = buildSzamadasExtraRows(data)
  const declaration = `<div class="decl">Alulírott lelkipásztor és főgondnok felelősségünk tudatában nyilatkozzuk, hogy a számadás adatai valósak és az egyházi rendelkezések szerint készült el.</div>`
  const lastPage = `<div class="page">${extraSection}${declaration}${buildSignatureBlock()}${footer(data, total, total)}</div>`
  return {
    title: `Számadás ${year}`,
    filename: `Szamadas_${year}.pdf`,
    orientation: 'portrait',
    html: wrapBudget(`Számadás ${year}`, coverPage + tablePages + lastPage),
  }
}

function formatHuDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function buildReszszamadasReport(data: BudgetPrintData): BudgetPrintResult {
  const { year, periodFrom, periodTo } = data
  const fromLabel = formatHuDate(periodFrom)
  const toLabel = formatHuDate(periodTo)
  const total = 5
  const coverPage = buildCoverPage(
    data,
    'RÉSZSZÁMADÁS',
    'EXECUȚIA BUGETARĂ PARȚIALĂ',
    null,
    total,
    `Időszak / Perioada: ${fromLabel} — ${toLabel}`,
  )
  const tablePages = buildBudgetTable(data, 'szamadas', { startPage: 2, total, withSignatures: false })
  const extraSection = buildSzamadasExtraRows(data)
  const declaration = `<div class="decl">Alulírott lelkipásztor és főgondnok felelősségünk tudatában nyilatkozzuk, hogy a részszámadás adatai a megjelölt időszakra valósak és az egyházi rendelkezések szerint készültek.</div>`
  const lastPage = `<div class="page">${extraSection}${declaration}${buildSignatureBlock()}${footer(data, total, total)}</div>`
  return {
    title: `Részszámadás ${year} (${fromLabel} – ${toLabel})`,
    filename: `Reszszamadas_${year}_${periodFrom || 'kezdet'}_${periodTo || 'veg'}.pdf`,
    orientation: 'portrait',
    html: wrapBudget(`Részszámadás ${year}`, coverPage + tablePages + lastPage),
  }
}

// ---------------------------------------------------------------------------
// Borító oldal — a minta szerinti tiszta elrendezés
// ---------------------------------------------------------------------------

function footer(data: BudgetPrintData, pageNo: number, total: number): string {
  return `<div class="page-footer"><span>${esc(data.congregationName)}</span><span>oldal ${pageNo} / ${total}</span></div>`
}

function buildCoverPage(
  data: BudgetPrintData,
  titleHu: string,
  titleRo: string,
  modNumber: number | null,
  total: number,
  periodLine?: string,
): string {
  const { congregationName, year, iktatoszam, hatarozatSzam, hatarozatDatum } = data
  return `<div class="page">
    <div style="margin-top:8mm;">
      <div class="cv-entity">REFORMÁTUS EGYHÁZMEGYE</div>
      <div class="cv-row">
        <div>Egyházmegyei iktatószám: <span class="cv-line">&nbsp;</span></div>
        <div>Esperes aláírása: <span class="cv-line">&nbsp;</span></div>
      </div>
    </div>

    <div style="margin-top:16mm;">
      <div class="cv-entity">REFORMÁTUS EGYHÁZKÖZSÉG &nbsp; ${esc(congregationName)}</div>
      <div class="cv-row">
        <div>Egyházközségi iktatószám: <span class="cv-line">&nbsp;${esc(iktatoszam || '')}</span></div>
      </div>
    </div>

    <div style="margin-top:46mm;">
      <div class="cv-title">${esc(titleHu)} A ${year}. ÉVRE</div>
      <div class="cv-title-ro">${esc(titleRo)} PE ANUL ${year}</div>
    </div>

    ${periodLine ? `<div style="text-align:center;font-size:12px;font-weight:bold;margin-top:18mm;">${esc(periodLine)}</div>` : ''}
    ${modNumber ? `<div style="text-align:center;font-size:11px;margin-top:8mm;">A korábbi költségvetést módosító ${modNumber}. számú módosítás.</div>` : ''}

    <div style="margin-top:40mm;text-align:center;font-size:12px;">
      Tárgyalta és jóváhagyta a presbitérium a <span class="cv-line">&nbsp;${esc(hatarozatDatum || '')}</span> tartott gyűlésén
      <span class="cv-line" style="min-width:90px;">&nbsp;${esc(hatarozatSzam || '')}</span> szám alatt.
    </div>

    <div style="position:absolute;bottom:14mm;left:12mm;">
      <div class="cv-note">Kitöltendő lejben</div>
      <div class="cv-note">Se completează în lei</div>
    </div>
    <div style="position:absolute;bottom:14mm;right:12mm;" class="cv-ver">v 7.4a</div>
    ${footer(data, 1, total)}
  </div>`
}

// ---------------------------------------------------------------------------
// Fő adattábla
// ---------------------------------------------------------------------------

function valueHeads(mode: BudgetMode): string {
  if (mode === 'modification') {
    return `<th style="width:14%">Prevederi inițial<br>Előző</th><th style="width:14%">Modificare<br>Módosítás</th><th style="width:14%">Prevederi final<br>Végleges</th>`
  }
  if (mode === 'szamadas') {
    return `<th style="width:15%">Prevederi<br>Költségvetés</th><th style="width:15%">Execuție<br>Számadás</th>`
  }
  return `<th style="width:18%">Prevederi<br>Költségvetés</th>`
}

function valueCells(data: BudgetPrintData, c: SzamadasiCel, isGroup: boolean, mode: BudgetMode): string {
  const val = isGroup ? sumGroup(data, c.id, getVal) : getVal(data, c.id)
  if (mode === 'modification') {
    const modVal = isGroup ? sumGroup(data, c.id, getModVal) : getModVal(data, c.id)
    const finalVal = modVal || val
    return `<td class="r">${fmtNum(val)}</td><td class="r">${fmtNum(modVal - val)}</td><td class="r">${fmtNum(finalVal)}</td>`
  }
  if (mode === 'szamadas') {
    const actual = isGroup ? sumGroup(data, c.id, getActual) : getActual(data, c.id)
    return `<td class="r">${fmtNum(val)}</td><td class="r">${fmtNum(actual)}</td>`
  }
  return `<td class="r">${fmtNum(val)}</td>`
}

function buildSectionRows(data: BudgetPrintData, cells: SzamadasiCel[], mode: BudgetMode, startNum: number): { rows: string[]; nextNum: number } {
  const rows: string[] = []
  let n = startNum
  for (const c of cells) {
    const isGroup = !c.id.includes('.')
    if (isGroup) {
      rows.push(`<tr class="grp">
        <td class="name" colspan="2">${esc(roName(c))} / ${esc(c.nev)}</td>
        <td class="c">${n}</td><td class="c">${esc(c.id)}</td>${valueCells(data, c, true, mode)}
      </tr>`)
    } else {
      rows.push(`<tr>
        <td class="ro">${esc(roName(c))}</td><td>${esc(c.nev)}</td>
        <td class="c">${n}</td><td class="c">${esc(c.id)}</td>${valueCells(data, c, false, mode)}
      </tr>`)
    }
    n++
  }
  return { rows, nextNum: n }
}

interface TableOpts {
  startPage: number
  total: number
  withSignatures: boolean
}

function buildBudgetTable(data: BudgetPrintData, mode: BudgetMode, opts: TableOpts): string {
  const { cellek } = data
  // CSAK a hivatalos költségvetési kódok: bevétel 1xx (101–107), kiadás 2xx (201–207).
  // A belső mozgás (3xx/4xx) NEM része a költségvetésnek — kihagyjuk.
  const incomeCells = cellek
    .filter((c) => c.type === 'B' && c.id.startsWith('1') && c.id !== '100')
    .sort((a, b) => a.sorszam - b.sorszam)
  const expenseCells = cellek
    .filter((c) => c.type === 'K' && c.id.startsWith('2'))
    .sort((a, b) => a.sorszam - b.sorszam)

  const cols = totalCols(mode)
  const labelCols = cols - 1
  const thead = `<tr>
    <th colspan="2">Denumire — Megnevezés</th>
    <th style="width:8%">Nr. rând<br>Sorszám</th>
    <th style="width:12%">Capitol/subcap.<br>Fejezet</th>
    ${valueHeads(mode)}
  </tr>`

  // Minden sor egy tömbben — a végén 3 oldalra osztjuk.
  const all: string[] = []
  all.push(`<tr class="sec"><td colspan="${cols}">Bevételek / Venituri</td></tr>`)
  const inc = buildSectionRows(data, incomeCells, mode, 1)
  all.push(...inc.rows)
  all.push(`<tr class="sec"><td colspan="${cols}">Kiadások / Cheltuieli</td></tr>`)
  const exp = buildSectionRows(data, expenseCells, mode, inc.nextNum)
  all.push(...exp.rows)

  const totalIncome = incomeCells.filter((c) => !c.id.includes('.')).reduce((s, c) => s + sumGroup(data, c.id, getVal), 0)
  const totalExpense = expenseCells.filter((c) => !c.id.includes('.')).reduce((s, c) => s + sumGroup(data, c.id, getVal), 0)
  const balance = totalIncome - totalExpense
  all.push(`<tr class="tot"><td colspan="${labelCols}" class="r">Összbevétel / Total venituri</td><td class="r">${fmtNum(totalIncome)}</td></tr>`)
  all.push(`<tr class="tot"><td colspan="${labelCols}" class="r">Összkiadás / Total cheltuieli</td><td class="r">${fmtNum(totalExpense)}</td></tr>`)
  all.push(`<tr class="tot"><td colspan="${labelCols}" class="r">${balance >= 0 ? 'Bevételi többlet / Excedent' : 'Kiadási többlet / Deficit'}</td><td class="r">${fmtNum(Math.abs(balance))}</td></tr>`)

  // 3 táblázatoldalra osztás (a borítóval együtt összesen 4 → 2 lap kétoldalasan).
  const PAGES = 3
  const perPage = Math.ceil(all.length / PAGES)
  let html = ''
  for (let p = 0; p < PAGES; p++) {
    const chunk = all.slice(p * perPage, (p + 1) * perPage)
    if (chunk.length === 0) continue
    const isLast = p === PAGES - 1
    const sig = isLast && opts.withSignatures ? buildSignatureBlock() : ''
    html += `<div class="page">
      <table class="bt"><thead>${thead}</thead><tbody>${chunk.join('')}</tbody></table>
      ${sig}
      ${footer(data, opts.startPage + p, opts.total)}
    </div>`
  }
  return html
}

// ---------------------------------------------------------------------------
// Számadás extra sorok (év végi egyenleg)
// ---------------------------------------------------------------------------

function buildSzamadasExtraRows(data: BudgetPrintData): string {
  const cash = data.carryoverCash || 0
  const bank = data.carryoverBank || 0
  return `
    <table class="bt" style="margin-top:6px;">
      <thead><tr><th style="width:60%">Megnevezés / Denumire</th><th style="width:20%">Költségvetés</th><th style="width:20%">Számadás</th></tr></thead>
      <tbody>
        <tr class="grp"><td>Pénztári és banki egyenleg az év végén / Sold la finele anului</td><td class="r">x</td><td class="r">${fmtNum(cash + bank)}</td></tr>
        <tr><td>Készpénz egyenleg / Casa</td><td class="r">x</td><td class="r">${fmtNum(cash)}</td></tr>
        <tr><td>Banki egyenleg / Banca</td><td class="r">x</td><td class="r">${fmtNum(bank)}</td></tr>
      </tbody>
    </table>
  `
}

// ---------------------------------------------------------------------------
// Aláírási blokk — a minta szerint
// ---------------------------------------------------------------------------

function buildSignatureBlock(): string {
  return `<div class="sig">
    <div class="col">
      <div class="label">Egyházközség képviselői / Conducătorii unității</div>
      <div class="line">Lelkipásztor — aláírása</div>
    </div>
    <div class="col">
      <div class="label">P.H.</div>
      <div class="line">Főgondnok — aláírása</div>
    </div>
    <div class="col">
      <div class="label">Ellenőrizte / Verificat</div>
      <div class="line">Számvevő — aláírása</div>
    </div>
  </div>`
}

// ---------------------------------------------------------------------------
// Fő belépési pont
// ---------------------------------------------------------------------------

export function buildBudgetPrintDocument(type: BudgetPrintType, data: BudgetPrintData): BudgetPrintResult {
  switch (type) {
    case 'koltsegvetes':
      return buildBudgetReport(data)
    case 'koltsegvetes_modositas':
      return buildBudgetModificationReport(data)
    case 'szamadas':
      return buildSzamadasReport(data)
    case 'reszszamadas':
      return buildReszszamadasReport(data)
  }
}
