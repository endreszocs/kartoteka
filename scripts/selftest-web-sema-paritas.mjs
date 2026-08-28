#!/usr/bin/env node
/**
 * WEB SÉMA-PARITÁS önellenőrzés (D1-részhalmaz / D-blokk, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P2-találatának vitathatatlan
 * részhalmaza: a web fő mentési sémái LAZÁBBAK voltak a core (desktop-út)
 * sémáinál —
 *   - fizetettev tartomány-ellenőrzés nélkül (pl. 20026 is átment),
 *   - tag ∧ család kölcsönös kizárás nélkül (mindkét FK egyszerre menthető),
 *   - szöveghossz-plafonok nélkül (forrasa/iratszam/nyugta/megjegyzes/
 *     kedvezmenyzett korlátlan hosszal mehetett a DB-be).
 * A desktop-út (packages/validations) mindezt kikényszeríti — a két felület
 * széthúzása a repó visszatérő hibaosztálya.
 *
 * A JAVÍTÁS: a web income/expense (+batch) sémái a pkg-sémákkal azonos
 * kényszereket kapnak. (A VITATOTT részek — kiadás átvevő-kötelezőség,
 * webes iratszám-dup-check, nyugtaszám-generátor egységesítés (D3) — Endre
 * döntésére külön maradnak.)
 *
 * NEGATÍV ASSZERT: kényszer-eltávolító mutánsok.
 *
 * Futtatás:  node scripts/selftest-web-sema-paritas.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const FAJL = path.join(REPO, 'apps', 'web', 'lib', 'validations', 'finance.ts')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function db(s, re) { return (s.match(re) || []).length }

function ellenoriz(src) {
  const hibak = []
  const s = stripComments(src)

  // (1) fizetettev tartomány — income + incomeBatch (2 hely)
  if (db(s, /fizetettev: z\.number\(\)\.int\(\)\.min\(2000\)\.max\(2100\)/g) < 2) {
    hibak.push('a fizetettev tartomány-ellenőrzése hiányzik (income + batch, pkg-paritás)')
  }
  // (2) tag ∧ család kölcsönös kizárás — income + incomeBatch (2 hely)
  if (db(s, /vagy tag vagy család/g) < 2) {
    hibak.push('a tag∧család kölcsönös kizárás hiányzik (income + batch, pkg-paritás)')
  }
  // (3) szöveghossz-plafonok
  if (db(s, /megjegyzes: z\.string\(\)\.trim\(\)\.max\(500\)/g) < 4) {
    hibak.push('a megjegyzes 500-as plafonja nincs meg mind a 4 sémán')
  }
  if (db(s, /kedvezmenyzett: z\.string\(\)\.trim\(\)\.max\(200\)/g) < 2) {
    hibak.push('a kedvezmenyzett 200-as plafonja nincs meg mindkét kiadás-sémán')
  }
  if (db(s, /iratszam: z\.string\(\)\.trim\(\)\.max\(50\)/g) < 4) {
    hibak.push('az iratszam 50-es plafonja nincs meg mind a 4 sémán')
  }
  if (db(s, /forrasa: z\.string\(\)\.trim\(\)\.max\(100\)/g) < 2) {
    hibak.push('a forrasa 100-as plafonja nincs meg mindkét bevétel-sémán')
  }

  return hibak
}

const src = fs.readFileSync(FAJL, 'utf8')
const hibak = ellenoriz(src)
if (hibak.length === 0) {
  pass('web sémák: fizetettev-tartomány + tag∧család kizárás + hossz-plafonok (pkg-paritás)')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a fizetettev-tartomány eltávolítása az egyik sémáról
  const m1 = src.replace(/fizetettev: z\.number\(\)\.int\(\)\.min\(2000\)\.max\(2100\)/, 'fizetettev: z.number()')
  if (m1 === src) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: a tartomány-törlésre az őr NEM bukik — vak')
  else pass('M1 mutáns (fizetettev-tartomány törölve) → az őr elbuktatja')

  // M2: a kölcsönös kizárás kigyomlálása az egyik sémáról
  const m2 = src.replace(/vagy tag vagy család/, 'MUTANS')
  if (m2 === src) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2).length === 0) bukik('M2: a kizárás-törlésre az őr NEM bukik — vak')
  else pass('M2 mutáns (tag∧család kizárás kigyomlálva) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — web séma-paritás rendben`)
