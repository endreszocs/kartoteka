// selftest-leltar343.mjs — a Leltar 3_43 import/export kör őrszemei (2026-08-26)
//
// ⛔ MI VOLT A HIBA (Endre élesben találta)
//   A leltár „Rendszergazdai importáló" fülén SOHA nem jelent meg az
//   importálás gomb: a leltar/page.tsx csak a dekoratív `profiles`-t adta át,
//   `importProfiles` + `importModule` nélkül — a ModuleAdminImportTabV2
//   `hasProcessor` kapcsolója így hamis volt, és a MultiSheetImport (benne a
//   gomb) ki sem renderelődött. Emellett a hivatalos Leltar 3_43 munkafüzetnek
//   se importja, se kitöltött exportja nem volt.
//
// ŐRSZEMEK
//   S1–S5   leltar343-shared: dátum-összerakás, helyszín-felelős szét/össze,
//           főcsoport-felismerés, sor-feldolgozás (negatív sorok!), export-sorok
//   S3n     negatív: egységár-mutánson (L/M → L) az őrszem BUKIK
//   X1–X5   leltar343-xml: cella-injektálás, sor-határ (r=5 vs r=55!),
//           fullCalcOnLoad, Cimlap-folt, escape
//   X2n     negatív: sor-határ-mutánson (naiv indexOf) az őrszem BUKIK
//   G1–G3   forrás-őrök (komment-lehántással): a page.tsx bekötése, a
//           hasProcessor kontraktus, a sablon-fájl jelenléte
//   G1n     negatív: a RÉGI (bekötetlen) page.tsx-mutánson az őrszem BUKIK
//   T1      értékhatár-idővonal (1800 → 2500 → OUG 8/2026: 5000)

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

const SHARED_SRC = path.join(ROOT, 'apps/web/lib/inventory/leltar343-shared.ts')
const XML_SRC = path.join(ROOT, 'apps/web/lib/inventory/leltar343-xml.ts')
const THRESHOLD_SRC = path.join(ROOT, 'packages/ui-app/src/inventory/threshold.ts')
const FINANCE_INV_SRC = path.join(ROOT, 'packages/ui-app/src/finance/inventory.ts')
const PAGE_SRC = path.join(ROOT, 'apps/web/app/(dashboard)/leltar/page.tsx')
const TAB_SRC = path.join(ROOT, 'apps/web/components/shared/module-admin-import-tab-v2.tsx')
const SABLON = path.join(ROOT, 'apps/web/public/leltar343/Leltar-3_43-sablon.xlsx')

const t = (src) =>
  ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText

/** Komment-lehántás a forrás-őrökhöz (a kommentben álló szöveg nem bizonyíték). */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-leltar343-'))
process.on('exit', () => {
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* takarítás */ }
})

