/**
 * Import-motor regressziós teszt (2026-07-24, PR-6 F7.1 — D7 döntés).
 *
 * Futtatás:  npx tsx scripts/test-import-engine.ts   (az apps/web mappából)
 *
 * CÉL: a „ne törjön el idővel" tényleges biztosítéka — MINDEN import-motort
 * érintő változtatás (xlsx lib-csere, profil-szerkesztés, normalizálás)
 * UTÁN ezt le kell futtatni. Ha bármelyik eset piros, az éles import törne.
 *
 * Lefedi:
 *  1. normalizeForMatch — ékezet-lehántás + írásjel-tolerancia
 *  2. matchHeader — ékezetes ÉS ékezetlen fejlécek minden tag-profilra
 *  3. matchHeadersExplicit — a wizard kézi mappingje (preview=import garancia)
 *  4. suggestProfileForSheet — fülnév → profil javaslat
 *  5. date-utils — Excel-serial / magyar / ISO dátum-határesetek
 *  6. excel-parser — generált xlsx munkafüzet round-trip (fejléc-detektálás)
 */

import * as XLSX from 'xlsx'

import {
  normalizeForMatch,
  matchHeader,
  suggestProfileForSheet,
  PROFILE_PERSONS,
  PROFILE_FAMILY_HEADS,
  MEMBER_PROFILES,
  REGISTRY_PROFILES,
} from '../lib/import/import-profiles'
import { matchHeaders, matchHeadersExplicit } from '../lib/import/row-transformer'
import { toLocalIsoDate } from '../lib/import/date-utils'
import { parseWorkbook } from '../lib/import/excel-parser'

let pass = 0
let fail = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass += 1
  else {
    fail += 1
    console.log(`✗ ${name}\n    várt:   ${JSON.stringify(expected)}\n    kapott: ${JSON.stringify(actual)}`)
  }
}

// ── 1. normalizeForMatch ────────────────────────────────────────────────────
check('normalize: ékezet+szóköz', normalizeForMatch('Születési  dátum'), 'szuletesidatum')
check('normalize: ékezetlen azonos', normalizeForMatch('Szuletesi datum'), 'szuletesidatum')
check('normalize: pont/aláhúzás', normalizeForMatch('Csal.ád_név'), 'csaladnev')
check('normalize: román diakritika', normalizeForMatch('Târgu Mureș'), 'targumures')

// ── 2. matchHeader — ékezetes ÉS ékezetlen fejlécek ─────────────────────────
const headerCases: Array<[string, string]> = [
  ['Családnév', 'csaladnev'],
  ['Csaladnev', 'csaladnev'],
  ['Keresztnév', 'k_nev'],
  ['Keresztnev', 'k_nev'],
  ['Helység', '_helyseg_text'],
  ['Helyseg', '_helyseg_text'],
  ['Telepules', '_helyseg_text'],
  ['Utca', '_utca_text'],
  ['Házszám', 'c_szam'],
  ['Hazszam', 'c_szam'],
  ['Férfi', 'ferfi'],
  ['Ferfi', 'ferfi'],
  ['Foglalkozás', 'foglalkozas'],
  ['Vallás', 'vallas'],
  ['Telefonszám', 'telefon'],
]
for (const [header, dbColumn] of headerCases) {
  check(`matchHeader FAMILY_HEADS: "${header}"`, matchHeader(header, PROFILE_FAMILY_HEADS)?.dbColumn ?? null, dbColumn)
}
check('matchHeader PERSONS: "Apja"', matchHeader('Apja', PROFILE_PERSONS)?.dbColumn ?? null, 'apjaneve')

// A csaladok.xml TELJES fejléc-sora (D9-ben ellenőrzött 19 oszlop) — a
// family-heads profilnak a kötelezőket fel KELL ismernie:
const csaladokXmlHeaders = ['Házszám', 'Utca', 'Tömbház', 'Állapot', 'Családnév', 'SzCsaládnév', 'Keresztnév', 'Foglalkozás', 'Vallás', 'Év', 'Hó', 'Nap', 'Életkor', 'Férfi', 'Helység', 'Telefonszám', 'E-mail', 'Apja', 'Anyja']
const fhMatch = matchHeaders(csaladokXmlHeaders, PROFILE_FAMILY_HEADS)
check('csaladok.xml: nincs hiányzó kötelező', fhMatch.missingRequired, [])
check('csaladok.xml: Férfi felismerve', fhMatch.matched.has('Férfi'), true)
check('csaladok.xml: Helység felismerve', fhMatch.matched.has('Helység'), true)

