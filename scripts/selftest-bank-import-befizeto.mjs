#!/usr/bin/env node
/**
 * BANKI IMPORT — BEFIZETŐ-HOZZÁRENDELÉS önellenőrzés (2026-08-27, Endre 3. kérése)
 *
 * MIT ŐRIZ — négy, egymástól független csapdát:
 *
 * 1. NÉMA ADATVESZTÉS. A core `id_szemely`-t KIZÁRÓLAG a bevétel-ág payloadjába ír
 *    (import-transactions.ts). Ha a lelkész hozzárendel egy tagot, majd a Művelet-
 *    oszlopban átállítja kiadásra (vagy tömegesen átvált), a `personId` a szerveren
 *    SZÓ NÉLKÜL eldobódna — a felületen viszont továbbra is ott díszelegne a név.
 *    Ezért mindkét varázsló `updateDecision`-jének TÖRÖLNIE kell a personId-t,
 *    ha a művelet nem 'income'. Ugyanez a `bulkSetAction`-ben.
 *
 * 2. A LÁNC VÉGE. A `personId`-nak el kell jutnia az item-mappingig — a `note`
 *    mező hónapokig ott utazott a láncban úgy, hogy SEMMI nem töltötte ki; a
 *    `personId` pontosan ugyanabban az állapotban volt.
 *
 * 3. HATÓKÖR-SZIVÁRGÁS. A core VAKON írja az `id_szemely`-t — semmi nem ellenőrzi,
 *    hogy az a személy a hívó gyülekezetéhez tartozik-e. A szerver-akcióban kell
 *    egy fail-closed őr. (A projekt visszatérő hibaosztálya.)
 *
 * 4. A KÉT MÁSOLAT SZÉTHÚZÁSA. A varázslóból két, közel azonos példány él; a
 *    megosztott (desktop) példány korábban HÓNAPOKRA befagyott. Ha az egyikbe
 *    bekerül a befizető-mező, a másikba is be kell.
 *
 * Futtatás:  node scripts/selftest-bank-import-befizeto.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const WEB = path.join(REPO, 'apps', 'web', 'components', 'modals', 'bcr-import-wizard-dialog.tsx')
const UIAPP = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'BcrImportWizardBody.tsx')
const ACTION = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'bank-import-actions.ts')
const CORE = path.join(REPO, 'packages', 'core', 'src', 'finance', 'bank-import', 'import-transactions.ts')

let failed = false
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true }
const ok = (m) => console.log(`OK:   ${m}`)

for (const f of [WEB, UIAPP, ACTION, CORE]) {
  if (!fs.existsSync(f)) { fail(`hiányzik: ${f}`); process.exit(1) }
}

/** Kommentek eltávolítása — enélkül a magyarázó szöveg hamis találatot adna. */
function strip(src) {
  let out = '', i = 0, mode = 'code'
  while (i < src.length) {
    const c = src[i], n = src[i + 1]
    if (mode === 'code') {
      if (c === '/' && n === '/') { mode = 'line'; i += 2; continue }
      if (c === '/' && n === '*') { mode = 'block'; i += 2; continue }
      if (c === '{' && n === '/' && src[i + 2] === '*') { mode = 'jsx'; i += 3; continue }
      if (c === "'") mode = 'sq'; else if (c === '"') mode = 'dq'; else if (c === '`') mode = 'tpl'
      out += c; i++; continue
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += c }; i++; continue }
    if (mode === 'block') { if (c === '*' && n === '/') { mode = 'code'; i += 2 } else i++; continue }
    if (mode === 'jsx') { if (c === '*' && n === '/' && src[i + 2] === '}') { mode = 'code'; i += 3 } else i++; continue }
    if (c === '\\') { out += c + (n ?? ''); i += 2; continue }
    if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"') || (mode === 'tpl' && c === '`')) mode = 'code'
    out += c; i++
  }
  return out
}

const webRaw = fs.readFileSync(WEB, 'utf8')
const uiRaw = fs.readFileSync(UIAPP, 'utf8')
const web = strip(webRaw)
const ui = strip(uiRaw)
const action = strip(fs.readFileSync(ACTION, 'utf8'))
const core = strip(fs.readFileSync(CORE, 'utf8'))

// Épeszűségi próba a komment-szűrőre.
if (web.includes('Endre 3. kérése')) fail('a komment-szűrő nem működik')
else ok('komment-szűrő működik')

// ── 0. ELŐFELTÉTEL: a core tényleg csak a bevétel-ágon ír id_szemely-t ──────
// Ha ez egyszer megváltozik (a kiadás-ág is írni kezdi), az 1. őr feltevése
// megdől — ezért MÉRJÜK, nem feltételezzük.
const idSzemelyIrasok = (core.match(/id_szemely\s*:/g) || []).length
const idSzemelyPersonId = (core.match(/id_szemely\s*:\s*item\.personId/g) || []).length
if (idSzemelyPersonId === 1) {
  ok(`a core PONTOSAN egy helyen ír personId-t az id_szemely-be (összes id_szemely: ${idSzemelyIrasok})`)
} else {
  fail(`a core ${idSzemelyPersonId} helyen ír personId-t az id_szemely-be — az őr feltevése megdőlt, nézd át a 1. pontot`)
}

