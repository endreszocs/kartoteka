// 2026-08-25 (gyülekezeti egységek, 3. ütem): „Gyülekezetenkénti kimutatás" —
// FEKVŐ A4 nyomtatott melléklet a lelkészi jelentéshez.
//
// A hivatalos EREK űrlap ÉRINTETLEN (abban nincs bontás) — ez egy külön,
// belső használatra / vizitációra szánt melléklet. TISZTA függvény (nincs
// DOM-hivatkozás), a hívó printToPdf/printToBrowser-be tölti.
//
// Cellalogika = a bontás-tábláé: felulirasok[egyseg:<id>:<mezoId>] >
// bontas.auto[oszlop][mezoId] > kezi[egyseg:<id>:<mezoId>]; üres cella '—'
// (= nincs adat, NEM nulla — lábjegyzet mondja ki). A Σ oszlop a FŐ jelentés
// feloldott értéke (mezoErtek), nem a cellák összege.
//
// Stílus-minta: lib/worklog/official-journal.ts STYLES (A4 landscape,
// WYSIWYG — @page margin 0, a lap-margót a .sheet paddingje adja).

import { JELENTES_MEZOK, mezoErtek, type LelkesziJelentesData } from './types'
import {
  ANYA_OSZLOP_ID,
  ANYAKOZPONT_CIMKE,
  BONTAS_MEZO_IDS,
  EGYSEG_TIPUS_CIMKEK,
  egysegMezoKulcs,
} from '@/lib/gyulekezet/egysegek-shared'
import type { JelentesBontas } from './worklog-auto'

/**
 * 2026-08-25 (társegyházközség): a bontás + a „központ" oszlop felirata
 * (társnál „Közös (egész egyházközség)"). A kozpontCimke a régi — a társ-forma
 * előtt véglegesített — snapshotból hiányozhat: ilyenkor ANYAKOZPONT_CIMKE.
 */
type BontasAdat = JelentesBontas & { kozpontCimke?: string }

// ---------------------------------------------------------------------------
// Segédek (a ./print.ts bevált helperjeinek másolata)
// ---------------------------------------------------------------------------

