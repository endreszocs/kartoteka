#!/usr/bin/env node
/**
 * RÉSZSZÁMADÁS önellenőrzés — build/tesztkeret nélkül futtatható
 * (a selftest-print-columns.mjs mintájára).
 *
 * A node_modules-beli `typescript`-tel CommonJS-re transpile-olja KÉT forrást
 * egy temp könyvtárba, és assertekkel ellenőrzi:
 *
 *   packages/core/src/finance/reszszamadas/period-balances.ts   (tiszta mag)
 *   packages/ui-app/src/finance/budget-reporting.ts             (nyomtatvány)
 *
 * Mindkét fájl NULLA futásidejű importtal készül (a budget-reporting csak
 * `import type`-ot használ, amit a transpiler kidob) — ezért fordíthatók
 * önállóan, bundler nélkül.
 *
 * A LEGFONTOSABB ÁLLÍTÁS (Y0):
 *   Egy 01-01 – 12-31 időszakra kiadott RÉSZSZÁMADÁS SZÁMAI PONTOSAN
 *   megegyeznek az ÉVES SZÁMADÁSÉVAL. Ha nem, a levezetés hibás — akkor a
 *   részszámadás minden más időszakra is hamis számot nyomtatna.
 *
 * Futtatás:  node scripts/selftest-reszszamadas.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const PERIOD_SRC = path.join(REPO_ROOT, 'packages', 'core', 'src', 'finance', 'reszszamadas', 'period-balances.ts')
const REPORT_SRC = path.join(REPO_ROOT, 'packages', 'ui-app', 'src', 'finance', 'budget-reporting.ts')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

for (const f of [PERIOD_SRC, REPORT_SRC]) {
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-reszszamadas-selftest-'))
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

let periodMod, reportMod
try {
  periodMod = loadTs(PERIOD_SRC, 'period-balances')
  reportMod = loadTs(REPORT_SRC, 'budget-reporting')
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

const { computePeriodBalances, KASSZA } = periodMod
const {
  buildSzamadasReport,
  buildReszszamadasReport,
  buildBudgetModificationReport,
  buildBudgetReport,
  // 2026-08-11 (6. kör): a hivatalos ív sor-szabálya + a gyülekezeti
  // szerkeszthetőség — a KÉPERNYŐ (AccountingTab/BudgetTab) is EZEKET hívja.
  isSzamadasIvKod,
  szamadasIvCellak,
  szamadasIvLevelKodok,
  osszegezLevelek,
  gyulekezetSzerkesztheti,
} = reportMod

const Y = 2026
const near = (a, b, eps = 0.005) => Math.abs(Number(a) - Number(b)) <= eps

// ── Segéd: tétel-gyártó ──────────────────────────────────────────────────────
const row = (datum, osszeg, bankszamla_id = null, extra = {}) => ({
  datum,
  osszeg,
  bankszamla_id,
  deleted: false,
  stornozott: false,
  ...extra,
})

// ═════════════════════════════════════════════════════════════════════════════
// A. computePeriodBalances — T1…T9
// ═════════════════════════════════════════════════════════════════════════════

const baseIncome = [
  row(`${Y}-01-01`, 1200),                                   // pontosan jan. 1. — kassza
  row(`${Y}-06-15`, 100, 1, { osszeg_ron: 497 }),            // devizás banki tétel
  row(`${Y}-12-31`, 300),                                    // pontosan dec. 31. — kassza
]
const baseExpense = [
  row(`${Y}-03-10`, 500),
  row(`${Y}-09-01`, 250, 1),
]
const YEAR_OPEN_CASH = 1500
const YEAR_OPEN_BANK = { 1: 8000 }

function pb(overrides = {}) {
  return computePeriodBalances({
    income: baseIncome,
    expense: baseExpense,
    year: Y,
    periodFrom: `${Y}-01-01`,
    periodTo: `${Y}-12-31`,
    yearOpeningCash: YEAR_OPEN_CASH,
    yearOpeningBankById: YEAR_OPEN_BANK,
    ...overrides,
  })
}

// T1 — teljes évre a `pre` ablak ÜRES → az időszaki nyitó = az évi nyitó
{
  const r = pb()
  if ('error' in r) fail(`T1: váratlan hiba: ${r.error}`)
  else if (near(r.cash.opening, YEAR_OPEN_CASH)) ok('T1  teljes évre a kassza nyitója = az évi nyitó (a `pre` ablak félig nyílt)')
  else fail(`T1: cash.opening = ${r.cash.opening}, várt: ${YEAR_OPEN_CASH}`)
}

// T2 — ugyanez a bankokra (összegezve)
{
  const r = pb()
  const expected = Object.values(YEAR_OPEN_BANK).reduce((s, v) => s + v, 0)
  if ('error' in r) fail(`T2: váratlan hiba: ${r.error}`)
  else if (near(r.bank.opening, expected)) ok('T2  teljes évre a bank nyitója = az évi bank-nyitók összege')
  else fail(`T2: bank.opening = ${r.bank.opening}, várt: ${expected}`)
}

// T3 — a PONTOSAN jan. 1-i és PONTOSAN dec. 31-i tétel BENT van (mindkét vég inkluzív)
{
  const r = pb({ periodFrom: `${Y}-01-01`, periodTo: `${Y}-12-31` })
  // kassza net = +1200 (jan 1) + 300 (dec 31) − 500 (márc 10) = 1000
  if ('error' in r) fail(`T3: váratlan hiba: ${r.error}`)
  else if (near(r.cash.net, 1000) && r.movementCount === 5) {
    ok('T3  a jan. 1-i és a dec. 31-i tétel is BENNE van az időszakban (inkluzív végek)')
  } else fail(`T3: cash.net = ${r.cash.net} (várt 1000), movementCount = ${r.movementCount} (várt 5)`)
}

// T3b — szűkített ablak: a jan. 1-i tétel a NYITÓBA csúszik át, nem tűnik el
{
  const r = pb({ periodFrom: `${Y}-02-01`, periodTo: `${Y}-12-31` })
  if ('error' in r) fail(`T3b: váratlan hiba: ${r.error}`)
  // nyitó kassza = 1500 + 1200 (jan 1., a `pre` ablakban) = 2700
  else if (near(r.cash.opening, 2700) && near(r.cash.closing, 2500)) {
    ok('T3b az időszak ELŐTTI tétel a NYITÓBA kerül (nem vész el, nem duplázódik)')
  } else fail(`T3b: cash.opening = ${r.cash.opening} (várt 2700), cash.closing = ${r.cash.closing} (várt 2500)`)
}

// T4 — stornózott és törölt sor SEHOL nem számít (sem nyitó, sem záró)
{
  const r = pb({
    income: [...baseIncome, row(`${Y}-05-05`, 99999, null, { stornozott: true })],
    expense: [...baseExpense, row(`${Y}-05-06`, 88888, null, { deleted: true })],
  })
  const clean = pb()
  if ('error' in r || 'error' in clean) fail('T4: váratlan hiba')
  else if (near(r.total.closing, clean.total.closing) && r.movementCount === clean.movementCount) {
    ok('T4  a stornózott és a törölt tétel SEHOL nem számít (záró és darabszám változatlan)')
  } else fail(`T4: total.closing = ${r.total.closing}, várt: ${clean.total.closing}`)
}

// T5 — teljes belső átvezetés-pár: a TOTAL nem mozdul, a kassza/bank bontás IGEN
{
  const clean = pb()
  const r = pb({
    income: [...baseIncome, row(`${Y}-07-01`, 100, 1)],   // bank +100
    expense: [...baseExpense, row(`${Y}-07-01`, 100)],    // kassza −100
  })
  if ('error' in r || 'error' in clean) fail('T5: váratlan hiba')
  else if (
    near(r.total.closing, clean.total.closing) &&
    near(r.cash.closing, clean.cash.closing - 100) &&
    near(r.bank.closing, clean.bank.closing + 100)
  ) {
    ok('T5  a belső átvezetés-pár a TOTAL zárót nem mozdítja, a kassza/bank bontást igen')
  } else {
    fail(`T5: total ${r.total.closing}/${clean.total.closing}, cash ${r.cash.closing}, bank ${r.bank.closing}`)
  }
}

// T6 — devizás sor: a RON-ekvivalens (osszeg_ron) számít, nem a nyers összeg
{
  const r = pb()
  // bank net = +497 (devizás bevétel) − 250 (kiadás) = 247
  if ('error' in r) fail(`T6: váratlan hiba: ${r.error}`)
  else if (near(r.bank.net, 247)) ok('T6  devizás tételnél a RON-ekvivalens (497) számít, nem a nyers 100')
  else fail(`T6: bank.net = ${r.bank.net}, várt: 247`)
}

// T7 — reconcileDelta = 0 tiszta adaton (minden tételnek van jogcíme, a belső pár páros)
{
  const r = computePeriodBalances({
    income: [...baseIncome, row(`${Y}-07-01`, 100, 1)],
    expense: [...baseExpense, row(`${Y}-07-01`, 100)],
    year: Y,
    periodFrom: `${Y}-01-01`,
    periodTo: `${Y}-12-31`,
    yearOpeningCash: YEAR_OPEN_CASH,
    yearOpeningBankById: YEAR_OPEN_BANK,
    // a belső átvezetés-pár SZÁNDÉKOSAN nincs benne a jogcím-térképekben (3xx/4xx)
    actualIncomeByCode: { '101.01': 1200, '102.01': 797 },
    actualExpenseByCode: { '201.01': 500, '202.01': 250 },
  })
  if ('error' in r) fail(`T7: váratlan hiba: ${r.error}`)
  else if (near(r.reconcileDelta, 0)) ok('T7  reconcileDelta = 0 tiszta adaton (egyenleg-szabály ⇄ folyam-szabály egyezik)')
  else fail(`T7: reconcileDelta = ${r.reconcileDelta}, várt: 0`)
}

// T7b — jogcím nélküli tétel → a delta HANGOSAN nem nulla
{
  const r = computePeriodBalances({
    income: [...baseIncome, row(`${Y}-08-08`, 640)], // jogcím nélkül könyvelt bevétel
    expense: baseExpense,
    year: Y,
    periodFrom: `${Y}-01-01`,
    periodTo: `${Y}-12-31`,
    yearOpeningCash: YEAR_OPEN_CASH,
    yearOpeningBankById: YEAR_OPEN_BANK,
    actualIncomeByCode: { '101.01': 1200, '102.01': 797 },
    actualExpenseByCode: { '201.01': 500, '202.01': 250 },
  })
  if ('error' in r) fail(`T7b: váratlan hiba: ${r.error}`)
  else if (near(r.reconcileDelta, 640)) ok('T7b jogcím nélküli tétel → reconcileDelta = 640 (lábjegyzet a papíron)')
  else fail(`T7b: reconcileDelta = ${r.reconcileDelta}, várt: 640`)
}

// T8 — évhatáron átnyúló / fordított / hibás formátum → { error }, NEM csonkítás
{
  const cases = [
    ['évhatáron átnyúló', { periodFrom: `${Y}-11-01`, periodTo: `${Y + 1}-02-28` }],
    ['fordított sorrend', { periodFrom: `${Y}-09-01`, periodTo: `${Y}-03-01` }],
    ['hibás formátum', { periodFrom: '2026.01.01', periodTo: `${Y}-06-30` }],
    ['üres kezdő dátum', { periodFrom: '', periodTo: `${Y}-06-30` }],
    ['előző év', { periodFrom: `${Y - 1}-01-01`, periodTo: `${Y - 1}-12-31` }],
  ]
  let allOk = true
  for (const [label, ov] of cases) {
    const r = pb(ov)
    if (!('error' in r)) {
      fail(`T8: „${label}" NEM adott hibát — csonkított eredményt kaptunk`)
      allOk = false
    }
  }
  if (allOk) ok('T8  érvénytelen időszak MINDEN esetben { error } (soha néma csonkítás az évhatárra)')
}

// T9 — nulla mozgású időszak: movementCount = 0, opening = closing
{
  const r = pb({ periodFrom: `${Y}-02-01`, periodTo: `${Y}-02-28` })
  if ('error' in r) fail(`T9: váratlan hiba: ${r.error}`)
  else if (
    r.movementCount === 0 &&
    near(r.total.opening, r.total.closing) &&
    near(r.cash.opening, r.cash.closing)
  ) {
    ok('T9  nulla mozgású időszak: movementCount = 0, nyitó = záró')
  } else fail(`T9: movementCount = ${r.movementCount}, opening = ${r.total.opening}, closing = ${r.total.closing}`)
}

// T10 — ismeretlen bankszámla (év közben nyitott, nincs nyitó-sora) → 0-ról indul
{
  const r = pb({
    income: [...baseIncome, row(`${Y}-10-01`, 400, 7)],
    yearOpeningBankById: YEAR_OPEN_BANK, // a 7-es számla NINCS benne
  })
  if ('error' in r) fail(`T10: váratlan hiba: ${r.error}`)
  else if (r.bankById[7] && near(r.bankById[7].opening, 0) && near(r.bankById[7].closing, 400)) {
    ok('T10 év közben nyitott számla nyitója 0 (nem egy MÁSIK számla nyitója)')
  } else fail(`T10: bankById[7] = ${JSON.stringify(r.bankById[7])}`)
}

// T11 — a KASSZA konstans a bank-id-kkel nem ütközik
if (KASSZA === -1) ok('T11 a KASSZA azonosító (-1) nem ütközhet valós bankszámla-id-vel')
else fail(`T11: KASSZA = ${KASSZA}, várt: -1`)

// ═════════════════════════════════════════════════════════════════════════════
// B. Y0 — ÉV-AZONOSSÁG: a 01-01 – 12-31 részszámadás = az éves Számadás
// ═════════════════════════════════════════════════════════════════════════════

const cellek = [
  { id: '101', nev: 'Egyházfenntartói járulék', nevro: 'Contribuții de întreținere', type: 'B', kod: '101' },
  { id: '101.01', nev: 'Járulék', nevro: 'Contribuție', type: 'B', kod: '101.01' },
  { id: '102', nev: 'Perselypénz és adományok', nevro: 'Colecte și donații', type: 'B', kod: '102' },
  { id: '102.01', nev: 'Persely', nevro: 'Colectă', type: 'B', kod: '102.01' },
  { id: '201', nev: 'Személyi kiadások', nevro: 'Cheltuieli de personal', type: 'K', kod: '201' },
  { id: '201.01', nev: 'Bér és járulékai', nevro: 'Salarii', type: 'K', kod: '201.01' },
  { id: '202', nev: 'Fenntartási kiadások', nevro: 'Cheltuieli de întreținere', type: 'K', kod: '202' },
  { id: '202.01', nev: 'Villany, fűtés', nevro: 'Energie', type: 'K', kod: '202.01' },
]
const budgetRows = {
  '101.01': { szamadasicelid: '101.01', tervezett: 5000, modositott: null, mod2: null, mod3: null },
  '102.01': { szamadasicelid: '102.01', tervezett: 1500, modositott: null, mod2: null, mod3: null },
  '201.01': { szamadasicelid: '201.01', tervezett: 3000, modositott: null, mod2: null, mod3: null },
  '202.01': { szamadasicelid: '202.01', tervezett: 900, modositott: null, mod2: null, mod3: null },
}
// A tény-térképek a TELJES évre — a részszámadás ugyanezt kapja, mert az
// időszak a teljes év (a wrapper ugyanígy, időszakra szűrve aggregál).
const actualIncome = { '101.01': 1200, '102.01': 797 }
const actualExpense = { '201.01': 500, '202.01': 250 }

// A pénzmozgás: a fenti jogcímes tételek + EGY teljes belső átvezetés-pár.
const yearIncome = [...baseIncome, row(`${Y}-07-01`, 100, 1)]
const yearExpense = [...baseExpense, row(`${Y}-07-01`, 100)]

const fullYearBalances = computePeriodBalances({
  income: yearIncome,
  expense: yearExpense,
  year: Y,
  periodFrom: `${Y}-01-01`,
  periodTo: `${Y}-12-31`,
  yearOpeningCash: YEAR_OPEN_CASH,
  yearOpeningBankById: YEAR_OPEN_BANK,
  actualIncomeByCode: actualIncome,
  actualExpenseByCode: actualExpense,
})

if ('error' in fullYearBalances) {
  fail(`Y0: a teljes évi levezetés hibára futott: ${fullYearBalances.error}`)
} else {
  const common = {
    cellek,
    budgetRows,
    actualIncome,
    actualExpense,
    congregationName: 'Brátesi Református Egyházközség',
    year: Y,
    carryoverCash: YEAR_OPEN_CASH,
    carryoverBank: Object.values(YEAR_OPEN_BANK).reduce((s, v) => s + v, 0),
    finalized: false,
  }
  const yearly = buildSzamadasReport({ ...common })
  const partial = buildReszszamadasReport({
    ...common,
    periodFrom: `${Y}-01-01`,
    periodTo: `${Y}-12-31`,
    periodBalances: fullYearBalances,
    keszult: '2026-08-11',
  })

  if (partial.blocked) {
    fail(`Y0: a teljes évi részszámadás LETILTVA készült el (blocked) — nem várt`)
  }

  // ── Számok kinyerése a HTML-ből ───────────────────────────────────────────
  // Csak az ÉRTÉK-cellák érdekelnek: szám ("1.234,56"), "x" vagy "—".
  const NUM_RE = /^-?\d{1,3}(\.\d{3})*,\d{2}$/
  const isValueCell = (t) => NUM_RE.test(t) || t === 'x' || t === '—'
  function valueRows(html) {
    const out = []
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g
    let m
    while ((m = trRe.exec(html))) {
      const cells = []
      const tdRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g
      let c
      while ((c = tdRe.exec(m[1]))) {
        cells.push(
          c[1]
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .trim(),
        )
      }
      const vals = cells.filter(isValueCell)
      if (vals.length > 0) out.push(vals)
    }
    return out
  }

  let yRows = valueRows(yearly.html)
  const pRows = valueRows(partial.html)

  // 2026-08-14 (K2): az ÉVES Számadás záró blokkja a hivatalos 116–134. sorokat
  // is hozza (Datorii 116+117–127 · Creanțe 128+129–133 · Záróegyenleg 134 =
  // 19 értéksor), amelyek a BELSŐ részszámadáson SZÁNDÉKOSAN nincsenek rajta.
  // A Y0 szám-azonossági garanciája a KÖZÖS sorokra vonatkozik; a 19 többlet-
  // sorról külön állítjuk, hogy (adat híján) nulla, és a 134. Záróegyenleg
  // egyezik a 113. Solddal.
  const OFFICIAL_CLOSING_EXTRA = 19
  if (yRows.length === pRows.length + OFFICIAL_CLOSING_EXTRA) {
    const extra = yRows.slice(-OFFICIAL_CLOSING_EXTRA)
    const soldRow = yRows[yRows.length - OFFICIAL_CLOSING_EXTRA - 3] // a 113. sor (Sold)
    const zaroRow = extra[extra.length - 1] // a 134. sor (Záróegyenleg)
    const koztesMindNulla = extra
      .slice(0, -1)
      .every((cells) => cells.every((v) => v === 'x' || v === '0,00'))
    const zaroEgyezik =
      soldRow && zaroRow && zaroRow[zaroRow.length - 1] === soldRow[soldRow.length - 1]
    if (koztesMindNulla && zaroEgyezik) {
      ok('Y0d az éves többlet PONTOSAN a hivatalos 116–134. blokk: Datorii/Creanțe nulla, Záróegyenleg = Sold')
      yRows = yRows.slice(0, -OFFICIAL_CLOSING_EXTRA)
    } else {
      fail(`Y0d a hivatalos záró blokk értékei nem a vártak (nullák + Záróegyenleg=Sold): zaro=${JSON.stringify(zaroRow)} sold=${JSON.stringify(soldRow)}`)
    }
  }

  if (yRows.length !== pRows.length) {
    fail(`Y0: eltérő értéksor-szám — éves: ${yRows.length}, részszámadás: ${pRows.length}`)
  } else {
    ok(`Y0a a két nyomtatvány ugyanannyi értéksort ad (${yRows.length} sor)`)
    // A ZÁRÓ kistábla Casa/Banca sorai az évesben szándékosan „—" (nincs
    // számlánkénti bontás), a részszámadásban VALÓS szám. Ezt a két sort
    // külön kezeljük; minden MÁS sornak cellára pontosan egyeznie kell.
    const diffs = []
    for (let i = 0; i < yRows.length; i++) {
      const a = yRows[i]
      const b = pRows[i]
      if (a.length === b.length && a.every((v, j) => v === b[j])) continue
      if (a.length === b.length && a.every((v, j) => v === b[j] || v === '—')) continue
      diffs.push(`  sor ${i + 1}: éves [${a.join(' | ')}]  ≠  rész [${b.join(' | ')}]`)
    }
    if (diffs.length === 0) {
      ok('Y0b MINDEN értéksor cellára pontosan egyezik (nyitó, jogcímek, végösszegek, záró)')
    } else {
      fail(`Y0b eltérő értéksorok a teljes évi részszámadás és az éves Számadás között:\n${diffs.join('\n')}`)
    }
  }

  // A záró egyenleg számszerű egyezése külön, kimondva.
  const closingFromFlow =
    YEAR_OPEN_CASH +
    Object.values(YEAR_OPEN_BANK).reduce((s, v) => s + v, 0) +
    Object.values(actualIncome).reduce((s, v) => s + v, 0) -
    Object.values(actualExpense).reduce((s, v) => s + v, 0)
  if (near(fullYearBalances.total.closing, closingFromFlow)) {
    ok(`Y0c a levezetett záró (${fullYearBalances.total.closing}) = az éves Számadás zárója (${closingFromFlow})`)
  } else {
    fail(`Y0c záró eltérés: levezetett ${fullYearBalances.total.closing} ≠ éves ${closingFromFlow}`)
  }

  // ── Y0e (2026-08-14, K2): a HIVATALOS, FIX Nr. rând ─────────────────────
  // A futó számláló 101 számozott sorból 69-et rontott el; a lelkészi jelentés
  // VIII. fejezetének hivatkozott sorai (66., 97., 98.) is rosszak voltak.
  {
    // Egy kód sorának Nr. rând cellája: <td class="c">NN</td><td class="c">KOD</td>
    const nrOf = (kod) => {
      const m = yearly.html.match(new RegExp(`<td class="c">(\\d+|—)</td><td class="c">${kod.replace('.', '\\.')}</td>`))
      return m ? m[1] : null
    }
    // A fixture kódjaira állítunk — a 102→13 a régi hiba PONTOS detektora:
    // a futó számláló a 102-nek 6-ot adott volna (nyitó 1–3 + 101→4 + 101.01→5),
    // a hivatalos szám 13.
    const elvart = [
      ['101', '4'],
      ['101.01', '5'],
      ['102', '13'],
      ['102.01', '14'],
      ['201', '53'],
      ['201.01', '54'],
      ['202', '73'],
      ['202.01', '74'],
    ]
    const rossz = elvart.filter(([kod, nr]) => nrOf(kod) !== nr)
    if (rossz.length === 0) {
      ok('Y0e a Nr. rând a FIX hivatalos katalógusból jön (102→13, 201→53, 202→73 — nem futó számláló)')
    } else {
      fail(`Y0e rossz Nr. rând: ${rossz.map(([kod, nr]) => `${kod}: várt ${nr}, kapott ${nrOf(kod)}`).join(' · ')}`)
    }

    // A közbeékelt hivatalos összesítő sorok jelen vannak a saját számukkal.
    const kozbeekelt = [
      ['Total venituri proprii', '36'],
      ['Total încasări', '52'],
      ['EXCEDENT', '100'],
      ['DEFICIT', '101'],
      ['Plăți totale', '112'],
    ]
    const hianyzo = kozbeekelt.filter(
      ([label, nr]) => !new RegExp(`${label}[^<]*[\\s\\S]{0,200}?<td class="c">${nr}</td>`).test(yearly.html),
    )
    if (hianyzo.length === 0) ok('Y0e a közbeékelt hivatalos összesítő sorok (36/52/100/101/112) jelen vannak')
    else fail(`Y0e hiányzó közbeékelt sor: ${hianyzo.map(([l, n]) => `${l} (${n})`).join(' · ')}`)

    // A hivatalos záró blokk (Datorii/Creanțe/Záróegyenleg) a papíron van.
    if (/Datorii/.test(yearly.html) && /Creanțe/.test(yearly.html) && /Záróegyenleg/.test(yearly.html)) {
      ok('Y0e a hivatalos 116–134. záró blokk (Datorii · Creanțe · Záróegyenleg) a Számadáson van')
    } else {
      fail('Y0e a hivatalos záró blokk HIÁNYZIK a Számadásról')
    }

    // A módosítás-nyomtatvány is hozza az 1–3. nyitósort (K2: sorszám-csúszás vége).
    const modReport = buildBudgetModificationReport({ ...common, modNumber: 1 })
    if (/Disponibil din anul precedent/.test(modReport.html)) {
      ok('Y0e a Költségvetés-módosításon is ott az 1–3. nyitósor (nincs többé 3 soros csúszás)')
    } else {
      fail('Y0e a Költségvetés-módosításról hiányzik az 1–3. nyitósor')
    }
  }

  // ── Y1: a részszámadás NEM téveszthető össze az évessel ───────────────────
  const checks = [
    ['időszak-sáv MINDEN táblázatoldalon', () => {
      const bands = (partial.html.match(/class="pband"/g) || []).length
      // FIGYELEM: a `page-footer` is „page"-dzsel kezdődik — pontos illesztés kell.
      const pages = (partial.html.match(/<div class="page(?:"| cover")/g) || []).length
      return pages >= 2 && bands === pages - 1 // a borítón nincs sáv
    }],
    ['nincs „EXECUȚIA BUGETARĂ" (az éves beadvány neve)', () => !partial.html.includes('EXECUȚIA BUGETARĂ')],
    ['a román cím SITUAȚIE FINANCIARĂ PARȚIALĂ', () => partial.html.includes('SITUAȚIE FINANCIARĂ PARȚIALĂ')],
    ['nincs Számvevő-aláírás', () => !partial.html.includes('Számvevő')],
    ['az évesen VAN Számvevő-aláírás', () => yearly.html.includes('Számvevő')],
    ['nincs egyházmegyei iktató-blokk', () => !partial.html.includes('REFORMÁTUS EGYHÁZMEGYE')],
    ['nincs presbitériumi határozat sor', () => !partial.html.includes('Tárgyalta és jóváhagyta a presbitérium')],
    ['kimondja: nem küldhető be', () => partial.html.includes('nem küldhető be helyette')],
    ['van kassza-egyeztető vonal', () => partial.html.includes('A kasszában lévő tényleges készpénz')],
    ['van bank-egyeztető vonal', () => partial.html.includes('A bankkivonat záró egyenlege')],
    ['a záró felirat az IDŐSZAK végére szól', () => partial.html.includes('Sold la sfârșitul perioadei')],
    ['fájlnév tartalmazza az időszakot', () => partial.filename === `Reszszamadas_${Y}_${Y}-01-01_${Y}-12-31.pdf`],
  ]
  for (const [label, fn] of checks) {
    if (fn()) ok(`Y1  ${label}`)
    else fail(`Y1: ${label} — NEM teljesül`)
  }

  // ── Y2: fail-closed kapuk a nyomtatványon ────────────────────────────────
  const gateCases = [
    ['hiányzó periodBalances', { ...common, periodFrom: `${Y}-01-01`, periodTo: `${Y}-06-30` }],
    ['hiányzó időszak', { ...common, periodBalances: fullYearBalances }],
    ['évhatáron átnyúló', { ...common, periodFrom: `${Y}-11-01`, periodTo: `${Y + 1}-01-31`, periodBalances: fullYearBalances }],
    ['fordított időszak', { ...common, periodFrom: `${Y}-09-01`, periodTo: `${Y}-03-01`, periodBalances: fullYearBalances }],
  ]
  for (const [label, data] of gateCases) {
    const r = buildReszszamadasReport(data)
    if (r.blocked === true) ok(`Y2  ${label} → a nyomtatvány LETILTVA (blocked)`)
    else fail(`Y2: ${label} → NEM tiltotta le, hamis papír készülhetne`)
  }

  // ── Y3: a P0 #1 javítás — a végösszeg-sorokban a TÉNY is megjelenik ──────
  //
  // 2026-08-15: a táblázat végéről eltűnt a három, sorszám nélküli végösszeg-sor
  // (megismételték a hivatalos ív saját összesítőit). A P0 #1 GARANCIÁJA — hogy
  // a végösszegnél a TERV és a TÉNY is megjelenik, és a tény nem esik a terv
  // cellájába — mostantól a HIVATALOS 52. soron (Total încasări) mérjük.
  {
    const ertekek = totRowErtekek(yearly.html, 'Total încasări / Összbevétel')
    if (ertekek && ertekek.length === 2 && ertekek[0] === '6.500,00' && ertekek[1] === '1.997,00') {
      ok('Y3  a hivatalos 52. összesítő sorban a TERV és a TÉNY is szerepel (P0 #1)')
    } else {
      fail(`Y3: az 52. sor értékcellái nem a vártak (terv 6.500,00 · tény 1.997,00): ${JSON.stringify(ertekek)}`)
    }
    // És a régi, duplikált sor TÉNYLEG eltűnt — nehogy visszakerüljön.
    if (!/<tr class="tot">/.test(yearly.html)) {
      ok('Y3  nincs sorszám nélküli, duplikált végösszeg-sor a táblázat végén')
    } else {
      fail('Y3: visszakerült a sorszám nélküli végösszeg-sor — a hivatalos ív összesítőit ismétli meg')
    }
  }

  // ── Y4: a nyomtatási margó nincs nullázva (P1 #5) ────────────────────────
  {
    const printRule = (yearly.html.match(/@media print \{[^}]*\}[^}]*\}[^}]*\}/) || [''])[0]
    if (!/\.page \{[^}]*padding: 0/.test(yearly.html)) {
      ok('Y4  a @media print ág NEM nullázza a lap paddingjét (P1 #5)')
    } else {
      fail(`Y4: a nyomtatási ág továbbra is nullázza a paddingot: ${printRule}`)
    }
  }

  // ── Y6: a P0 #2 javítás — a KÖLTSÉGVETÉS-MÓDOSÍTÁS végösszeg-sora ────────
  //
  // A módosítás-nyomtatványnak HÁROM értékoszlopa van (Előző · Módosítás ·
  // Végleges). A végösszeg-sor korábban EGYETLEN cellát írt ki a MÓDOSÍTÁS
  // ELŐTTI (terv) végösszeggel, és az a colspan miatt a „Végleges" oszlop alá
  // esett: az aláírt, beküldött módosításon a végleges összbevétel helyén a
  // régi szám állt. Itt a három cellát ellenőrizzük, számszerűen.
  {
    const modBudgetRows = {
      '101.01': { szamadasicelid: '101.01', tervezett: 5000, modositott: 5500, mod2: null, mod3: null },
      '102.01': { szamadasicelid: '102.01', tervezett: 1500, modositott: null, mod2: null, mod3: null },
      '201.01': { szamadasicelid: '201.01', tervezett: 3000, modositott: 3200, mod2: null, mod3: null },
      '202.01': { szamadasicelid: '202.01', tervezett: 900, modositott: null, mod2: null, mod3: null },
    }
    // Terv: bevétel 6.500 · kiadás 3.900 · többlet 2.600
    // Végleges: bevétel 7.000 · kiadás 4.100 · többlet 2.900
    // Módosítás (különbözet): +500 · +200 · +300
    const modReport = buildBudgetModificationReport({
      ...common,
      budgetRows: modBudgetRows,
      modNumber: 1,
    })
    // 2026-08-15: a mérés a HIVATALOS összesítő sorokon fut (52. Total încasări,
    // 112. Plăți totale) — a sorszám nélküli, duplikált végösszeg-sorok eltűntek.
    const expected = [
      ['Total încasări / Összbevétel', '6.500,00', '500,00', '7.000,00'],
      ['Plăți totale / Kiadások összesen', '3.900,00', '200,00', '4.100,00'],
    ]
    let allGood = true
    for (const [label, prev, delta, final] of expected) {
      const ertekek = totRowErtekek(modReport.html, label)
      if (!ertekek || ertekek.length !== 3 || ertekek[0] !== prev || ertekek[1] !== delta || ertekek[2] !== final) {
        allGood = false
        fail(`Y6: a(z) „${label}" hivatalos összesítő NEM ${prev} · ${delta} · ${final} — kapott: ${JSON.stringify(ertekek)}`)
      }
    }
    if (allGood) {
      ok('Y6  a költségvetés-módosítás hivatalos összesítőiben az ELŐZŐ, a MÓDOSÍTÁS és a VÉGLEGES is szerepel (P0 #2)')
    }

    // A hivatalos összesítő sor cella-száma egyezzen a fejléc oszlop-számával (7)
    // — így a sor nem tud elcsúszni akkor sem, ha a formátum valaha változik.
    // Szerkezete: <td colspan="2"> felirat + 2 db <td class="c"> + 3 db érték.
    const sumRowMatch = modReport.html.match(
      /<tr class="grp">\s*<td class="name" colspan="(\d+)">[^<]*<\/td>\s*<td class="c">\d+<\/td><td class="c"><\/td>((?:<td class="r">[^<]*<\/td>)+)/,
    )
    if (sumRowMatch) {
      const spanned = Number(sumRowMatch[1])
      const valueCells = (sumRowMatch[2].match(/<td class="r">/g) || []).length
      if (spanned + 2 + valueCells === 7) {
        ok('Y6  a hivatalos összesítő sor pontosan kitölti a 7 oszlopot (nincs elcsúszás)')
      } else {
        fail(`Y6: a hivatalos összesítő ${spanned} + 2 + ${valueCells} = ${spanned + 2 + valueCells} oszlopot fed le 7 helyett`)
      }
    } else {
      fail('Y6: a módosítás-nyomtatványban nem található hivatalos összesítő sor')
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Y5 — OLDALTÖRDELÉS: a lap NEM csordulhat túl, és nem lehet ÜRES táblaoldal
// ═════════════════════════════════════════════════════════════════════════════
//
// 2026-08-11 (6. kör, reviewer-major): a részszámadás minden táblázatoldala
// kapott egy `.pband` időszak-sávot (≈8mm), a feltöltés viszont továbbra is a
// nyers 42 soros konstanssal ment. Böngészőben mérve a 2. oldalon a táblázat
// alja 294.4mm-nél volt egy 296mm-es lapon → a `.page-footer` RÁÍRÓDOTT az
// utolsó sorokra, a `.page` overflow:hidden miatt pedig a levágás NÉMA volt.
// Ezek az állítások a geometriát nem tudják mérni (nincs böngésző), de a KÉT
// hibaosztályt, ami odavezetett, igen: (1) a lapszám és a feltöltés széthúzása
// (elveszett vagy túltöltött sorok), (2) az üres utolsó táblaoldal.
{
  const tbodyRows = (html) =>
    [...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].map(
      (m) => (m[1].match(/<tr\b/g) || []).length,
    )

  // Katalógus-gyártó: `n` csoport × (1 csoportsor + 6 végpont)
  function nagyKatalogus(n) {
    const cs = []
    const br = {}
    const ai = {}
    const ae = {}
    for (let g = 0; g < n; g++) {
      const type = g % 2 === 0 ? 'B' : 'K'
      const base = (type === 'B' ? 100 : 200) + g
      cs.push({ id: String(base), nev: `Csoport ${g}`, nevro: `Grup ${g}`, type, kod: String(base) })
      for (let i = 1; i <= 6; i++) {
        const id = `${base}.0${i}`
        cs.push({ id, nev: `Jogcím ${g}/${i}`, nevro: `Poz ${g}/${i}`, type, kod: id })
        br[id] = { szamadasicelid: id, tervezett: 1000, modositott: null, mod2: null, mod3: null }
        if (type === 'B') ai[id] = 10
        else ae[id] = 5
      }
    }
    return { cellek: cs, budgetRows: br, actualIncome: ai, actualExpense: ae }
  }

  let y5ok = true
  for (const n of [1, 3, 6, 10, 14, 20, 40]) {
    const k = nagyKatalogus(n)
    const bal = computePeriodBalances({
      income: [row(`${Y}-02-02`, 100)],
      expense: [],
      year: Y,
      periodFrom: `${Y}-01-01`,
      periodTo: `${Y}-06-30`,
      yearOpeningCash: 1000,
      yearOpeningBankById: { 1: 2000 },
      actualIncomeByCode: k.actualIncome,
      actualExpenseByCode: k.actualExpense,
    })
    if ('error' in bal) {
      fail(`Y5: a levezetés hibára futott (${n} csoport): ${bal.error}`)
      y5ok = false
      continue
    }
    const common = {
      ...k,
      congregationName: 'Teszt Egyházközség',
      year: Y,
      carryoverCash: 1000,
      carryoverBank: 2000,
      finalized: false,
    }
    const valtozatok = [
      ['Számadás', buildSzamadasReport({ ...common }), 14],
      [
        'Részszámadás',
        buildReszszamadasReport({
          ...common,
          periodFrom: `${Y}-01-01`,
          periodTo: `${Y}-06-30`,
          periodBalances: bal,
          keszult: '2026-08-11',
          nyitoBizonytalan: true,
          devizaSzamlak: ['Teszt EUR számla'],
        }),
        20,
      ],
    ]
    for (const [nev, rep, reserved] of valtozatok) {
      if (rep.blocked) {
        fail(`Y5: ${nev} (${n} csoport) BLOCKED lett`)
        y5ok = false
        continue
      }
      // A részszámadás oldal-büdzséje 2 sorral kisebb (az időszak-sáv miatt).
      const perPage = nev === 'Részszámadás' ? 40 : 42
      const sizes = tbodyRows(rep.html)
      // (1) Egyetlen oldal sem lépheti túl a per-oldal büdzsét.
      const tulcsordul = sizes.filter((s) => s > perPage)
      if (tulcsordul.length > 0) {
        fail(`Y5: ${nev} (${n} csoport) — ${tulcsordul.length} oldal TÚLLÉPI a ${perPage} soros büdzsét: ${sizes.join('/')}`)
        y5ok = false
      }
      // (2) ÜRES táblaoldal (fejléc-sor egy üres táblával) nem keletkezhet.
      if (sizes.some((s) => s === 0)) {
        fail(`Y5: ${nev} (${n} csoport) — ÜRES táblázatoldal keletkezett: ${sizes.join('/')}`)
        y5ok = false
      }
      // (3) Az utolsó oldalon a záró blokk mellé fenntartott hely megmarad.
      const utolso = sizes[sizes.length - 1]
      if (utolso > perPage - reserved) {
        fail(`Y5: ${nev} (${n} csoport) — az utolsó oldalon ${utolso} sor van, a záró blokk mellett legfeljebb ${perPage - reserved} fér el`)
        y5ok = false
      }
      // (4) A lapszámozás („N / M oldal") egyezik a tényleges oldalszámmal.
      const oldalak = (rep.html.match(/class="page"/g) || []).length + 1 // + borító
      const jelolt = Number((rep.html.match(/\/\s*(\d+)\s*oldal/) || [])[1] || 0)
      if (jelolt && jelolt !== oldalak) {
        fail(`Y5: ${nev} (${n} csoport) — a lábléc ${jelolt} oldalt ígér, de ${oldalak} van`)
        y5ok = false
      }
    }
  }
  if (y5ok) {
    ok('Y5  oldaltördelés: nincs túltöltött és nincs ÜRES táblaoldal, a záró blokk helye megmarad')
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Z — EGYHÁZMEGYEI SZINTŰ KÓDOK: a KÉPERNYŐ és a PAPÍR ugyanazt mondja,
//        de a gyülekezet nem tölti ki őket
// ═════════════════════════════════════════════════════════════════════════════
//
// 2026-08-11 (6. kör, TULAJDONOSI DÖNTÉS — Endre, lelkipásztor):
//   1) A hivatalos GYÜLEKEZETI Számadás-/Költségvetés-ív TARTALMAZZA az
//      egyházmegyei szintűnek jelölt sorokat (201.15, 201.17, 206.02, 101.07,
//      105.03, 106.02–106.06 …) — tehát a képernyőn sem szabad elrejteni őket.
//   2) DE a gyülekezet ezekre nem könyvelhet és nem is módosíthatja őket.
//
// A HIBA, amit ez a szakasz őriz: az `AccountingTab`/`BudgetTab` `szint` szerint
// szűrt, a nyomtatvány nem. Az ilyen kódra könyvelt pénz a KINYOMTATOTT
// végösszegben benne volt, a KÉPERNYŐN láthatóban nem — és az aláírt papír az
// egyik. A képernyő mostantól ugyanazt a `szamadasIvLevelKodok`/`osszegezLevelek`
// párost hívja, amiből a nyomtatvány sorai és végösszegei is készülnek; ha bárki
// visszatenné a szint-szűrést az egyik oldalra, itt bukik el.
{
  const zCellek = [
    { id: '100', nev: 'Múlt évi pénztármaradvány', nevro: 'Disponibil', type: 'B', kod: '100' },
    { id: '100.02', nev: 'Belső mozgás (banki)', nevro: 'Transfer', type: 'B', kod: '100.02' },
    { id: '101', nev: 'Egyházfenntartói járulék', nevro: 'Contribuții', type: 'B', kod: '101' },
    { id: '101.01', nev: 'Járulék', nevro: 'Contribuție', type: 'B', kod: '101.01', szint: 'gyulekezet' },
    { id: '101.07', nev: 'Központi járulékok', nevro: 'Contribuții centrale', type: 'B', kod: '101.07', szint: 'egyhazmegye' },
    { id: '201', nev: 'Személyi kiadások', nevro: 'Cheltuieli de personal', type: 'K', kod: '201' },
    { id: '201.01', nev: 'Bér és járulékai', nevro: 'Salarii', type: 'K', kod: '201.01' },
    { id: '201.17', nev: 'Társadalombiztosítás', nevro: 'CAS', type: 'K', kod: '201.17', szint: 'egyhazmegye' },
  ]
  // A 101.07 / 201.17 (egyházmegyei szintű) soron VAN tárolt terv és VAN tény —
  // pontosan az az eset, amit a régi szűrő elnyelt.
  const zBudgetRows = {
    '101.01': { szamadasicelid: '101.01', tervezett: 5000, modositott: null, mod2: null, mod3: null },
    '101.07': { szamadasicelid: '101.07', tervezett: 700, modositott: null, mod2: null, mod3: null },
    '201.01': { szamadasicelid: '201.01', tervezett: 3000, modositott: null, mod2: null, mod3: null },
    '201.17': { szamadasicelid: '201.17', tervezett: 400, modositott: null, mod2: null, mod3: null },
  }
  const zActualIncome = { '101.01': 1200, '101.07': 800, '100.02': 45000 }
  const zActualExpense = { '201.01': 500, '201.17': 900 }

  const zCommon = {
    cellek: zCellek,
    budgetRows: zBudgetRows,
    actualIncome: zActualIncome,
    actualExpense: zActualExpense,
    congregationName: 'Teszt Református Egyházközség',
    year: Y,
    carryoverCash: 0,
    carryoverBank: 0,
    finalized: false,
  }
  const zSzamadas = buildSzamadasReport({ ...zCommon })
  const zKoltsegvetes = buildBudgetReport({ ...zCommon })

  // ── Z1: az egyházmegyei szintű kód RAJTA van a képernyő ív-listáján ──────
  {
    const bevLevelek = szamadasIvLevelKodok(zCellek, 'B')
    const kiaLevelek = szamadasIvLevelKodok(zCellek, 'K')
    const bevOk = bevLevelek.includes('101.07') && bevLevelek.includes('101.01')
    const kiaOk = kiaLevelek.includes('201.17') && kiaLevelek.includes('201.01')
    if (bevOk && kiaOk) {
      ok('Z1  az egyházmegyei szintű kód (101.07 / 201.17) RAJTA van a hivatalos ív levél-listáján')
    } else {
      fail(`Z1: hiányzik az ív-listáról — bevétel [${bevLevelek.join(', ')}], kiadás [${kiaLevelek.join(', ')}]`)
    }
  }

  // ── Z2: a KÉPERNYŐ végösszege = a PAPÍR végösszege (a lényegi állítás) ───
  //
  // A képernyő ugyanígy számol: `osszegezLevelek(leafKodok, actualIncome)`
  // (lásd AccountingTab `totalActualIncome` / `totalActualExpense`).
  {
    const kepernyoTervBev = osszegezLevelek(szamadasIvLevelKodok(zCellek, 'B'), zBudgetRows_terv(zBudgetRows))
    const kepernyoTenyBev = osszegezLevelek(szamadasIvLevelKodok(zCellek, 'B'), zActualIncome)
    const kepernyoTervKia = osszegezLevelek(szamadasIvLevelKodok(zCellek, 'K'), zBudgetRows_terv(zBudgetRows))
    const kepernyoTenyKia = osszegezLevelek(szamadasIvLevelKodok(zCellek, 'K'), zActualExpense)

    const papirBev = totRowErtekek(zSzamadas.html, 'Total încasări / Összbevétel')
    const papirKia = totRowErtekek(zSzamadas.html, 'Plăți totale / Kiadások összesen')

    if (!papirBev || !papirKia) {
      fail('Z2: a Számadás nyomtatványon nem található a végösszeg-sor')
    } else if (
      papirBev[0] === fmtHu(kepernyoTervBev) &&
      papirBev[1] === fmtHu(kepernyoTenyBev) &&
      papirKia[0] === fmtHu(kepernyoTervKia) &&
      papirKia[1] === fmtHu(kepernyoTenyKia)
    ) {
      ok(
        `Z2  a képernyő és a papír végösszege AZONOS egyházmegyei szintű kódon álló pénz mellett ` +
          `(bevétel terv ${papirBev[0]} · tény ${papirBev[1]} · kiadás terv ${papirKia[0]} · tény ${papirKia[1]})`,
      )
    } else {
      fail(
        'Z2: SZÉTHÚZ a képernyő és a papír!\n' +
          `  papír  bevétel [${papirBev.join(' | ')}]  kiadás [${papirKia.join(' | ')}]\n` +
          `  képernyő bevétel [${fmtHu(kepernyoTervBev)} | ${fmtHu(kepernyoTenyBev)}]  ` +
          `kiadás [${fmtHu(kepernyoTervKia)} | ${fmtHu(kepernyoTenyKia)}]`,
      )
    }
  }

  // ── Z2b: a tény tényleg NEM nulla a szintes kódon (különben Z2 üresen is zöld) ──
  {
    const tenyBev = osszegezLevelek(['101.07'], zActualIncome)
    const tenyKia = osszegezLevelek(['201.17'], zActualExpense)
    if (tenyBev === 800 && tenyKia === 900) {
      ok('Z2b a próba VALÓBAN egyházmegyei szintű kódon álló pénzzel fut (800 / 900 lej)')
    } else {
      fail(`Z2b: a próbaadat elromlott — 101.07 = ${tenyBev}, 201.17 = ${tenyKia}`)
    }
  }

  // ── Z2c: a szintes sor MEGJELENIK a papíron, a tárolt terv-értékkel ──────
  {
    const bevSor = /<td class="c">101\.07<\/td><td class="r">700,00<\/td>/.test(zKoltsegvetes.html)
    const kiaSor = /<td class="c">201\.17<\/td><td class="r">400,00<\/td>/.test(zKoltsegvetes.html)
    if (bevSor && kiaSor) {
      ok('Z2c a zárolt (egyházmegyei szintű) soron TÁROLT költségvetési érték kikerül a papírra — nem dobjuk el')
    } else {
      fail('Z2c: a 101.07 / 201.17 tárolt terv-értéke NEM jelenik meg a Költségvetés nyomtatványon')
    }
  }

  // ── Z2d: a 100-as fejezet SEHOL nem sor (sem a papíron, sem a képernyőn) ──
  //
  // A belső mozgás / nyitó pénztármaradvány külön blokk (1–3. sor). Korábban a
  // nyomtatvány `c.id !== '100'`-at nézett, tehát a 100.02 LEVÉL kikerült a
  // papírra — összeggel —, de a végösszegbe nem számított bele: egy sor, aminek
  // a pénze sehol nem jött ki. Ez a kizárás a tulajdonosi döntés UTÁN IS érvényes.
  {
    // 2026-08-14 (K2): a minta a KÓD-cellát nézi, nem a Nr. rând cellát.
    // A sor szerkezete: <td class="c">NR</td><td class="c">KOD</td><td class="r">…
    // — a kód-cellát az különbözteti meg, hogy KÖZVETLENÜL érték-cella követi.
    // (A hivatalos EXCEDENT sor Nr. rând-ja 100 — az NEM a 100-as fejezet kódja.)
    const nincsSor = !/<td class="c">100(\.\d+)?<\/td><td class="r">/.test(zSzamadas.html)
    const nincsKod =
      !isSzamadasIvKod('100', 'B') &&
      !isSzamadasIvKod('100.02', 'B') &&
      !isSzamadasIvKod('100.51', 'B') &&
      !szamadasIvLevelKodok(zCellek, 'B').includes('100.02')
    if (nincsSor && nincsKod) {
      ok('Z2d a 100-as fejezet (belső mozgás / nyitó) SEHOL nem ív-sor — a papíron és a képernyőn sem')
    } else {
      fail(`Z2d: a 100-as fejezet átcsúszott — sor a papíron: ${!nincsSor}, kód-szabály: ${!nincsKod}`)
    }
  }

  // ── Z3: a GYÜLEKEZET nem írhat a szintes sorra (read-only szabály) ───────
  {
    const esetek = [
      ['egyhazmegye', false],
      ['kerulet', false],
      ['gyulekezet', true],
      [undefined, true],
      [null, true],
    ]
    const rossz = esetek.filter(([szint, vart]) => gyulekezetSzerkesztheti(szint) !== vart)
    if (rossz.length === 0) {
      ok('Z3  gyulekezetSzerkesztheti: egyhazmegye/kerulet = NEM, gyulekezet/hiányzó = igen')
    } else {
      fail(`Z3: hibás szerkeszthetőség — ${rossz.map(([s]) => String(s)).join(', ')}`)
    }
  }

  // ── Z3b: a költségvetés-írás gyülekezeti hatókörben NEM tud értéket
  //         előállítani egyházmegyei szintű kódon ─────────────────────────
  //
  // Ugyanaz a kapu, amit a `BudgetTab.setValue` használ (`if (zarolt(celId)) return`),
  // a UI nélkül lejátszva: minden levél-sorra megpróbálunk beírni 99 999-et.
  {
    const tarolt = Object.fromEntries(
      Object.entries(zBudgetRows).map(([k, v]) => [k, v.tervezett]),
    )
    const irasiKiserlet = (kod, ertek) => {
      const cel = zCellek.find((c) => c.id === kod)
      if (!cel || !gyulekezetSzerkesztheti(cel.szint)) return false // ZÁROLT — nincs írás
      tarolt[kod] = ertek
      return true
    }
    const levelek = [
      ...szamadasIvLevelKodok(zCellek, 'B'),
      ...szamadasIvLevelKodok(zCellek, 'K'),
    ]
    const sikeres = levelek.filter((kod) => irasiKiserlet(kod, 99999))
    const zaroltErintetlen = tarolt['101.07'] === 700 && tarolt['201.17'] === 400
    const nyitottIrhato = tarolt['101.01'] === 99999 && tarolt['201.01'] === 99999
    const nemProbaltZaroltat = !sikeres.includes('101.07') && !sikeres.includes('201.17')
    if (zaroltErintetlen && nyitottIrhato && nemProbaltZaroltat) {
      ok('Z3b gyülekezeti hatókörben a zárolt kódra NEM keletkezik költségvetési érték, a tárolt régi érték megmarad')
    } else {
      fail(
        `Z3b: a zárolás kilyukadt — 101.07 = ${tarolt['101.07']} (várt 700), ` +
          `201.17 = ${tarolt['201.17']} (várt 400), 101.01 = ${tarolt['101.01']} (várt 99999)`,
      )
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// E. ZM — AZ EGYHÁZMEGYE SAJÁT ÍVE: MINDEN TÉTEL RAJTA VAN
// ═════════════════════════════════════════════════════════════════════════════
//
// 2026-08-11 (6. kör, TULAJDONOSI DÖNTÉS — Endre, lelkipásztor):
//   „minden tétel szerepel rajta, nem csak az egyházmegyeiek!"
//
// A HIBA, amit ez a szakasz őriz: az `AccountingTab` és a `BudgetTab`
// `ivSorLathato` függvényében állt egy
//     if (scope === 'diocese') return gyulekezetSzerkesztheti(cell.szint)
// ág, ami MEGFORDÍTVA szűrt: a megyei nézetből pont az a 18 SAJÁT kód esett ki,
// amit az egyházmegye tölt ki (201.15, 201.17, 206.02, 101.07, 105.03,
// 106.02–106.06 …). A nyomtatvány (`collectBudgetRows`) `szint` szerint SOSEM
// szűrt, tehát a megyei képernyő és a megyei papír széthúzott: a képernyőn
// kevesebb sor és KISEBB végösszeg állt, mint az aláírt íven — ugyanaz a
// hibaosztály, mint a gyülekezeti oldalon, csak ellentétes előjellel.
//
// A sor-tagság mostantól hatókörtől FÜGGETLEN, és mindkét fül ugyanazt a
// `szamadasIvCellak`-ot hívja, amiből a papír sorai is készülnek.
{
  // Az egyházmegye SAJÁT íve: pénz VAN a saját (egyházmegyei szintű) kódjain
  // ÉS a gyülekezeti szintűeken is — a megyének is van perselypénze, bére, rezsije.
  const zmCellek = [
    { id: '100', nev: 'Múlt évi pénztármaradvány', nevro: 'Disponibil', type: 'B', kod: '100' },
    { id: '100.02', nev: 'Belső mozgás (banki)', nevro: 'Transfer', type: 'B', kod: '100.02' },
    { id: '101', nev: 'Egyházfenntartói járulék', nevro: 'Contribuții', type: 'B', kod: '101' },
    { id: '101.01', nev: 'Járulék', nevro: 'Contribuție', type: 'B', kod: '101.01', szint: 'gyulekezet' },
    { id: '101.07', nev: 'Központi járulékok', nevro: 'Contribuții centrale', type: 'B', kod: '101.07', szint: 'egyhazmegye' },
    { id: '201', nev: 'Személyi kiadások', nevro: 'Cheltuieli de personal', type: 'K', kod: '201' },
    { id: '201.01', nev: 'Bér és járulékai', nevro: 'Salarii', type: 'K', kod: '201.01', szint: 'gyulekezet' },
    { id: '201.17', nev: 'Társadalombiztosítás', nevro: 'CAS', type: 'K', kod: '201.17', szint: 'egyhazmegye' },
  ]
  const zmBudgetRows = {
    '101.01': { szamadasicelid: '101.01', tervezett: 12000, modositott: null, mod2: null, mod3: null },
    '101.07': { szamadasicelid: '101.07', tervezett: 700, modositott: null, mod2: null, mod3: null },
    '201.01': { szamadasicelid: '201.01', tervezett: 9000, modositott: null, mod2: null, mod3: null },
    '201.17': { szamadasicelid: '201.17', tervezett: 400, modositott: null, mod2: null, mod3: null },
  }
  // A 100.02 (belső mozgás) SZÁNDÉKOSAN benne van: sehol nem szabad beszámítania.
  const zmActualIncome = { '101.01': 11500, '101.07': 800, '100.02': 45000 }
  const zmActualExpense = { '201.01': 8800, '201.17': 900 }

  const zmSzamadas = buildSzamadasReport({
    cellek: zmCellek,
    budgetRows: zmBudgetRows,
    actualIncome: zmActualIncome,
    actualExpense: zmActualExpense,
    congregationName: 'Teszt Református Egyházmegye',
    year: Y,
    carryoverCash: 0,
    carryoverBank: 0,
    finalized: false,
  })

  // ── ZM1: a megyei íven MINDEN ív-tétel szerepel (nem csak a 18 megyei) ────
  {
    const bevSorok = szamadasIvCellak(zmCellek, 'B').map((c) => c.id)
    const kiaSorok = szamadasIvCellak(zmCellek, 'K').map((c) => c.id)
    const varhato = zmCellek
      .filter((c) => c.id !== '100' && !c.id.startsWith('100.'))
      .map((c) => c.id)
      .sort()
    const kapott = [...bevSorok, ...kiaSorok].sort()
    const mind = varhato.length === kapott.length && varhato.every((id, i) => id === kapott[i])
    // Kimondva is: a GYÜLEKEZETI és az EGYHÁZMEGYEI szintű sor EGYARÁNT rajta van.
    const mindketSzint =
      bevSorok.includes('101.01') &&
      bevSorok.includes('101.07') &&
      kiaSorok.includes('201.01') &&
      kiaSorok.includes('201.17')
    if (mind && mindketSzint) {
      ok(`ZM1 a megyei íven MINDEN tétel szerepel, nem csak a megyeiek (${kapott.length} sor)`)
    } else {
      fail(
        `ZM1: hiányzik sor a megyei ívről — várt [${varhato.join(', ')}], kapott [${kapott.join(', ')}]`,
      )
    }
  }

  // ── ZM2: a megyei KÉPERNYŐ végösszege = a megyei PAPÍR végösszege ─────────
  //
  // A képernyő ugyanígy számol (AccountingTab `totalActualIncome` stb.):
  // `osszegezLevelek(szamadasIvLevelKodok(cellek, 'B'), actualIncome)` — a
  // sor-lista pedig hatókörtől független, tehát a megyei fül ugyanezt kapja.
  {
    const bevLevelek = szamadasIvLevelKodok(zmCellek, 'B')
    const kiaLevelek = szamadasIvLevelKodok(zmCellek, 'K')
    const kepTervBev = osszegezLevelek(bevLevelek, zBudgetRows_terv(zmBudgetRows))
    const kepTenyBev = osszegezLevelek(bevLevelek, zmActualIncome)
    const kepTervKia = osszegezLevelek(kiaLevelek, zBudgetRows_terv(zmBudgetRows))
    const kepTenyKia = osszegezLevelek(kiaLevelek, zmActualExpense)

    const papirBev = totRowErtekek(zmSzamadas.html, 'Total încasări / Összbevétel')
    const papirKia = totRowErtekek(zmSzamadas.html, 'Plăți totale / Kiadások összesen')

    // A megyei szintű pénz TÉNYLEG benne van (különben ZM2 üresen is zöld lenne),
    // és a belső mozgás (100.02, 45 000) SEHOL nem számít bele.
    const megyeiPenzBenne = kepTenyBev === 12300 && kepTenyKia === 9700
    if (!papirBev || !papirKia) {
      fail('ZM2: a megyei Számadás nyomtatványon nem található a végösszeg-sor')
    } else if (!megyeiPenzBenne) {
      fail(
        `ZM2: a megyei képernyő végösszege rossz — bevétel tény ${kepTenyBev} (várt 12300), ` +
          `kiadás tény ${kepTenyKia} (várt 9700). Vagy a megyei kód esett ki, vagy a 100.02 csúszott be.`,
      )
    } else if (
      papirBev[0] === fmtHu(kepTervBev) &&
      papirBev[1] === fmtHu(kepTenyBev) &&
      papirKia[0] === fmtHu(kepTervKia) &&
      papirKia[1] === fmtHu(kepTenyKia)
    ) {
      ok(
        `ZM2 a megyei íven a képernyő és a papír végösszege AZONOS ` +
          `(bevétel terv ${papirBev[0]} · tény ${papirBev[1]} · kiadás terv ${papirKia[0]} · tény ${papirKia[1]})`,
      )
    } else {
      fail(
        'ZM2: SZÉTHÚZ a megyei képernyő és a megyei papír!\n' +
          `  papír    bevétel [${papirBev.join(' | ')}]  kiadás [${papirKia.join(' | ')}]\n` +
          `  képernyő bevétel [${fmtHu(kepTervBev)} | ${fmtHu(kepTenyBev)}]  ` +
          `kiadás [${fmtHu(kepTervKia)} | ${fmtHu(kepTenyKia)}]`,
      )
    }
  }

  // ── ZM3: SZERKEZETI ŐR — a két fül nem tarthat saját sor-szabályt ─────────
  //
  // Ez az egyetlen állítás, ami magát a REGRESSZIÓT tudja elkapni: a fülek
  // TSX-ek, ezt az önellenőrzést pedig bundler nélkül futtatjuk, tehát a
  // komponenst nem tudjuk példányosítani. Amit viszont ellenőrizni tudunk: hogy
  // a sor-lista a KÖZÖS `szamadasIvCellak`-ból jön, és nincs mellette itteni,
  // hatókörre ágazó másolat. Ha valaki visszatenné a szint-szűrést bármelyik
  // oldalra, itt bukik el — nem élesben, egy aláírt papíron.
  {
    const tabFajlok = [
      ['AccountingTab.tsx', path.join(REPO_ROOT, 'packages', 'ui-app', 'src', 'finance', 'AccountingTab.tsx')],
      ['BudgetTab.tsx', path.join(REPO_ROOT, 'packages', 'ui-app', 'src', 'finance', 'BudgetTab.tsx')],
    ]
    // A megjegyzések SZÁNDÉKOSAN leírják a régi, hibás ágat (hogy soha senki ne
    // tegye vissza) — ezért a vizsgálat csak a TÉNYLEGES kódra fut. A
    // whitespace-normalizálás miatt a formázó (prettier sortörése) nem tudja
    // álpozitívra vagy álnegatívra fordítani az állítást.
    const kodNelkulMegjegyzes = (src) =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
        .replace(/\s+/g, ' ')

    let zm3ok = true
    for (const [nev, fajl] of tabFajlok) {
      if (!fs.existsSync(fajl)) {
        fail(`ZM3: hiányzik a fül forrása: ${fajl}`)
        zm3ok = false
        continue
      }
      const kod = kodNelkulMegjegyzes(fs.readFileSync(fajl, 'utf8'))
      // A sor-lista a KÖZÖS hívás EREDMÉNYE, változtatás nélkül. A lezáró
      // `, [szamadasiCellek])` a lényeg: egy odabiggyesztett `.filter(...)`
      // (bármilyen alakban írva) itt megbukik, nem csak a régi `scope ===`
      // mintát ismerjük fel. A dep-lista sem tartalmazhatja a `scope`-ot.
      for (const type of ['B', 'K']) {
        // Regexszel (nem szó szerinti egyezéssel), hogy a sortörés/záró vessző
        // stílusa ne dönthesse el egy pénzügyi állítás sorsát.
        const varhato = new RegExp(
          `useMemo\\(\\s*\\(\\)\\s*=>\\s*szamadasIvCellak\\(\\s*szamadasiCellek\\s*,\\s*'${type}'\\s*\\)\\s*,\\s*\\[\\s*szamadasiCellek\\s*\\]\\s*,?\\s*\\)`,
        )
        if (!varhato.test(kod)) {
          fail(
            `ZM3: ${nev} — a(z) '${type}' sor-lista NEM a közös szamadasIvCellak() ÉRINTETLEN eredménye ` +
              `(várt alak: useMemo(() => szamadasIvCellak(szamadasiCellek, '${type}'), [szamadasiCellek]))`,
          )
          zm3ok = false
        }
      }
      if (kod.includes('isSzamadasIvKod')) {
        fail(`ZM3: ${nev} újra saját másolatot tart az ív-szabályból (isSzamadasIvKod) — a papírral fog széthúzni`)
        zm3ok = false
      }
    }
    if (zm3ok) {
      ok('ZM3 mindkét fül a KÖZÖS ív-szabályból építi a sorokat, hatókörre ágazó másolat nélkül')
    }
  }
}

/** A `budgetRows` térkép → kódonkénti TERV szám (a képernyő `budgetData`-ja). */
function zBudgetRows_terv(rows) {
  const out = {}
  for (const [kod, r] of Object.entries(rows)) out[kod] = r.tervezett || 0
  return out
}

