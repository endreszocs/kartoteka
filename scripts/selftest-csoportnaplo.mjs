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
 *   ⚠️ 2026-08-22 (6. pont): a `reporting.ts` korábban NULLA futásidejű
 *   importtal készült (csak `import type`), ezért önállóan fordult. A román
 *   nyomtatvány-kör óta VALÓDI, futásidejű importja van a közös kétnyelvű
 *   név-építőre (`./entity-name`), ezért azt is le kell fordítani UGYANEBBE a
 *   temp könyvtárba, hogy a relatív `require('./entity-name')` feloldódjon.
 *
 *   A pótlék NEM hamisítvány: a VALÓDI, lefordított modul kerül oda. A lenti
 *   fail-closed őr éle megmarad — az kizárólag a CSOMAGNÉV-importokat tiltja,
 *   a relatívakat nem.
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
const ENTITY_SRC = path.join(REPO_ROOT, 'packages', 'ui-app', 'src', 'finance', 'entity-name.ts')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

for (const f of [REPORT_SRC, ENTITY_SRC]) {
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
  // Az `entity-name` ELŐBB kell: a `reporting.ts` futásidőben
  // `require('./entity-name')`-t hív, ami ugyanebben a temp könyvtárban
  // oldódik fel.
  loadTs(ENTITY_SRC, 'entity-name')
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

// ═══════════════════════════════════════════════════════════════════════════
//  J-BLOKK: FŐKÖNYV (Registru Jurnal) LAPOZÁS (2026-08-14, K1)
//  A Főkönyv az egyetlen KÖTELEZŐEN bekötendő nyomtatvány (5 évente / 200
//  laponként kemény táblába) — a lapozásnak és a folytatólagos lapszámnak
//  szabályosnak KELL lennie.
// ═══════════════════════════════════════════════════════════════════════════

const buildJurnal = (data, month) =>
  buildFinancePrintDocument('registru_jurnal', data, {
    year: YEAR,
    month,
    bankId: null,
    categoryKod: null,
  })

/** N tétel a megadott hónapra (fele kassza, fele bank — bankszamla_id-vel). */
function jurnalData(perMonth) {
  const income = []
  const expense = []
  let id = 1
  for (const [month, n] of Object.entries(perMonth)) {
    for (let i = 0; i < n; i++) {
      const base = {
        id: id++,
        datum: `${YEAR}-${String(month).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
        deleted: false,
        stornozott: false,
        osszeg: 10 + i,
        valuta: 'RON',
        megjegyzes: i === 0 ? 'fűtés' : '',
        iratszam: `${i + 1}`,
        irattipus: i % 3 === 0 ? 'Fact.' : '',
        bankszamla_id: i % 2 === 0 ? null : 7,
      }
      if (i % 2 === 0) income.push({ ...base, id_befizetescel: 1, forrasa: `Adakozó ${i}` })
      else expense.push({ ...base, id_kiadascel: 1, atvevo: `Szállító ${i}` })
    }
  }
  return {
    income,
    expense,
    bankAccounts: [],
    cellek: [
      { kod: '101.01', nev: 'Egyházfenntartói járulék', nevro: 'Contribuția anuală', type: 'B' },
      { kod: '201.01', nev: 'Közköltség', nevro: 'Cheltuieli comune', type: 'K' },
    ],
    bevCelMap: { 1: '101.01' },
    kiaCelMap: { 1: '201.01' },
    congregationName: 'Barátosi Református Egyházközség',
    congregationNameRo: 'Parohia Reformată Brateș',
    carryoverCash: 100,
    carryoverBank: 200,
  }
}

// ── J1: 100 tétel → több lap, folytatólagos „pg. N" számokkal ─────────────
{
  const res = buildJurnal(jurnalData({ 3: 100 }), 3)
  const pages = countPages(res.html)
  const nums = [...res.html.matchAll(/<div class="page-num">pg\. (\d+)<\/div>/g)].map((m) => Number(m[1]))
  if (pages < 3) fail(`J1  100 tétel csak ${pages} lapra került (40/lap mellett legalább 3 kellene)`)
  else if (nums.length !== pages) fail(`J1  ${pages} lap, de ${nums.length} lapszám`)
  else if (nums.some((n, i) => i > 0 && n !== nums[i - 1] + 1)) fail(`J1  a lapszámok nem folytatólagosak: ${nums.join(', ')}`)
  else ok(`J1  100 tétel → ${pages} lap, folytatólagos lapszámokkal (${nums[0]}..${nums[nums.length - 1]})`)
}

// ── J2: a MÁRCIUSI lapszám folytatja a januári + februári lapokat ─────────
{
  const data = jurnalData({ 1: 100, 2: 10, 3: 5 })
  const jan = buildJurnal(data, 1)
  const feb = buildJurnal(data, 2)
  const mar = buildJurnal(data, 3)
  const first = (r) => Number([...r.html.matchAll(/pg\. (\d+)</g)][0][1])
  const last = (r) => { const a = [...r.html.matchAll(/pg\. (\d+)</g)]; return Number(a[a.length - 1][1]) }
  if (first(jan) === 1 && first(feb) === last(jan) + 1 && first(mar) === last(feb) + 1) {
    ok(`J2  a hónapok lapszámai folytatják egymást (jan ${first(jan)}..${last(jan)}, feb ${first(feb)}..${last(feb)}, már ${first(mar)}..)`)
  } else {
    fail(`J2  a hónapok lapszámai NEM folytatólagosak: jan ${first(jan)}..${last(jan)}, feb ${first(feb)}..${last(feb)}, már ${first(mar)}`)
  }
}

// ── J3: lap-átvitel — minden nem-első lap tetején Report, alján De reportat ─
{
  const res = buildJurnal(jurnalData({ 3: 100 }), 3)
  const pages = countPages(res.html)
  const reportPagina = (res.html.match(/Report din pagina precedenta/g) || []).length
  const deReportat = (res.html.match(/De reportat pagina urmatoare/g) || []).length
  const reportLuna = (res.html.match(/Report din luna precedenta/g) || []).length
  if (reportLuna === 1 && reportPagina === pages - 1 && deReportat === pages - 1) {
    ok(`J3  lap-átvitel rendben: 1 havi report + ${reportPagina} lap-report + ${deReportat} továbbvitel`)
  } else {
    fail(`J3  átvitel-sorok: havi=${reportLuna} (várt 1), lap-report=${reportPagina} (várt ${pages - 1}), továbbvitel=${deReportat} (várt ${pages - 1})`)
  }
}

// ── J4: a záró blokk (Total luna/rulaj/Sold) PONTOSAN egyszer, az utolsó lapon ─
{
  const res = buildJurnal(jurnalData({ 3: 100 }), 3)
  const totalLuna = (res.html.match(/Total luna/g) || []).length
  const sold = (res.html.match(/Sold numerar/g) || []).length
  const footers = (res.html.match(/<div class="footer">/g) || []).length
  if (totalLuna === 1 && sold === 1 && footers === 1) ok('J4  a záró blokk és az aláírás-sáv pontosan egyszer szerepel')
  else fail(`J4  Total luna=${totalLuna}, Sold=${sold}, footer=${footers} — mindnek 1-nek kell lennie`)
}

// ── J5: a rögzített irattípus jelenik meg (nem fix „Chit.") ───────────────
{
  const res = buildJurnal(jurnalData({ 3: 10 }), 3)
  if (/>Fact\.</.test(res.html)) ok('J5  a rögzített irattípus (Fact.) kikerül a nyomtatványra')
  else fail('J5  az irattípus felülíródik — a Fact. nem jelenik meg')
}

// ── J6: a Megjegyzés bekerül az Explicatii oszlopba ───────────────────────
{
  const res = buildJurnal(jurnalData({ 3: 10 }), 3)
  if (/fűtés/.test(res.html)) ok('J6  a Megjegyzés (altétel-bontás) bekerül az Explicatii oszlopba')
  else fail('J6  a Megjegyzés NEM kerül be az Explicatii oszlopba')
}

// ── J7: egyetlen tétel sem vész el a lapozásnál ───────────────────────────
{
  const N = 100
  const res = buildJurnal(jurnalData({ 3: N }), 3)
  // A tétel-sorok első cellája a folyó sorszám — a legnagyobbnak N-nek kell lennie.
  const sorszamok = [...res.html.matchAll(/<td class="text-center">(\d+)<\/td>\s*<td class="text-center">\d{4}\./g)].map((m) => Number(m[1]))
  const max = sorszamok.length ? Math.max(...sorszamok) : 0
  if (sorszamok.length === N && max === N) ok(`J7  mind a ${N} tétel-sor megvan, a sorszám ${max}-ig fut`)
  else fail(`J7  tétel-sorok: ${sorszamok.length} (várt ${N}), max sorszám: ${max}`)
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nCsoportnapló + Főkönyv önellenőrzés: BUKOTT')
  process.exit(1)
}
console.log('\nCsoportnapló + Főkönyv önellenőrzés: minden zöld')
