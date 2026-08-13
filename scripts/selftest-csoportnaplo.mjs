#!/usr/bin/env node
/**
 * CSOPORTNAPLÓ önellenőrzés — build/tesztkeret nélkül futtatható
 * (a selftest-reszszamadas.mjs mintájára).
 *
 * MIÉRT LÉTEZIK (2026-08-14, 15. pont)
 *   A csoportnapló korábban a TELJES bevétel+kiadás listát EGYETLEN
 *   `<div class="page">`-be tette. A `.page` stílusa csak `min-height: 210mm`-et
 *   ad, fix magasságot nem — a lap tehát korlátlanul nőtt:
 *     · az előnézetben nem látszott lapokra osztva (a felhasználó panasza),
 *     · nyomtatásban a 2. laptól a 10mm-es padding nem érvényesült (a @page
 *       margó 0), így a táblázat a papír széléig futott,
 *     · a fejléc és az oldalszám nem ismétlődött,
 *     · az oldalszámot ígérő `@page { @bottom-right { counter(page) } }` szabály
 *       CSS Paged Media margin-box, amit EGYETLEN böngészőmotor sem támogat.
 *
 *   Ez az önellenőrzés azt őrzi, hogy a lapokra bontás ne csússzon vissza.
 *
 *   A `reporting.ts` NULLA futásidejű importtal készül (csak `import type`),
 *   ezért önállóan fordítható, bundler nélkül.
 *
 * Futtatás:  node scripts/selftest-csoportnaplo.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const REPORT_SRC = path.join(REPO_ROOT, 'packages', 'ui-app', 'src', 'finance', 'reporting.ts')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

if (!fs.existsSync(REPORT_SRC)) {
  fail(`hiányzik a forrás: ${REPORT_SRC}`)
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-csoportnaplo-selftest-'))
function loadTs(srcFile, outName) {
  const code = fs.readFileSync(srcFile, 'utf8')
  const out = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: outName + '.ts',
  })
  // Fail-closed: ha valaha futásidejű import kerülne a fájlba, a require()
  // ismeretlen modulra futna — inkább ITT bukjon el, érthető üzenettel.
  if (/require\(["'][^."']/.test(out.outputText)) {
    throw new Error(
      `${outName}: FUTÁSIDEJŰ IMPORT került a fájlba — az önellenőrzés csak import nélküli forrást tud önállóan fordítani.`,
    )
  }
  const dest = path.join(tmp, outName + '.js')
  fs.writeFileSync(dest, out.outputText, 'utf8')
  return require_(dest)
}

let reportMod
try {
  reportMod = loadTs(REPORT_SRC, 'reporting')
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

const { buildFinancePrintDocument } = reportMod
if (typeof buildFinancePrintDocument !== 'function') {
  fail('a buildFinancePrintDocument nem exportált függvény')
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

// ── Próbaadat ─────────────────────────────────────────────────────────────
const YEAR = 2026

/** N bevétel-sor, `csoportok` jogcím között egyenletesen elosztva. */
function makeIncome(n, csoportok) {
  const rows = []
  for (let i = 0; i < n; i++) {
    rows.push({
      id: i + 1,
      datum: `${YEAR}-03-${String((i % 28) + 1).padStart(2, '0')}`,
      deleted: false,
      stornozott: false,
      id_befizetescel: (i % csoportok) + 1,
      osszeg: 100 + i,
      valuta: 'RON',
      forrasa: `Adakozó ${i + 1}`,
      megjegyzes: '',
      iratszam: `${i + 1}`,
    })
  }
  return rows
}

function makeExpense(n, csoportok) {
  const rows = []
  for (let i = 0; i < n; i++) {
    rows.push({
      id: 1000 + i,
      datum: `${YEAR}-04-${String((i % 28) + 1).padStart(2, '0')}`,
      deleted: false,
      stornozott: false,
      id_kiadascel: (i % csoportok) + 1,
      osszeg: 50 + i,
      valuta: 'RON',
      atvevo: `Szállító ${i + 1}`,
      megjegyzes: '',
      iratszam: `K${i + 1}`,
    })
  }
  return rows
}

