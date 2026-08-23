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
 * 2026-08-22 (6. pont — ROMÁN NYOMTATVÁNY-NEVEK) — ide bővítve:
 *   · packages/ui-app/src/finance/entity-name.ts — a KÖZÖS kétnyelvű név-építő
 *                                                  (K7),
 *   · packages/ui-app/src/finance/reporting.ts   — Registru Casa, BORDEROU DE
 *                                                  PLĂȚI, nyugtatömb (K8),
 *   · packages/core/.../chitanta/print.ts        — a kerületi román név ADATBÓL
 *                                                  jön, nem hardkódolt `null` (K9a),
 *   · apps/web/.../chitanta-print-template.tsx   — a fejléc NEM talál ki nevet
 *                                                  a címerből (K9b),
 *   · budget-reporting.ts felettes blokk         — valódi `districts.nev_ro`
 *                                                  a hardkódolt felirat helyett (K10).
 *
 * 2026-08-23 (kisebb rések, 4. — HIÁNYZÓ ROMÁN NÉV) — ide bővítve:
 *   · apps/web/.../budget-print-dialog.tsx      — a KÖZÖS figyelmeztetés-helperek
 *                                                  (`romanNevFigyelmeztetes`,
 *                                                  `romanNevHianyzik`,
 *                                                  `kiallitoNeveHianyzik`,
 *                                                  `RomanNevFigyelmeztetesSav`),
 *   · apps/web/.../finance-print-dialog.tsx     — ugyanazok bekötve (K11).
 *
 * ⛔ A K11 LEGFONTOSABB ÁLLÍTÁSA NEGATÍV: a hiányzó ROMÁN név FIGYELMEZTET, de
 *    SOHA NEM TILT. Élesben MIND A 25 egyházmegye `nev_ro` mezője üres (Endre
 *    ellenőrző SQL-je, 2026-08-22) — egy tiltó kapu itt kizárná őket a saját
 *    hivatalos ívükből. A K11e + M12 mutáns pontosan azt méri, hogy ha valaki
 *    „szimmetrizálja" a kaput, a merce PIROSRA VÁLT.
 *
 * ⚠️ A CHITANȚA HIBÁJA KÉT FÁJLBAN ÉLT (elavult TODO a magban + címer-találgatás
 *    a sablonban), és az egyik javítása ELREJTETTE volna a másikat — ezért KÉT
 *    KÜLÖN MUTÁNS őrzi (K9/M9 és K9/M10).
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
// 2026-08-22 (6. pont — román nyomtatvány-nevek)
const F_ENTITY = path.join(REPO_ROOT, 'packages', 'ui-app', 'src', 'finance', 'entity-name.ts')
const F_FIN_REPORTING = path.join(REPO_ROOT, 'packages', 'ui-app', 'src', 'finance', 'reporting.ts')
const F_CHITANTA_PRINT = path.join(REPO_ROOT, 'packages', 'core', 'src', 'finance', 'chitanta', 'print.ts')
const F_CHITANTA_TPL = path.join(
  REPO_ROOT, 'apps', 'web', 'components', 'finance', 'chitanta-print-template.tsx',
)
// 2026-08-23 (kisebb rések, 4.): a hiányzó ROMÁN névre figyelmeztető sáv — a
// KÖZÖS helperek a Költségvetés-központban élnek, a Pénzügyi központ importálja.
const F_BUDGET_DIALOG = path.join(
  REPO_ROOT, 'apps', 'web', 'components', 'finance', 'budget-print-dialog.tsx',
)
const F_FINANCE_DIALOG = path.join(
  REPO_ROOT, 'apps', 'web', 'components', 'finance', 'finance-print-dialog.tsx',
)

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

