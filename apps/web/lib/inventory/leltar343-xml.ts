/**
 * Leltar 3_43 — cél-zott OOXML-foltozó (2026-08-26).
 *
 * MIÉRT KÉZI XML-MŰTÉT, ÉS NEM EXCELJS/SHEETJS ÚJRAÍRÁS: a hivatalos
 * munkafüzet lapvédelmet, névtartomány-alapú legördülőket (Hszin),
 * adatérvényesítéseket és több tízezer származtatott képletet hordoz. Az
 * exceljs a beolvasás+kiírás körutazáson BIZONYÍTOTTAN elveszíti az
 * adatérvényesítéseket (exceljs#1207, #1184), a SheetJS közösségi kiadása
 * pedig nem őrzi őket — egy „újraépített" fájl tehát némán csonkulna. Ezért a
 * SABLON BÁJTRA VÁLTOZATLAN marad, és kizárólag a kitöltendő lapok meglévő,
 * üres celláiba injektálunk értékeket; a származtatott lapok képleteit az
 * Excel a `fullCalcOnLoad` jelzés miatt megnyitáskor újraszámolja.
 *
 * A modul TISZTA (nincs IO/zip) — a zip-kezelés a hívóé (kliens: jszip), így
 * a foltozás selftesttel, szintetikus lap-XML-en is bizonyítható.
 */

import type { Leltar343ExportSor } from './leltar343-shared'

// ---------------------------------------------------------------------------
// Alapok
// ---------------------------------------------------------------------------

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Vezérlőkarakterek (a cellaszövegben érvénytelenek az XML-ben) — szóközre.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
}

function oszlopIndex(col: string): number {
  let n = 0
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

/** Egy cella teljes XML-je: szám → <v>, szöveg → inline string. */
export function cellaXml(ref: string, v: string | number, s?: string | null): string {
  const stilus = s ? ` s="${s}"` : ''
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return `<c r="${ref}"${stilus}/>`
    return `<c r="${ref}"${stilus}><v>${v}</v></c>`
  }
  return `<c r="${ref}"${stilus} t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`
}

// ---------------------------------------------------------------------------
// Stílus-minta a lap 5. sorából (az adatbeviteli cellák formátuma)
// ---------------------------------------------------------------------------

/**
 * Oszlopbetű → stílus-azonosító térkép a megadott mintasorból. Az injektált
 * cellák így a sablon EREDETI cellaformátumát (szegély, számformátum) viselik.
 */
export function sorStilusTerkep(sheetXml: string, mintaSor = 5): Map<string, string> {
  const terkep = new Map<string, string>()
  const sor = sorBlokk(sheetXml, mintaSor)
  if (!sor) return terkep
  const re = /<c r="([A-Z]+)(\d+)"([^>]*?)(\/>|>)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(sor.blokk))) {
    if (Number(m[2]) !== mintaSor) continue
    const s = / s="(\d+)"/.exec(m[3])
    if (s) terkep.set(m[1], s[1])
  }
  return terkep
}

// ---------------------------------------------------------------------------
// Sor-blokk keresés / cella-csere
// ---------------------------------------------------------------------------

interface SorBlokk {
  start: number
  vege: number
  blokk: string
  onzaro: boolean
}

/** A `<row r="N" …>…</row>` (vagy önzáró) blokk megkeresése. */
function sorBlokk(sheetXml: string, r: number): SorBlokk | null {
  const nyito = `<row r="${r}"`
  let idx = -1
  let keres = 0
  // Határ-ellenőrzés: a `<row r="5"` az `<row r="50"` prefixe is — a
  // következő karakternek szóköznek vagy `>`-nek/`/`-nek kell lennie.
  while (true) {
    idx = sheetXml.indexOf(nyito, keres)
    if (idx === -1) return null
    const utana = sheetXml.charAt(idx + nyito.length)
    if (utana === ' ' || utana === '>' || utana === '/') break
    keres = idx + nyito.length
  }
  const tagVege = sheetXml.indexOf('>', idx)
  if (tagVege === -1) return null
  if (sheetXml.charAt(tagVege - 1) === '/') {
    return { start: idx, vege: tagVege + 1, blokk: sheetXml.slice(idx, tagVege + 1), onzaro: true }
  }
  const zaro = sheetXml.indexOf('</row>', tagVege)
  if (zaro === -1) return null
  return { start: idx, vege: zaro + 6, blokk: sheetXml.slice(idx, zaro + 6), onzaro: false }
}

