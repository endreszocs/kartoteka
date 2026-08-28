#!/usr/bin/env node
/**
 * DEVIZA-TÉTEL SZERKESZTÉS önellenőrzés (P0-6, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-6 találata:
 *   A core updateTransactionUseCase (a desktop szerkesztő útja) nem fogadta
 *   és nem frissítette az osszeg_ron/arfolyam mezőket. Devizás (vagy
 *   bank-importált, osszeg_ron-nal töltött) soron az összeg módosítása után a
 *   RON-ekvivalens a RÉGI értéken maradt — az egyenleg és a totál (amely az
 *   osszeg_ron-t olvassa) a régi összeget mutatta mindkét felületen. A web
 *   saját útja (updateTransactionBasic) az S11 óta kezeli. (Az éles
 *   diagnosztika 0 elromlott sort mért — a javítás megelőző.)
 *
 * A JAVÍTOTT VILÁG:
 *   (1) az UpdateTransactionInput fogad opcionális osszeg_ron/arfolyam-ot,
 *       és explicit értéknél azt írja (web-paritás),
 *   (2) ha CSAK az összeg változik, a use-case a sor TÁROLT árfolyamából
 *       újraszámolja az osszeg_ron-t (round2) — így a hívóknak (desktop
 *       dialógus) nem kell ismerniük az árfolyamot,
 *   (3) a sor-lekérdezés az arfolyam-ot is beolvassa.
 *
 * NEGATÍV ASSZERT: az újraszámoló ág és a passthrough törlése.
 *
 * Futtatás:  node scripts/selftest-deviza-szerkesztes.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const FAJL = path.join(REPO, 'packages', 'core', 'src', 'finance', 'update-transaction.ts')

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

  const iInput = s.indexOf('export interface UpdateTransactionInput')
  const inputBlokk = iInput >= 0 ? s.slice(iInput, s.indexOf('}', iInput)) : ''
  if (!/osszeg_ron\?:/.test(inputBlokk)) hibak.push('az UpdateTransactionInput nem fogad osszeg_ron-t')
  if (!/arfolyam\?:/.test(inputBlokk)) hibak.push('az UpdateTransactionInput nem fogad arfolyam-ot')

  const iFn = s.indexOf('export async function updateTransactionUseCase')
  const fn = iFn >= 0 ? s.slice(iFn) : ''
  if (!fn) { hibak.push('az updateTransactionUseCase nem található (fail-closed)'); return hibak }

  if (!/\.select\('datum, bankszamla_id, arfolyam'\)/.test(fn)) {
    hibak.push('a sor-lekérdezés nem olvassa be az arfolyam-ot — az újraszámoláshoz kell')
  }
  if (!/if \(input\.osszeg_ron !== undefined\) updateData\.osszeg_ron = input\.osszeg_ron/.test(fn)) {
    hibak.push('az explicit osszeg_ron nem íródik (web-paritás hiányzik)')
  }
  if (!/if \(input\.arfolyam !== undefined\) updateData\.arfolyam = input\.arfolyam/.test(fn)) {
    hibak.push('az explicit arfolyam nem íródik (web-paritás hiányzik)')
  }
  if (!/updateData\.osszeg_ron = Math\.round\(input\.osszeg \* aktArfolyam \* 100\) \/ 100/.test(fn)) {
    hibak.push('nincs osszeg_ron-újraszámolás a tárolt árfolyamból — devizás soron a régi RON-érték maradna')
  }

  return hibak
}

const src = fs.readFileSync(FAJL, 'utf8')

const hibak = ellenoriz(src)
if (hibak.length === 0) {
  pass('a core szerkesztő frissíti az osszeg_ron/arfolyam mezőket (explicit input + tárolt-árfolyamos újraszámolás)')
} else {
  for (const h of hibak) bukik(h)
}

if (hibak.length === 0) {
  // M1: az újraszámoló ág törlése
  const m1 = src.replace(/updateData\.osszeg_ron = Math\.round\(input\.osszeg \* aktArfolyam \* 100\) \/ 100/, ';')
  if (m1 === src) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: az újraszámolás törlésére az őr NEM bukik — vak')
  else pass('M1 mutáns (újraszámolás törölve) → az őr elbuktatja')

  // M2: az explicit passthrough törlése
  const m2 = src.replace(/if \(input\.osszeg_ron !== undefined\) updateData\.osszeg_ron = input\.osszeg_ron\n/, '')
  if (m2 === src) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2).length === 0) bukik('M2: a passthrough törlésére az őr NEM bukik — vak')
  else pass('M2 mutáns (explicit osszeg_ron törölve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — deviza-szerkesztés rendben`)
