/**
 * Éves jelentés nyomtatási modul — hivatalos 10 szekciós PDF.
 *
 * A `lib/worklog/reporting.ts` stílusrendszerét követi:
 *  - A4 portrait, 12mm margó, Times New Roman
 *  - Táblázatok border-ökkel, stat-box-ok, aláírási rács
 *  - Return: { title, html, filename, orientation }
 *
 * Input: `AnnualReportSnapshot` (a `lib/annual-report/generator.ts`-ből).
 * Kimenet: 3-4 oldalas HTML, amit a `print-engine-v2.ts` dolgoz fel.
 *
 * A UI-ban az éves jelentés űrlap „PDF letöltése" gombja hívja ezt a
 * függvényt — a szerkesztett snapshot alapján. Ez a snapshot eltérhet
 * az auto-generálttól, mert a felhasználó a szabadszöveges szekciókat
 * kitöltötte és a számokon finomhangolhatott.
 */

import type { AnnualReportSnapshot } from './generator'

// ---------------------------------------------------------------------------
// Típusok
// ---------------------------------------------------------------------------

export interface AnnualReportPrintResult {
  title: string
  filename: string
  orientation: 'portrait'
  html: string
}

// ---------------------------------------------------------------------------
// Segédfüggvények
// ---------------------------------------------------------------------------

