// selftest-leltar-nyomtatvany.mjs — a leltár NYOMTATVÁNYAINAK őrszemei (2026-08-27)
//
// ⛔ MI VOLT A HIBA (Endre élesben találta)
//   1. „nem osztja fel az előnézet oldalakra és nem ad oldalszámot" — mind az
//      öt nyomtatvány EGYETLEN `.page` dobozba került, és az oldalszám hazudott:
//      képernyőn `content: "1 / 1"` volt beégetve, nyomtatásban pedig
//      `counter(page) " / " counter(pages)` — ez utóbbi a dokumentum
//      tartalmában EGYETLEN böngészőben sem oldódik fel.
//   2. Egyik nyomtatvány sem hordozott `data-sheet-count`-ot, ezért a
//      PDF-mentés MINDIG a régi, egy-canvasos útra esett — egy 200 tételes
//      leltárív a GPU textúra-plafonja fölé nőve NÉMÁN fehér PDF-et adhatott.
//   3. A Vagyonleltári jelentés négy oszlopa (nyitó + bejövetel − törlés =
//      záró) NEM adta ki egymást: három különböző érték-alapot kevert, és a
//      dátum nélküli tétel a záróban benne volt, a nyitóban nem.
//
// ŐRSZEMEK
//   L1–L5   lap-tördelés: valódi lapszám, data-sheet-count egyezés, oldalszám
//           SZÖVEGKÉNT, ismételt táblafejléc, fantom-oldal elleni védelem
//   L2n     negatív: a lapszám nélküli (óvilági) dokumentumon az őrszem BUKIK
//   V1–V3   vagyonleltári azonosság: záró = nyitó + bejövetel − törlés,
//           dátum nélküli tétel is elszámolva
//   V1n     negatív: a vegyes érték-alapú (óvilági) összegzésen az őrszem BUKIK
//   N1–N3   nyelv: román dokumentum html lang-ja, román címek, magyar ív-név
//   G1–G3   forrás-őrök: nincs counter(page) a tartalomban, a motor
//           tájolás-tudatos, az előnézet lapozható

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let total = 0
let failedCount = 0
function assert(cond, msg) {
  total += 1
  if (cond) console.log(`OK:   ${msg}`)
  else {
    failedCount += 1
    console.error(`FAIL: ${msg}`)
  }
}

let ts
try {
  ts = require_(path.join(ROOT, 'node_modules/typescript'))
} catch {
  console.log('typescript nem elérhető — a selftest kihagyva (nem hiba).')
  process.exit(0)
}

const SRC = {
  constants: path.join(ROOT, 'packages/ui-app/src/inventory/constants.ts'),
  value: path.join(ROOT, 'packages/ui-app/src/inventory/value.ts'),
  entityName: path.join(ROOT, 'packages/ui-app/src/finance/entity-name.ts'),
  financeInv: path.join(ROOT, 'packages/ui-app/src/finance/inventory.ts'),
  layout: path.join(ROOT, 'apps/web/lib/inventory/print-layout.ts'),
  reporting: path.join(ROOT, 'apps/web/lib/inventory/reporting.ts'),
  engine: path.join(ROOT, 'apps/web/lib/utils/print-engine-v2.ts'),
  preview: path.join(ROOT, 'apps/web/components/inventory/print-preview-frame.tsx'),
  dialog: path.join(ROOT, 'apps/web/components/inventory/inventory-print-dialog-v2.tsx'),
}

const t = (src) =>
  ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-leltar-nyomtatvany-'))
process.on('exit', () => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true })
  } catch {
    /* takarítás */
  }
})

let szamlalo = 0
function ir(nev, tartalom) {
  const f = path.join(tmp, `${nev}-${(szamlalo += 1)}.cjs`)
  fs.writeFileSync(f, tartalom)
  return f
}

