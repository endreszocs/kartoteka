#!/usr/bin/env tsx
/**
 * Pénzügyi import helper-ek teljes-fájl smoke-testje a valós EREK 2025-os
 * Kassza-fülön.
 *
 * Futtatás:
 *   cd apps/web && npx tsx scripts/test-finance-import-fullfile.ts
 *
 * Cél: a 994 soros Kassza fülön lefuttatni a `splitKasszaRow` osztályozást
 * és a `parseDonorString`-ot, hogy ellenőrizzük az osztályozási és cím-
 * parsing pontosságot. Megjeleníti az aggregátum-statisztikát + példa-sorokat.
 *
 * 2026-05-02 (Fázis 2): Endre kérése — 994-soros klasszifikáció.
 */

import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { detectCompany } from '../components/finance/finance-import/helpers/company-detector'
import { parseDonorString } from '../components/finance/finance-import/helpers/donor-string-parser'
import { splitKasszaRow } from '../components/finance/finance-import/helpers/kassza-row-classifier'

const SOURCE_FILE = 'C:/Users/endre/Documents/APPS/Egyházi APP/Adatok/Adatok_2025.xlsx'

console.log(`📂 Forrás: ${SOURCE_FILE}\n`)

const buffer = readFileSync(SOURCE_FILE)
const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })

const ws = wb.Sheets['Kassza']
if (!ws) {
  console.error('❌ Nincs "Kassza" sheet a fájlban!')
  process.exit(1)
}

// Olvasd be az 5. sortól (header), 7. sortól adat. A `header: 1` opció miatt
// minden sor egy unknown[] tömb (NEM Record<string, unknown>).
const allRows = XLSX.utils.sheet_to_json(ws, {
  header: 1,
  raw: true,
  defval: null,
}) as unknown[][]

console.log(`📊 Sheet sorok száma: ${allRows.length}\n`)

// Header detection
let headerRow: unknown[] | null = null
let headerIdx = -1
for (let i = 0; i < Math.min(20, allRows.length); i++) {
  const row = allRows[i]
  const text = row.map((c) => String(c || '')).join(' ')
  if (/Dátum.*Iratszám.*Bev/i.test(text)) {
    headerRow = row
    headerIdx = i
    break
  }
}

if (!headerRow) {
  console.error('❌ Nincs felismert fejléc-sor!')
  process.exit(1)
}

console.log(`🎯 Header sor: ${headerIdx + 1}`)
console.log(`   Oszlopok: ${headerRow.map((c, i) => `[${i}]${c}`).join(' | ')}\n`)

// Helper: convert raw row to record
function rowToRecord(row: unknown[]): Record<string, unknown> {
  // Az oszlopok az Excel-ben:
  //   col 3 = Dátum, 4 = Iratszám, 5 = Irattip., 6 = Név,
  //   7 = Bev. - Összeg, 8 = Bev. cél név, 9 = Kiad. - Összeg,
  //   10 = Kiad. cél név, 11 = Megjegyzés, 12 = Magyarázat, 13 = Költségvetési szám
  return {
    datum: row[3] || null,
    iratszam: row[4] || null,
    irattipus: row[5] || null,
    _donor_string: row[6] || null,
    _bev_osszeg: row[7] || null,
    _bev_cel_nev: row[8] || null,
    _kia_osszeg: row[9] || null,
    _kia_cel_nev: row[10] || null,
    megjegyzes: row[11] || null,
    _szamadasicel_kod: row[13] || null,
  }
}

// Statisztika
const stats = {
  income: 0,
  expense: 0,
  'internal-transfer-in': 0,
  'internal-transfer-out': 0,
  skip: 0,
}

const skipReasons: Record<string, number> = {}
const donorTypes = {
  resolved: 0, // személy, prefix vagy férjes detekció sikeres
  company: 0,
  unparsed: 0,
}
const donors = new Set<string>()
const companies = new Set<string>()
const examples: Record<string, string[]> = {
  income: [],
  expense: [],
  'internal-transfer-in': [],
  'internal-transfer-out': [],
}