function esc(value: string) {
  return value
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

function fmtInt(value: number) {
  return Number(value || 0).toLocaleString('hu-HU')
}

function nl2br(value: string | null | undefined): string {
  if (!value) return '<em style="color:#94a3b8">— (nincs kitöltve) —</em>'
  return esc(value).replaceAll('\n', '<br />')
}

function monthLabel(m: number): string {
  const months = [
    'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
    'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
  ]
  return months[m - 1] || String(m)
}

// ---------------------------------------------------------------------------
// Stílusok
// ---------------------------------------------------------------------------

function styles() {
  return `
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; color: #111827; margin: 0; background: #e2e8f0; padding: 18px 0; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto 18px; background: #fff; box-shadow: 0 18px 40px rgba(15,23,42,.12); padding: 12mm; break-after: page; position: relative; }
    .page:last-child { break-after: auto; }
    .title { font-size: 20px; font-weight: bold; text-align: center; margin-bottom: 4px; text-transform: uppercase; }
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
    .section { margin-top: 12px; }
    .section-title { margin: 0 0 6px; font-size: 13px; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #334155; padding-bottom: 3px; }
    .totals { font-weight: bold; background: #f8fafc; }
    .field-row { display: flex; gap: 24px; font-size: 12px; margin-bottom: 3px; }
    .field-row .label { color: #475569; min-width: 220px; }
    .field-row .value { font-weight: bold; color: #0f172a; }
    .stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; margin-bottom: 10px; }
    .stat-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; text-align: center; }
    .stat-box .label { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; }
    .stat-box .value { font-size: 16px; font-weight: bold; margin-top: 3px; }
    .signature-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 18px; margin-top: 28px; }
    .signature-box { text-align: center; font-size: 12px; }
    .signature-line { margin-top: 30px; border-top: 1px solid #0f172a; padding-top: 5px; }
    .page-footer { margin-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; position: absolute; bottom: 12mm; left: 12mm; right: 12mm; }
    .note { margin-top: 8px; border: 1px solid #cbd5e1; background: #f8fafc; padding: 8px 10px; font-size: 11px; color: #475569; }
    .free-text { border: 1px solid #cbd5e1; background: #fff; padding: 10px 12px; font-size: 12px; color: #1f2937; min-height: 60px; line-height: 1.5; white-space: pre-wrap; }
    .kv-grid { display: grid; grid-template-columns: minmax(160px, max-content) 1fr; gap: 3px 16px; font-size: 12px; margin-top: 6px; }
    .kv-grid .k { color: #475569; }
    .kv-grid .v { font-weight: bold; color: #0f172a; }
    @media print { body { background: #fff; padding: 0; } .page { width: auto; min-height: auto; margin: 0; box-shadow: none; } }
  `
}

function wrap(title: string, content: string) {
  return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8" /><title>${esc(title)}</title><style>${styles()}</style></head><body>${content}</body></html>`
}

function footer(name: string, year: number, pageNum: number, pageTotal: number) {
  return `<div class="page-footer"><span>Kartotéka — ${esc(name)} — ${year}. éves jelentés</span><span>${pageNum}. / ${pageTotal}. oldal</span></div>`
}

// ---------------------------------------------------------------------------
// Oldalak
// ---------------------------------------------------------------------------

function buildPage1(s: AnnualReportSnapshot, name: string): string {
  const g = s.szekcio1_gyulekezet
  const it = s.szekcio2_istentisztelet
  const kz = s.szekcio3_kazualiak

  // I. Gyülekezet adatai — kv-grid
  const congregationRows: Array<[string, string]> = [
    ['Gyülekezet hivatalos neve:', g.nev_hu || g.name || '—'],
    g.nev_ro ? ['Román nyelvű név:', g.nev_ro] : null,
    ['Cím:', g.cim || '—'],
    g.telefon ? ['Telefon:', g.telefon] : null,
    g.email ? ['E-mail:', g.email] : null,
    ['Egyházmegye:', g.diocese_name || g.egyhazmegye || '—'],
    ['Gyülekezeti lélekszám:', g.lelekszam != null ? `${g.lelekszam} fő` : '—'],
    ['Lelkipásztor:', g.lelkipasztor || '—'],
    ['Esperes:', g.esperes || '—'],
  ].filter(Boolean) as Array<[string, string]>

  let kvRows = ''
  for (const [k, v] of congregationRows) {
    kvRows += `<div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>`
  }

  // II. Istentiszteleti élet — KPI + típus bontás
  let tipusRows = ''
  for (const t of it.typusBontas) {
    tipusRows += `<tr><td>${esc(t.tipus)}</td><td class="text-center">${fmtInt(t.alkalom)}</td><td class="text-center">${fmtInt(t.jelenlet)}</td><td class="text-right">${fmtNum(t.persely)}</td></tr>`
  }

  // II. havi bontás — 12 hónap
  let havRows = ''
  for (const m of it.havibontas) {
    havRows += `<tr><td>${monthLabel(m.honap)}</td><td class="text-center">${fmtInt(m.alkalom)}</td><td class="text-center">${fmtInt(m.jelenlet)}</td><td class="text-right">${fmtNum(m.persely)}</td></tr>`
  }

  return `<div class="page">
    <div class="title">Éves lelkészi jelentés</div>
    <div class="subtitle">${esc(name)} — ${s.meta.year}. év</div>

    <div class="section">
      <h3 class="section-title">I. Gyülekezet adatai</h3>
      <div class="kv-grid">${kvRows}</div>
    </div>

    <div class="section">
      <h3 class="section-title">II. Istentiszteleti élet</h3>
      <div class="stat-grid">
        <div class="stat-box"><div class="label">Összes alkalom</div><div class="value">${fmtInt(it.osszesAlkalom)}</div></div>
        <div class="stat-box"><div class="label">Átlagjelenlét</div><div class="value">${fmtInt(it.atlagJelenlet)} fő</div></div>
        <div class="stat-box"><div class="label">Perselypénz</div><div class="value">${fmtNum(it.perselyOsszesen)} RON</div></div>
        <div class="stat-box"><div class="label">Keresztelt</div><div class="value">${fmtInt(kz.keresztseg)}</div></div>
      </div>

      ${
        it.typusBontas.length > 0
          ? `<table>
        <thead><tr><th>Típus</th><th>Alkalom</th><th>Jelenlét (fő)</th><th>Persely (RON)</th></tr></thead>
        <tbody>${tipusRows}</tbody>
        <tfoot><tr class="totals"><td class="text-right">Összesen:</td><td class="text-center">${fmtInt(it.osszesAlkalom)}</td><td class="text-center">${fmtInt(it.typusBontas.reduce((s, t) => s + t.jelenlet, 0))}</td><td class="text-right">${fmtNum(it.perselyOsszesen)}</td></tr></tfoot>
      </table>`
          : '<div class="note">Nincs rögzített istentiszteleti alkalom erre az évre.</div>'
      }

      ${
        it.havibontas.length > 0
          ? `<h3 class="section-title" style="margin-top:12px">Havi bontás</h3>
      <table>
        <thead><tr><th>Hónap</th><th>Alkalom</th><th>Jelenlét</th><th>Persely (RON)</th></tr></thead>
        <tbody>${havRows}</tbody>
      </table>`
          : ''
      }
    </div>

    ${footer(name, s.meta.year, 1, 3)}
  </div>`
}

function buildPage2(s: AnnualReportSnapshot, name: string): string {
  const kz = s.szekcio3_kazualiak
  const le = s.szekcio4_lelkielet
  const kt = s.szekcio5_katekezis
  const pu = s.szekcio6_penzugy

  let ktRows = ''
  for (const t of kt.typusBontas) {
    ktRows += `<tr><td>${esc(t.tipus)}</td><td class="text-center">${fmtInt(t.alkalom)}</td><td class="text-center">${fmtInt(t.jelenlet)}</td></tr>`
  }

  return `<div class="page">
    <div class="title" style="font-size:16px">Éves jelentés — ${esc(name)} — ${s.meta.year}. év</div>

    <div class="section">
      <h3 class="section-title">III. Kazuáliák</h3>
      <div class="stat-grid">
        <div class="stat-box"><div class="label">Keresztelő</div><div class="value">${fmtInt(kz.keresztseg)}</div></div>
        <div class="stat-box"><div class="label">Esküvő</div><div class="value">${fmtInt(kz.hazassag)}</div></div>
        <div class="stat-box"><div class="label">Temetés</div><div class="value">${fmtInt(kz.temetes)}</div></div>
        <div class="stat-box"><div class="label">Konfirmálás</div><div class="value">${fmtInt(kz.konfirmalas)}</div></div>
      </div>
      <div class="note">Az év során összesen <strong>${fmtInt(kz.osszes)}</strong> kazuália zajlott.</div>
    </div>

    <div class="section">
      <h3 class="section-title">IV. Lelki élet</h3>
      <div class="field-row">
        <span class="label">A konfirmáltak száma:</span>
        <span class="value">${fmtInt(le.konfirmaltakSzama)}</span>
      </div>
      <div class="free-text" style="margin-top:6px">${nl2br(le.szoveg)}</div>
    </div>

    <div class="section">
      <h3 class="section-title">V. Katekézis</h3>
      <div class="stat-grid" style="grid-template-columns: repeat(2, minmax(0,1fr))">
        <div class="stat-box"><div class="label">Összes alkalom</div><div class="value">${fmtInt(kt.osszesAlkalom)}</div></div>
        <div class="stat-box"><div class="label">Összes jelenlét</div><div class="value">${fmtInt(kt.osszesJelenlet)} fő</div></div>
      </div>
      ${
        kt.typusBontas.length > 0
          ? `<table>
        <thead><tr><th>Katekézis típusa</th><th>Alkalom</th><th>Jelenlét (fő)</th></tr></thead>
        <tbody>${ktRows}</tbody>
        <tfoot><tr class="totals"><td class="text-right">Összesen:</td><td class="text-center">${fmtInt(kt.osszesAlkalom)}</td><td class="text-center">${fmtInt(kt.osszesJelenlet)}</td></tr></tfoot>
      </table>`
          : '<div class="note">Nincs rögzített katekézis alkalom erre az évre.</div>'
      }
    </div>

    <div class="section">
      <h3 class="section-title">VI. Pénzügyi helyzet</h3>
      <div class="stat-grid" style="grid-template-columns: repeat(3, minmax(0,1fr))">
        <div class="stat-box"><div class="label">Bevétel</div><div class="value">${fmtNum(pu.bevetel)} RON</div></div>
        <div class="stat-box"><div class="label">Kiadás</div><div class="value">${fmtNum(pu.kiadas)} RON</div></div>
        <div class="stat-box"><div class="label">Egyenleg</div><div class="value" style="color:${pu.egyenleg < 0 ? '#dc2626' : '#059669'}">${fmtNum(pu.egyenleg)} RON</div></div>
      </div>
      <div class="note">
        ${
          pu.egyenleg >= 0
            ? `A gyülekezet pénzügyi egyenlege <strong>pozitív</strong> az év során.`
            : `Figyelem — a gyülekezet pénzügyi egyenlege <strong>negatív</strong>. A hiány rendezéséről külön beszámoló szükséges.`
        }
      </div>
    </div>

    ${footer(name, s.meta.year, 2, 3)}
  </div>`
}

function buildPage3(s: AnnualReportSnapshot, name: string): string {
  const pr = s.szekcio7_presbiterium
  const vg = s.szekcio8_vagyon
  const i9 = s.szekcio9_iskolaUgy
  const i10 = s.szekcio10_egyeb

  // VII. Presbitérium — névlista táblázatban
  let prRows = ''
  pr.nevek.forEach((p, i) => {
    prRows += `<tr><td class="text-center">${i + 1}.</td><td>${esc(p.nev)}</td><td>${esc(p.tisztseg)}</td></tr>`
  })

  // VIII. Vagyon — kategória bontás
  let vgRows = ''
  for (const k of vg.kategoriaBontas) {
    vgRows += `<tr><td>${esc(k.kategoria)}</td><td class="text-center">${fmtInt(k.tetel)}</td><td class="text-right">${fmtNum(k.ertek)} RON</td></tr>`
  }

  return `<div class="page">
    <div class="title" style="font-size:16px">Éves jelentés — ${esc(name)} — ${s.meta.year}. év</div>

    <div class="section">
      <h3 class="section-title">VII. Presbitérium</h3>
      <div class="field-row">
        <span class="label">A presbitérium létszáma:</span>
        <span class="value">${fmtInt(pr.presbiterekSzama)} fő</span>
      </div>
      ${
        pr.nevek.length > 0
          ? `<table>
        <thead><tr><th style="width:50px">#</th><th>Név</th><th>Tisztség</th></tr></thead>
        <tbody>${prRows}</tbody>
      </table>`
          : '<div class="note">Nincs rögzített presbiter.</div>'
      }
    </div>

    <div class="section">
      <h3 class="section-title">VIII. Egyházi vagyon</h3>
      <div class="stat-grid" style="grid-template-columns: repeat(2, minmax(0,1fr))">
        <div class="stat-box"><div class="label">Leltári tételek száma</div><div class="value">${fmtInt(vg.teteleSzama)}</div></div>
        <div class="stat-box"><div class="label">Összérték</div><div class="value">${fmtNum(vg.teljesertek)} RON</div></div>
      </div>
      ${
        vg.kategoriaBontas.length > 0
          ? `<table>
        <thead><tr><th>Kategória</th><th>Tétel</th><th>Érték (RON)</th></tr></thead>
        <tbody>${vgRows}</tbody>
        <tfoot><tr class="totals"><td class="text-right">Összesen:</td><td class="text-center">${fmtInt(vg.teteleSzama)}</td><td class="text-right">${fmtNum(vg.teljesertek)}</td></tr></tfoot>
      </table>`
          : '<div class="note">Nincs rögzített leltári tétel.</div>'
      }
    </div>

    <div class="section">
      <h3 class="section-title">IX. Iskolaügy</h3>
      <div class="free-text">${nl2br(i9.szoveg)}</div>
    </div>

    <div class="section">
      <h3 class="section-title">X. Egyéb</h3>
      <div class="free-text">${nl2br(i10.szoveg)}</div>
    </div>

    <div class="signature-grid">
      <div class="signature-box"><div class="signature-line">Lelkipásztor</div></div>
      <div class="signature-box"><div class="signature-line">Főgondnok</div></div>
      <div class="signature-box"><div class="signature-line">Jegyző</div></div>
    </div>

    ${footer(name, s.meta.year, 3, 3)}
  </div>`
}

// ---------------------------------------------------------------------------
// Fő belépési pont
// ---------------------------------------------------------------------------

export function buildAnnualReportPrintDocument(
  snapshot: AnnualReportSnapshot,
): AnnualReportPrintResult {
  const name = snapshot.szekcio1_gyulekezet.nev_hu || snapshot.szekcio1_gyulekezet.name || 'Gyülekezet'
  const year = snapshot.meta.year

  const html = wrap(
    `Éves jelentés — ${name} — ${year}`,
    buildPage1(snapshot, name) + buildPage2(snapshot, name) + buildPage3(snapshot, name),
  )

  return {
    title: `Éves jelentés — ${name} — ${year}`,
    filename: `Eves_jelentes_${year}_${name.replaceAll(/\s+/g, '_')}.pdf`,
    orientation: 'portrait',
    html,
  }
}