for (const f of [
  F_PRINT_SCOPE, F_REPORTING, F_ENTITY, F_FIN_REPORTING, F_CHITANTA_PRINT, F_CHITANTA_TPL,
  F_BUDGET_DIALOG, F_FINANCE_DIALOG,
]) {
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
function loadTs(srcFile, outName, { stubs = {}, transform = null, farok = '', tsx = false } = {}) {
  let code = fs.readFileSync(srcFile, 'utf8')
  if (transform) code = transform(code)
  const out = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      // 2026-08-22: a Chitanța-sablon `.tsx` — a KLASSZIKUS (React.createElement)
      // kibocsátást kérjük, mert a `react-jsx` runtime egy `react/jsx-runtime`
      // require-t tenne a modul tetejére, amit a pótlék-rendszer HANGOSAN
      // elutasítana. Komponenst nem renderelünk, csak TISZTA függvényt hívunk.
      jsx: tsx ? ts.JsxEmit.React : undefined,
    },
    fileName: outName + (tsx ? '.tsx' : '.ts'),
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
let scopeMod, reportMod, entityMod, finReportMod, chitantaTplMod
/**
 * 2026-08-22 (6. pont): a `budget-reporting.ts` és a `reporting.ts` MOSTANTÓL a
 * közös `./entity-name` helpert importálja. A pótlék NEM hamisítvány: a VALÓDI,
 * lefordított modult adjuk vissza — így a mérce a teljes láncot méri.
 */
let REPORTING_STUBS = {}
try {
  entityMod = loadTs(F_ENTITY, 'entity-name')
  REPORTING_STUBS = { './entity-name': entityMod }
  scopeMod = loadTs(F_PRINT_SCOPE, 'print-scope', { stubs: PRINT_SCOPE_STUBS })
  // A `wrapBudget` modul-belső (nem exportált), ezért teszt-horoggal tesszük
  // láthatóvá — a függvény TÖRZSE érintetlen marad, azt futtatjuk.
  reportMod = loadTs(F_REPORTING, 'budget-reporting', {
    stubs: REPORTING_STUBS,
    farok: 'exports.__wrapBudgetTeszthorog = typeof wrapBudget === "function" ? wrapBudget : null;',
  })
  finReportMod = loadTs(F_FIN_REPORTING, 'finance-reporting', { stubs: REPORTING_STUBS })
  // A Chitanța-sablon fejléc-döntése (`fejlecNevek`) modul-belső — teszt-horoggal
  // tesszük láthatóvá. A React-komponenseket NEM rendereljük.
  chitantaTplMod = loadTs(F_CHITANTA_TPL, 'chitanta-tpl', {
    tsx: true,
    stubs: { '@/lib/utils/number-to-words': { amountInWordsHu: () => '', amountInWordsRo: () => '' } },
    farok: 'exports.__fejlecNevekTeszthorog = typeof fejlecNevek === "function" ? fejlecNevek : null;',
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
    {
      stubs: REPORTING_STUBS,
      farok: 'exports.__wrapBudgetTeszthorog = typeof wrapBudget === "function" ? wrapBudget : null;',
    },
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


// ════════════════════════════════════════════════════════════════════════════
// K7 · A KÖZÖS KÉTNYELVŰ NÉV-ÉPÍTŐ LÉTEZIK ÉS BETARTJA A SZABÁLYT
// ════════════════════════════════════════════════════════════════════════════
// 2026-08-22 (6. pont). A szabály (Endre döntése):
//   · van román név  → „MAGYAR NÉV / ROMÁN NÉV"
//   · nincs román név → CSAK a magyar, SABLON-KIEGÉSZÍTÉS NÉLKÜL
// A tét: hivatalos, aláírható iraton a kitalált román név HAMIS ADAT.
const HU = 'Kézdi-Orbai Református Egyházmegye'
const RO = 'Protopopiatul Reformat Chezdi-Orbai'
const hivatalosKetnyelvuNev = entityMod?.hivatalosKetnyelvuNev

if (typeof hivatalosKetnyelvuNev !== 'function') {
  fail(
    'K7 a `packages/ui-app/src/finance/entity-name.ts` nem exportál ' +
      '`hivatalosKetnyelvuNev` függvényt — a 12+ nyomtatvány közös név-építője eltűnt, ' +
      'és a felületek megint széthúzhatnak.',
  )
} else {
  const ketto = hivatalosKetnyelvuNev(HU, RO)
  if (ketto === `${HU} / ${RO}`) ok('K7a mindkét név megvan → „MAGYAR / ROMÁN"')
  else fail(`K7a rossz kétnyelvű alak: ${JSON.stringify(ketto)}`)

  for (const uresRo of [null, undefined, '', '   ']) {
    const csakHu = hivatalosKetnyelvuNev(HU, uresRo)
    if (csakHu !== HU) {
      fail(
        `K7b ÜRES ROMÁN NÉVNÉL (${JSON.stringify(uresRo)}) nem a puszta magyar név jött, ` +
          `hanem ${JSON.stringify(csakHu)} — sablon-kiegészítés vagy elválasztó került a papírra.`,
      )
    }
  }
  ok('K7b üres/hiányzó román névnél CSAK a magyar név — elválasztó és sablon nélkül')

  const roElol = hivatalosKetnyelvuNev(HU, RO, { elol: 'ro' })
  if (roElol === `${RO} / ${HU}`) ok("K7c `elol: 'ro'` → a ROMÁN név áll elöl (a román nyelvű Fișa fejléce)")
  else fail(`K7c a román-elsős sorrend elromlott: ${JSON.stringify(roElol)}`)

  const nagy = hivatalosKetnyelvuNev(HU, RO, { nagybetus: true })
  if (nagy === `${HU.toLocaleUpperCase('hu-HU')} / ${RO.toLocaleUpperCase('ro-RO')}`) {
    ok('K7d `nagybetus` → mindkét rész NAGYBETŰS (a hivatalos borító-fejléc alakja)')
  } else {
    fail(`K7d a nagybetűs alak elromlott: ${JSON.stringify(nagy)}`)
  }

  // ⛔ SOHA NE GENERÁLJON: hiányzó MAGYAR névnél sem tesz oda semmit magától.
  const csakRo = hivatalosKetnyelvuNev('', RO)
  if (csakRo === RO) ok('K7e hiányzó MAGYAR névnél a román áll egyedül — nincs generikus pótlás')
  else fail(`K7e hiányzó magyar névnél ${JSON.stringify(csakRo)} jött — kitalált szöveg került a papírra`)
}

// ════════════════════════════════════════════════════════════════════════════
// K8 · A HELPERT TÉNYLEG HASZNÁLJÁK — MEGGENERÁLT NYOMTATVÁNYOKON MÉRVE
// ════════════════════════════════════════════════════════════════════════════
// Nem a forrásszöveget nézzük: a VALÓDI buildereket futtatjuk, és a KIMENETBEN
// keressük mindkét nevet. Így az assert akkor is fog, ha valaki „csak" a hívást
// írja vissza a régi `nev_ro || magyar` vagy-láncra.
const { buildFinancePrintDocument, buildKiadasiKiseroiv } = finReportMod || {}

/** Közös adat-váz a pénzügyi regiszterekhez. */
const finData = (nameRo) => ({
  income: [],
  expense: [],
  bankAccounts: [],
  cellek: [],
  bevCelMap: {},
  kiaCelMap: {},
  congregationName: HU,
  congregationNameRo: nameRo,
  carryoverCash: 0,
  carryoverBank: 0,
  nyugtatombok: [],
})

if (typeof buildFinancePrintDocument !== 'function' || typeof buildKiadasiKiseroiv !== 'function') {
  fail(
    'K8 a `packages/ui-app/src/finance/reporting.ts` nem exportálja a ' +
      '`buildFinancePrintDocument` / `buildKiadasiKiseroiv` függvényt — a román regiszterek mércéje vak lett',
  )
} else {
  // K8a · Számadás-borító (budget-reporting) — a helper bekötve maradt-e
  {
    const iv = buildSzamadasReport({
      cellek: [{ id: '101', type: 'B', nev: 'Egyházfenntartói járulék', sorszam: 1 }],
      budgetRows: {},
      actualIncome: {},
      actualExpense: {},
      year: 2026,
      carryoverCash: 0,
      carryoverBank: 0,
      congregationName: HU,
      congregationNameRo: RO,
    })
    const huUp = HU.toLocaleUpperCase('hu-HU')
    const roUp = RO.toLocaleUpperCase('ro-RO')
    if (iv.html.includes(huUp) && iv.html.includes(roUp)) {
      ok('K8a a Számadás-ív fejléce MINDKÉT hivatalos nevet viseli (a közös helperen át)')
    } else {
      fail(
        `K8a a Számadás-ív fejlécéből kimaradt egy név (magyar: ${iv.html.includes(huUp)}, ` +
          `román: ${iv.html.includes(roUp)})`,
      )
    }
  }

  // K8b · REGISTRU CASA — EZ VOLT A BEJELENTETT TÜNET
  {
    const iv = buildFinancePrintDocument('registru_casa', finData(RO), { year: 2026, month: 3 })
    if (iv.html.includes(HU) && iv.html.includes(RO)) {
      ok('K8b REGISTRU CASA: a fejléc mindkét nevet viseli')
    } else {
      fail(
        `K8b REGISTRU CASA fejléc HIÁNYOS (magyar: ${iv.html.includes(HU)}, román: ${iv.html.includes(RO)}) — ` +
          'ez a képernyőképen jelentett hiba: a végig román íven MAGYAR név állt egyedül.',
      )
    }

    // A NÉMA VISSZAESÉS ellenpróbája: román név NÉLKÜL a magyar áll ott, de
    // sablon-kiegészítés NÉLKÜL (nem kerül oda kitalált román alak).
    const ivRoNelkul = buildFinancePrintDocument('registru_casa', finData(undefined), { year: 2026, month: 3 })
    if (ivRoNelkul.html.includes(HU) && !ivRoNelkul.html.includes('PAROHIA') && !ivRoNelkul.html.includes('PROTOPOPIAT')) {
      ok('K8c román név nélkül CSAK a magyar név — kitalált román alak nem került a lapra')
    } else {
      fail('K8c román név nélkül SABLON-SZÖVEG került a Registru Casa fejlécébe')
    }
  }

  // K8d · BORDEROU DE PLĂȚI (kiadási kísérőív) — eddig NEM VOLT román név-ága
  {
    const iv = buildKiadasiKiseroiv({
      expenses: [],
      date: '2026-03-14',
      pageNumber: 1,
      congregationName: HU,
      congregationNameRo: RO,
      kiaCelMap: {},
      cellek: [],
    })
    if (iv.html.includes(HU) && iv.html.includes(RO)) {
      ok('K8d BORDEROU DE PLĂȚI: a fejléc mindkét nevet viseli (új román név-ág)')
    } else {
      fail(
        `K8d a kísérőív fejléce HIÁNYOS (magyar: ${iv.html.includes(HU)}, román: ${iv.html.includes(RO)}) — ` +
          'a román név-ág nincs bekötve',
      )
    }
  }

  // K8e · Nyugtatömb-kimutatás — a `congregationNameRo` MÁR AZ ADATBAN VOLT,
  // csak senki nem olvasta.
  {
    const iv = buildFinancePrintDocument('nyugtatomb_kimutatas', finData(RO), { year: 2026 })
    if (iv.html.includes(HU) && iv.html.includes(RO)) {
      ok('K8e Nyugtatömb-kimutatás: a fejléc mindkét nevet viseli')
    } else {
      fail(`K8e a nyugtatömb-kimutatás fejléce HIÁNYOS (magyar: ${iv.html.includes(HU)}, román: ${iv.html.includes(RO)})`)
    }
  }

  // ── NEGATÍV ASSZERT (M8): a RÉGI `nev_ro || magyar` vagy-lánc visszaírása ──
  // A valódi `reporting.ts`-t rontjuk el, és bizonyítjuk, hogy a K8b elbukna.
  try {
    const m = mutans(
      F_FIN_REPORTING,
      'finance-reporting-m8',
      (kod) =>
        kod.replace(
          'return esc(hivatalosKetnyelvuNev(data.congregationName, data.congregationNameRo))',
          'return esc(data.congregationNameRo || data.congregationName)',
        ),
      { stubs: REPORTING_STUBS },
    )
    const iv = m.buildFinancePrintDocument('registru_casa', finData(RO), { year: 2026, month: 3 })
    if (iv.html.includes(HU)) {
      fail('K8/M8 negatív asszert VAK: a régi vagy-lánccal IS kiment a magyar név — a K8b nem mér semmit')
    } else {
      ok('K8/M8 negatív asszert: a régi `nev_ro || magyar` lánccal a MAGYAR név eltűnik → a K8b elbukna rajta')
    }
  } catch (e) {
    fail(`K8/M8 mutáns hiba: ${e?.message || e}`)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// K9 · CHITANȚA — A KITALÁLT ADAT KÉT KÜLÖN FÁJLBAN ÉLT
// ════════════════════════════════════════════════════════════════════════════
// A nyugta kerületi ROMÁN neve KÉT helyen romlott el, és az egyik javítása
// ELREJTETTE volna a másikat:
//   (1) `packages/core/.../chitanta/print.ts` — egy ELAVULT TODO miatt
//       hardkódoltan `null`-t adott (az S2 szelet 2026-08-16-án lefutott);
//   (2) `chitanta-print-template.tsx` — a hiányt a HÁTTÉR-CÍMERBŐL találgatta.
// Ezért KÉT KÜLÖN MUTÁNS kell.

// ── K9a · a print.ts VALÓBAN az adatból veszi a kerületi román nevet ────────
/**
 * A forrás KOMMENTEK NÉLKÜL — a TS fordítójával kiszedve, nem regexszel.
 * (Kommenttel a mérce vak lenne: a régi alak a magyarázó szövegben is szerepel.)
 *
 * 2026-08-23: `tsx` opció — a `.tsx` fájloknál a JSX is ki lesz fordítva
 * (`React.createElement(...)`), tehát egy komponens HASZNÁLATA is mérhető, nem
 * csak a neve említése.
 */
function kodKommentekNelkul(file, { tsx = false, szoveg = null } = {}) {
  return ts.transpileModule(szoveg ?? fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      removeComments: true,
      jsx: tsx ? ts.JsxEmit.React : undefined,
    },
    fileName: 'kommentmentes' + (tsx ? '.tsx' : '.ts'),
  }).outputText
}

/**
 * 2026-08-23 (kisebb rések, 4.): A NYOMTATÁST TILTÓ `nevHianyzik` kapu TISZTA-E,
 * vagyis hivatkozik-e BÁRHOL a ROMÁN névre.
 *
 * KÉT dolgot néz a KOMMENTMENTES, JSX-ből kifordított kódban:
 *  (1) a `const nevHianyzik = …` értékadás jobb oldala nem említ román nevet;
 *  (2) egyetlen utasításban sem szerepel EGYÜTT egy „román" azonosító és egy
 *      tiltó azonosító (`blocked`, `magyarazoElonezet`, `blockedPreview`) —
 *      így az sem csúszik át, ha valaki a `buildReport` elejére tesz be egy
 *      külön korai visszatérést.
 */
function nevKapuTisztaE(kod) {
  const ROMAN = /roman(?:Nev|Figyelmeztetes)|congregationNameRo|districtNameRo/
  const TILTO = /\bblocked\b|magyarazoElonezet|blockedPreview/

  const m = /\bconst nevHianyzik\s*=\s*([^\n;]*)/.exec(kod)
  if (!m) {
    return { ok: false, indok: 'nincs `const nevHianyzik = …` értékadás — a mérce célpontja eltűnt' }
  }
  if (ROMAN.test(m[1])) {
    return { ok: false, indok: `a kapu jobb oldala román nevet említ: ${JSON.stringify(m[1].trim())}` }
  }

  for (const utasitas of kod.split(/[;\n]/)) {
    if (ROMAN.test(utasitas) && TILTO.test(utasitas)) {
      return { ok: false, indok: `tiltó ág román névre hivatkozik: ${JSON.stringify(utasitas.trim().slice(0, 120))}` }
    }
  }
  return { ok: true, indok: 'tiszta' }
}

/** A print.ts mércéje: a kerületi román név ADATBÓL jön, nem hardkódolt null. */
function keruletiRoNevBekotve(kod) {
  const rosszSelect = kod.includes(".from('districts')") && !/\.select\('name,\s*nev_ro'\)/.test(kod)
  // ⚠️ A DEKLARÁCIÓ (`let egyhazkeruletNevRo = null`) NEM hiba — az a változó
  // kezdőértéke. Csak a KÉSŐBBI, `let` nélküli értékadás jelenti a hardkódolt
  // visszaesést (a régi, elavult TODO alakja).
  const hardkodoltNull = /(?<!(?:let|var|const)\s)egyhazkeruletNevRo\s*=\s*null/.test(kod)
  const adatbol = /egyhazkeruletNevRo\s*=\s*dd\.nev_ro/.test(kod)
  return { ok: !rosszSelect && !hardkodoltNull && adatbol, rosszSelect, hardkodoltNull, adatbol }
}

{
  const kod = kodKommentekNelkul(F_CHITANTA_PRINT)
  const r = keruletiRoNevBekotve(kod)
  if (r.ok) {
    ok('K9a a Chitanța kerületi ROMÁN neve az ADATBÓL jön (`districts.nev_ro`), nem hardkódolt `null`')
  } else {
    fail(
      'K9a a Chitanța kerületi román neve NEM adatból jön ' +
        `(select hiányos: ${r.rosszSelect}, hardkódolt null: ${r.hardkodoltNull}, adat-értékadás: ${r.adatbol}) — ` +
        'a sablon ilyenkor TALÁLGATÁSSAL pótol egy sorszámozott, aláírható bizonylaton.',
    )
  }

  // NEGATÍV ASSZERT (M9): a régi, hardkódolt `null` visszaírása.
  const mutalt = kod
    .replace(/\.select\('name,\s*nev_ro'\)/, ".select('name')")
    .replace(/egyhazkeruletNevRo\s*=\s*dd\.nev_ro[^\n;]*/, 'egyhazkeruletNevRo = null')
  if (mutalt === kod) {
    fail('K9/M9 negatív asszert VAK: a MUTÁCIÓ NEM FOGOTT a chitanta/print.ts-en — igazítsd a mintát')
  } else if (keruletiRoNevBekotve(mutalt).ok) {
    fail('K9/M9 negatív asszert VAK: a hardkódolt `null`-os mutáns is átmegy a K9a mércéjén')
  } else {
    ok('K9/M9 negatív asszert: a régi, hardkódolt `null` visszaírásán a K9a elbukna')
  }
}

// ── K9b · a SABLON nem talál ki kerületnevet a címerből ─────────────────────
const fejlecNevek = chitantaTplMod?.__fejlecNevekTeszthorog
/** Kerület nélküli nyugta-adat: az EREK/KEREK címer-felismerés is „üres". */
const NYUGTA_RO_NELKUL = {
  egyhazkeruletNevHu: 'Erdélyi Református Egyházkerület',
  egyhazkeruletNevRo: null,
  egyhazmegyeNevHu: HU,
  egyhazmegyeNevRo: null,
  gyulekezet: { nevHu: 'Barátosi Református Egyházközség', nevRo: null },
}

if (typeof fejlecNevek !== 'function') {
  fail(
    'K9b a `chitanta-print-template.tsx` `fejlecNevek` függvénye eltűnt vagy átnevezték — ' +
      'a címer-találgatás mércéje vak lett. Ha átnevezted, igazítsd a teszt-horgot; NE hagyd zöldön.',
  )
} else {
  const n = fejlecNevek(NYUGTA_RO_NELKUL)
  if (n.keruletRo === null && n.megyeRo === null && n.gyulekezetRo === null) {
    ok('K9b román név nélkül MINDHÁROM román fejléc-sor elmarad — nincs címerből/prefixből gyártott név')
  } else {
    fail(
      'K9b KITALÁLT ROMÁN NÉV kerülne a nyugtára: ' +
        `kerület=${JSON.stringify(n.keruletRo)}, megye=${JSON.stringify(n.megyeRo)}, ` +
        `gyülekezet=${JSON.stringify(n.gyulekezetRo)}`,
    )
  }

  // A magyar oldal sem pótol generikus sablonnal (az egy MÁSIK gyülekezetre is illene).
  const ures = fejlecNevek({ gyulekezet: {} })
  if (ures.keruletHu === null && ures.megyeHu === null && ures.gyulekezetHu === null) {
    ok('K9c név nélküli adatnál a MAGYAR sorok is elmaradnak — nincs „REFORMÁTUS EGYHÁZKÖZSÉG" sablon')
  } else {
    fail(`K9c generikus MAGYAR sablon került a nyugtára: ${JSON.stringify(ures)}`)
  }

  // Ami MEGVAN, az kimegy — a prefix-duplázás védelmével együtt (ez HASZNOS, marad).
  const tele = fejlecNevek({
    egyhazkeruletNevHu: 'Erdélyi Református Egyházkerület',
    egyhazkeruletNevRo: 'Eparhia Reformată din Ardeal',
    egyhazmegyeNevHu: HU,
    egyhazmegyeNevRo: 'Protopopiatul Reformat Chezdi-Orbai',
    gyulekezet: { nevHu: 'Barátosi Református Egyházközség', nevRo: 'Parohia Reformată Brateș' },
  })
  const duplazasNelkul = (tele.gyulekezetRo.match(/PAROHIA/g) || []).length === 1
  if (tele.keruletRo === 'EPARHIA REFORMATĂ DIN ARDEAL' && duplazasNelkul) {
    ok('K9d a meglévő nevek kimennek, és a prefix-duplázás védelme megmaradt')
  } else {
    fail(`K9d a meglévő nevek kiírása romlott el: ${JSON.stringify(tele)}`)
  }

  // ── NEGATÍV ASSZERT (M10): a CÍMER-FALLBACK visszaírása ──────────────────
  // KÜLÖN mutáns a K9/M9-től: a két hiba KÉT FÁJLBAN élt, és az egyik javítása
  // elrejtette volna a másikat.
  try {
    const m = mutans(
      F_CHITANTA_TPL,
      'chitanta-tpl-m10',
      (kod) =>
        kod.replace(
          'return ro ? ro.toUpperCase() : null',
          "return ro ? ro.toUpperCase() : (districtEmblemSrc(data) === '/KEREK.png' " +
            "? 'EPARHIA REFORMATĂ DE PE LÂNGĂ PIATRA CRAIULUI' : 'EPARHIA REFORMATĂ DIN ARDEAL')",
        ),
      {
        tsx: true,
        stubs: { '@/lib/utils/number-to-words': { amountInWordsHu: () => '', amountInWordsRo: () => '' } },
        farok: 'exports.__fejlecNevekTeszthorog = typeof fejlecNevek === "function" ? fejlecNevek : null;',
      },
    )
    const n = m.__fejlecNevekTeszthorog(NYUGTA_RO_NELKUL)
    if (n.keruletRo === null) {
      fail('K9/M10 negatív asszert VAK: a címer-fallbackes mutáns is `null`-t ad — a K9b nem mér semmit')
    } else {
      ok(`K9/M10 negatív asszert: a címer-fallback ${JSON.stringify(n.keruletRo)}-t találna ki → a K9b elbukna rajta`)
    }
  } catch (e) {
    fail(`K9/M10 mutáns hiba: ${e?.message || e}`)
  }
}


// ════════════════════════════════════════════════════════════════════════════
// K10 · A MEGYEI BORÍTÓ FELETTES BLOKKJA — VALÓDI KERÜLETI ROMÁN NÉV
// ════════════════════════════════════════════════════════════════════════════
// A megyei ív felső blokkjában eddig HARDKÓDOLT „/ EPARHIA REFORMATĂ" állt: a
// magyar sor a VALÓDI kerületet nevezte meg, a román viszont csak a hivatal
// típusát — a papír két nyelven mást mondott.
//
// ⚠️ A TARTALÉK SZÁNDÉKOSAN MARAD: ha a kerületnek nincs rögzített `nev_ro`-ja,
// a mai „EPARHIA REFORMATĂ" felirat áll ott (Endre döntése). Ez NEM sérti a
// „soha ne generálj román nevet" szabályt: nem NÉV, hanem hivatal-megnevezés —
// ahogy a mellette álló magyar sor is „REFORMÁTUS EGYHÁZKERÜLET"-re esik vissza.
{
  const megyeiIv = (districtNameRo) =>
    buildSzamadasReport({
      cellek: [{ id: '101', type: 'B', nev: 'Egyházfenntartói járulék', sorszam: 1 }],
      budgetRows: {},
      actualIncome: {},
      actualExpense: {},
      year: 2026,
      carryoverCash: 0,
      carryoverBank: 0,
      congregationName: HU,
      congregationNameRo: RO,
      printScope: 'diocese',
      districtName: 'Erdélyi Református Egyházkerület',
      districtNameRo,
    }).html

  const KERULET_RO = 'Eparhia Reformată din Ardeal'
  const vanRo = megyeiIv(KERULET_RO)
  if (vanRo.includes(KERULET_RO.toLocaleUpperCase('ro-RO'))) {
    ok('K10a a megyei borító felettes blokkja a VALÓDI kerületi román nevet írja')
  } else {
    fail('K10a a megyei borítóra NEM került ki a kerület valódi román neve (`districts.nev_ro`)')
  }

  const nincsRo = megyeiIv(null)
  if (nincsRo.includes('EPARHIA REFORMATĂ') && !nincsRo.includes(KERULET_RO.toLocaleUpperCase('ro-RO'))) {
    ok('K10b kerületi román név nélkül a MAI sablonszöveg marad (hivatal-megnevezés, nem kitalált NÉV)')
  } else {
    fail('K10b a kerületi román név hiányában elveszett a tartalék felirat — a felettes blokk román sora üresen maradna')
  }

  // ── NEGATÍV ASSZERT (M11): a HARDKÓDOLT alak visszaírása ─────────────────
  try {
    const m = mutans(
      F_REPORTING,
      'budget-reporting-m11',
      (kod) =>
        kod.replace(
          '  const felettesSor = felettesRo\n    ? esc(hivatalosKetnyelvuNev(felettesNev, felettesRo))\n    : `${esc(felettesNev)} / EPARHIA REFORMATĂ`',
          '  const felettesSor = `${esc(felettesNev)} / EPARHIA REFORMATĂ`',
        ),
      {
        stubs: REPORTING_STUBS,
        farok: 'exports.__wrapBudgetTeszthorog = typeof wrapBudget === "function" ? wrapBudget : null;',
      },
    )
    const html = m.buildSzamadasReport({
      cellek: [{ id: '101', type: 'B', nev: 'Egyházfenntartói járulék', sorszam: 1 }],
      budgetRows: {},
      actualIncome: {},
      actualExpense: {},
      year: 2026,
      carryoverCash: 0,
      carryoverBank: 0,
      congregationName: HU,
      congregationNameRo: RO,
      printScope: 'diocese',
      districtName: 'Erdélyi Református Egyházkerület',
      districtNameRo: KERULET_RO,
    }).html
    if (html.includes(KERULET_RO.toLocaleUpperCase('ro-RO'))) {
      fail('K10/M11 negatív asszert VAK: a hardkódolt mutáns is kiírja a valódi kerületi román nevet — a K10a nem mér semmit')
    } else {
      ok('K10/M11 negatív asszert: a hardkódolt „/ EPARHIA REFORMATĂ" alakon a K10a elbukna')
    }
  } catch (e) {
    fail(`K10/M11 mutáns hiba: ${e?.message || e}`)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// K11 · HIÁNYZÓ ROMÁN NÉV — FIGYELMEZTETÉS, DE SOHA NEM KAPU
// ════════════════════════════════════════════════════════════════════════════
//
// A TÉNY (Endre ellenőrző SQL-je, 2026-08-22): MIND A 25 egyházmegyének ÜRES a
// `nev_ro` mezője. A román nyomtatványokon ezért továbbra is a magyar név áll —
// helyesen (kitalált román nevet aláírható iratra nem teszünk), csak eddig ezt
// SENKI nem látta előre, kizárólag a kész papíron.
//
// MIT ŐRZÜNK — HÁROM ÁLLÍTÁS:
//   (a) hiányzó román névnél MEGJELENIK a figyelmeztetés, mind a három szinten;
//   (b) meglévő román névnél NEM jelenik meg;
//   (c) ⛔ a nyomtatás EGYIK esetben SEM tiltódik le emiatt. Ez a NEGATÍV
//       ASSZERT lelke: a `finance-print-dialog.tsx` `nevHianyzik` blokkjának
//       kommentje EXPLICITEN megtiltja a „szimmetrizálást", és ha valaki mégis
//       kapuvá alakítja, ITT kell pirosra váltania. Egy kapu itt mind a 25
//       egyházmegyét kizárná a SAJÁT hivatalos ívéből.
{
  /**
   * A Költségvetés-nyomtatóablak pótlékai. A mért függvények TISZTÁK (nem
   * hívnak semmit), de a modul betöltése minden importot végrehajt — ezért
   * mindegyiknek kell pótlék. Bármi váratlan importra a `loadTs` HANGOSAN
   * megáll, hogy a mérce ne váljon némán vakká.
   */
  const DIALOG_STUBS = {
    react: { useCallback: (f) => f, useState: () => [null, () => {}] },
    'lucide-react': { AlertTriangle: () => null },
    '@/components/ui/dialog': {
      Dialog: () => null, DialogContent: () => null, DialogHeader: () => null, DialogTitle: () => null,
    },
    '@kartoteka/ui-app': {
      BudgetPrintDialogBody: () => null,
      hivatalosHatarozatMezok: () => ({}),
    },
    '@/lib/finance/budget-reporting': { buildBudgetPrintDocument: () => ({}), BUDGET_PRINT_TYPES: [] },
    '@/lib/finance/budget-compat': { loadBudgetRowsCompat: async () => [] },
    '@/lib/finance/print-scope': {
      KIALLITO_NEVE_HIANYZIK_CIM: '', KIALLITO_NEVE_HIANYZIK_UZENET: '',
      NINCS_NYOMTATVANY_AG_CIM: '', NINCS_NYOMTATVANY_AG_UZENET: '',
      loadEvBeallitas: async () => ({ row: null, ok: true }),
      nyomtatvanyScope: (s) => s,
    },
    '@/lib/supabase/client': { createClient: () => ({}) },
    '@/lib/utils/print-engine-v2': { printToBrowser: () => {}, printToPdf: () => {} },
    sonner: { toast: Object.assign(() => {}, { error() {}, success() {}, warning() {} }) },
  }

  let dlg = null
  try {
    dlg = loadTs(F_BUDGET_DIALOG, 'budget-print-dialog', { tsx: true, stubs: DIALOG_STUBS })
  } catch (e) {
    fail(`K11 a budget-print-dialog.tsx nem tölthető be: ${e?.message || e}`)
  }

  const { romanNevFigyelmeztetes, romanNevHianyzik, kiallitoNeveHianyzik, RomanNevFigyelmeztetesSav } = dlg || {}

  if (
    typeof romanNevFigyelmeztetes !== 'function' ||
    typeof romanNevHianyzik !== 'function' ||
    typeof kiallitoNeveHianyzik !== 'function' ||
    typeof RomanNevFigyelmeztetesSav !== 'function'
  ) {
    fail(
      'K11 a `budget-print-dialog.tsx` nem exportálja mind a négyet ' +
        '(`romanNevFigyelmeztetes`, `romanNevHianyzik`, `kiallitoNeveHianyzik`, ' +
        '`RomanNevFigyelmeztetesSav`) — a figyelmeztetés mércéje vak lett. ' +
        'Ha átnevezted, igazítsd a mércét; NE hagyd zöldön mérés nélkül.',
    )
  } else {
    const NEVEK = {
      congregation: 'Barátosi Református Egyházközség',
      diocese: 'Kézdi-Orbai Református Egyházmegye',
      district: 'Erdélyi Református Egyházkerület',
    }
    const ROMANUL = {
      congregation: 'Parohia Reformată Brateș',
      diocese: 'Protopopiatul Reformat Chezdi-Orbai',
      district: 'Eparhia Reformată din Ardeal',
    }

    // ── K11a · HIÁNYZIK a román név → VAN figyelmeztetés (mind a 3 szinten) ──
    for (const szint of ['congregation', 'diocese', 'district']) {
      for (const uresRo of [null, undefined, '', '   ']) {
        const uz = romanNevFigyelmeztetes(szint, NEVEK[szint], uresRo)
        if (typeof uz !== 'string' || uz.length === 0) {
          fail(
            `K11a (${szint}, ro=${JSON.stringify(uresRo)}) NINCS figyelmeztetés hiányzó román névnél — ` +
              'a lelkész megint csak a kész papíron venné észre, hogy a román ív magyar nevet visel.',
          )
        } else if (!uz.includes(NEVEK[szint])) {
          fail(`K11a (${szint}) a figyelmeztetés nem nevezi meg a kiállítót: ${JSON.stringify(uz)}`)
        }
      }
    }
    ok('K11a hiányzó ROMÁN névnél mind a három szint (gyülekezet, egyházmegye, egyházkerület) kap figyelmeztetést')

    // ── K11b · VAN román név → NINCS figyelmeztetés ──────────────────────────
    let b_ok = true
    for (const szint of ['congregation', 'diocese', 'district']) {
      const uz = romanNevFigyelmeztetes(szint, NEVEK[szint], ROMANUL[szint])
      if (uz !== null) {
        b_ok = false
        fail(`K11b (${szint}) MEGLÉVŐ román névnél is figyelmeztet: ${JSON.stringify(uz)} — zajos, hamis riasztás`)
      }
    }
    if (b_ok) ok('K11b meglévő ROMÁN névnél NINCS figyelmeztetés — a sáv nem zajong feleslegesen')

    // ── K11c · ⛔ A NYOMTATÁS NEM TILTÓDIK LE EMIATT ─────────────────────────
    // A név-kapu (`kiallitoNeveHianyzik`) az EGYETLEN, ami tilt. Bizonyítjuk,
    // hogy hiányzó román név mellett is NYITVA marad mind a három szinten,
    // ugyanakkor a figyelmeztetés MEGSZÓLAL — vagyis a kettő független.
    let c_ok = true
    for (const szint of ['congregation', 'diocese', 'district']) {
      const tiltva = kiallitoNeveHianyzik(szint, NEVEK[szint])
      const figyelmeztet = romanNevFigyelmeztetes(szint, NEVEK[szint], null) !== null
      if (tiltva) {
        c_ok = false
        fail(
          `K11c (${szint}) A NYOMTATÁS LETILTÓDOTT hiányzó ROMÁN név mellett. ` +
            'A román név OPCIONÁLIS mező; élesben MIND A 25 egyházmegyéé üres, ' +
            'vagyis ez a kapu kizárná őket a saját hivatalos ívükből.',
        )
      }
      if (!figyelmeztet) {
        c_ok = false
        fail(`K11c (${szint}) a figyelmeztetés elnémult — a K11a-val ellentmondó állapot`)
      }
    }
    // A kapu ATTÓL MÉG ÉL, amiért készült: kerületi ív MAGYAR név nélkül tilos.
    if (kiallitoNeveHianyzik('district', '   ') !== true) {
      c_ok = false
      fail(
        'K11c a MAGYAR név hiányára épült kapu ELNÉMULT (`kiallitoNeveHianyzik(\'district\', \'   \')` ≠ true) — ' +
          'egy NÉVTELEN, mégis aláírható kerületi ív mehetne ki.',
      )
    }
    if (c_ok) {
      ok('K11c hiányzó ROMÁN név MELLETT is nyitva a nyomtatás mind a 3 szinten — miközben a magyar-név-kapu él')
    }

    // ── K11d · a KÉT NYOMTATÁSI KÖZPONT UGYANEZT HASZNÁLJA ──────────────────
    // Nem a forrás szövegében keresünk nevet: KOMMENTMENTES, JSX-ből
    // kifordított kódban mérünk, tehát a komponens HASZNÁLATA (createElement) is
    // bizonyított, nem csak az említése.
    const budgetKod = kodKommentekNelkul(F_BUDGET_DIALOG, { tsx: true })
    const financeKod = kodKommentekNelkul(F_FINANCE_DIALOG, { tsx: true })
    for (const [nev, kod] of [['budget-print-dialog', budgetKod], ['finance-print-dialog', financeKod]]) {
      if (kod.includes('RomanNevFigyelmeztetesSav')) {
        ok(`K11d (${nev}) rendereli a KÖZÖS figyelmeztető sávot`)
      } else {
        fail(
          `K11d (${nev}) NEM rendereli a \`RomanNevFigyelmeztetesSav\`-ot — ` +
            'a két nyomtatási központ széthúzna: az egyikben figyelmeztetés, a másikban néma papír.',
        )
      }
      if (kod.includes('kiallitoNeveHianyzik')) {
        ok(`K11d (${nev}) a tiltó név-kaput a KÖZÖS helperből veszi`)
      } else {
        fail(`K11d (${nev}) saját másolatot tart a tiltó név-kapuból — a két ablak széthúzhat`)
      }
    }

    // ── K11e · ⛔ A TILTÓ KAPU NEM NÉZHET RÁ A ROMÁN NÉVRE ───────────────────
    // Ez a mérce fogja meg, ha valaki „szimmetrizálja" a kaput.
    if (typeof nevKapuTisztaE !== 'function') {
      fail('K11e belső hiba: hiányzik a `nevKapuTisztaE` mérce')
    } else {
      for (const [nev, kod] of [['budget-print-dialog', budgetKod], ['finance-print-dialog', financeKod]]) {
        const r = nevKapuTisztaE(kod)
        if (r.ok) {
          ok(`K11e (${nev}) a nyomtatást tiltó \`nevHianyzik\` kapu NEM hivatkozik a román névre`)
        } else {
          fail(
            `K11e (${nev}) A ROMÁN NÉV BEKERÜLT A TILTÓ KAPUBA (${r.indok}) — ` +
              'ez pontosan az a „szimmetrizálás", amit a finance-print-dialog.tsx kommentje megtilt: ' +
              'hármas viselkedés-változás élő, aláírt iratokon.',
          )
        }
      }
    }

    // ── NEGATÍV ASSZERT (M12): a kapu SZIMMETRIZÁLÁSA — a K11e bukjon rá ─────
    for (const [nev, file] of [['budget-print-dialog', F_BUDGET_DIALOG], ['finance-print-dialog', F_FINANCE_DIALOG]]) {
      const eredeti = fs.readFileSync(file, 'utf8')
      const CEL = 'const nevHianyzik = kiallitoNeveHianyzik(keszScope, congregationName)'
      if (!eredeti.includes(CEL)) {
        fail(
          `K11/M12 (${nev}) negatív asszert VAK: a mutáció célsora eltűnt ` +
            `(\`${CEL}\`) — igazítsd a mintát, NE hagyd zöldön.`,
        )
        continue
      }
      const mutalt = eredeti.replace(
        CEL,
        `${CEL} || romanNevHianyzik(congregationNameRo)`,
      )
      const r = nevKapuTisztaE(kodKommentekNelkul(file, { tsx: true, szoveg: mutalt }))
      if (r.ok) {
        fail(`K11/M12 (${nev}) negatív asszert VAK: a szimmetrizált (kapuvá tett) mutáns is átment a K11e-n`)
      } else {
        ok(`K11/M12 (${nev}) negatív asszert: a kapuvá tett változaton a K11e elbukna (${r.indok})`)
      }
    }

    // ── NEGATÍV ASSZERT (M13): a figyelmeztetés KIÜRESÍTÉSE — a K11a bukjon ──
    try {
      const m = mutans(
        F_BUDGET_DIALOG,
        'budget-print-dialog-m13',
        (kod) => kod.replace('if (!romanNevHianyzik(nevRo)) return null', 'return null'),
        { tsx: true, stubs: DIALOG_STUBS },
      )
      const uz = m.romanNevFigyelmeztetes('diocese', NEVEK.diocese, null)
      if (uz === null) {
        ok('K11/M13 negatív asszert: a figyelmeztetést kiiktató mutánson a K11a elbukna')
      } else {
        fail(`K11/M13 negatív asszert VAK: a kiiktatott mutáns is üzenetet ad: ${JSON.stringify(uz)}`)
      }
    } catch (e) {
      fail(`K11/M13 mutáns hiba: ${e?.message || e}`)
    }

    // ── NEGATÍV ASSZERT (M14): „figyelmeztet mindig" — a K11b bukjon rá ──────
    try {
      const m = mutans(
        F_BUDGET_DIALOG,
        'budget-print-dialog-m14',
        (kod) => kod.replace('return String(nevRo ?? \'\').trim().length === 0', 'return true'),
        { tsx: true, stubs: DIALOG_STUBS },
      )
      const uz = m.romanNevFigyelmeztetes('diocese', NEVEK.diocese, ROMANUL.diocese)
      if (uz === null) {
        fail('K11/M14 negatív asszert VAK: a „mindig hiányzik" mutáns is hallgat — a K11b nem mér semmit')
      } else {
        ok('K11/M14 negatív asszert: a „mindig figyelmeztet" változaton a K11b elbukna')
      }
    } catch (e) {
      fail(`K11/M14 mutáns hiba: ${e?.message || e}`)
    }
  }
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nKerületi nyomtatvány-ág önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nKerületi nyomtatvány-ág önellenőrzés: minden zöld')
