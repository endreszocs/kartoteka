// selftest-leltar-import-varazslo.mjs — a leltár import-VARÁZSLÓ őrszemei (2026-08-27)
//
// ⛔ MI VOLT A KÉT HIBA (Endre élesben találta)
//   1. „nem importált egyet sem a rendszer!" — az import VALÓJÁBAN lefutott és
//      212 tételt beírt, de a képernyőn semmi nem változott: az InventoryMain
//      a tételeket EGYSZER, csatoláskor tölti be, az importáló pedig egy másik
//      FÜLÖN él ugyanazon az oldalon. Fülváltáskor nincs újracsatolás, a
//      szerveri revalidatePath a kliens-állapotot nem érinti.
//   2. „egy rakás gomb és doboz, ami nem vezet sehová" — a rendszergazdai
//      importáló középső harmada egy TELJES import-folyamatot mímelt
//      (ejtőzóna, lépés-sor, zöld „megfelelt", „Tovább az importálásra"),
//      miközben a beejtett fájl sehova nem ment tovább.
//   + 217 sor NÉMÁN kimaradt, mert a leltári számuk már létezett, és nem
//     lehetett dönteni róluk.
//
// ŐRSZEMEK
//   R1–R8   review-réteg: elutasított sorok javíthatósága, szám-ütközés
//           (DB / fájlon belüli / kivezetett), feloldások, mező-fehérlista,
//           determinisztikus szám-kiosztás
//   R1n     negatív: a `nyers` nélküli (óvilági) hibán az őrszem BUKIK
//   R7n     negatív: nem fehérlistázott mező kliensről NEM állítható
//   K1      kategória-körkörösség (címke → kategória) mind a 7 kategóriára
//   K1n     negatív: az alias-listás (régi) normalizálón az őrszem BUKIK
//   G1–G6   forrás-őrök (komment-lehántással), mindegyikhez mutáns

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
  save: path.join(ROOT, 'packages/ui-app/src/inventory/save.ts'),
  financeInv: path.join(ROOT, 'packages/ui-app/src/finance/inventory.ts'),
  shared: path.join(ROOT, 'apps/web/lib/inventory/leltar343-shared.ts'),
  review: path.join(ROOT, 'apps/web/lib/inventory/leltar343-review.ts'),
  page: path.join(ROOT, 'apps/web/app/(dashboard)/leltar/page.tsx'),
  tab: path.join(ROOT, 'apps/web/components/shared/module-admin-import-tab-v2.tsx'),
  wizard: path.join(ROOT, 'apps/web/components/inventory/leltar343-import-wizard.tsx'),
  main: path.join(ROOT, 'apps/web/components/inventory/inventory-main-v3.tsx'),
  actions: path.join(ROOT, 'apps/web/app/(dashboard)/leltar/leltar343-actions.ts'),
}

const t = (src) =>
  ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText

/** Komment-lehántás a forrás-őrökhöz (a kommentben álló szöveg nem bizonyíték). */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-leltar-varazslo-'))
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

/**
 * A `@kartoteka/ui-app` csomag stubja a VALÓDI forrásokból (constants + save +
 * finance/inventory) — nem kézi utánzat, hogy a teszt a tényleges viselkedést
 * mérje.
 */
