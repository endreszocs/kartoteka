#!/usr/bin/env node
/**
 * Üres (fehér) PDF elleni védelem — önellenőrzés
 * (2026-08-25, Endre hibabejelentése: „A lelkészi jelentés PDF mentése egy
 * ÜRES dokumentumot hozott" — élesben, v0.9.175).
 *
 * A GYÖKÉROK, amit ez a fájl őriz:
 *  · a lelkészi jelentés HTML-je (8 db `.sheet` lap) volt az egyetlen többlapos
 *    nyomtatvány, amely NEM adta meg a print-engine-v2 `data-sheet-count`
 *    lapszám-őrét → a laponkénti (GPU-plafon-biztos) render bármely hibája
 *    vagy egy lap túlcsordulása NÉMÁN a teljes-dokumentumos (egy-canvasos)
 *    tartalék útra esett;
 *  · ott a `MAX_CANVAS_PX = 30000` plafon a ROSSZ korlátot őrizte (a Chromium
 *    ~32 767 px-es dimenzió-plafonját), miközben az élesben már kétszer elsült
 *    valódi korlát a GPU TEXTÚRA-plafon (~16 384 px): a ~9 500 px-es jelentés
 *    scale 3-mal ~28 500 px-es canvast kapott → a vászon NÉMÁN ÜRES → fehér PDF.
 *
 * Mit őriz?
 *  A) A jelentés-nyomtatvány (lib/lelkeszi-jelentes/print.ts) VALÓDI kimenetét:
 *     lefordítjuk és lefuttatjuk — a body `data-sheet-count`-ja legyen meg, és
 *     BETŰRE egyezzen a `.sheet` lapok számával.
 *     ⚠️ NEGATÍV ASSZERT: a RÉGI (attribútum nélküli) print.ts-t mutánsként
 *     újrajátsszuk, és bizonyítjuk, hogy az ellenőrzés elbukna rajta.
 *  B) A print-engine-v2 szöveges invariánsait (kommentek kiszedésével):
 *     GPU-plafon alatti MAX_CANVAS_PX, üres-vászon őr MINDKÉT úton, a legacy
 *     mentés a canvas-ellenőrzésen KERESZTÜL fut (nincs vak .save()).
 *     ⚠️ NEGATÍV ASSZERT: mindhárom invariánsra mutáns (a régi állapot
 *     visszaírása), és az őrszemnek buknia kell rajtuk.
 *  C) A RÉGI útvonal-döntés újrajátszása tiszta replikával: bizonyítjuk, hogy
 *     a régi világban (nincs lapszám-jelzés + 30 000-es plafon) a jelentés
 *     canvasa a GPU-plafon FÖLÉ nőtt, az új világban pedig vagy hangos hiba,
 *     vagy plafon alatti canvas az eredmény.
 *
 * Futtatás:  node scripts/selftest-ures-pdf-vedelem.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const PRINT_FILE = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'lelkeszi-jelentes', 'print.ts')
const TYPES_FILE = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'lelkeszi-jelentes', 'types.ts')
const SVG_FILE = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'lelkeszi-jelentes', 'adatlap-svg.ts')
const EGYHM_FILE = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'format', 'egyhazmegye-nev.ts')
const ENGINE_FILE = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'utils', 'print-engine-v2.ts')

/** A GPU textúra-plafon — élesben kétszer igazolt korlát (~16 384 px). */
const GPU_PLAFON_PX = 16384

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

for (const f of [PRINT_FILE, TYPES_FILE, SVG_FILE, EGYHM_FILE, ENGINE_FILE]) {
  if (!fs.existsSync(f)) {
    fail(`hiányzik a forrás: ${f}`)
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

// ─────────────────────────────────────────────────────────────────────────────
// Közös segédek
// ─────────────────────────────────────────────────────────────────────────────

/** Kommentek kiszedése: a magyarázó szöveg NEM elégítheti ki a keresést. */
function kommentNelkul(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-ures-pdf-selftest-'))

/** Egy TS-forrás transpile-ja CJS-be a tmp-be (az @/ importot átírjuk lokálisra). */
function forditsTmpbe(src, kimenetNev) {
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
    },
    fileName: kimenetNev.replace(/\.js$/, '.ts'),
  })
  const js = out.outputText
    .replace(/require\("@\/lib\/format\/egyhazmegye-nev"\)/g, 'require("./egyhazmegye-nev")')
    .replace(/require\('@\/lib\/format\/egyhazmegye-nev'\)/g, "require('./egyhazmegye-nev')")
  const dest = path.join(tmp, kimenetNev)
  fs.writeFileSync(dest, js, 'utf8')
  return dest
}

