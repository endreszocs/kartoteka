#!/usr/bin/env node
/**
 * Nyomtatási központok — BETÖLTÉS-ÁLLAPOT önellenőrzés
 * (2026-08-22, észrevételek 8. pont: „Adatok betöltése… villog, de nincs üzenet").
 *
 * Mit őriz?
 *
 *  A) A NÉGYÁGÚ állapot-derivált tiszta magját
 *     (packages/ui-app/src/finance/print-loading-core.ts):
 *       üres adat → `ures`, hiba → `hiba`, adat → `kesz`, null → `hiba`.
 *     ⚠️ NEGATÍV ASSZERT: a RÉGI kétállapotú logikát (csak `loading: boolean`)
 *     újrajátsszuk, és bizonyítjuk, hogy MINDHÁROM esetre UGYANAZT adja —
 *     tehát nem tudta megkülönböztetni az ürest a késztől, sem a hibát
 *     egyiktől sem, és hiba után a nyomtató gombot NYITVA hagyta.
 *
 *  B) A hurok-elvágás szöveges nyomait a két közös Body-ban:
 *       · `onToast` NEM szerepelhet EGYETLEN hook-deps-listában sem
 *         (a wrapperek inline nyíl-függvényként adják át → minden renderben új
 *         identitás → önfenntartó végtelen betöltés-hurok),
 *       · az `onToast`-ot ref-en át kell hívni (`onToastRef.current`),
 *       · minden `.then(` mellett kell `.catch(` (enélkül elutasított
 *         promise-nál a „tölt" felirat ÖRÖKRE bent ragad).
 *     ⚠️ NEGATÍV ASSZERT: mindhárom ellenőrzésre MUTÁNST gyártunk (a régi hibás
 *     állapot visszaírásával), és bizonyítjuk, hogy az őrszem elbukna rajta.
 *     A szöveges ellenőrzés előtt a KOMMENTEKET kiszedjük — különben a
 *     magyarázó komment („⛔ NE tedd vissza az `onToast`-ot…") önmagában
 *     kielégítené a keresést.
 *
 * Miért nincs render-számláló teszt? A `scripts/` alatt nincs komponens-render
 * keret (se React DOM, se test runner), és a bevezetése nagyobb infrastruktúra,
 * mint maga a javítás. A hurok GYÖKÉROKÁT (deps-lista + hiányzó catch) ezért
 * szövegesen, mutánssal igazoltan őrizzük; az állapot-derivált a tiszta magon
 * teljes körűen tesztelt.
 *
 * Futtatás:  node scripts/selftest-print-betoltes.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const CORE_FILE = path.join(REPO_ROOT, 'packages', 'ui-app', 'src', 'finance', 'print-loading-core.ts')
const BUDGET_BODY = path.join(REPO_ROOT, 'packages', 'ui-app', 'src', 'finance', 'BudgetPrintDialogBody.tsx')
const FINANCE_BODY = path.join(REPO_ROOT, 'packages', 'ui-app', 'src', 'finance', 'FinancePrintDialogBody.tsx')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)
const eq = (kapott, vart, cimke) => {
  const a = JSON.stringify(kapott)
  const b = JSON.stringify(vart)
  if (a === b) ok(`${cimke} → ${a}`)
  else fail(`${cimke}: várt ${b}, kapott ${a}`)
}

for (const f of [CORE_FILE, BUDGET_BODY, FINANCE_BODY]) {
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

// ─────────────────────────────────────────────────────────────────────────────
// A) A TISZTA MAG
// ─────────────────────────────────────────────────────────────────────────────

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-print-betoltes-selftest-'))
let mag
try {
  const out = ts.transpileModule(fs.readFileSync(CORE_FILE, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: 'print-loading-core.ts',
  })
  const dest = path.join(tmp, 'print-loading-core.js')
  fs.writeFileSync(dest, out.outputText, 'utf8')
  mag = require_(dest)
} catch (e) {
  fail(`a print-loading-core.ts nem fordítható/tölthető: ${e && e.message}`)
  process.exit(1)
}

const {
  derivalBetoltesAllapot,
  hibaAllapotbol,
  nyomtatasTiltva,
  budgetBetoltesUzenet,
  uresBetoltesUzenet,
  ISMERETLEN_BETOLTES_HIBA,
} = mag

console.log('\n── A) Négyágú állapot-derivált ─────────────────────────────────')

const RES_KESZ = { data: [{ szamadasicelid: '101.01' }, { szamadasicelid: '102' }] }
const RES_URES = { data: [] }
const RES_HIBA = { error: 'A(z) 2024. évi sorok lekérése megtagadva.' }

eq(derivalBetoltesAllapot(RES_KESZ), { fazis: 'kesz', darab: 2 }, 'adat → kesz')
eq(derivalBetoltesAllapot(RES_URES), { fazis: 'ures' }, 'üres tömb → ures')
eq(
  derivalBetoltesAllapot(RES_HIBA),
  { fazis: 'hiba', uzenet: 'A(z) 2024. évi sorok lekérése megtagadva.' },
  'error → hiba (az üzenet megmarad)',
)
// A `{ error: '...' }` ág `data` NÉLKÜL érkezik — sosem eshet vissza „ures"-re.
eq(derivalBetoltesAllapot({ data: undefined, error: 'hupsz' }), { fazis: 'hiba', uzenet: 'hupsz' }, 'error + hiányzó data → hiba')
eq(derivalBetoltesAllapot({ data: undefined }), { fazis: 'ures' }, 'nincs data, nincs error → ures')
eq(derivalBetoltesAllapot({ error: null, data: [1] }), { fazis: 'kesz', darab: 1 }, 'error: null → kesz')
// Egy hanyag wrapper `undefined`-et is visszaadhat: az NEM „kész, 0 sor".
eq(derivalBetoltesAllapot(undefined), { fazis: 'hiba', uzenet: ISMERETLEN_BETOLTES_HIBA }, 'undefined eredmény → hiba')
eq(derivalBetoltesAllapot(null), { fazis: 'hiba', uzenet: ISMERETLEN_BETOLTES_HIBA }, 'null eredmény → hiba')

eq(hibaAllapotbol(new Error('hálózati hiba')), { fazis: 'hiba', uzenet: 'hálózati hiba' }, 'Error → hiba')
eq(hibaAllapotbol('szöveges ok'), { fazis: 'hiba', uzenet: 'szöveges ok' }, 'string → hiba')
eq(hibaAllapotbol(undefined), { fazis: 'hiba', uzenet: ISMERETLEN_BETOLTES_HIBA }, 'üres elutasítás → hiba (nem néma)')
eq(hibaAllapotbol(new Error('   ')), { fazis: 'hiba', uzenet: ISMERETLEN_BETOLTES_HIBA }, 'üres Error-üzenet → alapszöveg')

console.log('\n── A2) FAIL-CLOSED gomb-tiltás ─────────────────────────────────')
eq(nyomtatasTiltva({ fazis: 'tolt' }), true, 'tolt → tiltva')
eq(nyomtatasTiltva({ fazis: 'hiba', uzenet: 'x' }), true, 'hiba → tiltva (EZ a 8. pont valódi kockázata)')
eq(nyomtatasTiltva({ fazis: 'kesz', darab: 3 }), false, 'kesz → nyomtatható')
eq(nyomtatasTiltva({ fazis: 'ures' }), false, 'ures → nyomtatható (őszinte nullákkal)')

console.log('\n── A3) A panel szövegei ────────────────────────────────────────')
const uUres = budgetBetoltesUzenet({ fazis: 'ures' }, 2026)
const uKesz = budgetBetoltesUzenet({ fazis: 'kesz', darab: 42 }, 2026)
if (uUres.includes('A(z) 2026. évhez még nincs rögzített költségvetési sor') && uUres.includes('minden terv-oszlopa nulla lesz')) {
  ok('ures üzenet: az ÉV és a következmény is benne van')
} else {
  fail(`ures üzenet nem a várt: ${uUres}`)
}
if (uKesz === 'Betöltve: 42 költségvetési sor (2026)') ok('kesz üzenet: darabszám + év')
else fail(`kesz üzenet nem a várt: ${uKesz}`)
if (uresBetoltesUzenet(2024) === budgetBetoltesUzenet({ fazis: 'ures' }, 2024)) {
  ok('az ures szöveg EGY forrásból jön (a két Body nem húzhat szét)')
} else {
  fail('az ures szöveg két helyen külön él — széthúzás-veszély')
}

// ─────────────────────────────────────────────────────────────────────────────
// A4) NEGATÍV ASSZERT — a RÉGI kétállapotú logika újrajátszása
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── A4) NEGATÍV ASSZERT: a régi kétállapotú logika vak ───────────')

/**
 * A 2026-08-22 ELŐTTI BudgetPrintDialogBody viselkedésének pontos replikája:
 *   setLoading(true) → a válasz megérkezik → setLoading(false); a hibát csak
 *   egy toast jelezte, a panel semmit nem írt, a gomb `disabled={printing || loading}`.
 * Vagyis a betöltés VÉGÉN mindhárom eset UGYANEZT az állapotot adta.
 */