// Process rows
for (let i = headerIdx + 2; i < allRows.length; i++) {
  const row = allRows[i]
  if (!row || row.length === 0) continue
  const record = rowToRecord(row)

  // splitKasszaRow
  const result = splitKasszaRow(record)
  stats[result.kind]++

  if (result.kind === 'skip') {
    skipReasons[result.reason] = (skipReasons[result.reason] || 0) + 1
    continue
  }

  // Donor parsing
  const donorString =
    typeof record._donor_string === 'string' ? record._donor_string : null
  if (donorString) {
    donors.add(donorString)
    const parsed = parseDonorString(donorString)
    if (parsed.isCompany) {
      donorTypes.company++
      companies.add(donorString)
    } else if (parsed.csaladnev || parsed.husbandFamilyName || parsed.k_nev) {
      donorTypes.resolved++
    } else {
      donorTypes.unparsed++
    }
  }

  // Példa-sorok (max 3 / kategória) — a 'skip' már nem juthat ide
  const kindKey: 'income' | 'expense' | 'internal-transfer-in' | 'internal-transfer-out' = result.kind
  if (examples[kindKey] && examples[kindKey].length < 3) {
    const summary =
      result.kind === 'income'
        ? `${donorString} (${result.bevOsszeg} RON, ${result.celNev})`
        : result.kind === 'expense'
          ? `${donorString} (${result.kiaOsszeg} RON, ${result.celNev})`
          : `${donorString} (${result.amount} RON, ${result.celNev})`
    examples[kindKey].push(summary)
  }
}

// ════════════════════════════════════════════════════════════════════════
// Eredmény
// ════════════════════════════════════════════════════════════════════════
console.log('═══════════════════════════════════════════════════════════════════')
console.log('📊 KASSZA-OSZTÁLYOZÁS — 994 soros valós fájl')
console.log('═══════════════════════════════════════════════════════════════════\n')

console.log(`  ✅ income (bevétel):                ${stats.income}`)
console.log(`  💸 expense (kiadás):                ${stats.expense}`)
console.log(`  🔄 internal-transfer-in (bank→kassza):  ${stats['internal-transfer-in']}`)
console.log(`  🔄 internal-transfer-out (kassza→bank): ${stats['internal-transfer-out']}`)
console.log(`  ⏭️  skip:                              ${stats.skip}`)
const total = stats.income + stats.expense + stats['internal-transfer-in'] + stats['internal-transfer-out'] + stats.skip
console.log(`  ─────────────────────────────────────`)
console.log(`     ÖSSZESEN:                       ${total}\n`)

console.log(`📋 Skip okok:`)
for (const [reason, count] of Object.entries(skipReasons)) {
  console.log(`  - ${reason}: ${count}`)
}

console.log(`\n🧑 Donor-feldolgozás:`)
console.log(`  ✅ feloldva (személy):     ${donorTypes.resolved}`)
console.log(`  🏢 cég/intézmény:          ${donorTypes.company}`)
console.log(`  ❓ nem-parsolható:         ${donorTypes.unparsed}`)
console.log(`  📁 egyedi donor-stringek:  ${donors.size}`)
console.log(`  🏢 egyedi cég:              ${companies.size}`)

console.log(`\n🏢 Egyedi cégek/intézmények listája:`)
for (const c of [...companies].sort()) {
  console.log(`  - "${c}"`)
}

console.log(`\n📌 Példa-sorok kategóriánként:`)
for (const [kind, list] of Object.entries(examples)) {
  console.log(`\n  ${kind}:`)
  for (const ex of list) {
    console.log(`    • ${ex}`)
  }
}

console.log(`\n═══════════════════════════════════════════════════════════════════`)
console.log(`  Várt arány a memória/diagnosztika alapján:`)
console.log(`    income: ~479, expense: ~64, internal-transfer: ~16, skip: ~436`)
console.log(`═══════════════════════════════════════════════════════════════════\n`)
