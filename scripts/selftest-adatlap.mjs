#!/usr/bin/env node
/**
 * ADATLAP-GRAFIKON önellenőrzés (2026-08-14, 18. pont 4. szelet) —
 * build/tesztkeret nélkül futtatható.
 *
 * MIT ŐRIZ: az oszlopdiagram-építő (adatlap-svg.ts) helyes viselkedését —
 * oszlop-darabszám, hiányzó év jelölése (nem csúszik össze az idősor),
 * HTML-escape a címben, üres adatnál üres kimenet.
 *
 * Futtatás:  node scripts/selftest-adatlap.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const SRC = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'lelkeszi-jelentes', 'adatlap-svg.ts')

let failed = false
const fail = (msg) => { console.error(`FAIL: ${msg}`); failed = true }
const ok = (msg) => console.log(`OK:   ${msg}`)

if (!fs.existsSync(SRC)) { fail(`hiányzik a forrás: ${SRC}`); process.exit(1) }

const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try { ts = require_('typescript') } catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-adatlap-selftest-'))
const out = ts.transpileModule(fs.readFileSync(SRC, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: 'adatlap-svg.ts',
})
if (/require\(["'][^."']/.test(out.outputText)) {
  fail('FUTÁSIDEJŰ IMPORT került a fájlba — a modulnak önállónak kell maradnia.')
  process.exit(1)
}
const dest = path.join(tmp, 'adatlap-svg.js')
fs.writeFileSync(dest, out.outputText, 'utf8')
const { epitOszlopdiagram } = require_(dest)

// A1: 5 éves idősor → 5 oszlop (rect) + 5 évszám
const svg = epitOszlopdiagram('Lélekszám', [
  { ev: 2022, ertek: 300 }, { ev: 2023, ertek: 310 }, { ev: 2024, ertek: 295 },
  { ev: 2025, ertek: 305 }, { ev: 2026, ertek: 320 },
], 'fő')
const rectDb = (svg.match(/<rect /g) || []).length
if (rectDb === 5) ok('A1: 5 értékes év → 5 oszlop')
else fail(`A1: ${rectDb} oszlop jött (várt: 5)`)
if (svg.includes('>2022<') && svg.includes('>2026<')) ok('A1b: évszám-feliratok jelen')
else fail('A1b: hiányzó évszám-felirat!')

// A2: hiányzó év NEM csúszik össze — jelölést kap, oszlopot nem
const hianyos = epitOszlopdiagram('Teszt', [
  { ev: 2024, ertek: 100 }, { ev: 2025, ertek: null }, { ev: 2026, ertek: 120 },
], 'fő')
if ((hianyos.match(/<rect /g) || []).length === 2 && hianyos.includes('>2025<')) {
  ok('A2: hiányzó év jelölt, az idősor nem csúszik össze')
} else fail('A2: a hiányzó év kezelése hibás!')

// A3: HTML-escape a címben (a cím szabad szöveg lehet)
const escSvg = epitOszlopdiagram('A < B & "C"', [{ ev: 2026, ertek: 1 }], '')
if (escSvg.includes('A &lt; B &amp; &quot;C&quot;') && !escSvg.includes('A < B &')) {
  ok('A3: a cím HTML-escape-elt')
} else fail('A3: escape-eletlen cím az SVG-ben!')

// A4: csupa-null idősor → üres kimenet (nincs értelmetlen üres diagram)
if (epitOszlopdiagram('Üres', [{ ev: 2026, ertek: null }], '') === '') {
  ok('A4: értékes pont nélkül üres kimenet')
} else fail('A4: üres adatra is diagramot rajzol!')

// A5: a legnagyobb érték oszlopmagassága a rendelkezésre álló teret használja
const skala = epitOszlopdiagram('Skála', [{ ev: 2025, ertek: 50 }, { ev: 2026, ertek: 100 }], '')
const magassagok = [...skala.matchAll(/<rect [^>]*height="(\d+)"/g)].map((m) => Number(m[1]))
if (magassagok.length === 2 && magassagok[1] === Math.max(...magassagok) && magassagok[1] >= magassagok[0] * 1.8) {
  ok('A5: az oszlopmagasság az értékkel arányos')
} else fail(`A5: aránytalan oszlopok: ${magassagok.join(', ')}`)

if (failed) { console.error('\nADATLAP selftest: HIBA'); process.exit(1) }
console.log('\nADATLAP selftest: minden rendben ✅')
