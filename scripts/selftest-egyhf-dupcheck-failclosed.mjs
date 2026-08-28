#!/usr/bin/env node
/**
 * EGYHÁZFENNTARTÁS-IMPORT DUP-CHECK FAIL-CLOSED önellenőrzés (P0-19, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-19 találata:
 *   Az egyházfenntartás-import duplikátum-ellenőrző SELECT-je az `error` mezőt
 *   eldobta: hibázó lekérdezésnél (tranziens hálózat/JWT) `existing = null`
 *   lett, a kód az insert-ágra esett — vagyis a HIBÁZÓ ellenőrzés mellett a
 *   sor beszúródott, és az újraimport némán duplikált.
 *
 * A JAVÍTOTT VILÁG INVARIÁNSAI:
 *   (1) a dup-check kiolvassa az error mezőt is,
 *   (2) hibánál FAIL-CLOSED: a tétel NEM kerül beszúrásra (continue az insert
 *       ELŐTT), és a hiba HANGOS (result.errors-ba kerül) — a bank-import
 *       2026-08-27 óta élő mintája szerint.
 *
 * NEGATÍV ASSZERT: a régi hibás világot a mai forrásból állítjuk elő (a
 * hibaág eltávolításával), és bizonyítjuk, hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-egyhf-dupcheck-failclosed.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const FAJL = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'egyhfenntartas-import-actions.ts')

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

  const iDup = s.indexOf('await dupQuery.limit(1).maybeSingle()')
  if (iDup < 0) {
    hibak.push('a dup-check hívás (dupQuery.limit(1).maybeSingle()) nem található (fail-closed)')
    return hibak
  }

  // (1) az error mező kiolvasva
  const destrukt = /const \{ data: existing, error: (\w+) \} = await dupQuery/.exec(s)
  if (!destrukt) {
    hibak.push('a dup-check nem olvassa ki az error mezőt — hibázó ellenőrzés = "nincs duplikátum"')
    return hibak
  }
  const errNev = destrukt[1]

  // (2) fail-closed hibaág az insert ELŐTT, hangos hibával. A blokkot a
  // következő `if (existing)`-ig vágjuk ki (a template-literálok `}` jelei
  // miatt a naiv kapcsoszárójel-illesztés hamis határt adna).
  const iInsert = s.indexOf(".from('befizetes').insert(", iDup)
  const iAg = s.indexOf(`if (${errNev})`, iDup)
  if (iAg < 0 || (iInsert > 0 && iAg > iInsert)) {
    hibak.push(`nincs if (${errNev}) hibaág a dup-check és az insert között — a hibázó ellenőrzés átcsúszik az insertre`)
  } else {
    const iKov = s.indexOf('if (existing)', iAg)
    const blokk = s.slice(iAg, iKov > 0 ? iKov : iAg + 600)
    if (!/continue|return/.test(blokk)) hibak.push('a dup-check hibaág nem állítja meg a tételt (nincs continue/return)')
    if (!/result\.errors\.push/.test(blokk)) hibak.push('a dup-check hibája néma (nem kerül a result.errors-ba)')
  }

  return hibak
}

const src = fs.readFileSync(FAJL, 'utf8')

const hibak = ellenoriz(src)
if (hibak.length === 0) {
  pass('egyházfenntartás-import dup-check: fail-closed, hangos hibával')
} else {
  for (const h of hibak) bukik(h)
}

if (hibak.length === 0) {
  // M1: a hibaág eltávolítása (a fix előtti világ)
  const s = src
  const destrukt = /const \{ data: existing, error: (\w+) \} = await dupQuery/.exec(stripComments(s))
  const errNev = destrukt ? destrukt[1] : 'dupErr'
  const agRegex = new RegExp(`[ \\t]*if \\(${errNev}\\)\\s*\\{[\\s\\S]{0,600}?\\n[ \\t]*\\}\\n`)
  const m1 = s.replace(agRegex, '')
  if (m1 === s) bukik('M1 mutáció nem változtatott a forráson (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: a hibaág eltávolítására az őr NEM bukik — vak')
  else pass('M1 mutáns (hibaág nélkül) → az őr elbuktatja')

  // M2: az error-destrukturálás visszabutítása
  const m2 = s.replace(/const \{ data: existing, error: \w+ \} = await dupQuery/, 'const { data: existing } = await dupQuery')
  if (m2 === s) bukik('M2 mutáció nem változtatott a forráson (fail-closed)')
  else if (ellenoriz(m2).length === 0) bukik('M2: az error-elhagyó mutánsra az őr NEM bukik — vak')
  else pass('M2 mutáns (error eldobva) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — egyhf-import dup-check fail-closed`)
