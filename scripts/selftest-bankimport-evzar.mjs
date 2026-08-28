#!/usr/bin/env node
/**
 * BANK-IMPORT ÉV-ZÁR önellenőrzés (P0-4, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-4 találata:
 *   A közös importBankTransactionsUseCase-ben SEMMILYEN év-zár nem volt (a
 *   'finalized' szó elő sem fordult), és a desktop hívója sem ellenőrzött —
 *   a desktopról egy VÉGLEGESÍTETT (beküldött) évbe is be lehetett importálni
 *   a bankkivonatot, némán elévültetve a beadott számadás-pillanatképet. A
 *   webes wrapper a saját action-rétegében védett, a desktop rétegében semmi.
 *
 * A JAVÍTOTT VILÁG (a nyito-egyenleg.ts 2026-08-28-i elve: „a mellékutak nem
 * lehetnek gyengébbek a kanonikus helynél" — a kapu a KÖZÖS magban):
 *   (1) a use-case az ELSŐ insert előtt assertYearsNotFinalizedForCreate-et
 *       futtat a nem kihagyott tételek dátumaira (fail-closed a core
 *       year-lock szerint),
 *   (2) hibánál a teljes import le sem indul (error a result-ban).
 *
 * NEGATÍV ASSZERT: az év-zár hívás eltávolítása — az őrnek buknia kell.
 *
 * Futtatás:  node scripts/selftest-bankimport-evzar.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const FAJL = path.join(REPO, 'packages', 'core', 'src', 'finance', 'bank-import', 'import-transactions.ts')

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

  const iFn = s.indexOf('export async function importBankTransactionsUseCase')
  if (iFn < 0) {
    hibak.push('az importBankTransactionsUseCase nem található (fail-closed)')
    return hibak
  }
  if (!/import \{[^}]*assertYearsNotFinalizedForCreate[^}]*\} from '\.\.\/year-lock'/.test(s)) {
    hibak.push('a use-case nem importálja a core year-lock őrt')
  }
  const iAssert = s.indexOf('assertYearsNotFinalizedForCreate(', iFn)
  const iElsoInsert = s.indexOf('.insert(', iFn)
  if (iAssert < 0) {
    hibak.push('a use-case nem futtat év-zár ellenőrzést — véglegesített évbe is importál')
  } else if (iElsoInsert > 0 && iAssert > iElsoInsert) {
    hibak.push('az év-zár ellenőrzés az első insert UTÁN fut — részleges zárt-évi írás lehetséges')
  }

  return hibak
}

const src = fs.readFileSync(FAJL, 'utf8')

const hibak = ellenoriz(src)
if (hibak.length === 0) {
  pass('a közös bank-import use-case év-zár kapuval indul (az első insert előtt)')
} else {
  for (const h of hibak) bukik(h)
}

if (hibak.length === 0) {
  // M1: az év-zár hívás eltávolítása
  const m1 = src.replace(/[\s\S]{0,80}?assertYearsNotFinalizedForCreate\([\s\S]*?\)\n/, '\n')
  if (m1 === src) bukik('M1 mutáció nem változtatott a forráson (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: az év-zár eltávolítására az őr NEM bukik — vak')
  else pass('M1 mutáns (év-zár hívás törölve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — bank-import év-zár rendben`)
