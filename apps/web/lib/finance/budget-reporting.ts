/**
 * Költségvetés / Számadás hivatalos nyomtatványok.
 *
 * A hivatalos PDF minták (Koltsegvetes_minta_vegleges.pdf, Koltsegvetes_modositas_minta.pdf,
 * Számadás minta.pdf) pontos struktúráját követi:
 *  - 113 sor: bevételek (1-52) + kiadások (53-113)
 *  - Kétnyelvű: román (Denumire) + magyar (Megnevezés)
 *  - Sorszám, fejezet/alfejezet kód, értékoszlopok
 *  - Aláírási blokk: Lelkipásztor, Főgondnok, Számvevő
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
    description: 'A költségvetés és tényleges végrehajtás összehasonlítása a 134 soros hivatalos formátumban.',
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
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return (n < 0 ? '-' : '') + parts[0] + '.' + parts[1]
}

// ---------------------------------------------------------------------------
// Stílusok — portré A4, sűrű táblázat
// ---------------------------------------------------------------------------

function budgetStyles() {
  return `
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; color: #111827; margin: 0; background: #e2e8f0; padding: 18px 0; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto 18px; background: #fff; box-shadow: 0 18px 40px rgba(15,23,42,.12); padding: 10mm 8mm; break-after: page; position: relative; }
    .page:last-child { break-after: auto; }
    .cover-box { border: 2px solid #334155; padding: 12px 18px; margin-bottom: 14px; }
    .cover-title { text-align: center; font-size: 16px; font-weight: bold; text-transform: uppercase; margin: 12px 0 6px; }
    .cover-title-ro { text-align: center; font-size: 12px; font-style: italic; color: #475569; margin-bottom: 10px; }
    .cover-field { font-size: 11px; margin-bottom: 3px; }
    .cover-note { font-size: 10px; color: #64748b; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #334155; padding: 3px 4px; font-size: 9px; vertical-align: top; }
    th { background: #e2e8f0; text-align: center; font-weight: bold; font-size: 8px; }
    thead { display: table-header-group; }
    tr, td, th { page-break-inside: avoid; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .group-row { background: #f1f5f9; font-weight: bold; }
    .total-row { background: #dbeafe; font-weight: bold; font-size: 10px; }
    .section-header { background: #1e293b; color: #fff; font-weight: bold; font-size: 10px; text-transform: uppercase; }
    .signature-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 18px; margin-top: 24px; }
    .signature-box { text-align: center; font-size: 11px; }
    .signature-line { margin-top: 28px; border-top: 1px solid #0f172a; padding-top: 4px; }
    .page-footer { position: absolute; bottom: 10mm; left: 8mm; right: 8mm; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
    .declaration { margin-top: 12px; font-size: 10px; line-height: 1.5; font-style: italic; border: 1px solid #cbd5e1; padding: 8px 10px; background: #f8fafc; }
    @media print { body { background: #fff; padding: 0; } .page { width: auto; min-height: auto; margin: 0; box-shadow: none; } }
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
  actualIncome?: Record<string, number>    // szamadasicel.id → tényleges összeg (számadáshoz)
  actualExpense?: Record<string, number>
  congregationName: string
  year: number
  iktatoszam?: string
  hatarozatSzam?: string
  hatarozatDatum?: string
  modNumber?: number       // 1, 2, 3 módosítás sorszám
  carryoverCash?: number
  carryoverBank?: number
  /** Részszámadás kezdődátuma (YYYY-MM-DD). Csak `reszszamadas` típushoz kötelező. */
  periodFrom?: string
  /** Részszámadás záródátuma (YYYY-MM-DD). Csak `reszszamadas` típushoz kötelező. */
  periodTo?: string
}

/** Érték kiolvasása a budget adatokból */
function getVal(data: BudgetPrintData, celId: string): number {
  return data.budgetRows[celId]?.tervezett || 0
}

function getModVal(data: BudgetPrintData, celId: string): number {
  return data.budgetRows[celId]?.modositott || 0
}

function getActual(data: BudgetPrintData, celId: string): number {
  // Megnézzük a típust: bevétel vagy kiadás
  const cel = data.cellek.find(c => c.id === celId)
  if (!cel) return 0
  if (cel.type === 'B') return data.actualIncome?.[celId] || 0
  return data.actualExpense?.[celId] || 0
}