function regiKetallapotu(res) {
  const loading = false // a válasz megjött → setLoading(false) minden ágon
  return { loading, feliratLathato: loading, gombTiltva: loading, panelUzenet: '' }
}

const regiKesz = regiKetallapotu(RES_KESZ)
const regiUres = regiKetallapotu(RES_URES)
const regiHiba = regiKetallapotu(RES_HIBA)

if (JSON.stringify(regiKesz) === JSON.stringify(regiUres)) {
  ok('RÉGI: az „üres" és a „kész" MEGKÜLÖNBÖZTETHETETLEN volt (ez volt a panasz)')
} else {
  fail('a régi logika replikája hibás — a negatív asszert nem bizonyít semmit')
}
if (JSON.stringify(regiHiba) === JSON.stringify(regiKesz)) {
  ok('RÉGI: a „hiba" is ugyanígy nézett ki, mint a „kész"')
} else {
  fail('a régi logika replikája hibás — a hiba-ág nem esett egybe')
}
if (regiHiba.gombTiltva === false) {
  ok('RÉGI: hiba UTÁN a nyomtató gomb NYITVA maradt → üres terv-oszlopú hivatalos ív')
} else {
  fail('a régi logika replikája hibás — a gomb tiltva volt')
}

const ujKesz = derivalBetoltesAllapot(RES_KESZ)
const ujUres = derivalBetoltesAllapot(RES_URES)
const ujHiba = derivalBetoltesAllapot(RES_HIBA)
const fazisok = new Set([ujKesz.fazis, ujUres.fazis, ujHiba.fazis])
if (fazisok.size === 3) {
  ok(`ÚJ: mindhárom eset KÜLÖN ágra kerül (${[...fazisok].join(', ')})`)
} else {
  fail(`ÚJ: a három eset nem különül el — fázisok: ${[...fazisok].join(', ')}`)
}
if (nyomtatasTiltva(ujHiba) === true && regiHiba.gombTiltva === false) {
  ok('ÚJ: hiba után a gomb TILTVA — a régi viselkedés bukna ezen az asszerten')
} else {
  fail('ÚJ: a hiba-ág nem tiltja a nyomtatást')
}

