#!/usr/bin/env node
/**
 * CORE STORNÓ PÁR-ÉVZÁR önellenőrzés (D6 / D-blokk, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P2-találata:
 * a web 2026-08-27 óta a belső-mozgás pár MINDKÉT lábának évére ellenőriz
 * év-zárat sztornó/visszavonás előtt, a core (desktop) viszont csak a
 * KATTINTOTT sor évére — miközben a kaszkád mindkét lábat átírja. Egy
 * évforduló-átvezetésnél (kassza-láb dec. 31., bank-láb jan. 2.) a desktop
 * sztornó némán módosította a MÁR VÉGLEGESÍTETT év tételeit is.
 *
 * A JAVÍTÁS: közös, fail-closed `belsoMozgasParEvei` helper a core-ban (a
 * web azonos nevű helperének tükre), és mindhárom core út (befizetes/storno,
 * kiadas/storno, undo-storno) a pár MINDEN évére ellenőriz, MIELŐTT írna.
 * Ha a pár nem deríthető fel, a művelet megszakad (nem tippelünk).
 *
 * NEGATÍV ASSZERT: hívás-eltávolító + fail-open mutánsok.
 *
 * Futtatás:  node scripts/selftest-storno-par-evzar.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const HELPER = path.join(REPO, 'packages', 'core', 'src', 'finance', 'belsomozgas', 'par-evei.ts')
const BEF = path.join(REPO, 'packages', 'core', 'src', 'finance', 'befizetes', 'storno.ts')
const KIA = path.join(REPO, 'packages', 'core', 'src', 'finance', 'kiadas', 'storno.ts')
const UNDO = path.join(REPO, 'packages', 'core', 'src', 'finance', 'undo-storno.ts')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function ellenoriz(files) {
  const hibak = []

  // ── (1) a közös helper fail-closed ──
  if (!files.has(HELPER)) {
    hibak.push('belsomozgas/par-evei.ts HIÁNYZIK — nincs közös pár-év felderítő')
    return hibak
  }
  const h = stripComments(files.get(HELPER))
  if (!/if \(befRes\.error \|\| kiaRes\.error\)/.test(h)) {
    hibak.push('helper: a lekérdezési hiba nincs lekezelve — fail-open pár-felderítés')
  }
  if (!/evek\.size === 0/.test(h)) {
    hibak.push('helper: az üres év-halmaz nincs fail-closed elutasítva')
  }

  // ── (2) mindhárom core út a pár éveire ellenőriz, MIELŐTT írna ──
  for (const [nev, fajl] of [['befizetes/storno', BEF], ['kiadas/storno', KIA], ['undo-storno', UNDO]]) {
    const s = stripComments(files.get(fajl))
    const iHivas = s.indexOf('belsoMozgasParEvei(')
    const iIras = s.indexOf('.update(payload)')
    if (iHivas < 0) {
      hibak.push(`${nev}: nem hívja a belsoMozgasParEvei helpert — a pár másik lábának éve ellenőrizetlen`)
    } else if (iIras >= 0 && iHivas > iIras) {
      hibak.push(`${nev}: a pár-év ellenőrzés az ÍRÁS UTÁN fut — a zárt év addigra már módosult`)
    }
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const f of [BEF, KIA, UNDO]) m.set(f, fs.readFileSync(f, 'utf8'))
  if (fs.existsSync(HELPER)) m.set(HELPER, fs.readFileSync(HELPER, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('core sztornó/visszavonás: a pár MINDEN évére fail-closed év-zár, írás előtt')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a hívás kikötése a befizetes/storno-ból
  const m1files = beolvas()
  const b = m1files.get(BEF)
  const bMut = b.replace(/belsoMozgasParEvei\(/g, 'belsoMozgasParEvei_KIKAPCSOLVA(')
  m1files.set(BEF, bMut)
  if (bMut === b) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1files).length === 0) bukik('M1: a hívás kikötésére az őr NEM bukik — vak')
  else pass('M1 mutáns (pár-év hívás kikötve) → az őr elbuktatja')

  // M2: a helper fail-open-re vakítása (a hibaág kiütése)
  const m2files = beolvas()
  const hp = m2files.get(HELPER)
  const hpMut = hp.replace(/if \(befRes\.error \|\| kiaRes\.error\)/, 'if (false)')
  m2files.set(HELPER, hpMut)
  if (hpMut === hp) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2files).length === 0) bukik('M2: a fail-open mutánsra az őr NEM bukik — vak')
  else pass('M2 mutáns (helper hibaág kiütve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — core sztornó pár-évzár rendben`)
