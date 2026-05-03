#!/usr/bin/env tsx
/**
 * Diagnosztikai script: a parseWorkbook + analyzeKasszaSheet láncot
 * teszteli a valós Adatok_2025.xlsx fájlon, a felhasználói visszajelzés
 * 9 pontja mentén.
 */

import { readFileSync } from 'node:fs'
import { parseWorkbook } from '../lib/import/excel-parser'
import { splitKasszaRow } from '../components/finance/finance-import/helpers/kassza-row-classifier'
import { applyKasszaFix } from '../components/finance/finance-import/helpers/kassza-sheet-parser'
import { parseDonorString } from '../components/finance/finance-import/helpers/donor-string-parser'
import { normalizeBudgetCode } from '../components/finance/finance-import/helpers/budget-code-resolver'

const SOURCE_FILE = 'C:/Users/endre/Documents/APPS/Egyházi APP/Adatok/Adatok_2025.xlsx'

const buffer = readFileSync(SOURCE_FILE)
const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
const wbRaw = parseWorkbook(ab, 'Adatok_2025.xlsx')
const wb = applyKasszaFix(wbRaw, ab)

const kassza = wb.sheets.find((s) => s.name === 'Kassza')!

// Header-detektálás
function findHeader(headers: string[], candidates: string[]): string | undefined {
  for (const cand of candidates) {
    const lower = cand.toLowerCase().replace(/\s+/g, '')
    const found = headers.find((h) => h.toLowerCase().replace(/\s+/g, '') === lower)
    if (found) return found
  }
  return undefined
}

const datumHeader = findHeader(kassza.headers, ['Dátum', 'Datum'])!
const iratszamHeader = findHeader(kassza.headers, ['Iratszám'])!
const irattipusHeader = findHeader(kassza.headers, ['Irattip.', 'Irattípus'])!
const nevHeader = findHeader(kassza.headers, ['Név'])!
const bevOsszegHeader = findHeader(kassza.headers, ['Bev. - Összeg'])!
const bevCelHeader = findHeader(kassza.headers, ['Bevétel - Költ.vet. név', ' Bevétel - Költ.vet. név'])!
const kiaOsszegHeader = findHeader(kassza.headers, ['Kiad. - Összeg'])!
const kiaCelHeader = findHeader(kassza.headers, ['Kiadás - költ.vet. név', ' Kiadás - költ.vet. név'])!
const megjHeader = findHeader(kassza.headers, ['Megjegyzés'])!
const magyHeader = findHeader(kassza.headers, ['Magyarázat'])
const kodHeader = findHeader(kassza.headers, ['szám', 'Költségvetési szám'])!

// 1. Dátum-örökítés diagnosztika
console.log('═══ 1. DÁTUM-ÖRÖKÍTÉS ═══')
let datumHianyosCount = 0
let lastDatum: string | null = null
let totalDataSor = 0
const datumHianyosKulonbozo: string[] = []
for (let i = 0; i < kassza.rows.length; i++) {
  const row = kassza.rows[i]
  const datum = row[datumHeader] ? String(row[datumHeader]) : ''
  const nev = row[nevHeader]
  if (!nev) continue
  totalDataSor++
  if (!datum) {
    datumHianyosCount++
    if (datumHianyosCount <= 5) datumHianyosKulonbozo.push(`Sor ${i + 1}: nev=${nev}, dátum hiány`)
  } else {
    lastDatum = datum
  }
}
console.log(`  Sorok dátum nélkül (név mellett): ${datumHianyosCount} / ${totalDataSor}`)
console.log(`  Példák:`)
datumHianyosKulonbozo.forEach((p) => console.log(`    ${p}`))

