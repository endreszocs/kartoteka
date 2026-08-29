#!/usr/bin/env node
/**
 * BEVÉTEL/KIADÁS MENTÉS — EGY KÖZÖS ÚT önellenőrzés (P4-30 teljes kör, 2026-08-29)
 *
 * TÖRTÉNET: a webes kézi mentés (insertIncomeRecord / insertExpenseRecord)
 * a core use-case-ektől FÜGGETLEN, párhuzamos implementáció volt — 6 mezőt
 * ejtett (bankszamla_id, is_potlas, kedvezmenyezett_cui, vonatkozo_idoszak…),
 * és minden javítást kétszer kellett megírni. A D5 (átvezetés) mintájára a
 * web mostantól a KÖZÖS core saveIncomeUseCase / saveExpenseUseCase-re
 * delegál. A webes SZÁMOZÁSI viselkedés VÁLTOZATLAN: üres iratszámnál a
 * wrapper AUTO-<dátum>-<időbélyeg> helyőrzőt képez és KITÖLTVE adja át —
 * így a core hézagmentes nyugtaszám-generátora a weben nem fut.
 *
 * MIT ŐRIZ:
 *   (1) a web insertIncomeRecord a saveIncomeUseCase-re, az
 *       insertExpenseRecord a saveExpenseUseCase-re delegál — közvetlen
 *       .insert() nincs bennük;
 *   (2) a wrapper a documentNumber-t KITÖLTVE adja át (a webes AUTO-
 *       számozás megőrzése — a core generátor nem fut a weben);
 *   (3) a core visszaadja az xkey-t (a pénzügy→leltár híd penzugy_xkey
 *       kapcsolata nem veszhet el).
 *
 * NEGATÍV ASSZERT: visszabontó mutánsok.
 *
 * Futtatás:  node scripts/selftest-mentes-kozos-ut.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const WEB = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')
const CORE_BEF = path.join(REPO, 'packages', 'core', 'src', 'finance', 'befizetes', 'save.ts')
const CORE_KIA = path.join(REPO, 'packages', 'core', 'src', 'finance', 'kiadas', 'save.ts')
const VAL_BEF = path.join(REPO, 'packages', 'validations', 'src', 'finance', 'befizetes-save.ts')
const VAL_KIA = path.join(REPO, 'packages', 'validations', 'src', 'finance', 'kiadas-save.ts')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** A függvény törzse a KÖVETKEZŐ függvény-deklarációig — a fix hosszú ablak
 *  átlógna a szomszéd wrapperbe, és a benti találat elfedné a mutációt. */
function fnBody(src, marker) {
  const i = src.indexOf(marker)
  if (i < 0) return ''
  const rest = src.slice(i + marker.length)
  const j = rest.search(/\n(?:export )?async function /)
  return marker + (j >= 0 ? rest.slice(0, j) : rest.slice(0, 8000))
}

