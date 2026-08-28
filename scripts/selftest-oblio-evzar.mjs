#!/usr/bin/env node
/**
 * OBLIO-VARÁZSLÓ ÉV-ZÁR önellenőrzés (P1-5 / B-blokk, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P1-5 találata:
 * az Oblio-varázsló `createKiadasFromXmlAndMatch` akciója kapu nélkül írt a
 * `kiadas` táblába — a felületről egy MÁR VÉGLEGESÍTETT (és az egyházmegyének
 * beküldött) évbe is lehetett kiadást könyvelni: a beadott számadás és az
 * adatbázis némán széthúzott (ugyanaz a hibaosztály, mint a 2026-08-15-i
 * soft-delete rés).
 *
 * A JAVÍTÁS: fail-closed év-zár kapu az insert ELŐTT, a számla dátumának
 * évére, a core közös `readYearFinalized` helperével — véglegesített év →
 * beszédes hiba; ISMERETLEN zár-állapot → biztonságból elutasítás.
 * (A financeWriteBlock itt szándékosan nincs bekötve: gyülekezeti hatókörben
 * a readOnly mindig false — a számvevő-írás kérdése a P1-2, külön kör.)
 *
 * NEGATÍV ASSZERT: kapu-eltávolító + fail-open mutánsok.
 *
 * Futtatás:  node scripts/selftest-oblio-evzar.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const FAJL = path.join(
  REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'oblio-ellenorzes-actions.ts',
)

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
  const hibak = []
  const s = stripComments(src)

  const iFn = s.indexOf('export async function createKiadasFromXmlAndMatch')
  if (iFn < 0) { hibak.push('a createKiadasFromXmlAndMatch nem található (fail-closed)'); return hibak }
  const fn = s.slice(iFn)
  const iInsert = fn.indexOf(".from('kiadas')")
  if (iInsert < 0) { hibak.push('a kiadas-insert nem található (fail-closed)'); return hibak }
  const elotte = fn.slice(0, iInsert)

  // (1) az év-zár kapu az INSERT ELŐTT fut
  if (!/readYearFinalized\(/.test(elotte)) {
    hibak.push('nincs év-zár kapu az insert előtt — véglegesített évbe könyvelhető kiadás')
  }
  // (2) fail-closed: az ISMERETLEN zár-állapot is elutasítás. Pontos fragment
  // (\b-vel): egy átnevezés (unknown_KIKAPCSOLVA) ne csússzon át prefixként.
  const iUnknown = elotte.search(/if \(evZar\.unknown\b\)/)
  if (iUnknown < 0 || !/return \{[\s\S]{0,120}?error/.test(elotte.slice(iUnknown, iUnknown + 500))) {
    hibak.push('az ismeretlen zár-állapot nincs fail-closed elutasítva')
  }
  // (3) a véglegesített ág beszédes hibával áll meg
  if (!/if \(evZar\.finalized\b\)/.test(elotte) || !/véglegesítve/.test(elotte)) {
    hibak.push('a véglegesített-év ág hiányzik vagy nem beszédes')
  }

  return hibak
}

const src = fs.readFileSync(FAJL, 'utf8')
const hibak = ellenoriz(src)
if (hibak.length === 0) {
  pass('Oblio-varázsló: fail-closed év-zár kapu a kiadas-insert előtt')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a kapu teljes kikötése
  const m1 = src.replace(/readYearFinalized\(/g, 'readYearFinalized_KIKAPCSOLVA(')
  if (m1 === src) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: a kapu kikötésére az őr NEM bukik — vak')
  else pass('M1 mutáns (readYearFinalized kikötve) → az őr elbuktatja')

  // M2: fail-open — az ismeretlen ág elnyelése
  const m2 = src.replace(/\.unknown/g, '.unknown_KIKAPCSOLVA')
  if (m2 === src) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2).length === 0) bukik('M2: a fail-open mutánsra az őr NEM bukik — vak')
  else pass('M2 mutáns (ismeretlen-ág kilőve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — Oblio év-zár kapu rendben`)
