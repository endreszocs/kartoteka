/**
 * KÖZÖS web + desktop modul (2026-08-15, desktop-paritás 4. szelet):
 * a webes `apps/web/lib/worklog/kis-naplok.ts`-ből emeltük ide VÁLTOZATLAN
 * tartalommal — a webes fájl innen re-exportál, a desktop Munkanapló oldal
 * innen nyomtat (printHtmlViaIframe). A `scripts/selftest-kis-naplok.mjs`
 * mostantól EZT a fájlt fordítja és futtatja.
 *
 * A hivatalos munkanapló KATEKÉZIS és CSALÁDLÁTOGATÁS naplólapjai
 * (2026-08-14, 18. pont 2. szelet — EREK-spec 3. és 4. szakasz).
 *
 * A hivatalos munkafüzet HÁROM naplólapból áll: Szolgálati alkalmak (ezt az
 * official-journal.ts adja, A4 fekvő), Katekézis és Családlátogatás (ezek itt,
 * A4 álló). Oszlopok a spec szerint:
 *   Katekézis:        Ssz. | Dátum | Katekézis jellege | Részt vett |
 *                     Tananyag | Perselypénz | A katekézist tartotta | Megjegyzés
 *   Családlátogatás:  Ssz. | Dátum | CsL/BL | A meglátogatott család neve |
 *                     A meglátogatott család címe | Jelen volt | Jegyzet
 *
 * Mező-térkép (a munkanapló-rögzítő bevett kontraktusa szerint):
 *   Tananyag / család neve ← cim · tartotta ← szolgalt · Részt vett/Jelen
 *   volt ← jelenlet_osszesen (részszámok összege fallback) · Jegyzet ←
 *   bibliaolvasás + énekek + megjegyzés (a spec: „olvasott bibliai rész,
 *   ének, egyéb").
 *   ⚠️ A meglátogatott család CÍMÉT a munkanapló nem tárolja — az oszlop a
 *   hivatalos forma miatt szerepel, kézzel tölthető a nyomtatott lapon.
 *
 * A sorszám ÉVEN BELÜL folyamatos (évváltásnál a hívó új dokumentumot kér).
 * SZÁNDÉKOSAN nulla importtal készül — a scripts/selftest-kis-naplok.mjs
 * önállóan fordítja és futtatja.
 */

export interface KisNaploSor {
  idopont: string | null
  jellege: string | null
  cim: string | null
  jelenlet_ferfi: number | null
  jelenlet_no: number | null
  jelenlet_gyermek: number | null
  jelenlet_osszesen: number
  szolgalt: string | null
  persely: number | null
  megjegyzes: string | null
  bibliaolvasas: string | null
  enekek: string | null
}

/** Egy lapra kerülő sorok száma (A4 álló, a fejléccel együtt kényelmes). */
export const KIS_NAPLO_SOR_PER_LAP = 26

/**
 * A hivatalos CsL/BL jel a látogatás típusából. BL = beteg-jellegű látogatás
 * (a hivatalos ív két kategóriát ismer): Beteglátogatás, Kórházlátogatás,
 * Idősek otthona. Minden más (Családlátogatás, Börtönlátogatás, Egyéb
 * látogatás, ismeretlen) → CsL.
 */
export function csalBlJel(jellege: string | null | undefined): 'CsL' | 'BL' {
  const j = (jellege || '').trim()
  if (j === 'Beteglátogatás' || j === 'Kórházlátogatás' || j === 'Idősek otthona') return 'BL'
  return 'CsL'
}