function makeData(incomeCount, expenseCount, csoportok = 3) {
  const bevCelMap = {}
  const kiaCelMap = {}
  const cellek = []
  for (let c = 1; c <= csoportok; c++) {
    const bkod = `10${c}.01`
    const kkod = `20${c}.01`
    bevCelMap[c] = bkod
    kiaCelMap[c] = kkod
    cellek.push({ kod: bkod, nev: `Bevétel jogcím ${c}`, type: 'B' })
    cellek.push({ kod: kkod, nev: `Kiadás jogcím ${c}`, type: 'K' })
  }
  return {
    income: makeIncome(incomeCount, csoportok),
    expense: makeExpense(expenseCount, csoportok),
    bankAccounts: [],
    cellek,
    bevCelMap,
    kiaCelMap,
    congregationName: 'Barátosi Református Egyházközség',
    congregationNameRo: 'Parohia Reformată Brateș',
    carryoverCash: 0,
    carryoverBank: 0,
  }
}

const build = (data, filters) =>
  buildFinancePrintDocument('csoport_naplo', data, {
    year: YEAR,
    month: null,
    bankId: null,
    categoryKod: null,
    ...filters,
  })

/** Ahány szakasz („I. VENITURI" + „II. CHELTUIELI") van a nyomtatványon. */
const sectionsExpected = 2

const countPages = (html) => (html.match(/<div class="page"/g) || []).length
/** Tétel-sorok: a lapozás során EGYETLEN sem veszhet el és nem duplázódhat. */
const countRows = (html) => (html.match(/<tr class="item">/g) || []).length

// ── C1: sok tétel → TÖBB lap ──────────────────────────────────────────────
{
  const res = build(makeData(120, 90))
  const pages = countPages(res.html)
  if (pages > 1) ok(`C1  120 bevétel + 90 kiadás → ${pages} lapra bontva (nem egyetlen végtelen lap)`)
  else fail(`C1  a csoportnapló EGYETLEN lap maradt (${pages}) — a lapokra bontás nem működik`)
}

// ── C2: kevés tétel → EGY lap (a szakaszok EGYÜTT folynak, nincs üres lap) ─
{
  const res = build(makeData(3, 2))
  const pages = countPages(res.html)
  if (pages === 1) ok('C2  3 bevétel + 2 kiadás → 1 lap (a két szakasz egy lapon fut)')
  else fail(`C2  kevés tételnél is ${pages} lap keletkezett — fölösleges üres lap`)
}

// ── C3: EGYETLEN tétel sem vész el a lapozás során ────────────────────────
{
  const N_BEV = 77
  const N_KIA = 53
  const res = build(makeData(N_BEV, N_KIA))
  // A tétel-sorok a <tr> nyitótagek; a fejléc/cat-head/carry/totals sorok mind
  // osztályt kapnak (<tr class="…">), ezért a csupasz <tr> pontosan a tételeké.
  const rows = countRows(res.html)
  if (rows === N_BEV + N_KIA) ok(`C3  mind a ${N_BEV + N_KIA} tétel-sor megvan a lapozás után`)
  else fail(`C3  tétel-sor VESZETT vagy duplázódott: ${rows} sor a várt ${N_BEV + N_KIA} helyett`)
}

// ── C4: minden lapon van oldalszám, „pg. N / M" alakban, helyes M-mel ──────
{
  const res = build(makeData(120, 90))
  const pages = countPages(res.html)
  const nums = [...res.html.matchAll(/<div class="page-num">pg\. (\d+) \/ (\d+)<\/div>/g)]
  if (nums.length !== pages) {
    fail(`C4  ${pages} lap van, de csak ${nums.length} oldalszám — hiányzik a számozás`)
  } else if (nums.some((m) => Number(m[2]) !== pages)) {
    fail('C4  az oldalszám nevezője (M) nem egyezik a valódi lapszámmal')
  } else if (nums.some((m, i) => Number(m[1]) !== i + 1)) {
    fail('C4  az oldalszámok nem 1..M sorrendben futnak')
  } else {
    ok(`C4  mind a ${pages} lapon helyes „pg. N / ${pages}" oldalszám van`)
  }
}

// ── C5: a nem támogatott CSS Paged Media margin-box NINCS a kimenetben ─────
{
  const res = build(makeData(30, 20))
  if (/@bottom-right/.test(res.html)) {
    fail('C5  a @bottom-right (CSS Paged Media margin-box) VISSZAKERÜLT — egyetlen böngésző sem támogatja, az oldalszám így eltűnik')
  } else {
    ok('C5  nincs @bottom-right margin-box (a böngészők nem támogatják)')
  }
}

