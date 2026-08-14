// 2026-07-16 (F5/J3): Éves hivatalos lelkészi jelentés — A4 ÁLLÓ nyomtatvány-generátor.
//
// A hivatalos minta-nyomtatvány („Lelkészi jelentés … évi életéről", Erdélyi
// Református Egyházkerület) hű HTML-mása:
//  - címlap: iktatószámok balra fent, egyházkerület/egyházmegye jobbra fent,
//    esperesi aláírás-vonal, központi cím, presbitériumi + közgyűlési tárgyalás,
//    lelkipásztori + főgondnoki aláírás-blokk (mind a hatarozat adataiból);
//  - I–X. fejezet a JELENTES_MEZOK katalógus sorrendjében, számozott
//    tétel-táblázatokkal (label balra, érték jobbra, egység), a hosszú
//    szöveg-mezők bekezdésként;
//  - minden érték a mezoErtek prioritással (felülírás > auto > kézi),
//    üres érték: '—' (a nyomtatvány kitöltetlen rovata).
//
// MEGKÖTÉSEK (minta: official-journal.ts / official-documents.ts):
//  - WYSIWYG-elv: @page margin 0, a lap-margót a .sheet paddingje adja —
//    előnézet és nyomtatás azonos tördelésű; ÁLLÓ A4 (210×297mm);
//  - a bal padding nagyobb (18mm) a lefűzhetőség (lyukasztás-margó) miatt;
//  - lapkiosztás a minta-PDF szerint: címlap · I · II · III+IV · V+VI ·
//    VII+VIII · IX+X (a rövid fejezetek párban egy lapon);
//  - tisztán pure függvény (nincs DOM-hivatkozás) — a hívó iframe/srcDoc-ba tölti;
//  - HTML-escape MINDEN szabad szövegen (kézi mezők, hatarozat, gyülekezetnév).

import {
  ADATLAP_MEZO_IDS,
  FEJEZET_CIMEK,
  JELENTES_MEZOK,
  mezoErtek,
  type JelentesFejezet,
  type JelentesMezo,
  type LelkesziJelentesData,
} from './types'
import { epitOszlopdiagram, type AdatlapPont } from './adatlap-svg'

// ---------------------------------------------------------------------------
// Segédfüggvények
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

/** Escape + sortörések megtartása rövid szöveg-mezőkben (CRLF-normalizálással). */
function escMultiline(value: string): string {
  return esc(value)
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll('\n', '<br />')
}

const HONAP_NEV = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
]

/**
 * Magyar számformátum a nyomtatványra: ezres tagolás nem törő szóközzel,
 * tizedesvessző, legfeljebb 2 tizedes (a záró nullák elhagyásával).
 */
function fmtSzam(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const kerekitett = Math.round(v * 100) / 100
  const negativ = kerekitett < 0
  const [egesz, tizedes] = Math.abs(kerekitett).toFixed(2).split('.')
  const tagolt = egesz.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const tiz = (tizedes || '').replace(/0+$/, '')
  return `${negativ ? '-' : ''}${tagolt}${tiz ? `,${tiz}` : ''}`
}

/**
 * Tárgyalási dátum a címlap mondatába: ISO (YYYY-MM-DD) → „2026. március 5.
 * napján"; minden más beírt szöveg változatlanul (a lelkész szabadon fogalmazhat).
 * Üres érték: kitöltő-vonal (mint az üres nyomtatványon).
 */
function fmtTargyalasiDatum(value: string | undefined): string {
  const raw = (value || '').trim()
  if (!raw) return '<span class="kitolto"></span>'
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return esc(raw)
  const ho = HONAP_NEV[parseInt(m[2], 10) - 1]
  const nap = parseInt(m[3], 10)
  if (!ho || !nap) return esc(raw)
  return `${m[1]}. ${ho} ${nap}. napján`
}

/** Üres érték → kitöltő-vonal, kitöltött → escape-elt szöveg. */
function vagyKitolto(value: string | undefined): string {
  const raw = (value || '').trim()
  return raw ? esc(raw) : '<span class="kitolto"></span>'
}

/**
 * Tárgyalási szám a címlap mondatába: a minta szerint „gyűlésén 12. szám
 * alatt" — a szám záró pontot kap (duplázás nélkül, ha a lelkész már ponttal
 * írta be); üresen kitöltő-vonal + pont.
 */
