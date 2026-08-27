#!/usr/bin/env node
/**
 * BANKI IMPORT — KIADÁS-OLDAL önellenőrzés (2026-08-27)
 *
 * MIT ŐRIZ — az élesben elsült hibaosztályt:
 *   Egyetlen importban 93 banki kiadás-sor bukott el ezzel:
 *     „Could not find the 'kedvezmenyzett' column of 'kiadas' in the schema cache”
 *   A `kiadas` partner-oszlopa `atvevo` (a személy-hivatkozásé `atvevoid`).
 *   `kedvezmenyzett` oszlop SOHA nem létezett — élesben igazolva (information_schema).
 *   NE tévesszen meg a `kedvezmenyezett_cui` (más cél), sem a megyei/kerületi
 *   tükör-táblák `kedvezmenyezett` oszlopa (egy plusz „e”, MÁS tábla).
 *
 *   A hibát elrejtette egy kétlépcsős „reference → canonical” fallback, ami
 *   szerkezetileg képtelen volt védeni: a `reference` a `canonical` SPREADJE volt,
 *   így egy nem létező oszlop MINDKÉT próbálkozást megbuktatta. Ráadásul a
 *   `canonical` a NOT NULL `xkey`/`nyugta` oszlopokat nem is tartalmazta.
 *
 * NEGATÍV ASSZERT (a projekt szabálya: őrszem negatív asszert nélkül vak):
 *   Az őrszem MUTÁNSOKON is lefut — visszajátssza a régi hibás viselkedést a MAI
 *   forrásból, és bizonyítja, hogy elbukna rajta. Ha egy mutáns ÁTMEGY, az őrszem
 *   maga romlott el, és a teszt fail-closed módon bukik.
 *
 * Futtatás:  node scripts/selftest-bank-import-kiadas.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const SRC = path.join(REPO_ROOT, 'packages', 'core', 'src', 'finance', 'bank-import', 'import-transactions.ts')

let failed = false
const fail = (msg) => { console.error(`FAIL: ${msg}`); failed = true }
const ok = (msg) => console.log(`OK:   ${msg}`)

if (!fs.existsSync(SRC)) { fail(`hiányzik a forrás: ${SRC}`); process.exit(1) }
const RAW = fs.readFileSync(SRC, 'utf8')

/** Kommentek eltávolítása — enélkül a magyarázó szöveg hamis találatot adna. */
function stripComments(src) {
  let out = ''
  let i = 0
  let mode = 'code' // code | line | block | sq | dq | tpl
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (mode === 'code') {
      if (c === '/' && n === '/') { mode = 'line'; i += 2; continue }
      if (c === '/' && n === '*') { mode = 'block'; i += 2; continue }
      if (c === "'") mode = 'sq'
      else if (c === '"') mode = 'dq'
      else if (c === '`') mode = 'tpl'
      out += c; i++; continue
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += c } ; i++; continue }
    if (mode === 'block') { if (c === '*' && n === '/') { mode = 'code'; i += 2 } else i++; continue }
    // string módok
    if (c === '\\') { out += c + (n ?? ''); i += 2; continue }
    if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"') || (mode === 'tpl' && c === '`')) mode = 'code'
    out += c; i++
  }
  return out
}

const CODE = stripComments(RAW)

// Épeszűségi próba a komment-szűrőre: a fájl elején lévő magyarázatból
// el kell tűnnie a szónak, a kódból viszont nem tűnhet el semmi lényeges.
if (CODE.includes('a hívók `kedvezmenyzett` néven')) fail('a komment-szűrő nem működik (kommentszöveg bent maradt)')
else ok('komment-szűrő működik')
if (!CODE.includes('insertKiadas')) fail('a komment-szűrő túl sokat vágott (insertKiadas eltűnt)')