/** Összegző sor: szamadasicel group → összes alá tartozó leaf érték össze */
function sumGroup(data: BudgetPrintData, groupId: string, getter: (d: BudgetPrintData, id: string) => number): number {
  const prefix = groupId + '.'
  return data.cellek
    .filter(c => c.id.startsWith(prefix))
    .reduce((sum, c) => sum + getter(data, c.id), 0)
}

// ---------------------------------------------------------------------------
// 1. KÖLTSÉGVETÉS — 113 sor
// ---------------------------------------------------------------------------

export function buildBudgetReport(data: BudgetPrintData): BudgetPrintResult {
  const { year } = data

  // Borító oldal
  const coverPage = buildCoverPage(data, 'KÖLTSÉGVETÉS', 'BUGET DE VENITURI SI CHELTUIELI', null)

  // Adattáblák
  const tablePages = buildBudgetTable(data, 'single')

  return {
    title: `Költségvetés ${year}`,
    filename: `Koltsegvetes_${year}.pdf`,
    orientation: 'portrait',
    html: wrapBudget(`Költségvetés ${year}`, coverPage + tablePages),
  }
}

// ---------------------------------------------------------------------------
// 2. KÖLTSÉGVETÉS MÓDOSÍTÁS
// ---------------------------------------------------------------------------

export function buildBudgetModificationReport(data: BudgetPrintData): BudgetPrintResult {
  const { year, modNumber } = data
  const modLabel = modNumber || 1

  const coverPage = buildCoverPage(data, `${modLabel}. KÖLTSÉGVETÉS MÓDOSÍTÁS`, `MODIFICARE BUGET DE VENITURI SI CHELTUIELI`, modLabel)

  const tablePages = buildBudgetTable(data, 'modification')

  return {
    title: `${modLabel}. Költségvetés módosítás ${year}`,
    filename: `Koltsegvetes_modositas_${modLabel}_${year}.pdf`,
    orientation: 'portrait',
    html: wrapBudget(`${modLabel}. Költségvetés módosítás ${year}`, coverPage + tablePages),
  }
}

// ---------------------------------------------------------------------------
// 3. SZÁMADÁS — 134 sor
// ---------------------------------------------------------------------------

export function buildSzamadasReport(data: BudgetPrintData): BudgetPrintResult {
  const { year } = data

  const coverPage = buildCoverPage(data, 'SZÁMADÁS', 'EXECUTIA BUGETARA', null)

  const tablePages = buildBudgetTable(data, 'szamadas')

  // Plusz szekciók: tartozások, kintlévőségek (sorok 113-134)
  const extraSection = buildSzamadasExtraRows(data)

  // Nyilatkozat
  const declaration = `<div class="declaration">
    Alulírott lelkipásztor és főgondnok felelősségünk tudatában nyilatkozzuk, hogy a számadás adatai valósak és a számadás az egyházi rendelkezések szerint készült el.
  </div>`

  const signatureBlock = buildSignatureBlock()

  const lastPage = `<div class="page">${extraSection}${declaration}${signatureBlock}</div>`

  return {
    title: `Számadás ${year}`,
    filename: `Szamadas_${year}.pdf`,
    orientation: 'portrait',
    html: wrapBudget(`Számadás ${year}`, coverPage + tablePages + lastPage),
  }
}

// ---------------------------------------------------------------------------
// 3b. RÉSZSZÁMADÁS — szűrt időszak, különálló borító + időszak-jelzés
// ---------------------------------------------------------------------------

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

  // Borító — speciális részszámadás címmel és időszakkal
  const coverPage = buildReszszamadasCoverPage(data, fromLabel, toLabel)

  const tablePages = buildBudgetTable(data, 'szamadas')
  const extraSection = buildSzamadasExtraRows(data)

  const declaration = `<div class="declaration">
    Alulírott lelkipásztor és főgondnok felelősségünk tudatában nyilatkozzuk, hogy a részszámadás adatai a megjelölt időszakra valósak és az egyházi rendelkezések szerint készültek.
  </div>`

  const signatureBlock = buildSignatureBlock()
  const lastPage = `<div class="page">${extraSection}${declaration}${signatureBlock}</div>`

  return {
    title: `Részszámadás ${year} (${fromLabel} – ${toLabel})`,
    filename: `Reszszamadas_${year}_${periodFrom || 'kezdet'}_${periodTo || 'veg'}.pdf`,
    orientation: 'portrait',
    html: wrapBudget(`Részszámadás ${year}`, coverPage + tablePages + lastPage),
  }
}

