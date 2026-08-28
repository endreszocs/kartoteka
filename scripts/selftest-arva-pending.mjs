#!/usr/bin/env node
/**
 * ÁRVA OFFLINE PENDING-SOR önellenőrzés (P0-20, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-20 találata:
 *   A core offline mentése két KÜLÖN lokális írás: (1) pending-sor a
 *   befizetes/kiadas_pending_local-ba, (2) mutation az outbox-ba. A kettő
 *   közti crash/hiba ÁRVA pending sort hagyott: a tétel lokálisan látszott,
 *   de a pusher (amely kizárólag az outboxot olvassa) SOSEM küldte fel — a
 *   sor örökre 'pending' maradt, és a kódkomment „Sync most újra-enqueue-ol"
 *   állítása hamis volt.
 *
 * A JAVÍTOTT VILÁG:
 *   (1) mindkét pusher (befizetes-write-sync, kiadas-write-sync) minden futás
 *       ELEJÉN árva-söprést futtat: az outbox-referencia nélküli, 'pending'
 *       állapotú, server_id nélküli sorokat újra-enqueue-olja a mentéskori
 *       payload-alakban (a nyugta a crash-ben elveszett → iratszám-fallback,
 *       ami a mentéskori default),
 *   (2) a söprés csak a valóban árvákat veszi fel (NOT IN outbox) — nem
 *       duplikálja a már sorban álló mutationöket.
 *
 * NEGATÍV ASSZERT: a söprő-hívás eltávolítása + a NOT IN szűrő kiütése.
 *
 * Futtatás:  node scripts/selftest-arva-pending.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const FAJLOK = [
  ['befizetes', path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'befizetes-write-sync.ts'), 'befizetes_pending_local', 'pushPendingBefizetes'],
  ['kiadas', path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'kiadas-write-sync.ts'), 'kiadas_pending_local', 'pushPendingKiadas'],
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

function ellenoriz(nev, src, pendingTabla, pushFn) {
  const s = stripComments(src)
  const hibak = []

  if (!/sweepOrphan\w*Pending/.test(s)) {
    hibak.push(`${nev}: nincs árva-söprő (sweepOrphan*Pending) — az outbox nélküli pending sor örökre beragad`)
    return hibak
  }

  // A söprő SQL-je: pending + nincs server_id + NINCS outbox-referencia
  if (!new RegExp(`FROM ${pendingTabla}[\\s\\S]{0,400}?sync_state = 'pending'`).test(s)) {
    hibak.push(`${nev}: a söprő nem a ${pendingTabla} 'pending' sorait nézi`)
  }
  if (!/server_id IS NULL/.test(s)) {
    hibak.push(`${nev}: a söprő nem zárja ki a már szinkronizált (server_id-s) sorokat`)
  }
  if (!/NOT IN[\s\S]{0,200}?FROM outbox/.test(s)) {
    hibak.push(`${nev}: a söprőből hiányzik a NOT IN outbox szűrő — a sorban álló mutationök duplikálódnának`)
  }

  // A pusher a futás ELEJÉN (a mutation-olvasás előtt) hívja
  const iPush = s.indexOf(`export async function ${pushFn}`)
  const iSweepCall = s.indexOf('await sweepOrphan', iPush)
  const iGetMut = s.indexOf('getPendingMutations', iPush)
  if (iPush < 0) hibak.push(`${nev}: a ${pushFn} nem található (fail-closed)`)
  else if (iSweepCall < 0 || (iGetMut > 0 && iSweepCall > iGetMut)) {
    hibak.push(`${nev}: a söprő nem a mutation-olvasás ELŐTT fut a pusherben`)
  }

  return hibak
}

let osszHiba = 0
for (const [nev, fajl, tabla, pushFn] of FAJLOK) {
  const src = fs.readFileSync(fajl, 'utf8')
  const hibak = ellenoriz(nev, src, tabla, pushFn)
  osszHiba += hibak.length
  if (hibak.length === 0) pass(`${nev}-pusher: árva-söprés a futás elején, NOT IN outbox szűrővel`)
  else for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok (csak zöld pozitív után) ─────────────────────────────
if (osszHiba === 0) {
  const [nev, fajl, tabla, pushFn] = FAJLOK[0]
  const src = fs.readFileSync(fajl, 'utf8')

  // M1: a söprő-hívás eltávolítása a pusherből
  const m1 = src.replace(/[ \t]*await sweepOrphan\w*Pending\([^)]*\)\n/, '')
  if (m1 === src) bukik('M1 mutáció nem változtatott a forráson (fail-closed)')
  else if (ellenoriz(nev, m1, tabla, pushFn).length === 0) bukik('M1: a söprő-hívás törlésére az őr NEM bukik — vak')
  else pass('M1 mutáns (söprő-hívás törölve) → az őr elbuktatja')

  // M2: a NOT IN outbox szűrő kiütése (duplikáló söprő)
  const m2 = src.replace(/NOT IN/, 'IN')
  if (m2 === src) bukik('M2 mutáció nem változtatott a forráson (fail-closed)')
  else if (ellenoriz(nev, m2, tabla, pushFn).length === 0) bukik('M2: a NOT IN kiütésére az őr NEM bukik — vak')
  else pass('M2 mutáns (NOT IN kiütve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — árva pending-söprés rendben`)
