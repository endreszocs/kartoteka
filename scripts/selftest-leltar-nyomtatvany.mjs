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
  assert(
    ro.html.indexOf('Parohia Reformată Brateș') < ro.html.indexOf('Barátosi Református Egyházközség'),
    'N3: román íven a ROMÁN név áll elöl',
  )
  assert(
    hu.html.indexOf('Barátosi Református Egyházközség') < hu.html.indexOf('Parohia Reformată Brateș'),
    'N3b: magyar íven a MAGYAR név áll elöl',
  )
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
  assert(/lapszam=\{report\.lapszam\}/.test(dialogSrc), 'G3g: az előnézet a VALÓDI lapszámot kapja')
}

console.log(`\n${total - failedCount}/${total} teszt zöld`)
process.exit(failedCount > 0 ? 1 : 0)