/** Egy meglévő sor-blokkban a megadott cellák cseréje/beszúrása. */
export function foltozSorBlokk(
  blokk: string,
  r: number,
  cellak: Array<{ col: string; v: string | number }>,
  stilusok: Map<string, string>,
): string {
  let uj = blokk
  // Önzáró sor (`<row r="9"/>`) → nyitó-záró párrá alakítjuk.
  if (uj.endsWith('/>') && !uj.includes('</row>')) {
    uj = `${uj.slice(0, -2)}></row>`
  }
  for (const cella of cellak) {
    const ref = `${cella.col}${r}`
    const cellaNyito = `<c r="${ref}"`
    let idx = -1
    let keres = 0
    while (true) {
      idx = uj.indexOf(cellaNyito, keres)
      if (idx === -1) break
      const utana = uj.charAt(idx + cellaNyito.length)
      if (utana === ' ' || utana === '>' || utana === '/') break
      keres = idx + cellaNyito.length
    }
    if (idx !== -1) {
      // Meglévő cella: a saját stílusa marad, a tartalma cserélődik.
      const tagVege = uj.indexOf('>', idx)
      const onzaro = uj.charAt(tagVege - 1) === '/'
      const cellaVege = onzaro ? tagVege + 1 : uj.indexOf('</c>', tagVege) + 4
      const eredeti = uj.slice(idx, cellaVege)
      const sAttr = / s="(\d+)"/.exec(eredeti)
      const csere = cellaXml(ref, cella.v, sAttr ? sAttr[1] : stilusok.get(cella.col) || null)
      uj = uj.slice(0, idx) + csere + uj.slice(cellaVege)
    } else {
      // Hiányzó cella: oszloprend szerinti helyre szúrjuk be.
      const ujCella = cellaXml(ref, cella.v, stilusok.get(cella.col) || null)
      const re = /<c r="([A-Z]+)(\d+)"/g
      let beszurasHely = uj.lastIndexOf('</row>')
      let m: RegExpExecArray | null
      while ((m = re.exec(uj))) {
        if (Number(m[2]) !== r) continue
        if (oszlopIndex(m[1]) > oszlopIndex(cella.col)) {
          beszurasHely = m.index
          break
        }
      }
      uj = uj.slice(0, beszurasHely) + ujCella + uj.slice(beszurasHely)
    }
  }
  return uj
}

/**
 * Export-sorok injektálása egy lap XML-jébe.
 *
 * A sablon adatlapjain a sorok ELŐRE LÉTEZNEK (üres, stílusozott cellákkal és
 * segédoszlop-képletekkel) — a meglévő sort foltozzuk. Ha a tételszám túlnő a
 * sablon előre létrehozott sorain, a hiányzó sorokat a </sheetData> elé,
 * növekvő sorrendben szintetizáljuk (ezeket a lap belső képletei már nem
 * dolgozzák fel — erre a hívó hangos figyelmeztetést ad).
 */
export function injektalSorok(
  sheetXml: string,
  sorok: Leltar343ExportSor[],
  mintaSor = 5,
): { xml: string; szintetizalt: number } {
  const stilusok = sorStilusTerkep(sheetXml, mintaSor)
  let xml = sheetXml
  let szintetizalt = 0
  const potlando: Leltar343ExportSor[] = []

  const rendezett = [...sorok].sort((a, b) => a.r - b.r)
  for (const sor of rendezett) {
    if (sor.cellak.length === 0) continue
    const blokk = sorBlokk(xml, sor.r)
    if (blokk) {
      const uj = foltozSorBlokk(blokk.blokk, sor.r, sor.cellak, stilusok)
      xml = xml.slice(0, blokk.start) + uj + xml.slice(blokk.vege)
    } else {
      potlando.push(sor)
    }
  }

  if (potlando.length > 0) {
    const zaro = xml.indexOf('</sheetData>')
    if (zaro === -1) {
      throw new Error('A lap XML-jében nincs </sheetData> — a sablon szerkezete nem az elvárt.')
    }
    const ujSorok = potlando
      .map(sor => {
        const cellak = sor.cellak
          .map(c => cellaXml(`${c.col}${sor.r}`, c.v, stilusok.get(c.col) || null))
          .join('')
        return `<row r="${sor.r}" spans="4:26">${cellak}</row>`
      })
      .join('')
    xml = xml.slice(0, zaro) + ujSorok + xml.slice(zaro)
    szintetizalt = potlando.length
  }

  return { xml, szintetizalt }
}

// ---------------------------------------------------------------------------
// Lapnév → lap-XML útvonal (workbook.xml + workbook.xml.rels alapján)
// ---------------------------------------------------------------------------

/**
 * A lapnevek és a xl/worksheets/sheetN.xml fájlok összerendelése. A sorrendre
 * NEM szabad építeni (a rels-ben a rId ↔ fájlnév tetszőleges lehet) — a
 * sablonban pl. a „Hibak" lap sheetId=16-tal a 10. helyen áll.
 */
