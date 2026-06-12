/**
 * Munkanapló / Lelkészi jelentés nyomtatási modul.
 *
 * A leltár nyomtatási sémáját követi:
 *  - Ugyanaz az A4-es HTML struktúra (.page divek)
 *  - Times New Roman betűtípus
 *  - Táblázatok border-ökkel
 *  - Aláírási rács
 *  - Return: { title, html, filename, orientation }
 *
 * Kimenetek:
 *  1. Szolgálati összesítő — istentiszteletek, igehirdetések
 *  2. Katekétikai összesítő — vallásóra, konfirmáció
 *  3. Diakóniai összesítő — családlátogatás, beteglátogatás
 *  4. Éves lelkészi jelentés — hivatalos 10 szekciós struktúra
 */

import {
  WORKLOG_CATEGORIES,
  WORKLOG_CATEGORY_LABELS,
  categorizeWorklogEntry,
  type WorklogCategory,
  type WorklogEntry,
} from '@/lib/constants/worklog'

// ---------------------------------------------------------------------------
// Típusok
// ---------------------------------------------------------------------------

export type WorklogPrintType =
  | 'szolgalati_osszesito'
  | 'kateketikai_osszesito'
  | 'diakoniai_osszesito'
  | 'eves_jelentes'

export interface WorklogPrintResult {
  title: string
  filename: string
  orientation: 'portrait' | 'landscape'
  html: string
}

export const WORKLOG_PRINT_TYPES: Array<{
  id: WorklogPrintType
  title: string
  subtitle: string
  description: string
}> = [
  {
    id: 'szolgalati_osszesito',
    title: 'Szolgálati összesítő',
    subtitle: 'Istentiszteletek, igehirdetések',
    description: 'A szolgálati alkalmak részletes listája jelenléttel és perselypénzzel.',
  },
  {
    id: 'kateketikai_osszesito',
    title: 'Katekétikai összesítő',
    subtitle: 'Vallásóra, konfirmáció, ifjúság',
    description: 'A katekézis alkalmak összefoglalása létszámmal és témasorrenddel.',
  },
  {
    id: 'diakoniai_osszesito',
    title: 'Diakóniai összesítő',
    subtitle: 'Család- és beteglátogatás',
    description: 'A lelkipásztori látogatások listája címmel és megjegyzéssel.',
  },
  {
    id: 'eves_jelentes',
    title: 'Éves lelkészi jelentés',
    subtitle: 'Hivatalos leadandó jelentés',
    description: 'A teljes éves szolgálat összegzése a hivatalos 10 szekciós struktúrában, aláírási résszel.',
  },
]

// ---------------------------------------------------------------------------
// Segédfüggvények
// ---------------------------------------------------------------------------

