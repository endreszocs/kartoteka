#!/usr/bin/env node
/**
 * KERÜLETI NYOMTATVÁNY-ÁG önellenőrzés (2026-08-22, kerületi S6 szelet).
 *
 * Mit véd:
 *   · apps/web/lib/finance/print-scope.ts        — a hatókör-kapu + az évi
 *                                                  beállítás-sor betöltője,
 *   · packages/ui-app/src/finance/budget-reporting.ts `wrapBudget` — a PDF-mentés
 *                                                  betöltés-őrének lapszáma.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ MIÉRT VAN EZ A FÁJL — KÉT KÖZPONTI ÁLLÍTÁS BIZONYÍTATLAN VOLT, ÉS AZ EGYIK
 *    HAMIS IS
 * ════════════════════════════════════════════════════════════════════════════
 * Az egész kerületi nyomtatvány-ághoz EGYETLEN őrszem sem készült, és pontosan
 * ezért maradt észrevétlen két hiba — mindkettő az adverzáriális ellenőrzésen
 * derült ki, nem futás közben:
 *
 *  (1) LAPSZÁM. A `wrapBudget` a body `data-sheet-count` attribútumába a VÁRT
 *      lapszámot írja, a PDF-motor (apps/web/lib/utils/print-engine-v2.ts:172-182)
 *      pedig a DOM-ban talált `body .sheet, body .page` elemekkel veti össze, és
 *      eltérésnél SZÁNDÉKOSAN dob („A nyomtatvány nem töltött be hiánytalanul"),
 *      hogy csonka hivatalos irat ne mentődjön el. A régi minta viszont
 *      (`/<div class="page/`) SZÖVEG-ELŐTAGRA illeszkedett, tehát a laponkénti
 *      `<div class="page-footer">` lábléceket is megszámolta: egy N lapos ív
 *      jelzett lapszáma 2N lett. A két szám SOSEM egyezett → a PDF-mentés MINDEN
 *      SZINTEN (gyülekezeti, megyei, kerületi) elhasalt. Egy helyes őr bukott el
 *      egy hibás számoláson.
 *
 *  (2) FAIL-CLOSED SZERZŐDÉS. A `nyomtatvanyScope()` `default` ága DOBOTT `null`
 *      helyett. A fájl viszont azt ígéri, hogy ismeretlen szintre `null`-t ad, és
 *      a két nyomtatási központ ERRE a `null`-ra építi a magyarázó, nyomtatást
 *      tiltó előnézetet — vagyis a `keszScope === null` ág mind a négy hívási
 *      helyen elérhetetlen holt kód volt, a `hibaOk: 'nincs_nyomtatvany_ag'` érték
 *      pedig sosem született meg. A dobás ráadásul nyers hibaképernyőt adott
 *      volna a magyarázó előnézet helyett, épp egy hivatalos irat kiadása közben.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A HAT MÉRCE
 * ════════════════════════════════════════════════════════════════════════════
 *   (K1) `nyomtatvanyScope('district') === 'district'` — a kapu tényleg nyitva;
 *   (K2) ismeretlen szintre `null`, ÉS NEM DOB (+ a `loadEvBeallitas` ugyanennek
 *        a szintnek `hibaOk: 'nincs_nyomtatvany_ag'`-ot ad, nem `'lekerdezes_hiba'`-t);
 *   (K3) a `loadEvBeallitas` kerületi ága a `district_bealitas` TÁBLÁT és a
 *        `district_id` OSZLOPOT használja — VALÓDI lekérésből mérve, nem szövegből;
 *   (K4) a `wrapBudget` jelzett lapszáma a VALÓDI lapok száma (a `page-footer`
 *        nem számít bele) — MEGGENERÁLT tartalmon mérve;
 *   (K5) a gyülekezeti és a megyei ág BYTE-RA változatlan viselkedésű
 *        (kapu + tábla + oszlop);
 *   (K6) NEGATÍV ASSZERTEK: minden fenti mércét újrajátszunk a RÉGI/hibás
 *        alakkal (HÉT mutáns a VALÓDI forrásokon), és bizonyítjuk, hogy a mérce
 *        ARRA BUKIK. Egy őrszem, ami sosem tud pirosra váltani, rosszabb a semminél.
 *
 * ⚠️ MIÉRT NEM SZÖVEGES A K3: egy `grep 'district_bealitas'` akkor is zöldet ad,
 *    ha a szűrő oszlopa `diocese_id` maradt, sőt akkor is, ha a találat csak egy
 *    KOMMENTBEN van. Itt ezért egy hamis Supabase-klienst adunk a VALÓDI
 *    függvénynek, és azt nézzük meg, milyen táblát és milyen szűrőket kért.
 *
 * ⚠️ A `print-scope.ts` egy futásidejű importot húz (`@/lib/finance/diocese-bealitas`),
 *    ami a `@/` alias miatt Node alól nem oldható fel. A modult ezért SAJÁT
 *    `require`-rel töltjük be, ami CSAK ezt az egy modult pótolja — minden más
 *    váratlan importra HANGOSAN megáll (fail-closed), hogy a teszt ne váljon
 *    észrevétlenül vakká.
 *
 * MINTA: scripts/selftest-splash-stage.mjs (negatív asszert tiszta függvényre),
 *        scripts/selftest-override-elsobbseg.mjs (mutánsos bizonyítás).
 *
 * Futtatás:  node scripts/selftest-kerulet-nyomtatvany.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const F_PRINT_SCOPE = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'finance', 'print-scope.ts')
const F_REPORTING = path.join(REPO_ROOT, 'packages', 'ui-app', 'src', 'finance', 'budget-reporting.ts')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

for (const f of [F_PRINT_SCOPE, F_REPORTING]) {
  if (!fs.existsSync(f)) {
    fail(`hiányzik a fájl: ${f}`)
    process.exit(1)
  }
}

const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try {
  ts = require_('typescript')
} catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-kerulet-nyomtatvany-'))

// ────────────────────────────────────────────────────────────────────────────
// BETÖLTŐK
// ────────────────────────────────────────────────────────────────────────────

/**
 * TS forrás → CommonJS → betöltés SAJÁT `require`-rel.
 *
 * MIÉRT SAJÁT `require`: a `print-scope.ts` a `@/lib/finance/diocese-bealitas`
 * modult importálja; a `@/` alias a Next.js-é, Node alól nem oldható fel. A
 * pótlék (`stubs`) CSAK a felsorolt modulokat adja vissza — bármi más HANGOS
 * hibát ad. Ha valaha `server-only` (vagy más valódi) lánc kerülne a fájlba, ez
 * a teszt ITT áll meg, érthetően; nem válik némán kihagyhatóvá.
 *
 * @param transform a forrásszöveg MUTÁLÁSA a negatív asszertekhez (opcionális)
 * @param farok     a lefordított modul végére fűzött teszt-horog (opcionális) —
 *                  NEM a logikát írja át, csak láthatóvá tesz egy modul-belső
 *                  függvényt (`wrapBudget`), amit a forrás nem exportál.
 */
