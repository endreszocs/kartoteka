#!/usr/bin/env node
/**
 * PÉNZ-PONTOSSÁG önellenőrzés (E-blokk: P3-1, P3-2, P3-3, P3-16, P3-25 — 2026-08-29)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit megjelenítési találatai:
 *   (1) P3-1  járulék-tartozás: a `debt > 0` float-maradékra is „hátralékos"-t
 *       mondott (0.01+2.32+0.67 = 2.9999999999999996 < 3) → epsilon + round2 kell;
 *   (2) P3-2  bérleti arányos díj: évesDíj×hónap/12 törtbanit ad → a kerek
 *       befizetés SOSEM éri el → round2 az elvárt díjon + epsilon a hátralékon;
 *   (3) P3-3  formatCurrency: apró negatív float „-0,00"-ként jelent meg →
 *       bani-kerekítés + a negatív nulla normalizálása;
 *   (4) P3-16 költségvetés-módosítás: a `modositott || tervezett` a TÁROLT 0-t
 *       (kinullázott jogcím) összetévesztette a „nincs módosítás"-sal → `??`;
 *   (5) P3-25 desktop chitanta-lista: toLocaleString('hu') nem fix 2 tizedes
 *       (150,5 / 1234,567) → a közös formatCurrency.
 *
 * A float-hibaosztályt SZÁMSZERŰEN is bizonyítjuk (a régi világ bukna), a
 * forrás-állapotot statikusan őrizzük, mutánsokkal.
 *
 * Futtatás:  node scripts/selftest-penz-pontossag.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const JARULEK = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'jarulek-calculation.ts')
const RENTAL = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'rental-calculation.ts')
const HELPERS = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'helpers.ts')
const BUDGET = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'budget-reporting.ts')
const CHITANTA = path.join(REPO, 'apps', 'desktop', 'src', 'pages', 'chitanta-page.tsx')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

// ── (0) A HIBAOSZTÁLY SZÁMSZERŰ BIZONYÍTÁSA — a régi világ tényleg bukott ──
{
  const expected = 3
  const paid = 0.01 + 2.32 + 0.67
  if (expected - paid > 0 && expected - paid < 0.005) {
    pass('(0) a float-maradék valós: 3 − (0.01+2.32+0.67) > 0, de < fél bani — a régi `debt > 0` fantom-hátralékost adott')
  } else {
    bukik('(0) a demonstráció nem áll — a platform floatja eltér?')
  }
  const aranyos = (1000 * 7) / 12 // 583.333… — törtbani
  if (Math.abs(aranyos - 583.33) > 1e-9 && Math.round(aranyos * 100) / 100 === 583.33) {
    pass('(0) az arányos díj törtbanija valós: 1000×7/12 ≠ 583.33, round2 után az')
  } else {
    bukik('(0) az arányos-díj demonstráció nem áll')
  }
  if ((-0.001).toFixed(2) === '-0.00') {
    pass('(0) a negatív nulla valós: (-0.001).toFixed(2) === "-0.00"')
  } else {
    bukik('(0) a -0.00 demonstráció nem áll')
  }
}

function ellenoriz(files) {
  const hibak = []

  // (1) P3-1 — járulék-tartozás epsilonnal + round2
  const j = stripComments(files.get(JARULEK))
  if (/debt:\s*Math\.max\(0,\s*expected\s*-\s*paid\)/.test(j)) {
    hibak.push('P3-1: a járulék-tartozás még nyers `Math.max(0, expected - paid)` — float-maradékra fantom-hátralékos')
  }
  if (!/FEL_BANI/.test(j) || !/Math\.round\((?:debtRaw|\(expected - paid\)) \* 100\)/.test(j)) {
    hibak.push('P3-1: a járulék-tartozásból hiányzik a fél-bani epsilon vagy a round2')
  }

  // (2) P3-2 — bérleti arányos díj round2 + hátralék epsilon
  const r = stripComments(files.get(RENTAL))
  if (/return \(evesDij \* aktivHonapok\) \/ 12\b/.test(r)) {
    hibak.push('P3-2: az arányos díj még törtbanit ad (nincs round2 a visszatérésen)')
  }
  if (!/Math\.round\(\(\(evesDij \* aktivHonapok\) \/ 12\) \* 100\)/.test(r)) {
    hibak.push('P3-2: az arányos díj round2-je nem található')
  }
  if (/const hatralek = Math\.max\(0,\s*elvart\s*-\s*fizett\)/.test(r) || !/FEL_BANI/.test(r)) {
    hibak.push('P3-2: a bérleti hátralékon nincs fél-bani epsilon')
  }

  // (3) P3-3 — formatCurrency: bani-kerekítés + negatív nulla normalizálás
  const h = stripComments(files.get(HELPERS))
  const iFmt = h.indexOf('export function formatCurrency')
  const fmt = iFmt >= 0 ? h.slice(iFmt, iFmt + 600) : ''
  if (!/Math\.round\(Number\(num\) \* 100\) \/ 100 \+ 0/.test(fmt)) {
    hibak.push('P3-3: a formatCurrency-ből hiányzik a bani-kerekítés + a „+ 0" negatív-nulla normalizálás')
  }

  // (4) P3-16 — modositott ?? (a tárolt 0 valós módosítás)
  const b = stripComments(files.get(BUDGET))
  if (/modositott \|\|/.test(b)) {
    hibak.push('P3-16: a költségvetés-riportban visszatért a `modositott ||` — a kinullázott jogcím ábrázolhatatlan')
  }
  if (!/modositott\s*\?\?/.test(b) && !/=== null \|\| m === undefined/.test(b)) {
    hibak.push('P3-16: a modositott null-kezelése (??) nem található')
  }

  // (5) P3-25 — chitanta-lista: közös formatCurrency, nem toLocaleString
  const c = stripComments(files.get(CHITANTA))
  if (/osszeg(?:_brut)?\.toLocaleString\('hu'\)/.test(c)) {
    hibak.push("P3-25: a chitanta-lista még toLocaleString('hu')-val formáz összeget — nem fix 2 tizedes")
  }
  if (!/\bformatCurrency\(/.test(c)) {
    hibak.push('P3-25: a chitanta-lista nem a közös formatCurrency-t használja')
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const fp of [JARULEK, RENTAL, HELPERS, BUDGET, CHITANTA]) m.set(fp, fs.readFileSync(fp, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('pénz-pontosság: epsilon + round2 + −0-normalizálás + ??-módosítás + fix 2 tizedes rendben')
} else {
  for (const hb of hibak) bukik(hb)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a járulék-epsilon visszabontása a nyers max(0, …)-ra
  const m1 = beolvas()
  const j1 = m1.get(JARULEK)
  const j1mut = j1.replace(/const FEL_BANI[^\n]*\n/, '').replace(/debt: debtRaw > FEL_BANI[^,\n]*/, 'debt: Math.max(0, expected - paid)')
  m1.set(JARULEK, j1mut)
  if (j1mut === j1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: a járulék-epsilon törlésére az őr NEM bukik — vak')
  else pass('M1 mutáns (járulék-epsilon vissza nyersre) → az őr elbuktatja')

  // M2: a bérleti round2 törlése
  const m2 = beolvas()
  const r2 = m2.get(RENTAL)
  const r2mut = r2.replace(/return Math\.round\(\(\(evesDij \* aktivHonapok\) \/ 12\) \* 100\) \/ 100/, 'return (evesDij * aktivHonapok) / 12')
  m2.set(RENTAL, r2mut)
  if (r2mut === r2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2).length === 0) bukik('M2: a bérleti round2 törlésére az őr NEM bukik — vak')
  else pass('M2 mutáns (bérleti round2 törölve) → az őr elbuktatja')

  // M3: a formatCurrency normalizálás törlése
  const m3 = beolvas()
  const h3 = m3.get(HELPERS)
  const h3mut = h3.replace(/Math\.round\(Number\(num\) \* 100\) \/ 100 \+ 0/, 'Number(num)')
  m3.set(HELPERS, h3mut)
  if (h3mut === h3) bukik('M3 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m3).length === 0) bukik('M3: a −0-normalizálás törlésére az őr NEM bukik — vak')
  else pass('M3 mutáns (formatCurrency-normalizálás törölve) → az őr elbuktatja')

  // M4: a ?? visszaváltása ||-re
  const m4 = beolvas()
  const b4 = m4.get(BUDGET)
  const b4mut = b4.replace(/modositott\s*\?\?/g, 'modositott ||')
  m4.set(BUDGET, b4mut)
  if (b4mut === b4) bukik('M4 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m4).length === 0) bukik('M4: a ??→|| visszabontásra az őr NEM bukik — vak')
  else pass('M4 mutáns (modositott ?? → ||) → az őr elbuktatja')

  // M5: a chitanta-lista visszabontása toLocaleString-re
  const m5 = beolvas()
  const c5 = m5.get(CHITANTA)
  const c5mut = c5.replace(/formatCurrency\(r\.osszeg_brut\)/, "r.osszeg_brut.toLocaleString('hu')")
  m5.set(CHITANTA, c5mut)
  if (c5mut === c5) bukik('M5 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m5).length === 0) bukik('M5: a toLocaleString-visszabontásra az őr NEM bukik — vak')
  else pass('M5 mutáns (chitanta toLocaleString vissza) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — pénz-pontosság rendben`)
