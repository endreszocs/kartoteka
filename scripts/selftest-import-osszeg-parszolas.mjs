#!/usr/bin/env node
/**
 * IMPORT ÖSSZEG-PARSZOLÁS önellenőrzés (P0-17, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-17 találata:
 *   A webes import-parserek vessző-normalizálása naiv volt: az „1.234,56"
 *   (ezres-pont + tizedes-vessző) alak a replace után „1.234.56" lett, a
 *   parseFloat pedig 1.234-et adott — az összeg NÉMÁN az ezredére zsugorodott.
 *   Érintett: kassza-row-classifier (toNumberOrNull), xlsx-egyhf-parser és
 *   xml-bevetelek-parser (parseAmount), valamint a Számadás-tartozások
 *   dialógus kézi parszolása („1 234,56" → NaN → néma 0).
 *
 * A JAVÍTOTT VILÁG:
 *   (1) KÖZÖS, import-mentes parser: apps/web/lib/import/amount-parse.ts
 *       (parseImportAmount) — VISELKEDÉSI tesztekkel (transpile + futtatás).
 *       Pénz-szemantika: max 2 tizedes; egyetlen elválasztó után PONTOSAN 3
 *       számjegy = ezres csoport (az „1.234" pénzben 1234, nem 1,234).
 *   (2) Mind a 4 hívóhely a közös parsert használja, a naiv replace-minták
 *       eltűntek.
 *
 * NEGATÍV ASSZERT: viselkedési mutáns (ezres-szabály kiütése) + hívóhely-
 * mutáns (naiv parse visszaírása) — az őrnek mindkettőre buknia kell.
 *
 * Futtatás:  node scripts/selftest-import-osszeg-parszolas.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const HELPER = path.join(REPO, 'apps', 'web', 'lib', 'import', 'amount-parse.ts')
const HIVOK = [
  ['kassza-row-classifier', path.join(REPO, 'apps', 'web', 'components', 'finance', 'finance-import', 'helpers', 'kassza-row-classifier.ts')],
  ['xlsx-egyhf-parser', path.join(REPO, 'apps', 'web', 'components', 'finance', 'finance-import', 'egyhfenntartas', 'helpers', 'xlsx-egyhf-parser.ts')],
  ['xml-bevetelek-parser', path.join(REPO, 'apps', 'web', 'components', 'finance', 'finance-import', 'egyhfenntartas', 'helpers', 'xml-bevetelek-parser.ts')],
  ['szamadas-tartozasok-dialog', path.join(REPO, 'apps', 'web', 'components', 'finance', 'szamadas-tartozasok-dialog.tsx')],
]

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

// ── (0) A közös parser létezik ───────────────────────────────────────────────
if (!fs.existsSync(HELPER)) {
  bukik('a közös parser (apps/web/lib/import/amount-parse.ts) nem létezik — a naiv, ezres-pontra zsugorító parszolás él')
  console.error('\n1 teszt HIBÁS, 0 zöld')
  process.exit(1)
}

// ── (1) VISELKEDÉS — transpile + futtatás (a hasonló-tétel őrszem mintája) ──
const require_ = createRequire(path.join(REPO, 'package.json'))
let ts = null
try { ts = require_('typescript') } catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

let tmpSzamlalo = 0
function betolt(forras) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `kartoteka-osszeg-${tmpSzamlalo++}-`))
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"commonjs"}', 'utf8')
  const out = ts.transpileModule(forras, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: 'amount-parse.ts',
  })
  fs.writeFileSync(path.join(tmp, 'amount-parse.js'), out.outputText, 'utf8')
  return require_(path.join(tmp, 'amount-parse.js'))
}

const helperRaw = fs.readFileSync(HELPER, 'utf8')

// A parser legyen import-mentes (mindenhonnan behúzható, tsx-runner-barát)
if (/^\s*import /m.test(stripComments(helperRaw))) {
  bukik('az amount-parse.ts importál — import-mentesnek kell lennie')
}

const { parseImportAmount } = betolt(helperRaw)
if (typeof parseImportAmount !== 'function') {
  bukik('parseImportAmount nem exportált függvény')
  console.error(`\n${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}

const ESETEK = [
  // [bemenet, várt]
  ['1234', 1234],
  ['1234.56', 1234.56],
  ['1234,56', 1234.56],
  ['1.234,56', 1234.56], // ← a regresszió: eddig 1.234 lett belőle
  ['1 234,56', 1234.56],
  ['1\u00a0234,56', 1234.56], // nem törő szóköz ezresként
  ['1,234.56', 1234.56], // US alak
  ['1.234', 1234], // pénzben az egyetlen elválasztó utáni 3 számjegy = ezres
  ['1,234', 1234],
  ['12,5', 12.5],
  ['0,50', 0.5],
  ['1.2', 1.2],
  ['1.234.567', 1234567],
  ['1.234.567,89', 1234567.89],
  ['-12,5', -12.5],
  ['+7', 7],
  ['1.23.45', null], // rossz csoportosítás → inkább hiba, mint tipp
  ['abc', null],
  ['', null],
  ['   ', null],
  [null, null],
  [undefined, null],
  [1234.56, 1234.56], // szám-cella változatlanul átmegy
  [Number.NaN, null],
]

let viselkedesHiba = 0
for (const [be, vart] of ESETEK) {
  const kapott = parseImportAmount(be)
  const jo = vart === null ? kapott === null : Math.abs((kapott ?? Number.NaN) - vart) < 1e-9
  if (!jo) {
    viselkedesHiba++
    bukik(`viselkedés — parseImportAmount(${JSON.stringify(be)}): várt ${vart}, kapott ${kapott}`)
  }
}
if (viselkedesHiba === 0) pass(`viselkedés — mind a ${ESETEK.length} eset helyes (regresszió-esettel együtt)`)

// ── (2) HÍVÓHELYEK — a közös parsert használják, a naiv minta eltűnt ────────
// A vessző→pont csere önmagában legitim lehet (pl. a „101,01" KÖLTSÉGVETÉSI KÓD
// szöveg-normalizálása) — csak akkor naiv ÖSSZEG-parszolás, ha a környezetében
// szám-konverzió (parseFloat/Number) is van. Ezt nézzük ±160 karakteres ablakban.
const NAIV = /replace\(\s*\/,\/g\s*,\s*'\.'\s*\)|replace\(\s*','\s*,\s*'\.'\s*\)/g
function naivOsszegParse(s) {
  for (const m of s.matchAll(NAIV)) {
    const ablak = s.slice(Math.max(0, m.index - 160), m.index + m[0].length + 160)
    if (/parseFloat|Number\.parseFloat|Number\s*\(/.test(ablak)) return true
  }
  return false
}
for (const [nev, fajl] of HIVOK) {
  if (!fs.existsSync(fajl)) { bukik(`hiányzik: ${fajl}`); continue }
  const s = stripComments(fs.readFileSync(fajl, 'utf8'))
  if (!s.includes('parseImportAmount')) bukik(`${nev}: nem a közös parseImportAmount-ot használja`)
  if (naivOsszegParse(s)) bukik(`${nev}: naiv vessző→pont ÖSSZEG-parszolás van jelen — az „1.234,56" itt továbbra is zsugorodna`)
}
if (fail === 0) pass('mind a 4 hívóhely a közös parsert használja, naiv minta nélkül')

// ── (3) NEGATÍV — mutánsok ───────────────────────────────────────────────────
if (fail === 0) {
  // M1 (viselkedés): az ezres-szabály kiütése a helperben
  const m1raw = helperRaw.replace(/=== 3\b/g, '=== 99')
  if (m1raw === helperRaw) {
    bukik('M1 mutáció nem változtatott a helperen (fail-closed)')
  } else {
    const m1 = betolt(m1raw)
    const rossz = m1.parseImportAmount('1.234')
    if (rossz === 1234) bukik('M1: az ezres-szabály kiütésére a viselkedési eset NEM bukik — vak')
    else pass('M1 mutáns (ezres-szabály kiütve) → a viselkedési eset elbuktatja')
  }

  // M2 (hívóhely): a naiv parse visszaírása a classifierbe
  const clsFajl = HIVOK[0][1]
  const clsRaw = fs.readFileSync(clsFajl, 'utf8')
  const m2 = clsRaw.replace(/parseImportAmount\(/, "((v) => Number.parseFloat(String(v).replace(/,/g, '.')))(")
  if (m2 === clsRaw) {
    bukik('M2 mutáció nem változtatott a classifieren (fail-closed)')
  } else {
    const s2 = stripComments(m2)
    const megbukna = !s2.includes('parseImportAmount') || naivOsszegParse(s2)
    if (!megbukna) bukik('M2: a naiv parse visszaírására az őr NEM bukik — vak')
    else pass('M2 mutáns (naiv parse visszaírva) → az őr elbuktatja')
  }
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — import összeg-parszolás rendben`)
