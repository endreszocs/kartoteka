#!/usr/bin/env node
/**
 * DESKTOP TÜKÖR-FRISSESSÉG önellenőrzés (P0-16, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-16 találata:
 * a desktop pénzügy-oldal `load()`-ja a 7 pull-hívást `Promise.allSettled`-del
 * indította, de az EREDMÉNYT SENKI NEM OLVASTA. A pullok hibánál nem dobnak,
 * hanem `{ success: false }`-szal térnek vissza — offline vagy hibázó
 * szinkron után az oldal (és minden hivatalos nyomtatvány) NÉMÁN a régi
 * helyi tükröt mutatta, jelzés nélkül.
 *
 * A JAVÍTÁS (Endre döntése: figyelmeztető sáv, NEM tiltás): a bukott pullok
 * összegyűjtése + állandó borostyán sáv, ami kimondja, hogy a számok és a
 * nyomtatványok a legutóbbi sikeres szinkron állapotát mutatják.
 *
 * NEGATÍV ASSZERT: eredmény-eldobó + sáv-kikapcsoló mutánsok.
 *
 * Futtatás:  node scripts/selftest-tukor-frissesseg.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const PAGE = path.join(REPO, 'apps', 'desktop', 'src', 'pages', 'penzugy-page.tsx')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
}

function ellenoriz(src) {
  const hibak = []
  const s = stripComments(src)

  // (1) az allSettled eredménye VÁLTOZÓBA kerül, nem vész el
  if (!/const pullEredmenyek = await Promise\.allSettled\(/.test(s)) {
    hibak.push('a Promise.allSettled eredménye nincs változóba mentve — a pull-hibák némák')
  }
  if (/^\s*await Promise\.allSettled\(/m.test(s)) {
    hibak.push('csupasz `await Promise.allSettled(` — az eredmény eldobva')
  }

  // (2) a sikertelenség MINDKÉT alakját nézzük: rejected ÉS success:false
  //     (a pullok hibánál nem dobnak, hanem success:false-szal térnek vissza)
  if (!/status === 'rejected'/.test(s) || !/success === false/.test(s)) {
    hibak.push('a pull-eredmény kiértékelés hiányos: rejected VAGY success:false ág nincs lekezelve')
  }

  // (3) a bukott pullok state-be kerülnek
  if (!/setElavultPullok\(/.test(s)) {
    hibak.push('a bukott pullok nem kerülnek state-be (setElavultPullok hiányzik)')
  }

  // (4) a figyelmeztető sáv feltételesen renderel, és kimondja a lényeget:
  //     a NYOMTATVÁNYOK is a régi tükörből jönnek
  if (!/\{elavultPullok\.length > 0 && \(/.test(s)) {
    hibak.push('a figyelmeztető sáv nem az elavultPullok state-ből renderel')
  }
  if (!/nyomtatvány/.test(s) || !/szinkron/.test(s)) {
    hibak.push('a sáv szövege nem mondja ki, hogy a nyomtatványok elavult szinkron-állapotot mutathatnak')
  }

  return hibak
}

const src = fs.readFileSync(PAGE, 'utf8')
const hibak = ellenoriz(src)
if (hibak.length === 0) {
  pass('desktop tükör-frissesség: pull-eredmény kiértékelve + figyelmeztető sáv a helyén')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: az eredmény-mentés visszabontása csupasz await-re
  const m1 = src.replace(/const pullEredmenyek = await Promise\.allSettled\(/, 'await Promise.allSettled(')
  if (m1 === src) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: az eredmény-eldobásra az őr NEM bukik — vak')
  else pass('M1 mutáns (pull-eredmény eldobva) → az őr elbuktatja')

  // M2: a sáv render-feltételének kiütése
  const m2 = src.replace(/\{elavultPullok\.length > 0 && \(/, '{false && (')
  if (m2 === src) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2).length === 0) bukik('M2: a sáv kikapcsolására az őr NEM bukik — vak')
  else pass('M2 mutáns (figyelmeztető sáv kikapcsolva) → az őr elbuktatja')

  // M3: a success:false ág kilövése (csak a rejected marad — a pullok viszont
  // sosem dobnak, tehát ettől a sáv a gyakorlatban SOSEM jelenne meg)
  const m3 = src.replace(/success === false/, "success === 'SOHA'")
  if (m3 === src) bukik('M3 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m3).length === 0) bukik('M3: a success:false ág kilövésére az őr NEM bukik — vak')
  else pass('M3 mutáns (success:false ág kilőve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — desktop tükör-frissesség rendben`)
