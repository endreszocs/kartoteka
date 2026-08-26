/**
 * Leltár-nyomtatványok LAP-TÖRDELŐ rétege (2026-08-27).
 *
 * ⛔ MI VOLT A HIBA (Endre élesben találta):
 *   1. „nem osztja fel az előnézet oldalakra és nem ad oldalszámot" — MINDEN
 *      nyomtatvány EGYETLEN `.page` dobozba került (reporting.ts, 5 db
 *      `<div class="page">`), ami a tartalommal együtt nőtt. Egy 200 tételes
 *      leltárív így egyetlen, méteres „lap" lett.
 *   2. Az oldalszám HAZUDOTT: képernyőn `content: "1 / 1"` volt beégetve,
 *      nyomtatásban pedig `counter(page) " / " counter(pages)` — ez utóbbi
 *      SEHOL nem működik. A `page`/`pages` számláló KIZÁRÓLAG a @page
 *      margin-boxokban él (Chrome 131+), a dokumentum normál tartalmában
 *      egyetlen böngésző sem tudja feloldani. (MDN @page; Chrome fejlesztői
 *      blog, print-margins; Aaron Saray 2025-10-23 mérése.)
 *      A repó máshol MÁR jól csinálja: a személyi karton a lapszámot SZÖVEGKÉNT
 *      írja a láblécbe (lib/members/person-card-print.ts:158).
 *
 * A MEGOLDÁS EGYETLEN IGAZSÁGFORRÁSA a saját lap-dobozunk: azt mutatjuk a
 * képernyőn, azt nyomtatjuk (`@page { margin: 0 }`), és az oldalszámot is MI
 * írjuk bele. Így a képernyő, a nyomtatás és a PDF ugyanazt a lapszámot adja.
 *
 * ⚠️ MIÉRT TISZTA, DOM NÉLKÜLI TÖRDELÉS: a PDF-mentés egy REJTETT iframe-ben
 * fut (print-engine-v2), az előnézet egy MÁSIKBAN. Ha a tördelés méréssel,
 * futásidőben történne, a két oldal széthúzhatna — a `data-sheet-count` őr
 * pedig épp az ilyen eltérésre mond hangos hibát. Ezért a lapok száma és
 * tartalma a HTML-ben eldől, és tesztelhető marad (selftest).
 */

export type PrintLang = 'hu' | 'ro'
export type PrintOrientation = 'portrait' | 'landscape'

/** 96 dpi-s CSS-pixel milliméterenként. */
const PX_PER_MM = 96 / 25.4

/**
 * A lap magassága mm-ben.
 *
 * ⚠️ SZÁNDÉKOSAN 296 / 209 — nem 297 / 210. Ez a paper-css bevált
 * kerekítési ráhagyása: teljes lapmagasságnál a böngésző kerekítése egy
 * FANTOM ÜRES OLDALT szúr be minden lap után (paper-css#32, 2018 óta nyitott).
 */
const LAP_MAGASSAG_MM: Record<PrintOrientation, number> = { portrait: 296, landscape: 209 }
const LAP_SZELESSEG_MM: Record<PrintOrientation, number> = { portrait: 210, landscape: 297 }

const PADDING_FELUL_MM = 12
/** Alul több hely kell: ide ül ki a lábléc (oldalszám). */
const PADDING_ALUL_MM = 16

/** Egy táblázatsor becsült magassága px-ben (11px betű + 6px padding + keret). */
const SOR_MAGASSAG_PX = 26
/** Egy tördelt extra sor a cellán belül. */
const EXTRA_SOR_PX = 14
/**
 * Biztonsági sáv a lap alján, px.
 *
 * ⚠️ MIÉRT KELL (Endre élesben találta: „az előnézet hibás, egymásra vannak
 * csúszva"): a becslés SOSEM lesz pixel-pontos — a betűszélesség, a szóközök
 * helye és a cellák belső tördelése is beleszól. Ha alábecsüljük, a sorok
 * túlcsordulnak a `.page` dobozon: a lap `overflow: hidden`, tehát a
 * fölösleg LEVÁGÓDIK, az abszolút pozíciójú lábléc pedig RÁCSÚSZIK az utolsó
 * sorokra. Ezért inkább hagyunk üresen egy sávot, mint hogy adat vesszen.
 */
const BIZTONSAGI_SAV_PX = 20
/** A táblázat fejléce (thead) — böngészőben MÉRVE 39 px, +1 ráhagyással. */
const THEAD_PX = 40
/** Az összesítő sor (tfoot) — csak az utolsó lapon. */
const TFOOT_PX = 28

