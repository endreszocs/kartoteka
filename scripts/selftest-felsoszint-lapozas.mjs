#!/usr/bin/env node
/**
 * FELSŐ SZINTŰ PÉNZÜGY-BETÖLTŐ LAPOZÁS önellenőrzés (P0-14, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-14 találata:
 *   Az initFinanceFelsoSzint (megyei/kerületi pénzügy-oldal betöltője) négy
 *   tétel-lekérdezése (idei bevétel/kiadás + előző évi bevétel/kiadás a
 *   carryoverhez) sima awaited PostgREST-query volt — fetchAllPaged, .order,
 *   .range nélkül. A PostgREST 1000-es plafonja HIBA NÉLKÜL vág: 1000 tétel
 *   fölött a megyei/kerületi képernyő ÉS a hivatalos ívek némán alulmértek.
 *   A gyülekezeti ág (initFinance) ugyanezt már lapozottan csinálja.
 *
 * A JAVÍTOTT VILÁG: mind a négy tétel-lekérdezés fetchAllPaged-del,
 * determinisztikus .order('id')-del fut — mint a gyülekezeti ág.
 *
 * NEGATÍV ASSZERT: egy lekérdezés kicsomagolása — az őrnek buknia kell.
 *
 * Futtatás:  node scripts/selftest-felsoszint-lapozas.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function ellenoriz(src) {
  const s = stripComments(src)
  const hibak = []

  const iFn = s.indexOf('async function initFinanceFelsoSzint')
  if (iFn < 0) {
    hibak.push('az initFinanceFelsoSzint nem található (fail-closed)')
    return hibak
  }
  const iVege = s.indexOf('const szamadasiCellek', iFn)
  if (iVege < 0) {
    hibak.push('a lekérdezés-régió vége (const szamadasiCellek) nem található (fail-closed)')
    return hibak
  }
  const regio = s.slice(iFn, iVege)

  // A tétel-lekérdezéseket a datum-ablakuk azonosítja (idei + előző évi, 2-2).
  const datumAblakok = (regio.match(/\.gte\('datum'/g) || []).length
  if (datumAblakok < 4) {
    hibak.push(`a négy tétel-lekérdezésből csak ${datumAblakok} található a régióban (fail-closed)`)
    return hibak
  }

  const lapozott = (regio.match(/fetchAllPaged\(/g) || []).length
  if (lapozott < 4) {
    hibak.push(`a négy tétel-lekérdezésből csak ${lapozott} fut fetchAllPaged-del — a többi az 1000-es plafonon némán csonkul`)
  }
  const rendezett = (regio.match(/\.order\('id'/g) || []).length
  if (rendezett < 4) {
    hibak.push(`a lapozott lekérdezésekből csak ${rendezett} determinisztikusan rendezett (.order('id')) — a lapozás enélkül sorokat ugorhat/duplázhat`)
  }

  return hibak
}

const src = fs.readFileSync(ACTIONS, 'utf8')

const hibak = ellenoriz(src)
if (hibak.length === 0) {
  pass('initFinanceFelsoSzint: mind a 4 tétel-lekérdezés lapozott és rendezett (mint a gyülekezeti ág)')
} else {
  for (const h of hibak) bukik(h)
}

if (hibak.length === 0) {
  // M1: egy lekérdezés kicsomagolása a fetchAllPaged-ből
  const iFnRaw = src.indexOf('async function initFinanceFelsoSzint')
  const iVegeRaw = src.indexOf('const szamadasiCellek', iFnRaw)
  const regioRaw = src.slice(iFnRaw, iVegeRaw)
  const regioMut = regioRaw.replace(/fetchAllPaged\(/, '(')
  const m1 = src.slice(0, iFnRaw) + regioMut + src.slice(iVegeRaw)
  if (m1 === src) bukik('M1 mutáció nem változtatott a forráson (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: a kicsomagolt lekérdezésre az őr NEM bukik — vak')
  else pass('M1 mutáns (egy lekérdezés kicsomagolva) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — felső szintű lapozás rendben`)