// 9. Költségvetési kódok (400.xx külön)
console.log('\n═══ 9. KÖLTSÉGVETÉSI KÓDOK ═══')
const kodCounts = new Map<string, number>()
const kod400Sample: string[] = []
for (const row of kassza.rows) {
  const raw = row[kodHeader]
  if (raw === null || raw === undefined || raw === '') continue
  const norm = normalizeBudgetCode(String(raw))
  if (!norm) continue
  kodCounts.set(norm, (kodCounts.get(norm) || 0) + 1)
  if (norm.startsWith('400') && kod400Sample.length < 8) {
    const nev = row[nevHeader]
    const bev = row[bevOsszegHeader]
    const kia = row[kiaOsszegHeader]
    const bevCel = row[bevCelHeader]
    const kiaCel = row[kiaCelHeader]
    kod400Sample.push(`  ${norm}: nev="${nev}" bev=${bev} bevCel="${bevCel}" kia=${kia} kiaCel="${kiaCel}"`)
  }
}
const sortedKodok = [...kodCounts.entries()].sort((a, b) => b[1] - a[1])
console.log(`  Összes egyedi kód: ${sortedKodok.length}`)
console.log(`  Top 15 kód:`)
sortedKodok.slice(0, 15).forEach(([k, c]) => console.log(`    ${k}: ${c} sor`))
console.log(`  400.xx mintái:`)
kod400Sample.forEach((s) => console.log(s))

// 10. Személy-azonosítás: ambiguous esetek (azonos név, különböző utca)
console.log('\n═══ 10. SZEMÉLY-AZONOSÍTÁS — DONOR-STRING ELEMZÉS ═══')
const donorByNameKey = new Map<string, Set<string>>() // "csaladnev k_nev" → set utcacím
const donorRawSet = new Set<string>()
let companyCount = 0
let unparsedCount = 0
for (const row of kassza.rows) {
  const donor = row[nevHeader]
  if (!donor || typeof donor !== 'string') continue
  donorRawSet.add(donor.trim())
  const parsed = parseDonorString(donor)
  if (parsed.isCompany) {
    companyCount++
    continue
  }
  const familyName = parsed.csaladnev || parsed.husbandFamilyName
  const givenName = parsed.k_nev
  if (!familyName || !givenName) {
    unparsedCount++
    continue
  }
  const nameKey = `${familyName.toLowerCase()} ${givenName.toLowerCase()}`
  const street = parsed.street ? `${parsed.street} ${parsed.houseNumber || ''}`.trim() : ''
  if (!donorByNameKey.has(nameKey)) donorByNameKey.set(nameKey, new Set())
  donorByNameKey.get(nameKey)!.add(street)
}
console.log(`  Egyedi donor-string-ek: ${donorRawSet.size}`)
console.log(`  Cégek: ${companyCount} (sorszám)`)
console.log(`  Nem-parse-olható: ${unparsedCount} (sorszám)`)
console.log(`  Egyedi név-kulcsok: ${donorByNameKey.size}`)

// Ambiguous: ugyanaz a név, ≥2 különböző utca
const ambiguousNames: Array<[string, string[]]> = []
for (const [nameKey, streets] of donorByNameKey) {
  if (streets.size >= 2) {
    ambiguousNames.push([nameKey, [...streets]])
  }
}
console.log(`  Több utca alatt ugyanaz a név: ${ambiguousNames.length}`)
console.log(`  Példák:`)
ambiguousNames.slice(0, 10).forEach(([n, ss]) => {
  console.log(`    ${n}: [${ss.join(' / ')}]`)
})

// Klasszifikáció
console.log('\n═══ KLASSZIFIKÁCIÓ (jelenlegi) ═══')
let income = 0, expense = 0, intIn = 0, intOut = 0, skip = 0
const skipReasons: Record<string, number> = {}
for (const row of kassza.rows) {
  const record = {
    _donor_string: row[nevHeader] || null,
    _bev_osszeg: row[bevOsszegHeader],
    _bev_cel_nev: row[bevCelHeader] || null,
    _kia_osszeg: row[kiaOsszegHeader],
    _kia_cel_nev: row[kiaCelHeader] || null,
    _szamadasicel_kod: row[kodHeader] || null,
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
for (const [r, c] of Object.entries(skipReasons)) {
  console.log(`    ${r}: ${c}`)
}