/** Egy lap hasznos belmagassága px-ben (a biztonsági sávval csökkentve). */
export function lapBelmagassagPx(orientation: PrintOrientation): number {
  const nyers = (LAP_MAGASSAG_MM[orientation] - PADDING_FELUL_MM - PADDING_ALUL_MM) * PX_PER_MM
  return nyers - BIZTONSAGI_SAV_PX
}

/** Egy tördelődő cella a sorban: a szövege és az oszlop kb. hány karaktert bír. */
export interface TordeloCella {
  szoveg?: string | null
  /** Hány karakter fér egy sorba EBBEN az oszlopban (konzervatív becslés). */
  karakterPerSor: number
}

/**
 * Egy tartalmi sor becsült magassága.
 *
 * ⚠️ 2026-08-27 — A HIBA, AMIT ENDRE ÉLESBEN LÁTOTT: a becslés eredetileg
 * EGYETLEN oszlop (a megjegyzés) tördelését nézte. A leltáríven viszont a
 * MEGNEVEZÉS a leghosszabb szöveg — egy „KIPSTA Vest diferenere Sporturi
 * deVerde turcoaz universal - 0.048 kg" két sorba fut. Így minden ilyen sort
 * egysorosnak számoltunk, a lap alja túlcsordult, és a lábléc rácsúszott az
 * utolsó sorokra. Mostantól MINDEN tördelődő oszlopot mérünk, és a
 * legmagasabb dönt.
 *
 * Konzervatívan felfelé kerekítünk: inkább maradjon üres hely a lap alján,
 * mint hogy a sor túlcsorduljon és a `.page` overflow levágja. (A
 * `react-to-print` dokumentált korlátja is ez: a túlcsorduló tartalom NEM
 * tördelődik, hanem levágódik.)
 */
export function becsultSorMagassag(cellak: TordeloCella[]): number {
  let sorok = 1
  for (const cella of cellak) {
    const hossz = String(cella.szoveg || '').length
    if (hossz === 0) continue
    sorok = Math.max(sorok, Math.ceil(hossz / Math.max(1, cella.karakterPerSor)))
  }
  return SOR_MAGASSAG_PX + (sorok - 1) * EXTRA_SOR_PX
}

export interface PrintSor {
  html: string
  /** Becsült magasság px-ben (becsultSorMagassag). */
  magassag: number
}

export interface LapSpec {
  orientation: PrintOrientation
  /** Az ELSŐ lap fejléce (cím, alcím, meta-rács). */
  fejlecElso: string
  /** A TOVÁBBI lapok rövid fejléce („… folytatás"). Ha üres, nincs. */
  fejlecFolytatas?: string
  /** A táblázat nyitó része (thead-del együtt) — minden lapon ismétlődik. */
  tablaNyito?: string
  /** A táblázat záró része. */
  tablaZaro?: string
  sorok?: PrintSor[]
  /** Csak az UTOLSÓ lap táblázatába kerülő összesítő. */
  tfoot?: string
  /** Az utolsó lapon, a táblázat UTÁN következő blokkok (megjegyzés, aláírás). */
  zaroBlokkok?: string
  /** A zárózblokkok becsült magassága px-ben (a tördelés ezzel számol). */
  zaroBlokkokMagassag?: number
  /** A lábléc bal oldali szövege (intézmény · nyomtatvány). */
  lablecCimke: string
  /** Ha nincs egyetlen sor sem: ez a szöveg jelenik meg a táblázat helyén. */
  uresUzenet?: string
}

export interface LapEredmeny {
  /** A `.page` dobozok összefűzött HTML-je. */
  html: string
  /** A TÉNYLEGES lapszám — ez megy a `data-sheet-count`-ba is. */
  lapszam: number
}

function lablec(cimke: string, oldal: number, osszes: number): string {
  // ⚠️ SZÖVEGKÉNT írjuk ki, nem CSS-számlálóval: a counter(page)/counter(pages)
  // a dokumentum tartalmában egyetlen böngészőben sem oldódik fel.
  return `<div class="page-footer"><span>${cimke}</span><span>${oldal} / ${osszes}</span></div>`
}

/**
 * A tartalom valódi A4-lapokra bontása.
 *
 * A tördelés SORONKÉNT megy: minden sor becsült magasságát levonjuk a lap
 * hasznos belmagasságából; ha nem fér, új lap kezdődik (ismételt táblafejléccel).
 */