function buildReszszamadasCoverPage(
  data: BudgetPrintData,
  fromLabel: string,
  toLabel: string,
): string {
  const { congregationName, year, iktatoszam, hatarozatSzam, hatarozatDatum } = data
  return `<div class="page">
    <div class="cover-box">
      <div style="display:flex;justify-content:space-between;">
        <div><span style="font-size:11px;">REFORMÁTUS EGYHÁZMEGYE</span></div>
        <div style="font-size:10px;">Egyházmegyei iktatószám: ________________</div>
      </div>
      <div style="text-align:right;font-size:10px;">Esperes aláírása: _________________</div>
    </div>

    <div class="cover-box">
      <div style="font-size:14px;font-weight:bold;text-transform:uppercase;">REFORMÁTUS EGYHÁZKÖZSÉG</div>
      <div style="font-size:12px;font-weight:bold;margin-top:4px;">${esc(congregationName)}</div>
      <div style="font-size:10px;margin-top:2px;">Egyházközségi iktatószám: ${esc(iktatoszam || '___')}</div>
    </div>

    <div class="cover-title">RÉSZSZÁMADÁS — ${year}. ÉV</div>
    <div class="cover-title-ro">EXECUTIA BUGETARA PARȚIALĂ — ANUL ${year}</div>

    <div style="text-align:center;font-size:12px;font-weight:bold;margin:12px 0 6px;border:2px solid #334155;padding:8px;">
      Időszak: ${esc(fromLabel)} — ${esc(toLabel)}<br>
      <span style="font-size:10px;font-style:italic;color:#475569;">Perioada: ${esc(fromLabel)} — ${esc(toLabel)}</span>
    </div>

    <div style="text-align:center;font-size:11px;margin:16px 0;">
      Tárgyalta és jóváhagyta a presbitérium a ${esc(hatarozatDatum || '_______________')} tartott gyűlésen ${esc(hatarozatSzam || '___')} szám alatt.
    </div>

    <div class="cover-note" style="text-align:center;">
      Kitöltendő lejben / Se completeaza in lei
    </div>

    <div class="page-footer">
      <span>Kartotéka — ${esc(congregationName)}</span>
      <span>v 7.4a</span>
    </div>
  </div>`
}

// ---------------------------------------------------------------------------
// Borító oldal generálás
// ---------------------------------------------------------------------------

function buildCoverPage(
  data: BudgetPrintData,
  titleHu: string,
  titleRo: string,
  modNumber: number | null,
): string {
  const { congregationName, year, iktatoszam, hatarozatSzam, hatarozatDatum } = data

  return `<div class="page">
    <div class="cover-box">
      <div style="display:flex;justify-content:space-between;">
        <div><span style="font-size:11px;">REFORMÁTUS EGYHÁZMEGYE</span></div>
        <div style="font-size:10px;">Egyházmegyei iktatószám: ________________</div>
      </div>
      <div style="text-align:right;font-size:10px;">Esperes aláírása: _________________</div>
    </div>

    <div class="cover-box">
      <div style="font-size:14px;font-weight:bold;text-transform:uppercase;">REFORMÁTUS EGYHÁZKÖZSÉG</div>
      <div style="font-size:12px;font-weight:bold;margin-top:4px;">${esc(congregationName)}</div>
      <div style="font-size:10px;margin-top:2px;">Egyházközségi iktatószám: ${esc(iktatoszam || '___')}</div>
    </div>

    <div class="cover-title">${esc(titleHu)} A ${year}. ÉVRE</div>
    <div class="cover-title-ro">${esc(titleRo)} PE ANUL ${year}</div>

    <div style="text-align:center;font-size:11px;margin:16px 0;">
      Tárgyalta és jóváhagyta a presbitérium a ${esc(hatarozatDatum || '_______________')} tartott gyűlésen ${esc(hatarozatSzam || '___')} szám alatt.
    </div>

    ${modNumber ? `<div style="text-align:center;font-size:11px;margin-bottom:16px;">
      Jelen költségvetés-módosítás a korábbi költségvetést módosítja.
    </div>` : ''}

    <div class="cover-note" style="text-align:center;">
      Kitöltendő lejben / Se completeaza in lei
    </div>

    <div class="page-footer">
      <span>Kartotéka — ${esc(congregationName)}</span>
      <span>v 7.4a</span>
    </div>
  </div>`
}

