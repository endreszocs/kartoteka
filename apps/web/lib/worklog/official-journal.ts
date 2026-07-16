// 2026-07-16 (F3): Hivatalos nyomtatott munkanapló — A4 fekvő HTML-generátor.
//
// A 2022-es hivatalos nyomtatvány („I. Igehirdetési alkalmak") hű HTML-mása:
// 19 oszlop, kétszintű fejléc, HÓNAPONKÉNT KÜLÖN LAP, hó végi összesítő +
// éves összesítő (utóbbi csak teljes évnél — hónap-szűrésnél félrevezető lenne).
// A jelenlét (F/N) mindig a classifyForOfficialJournal (print-columns.ts)
// által kijelölt oszlop-cellába kerül — determinisztikus típus→oszlop leképezés.
//
// MEGKÖTÉSEK:
//  - a hivatalos nyomtatványon NINCS gyermek-oszlop → a gyermek-jelenlét a hó
//    végi (és éves) összesítőben jelenik meg külön sorként (a cellákban csak F/N);
//  - a Sorszám ÉVEN BELÜL folyamatos (az összes dátum-rendezett soron végig,
//    nem laponként újrakezdve) — akkor is, ha csak kiválasztott hónapok
//    kerülnek lapra;
//  - a bal padding nagyobb (18mm) a lefűzhetőség (lyukasztás-margó) miatt;
//  - WYSIWYG-elv (minta: official-documents.ts): @page margin 0, a lap-margót
//    a .sheet paddingje adja — előnézet és nyomtatás azonos tördelésű;
//  - tisztán pure függvény (nincs DOM-hivatkozás) — a hívó iframe/srcDoc-ba tölti.

import { categorizeWorklogEntry, formatRon, type WorklogEntry } from '@/lib/constants/worklog'
import { classifyForOfficialJournal, getUnnepInfo, type JournalPlacement } from './print-columns'

// ---------------------------------------------------------------------------
// Típusok
// ---------------------------------------------------------------------------

export interface OfficialJournalOptions {
  entries: WorklogEntry[]
  year: number
  /** 1–12 — ha megadott, csak ezek a hónapok kapnak lapot (a sorszám akkor is éves marad). */
  months?: number[]
  congregationName: string
}

/**
 * A 7–17. oszlop szám-alrovatai a nyomtatvány sorrendjében (24 cella):
 * 7–9: De F | De N | Du F | Du N · 10: Reggel | Este · 11: F | N ·
 * 12: Templomban | Beteg · 13: Felnőtt | Ifjúsági · 14–17: egy-egy cella.
 */
type LeafKey =
  | 'vas_de_f' | 'vas_de_n' | 'vas_du_f' | 'vas_du_n'
  | 'unn_de_f' | 'unn_de_n' | 'unn_du_f' | 'unn_du_n'
  | 'sat_de_f' | 'sat_de_n' | 'sat_du_f' | 'sat_du_n'
  | 'bun_reggel' | 'bun_este'
  | 'het_f' | 'het_n'
  | 'uv_templom' | 'uv_beteg'
  | 'bib_felnott' | 'bib_ifjusagi'
  | 'presbiteri' | 'noszovetsegi' | 'unnepely' | 'egyeb'

const NUMERIC_LEAVES: LeafKey[] = [
  'vas_de_f', 'vas_de_n', 'vas_du_f', 'vas_du_n',
  'unn_de_f', 'unn_de_n', 'unn_du_f', 'unn_du_n',
  'sat_de_f', 'sat_de_n', 'sat_du_f', 'sat_du_n',
  'bun_reggel', 'bun_este',
  'het_f', 'het_n',
  'uv_templom', 'uv_beteg',
  'bib_felnott', 'bib_ifjusagi',
  'presbiteri', 'noszovetsegi', 'unnepely', 'egyeb',
]

// 6 szöveg-oszlop + 24 szám-alrovat + Szolgálattevő + Perselypénz = 32 cella/sor
const TOTAL_LEAF_COLUMNS = 6 + NUMERIC_LEAVES.length + 2