// ── 3. matchHeadersExplicit — kézi mapping ──────────────────────────────────
const explicit = matchHeadersExplicit(
  ['Vezetéknev2', 'Utónév', 'Falu', 'Ucca', 'Hsz'],
  PROFILE_FAMILY_HEADS,
  { 'Vezetéknev2': 'csaladnev', 'Utónév': 'k_nev', 'Falu': '_helyseg_text', 'Ucca': '_utca_text', 'Hsz': 'c_szam' },
)
check('explicit: mind párosítva', explicit.matched.size, 5)
check('explicit: nincs hiányzó kötelező', explicit.missingRequired, [])
const explicitSkip = matchHeadersExplicit(
  ['Családnév', 'Keresztnév', 'Titkos'],
  PROFILE_FAMILY_HEADS,
  { 'Családnév': 'csaladnev', 'Keresztnév': 'k_nev', 'Titkos': null },
)
check('explicit: null=kihagyás → unmatched', explicitSkip.unmatched, ['Titkos'])

// ── 4. suggestProfileForSheet ───────────────────────────────────────────────
check('sheet-hint: "Szemelyek" (ékezetlen!) → members-profil',
  suggestProfileForSheet('Szemelyek', MEMBER_PROFILES)?.key ?? null,
  suggestProfileForSheet('Személyek', MEMBER_PROFILES)?.key ?? null)
check('sheet-hint: "Kereszteles" (ékezetlen) → baptism',
  suggestProfileForSheet('Kereszteles', REGISTRY_PROFILES)?.key ?? null,
  suggestProfileForSheet('Keresztelés', REGISTRY_PROFILES)?.key ?? null)

// ── 5. date-utils határesetek ───────────────────────────────────────────────
check('dátum: ISO passzol', toLocalIsoDate('2025-07-01'), '2025-07-01')
check('dátum: magyar pontozott', toLocalIsoDate('2025.07.01'), '2025-07-01')
check('dátum: fordított magyar', toLocalIsoDate('01.07.2025'), '2025-07-01')
// Excel-serial: 45839 = 2025-07-01 (1900-epoch, az xlsx cellDates-quirkkel együtt)
check('dátum: Excel-serial 45839', toLocalIsoDate(45839), '2025-07-01')
check('dátum: Excel-serial 25569 (1970-01-01)', toLocalIsoDate(25569), '1970-01-01')
check('dátum: üres → null', toLocalIsoDate(''), null)

// ── 6. excel-parser round-trip (generált xlsx) ──────────────────────────────
const wb = XLSX.utils.book_new()
const ws = XLSX.utils.aoa_to_sheet([
  ['Családnév', 'Keresztnév', 'Helység', 'Utca', 'Házszám', 'Év', 'Hó', 'Nap'],
  ['Kovács', 'János', 'Barátos', 'Fő utca', '12', 1965, 3, 14],
  ['Szabó', 'Mária', 'Kézdivásárhely', 'Petőfi utca', '3', 1972, 11, 2],
])
XLSX.utils.book_append_sheet(wb, ws, 'Személyek')
const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
const parsed = parseWorkbook(buffer, 'teszt.xlsx')
check('xlsx round-trip: 1 sheet', parsed.sheets.length, 1)
check('xlsx round-trip: fejlécek', parsed.sheets[0]?.headers, ['Családnév', 'Keresztnév', 'Helység', 'Utca', 'Házszám', 'Év', 'Hó', 'Nap'])
check('xlsx round-trip: 2 sor', parsed.sheets[0]?.rows.length, 2)
check('xlsx round-trip: cella', parsed.sheets[0]?.rows[0]?.['Családnév'], 'Kovács')
check('xlsx round-trip: szám-cella', parsed.sheets[0]?.rows[0]?.['Év'], 1965)

// ── Összegzés ───────────────────────────────────────────────────────────────
console.log(`\n${pass} zöld, ${fail} piros ${fail === 0 ? '✅ MIND ZÖLD' : '❌'}`)
if (fail > 0) process.exit(1)