function loadTs(srcFile, outName, { stubs = {}, transform = null, farok = '' } = {}) {
  let code = fs.readFileSync(srcFile, 'utf8')
  if (transform) code = transform(code)
  const out = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: outName + '.ts',
  }).outputText
  const modul = { exports: {} }
  const sajatRequire = (spec) => {
    if (Object.prototype.hasOwnProperty.call(stubs, spec)) return stubs[spec]
    throw new Error(
      `${outName}: VÁRATLAN futásidejű import — ${spec}. Vagy vedd fel a pótlékok közé, ` +
        'vagy nézd meg, miért került a fájlba (server-only lánc esetén az önellenőrzés vakká válna).',
    )
  }
  const fv = new Function('exports', 'require', 'module', '__filename', '__dirname', out + '\n' + farok)
  fv(modul.exports, sajatRequire, modul, path.join(tmp, outName + '.js'), tmp)
  return modul.exports
}

/** A `diocese-bealitas` leképező pótléka: nem mérünk vele, csak nyomot hagyunk. */
const BEALITAS_STUB = {
  normalizeDioceseBealitas: (row, scopeId, year) => ({ __potlek: true, row, scopeId, year }),
}
const PRINT_SCOPE_STUBS = { '@/lib/finance/diocese-bealitas': BEALITAS_STUB }