interface JournalRow {
  sorszam: number
  entry: WorklogEntry
  dateIso: string
  month: number
  vals: Partial<Record<LeafKey, number>>
}

interface JournalSums {
  leaves: Record<LeafKey, number>
  gyermek: number
  persely: number
}

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

const HONAP_ROVID = ['jan', 'febr', 'márc', 'ápr', 'máj', 'jún', 'júl', 'aug', 'szept', 'okt', 'nov', 'dec']
const HONAP_NEV = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
]

/** A nyomtatvány dátum-formátuma: 'jan 5.' */
function fmtNaploDatum(iso: string): string {
  const m = parseInt(iso.slice(5, 7), 10)
  const d = parseInt(iso.slice(8, 10), 10)
  if (!m || !d || !HONAP_ROVID[m - 1]) return iso
  return `${HONAP_ROVID[m - 1]} ${d}.`
}

/**
 * A hivatalos napló az igehirdetési alkalmakat tartalmazza: a szolgálat-kategória
 * sorai + az ifjúsági bibliaóra (13. oszlop Ifjúsági al-rovata — IKE + legacy
 * 'Ifjúsági óra', a print-columns BIBLIAORA_IFJUSAGI_TYPES-szal szinkronban).
 * Látogatás / egyéb katekézis nem kerül a nyomtatványra.
 * Exportálva: a nyomtatási dialógus „érintett bejegyzések" számlálója is ezt
 * a predikátumot használja.
 */
export function isJournalEntry(e: WorklogEntry): boolean {
  if (e.deleted) return false
  if (categorizeWorklogEntry(e) === 'szolgalat') return true
  return e.jellege === 'Ifjúsági bibliaóra (IKE)' || e.jellege === 'Ifjúsági óra'
}

/** A besorolt oszlop-cellák értékei egy sorhoz (üresen maradó cella = nincs kulcs). */
function leafValues(e: WorklogEntry, p: JournalPlacement): Partial<Record<LeafKey, number>> {
  const f = e.jelenlet_ferfi || 0
  const n = e.jelenlet_no || 0
  const osszes = f + n
  // Az ÖSSZEVONT (egycellás) oszlopok fallbackje: ha nincs F/N-bontás rögzítve
  // (pl. importált sorok — 'Ifjúsági óra' — csak összlétszámot hordoznak a
  // jelenlet_osszesen mezőben), az összlétszámra esünk vissza — enélkül a
  // jelenlétük eltűnne a nyomtatványról és az összesítőből.
  // Az F/N-bontott oszlopok (7–9. és 11.) SZÁNDÉKOSAN a rögzített F/N értéknél
  // maradnak: ott nemi bontás kell, és azt nem találjuk ki az összlétszámból.
  const osszevont = osszes > 0 ? osszes : (e.jelenlet_osszesen || 0)
  switch (p.column) {
    case 'vasarnapi':
      return p.slot === 'du' ? { vas_du_f: f, vas_du_n: n } : { vas_de_f: f, vas_de_n: n }
    case 'unnepi':
      return p.slot === 'du' ? { unn_du_f: f, unn_du_n: n } : { unn_de_f: f, unn_de_n: n }
    case 'satoros':
      return p.slot === 'du' ? { sat_du_f: f, sat_du_n: n } : { sat_de_f: f, sat_de_n: n }
    case 'bunbanati':
      // Megkötés: a bűnbánati cellába az össz-jelenlét (F+N, fallback: összesen) kerül, Reggel VAGY Este.
      return p.slot === 'este' ? { bun_este: osszevont } : { bun_reggel: osszevont }
    case 'hetkoznapi':
      return { het_f: f, het_n: n }
    case 'urvacsora': {
      // Megkötés: az úrvacsorázók a dedikált mezőkből (uv_templomban/uv_betegnel)
      // jönnek — egy sorból MINDKÉT cella töltődhet; ha a mezők üresek, a slot
      // szerinti cellába az össz-jelenlét (F+N) kerül.
      const out: Partial<Record<LeafKey, number>> = {}
      const templom = e.uv_templomban || 0
      const beteg = e.uv_betegnel || 0
      if (templom > 0) out.uv_templom = templom
      if (beteg > 0) out.uv_beteg = beteg
      if (templom <= 0 && beteg <= 0 && osszes > 0) {
        if (p.slot === 'betegnel') out.uv_beteg = osszes
        else out.uv_templom = osszes
      }
      return out
    }
    case 'bibliaora':
      return p.slot === 'ifjusagi' ? { bib_ifjusagi: osszevont } : { bib_felnott: osszevont }
    // 14–17. oszlop: össz-jelenlét (F+N, fallback: összesen) egyetlen cellába.
    case 'presbiteri':
      return { presbiteri: osszevont }
    case 'noszovetsegi':
      return { noszovetsegi: osszevont }
    case 'unnepely':
      return { unnepely: osszevont }
    case 'egyeb':
      return { egyeb: osszevont }
  }
}