export function epitLapok(spec: LapSpec): LapEredmeny {
  const belmagassag = lapBelmagassagPx(spec.orientation)
  const sorok = spec.sorok || []
  const tablaNyito = spec.tablaNyito || ''
  const tablaZaro = spec.tablaZaro || ''
  const zaroMagassag = spec.zaroBlokkokMagassag ?? 0

  // ── 1. A sorok szétosztása lapokra ──────────────────────────────────────
  const lapSorok: PrintSor[][] = []
  if (sorok.length === 0) {
    lapSorok.push([])
  } else {
    let aktualis: PrintSor[] = []
    let hasznalt = becsultFejlecMagassag(spec.fejlecElso) + (tablaNyito ? THEAD_PX : 0)
    for (const sor of sorok) {
      if (aktualis.length > 0 && hasznalt + sor.magassag > belmagassag) {
        lapSorok.push(aktualis)
        aktualis = []
        hasznalt = becsultFejlecMagassag(spec.fejlecFolytatas || '') + (tablaNyito ? THEAD_PX : 0)
      }
      aktualis.push(sor)
      hasznalt += sor.magassag
    }
    lapSorok.push(aktualis)

    // Az összesítő és a záróblokkok az UTOLSÓ lapra kerülnek — ha nem férnek,
    // kapnak egy saját, külön lapot (különben levágódnának).
    const utolsoMagassag =
      becsultFejlecMagassag(lapSorok.length === 1 ? spec.fejlecElso : spec.fejlecFolytatas || '') +
      (tablaNyito ? THEAD_PX : 0) +
      lapSorok[lapSorok.length - 1].reduce((s, r) => s + r.magassag, 0) +
      (spec.tfoot ? TFOOT_PX : 0) +
      zaroMagassag
    if (utolsoMagassag > belmagassag && lapSorok[lapSorok.length - 1].length > 0) {
      lapSorok.push([])
    }
  }

  const lapszam = lapSorok.length

  // ── 2. A lapok HTML-je ──────────────────────────────────────────────────
  const lapok = lapSorok.map((sorLista, index) => {
    const elso = index === 0
    const utolso = index === lapszam - 1
    const fejlec = elso ? spec.fejlecElso : spec.fejlecFolytatas || ''

    let tabla = ''
    if (tablaNyito) {
      const testSorok = sorLista.map(s => s.html).join('')
      const uresSor =
        sorLista.length === 0 && sorok.length === 0 && spec.uresUzenet
          ? `<tr><td class="text-center" colspan="99">${spec.uresUzenet}</td></tr>`
          : ''
      const tfoot = utolso && spec.tfoot ? spec.tfoot : ''
      tabla = `${tablaNyito}<tbody>${testSorok}${uresSor}</tbody>${tfoot}${tablaZaro}`
    }

    const zaro = utolso && spec.zaroBlokkok ? spec.zaroBlokkok : ''

    return `<div class="page">${fejlec}${tabla}${zaro}${lablec(spec.lablecCimke, index + 1, lapszam)}</div>`
  })

  return { html: lapok.join(''), lapszam }
}

/**
 * A fejléc-blokk becsült magassága px-ben.
 *
 * Nyers, de a célnak megfelelő becslés: a blokk-szintű elemek számából
 * indulunk ki. A tördelés konzervatív irányba téved (inkább kevesebb sor
 * egy lapra), ezért a pontatlanság nem okoz levágást.
 */
function becsultFejlecMagassag(fejlecHtml: string): number {
  if (!fejlecHtml) return 0
  // A folytatás-fejléc (a további lapok tetején) mérve 13 px.
  if (/class="continued"/.test(fejlecHtml)) return 16
  const cim = /class="title"/.test(fejlecHtml) ? 34 : 0
  const alcim = /class="subtitle"/.test(fejlecHtml) ? 26 : 0
  const metaSorok = (fejlecHtml.match(/<div><strong>/g) || []).length
  const meta = metaSorok > 0 ? Math.ceil(metaSorok / 2) * 20 + 18 : 0
  const szekcioCim = (fejlecHtml.match(/class="section-title"/g) || []).length * 24
  return cim + alcim + meta + szekcioCim + 8
}

/**
 * A nyomtatványok KÖZÖS stíluslapja.
 *
 * A recept a paper-css bevált mintája: `@page { margin: 0 }`, a valódi margót
 * a lap-doboz saját paddingje adja, így a képernyős előnézet és a nyomtatott
 * lap 1:1-ben esik egybe.
 */
