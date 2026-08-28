#!/usr/bin/env node
/**
 * HELYI „MA" (Europe/Bucharest) önellenőrzés (P0-1, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-1 találata:
 *   A rögzítő dialógusok default dátuma és a „jövőbeli dátum" kapuk a
 *   `new Date().toISOString().slice(0, 10)` mintával az UTC-napot használták.
 *   Bukarestben (UTC+2/+3) helyi éjfél és hajnali 2–3 óra között ez az ELŐZŐ
 *   nap — január 1-jén hajnalban az ELŐZŐ ÉV: a szilveszteri persely némán
 *   rossz évbe könyvelődött, a helyi MAI dátumot pedig a kapu „jövőbeliként"
 *   elutasította.
 *
 * A JAVÍTOTT VILÁG:
 *   (1) KANONIKUS helper: @kartoteka/validations local-date.ts —
 *       localTodayIso(now?) az Europe/Bucharest szerinti napot adja
 *       (Intl.formatToParts; ha az Intl/timeZone hiányzik, a KÉSZÜLÉK helyi
 *       napjára esik vissza — sosem UTC-re).
 *   (2) Mind a 9 érintett fájl (3 rögzítő dialógus, 3 csomag-séma, a web
 *       lokális sémái, dispozitie- és decont-kapu) ezt használja, az UTC-„ma"
 *       idióma eltűnt belőlük.
 *
 * NEGATÍV ASSZERT: időzóna-mutáns (Bucharest→UTC) + hívóhely-mutáns.
 *
 * Futtatás:  node scripts/selftest-helyi-nap.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const HELPER = path.join(REPO, 'packages', 'validations', 'src', 'local-date.ts')
const CELFAJLOK = [
  ['IncomeDialogBody', path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'IncomeDialogBody.tsx')],
  ['ExpenseDialogBody', path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'ExpenseDialogBody.tsx')],
  ['CombinedEntryBody', path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'CombinedEntryBody.tsx')],
  ['validations/befizetes-save', path.join(REPO, 'packages', 'validations', 'src', 'finance', 'befizetes-save.ts')],
  ['validations/kiadas-save', path.join(REPO, 'packages', 'validations', 'src', 'finance', 'kiadas-save.ts')],
  ['validations/belsomozgas', path.join(REPO, 'packages', 'validations', 'src', 'finance', 'belsomozgas.ts')],
  ['web/lib/validations/finance', path.join(REPO, 'apps', 'web', 'lib', 'validations', 'finance.ts')],
  ['dispozitie-actions', path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'dispozitie-actions.ts')],
  ['decont-actions', path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'decont-actions.ts')],
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

// ── (0) A helper létezik ─────────────────────────────────────────────────────
if (!fs.existsSync(HELPER)) {
  bukik('a kanonikus helyi-nap helper (packages/validations/src/local-date.ts) nem létezik — az UTC-„ma" idióma él')
  console.error('\n1 teszt HIBÁS, 0 zöld')
  process.exit(1)
}

const require_ = createRequire(path.join(REPO, 'package.json'))
let ts = null
try { ts = require_('typescript') } catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

let tmpSzamlalo = 0
function betolt(forras) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `kartoteka-nap-${tmpSzamlalo++}-`))
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"commonjs"}', 'utf8')
  const out = ts.transpileModule(forras, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: 'local-date.ts',
  })
  fs.writeFileSync(path.join(tmp, 'local-date.js'), out.outputText, 'utf8')
  return require_(path.join(tmp, 'local-date.js'))
}

const helperRaw = fs.readFileSync(HELPER, 'utf8')
const { localTodayIso } = betolt(helperRaw)
if (typeof localTodayIso !== 'function') {
  bukik('localTodayIso nem exportált függvény')
  console.error(`\n${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}

// ── (1) VISELKEDÉS — a kritikus időablakok (host-időzónától függetlenül) ────
const ESETEK = [
  // [pillanat (explicit offsettel), várt bukaresti nap, magyarázat]
  ['2026-01-01T00:30:00+02:00', '2026-01-01', 'szilveszter után fél órával (UTC-slice 2025-12-31-et adna — ROSSZ ÉV)'],
  ['2026-07-01T00:30:00+03:00', '2026-07-01', 'nyári időszámítás, éjfél után (UTC-slice 2026-06-30-at adna)'],
  ['2026-08-28T12:00:00+03:00', '2026-08-28', 'délben — mindkét számítás azonos'],
  ['2026-03-15T23:30:00+02:00', '2026-03-15', 'este — az UTC már 21:30, a nap azonos'],
]
let viselkedesHiba = 0
for (const [instant, vart, magyarazat] of ESETEK) {
  const kapott = localTodayIso(new Date(instant))
  if (kapott !== vart) {
    viselkedesHiba++
    bukik(`viselkedés — ${instant}: várt ${vart}, kapott ${kapott} (${magyarazat})`)
  }
}
if (viselkedesHiba === 0) pass(`viselkedés — mind a ${ESETEK.length} időablak helyes (év-határ esettel együtt)`)

// ── (2) HÍVÓHELYEK — az UTC-„ma" idióma eltűnt, a helper használatban ───────
const UTC_MA = /new Date\(\)\.toISOString\(\)\.(slice\(0,\s*10\)|split\('T'\)\[0\])/
for (const [nev, fajl] of CELFAJLOK) {
  if (!fs.existsSync(fajl)) { bukik(`hiányzik: ${fajl}`); continue }
  const s = stripComments(fs.readFileSync(fajl, 'utf8'))
  if (UTC_MA.test(s)) bukik(`${nev}: az UTC-„ma" idióma még jelen van — éjfél és hajnali 3 közt rossz napra/évre könyvel`)
  if (!s.includes('localTodayIso')) bukik(`${nev}: nem a kanonikus localTodayIso-t használja`)
}
if (fail === 0) pass('mind a 9 célfájl a kanonikus helyi-nap helpert használja, UTC-idióma nélkül')

// ── (3) NEGATÍV — mutánsok ───────────────────────────────────────────────────
if (fail === 0) {
  // M1: időzóna-mutáns — Bucharest → UTC (a régi világ visszajátszása)
  const m1raw = helperRaw.replace(/Europe\/Bucharest/g, 'UTC')
  if (m1raw === helperRaw) {
    bukik('M1 mutáció nem változtatott a helperen (fail-closed)')
  } else {
    const m1 = betolt(m1raw)
    const rossz = m1.localTodayIso(new Date('2026-01-01T00:30:00+02:00'))
    if (rossz === '2026-01-01') bukik('M1: az UTC-mutánsra a szilveszter-eset NEM bukik — vak')
    else pass('M1 mutáns (UTC-időzóna) → a szilveszter-eset elbuktatja')
  }

  // M2: hívóhely-mutáns — az UTC-idióma visszaírása az egyik dialógusba
  const dlgFajl = CELFAJLOK[0][1]
  const dlgRaw = fs.readFileSync(dlgFajl, 'utf8')
  const m2 = dlgRaw.replace(/localTodayIso\(\)/, "new Date().toISOString().slice(0, 10)")
  if (m2 === dlgRaw) {
    bukik('M2 mutáció nem változtatott a dialóguson (fail-closed)')
  } else {
    const s2 = stripComments(m2)
    if (!UTC_MA.test(s2)) bukik('M2: az UTC-idióma visszaírására az őr NEM bukik — vak')
    else pass('M2 mutáns (UTC-idióma visszaírva) → az őr elbuktatja')
  }
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — helyi-nap kezelés rendben`)
