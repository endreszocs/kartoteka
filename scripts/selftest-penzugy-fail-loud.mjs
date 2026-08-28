#!/usr/bin/env node
/**
 * PÉNZÜGY FAIL-LOUD + TELJESSÉG önellenőrzés
 * (E-blokk: P3-5, P3-8, P3-9, P3-10, P3-12, P3-17, P4-28 — 2026-08-29)
 *
 * MIT ŐRIZ — a 2026-08-28-i audit „néma hiba / néma csonkulás" találatai:
 *   (1) P3-8  initFinance: a kritikus lekérdezések hibája HIBÁT DOB — nem néma
 *       üres lista + hamis 0-egyenleg;
 *   (2) P3-10 import-varázsló: a BANK-nyitó mentés hibája HANGOS (toast);
 *   (3) P3-12 stornó: az oblio-kaszkád eredménye ellenőrzött, hibája kimondott;
 *   (4) P3-17 getPreviousYearActuals: LAPOZOTT lekérés (mind a 4 adat-select);
 *   (5) P3-5  leltár-összesítő: stornó/törölt kizárva + osszeg_ron +
 *       kassza = bankszamla_id IS NULL (nem irattipus-szöveg);
 *   (6) P4-28 calculateBalances: a deleted sor a helper BELSEJÉBEN kizárva;
 *   (7) P3-9  import után a FinanceTabs frissül (onImported + fülváltás-horog).
 *
 * NEGATÍV ASSZERT: a régi (néma) világot visszajátszó mutánsok.
 *
 * Futtatás:  node scripts/selftest-penzugy-fail-loud.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')
const WIZARD = path.join(REPO, 'apps', 'web', 'components', 'finance', 'finance-import', 'penzugy-import-wizard.tsx')
const STORNO = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'edit-storno-actions.ts')
const LELTAR = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'leltar', 'actions.ts')
const HELPERS = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'helpers.ts')
const TABS = path.join(REPO, 'apps', 'web', 'components', 'finance', 'finance-tabs.tsx')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function fnWindow(src, marker, len = 9000) {
  const i = src.indexOf(marker)
  return i >= 0 ? src.slice(i, i + len) : ''
}

function ellenoriz(files) {
  const hibak = []

  // (1) P3-8 — initFinance fail-loud
  const a = stripComments(files.get(ACTIONS))
  const initFn = fnWindow(a, 'export async function initFinance', 30000)
  if (!/kritikusLekerdezesek/.test(initFn) || !/throw new Error\(/.test(initFn)) {
    hibak.push('P3-8: az initFinance nem ellenőrzi a kritikus lekérdezéseket / nem dob hibát — néma üres lista')
  }

  // (4) P3-17 — getPreviousYearActuals lapozott
  const prevFn = fnWindow(a, 'export async function getPreviousYearActuals', 9000)
  const lapozott = (prevFn.match(/fetchAllPaged\(/g) || []).length
  if (lapozott < 4) {
    hibak.push(`P3-17: a getPreviousYearActuals ${lapozott}/4 adat-lekérdezése lapozott — 1000+ tételnél néma alulmérés`)
  }

  // (2) P3-10 — bank-nyitó hibák hangosak
  const w = stripComments(files.get(WIZARD))
  if (!/nyitoHibak/.test(w) || !/NYITÓ egyenlege NEM mentődött/.test(w)) {
    hibak.push('P3-10: a bank-nyitó mentési hibái nem gyűlnek/nem szólnak — néma best-effort')
  }

  // (3) P3-12 — stornó-kaszkád ellenőrzött
  const s = stripComments(files.get(STORNO))
  if (!/oblioKaszkad/.test(s) || !/kaszkadFigyelmeztetes/.test(s)) {
    hibak.push('P3-12: az oblio-stornó kaszkád eredményét senki nem olvassa — aktív számla maradhat némán')
  }

  // (5) P3-5 — leltár-összesítő kánon
  const l = stripComments(files.get(LELTAR))
  const sumFn = fnWindow(l, 'function sumAmountsBetween', 2500)
  if (!/row\.stornozott \|\| row\.deleted/.test(sumFn)) {
    hibak.push('P3-5: a leltár-összesítő a stornózott/törölt tételt is összeadja')
  }
  if (!/osszeg_ron \?\? row\.osszeg/.test(sumFn)) {
    hibak.push('P3-5: a leltár-összesítő a nyers deviza-összeget adja össze (osszeg_ron helyett)')
  }
  if (/irattipus !== 'Készpénz'/.test(sumFn) || !/bankszamla_id != null/.test(sumFn)) {
    hibak.push('P3-5: a leltár-összesítő az irattipus-szövegből válogat kasszát (bankszamla_id helyett)')
  }

  // (6) P4-28 — calculateBalances deleted-szűrés
  const h = stripComments(files.get(HELPERS))
  const calcFn = fnWindow(h, 'export function calculateBalances', 4000)
  const delSzures = (calcFn.match(/deleted\?: boolean \}\)\.deleted\) return/g) || []).length
  if (delSzures < 2) {
    hibak.push(`P4-28: a calculateBalances deleted-szűrése ${delSzures}/2 ágon van meg`)
  }

  // (7) P3-9 — import utáni frissülés
  const t = stripComments(files.get(TABS))
  if (!/onImported=\{refreshData\}/.test(t)) {
    hibak.push('P3-9: a FinanceImportTabs nem kapja meg az onImported={refreshData} horgot')
  }
  if (!/=== 'admin_import' && activeTab !== 'admin_import'/.test(t)) {
    hibak.push('P3-9: az importáló fülről elváltáskor nincs lista-frissítés (fülváltás-hibaosztály)')
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const fp of [ACTIONS, WIZARD, STORNO, LELTAR, HELPERS, TABS]) m.set(fp, fs.readFileSync(fp, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('fail-loud + teljesség: initFinance, bank-nyitó, stornó-kaszkád, lapozás, leltár-kánon, deleted-szűrés, import-frissülés rendben')
} else {
  for (const hb of hibak) bukik(hb)
}

// ── NEGATÍV — a régi (néma) világ mutánsai ─────────────────────────────────
if (hibak.length === 0) {
  // M1: az initFinance hiba-ellenőrzés kilövése
  const m1 = beolvas()
  const a1 = m1.get(ACTIONS)
  const a1mut = a1.replace(/kritikusLekerdezesek/g, 'kritikusLekerdezesek_KIKAPCSOLVA_regi_nema_vilag')
  m1.set(ACTIONS, a1mut.replace(/throw new Error\(\s*`A pénzügyi adatok betöltése nem sikerült/, 'void ('))
  if (m1.get(ACTIONS) === a1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: az initFinance-őr kilövésére NEM bukik — vak')
  else pass('M1 mutáns (initFinance néma világ vissza) → az őr elbuktatja')

  // M2: a leltár-összesítő visszabontása irattipus-szövegre
  const m2 = beolvas()
  const l2 = m2.get(LELTAR)
  const l2mut = l2
    .replace(/if \(row\.stornozott \|\| row\.deleted\) return sum\n/, '')
    .replace(/if \(mode === 'cash' && row\.bankszamla_id != null\) return sum/, "if (mode === 'cash' && row.irattipus !== 'Készpénz') return sum")
  m2.set(LELTAR, l2mut)
  if (l2mut === l2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2).length === 0) bukik('M2: a leltár-kánon visszabontására NEM bukik — vak')
  else pass('M2 mutáns (leltár-összesítő régi szemantika) → az őr elbuktatja')

  // M3: a calculateBalances deleted-szűrés törlése
  const m3 = beolvas()
  const h3 = m3.get(HELPERS)
  const h3mut = h3.replace(/\s*if \(\(r as \{ deleted\?: boolean \}\)\.deleted\) return/g, '')
  m3.set(HELPERS, h3mut)
  if (h3mut === h3) bukik('M3 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m3).length === 0) bukik('M3: a deleted-szűrés törlésére NEM bukik — vak')
  else pass('M3 mutáns (calculateBalances deleted-szűrés törölve) → az őr elbuktatja')

  // M4: a lapozás visszabontása az előző évi tényben
  const m4 = beolvas()
  const a4 = m4.get(ACTIONS)
  const i4 = a4.indexOf('export async function getPreviousYearActuals')
  const w4 = a4.slice(i4, i4 + 9000)
  const w4mut = w4.replace(/fetchAllPaged\(/g, '(')
  const a4mut = a4.slice(0, i4) + w4mut + a4.slice(i4 + 9000)
  m4.set(ACTIONS, a4mut)
  if (a4mut === a4) bukik('M4 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m4).length === 0) bukik('M4: a lapozás visszabontására NEM bukik — vak')
  else pass('M4 mutáns (előző évi tény lapozatlan) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — fail-loud + teljesség rendben`)