// ── 1. ŐR: a personId törlődik, ha a művelet nem bevétel ───────────────────
function orTorli(src) {
  // A törlésnek az updateDecision/bulkSetAction környékén, action-feltétel mellett kell állnia.
  return /action\s*!==\s*'income'[\s\S]{0,200}?delete\s+\w+\.personId/.test(src)
}
for (const [nev, src] of [['web', web], ['ui-app', ui]]) {
  if (orTorli(src)) ok(`${nev}: a personId törlődik, ha a művelet nem bevétel`)
  else fail(`${nev}: NEM törli a personId-t nem-bevételnél — a hozzárendelés némán elveszne`)
}

// ── 1b. ŐR: a törlés MINDKÉT helyen (updateDecision ÉS bulkSetAction) ─────
//     A mutáns ezt hozta ki: a webben két blokk volt, a ui-appban csak egy —
//     vagyis a tömeges „Minden kiadás" a desktopon hátrahagyta volna a personId-t.
for (const [nev, src] of [['web', web], ['ui-app', ui]]) {
  const db = (src.match(/action\s*!==\s*'income'[\s\S]{0,200}?delete\s+\w+\.personId/g) || []).length
  if (db >= 2) ok(`${nev}: a personId-törlés MINDKÉT helyen ott van (${db} db)`)
  else fail(`${nev}: a personId-törlés csak ${db} helyen van — az updateDecision ÉS a bulkSetAction is kell`)
}

// ── 2. ŐR: a personId eljut az item-mappingig, CSAK bevételnél ─────────────
function orAtadja(src) {
  return /personId\s*:\s*finalAction\s*===\s*'income'\s*\?\s*d\.personId\s*:\s*undefined/.test(src)
}
for (const [nev, src] of [['web', web], ['ui-app', ui]]) {
  if (orAtadja(src)) ok(`${nev}: a personId eljut az item-mappingig, csak bevételnél`)
  else fail(`${nev}: a personId NEM jut el az item-mappingig (vagy nem bevételre szűrve)`)
}

// ── 3. ŐR: szerver-oldali hatókör-ellenőrzés a befizetőre ─────────────────
const vanSzemelyLekerdezes = /from\(['"]szemely['"]\)[\s\S]{0,400}?congregation_id/.test(action)
const vanFailClosed = /personIds[\s\S]{0,2000}?(return\s*\{[\s\S]{0,400}?error)/.test(action)
if (vanSzemelyLekerdezes && vanFailClosed) {
  ok('a szerver-akció ellenőrzi, hogy a befizető a saját gyülekezet tagja (fail-closed)')
} else {
  fail('NINCS hatókör-ellenőrzés a personId-ra a szerver-akcióban — idegen gyülekezet tagja is beköthető lenne')
}

// ── 4. ŐR: a két másolat nem húzhat szét ──────────────────────────────────
const kellMindkettoben = ['personId', 'personName', 'Befizető']
for (const kulcs of kellMindkettoben) {
  const a = webRaw.includes(kulcs)
  const b = uiRaw.includes(kulcs)
  if (a && b) ok(`mindkét varázsló-másolat ismeri: ${kulcs}`)
  else fail(`SZÉTHÚZÁS: "${kulcs}" — web=${a}, ui-app=${b}`)
}

// ══════════════════════════════════════════════════════════════════════════
//  NEGATÍV ASSZERT — a régi (hibás) világ visszajátszása a MAI forrásból
// ══════════════════════════════════════════════════════════════════════════
const mutansok = [
  {
    nev: 'a personId-törlés eltávolítása (web)',
    src: web,
    mutal: (c) => c.replace(/if\s*\(\s*merged\.action\s*!==\s*'income'\s*\)\s*\{[\s\S]*?\}/g, ''),
    orzo: orTorli,
  },
  {
    nev: 'a personId-átadás eltávolítása az item-mappingből (web)',
    src: web,
    mutal: (c) => c.replace(/personId\s*:\s*finalAction[^\n]*\n/, ''),
    orzo: orAtadja,
  },
  {
    nev: 'a personId-törlés eltávolítása (ui-app)',
    src: ui,
    mutal: (c) => c.replace(/if\s*\(\s*merged\.action\s*!==\s*'income'\s*\)\s*\{[\s\S]*?\}/g, ''),
    orzo: orTorli,
  },
]
let bukott = 0
for (const m of mutansok) {
  const mutalt = m.mutal(m.src)
  if (mutalt === m.src) { fail(`a mutáns nem módosított semmit: ${m.nev} — az őrszem nem bizonyított`); continue }
  if (m.orzo(mutalt)) fail(`AZ ŐRSZEM VAK: a mutáns ÁTMENT — ${m.nev}`)
  else { bukott++; ok(`negatív asszert: az őrszem elbuktatja — ${m.nev}`) }
}
if (bukott !== mutansok.length) fail('nem minden mutáns bukott el — az őrszem nem nyújt valódi védelmet')

if (failed) {
  console.error('\nBANKI IMPORT BEFIZETŐ ÖNELLENŐRZÉS: BUKOTT')
  process.exit(1)
}
console.log('\nBANKI IMPORT BEFIZETŐ ÖNELLENŐRZÉS: RENDBEN')
