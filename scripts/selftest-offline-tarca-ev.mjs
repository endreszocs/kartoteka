#!/usr/bin/env node
/**
 * OFFLINE IRATSZÁM-TÁRCA ÉV önellenőrzés (D15 / D-blokk, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P2-találata:
 * a core befizetés-mentés offline ága az iratszámot a `fizetettev`-alapú
 * `year`-ből foglalta a tárcából, míg az ONLINE út a `datum` évéből számol
 * (a könyvelési év a kánon). Pótlásnál (is_potlas: 2024-re szóló befizetés
 * 2026-ban) az offline út a ROSSZ év pooljából égetett el hivatalos
 * sorszámot — a 2024-es hézagmentes sorozatba lyukat ütve.
 *
 * A JAVÍTÁS: a tárca-foglalás a `datum` évéből megy (iratszamEv), a
 * `fizetettev` mező változatlanul a jogcím-évet tárolja.
 * (A kiadás-oldal mindig is a datum évéből foglalt — az érintetlen.)
 *
 * NEGATÍV ASSZERT: a foglalás visszafordítása a fizetettev-alapú évre.
 *
 * Futtatás:  node scripts/selftest-offline-tarca-ev.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const FAJL = path.join(REPO, 'packages', 'core', 'src', 'finance', 'befizetes', 'save.ts')

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

  const iBranch = s.indexOf('async function saveIncomeOfflineBranch')
  if (iBranch < 0) { hibak.push('a saveIncomeOfflineBranch nem található (fail-closed)'); return hibak }
  const branch = s.slice(iBranch)

  const iClaim = branch.indexOf('claimNextIratszamNumber(')
  if (iClaim < 0) { hibak.push('a tárca-foglalás nem található (fail-closed)'); return hibak }

  // (1) a foglalás a datum-évből megy (iratszamEv), nem a fizetettev-alapú
  // year-ből — PONTOS hívás-regex, hogy a lenti hibaüzenet ${iratszamEv}-je
  // ne fedhesse el a visszafordítást.
  if (!/claimNextIratszamNumber\(\s*clean\.congregationId,\s*'befizetes',\s*iratszamEv,/.test(branch)) {
    hibak.push('a tárca-foglalás nem a datum évéből (iratszamEv) megy — pótlásnál a rossz év sorozatából ég el szám')
  }
  if (!/const iratszamEv = new Date\(clean\.datum\)\.getFullYear\(\)/.test(branch.slice(0, iClaim + 100))) {
    hibak.push('az iratszamEv nem a clean.datum évéből számolódik')
  }
  // (2) a fizetettev viszont marad a jogcím-év (year)
  if (!/fizetettev: year\b/.test(branch)) {
    hibak.push('a fizetettev már nem a jogcím-évet tárolja — a jelentés-oldal (tartozás) elromlana')
  }

  return hibak
}

const src = fs.readFileSync(FAJL, 'utf8')
const hibak = ellenoriz(src)
if (hibak.length === 0) {
  pass('offline tárca: iratszám a datum évéből, fizetettev a jogcím-évből')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutáns ────────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a foglalás visszafordítása a fizetettev-alapú évre
  const m1 = src.replace(/iratszamEv,/, 'year,')
  if (m1 === src) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: a visszafordításra az őr NEM bukik — vak')
  else pass('M1 mutáns (foglalás visszafordítva a fizetettev-évre) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — offline tárca-év rendben`)
