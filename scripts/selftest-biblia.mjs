#!/usr/bin/env node
/**
 * @kartoteka/biblia önellenőrzés — build/tesztkeret nélkül futtatható.
 *
 * 1. Versszám-katalógus (packages/biblia/src/data/verse-counts.json):
 *    66 könyv / 1189 fejezet / 31126 vers.
 * 2. Ha a node_modules-ben elérhető a `typescript`, a csomag TS forrásait
 *    CommonJS-re transpile-olja egy temp könyvtárba, és lefuttatja a
 *    packages/biblia/test/parser-cases.ts teljes tesztkészletét
 *    (parser + formázó + validálás + kibontás + lefedettség).
 *
 * Futtatás:  node scripts/selftest-biblia.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const PKG_DIR = path.join(REPO_ROOT, 'packages', 'biblia')
const DATA_FILE = path.join(PKG_DIR, 'src', 'data', 'verse-counts.json')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

// ── 1. Versszám-katalógus ─────────────────────────────────────────────────────
if (!fs.existsSync(DATA_FILE)) {
  fail(`hiányzik a katalógus: ${DATA_FILE} — futtasd: node scripts/build-verse-counts.mjs`)
  process.exit(1)
}
const vc = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
const books = vc.order?.length ?? 0
let chapters = 0
let verses = 0
for (const code of vc.order ?? []) {
  const arr = vc.counts?.[code]
  if (!Array.isArray(arr)) {
    fail(`hiányzó counts a(z) ${code} könyvhöz`)
    continue
  }
  chapters += arr.length
  verses += arr.reduce((a, b) => a + b, 0)
}
if (books === 66) ok('66 könyv')
else fail(`${books} könyv a várt 66 helyett`)
if (chapters === 1189) ok('1189 fejezet')
else fail(`${chapters} fejezet a várt 1189 helyett`)
if (verses === 31126) ok('31126 vers')
else fail(`${verses} vers a várt 31126 helyett`)

// ── 2. Parser-tesztek (TypeScript transpile, ha elérhető) ────────────────────
const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try {
  ts = require_('typescript')
} catch {
  console.log('INFO: a typescript csomag nem elérhető — a parser-tesztek kihagyva')
  console.log('      (futtatás typecheck után: packages/biblia/test/parser-cases.ts → runBibliaTests)')
}

if (ts) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-biblia-selftest-'))
  try {
    const sources = [
      ['src/types.ts', 'src/types.js'],
      ['src/books.ts', 'src/books.js'],
      ['src/parser.ts', 'src/parser.js'],
      ['src/format.ts', 'src/format.js'],
      ['src/coverage.ts', 'src/coverage.js'],
      ['src/index.ts', 'src/index.js'],
      ['test/parser-cases.ts', 'test/parser-cases.js'],
    ]
    for (const [from, to] of sources) {
      const code = fs.readFileSync(path.join(PKG_DIR, from), 'utf8')
      const out = ts.transpileModule(code, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          esModuleInterop: true,
        },
        fileName: from,
      })
      const dest = path.join(tmp, to)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, out.outputText, 'utf8')
    }
    fs.mkdirSync(path.join(tmp, 'src', 'data'), { recursive: true })
    fs.copyFileSync(DATA_FILE, path.join(tmp, 'src', 'data', 'verse-counts.json'))

    const { runBibliaTests } = require_(path.join(tmp, 'test', 'parser-cases.js'))
    const result = runBibliaTests()
    if (result.failures.length === 0) {
      ok(`parser-tesztek: ${result.total}/${result.total} zöld`)
    } else {
      for (const f of result.failures) fail(f)
      fail(`parser-tesztek: ${result.failures.length}/${result.total} bukott`)
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

if (failed) {
  console.error('\nÖnellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nÖnellenőrzés: minden zöld')