// ---------------------------------------------------------------------------
// Fő adattábla generálás
// ---------------------------------------------------------------------------

function buildBudgetTable(
  data: BudgetPrintData,
  mode: 'single' | 'modification' | 'szamadas',
): string {
  const { cellek } = data

  const incomeCells = cellek.filter(c => c.type === 'B' && c.id !== '100').sort((a, b) => a.sorszam - b.sorszam)
  const expenseCells = cellek.filter(c => c.type === 'K').sort((a, b) => a.sorszam - b.sorszam)

  // Fejléc
  let thead = ''
  if (mode === 'single') {
    thead = `<tr><th rowspan="2" style="width:40%">Megnevezés / Denumire</th><th rowspan="2" style="width:8%">Sor</th><th rowspan="2" style="width:12%">Fejezet</th><th rowspan="2" style="width:18%">Költségvetés<br>Prevederi</th></tr>`
  } else if (mode === 'modification') {
    thead = `<tr><th rowspan="2" style="width:32%">Megnevezés / Denumire</th><th rowspan="2" style="width:6%">Sor</th><th rowspan="2" style="width:10%">Fejezet</th><th style="width:16%">Előző<br>Prevederi initial</th><th style="width:16%">Módosítás<br>Modificare</th><th style="width:16%">Végleges<br>Prevederi final</th></tr>`
  } else {
    thead = `<tr><th rowspan="2" style="width:32%">Megnevezés / Denumire</th><th rowspan="2" style="width:6%">Sor</th><th rowspan="2" style="width:10%">Fejezet</th><th style="width:16%">Költségvetés<br>Prevederi</th><th style="width:16%">Számadás<br>Executie</th></tr>`
  }

  // Sorok
  let rows = ''
  let rowNum = 1

  // Bevételek szekció fejléc
  rows += `<tr class="section-header"><td colspan="${mode === 'single' ? 4 : mode === 'modification' ? 6 : 5}">BEVÉTELEK / VENITURI</td></tr>`

  for (const c of incomeCells) {
    const isGroup = !c.id.includes('.')
    const val = isGroup ? sumGroup(data, c.id, getVal) : getVal(data, c.id)
    const cls = isGroup ? 'group-row' : ''

    rows += `<tr class="${cls}">`
    rows += `<td>${esc(c.nev)}</td>`
    rows += `<td class="text-center">${rowNum}</td>`
    rows += `<td class="text-center">${c.id}</td>`

    if (mode === 'single') {
      rows += `<td class="text-right">${fmtNum(val)}</td>`
    } else if (mode === 'modification') {
      const prevVal = val
      const modVal = isGroup ? sumGroup(data, c.id, getModVal) : getModVal(data, c.id)
      rows += `<td class="text-right">${fmtNum(prevVal)}</td>`
      rows += `<td class="text-right">${fmtNum(modVal - prevVal)}</td>`
      rows += `<td class="text-right">${fmtNum(modVal || prevVal)}</td>`
    } else {
      const actual = isGroup ? sumGroup(data, c.id, getActual) : getActual(data, c.id)
      rows += `<td class="text-right">${fmtNum(val)}</td>`
      rows += `<td class="text-right">${fmtNum(actual)}</td>`
    }

    rows += '</tr>'
    rowNum++
  }

  // Kiadások szekció fejléc
  rows += `<tr class="section-header"><td colspan="${mode === 'single' ? 4 : mode === 'modification' ? 6 : 5}">KIADÁSOK / CHELTUIELI</td></tr>`

  for (const c of expenseCells) {
    const isGroup = !c.id.includes('.')
    const val = isGroup ? sumGroup(data, c.id, getVal) : getVal(data, c.id)
    const cls = isGroup ? 'group-row' : ''

    rows += `<tr class="${cls}">`
    rows += `<td>${esc(c.nev)}</td>`
    rows += `<td class="text-center">${rowNum}</td>`
    rows += `<td class="text-center">${c.id}</td>`

    if (mode === 'single') {
      rows += `<td class="text-right">${fmtNum(val)}</td>`
    } else if (mode === 'modification') {
      const prevVal = val
      const modVal = isGroup ? sumGroup(data, c.id, getModVal) : getModVal(data, c.id)
      rows += `<td class="text-right">${fmtNum(prevVal)}</td>`
      rows += `<td class="text-right">${fmtNum(modVal - prevVal)}</td>`
      rows += `<td class="text-right">${fmtNum(modVal || prevVal)}</td>`
    } else {
      const actual = isGroup ? sumGroup(data, c.id, getActual) : getActual(data, c.id)
      rows += `<td class="text-right">${fmtNum(val)}</td>`
      rows += `<td class="text-right">${fmtNum(actual)}</td>`
    }

    rows += '</tr>'
    rowNum++
  }

  // Összesítő sorok
  const totalIncome = incomeCells.filter(c => !c.id.includes('.')).reduce((s, c) => s + sumGroup(data, c.id, getVal), 0)
  const totalExpense = expenseCells.filter(c => !c.id.includes('.')).reduce((s, c) => s + sumGroup(data, c.id, getVal), 0)
  const balance = totalIncome - totalExpense

  const colCount = mode === 'single' ? 4 : mode === 'modification' ? 6 : 5
  rows += `<tr class="total-row"><td colspan="${colCount - 1}" class="text-right">Összbevétel / Total venituri:</td><td class="text-right">${fmtNum(totalIncome)}</td></tr>`
  rows += `<tr class="total-row"><td colspan="${colCount - 1}" class="text-right">Összkiadás / Total cheltuieli:</td><td class="text-right">${fmtNum(totalExpense)}</td></tr>`
  rows += `<tr class="total-row"><td colspan="${colCount - 1}" class="text-right">${balance >= 0 ? 'Többlet / Excedent' : 'Hiány / Deficit'}:</td><td class="text-right">${fmtNum(Math.abs(balance))}</td></tr>`

  return `<div class="page">
    <table>
      <thead>${thead}</thead>
      <tbody>${rows}</tbody>
    </table>
    ${buildSignatureBlock()}
    <div class="page-footer"><span>Kartotéka</span><span>${data.year}</span></div>
  </div>`
}

