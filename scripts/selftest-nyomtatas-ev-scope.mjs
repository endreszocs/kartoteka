#!/usr/bin/env node
/**
 * DESKTOP NYOMTATÁS ÉV-SCOPE önellenőrzés (D11 / D-blokk, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P2-találata:
 * a desktop két nyomtatási központja nem a KIVÁLASZTOTT év bealitas-sorát
 * használta — más év Számadása/Költségvetése a LAP évének
 * véglegesítés-zászlajával ment ki, a presbitériumi határozat mezői nélkül,
 * és a congregationNameRo hiánya miatt egynyelvű fejléccel/lábléccel
 * (a web a 2026-08-15-i javítás óta év-scope-olt és kétnyelvű).
 *
 * A JAVÍTÁS (web-paritás):
 *   - finance-print-dialog: az onLoadYearRecords a kiválasztott év
 *     bealitas-sorát is lekéri (evBealitas/evBealitasOk a payloadban);
 *     a budget-ág fail-closed blockedPreview-t ad, ha nem tölthető be;
 *     a finalized + hivatalosHatarozatMezok az ÉV sorából jön; a budget
 *     printData a congregationNameRo-t is viszi;
 *   - budget-print-dialog: congregationNameRo prop + év-scope-olt
 *     bealitas-térkép (az onLoadBudgetRows tölti) + hivatalosHatarozatMezok;
 *   - penzugy-page: a DesktopBudgetPrintDialog megkapja a congregationNameRo-t.
 *
 * NEGATÍV ASSZERT: év-scope-visszabontó + határozat-törlő mutánsok.
 *
 * Futtatás:  node scripts/selftest-nyomtatas-ev-scope.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const FIN = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'finance-print-dialog.tsx')
const BUD = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'budget-print-dialog.tsx')
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

function ellenoriz(files) {
  const hibak = []

  // ── (1) finance-print-dialog ──
  const f = stripComments(files.get(FIN))
  if (!/evBealitasOk/.test(f) || !/evBealitas/.test(f)) {
    hibak.push('finance-print: a kiválasztott év bealitas-sora nincs a yearRecords-payloadban')
  }
  if (!/evSettings\?\.accounting_finalized/.test(f)) {
    hibak.push('finance-print: a finalized zászló nem az ÉV sorából jön (a lap évének settings-e megy minden évre)')
  }
  if (!/hivatalosHatarozatMezok\(/.test(f)) {
    hibak.push('finance-print: a presbitériumi határozat mezői nem kerülnek az ívre')
  }
  const iBudgetData = f.indexOf('const printData: BudgetPrintData')
  if (iBudgetData < 0 || !/congregationNameRo/.test(f.slice(iBudgetData, iBudgetData + 700))) {
    hibak.push('finance-print: a budget-ág printData-ja nem viszi a congregationNameRo-t — egynyelvű ív')
  }

  // ── (2) budget-print-dialog ──
  const b = stripComments(files.get(BUD))
  if (!/congregationNameRo/.test(b)) {
    hibak.push('budget-print: nincs congregationNameRo — egynyelvű fejléc/lábléc')
  }
  if (!/selectedYear === currentYear \? settings :/.test(b)) {
    hibak.push('budget-print: a settings nem év-scope-olt — más év a lap évének zászlajával megy ki')
  }
  if (!/hivatalosHatarozatMezok\(/.test(b)) {
    hibak.push('budget-print: a presbitériumi határozat mezői nem kerülnek az ívre')
  }

  // ── (3) a page átadja a román nevet a budget-dialógusnak ──
  const p = stripComments(files.get(PAGE))
  const iBudDlg = p.indexOf('<DesktopBudgetPrintDialog')
  if (iBudDlg < 0 || !/congregationNameRo/.test(p.slice(iBudDlg, iBudDlg + 900))) {
    hibak.push('penzugy-page: a DesktopBudgetPrintDialog nem kapja meg a congregationNameRo-t')
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const fp of [FIN, BUD, PAGE]) m.set(fp, fs.readFileSync(fp, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('desktop nyomtatás: év-scope-olt bealitas + határozat-mezők + kétnyelvű név a helyén')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a finance-print finalized visszabontása a lap évének settings-ére
  const m1files = beolvas()
  const f1 = m1files.get(FIN)
  const f1mut = f1.replace(/evSettings\?\.accounting_finalized/, 'settings.accounting_finalized')
  m1files.set(FIN, f1mut)
  if (f1mut === f1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1files).length === 0) bukik('M1: az év-scope visszabontására az őr NEM bukik — vak')
  else pass('M1 mutáns (finance-print finalized visszabontva) → az őr elbuktatja')

  // M2: a budget-print határozat-mezőinek törlése
  const m2files = beolvas()
  const b2 = m2files.get(BUD)
  const b2mut = b2.replace(/hivatalosHatarozatMezok\(/g, 'hivatalosHatarozatMezok_KIKAPCSOLVA(')
  m2files.set(BUD, b2mut)
  if (b2mut === b2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2files).length === 0) bukik('M2: a határozat-törlésre az őr NEM bukik — vak')
  else pass('M2 mutáns (budget-print határozat kilőve) → az őr elbuktatja')

  // M3: az év-scope-olt settings-választó kiütése a budget-print-ből
  const m3files = beolvas()
  const b3 = m3files.get(BUD)
  const b3mut = b3.replace(/selectedYear === currentYear \? settings :/, 'true ? settings :')
  m3files.set(BUD, b3mut)
  if (b3mut === b3) bukik('M3 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m3files).length === 0) bukik('M3: a budget-print év-scope kiütésére az őr NEM bukik — vak')
  else pass('M3 mutáns (budget-print év-scope kiütve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — desktop nyomtatás év-scope rendben`)