function sumRows(rows: JournalRow[]): JournalSums {
  const leaves = {} as Record<LeafKey, number>
  for (const k of NUMERIC_LEAVES) leaves[k] = 0
  let gyermek = 0
  let persely = 0
  for (const r of rows) {
    for (const k of NUMERIC_LEAVES) leaves[k] += r.vals[k] || 0
    gyermek += r.entry.jelenlet_gyermek || 0
    persely += Number(r.entry.persely || 0)
  }
  return { leaves, gyermek, persely }
}

// ---------------------------------------------------------------------------
// Stílusok — WYSIWYG: @page margin 0, a lap-margót a .sheet paddingje adja
// ---------------------------------------------------------------------------

const STYLES = `
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Times New Roman', Georgia, serif; color: #111827; margin: 0; background: #e2e8f0; padding: 12px 0; font-size: 8pt; }
    /* Nagyobb bal padding (18mm): lefűzhetőség — lyukasztás-margó. */
    .sheet { width: 297mm; min-height: 210mm; margin: 0 auto 12px; background: #fff; box-shadow: 0 12px 30px rgba(15,23,42,.14); padding: 8mm 10mm 8mm 18mm; page-break-after: always; }
    .sheet:last-child { page-break-after: auto; margin-bottom: 0; }
    .sheet-head { margin-bottom: 3mm; }
    .head-line { display: flex; justify-content: space-between; align-items: baseline; font-size: 9pt; }
    .congregation { font-weight: bold; }
    .period { font-weight: bold; }
    .doc-title { text-align: center; font-size: 12pt; font-weight: bold; text-transform: uppercase; letter-spacing: .04em; margin-top: 1mm; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th, td { border: 0.5pt solid #334155; padding: 1px 2px; vertical-align: middle; font-size: 7pt; overflow-wrap: anywhere; word-break: break-word; }
    th { background: #e2e8f0; text-align: center; font-weight: bold; font-size: 6pt; line-height: 1.15; }
    td.num { text-align: center; }
    td.right { text-align: right; }
    tr.totals td { font-weight: bold; background: #f8fafc; }
    tr.gyermek td { text-align: left; }
    tr.annual td { background: #eef2f7; }
    .empty-note { margin-top: 8mm; font-size: 10pt; color: #475569; text-align: center; }
    @media print { body { background: #fff; padding: 0; } .sheet { margin: 0 auto; box-shadow: none; } }
`

// ---------------------------------------------------------------------------
// Táblázat-építők
// ---------------------------------------------------------------------------

function colgroupHtml(): string {
  const col = (w: string, n = 1) => `<col style="width:${w}" />`.repeat(n)
  return `<colgroup>
      ${col('7mm')}${col('11mm')}${col('24mm')}${col('17mm')}${col('15mm')}${col('19mm')}
      ${col('5mm', 12)}
      ${col('6.5mm', 2)}
      ${col('5mm', 2)}
      ${col('7mm', 2)}
      ${col('7mm', 2)}
      ${col('8mm', 4)}
      ${col('16mm')}${col('13mm')}
    </colgroup>`
}