function esc(v: string | null | undefined): string {
  return (v || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function fmtDatum(v: string | null | undefined): string {
  if (!v) return ''
  return (v.split('T')[0] || '').replace(/-/g, '. ') + '.'
}

function jelenlet(s: KisNaploSor): number {
  if (s.jelenlet_osszesen > 0) return s.jelenlet_osszesen
  return (s.jelenlet_ferfi || 0) + (s.jelenlet_no || 0) + (s.jelenlet_gyermek || 0)
}

function fmtPersely(n: number | null): string {
  if (n == null || n === 0) return ''
  const parts = Math.abs(n).toFixed(2).split('.')
  parts[0] = (parts[0] || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return (n < 0 ? '-' : '') + parts[0] + ',' + parts[1]
}

/** Jegyzet a családlátogatás-laphoz: bibliai rész + ének + egyéb, egyben. */
function jegyzet(s: KisNaploSor): string {
  const reszek: string[] = []
  if (s.bibliaolvasas) reszek.push(s.bibliaolvasas)
  if (s.enekek) reszek.push(`é.: ${s.enekek}`)
  if (s.megjegyzes) reszek.push(s.megjegyzes)
  return reszek.join(' · ')
}

function lapokra<T>(sorok: T[], meret: number): T[][] {
  if (sorok.length === 0) return [[]]
  const lapok: T[][] = []
  for (let i = 0; i < sorok.length; i += meret) lapok.push(sorok.slice(i, i + meret))
  return lapok
}

function lapFejlec(cim: string, nev: string, idoszak: string, lap: number, osszLap: number): string {
  return `<div class="title">${esc(cim)}</div>
    <div class="subtitle">${esc(nev)} — ${esc(idoszak)}${osszLap > 1 ? ` · ${lap}/${osszLap}. lap` : ''}</div>`
}

/** A hivatalos Katekézis naplólap (A4 álló) — .page blokkok sora. */
export function buildKatekezisNaploLapok(
  sorok: KisNaploSor[],
  gyulekezetNev: string,
  idoszak: string,
): string {
  const lapok = lapokra(sorok, KIS_NAPLO_SOR_PER_LAP)
  let sorszam = 0
  return lapok
    .map((lapSorok, lapIdx) => {
      const tbody = lapSorok
        .map((s) => {
          sorszam += 1
          return `<tr>
            <td class="text-center">${sorszam}</td>
            <td>${fmtDatum(s.idopont)}</td>
            <td>${esc(s.jellege)}</td>
            <td class="text-center">${jelenlet(s) || ''}</td>
            <td>${esc(s.cim)}</td>
            <td class="text-right">${fmtPersely(s.persely)}</td>
            <td>${esc(s.szolgalt)}</td>
            <td>${esc(s.megjegyzes)}</td>
          </tr>`
        })
        .join('')
      return `<div class="page">
        ${lapFejlec('Munkanapló — Katekézis', gyulekezetNev, idoszak, lapIdx + 1, lapok.length)}
        <table>
          <thead><tr>
            <th>Ssz.</th><th>Dátum</th><th>Katekézis jellege</th><th>Részt vett</th>
            <th>Tananyag</th><th>Perselypénz</th><th>A katekézist tartotta</th><th>Megjegyzés</th>
          </tr></thead>
          <tbody>${tbody || '<tr><td colspan="8" class="text-center">Nincs bejegyzés az időszakban.</td></tr>'}</tbody>
        </table>
      </div>`
    })
    .join('')
}

/** A hivatalos Családlátogatás naplólap (A4 álló) — .page blokkok sora. */
export function buildCsaladlatogatasNaploLapok(
  sorok: KisNaploSor[],
  gyulekezetNev: string,
  idoszak: string,
): string {
  const lapok = lapokra(sorok, KIS_NAPLO_SOR_PER_LAP)
  let sorszam = 0
  return lapok
    .map((lapSorok, lapIdx) => {
      const tbody = lapSorok
        .map((s) => {
          sorszam += 1
          return `<tr>
            <td class="text-center">${sorszam}</td>
            <td>${fmtDatum(s.idopont)}</td>
            <td class="text-center">${csalBlJel(s.jellege)}</td>
            <td>${esc(s.cim)}</td>
            <td></td>
            <td class="text-center">${jelenlet(s) || ''}</td>
            <td>${esc(jegyzet(s))}</td>
          </tr>`
        })
        .join('')
      return `<div class="page">
        ${lapFejlec('Munkanapló — Családlátogatás', gyulekezetNev, idoszak, lapIdx + 1, lapok.length)}
        <table>
          <thead><tr>
            <th>Ssz.</th><th>Dátum</th><th>CsL/BL</th><th>A meglátogatott család neve</th>
            <th>A meglátogatott család címe</th><th>Jelen volt</th><th>Jegyzet</th>
          </tr></thead>
          <tbody>${tbody || '<tr><td colspan="7" class="text-center">Nincs bejegyzés az időszakban.</td></tr>'}</tbody>
        </table>
        <div class="footnote">CsL = családlátogatás · BL = beteglátogatás. A család címe a munkanaplóban nem rögzített adat — a nyomtatott lapon kézzel tölthető.</div>
      </div>`
    })
    .join('')
}

// ---------------------------------------------------------------------------
// Nyomtatvány-keret (A4 `.page` séma) — a webes `apps/web/lib/worklog/
// reporting.ts` styles()+wrap() párosából emelve ide (2026-08-15, desktop-
// paritás 4. szelet), BIT-AZONOS kimenettel: a webes reporting a saját
// másolatai HELYETT innen importál, és a desktop kis napló-nyomtatás is ezt
// a keretet használja. Továbbra is nulla import (selftest-kompatibilis).
// ---------------------------------------------------------------------------

/** A wrap saját escape-je — a reporting.ts esc()-jének tükre (aposztróf is). */
function escTitle(value: string | null | undefined) {
  if (value == null) return ''
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function worklogPrintStyles(orientation: 'portrait' | 'landscape') {
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

/** Teljes nyomtatható HTML-dokumentum a `.page` blokkok köré. */
export function wrapWorklogPrintDocument(
  title: string,
  orientation: 'portrait' | 'landscape',
  content: string,
) {
  return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8" /><title>${escTitle(title)}</title><style>${worklogPrintStyles(orientation)}</style></head><body>${content}</body></html>`
}
