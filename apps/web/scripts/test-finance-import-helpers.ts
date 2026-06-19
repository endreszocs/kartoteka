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
import { lookupPersonByQuadAttempt, type PersonLookupMaps } from '../lib/import/lookup-resolver'
import { expandNickname } from '../lib/import/hungarian-nicknames'
import { shouldResolvePerson, personScope } from '../lib/import/person-scope-config'
import { applyXmlOverlay } from '../components/finance/finance-import/helpers/xml-overlay'
import { detectKasszaColumns } from '../components/finance/finance-import/helpers/kassza-column-mapping'
import { dateToLocalIso, toLocalIsoDate } from '../lib/import/date-utils'
import { normalizeForSearch, tokenize, personSearchScore } from '../lib/import/person-search-match'
import { scanLedgerBalances, isLedgerSheetName } from '../components/finance/finance-import/helpers/kassza-sheet-parser'
import type { ClassifiedKasszaRow } from '../app/(dashboard)/penzugy/finance-import-types'
import type { XmlBevetelekRow } from '../components/finance/finance-import/egyhfenntartas/helpers/xml-bevetelek-parser'

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

// 300.xx kód is belső mozgás (konzisztens a budget-code-resolver-rel)
{
  const r = splitKasszaRow({
    _donor_string: 'Bank művelet',
    _bev_osszeg: 2000,
    _bev_cel_nev: 'Egyéb',
    _szamadasicel_kod: '300.01',
  })
  expect('internal-in (300.01 kód) — kind', r.kind, 'internal-transfer-in')
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
// 5. lookupPersonByQuadAttempt — párosító korrektség (P2-2 / P2-5 / P2-6)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 5. lookupPersonByQuadAttempt ===\n')

interface TestPerson {
  id: string
  cs: string // normalizált (kisbetűs, ékezet nélküli) családnév
  k: string // normalizált keresztnév (egyszavas)
  flag: 'M' | 'F' | '?'
  street?: string | null // nyers DB utcanév (a lookup normalizál)
  house?: string | null
}

/**
 * Szintetikus PersonLookupMaps a `buildAllPersonsLookupMap` kulcs-logikáját
 * utánozva (csak a teszthez szükséges indexek). Kisbetűs, ékezet nélküli,
 * egyszavas nevekkel a normalizálás identitás → a kulcsok kiszámíthatók.
 */
function makeMaps(persons: TestPerson[]): PersonLookupMaps {
  const byTriple = new Map<string, string[]>()
  const byKnameFerfi = new Map<string, string[]>()
  const byId: PersonLookupMaps['byId'] = new Map()
  const addressById = new Map<string, { streetName: string | null; houseNumber: string | null }>()
  const push = (m: Map<string, string[]>, key: string, id: string) => {
    const arr = m.get(key) || []
    if (!arr.includes(id)) arr.push(id)
    m.set(key, arr)
  }
  for (const p of persons) {
    byId.set(p.id, {
      id: p.id, cnp: null, csaladnev: p.cs, k_nev: p.k,
      sz_datum: null, ferfi: p.flag === 'M', szcs_nev: null,
    })
    addressById.set(p.id, { streetName: p.street ?? null, houseNumber: p.house ?? null })
    // A valós builder a knevVariants-on át becenév-alakokkal is indexel — itt is.
    for (const kv of expandNickname(p.k)) {
      // byTriple: a saját flag ALATT és `|?` alatt is
      push(byTriple, `${p.cs}|${kv}|${p.flag}`, p.id)
      push(byTriple, `${p.cs}|${kv}|?`, p.id)
      // byKnameFerfi: CSAK a saját flag alatt
      push(byKnameFerfi, `${kv}|${p.flag}`, p.id)
    }
  }
  return {
    byCnp: new Map(), byName: new Map(), byQuad: new Map(),
    byTriple, byMaiden: new Map(), byKnameFerfi, byId, addressById,
  }
}

function describe(r: { id: string } | { candidates: string[] } | null): string {
  if (r === null) return 'null'
  if ('id' in r) return `id:${r.id}`
  return `candidates:${[...r.candidates].sort().join(',')}`
}

// P2-5: utca-normalizálás — "Főút" (donor) == "Fő út" (DB) → cím-alapú feloldás
{
  const maps = makeMaps([
    { id: '1', cs: 'kovacs', k: 'janos', flag: 'M', street: 'Fő út', house: '10' },
    { id: '2', cs: 'kovacs', k: 'janos', flag: 'M', street: 'Petőfi', house: '5' },
  ])
  const r = lookupPersonByQuadAttempt('Kovacs', 'Janos', null, null, 'M', maps, 'Főút', '10')
  expect('P2-5 utca "Főút"=="Fő út" → id:1', describe(r), 'id:1')
}

// P2-2: utolsó-esély (keresztnév-only) NEM kollapszálhat más vezetéknévre cím alapján
{
  const maps = makeMaps([
    { id: '3', cs: 'nagy', k: 'zoltan', flag: 'M', street: 'Fő út', house: '10' },
    { id: '4', cs: 'kiss', k: 'zoltan', flag: 'M', street: 'Petőfi', house: '5' },
  ])
  // "Szabo" vezetéknév senkire nem illik → 5. szint: 2 különböző vezetéknevű Zoltán
  const r = lookupPersonByQuadAttempt('Szabo', 'Zoltan', null, null, 'M', maps, 'Főút', '10')
  expect('P2-2 nem kollapszál más vezetéknévre → candidates:3,4', describe(r), 'candidates:3,4')
}

// P2-2: utolsó-esély EGYÉRTELMŰ esetben továbbra is {id}
{
  const maps = makeMaps([{ id: '5', cs: 'feher', k: 'bela', flag: 'M', street: 'X', house: '1' }])
  const r = lookupPersonByQuadAttempt('Szabo', 'Bela', null, null, 'M', maps)
  expect('P2-2 egyértelmű keresztnév → id:5', describe(r), 'id:5')
}

// P2-6: nem-agnosztikus fallback — a DB-ben hiányzó nemű (flag '?') tag is megtalálható
{
  const maps = makeMaps([{ id: '6', cs: 'torok', k: 'sandor', flag: '?', street: 'X', house: '1' }])
  // donor ferfi='M', de a tag flag='?' → csak a `|?` fallback találja meg
  const r = lookupPersonByQuadAttempt('Valaki', 'Sandor', null, null, 'M', maps)
  expect('P2-6 ferfi=? tag fallback → id:6', describe(r), 'id:6')
}

// Regresszió: pontos triple (családnév+keresztnév+nem) továbbra is egyértelmű
{
  const maps = makeMaps([{ id: '7', cs: 'toth', k: 'eva', flag: 'F' }])
  const r = lookupPersonByQuadAttempt('Tóth', 'Éva', null, null, 'F', maps)
  expect('Regresszió: triple egyezés → id:7', describe(r), 'id:7')
}

// P2-1: becenév — "Pista" befizető → "István" tag
{
  const maps = makeMaps([{ id: '8', cs: 'kovacs', k: 'istvan', flag: 'M', street: 'X', house: '1' }])
  const r = lookupPersonByQuadAttempt('Kovács', 'Pista', null, null, 'M', maps)
  expect('P2-1 becenév Pista→István → id:8', describe(r), 'id:8')
}

// P2-1: becenév fordítva — "Kati" tag, "Katalin" befizető
{
  const maps = makeMaps([{ id: '9', cs: 'nagy', k: 'kati', flag: 'F', street: 'X', house: '1' }])
  const r = lookupPersonByQuadAttempt('Nagy', 'Katalin', null, null, 'F', maps)
  expect('P2-1 becenév Katalin→Kati → id:9', describe(r), 'id:9')
}

// CÍM-ŐR: egyetlen név-jelölt, de ELTÉRŐ utca → ne auto-párosíts (a valós „Beder Timea -
// Asztalos 160" vs nyilvántartásbeli „Beder ... Timea - Templom 235" hiba).
{
  const maps = makeMaps([{ id: '970', cs: 'beder', k: 'timea', flag: 'F', street: 'Templom', house: '235' }])
  const r = lookupPersonByQuadAttempt('Beder', 'Timea', null, null, 'F', maps, 'Asztalos', '160')
  expect('cím-őr: eltérő utca → candidates (nem auto)', describe(r), 'candidates:970')
}
// Azonos utca → marad biztos {id}
{
  const maps = makeMaps([{ id: '971', cs: 'beder', k: 'timea', flag: 'F', street: 'Templom', house: '235' }])
  const r = lookupPersonByQuadAttempt('Beder', 'Timea', null, null, 'F', maps, 'Templom', '235')
  expect('cím-őr: azonos utca → id:971', describe(r), 'id:971')
}
// A jelöltnek NINCS rögzített címe → nem tudunk dönteni → marad {id} (nem túl szigorú)
{
  const maps = makeMaps([{ id: '972', cs: 'beder', k: 'timea', flag: 'F' }])
  const r = lookupPersonByQuadAttempt('Beder', 'Timea', null, null, 'F', maps, 'Asztalos', '160')
  expect('cím-őr: jelöltnek nincs címe → id:972', describe(r), 'id:972')
}

// P2-1 fuzzy: elgépelt vezeték- ÉS keresztnév → felülvizsgálati jelölt (SOHA nem auto {id})
{
  const maps = makeMaps([{ id: '10', cs: 'szilagyi', k: 'andras', flag: 'M', street: 'X', house: '1' }])
  const r = lookupPersonByQuadAttempt('Szilagi', 'Andrs', null, null, 'M', maps)
  expect('P2-1 fuzzy elgépelés → candidates:10', describe(r), 'candidates:10')
}

// Fuzzy: teljesen idegen név → nincs jelölt (null)
{
  const maps = makeMaps([{ id: '11', cs: 'szilagyi', k: 'andras', flag: 'M' }])
  const r = lookupPersonByQuadAttempt('Habakuk', 'Zorzon', null, null, 'M', maps)
  expect('Fuzzy: idegen név → null', describe(r), 'null')
}

// ════════════════════════════════════════════════════════════════════════
// 6. expandNickname (becenév-szótár)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 6. expandNickname ===\n')

expectTrue('pista → tartalmaz istvan', expandNickname('pista').includes('istvan'))
expectTrue('istvan → tartalmaz pista (kétirányú)', expandNickname('istvan').includes('pista'))
expectTrue('katalin → tartalmaz kati', expandNickname('katalin').includes('kati'))
expectTrue('juli → tartalmaz julianna (több klaszter unió)', expandNickname('juli').includes('julianna'))
expect('ismeretlen név önmaga', expandNickname('xyzqw'), ['xyzqw'])

// ════════════════════════════════════════════════════════════════════════
// 7. person-scope-config (mely kódok kapnak személy-párosítást)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 7. person-scope-config ===\n')

expectTrue('101.01 egyházf. → személy', shouldResolvePerson('101.01'))
expectTrue('101,01 (vesszős) → személy', shouldResolvePerson('101,01'))
expectTrue('101.04 adományok → személy', shouldResolvePerson('101.04'))
expectTrue('202.08 segély → személy', shouldResolvePerson('202.08'))
expectTrue('101.03 perselypénz → NEM', !shouldResolvePerson('101.03'))
expectTrue('103.09 szponzor → NEM', !shouldResolvePerson('103.09'))
expectTrue('201.01 fizetés (kiadás) → NEM', !shouldResolvePerson('201.01'))
expectTrue('400.01 belső mozgás → NEM', !shouldResolvePerson('400.01'))
expect('101.01 scope = required', personScope('101.01'), 'required')
expect('101.03 scope = none', personScope('101.03'), 'none')

// ════════════════════════════════════════════════════════════════════════
// 8. xml-overlay (Befizetett év + hivatalos iratszám átvétele)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 8. xml-overlay ===\n')

{
  const income: ClassifiedKasszaRow[] = [
    { rowIndex: 5, kind: 'income', amount: 85, donorString: 'Kádár Barna Zsolt - Vasút 183', iratszam: '134' },
    { rowIndex: 6, kind: 'income', amount: 130, donorString: 'Szőcs Endre - Parókia 214', iratszam: '19' },
  ]
  const mkXml = (
    rowIndex: number, rawForrasa: string, osszeg: number, nyugta: number,
    iratszam: number, fizetettev: number, datum = '2025-08-16',
  ): XmlBevetelekRow => ({
    rowIndex, rawForrasa, osszeg, datum, nyugta, iratszam,
    irattipus: 'chitanta', ksz: '101.01', fizetettev, megjegyzes: null, letrehozva: null,
  })
  const xml: XmlBevetelekRow[] = [
    mkXml(1, 'Kádár Barna Zsolt - Vasút 183', 85, 134, 115134, 2021), // arrears 2021
    // VALÓS eset (Barátosi): a 19. nyugta 2025-01-01-én kelt, a 2025-ös évre (Befizetett év=2025).
    mkXml(2, 'Szőcs Endre - Parókia 214', 130, 19, 115019, 2025, '2025-01-01'),
    mkXml(3, 'Valaki Más - Fő 1', 50, 999, 115999, 2025), // nincs xlsx-pár
  ]
  const r = applyXmlOverlay(income, xml)
  expect('overlay matched = 2', r.matchedCount, 2)
  expect('row5 fizetettev = 2021 (arrears)', r.byRowIndex.get(5)?.fizetettev, 2021)
  expect('row5 hivatalos iratszám = 115134', r.byRowIndex.get(5)?.iratszamHivatalos, '115134')
  expect('row6 fizetettev = 2025 (jan.1 dátum, 2025 Befizetett év)', r.byRowIndex.get(6)?.fizetettev, 2025)
  expect('onlyXml = 1 (Valaki Más)', r.onlyXml.length, 1)

  // KÖNYVELÉSI ÉV szabály (review-step accYear): a Befizetett év a mérvadó, nem a dátum.
  const accYear = (p: { fizetettevOverride?: number | null; datum?: string | null }): string =>
    p.fizetettevOverride != null ? String(p.fizetettevOverride) : (p.datum || '').slice(0, 4)
  expect('accYear: dec.31 dátum + 2025 override → 2025', accYear({ datum: '2024-12-31', fizetettevOverride: 2025 }), '2025')
  expect('accYear: dec.31 dátum, nincs override → 2024 (dátum éve)', accYear({ datum: '2024-12-31', fizetettevOverride: null }), '2024')
  expect('accYear: 2024 arrears override → 2024', accYear({ datum: '2025-01-07', fizetettevOverride: 2024 }), '2024')
}

// ════════════════════════════════════════════════════════════════════════
// 9. detectKasszaColumns (oszlop-egyeztetés — fejléc-alapú felismerés)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 9. detectKasszaColumns ===\n')

{
  // A hivatalos EREK Kassza fejlécsora (sor4)
  const headers = [
    'Dátum', 'Iratszám', 'Irattip.', 'Név', 'Bev. - Összeg',
    ' Bevétel - Költ.vet. név', 'Kiad. - Összeg', ' Kiadás - költ.vet. név',
    'Megjegyzés', 'Magyarázat', 'szám',
  ]
  const d = detectKasszaColumns(headers)
  expect('hivatalos fejléc: 0 hiányzó kötelező', d.missingRequired.length, 0)
  expect('datum → Dátum', d.mapping.datum, 'Dátum')
  expect('nev → Név', d.mapping.nev, 'Név')
  expect('bevOsszeg → Bev. - Összeg', d.mapping.bevOsszeg, 'Bev. - Összeg')
  expect('kiaOsszeg → Kiad. - Összeg', d.mapping.kiaOsszeg, 'Kiad. - Összeg')
  expect('kod → szám', d.mapping.kod, 'szám')
  expect('bevCel → (szóközös) Bevétel - Költ.vet. név', d.mapping.bevCel, ' Bevétel - Költ.vet. név')
}

{
  // Hibás / idegen fejléc — a kötelező mezők hiányoznak (figyelmeztetés)
  const d = detectKasszaColumns(['A', 'B', 'C', 'D'])
  expectTrue('hibás fejléc → ≥4 hiányzó kötelező', d.missingRequired.length >= 4)
  expect('hibás fejléc: datum nincs', d.mapping.datum, null)
}

// ════════════════════════════════════════════════════════════════════════
// 10. Dátum-olvasás időzóna-biztossága (SheetJS cellDates artifact)
// A SheetJS pozitív időzónában a dátum-serialt az előző nap 23:59:xx-ére csúsztatja.
// A dateToLocalIso a legközelebbi helyi naphoz kerekít → minden TZ-ben helyes.
// (A teszt lokálisan konstruált Date-eket használ → időzóna-független a logika.)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 10. Dátum időzóna-biztosság ===\n')

{
  // A SheetJS artifact: 2025-01-01 dátum-serial → Date a 2024-12-31 23:59:36-on
  expect('artifact dec.31 23:59:36 → 2025-01-01', dateToLocalIso(new Date(2024, 11, 31, 23, 59, 36)), '2025-01-01')
  expect('helyes éjfél marad → 2025-01-01', dateToLocalIso(new Date(2025, 0, 1, 0, 0, 0)), '2025-01-01')
  expect('év-vég artifact → 2026-01-01', dateToLocalIso(new Date(2025, 11, 31, 23, 59, 36)), '2026-01-01')
  expect('hó-közi artifact (jan.7 23:59) → 2025-01-08', dateToLocalIso(new Date(2025, 0, 7, 23, 59, 36)), '2025-01-08')
  expect('mid-éves helyes éjfél marad', dateToLocalIso(new Date(2025, 5, 15, 0, 0, 0)), '2025-06-15')
  // Excel serial (45658 = 2025-01-01) — UTC-epoch ág, mindig helyes
  expect('serial 45658 → 2025-01-01', toLocalIsoDate(45658), '2025-01-01')
  expect('serial 46022 → 2025-12-31', toLocalIsoDate(46022), '2025-12-31')
  // string formátumok
  expect('string 2025/01/01 → 2025-01-01', toLocalIsoDate('2025/01/01'), '2025-01-01')
  expect('string 2025-01-01 → 2025-01-01', toLocalIsoDate('2025-01-01'), '2025-01-01')
}

// ════════════════════════════════════════════════════════════════════════
// 11. Kézi tag-kereső illesztés (ékezet- és pozíció-független, lánykori/férjezett/cím)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 11. Kézi tag-kereső illesztés ===\n')

{
  // Ékezet-csupaszítás
  expect('normalizeForSearch Tímea → timea', normalizeForSearch('Tímea'), 'timea')
  expect('normalizeForSearch Kővári → kovari', normalizeForSearch('Kővári'), 'kovari')
  expect('tokenize "Beder Csilla Timea"', tokenize('Beder  Csilla Timea'), ['beder', 'csilla', 'timea'])

  // KULCS-ESET: a lány férjhez ment — Beder Csilla Tímea → Kovács Csilla Tímea (szül. Beder).
  // A régi (lánykori) néven, ékezet nélkül beírt keresés is megtalálja.
  const kovacs = {
    nameParts: ['Kovács', 'Csilla Tímea', 'Beder', null], // csaladnev, k_nev, szcs_nev, ferjk_nev
    addressParts: ['Templom', '235', 'tanár'],
  }
  expectTrue('"Beder Csilla Timea" (ékezet nélkül) → találat a lánykori néven', personSearchScore(kovacs, tokenize('Beder Csilla Timea')) !== null)
  expectTrue('csak keresztnév "csilla" → találat', personSearchScore(kovacs, tokenize('csilla')) !== null)
  expectTrue('csak lánykori "beder" → találat', personSearchScore(kovacs, tokenize('beder')) !== null)
  expectTrue('férjezett vezetéknév "kovacs" → találat', personSearchScore(kovacs, tokenize('kovacs')) !== null)
  expectTrue('ékezetes "tímea" → találat', personSearchScore(kovacs, tokenize('tímea')) !== null)
  expectTrue('lakcím "templom 235" → találat', personSearchScore(kovacs, tokenize('templom 235')) !== null)
  expectTrue('foglalkozás "tanár" → találat', personSearchScore(kovacs, tokenize('tanár')) !== null)
  expect('nincs egyezés "xyz" → null', personSearchScore(kovacs, tokenize('xyz')), null)
  expect('részleges "beder szabolcs" (szabolcs nincs) → null', personSearchScore(kovacs, tokenize('beder szabolcs')), null)

  // A névtalálat többet ér a cím-találatnál (rendezéshez)
  const sName = personSearchScore(kovacs, tokenize('beder')) ?? 0
  const sAddr = personSearchScore(kovacs, tokenize('templom')) ?? 0
  expectTrue('névtalálat pontszáma ≥ cím-találaté', sName >= sAddr)
}

// ════════════════════════════════════════════════════════════════════════
// 12. scanLedgerBalances — nyitó + év végi egyenleg kiolvasása a lap tetejéről
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 12. scanLedgerBalances ===\n')

{
  // A valós EREK Kassza-lap tetejének szerkezete (header az 5. sorban = index 4):
  const aoa: unknown[][] = [
    [null, null, 45658, 'Barátosi Református Egyházközség', null, null, 'Napi bevétel: ', 0, null, 46022, null, null, null, 'A másolás...'],
    [null, null, 46022, null, null, null, 'Napi kiadás: ', 1500, '', null, null, null, null, 'műveletek...'],
    [null, null, 46022, 'Készpénz könyvelése', null, null, 'Egyenleg: ', 6463.74],
    [null, null, null, ''],
    [null, null, null, 'Dátum', 'Iratszám', 'Irattip.', 'Név', 'Bev. - Összeg'], // header (index 4)
    ['q', null, null, null, null, null, 'Előző évi készpénzegyenleg: ', 12519.86],
    ['q', 45658, 45658, '19', 'Chit.', 'Szőcs Endre - Parókia 214', 130],
  ]
  const b = scanLedgerBalances(aoa, 4)
  expect('scanLedgerBalances záró (Egyenleg, fejléc fölött) = 6463.74', b.closingBalance, 6463.74)
  expect('scanLedgerBalances nyitó (Előző évi, fejléc alatt) = 12519.86', b.openingBalance, 12519.86)

  // Hitelesség-kontroll: nyitó + Σbev − Σkia = záró  (a valós EREK számokkal)
  const calc = Math.round((12519.86 + 106747.0 - 112803.12) * 100) / 100
  expect('hitelesség: nyitó + Σbev − Σkia = xlsx záró', calc, 6463.74)

  // Bank-lap (A): „Előző évi egyenleg:" (nem „készpénz") is felismerhető
  const aoaBank: unknown[][] = [
    [null, null, 45658, 'Barátosi', null, null, 'Napi bevétel: ', 0],
    [null, null, 46022, null, null, null, 'Napi kiadás: ', 93214.3],
    [null, null, 46022, 'RON', null, null, 'Egyenleg: ', 5136.78],
    [null, null, null, ''],
    [null, null, null, 'Dátum', 'Iratszám'],
    [null, null, null, null, null, null, 'Előző évi egyenleg: ', 107771.39],
  ]
  const bb = scanLedgerBalances(aoaBank, 4)
  expect('bank-lap záró = 5136.78', bb.closingBalance, 5136.78)
  expect('bank-lap nyitó = 107771.39', bb.openingBalance, 107771.39)

  // isLedgerSheetName: Kassza + A–F főkönyvi lapok, a többi nem
  expectTrue('isLedgerSheetName(Kassza)', isLedgerSheetName('Kassza'))
  expectTrue('isLedgerSheetName(A)', isLedgerSheetName('A'))
  expectTrue('isLedgerSheetName(F)', isLedgerSheetName('f'))
  expect('isLedgerSheetName(Monetar) = false', isLedgerSheetName('Monetar'), false)
  expect('isLedgerSheetName(Koltsegvetes) = false', isLedgerSheetName('Koltsegvetes'), false)
  expect('isLedgerSheetName(G) = false', isLedgerSheetName('G'), false)
}

// ════════════════════════════════════════════════════════════════════════
// Összesítés
// ════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════════════════════════')
console.log(`  Tesztek: ${passCount + failCount} | ✅ ${passCount} sikeres | ❌ ${failCount} sikertelen`)
console.log('════════════════════════════════════════════════════════════\n')

if (failCount > 0) {
  process.exit(1)
}