/** A shared modul betöltése ADOTT forrásszöveggel (mutánsokhoz is). */
let sharedCounter = 0
function betoltShared(forras) {
  sharedCounter += 1
  const financeCjs = path.join(tmp, `finance-inv-${sharedCounter}.cjs`)
  fs.writeFileSync(financeCjs, t(fs.readFileSync(FINANCE_INV_SRC, 'utf8')))
  const sharedCjs = path.join(tmp, `shared-${sharedCounter}.cjs`)
  fs.writeFileSync(
    sharedCjs,
    t(forras).replace(
      /require\(["']@kartoteka\/ui-app["']\)/g,
      `require(${JSON.stringify(financeCjs)})`,
    ),
  )
  return require_(sharedCjs)
}

let xmlCounter = 0
function betoltXml(forras) {
  xmlCounter += 1
  const cjs = path.join(tmp, `xml-${xmlCounter}.cjs`)
  fs.writeFileSync(cjs, t(forras))
  return require_(cjs)
}

const shared = betoltShared(fs.readFileSync(SHARED_SRC, 'utf8'))
const xml = betoltXml(fs.readFileSync(XML_SRC, 'utf8'))

// ── S1: dátum-összerakás a Súgó alapértelmezéseivel ──────────────────────────
assert(shared.osszerakDatum(2020, null, null) === '2020-01-01', 'S1a: hiányzó hó/nap → január 1. (Súgó-alapértelmezés)')
assert(shared.osszerakDatum(2020, 2, 30) === '2020-02-29', 'S1b: hónapon túllógó nap → a hónap utolsó napja (szökőév!)')
assert(shared.osszerakDatum(null, 5, 5) === null, 'S1c: hiányzó év → null (a Hibak-lap is hibának tekinti)')
assert(shared.osszerakDatum(12, 1, 1) === null, 'S1d: értelmetlen év (12) → null')
const szet = shared.szetszedDatum('2019-12-31')
assert(szet && szet.ev === 2019 && szet.ho === 12 && szet.nap === 31, 'S1e: ISO → év/hó/nap szétszedés')

// ── S2: „Helyszín - Felelős" szét/össze ──────────────────────────────────────
assert(shared.joinHelyszinFelelos('Templom', 'Kis Pál') === 'Templom - Kis Pál', 'S2a: összefűzés a Cimlap-képlet alakjában')
assert(shared.joinHelyszinFelelos(null, null, 'Nagy Lelkész') === '-  - Nagy Lelkész', 'S2b: üres helyszín → "- ", felelős-fallback az intézményvezető')
const sp1 = shared.splitHelyszinFelelos('Templom - Kis Pál')
assert(sp1.helyszin === 'Templom' && sp1.felelos === 'Kis Pál', 'S2c: szétvágás az utolsó elválasztónál')
const sp2 = shared.splitHelyszinFelelos('Gyüli terem - iroda - Kis Pál')
assert(sp2.helyszin === 'Gyüli terem - iroda' && sp2.felelos === 'Kis Pál', 'S2d: elválasztót tartalmazó helyszín is jól válik szét')
const katalogus = new Map([['Templom - Kis Pál', { helyszin: 'Templom', felelos: 'Kis Pál' }]])
const sp3 = shared.splitHelyszinFelelos('Templom - Kis Pál', katalogus)
assert(sp3.helyszin === 'Templom' && sp3.felelos === 'Kis Pál', 'S2e: Cimlap-katalógus pontos találata az elsődleges')

// ── S3: sor-feldolgozás (a Súgó szabályai) ───────────────────────────────────
const csekelyLap = shared.LELTAR343_KATEGORIA_LAPOK.find((l) => l.category === 'csekely')
const alapLap = shared.LELTAR343_KATEGORIA_LAPOK.find((l) => l.category === 'alapeszkoz')
const konyvLap = shared.LELTAR343_KATEGORIA_LAPOK.find((l) => l.category === 'konyv')

function nyersSor(felul) {
  return {
    sor: 5, eOszlop: null, fOszlop: null, helyszinFelelos: null, leltariSzam: null,
    ev: null, ho: null, nap: null, ertek: null, mennyiseg: null, mertekegyseg: null,
    beszerzesiIrat: null, torlesEv: null, torlesHo: null, torlesNap: null,
    torlesSzoveg: null, hasznalatiIdo: null, tipusNev: null, ...felul,
  }
}

// S3a: alap-sor — L a SOR teljes értéke, az egységár L/M.
const e1 = shared.feldolgozLeltar343Lap({
  lap: csekelyLap,
  sorok: [nyersSor({ eOszlop: 'Szék', leltariSzam: 'CS-001', ev: 2020, ertek: 1000, mennyiseg: 2 })],
})
assert(e1.rekordok.length === 1 && e1.rekordok[0].beszerzesi_ertek === 500, 'S3a: egységár = L / mennyiség (1000/2 = 500)')
assert(e1.rekordok[0].mertekegyseg === 'db' && e1.rekordok[0].beszerzes_datuma === '2020-01-01', 'S3b: mértékegység/dátum alapértelmezések')

// S3c: részleges kivezetés (negatív sor) → mennyiség csökken, a sor aktív marad.
const e2 = shared.feldolgozLeltar343Lap({
  lap: csekelyLap,
  sorok: [
    nyersSor({ sor: 5, eOszlop: 'Szék', leltariSzam: 'CS-001', ev: 2020, ertek: 1000, mennyiseg: 10 }),
    nyersSor({ sor: 6, eOszlop: 'Szék', leltariSzam: 'CS-001', ertek: -300, mennyiseg: -3, torlesEv: 2024, torlesSzoveg: 'Hat. 5/2024' }),
  ],
})
assert(e2.rekordok.length === 1 && e2.rekordok[0].mennyiseg === 7 && !e2.rekordok[0].is_deleted, 'S3c: részleges kivezetés → 10-3=7 db, a tétel aktív')
assert((e2.rekordok[0].megjegyzes || '').includes('Részleges kivezetés'), 'S3d: a részleges kivezetés a megjegyzésbe kerül (dátum+irat)')

// S3e: teljes kivezetés (a teljes mennyiség negatívban) → törlés-mezők.
const e3 = shared.feldolgozLeltar343Lap({
  lap: csekelyLap,
  sorok: [
    nyersSor({ sor: 5, eOszlop: 'Pad', leltariSzam: 'CS-002', ev: 2018, ertek: 400, mennyiseg: 2 }),
    nyersSor({ sor: 6, eOszlop: 'Pad', leltariSzam: 'CS-002', ertek: -400, mennyiseg: -2, torlesEv: 2025, torlesHo: 3, torlesSzoveg: 'Selejtezés' }),
  ],
})
assert(e3.rekordok[0].is_deleted && e3.rekordok[0].torles_datuma === '2025-03-01', 'S3e: teljes kivezetés → is_deleted + törlés-dátum a negatív sorból')

// S3f: alapeszköz ±sor = le-/felértékelés (NEM kivezetés).
const e4 = shared.feldolgozLeltar343Lap({
  lap: alapLap,
  sorok: [
    nyersSor({ sor: 5, eOszlop: 'Orgona', leltariSzam: 'AE-001', ev: 2010, ertek: 20000, mennyiseg: 1, hasznalatiIdo: 50, tipusNev: 'Épületek' }),
    nyersSor({ sor: 6, eOszlop: 'Orgona', leltariSzam: 'AE-001', ev: 2024, ertek: -5000, mennyiseg: 1 }),
  ],
})
assert(e4.rekordok.length === 1 && e4.rekordok[0].ertek_modositas === -5000 && !e4.rekordok[0].is_deleted, 'S3f: alapeszköz negatív sora → ertek_modositas (-5000), a tétel aktív')
assert(e4.rekordok[0].alapeszkoz_csoport === 1, 'S3g: „Épületek" típus → 1. főcsoport')

// S3h: pozitív duplikátum (nem alapeszköz) → hangos hiba.
const e5 = shared.feldolgozLeltar343Lap({
  lap: csekelyLap,
  sorok: [
    nyersSor({ sor: 5, eOszlop: 'Asztal', leltariSzam: 'CS-003', ev: 2020, ertek: 100 }),
    nyersSor({ sor: 6, eOszlop: 'Asztal', leltariSzam: 'CS-003', ev: 2021, ertek: 100 }),
  ],
})
assert(e5.rekordok.length === 1 && e5.hibak.some((h) => h.uzenet.includes('Duplikált')), 'S3h: pozitív duplikátum → a sor hibával kimarad')

// S3i: Könyvek lapon E=Szerző, F=Cím.
const e6 = shared.feldolgozLeltar343Lap({
  lap: konyvLap,
  sorok: [nyersSor({ eOszlop: 'Ravasz László', fOszlop: 'Kis dogmatika', leltariSzam: 'K-001', ev: 1990, ertek: 50 })],
})
assert(e6.rekordok[0].megnevezes === 'Kis dogmatika' && e6.rekordok[0].szerzo === 'Ravasz László', 'S3i: Könyvek — a cím a megnevezés, a szerző külön mező')

// S3n (negatív): az egységár-mutáns (L/M helyett L) BUKJON az S3a őrszemen.
{
  const src = fs.readFileSync(SHARED_SRC, 'utf8')
  const mutans = src.replace('kerekit2(teljesErtek / mennyiseg)', 'kerekit2(teljesErtek)')
  if (mutans === src) {
    assert(false, 'S3n: az egységár-mutáns nem állítható elő (a forrás változott?)')
  } else {
    const mShared = betoltShared(mutans)
    const me = mShared.feldolgozLeltar343Lap({
      lap: mShared.LELTAR343_KATEGORIA_LAPOK.find((l) => l.category === 'csekely'),
      sorok: [nyersSor({ eOszlop: 'Szék', leltariSzam: 'CS-001', ev: 2020, ertek: 1000, mennyiseg: 2 })],
    })
    assert(me.rekordok[0].beszerzesi_ertek !== 500, 'S3n: a mutánson az egységár-őrszem BUKIK (a teszt nem vak)')
  }
}

// ── S4: export-sorok ─────────────────────────────────────────────────────────
function tetel(felul) {
  return {
    id: 'x', leltari_szam: 'CS-001', regi_leltari_szam: null, megnevezes: 'Szék',
    kategoria: 'Csekély értékű', kategoria_key: 'csekely', beszerzes_erteke: 500,
    beszerzes_datuma: '2020-03-15', beszerzes_bizonylat: 'Számla 12', katalogus_kod: null,
    hasznalati_ido: null, helyszin: 'Templom', felelos_szemely_id: null, felelos_nev: 'Kis Pál',
    vonalkod: null, megjegyzes: null, mennyiseg: 2, mertekegyseg: 'db', torles_datuma: null,
    torles_bizonylat: null, torles_indoklasa: null, penzugy_xkey: null, szerzo: null,
    konyv_isbn: null, konyv_kiado: null, konyv_kiadas_helye: null, konyv_kiadas_eve: null,
    konyv_terjedelem: null, konyv_sorozatcim: null, created_at: null, deleted: false,
    ertek_modositas: 0, ertek_modositas_megjegyzes: null, alapeszkoz_csoport: null, ...felul,
  }
}
const exp1 = shared.epitLeltar343ExportSorok({ lap: csekelyLap, items: [tetel({})] })
const exp1Cellak = Object.fromEntries(exp1.sorok[0].cellak.map((c) => [c.col, c.v]))
assert(exp1.sorok[0].r === 5 && exp1Cellak.L === 1000 && exp1Cellak.M === 2, 'S4a: export L = egységár×mennyiség (500×2=1000), az 5. sortól')
assert(exp1Cellak.G === 'Templom - Kis Pál' && exp1Cellak.I === 2020 && exp1Cellak.K === 15, 'S4b: G-összefűzés + év/hó/nap szétszedés')

const exp2 = shared.epitLeltar343ExportSorok({
  lap: csekelyLap,
  items: [
    tetel({ id: 'a', leltari_szam: 'CS-001' }),
    tetel({ id: 'b', leltari_szam: 'CS-002', deleted: true, torles_datuma: '2025-03-01', torles_bizonylat: 'Hat. 5/2025', torles_indoklasa: 'selejt' }),
    tetel({ id: 'c', leltari_szam: 'CS-003', deleted: true, torles_datuma: null }),
  ],
})
assert(exp2.sorok.length === 2, 'S4c: a kivezetett tétel exportálódik, a Kukába dobott (törlés-adat nélküli) NEM')
const torolt = Object.fromEntries(exp2.sorok[1].cellak.map((c) => [c.col, c.v]))
assert(torolt.P === 2025 && torolt.Q === 3 && String(torolt.S).includes('Hat. 5/2025'), 'S4d: kivezetett tétel → P/Q/R/S oszlopok')

const konyvExp = shared.epitLeltar343ExportSorok({
  lap: konyvLap,
  items: [tetel({ kategoria_key: 'konyv', megnevezes: 'Kis dogmatika', szerzo: 'Ravasz László', leltari_szam: 'K-001' })],
})
const konyvCellak = Object.fromEntries(konyvExp.sorok[0].cellak.map((c) => [c.col, c.v]))
assert(konyvCellak.E === 'Ravasz László' && konyvCellak.F === 'Kis dogmatika', 'S4e: Könyvek export — E=Szerző, F=Cím')

const alapExp = shared.epitLeltar343ExportSorok({
  lap: alapLap,
  items: [tetel({ kategoria_key: 'alapeszkoz', leltari_szam: 'AE-001', hasznalati_ido: 50, alapeszkoz_csoport: 2, ertek_modositas: -5000, ertek_modositas_megjegyzes: 'vihar-kár' })],
})
const alapCellak = Object.fromEntries(alapExp.sorok[0].cellak.map((c) => [c.col, c.v]))
assert(alapCellak.T === 50 && alapCellak.U === 'Tehnikai és szállítóeszközök, állatok, ültetvények', 'S4f: T=használati idő, U=a munkafüzet SAJÁT csoport-szövege (betűre)')
assert(String(alapCellak.F).includes('Értékmódosítás: -5000 lej'), 'S4g: az értékmódosítás a Megjegyzés oszlopba kerül (nem ±sorba)')

// ── S5: Cimlap-párok ─────────────────────────────────────────────────────────
const parok = shared.epitHelyszinFelelosParok([
  tetel({}), tetel({ id: 'b2' }),
  tetel({ id: 'c2', helyszin: 'Iroda', felelos_nev: null }),
  tetel({ id: 'd2', deleted: true, helyszin: 'Padlás', torles_datuma: '2025-01-01' }),
])
assert(parok.length === 2 && parok[0].helyszin === 'Templom' && parok[1].helyszin === 'Iroda', 'S5: helyszín/felelős párok — egyediek, csak aktív tételekből')

// ── X1–X5: XML-foltozó ───────────────────────────────────────────────────────
const MINTA_LAP =
  '<worksheet><sheetData>' +
  '<row r="4" spans="4:26"><c r="D4" s="1"/></row>' +
  '<row r="5" spans="4:26"><c r="D5" s="141"><v>1</v></c><c r="E5" s="136"/><c r="G5" s="137"/><c r="L5" s="140"/></row>' +
  '<row r="6" spans="4:26"><c r="D6" s="141"><v>2</v></c><c r="E6" s="136"/><c r="L6" s="140"/></row>' +
  '<row r="55" spans="4:26"><c r="D55" s="141"><v>51</v></c><c r="E55" s="136"/></row>' +
  '</sheetData></worksheet>'

const x1 = xml.injektalSorok(MINTA_LAP, [
  { r: 5, cellak: [{ col: 'E', v: 'Szék & Pad' }, { col: 'L', v: 1000 }] },
])
assert(x1.xml.includes('<c r="E5" s="136" t="inlineStr"><is><t xml:space="preserve">Szék &amp; Pad</t></is></c>'), 'X1a: szöveg-cella inline stringgel, az EREDETI stílussal, escape-elve')
assert(x1.xml.includes('<c r="L5" s="140"><v>1000</v></c>'), 'X1b: szám-cella a sablon-stílussal')
assert(x1.xml.includes('<c r="D5" s="141"><v>1</v></c>'), 'X1c: a sorszám-cella (D) érintetlen marad')

// X2: sor-határ — az r=5 folt NEM nyúlhat az r=55 sorba.
const x2 = xml.injektalSorok(MINTA_LAP, [{ r: 5, cellak: [{ col: 'E', v: 'Próba' }] }])
const sor55 = x2.xml.match(/<row r="55".*?<\/row>/s)
assert(sor55 && !sor55[0].includes('Próba') && sor55[0].includes('<c r="E55" s="136"/>'), 'X2: a „<row r=5" keresés nem találja el a „<row r=55" sort (határ-ellenőrzés)')

// X2n (negatív): a sor-keresés KÉT rétegben határ-biztos — (1) a keresőminta
// a záró idézőjelet is tartalmazza (`<row r="5"` sosem illeszkedik a
// `<row r="55"`-re), (2) a while-ciklus külön határ-ellenőrzést is tesz.
// Az óvilági „naiv indexOf" a KETTŐS mutáns: idézőjel-lehagyás + határőr
// kiirtása — azon a fordított sorrendű lapon az őrszem BUKIK. Az egyszeres
// (csak idézőjel-lehagyó) mutánst a határőr MEGMENTI — ez bizonyítja, hogy a
// második réteg tényleg teherhordó, nem díszlet.
{
  const src = fs.readFileSync(XML_SRC, 'utf8')
  const NYITO = 'const nyito = `<row r="${r}"`'
  const HATAR = "if (utana === ' ' || utana === '>' || utana === '/') break"
  if (!src.includes(NYITO) || !src.includes(HATAR)) {
    assert(false, 'X2n: a keresőminta/határőr sora nem található (a forrás változott?)')
  } else {
    const FORDITOTT_LAP =
      '<worksheet><sheetData>' +
      '<row r="55" spans="4:26"><c r="E55" s="136"/></row>' +
      '<row r="5" spans="4:26"><c r="E5" s="136"/></row>' +
      '</sheetData></worksheet>'
    const folt = [{ r: 5, cellak: [{ col: 'E', v: 'Próba' }] }]
    const sor55Kapta = (kimenet) => {
      const m = kimenet.match(/<row r="55".*?<\/row>/s)
      return Boolean(m && m[0].includes('Próba'))
    }
    const jo = xml.injektalSorok(FORDITOTT_LAP, folt)
    assert(!sor55Kapta(jo.xml) && /<row r="5" [^>]*>.*Próba/s.test(jo.xml), 'X2n-a: a VALÓDI modul a helyes (r=5) sort foltozza, az 55-ös érintetlen')

    const felMutans = betoltXml(src.replace(NYITO, 'const nyito = `<row r="${r}`'))
    const fel = felMutans.injektalSorok(FORDITOTT_LAP, folt)
    assert(!sor55Kapta(fel.xml), 'X2n-b: a lazított keresőmintát a határőr MEGMENTI (a 2. réteg teherhordó)')

    const teljesMutans = betoltXml(
      src.replace(NYITO, 'const nyito = `<row r="${r}`').replace(HATAR, 'break'),
    )
    const rossz = teljesMutans.injektalSorok(FORDITOTT_LAP, folt)
    assert(sor55Kapta(rossz.xml), 'X2n-c: a naiv-indexOf (kettős) mutáns az 55-ös sorba foltoz — az őrszem nem vak')
  }
}

// X3: a sablon sorain túli tétel szintetizált sorként a </sheetData> elé kerül.
const x3 = xml.injektalSorok(MINTA_LAP, [{ r: 100, cellak: [{ col: 'E', v: 'Túlcsordulás' }] }])
assert(x3.szintetizalt === 1 && /<row r="100" spans="4:26">.*<\/row><\/sheetData>/s.test(x3.xml), 'X3: kapacitáson túli sor szintetizálva, a sheetData végén')

// X4: fullCalcOnLoad — a származtatott lapok újraszámolása.
const wb = '<workbook><calcPr calcId="145621"/></workbook>'
const wb2 = xml.bekapcsolFullCalc(wb)
assert(wb2.includes('<calcPr fullCalcOnLoad="1" calcId="145621"/>'), 'X4a: calcPr → fullCalcOnLoad="1"')
assert(xml.bekapcsolFullCalc(wb2) === wb2, 'X4b: idempotens (kétszeri hívás nem duplikál)')

// X5: Cimlap-folt (A2/A4/A6 + B8/C8).
const CIMLAP =
  '<worksheet><sheetData>' +
  '<row r="2"><c r="A2" s="176"/></row>' +
  '<row r="4"><c r="A4" s="176"/></row>' +
  '<row r="6"><c r="A6" s="176"/></row>' +
  '<row r="8"><c r="A8" s="132"><v>1</v></c><c r="B8" s="133"/><c r="C8" s="133"/></row>' +
  '</sheetData></worksheet>'
const cim = xml.foltozCimlap(CIMLAP, {
  egyhazmegye: 'Kézdi-Orbai Református Egyházmegye',
  intezmeny: 'Teszt Egyházközség',
  vezeto: 'Nagy Lelkész',
  parok: [{ helyszin: 'Templom', felelos: 'Kis Pál' }],
})
assert(cim.includes('Kézdi-Orbai') && cim.includes('<c r="A4" s="176" t="inlineStr">'), 'X5a: A2/A4 fej-adatok a meglévő stílussal')
assert(cim.includes('<c r="B8" s="133" t="inlineStr"><is><t xml:space="preserve">Templom</t></is></c>'), 'X5b: helyszín/felelős pár a B8/C8 cellákba')

// ── G1–G3: forrás-őrök ───────────────────────────────────────────────────────
const pageSrc = stripComments(fs.readFileSync(PAGE_SRC, 'utf8'))
assert(
  pageSrc.includes('importProfiles={INVENTORY_PROFILES}') && pageSrc.includes('importModule="inventory"'),
  'G1: a leltar/page.tsx a VALÓDI feldolgozót köti be (importProfiles + importModule)',
)
assert(pageSrc.includes('Leltar343ImportCard'), 'G1b: a dedikált Leltar 3_43 import-kártya a helyén van')

// G1n (negatív): a RÉGI (bekötetlen) világ mutánsán az őrszem BUKIK.
{
  const mutans = pageSrc
    .replace('importProfiles={INVENTORY_PROFILES}', '')
    .replace('importModule="inventory"', '')
  const megbukna = !(
    mutans.includes('importProfiles={INVENTORY_PROFILES}') && mutans.includes('importModule="inventory"')
  )
  assert(megbukna, 'G1n: a bekötés nélküli (régi) page.tsx-en az őrszem BUKNA — nem vak')
}

const tabSrc = stripComments(fs.readFileSync(TAB_SRC, 'utf8'))
assert(/hasProcessor\s*=\s*!!\(\s*importProfiles\s*&&\s*importModule\s*\)/.test(tabSrc), 'G2: a hasProcessor kontraktus változatlan (a gomb ettől függ)')

// G3: a bájthű sablon a public alatt van (zip-fejléccel).
{
  let ok = false
  try {
    const fd = fs.openSync(SABLON, 'r')
    const fej = Buffer.alloc(4)
    fs.readSync(fd, fej, 0, 4, 0)
    fs.closeSync(fd)
    const meret = fs.statSync(SABLON).size
    ok = fej[0] === 0x50 && fej[1] === 0x4b && meret > 4_000_000
  } catch { ok = false }
  assert(ok, 'G3: a Leltar-3_43-sablon.xlsx a public/leltar343 alatt van (PK-fejléc, >4 MB)')
}

// ── G4: a parser adat-terület plafonja (a Csekely tükör-régió csapdája) ─────
// A Csekely lap 3005. sorától belső tükör-segédterület él — a lapméretig
// olvasó parser azt adatnak nézte (2776 hamis hiba). A plafon a lap
// kapacitásából jön; e nélkül a hibaosztály visszatérne.
{
  const parseSrc = stripComments(
    fs.readFileSync(path.join(ROOT, 'apps/web/lib/inventory/leltar343-parse.ts'), 'utf8'),
  )
  assert(/4\s*\+\s*lap\.kapacitas/.test(parseSrc), 'G4: a beolvasás plafonja a lap adat-területe (4 + kapacitás)')
  const mutans = parseSrc.replace(/4\s*\+\s*lap\.kapacitas/g, 'Number.MAX_SAFE_INTEGER')
  assert(!/4\s*\+\s*lap\.kapacitas/.test(mutans), 'G4n: a plafon nélküli (óvilági) parseren az őrszem BUKNA — nem vak')
  assert(shared.LELTAR343_KATEGORIA_LAPOK.find((l) => l.category === 'alapeszkoz').kapacitas === 496, 'G4b: az Alapeszkozok lapon 496 előre létrehozott tételsor van (mérve)')
}

// ── T1: értékhatár-idővonal (OUG 8/2026) ─────────────────────────────────────
{
  const cjs = path.join(tmp, 'threshold.cjs')
  fs.writeFileSync(cjs, t(fs.readFileSync(THRESHOLD_SRC, 'utf8')))
  const th = require_(cjs)
  assert(th.getAlapeszkozErtekhatar('2013-06-30').osszegLej === 1800, 'T1a: 2013-06-30-ig 1800 lej')
  assert(th.getAlapeszkozErtekhatar('2013-07-01').osszegLej === 2500, 'T1b: 2013-07-01-től 2500 lej (HG 276/2013)')
  assert(th.getAlapeszkozErtekhatar('2026-02-24').osszegLej === 2500, 'T1c: 2026-02-24-én még 2500 lej')
  assert(th.getAlapeszkozErtekhatar('2026-02-25').osszegLej === 5000, 'T1d: 2026-02-25-től 5000 lej (OUG 8/2026)')
  const uzenet = th.alapeszkozKuszobFigyelmeztetes({ kategoria: 'alapeszkoz', egysegAr: 900, beszerzesDatuma: '2026-03-01' })
  assert(typeof uzenet === 'string' && uzenet.includes('5'), 'T1e: küszöb alatti alapeszköz → figyelmeztetés (nem tiltás)')
}

console.log(`\n${total - failedCount}/${total} teszt zöld`)
process.exit(failedCount > 0 ? 1 : 0)
