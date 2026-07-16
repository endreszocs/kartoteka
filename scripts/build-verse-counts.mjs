#!/usr/bin/env node
/**
 * Károli versszám-katalógus generátor — @kartoteka/biblia
 *
 * Forrás:  apps/web/public/bibles/karoli.json   (Revideált Károli 1908, public domain;
 *          formátum: { "GEN": [[vers1, vers2, ...] fejezetenként], ... })
 * Kimenet: packages/biblia/src/data/verse-counts.json
 *          { "order": [könyvkódok kanonikus sorrendben], "counts": { "GEN": [fejezetenkénti versszám] } }
 *
 * A 4,2 MB-os szövegadatot a @kartoteka/biblia csomag NEM importálja — csak ezt a
 * kis (~8 KB) versszám-katalógust, amiből a validálás/lefedettség-számítás megy.
 *
 * Assert: pontosan 66 könyv, 1189 fejezet, 31126 vers — ha a karoli.json változik,
 * a script hibával áll le, hogy a csomagban kódolt totálok ne csússzanak el némán.
 *
 * Futtatás:  node scripts/build-verse-counts.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const INPUT_FILE = path.join(REPO_ROOT, 'apps', 'web', 'public', 'bibles', 'karoli.json')
const OUTPUT_DIR = path.join(REPO_ROOT, 'packages', 'biblia', 'src', 'data')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'verse-counts.json')

// Kanonikus protestáns könyvsorrend (66 könyv) — a karoli.json kulcsainak
// pontosan ebben a sorrendben és összetételben kell léteznie.
const EXPECTED_ORDER = [
  // Ószövetség (39)
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA',
  '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO',
  'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO',
  'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL',
  // Újszövetség (27)
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH',
  'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS',
  '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
]

const EXPECTED_BOOKS = 66
const EXPECTED_CHAPTERS = 1189
const EXPECTED_VERSES = 31126

function fail(msg) {
  console.error(`HIBA: ${msg}`)
  process.exit(1)
}

if (!fs.existsSync(INPUT_FILE)) fail(`nem található a forrás: ${INPUT_FILE}`)

const bible = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'))
const keys = Object.keys(bible)

if (keys.length !== EXPECTED_BOOKS) fail(`${keys.length} könyv a várt ${EXPECTED_BOOKS} helyett`)
for (let i = 0; i < EXPECTED_ORDER.length; i++) {
  if (keys[i] !== EXPECTED_ORDER[i]) {
    fail(`könyvsorrend-eltérés a(z) ${i}. pozíción: "${keys[i]}" a várt "${EXPECTED_ORDER[i]}" helyett`)
  }
}

const counts = {}
let totalChapters = 0
let totalVerses = 0

for (const code of EXPECTED_ORDER) {
  const chapters = bible[code]
  if (!Array.isArray(chapters) || chapters.length === 0) fail(`${code}: üres vagy hibás fejezetlista`)
  const perChapter = chapters.map((verses, ci) => {
    if (!Array.isArray(verses) || verses.length === 0) fail(`${code} ${ci + 1}. fejezet: üres verslista`)
    for (const v of verses) {
      if (typeof v !== 'string') fail(`${code} ${ci + 1}. fejezet: nem-string vers`)
    }
    return verses.length
  })
  counts[code] = perChapter
  totalChapters += perChapter.length
  totalVerses += perChapter.reduce((a, b) => a + b, 0)
}

if (totalChapters !== EXPECTED_CHAPTERS) fail(`${totalChapters} fejezet a várt ${EXPECTED_CHAPTERS} helyett`)
if (totalVerses !== EXPECTED_VERSES) fail(`${totalVerses} vers a várt ${EXPECTED_VERSES} helyett`)

// Kompakt, diff-barát kimenet: soronként egy könyv.
const lines = []
lines.push('{')
lines.push(`  "order": ${JSON.stringify(EXPECTED_ORDER)},`)
lines.push('  "counts": {')
EXPECTED_ORDER.forEach((code, i) => {
  const comma = i < EXPECTED_ORDER.length - 1 ? ',' : ''
  lines.push(`    ${JSON.stringify(code)}: ${JSON.stringify(counts[code])}${comma}`)
})
lines.push('  }')
lines.push('}')

fs.mkdirSync(OUTPUT_DIR, { recursive: true })
fs.writeFileSync(OUTPUT_FILE, lines.join('\n') + '\n', 'utf8')

console.log(`OK: ${EXPECTED_BOOKS} könyv, ${totalChapters} fejezet, ${totalVerses} vers`)
console.log(`Kiírva: ${path.relative(REPO_ROOT, OUTPUT_FILE)}`)