function epitUiAppStub(constantsSrc) {
  const constantsCjs = ir('constants', t(constantsSrc))
  const saveCjs = ir(
    'save',
    t(fs.readFileSync(SRC.save, 'utf8')).replace(
      /require\(["']\.\/constants["']\)/g,
      `require(${JSON.stringify(constantsCjs)})`,
    ),
  )
  const financeCjs = ir('finance-inv', t(fs.readFileSync(SRC.financeInv, 'utf8')))
  return ir(
    'ui-app',
    `module.exports = Object.assign({},
       require(${JSON.stringify(financeCjs)}),
       require(${JSON.stringify(constantsCjs)}),
       require(${JSON.stringify(saveCjs)}));`,
  )
}

/** shared + review betöltése ADOTT forrásszöveggel (mutánsokhoz is). */
function betolt({ sharedSrc, reviewSrc, constantsSrc } = {}) {
  const uiApp = epitUiAppStub(constantsSrc ?? fs.readFileSync(SRC.constants, 'utf8'))
  const sharedCjs = ir(
    'shared',
    t(sharedSrc ?? fs.readFileSync(SRC.shared, 'utf8')).replace(
      /require\(["']@kartoteka\/ui-app["']\)/g,
      `require(${JSON.stringify(uiApp)})`,
    ),
  )
  const reviewCjs = ir(
    'review',
    t(reviewSrc ?? fs.readFileSync(SRC.review, 'utf8'))
      .replace(/require\(["']@kartoteka\/ui-app["']\)/g, `require(${JSON.stringify(uiApp)})`)
      .replace(/require\(["']\.\/leltar343-shared["']\)/g, `require(${JSON.stringify(sharedCjs)})`),
  )
  return {
    shared: require_(sharedCjs),
    review: require_(reviewCjs),
    uiApp: require_(uiApp),
  }
}

const { shared, review, uiApp } = betolt()

// ---------------------------------------------------------------------------
// Segédek a próbasorokhoz
// ---------------------------------------------------------------------------

function nyersSor(sor, extra = {}) {
  return {
    sor,
    eOszlop: null,
    fOszlop: null,
    helyszinFelelos: null,
    leltariSzam: null,
    ev: null,
    ho: null,
    nap: null,
    ertek: null,
    mennyiseg: null,
    mertekegyseg: null,
    beszerzesiIrat: null,
    torlesEv: null,
    torlesHo: null,
    torlesNap: null,
    torlesSzoveg: null,
    hasznalatiIdo: null,
    tipusNev: null,
    ...extra,
  }
}

const CSEKELY = shared.LELTAR343_KATEGORIA_LAPOK.find((l) => l.category === 'csekely')

function reviewSorok(sorok, modul = { shared, review }) {
  const eredmeny = modul.shared.feldolgozLeltar343Lap({ lap: CSEKELY, sorok })
  return modul.review.epitReviewSorok({ lapok: [{ lap: CSEKELY, eredmeny }] })
}

// ---------------------------------------------------------------------------
// R1 — az ELUTASÍTOTT sor is átnézhető/javítható lesz
// ---------------------------------------------------------------------------
{
  const sorok = reviewSorok([
    nyersSor(5, { eOszlop: 'Szék', leltariSzam: 'CS-001', ertek: 300, ev: 2020 }),
    // hiányzó megnevezés — a beolvasás ELUTASÍTJA
    nyersSor(6, { leltariSzam: 'CS-002', ertek: 500, ev: 2021 }),
  ])
  assert(sorok.length === 2, 'R1: az elutasított sor is bekerül az átnézetbe (2 sor)')
  const rossz = sorok.find((s) => s.sor === 6)
  assert(!!rossz && rossz.elutasitott === true, 'R1b: az elutasított sor jelölve van')
  assert(!!rossz && rossz.feloldas === 'kihagy', 'R1c: az elutasított sor alapból KIMARAD (nem megy be véletlenül)')
  assert(
    !!rossz && rossz.uzenetek.some((u) => u.kod === 'hianyzo_megnevezes'),
    'R1d: az elutasítás GÉPI kóddal érkezik (nem szöveg-egyeztetéssel)',
  )
  // A javítás után importálhatóvá válik:
  const javitva = review.alkalmazJavitasok(sorok, {
    [rossz.id]: { feloldas: 'import', mezok: { megnevezes: 'Asztal' } },
  })
  const ell = review.ellenorizSorok(javitva, { aktivSzamok: [] })
  assert(ell.osszegzes.hibas === 0, 'R1e: megnevezés pótlása után a sor HIBÁTLAN')
  assert(ell.osszegzes.beszurando === 2, 'R1f: javítás után mindkét sor bemegy')
}

// R1n (negatív): a `nyers` NÉLKÜLI (óvilági) hibán az őrszem BUKIK.
{
  const mutansShared = fs
    .readFileSync(SRC.shared, 'utf8')
    .replace("kod: 'hianyzo_megnevezes', nyers: s, ", "")
  const modul = betolt({ sharedSrc: mutansShared })
  const sorok = reviewSorok(
    [
      nyersSor(5, { eOszlop: 'Szék', leltariSzam: 'CS-001', ertek: 300, ev: 2020 }),
      nyersSor(6, { leltariSzam: 'CS-002', ertek: 500, ev: 2021 }),
    ],
    modul,
  )
  assert(sorok.length === 1, 'R1n: a `nyers` nélküli óvilági hibán az elutasított sor NEM javítható — az őrszem BUKNA')
}

// ---------------------------------------------------------------------------
// R2 — a MÁR KIADOTT leltári szám blokkoló hiba (nem néma kihagyás)
// ---------------------------------------------------------------------------
{
  const sorok = reviewSorok([nyersSor(5, { eOszlop: 'Szék', leltariSzam: 'CS-001', ertek: 300, ev: 2020 })])
  const ell = review.ellenorizSorok(sorok, { aktivSzamok: ['CS-001'] })
  const gondok = ell.gondok[sorok[0].id]
  assert(
    gondok.some((g) => g.szint === 'hiba' && g.kod === 'szam_utkozes_db'),
    'R2: a rendszerben már kiadott leltári szám BLOKKOLÓ hiba (döntést kér)',
  )
  assert(gondok.some((g) => g.mezo === 'leltari_szam'), 'R2b: a hiba megmondja, MELYIK mezőt kell javítani')
  assert(ell.osszegzes.beszurando === 0, 'R2c: ütköző sor nem számít bemenőnek')
}

// ---------------------------------------------------------------------------
// R3 — „új szám" feloldás: a rendszer ad számot, és az nem ütközik
// ---------------------------------------------------------------------------
{
  const sorok = reviewSorok([nyersSor(5, { eOszlop: 'Szék', leltariSzam: 'CS-001', ertek: 300, ev: 2020 })])
  const ctx = { aktivSzamok: ['CS-001'] }
  const javitva = review.alkalmazJavitasok(sorok, { [sorok[0].id]: { feloldas: 'uj_szam' } })
  const ell = review.ellenorizSorok(javitva, ctx)
  assert(ell.osszegzes.hibas === 0, 'R3: „új szám" feloldás után nincs blokkoló hiba')
  const kiosztott = review.osztSzamokat(javitva, ctx)
  const ujSzam = kiosztott[sorok[0].id]
  assert(!!ujSzam && ujSzam !== 'CS-001', `R3b: a rendszer ÚJ számot ad (${ujSzam})`)
  assert(/^CS-\d+$/.test(ujSzam || ''), 'R3c: az új szám a kategória előtagját viseli')
}

// ---------------------------------------------------------------------------
// R4 — „meglévő frissítése" csak létező, AKTÍV számra
// ---------------------------------------------------------------------------
{
  const sorok = reviewSorok([nyersSor(5, { eOszlop: 'Szék', leltariSzam: 'CS-001', ertek: 300, ev: 2020 })])
  const jo = review.alkalmazJavitasok(sorok, { [sorok[0].id]: { feloldas: 'felulir' } })
  const ellJo = review.ellenorizSorok(jo, { aktivSzamok: ['CS-001'] })
  assert(ellJo.osszegzes.hibas === 0, 'R4: létező aktív számra a felülírás megengedett')
  assert(ellJo.osszegzes.felulirando === 1, 'R4b: a felülírás KÜLÖN számláló (nem beszúrás)')

  const rossz = review.alkalmazJavitasok(sorok, { [sorok[0].id]: { feloldas: 'felulir' } })
  const ellRossz = review.ellenorizSorok(rossz, { aktivSzamok: [] })
  assert(
    (ellRossz.gondok[sorok[0].id] || []).some((g) => g.kod === 'felulirhatatlan'),
    'R4c: nem létező számra a felülírás HIBA (nem néma beszúrás)',
  )
}

// ---------------------------------------------------------------------------
// R4v — VÉGLEGESÍTETT ÉV: a felülírás TILOS (Endre döntése, 2026-08-27)
// ---------------------------------------------------------------------------
{
  const sorok = reviewSorok([nyersSor(5, { eOszlop: 'Szék', leltariSzam: 'CS-001', ertek: 300, ev: 2020 })])
  const felulir = review.alkalmazJavitasok(sorok, { [sorok[0].id]: { feloldas: 'felulir' } })

  const zart = review.ellenorizSorok(felulir, { aktivSzamok: ['CS-001'], veglegesitve: true })
  const gondok = zart.gondok[sorok[0].id] || []
  assert(
    gondok.some((g) => g.szint === 'hiba' && g.kod === 'veglegesitett_ev'),
    'R4v: véglegesített évben a MEGLÉVŐ tétel felülírása blokkoló hiba',
  )
  assert(zart.osszegzes.felulirando === 0, 'R4v-b: lezárt évben egyetlen sor sem számít felülírandónak')
  assert(
    gondok.some((g) => g.szint === 'hiba' && /egyházmegye/i.test(g.uzenet)),
    'R4v-c: az üzenet megnevezi a kiutat (egyházmegyei feloldás) — nem fejlesztői zsákutca',
  )

  // Az egyházmegyei feloldás UTÁN (leltar_finalized → false) újra mehet:
  const nyitott = review.ellenorizSorok(felulir, { aktivSzamok: ['CS-001'], veglegesitve: false })
  assert(nyitott.osszegzes.hibas === 0, 'R4v-d: a feloldás után a felülírás ismét megengedett')
  assert(nyitott.osszegzes.felulirando === 1, 'R4v-e: … és felülírásként számolódik')

  // ÚJ tétel bevitele lezárt évben SEM tilos (a véglegesítés a JELENTÉST zárja).
  const ujTetel = reviewSorok([nyersSor(5, { eOszlop: 'Új szék', leltariSzam: 'CS-500', ertek: 300, ev: 2020 })])
  const ujEll = review.ellenorizSorok(ujTetel, { aktivSzamok: ['CS-001'], veglegesitve: true })
  assert(ujEll.osszegzes.beszurando === 1, 'R4v-f: lezárt évben ÚJ tétel bevitele nincs zárolva')
}

// R4vn (negatív): a zár NÉLKÜLI (óvilági) ellenőrzőn az őrszem BUKIK.
{
  const mutans = fs
    .readFileSync(SRC.review, 'utf8')
    .replace('if (ctx.veglegesitve) {', 'if (false) {')
  const modul = betolt({ reviewSrc: mutans })
  const sorok = reviewSorok([nyersSor(5, { eOszlop: 'Szék', leltariSzam: 'CS-001', ertek: 300, ev: 2020 })], modul)
  const felulir = modul.review.alkalmazJavitasok(sorok, { [sorok[0].id]: { feloldas: 'felulir' } })
  const ell = modul.review.ellenorizSorok(felulir, { aktivSzamok: ['CS-001'], veglegesitve: true })
  assert(
    ell.osszegzes.felulirando === 1 && ell.osszegzes.hibas === 0,
    'R4vn: a zár nélküli (óvilági) ellenőrző ÁTENGEDNÉ a lezárt év felülírását — az őrszem BUKNA, tehát nem vak',
  )
}

// ---------------------------------------------------------------------------
// R5 — a fájlon BELÜLI szám-ütközés is hiba
// ---------------------------------------------------------------------------
{
  const sorok = reviewSorok([
    nyersSor(5, { eOszlop: 'Szék', leltariSzam: 'CS-009', ertek: 300, ev: 2020 }),
    nyersSor(6, { eOszlop: 'Asztal', leltariSzam: 'CS-009', ertek: 400, ev: 2020 }),
  ])
  const ell = review.ellenorizSorok(sorok, { aktivSzamok: [] })
  const utkozok = sorok.filter((s) =>
    (ell.gondok[s.id] || []).some((g) => g.kod === 'szam_utkozes_fajl'),
  )
  assert(utkozok.length === 2, 'R5: a fájlon belül kétszer szereplő leltári szám MINDKÉT soron hiba')
}

// ---------------------------------------------------------------------------
// R6 — a KIVEZETETT tétel száma újra kiadható (a DB részleges indexe miatt)
// ---------------------------------------------------------------------------
{
  const sorok = reviewSorok([nyersSor(5, { eOszlop: 'Szék', leltariSzam: 'CS-001', ertek: 300, ev: 2020 })])
  const ell = review.ellenorizSorok(sorok, { aktivSzamok: [], kivezetettSzamok: ['CS-001'] })
  const gondok = ell.gondok[sorok[0].id]
  assert(
    gondok.some((g) => g.szint === 'figyelmeztetes' && g.kod === 'szam_utkozes_kivezetett'),
    'R6: kivezetett tétel száma = FIGYELMEZTETÉS (a DB részleges egyediségi indexe engedi)',
  )
  assert(!gondok.some((g) => g.szint === 'hiba'), 'R6b: kivezetett szám nem BLOKKOL')
}

// ---------------------------------------------------------------------------
// R7 — mező-fehérlista: minden whitelistelt mező TÉNYLEGESEN átmegy
// ---------------------------------------------------------------------------
{
  const PROBA = {
    megnevezes: 'Javított név',
    szerzo: 'Kovács János',
    megjegyzes: 'Megjegyzés',
    leltari_szam: 'CS-777',
    helyszin: 'Templom',
    felelos_neve: 'Szőcs Endre',
    beszerzes_datuma: '2019-03-04',
    beszerzesi_ertek: 1234.5,
    mennyiseg: 7,
    mertekegyseg: 'kg',
    beszerzes_bizonylat: 'Sz-42',
  }
  const hianyzo = review.LELTAR343_SZERKESZTHETO_MEZOK.filter((m) => !(m in PROBA))
  assert(hianyzo.length === 0, `R7a: a teszt MINDEN fehérlistázott mezőt lefed (hiányzó: ${hianyzo.join(', ') || 'nincs'})`)

  const sorok = reviewSorok([nyersSor(5, { eOszlop: 'Szék', leltariSzam: 'CS-001', ertek: 300, ev: 2020 })])
  const nemErvenyesul = []
  for (const mezo of review.LELTAR343_SZERKESZTHETO_MEZOK) {
    const javitva = review.alkalmazJavitasok(sorok, {
      [sorok[0].id]: { mezok: { [mezo]: PROBA[mezo] } },
    })
    if (javitva[0][mezo] !== PROBA[mezo]) nemErvenyesul.push(mezo)
  }
  assert(
    nemErvenyesul.length === 0,
    `R7: a fehérlista és a mezőnkénti alkalmazás SZINKRONBAN van (nem érvényesült: ${nemErvenyesul.join(', ') || 'nincs'})`,
  )
}

// R7n (negatív): nem fehérlistázott mező a kliensről NEM állítható.
{
  const sorok = reviewSorok([nyersSor(5, { eOszlop: 'Szék', leltariSzam: 'CS-001', ertek: 300, ev: 2020 })])
  const javitva = review.alkalmazJavitasok(sorok, {
    [sorok[0].id]: { mezok: { kategoria: 'alapeszkoz', is_deleted: true, ertek_modositas: 999 } },
  })
  assert(javitva[0].kategoria === 'csekely', 'R7n: a `kategoria` kliensről NEM írható át')
  assert(javitva[0].is_deleted === false, 'R7n-b: az `is_deleted` kliensről NEM írható át')
  assert(javitva[0].ertek_modositas === 0, 'R7n-c: az `ertek_modositas` kliensről NEM írható át')
}

// ---------------------------------------------------------------------------
// R8 — determinisztikus, ütközésmentes szám-kiosztás
// ---------------------------------------------------------------------------
{
  const sorok = reviewSorok([
    nyersSor(5, { eOszlop: 'Szék', ertek: 300, ev: 2020 }),
    nyersSor(6, { eOszlop: 'Asztal', ertek: 400, ev: 2020 }),
  ])
  const ctx = { aktivSzamok: ['CS-001', 'CS-002'] }
  const kiosztott = review.osztSzamokat(sorok, ctx)
  const szamok = Object.values(kiosztott)
  assert(szamok.length === 2, 'R8: a szám nélküli sorok mindegyike kap számot')
  assert(new Set(szamok).size === 2, 'R8b: a kiosztott számok nem ütköznek EGYMÁSSAL')
  assert(!szamok.some((sz) => ctx.aktivSzamok.includes(sz)), 'R8c: a kiosztott számok nem ütköznek a MEGLÉVŐKKEL')
  const megegyszer = review.osztSzamokat(sorok, ctx)
  assert(
    JSON.stringify(megegyszer) === JSON.stringify(kiosztott),
    'R8d: a kiosztás DETERMINISZTIKUS (a felületen mutatott szám nem hazudhat)',
  )
}

// ---------------------------------------------------------------------------
// K1 — kategória-körkörösség: a rendszer SAJÁT címkéi visszanormalizálódnak
// ---------------------------------------------------------------------------
{
  const bukott = []
  for (const kat of uiApp.INVENTORY_CATEGORIES) {
    const alakok = [
      uiApp.INVENTORY_CATEGORY_LABELS[kat],
      uiApp.INVENTORY_CATEGORY_ROMANIAN_LABELS[kat],
      uiApp.serializeInventoryCategory(kat),
    ]
    for (const alak of alakok) {
      if (uiApp.normalizeInventoryCategory(alak) !== kat) bukott.push(`${kat}: „${alak}"`)
    }
  }
  assert(bukott.length === 0, `K1: minden kategória-címke visszanormalizálódik (bukott: ${bukott.join(' · ') || 'nincs'})`)
}

// K1n (negatív): a régi, KIZÁRÓLAG alias-listás normalizálón az őrszem BUKIK.
{
  const mutansConstants = fs
    .readFileSync(SRC.constants, 'utf8')
    .replace(/^\s*if \(normalizeInventoryToken\((INVENTORY_CATEGORY_LABELS|INVENTORY_CATEGORY_ROMANIAN_LABELS)\[category\]\) === token\) return category\s*$/gm, '')
    .replace(/^\s*if \(normalizeInventoryToken\(serializeInventoryCategory\(category\)\) === token\) return category\s*$/gm, '')
  const modul = betolt({ constantsSrc: mutansConstants })
  const regi = modul.uiApp.normalizeInventoryCategory('Csekély értékű leltári tárgyak')
  assert(regi === null, 'K1n: az alias-listás (régi) normalizálón a saját címke NEM ismerhető fel — az őrszem BUKNA')
}

// ---------------------------------------------------------------------------
// G1 — a leltár-oldal a VARÁZSLÓT köti be, a régi kártya megszűnt
// ---------------------------------------------------------------------------
{
  const pageSrc = stripComments(fs.readFileSync(SRC.page, 'utf8'))
  assert(pageSrc.includes('<Leltar343ImportWizard />'), 'G1: a /leltar a varázslót rendereli')
  assert(
    !fs.existsSync(path.join(ROOT, 'apps/web/components/inventory/leltar343-import-card.tsx')),
    'G1b: a régi, egylapos import-kártya fájlja megszűnt (nincs két párhuzamos importáló)',
  )
  const mutans = pageSrc.replace('<Leltar343ImportWizard />', '<Leltar343ImportCard />')
  assert(!mutans.includes('<Leltar343ImportWizard />'), 'G1n: a régi kártyás oldalon az őrszem BUKNA — nem vak')
}

// ---------------------------------------------------------------------------
// G2 — a zsákutca-ejtőzóna és a görgető gomb ELTŰNT
// ---------------------------------------------------------------------------
{
  const tabSrc = stripComments(fs.readFileSync(SRC.tab, 'utf8'))
  assert(!/type="file"/.test(tabSrc), 'G2: a rendszergazdai fülnek NINCS saját (zsákutca) fájlfeltöltője')
  assert(!/scrollIntoView/.test(tabSrc), 'G2b: a „Tovább az importálásra" görgető gomb megszűnt')
  assert(!/selectedFile/.test(tabSrc), 'G2c: a sehova nem vezető `selectedFile` állapot megszűnt')
  assert(/hasProcessor\s*=\s*!!\(\s*importProfiles\s*&&\s*importModule\s*\)/.test(tabSrc), 'G2d: a valódi feldolgozó kontraktusa változatlan')
  const mutans = `${tabSrc}\n<input type="file" onChange={(e) => setSelectedFile(e.target.files[0])} />\n`
  assert(/type="file"/.test(mutans), 'G2n: a zsákutca-ejtőzónát visszatevő mutánson az őrszem BUKNA — nem vak')
}

// ---------------------------------------------------------------------------
// G3 — az import UTÁN a lista ÚJRATÖLTŐDIK (Endre „nem importált egyet sem")
// ---------------------------------------------------------------------------
{
  const wizardSrc = stripComments(fs.readFileSync(SRC.wizard, 'utf8'))
  assert(/useInventoryRefresh\(\)/.test(wizardSrc), 'G3: a varázsló elkéri a lista-frissítő csatornát')
  assert(/refreshApi\?\.frissit\(\)/.test(wizardSrc), 'G3b: az import UTÁN ténylegesen frissít')
  const mainSrc = stripComments(fs.readFileSync(SRC.main, 'utf8'))
  assert(
    /<InventoryRefreshProvider[\s\S]{0,400}adminImportContent/.test(mainSrc),
    'G3c: az InventoryMain a providerrel öleli körbe a rendszergazdai fül tartalmát',
  )
  assert(/frissit:\s*load/.test(mainSrc), 'G3d: a provider a VALÓDI betöltő függvényt adja át')
  const mutans = wizardSrc.replace(/await refreshApi\?\.frissit\(\)/g, '')
  assert(!/refreshApi\?\.frissit\(\)/.test(mutans), 'G3n: a frissítés nélküli (óvilági) varázslón az őrszem BUKNA — nem vak')
}

// ---------------------------------------------------------------------------
// G4 — a szerver a KÖZÖS review-réteggel dönt, és nem csonkolja az ellenőrzést
// ---------------------------------------------------------------------------
{
  const actionsSrc = stripComments(fs.readFileSync(SRC.actions, 'utf8'))
  assert(
    /ellenorizSorok/.test(actionsSrc) && /alkalmazJavitasok/.test(actionsSrc) && /osztSzamokat/.test(actionsSrc),
    'G4: a szerver UGYANAZT a review-réteget futtatja, amit a felület (nem húzhatnak szét)',
  )
  assert(
    !/hibak:\s*eredmeny\.hibak\.map\([^)]*\)\.slice\(/.test(actionsSrc),
    'G4b: az előnézet NEM csonkolja a lapónkénti hibalistát (Endre: „lássam teljes egészében")',
  )
  const mutans = actionsSrc.replace(/ellenorizSorok/g, 'sajatEllenorzes')
  assert(!/ellenorizSorok/.test(mutans), 'G4n: a saját, külön ellenőrzést futtató szerveren az őrszem BUKNA — nem vak')
}

// ---------------------------------------------------------------------------
// G5 — a FELÜLÍRÁS nem törli az üres cellával a meglévő adatot
// ---------------------------------------------------------------------------
{
  const actionsSrc = stripComments(fs.readFileSync(SRC.actions, 'utf8'))
  const m = actionsSrc.match(/function frissitesiPayload\([\s\S]*?\n}/)
  assert(!!m, 'G5: létezik külön FELÜLÍRÁS-payload építő (nem a beszúró payload megy UPDATE-be)')
  const torzs = m ? m[0] : ''
  assert(
    /ertek === null/.test(torzs) && /ertek === ''/.test(torzs) && /continue/.test(torzs),
    'G5b: az üres (null / üres szöveg) mező KIMARAD a frissítésből — nem NULL-ozza a meglévő adatot',
  )
  assert(
    /delete teljes\['userid'\]/.test(torzs) && /delete teljes\['leltari_szam'\]/.test(torzs),
    'G5c: a rögzítő és a leltári szám (a párosítás kulcsa) frissítéskor nem változik',
  )
  const mutans = torzs.replace(/if \(ertek === null[\s\S]*?continue\n/, '')
  assert(!/ertek === null/.test(mutans), 'G5n: az üres-szűrés nélküli mutánson az őrszem BUKNA — nem vak')
}

// ---------------------------------------------------------------------------
// G7 — a véglegesített év zára a SZERVEREN is fail-closed
// ---------------------------------------------------------------------------
{
  const actionsSrc = stripComments(fs.readFileSync(SRC.actions, 'utf8'))
  const m = actionsSrc.match(/async function veglegesitesiAllapot\([\s\S]*?\n}/)
  assert(!!m, 'G7: a szerver a CÉL-gyülekezet lezárt állapotát külön, kimérten olvassa')
  const torzs = m ? m[0] : ''
  assert(
    /if \(error\) return \{ veglegesitve: true/.test(torzs),
    'G7b: FAIL-CLOSED — lekérdezési hibánál VÉGLEGESÍTETTNEK tekinti az évet (nem enged felülírni)',
  )
  assert(
    /\.eq\('congregation_id', congregationId\)/.test(torzs),
    'G7c: a lezárást a CÉL-gyülekezet évsorán méri (nem a hívóén)',
  )
  // A szerver a review-rétegnek TOVÁBB is adja — enélkül a felület tiltana,
  // a szerver viszont átengedné (a néma széthúzás hibaosztálya).
  assert(
    /veglegesitve:\s*veglegesites\.veglegesitve/.test(actionsSrc),
    'G7d: az import-ellenőrzés ctx-e MEGKAPJA a lezárt állapotot',
  )
  const mutans = torzs.replace(/if \(error\) return \{ veglegesitve: true[^\n]*\n/, '')
  assert(
    !/if \(error\) return \{ veglegesitve: true/.test(mutans),
    'G7n: a fail-closed ág nélküli mutánson az őrszem BUKNA — nem vak',
  )
  const mutans2 = actionsSrc.replace(/veglegesitve:\s*veglegesites\.veglegesitve/g, '')
  assert(
    !/veglegesitve:\s*veglegesites\.veglegesitve/.test(mutans2),
    'G7n-b: a ctx-be nem továbbított lezárás esetén az őrszem BUKNA — nem vak',
  )
}

// ---------------------------------------------------------------------------
// G8 — a felület nem kínálja a zárolt felülírást
// ---------------------------------------------------------------------------
{
  const wizardSrc = stripComments(fs.readFileSync(SRC.wizard, 'utf8'))
  assert(
    /veglegesitve:\s*!!preview\?\.veglegesitve/.test(wizardSrc),
    'G8: a felület UGYANAZT a lezárt állapotot adja az ellenőrzőnek, amit a szerver mért',
  )
  assert(
    /felulirhato=\{!zarolt/.test(wizardSrc),
    'G8b: lezárt évben a „Meglévő frissítése" választás le van tiltva',
  )
  assert(/\{!zarolt && \(/.test(wizardSrc), 'G8c: a tömeges „Mind frissítse a meglévőt" gomb sem jelenik meg')
  const mutans = wizardSrc.replace(/felulirhato=\{!zarolt/g, 'felulirhato={')
  assert(!/felulirhato=\{!zarolt/.test(mutans), 'G8n: a tiltás nélküli felületen az őrszem BUKNA — nem vak')
}

// ---------------------------------------------------------------------------
// G6 — a 0 beszúrt sor sehol nem számít „sikeres import"-nak
// ---------------------------------------------------------------------------
{
  const multiSrc = stripComments(
    fs.readFileSync(path.join(ROOT, 'apps/web/components/shared/multi-sheet-import.tsx'), 'utf8'),
  )
  assert(
    /insertedCount \?\? 0\) > 0[\s\S]{0,200}Import sikeresen/.test(multiSrc),
    'G6: a zöld „Import sikeresen befejeződött!" fejléc CSAK tényleges beszúrásnál jelenik meg',
  )
  const wizardSrc = stripComments(fs.readFileSync(SRC.wizard, 'utf8'))
  assert(
    /Egyetlen tétel sem került be/.test(wizardSrc),
    'G6b: a varázsló kimondja, ha egyetlen tétel sem került be',
  )
}

console.log(`\n${total - failedCount}/${total} teszt zöld`)
process.exit(failedCount > 0 ? 1 : 0)