export function sheetXmlUtvonalak(workbookXml: string, relsXml: string): Map<string, string> {
  const ridTerkep = new Map<string, string>()
  const relRe = /<Relationship [^>]*Id="(rId\d+)"[^>]*Target="(worksheets\/sheet\d+\.xml)"[^>]*\/>/g
  let m: RegExpExecArray | null
  while ((m = relRe.exec(relsXml))) ridTerkep.set(m[1], `xl/${m[2]}`)
  // Attribútum-sorrendre érzéketlen második kör (Target előbb, Id utóbb).
  const relRe2 = /<Relationship [^>]*Target="(worksheets\/sheet\d+\.xml)"[^>]*Id="(rId\d+)"[^>]*\/>/g
  while ((m = relRe2.exec(relsXml))) ridTerkep.set(m[2], `xl/${m[1]}`)

  const terkep = new Map<string, string>()
  const sheetRe = /<sheet [^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"[^>]*\/>/g
  while ((m = sheetRe.exec(workbookXml))) {
    const utvonal = ridTerkep.get(m[2])
    if (utvonal) terkep.set(m[1], utvonal)
  }
  return terkep
}

// ---------------------------------------------------------------------------
// Munkafüzet-szintű foltok
// ---------------------------------------------------------------------------

/**
 * `fullCalcOnLoad` bekapcsolása: az injektált értékek mellett a származtatott
 * lapok (Hibak, Fisa, Leltáriv…) GYORSÍTÓTÁRAZOTT képlet-értékei elavultak —
 * e jelzés nélkül az Excel a régi (üres) értékeket mutatná újraszámolásig.
 */
export function bekapcsolFullCalc(workbookXml: string): string {
  if (workbookXml.includes('fullCalcOnLoad')) return workbookXml
  if (/<calcPr\b/.test(workbookXml)) {
    return workbookXml.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"')
  }
  // Nincs calcPr — a </workbook> elé tesszük (érvényes hely a séma szerint).
  return workbookXml.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>')
}

/**
 * Cimlap kitöltése: A2 = egyházmegye, A4 = intézmény, A6 = vezető,
 * B8..C107 = helyszín/felelős párok (a Hszin legördülő forrása).
 */
export function foltozCimlap(
  cimlapXml: string,
  params: {
    egyhazmegye?: string | null
    intezmeny?: string | null
    vezeto?: string | null
    parok: Array<{ helyszin: string | null; felelos: string | null }>
  },
): string {
  const sorok: Leltar343ExportSor[] = []
  if (params.egyhazmegye) sorok.push({ r: 2, cellak: [{ col: 'A', v: params.egyhazmegye }] })
  if (params.intezmeny) sorok.push({ r: 4, cellak: [{ col: 'A', v: params.intezmeny }] })
  if (params.vezeto) sorok.push({ r: 6, cellak: [{ col: 'A', v: params.vezeto }] })

  params.parok.slice(0, 100).forEach((par, index) => {
    const cellak: Array<{ col: string; v: string | number }> = []
    if (par.helyszin) cellak.push({ col: 'B', v: par.helyszin })
    if (par.felelos) cellak.push({ col: 'C', v: par.felelos })
    if (cellak.length > 0) sorok.push({ r: 8 + index, cellak })
  })

  // A Cimlapon nincs adatbeviteli mintasor — a meglévő cellák saját stílusa
  // marad (a foltozó a meglévő `s` attribútumot mindig megőrzi).
  return injektalSorok(cimlapXml, sorok, 8).xml
}

/**
 * Penztar_Beruhazas kezdő egyenlegek: Pénztár C6, Kinnlevőségek R6.
 * Csak akkor írunk, ha van hiteles szám — üres marad, ha nincs (inkább üres,
 * mint téves pénzügyi adat).
 */
export function foltozPenztarKezdoEgyenlegek(
  penztarXml: string,
  params: { penztarKezdo?: number | null; kinnlevosegKezdo?: number | null },
): string {
  const cellak: Array<{ col: string; v: string | number }> = []
  if (params.penztarKezdo != null && Number.isFinite(params.penztarKezdo)) {
    cellak.push({ col: 'C', v: Math.round(params.penztarKezdo * 100) / 100 })
  }
  if (params.kinnlevosegKezdo != null && Number.isFinite(params.kinnlevosegKezdo)) {
    cellak.push({ col: 'R', v: Math.round(params.kinnlevosegKezdo * 100) / 100 })
  }
  if (cellak.length === 0) return penztarXml
  return injektalSorok(penztarXml, [{ r: 6, cellak }], 9).xml
}