/** Magyar pénzformátum a nyomtatvány `fmtNum`-jával azonos alakban. */
function fmtHu(n) {
  const parts = Math.abs(n).toFixed(2).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return (n < 0 ? '-' : '') + parts[0] + ',' + parts[1]
}

/**
 * Egy végösszeg-sor ÉRTÉK-celláit adja vissza a nyomtatvány HTML-jéből.
 * Szándékosan string-kereséssel (nem dinamikus regexszel): a magyar/román
 * feliratokban lévő „/" és ékezetek escape-elése csak hibaforrás lenne.
 */
function totRowErtekek(html, label) {
  const at = html.indexOf(label)
  if (at < 0) return null
  const utan = html.slice(at + label.length)
  const zaras = utan.indexOf('</tr>')
  const sor = zaras < 0 ? utan : utan.slice(0, zaras)
  return [...sor.matchAll(/<td class="r">([^<]*)<\/td>/g)].map((x) => x[1])
}

// ── Diakritika-őr (2026-08-14, 16. pont) ──────────────────────────────────
// A hivatalos nyomtatványokon a MODERN román írásmód (ș/ț, vessző) a szabvány
// — a régi, cedillás ș/ț nem kerülhet vissza a kimeneti katalógusokba
// (a 11. pont fișa-döntésének kiterjesztése a pénzügyi regiszterekre).
for (const rel of [
  ['packages', 'ui-app', 'src', 'finance', 'reporting.ts'],
  ['packages', 'ui-app', 'src', 'finance', 'budget-reporting.ts'],
]) {
  const src = fs.readFileSync(path.join(REPO_ROOT, ...rel), 'utf8')
  // Unicode-escape-ekkel (U+015E/015F = Ş/ş cedillával, U+0162/0163 = Ţ/ţ
  // cedillával) — szó szerinti karakterrel a minta egy gépi betű-cserének
  // maga is áldozatul esne (pont ez történt az első változattal).
  if (/[ŞşŢţ]/.test(src)) {
    fail(`D1: régi (cedillás) román diakritika a ${rel[rel.length - 1]} fájlban — modern ș/ț kell`)
  } else {
    ok(`D1: ${rel[rel.length - 1]} — csak modern román diakritika (ș/ț)`)
  }
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nRészszámadás önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nRészszámadás önellenőrzés: minden zöld')
