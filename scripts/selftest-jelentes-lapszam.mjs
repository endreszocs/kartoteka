#!/usr/bin/env node
/**
 * JELENTÉS-LAPSZÁM + HALOTT ADAT-ÚT önellenőrzés
 * (E-blokk: P3-15, P3-24, P4-37 — 2026-08-29)
 *
 * MIT ŐRIZ:
 *   (1) P3-15 az éves regiszter lapszám-cseréje HATÁROLT (/pg\.\s*1\b/) —
 *       a régi /pg\.\s*1/ a „pg. 10", „pg. 11"… elejét is találta, és a
 *       Jurnal folytatólagos számozását rontotta el 10+ lapnál;
 *   (2) P3-24 a 113–134-es halott adat-út (zaroCasa/zaroBanca/tartozasok/
 *       kintlevosegek) nem tér vissza a BudgetPrintData-ba / a web
 *       print-dialógusba;
 *   (3) P4-37 a buildFinancePrintDocument a kiadasi_kiseroiv típusra HANGOS
 *       hibát dob, nem néma Registru Casát.
 *
 * Futtatás:  node scripts/selftest-jelentes-lapszam.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const REPORTING = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'reporting.ts')
const BUDGET = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'budget-reporting.ts')
const WEB_PRINT = path.join(REPO, 'apps', 'web', 'components', 'finance', 'finance-print-dialog.tsx')

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

  const r = stripComments(files.get(REPORTING))
  // (1) a határolt lapszám-csere
  if (!r.includes(String.raw`replace(/pg\.\s*1\b/`)) {
    hibak.push('P3-15: a lapszám-csere nem határolt — a „pg. 10"+ lapszámokat is felülírná')
  }
  if (/replace\(\/pg\\\.\\s\*1\/[,)]/.test(r)) {
    hibak.push('P3-15: visszatért a határolatlan /pg\\.\\s*1/ csere')
  }

  // (3) kiadasi_kiseroiv → hangos hiba
  const iBuild = r.indexOf('export function buildFinancePrintDocument')
  const buildFn = iBuild >= 0 ? r.slice(iBuild, iBuild + 3000) : ''
  const iKis = buildFn.indexOf("type === 'kiadasi_kiseroiv'")
  const kisAg = iKis >= 0 ? buildFn.slice(iKis, iKis + 600) : ''
  if (!/throw new Error\(/.test(kisAg)) {
    hibak.push('P4-37: a kiadasi_kiseroiv ág nem dob hangos hibát')
  }
  if (/buildRegistruCasa\(/.test(kisAg)) {
    hibak.push('P4-37: a kiadasi_kiseroiv ág újra némán Registru Casát ad')
  }

  // (2) a halott mezőnégyes nem tér vissza
  const b = stripComments(files.get(BUDGET))
  const w = stripComments(files.get(WEB_PRINT))
  for (const mezo of ['zaroCasa', 'zaroBanca']) {
    if (new RegExp(String.raw`\b${mezo}\??:`).test(b) || new RegExp(String.raw`printData\.${mezo}\b`).test(w)) {
      hibak.push(`P3-24: a halott ${mezo} adat-út visszatért — a renderelő nem olvassa, csak félrevezet`)
    }
  }
  if (/printData\.tartozasok\b/.test(w) || /printData\.kintlevosegek\b/.test(w)) {
    hibak.push('P3-24: a halott tartozasok/kintlevosegek átadás visszatért a print-dialógusba')
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const fp of [REPORTING, BUDGET, WEB_PRINT]) m.set(fp, fs.readFileSync(fp, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('jelentés-lapszám + halott adat-út: határolt csere, hangos kísérőív-ág, kivezetett mezők')
} else {
  for (const hb of hibak) bukik(hb)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a határolatlan csere visszaállítása (a RÉGI világ)
  const m1 = beolvas()
  const r1 = m1.get(REPORTING)
  const r1mut = r1.replace(String.raw`replace(/pg\.\s*1\b/`, String.raw`replace(/pg\.\s*1/`)
  m1.set(REPORTING, r1mut)
  if (r1mut === r1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: a határolatlan cserére NEM bukik — vak')
  else pass('M1 mutáns (határolatlan lapszám-csere vissza) → az őr elbuktatja')

  // M2: a kiadasi_kiseroiv ág visszabontása néma Registru Casára
  const m2 = beolvas()
  const r2 = m2.get(REPORTING)
  const r2mut = r2.replace(
    /throw new Error\(\s*\n\s*'A kiadási kísérőívet a buildKiadasiKiseroiv/,
    "return buildRegistruCasa(data, { ...filters, month: filters.month || 1 })\n    void ('A kiadási kísérőívet a buildKiadasiKiseroiv",
  )
  m2.set(REPORTING, r2mut)
  if (r2mut === r2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2).length === 0) bukik('M2: a néma Registru Casa visszabontásra NEM bukik — vak')
  else pass('M2 mutáns (kísérőív-ág néma Casára vissza) → az őr elbuktatja')

  // M3: a halott mező visszacsempészése
  const m3 = beolvas()
  const b3 = m3.get(BUDGET)
  const b3mut = b3.replace(/\n\s*finalized\?: boolean/, '\n  zaroCasa?: number\n  finalized?: boolean')
  m3.set(BUDGET, b3mut)
  if (b3mut === b3) bukik('M3 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m3).length === 0) bukik('M3: a halott mező visszacsempészésére NEM bukik — vak')
  else pass('M3 mutáns (zaroCasa vissza a típusba) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — jelentés-lapszám rendben`)
