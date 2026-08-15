/**
 * EGYHÁZMEGYEI ÖSSZESÍTŐ — nyomtatvány (A4, 2026-08-15).
 *
 * A repó bevett nyomtatvány-mintáját követi (`.sheet` A4 lap +
 * `printToBrowser`), mint a dokumentumközpont beküldés-nyomtatványa vagy a
 * leltári tárgy-fisa.
 *
 * MIÉRT KERÜL A PAPÍRRA A HIÁNYZÓ GYÜLEKEZETEK LISTÁJA IS: az összesítő
 * hivatalos irat. Ha csak a végösszeg állna rajta, az azt sugallná, hogy a
 * megye TELJES képe — pedig egy összesítő pontosan annyit ér, amennyi
 * beküldés mögötte van. A hiány LÁTHATÓ, nem néma nulla.
 *
 * Import-mentes (csak típus-import) — így a nyomtatvány-építés tisztán
 * tesztelhető és sehol nem húz be szerver-oldali függőséget.
 */

import type { MegyeiOsszesito, KodSor, TipusAllapot } from './osszesito-core'

function esc(v: string): string {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** Pénzösszeg magyar alakban, 2 tizedessel (a hivatalos íveken így áll). */
function penz(n: number): string {
  return n.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function kodTabla(cim: string, sorok: KodSor[], vegosszeg: number): string {
  if (sorok.length === 0) {
    return `<h2>${esc(cim)}</h2><p class="ures">Erre a részre nincs beküldött adat.</p>`
  }
  return `
    <h2>${esc(cim)}</h2>
    <table>
      <thead>
        <tr><th>Kód</th><th>Megnevezés</th><th class="num">Gyülekezet</th><th class="num">Összeg (RON)</th></tr>
      </thead>
      <tbody>
        ${sorok
          .map(
            (s) => `<tr>
              <td class="kod">${esc(s.kod)}</td>
              <td>${esc(s.nev || '—')}</td>
              <td class="num">${s.gyulekezetSzam}</td>
              <td class="num">${esc(penz(s.osszeg))}</td>
            </tr>`,
          )
          .join('')}
        <tr class="vegosszeg">
          <td colspan="3">Összesen</td>
          <td class="num">${esc(penz(vegosszeg))}</td>
        </tr>
      </tbody>
    </table>`
}

function allapotBlokk(cim: string, allapot: TipusAllapot): string {
  const nevek = (lista: TipusAllapot['bekuldott']) =>
    lista.length === 0 ? '—' : lista.map((gy) => esc(gy.nev)).join(', ')
  return `
    <table class="allapot">
      <tbody>
        <tr><td>${esc(cim)} — beküldte</td><td class="num">${allapot.bekuldott.length}</td></tr>
        <tr><td>Hiányzik</td><td class="num">${allapot.hianyzo.length}</td></tr>
        ${
          allapot.hianyzo.length > 0
            ? `<tr><td colspan="2" class="nevsor">Nem küldte be: ${nevek(allapot.hianyzo)}</td></tr>`
            : ''
        }
        ${
          allapot.visszakuldott.length > 0
            ? `<tr><td colspan="2" class="nevsor">Javításra visszaküldve (nincs benne az összegben): ${nevek(allapot.visszakuldott)}</td></tr>`
            : ''
        }
      </tbody>
    </table>`
}

export interface OsszesitoNyomtatvanyMeta {
  egyhazmegyeNev: string | null
  /** A felküldés időpontja (ISO), ha már felküldték — a pecsét-sorhoz. */
  felkuldveEkkor?: string | null
}

/** Az összesítő teljes A4-es nyomtatványa (HTML — `printToBrowser` kapja). */
export function buildOsszesitoPrintHtml(
  o: MegyeiOsszesito,
  meta: OsszesitoNyomtatvanyMeta,
): string {
  const cim = `Egyházmegyei összesítő — ${o.ev}. év`
  const megye = meta.egyhazmegyeNev || 'Egyházmegye'
  const felkuldve = meta.felkuldveEkkor
    ? new Date(meta.felkuldveEkkor).toLocaleDateString('hu-HU')
    : null

  const metaSorok: Array<[string, string]> = [
    ['Egyházmegye', megye],
    ['Év', `${o.ev}.`],
    ['Gyülekezetek száma', String(o.gyulekezetSzam)],
    ['Számadást beküldött', `${o.szamadas.allapot.bekuldott.length} / ${o.gyulekezetSzam}`],
    ['Költségvetést beküldött', `${o.koltsegvetes.allapot.bekuldott.length} / ${o.gyulekezetSzam}`],
    ['Felküldve az egyházkerületnek', felkuldve || 'még nincs felküldve'],
  ]

  const jelentesSorok = o.lelkesziJelentes.mezok
    .map(
      (m) => `<tr>
        <td class="kod">${esc(m.id)}</td>
        <td>${esc(m.label)}</td>
        <td class="num">${esc(m.osszeg.toLocaleString('hu-HU'))}${m.egyseg ? ` ${esc(m.egyseg)}` : ''}</td>
        <td class="num">${m.adatSzam}</td>
      </tr>`,
    )
    .join('')

  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8" />
<title>${esc(cim)} — ${esc(megye)}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1c2430; margin: 0; background: #e2e8f0; padding: 18px 0; }
  .sheet { width: 210mm; min-height: 297mm; margin: 0 auto 18px; background: #fff; box-shadow: 0 18px 40px rgba(15,23,42,.12); padding: 16mm 18mm; page-break-after: always; }
  .sheet:last-child { page-break-after: auto; margin-bottom: 0; }
  @media print { body { background: #fff; padding: 0; } .sheet { margin: 0; box-shadow: none; min-height: 296mm; } }
  .head { border-bottom: 3px double #4c5a7a; padding-bottom: 8px; }
  .head .eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: .2em; color: #64748b; }
  .head h1 { margin: 3px 0 0; font-size: 20px; color: #1e2a4a; }
  .head .sub { margin-top: 2px; font-size: 12px; font-style: italic; color: #64748b; }
  .meta { margin-top: 12px; width: 100%; border-collapse: collapse; }
  .meta td { padding: 3px 0; font-size: 12px; border-bottom: 1px dotted #cbd5e1; }
  .meta td:first-child { width: 52mm; color: #64748b; font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; }
  h2 { margin: 14px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .16em; color: #4c5a7a; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th, td { padding: 3px 6px; border-bottom: 1px solid #e2e8f0; text-align: left; }
  th { font-size: 9.5px; text-transform: uppercase; letter-spacing: .1em; color: #64748b; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .kod { font-family: 'Courier New', monospace; font-size: 10.5px; }
  .vegosszeg td { font-weight: bold; border-top: 2px solid #4c5a7a; }
  .totals { display: flex; gap: 12px; margin-top: 10px; }
  .totals div { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; }
  .totals span { display: block; font-size: 9.5px; text-transform: uppercase; letter-spacing: .12em; color: #64748b; }
  .totals strong { font-size: 13px; }
  .allapot { margin-top: 6px; font-size: 11px; }
  .allapot td { border-bottom: 1px dotted #e2e8f0; }
  .nevsor { color: #9a3412; font-size: 10.5px; font-style: italic; }
  .ures { font-size: 11.5px; font-style: italic; color: #64748b; }
  .alairas { margin-top: 16mm; display: flex; gap: 18mm; }
  .alairas div { flex: 1; border-top: 1px solid #64748b; padding-top: 4px; font-size: 10.5px; color: #64748b; text-align: center; }
  .foot { margin-top: 8mm; display: flex; justify-content: space-between; font-size: 9.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 6px; }
</style>
</head>
<body data-sheet-count="2">
  <div class="sheet">
    <div class="head">
      <p class="eyebrow">Kartotéka — egyházmegyei összesítő</p>
      <h1>${esc(cim)}</h1>
      <p class="sub">${esc(megye)} · a gyülekezetek véglegesített és beküldött iratai alapján</p>
    </div>
    <table class="meta"><tbody>
      ${metaSorok.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}
    </tbody></table>

    <div class="totals">
      <div><span>Számadás — összes bevétel</span><strong>${esc(penz(o.szamadas.osszBevetel))} RON</strong></div>
      <div><span>Számadás — összes kiadás</span><strong>${esc(penz(o.szamadas.osszKiadas))} RON</strong></div>
      <div><span>Egyenleg</span><strong>${esc(penz(o.szamadas.egyenleg))} RON</strong></div>
    </div>

    ${kodTabla('Számadás — bevételek kódonként', o.szamadas.bevetelSorok, o.szamadas.osszBevetel)}
    ${allapotBlokk('Számadás', o.szamadas.allapot)}
    ${kodTabla('Számadás — kiadások kódonként', o.szamadas.kiadasSorok, o.szamadas.osszKiadas)}
    <div class="foot">
      <span>Nyomtatva: ${esc(new Date().toLocaleDateString('hu-HU'))}</span>
      <span>1. oldal — számadás</span>
    </div>
  </div>

  <div class="sheet">
    <div class="head">
      <p class="eyebrow">Kartotéka — egyházmegyei összesítő</p>
      <h1>${esc(cim)} — költségvetés és jelentések</h1>
      <p class="sub">${esc(megye)}</p>
    </div>

    <div class="totals">
      <div><span>Költségvetés — bevétel</span><strong>${esc(penz(o.koltsegvetes.osszBevetel))} RON</strong></div>
      <div><span>Költségvetés — kiadás</span><strong>${esc(penz(o.koltsegvetes.osszKiadas))} RON</strong></div>
      <div><span>Egyenleg</span><strong>${esc(penz(o.koltsegvetes.egyenleg))} RON</strong></div>
    </div>
    ${kodTabla('Költségvetés — bevételek kódonként', o.koltsegvetes.bevetelSorok, o.koltsegvetes.osszBevetel)}
    ${kodTabla('Költségvetés — kiadások kódonként', o.koltsegvetes.kiadasSorok, o.koltsegvetes.osszKiadas)}
    ${allapotBlokk('Költségvetés', o.koltsegvetes.allapot)}

    <h2>Vagyonleltári jelentés</h2>
    <table><tbody>
      <tr><td>Leltári tételek száma</td><td class="num">${o.vagyonleltar.tetelSzam.toLocaleString('hu-HU')}</td></tr>
      <tr><td>Könyv szerinti érték</td><td class="num">${esc(penz(o.vagyonleltar.konyvSzerintiErtek))} RON</td></tr>
    </tbody></table>
    ${allapotBlokk('Vagyonleltári jelentés', o.vagyonleltar.allapot)}

    <h2>Választók névjegyzéke</h2>
    <table><tbody>
      <tr><td>Választásra jogosultak összesen</td><td class="num">${o.valasztok.fo.toLocaleString('hu-HU')} fő</td></tr>
    </tbody></table>
    ${allapotBlokk('Választók névjegyzéke', o.valasztok.allapot)}

    ${
      jelentesSorok
        ? `<h2>Lelkészi jelentés — megyei mutatók</h2>
           <table>
             <thead><tr><th>Mező</th><th>Megnevezés</th><th class="num">Összesen</th><th class="num">Gyülekezet</th></tr></thead>
             <tbody>${jelentesSorok}</tbody>
           </table>`
        : '<h2>Lelkészi jelentés — megyei mutatók</h2><p class="ures">Erre az évre még nincs beküldött lelkészi jelentés.</p>'
    }
    ${allapotBlokk('Lelkészi jelentés', o.lelkesziJelentes.allapot)}

    <div class="alairas">
      <div>esperes</div>
      <div>egyházmegyei számvevő</div>
    </div>
    <div class="foot">
      <span>Nyomtatva: ${esc(new Date().toLocaleDateString('hu-HU'))}</span>
      <span>2. oldal — költségvetés és jelentések</span>
    </div>
  </div>
</body>
</html>`
}
