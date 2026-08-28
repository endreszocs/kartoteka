#!/usr/bin/env node
/**
 * BANK-IMPORT KÖLTSÉGVETÉS-ZÁR önellenőrzés (D8 / D-blokk, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P2-találata:
 * a webes bank-import wrapper zár-ellenőrzése csak a SZÁMADÁS
 * (accounting_finalized) véglegesítését nézte, míg a testvér Adatok-importáló
 * — Endre 2026-08-28-i döntése nyomán („egy hely, és onnan számoljon
 * mindent") — a KÖLTSÉGVETÉS (budget_finalized) zárását is. Így egy
 * véglegesített költségvetésű évbe a banki kivonat-import még be tudott írni,
 * miközben az Excel-import és a nyitó-egyenleg panel már blokkolt.
 *
 * A JAVÍTÁS: a bank-import wrapper is MINDKÉT zárra blokkol, a testvér-út
 * mintájára. (A financeWriteBlock itt szándékosan nincs: gyülekezeti
 * hatókörben a readOnly mindig false — lásd a B2/P1-5 azonos elemzését.)
 *
 * NEGATÍV ASSZERT: a budget-ág kigyomlálása.
 *
 * Futtatás:  node scripts/selftest-bankimport-koltsegvetes-zar.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const FAJL = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'bank-import-actions.ts')

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

  if (!/\.select\('id, accounting_finalized, budget_finalized'\)/.test(s)) {
    hibak.push('a zár-lekérdezés nem kéri le a budget_finalized-ot — a költségvetés-zár láthatatlan')
  }
  if (!/r\.accounting_finalized \|\| r\.budget_finalized/.test(s)) {
    hibak.push('a szűrő nem blokkol a költségvetés-zárra — véglegesített költségvetésű évbe importálható banki tétel')
  }
  if (!/számadás vagy költségvetés/.test(s)) {
    hibak.push('a hibaüzenet nem nevezi meg a költségvetés-zárat (a testvér-út szövege a minta)')
  }

  return hibak
}

const src = fs.readFileSync(FAJL, 'utf8')
const hibak = ellenoriz(src)
if (hibak.length === 0) {
  pass('bank-import: számadás- ÉS költségvetés-zárra is blokkol (testvér-út paritás)')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutáns ────────────────────────────────────────────────────────
if (hibak.length === 0) {
  const m1 = src.replace(/r\.accounting_finalized \|\| r\.budget_finalized/, 'r.accounting_finalized')
  if (m1 === src) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: a budget-ág kigyomlálására az őr NEM bukik — vak')
  else pass('M1 mutáns (budget-ág kigyomlálva) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — bank-import költségvetés-zár rendben`)
