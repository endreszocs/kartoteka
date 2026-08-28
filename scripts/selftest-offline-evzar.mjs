#!/usr/bin/env node
/**
 * OFFLINE ÉV-ZÁR önellenőrzés (P0-5, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-5 találata:
 *   Az offline év-zár HÁROM rétegben volt halott: (1) a core year-lock
 *   opcionális `isYearFinalizedLocal` hookját a desktop-backend SOSEM
 *   implementálta (a kapu fail-open módon mindig átengedett), (2) a
 *   push-worker a szerveren NEM ellenőrzött újra (az offline rögzítés óta az
 *   évet véglegesíthették), (3) a DB-ben csak a soft-delete-re van RESTRICTIVE
 *   zár, INSERT-re nincs. Egy offline készpénz-tétel így akadálytalanul
 *   bekönyvelődött egy már véglegesített ÉS beküldött évbe.
 *
 * A JAVÍTOTT VILÁG (app-réteg; a DB-oldali zár külön, jogosultsági körben):
 *   (1) a TauriSqliteBackend implementálja az isYearFinalizedLocal hookot a
 *       bealitas_local tükörből → a core rögzítéskori kapuja életre kel,
 *   (2) mindkét pusher a push ELŐTT readYearFinalized-del újra-ellenőriz a
 *       szerveren: véglegesített év → konfliktus (nem néma insert);
 *       nem-olvasható állapot → fail-closed retry (backoff), nem insert.
 *
 * NEGATÍV ASSZERT: a hook törlése + a push-ellenőrzés törlése.
 *
 * Futtatás:  node scripts/selftest-offline-evzar.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const BACKEND = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'tauri-sqlite-backend.ts')
const PUSHEREK = [
  ['befizetes', path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'befizetes-write-sync.ts'), 'markBefizetesConflict', "'befizetes'"],
  ['kiadas', path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'kiadas-write-sync.ts'), 'markKiadasConflict', "'kiadas'"],
]

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

// ── (1) A backend-hook implementálva van ────────────────────────────────────
function ellenorizBackend(src) {
  const s = stripComments(src)
  const hibak = []
  const i = s.indexOf('async isYearFinalizedLocal(')
  if (i < 0) {
    hibak.push('a TauriSqliteBackend nem implementálja az isYearFinalizedLocal hookot — az offline rögzítéskori év-zár kapu fail-open')
    return hibak
  }
  const torzs = s.slice(i, i + 700)
  if (!torzs.includes('bealitas_local')) hibak.push('a hook nem a bealitas_local tükörből olvas')
  if (!torzs.includes('accounting_finalized')) hibak.push('a hook nem az accounting_finalized zászlót nézi')
  return hibak
}

// ── (2) A pusherek push előtt újra-ellenőriznek a szerveren ────────────────
function ellenorizPusher(nev, src, conflictFn, tabla) {
  const s = stripComments(src)
  const hibak = []
  if (!/import \{[^}]*readYearFinalized[^}]*\} from '@kartoteka\/core'/.test(s)) {
    hibak.push(`${nev}-pusher: nem importálja a readYearFinalized-et`)
    return hibak
  }
  const iCheck = s.indexOf('readYearFinalized(')
  const iInsert = s.indexOf(`.from(${tabla})`)
  if (iCheck < 0) hibak.push(`${nev}-pusher: nincs push előtti év-zár újra-ellenőrzés`)
  else if (iInsert > 0 && iCheck > iInsert) hibak.push(`${nev}-pusher: az év-zár ellenőrzés az insert UTÁN van`)
  const iVege = iInsert > 0 ? iInsert : s.length
  const blokk = iCheck >= 0 ? s.slice(iCheck, iVege) : ''
  if (iCheck >= 0 && !blokk.includes(conflictFn)) {
    hibak.push(`${nev}-pusher: a véglegesített-év ág nem konfliktusra billent (${conflictFn} hiányzik)`)
  }
  if (iCheck >= 0 && !/unknown/.test(blokk)) {
    hibak.push(`${nev}-pusher: a nem-olvasható zárás-állapot (unknown) nincs fail-closed kezelve`)
  }
  return hibak
}

const backendRaw = fs.readFileSync(BACKEND, 'utf8')
{
  const hibak = ellenorizBackend(backendRaw)
  if (hibak.length === 0) pass('a backend isYearFinalizedLocal hookja él (bealitas_local + accounting_finalized)')
  else for (const h of hibak) bukik(h)
}

for (const [nev, fajl, conflictFn, tabla] of PUSHEREK) {
  const src = fs.readFileSync(fajl, 'utf8')
  const hibak = ellenorizPusher(nev, src, conflictFn, tabla)
  if (hibak.length === 0) pass(`${nev}-pusher: push előtti szerver-oldali év-zár újra-ellenőrzés (konfliktus + fail-closed unknown)`)
  else for (const h of hibak) bukik(h)
}

// ── (3) NEGATÍV — mutánsok ───────────────────────────────────────────────────
if (fail === 0) {
  // M1: a backend-hook törlése
  const m1 = backendRaw.replace(/async isYearFinalizedLocal\(/, 'async isYearFinalizedLocal_KIKAPCSOLVA(')
  if (m1 === backendRaw) bukik('M1 mutáció nem változtatott a backenden (fail-closed)')
  else if (ellenorizBackend(m1).length === 0) bukik('M1: a hook törlésére az őr NEM bukik — vak')
  else pass('M1 mutáns (hook törölve) → az őr elbuktatja')

  // M2: a push-ellenőrzés törlése a befizetés-pusherből
  const [nev, fajl, conflictFn, tabla] = PUSHEREK[0]
  const src = fs.readFileSync(fajl, 'utf8')
  const m2 = src.replace(/readYearFinalized\(/g, 'readYearFinalized_KIKAPCSOLVA(')
  if (m2 === src) bukik('M2 mutáció nem változtatott a pusheren (fail-closed)')
  else if (ellenorizPusher(nev, m2, conflictFn, tabla).length === 0) bukik('M2: a push-ellenőrzés törlésére az őr NEM bukik — vak')
  else pass('M2 mutáns (push-ellenőrzés törölve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — offline év-zár rendben`)