function esc(value: string | null | undefined): string {
  if (value == null) return ''
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Magyar számformátum a nyomtatványra: ezres tagolás nem törő szóközzel,
 * tizedesvessző, legfeljebb 2 tizedes (a záró nullák elhagyásával).
 */
function fmtSzam(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const kerekitett = Math.round(v * 100) / 100
  const negativ = kerekitett < 0
  const [egesz, tizedes] = Math.abs(kerekitett).toFixed(2).split('.')
  const tagolt = egesz.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const tiz = (tizedes || '').replace(/0+$/, '')
  return `${negativ ? '-' : ''}${tagolt}${tiz ? `,${tiz}` : ''}`
}

const MEZO_BY_ID = new Map(JELENTES_MEZOK.map((m) => [m.id, m]))

// ---------------------------------------------------------------------------
// Stílusok — a lib/worklog/official-journal.ts STYLES mintája (A4 fekvő)
// ---------------------------------------------------------------------------

const STYLES = `
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Times New Roman', Georgia, serif; color: #111827; margin: 0; background: #e2e8f0; padding: 12px 0; font-size: 9pt; }
    /* Nagyobb bal padding (18mm): lefűzhetőség — lyukasztás-margó. */
    .sheet { width: 297mm; min-height: 210mm; margin: 0 auto 12px; background: #fff; box-shadow: 0 12px 30px rgba(15,23,42,.14); padding: 10mm 12mm 10mm 18mm; page-break-after: always; }
    .sheet:last-child { page-break-after: auto; margin-bottom: 0; }
    .sheet-head { margin-bottom: 4mm; }
    .head-line { display: flex; justify-content: space-between; align-items: baseline; font-size: 10pt; }
    .congregation { font-weight: bold; }
    .period { font-weight: bold; }
    .doc-title { text-align: center; font-size: 13pt; font-weight: bold; text-transform: uppercase; letter-spacing: .04em; margin-top: 2mm; }
    .doc-subtitle { text-align: center; font-size: 9pt; color: #475569; margin-top: 1mm; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 4mm; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th, td { border: 0.5pt solid #334155; padding: 2px 3px; vertical-align: middle; font-size: 8pt; overflow-wrap: anywhere; word-break: break-word; }
    th { background: #e2e8f0; text-align: center; font-weight: bold; font-size: 7.5pt; line-height: 1.2; }
    th .altipus { display: block; font-weight: normal; font-size: 6.5pt; color: #475569; }
    td.mutato { text-align: left; }
    td.mutato .mid { font-weight: bold; }
    td.mutato .egyseg-jel { color: #475569; font-size: 7pt; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.osszesen { font-weight: bold; background: #f8fafc; }
    /* Sok egység (5+): kisebb betű, hogy a fekvő lapra férjen. */
    table.sok-oszlop th, table.sok-oszlop td { font-size: 7pt; padding: 1px 2px; }
    table.sok-oszlop th { font-size: 6.5pt; }
    .labjegyzetek { margin-top: 4mm; font-size: 8pt; color: #334155; }
    .labjegyzetek p { margin: 0 0 1mm; }
    .hibak { margin-top: 3mm; border: 0.5pt solid #b45309; background: #fffbeb; padding: 2mm 3mm; font-size: 8pt; color: #78350f; }
    .hibak p { margin: 0 0 1mm; }
    @media print { body { background: #fff; padding: 0; } .sheet { margin: 0 auto; box-shadow: none; } }
`

// ---------------------------------------------------------------------------
// A melléklet HTML-je
// ---------------------------------------------------------------------------

/**
 * Egy bontás-cella feloldott értéke SZÖVEGKÉNT (escape-elve):
 * felulirasok > bontas.auto > kezi; üres → '—' (nincs adat, nem nulla).
 */
function cellaSzoveg(
  data: LelkesziJelentesData,
  bontas: JelentesBontas,
  oszlopId: string,
  mezoId: string,
): string {
  const kulcs = egysegMezoKulcs(oszlopId, mezoId)
  const felul = data.felulirasok[kulcs]
  if (felul !== undefined && felul !== null && felul !== '') {
    return typeof felul === 'number' ? fmtSzam(felul) : esc(String(felul))
  }
  const auto = bontas.auto[oszlopId]?.[mezoId]
  if (auto !== undefined && auto !== null) return fmtSzam(auto)
  const kezi = data.kezi[kulcs]
  if (kezi === undefined || kezi === null || kezi === '') return '—'
  return typeof kezi === 'number' ? fmtSzam(kezi) : esc(String(kezi))
}

/** A Σ oszlop: a FŐ jelentés feloldott értéke (felülírás > auto > kézi). */
function osszesenSzoveg(data: LelkesziJelentesData, mezoId: string): string {
  const v = mezoErtek(data, mezoId)
  if (v === null || v === undefined || v === '') return '—'
  return typeof v === 'number' ? fmtSzam(v) : esc(String(v))
}

/**
 * A „Gyülekezetenkénti kimutatás" fekvő A4 melléklete. TISZTA függvény —
 * a hívó (dialógus) printToPdf-be tölti landscape beállítással.
 */
export function buildBontasMellekletHtml(
  data: LelkesziJelentesData,
  bontas: BontasAdat,
  ev: number,
): string {
  const oszlopok: Array<{ id: string; nev: string; altipus: string | null }> = [
    // 2026-08-25 (társegyházközség): a „központ" oszlop felirata a bontásból
    // (társnál „Közös (egész egyházközség)"); régi snapshotnál fallback.
    { id: ANYA_OSZLOP_ID, nev: bontas.kozpontCimke ?? ANYAKOZPONT_CIMKE, altipus: null },
    ...bontas.egysegek.map((e) => ({
      id: e.id,
      nev: e.nev,
      altipus: EGYSEG_TIPUS_CIMKEK[e.tipus] || null,
    })),
  ]

  const fejlec =
    `<th style="width:62mm">Mutató</th>` +
    oszlopok
      .map(
        (o) =>
          `<th>${esc(o.nev)}${o.altipus ? `<span class="altipus">${esc(o.altipus)}</span>` : ''}</th>`,
      )
      .join('') +
    `<th style="width:24mm">Σ Összesen</th>`

  const sorok = BONTAS_MEZO_IDS.map((mezoId) => {
    const mezo = MEZO_BY_ID.get(mezoId)
    const felirat = mezo
      ? `<span class="mid">${esc(mezoId)}</span> — ${esc(mezo.label)}${
          mezo.egyseg ? ` <span class="egyseg-jel">(${esc(mezo.egyseg)})</span>` : ''
        }`
      : `<span class="mid">${esc(mezoId)}</span>`
    // Lábjegyzet-jelölők a két pénzügyi sorra (a jelölés a tábla alatt olvasható).
    const jelolo = mezoId === 'VII.1' ? ' <sup>1</sup>' : mezoId === 'VII.3' ? ' <sup>2</sup>' : ''
    const cellak = oszlopok
      .map((o) => `<td class="num">${cellaSzoveg(data, bontas, o.id, mezoId)}</td>`)
      .join('')
    return `<tr><td class="mutato">${felirat}${jelolo}</td>${cellak}<td class="num osszesen">${osszesenSzoveg(data, mezoId)}</td></tr>`
  }).join('')

  const hibakHtml =
    bontas.hibak.length > 0
      ? `<div class="hibak">${bontas.hibak.map((h) => `<p>⚠ ${esc(h)}</p>`).join('')}</div>`
      : ''

  const title = `Gyülekezetenkénti kimutatás ${ev} — ${data.congregationName}`
  // 5+ egységnél (7+ oszlop) kisebb betűméret — így a fekvő lapra fér; nagyon
  // sok egységnél a sorok több lapra törhetnek (tr page-break-inside: avoid).
  const sokOszlop = bontas.egysegek.length >= 5

  return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8" /><title>${esc(title)}</title><style>${STYLES}</style></head><body>
  <section class="sheet">
    <div class="sheet-head">
      <div class="head-line">
        <span class="congregation">${esc(data.congregationName || 'Egyházközség')}</span>
        <span class="period">${ev}. év</span>
      </div>
      <div class="doc-title">Gyülekezetenkénti kimutatás</div>
      <div class="doc-subtitle">Belső használatra / vizitációra — a hivatalos lelkészi jelentés melléklete (nem része az EREK űrlapnak)</div>
    </div>
    ${hibakHtml}
    <table${sokOszlop ? ' class="sok-oszlop"' : ''}>
      <thead><tr>${fejlec}</tr></thead>
      <tbody>${sorok}</tbody>
    </table>
    <div class="labjegyzetek">
      <p><sup>1</sup> VII.1 — egyházfenntartói járulék: a bontás a befizető személy egység-besorolása szerinti <strong>javaslat</strong> (a család-szintű vagy egység nélküli befizetés a központi oszlophoz számít).</p>
      <p><sup>2</sup> VII.3 — perselypénz: a bontás a <strong>munkanapló</strong> alkalom-sorainak persely-rovatából számol; a fő jelentés VII.3 rubrikája a könyvelt befizetésekből — a kettő ismert módon eltérhet.</p>
      <p>Üres cella (—) = nincs rögzített adat az egységre — nem nulla. A Σ Összesen oszlop a fő jelentés hivatalos (feloldott) értéke.</p>
    </div>
  </section>
</body></html>`
}
