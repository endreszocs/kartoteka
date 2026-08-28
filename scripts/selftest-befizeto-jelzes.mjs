#!/usr/bin/env node
/**
 * HIÁNYZÓ-BEFIZETŐ JELZÉS önellenőrzés (2026-08-28, Endre észrevétele)
 *
 * MIT ŐRIZ — Endre 2026-08-28-i szabálya: a narancssárga „nincs személy vagy
 * család hozzárendelve" jelzés CSAK ott indokolt, ahol tudni kell, KI
 * fizetett — az adományoknál, az egyházfenntartásnál, a szponzor-
 * támogatásoknál és a bérjövedelmeknél. Máshol (pl. „Készpénzletétel a
 * kasszából", kamat, díjbevétel) a jelzés csak zaj volt: MINDEN bevételen
 * ott világított.
 *
 * A SZABÁLY (BankTab):
 *   - 101.01 (egyházfenntartói járulék): SZIGORÚ — személy/család kell
 *     (a tartozás-nyilvántartás miatt; a szabad szöveges név nem elég);
 *   - adomány/szponzor kódcsalád (a core ADOMANY_KODOK 10 kódja) +
 *     bérjövedelmek (101.06, 104.04, 104.05): személy/család VAGY név/cég
 *     szöveg elég (a rendszer a cégnevet megjegyzi);
 *   - MINDEN MÁS kód: nincs jelzés.
 *
 * NEGATÍV ASSZERT: szabály-lazító mutánsok.
 *
 * Futtatás:  node scripts/selftest-befizeto-jelzes.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const BANKTAB = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'BankTab.tsx')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function ellenoriz(src) {
  const hibak = []
  const s = stripComments(src)

  // (1) az adomány-kódcsalád a core közös listájából jön (nem kézi másolat)
  if (!/ADOMANY_KODOK/.test(s)) {
    hibak.push('a BankTab nem a core ADOMANY_KODOK listáját használja — a két hely széthúzna')
  }
  // (2) a bérjövedelem-kódok benne vannak a jelzés-listában
  for (const kod of ['101.06', '104.04', '104.05']) {
    if (!s.includes(`'${kod}'`)) {
      hibak.push(`a bérjövedelem-kód (${kod}) hiányzik a jelzés-listából`)
    }
  }
  // (3) a szigorú ág a járulékra (101.01) továbbra is él
  if (!/101\.01/.test(s)) {
    hibak.push('a járulék (101.01) szigorú ága eltűnt')
  }
  // (4) a nem-listás kódokra NINCS jelzés (a hasMissingPerson a listához kötött)
  if (!/befizetoJelzesKell\b/.test(s)) {
    hibak.push('nincs pozitív-listás kapu (befizetoJelzesKell) — minden bevételen világítana a jelzés')
  }
  return hibak
}

const src = fs.readFileSync(BANKTAB, 'utf8')
const hibak = ellenoriz(src)
if (hibak.length === 0) {
  pass('hiányzó-befizető jelzés: pozitív lista (járulék szigorú + adomány/szponzor/bér) a helyén')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a pozitív-listás kapu kiütése (átnevezés — a \b-s ellenőrzés fogja)
  const m1 = src.replace(/befizetoJelzesKell/g, 'befizetoJelzesKell_KIKAPCSOLVA')
  if (m1 === src) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: a kapu kiütésére az őr NEM bukik — vak')
  else pass('M1 mutáns (pozitív-listás kapu kiütve) → az őr elbuktatja')

  // M2: a bérjövedelem-kódok kigyomlálása
  const m2 = src.replace(/'104\.04',?\s*/g, '')
  if (m2 === src) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2).length === 0) bukik('M2: a bér-kód törlésére az őr NEM bukik — vak')
  else pass('M2 mutáns (bér-kód kigyomlálva) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — hiányzó-befizető jelzés rendben`)
