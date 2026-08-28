#!/usr/bin/env node
/**
 * IMPORT-ZÁR ELV önellenőrzés (D8 / D-blokk, 2026-08-28 — ugyanaznap pontosítva)
 *
 * AZ ELV (a döntés Endre „legyen a javaslatod szerint" felhatalmazásával):
 * a KÖLTSÉGVETÉS-zár (budget_finalized) a NYITÓ EGYENLEGET védi — a
 * költségvetés az év ELEJÉN véglegesül, tehát aki rá zárna a tranzakció-
 * rögzítésen, az az egész évi rutin munkát fogná.
 *   - a NYITÓT IS ÍRÓ utak (nyitó-egyenleg panel, Adatok-importáló)
 *     MINDKÉT zárra blokkolnak (accounting VAGY budget),
 *   - a CSAK TRANZAKCIÓT író bank-import KIZÁRÓLAG a számadás-zárra
 *     (accounting_finalized) blokkol.
 *
 * MIT ŐRIZ: mindkét oldalt — ha a bank-import budget-zárat kapna, az évközi
 * banki import állna le; ha az Adatok-importáló elvesztené a budget-zárat,
 * a véglegesített költségvetés alatti nyitó felülírhatóvá válna.
 *
 * NEGATÍV ASSZERT: elv-sértő mutánsok mindkét irányban.
 *
 * Futtatás:  node scripts/selftest-bankimport-koltsegvetes-zar.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const BANK = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'bank-import-actions.ts')
const ADATOK = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'finance-import-actions.ts')

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

  // ── (1) bank-import: CSAK accounting-zár ──
  const b = stripComments(files.get(BANK))
  if (!/\.select\('id, accounting_finalized'\)/.test(b)) {
    hibak.push('bank-import: a zár-lekérdezés nem a csak-accounting alak — az elv sérül')
  }
  if (/budget_finalized/.test(b)) {
    hibak.push('bank-import: budget_finalized-ra IS zár — az év eleji költségvetés-véglegesítés az egész évi banki importot fogná')
  }
  if (!/r\.accounting_finalized\)/.test(b)) {
    hibak.push('bank-import: az accounting-szűrő hiányzik — zárt évbe importálható banki tétel')
  }

  // ── (2) Adatok-importáló: MINDKÉT zár (nyitót is ír) ──
  const a = stripComments(files.get(ADATOK))
  if (!/accounting_finalized \|\| r\.budget_finalized/.test(a)) {
    hibak.push('Adatok-importáló: elveszett a budget-zár — a véglegesített költségvetés alatti nyitó felülírhatóvá válik')
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const fp of [BANK, ADATOK]) m.set(fp, fs.readFileSync(fp, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('import-zár elv: bank-import = csak számadás-zár; Adatok-importáló = mindkét zár')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a bank-import visszakapja a budget-zárat
  const m1files = beolvas()
  const b1 = m1files.get(BANK)
  const b1mut = b1.replace(/\.select\('id, accounting_finalized'\)/, ".select('id, accounting_finalized, budget_finalized')")
  m1files.set(BANK, b1mut)
  if (b1mut === b1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1files).length === 0) bukik('M1: a budget-zár visszacsempészésére az őr NEM bukik — vak')
  else pass('M1 mutáns (bank-import budget-zár vissza) → az őr elbuktatja')

  // M2: az Adatok-importáló elveszti a budget-zárat
  const m2files = beolvas()
  const a2 = m2files.get(ADATOK)
  const a2mut = a2.replace(/accounting_finalized \|\| r\.budget_finalized/, 'accounting_finalized')
  m2files.set(ADATOK, a2mut)
  if (a2mut === a2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2files).length === 0) bukik('M2: az Adatok-importáló budget-zárának törlésére az őr NEM bukik — vak')
  else pass('M2 mutáns (Adatok-importáló budget-zár törölve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — import-zár elv rendben`)