export function printStyles(orientation: PrintOrientation): string {
  const w = LAP_SZELESSEG_MM[orientation]
  const h = LAP_MAGASSAG_MM[orientation]

  return `
    /* A margót a .page paddingje adja — így a képernyő és a papír egyezik. */
    @page { size: A4 ${orientation}; margin: 0; }
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; color: #111827; margin: 0; background: #e2e8f0; }
    .page {
      width: ${w}mm;
      height: ${h}mm;
      padding: ${PADDING_FELUL_MM}mm ${PADDING_FELUL_MM}mm ${PADDING_ALUL_MM}mm;
      background: #ffffff;
      position: relative;
      overflow: hidden;
      break-after: page;
      page-break-after: always;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    /* Ez öli meg a fantom üres utolsó oldalt. */
    .page:last-child { break-after: auto; page-break-after: auto; }
    .title { font-size: 20px; font-weight: bold; text-align: center; margin-bottom: 8px; text-transform: uppercase; }
    .subtitle { font-size: 12px; text-align: center; margin-bottom: 16px; color: #475569; }
    .continued { font-size: 11px; text-align: right; color: #64748b; margin-bottom: 8px; font-style: italic; }
    .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px 24px; margin-bottom: 18px; font-size: 12px; }
    .meta-grid strong { color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #334155; padding: 6px 7px; vertical-align: top; font-size: 11px; }
    th { background: #e2e8f0; text-align: center; font-weight: bold; }
    /* A break-inside NÉLKÜL a Chrome NEM ismétli a fejlécet a következő lapon. */
    thead { display: table-header-group; break-inside: avoid; }
    tfoot { display: table-footer-group; }
    tr, td, th { break-inside: avoid; page-break-inside: avoid; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .section { margin-top: 16px; }
    .section-title { margin: 0 0 8px; font-size: 14px; font-weight: bold; text-transform: uppercase; }
    .note { margin-top: 12px; border: 1px solid #cbd5e1; background: #f8fafc; padding: 10px 12px; font-size: 11px; color: #475569; }
    .totals { font-weight: bold; background: #f8fafc; }
    .signature-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 18px; margin-top: 32px; }
    .signature-box { text-align: center; font-size: 12px; }
    .signature-line { margin-top: 34px; border-top: 1px solid #0f172a; padding-top: 6px; }
    /* A lábléc a lap ALJÁRA ül ki — az oldalszám SZÖVEGKÉNT áll benne. */
    .page-footer {
      position: absolute;
      left: ${PADDING_FELUL_MM}mm;
      right: ${PADDING_FELUL_MM}mm;
      bottom: 6mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: #64748b;
    }
    @media screen {
      body { padding: 18px 0; }
      .page { margin: 0 auto 18px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12); }
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .page { margin: 0; box-shadow: none; }
    }
  `
}

/**
 * A kész dokumentum.
 *
 * ⚠️ A `data-sheet-count` KÖTELEZŐ: a print-engine-v2 csonka-PDF őre ebből
 * tudja, hány lapot VÁR a DOM-ban. E nélkül a többlapos nyomtatvány a régi,
 * teljes-dokumentumos útra esne, ami egyetlen óriási canvasra rasterizál —
 * és a GPU textúra-plafonja fölött NÉMÁN fehér PDF-et ad.
 */
export function wrapPrintDocument(params: {
  title: string
  orientation: PrintOrientation
  lang: PrintLang
  lapokHtml: string
  lapszam: number
}): string {
  const { title, orientation, lang, lapokHtml, lapszam } = params
  return (
    `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8" />` +
    `<title>${escapeHtmlAttr(title)}</title>` +
    `<style>${printStyles(orientation)}</style></head>` +
    `<body data-sheet-count="${lapszam}">${lapokHtml}</body></html>`
  )
}

function escapeHtmlAttr(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------
// Kétnyelvűség
// ---------------------------------------------------------------------------

/**
 * A nyomtatvány EGYNYELVŰ szövege.
 *
 * ⚠️ 2026-08-27 (Endre döntése): „Magyar és a román verzió legyen, vagy csak
 * román vagy csak magyar!" — a korábbi, „Dátum / Data" alakú vegyes feliratok
 * megszűntek. Egy ív mostantól VÉGIG egy nyelven szól; a másik nyelvű
 * változat külön nyomtatható.
 */
export function egyNyelvu(lang: PrintLang, hu: string, ro: string): string {
  if (lang === 'hu') return hu || ro
  return ro || hu
}

/**
 * A kiállító neve a lap nyelvén.
 *
 * ⚠️ Ha a választott nyelven NINCS név (tipikusan hiányzik a `nev_ro`), a
 * másik nyelvű név áll ott EGYEDÜL — kitalált nevet SOHA nem írunk hivatalos
 * ívre.
 */
export function entitasNevEgyNyelven(
  hu: string | null | undefined,
  ro: string | null | undefined,
  lang: PrintLang,
): string {
  const huNev = (hu || '').trim()
  const roNev = (ro || '').trim()
  if (lang === 'ro') return roNev || huNev
  return huNev || roNev
}

export const PRINT_LANG_LABEL: Record<PrintLang, string> = {
  hu: 'Magyar',
  ro: 'Román',
}
