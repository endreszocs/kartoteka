// selftest-tagnyilvantartas-gyik.mjs — a Gyakori kérdések rovat őrszeme (2026-09-05)
//
// ⛔ MIÉRT KELL
//   A rovat a lelkész 38 válaszát rögzíti SZABÁLYKÉNT. Ha egy tétel kiesik,
//   megkettőződik, vagy egy szabály-szöveg elveszti a kulcsállítását (pl. a
//   temetés év-határ esete, a házassági kettős név példája), a súgó némán
//   hazudik. A modult VALÓDIAN betöltjük (TS-transpile), nem mintát grepelünk,
//   és mutáns-negatívokkal bizonyítjuk, hogy az ellenőrzés tényleg lát.
//
// ŐRSZEMEK
//   T1–T6   tartalom: 38 tétel, 1..38 hézag nélkül, 4 csoport, kitöltöttség
//   S1–S4   kulcsállítások a válaszokban (7, 8, 15, 30)
//   B1–B3   bekötés: a súgó regisztrálja a kategóriát és rendereli a rovatot
//   N1–N3   mutáns-negatívok: hiányzó tétel / dupla sorszám / üres válasz BUKIK

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let total = 0
let failedCount = 0
function assert(cond, msg) {
  total += 1
  if (cond) console.log(`OK:   ${msg}`)
  else {
    failedCount += 1
    console.error(`FAIL: ${msg}`)
  }
}

let ts
try {
  ts = require_(path.join(ROOT, 'node_modules/typescript'))
} catch {
  console.log('typescript nem elérhető — a selftest kihagyva (nem hiba).')
  process.exit(0)
}

const ADATOK_SRC = path.join(ROOT, 'apps/web/components/members/tagnyilvantartas-gyik-adatok.ts')
const ROVAT_SRC = path.join(ROOT, 'apps/web/components/members/tagnyilvantartas-gyik.tsx')
const SUGO_SRC = path.join(ROOT, 'apps/web/components/members/tagnyilvantartas-help.tsx')

function loadTsModule(src) {
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mod = { exports: {} }
  new Function('module', 'exports', 'require', js)(mod, mod.exports, require_)
  return mod.exports
}

// ── A validátor: ugyanazt kéri számon, amit az őrszem, hogy a mutánsok
//    ellene fussanak (nem az asszert-listát duplikáljuk kézzel).
function validate(tetelek, csoportok) {
  const hibak = []
  if (tetelek.length !== 38) hibak.push(`38 tétel kell, van ${tetelek.length}`)
  const sorszamok = tetelek.map((t) => t.sorszam)
  const egyedi = new Set(sorszamok)
  if (egyedi.size !== sorszamok.length) hibak.push('dupla sorszám')
  for (let i = 1; i <= 38; i++) if (!egyedi.has(i)) hibak.push(`hiányzik a(z) ${i}. tétel`)
  const csoportIds = new Set(csoportok.map((c) => c.id))
  for (const t of tetelek) {
    if (!csoportIds.has(t.csoport)) hibak.push(`${t.sorszam}: ismeretlen csoport ${t.csoport}`)
    if (typeof t.kerdes !== 'string' || t.kerdes.trim().length < 15) hibak.push(`${t.sorszam}: üres/rövid kérdés`)
    if (typeof t.valasz !== 'string' || t.valasz.trim().length < 25) hibak.push(`${t.sorszam}: üres/rövid válasz`)
    if (!['kesz', 'reszben', 'fejlesztes'].includes(t.allapot)) hibak.push(`${t.sorszam}: ismeretlen állapot ${t.allapot}`)
    if (t.allapot !== 'kesz' && t.allapot !== 'fejlesztes' && !t.megjegyzes) hibak.push(`${t.sorszam}: 'reszben' megjegyzés nélkül`)
  }
  return hibak
}

const adatok = loadTsModule(fs.readFileSync(ADATOK_SRC, 'utf8'))
const { GYIK_TETELEK, GYIK_CSOPORTOK, GYIK_ALLAPOT_FELIRAT } = adatok

