#!/usr/bin/env tsx
/**
 * Pénzügyi import helper-ek smoke-test runnere.
 *
 * Futtatás:
 *   cd apps/web && npx tsx scripts/test-finance-import-helpers.ts
 *
 * Mit ellenőriz:
 *   1. detectCompany — 12+ valós minta (cég/intézmény, magánszemély)
 *   2. parseDonorString — 15+ valós minta a Kassza-ból
 *   3. splitKasszaRow — szintetikus sorokkal
 *   4. normalizeBudgetCode — kódformátumok
 *
 * NE használj abszolút @/-prefixű import-ot — a runner közvetlenül a forrás-
 * fájlokra mutat (csak a típusokat veszi át, runtime-on nem importálja a
 * Next.js context-et).
 *
 * 2026-05-02 (Fázis 2): első verzió.
 */

import { detectCompany } from '../components/finance/finance-import/helpers/company-detector'
import { parseDonorString } from '../components/finance/finance-import/helpers/donor-string-parser'
import { splitKasszaRow } from '../components/finance/finance-import/helpers/kassza-row-classifier'
import { normalizeBudgetCode } from '../components/finance/finance-import/helpers/budget-code-resolver'

let passCount = 0
let failCount = 0

function expect<T>(label: string, actual: T, expected: T): void {
  const actualStr = JSON.stringify(actual)
  const expectedStr = JSON.stringify(expected)
  if (actualStr === expectedStr) {
    passCount++
    console.log(`  ✅ ${label}`)
  } else {
    failCount++
    console.log(`  ❌ ${label}`)
    console.log(`     Várt:  ${expectedStr}`)
    console.log(`     Kapott: ${actualStr}`)
  }
}

function expectTrue(label: string, actual: boolean): void {
  if (actual) {
    passCount++
    console.log(`  ✅ ${label}`)
  } else {
    failCount++
    console.log(`  ❌ ${label}`)
  }
}

// ════════════════════════════════════════════════════════════════════════
// 1. detectCompany
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 1. detectCompany ===\n')

const companyCases: Array<[string, boolean]> = [
  // Cégek (várt: true)
  ['INTERNATIONAL PAPER BUSINESS SRL', true],
  ['ARLERO DIGITAL PRESS SRL', true],
  ['S.C. LEROY MERLIN ROMANIA SRL', true],
  ['CN POSTA ROMANIA SA', true],
  ['Kis Z.Zoltan PFA', true],
  ['FUNDATIA KOEN', true],
  ['Parohia Reformata Borosneu Mare', true],
  ['DEPUNERE NUMERAR', true],
  ['Depunere numerar', true],
  ['Referinta 250108S744931084', true],
  ['ATCT', true],
  ['ATM', true],

  // Magánszemélyek (várt: false)
  ['Beder Győzőné Elvira - Főút 27', false],
  ['Szőcs Endre - Parókia 214', false],
  ['Tamás Tibor - Mező 73', false],
  ['Bajkó Szende', false],
  ['Mihailescu Rozalia', false],
  ['Nagy Sándor és cs.', false],
]

for (const [name, expected] of companyCases) {
  expect(`"${name}" → ${expected}`, detectCompany(name), expected)
}

// ════════════════════════════════════════════════════════════════════════
// 2. parseDonorString
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 2. parseDonorString ===\n')

// Egyszerű férfinév + cím
{
  const r = parseDonorString('Szőcs Endre - Parókia 214')
  expect('Szőcs Endre — isCompany', r.isCompany, false)
  expect('Szőcs Endre — csaladnev', r.csaladnev, 'Szőcs')
  expect('Szőcs Endre — k_nev', r.k_nev, 'Endre')
  expect('Szőcs Endre — street', r.street, 'Parókia')
  expect('Szőcs Endre — houseNumber', r.houseNumber, '214')
  expect('Szőcs Endre — confidence', r.parseConfidence, 'high')
}