// ── C6: az aláírás-sáv és a végösszeg CSAK az UTOLSÓ lapon van ────────────
{
  const res = build(makeData(120, 90))
  const footers = (res.html.match(/<div class="footer">/g) || []).length
  const grands = (res.html.match(/<div class="grand">/g) || []).length
  if (footers === 1 && grands === 1) {
    ok('C6  az aláírás-sáv és a végösszeg-blokk pontosan egyszer (az utolsó lapon) szerepel')
  } else {
    fail(`C6  az aláírás-sáv ${footers}×, a végösszeg ${grands}× szerepel — mindkettőnek pontosan 1× kell`)
  }
}

// ── C7: minden tételes lapon van szakaszcím ÉS táblázat-fejléc ────────────
{
  const res = build(makeData(120, 90))
  const lapok = res.html.split('<div class="page"').slice(1)
  const rosszak = lapok.filter((lap) => {
    const vanTetel = /<tr class="item">/.test(lap)
    if (!vanTetel) return false // a záró blokk külön lapján nincs táblázat — rendben
    const titles = (lap.match(/<h2 class="section-title">/g) || []).length
    const theads = (lap.match(/<thead>/g) || []).length
    return titles === 0 || theads === 0 || titles !== theads
  }).length
  if (rosszak === 0) {
    ok(`C7  mind a ${lapok.length} lapon megismétlődik a szakaszcím és a táblázat-fejléc`)
  } else {
    fail(`C7  ${rosszak} lapról hiányzik a szakaszcím vagy a táblázat-fejléc`)
  }
}

// ── C8: pontosan 2 szakasz indul „élesben", a többi címsor folytatás ───────
{
  const res = build(makeData(120, 90))
  const titles = (res.html.match(/<h2 class="section-title">/g) || []).length
  const cont = (res.html.match(/continuare — folytatás/g) || []).length
  // Két szakasz (Venituri + Cheltuieli) → pontosan 2 NEM-folytatás címsor.
  if (cont > 0 && titles - cont === sectionsExpected) {
    ok(`C8  ${titles} címsorból ${cont} folytatás — pontosan ${sectionsExpected} szakasz indul élesben`)
  } else {
    fail(`C8  ${titles} címsor, ${cont} folytatás — várt ${sectionsExpected} „élesben induló" szakasz`)
  }
}

// ── C9: ÜRES időszak → 1 lap, érthető magyarázattal, oldalszámmal ─────────
{
  const res = build(makeData(0, 0))
  const pages = countPages(res.html)
  const hasMsg = /Nincs könyvelt tétel a kiválasztott időszakban/.test(res.html)
  const hasNum = /<div class="page-num">pg\. 1 \/ 1<\/div>/.test(res.html)
  if (pages === 1 && hasMsg && hasNum) {
    ok('C9  üres időszak → 1 lap, magyarázó szöveggel és oldalszámmal')
  } else {
    fail(`C9  üres időszak: ${pages} lap, magyarázat=${hasMsg}, oldalszám=${hasNum}`)
  }
}

// ── C10: jogcím-fejléc nem marad árván egy lap alján ──────────────────────
{
  // Sok kicsi csoport → sok cat-head sor, ez maximalizálja az árvulás esélyét.
  const res = build(makeData(96, 0, 32))
  const lapok = res.html.split('<div class="page"').slice(1)
  const arva = lapok.filter((lap) => {
    const body = lap.slice(0, lap.indexOf('</table>'))
    const trs = [...body.matchAll(/<tr[ >]/g)]
    if (trs.length === 0) return false
    // Az utolsó sor a lapon jogcím-fejléc? (a fejléc-sor osztálya: cat-head)
    const utolsoIdx = body.lastIndexOf('<tr')
    return /^<tr class="cat-head"/.test(body.slice(utolsoIdx))
  }).length
  if (arva === 0) ok('C10 egyetlen lap alján sem maradt árván jogcím-fejléc')
  else fail(`C10 ${arva} lap alján ÁRVÁN maradt egy jogcím-fejléc (a tételei a következő lapra kerültek)`)
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nCsoportnapló önellenőrzés: BUKOTT')
  process.exit(1)
}
console.log('\nCsoportnapló önellenőrzés: minden zöld')
