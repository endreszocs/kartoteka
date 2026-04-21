/**
 * Anyagraktárkönyv nyomtatási sablon.
 *
 * A hivatalos Word/Excel minta szerint (D:\Egyházi APP Vanilla JS\...\Anyagraktar_iv.pdf):
 *   - 1 anyag = 1 oldal (ha több anyag van, mindegyik új oldalon)
 *   - Fejléc: ANYAGRAKTÁRKÖNYV + anyag megnevezése, mértékegység, egységár
 *   - Táblázat: Sorszám | Kelte | Iratszám | Magyarázat | Mennyiség (Bev/Kia/Egyenleg) | Érték (Bev/Kia/Egyenleg)
 *   - Lábléc: Készítette / Ellenőrizte aláírások
 */

import type {
  MaterialMovementWithBalance,
  MaterialRow,
} from '@/app/(dashboard)/leltar/anyagraktar-actions'

export interface MaterialBookPage {
  material: MaterialRow
  movements: MaterialMovementWithBalance[]
}

export interface AnyagraktarkonyvInput {
  congregationName: string
  materials: MaterialBookPage[]
  /** Ha megadott, csak az adott évre szűrt mozgásokat mutatja. */
  year: number | null
}

function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return ''
  return n.toLocaleString('hu-HU', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function fmtQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return ''
  const str = n.toLocaleString('hu-HU', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  return str.replace(/[,\.]000$/, '')
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function buildPage(page: MaterialBookPage, year: number | null, pageNumber: number, congregationName: string): string {
  const { material, movements } = page

  const rows = movements.length === 0
    ? `<tr><td colspan="11" class="empty">Nincs rögzített mozgás${year ? ` a(z) ${year}-os évben` : ''}.</td></tr>`
    : movements.map((mv) => {
        const isBev = mv.tipus === 'bevetel' && !mv.stornozott
        const isKia = mv.tipus === 'kiadas' && !mv.stornozott
        const strikeClass = mv.stornozott ? 'stornozott' : ''
        return `
          <tr class="${strikeClass}">
            <td class="center">${mv.sorszam}</td>
            <td>${fmtDate(mv.datum)}</td>
            <td>${esc(mv.irat_szama || '')}</td>
            <td>${esc(mv.magyarazat || '')}${mv.stornozott ? ` <em class="storno-note">(Stornózva: ${esc(mv.stornozott_indok || '—')})</em>` : ''}</td>
            <td class="right mono">${isBev ? fmtQty(mv.mennyiseg) : ''}</td>
            <td class="right mono">${isKia ? fmtQty(mv.mennyiseg) : ''}</td>
            <td class="right mono balance">${fmtQty(mv.egyenleg_mennyiseg)}</td>
            <td class="right mono">${isBev ? fmtNum(mv.ertek) : ''}</td>
            <td class="right mono">${isKia ? fmtNum(mv.ertek) : ''}</td>
            <td class="right mono balance">${fmtNum(mv.egyenleg_ertek)}</td>
          </tr>
        `
      }).join('')

  const pageBreak = pageNumber > 1 ? 'style="page-break-before: always;"' : ''

  return `
    <div class="page" ${pageBreak}>
      <div class="header">
        <div class="header-meta">
          <span class="cong">${esc(congregationName)}</span>
          ${year ? `<span class="year">${year}. év</span>` : ''}
        </div>
        <h1>ANYAGRAKTÁRKÖNYV</h1>
        <div class="header-fields">
          <div><strong>Anyag megnevezése:</strong> ${esc(material.nev)}${material.megnevezes ? ` <span class="muted">(${esc(material.megnevezes)})</span>` : ''}</div>
          <div class="row-split">
            <div><strong>Mértékegység:</strong> ${esc(material.mertekegyseg)}</div>
            <div><strong>Egységár (lejben):</strong> ${material.egysegar != null ? fmtNum(Number(material.egysegar)) : '—'}</div>
          </div>
        </div>
      </div>

      <table class="ark">
        <thead>
          <tr>
            <th rowspan="2" class="center">S.<br/>sz.</th>
            <th rowspan="2">Kelte<br/><span class="sub">Év/Hó/Nap</span></th>
            <th rowspan="2">Irat<br/>száma</th>
            <th rowspan="2">Magyarázat<br/><span class="sub">Kitől vettünk be / kinek adtuk ki</span></th>
            <th colspan="3" class="group">Mennyiség</th>
            <th colspan="3" class="group">Érték</th>
          </tr>
          <tr>
            <th class="sub right">Bevétel</th>
            <th class="sub right">Kiadás</th>
            <th class="sub right">Egyenleg</th>
            <th class="sub right">Bevétel</th>
            <th class="sub right">Kiadás</th>
            <th class="sub right">Egyenleg</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="footer">
        <div class="sign-block">
          <div class="sign-line"></div>
          <div class="sign-label">Készítette</div>
        </div>
        <div class="sign-block">
          <div class="sign-line"></div>
          <div class="sign-label">Ellenőrizte</div>
        </div>
      </div>
    </div>
  `
}

export function buildAnyagraktarkonyvHtml(input: AnyagraktarkonyvInput): string {
  const { congregationName, materials, year } = input

  const pages = materials.length === 0
    ? `<div class="page"><p class="center muted">Nincs anyag a nyomtatáshoz.</p></div>`
    : materials.map((m, idx) => buildPage(m, year, idx + 1, congregationName)).join('')

  return `<!DOCTYPE html><html lang="hu"><head>
<meta charset="utf-8">
<title>Anyagraktárkönyv — ${esc(congregationName)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', serif; color: #111827; margin: 0; background: #fff; font-size: 10pt; }
  .page { width: 100%; min-height: calc(210mm - 20mm); padding: 8mm 6mm; position: relative; }
  .header { margin-bottom: 10px; }
  .header-meta { display: flex; justify-content: space-between; font-size: 8pt; color: #64748b; margin-bottom: 4px; }
  .header-meta .cong { font-weight: bold; color: #334155; }
  h1 { text-align: center; font-size: 16pt; font-weight: bold; letter-spacing: 1px; margin: 4px 0 8px 0; text-transform: uppercase; }
  .header-fields { font-size: 10pt; }
  .header-fields > div { margin-bottom: 3px; }
  .row-split { display: flex; justify-content: space-between; gap: 20px; }
  .muted { color: #64748b; font-style: italic; font-weight: normal; }
  table.ark { width: 100%; border-collapse: collapse; }
  table.ark th, table.ark td { border: 1px solid #334155; padding: 3px 5px; font-size: 9pt; vertical-align: top; }
  table.ark th { background: #e2e8f0; font-weight: bold; text-align: center; font-size: 8pt; }
  table.ark th.group { background: #cbd5e1; }
  table.ark th.sub { font-weight: normal; font-size: 7pt; color: #475569; text-align: right; }
  table.ark .center { text-align: center; }
  table.ark .right { text-align: right; }
  table.ark .mono { font-family: 'Courier New', monospace; font-size: 9pt; }
  table.ark .balance { background: #e0e7ff; font-weight: bold; color: #1e3a8a; }
  table.ark .stornozott { background: #fee2e2; text-decoration: line-through; color: #64748b; }
  table.ark .stornozott .balance { background: #fecaca; text-decoration: none; }
  table.ark .storno-note { color: #991b1b; font-size: 8pt; font-style: italic; text-decoration: none; }
  table.ark .empty { text-align: center; color: #94a3b8; padding: 20px; font-style: italic; }
  .footer { display: grid; grid-template-columns: 1fr 1fr; gap: 40mm; margin-top: 20mm; padding: 0 20mm; }
  .sign-block { text-align: center; }
  .sign-line { border-top: 1px solid #0f172a; margin-bottom: 4px; height: 1px; }
  .sign-label { font-size: 10pt; }
  @media print { body { background: #fff; } }
</style>
</head><body>${pages}</body></html>`
}
