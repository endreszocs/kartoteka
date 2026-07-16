#!/usr/bin/env node
/**
 * Hivatalos munkanapló típus→oszlop katalógus + ünnepnaptár önellenőrzés —
 * build/tesztkeret nélkül futtatható (a selftest-biblia.mjs mintájára).
 *
 * A node_modules-beli `typescript`-tel CommonJS-re transpile-olja az
 * apps/web/lib/worklog/print-columns.ts fájlt egy temp könyvtárba, és
 * assertekkel ellenőrzi:
 *  1. easterSunday — ismert évek (2024–2027),
 *  2. getUnnepInfo — fix + mozgó ünnepek + Újkenyér + negatív eset,
 *  3. classifyForOfficialJournal — a döntési sorrend minden ága.
 *
 * Futtatás:  node scripts/selftest-print-columns.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const SRC_FILE = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'worklog', 'print-columns.ts')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

if (!fs.existsSync(SRC_FILE)) {
  fail(`hiányzik a forrás: ${SRC_FILE}`)
  process.exit(1)
}

const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try {
  ts = require_('typescript')
} catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-print-columns-selftest-'))
let mod
try {
  const code = fs.readFileSync(SRC_FILE, 'utf8')
  const out = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: 'print-columns.ts',
  })
  const dest = path.join(tmp, 'print-columns.js')
  fs.writeFileSync(dest, out.outputText, 'utf8')
  mod = require_(dest)
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

const { easterSunday, getUnnepInfo, classifyForOfficialJournal } = mod

// ── 1. easterSunday — ismert évek ────────────────────────────────────────────
const easterCases = [
  [2024, '2024-03-31'],
  [2025, '2025-04-20'],
  [2026, '2026-04-05'],
  [2027, '2027-03-28'],
]
for (const [year, expected] of easterCases) {
  const got = easterSunday(year)
  if (got === expected) ok(`easterSunday(${year}) = ${expected}`)
  else fail(`easterSunday(${year}) = ${got}, várt: ${expected}`)
}

// ── 2. getUnnepInfo ──────────────────────────────────────────────────────────
const unnepCases = [
  ['2026-01-01', 'Újév', 'unnepi'],
  ['2026-02-18', 'Böjtfő', 'unnepi'],
  ['2026-03-29', 'Virágvasárnap', 'unnepi'],
  ['2026-04-03', 'Nagypéntek', 'unnepi'],
  ['2026-04-05', 'Húsvét', 'satoros'],
  ['2026-04-06', 'Húsvét másodnapja', 'satoros'],
  ['2026-04-07', 'Húsvét harmadnapja', 'satoros'],
  ['2026-05-14', 'Áldozócsütörtök', 'unnepi'],
  ['2026-05-24', 'Pünkösd', 'satoros'],
  ['2026-05-25', 'Pünkösd másodnapja', 'satoros'],
  ['2026-05-26', 'Pünkösd harmadnapja', 'satoros'],
  ['2026-08-30', 'Újkenyér', 'unnepi'],
  ['2026-10-31', 'Reformáció', 'unnepi'],
  ['2025-12-25', 'Karácsony', 'satoros'],
  ['2025-12-26', 'Karácsony másodnapja', 'satoros'],
  ['2026-12-27', 'Karácsony harmadnapja', 'satoros'],
]
for (const [iso, nev, tipus] of unnepCases) {
  const got = getUnnepInfo(iso)
  if (got && got.nev === nev && got.tipus === tipus) {
    ok(`getUnnepInfo(${iso}) = ${nev} (${tipus})`)
  } else {
    fail(`getUnnepInfo(${iso}) = ${JSON.stringify(got)}, várt: ${nev} (${tipus})`)
  }
}
// negatív esetek: sima hétköznap + sima vasárnap + augusztus NEM-utolsó vasárnapja
for (const iso of ['2026-03-17', '2026-03-15', '2026-08-23']) {
  const got = getUnnepInfo(iso)
  if (got === null) ok(`getUnnepInfo(${iso}) = null (nem ünnep)`)
  else fail(`getUnnepInfo(${iso}) = ${JSON.stringify(got)}, várt: null`)
}

// ── 3. classifyForOfficialJournal ────────────────────────────────────────────
// Minimál-bejegyzés gyártó (a WorklogEntry futásidőben nem típusellenőrzött).
const entry = (jellege, idopont, extra = {}) => ({
  id: 1,
  idopont,
  kategoria: null,
  jellege,
  id_jellege: null,
  bibliaolvasas: null,
  alapige: null,
  cim: null,
  enekek: null,
  jelenlet_ferfi: null,
  jelenlet_no: null,
  jelenlet_gyermek: null,
  jelenlet_osszesen: 0,
  szolgalt: null,
  persely: null,
  megjegyzes: null,
  mediapath: null,
  du: false,
  deleted: false,
  congregation_id: null,
  ...extra,
})

// 2026-03-15 vasárnap, 2026-03-16 hétfő, 2026-04-05 Húsvétvasárnap,
// 2026-01-01 Újév (csütörtök), 2026-04-03 Nagypéntek
const classifyCases = [
  // (h) vasárnapi de./du. + legacy du boolean
  ['vasárnapi de. istentisztelet', entry('Istentisztelet', '2026-03-15', { napszak: 'de' }), 'vasarnapi', 'de'],
  ['vasárnapi du. istentisztelet', entry('Istentisztelet', '2026-03-15', { napszak: 'du' }), 'vasarnapi', 'du'],
  ['vasárnapi du. (legacy du boolean)', entry('Istentisztelet', '2026-03-15', { du: true }), 'vasarnapi', 'du'],
  // (h) hétköznapi
  ['hétfői Imaóra', entry('Imaóra', '2026-03-16'), 'hetkoznapi', null],
  ['keddi Esti áhítat', entry('Esti áhítat', '2026-03-17', { napszak: 'este' }), 'hetkoznapi', null],
  // (h) ünnepek
  ['húsvéti istentisztelet', entry('Istentisztelet', '2026-04-05', { napszak: 'de' }), 'satoros', 'de'],
  ['újévi istentisztelet', entry('Istentisztelet', '2026-01-01', { napszak: 'de' }), 'unnepi', 'de'],
  ['nagypénteki istentisztelet du.', entry('Istentisztelet', '2026-04-03', { napszak: 'du' }), 'unnepi', 'du'],
  // (h) legacy szabad-szöveg felismerés
  ['legacy „Ünnepi istentisztelet" újévkor', entry('Ünnepi istentisztelet', '2026-01-01'), 'unnepi', 'de'],
  // (a) Úrvacsora
  ['Úrvacsora', entry('Úrvacsora', '2026-04-05'), 'urvacsora', 'templomban'],
  // (b) Bibliaóra
  ['Bibliaóra (felnőtt)', entry('Bibliaóra', '2026-03-18'), 'bibliaora', 'felnott'],
  ['Ifjúsági bibliaóra (IKE)', entry('Ifjúsági bibliaóra (IKE)', '2026-03-18'), 'bibliaora', 'ifjusagi'],
  ['Ifjúsági óra', entry('Ifjúsági óra', '2026-03-18'), 'bibliaora', 'ifjusagi'],
  // (c) Bűnbánati
  ['Bűnbánati reggel', entry('Bűnbánati istentisztelet', '2026-04-01', { napszak: 'de' }), 'bunbanati', 'reggel'],
  ['Bűnbánati este', entry('Bűnbánati istentisztelet', '2026-04-01', { napszak: 'este' }), 'bunbanati', 'este'],
  // (d)–(f)
  ['Presbiteri gyűlés', entry('Presbiteri gyűlés', '2026-03-18'), 'presbiteri', null],
  ['Konfirmáció előkészítő', entry('Konfirmáció előkészítő', '2026-03-18'), 'presbiteri', null],
  ['Nőszövetségi összejövetel', entry('Nőszövetségi összejövetel', '2026-03-18'), 'noszovetsegi', null],
  ['Vallásos ünnepély', entry('Vallásos ünnepély', '2026-03-18'), 'unnepely', null],
  // (g) kazuáliák + Imahét
  ['Temetés', entry('Temetés', '2026-03-18'), 'egyeb', null],
  ['Imahét (vasárnap is!)', entry('Imahét', '2026-03-15'), 'egyeb', null],
  ['Egyéb szolgálat', entry('Egyéb szolgálat', '2026-03-18'), 'egyeb', null],
  // (g½) legacy tartalmazás-tesztek — a (h) ág NEM nyelheti el őket
  // (vasárnapi dátumon is az úrvacsora/bűnbánati oszlopba kell esniük)
  ['legacy „Úrvacsorai istentisztelet" (vasárnap!)', entry('Úrvacsorai istentisztelet', '2026-03-15', { napszak: 'de' }), 'urvacsora', 'templomban'],
  ['legacy „Bűnbánati istentisztelet (nagyheti)" este', entry('Bűnbánati istentisztelet (nagyheti)', '2026-04-01', { napszak: 'este' }), 'bunbanati', 'este'],
  // ismeretlen / nem-istentiszteleti típusok
  ['ismeretlen jellege', entry('Hittan', '2026-03-15'), 'egyeb', null],
  ['üres jellege', entry(null, '2026-03-15'), 'egyeb', null],
]
for (const [label, e, column, slot] of classifyCases) {
  const got = classifyForOfficialJournal(e)
  if (got && got.column === column && got.slot === slot) {
    ok(`classify: ${label} → ${column}/${slot === null ? '—' : slot}`)
  } else {
    fail(`classify: ${label} = ${JSON.stringify(got)}, várt: ${column}/${slot}`)
  }
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nÖnellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nÖnellenőrzés: minden zöld')