function fmtTargyalasiSzam(value: string | undefined): string {
  const raw = (value || '').trim()
  if (!raw) return '<span class="kitolto"></span>.'
  return `${esc(raw.replace(/\.+$/, ''))}.`
}

/** Magyar névelő nagybetűs cím elé: magánhangzóval kezdődő névnél „AZ". */
function nevelo(nev: string): string {
  return /^[aáeéiíoóöőuúüű]/i.test(nev.trim()) ? 'AZ' : 'A'
}

/**
 * Az egyházmegye-vonal a címlap fejlécébe: ha ismert az egyházmegye neve,
 * escape-elve jelenik meg — a „Református Egyházmegye" toldat duplázás-
 * védelmével (a gyülekezetnév-heurisztika mintájára); üres névnél a kitöltő-
 * vonal marad (mint az üres nyomtatványon).
 */
function egyhazmegyeSor(egyhazmegyeNev: string | null): string {
  const nyers = (egyhazmegyeNev || '').trim()
  if (!nyers) return '<span class="kitolto"></span> Református Egyházmegye'
  return nyers.toUpperCase().includes('EGYHÁZMEGYE')
    ? esc(nyers)
    : `${esc(nyers)} Református Egyházmegye`
}

/**
 * Egy mező megjelenítendő értéke a nyomtatványon: felülírás > auto > kézi
 * (mezoErtek), szám magyar formátumban, üres rovat '—'.
 */
function mezoMegjelenites(data: LelkesziJelentesData, mezo: JelentesMezo): string {
  const ertek = mezoErtek(data, mezo.id)
  if (ertek === null || ertek === undefined || ertek === '') return '—'
  if (typeof ertek === 'number') return fmtSzam(ertek)
  return escMultiline(String(ertek))
}

/** A tétel sorszáma a fejezeten belül: 'I.2a' → '2a.' */
function tetelSorszam(mezo: JelentesMezo): string {
  return `${mezo.id.slice(mezo.fejezet.length + 1)}.`
}

// ---------------------------------------------------------------------------
// Stílusok — WYSIWYG: @page margin 0, a lap-margót a .sheet paddingje adja
// ---------------------------------------------------------------------------