/**
 * Hamis Supabase-kliens: rögzíti, MELYIK táblát kérték és MILYEN szűrőkkel.
 * Így a K3/K5 a VALÓDI lekérdezés-építést méri, nem a forrás szövegét.
 */
function hamisSupabase(naplo) {
  return {
    from(tabla) {
      naplo.tabla = tabla
      const q = {
        select(mit) {
          naplo.select = mit
          return q
        },
        eq(oszlop, ertek) {
          naplo.eq.push([oszlop, ertek])
          return q
        },
        async maybeSingle() {
          return { data: null, error: null }
        },
      }
      return q
    },
  }
}
const ujNaplo = () => ({ tabla: null, select: null, eq: [] })

// ────────────────────────────────────────────────────────────────────────────
// A VALÓDI MODULOK BETÖLTÉSE
// ────────────────────────────────────────────────────────────────────────────
let scopeMod, reportMod
try {
  scopeMod = loadTs(F_PRINT_SCOPE, 'print-scope', { stubs: PRINT_SCOPE_STUBS })
  // A `wrapBudget` modul-belső (nem exportált), ezért teszt-horoggal tesszük
  // láthatóvá — a függvény TÖRZSE érintetlen marad, azt futtatjuk.
  reportMod = loadTs(F_REPORTING, 'budget-reporting', {
    farok: 'exports.__wrapBudgetTeszthorog = typeof wrapBudget === "function" ? wrapBudget : null;',
  })
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

const { nyomtatvanyScope, loadEvBeallitas } = scopeMod
const wrapBudget = reportMod.__wrapBudgetTeszthorog
const { buildSzamadasReport } = reportMod

if (typeof nyomtatvanyScope !== 'function' || typeof loadEvBeallitas !== 'function') {
  fail('a print-scope.ts nem exportálja a `nyomtatvanyScope` / `loadEvBeallitas` függvényt — a teszt vak lett')
}
if (typeof wrapBudget !== 'function') {
  fail(
    'a budget-reporting.ts `wrapBudget` függvénye eltűnt vagy átnevezték — a K4 mérce vak lett. ' +
      'Ha átnevezted, igazítsd a teszt-horgot; NE hagyd zöldön mérés nélkül.',
  )
}
if (typeof buildSzamadasReport !== 'function') {
  fail('a budget-reporting.ts nem exportálja a `buildSzamadasReport`-ot — a K4 E2E ága vak lett')
}
if (failed) {
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

/** A mutáns tényleg más-e, mint az eredeti? Ha nem, a negatív asszert VAK. */
function mutans(srcFile, outName, atir, opts = {}) {
  const eredeti = fs.readFileSync(srcFile, 'utf8')
  let valtozott = false
  const transform = (kod) => {
    const uj = atir(kod)
    valtozott = uj !== kod
    return uj
  }
  const mod = loadTs(srcFile, outName, { ...opts, transform })
  if (!valtozott) {
    throw new Error(
      `${outName}: a MUTÁCIÓ NEM FOGOTT (a forrás változatlan) — a negatív asszert vak lenne. ` +
        'Valószínűleg átírták a célsort; igazítsd a mintát.',
    )
  }
  void eredeti
  return mod
}

// ════════════════════════════════════════════════════════════════════════════
// K1 · A KERÜLETI KAPU NYITVA
// ════════════════════════════════════════════════════════════════════════════
{
  const k = nyomtatvanyScope('district')
  if (k === 'district') ok("K1 nyomtatvanyScope('district') === 'district' — a kerületi ág átmegy a kapun")
  else fail(`K1 a KERÜLETI KAPU ZÁRVA: nyomtatvanyScope('district') = ${JSON.stringify(k)} (várt: 'district')`)
}

// ════════════════════════════════════════════════════════════════════════════
// K2 · ISMERETLEN SZINTRE `null` — ÉS NEM DOBÁS
// ════════════════════════════════════════════════════════════════════════════
// Ez a fájl fail-closed SZERZŐDÉSE: a két nyomtatási központ a `null`-ra építi a
// magyarázó, nyomtatást tiltó előnézetet. Dobásnál az az ág holt kód lenne.
const ISMERETLEN = 'presbiterium' // szándékosan a `PrintScope`-on kívüli érték
{
  let dobott = null
  let eredmeny
  try {
    eredmeny = nyomtatvanyScope(ISMERETLEN)
  } catch (e) {
    dobott = e
  }
  if (dobott) {
    fail(
      `K2 a nyomtatvanyScope DOBOTT ismeretlen szintre (${dobott?.message || dobott}) — a hívók ` +
        '`keszScope === null` ága ezzel holt kóddá válik, és a felhasználó nyers hibaképernyőt kap ' +
        'a magyarázó előnézet helyett, hivatalos irat kiadása közben.',
    )
  } else if (eredmeny === null) {
    ok('K2 ismeretlen szintre `null` (nem dobás) — a fail-closed előnézet ága élő')
  } else {
    fail(
      'K2 ismeretlen szintre NEM `null` jött, hanem ' +
        `${JSON.stringify(eredmeny)} — az idegen szint átcsúszna a kapun`,
    )
  }
}

// K2b · a `loadEvBeallitas` ugyanerre a szintre ŐSZINTE okot ad
{
  const naplo = ujNaplo()
  const r = await loadEvBeallitas(hamisSupabase(naplo), ISMERETLEN, 'id-1', 2026)
  if (r.ok === false && r.hibaOk === 'nincs_nyomtatvany_ag') {
    ok("K2b loadEvBeallitas(ismeretlen) → ok:false, hibaOk:'nincs_nyomtatvany_ag'")
  } else {
    fail(
      `K2b loadEvBeallitas(ismeretlen) rossz választ ad: ${JSON.stringify(r)}. ` +
        "A `'lekerdezes_hiba'` ITT félrevezető: a felhasználó a „próbáld újra” tanácsot kapná egy " +
        'olyan állapotra, ami sosem javul magától.',
    )
  }
  if (naplo.tabla !== null) {
    fail(`K2b ismeretlen szintre LEKÉRDEZÉS INDULT (${naplo.tabla}) — ág nélküli szintre nem szabad táblát olvasni`)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// K3 · A KERÜLETI ÁG A `district_bealitas` TÁBLÁT ÉS A `district_id` OSZLOPOT KÉRI
// ════════════════════════════════════════════════════════════════════════════
// VALÓDI lekérésből mérve. Ha a tábla a gyülekezeti `bealitas` maradna, a kerület
// UUID-jára 0 sor jönne, és a hivatalos ív „nincs véglegesítve” felirattal menne
// ki egy LEZÁRT évre.
{
  const naplo = ujNaplo()
  const DISTRICT_ID = 'd1000000-0000-0000-0000-000000000001'
  const r = await loadEvBeallitas(hamisSupabase(naplo), 'district', DISTRICT_ID, 2026)
  const eqMap = Object.fromEntries(naplo.eq)

  if (naplo.tabla === 'district_bealitas') ok("K3 a kerületi ág a `district_bealitas` táblát olvassa")
  else fail(`K3 ROSSZ TÁBLA a kerületi ágon: ${JSON.stringify(naplo.tabla)} (várt: 'district_bealitas')`)

  if (eqMap.district_id === DISTRICT_ID) ok('K3b a szűrő oszlopa `district_id`')
  else fail(`K3b a kerületi szűrő NEM \`district_id\` — a rögzített szűrők: ${JSON.stringify(naplo.eq)}`)

  if ('diocese_id' in eqMap || 'congregation_id' in eqMap) {
    fail(`K3c a kerületi ág MEGYEI/GYÜLEKEZETI oszlopra szűr: ${JSON.stringify(naplo.eq)}`)
  } else {
    ok('K3c a kerületi ágon nincs `diocese_id` / `congregation_id` szűrő')
  }

  if (eqMap.eve === 2026) ok('K3d az év a `eve` (int) oszlopon megy — a kerületi séma szerint')
  else fail(`K3d a kerületi év-szűrő elmozdult: ${JSON.stringify(naplo.eq)} (várt: ['eve', 2026])`)

  if (naplo.select === '*') ok("K3e `select('*')` — az új oszlopok hiányánál se bukjon 42703-mal")
  else fail(`K3e a kerületi lekérés oszloplistája megváltozott: ${JSON.stringify(naplo.select)}`)

  if (r.ok !== true) fail('K3f hibátlan lekérésre `ok:false` jött: ' + JSON.stringify(r))
  else ok('K3f hibátlan lekérésre `ok: true`')
}

// ════════════════════════════════════════════════════════════════════════════
// K4 · A LAPSZÁM A VALÓDI LAPOK SZÁMA — MEGGENERÁLT TARTALMON MÉRVE
// ════════════════════════════════════════════════════════════════════════════
/** A body `data-sheet-count` értéke. */
function jelzettLapszam(html) {
  const m = /data-sheet-count="(\d+)"/.exec(html)
  return m ? Number(m[1]) : null
}
/**
 * A VALÓDI lapok száma — a böngésző `querySelectorAll('.page')` szemantikájával:
 * az osztály-lista TOKENJEI közt szerepel-e a `page`. SZÁNDÉKOSAN nem a mért
 * mintát ismételjük meg (az körkörös bizonyítás lenne).
 */
function valodiLapok(html) {
  let n = 0
  const re = /<div\b[^>]*\bclass="([^"]*)"/g
  let m
  while ((m = re.exec(html))) {
    if (m[1].trim().split(/\s+/).includes('page')) n++
  }
  return n
}
/** A RÉGI, hibás minta — a negatív asszerthez. */
const regiSzamlalo = (tartalom) => (tartalom.match(/<div class="page/g) || []).length

/** Pici, kézzel gyártott tartalom: 2 VALÓDI lap, mindegyikben egy lábléc. */
const MINI =
  '<div class="page cover"><h1>Borító</h1><div class="page-footer"><span>oldal 1 / 2</span></div></div>' +
  '<div class="page"><table></table><div class="page-footer"><span>oldal 2 / 2</span></div></div>'

// K4a · a VALÓDI `wrapBudget` a mini tartalmon
{
  const html = wrapBudget('Teszt', MINI)
  const jelzett = jelzettLapszam(html)
  const valodi = valodiLapok(MINI)
  const regi = regiSzamlalo(MINI)

  if (valodi !== 2) {
    fail(`K4a a teszt-HTML maga romlott el: ${valodi} valódi lapot számoltam 2 helyett`)
  } else if (jelzett === 2) {
    ok('K4a a `wrapBudget` jelzett lapszáma 2 valódi lapra = 2 (a `page-footer` nem számít bele)')
  } else {
    fail(
      `K4a A JELZETT LAPSZÁM HIBÁS: data-sheet-count=${jelzett}, valódi lapszám=2. ` +
        'Ha 4, akkor a `page-footer` újra beleszámít — a PDF-motor eltérésnél DOB ' +
        '(print-engine-v2.ts:172-182), vagyis a PDF-mentés MINDEN SZINTEN elhasal.',
    )
  }

  // ── NEGATÍV ASSZERT: a RÉGI minta ugyanerre 4-et adna ───────────────────
  if (regi === 4 && jelzett !== regi) {
    ok(`K4b negatív asszert: a régi \`/<div class="page/\` minta ugyanerre a HTML-re ${regi}-et ad (2 lap + 2 lábléc)`)
  } else {
    fail(
      `K4b negatív asszert VAK: a régi minta ${regi}-et ad (várt: 4), a mai ${jelzett}-t. ` +
        'Vagy a teszt-HTML nem tartalmaz már láblécet, vagy a mérce nem mér semmit.',
    )
  }
}

// K4c · A TESZT-HTML VALÓSÁGHŰ-E? (különben a K4a/K4b vak zöldet adna)
// Mindhárom szint VALÓDI Számadás-ívén megnézzük, hogy a lapok és a láblécek
// tényleg így néznek ki, és hogy a jelzett lapszám a valódival egyezik.
{
  const cellek = [
    { id: '101', type: 'B', nev: 'Egyházfenntartói járulék', sorszam: 1 },
    { id: '101.01', type: 'B', nev: 'Egyházfenntartói járulék', sorszam: 2 },
    { id: '201', type: 'K', nev: 'Személyi kiadások', sorszam: 3 },
    { id: '201.01', type: 'K', nev: 'Fizetések', sorszam: 4 },
  ]
  const budgetRows = {
    '101.01': { szamadasicelid: '101.01', tervezett: 1000 },
    '201.01': { szamadasicelid: '201.01', tervezett: 800 },
  }
  const kozos = {
    cellek,
    budgetRows,
    actualIncome: { '101.01': 900 },
    actualExpense: { '201.01': 700 },
    year: 2026,
    carryoverCash: 0,
    carryoverBank: 0,
    finalized: true,
    hatarozatSzam: '7/2026',
    hatarozatDatum: '2026-03-14',
    iktatoszam: '42/2026',
  }
  const ivek = [
    ['gyülekezeti', buildSzamadasReport({ ...kozos, congregationName: 'Barátosi Református Egyházközség' })],
    [
      'megyei',
      buildSzamadasReport({
        ...kozos,
        congregationName: 'Kézdi-Orbai Református Egyházmegye',
        printScope: 'diocese',
        districtName: 'Erdélyi Református Egyházkerület',
      }),
    ],
    [
      'kerületi',
      buildSzamadasReport({
        ...kozos,
        congregationName: 'Erdélyi Református Egyházkerület',
        printScope: 'district',
      }),
    ],
  ]

  for (const [nev, iv] of ivek) {
    const jelzett = jelzettLapszam(iv.html)
    const valodi = valodiLapok(iv.html)
    const regi = regiSzamlalo(iv.html)

    if (!iv.html.includes('<div class="page-footer">')) {
      fail(`K4c (${nev}) a valódi ív már NEM tartalmaz \`<div class="page-footer">\`-t — a K4a teszt-HTML elszakadt a valóságtól`)
      continue
    }
    if (valodi < 2) {
      fail(`K4c (${nev}) a valódi ív csak ${valodi} lapos — többlapos ív kell, különben a mérce nem mond semmit`)
      continue
    }
    if (jelzett === valodi) {
      ok(`K4c (${nev}) a valódi Számadás jelzett lapszáma = valódi lapszám (${valodi})`)
    } else {
      fail(
        `K4c (${nev}) A PDF-MENTÉS ELHASALNA: data-sheet-count=${jelzett}, a DOM-ban ${valodi} lap lesz. ` +
          'A print-engine-v2.ts eltérésnél „A nyomtatvány nem töltött be hiánytalanul” hibát dob.',
      )
    }
    if (regi <= valodi) {
      fail(
        `K4d (${nev}) negatív asszert VAK: a régi minta ${regi}-et ad ${valodi} valódi lapra — ` +
          'a hibás számolás már nem reprodukálható, nézd át a mércét',
      )
    } else {
      ok(`K4d (${nev}) negatív asszert: a régi minta ${regi}-et adna ${valodi} valódi lapra`)
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// K5 · A GYÜLEKEZETI ÉS A MEGYEI ÁG VÁLTOZATLAN
// ════════════════════════════════════════════════════════════════════════════
// ~500 gyülekezet + 25 egyházmegye ÉLES ívéről van szó: a kerületi ág
// megnyitása nem mozdíthatta el őket.
{
  for (const sz of ['congregation', 'diocese']) {
    const k = nyomtatvanyScope(sz)
    if (k === sz) ok(`K5 nyomtatvanyScope('${sz}') === '${sz}' — a kapu változatlan`)
    else fail(`K5 a '${sz}' kapu ELMOZDULT: ${JSON.stringify(k)}`)
  }

  const gy = ujNaplo()
  await loadEvBeallitas(hamisSupabase(gy), 'congregation', 'c-1', 2026)
  const gyEq = Object.fromEntries(gy.eq)
  if (gy.tabla === 'bealitas' && gyEq.congregation_id === 'c-1' && gyEq.id === '2026') {
    ok("K5b a gyülekezeti ág változatlan: `bealitas` / `congregation_id` / `id = '2026'` (SZÖVEGES év)")
  } else {
    fail(`K5b a GYÜLEKEZETI ág elmozdult: tábla=${JSON.stringify(gy.tabla)}, szűrők=${JSON.stringify(gy.eq)}`)
  }

  const me = ujNaplo()
  await loadEvBeallitas(hamisSupabase(me), 'diocese', 'm-1', 2026)
  const meEq = Object.fromEntries(me.eq)
  if (me.tabla === 'diocese_bealitas' && meEq.diocese_id === 'm-1' && meEq.eve === 2026) {
    ok('K5c a megyei ág változatlan: `diocese_bealitas` / `diocese_id` / `eve = 2026`')
  } else {
    fail(`K5c a MEGYEI ág elmozdult: tábla=${JSON.stringify(me.tabla)}, szűrők=${JSON.stringify(me.eq)}`)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// K6 · NEGATÍV ASSZERTEK — A MÉRCÉK TUDJANAK PIROSRA VÁLTANI
// ════════════════════════════════════════════════════════════════════════════
// Egy őrszem, ami sosem tud bukni, rosszabb a semminél. Minden mutáns a RÉGI /
// hibás alakot játssza újra, és azt bizonyítjuk, hogy a fenti mérce ELBUKNA rajta.
// (A K4 negatív asszertje a K4b/K4d-ben, a mért tartalmon áll.)

/** M1 — a kerületi `case` kiesik a kapuból (K1 mércéje). */
try {
  const m = mutans(
    F_PRINT_SCOPE,
    'print-scope-m1',
    (kod) => {
      const i = kod.indexOf('export function nyomtatvanyScope')
      return kod.slice(0, i) + kod.slice(i).replace(/^[ \t]*case 'district':[ \t]*$/m, '')
    },
    { stubs: PRINT_SCOPE_STUBS },
  )
  const k = m.nyomtatvanyScope('district')
  if (k === 'district') {
    fail('K6/M1 negatív asszert VAK: a kerületi `case` nélkül IS `district` jött vissza — a K1 nem mér semmit')
  } else {
    ok(`K6/M1 negatív asszert: a kerületi ág nélkül a kapu ${JSON.stringify(k)}-t ad → a K1 elbukna rajta`)
  }
} catch (e) {
  fail(`K6/M1 mutáns hiba: ${e?.message || e}`)
}

/** M2 — a `nyomtatvanyScope` default ága ÚJRA DOB (a 2026-08-22 előtti alak; K2). */
try {
  const m = mutans(
    F_PRINT_SCOPE,
    'print-scope-m2',
    (kod) =>
      kod.replace(
        /void _nemKezelt\s*\n\s*return null/,
        "throw new Error('Ismeretlen nyomtatvány-hatókör')",
      ),
    { stubs: PRINT_SCOPE_STUBS },
  )
  let dobott = false
  try {
    m.nyomtatvanyScope(ISMERETLEN)
  } catch {
    dobott = true
  }
  if (dobott) ok('K6/M2 negatív asszert: a régi, DOBÓ default ágon a K2 elbukna')
  else fail('K6/M2 negatív asszert VAK: a dobó mutáns sem dobott — a K2 nem mér semmit')
} catch (e) {
  fail(`K6/M2 mutáns hiba: ${e?.message || e}`)
}

/** M3 — a `loadEvBeallitas` default ága ÚJRA DOB → a külső catch `'lekerdezes_hiba'`-t ad (K2b). */
try {
  const m = mutans(
    F_PRINT_SCOPE,
    'print-scope-m3',
    (kod) =>
      kod.replace(
        /void _nemKezelt\s*\n\s*return \{ row: null, ok: false, hibaOk: 'nincs_nyomtatvany_ag' \}/,
        "throw new Error('nincs ág')",
      ),
    { stubs: PRINT_SCOPE_STUBS },
  )
  const r = await m.loadEvBeallitas(hamisSupabase(ujNaplo()), ISMERETLEN, 'id-1', 2026)
  if (r.hibaOk === 'lekerdezes_hiba') {
    ok("K6/M3 negatív asszert: a dobó ágon a hibaok `'lekerdezes_hiba'`-vá szelídül → a K2b elbukna rajta")
  } else {
    fail(`K6/M3 negatív asszert VAK: a dobó mutáns is ${JSON.stringify(r.hibaOk)}-ot ad — a K2b nem mér semmit`)
  }
} catch (e) {
  fail(`K6/M3 mutáns hiba: ${e?.message || e}`)
}

/** M4 — a kerületi ág a GYÜLEKEZETI `bealitas` táblát olvasná (K3). */
try {
  const m = mutans(
    F_PRINT_SCOPE,
    'print-scope-m4',
    (kod) => kod.replace(".from('district_bealitas')", ".from('bealitas')"),
    { stubs: PRINT_SCOPE_STUBS },
  )
  const naplo = ujNaplo()
  await m.loadEvBeallitas(hamisSupabase(naplo), 'district', 'd-1', 2026)
  if (naplo.tabla === 'district_bealitas') {
    fail('K6/M4 negatív asszert VAK: a mutáns is `district_bealitas`-t olvas — a K3 nem mér semmit')
  } else {
    ok(`K6/M4 negatív asszert: rossz táblánál a napló ${JSON.stringify(naplo.tabla)} → a K3 elbukna rajta`)
  }
} catch (e) {
  fail(`K6/M4 mutáns hiba: ${e?.message || e}`)
}

/** M5 — a kerületi szűrő oszlopa `diocese_id` maradna (K3b). */
try {
  const m = mutans(
    F_PRINT_SCOPE,
    'print-scope-m5',
    (kod) => kod.replace(".eq('district_id', scopeId)", ".eq('diocese_id', scopeId)"),
    { stubs: PRINT_SCOPE_STUBS },
  )
  const naplo = ujNaplo()
  await m.loadEvBeallitas(hamisSupabase(naplo), 'district', 'd-1', 2026)
  const eqMap = Object.fromEntries(naplo.eq)
  if (eqMap.district_id === 'd-1') {
    fail('K6/M5 negatív asszert VAK: a mutáns is `district_id`-re szűr — a K3b nem mér semmit')
  } else {
    ok(`K6/M5 negatív asszert: rossz oszlopnál a szűrők ${JSON.stringify(naplo.eq)} → a K3b/K3c elbukna rajta`)
  }
} catch (e) {
  fail(`K6/M5 mutáns hiba: ${e?.message || e}`)
}

/** M6 — a megyei ág a kerületi táblára csúszna (K5c: a felső szintek ne keveredjenek). */
try {
  const m = mutans(
    F_PRINT_SCOPE,
    'print-scope-m6',
    (kod) => kod.replace(".from('diocese_bealitas')", ".from('district_bealitas')"),
    { stubs: PRINT_SCOPE_STUBS },
  )
  const naplo = ujNaplo()
  await m.loadEvBeallitas(hamisSupabase(naplo), 'diocese', 'm-1', 2026)
  if (naplo.tabla === 'diocese_bealitas') {
    fail('K6/M6 negatív asszert VAK: a mutáns is `diocese_bealitas`-t olvas — a K5c nem mér semmit')
  } else {
    ok(`K6/M6 negatív asszert: a megyei ág elcsúsztatva ${JSON.stringify(naplo.tabla)} → a K5c elbukna rajta`)
  }
} catch (e) {
  fail(`K6/M6 mutáns hiba: ${e?.message || e}`)
}

/**
 * M7 — a `wrapBudget` VISSZAKAPJA a régi, előtag-illeszkedő mintát (K4).
 *
 * MIÉRT MUTÁNS ÉS NEM CSAK A K4b: a K4b a régi regexet a TESZTBEN játssza újra,
 * tehát azt bizonyítja, hogy a két minta MÁST ad. Ez viszont a VALÓDI függvényt
 * rontja el, és megmutatja, hogy ilyenkor a K4a mércéje (2) tényleg elbukik —
 * vagyis a mérce a `wrapBudget`-et méri, nem egy teszt-beli másolatát.
 */
try {
  const m = mutans(
    F_REPORTING,
    'budget-reporting-m7',
    (kod) => kod.replace('/<div class="page[ "]/g', '/<div class="page/g'),
    { farok: 'exports.__wrapBudgetTeszthorog = typeof wrapBudget === "function" ? wrapBudget : null;' },
  )
  const jelzett = jelzettLapszam(m.__wrapBudgetTeszthorog('Teszt', MINI))
  if (jelzett === 2) {
    fail('K6/M7 negatív asszert VAK: a régi mintával IS 2 jött ki — a K4a nem a `wrapBudget`-et méri')
  } else {
    ok(`K6/M7 negatív asszert: a régi mintás \`wrapBudget\` ${jelzett}-et jelez 2 valódi lapra → a K4a elbukna rajta`)
  }
} catch (e) {
  fail(`K6/M7 mutáns hiba: ${e?.message || e}`)
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nKerületi nyomtatvány-ág önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nKerületi nyomtatvány-ág önellenőrzés: minden zöld')
