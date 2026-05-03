#!/usr/bin/env tsx
/**
 * Diagnosztikai script: a parseWorkbook + analyzeKasszaSheet láncot
 * teszteli a valós Adatok_2025.xlsx fájlon.
 */

import { readFileSync } from 'node:fs'
import { parseWorkbook } from '../lib/import/excel-parser'
import { splitKasszaRow } from '../components/finance/finance-import/helpers/kassza-row-classifier'
import { applyKasszaFix } from '../components/finance/finance-import/helpers/kassza-sheet-parser'

const SOURCE_FILE = 'C:/Users/endre/Documents/APPS/Egyházi APP/Adatok/Adatok_2025.xlsx'

const buffer = readFileSync(SOURCE_FILE)
const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
const wbRaw = parseWorkbook(ab, 'Adatok_2025.xlsx')
const wb = applyKasszaFix(wbRaw, ab)

const kassza = wb.sheets.find((s) => s.name === 'Kassza')
if (!kassza) {
  console.error('Nincs Kassza sheet!')
  process.exit(1)
}

console.log(`📊 Kassza headers (${kassza.headers.length}):`)
kassza.headers.forEach((h, i) => {
  console.log(`  [${i}] "${h}"`)
})

console.log(`\n📋 Első 5 sor (rows count: ${kassza.rows.length}):`)
for (let i = 0; i < 5 && i < kassza.rows.length; i++) {
  console.log(`\nRow ${i}:`)
  for (const [k, v] of Object.entries(kassza.rows[i])) {
    if (v !== null) {
      console.log(`  ${k} = ${JSON.stringify(v)} (${typeof v})`)
    }
  }
}

// Now szimuláljuk a kasszaRowToRecord-et
function findHeader(headers: string[], candidates: string[]): string | undefined {
  for (const cand of candidates) {
    const lower = cand.toLowerCase().replace(/\s+/g, '')
    const found = headers.find((h) => h.toLowerCase().replace(/\s+/g, '') === lower)
    if (found) return found
  }
  return undefined
}

console.log(`\n🔍 Header-detektálás:`)
const datumHeader = findHeader(kassza.headers, ['Dátum', 'Datum', 'datum'])
const nevHeader = findHeader(kassza.headers, ['Név', 'Nev', 'Forrás', 'Befizető'])
const bevOsszegHeader = findHeader(kassza.headers, ['Bev. - Összeg', 'Bevétel - Összeg', 'Bevétel'])
const bevCelHeader = findHeader(kassza.headers, [
  'Bevétel - Költ.vet. név',
  'Bevétel - Költvet. név',
  ' Bevétel - Költ.vet. név',
  'Bev cél',
])
const kiaOsszegHeader = findHeader(kassza.headers, ['Kiad. - Összeg', 'Kiadás - Összeg', 'Kiadás'])
const kodHeader = findHeader(kassza.headers, ['Költségvetési szám', 'szám', 'Költs. szám', 'KöltsSzám'])
console.log(`  Dátum:    "${datumHeader}"`)
console.log(`  Név:      "${nevHeader}"`)
console.log(`  Bev. ö.:  "${bevOsszegHeader}"`)
console.log(`  Bev. cél: "${bevCelHeader}"`)
console.log(`  Kiad. ö.: "${kiaOsszegHeader}"`)
console.log(`  Kód:      "${kodHeader}"`)

// Klasszifikáció
console.log(`\n🎯 Klasszifikáció:`)
let income = 0, expense = 0, intIn = 0, intOut = 0, skip = 0
const skipReasons: Record<string, number> = {}
for (const row of kassza.rows) {
  const record = {
    _donor_string: nevHeader ? row[nevHeader] : null,
    _bev_osszeg: bevOsszegHeader ? row[bevOsszegHeader] : null,
    _bev_cel_nev: bevCelHeader ? row[bevCelHeader] : null,
    _kia_osszeg: kiaOsszegHeader ? row[kiaOsszegHeader] : null,
    _kia_cel_nev: null,
    _szamadasicel_kod: kodHeader ? row[kodHeader] : null,
  }
  const c = splitKasszaRow(record)
  if (c.kind === 'income') income++
  else if (c.kind === 'expense') expense++
  else if (c.kind === 'internal-transfer-in') intIn++
  else if (c.kind === 'internal-transfer-out') intOut++
  else {
    skip++
    skipReasons[c.reason] = (skipReasons[c.reason] || 0) + 1
  }
}
console.log(`  income: ${income}`)
console.log(`  expense: ${expense}`)
console.log(`  internal-transfer-in: ${intIn}`)
console.log(`  internal-transfer-out: ${intOut}`)
console.log(`  skip: ${skip}`)
console.log(`\n  Skip okok:`)
for (const [r, c] of Object.entries(skipReasons)) {
  console.log(`    ${r}: ${c}`)
}
