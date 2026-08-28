#!/usr/bin/env node
/**
 * CENT-PONTOSSÁG önellenőrzés (D2 / D-blokk, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P2-találata:
 * a mentési utak sub-centes (2-nél több tizedesű) összeget is átengedtek —
 * a zod csak positive-ot nézett, a DB-oszlop csupasz numeric. Sub-centes
 * tárolt összegnél a képernyő (toFixed), a DB és a desktop-Excel (roundCent)
 * széthúz, és a hivatalos ív oszlopösszege banira elcsúszhat. Ráadásul a web
 * updateTransactionBasic az összeget EGYÁLTALÁN nem validálta (negatív/0 is
 * átment szerver-oldalon).
 *
 * A JAVÍTÁS: közös money-helper a @kartoteka/validations-ben (roundCent +
 * isCentPontos + CENT_UZENET), cent-refine MINDEN tétel-összeg sémán
 * (web income/expense/batch/transfer + pkg befizetes/kiadas/belsomozgas),
 * és szerver-oldali összeg-validálás a web updateTransactionBasic-ben +
 * cent-ellenőrzés a core updateTransactionUseCase-ben.
 * (Az éles diagnosztika szerint sub-centes TÁROLT adat nincs — ez tiszta
 * megelőzés, adatjavítás nem kell.)
 *
 * NEGATÍV ASSZERT: refine-eltávolító + fail-open + validálás-törlő mutánsok.
 *
 * Futtatás:  node scripts/selftest-cent-pontossag.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const MONEY = path.join(REPO, 'packages', 'validations', 'src', 'money.ts')
const IDX = path.join(REPO, 'packages', 'validations', 'src', 'index.ts')
const WEB_SEMA = path.join(REPO, 'apps', 'web', 'lib', 'validations', 'finance.ts')
const BEF_SEMA = path.join(REPO, 'packages', 'validations', 'src', 'finance', 'befizetes-save.ts')
const KIA_SEMA = path.join(REPO, 'packages', 'validations', 'src', 'finance', 'kiadas-save.ts')
const BM_SEMA = path.join(REPO, 'packages', 'validations', 'src', 'finance', 'belsomozgas.ts')
const WEB_UPD = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'edit-storno-actions.ts')
const CORE_UPD = path.join(REPO, 'packages', 'core', 'src', 'finance', 'update-transaction.ts')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function ellenoriz(files) {
  const hibak = []

  if (!files.has(MONEY)) {
    hibak.push('packages/validations/src/money.ts HIÁNYZIK — nincs közös cent-helper')
    return hibak
  }
  const idx = stripComments(files.get(IDX))
  if (!/export \* from '\.\/money'/.test(idx)) {
    hibak.push('a money-helper nincs exportálva a validations indexből')
  }

  // ── (1) cent-refine a sémákon ──
  const refMinta = /\.refine\(isCentPontos, /g
  for (const [nev, fajl, minDb] of [
    ['web finance-sémák', WEB_SEMA, 6],
    ['pkg befizetes-save', BEF_SEMA, 1],
    ['pkg kiadas-save', KIA_SEMA, 1],
    ['pkg belsomozgas', BM_SEMA, 2],
  ]) {
    const s = stripComments(files.get(fajl))
    const db = (s.match(refMinta) || []).length
    if (db < minDb) {
      hibak.push(`${nev}: a cent-refine ${db}× van meg (várt: legalább ${minDb}×) — sub-cent átcsúszhat`)
    }
  }

  // ── (2) web updateTransactionBasic: szerver-oldali összeg-validálás ──
  const wu = stripComments(files.get(WEB_UPD))
  if (!/input\.osszeg !== undefined[\s\S]{0,240}?isCentPontos\(/.test(wu)) {
    hibak.push('web updateTransactionBasic: nincs szerver-oldali összeg-validálás (pozitív + cent)')
  }

  // ── (3) core updateTransactionUseCase: cent-ellenőrzés ──
  const cu = stripComments(files.get(CORE_UPD))
  if (!/isCentPontos\(/.test(cu)) {
    hibak.push('core updateTransactionUseCase: nincs cent-ellenőrzés az összeg-inputokon')
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const f of [IDX, WEB_SEMA, BEF_SEMA, KIA_SEMA, BM_SEMA, WEB_UPD, CORE_UPD]) {
    m.set(f, fs.readFileSync(f, 'utf8'))
  }
  if (fs.existsSync(MONEY)) m.set(MONEY, fs.readFileSync(MONEY, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('cent-pontosság: közös helper + séma-refine-ok + szerver-oldali validálás a helyén')
} else {
  for (const h of hibak) bukik(h)
}

// ── VISELKEDÉS — a helper maga (transpile + require) ───────────────────────
if (hibak.length === 0) {
  const require_ = createRequire(path.join(REPO, 'package.json'))
  let ts = null
  try { ts = require_('typescript') } catch {
    console.log('INFO: a typescript csomag nem elérhető — a viselkedés-teszt kihagyva')
  }
  if (ts) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-cent-'))
    fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"commonjs"}', 'utf8')
    const out = ts.transpileModule(fs.readFileSync(MONEY, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: 'money.ts',
    })
    fs.writeFileSync(path.join(tmp, 'money.js'), out.outputText, 'utf8')
    const { roundCent, isCentPontos } = require_(path.join(tmp, 'money.js'))
    const esetek = [
      [() => isCentPontos(12.34) === true, 'isCentPontos(12.34) = true'],
      [() => isCentPontos(12.345) === false, 'isCentPontos(12.345) = false (sub-cent)'],
      [() => isCentPontos(0.1 + 0.2) === true, 'isCentPontos(0.1+0.2) = true (FP-zaj tűrve)'],
      [() => isCentPontos(100) === true, 'isCentPontos(100) = true (egész)'],
      [() => roundCent(10.126) === 10.13, 'roundCent(10.126) = 10.13'],
      [() => roundCent(0.1 + 0.2) === 0.3, 'roundCent(0.1+0.2) = 0.3'],
      [() => roundCent(250) === 250, 'roundCent(250) = 250'],
    ]
    for (const [fn, nev] of esetek) {
      try {
        if (fn()) pass(`viselkedés: ${nev}`)
        else bukik(`viselkedés: ${nev} — HAMIS`)
      } catch (e) {
        bukik(`viselkedés: ${nev} — kivétel: ${e.message}`)
      }
    }
  }
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a cent-refine kigyomlálása a web bevétel-sémából (1 előfordulás elég)
  const m1files = beolvas()
  const w = m1files.get(WEB_SEMA)
  const wMut = w.replace(/\.refine\(isCentPontos, /, '.refine(() => true, ')
  m1files.set(WEB_SEMA, wMut)
  if (wMut === w) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1files).length === 0) bukik('M1: a refine-gyomlálásra az őr NEM bukik — vak')
  else pass('M1 mutáns (web cent-refine kigyomlálva) → az őr elbuktatja')

  // M2: a web updateTransactionBasic validálásának törlése
  const m2files = beolvas()
  const u = m2files.get(WEB_UPD)
  const uMut = u.replace(/isCentPontos\(/g, 'isCentPontos_KIKAPCSOLVA(')
  m2files.set(WEB_UPD, uMut)
  if (uMut === u) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2files).length === 0) bukik('M2: a web-validálás törlésére az őr NEM bukik — vak')
  else pass('M2 mutáns (web szerver-validálás kilőve) → az őr elbuktatja')

  // M3: a core cent-ellenőrzés törlése
  const m3files = beolvas()
  const c = m3files.get(CORE_UPD)
  const cMut = c.replace(/isCentPontos\(/g, 'isCentPontos_KIKAPCSOLVA(')
  m3files.set(CORE_UPD, cMut)
  if (cMut === c) bukik('M3 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m3files).length === 0) bukik('M3: a core-ellenőrzés törlésére az őr NEM bukik — vak')
  else pass('M3 mutáns (core cent-ellenőrzés kilőve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — cent-pontosság rendben`)