/** Kétszintű fejléc — a 7–13. oszlop al-rovatokkal, minden lapon ismétlődik. */
function theadHtml(): string {
  const deDuFN = '<th>De. F</th><th>De. N</th><th>Du. F</th><th>Du. N</th>'
  return `<thead>
      <tr>
        <th rowspan="2">1.<br />Sorszám</th>
        <th rowspan="2">2.<br />Dátum</th>
        <th rowspan="2">3.<br />Szolgálat jellege</th>
        <th rowspan="2">4.<br />Bibliaolvasás</th>
        <th rowspan="2">5.<br />Alapige</th>
        <th rowspan="2">6.<br />Énekek</th>
        <th colspan="4">7. Vasárnapi istentisztelet</th>
        <th colspan="4">8. Ünnepi istentisztelet</th>
        <th colspan="4">9. Sátoros ünnepi istentisztelet</th>
        <th colspan="2">10. Bűnbánati istentisztelet</th>
        <th colspan="2">11. Hétköznapi rendszeres istentisztelet</th>
        <th colspan="2">12. Úrvacsora</th>
        <th colspan="2">13. Bibliaóra</th>
        <th rowspan="2">14. Presbiteri vagy felkészítő</th>
        <th rowspan="2">15. Nőszövetségi összejövetel</th>
        <th rowspan="2">16. Vallásos ünnepély</th>
        <th rowspan="2">17. Egyéb szolgálat</th>
        <th rowspan="2">18.<br />Szolgálattevő</th>
        <th rowspan="2">19.<br />Perselypénz</th>
      </tr>
      <tr>
        ${deDuFN}${deDuFN}${deDuFN}
        <th>Reggel</th><th>Este</th>
        <th>F</th><th>N</th>
        <th>Templomban</th><th>Beteg</th>
        <th>Felnőtt</th><th>Ifjúsági</th>
      </tr>
    </thead>`
}

function rowHtml(r: JournalRow): string {
  const e = r.entry
  // Ünnepnapon a jelleg az ünnep nevével pontosítva (pl. 'Istentisztelet (Húsvét)').
  const unnep = getUnnepInfo(r.dateIso)
  let jelleg = (e.jellege || '').trim()
  if (unnep && !jelleg.includes(unnep.nev)) {
    jelleg = jelleg ? `${jelleg} (${unnep.nev})` : unnep.nev
  }
  const numCells = NUMERIC_LEAVES.map((k) => `<td class="num">${r.vals[k] || ''}</td>`).join('')
  return `<tr>
      <td class="num">${r.sorszam}</td>
      <td>${esc(fmtNaploDatum(r.dateIso))}</td>
      <td>${esc(jelleg)}</td>
      <td>${esc(e.bibliaolvasas || '')}</td>
      <td>${esc(e.alapige || '')}</td>
      <td>${esc(e.enekek || '')}</td>
      ${numCells}
      <td>${esc(e.szolgalt || '')}</td>
      <td class="right">${e.persely ? formatRon(Number(e.persely)) : ''}</td>
    </tr>`
}

/**
 * Összesítő sor-pár: minden szám-alrovat összege + persely, majd külön sorban
 * a gyermek-jelenlét (a hivatalos nyomtatványon nincs gyermek-oszlop — döntés
 * szerint az összesítőben jelenik meg).
 */
function totalsRowsHtml(label: string, gyermekLabel: string, sums: JournalSums, extraClass = ''): string {
  const cells = NUMERIC_LEAVES.map((k) => `<td class="num">${sums.leaves[k] || ''}</td>`).join('')
  const cls = extraClass ? ` ${extraClass}` : ''
  return `<tr class="totals${cls}">
      <td colspan="6" class="right">${esc(label)}</td>
      ${cells}
      <td></td>
      <td class="right">${formatRon(sums.persely)}</td>
    </tr>
    <tr class="totals gyermek${cls}">
      <td colspan="${TOTAL_LEAF_COLUMNS}">${esc(gyermekLabel)}: ${sums.gyermek} fő</td>
    </tr>`
}