/** A print-modul betöltése egy ADOTT print.ts-forrásszöveggel (mutánshoz is). */
function toltsPrintModult(printSrc, jelzo) {
  forditsTmpbe(fs.readFileSync(TYPES_FILE, 'utf8'), 'types.js')
  forditsTmpbe(fs.readFileSync(SVG_FILE, 'utf8'), 'adatlap-svg.js')
  forditsTmpbe(fs.readFileSync(EGYHM_FILE, 'utf8'), 'egyhazmegye-nev.js')
  const dest = forditsTmpbe(printSrc, `print-${jelzo}.js`)
  return require_(dest)
}

/** Minimál jelentés-adat — a nyomtatvány üres rovatokkal is teljes vázat ad. */
const MINIMAL_ADAT = {
  ev: 2026,
  congregationName: 'Teszt',
  egyhazmegyeNev: null,
  submission: null,
  auto: {},
  kezi: {},
  felulirasok: {},
  hatarozat: {},
  statusz: 'szerkesztes',
  tobbEvesAdatok: [],
  veglegesitveAt: null,
}

/**
 * A lapszám-őr ellenőrzése egy legenerált HTML-en: van `data-sheet-count`,
 * és BETŰRE egyezik a `.sheet` lapok számával. `null` = rendben, különben
 * a hiba leírása.
 */