// ---------------------------------------------------------------------------
// Számadás extra sorok (113-134)
// ---------------------------------------------------------------------------

function buildSzamadasExtraRows(data: BudgetPrintData): string {
  const cash = data.carryoverCash || 0
  const bank = data.carryoverBank || 0

  return `
    <table style="margin-top:12px;">
      <thead><tr><th style="width:50%">Megnevezés</th><th style="width:25%">Költségvetés</th><th style="width:25%">Számadás</th></tr></thead>
      <tbody>
        <tr class="group-row"><td>Pénztári és banki egyenleg az év végén</td><td class="text-right">x</td><td class="text-right">${fmtNum(cash + bank)}</td></tr>
        <tr><td>Készpénz egyenleg</td><td class="text-right">x</td><td class="text-right">${fmtNum(cash)}</td></tr>
        <tr><td>Banki egyenleg</td><td class="text-right">x</td><td class="text-right">${fmtNum(bank)}</td></tr>
      </tbody>
    </table>
  `
}

// ---------------------------------------------------------------------------
// Aláírási blokk
// ---------------------------------------------------------------------------

function buildSignatureBlock(): string {
  return `<div class="signature-grid">
    <div class="signature-box"><div class="signature-line">Lelkipásztor</div></div>
    <div class="signature-box"><div style="text-align:center;font-size:10px;">P.H.</div><div class="signature-line">Főgondnok</div></div>
    <div class="signature-box"><div class="signature-line">Számvevő — Verificat</div></div>
  </div>`
}

// ---------------------------------------------------------------------------
// Fő belépési pont
// ---------------------------------------------------------------------------

export function buildBudgetPrintDocument(
  type: BudgetPrintType,
  data: BudgetPrintData,
): BudgetPrintResult {
  switch (type) {
    case 'koltsegvetes':
      return buildBudgetReport(data)
    case 'koltsegvetes_modositas':
      return buildBudgetModificationReport(data)
    case 'szamadas':
      return buildSzamadasReport(data)
    case 'reszszamadas':
      return buildReszszamadasReport(data) // Részszámadás = szűrt időszak külön borítóval
  }
}