/** A @kartoteka/ui-app csomag stubja a VALÓDI forrásokból. */
function epitUiApp() {
  const constantsCjs = ir('constants', t(fs.readFileSync(SRC.constants, 'utf8')))
  const valueCjs = ir(
    'value',
    t(fs.readFileSync(SRC.value, 'utf8')).replace(
      /require\(["']\.\/constants["']\)/g,
      `require(${JSON.stringify(constantsCjs)})`,
    ),
  )
  const entityCjs = ir('entity', t(fs.readFileSync(SRC.entityName, 'utf8')))
  const financeCjs = ir('finance-inv', t(fs.readFileSync(SRC.financeInv, 'utf8')))
  return ir(
    'ui-app',
    `module.exports = Object.assign({},
       require(${JSON.stringify(financeCjs)}),
       require(${JSON.stringify(constantsCjs)}),
       require(${JSON.stringify(entityCjs)}),
       require(${JSON.stringify(valueCjs)}));`,
  )
}

/** A reporting modul betöltése ADOTT forrásszöveggel (mutánsokhoz is). */
function betolt({ reportingSrc, layoutSrc } = {}) {
  const uiApp = epitUiApp()
  const layoutCjs = ir('layout', t(layoutSrc ?? fs.readFileSync(SRC.layout, 'utf8')))
  const reportingCjs = ir(
    'reporting',
    t(reportingSrc ?? fs.readFileSync(SRC.reporting, 'utf8'))
      .replace(/require\(["']@kartoteka\/ui-app["']\)/g, `require(${JSON.stringify(uiApp)})`)
      .replace(/require\(["']@\/lib\/constants\/inventory\.next["']\)/g, `require(${JSON.stringify(uiApp)})`)
      .replace(/require\(["']\.\/print-layout["']\)/g, `require(${JSON.stringify(layoutCjs)})`),
  )
  return { reporting: require_(reportingCjs), layout: require_(layoutCjs) }
}

const { reporting } = betolt()

// ---------------------------------------------------------------------------
// Próba-tételek
// ---------------------------------------------------------------------------

function tetel(i, extra = {}) {
  return {
    id: `id-${i}`,
    leltari_szam: `CS-${String(i).padStart(3, '0')}`,
    megnevezes: `Próba tétel ${i}`,
    kategoria: 'Csekély értékű',
    kategoria_key: 'csekely',
    beszerzes_erteke: 100,
    beszerzes_datuma: '2019-05-05',
    mennyiseg: 1,
    mertekegyseg: 'db',
    hasznalati_ido: null,
    helyszin: 'Templom',
    felelos_nev: 'Szőcs Endre',
    megjegyzes: '',
    torles_datuma: null,
    deleted: false,
    ertek_modositas: 0,
    ...extra,
  }
}

const EV = 2026
const SOK = Array.from({ length: 120 }, (_, i) => tetel(i + 1))

function lapokSzama(html) {
  return (html.match(/<div class="page">/g) || []).length
}
function sheetCount(html) {
  const m = html.match(/data-sheet-count="(\d+)"/)
  return m ? Number(m[1]) : null
}

// ---------------------------------------------------------------------------
// L1–L5 — lap-tördelés
// ---------------------------------------------------------------------------
{
  const doc = reporting.buildInventoryPrintDocument({
    type: 'leltariv',
    items: SOK,
    congregationName: 'Barátosi Református Egyházközség',
    year: EV,
  })
  const lapok = lapokSzama(doc.html)
  assert(lapok > 1, `L1: 120 tételes leltárív TÖBB lapra bomlik (${lapok} lap)`)
  assert(sheetCount(doc.html) === lapok, `L2: a data-sheet-count (${sheetCount(doc.html)}) egyezik a valódi lapszámmal (${lapok})`)
  assert(doc.lapszam === lapok, 'L2b: a visszaadott lapszám is egyezik (a felület ezt mutatja)')
  assert(
    doc.html.includes(`1 / ${lapok}`) && doc.html.includes(`${lapok} / ${lapok}`),
    'L3: az oldalszám SZÖVEGKÉNT szerepel a láblécben (első és utolsó lap is)',
  )
  assert(!/counter\(page/.test(doc.html), 'L3b: nincs több CSS-számláló az oldalszámban (a tartalomban sosem oldódik fel)')
  const theadDb = (doc.html.match(/<thead>/g) || []).length
  assert(theadDb === lapok, `L4: a táblázat fejléce MINDEN lapon ott van (${theadDb}/${lapok})`)
  assert(
    /\.page:last-child\s*\{[^}]*break-after:\s*auto/.test(doc.html),
    'L5: az utolsó lapon nincs oldaltörés (fantom üres oldal elleni védelem)',
  )
  assert(
    /thead\s*\{[^}]*display:\s*table-header-group[^}]*break-inside:\s*avoid/.test(doc.html),
    'L5b: a fejléc-ismétléshez a break-inside: avoid is ott van (Chrome e nélkül nem ismétel)',
  )
}

// L2n (negatív): a lapszám-jelzés nélküli (óvilági) dokumentumon az őrszem BUKIK.
{
  const mutansLayout = fs
    .readFileSync(SRC.layout, 'utf8')
    .replace('<body data-sheet-count="${lapszam}">', '<body>')
  const modul = betolt({ layoutSrc: mutansLayout })
  const doc = modul.reporting.buildInventoryPrintDocument({
    type: 'leltariv',
    items: SOK,
    congregationName: 'Barátosi Református Egyházközség',
    year: EV,
  })
  assert(sheetCount(doc.html) === null, 'L2n: a data-sheet-count nélküli óvilági dokumentumon az őrszem BUKNA — nem vak')
}

// ---------------------------------------------------------------------------
// V1–V3 — a vagyonleltári jelentés mozgás-azonossága
// ---------------------------------------------------------------------------

/** A vagyonleltári jelentés összesítő sorának négy száma. */
function osszesitoSorok(html) {
  const m = html.match(/<tr class="totals">([\s\S]*?)<\/tr>/)
  if (!m) return null
  const cellak = [...m[1].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(x => x[1].trim())
  const szamok = cellak
    .filter(c => /\d/.test(c))
    .map(c => Number(c.replace(/\s| /g, '').replace(/\./g, '').replace(',', '.')))
  return szamok
}

{
  const items = [
    // Előző évi, aktív
    tetel(1, { beszerzes_datuma: '2019-01-01' }),
    tetel(2, { beszerzes_datuma: '2018-06-06' }),
    // Idei beszerzés
    tetel(3, { beszerzes_datuma: `${EV}-03-03` }),
    // Idei kivezetés (előző évi tétel)
    tetel(4, { beszerzes_datuma: '2017-02-02', torles_datuma: `${EV}-07-07`, deleted: true }),
    // ⚠️ DÁTUM NÉLKÜLI tétel — az import ilyet is beenged
    tetel(5, { beszerzes_datuma: null }),
  ]
  const doc = reporting.buildInventoryPrintDocument({
    type: 'vagyonleltari_jelentes',
    items,
    congregationName: 'Barátosi Református Egyházközség',
    year: EV,
  })
  const szamok = osszesitoSorok(doc.html)
  assert(!!szamok && szamok.length === 4, `V1a: az összesítő sor négy számot ad (${szamok && szamok.length})`)
  if (szamok && szamok.length === 4) {
    const [nyito, be, ki, zaro] = szamok
    assert(
      Math.abs(nyito + be - ki - zaro) < 0.01,
      `V1: záró = nyitó + bejövetel − törlés (${nyito} + ${be} − ${ki} = ${nyito + be - ki}, mért záró: ${zaro})`,
    )
    assert(nyito > 0, `V2: a dátum nélküli tétel is bekerült a NYITÓ állományba (nyitó: ${nyito})`)
    assert(zaro > 0, 'V2b: a záró egyenleg nem nulla')
  }
}

// V1n (negatív): a vegyes érték-alapú (óvilági) összegzésen az őrszem BUKIK.
{
  const mutans = fs
    .readFileSync(SRC.reporting, 'utf8')
    .replace(
      'openingValue: opening.reduce((sum, item) => sum + getBookValue(item), 0),',
      'openingValue: opening.reduce((sum, item) => sum + calculateInventoryCurrentValue(item, start), 0),',
    )
    .replace(
      'if (!purchaseDate) return isItemActiveOn(item, start)',
      'if (!purchaseDate) return false',
    )
  const modul = betolt({ reportingSrc: mutans })
  const items = [
    tetel(1, { beszerzes_datuma: '2019-01-01', hasznalati_ido: 3 }),
    tetel(5, { beszerzes_datuma: null }),
  ]
  const doc = modul.reporting.buildInventoryPrintDocument({
    type: 'vagyonleltari_jelentes',
    items,
    congregationName: 'Barátosi Református Egyházközség',
    year: EV,
  })
  const szamok = osszesitoSorok(doc.html)
  const megbukna = !szamok || szamok.length !== 4 || Math.abs(szamok[0] + szamok[1] - szamok[2] - szamok[3]) >= 0.01
  assert(megbukna, 'V1n: a vegyes érték-alapú (óvilági) jelentésen az azonosság NEM teljesül — az őrszem BUKNA, tehát nem vak')
}

// ---------------------------------------------------------------------------
// N1–N3 — nyelvválasztás
// ---------------------------------------------------------------------------
{
  const hu = reporting.buildInventoryPrintDocument({
    type: 'leltariv',
    items: [tetel(1)],
    congregationName: 'Barátosi Református Egyházközség',
    congregationNameRo: 'Parohia Reformată Brateș',
    year: EV,
    lang: 'hu',
  })
  const ro = reporting.buildInventoryPrintDocument({
    type: 'leltariv',
    items: [tetel(1)],
    congregationName: 'Barátosi Református Egyházközség',
    congregationNameRo: 'Parohia Reformată Brateș',
    year: EV,
    lang: 'ro',
  })
  assert(/<html lang="hu">/.test(hu.html), 'N1: a magyar nyomtatvány html lang-ja hu')
  assert(/<html lang="ro">/.test(ro.html), 'N1b: a román nyomtatvány html lang-ja ro (eddig MINDIG hu volt)')
  assert(hu.title === 'Leltárív', `N2: magyar cím (${hu.title})`)
  assert(ro.title === 'Lista de inventariere', `N2b: román cím (${ro.title})`)
  // ⚠️ 2026-08-27 (Endre döntése): egy ív VÉGIG EGY nyelven szól — a másik
  // nyelvű felirat nem jelenik meg rajta.
  assert(
    ro.html.includes('Parohia Reformată Brateș') && !ro.html.includes('Barátosi Református Egyházközség'),
    'N3: a román íven CSAK a román név szerepel',
  )
  assert(
    hu.html.includes('Barátosi Református Egyházközség') && !hu.html.includes('Parohia Reformată Brateș'),
    'N3b: a magyar íven CSAK a magyar név szerepel',
  )
  assert(!hu.html.includes('Denumirea bunurilor'), 'N3c: a magyar ív fejléce nem tartalmaz román oszlopnevet')
  assert(!ro.html.includes('Felleltározott tárgyak'), 'N3d: a román ív fejléce nem tartalmaz magyar oszlopnevet')

  // Ha NINCS román név, a magyar áll ott EGYEDÜL (kitalált nevet sosem írunk).
  {
    const roNevNelkul = reporting.buildInventoryPrintDocument({
      type: 'leltariv',
      items: [tetel(1)],
      congregationName: 'Barátosi Református Egyházközség',
      year: EV,
      lang: 'ro',
    })
    assert(
      roNevNelkul.html.includes('Barátosi Református Egyházközség'),
      'N3e: hiányzó román névnél a magyar név áll a román íven (nem kitalált név)',
    )
  }
}

// Mind az öt nyomtatvány mindkét nyelven felépül és lapszámot ad.
{
  const tipusok = ['leltariv', 'registru_inventar', 'aktiv_passziv', 'torolt_targyak', 'vagyonleltari_jelentes']
  const bukott = []
  for (const type of tipusok) {
    for (const lang of ['hu', 'ro']) {
      const doc = reporting.buildInventoryPrintDocument({
        type,
        items: SOK,
        congregationName: 'Barátosi Református Egyházközség',
        year: EV,
        lang,
      })
      const lapok = lapokSzama(doc.html)
      if (!(lapok >= 1) || sheetCount(doc.html) !== lapok || !doc.title) bukott.push(`${type}/${lang}`)
    }
  }
  assert(bukott.length === 0, `N4: mind az 5 nyomtatvány mindkét nyelven ép (bukott: ${bukott.join(', ') || 'nincs'})`)
}

// ---------------------------------------------------------------------------
// T1 — a sormagasság-becslés MINDEN tördelődő oszlopot mér
// ---------------------------------------------------------------------------
{
  const { layout } = betolt()
  const egySoros = layout.becsultSorMagassag([{ szoveg: 'Szék', karakterPerSor: 85 }])
  const ketSoros = layout.becsultSorMagassag([
    { szoveg: 'x'.repeat(120), karakterPerSor: 85 },
    { szoveg: '', karakterPerSor: 11 },
  ])
  assert(ketSoros > egySoros, 'T1: a hosszú MEGNEVEZÉS magasabb sort ad (eddig egysorosnak számolt)')
  const megjegyzesTolMagas = layout.becsultSorMagassag([
    { szoveg: 'Szék', karakterPerSor: 85 },
    { szoveg: 'x'.repeat(60), karakterPerSor: 11 },
  ])
  assert(megjegyzesTolMagas > egySoros, 'T1b: a hosszú MEGJEGYZÉS is magasabb sort ad')

  // A hosszú nevek TÖBB lapot adnak — a régi, egy-oszlopos becslés ugyanannyit.
  const hosszuNevek = Array.from({ length: 120 }, (_, i) =>
    tetel(i + 1, { megnevezes: `DS-2CE17D0T-IT5F(C) Camera exterior FULL HD, IR 80 metri, TurboHD/CVI/AHD/CVBS, Hikvision (${i + 1})` }),
  )
  const hosszuDoc = reporting.buildInventoryPrintDocument({
    type: 'leltariv',
    items: hosszuNevek,
    congregationName: 'Barátosi Református Egyházközség',
    year: EV,
  })
  const rovidDoc = reporting.buildInventoryPrintDocument({
    type: 'leltariv',
    items: SOK,
    congregationName: 'Barátosi Református Egyházközség',
    year: EV,
  })
  assert(
    hosszuDoc.lapszam > rovidDoc.lapszam,
    `T1c: a hosszú megnevezésű lista TÖBB lapra kerül (${hosszuDoc.lapszam} > ${rovidDoc.lapszam}) — a becslés érzékeny a névhosszra`,
  )
}

// T1n (negatív): a CSAK a megjegyzést néző (óvilági) becslésen az őrszem BUKIK.
{
  const mutansLayout = fs
    .readFileSync(SRC.layout, 'utf8')
    .replace(
      'sorok = Math.max(sorok, Math.ceil(hossz / Math.max(1, cella.karakterPerSor)))',
      'sorok = Math.max(sorok, 1)',
    )
  const modul = betolt({ layoutSrc: mutansLayout })
  const hosszuNevek = Array.from({ length: 120 }, (_, i) =>
    tetel(i + 1, { megnevezes: `DS-2CE17D0T-IT5F(C) Camera exterior FULL HD, IR 80 metri, TurboHD/CVI/AHD/CVBS, Hikvision (${i + 1})` }),
  )
  const hosszuDoc = modul.reporting.buildInventoryPrintDocument({
    type: 'leltariv',
    items: hosszuNevek,
    congregationName: 'Barátosi Református Egyházközség',
    year: EV,
  })
  const rovidDoc = modul.reporting.buildInventoryPrintDocument({
    type: 'leltariv',
    items: SOK,
    congregationName: 'Barátosi Református Egyházközség',
    year: EV,
  })
  assert(
    hosszuDoc.lapszam === rovidDoc.lapszam,
    'T1n: a tördelést figyelmen kívül hagyó (óvilági) becslésen a hosszú lista UGYANANNYI lapra kerülne — az őrszem BUKNA, tehát nem vak',
  )
}

// ---------------------------------------------------------------------------
// E1–E3 — a lapok EGYENLETESSÉGE és a rögzített oszlopszélesség
// ---------------------------------------------------------------------------
{
  // Endre éles adatának vegyes mintázata: hosszú termékazonosítók, rövid
  // magyar nevek, és részben tördelődő megjegyzések.
  const vegyes = Array.from({ length: 160 }, (_, i) =>
    tetel(i + 1, {
      megnevezes:
        i % 4 === 0
          ? `KIPSTA Vest diferenere Sporturi deVerde turcoaz universal - 0.048 kg (${i + 1})`
          : i % 4 === 1
            ? `DS-2CE17D0T-IT5F(C) Camera exterior FULL HD, IR 80 metri, TurboHD/CVI/AHD/CVBS, Hikvision (${i + 1})`
            : i % 4 === 2
              ? `SP-RCAT5FTPCCA SP-RCAT5FTPCCA - CABLU FTP CCA CAT5 ROLA 305M (${i + 1})`
              : `Szék ${i + 1}`,
      megjegyzes: i % 3 === 0 ? 'RON értékében' : i % 3 === 1 ? 'Garázs: 6x8 m - RON értékében' : '',
    }),
  )
  const doc = reporting.buildInventoryPrintDocument({
    type: 'leltariv',
    items: vegyes,
    congregationName: 'Barátosi Református Egyházközség',
    year: EV,
  })
  const lapSorok = doc.html
    .split('<div class="page">')
    .slice(1)
    .map(lap => (lap.match(/<tr>/g) || []).length - 1) // a thead sora nem tartalom

  // ⚠️ EZ AZ, AMIT ENDRE LÁTOTT: „az egyik oldalon kevesebb sor látszik mint a
  // másikon, az egyiken van egy nagy üres fehér rész". A KÖZBÜLSŐ lapoknak
  // (az első a nagy fejléc miatt, az utolsó a maradék miatt kivétel) közel
  // azonos sorszámúaknak kell lenniük.
  const kozbulso = lapSorok.slice(1, -1)
  const min = Math.min(...kozbulso)
  const max = Math.max(...kozbulso)
  assert(kozbulso.length >= 2, `E1a: van legalább két közbülső lap (${lapSorok.join('/')})`)
  assert(
    max - min <= 3,
    `E1: a közbülső lapok sorszáma EGYENLETES (min ${min}, max ${max}; lapok: ${lapSorok.join('/')})`,
  )
  assert(
    lapSorok[0] > 0 && lapSorok[lapSorok.length - 1] > 0,
    'E1b: sem az első, sem az utolsó lap nem üres',
  )
}

// E2 — RÖGZÍTETT oszlopszélesség (ez teszi a becslést egyáltalán lehetségessé)
{
  const doc = reporting.buildInventoryPrintDocument({
    type: 'leltariv',
    items: SOK,
    congregationName: 'Barátosi Református Egyházközség',
    year: EV,
  })
  assert(
    /table\s*\{[^}]*table-layout:\s*fixed/.test(doc.html),
    'E2: a táblázat RÖGZÍTETT elrendezésű (az oszlopok minden lapon egy vonalban állnak)',
  )
  assert(/<colgroup>/.test(doc.html) && /<col style="width:/.test(doc.html), 'E2b: az oszlopszélességet <col> elemek adják (a Firefox csak ott veszi figyelembe)')
  const colDb = (doc.html.match(/<col style="width:/g) || []).length
  const lapDb = lapokSzama(doc.html)
  const thDb = (doc.html.match(/<th>/g) || []).length
  assert(colDb === thDb, `E2c: minden oszlophoz tartozik <col> (${colDb} col / ${thDb} th, ${lapDb} lap)`)
  assert(/overflow-wrap:\s*anywhere/.test(doc.html), 'E2d: a hosszú, szóköz nélküli azonosító nem lóg ki a rögzített cellából')

  // Mind az 5 nyomtatvány oszlop-százalékai 100-ra jönnek ki.
  const tipusok = ['leltariv', 'registru_inventar', 'aktiv_passziv', 'torolt_targyak', 'vagyonleltari_jelentes']
  const rosszOsszeg = []
  for (const type of tipusok) {
    const d = reporting.buildInventoryPrintDocument({
      type,
      items: SOK,
      congregationName: 'Barátosi Református Egyházközség',
      year: EV,
    })
    const lapDb2 = (d.html.match(/<div class="page">/g) || []).length || 1
    const oszlopPerLap = ((d.html.match(/<th>/g) || []).length) / lapDb2
    const szazalekok = [...d.html.matchAll(/<col style="width:(\d+(?:\.\d+)?)%/g)]
      .map(m => Number(m[1]))
      .slice(0, oszlopPerLap)
    const osszeg = Math.round(szazalekok.reduce((a, b) => a + b, 0))
    if (osszeg !== 100) rosszOsszeg.push(`${type}: ${osszeg}%`)
  }
  assert(rosszOsszeg.length === 0, `E2e: minden nyomtatvány oszlopai 100%-ot adnak ki (${rosszOsszeg.join(', ') || 'rendben'})`)
}

// E2n (negatív): a RÖGZÍTETT elrendezés nélküli (óvilági) dokumentumon az őrszem BUKIK.
{
  const mutansLayout = fs.readFileSync(SRC.layout, 'utf8').replace('table-layout: fixed; ', '')
  const modul = betolt({ layoutSrc: mutansLayout })
  const doc = modul.reporting.buildInventoryPrintDocument({
    type: 'leltariv',
    items: SOK,
    congregationName: 'Barátosi Református Egyházközség',
    year: EV,
  })
  // ⚠️ A SZABÁLYT nézzük, nem a szöveget: a stíluslap KOMMENTJE is tartalmazza
  // a „table-layout: fixed" kifejezést, tehát a puszta szöveg-keresés vak lenne.
  const szabaly = /table\s*\{[^}]*table-layout:\s*fixed/
  assert(szabaly.test(fs.readFileSync(SRC.layout, 'utf8')), 'E2n-elo: az ÉLES stíluslapban ott a szabály')
  assert(
    !szabaly.test(doc.html),
    'E2n: a rögzített elrendezés nélküli (óvilági) dokumentumon az őrszem BUKNA — nem vak',
  )
}

// E3 — a karakter/sor becslés a RÖGZÍTETT szélességből jön, nem kézi számból
{
  const { layout } = betolt()
  const szeles = layout.karakterPerSor('landscape', 26)
  const keskeny = layout.karakterPerSor('landscape', 10)
  assert(szeles > keskeny, `E3: a szélesebb oszlopba több karakter fér (${szeles} > ${keskeny})`)
  assert(szeles > 30 && szeles < 80, `E3b: a 26%-os oszlop becslése hihető tartományban van (${szeles} karakter/sor)`)
  const allo = layout.karakterPerSor('portrait', 26)
  assert(allo < szeles, `E3c: álló lapon ugyanaz a százalék KEVESEBB karaktert jelent (${allo} < ${szeles})`)
}

// ---------------------------------------------------------------------------
// G1–G3 — forrás-őrök
// ---------------------------------------------------------------------------
{
  const layoutSrc = stripComments(fs.readFileSync(SRC.layout, 'utf8'))
  assert(!/counter\(page/.test(layoutSrc), 'G1: a stíluslapban nincs CSS-oldalszámláló')
  assert(/data-sheet-count="\$\{lapszam\}"/.test(layoutSrc), 'G1b: a dokumentum a VALÓDI lapszámot hordozza')
  const mutans = layoutSrc.replace(/data-sheet-count="\$\{lapszam\}"/g, '')
  assert(!/data-sheet-count="\$\{lapszam\}"/.test(mutans), 'G1n: lapszám-jelzés nélküli mutánson az őrszem BUKNA')
}

{
  const engineSrc = stripComments(fs.readFileSync(SRC.engine, 'utf8'))
  assert(
    /orientation: 'portrait' \| 'landscape' = 'portrait'/.test(engineSrc),
    'G2: a laponkénti PDF-render TÁJOLÁS-TUDATOS (a fekvő ívek is védve a GPU-plafontól)',
  )
  assert(
    /pdf\.addImage\(img, 'JPEG', 0, 0, lapSzelesseg, lapMagassag\)/.test(engineSrc),
    'G2b: a lap méretét a tájolás adja, nem fix 210×297',
  )
  const mutans = engineSrc.replace(/lapSzelesseg, lapMagassag/g, '210, 297')
  assert(!/lapSzelesseg, lapMagassag/.test(mutans), 'G2n: a fix méretű (óvilági) motoron az őrszem BUKNA')
}

{
  const previewSrc = stripComments(fs.readFileSync(SRC.preview, 'utf8'))
  assert(/\{aktualisOldal\} \/ \{osszesLap\} oldal/.test(previewSrc), 'G3: az előnézet KIÍRJA az oldalszámot')
  assert(/transformOrigin: 'top left'/.test(previewSrc), 'G3b: a kicsinyítés a bal felső sarokból megy (nem középről)')
  assert(/width: lap\.w \* scale, height: lap\.h \* scale/.test(previewSrc), 'G3c: a burkoló doboz a SKÁLÁZOTT méretet kapja (a transform a layoutot nem változtatja)')
  assert(/sandbox=""/.test(previewSrc), 'G3d: az előnézeti iframe homokozóban fut')

  const dialogSrc = stripComments(fs.readFileSync(SRC.dialog, 'utf8'))
  assert(/PRINT_LANG_LABEL\[l\]/.test(dialogSrc), 'G3e: a nyomtatási központban van NYELVVÁLASZTÓ')
  assert(!/paperSize/.test(dialogSrc), 'G3f: a halott „Lapméret" legördülő eltűnt')
  assert(
    /showCloseButton=\{false\}/.test(dialogSrc) && /DialogClose/.test(dialogSrc),
    'G3h: a nyomtatási központ fejlécében SAJÁT bezáró X van (a beépítettet a ragadós fejléc eltakarta)',
  )
  const layoutSrc2 = stripComments(fs.readFileSync(SRC.layout, 'utf8'))
  assert(!/ketNyelvu/.test(layoutSrc2), 'G3i: nincs többé vegyes nyelvű felirat-építő (egy ív = egy nyelv)')
  assert(/lapszam=\{report\.lapszam\}/.test(dialogSrc), 'G3g: az előnézet a VALÓDI lapszámot kapja')
}

console.log(`\n${total - failedCount}/${total} teszt zöld`)
process.exit(failedCount > 0 ? 1 : 0)