// ─────────────────────────────────────────────────────────────────────────────
// B) A KÉT KÖZÖS BODY SZÖVEGES ŐRZÉSE (mutánssal igazolva)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── B) Hurok-elvágás a közös Body-kban ──────────────────────────')

/** Kommentek kiszedése: a magyarázó szöveg NEM elégítheti ki a keresést. */
function kommentNelkul(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Minden hook-deps-lista: `}, [ ... ])`. */
function depsListak(src) {
  const out = []
  const re = /\}\s*,\s*\[([^\]]*)\]\s*\)/g
  let m
  while ((m = re.exec(src)) !== null) out.push(m[1])
  return out
}

/** A három invariáns egy fájlra. `true` = minden rendben. */
function orszem(src, cimke, { csendes = false } = {}) {
  const kod = kommentNelkul(src)
  const bajok = []

  const deps = depsListak(kod)
  if (deps.length === 0) bajok.push('nem találtam egyetlen hook-deps-listát sem (elromlott a minta-illesztés)')
  const szennyezett = deps.filter((d) => /\bonToast\b/.test(d))
  if (szennyezett.length > 0) {
    bajok.push(`az \`onToast\` deps-listában szerepel: [${szennyezett.join('] [')}]`)
  }

  if (!/onToastRef\s*\.\s*current/.test(kod)) {
    bajok.push('nincs `onToastRef.current` hívás — az onToast nincs ref-be tükrözve')
  }
  if (!/const\s+onToastRef\s*=\s*useRef\(\s*onToast\s*\)/.test(kod)) {
    bajok.push('nincs `const onToastRef = useRef(onToast)` tükrözés')
  }

  const thenDb = (kod.match(/\.then\(/g) || []).length
  const catchDb = (kod.match(/\.catch\(/g) || []).length
  if (thenDb === 0) bajok.push('nincs `.then(` a fájlban (elromlott a minta-illesztés)')
  if (catchDb < thenDb) {
    bajok.push(`kevesebb \`.catch(\` (${catchDb}), mint \`.then(\` (${thenDb}) — beragadó betöltő`)
  }

  if (!csendes) {
    if (bajok.length === 0) ok(`${cimke}: onToast ref-en át, deps tiszta, minden .then mellett .catch`)
    else for (const b of bajok) fail(`${cimke}: ${b}`)
  }
  return bajok.length === 0
}

const budgetSrc = fs.readFileSync(BUDGET_BODY, 'utf8')
const financeSrc = fs.readFileSync(FINANCE_BODY, 'utf8')
orszem(budgetSrc, 'BudgetPrintDialogBody')
orszem(financeSrc, 'FinancePrintDialogBody')

console.log('\n── B2) NEGATÍV ASSZERT: mutánsok — az őrszem bukjon rájuk ───────')

/** 1. mutáns: az `onToast` VISSZAKERÜL a betöltő-effect deps-listájába. */
const mutansDeps = budgetSrc.replace(
  'onLoadBudgetRows, ujratoltoKulcs]',
  'onLoadBudgetRows, onToast, ujratoltoKulcs]',
)
if (mutansDeps === budgetSrc) {
  fail('a deps-mutáns nem készült el (megváltozott a deps-lista szövege) — az őrszem vak lehet')
} else if (orszem(mutansDeps, 'mutáns#1', { csendes: true })) {
  fail('MUTÁNS#1 ÁTMENT: az őrszem NEM veszi észre az onToast-ot a deps-listában')
} else {
  ok('mutáns#1 (onToast a deps-listában) — az őrszem elbukik rajta ✔')
}

/** 2. mutáns: a `.catch(` eltűnik (a 2026-08-22 előtti állapot). */
const mutansCatch = budgetSrc.replace(/\.catch\(/g, '.thenIgnored(')
if (mutansCatch === budgetSrc) {
  fail('a catch-mutáns nem készült el — nincs `.catch(` a fájlban?!')
} else if (orszem(mutansCatch, 'mutáns#2', { csendes: true })) {
  fail('MUTÁNS#2 ÁTMENT: az őrszem NEM veszi észre a hiányzó .catch()-et')
} else {
  ok('mutáns#2 (nincs .catch) — az őrszem elbukik rajta ✔')
}

/** 3. mutáns: az onToast ref-tükrözés eltűnik (közvetlen prop-hívás az effectben). */
const mutansRef = budgetSrc.replace(/onToastRef/g, 'onToastNemRef')
if (mutansRef === budgetSrc) {
  fail('a ref-mutáns nem készült el — nincs `onToastRef` a fájlban?!')
} else if (orszem(mutansRef, 'mutáns#3', { csendes: true })) {
  fail('MUTÁNS#3 ÁTMENT: az őrszem NEM veszi észre a hiányzó ref-tükrözést')
} else {
  ok('mutáns#3 (nincs ref-tükrözés) — az őrszem elbukik rajta ✔')
}

/** 4. mutáns: a komment-kiszedő ellenőrzése — a MAGYARÁZÓ komment önmagában
 *  ne elégítse ki a keresést. Kódból kivesszük a ref-tükrözést, de kommentként
 *  bent hagyjuk: az őrszemnek AKKOR IS buknia kell. */
const mutansKomment =
  budgetSrc.replace(/onToastRef/g, 'onToastNemRef') +
  '\n// const onToastRef = useRef(onToast) — onToastRef.current?.()\n'
if (orszem(mutansKomment, 'mutáns#4', { csendes: true })) {
  fail('MUTÁNS#4 ÁTMENT: a komment kielégítette a keresést — a komment-kiszedő nem működik')
} else {
  ok('mutáns#4 (csak kommentben van meg a minta) — az őrszem elbukik rajta ✔')
}

// ─────────────────────────────────────────────────────────────────────────────
// C) A NÉGY WRAPPER: a betöltő-propok NEM lehetnek inline nyíl-függvények
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── C) Wrapperek: stabil (memoizált) callback-propok ────────────')

const WRAPPEREK = [
  ['apps/web/components/finance/budget-print-dialog.tsx', 'web Költségvetés-központ'],
  ['apps/web/components/finance/finance-print-dialog.tsx', 'web Pénzügyi központ'],
  ['apps/desktop/src/components/budget-print-dialog.tsx', 'desktop Költségvetés-központ'],
  ['apps/desktop/src/components/finance-print-dialog.tsx', 'desktop Pénzügyi központ'],
]

/** A közös Body effect-depjeibe kerülő propok — ezek NEM lehetnek inline-ok. */
const KRITIKUS_PROP = /\b(buildReport|onToast|onLoadBudgetRows|onLoadYearRecords|onLoadNyugtatombok|onLoadSavedDocs)=\{/g

/** `true` = minden kritikus prop egyszerű azonosítót kap (`prop={prop}`). */
function propOrszem(src, cimke, { csendes = false } = {}) {
  const kod = kommentNelkul(src)
  const bajok = []
  let db = 0
  let m
  KRITIKUS_PROP.lastIndex = 0
  while ((m = KRITIKUS_PROP.exec(kod)) !== null) {
    db++
    const utana = kod.slice(m.index + m[0].length)
    if (!/^[A-Za-z_$][\w$]*\}/.test(utana)) {
      bajok.push(`a(z) \`${m[1]}\` prop INLINE függvényt kap (memoizálatlan → új identitás minden renderben)`)
    }
  }
  if (db === 0) bajok.push('egyetlen kritikus propot sem találtam (elromlott a minta-illesztés)')
  if (!csendes) {
    if (bajok.length === 0) ok(`${cimke}: mind a ${db} kritikus prop memoizált referencia`)
    else for (const b of bajok) fail(`${cimke}: ${b}`)
  }
  return bajok.length === 0
}

const wrapperForrasok = []
for (const [rel, cimke] of WRAPPEREK) {
  const abs = path.join(REPO_ROOT, rel)
  if (!fs.existsSync(abs)) {
    fail(`hiányzik a wrapper: ${rel}`)
    continue
  }
  const src = fs.readFileSync(abs, 'utf8')
  wrapperForrasok.push([src, cimke])
  propOrszem(src, cimke)
}

// ⚠️ NEGATÍV ASSZERT: az inline prop visszaírása — az őrszemnek buknia kell.
if (wrapperForrasok.length > 0) {
  const [elsoSrc] = wrapperForrasok[0]
  const mutans = elsoSrc.replace(
    'onToast={onToast}',
    'onToast={(msg, kind) => { if (kind === \'error\') toast.error(msg) }}',
  )
  if (mutans === elsoSrc) {
    fail('a wrapper-mutáns nem készült el (nincs `onToast={onToast}` a fájlban) — az őrszem vak lehet')
  } else if (propOrszem(mutans, 'mutáns#5', { csendes: true })) {
    fail('MUTÁNS#5 ÁTMENT: az őrszem NEM veszi észre az inline `onToast` propot')
  } else {
    ok('mutáns#5 (inline onToast prop a wrapperben) — az őrszem elbukik rajta ✔')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('')
if (failed) {
  console.error('EREDMÉNY: FAIL — a nyomtatási központok betöltés-őrszeme bukott.')
  process.exit(1)
}
console.log('EREDMÉNY: PASS — a négyágú betöltés-állapot és a hurok-elvágás rendben.')