// Női férjes-név (Beder Győzőné Elvira)
{
  const r = parseDonorString('Beder Győzőné Elvira - Főút 27')
  expect('Beder Győzőné Elvira — csaladnev', r.csaladnev, null)
  expect('Beder Győzőné Elvira — husbandFamilyName', r.husbandFamilyName, 'Beder')
  expect('Beder Győzőné Elvira — husbandName', r.husbandName, 'Beder Győzőné')
  expect('Beder Győzőné Elvira — k_nev', r.k_nev, 'Elvira')
  expect('Beder Győzőné Elvira — street', r.street, 'Főút')
  expect('Beder Győzőné Elvira — houseNumber', r.houseNumber, '27')
}

// Özvegy + női férjes-név
{
  const r = parseDonorString('Özv. Beder Árpádné Gizella - Főút 85')
  expect('Özv. Beder Árpádné Gizella — prefix', r.prefix, 'Özv.')
  expect('Özv. Beder Árpádné Gizella — husbandFamilyName', r.husbandFamilyName, 'Beder')
  expect('Özv. Beder Árpádné Gizella — husbandName', r.husbandName, 'Beder Árpádné')
  expect('Özv. Beder Árpádné Gizella — k_nev', r.k_nev, 'Gizella')
}

// Lánykori név is jelölve
{
  const r = parseDonorString('Özv. Beder Béláné Finta Vilma - Horvátok 150')
  expect('Béláné Finta Vilma — husbandFamilyName', r.husbandFamilyName, 'Beder')
  expect('Béláné Finta Vilma — husbandName', r.husbandName, 'Beder Béláné')
  expect('Béláné Finta Vilma — szcs_nev (lánykori)', r.szcs_nev, 'Finta')
  expect('Béláné Finta Vilma — k_nev', r.k_nev, 'Vilma')
}

// Elvált prefix
{
  const r = parseDonorString('Elv. Finta Gábor - Horvátok 152')
  expect('Elv. Finta Gábor — prefix', r.prefix, 'Elv.')
  expect('Elv. Finta Gábor — csaladnev', r.csaladnev, 'Finta')
  expect('Elv. Finta Gábor — k_nev', r.k_nev, 'Gábor')
}

// Cím nélküli magánszemély
{
  const r = parseDonorString('Bajkó Szende')
  expect('Bajkó Szende — csaladnev', r.csaladnev, 'Bajkó')
  expect('Bajkó Szende — k_nev', r.k_nev, 'Szende')
  expect('Bajkó Szende — street', r.street, null)
  expect('Bajkó Szende — confidence', r.parseConfidence, 'medium')
}

// "? 0" mint cím
{
  const r = parseDonorString('Bartha Józsefné Irén - ? 0')
  expect('Bartha Józsefné — husbandFamilyName', r.husbandFamilyName, 'Bartha')
  expect('Bartha Józsefné — husbandName', r.husbandName, 'Bartha Józsefné')
  expect('Bartha Józsefné — k_nev', r.k_nev, 'Irén')
  expect('Bartha Józsefné — street', r.street, '?')
  expect('Bartha Józsefné — houseNumber', r.houseNumber, '0')
  expect('Bartha Józsefné — confidence', r.parseConfidence, 'medium')
}

// Cég
{
  const r = parseDonorString('INTERNATIONAL PAPER BUSINESS SRL')
  expect('SRL — isCompany', r.isCompany, true)
  expect('SRL — csaladnev', r.csaladnev, null)
  expect('SRL — confidence', r.parseConfidence, 'high')
}

// Összetett keresztnév
{
  const r = parseDonorString('Bóné Sándor Barna - Templom 4')
  expect('Bóné Sándor Barna — csaladnev', r.csaladnev, 'Bóné')
  expect('Bóné Sándor Barna — k_nev', r.k_nev, 'Sándor Barna')
}

// Csak családnév-szerű
{
  const r = parseDonorString('Vándormozi')
  // "Vándormozi" — egy szó, intézmény-szerű
  // detectCompany itt false (nem CSUPA NAGYBETŰ, nincs SRL stb.)
  // → csak k_nev, low confidence
  expectTrue('Vándormozi — egyszavas, low/medium confidence', r.parseConfidence === 'low' || r.parseConfidence === 'medium')
}

