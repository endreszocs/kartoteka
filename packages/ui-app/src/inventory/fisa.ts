/**
 * Nyomtathato LELTARI TARGY FISA (2026-08-09) — KOZOS web + desktop modul.
 *
 * 2026-08-15 (desktop-paritas 4. szelet): a webes
 * `apps/web/lib/inventory/item-card-print.ts`-bol emeltuk ide VALTOZATLAN
 * tartalommal (a webes fajl innen re-exportal) — a minta a
 * `packages/ui-app/src/finance/official-documents.ts` („web es desktop
 * egyarant hasznalja"). Desktopon a nyomtatas a printHtmlViaIframe-en fut.
 *
 *
 * A4 `.sheet`-alapú (data-sheet-count) nyomtatvány a bevált WYSIWYG-sémával
 * (minta: lib/members/person-card-print.ts, PR-17):
 *   - a KITÖLTETLEN mezők pontozott vonalként jelennek meg — így a fişă
 *     ÉLŐ ELŐNÉZETKÉNT is szolgál (az űrlap gépelése közben töltődik ki),
 *     és üresen kinyomtatva kézi kitöltésre is alkalmas;
 *   - kétnyelvű mezőcímkék (magyar + román), a hivatalos leltár-nyomtatványok
 *     stílusában (Times/Georgia, dupla keretvonal);
 *   - alapeszköznél amortizációs blokk (katalóguskód, használati idő,
 *     havi leírás, aktuális leltári érték).
 *
 * Tudatosan PURE modul (nincs React/DB) — az űrlap élő előnézete és a
 * táblázat-sori fişă-nyomtatás ugyanazt hívja.
 */

import { hivatalosKetnyelvuNev } from '../finance/entity-name'

export interface InventoryItemCardData {
  congregationName: string
  /**
   * 2026-08-22 (6. pont): a kiállító hivatalos ROMÁN neve (`nev_ro`). A fişa
   * MINDEN felirata nyelvet vált a `lang` szerint — a KIÁLLÍTÓ neve viszont
   * eddig mindig magyar volt, vagyis a román nyelvre állított hivatalos karton
   * fejlécében magyar név állt.
   *
   * ⚠️ OPCIONÁLIS: a desktop hívói e nélkül is fordulnak, és ha nincs román
   * név, a magyar áll ott EGYEDÜL — kitalált román nevet SOHA nem írunk a
   * lapra (a hiányt a beállítás-varázslón kell pótolni).
   */
  congregationNameRo?: string | null
  /** Meglévő tételnél a kiosztott szám; új tételnél null → "mentéskor generálódik". */
  leltariSzam?: string | null
  regiLeltariSzam?: string | null
  megnevezes?: string | null
  /** Emberi kategória-címke (pl. "Alapeszközök"). */
  kategoriaLabel?: string | null
  /** Román kategória-címke (pl. "Mijloace fixe"). */
  kategoriaLabelRo?: string | null
  /** true = alapeszköz → amortizációs blokk. */
  isAlapeszkoz?: boolean
  mennyiseg?: number | null
  mertekegyseg?: string | null
  beszerzesDatuma?: string | null
  beszerzesBizonylat?: string | null
  /** Egységnyi beszerzési érték (RON). */
  beszerzesErteke?: number | null
  /** Katalóguskód + megnevezés (alapeszköz). */
  katalogusKod?: string | null
  katalogusNev?: string | null
  hasznalatiIdoEv?: number | null
  /** Előre kiszámolt aktuális (amortizált) leltári érték — null = nem számolható. */
  aktualisErtek?: number | null
  helyszin?: string | null
  felelosNev?: string | null
  megjegyzes?: string | null
  /** Könyv-kategóriás tételek opcionális adatai (csak ha vannak). */
  szerzo?: string | null
  konyvIsbn?: string | null
  /**
   * 2026-08-14 (11. pont): a fişa nyelve. 'hu' (alap) = magyar elsődleges,
   * román alcímkék; 'ro' = ROMÁN elsődleges (a hivatalos forma), magyar
   * alcímkék. Az OMFP 2634/2015 csak KÖTELEZŐ MINIMÁLIS TARTALMAT ír elő,
   * merev nyomtatványmintát nem — a kétnyelvű forma tehát szabályos, amíg a
   * román megnevezések a hivatalos terminológiát követik.
   */
  lang?: 'hu' | 'ro'
}

export interface InventoryItemCardResult {
  title: string
  html: string
  sheetCount: number
}

