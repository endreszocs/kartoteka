#!/usr/bin/env node
/**
 * OFFLINE EXCEL-VISSZATÖLTÉS DÁTUM önellenőrzés (P0-22, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-22 találata:
 *   Az offline Excel-körút olvasója (apps/web/lib/offline/excel-reader.ts)
 *   NEM a kanonikus dátum-helpert használta: szöveges dátumcellánál
 *   (`'2025.01.07'`) a `new Date(str).toISOString()` ágra esett, ami
 *   Bukarestben (UTC+2/+3) −1 napot ad — év-határon −1 ÉVET:
 *   '2025.01.01' → '2024-12-31'. A Date-cellás ág `toISOString`-je ugyanígy
 *   csúszhatott. (Élő bizonyíték a gépen: naiv('2025.01.01') === '2024-12-31'.)
 *
 * A JAVÍTOTT VILÁG:
 *   (1) az excel-reader 'date' ága TELJES EGÉSZÉBEN a kanonikus
 *       toLocalIsoDate-re (lib/import/date-utils) delegál,
 *   (2) a kanonikus helper viselkedése őrzött: magyar/fordított/ISO string
 *       regex-úton (időzóna-független), Date +12 órás kerekítéssel, serial
 *       UTC-matekkal.
 *
 * NEGATÍV ASSZERT: a naiv világ visszajátszása (mutáns) + a +12 órás
 * kerekítés kiütése.
 *
 * Futtatás:  node scripts/selftest-offline-excel-datum.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const READER = path.join(REPO, 'apps', 'web', 'lib', 'offline', 'excel-reader.ts')
const DATE_UTILS = path.join(REPO, 'apps', 'web', 'lib', 'import', 'date-utils.ts')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const require_ = createRequire(path.join(REPO, 'package.json'))
let ts = null
try { ts = require_('typescript') } catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

let tmpSzamlalo = 0
function betolt(forras) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `kartoteka-xldatum-${tmpSzamlalo++}-`))
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"commonjs"}', 'utf8')
  const out = ts.transpileModule(forras, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: 'date-utils.ts',
  })
  fs.writeFileSync(path.join(tmp, 'date-utils.js'), out.outputText, 'utf8')
  return require_(path.join(tmp, 'date-utils.js'))
}

const utilsRaw = fs.readFileSync(DATE_UTILS, 'utf8')
const utils = betolt(utilsRaw)

// ── (1) A NAIV VILÁG TÉNYLEG HIBÁS (replay — csak pozitív offsetű gépen mérhető) ──
const januarOffset = new Date('2025-01-15T00:00:00').getTimezoneOffset()
if (januarOffset < 0) {
  const naiv = (s) => new Date(s).toISOString().slice(0, 10)
  if (naiv('2025.01.01') === '2025-01-01') {
    bukik('a naiv parse ezen a gépen nem csúszik — a replay érvénytelen (ellenőrizd a TZ-t)')
  } else {
    pass(`replay — a naiv parse tényleg hibás ezen a gépen: '2025.01.01' → ${naiv('2025.01.01')} (év-csúszás!)`)
  }
} else {
  console.log('INFO: nem pozitív offsetű gép — a naiv-replay kihagyva (a kanonikus ellenőrzések futnak)')
}

// ── (2) A KANONIKUS HELPER HELYES (időzóna-független utak) ──────────────────
const ESETEK = [
  ['2025.01.07', '2025-01-07'],
  ['2025.01.01', '2025-01-01'], // ← a −1 ÉV regresszió esete
  ['07.01.2025', '2025-01-07'], // fordított magyar
  ['2025-01-07', '2025-01-07'],
  ['2025. 01. 07.', '2025-01-07'],
]
let helperHiba = 0
for (const [be, vart] of ESETEK) {
  const kapott = utils.toLocalIsoDate(be)
  if (kapott !== vart) { helperHiba++; bukik(`toLocalIsoDate('${be}'): várt ${vart}, kapott ${kapott}`) }
}
// Date-ág: UTC-éjféli ÉS helyi-éjféli Date is aznapra kerekül (+12 óra szabály)
const utcEjfel = new Date(Date.UTC(2025, 0, 7))
if (utils.dateToLocalIso(utcEjfel) !== '2025-01-07') { helperHiba++; bukik('dateToLocalIso(UTC-éjfél) nem aznapot ad') }
const serial = utils.excelSerialToLocalIso(45659) // 2025-01-02 (Excel-serial)
if (serial !== '2025-01-02') { helperHiba++; bukik(`excelSerialToLocalIso(45659): várt 2025-01-02, kapott ${serial}`) }
if (helperHiba === 0) pass('a kanonikus helper minden útja helyes (string regex-úton, Date +12h, serial UTC-matek)')

// ── (3) AZ EXCEL-READER A KANONIKUSRA DELEGÁL ────────────────────────────────
const readerRaw = fs.readFileSync(READER, 'utf8')
const readerS = stripComments(readerRaw)
const dateBranch = (() => {
  const i = readerS.indexOf("case 'date':")
  if (i < 0) return null
  const j = readerS.indexOf("case 'string':", i)
  return j > i ? readerS.slice(i, j) : null
})()
if (!dateBranch) {
  bukik("az excel-reader 'date' ága nem található (fail-closed)")
} else {
  if (!dateBranch.includes('toLocalIsoDate')) {
    bukik("az excel-reader 'date' ága nem a kanonikus toLocalIsoDate-et használja")
  }
  if (/new Date\((?!.*UTC)/.test(dateBranch) || /toISOString\(\)/.test(dateBranch)) {
    bukik("az excel-reader 'date' ágában még él a naiv new Date(...)/toISOString() út — Bukarestben −1 nap")
  }
  if (fail === 0) pass("az excel-reader 'date' ága teljes egészében a kanonikus helperre delegál")
}

// ── (4) NEGATÍV — mutánsok ───────────────────────────────────────────────────
if (fail === 0) {
  // M1: a +12 órás kerekítés kiütése a kanonikus helperben
  const m1raw = utilsRaw.replace(/\+ 12 \* 60 \* 60 \* 1000/, '+ 0')
  if (m1raw === utilsRaw) {
    bukik('M1 mutáció nem változtatott a helperen (fail-closed)')
  } else if (januarOffset < 0) {
    const m1 = betolt(m1raw)
    // pozitív offsetnél a SheetJS-artifact (előző nap 23:59) kerekítés nélkül rossz napot ad
    const artifact = new Date(2025, 0, 6, 23, 59, 36) // helyi 2025-01-06 23:59:36 = a 2025-01-07 serial artifactja
    const rossz = m1.dateToLocalIso(artifact)
    if (rossz === '2025-01-07') bukik('M1: a kerekítés kiütésére a Date-ág NEM bukik — vak')
    else pass('M1 mutáns (+12h kerekítés kiütve) → a Date-artifact eset elbuktatja')
  } else {
    console.log('INFO: M1 mutáns csak pozitív offsetű gépen mérhető — kihagyva')
  }

  // M2: a naiv út visszaírása a readerbe
  const m2 = readerRaw.replace(/toLocalIsoDate\(value\)/, "(value instanceof Date ? value.toISOString().slice(0, 10) : new Date(String(value)).toISOString().slice(0, 10))")
  if (m2 === readerRaw) {
    bukik('M2 mutáció nem változtatott a readeren (fail-closed)')
  } else {
    const s2 = stripComments(m2)
    const i = s2.indexOf("case 'date':")
    const j = s2.indexOf("case 'string':", i)
    const branch2 = i >= 0 && j > i ? s2.slice(i, j) : ''
    const megbukna = !branch2.includes('toLocalIsoDate') || /toISOString\(\)/.test(branch2)
    if (!megbukna) bukik('M2: a naiv út visszaírására az őr NEM bukik — vak')
    else pass('M2 mutáns (naiv út visszaírva) → az őr elbuktatja')
  }
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — offline Excel-dátum kezelés rendben`)
