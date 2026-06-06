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
    /* Pixelpontos A4: margó a lapon belül (padding), a lap mérete fix.
       A 296mm (nem 297) elkerüli a böngészők „üres extra oldal" hibáját. */
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', Georgia, serif; color: #111; margin: 0; }
    @media screen { body { background: #eef1f5; padding: 14px 0; } .page { box-shadow: 0 8px 30px rgba(15,23,42,.10); margin: 0 auto 14px; } }
    .page { width: 210mm; height: 296mm; background: #fff; padding: 10mm 9mm; position: relative; overflow: hidden; page-break-after: always; }
    .page:last-child { page-break-after: auto; }

    /* Borító */
    .cv-entity { font-weight: bold; font-size: 15px; letter-spacing: .4px; }
    .cv-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 8px; font-size: 12px; }
    .cv-line { display: inline-block; min-width: 150px; border-bottom: 1px solid #111; }
    .cv-title { text-align: center; font-size: 23px; font-weight: bold; }
    .cv-title-ro { text-align: center; font-size: 14px; font-weight: bold; }
    .cv-note { font-size: 11px; color: #444; }
    .cv-ver { text-align: right; font-size: 10px; color: #888; }

    /* Táblázat — fix sormagasság, hogy oldalanként pontosan ismert számú sor férjen el */
    table.bt { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .bt th, .bt td { border: 1px solid #555; padding: 0.5mm 1.4mm; font-size: 8px; line-height: 1.1; vertical-align: middle; word-wrap: break-word; overflow: hidden; }
    .bt tbody tr { height: 6.4mm; }
    .bt th { font-weight: bold; font-size: 7.5px; text-align: center; line-height: 1.1; }
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
  /** Véglegesítve van-e (költségvetés/számadás). Csak ekkor jelenik meg a
   *  presbitériumi határozat + egyházközségi iktatószám a nyomtatványon. */
  finalized?: boolean
}

/** Kódok hierarchikus rendezése: 101 < 101.01 < 101.02 < 102 (csoport a része elé). */
function cmpId(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number(x))
  const pb = b.split('.').map((x) => Number(x))
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = i < pa.length ? pa[i] : -1
    const y = i < pb.length ? pb[i] : -1
    if (x !== y) return x - y
  }
  return 0
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
  const rows = collectBudgetRows(data, 'single')
  const pages = tablePageCount(rows.length, true, false)
  const total = 1 + pages
  const coverPage = buildCoverPage(data, 'KÖLTSÉGVETÉS', 'BUGET DE VENITURI ȘI CHELTUIELI', null, total)
  const tablePages = renderTablePages(data, 'single', rows, { startPage: 2, total, pages, withSignatures: true })
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
  const rows = collectBudgetRows(data, 'modification')
  const pages = tablePageCount(rows.length, true, false)
  const total = 1 + pages
  const coverPage = buildCoverPage(data, `${modLabel}. KÖLTSÉGVETÉS-MÓDOSÍTÁS`, 'MODIFICARE BUGET DE VENITURI ȘI CHELTUIELI', modLabel, total)
  const tablePages = renderTablePages(data, 'modification', rows, { startPage: 2, total, pages, withSignatures: true })
  return {
    title: `${modLabel}. Költségvetés módosítás ${year}`,
    filename: `Koltsegvetes_modositas_${modLabel}_${year}.pdf`,
    orientation: 'portrait',
    html: wrapBudget(`${modLabel}. Költségvetés módosítás ${year}`, coverPage + tablePages),
  }
}

export function buildSzamadasReport(data: BudgetPrintData): BudgetPrintResult {
  const { year } = data
  const rows = collectBudgetRows(data, 'szamadas')
  const pages = tablePageCount(rows.length, true, true)
  const total = 1 + pages
  const coverPage = buildCoverPage(data, 'SZÁMADÁS', 'EXECUȚIA BUGETARĂ', null, total)
  const declaration = `<div class="decl">Alulírott lelkipásztor és főgondnok felelősségünk tudatában nyilatkozzuk, hogy a számadás adatai valósak és az egyházi rendelkezések szerint készült el.</div>`
  const lastExtraHtml = buildSzamadasExtraRows(data) + declaration
  const tablePages = renderTablePages(data, 'szamadas', rows, { startPage: 2, total, pages, withSignatures: true, lastExtraHtml })
  return {
    title: `Számadás ${year}`,
    filename: `Szamadas_${year}.pdf`,
    orientation: 'portrait',
    html: wrapBudget(`Számadás ${year}`, coverPage + tablePages),
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
  const rows = collectBudgetRows(data, 'szamadas')
  const pages = tablePageCount(rows.length, true, true)
  const total = 1 + pages
  const coverPage = buildCoverPage(
    data,
    'RÉSZSZÁMADÁS',
    'EXECUȚIA BUGETARĂ PARȚIALĂ',
    null,
    total,
    `Időszak / Perioada: ${fromLabel} — ${toLabel}`,
  )
  const declaration = `<div class="decl">Alulírott lelkipásztor és főgondnok felelősségünk tudatában nyilatkozzuk, hogy a részszámadás adatai a megjelölt időszakra valósak és az egyházi rendelkezések szerint készültek.</div>`
  const lastExtraHtml = buildSzamadasExtraRows(data) + declaration
  const tablePages = renderTablePages(data, 'szamadas', rows, { startPage: 2, total, pages, withSignatures: true, lastExtraHtml })
  return {
    title: `Részszámadás ${year} (${fromLabel} – ${toLabel})`,
    filename: `Reszszamadas_${year}_${periodFrom || 'kezdet'}_${periodTo || 'veg'}.pdf`,
    orientation: 'portrait',
    html: wrapBudget(`Részszámadás ${year}`, coverPage + tablePages),
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
  // A presbitériumi határozat + egyházközségi iktatószám CSAK véglegesítés után
  // jelenik meg (előtte üres vonal — a minta szerint kézzel/utólag töltik ki).
  const fin = data.finalized === true
  const iktato = fin ? esc(iktatoszam || '') : ''
  const hatDatum = fin ? esc(hatarozatDatum || '') : ''
  const hatSzam = fin ? esc(hatarozatSzam || '') : ''
  return `<div class="page cover">
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
        <div>Egyházközségi iktatószám: <span class="cv-line">&nbsp;${iktato}</span></div>
      </div>
    </div>

    <div style="margin-top:46mm;">
      <div class="cv-title">${esc(titleHu)} A ${year}. ÉVRE</div>
      <div class="cv-title-ro">${esc(titleRo)} PE ANUL ${year}</div>
    </div>

    ${periodLine ? `<div style="text-align:center;font-size:12px;font-weight:bold;margin-top:18mm;">${esc(periodLine)}</div>` : ''}
    ${modNumber ? `<div style="text-align:center;font-size:11px;margin-top:8mm;">A korábbi költségvetést módosító ${modNumber}. számú módosítás.</div>` : ''}

    <div style="margin-top:40mm;text-align:center;font-size:12px;">
      Tárgyalta és jóváhagyta a presbitérium a <span class="cv-line">&nbsp;${hatDatum}</span> tartott gyűlésén
      <span class="cv-line" style="min-width:90px;">&nbsp;${hatSzam}</span> szám alatt.
    </div>

    ${fin ? '' : `<div style="margin-top:8mm;text-align:center;font-size:10px;font-style:italic;color:#9a3412;">Nincs véglegesítve — a presbitériumi határozat és az egyházközségi iktatószám a véglegesítés után kerül a nyomtatványra.</div>`}

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
    return `<th>Prevederi inițial<br>Előző</th><th>Modificare<br>Módosítás</th><th>Prevederi final<br>Végleges</th>`
  }
  if (mode === 'szamadas') {
    return `<th>Prevederi<br>Költségvetés</th><th>Execuție<br>Számadás</th>`
  }
  return `<th>Prevederi<br>Költségvetés</th>`
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

// Egy teljes táblázatoldalra férő sorok száma: 296mm lap − 20mm padding − ~5mm
// fejléc ≈ 271mm hasznos magasság; 6.4mm/sor → ~42 sor biztonsággal elfér.
const ROWS_PER_PAGE = 42

/** Lefoglalt sor-egyenérték az utolsó oldal záró elemeinek (aláírás, számadás-extra). */
function reservedSlots(withSignatures: boolean, hasExtra: boolean): number {
  return (withSignatures ? 6 : 0) + (hasExtra ? 8 : 0)
}

function tablePageCount(rowCount: number, withSignatures: boolean, hasExtra: boolean): number {
  return Math.max(1, Math.ceil((rowCount + reservedSlots(withSignatures, hasExtra)) / ROWS_PER_PAGE))
}

/** Összegyűjti a táblázat összes sorát (szekciók, csoport-/végpont-sorok, záró összegek). */
function collectBudgetRows(data: BudgetPrintData, mode: BudgetMode): string[] {
  const { cellek } = data
  // CSAK a hivatalos költségvetési kódok: bevétel 1xx (101–107), kiadás 2xx (201–207).
  // A belső mozgás (3xx/4xx) NEM része a költségvetésnek. Hierarchikus rendezés:
  // a csoport (pl. 101) MINDIG a saját végpont-sorai (101.01…) ELÉ kerül.
  const incomeCells = cellek
    .filter((c) => c.type === 'B' && c.id.startsWith('1') && c.id !== '100')
    .sort((a, b) => cmpId(a.id, b.id))
  const expenseCells = cellek
    .filter((c) => c.type === 'K' && c.id.startsWith('2'))
    .sort((a, b) => cmpId(a.id, b.id))

  const cols = totalCols(mode)
  const labelCols = cols - 1
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
  return all
}

interface TableOpts {
  startPage: number
  total: number
  pages: number
  withSignatures: boolean
  lastExtraHtml?: string
}

/** A sorokat `opts.pages` oldalra osztja: az első oldalak teltek, az utolsóra
 *  kerül a maradék + a záró elemek (számadás-extra, aláírás). */
function colgroupFor(mode: BudgetMode): string {
  // Pontos oszlopszélességek (table-layout: fixed) — módonként eltér az értékoszlopok száma.
  let cols: number[]
  if (mode === 'modification') cols = [23, 25, 6, 10, 12, 12, 12]
  else if (mode === 'szamadas') cols = [26, 28, 7, 11, 14, 14]
  else cols = [30, 32, 8, 12, 18]
  return `<colgroup>${cols.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>`
}

function renderTablePages(data: BudgetPrintData, mode: BudgetMode, rows: string[], opts: TableOpts): string {
  const colgroup = colgroupFor(mode)
  const thead = `<tr>
    <th colspan="2">Denumire — Megnevezés</th>
    <th>Nr. rând<br>Sorszám</th>
    <th>Capitol/subcap.<br>Fejezet</th>
    ${valueHeads(mode)}
  </tr>`

  let html = ''
  let idx = 0
  for (let p = 0; p < opts.pages; p++) {
    const isLast = p === opts.pages - 1
    const take = isLast ? rows.length - idx : Math.min(ROWS_PER_PAGE, rows.length - idx)
    const chunk = rows.slice(idx, idx + Math.max(0, take))
    idx += chunk.length
    const extras = isLast ? `${opts.lastExtraHtml || ''}${opts.withSignatures ? buildSignatureBlock() : ''}` : ''
    html += `<div class="page">
      <table class="bt">${colgroup}<thead>${thead}</thead><tbody>${chunk.join('')}</tbody></table>
      ${extras}
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