function esc(v: string) {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** Érték VAGY pontozott kitöltő-vonal (élő előnézet + kézi kitöltés). */
function val(v: string | null | undefined, minWidth = '6rem'): string {
  const s = (v ?? '').trim()
  if (!s) return `<span class="blank" style="min-width:${minWidth}"></span>`
  return `<span class="val">${esc(s)}</span>`
}

function fmtDate(v: string | null | undefined, locale = 'hu-HU'): string | null {
  if (!v) return null
  const d = new Date(v.includes('T') ? v : `${v}T00:00:00`)
  if (Number.isNaN(d.getTime())) return v
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(d)
}

function fmtRon(v: number | null | undefined): string | null {
  if (v == null || Number.isNaN(v)) return null
  const parts = Number(v).toFixed(2).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${parts[0]},${parts[1]} RON`
}

function styles() {
  return `
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #1c2430; margin: 0; background: #e2e8f0; padding: 18px 0; }
    .sheet { width: 210mm; min-height: 297mm; margin: 0 auto 18px; background: #fff; box-shadow: 0 18px 40px rgba(15,23,42,.12); padding: 14mm 16mm 16mm 18mm; page-break-after: always; position: relative; overflow: hidden; }
    .sheet:last-child { page-break-after: auto; margin-bottom: 0; }
    @media print { body { background: #fff; padding: 0; } .sheet { margin: 0; box-shadow: none; min-height: 296mm; } }

    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10mm; border-bottom: 3px double #7c5a1e; padding-bottom: 8px; }
    .head .cong { font-size: 11px; color: #6b5a3a; }
    .head h1 { margin: 2px 0 0; font-size: 20px; letter-spacing: .1em; color: #7c5a1e; }
    .head .sub { margin-top: 2px; font-size: 11px; font-style: italic; color: #8a7a55; }
    .numbox { flex: 0 0 auto; min-width: 44mm; border: 1.5px solid #7c5a1e; border-radius: 4px; padding: 6px 10px; text-align: center; background: #fbf7ef; }
    .numbox .cap { font-size: 9px; text-transform: uppercase; letter-spacing: .16em; color: #8a7a55; }
    .numbox .num { margin-top: 3px; font-size: 17px; font-weight: 700; color: #5c4312; font-variant-numeric: tabular-nums; }
    .numbox .old { margin-top: 2px; font-size: 9px; color: #8a7a55; }

    .section { margin-top: 13px; }
    .section h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .18em; color: #7c5a1e; border-bottom: 1px solid #d9c9a3; padding-bottom: 3px; margin: 0 0 8px; }
    .section h2 .ro { text-transform: none; letter-spacing: 0; font-weight: normal; font-style: italic; color: #a08c5f; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 24px; }
    .row { display: flex; align-items: baseline; gap: 8px; font-size: 12px; padding: 2.5px 0; }
    .row .k { flex: 0 0 auto; color: #6b5a3a; font-size: 10.5px; }
    .row .k .ro { display: block; font-size: 8.5px; font-style: italic; color: #a08c5f; }
    .val { font-weight: 600; }
    .blank { display: inline-block; flex: 1; border-bottom: 1px dotted #b09d72; height: 1em; }
    .row .fill { flex: 1; }

    .amort { border: 1px solid #d9c9a3; border-radius: 6px; background: #fbf7ef; padding: 7px 10px; }
    .amort .note { font-size: 10px; color: #8a7a55; font-style: italic; margin-top: 4px; }

    .note-box { border: 1px solid #d9c9a3; border-radius: 6px; min-height: 20mm; padding: 6px 8px; font-size: 11.5px; white-space: pre-wrap; }
    .sig { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 16mm; }
    .sig div { text-align: center; font-size: 11px; border-top: 1px solid #1c2430; padding-top: 4px; }
    .date-line { margin-top: 10mm; font-size: 11.5px; }

    .sheet-footer { position: absolute; bottom: 7mm; left: 18mm; right: 16mm; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
  `
}

export function buildInventoryItemCardHtml(data: InventoryItemCardData): InventoryItemCardResult {
  // 2026-08-14 (11. pont): nyelvvalasztas + HIVATALOS roman terminologia.
  //  - a roman feliratok a MODERN diakritikat hasznaljak (ș/ț — vesszos alak),
  //    a korabbi elavult ş/ţ (cedillas) helyett;
  //  - a terminologia az OMFP 2634/2015 normabol jon (Fișa mijlocului fix,
  //    Cod de clasificare, Valoarea de inventar, Loc de folosință, …);
  //  - alapeszkoznel a hivatalos iv neve „FIȘA MIJLOCULUI FIX", egyebkent
  //    „FIȘA OBIECTULUI DE INVENTAR".
  const lang: 'hu' | 'ro' = data.lang === 'ro' ? 'ro' : 'hu'

  /** Mezocimke: elsodleges nyelv + alcimke a masikon. */
  const L = (hu: string, ro: string): string =>
    lang === 'hu'
      ? `${esc(hu)}<span class="ro">${esc(ro)}</span>`
      : `${esc(ro)}<span class="ro">${esc(hu)}</span>`
  /** Szekcio-cim ugyanigy. */
  const H = (hu: string, ro: string): string =>
    lang === 'hu'
      ? `${esc(hu)} <span class="ro">· ${esc(ro)}</span>`
      : `${esc(ro)} <span class="ro">· ${esc(hu)}</span>`
  /** Sima szoveg (megjegyzesek, jelzok) az elsodleges nyelven. */
  const T = (hu: string, ro: string): string => (lang === 'hu' ? hu : ro)

  const locale = lang === 'ro' ? 'ro-RO' : 'hu-HU'

  /**
   * 2026-08-22 (6. pont): a KIÁLLÍTÓ kétnyelvű megnevezése — a lap nyelvének
   * megfelelő sorrendben. Román kartonon a ROMÁN név áll ELÖL (különben a
   * fejléc mondana ellent a lap többi, románra fordított feliratának);
   * magyaron a magyar. Ha csak az egyik név van meg, az áll ott EGYEDÜL.
   * A logika a közös helperből jön (finance/entity-name.ts), nem másolat.
   */
  const entitasNev = esc(
    hivatalosKetnyelvuNev(data.congregationName, data.congregationNameRo, { elol: lang }),
  )
  const megnevezes = (data.megnevezes ?? '').trim()
  const roFormName = data.isAlapeszkoz ? 'Fișa mijlocului fix' : 'Fișa obiectului de inventar'
  const huFormName = 'Leltári tárgy fișája'
  const title = megnevezes
    ? `${lang === 'ro' ? 'Fișă' : 'Fișa'} — ${megnevezes}`
    : T(huFormName, roFormName)

  const mennyisegStr =
    data.mennyiseg != null && data.mennyiseg > 0
      ? `${data.mennyiseg} ${(data.mertekegyseg || 'db').trim()}`
      : null
  const unitValue = fmtRon(data.beszerzesErteke ?? null)
  const bookValue =
    data.beszerzesErteke != null && data.beszerzesErteke > 0
      ? fmtRon((data.beszerzesErteke || 0) * (data.mennyiseg && data.mennyiseg > 0 ? data.mennyiseg : 1))
      : null

  const katalogus = [data.katalogusKod, data.katalogusNev].filter(Boolean).join(' — ') || null
  const monthlyDep =
    data.isAlapeszkoz && data.beszerzesErteke && data.hasznalatiIdoEv && data.hasznalatiIdoEv > 0
      ? fmtRon(data.beszerzesErteke / (data.hasznalatiIdoEv * 12))
      : null

  const amortBlock = data.isAlapeszkoz
    ? `<div class="amort">
        <div class="grid">
          <div class="row"><span class="k">${L('Katalóguskód', 'Cod de clasificare')}</span><span class="fill">${val(katalogus, '10rem')}</span></div>
          <div class="row"><span class="k">${L('Használati idő', 'Durata normală de funcționare')}</span><span class="fill">${val(data.hasznalatiIdoEv ? `${data.hasznalatiIdoEv} ${T('év', 'ani')}` : null)}</span></div>
          <div class="row"><span class="k">${L('Havi leírás', 'Amortizarea lunară')}</span><span class="fill">${val(monthlyDep)}</span></div>
          <div class="row"><span class="k">${L('Aktuális leltári érték', 'Valoarea actuală')}</span><span class="fill">${val(fmtRon(data.aktualisErtek ?? null))}</span></div>
        </div>
        <div class="note">${esc(T(
          'Lineáris (havi) leírás a hivatalos amortizációs katalógus szerint; az aktuális érték a mai napra számolva.',
          'Amortizare liniară (lunară) conform catalogului oficial (HG 2139/2004); valoarea actuală este calculată la zi.',
        ))}</div>
      </div>`
    : `<div class="amort"><div class="note">${esc(T(
        'Nem amortizálódó kategória — a leltári érték a könyv szerinti értékkel azonos.',
        'Categorie neamortizabilă — valoarea de inventar este egală cu valoarea de intrare.',
      ))}</div></div>`

  const bookRows =
    (data.szerzo ?? '').trim() || (data.konyvIsbn ?? '').trim()
      ? `<div class="section">
          <h2>${H('Könyv-adatok', 'Date bibliografice')}</h2>
          <div class="grid">
            <div class="row"><span class="k">${L('Szerző', 'Autor')}</span><span class="fill">${val(data.szerzo)}</span></div>
            <div class="row"><span class="k">ISBN</span><span class="fill">${val(data.konyvIsbn)}</span></div>
          </div>
        </div>`
      : ''

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>${styles()}</style>
</head>
<body data-sheet-count="1">
  <div class="sheet">
    <div class="head">
      <div>
        <div class="cong">${entitasNev}</div>
        <h1>${esc(T(huFormName.toUpperCase(), roFormName.toUpperCase()))}</h1>
        <div class="sub">${esc(T(roFormName, huFormName))}</div>
        <div class="row" style="margin-top:8px"><span class="k">${L('Megnevezés', data.isAlapeszkoz ? 'Denumirea mijlocului fix și caracteristici tehnice' : 'Denumirea obiectului')}</span><span class="fill">${val(megnevezes, '16rem')}</span></div>
        <div class="row"><span class="k">${L('Kategória', 'Categoria')}</span><span class="fill">${val(
          [data.kategoriaLabel, data.kategoriaLabelRo ? `(${data.kategoriaLabelRo})` : null].filter(Boolean).join(' '),
          '12rem',
        )}</span></div>
      </div>
      <div class="numbox">
        <div class="cap">${lang === 'hu' ? 'Leltári szám<br/>Nr. de inventar' : 'Numărul de inventar<br/>Leltári szám'}</div>
        <div class="num">${data.leltariSzam ? esc(data.leltariSzam) : '—'}</div>
        <div class="old">${
          data.leltariSzam
            ? data.regiLeltariSzam
              ? `${esc(T('Régi szám', 'Nr. vechi'))}: ${esc(data.regiLeltariSzam)}`
              : '&nbsp;'
            : esc(T('mentéskor generálódik', 'se generează la salvare'))
        }</div>
      </div>
    </div>

    <div class="section">
      <h2>${H('Alapadatok', 'Date generale')}</h2>
      <div class="grid">
        <div class="row"><span class="k">${L('Mennyiség', 'Cantitate')}</span><span class="fill">${val(mennyisegStr)}</span></div>
        <div class="row"><span class="k">${L('Helyszín', 'Loc de folosință')}</span><span class="fill">${val(data.helyszin)}</span></div>
        <div class="row"><span class="k">${L('Felelős személy', 'Persoana responsabilă (gestionar)')}</span><span class="fill">${val(data.felelosNev)}</span></div>
        <div class="row"><span class="k">&nbsp;</span><span class="fill"></span></div>
      </div>
    </div>

    <div class="section">
      <h2>${H('Beszerzés', 'Date de achiziție')}</h2>
      <div class="grid">
        <div class="row"><span class="k">${L('Beszerzés dátuma', 'Data achiziției')}</span><span class="fill">${val(fmtDate(data.beszerzesDatuma, locale))}</span></div>
        <div class="row"><span class="k">${L('Beszerzési irat', 'Document de proveniență')}</span><span class="fill">${val(data.beszerzesBizonylat)}</span></div>
        <div class="row"><span class="k">${L('Egységérték', 'Valoare unitară')}</span><span class="fill">${val(unitValue)}</span></div>
        <div class="row"><span class="k">${L('Könyv szerinti érték', 'Valoarea de inventar')}</span><span class="fill">${val(bookValue)}</span></div>
      </div>
    </div>

    <div class="section">
      <h2>${H('Amortizáció', 'Amortizare')}</h2>
      ${amortBlock}
    </div>
    ${bookRows}

    <div class="section">
      <h2>${H('Megjegyzés', 'Observații')}</h2>
      <div class="note-box">${esc((data.megjegyzes ?? '').trim())}</div>
    </div>

    <div class="date-line">${esc(T(
      'Kelt: ______________________, ________ év ______ hó ____ nap',
      'Întocmit la: ______________________, anul ________ luna ______ ziua ____',
    ))}</div>
    <div class="sig"><div>${esc(T('lelkipásztor', 'conducătorul unității'))}</div><div>${esc(T('leltárfelelős', 'responsabil cu inventarul'))}</div></div>
    <div class="sheet-footer"><span>Kartotéka · ${entitasNev}</span><span>${data.leltariSzam ? esc(data.leltariSzam) : esc(T('új tétel', 'obiect nou'))}</span></div>
  </div>
</body>
</html>`

  return { title, html, sheetCount: 1 }
}