function esc(value: string | null | undefined) {
  if (value == null) return ''
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function fmtNum(value: number) {
  return Number(value || 0).toLocaleString('hu-HU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtDate(value?: string | null) {
  if (!value) return '—'
  return value.split('T')[0] || '—'
}

function attendance(e: WorklogEntry): number {
  return (e.jelenlet_ferfi || 0) + (e.jelenlet_no || 0) + (e.jelenlet_gyermek || 0)
}

// 2026-06-12 (Endre #3 munkanapló): a közös kategorizáló (kategoria mező +
// jellege fallback) — így az anyakönyvből szinkronizált kazuáliák is a
// megfelelő összesítőbe esnek.
function categorize(e: WorklogEntry): WorklogCategory {
  return categorizeWorklogEntry(e)
}

function monthLabel(monthStr: string): string {
  const months = [
    'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
    'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
  ]
  const m = parseInt(monthStr, 10)
  return months[m - 1] || monthStr
}

// ---------------------------------------------------------------------------
// Stílusok (leltár séma)
// ---------------------------------------------------------------------------

function styles(orientation: 'portrait' | 'landscape') {
  const pw = orientation === 'landscape' ? '297mm' : '210mm'
  const ph = orientation === 'landscape' ? '210mm' : '297mm'
  return `
    @page { size: A4 ${orientation}; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; color: #111827; margin: 0; background: #e2e8f0; padding: 18px 0; }
    .page { width: ${pw}; min-height: ${ph}; margin: 0 auto 18px; background: #fff; box-shadow: 0 18px 40px rgba(15,23,42,.12); padding: 12mm; break-after: page; position: relative; }
    .page:last-child { break-after: auto; }
    .title { font-size: 20px; font-weight: bold; text-align: center; margin-bottom: 6px; text-transform: uppercase; }
    .subtitle { font-size: 12px; text-align: center; margin-bottom: 14px; color: #475569; }
    .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 6px 24px; margin-bottom: 14px; font-size: 12px; }
    .meta-grid strong { color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #334155; padding: 5px 6px; vertical-align: top; font-size: 11px; }
    th { background: #e2e8f0; text-align: center; font-weight: bold; }
    thead { display: table-header-group; }
    tr, td, th { page-break-inside: avoid; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .section { margin-top: 14px; }
    .section-title { margin: 0 0 6px; font-size: 13px; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #334155; padding-bottom: 3px; }
    .totals { font-weight: bold; background: #f8fafc; }
    .field-row { display: flex; gap: 24px; font-size: 12px; margin-bottom: 3px; }
    .field-row .label { color: #475569; min-width: 220px; }
    .field-row .value { font-weight: bold; color: #0f172a; }
    .stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; margin-bottom: 14px; }
    .stat-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; text-align: center; }
    .stat-box .label { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; }
    .stat-box .value { font-size: 16px; font-weight: bold; margin-top: 3px; }
    .signature-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 18px; margin-top: 28px; }
    .signature-box { text-align: center; font-size: 12px; }
    .signature-line { margin-top: 30px; border-top: 1px solid #0f172a; padding-top: 5px; }
    .page-footer { margin-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; }
    .note { margin-top: 8px; border: 1px solid #cbd5e1; background: #f8fafc; padding: 8px 10px; font-size: 11px; color: #475569; }
    @media print { body { background: #fff; padding: 0; } .page { width: auto; min-height: auto; margin: 0; box-shadow: none; } }
  `
}

function wrap(title: string, orientation: 'portrait' | 'landscape', content: string) {
  return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8" /><title>${esc(title)}</title><style>${styles(orientation)}</style></head><body>${content}</body></html>`
}

// ---------------------------------------------------------------------------
// Szűrők
// ---------------------------------------------------------------------------

export interface WorklogReportFilters {
  year: number
  month?: string | null
}

function filter(entries: WorklogEntry[], f: WorklogReportFilters, cat?: WorklogCategory): WorklogEntry[] {
  return entries.filter((e) => {
    if (e.deleted) return false
    const d = e.idopont?.split('T')[0] || ''
    if (!d.startsWith(String(f.year))) return false
    if (f.month && !d.startsWith(f.month)) return false
    if (cat && categorize(e) !== cat) return false
    return true
  }).sort((a, b) => (a.idopont || '').localeCompare(b.idopont || ''))
}

function period(f: WorklogReportFilters): string {
  return f.month ? monthLabel(f.month.split('-')[1]) + ` ${f.year}` : `${f.year}. év`
}

function footer(name: string, p: string) {
  return `<div class="page-footer"><span>Kartotéka — ${esc(name)}</span><span>${p}</span></div>`
}

// ---------------------------------------------------------------------------
// 1. Szolgálati összesítő
// ---------------------------------------------------------------------------

function buildSzolgalati(entries: WorklogEntry[], name: string, f: WorklogReportFilters): WorklogPrintResult {
  const rows = filter(entries, f, 'szolgalat')
  const p = period(f)
  const totAtt = rows.reduce((s, e) => s + attendance(e), 0)
  const totOff = rows.reduce((s, e) => s + Number(e.persely || 0), 0)

  let tbody = ''
  rows.forEach((e, i) => {
    tbody += `<tr>
      <td class="text-center">${i + 1}</td>
      <td>${fmtDate(e.idopont)}</td>
      <td>${esc(e.jellege)}</td>
      <td>${esc(e.cim || '')}</td>
      <td>${esc(e.alapige || '')}</td>
      <td class="text-center">${e.jelenlet_ferfi || ''}</td>
      <td class="text-center">${e.jelenlet_no || ''}</td>
      <td class="text-center">${e.jelenlet_gyermek || ''}</td>
      <td class="text-right">${e.persely ? fmtNum(Number(e.persely)) : ''}</td>
      <td>${esc(e.szolgalt || '')}</td>
      <td>${esc(e.megjegyzes || '')}</td>
    </tr>`
  })

  const html = `<div class="page">
    <div class="title">Szolgálati összesítő</div>
    <div class="subtitle">${esc(name)} — ${p}</div>
    <div class="meta-grid">
      <div><strong>Alkalmak száma:</strong> ${rows.length}</div>
      <div><strong>Összjelenlét:</strong> ${totAtt} fő</div>
      <div><strong>Összperselypénz:</strong> ${fmtNum(totOff)} RON</div>
      <div><strong>Időszak:</strong> ${p}</div>
    </div>
    <table>
      <thead><tr>
        <th>Ssz.</th><th>Dátum</th><th>Szolgálat jellege</th><th>Cím/téma</th>
        <th>Igehely</th><th>Férfi</th><th>Nő</th><th>Gyermek</th><th>Persely</th><th>Szolgált</th><th>Megjegyzés</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
      <tfoot><tr class="totals">
        <td colspan="5" class="text-right">Összesen:</td>
        <td class="text-center" colspan="3">${totAtt} fő</td>
        <td class="text-right">${fmtNum(totOff)}</td>
        <td colspan="2"></td>
      </tr></tfoot>
    </table>
    ${footer(name, p)}
  </div>`

  return { title: 'Szolgálati összesítő', filename: `Szolgalati_osszesito_${f.year}.pdf`, orientation: 'landscape', html: wrap('Szolgálati összesítő', 'landscape', html) }
}

// ---------------------------------------------------------------------------
// 2. Katekétikai összesítő
// ---------------------------------------------------------------------------

function buildKateketikai(entries: WorklogEntry[], name: string, f: WorklogReportFilters): WorklogPrintResult {
  const rows = filter(entries, f, 'katekezis')
  const p = period(f)
  const totAtt = rows.reduce((s, e) => s + attendance(e), 0)
  const totOff = rows.reduce((s, e) => s + Number(e.persely || 0), 0)

  let tbody = ''
  rows.forEach((e, i) => {
    tbody += `<tr>
      <td class="text-center">${i + 1}</td>
      <td>${fmtDate(e.idopont)}</td>
      <td>${esc(e.jellege)}</td>
      <td>${esc(e.cim || '')}</td>
      <td class="text-center">${attendance(e) || ''}</td>
      <td class="text-right">${e.persely ? fmtNum(Number(e.persely)) : ''}</td>
      <td>${esc(e.szolgalt || '')}</td>
      <td>${esc(e.megjegyzes || '')}</td>
    </tr>`
  })

  const html = `<div class="page">
    <div class="title">Katekétikai összesítő</div>
    <div class="subtitle">${esc(name)} — ${p}</div>
    <div class="meta-grid">
      <div><strong>Alkalmak száma:</strong> ${rows.length}</div>
      <div><strong>Összjelenlét:</strong> ${totAtt} fő</div>
      <div><strong>Összperselypénz:</strong> ${fmtNum(totOff)} RON</div>
      <div><strong>Időszak:</strong> ${p}</div>
    </div>
    <table>
      <thead><tr>
        <th>Ssz.</th><th>Dátum</th><th>Katekézis jellege</th><th>Tananyag/téma</th>
        <th>Részt vett</th><th>Persely</th><th>Tartotta</th><th>Megjegyzés</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
      <tfoot><tr class="totals">
        <td colspan="4" class="text-right">Összesen:</td>
        <td class="text-center">${totAtt} fő</td>
        <td class="text-right">${fmtNum(totOff)}</td>
        <td colspan="2"></td>
      </tr></tfoot>
    </table>
    ${footer(name, p)}
  </div>`

  return { title: 'Katekétikai összesítő', filename: `Kateketikai_osszesito_${f.year}.pdf`, orientation: 'landscape', html: wrap('Katekétikai összesítő', 'landscape', html) }
}

// ---------------------------------------------------------------------------
// 3. Diakóniai összesítő
// ---------------------------------------------------------------------------

function buildDiakoniai(entries: WorklogEntry[], name: string, f: WorklogReportFilters): WorklogPrintResult {
  const rows = filter(entries, f, 'latogatas')
  const p = period(f)

  let tbody = ''
  rows.forEach((e, i) => {
    tbody += `<tr>
      <td class="text-center">${i + 1}</td>
      <td>${fmtDate(e.idopont)}</td>
      <td>${esc(e.jellege)}</td>
      <td>${esc(e.cim || '')}</td>
      <td class="text-center">${attendance(e) || ''}</td>
      <td>${esc(e.megjegyzes || '')}</td>
    </tr>`
  })

  const html = `<div class="page">
    <div class="title">Diakóniai összesítő</div>
    <div class="subtitle">${esc(name)} — ${p}</div>
    <div class="meta-grid">
      <div><strong>Látogatások száma:</strong> ${rows.length}</div>
      <div><strong>Időszak:</strong> ${p}</div>
    </div>
    <table>
      <thead><tr>
        <th>Ssz.</th><th>Dátum</th><th>Látogatás típusa</th>
        <th>Meglátogatott család/személy</th><th>Jelen volt</th><th>Megjegyzés</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
      <tfoot><tr class="totals">
        <td colspan="4" class="text-right">Összesen:</td>
        <td class="text-center">${rows.length} alkalom</td>
        <td></td>
      </tr></tfoot>
    </table>
    ${footer(name, p)}
  </div>`

  return { title: 'Diakóniai összesítő', filename: `Diakoniai_osszesito_${f.year}.pdf`, orientation: 'landscape', html: wrap('Diakóniai összesítő', 'landscape', html) }
}

// ---------------------------------------------------------------------------
// 4. Éves lelkészi jelentés — hivatalos 10 szekciós struktúra
// ---------------------------------------------------------------------------

function buildEvesJelentes(entries: WorklogEntry[], name: string, f: WorklogReportFilters): WorklogPrintResult {
  const p = `${f.year}. év`
  const all = filter(entries, f)

  const stats: Record<WorklogCategory, { count: number; att: number; off: number; male: number; female: number; child: number }> = {
    szolgalat: { count: 0, att: 0, off: 0, male: 0, female: 0, child: 0 },
    katekezis: { count: 0, att: 0, off: 0, male: 0, female: 0, child: 0 },
    latogatas: { count: 0, att: 0, off: 0, male: 0, female: 0, child: 0 },
  }

  for (const e of all) {
    const c = categorize(e)
    stats[c].count += 1
    stats[c].att += attendance(e)
    stats[c].off += Number(e.persely || 0)
    stats[c].male += e.jelenlet_ferfi || 0
    stats[c].female += e.jelenlet_no || 0
    stats[c].child += e.jelenlet_gyermek || 0
  }

  const tot = { count: all.length, att: 0, off: 0, male: 0, female: 0, child: 0 }
  for (const v of Object.values(stats)) {
    tot.att += v.att; tot.off += v.off; tot.male += v.male; tot.female += v.female; tot.child += v.child
  }

  // Szolgálat típusonkénti bontás
  const serviceTypes = new Map<string, { count: number; att: number; off: number }>()
  for (const e of filter(entries, f, 'szolgalat')) {
    const key = e.jellege || 'Egyéb'
    const cur = serviceTypes.get(key) || { count: 0, att: 0, off: 0 }
    cur.count += 1; cur.att += attendance(e); cur.off += Number(e.persely || 0)
    serviceTypes.set(key, cur)
  }

  // Katekézis típusonkénti bontás
  const catechTypes = new Map<string, { count: number; att: number }>()
  for (const e of filter(entries, f, 'katekezis')) {
    const key = e.jellege || 'Egyéb'
    const cur = catechTypes.get(key) || { count: 0, att: 0 }
    cur.count += 1; cur.att += attendance(e)
    catechTypes.set(key, cur)
  }

  // Havi bontás
  const monthly: Array<{ label: string; sz: number; ka: number; la: number; att: number; off: number }> = []
  for (let m = 1; m <= 12; m++) {
    const ms = `${f.year}-${String(m).padStart(2, '0')}`
    const me = all.filter((e) => (e.idopont || '').startsWith(ms))
    if (me.length === 0) continue
    monthly.push({
      label: monthLabel(String(m)),
      sz: me.filter((e) => categorize(e) === 'szolgalat').length,
      ka: me.filter((e) => categorize(e) === 'katekezis').length,
      la: me.filter((e) => categorize(e) === 'latogatas').length,
      att: me.reduce((s, e) => s + attendance(e), 0),
      off: me.reduce((s, e) => s + Number(e.persely || 0), 0),
    })
  }

  // Szolgálati típusok sorok
  let svcRows = ''
  serviceTypes.forEach((v, k) => {
    svcRows += `<tr><td>${esc(k)}</td><td class="text-center">${v.count}</td><td class="text-center">${v.att}</td><td class="text-right">${fmtNum(v.off)}</td></tr>`
  })

  // Katekézis típusok sorok
  let catRows = ''
  catechTypes.forEach((v, k) => {
    catRows += `<tr><td>${esc(k)}</td><td class="text-center">${v.count}</td><td class="text-center">${v.att}</td></tr>`
  })

  // Havi sorok
  let monthRows = ''
  monthly.forEach((md) => {
    monthRows += `<tr><td>${md.label}</td><td class="text-center">${md.sz}</td><td class="text-center">${md.ka}</td><td class="text-center">${md.la}</td><td class="text-center">${md.sz + md.ka + md.la}</td><td class="text-center">${md.att}</td><td class="text-right">${fmtNum(md.off)}</td></tr>`
  })

  // Kategória összegző
  let catSumRows = ''
  for (const c of WORKLOG_CATEGORIES) {
    catSumRows += `<tr><td>${WORKLOG_CATEGORY_LABELS[c]}</td><td class="text-center">${stats[c].count}</td><td class="text-center">${stats[c].male}</td><td class="text-center">${stats[c].female}</td><td class="text-center">${stats[c].child}</td><td class="text-center">${stats[c].att}</td><td class="text-right">${fmtNum(stats[c].off)}</td></tr>`
  }

  // ---------- Oldalak összeállítása ----------

  // 1. oldal: fejléc + áttekintő statisztikák
  const page1 = `<div class="page">
    <div class="title">Lelkészi jelentés</div>
    <div class="subtitle">${esc(name)} — ${p}</div>

    <div class="stat-grid">
      <div class="stat-box"><div class="label">Összes alkalom</div><div class="value">${tot.count}</div></div>
      <div class="stat-box"><div class="label">Szolgálat</div><div class="value">${stats.szolgalat.count}</div></div>
      <div class="stat-box"><div class="label">Katekézis</div><div class="value">${stats.katekezis.count}</div></div>
      <div class="stat-box"><div class="label">Látogatás</div><div class="value">${stats.latogatas.count}</div></div>
    </div>

    <div class="section">
      <h3 class="section-title">I. Összesített kategóriánkénti kimutatás</h3>
      <table>
        <thead><tr><th>Kategória</th><th>Alkalmak</th><th>Férfi</th><th>Nő</th><th>Gyermek</th><th>Összjelenlét</th><th>Perselypénz (RON)</th></tr></thead>
        <tbody>${catSumRows}</tbody>
        <tfoot><tr class="totals"><td class="text-right">Összesen:</td><td class="text-center">${tot.count}</td><td class="text-center">${tot.male}</td><td class="text-center">${tot.female}</td><td class="text-center">${tot.child}</td><td class="text-center">${tot.att}</td><td class="text-right">${fmtNum(tot.off)}</td></tr></tfoot>
      </table>
    </div>

    <div class="section">
      <h3 class="section-title">II. Istentisztelet és szolgálati alkalmak</h3>
      <table>
        <thead><tr><th>Szolgálat típusa</th><th>Alkalmak száma</th><th>Jelenlét (fő)</th><th>Perselypénz (RON)</th></tr></thead>
        <tbody>${svcRows}</tbody>
        <tfoot><tr class="totals"><td class="text-right">Összesen:</td><td class="text-center">${stats.szolgalat.count}</td><td class="text-center">${stats.szolgalat.att}</td><td class="text-right">${fmtNum(stats.szolgalat.off)}</td></tr></tfoot>
      </table>
      <div class="note">
        Átlagjelenlét vasárnapi istentiszteleten: <strong>${stats.szolgalat.count > 0 ? Math.round(stats.szolgalat.att / stats.szolgalat.count) : 0} fő</strong> /alkalom
      </div>
    </div>

    ${footer(name, p)}
  </div>`

  // 2. oldal: Gyülekezetgondozás (katekézis + látogatás) + havi bontás
  const page2 = `<div class="page">
    <div class="title" style="font-size:16px">Lelkészi jelentés — ${esc(name)} — ${p}</div>

    <div class="section">
      <h3 class="section-title">III. Gyülekezetgondozás — Katekézis</h3>
      <table>
        <thead><tr><th>Katekézis típusa</th><th>Alkalmak száma</th><th>Jelenlét (fő)</th></tr></thead>
        <tbody>${catRows}</tbody>
        <tfoot><tr class="totals"><td class="text-right">Összesen:</td><td class="text-center">${stats.katekezis.count}</td><td class="text-center">${stats.katekezis.att}</td></tr></tfoot>
      </table>
    </div>

    <div class="section">
      <h3 class="section-title">IV. Gyülekezetgondozás — Pásztori látogatás</h3>
      <div class="meta-grid">
        <div><strong>Meglátogatott családok/személyek:</strong> ${stats.latogatas.count}</div>
        <div><strong>Összjelenlét:</strong> ${stats.latogatas.att} fő</div>
      </div>
      <div class="note">
        A lelkipásztor az év folyamán <strong>${stats.latogatas.count}</strong> látogatási alkalmat rögzített.
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">V. Havi bontás</h3>
      <table>
        <thead><tr><th>Hónap</th><th>Szolgálat</th><th>Katekézis</th><th>Látogatás</th><th>Összesen</th><th>Jelenlét</th><th>Persely (RON)</th></tr></thead>
        <tbody>${monthRows}</tbody>
        <tfoot><tr class="totals"><td class="text-right">Összesen:</td><td class="text-center">${stats.szolgalat.count}</td><td class="text-center">${stats.katekezis.count}</td><td class="text-center">${stats.latogatas.count}</td><td class="text-center">${tot.count}</td><td class="text-center">${tot.att}</td><td class="text-right">${fmtNum(tot.off)}</td></tr></tfoot>
      </table>
    </div>

    <div class="section">
      <h3 class="section-title">VI. Perselypénz összesítés</h3>
      <div class="meta-grid">
        <div><strong>A perselypénz éves összege:</strong> ${fmtNum(tot.off)} RON</div>
        <div><strong>Szolgálati perselypénz:</strong> ${fmtNum(stats.szolgalat.off)} RON</div>
        <div><strong>Katekézis perselypénz:</strong> ${fmtNum(stats.katekezis.off)} RON</div>
        <div><strong>Havi átlag:</strong> ${fmtNum(tot.off / 12)} RON</div>
      </div>
    </div>

    <div class="signature-grid">
      <div class="signature-box"><div class="signature-line">Lelkipásztor</div></div>
      <div class="signature-box"><div class="signature-line">Főgondnok</div></div>
      <div class="signature-box"><div class="signature-line">Jegyző</div></div>
    </div>

    ${footer(name, p)}
  </div>`

  return {
    title: 'Lelkészi jelentés',
    filename: `Lelkeszi_jelentes_${f.year}.pdf`,
    orientation: 'portrait',
    html: wrap('Lelkészi jelentés', 'portrait', page1 + page2),
  }
}

// ---------------------------------------------------------------------------
// Fő belépési pont
// ---------------------------------------------------------------------------

export function buildWorklogPrintDocument({
  type,
  entries,
  congregationName,
  filters,
}: {
  type: WorklogPrintType
  entries: WorklogEntry[]
  congregationName: string
  filters: WorklogReportFilters
}): WorklogPrintResult {
  switch (type) {
    case 'szolgalati_osszesito':
      return buildSzolgalati(entries, congregationName, filters)
    case 'kateketikai_osszesito':
      return buildKateketikai(entries, congregationName, filters)
    case 'diakoniai_osszesito':
      return buildDiakoniai(entries, congregationName, filters)
    case 'eves_jelentes':
      return buildEvesJelentes(entries, congregationName, filters)
  }
}