const STYLES = `
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Times New Roman', Georgia, serif; color: #111827; margin: 0; background: #e2e8f0; padding: 12px 0; font-size: 10pt; line-height: 1.35; }
    /* Nagyobb bal padding (18mm): lefűzhetőség — lyukasztás-margó. */
    .sheet { width: 210mm; min-height: 297mm; margin: 0 auto 12px; background: #fff; box-shadow: 0 12px 30px rgba(15,23,42,.14); padding: 14mm 14mm 16mm 18mm; page-break-after: always; position: relative; }
    .sheet:last-child { page-break-after: auto; margin-bottom: 0; }
    .oldalszam { position: absolute; bottom: 7mm; right: 12mm; font-size: 9pt; color: #334155; }

    /* ── Címlap ─────────────────────────────────────────────────────────── */
    .cimlap-fej { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; font-size: 10pt; }
    .cimlap-fej .iktatoszamok div { margin-bottom: 2mm; }
    .cimlap-fej .kerulet { text-align: center; }
    .cimlap-fej .kerulet .egyhazmegye { margin-top: 1mm; }
    .esperes-blokk { margin-top: 10mm; text-align: center; }
    .cim { text-align: center; margin-top: 42mm; }
    .cim h1 { font-size: 17pt; font-weight: bold; letter-spacing: .12em; text-transform: uppercase; margin: 0 0 8mm; }
    .cim .gyulekezet { font-size: 13pt; font-weight: bold; text-transform: uppercase; letter-spacing: .04em; margin: 0 0 4mm; }
    .cim .evrol { font-size: 12pt; font-weight: bold; letter-spacing: .08em; }
    .targyalas { margin-top: 34mm; font-size: 10.5pt; }
    .targyalas p { margin: 0 0 4mm; }
    .alairasok { display: flex; justify-content: space-between; margin-top: 34mm; gap: 10mm; }
    .alairas { width: 58mm; text-align: center; }
    .alairas .vonal { border-bottom: 0.6pt solid #111827; height: 10mm; margin-bottom: 1.5mm; }
    .alairas .nev { min-height: 4.5mm; font-weight: bold; }
    .alairas .szerep { font-size: 9.5pt; }
    .kitolto { display: inline-block; min-width: 28mm; border-bottom: 0.5pt dotted #111827; }

    /* ── Fejezetek ──────────────────────────────────────────────────────── */
    .fejezet { margin-bottom: 9mm; }
    .fejezet-cim { text-align: center; font-size: 12pt; font-weight: bold; margin: 0 0 5mm; page-break-after: avoid; break-after: avoid; }
    .fejezet + .fejezet .fejezet-cim { margin-top: 4mm; }
    /* 2026-08-14 (18. pont 4): Adatlap — többéves tábla + grafikonok */
    .adatlap-tabla { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 4mm 0 6mm; }
    .adatlap-tabla th, .adatlap-tabla td { border: 0.3mm solid #333; padding: 1mm 2mm; text-align: left; }
    .adatlap-tabla th.szam, .adatlap-tabla td.szam { text-align: right; font-variant-numeric: tabular-nums; }
    .adatlap-grafikon { margin: 5mm 0; page-break-inside: avoid; break-inside: avoid; }
    .adatlap-jegyzet { font-size: 9pt; color: #555; margin: 0 0 3mm; }
    .adatlap-tabla .ures { color: #999; }
    table.mezok { width: 100%; border-collapse: collapse; margin-bottom: 3mm; }
    table.mezok td { padding: 1.2mm 1mm; vertical-align: top; border-bottom: 0.4pt solid #e2e8f0; font-size: 9.5pt; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    td.sorszam { width: 10mm; text-align: right; white-space: nowrap; color: #334155; }
    td.megnevezes { overflow-wrap: anywhere; }
    /* Az érték-cellában rövid szöveg is állhat (pl. vizitáció-dátumok) — törhető;
       a számok nem törő szóközzel tagoltak (fmtSzam), így sosem törnek sorba. */
    td.ertek { width: 30mm; text-align: right; font-weight: bold; overflow-wrap: anywhere; }
    td.egyseg { width: 16mm; text-align: left; color: #334155; }
    .szoveg-blokk { margin: 0 0 4mm; page-break-inside: avoid; break-inside: avoid; }
    .szoveg-blokk.hosszu { page-break-inside: auto; break-inside: auto; }
    .szoveg-blokk .blokk-cim { font-weight: bold; font-size: 9.5pt; margin: 0 0 1.5mm; page-break-after: avoid; break-after: avoid; }
    .szoveg-blokk p { margin: 0 0 1.5mm; font-size: 9.5pt; text-align: justify; overflow-wrap: anywhere; }
    .szoveg-blokk p.ures { color: #334155; text-align: left; }

    @media print { body { background: #fff; padding: 0; } .sheet { margin: 0 auto; box-shadow: none; } }
`

// ---------------------------------------------------------------------------
// Címlap — a minta-PDF 1. oldalának hű mása
// ---------------------------------------------------------------------------

function cimlapHtml(data: LelkesziJelentesData): string {
  const h = data.hatarozat
  // A minta címsora mindig „… REFORMÁTUS EGYHÁZKÖZSÉG" — ha a gyülekezet neve
  // (nev_hu lehet rövid alak, pl. „Barátos") nem tartalmazza, a toldatot
  // hozzáfűzzük; ha már benne van, nem duplázzuk.
  const nyersNev = (data.congregationName || '').trim()
  const nagyNev = nyersNev.toUpperCase()
  const nev = !nyersNev
    ? 'REFORMÁTUS EGYHÁZKÖZSÉG'
    : nagyNev.includes('EGYHÁZKÖZSÉG')
      ? nagyNev
      : `${nagyNev} REFORMÁTUS EGYHÁZKÖZSÉG`
  return `<section class="sheet cimlap">
      <div class="cimlap-fej">
        <div class="iktatoszamok">
          <div>Egyházközségi iktatószám: ${vagyKitolto(h.egyhazkozsegiIktatoszam)}</div>
          <div>Egyházmegyei iktatószám: ${vagyKitolto(h.egyhazmegyeiIktatoszam)}</div>
        </div>
        <div class="kerulet">
          <div>Erdélyi Református Egyházkerület</div>
          <div class="egyhazmegye">${egyhazmegyeSor(data.egyhazmegyeNev)}</div>
          <div class="esperes-blokk">
            <div class="alairas" style="margin: 0 auto;">
              <div class="vonal"></div>
              <div class="szerep">Esperes</div>
            </div>
          </div>
        </div>
      </div>
      <div class="cim">
        <h1>Lelkészi jelentés</h1>
        <div class="gyulekezet">${nevelo(nev)} ${esc(nev)}</div>
        <div class="evrol">${data.ev}. évi életéről</div>
      </div>
      <div class="targyalas">
        <p>Tárgyalta a presbitérium a ${fmtTargyalasiDatum(h.presbiteriDatum)} tartott gyűlésén ${fmtTargyalasiSzam(h.presbiteriSzam)} szám alatt.</p>
        <p>Tárgyalta az egyházközségi közgyűlés a ${fmtTargyalasiDatum(h.kozgyulesiDatum)} tartott gyűlésén ${fmtTargyalasiSzam(h.kozgyulesiSzam)} szám alatt.</p>
      </div>
      <div class="alairasok">
        <div class="alairas">
          <div class="vonal"></div>
          <div class="nev">${esc(h.lelkipasztor || '')}</div>
          <div class="szerep">Lelkipásztor</div>
        </div>
        <div class="alairas">
          <div class="vonal"></div>
          <div class="nev">${esc(h.fogondnok || '')}</div>
          <div class="szerep">Főgondnok / Gondnok</div>
        </div>
      </div>
    </section>`
}