// ── 1. ŐR: nem létező oszlopnév írása ─────────────────────────────────────
// Objektum-kulcs pozícióban keressük (`kedvezmenyzett:`), hogy a puszta
// szóelőfordulás ne adjon hamis riasztást.
const TILTOTT_KULCS = /(^|[{,\s])kedvezmenyzett\s*:/m

function orNincsTiltottKulcs(code) {
  return !TILTOTT_KULCS.test(code)
}
if (orNincsTiltottKulcs(CODE)) ok('nincs `kedvezmenyzett:` kulcs a kiadás-payloadokban')
else fail('VISSZATÉRT A HIBA: `kedvezmenyzett:` kulcs szerepel egy payloadban — a kiadas táblán NINCS ilyen oszlop (a helyes: atvevo)')

// ── 2. ŐR: a helper a NOT NULL oszlopokat kitölti ────────────────────────
const helperM = CODE.match(/async function insertKiadas\s*\([\s\S]*?\n}/)
if (!helperM) {
  fail('nem található az insertKiadas() helper — a kiadás-beszúrás egyetlen kapuja')
} else {
  const helper = helperM[0]
  const kell = ['atvevo', 'atvevoid', 'nyugta', 'xkey', 'userid']
  const hianyzo = kell.filter((k) => !new RegExp(`(^|[{,\\s])${k}\\s*:`, 'm').test(helper))
  if (hianyzo.length === 0) ok(`az insertKiadas() payloadja kitölti: ${kell.join(', ')}`)
  else fail(`az insertKiadas() payloadjából hiányzik: ${hianyzo.join(', ')} (NOT NULL, alapérték nélkül)`)

  // A partner KÜLÖN paraméter legyen, ne a mezők közt utazzon.
  if (/partner\s*:\s*string\s*\|\s*null/.test(helper)) ok('a partner külön paraméter (nem csempészhető be rossz oszlopnéven)')
  else fail('a partner nem külön paraméter az insertKiadas()-ban')
}

// ── 3. ŐR: a halott kétlépcsős fallback ne térjen vissza ─────────────────
// A minta: ugyanabban a blokkban KÉT kiadas-insert, ahol a második a
// canonical-t próbálja. Az `{ ...canonical` spread + 2 insert a fő jel.
const ketInsert = (CODE.match(/from\(['"]kiadas['"]\)\s*\.insert\(/g) || []).length
const spreadCanonical = /\.\.\.\s*canonical/.test(CODE)
if (ketInsert <= 1) ok(`egyetlen kiadas-insert kapu van a fájlban (${ketInsert} db)`)
else fail(`${ketInsert} db kiadas-insert található — visszatérhetett a kétlépcsős fallback`)
if (!spreadCanonical) ok('nincs `...canonical` spread (a hamis biztonságérzetű fallback eltűnt)')
else fail('`...canonical` spread található — a fallback szerkezetileg újra képtelen védeni')

// ── 4. ŐR: mindhárom kiadás-ág a helperen megy át ────────────────────────
const hivasok = (CODE.match(/insertKiadas\s*\(/g) || []).length - 1 // -1: a definíció
if (hivasok >= 3) ok(`mind a ${hivasok} kiadás-ág az insertKiadas() kapun megy át`)
else fail(`csak ${hivasok} insertKiadas() hívás van — a sima kiadás, a belső mozgás bank-oldala és a counterpart mind kell`)

// ══════════════════════════════════════════════════════════════════════════
//  NEGATÍV ASSZERT — a RÉGI hibás világ visszajátszása a MAI forrásból
// ══════════════════════════════════════════════════════════════════════════
const mutansok = [
  {
    nev: 'a régi `kedvezmenyzett:` kulcs visszatétele a payloadba',
    mutal: (c) => c.replace(/(atvevo\s*:\s*partner,)/, "kedvezmenyzett: partner,\n    $1"),
    orzo: orNincsTiltottKulcs,
  },
  {
    nev: 'a partner becsempészése a hívó mezői közé',
    mutal: (c) => c.replace(/(iratszam\s*:\s*docNumber,)/, "kedvezmenyzett: 'x',\n            $1"),
    orzo: orNincsTiltottKulcs,
  },
]

let mutansBukott = 0
for (const m of mutansok) {
  const mutalt = m.mutal(CODE)
  if (mutalt === CODE) { fail(`a mutáns nem módosított semmit: ${m.nev} — az őrszem nem bizonyított`); continue }
  if (m.orzo(mutalt)) {
    fail(`AZ ŐRSZEM VAK: a mutáns ÁTMENT — ${m.nev}`)
  } else {
    mutansBukott++
    ok(`negatív asszert: az őrszem elbuktatja — ${m.nev}`)
  }
}
if (mutansBukott !== mutansok.length) fail('nem minden mutáns bukott el — az őrszem nem nyújt valódi védelmet')

// ── Zárás ────────────────────────────────────────────────────────────────
if (failed) {
  console.error('\nBANKI IMPORT KIADÁS-OLDAL ÖNELLENŐRZÉS: BUKOTT')
  process.exit(1)
}
console.log('\nBANKI IMPORT KIADÁS-OLDAL ÖNELLENŐRZÉS: RENDBEN')