function sheetHeadHtml(congregationName: string, year: number, periodLabel: string): string {
  return `<header class="sheet-head">
      <div class="head-line">
        <span class="congregation">${esc(congregationName)}</span>
        <span class="period">${year}. — ${esc(periodLabel)}</span>
      </div>
      <div class="doc-title">Munkanapló — I. Igehirdetési alkalmak</div>
    </header>`
}

function monthSheetHtml(
  congregationName: string,
  year: number,
  month: number,
  monthRows: JournalRow[],
  showAnnual: boolean,
  yearSums: JournalSums,
): string {
  const monthName = HONAP_NEV[month - 1] || String(month)
  const body = monthRows.map(rowHtml).join('')
  const monthTotals = totalsRowsHtml(
    `${monthName} — havi összesen:`,
    `Gyermekek összesen (${monthName.toLowerCase()})`,
    sumRows(monthRows),
  )
  // Az utolsó lap alján éves összesítő blokk (az egész év soraiból számolva) —
  // csak teljes évnél (a hívó dönt: hónap-szűrésnél nem kerül ki).
  const annualTotals = showAnnual
    ? totalsRowsHtml('Éves összesen:', 'Gyermekek összesen (egész évben)', yearSums, 'annual')
    : ''
  return `<section class="sheet">
    ${sheetHeadHtml(congregationName, year, monthName)}
    <table>
      ${colgroupHtml()}
      ${theadHtml()}
      <tbody>
        ${body}
        ${monthTotals}
        ${annualTotals}
      </tbody>
    </table>
  </section>`
}

// ---------------------------------------------------------------------------
// Fő belépési pont
// ---------------------------------------------------------------------------

export function buildOfficialMunkanaploHtml(opts: OfficialJournalOptions): string {
  const { year, congregationName } = opts

  // Éves sorszámozás: az év ÖSSZES naplóba tartozó sora dátum-rendezve,
  // folyamatos sorszámmal — a hónap-szűrés csak a lapok kiosztását szűkíti.
  const rows: JournalRow[] = opts.entries
    .filter(isJournalEntry)
    .map((entry) => ({ entry, dateIso: (entry.idopont || '').split('T')[0] || '' }))
    .filter((x) => x.dateIso.startsWith(`${year}-`))
    .sort((a, b) => (a.entry.idopont || '').localeCompare(b.entry.idopont || ''))
    .map((x, i) => ({
      sorszam: i + 1,
      entry: x.entry,
      dateIso: x.dateIso,
      month: parseInt(x.dateIso.slice(5, 7), 10),
      vals: leafValues(x.entry, classifyForOfficialJournal(x.entry)),
    }))

  const monthsWithRows = Array.from(new Set(rows.map((r) => r.month))).sort((a, b) => a - b)
  const monthsToRender = opts.months && opts.months.length > 0
    ? Array.from(new Set(opts.months)).filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b)
    : monthsWithRows

  // Éves összesítő CSAK teljes évnél (opts.months nélkül): hónap-szűrt
  // nyomtatásnál félrevezető lenne — a látható soroknál többet összegezne.
  const isFullYear = !opts.months || opts.months.length === 0

  const yearSums = sumRows(rows)
  const sheets = monthsToRender
    .map((m, idx) =>
      monthSheetHtml(
        congregationName,
        year,
        m,
        rows.filter((r) => r.month === m),
        isFullYear && idx === monthsToRender.length - 1,
        yearSums,
      ),
    )
    .join('')

  const content = sheets || `<section class="sheet">
    ${sheetHeadHtml(congregationName, year, `${year}. év`)}
    <div class="empty-note">Ebben az évben nincs rögzített igehirdetési alkalom.</div>
  </section>`

  const title = `Munkanapló ${year} — ${congregationName}`
  return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8" /><title>${esc(title)}</title><style>${STYLES}</style></head><body>${content}</body></html>`
}