function ellenoriz(files) {
  const hibak = []

  const w = stripComments(files.get(WEB))

  // (1) delegálás + nincs saját insert
  const incFn = fnBody(w, 'async function insertIncomeRecord')
  if (!/\bsaveIncomeUseCase\(/.test(incFn)) {
    hibak.push('web: az insertIncomeRecord nem a core saveIncomeUseCase-re delegál')
  }
  if (/\.from\('befizetes'\)\s*\.insert\(/.test(incFn.replace(/\s+/g, ' '))) {
    hibak.push('web: az insertIncomeRecord saját .insert()-et futtat — két széthúzó implementáció')
  }
  const expFn = fnBody(w, 'async function insertExpenseRecord')
  if (!/\bsaveExpenseUseCase\(/.test(expFn)) {
    hibak.push('web: az insertExpenseRecord nem a core saveExpenseUseCase-re delegál')
  }
  if (/\.from\('kiadas'\)\s*\.insert\(/.test(expFn.replace(/\s+/g, ' '))) {
    hibak.push('web: az insertExpenseRecord saját .insert()-et futtat — két széthúzó implementáció')
  }

  // (2) a documentNumber KITÖLTVE megy át (webes AUTO-számozás megőrzése)
  if (!/buildDocumentNumber\(input\.iratszam, input\.datum\)/.test(incFn)) {
    hibak.push('web (bevétel): a documentNumber nem a wrapperben képződik — a core generátor futna, és a hézagmentes sorozatból égne szám nem-Chitanță bizonylatra')
  }
  if (!/buildDocumentNumber\(input\.iratszam \|\|/.test(expFn)) {
    hibak.push('web (kiadás): a documentNumber nem a wrapperben képződik')
  }
  if (!/iratszam: documentNumber/.test(incFn) || !/iratszam: documentNumber/.test(expFn)) {
    hibak.push('web: a kitöltött documentNumber nem megy át iratszámként a core-nak')
  }

  // (3) a core visszaadja az xkey-t (leltár-híd)
  for (const [nev, fp] of [['befizetés', VAL_BEF], ['kiadás', VAL_KIA]]) {
    const s = stripComments(files.get(fp))
    const iRes = s.indexOf(nev === 'befizetés' ? 'interface SaveIncomeResult' : 'interface SaveExpenseResult')
    const res = iRes >= 0 ? s.slice(iRes, iRes + 400) : ''
    if (!/xkey\?: string \| null/.test(res)) {
      hibak.push(`validations (${nev}): a Save*Result nem hordoz xkey-t — a pénzügy→leltár híd kapcsolata elveszne`)
    }
  }
  for (const [nev, fp] of [['befizetés', CORE_BEF], ['kiadás', CORE_KIA]]) {
    const s = stripComments(files.get(fp))
    if (!/xkey: (usedXkey|xkey)/.test(s)) {
      hibak.push(`core (${nev}): a mentés nem adja vissza az xkey-t`)
    }
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const fp of [WEB, CORE_BEF, CORE_KIA, VAL_BEF, VAL_KIA]) m.set(fp, fs.readFileSync(fp, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('mentés közös útja: web→core delegálás + AUTO-számozás megőrizve + xkey a hídnak')
} else {
  for (const hb of hibak) bukik(hb)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a web visszabontása saját insertre (a RÉGI világ)
  const m1 = beolvas()
  const w1 = m1.get(WEB)
  const w1mut = w1.replace(/\bsaveIncomeUseCase\(/, 'sajatInsert_regi(')
  m1.set(WEB, w1mut)
  if (w1mut === w1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: a bevétel-delegálás kilövésére NEM bukik — vak')
  else pass('M1 mutáns (bevétel-delegálás kilőve) → az őr elbuktatja')

  // M2: a kitöltött documentNumber elhagyása (a core generátor futna).
  // ABLAK-CÉLZOTT csere: a fájlban máshol (felső szintű insertek) is van
  // `iratszam: documentNumber` — a mutánsnak a WRAPPER előfordulását kell
  // eltalálnia, különben vak (pont ez buktatta le az első változatot).
  const m2 = beolvas()
  const w2 = m2.get(WEB)
  const regiTorzs = fnBody(w2, 'async function insertIncomeRecord')
  const ujTorzs = regiTorzs.replace(/iratszam: documentNumber/, 'iratszam: input.iratszam ?? null')
  const w2mut = regiTorzs ? w2.replace(regiTorzs, ujTorzs) : w2
  m2.set(WEB, w2mut)
  if (w2mut === w2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2).length === 0) bukik('M2: az AUTO-számozás elhagyására NEM bukik — vak')
  else pass('M2 mutáns (documentNumber-átadás kilőve) → az őr elbuktatja')

  // M3: az xkey eltüntetése a core visszatérésből
  const m3 = beolvas()
  const v3 = m3.get(VAL_BEF)
  const v3mut = v3.replace(/\s*xkey\?: string \| null/, '')
  m3.set(VAL_BEF, v3mut)
  if (v3mut === v3) bukik('M3 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m3).length === 0) bukik('M3: az xkey eltüntetésére NEM bukik — vak')
  else pass('M3 mutáns (xkey kivéve a Result-ból) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — mentés közös útja rendben`)
