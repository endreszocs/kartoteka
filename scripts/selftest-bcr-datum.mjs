#!/usr/bin/env node
/**
 * CORE BCR-PARSER DÁTUM önellenőrzés (P0-23, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-23 találata:
 *   A core (desktopot és a közös varázslót kiszolgáló) BCR-parser Date-cellás
 *   ága a régi `getUTCHours() < 12` heurisztikát futtatta. A SheetJS
 *   cellDates-artifactja pozitív időzónában (Románia, UTC+2/+3) a szándékolt
 *   D nap helyett a HELYI D−1 23:59:36-ot adja — ennek UTC-órája 21/20, tehát
 *   a heurisztika a HELYI komponenst olvasta: D−1 (rossz nap, évhatáron rossz
 *   év). A web 2026-06-19-i +12 órás kerekítés-javítása (563/563 igazolt)
 *   sosem került át a core-ba.
 *
 * A JAVÍTOTT VILÁG:
 *   (1) a +12 órás kerekítés (dateToLocalIso) a KÖZÖS @kartoteka/validations
 *       local-date moduljában él — viselkedése itt őrzött,
 *   (2) a core bcr.ts Date-ága erre delegál, a heurisztika eltűnt.
 *
 * NEGATÍV ASSZERT: a heurisztika visszaírása (mutáns) + a kerekítés kiütése.
 *
 * Futtatás:  node scripts/selftest-bcr-datum.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const LOCAL_DATE = path.join(REPO, 'packages', 'validations', 'src', 'local-date.ts')
const BCR = path.join(REPO, 'packages', 'core', 'src', 'finance', 'bank-import', 'bcr.ts')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const require_ = createRequire(path.join(REPO, 'package.json'))
let ts = null
try { ts = require_('typescript') } catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

let tmpSzamlalo = 0
function betolt(forras) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `kartoteka-bcrdatum-${tmpSzamlalo++}-`))
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"commonjs"}', 'utf8')
  const out = ts.transpileModule(forras, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: 'local-date.ts',
  })
  fs.writeFileSync(path.join(tmp, 'local-date.js'), out.outputText, 'utf8')
  return require_(path.join(tmp, 'local-date.js'))
}

const localDateRaw = fs.readFileSync(LOCAL_DATE, 'utf8')
const mod = betolt(localDateRaw)

// ── (1) A KÖZÖS dateToLocalIso viselkedése ──────────────────────────────────
if (typeof mod.dateToLocalIso !== 'function') {
  bukik('a @kartoteka/validations nem exportál dateToLocalIso-t — a core-nak nincs honnan importálnia')
} else {
  const januarOffset = new Date('2026-01-15T00:00:00').getTimezoneOffset()
  let hiba = 0
  // tiszta UTC-éjféli dátum-cella → aznap (minden időzónában)
  if (mod.dateToLocalIso(new Date(Date.UTC(2026, 0, 6))) !== '2026-01-06') { hiba++; bukik('dateToLocalIso(UTC-éjfél): nem aznapot ad') }
  if (januarOffset < 0) {
    // a SheetJS-artifact: a szándékolt 2026-01-06 nap → helyi 2026-01-05 23:59:36
    const artifact = new Date(2026, 0, 5, 23, 59, 36)
    const kapott = mod.dateToLocalIso(artifact)
    if (kapott !== '2026-01-06') { hiba++; bukik(`dateToLocalIso(SheetJS-artifact): várt 2026-01-06, kapott ${kapott}`) }
    // év-határ: a szándékolt 2026-01-01 → helyi 2025-12-31 23:59:36
    const evhatar = mod.dateToLocalIso(new Date(2025, 11, 31, 23, 59, 36))
    if (evhatar !== '2026-01-01') { hiba++; bukik(`dateToLocalIso(év-határ artifact): várt 2026-01-01, kapott ${evhatar}`) }
  } else {
    console.log('INFO: nem pozitív offsetű gép — az artifact-esetek kihagyva (az UTC-éjfél eset fut)')
  }
  if (hiba === 0) pass('a közös dateToLocalIso a tiszta és az artifact Date-cellát is a helyes napra kerekíti')
}

// ── (2) A CORE BCR Date-ága a közösre delegál, a heurisztika eltűnt ─────────
const bcrRaw = fs.readFileSync(BCR, 'utf8')
const bcrS = stripComments(bcrRaw)
{
  const i = bcrS.indexOf('function parseDateValue')
  const j = bcrS.indexOf('function parseAmountValue', i)
  const fn = i >= 0 && j > i ? bcrS.slice(i, j) : null
  if (!fn) {
    bukik('a core parseDateValue nem található (fail-closed)')
  } else {
    if (!fn.includes('dateToLocalIso')) bukik('a core BCR Date-ága nem a közös dateToLocalIso-ra delegál')
    if (/getUTCHours/.test(fn)) bukik('a core BCR Date-ágában még él a getUTCHours-heurisztika — az artifact-cellák −1 napra csúsznak')
  }
}
if (fail === 0) pass('a core BCR-parser Date-ága a közös +12 órás kerekítést használja')

// ── (3) NEGATÍV — mutánsok ───────────────────────────────────────────────────
if (fail === 0) {
  // M1: a kerekítés kiütése a közös helperben
  const m1raw = localDateRaw.replace(/\+ 12 \* 60 \* 60 \* 1000/, '+ 0')
  if (m1raw === localDateRaw) {
    bukik('M1 mutáció nem változtatott a helperen (fail-closed)')
  } else if (new Date('2026-01-15T00:00:00').getTimezoneOffset() < 0) {
    const m1 = betolt(m1raw)
    const rossz = m1.dateToLocalIso(new Date(2026, 0, 5, 23, 59, 36))
    if (rossz === '2026-01-06') bukik('M1: a kerekítés kiütésére az artifact-eset NEM bukik — vak')
    else pass('M1 mutáns (+12h kiütve) → az artifact-eset elbuktatja')
  } else {
    console.log('INFO: M1 csak pozitív offsetű gépen mérhető — kihagyva')
  }

  // M2: a heurisztika visszaírása a core-ba
  const m2 = bcrRaw.replace(/dateToLocalIso\(value\)/, '(value.getUTCHours() < 12 ? value.toISOString().slice(0, 10) : null)')
  if (m2 === bcrRaw) {
    bukik('M2 mutáció nem változtatott a core-on (fail-closed)')
  } else {
    const s2 = stripComments(m2)
    const i = s2.indexOf('function parseDateValue')
    const j = s2.indexOf('function parseAmountValue', i)
    const fn2 = i >= 0 && j > i ? s2.slice(i, j) : ''
    const megbukna = !fn2.includes('dateToLocalIso') || /getUTCHours/.test(fn2)
    if (!megbukna) bukik('M2: a heurisztika visszaírására az őr NEM bukik — vak')
    else pass('M2 mutáns (heurisztika visszaírva) → az őr elbuktatja')
  }
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — core BCR-dátum kezelés rendben`)