// ---------------------------------------------------------------------------
// Fejezet-táblázatok
// ---------------------------------------------------------------------------

function mezoSorHtml(data: LelkesziJelentesData, mezo: JelentesMezo): string {
  // A nyomtatványon a pénz-egység a hivatalos „lej" megnevezéssel szerepel.
  const egyseg = mezo.egyseg === 'RON' ? 'lej' : (mezo.egyseg || '')
  return `<tr>
      <td class="sorszam">${esc(tetelSorszam(mezo))}</td>
      <td class="megnevezes">${esc(mezo.label)}</td>
      <td class="ertek">${mezoMegjelenites(data, mezo)}</td>
      <td class="egyseg">${esc(egyseg)}</td>
    </tr>`
}

function hosszuSzovegHtml(data: LelkesziJelentesData, mezo: JelentesMezo): string {
  const ertek = mezoErtek(data, mezo.id)
  const szoveg = ertek === null || ertek === undefined ? '' : String(ertek).trim()
  const bekezdesek = szoveg
    ? szoveg
        .split('\n')
        .map((sor) => sor.trim())
        .filter((sor) => sor.length > 0)
        .map((sor) => `<p>${esc(sor)}</p>`)
        .join('')
    : '<p class="ures">—</p>'
  // Hosszú szövegnél a lap-törés a bekezdések közt megengedett (különben egy
  // teljes lapnál hosszabb blokk kilógna a lapról).
  return `<div class="szoveg-blokk hosszu">
      <div class="blokk-cim">${esc(tetelSorszam(mezo))} ${esc(mezo.label)}</div>
      ${bekezdesek}
    </div>`
}

/**
 * Egy fejezet HTML-je: cím + a katalógus-sorrend szerinti tételek. Az egymást
 * követő szám/rövid-szöveg mezők közös táblázatba kerülnek; a hosszú
 * szöveg-mezők bekezdés-blokkot kapnak (a katalógus-sorrend megtartásával).
 */
function fejezetHtml(data: LelkesziJelentesData, fejezet: JelentesFejezet): string {
  const mezok = JELENTES_MEZOK.filter((m) => m.fejezet === fejezet)
  const reszek: string[] = []
  let sorok: string[] = []
  const flush = () => {
    if (sorok.length === 0) return
    reszek.push(`<table class="mezok"><tbody>${sorok.join('')}</tbody></table>`)
    sorok = []
  }
  for (const mezo of mezok) {
    if (mezo.tipus === 'hosszu_szoveg') {
      flush()
      reszek.push(hosszuSzovegHtml(data, mezo))
    } else {
      sorok.push(mezoSorHtml(data, mezo))
    }
  }
  flush()
  return `<div class="fejezet">
      <h2 class="fejezet-cim">${fejezet}. ${esc(FEJEZET_CIMEK[fejezet])}</h2>
      ${reszek.join('')}
    </div>`
}

/**
 * Lapkiosztás a minta-PDF szerint: a nagy fejezetek (I, II) külön lapot
 * kapnak, a rövidebbek párban osztoznak egy lapon. Ha egy lap tartalma
 * túlcsordul (hosszú szabad szövegek), a nyomtatás a bekezdés-határokon
 * folytatja a következő oldalon (page-break-inside szabályok).
 */
