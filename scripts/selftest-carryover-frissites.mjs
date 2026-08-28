#!/usr/bin/env node
/**
 * CARRYOVER NYITÓ-FRISSÍTÉS önellenőrzés (P0-3, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-3 találata:
 *   A következő évi 'carryover' forrású banki nyitót CSAK három út frissítette
 *   (kassza↔bank pár mentése, belső mozgás mentése, bank-import). A STORNÓ, a
 *   stornó-visszavonás, a SZERKESZTÉS és a TÖRLÉS soha — egy visszamenőleges
 *   banki művelet után a következő év tárolt nyitója elavult, és a kanonikus
 *   feloldó azt hitelesnek vette minden felületen. (Az éles diagnosztika
 *   2026-08-28-án 0 elavult sort mért — a bekötés tisztán megelőző.)
 *
 * A JAVÍTOTT VILÁG:
 *   (1) KÖZÖS best-effort helper a core-ban (refreshCarryoverBestEffort):
 *       a kapott tételek (bankszamla_id + datum) és/vagy belső-mozgás kulcs
 *       alapján frissíti a köv. évi carryover nyitókat; hibája SOSEM buktatja
 *       a fő műveletet (try/catch),
 *   (2) mind a 10 mutációs út meghívja a siker-ágán: web (update/storno/
 *       undo-storno/delete) + core (befizetes/kiadas storno, soft-delete ×2,
 *       undo-storno, update-transaction),
 *   (3) minden érintett út a sor bankszamla_id-ját is lekérdezi (enélkül a
 *       helper nem tudná, melyik számlát érinti).
 *
 * NEGATÍV ASSZERT: a hívás törlése egy web- és egy core-útról.
 *
 * Futtatás:  node scripts/selftest-carryover-frissites.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const NYITO = path.join(REPO, 'packages', 'core', 'src', 'finance', 'bank-import', 'nyito-egyenleg.ts')
const EDIT_STORNO = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'edit-storno-actions.ts')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')

const CORE_FAJLOK = [
  ['core befizetes/storno', path.join(REPO, 'packages', 'core', 'src', 'finance', 'befizetes', 'storno.ts')],
  ['core kiadas/storno', path.join(REPO, 'packages', 'core', 'src', 'finance', 'kiadas', 'storno.ts')],
  ['core befizetes/soft-delete', path.join(REPO, 'packages', 'core', 'src', 'finance', 'befizetes', 'soft-delete.ts')],
  ['core kiadas/soft-delete', path.join(REPO, 'packages', 'core', 'src', 'finance', 'kiadas', 'soft-delete.ts')],
  ['core undo-storno', path.join(REPO, 'packages', 'core', 'src', 'finance', 'undo-storno.ts')],
  ['core update-transaction', path.join(REPO, 'packages', 'core', 'src', 'finance', 'update-transaction.ts')],
]

const WEB_FUGGVENYEK = ['updateTransactionBasic', 'stornoTransaction', 'undoStornoTransaction']

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Függvény-régió: a deklarációtól a KÖVETKEZŐ (export) async function-ig. */
function regio(s, fnNev) {
  const re = new RegExp(`(?:export )?async function ${fnNev}\\b`)
  const m = re.exec(s)
  if (!m) return null
  const kovetkezo = /(?:export )?async function \w+/g
  kovetkezo.lastIndex = m.index + 10
  const next = kovetkezo.exec(s)
  return s.slice(m.index, next ? next.index : s.length)
}

function ellenorizRegiot(nev, r) {
  const hibak = []
  if (!r) { hibak.push(`${nev}: a függvény-régió nem található (fail-closed)`); return hibak }
  if (!r.includes('refreshCarryoverBestEffort(')) {
    hibak.push(`${nev}: a siker-ág nem frissíti a köv. évi carryover nyitót (refreshCarryoverBestEffort hiányzik)`)
  }
  if (!r.includes('bankszamla_id')) {
    hibak.push(`${nev}: a sor bankszamla_id-ja nincs lekérdezve — a frissítő nem tudná, melyik számlát érinti`)
  }
  return hibak
}

function ellenorizMindent(files) {
  const hibak = []

  // (1) a közös helper
  const nyitoS = stripComments(files.get(NYITO))
  if (!/export async function refreshCarryoverBestEffort/.test(nyitoS)) {
    hibak.push('a core-ban nincs refreshCarryoverBestEffort helper')
  } else {
    const hr = regio(nyitoS, 'refreshCarryoverBestEffort')
    if (!hr || !hr.includes('refreshNextYearCarryoverUseCase(')) {
      hibak.push('a helper nem a kanonikus refreshNextYearCarryoverUseCase-t hívja')
    }
    if (!hr || !/catch/.test(hr)) {
      hibak.push('a helper nem best-effort (nincs catch) — a frissítés hibája buktathatná a fő műveletet')
    }
  }

  // (2) web-utak
  const editS = stripComments(files.get(EDIT_STORNO))
  for (const fn of WEB_FUGGVENYEK) {
    hibak.push(...ellenorizRegiot(`web ${fn}`, regio(editS, fn)))
  }
  const actionsS = stripComments(files.get(ACTIONS))
  hibak.push(...ellenorizRegiot('web deleteTransaction', regio(actionsS, 'deleteTransaction')))

  // (3) core-utak (fájlonként egy use-case)
  for (const [nev, fajl] of CORE_FAJLOK) {
    const s = stripComments(files.get(fajl))
    if (!s.includes('refreshCarryoverBestEffort(')) {
      hibak.push(`${nev}: a siker-ág nem frissíti a köv. évi carryover nyitót`)
    }
    if (!s.includes('bankszamla_id')) {
      hibak.push(`${nev}: a sor bankszamla_id-ja nincs lekérdezve`)
    }
  }

  return hibak
}

function beolvasMind() {
  const m = new Map()
  for (const f of [NYITO, EDIT_STORNO, ACTIONS, ...CORE_FAJLOK.map(([, f]) => f)]) {
    m.set(f, fs.readFileSync(f, 'utf8'))
  }
  return m
}

const files = beolvasMind()
const hibak = ellenorizMindent(files)
if (hibak.length === 0) {
  pass('mind a 10 mutációs út frissíti a köv. évi carryover nyitót (közös best-effort helperrel)')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a hívás törlése a web stornoTransaction-ből
  const m1files = beolvasMind()
  const editRaw = m1files.get(EDIT_STORNO)
  const r = regio(editRaw, 'stornoTransaction')
  const rMut = r.replace(/refreshCarryoverBestEffort\(/g, 'refreshCarryoverBestEffort_KIKAPCSOLVA(')
  m1files.set(EDIT_STORNO, editRaw.replace(r, rMut))
  if (rMut === r) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenorizMindent(m1files).length === 0) bukik('M1: a web-hívás törlésére az őr NEM bukik — vak')
  else pass('M1 mutáns (web stornó-hívás törölve) → az őr elbuktatja')

  // M2: a hívás törlése a core befizetes/soft-delete-ből
  const m2files = beolvasMind()
  const sdPath = CORE_FAJLOK[2][1]
  const sdRaw = m2files.get(sdPath)
  const sdMut = sdRaw.replace(/refreshCarryoverBestEffort\(/g, 'refreshCarryoverBestEffort_KIKAPCSOLVA(')
  m2files.set(sdPath, sdMut)
  if (sdMut === sdRaw) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenorizMindent(m2files).length === 0) bukik('M2: a core-hívás törlésére az őr NEM bukik — vak')
  else pass('M2 mutáns (core soft-delete-hívás törölve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — carryover-frissítés bekötve`)