function lapszamOrHiba(html) {
  const lapok = (html.match(/class="sheet/g) || []).length
  const m = html.match(/<body data-sheet-count="(\d+)">/)
  if (!m) return `a body-n nincs data-sheet-count (lapok a DOM-ban: ${lapok})`
  if (Number(m[1]) !== lapok) return `data-sheet-count=${m[1]}, de ${lapok} lap van a dokumentumban`
  if (lapok < 3) return `gyanúsan kevés lap (${lapok}) — elromlott a minta-illesztés?`
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// A) A jelentés-nyomtatvány VALÓDI kimenete
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── A) Lelkészi jelentés: lapszám-őr a legenerált HTML-en ────────')

const printSrc = fs.readFileSync(PRINT_FILE, 'utf8')
let printMod
try {
  printMod = toltsPrintModult(printSrc, 'eles')
} catch (e) {
  fail(`a print.ts nem fordítható/tölthető: ${e && e.message}`)
  process.exit(1)
}

const html = printMod.buildLelkesziJelentesHtml(MINIMAL_ADAT)
const hibaA = lapszamOrHiba(html)
if (hibaA === null) {
  const m = html.match(/<body data-sheet-count="(\d+)">/)
  ok(`a jelentés body-ja data-sheet-count="${m[1]}"-et hordoz, és egyezik a lapszámmal`)
} else {
  fail(`lelkészi jelentés: ${hibaA}`)
}

// ⚠️ NEGATÍV ASSZERT — a RÉGI print.ts (attribútum nélküli body) újrajátszása.
console.log('\n── A2) NEGATÍV ASSZERT: a régi (őr nélküli) nyomtatvány bukik ───')
const printMutansSrc = printSrc.replace('<body data-sheet-count="${lapszam}">', '<body>')
if (printMutansSrc === printSrc) {
  fail('a print-mutáns nem készült el (megváltozott a body-sablon szövege) — az őrszem vak lehet')
} else {
  let mutansHtml = null
  try {
    mutansHtml = toltsPrintModult(printMutansSrc, 'mutans').buildLelkesziJelentesHtml(MINIMAL_ADAT)
  } catch (e) {
    fail(`a print-mutáns nem futtatható: ${e && e.message}`)
  }
  if (mutansHtml !== null) {
    if (lapszamOrHiba(mutansHtml) === null) {
      fail('MUTÁNS ÁTMENT: a lapszám-őr a régi (attribútum nélküli) kimenetet is elfogadja')
    } else {
      ok('a régi világ kimenete (nincs data-sheet-count) elbukik az ellenőrzésen ✔')
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// B) A print-engine-v2 invariánsai (szövegesen, kommentek nélkül)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── B) print-engine-v2: GPU-plafon + üres-vászon őr ─────────────')

const engineSrc = fs.readFileSync(ENGINE_FILE, 'utf8')

/** A három invariáns. Üres tömb = minden rendben. */
function engineOrszem(src) {
  const kod = kommentNelkul(src)
  const bajok = []

  // 1) MAX_CANVAS_PX a GPU-plafon ALATT (a régi 30 000 a rossz korlátot őrizte).
  const mMax = kod.match(/const\s+MAX_CANVAS_PX\s*=\s*(\d+)/)
  if (!mMax) {
    bajok.push('nincs `const MAX_CANVAS_PX = <szám>` (elromlott a minta-illesztés)')
  } else {
    const px = Number(mMax[1])
    if (px > GPU_PLAFON_PX) {
      bajok.push(`MAX_CANVAS_PX=${px} a GPU textúra-plafon (${GPU_PLAFON_PX}) FÖLÖTT — néma üres PDF-veszély`)
    }
    if (px < 4000) {
      bajok.push(`MAX_CANVAS_PX=${px} gyanúsan alacsony — olvashatatlan PDF-et adna`)
    }
  }

  // 2) Üres-vászon őr: definíció + hívás MINDKÉT úton, hangos hibával.
  if (!/function\s+vaszonUresnekTunik\s*\(/.test(kod)) {
    bajok.push('nincs `vaszonUresnekTunik` definíció — az üres-vászon őr eltűnt')
  }
  const hivasok = (kod.match(/vaszonUresnekTunik\s*\(/g) || []).length
  if (hivasok < 3) {
    bajok.push(`a \`vaszonUresnekTunik\` hivatkozásai (${hivasok}) < 3 — nem fut mindkét render-úton (definíció + 2 hívás kell)`)
  }
  const dobasok = (kod.match(/throw new Error\(URES_VASZON_HIBA\)/g) || []).length
  if (dobasok < 2) {
    bajok.push(`\`throw new Error(URES_VASZON_HIBA)\` (${dobasok}) < 2 — az üres vászon valahol némán megy tovább`)
  }

  // 3) A legacy mentés a canvas-ellenőrzésen KERESZTÜL fut — vak .save() tilos.
  if (/\.from\(iframeDoc\.body\)\.save\(\)/.test(kod)) {
    bajok.push('vak `.from(iframeDoc.body).save()` — a mentés kikerüli az üres-vászon őrt')
  }
  if (!/\.toCanvas\(\)\s*\.get\(\s*['"]canvas['"]\s*\)/.test(kod)) {
    bajok.push('nincs `.toCanvas().get(\'canvas\')` — a legacy út nem méri a vásznat mentés előtt')
  }

  return bajok
}

const engineBajok = engineOrszem(engineSrc)
if (engineBajok.length === 0) {
  ok('plafon a GPU-korlát alatt, üres-vászon őr mindkét úton, nincs vak mentés')
} else {
  for (const b of engineBajok) fail(`print-engine-v2: ${b}`)
}

console.log('\n── B2) NEGATÍV ASSZERT: engine-mutánsok — az őrszem bukjon ─────')

/** 1. mutáns: a RÉGI 30 000-es plafon visszaírása. */
const mutansPlafon = engineSrc.replace(/const MAX_CANVAS_PX = \d+/, 'const MAX_CANVAS_PX = 30000')
if (!/const MAX_CANVAS_PX = 30000/.test(mutansPlafon)) {
  fail('a plafon-mutáns nem készült el — az őrszem vak lehet')
} else if (engineOrszem(mutansPlafon).length === 0) {
  fail('MUTÁNS#1 ÁTMENT: az őrszem elfogadja a GPU-plafon fölötti MAX_CANVAS_PX-et')
} else {
  ok('mutáns#1 (MAX_CANVAS_PX=30000, a régi világ) — az őrszem elbukik rajta ✔')
}

/** 2. mutáns: az üres-vászon hibadobások eltávolítása (néma továbbmenés). */
const mutansDobas = engineSrc.replace(/throw new Error\(URES_VASZON_HIBA\)/g, 'void 0')
if (mutansDobas === engineSrc) {
  fail('a dobás-mutáns nem készült el — nincs hangos hiba a forrásban?!')
} else if (engineOrszem(mutansDobas).length === 0) {
  fail('MUTÁNS#2 ÁTMENT: az őrszem nem veszi észre a néma (hibadobás nélküli) üres vásznat')
} else {
  ok('mutáns#2 (a hangos hibadobások törölve) — az őrszem elbukik rajta ✔')
}

/** 3. mutáns: a RÉGI vak legacy-mentés visszaírása (nincs canvas-mérés). */
const mutansVakSave = engineSrc
  .replace(/const canvas[^\n]*\.toCanvas\(\)\.get\('canvas'\)\n/, '')
  .replace(/await worker\.save\(\)/, 'await (html2pdf as any)().set(opt).from(iframeDoc.body).save()')
if (!/\.from\(iframeDoc\.body\)\.save\(\)/.test(mutansVakSave) || /\.toCanvas\(\)\.get\('canvas'\)/.test(mutansVakSave)) {
  fail('a vak-mentés-mutáns nem készült el — az őrszem vak lehet')
} else if (engineOrszem(mutansVakSave).length === 0) {
  fail('MUTÁNS#3 ÁTMENT: az őrszem nem veszi észre a vak (mérés nélküli) mentést')
} else {
  ok('mutáns#3 (vak .from(...).save(), a régi világ) — az őrszem elbukik rajta ✔')
}

/** 4. mutáns: a minta CSAK kommentben él tovább — a komment-kiszedő dolga. */
const mutansKomment =
  mutansDobas + '\n// throw new Error(URES_VASZON_HIBA) — throw new Error(URES_VASZON_HIBA)\n'
if (engineOrszem(mutansKomment).length === 0) {
  fail('MUTÁNS#4 ÁTMENT: a komment kielégítette a keresést — a komment-kiszedő nem működik')
} else {
  ok('mutáns#4 (a hibadobás csak kommentben van meg) — az őrszem elbukik rajta ✔')
}

// ─────────────────────────────────────────────────────────────────────────────
// C) A RÉGI útvonal-döntés újrajátszása — a gyökérok tiszta replikán bizonyítva
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── C) A régi világ újrajátszása: miért lett ÜRES a PDF ─────────')

/**
 * A printToPdf álló-ági döntésének replikája: laponkénti hiba/túlcsordulás
 * esetén lapszám-jelzéssel HANGOS hiba, anélkül néma visszaesés a
 * teljes-dokumentumos útra, ahol a canvas magassága = tartalom × skála,
 * skála = max(1.25, min(3, plafon / tartalom)).
 */
function utvonalReplika({ sheetCount, tartalomPx, plafonPx }) {
  if (sheetCount > 0) return { ut: 'hangos-hiba' }
  const skala = Math.max(1.25, Math.min(3, plafonPx / tartalomPx))
  return { ut: 'legacy', canvasPx: Math.round(tartalomPx * skala) }
}

// A 8 lapos lelkészi jelentés mért nagyságrendje (8 × ~1123 px + térközök).
const JELENTES_TARTALOM_PX = 9500

const regi = utvonalReplika({ sheetCount: 0, tartalomPx: JELENTES_TARTALOM_PX, plafonPx: 30000 })
if (regi.ut === 'legacy' && regi.canvasPx > GPU_PLAFON_PX) {
  ok(`RÉGI: nincs lapszám-jelzés → néma legacy, canvas ${regi.canvasPx} px > GPU-plafon (${GPU_PLAFON_PX}) → NÉMÁN ÜRES PDF (ez volt a hibabejelentés)`)
} else {
  fail(`a régi világ replikája nem reprodukálja a hibát (${JSON.stringify(regi)}) — a negatív asszert nem bizonyít semmit`)
}

const ujHangos = utvonalReplika({ sheetCount: 8, tartalomPx: JELENTES_TARTALOM_PX, plafonPx: 15000 })
if (ujHangos.ut === 'hangos-hiba') {
  ok('ÚJ: lapszám-jelzéssel a laponkénti hiba HANGOS — nincs néma visszaesés')
} else {
  fail('ÚJ: a lapszám-jelzés nem ad hangos hibát')
}

const mMaxEles = kommentNelkul(engineSrc).match(/const\s+MAX_CANVAS_PX\s*=\s*(\d+)/)
const elesPlafon = mMaxEles ? Number(mMaxEles[1]) : NaN
const ujLegacy = utvonalReplika({ sheetCount: 0, tartalomPx: JELENTES_TARTALOM_PX, plafonPx: elesPlafon })
if (ujLegacy.ut === 'legacy' && ujLegacy.canvasPx <= GPU_PLAFON_PX) {
  ok(`ÚJ: a szándékos legacy-visszaesés canvasa ${ujLegacy.canvasPx} px ≤ GPU-plafon — a PDF kirajzolódik`)
} else {
  fail(`ÚJ: a legacy-út canvasa (${JSON.stringify(ujLegacy)}) a GPU-plafon fölött maradna`)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('')
if (failed) {
  console.error('EREDMÉNY: FAIL — az üres-PDF-védelem őrszeme bukott.')
  process.exit(1)
}
console.log('EREDMÉNY: PASS — lapszám-őr a jelentésen, GPU-plafon és üres-vászon őr az engine-ben.')