const LAP_KIOSZTAS: JelentesFejezet[][] = [
  ['I'],
  ['II'],
  ['III', 'IV'],
  ['V', 'VI'],
  ['VII', 'VIII'],
  ['IX', 'X'],
]

// ---------------------------------------------------------------------------
// Fő belépési pont
// ---------------------------------------------------------------------------

/**
 * A teljes hivatalos lelkészi jelentés önálló HTML-dokumentuma (címlap +
 * I–X. fejezet). Pure függvény — a hívó iframe srcDoc-ba tölti és nyomtatja.
 */
// ---------------------------------------------------------------------------
// Adatlap — többéves összehasonlítás (2026-08-14, 18. pont 4. szelet)
// ---------------------------------------------------------------------------

/** Egy mező számként feloldva (a mezoErtek szöveg-értéke számmá nem erőltethető → null). */
function mezoSzam(data: LelkesziJelentesData, mezoId: string): number | null {
  const v = mezoErtek(data, mezoId)
  if (v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Az Adatlap-lap: a hivatalos munkafüzet többéves összehasonlító táblája
 * (korábbi VÉGLEGESÍTETT évek + a tárgyév) és két áttekintő grafikon.
 * Korábbi év adata nélkül is kirajzolódik (csak a tárgyév oszlopával).
 */
function adatlapHtml(data: LelkesziJelentesData, oldalszam: number): string {
  const koradatok = data.tobbEvesAdatok ?? []
  const evek = [...koradatok.map((k) => k.ev), data.ev]

  const sorErtek = (mezoId: string, ev: number): number | null => {
    if (ev === data.ev) return mezoSzam(data, mezoId)
    return koradatok.find((k) => k.ev === ev)?.mezok[mezoId] ?? null
  }
  const fmtCell = (n: number | null): string =>
    n === null ? '<span class="ures">–</span>' : String(Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10)

  const sorok = ADATLAP_MEZO_IDS.map((mezoId) => {
    const mezo = JELENTES_MEZOK.find((m) => m.id === mezoId)
    if (!mezo) return ''
    const cellak = evek.map((ev) => `<td class="szam">${fmtCell(sorErtek(mezoId, ev))}</td>`).join('')
    return `<tr><td>${esc(mezo.label)}${mezo.egyseg ? ` (${esc(mezo.egyseg)})` : ''}</td>${cellak}</tr>`
  }).join('')

  const pontok = (mezoId: string): AdatlapPont[] => evek.map((ev) => ({ ev, ertek: sorErtek(mezoId, ev) }))
  const grafikonok = [
    epitOszlopdiagram('Lélekszám alakulása', pontok('I.10'), 'fő'),
    epitOszlopdiagram('Vasárnap délelőtti átlagjelenlét', pontok('II.1b'), 'fő'),
  ].filter(Boolean)

  return `<section class="sheet">
    <div class="fejezet-cim">Adatlap — többéves összehasonlítás</div>
    ${koradatok.length === 0 ? '<p class="adatlap-jegyzet">Korábbi véglegesített jelentés még nincs — a tábla a tárgyévet mutatja; a következő évektől az összehasonlítás magától épül.</p>' : ''}
    <table class="adatlap-tabla">
      <thead><tr><th>Mutató</th>${evek.map((ev) => `<th class="szam">${ev}</th>`).join('')}</tr></thead>
      <tbody>${sorok}</tbody>
    </table>
    ${grafikonok.map((g) => `<div class="adatlap-grafikon">${g}</div>`).join('')}
    <div class="oldalszam">${oldalszam}</div>
  </section>`
}

export function buildLelkesziJelentesHtml(data: LelkesziJelentesData): string {
  const lapok = LAP_KIOSZTAS.map((fejezetek, idx) => {
    const tartalom = fejezetek.map((f) => fejezetHtml(data, f)).join('')
    // Címlap = 1. oldal (számozatlan, mint a mintán); a tartalom a 2.-tól számozott.
    return `<section class="sheet">
        ${tartalom}
        <div class="oldalszam">${idx + 2}</div>
      </section>`
  }).join('')

  // 2026-08-14 (18. pont 4): záró Adatlap-lap — többéves tábla + grafikonok.
  const adatlap = adatlapHtml(data, LAP_KIOSZTAS.length + 2)

  const title = `Lelkészi jelentés ${data.ev} — ${data.congregationName}`
  return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8" /><title>${esc(title)}</title><style>${STYLES}</style></head><body>${cimlapHtml(data)}${lapok}${adatlap}</body></html>`
}
