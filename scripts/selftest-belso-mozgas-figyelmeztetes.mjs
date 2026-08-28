#!/usr/bin/env node
/**
 * BELSŐ MOZGÁS FIGYELMEZTETÉS önellenőrzés (2026-08-27, Endre kérése)
 *
 * MIT ŐRIZ — az élesben elsült VAKFOLTOT:
 *   A `computeInternalMovementHealth` korábbi szűrője `!!r.belso_mozgas_xkey` volt,
 *   vagyis CSAK a MÁR PÁROSÍTOTT sorokat nézte — és pontosan azokat szűrte ki,
 *   amiket jeleznie kellett volna. Élesben így maradt NÉMA 7 db kassza→bank letét
 *   (65 425 RON), amit a banki import sima bevételként írt be a 301.01 kódra,
 *   párosító kulcs nélkül. A felhasználó semmilyen figyelmeztetést nem kapott.
 *
 * AMIT BIZONYÍT (valódi számítással, nem szövegkereséssel):
 *   1. a párosító kulcs NÉLKÜLI, de belső-mozgás KATEGÓRIÁJÚ sort észreveszi;
 *   2. az ilyen sort `orphan`-ként jelöli (más üzenetet és külön számlálót kap);
 *   3. a szabályos párokra NEM ad hamis riasztást;
 *   4. a helyi kódkészlet nem húzott szét a kanonikus `BELSO_MOZGAS_ROGZITO_KODS`-tól.
 *
 * NEGATÍV ASSZERT: visszaállítjuk a RÉGI szűrőt a MAI forrásból, és bizonyítjuk,
 * hogy a régi világ elbukna az 1. próbán. Ha a régi is átmenne, az őr nem véd.
 *
 * Futtatás:  node scripts/selftest-belso-mozgas-figyelmeztetes.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const SRC = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'finance', 'internal-movement-health.ts')
const UI_TYPES = path.join(REPO_ROOT, 'packages', 'ui-app', 'src', 'finance', 'types.ts')

let failed = false
const fail = (msg) => { console.error(`FAIL: ${msg}`); failed = true }
const ok = (msg) => console.log(`OK:   ${msg}`)

if (!fs.existsSync(SRC)) { fail(`hiányzik a forrás: ${SRC}`); process.exit(1) }
const RAW = fs.readFileSync(SRC, 'utf8')

const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try { ts = require_('typescript') } catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-belsomozgas-selftest-'))

/** A modult NULLA importtal fordítjuk — ha bejön egy külső import, az hiba. */
function loadModule(source, label) {
  const out = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: 'internal-movement-health.ts',
  })
  if (/require\(["'][^."']/.test(out.outputText)) {
    fail(`${label}: a modul külső importot kapott — tiszta számoló modulnak kell maradnia`)
  }
  const file = path.join(tmp, `${label}.cjs`)
  fs.writeFileSync(file, out.outputText, 'utf8')
  return require_(file)
}

const mod = loadModule(RAW, 'mai')

// ── Próba-adat: a VALÓS élő eset kicsinyítve ─────────────────────────────
//   „arva”  = 301.01 kategória, NINCS belso_mozgas_xkey, nincs kassza-oldali pár
//             (pontosan a banki importból származó 7 sor mintája)
//   „paros” = szabályos pár: kassza-kiadás + bank-bevétel, közös kulccsal
const arvaBevetel = [
  { id: 101, osszeg: 2055, datum: '2026-02-18', belso_mozgas_xkey: null, bankszamla_id: 1, szamadasicelKod: '301.01' },
]
const parosBevetel = [
  { id: 201, osszeg: 500, datum: '2026-03-10', belso_mozgas_xkey: 'k-1', bankszamla_id: 1, szamadasicelKod: '301.01' },
]
const parosKiadas = [
  { id: 202, osszeg: 500, datum: '2026-03-10', belso_mozgas_xkey: 'k-1', bankszamla_id: null, szamadasicelKod: '400.01' },
]
// Sima (NEM belső mozgás) bevétel — erre SOHA nem szabad riasztani.
const simaBevetel = [
  { id: 301, osszeg: 2055, datum: '2026-02-18', belso_mozgas_xkey: null, bankszamla_id: 1, szamadasicelKod: '101.04' },
]

// ── 1. próba: az ÁRVA sort észreveszi ────────────────────────────────────
const r1 = mod.computeInternalMovementHealth(arvaBevetel, [])
if (r1.unpairedCount === 1) ok('az árva (kulcs nélküli) belső-mozgás sort észreveszi')
else fail(`az árva sort NEM veszi észre (unpairedCount=${r1.unpairedCount}) — visszatért a vakfolt`)

// ── 2. próba: árvának is jelöli, és külön számlálóba teszi ───────────────
if (r1.orphanCount === 1 && r1.items[0]?.orphan === true) ok('árvaként jelöli (orphanCount + orphan flag)')
else fail(`nincs árva-jelölés (orphanCount=${r1.orphanCount}, orphan=${r1.items[0]?.orphan})`)

if (typeof r1.items[0]?.description === 'string' && /nem a belső mozgás rögzítőn|NINCS párja/i.test(r1.items[0].description)) {
  ok('az árva sor saját, beszédes üzenetet kap')
} else {
  fail('az árva sor nem kap megkülönböztetett üzenetet')
}

// ── 3. próba: a szabályos párra NINCS riasztás ───────────────────────────
const r2 = mod.computeInternalMovementHealth(parosBevetel, parosKiadas)
if (r2.unpairedCount === 0) ok('a szabályos párra nem ad hamis riasztást')
else fail(`hamis riasztás a szabályos párra (unpairedCount=${r2.unpairedCount})`)

// ── 4. próba: a NEM belső mozgás kategóriát békén hagyja ─────────────────
const r3 = mod.computeInternalMovementHealth(simaBevetel, [])
if (r3.unpairedCount === 0) ok('a sima (nem belső mozgás) bevételt békén hagyja')
else fail(`hamis riasztás sima bevételre (unpairedCount=${r3.unpairedCount}) — a kódszűrő túl tág`)

// ── 5. próba: a kódkészlet nem húzott szét a kanonikustól ────────────────
if (!fs.existsSync(UI_TYPES)) {
  fail(`hiányzik a kanonikus forrás: ${UI_TYPES}`)
} else {
  const uiRaw = fs.readFileSync(UI_TYPES, 'utf8')
  const m = uiRaw.match(/BELSO_MOZGAS_ROGZITO_KODS\s*=\s*new Set\(\[([\s\S]*?)\]\)/)
  if (!m) fail('nem található a kanonikus BELSO_MOZGAS_ROGZITO_KODS a ui-app types.ts-ben')
  else {
    const kanonikus = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort()
    const helyi = [...mod.BELSO_MOZGAS_KODOK].sort()
    if (JSON.stringify(kanonikus) === JSON.stringify(helyi)) {
      ok(`a kódkészlet egyezik a kanonikussal (${helyi.join(', ')})`)
    } else {
      fail(`SZÉTHÚZÁS: helyi=[${helyi}] ≠ kanonikus=[${kanonikus}]`)
    }
  }
}

// ── 6. próba: ÉVHATÁRON átnyúló, SZABÁLYOS pár → NINCS riasztás ─────────
// A Pénzügy fül az adott ÉV sorait tölti be. Egy évfordulós átvezetés két lába
// eltérő évre eshet (kassza-láb dec. 31., banki jóváírás jan. 2.), ezért a
// ±7 napos ablak SOHA nem tud átnyúlni az évhatáron — a jelzés soha nem tűnne
// el magától. A párosító KULCS léte bizonyítja, hogy a pár szabályosan létrejött.
const evhatarKulccsal = [
  { id: 701, osszeg: 9000, datum: '2026-12-30', belso_mozgas_xkey: 'ev-1', bankszamla_id: 1, szamadasicelKod: '301.01' },
]
const r6 = mod.computeInternalMovementHealth(evhatarKulccsal, [])
if (r6.unpairedCount === 0) ok('az évhatár közeli, KULCCSAL bíró pár nem ad örökös hamis riasztást')
else fail(`hamis riasztás évhatáron (unpairedCount=${r6.unpairedCount}) — a jelzés soha nem tűnne el`)

// ── 7. próba: az ÉVHATÁR NEM fedheti el az ÁRVA sort ─────────────────────
// Ez a fontos ellenpróba: az elnyomás CSAK a kulccsal bíró sorokra szól.
// Egy árva (kulcs nélküli) sor december 30-án is HIBÁS, és jeleznie kell.
const evhatarArva = [
  { id: 702, osszeg: 9000, datum: '2026-12-30', belso_mozgas_xkey: null, bankszamla_id: 1, szamadasicelKod: '301.01' },
]
const r7 = mod.computeInternalMovementHealth(evhatarArva, [])
if (r7.unpairedCount === 1 && r7.orphanCount === 1) {
  ok('az évhatár-elnyomás NEM fedi el az árva sort (az továbbra is jelez)')
} else {
  fail(`az évhatár-elnyomás ELFEDTE az árva sort (unpaired=${r7.unpairedCount}, orphan=${r7.orphanCount}) — pont a hibás sort némítanánk el`)
}

// ══════════════════════════════════════════════════════════════════════════
//  NEGATÍV ASSZERT — a RÉGI világ visszajátszása a MAI forrásból
// ══════════════════════════════════════════════════════════════════════════
const REGI = RAW.replace(
  /const isInternal = \(r: InternalMovementRow\) =>[\s\S]*?BELSO_MOZGAS_KODOK\.has\(r\.szamadasicelKod\)\)/,
  'const isInternal = (r: InternalMovementRow) => !!r.belso_mozgas_xkey',
)
if (REGI === RAW) {
  fail('a régi viselkedést nem sikerült visszajátszani — az őrszem nem bizonyított (fail-closed)')
} else {
  const regiMod = loadModule(REGI, 'regi')
  const rRegi = regiMod.computeInternalMovementHealth(arvaBevetel, [])
  if (rRegi.unpairedCount === 0) {
    ok('negatív asszert: a RÉGI szűrő valóban NÉMA maradt az árva sorra (0 riasztás) — a javítás valódi')
  } else {
    fail(`AZ ŐRSZEM NEM BIZONYÍT: a régi szűrő is jelzett volna (${rRegi.unpairedCount}) — akkor nem ez volt a hiba oka`)
  }
}

// ── Zárás ────────────────────────────────────────────────────────────────
try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
if (failed) {
  console.error('\nBELSŐ MOZGÁS FIGYELMEZTETÉS ÖNELLENŐRZÉS: BUKOTT')
  process.exit(1)
}
console.log('\nBELSŐ MOZGÁS FIGYELMEZTETÉS ÖNELLENŐRZÉS: RENDBEN')