// ── T: tartalom ─────────────────────────────────────────────────────────────
const hibak = validate(GYIK_TETELEK, GYIK_CSOPORTOK)
assert(hibak.length === 0, `T1: a 38 tétel szerkezetileg ép (${hibak.join('; ') || 'nincs hiba'})`)
assert(GYIK_CSOPORTOK.length === 4, 'T2: négy csoport (anyakönyv, sorszám, név-kivonat, tagnyilvántartás)')
const perCsoport = Object.fromEntries(GYIK_CSOPORTOK.map((c) => [c.id, GYIK_TETELEK.filter((t) => t.csoport === c.id).length]))
assert(
  perCsoport['anyakonyv'] === 6 && perCsoport['sorszam'] === 8 && perCsoport['nev-kivonat'] === 8 && perCsoport['tagnyilvantartas'] === 16,
  `T3: csoport-méretek 6/8/8/16 (${JSON.stringify(perCsoport)})`,
)
assert(
  GYIK_TETELEK.every((t, i) => i === 0 || GYIK_TETELEK[i - 1].sorszam < t.sorszam),
  'T4: a tételek sorszám szerint növekvő sorrendben állnak',
)
assert(
  ['kesz', 'reszben', 'fejlesztes'].every((k) => typeof GYIK_ALLAPOT_FELIRAT[k] === 'string' && GYIK_ALLAPOT_FELIRAT[k].length > 0),
  'T5: mind a három állapotnak van felirata',
)
assert(
  GYIK_TETELEK.filter((t) => t.allapot === 'fejlesztes').every((t) => !t.valasz.includes('jelenleg') || t.megjegyzes),
  'T6: a szabály-szöveg nem a mai állapotot írja le („jelenleg”), az a megjegyzésé',
)

// ── S: kulcsállítások (a lelkész válaszainak sarokpontjai) ──────────────────
const by = (n) => GYIK_TETELEK.find((t) => t.sorszam === n)
assert(/esemény évének kötetében/.test(by(7).valasz) && /beírás sorrendjét/.test(by(7).valasz), 'S1: 7. — a beírás sorrendje, de az esemény évének kötetében')
assert(/temetés napja/.test(by(8).valasz) && /következő/.test(by(8).valasz) && /halál/.test(by(8).valasz), 'S2: 8. — a temetés napja számít, és az év-határ eset külön ki van térve')
assert(/Szőcs Endréné Ungvári Rebeka/.test(by(15).valasz) && /bejegyzéskori név/.test(by(15).valasz), 'S3: 15. — bejegyzéskori név + házassági kettős név példa')
assert(/járulékot fizetett vagy felmentést/.test(by(30).valasz) && /webes/.test(by(30).valasz), 'S4: 30. — a webes, járulék-alapú névjegyzék a hivatalos')
assert(/egyházmegyei szinten/.test(by(1).valasz) && /dokumentálva/.test(by(1).valasz), 'S5: 1. — feloldás csak egyházmegyei szinten, dokumentálva')
assert(/nem törlünk/.test(by(3).valasz) && /érvénytelenít/.test(by(3).valasz), 'S6: 3. — nincs törlés, érvénytelenítés van')

// ── B: bekötés a súgóba ─────────────────────────────────────────────────────
const sugo = fs.readFileSync(SUGO_SRC, 'utf8')
const rovat = fs.readFileSync(ROVAT_SRC, 'utf8')
assert(/id:\s*'gyik'/.test(sugo) && /label:\s*'Gyakori kérdések'/.test(sugo), 'B1: a súgó kategória-listájában szerepel a Gyakori kérdések')
assert(/active === 'gyik' && <GyikContent \/>/.test(sugo) && /import \{ GyikContent \} from '\.\/tagnyilvantartas-gyik'/.test(sugo), 'B2: a súgó rendereli a GyikContent-et')
assert(/GYIK_TETELEK/.test(rovat) && /GYIK_CSOPORTOK/.test(rovat) && /GYIK_ALLAPOT_FELIRAT/.test(rovat), 'B3: a rovat az adat-modulból dolgozik (nem másolat)')

// ── N: mutáns-negatívok — a validátornak BUKNIA kell ────────────────────────
const nélkül = GYIK_TETELEK.filter((t) => t.sorszam !== 8)
assert(validate(nélkül, GYIK_CSOPORTOK).some((h) => h.includes('hiányzik a(z) 8.')), 'N1: hiányzó tételt a validátor észreveszi')
const dupla = [...GYIK_TETELEK, { ...by(12), sorszam: 12 }]
assert(validate(dupla, GYIK_CSOPORTOK).some((h) => h.includes('dupla sorszám')), 'N2: dupla sorszámot a validátor észreveszi')
const ures = GYIK_TETELEK.map((t) => (t.sorszam === 21 ? { ...t, valasz: '' } : t))
assert(validate(ures, GYIK_CSOPORTOK).some((h) => h.includes('21: üres/rövid válasz')), 'N3: üres választ a validátor észreveszi')

console.log(`\n${total - failedCount}/${total} őrszem rendben.`)
if (failedCount > 0) process.exit(1)