// ════════════════════════════════════════════════════════════════════════
// 3. splitKasszaRow
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 3. splitKasszaRow ===\n')

// Bevétel
{
  const r = splitKasszaRow({
    _donor_string: 'Szőcs Endre - Parókia 214',
    _bev_osszeg: 130,
    _bev_cel_nev: 'Egyházfenntartói járulék',
    _szamadasicel_kod: '101.01',
  })
  expect('income — kind', r.kind, 'income')
  if (r.kind === 'income') {
    expect('income — bevOsszeg', r.bevOsszeg, 130)
  }
}

// Kiadás
{
  const r = splitKasszaRow({
    _donor_string: 'INTERNATIONAL PAPER BUSINESS SRL',
    _kia_osszeg: 181.65,
    _kia_cel_nev: 'Irodaszerek, nyomtatványok',
    _szamadasicel_kod: '201.08',
  })
  expect('expense — kind', r.kind, 'expense')
  if (r.kind === 'expense') {
    expect('expense — kiaOsszeg', r.kiaOsszeg, 181.65)
  }
}

// Belső mozgás (kassza → bank)
{
  const r = splitKasszaRow({
    _donor_string: 'Referinta 250108S744931084',
    _kia_osszeg: 7680,
    _kia_cel_nev: 'Készpénzletétel a(z) A számlára',
    _szamadasicel_kod: '400.01',
  })
  expect('internal-out — kind', r.kind, 'internal-transfer-out')
}

// Belső mozgás (bank → kassza)
{
  const r = splitKasszaRow({
    _donor_string: 'Készpénzfelvétel',
    _bev_osszeg: 5000,
    _bev_cel_nev: 'Készpénzfelvétel a(z) A számláról',
    _szamadasicel_kod: '400.01',
  })
  expect('internal-in — kind', r.kind, 'internal-transfer-in')
}

// Üres sor
{
  const r = splitKasszaRow({
    _donor_string: null,
    _bev_osszeg: null,
    _kia_osszeg: null,
  })
  expect('skip — kind', r.kind, 'skip')
  if (r.kind === 'skip') {
    expect('skip — reason', r.reason, 'üres sor')
  }
}

// Tájékoztató sor
{
  const r = splitKasszaRow({
    _donor_string: 'Előző évi készpénzegyenleg:',
    _bev_osszeg: 12519.86,
    _bev_cel_nev: null,
  })
  expect('info-line — kind', r.kind, 'skip')
}

// Tizedesvesszős kódot is felismeri (400,01 vs 400.01)
{
  const r = splitKasszaRow({
    _donor_string: 'Banki művelet',
    _kia_osszeg: 1000,
    _kia_cel_nev: 'Egyéb',
    _szamadasicel_kod: '400,01',
  })
  expect('internal-out (vesszős kód) — kind', r.kind, 'internal-transfer-out')
}

// ════════════════════════════════════════════════════════════════════════
// 4. normalizeBudgetCode
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 4. normalizeBudgetCode ===\n')

expect('normalize 102,14', normalizeBudgetCode('102,14'), '102.14')
expect('normalize 101.01', normalizeBudgetCode('101.01'), '101.01')
expect('normalize 400_01', normalizeBudgetCode('400_01'), '400.01')
expect('normalize üres', normalizeBudgetCode(''), null)
expect('normalize abc', normalizeBudgetCode('abc'), null)
expect('normalize null', normalizeBudgetCode(null), null)
expect('normalize szám', normalizeBudgetCode(101), '101')

// ════════════════════════════════════════════════════════════════════════
// Összesítés
// ════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════')
console.log(`  Tesztek: ${passCount + failCount} | ✅ ${passCount} sikeres | ❌ ${failCount} sikertelen`)
console.log('════════════════════════════════════════════════════════════\n')

if (failCount > 0) {
  process.exit(1)
}
