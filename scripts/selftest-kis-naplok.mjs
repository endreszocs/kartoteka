#!/usr/bin/env node
/**
 * KATEKÉZIS + CSALÁDLÁTOGATÁS naplólapok önellenőrzése (2026-08-14, 18. pont
 * 2. szelet) — build/tesztkeret nélkül futtatható.
 *
 * MIT ŐRIZ: a hivatalos CsL/BL besorolást, az éven belül folyamatos
 * sorszámozást a laphatáron át, a lapokra bontást, a Jegyzet-összefűzést
 * (bibliai rész + ének + egyéb) és a hivatalos oszlopfejléceket.
 *
 * Futtatás:  node scripts/selftest-kis-naplok.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const SRC = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'worklog', 'kis-naplok.ts')

let failed = false
const fail = (msg) => { console.error(`FAIL: ${msg}`); failed = true }
const ok = (msg) => console.log(`OK:   ${msg}`)

if (!fs.existsSync(SRC)) { fail(`hiányzik a forrás: ${SRC}`); process.exit(1) }

const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try { ts = require_('typescript') } catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-kis-naplok-selftest-'))
const out = ts.transpileModule(fs.readFileSync(SRC, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: 'kis-naplok.ts',
})
if (/require\(["'][^."']/.test(out.outputText)) {
  fail('FUTÁSIDEJŰ IMPORT került a fájlba — a modulnak önállónak kell maradnia.')
  process.exit(1)
}
const dest = path.join(tmp, 'kis-naplok.js')
fs.writeFileSync(dest, out.outputText, 'utf8')
const M = require_(dest)

const {
  KIS_NAPLO_SOR_PER_LAP,
  csalBlJel,
  buildKatekezisNaploLapok,
  buildCsaladlatogatasNaploLapok,
} = M

const sor = (t = {}) => ({
  idopont: '2026-03-01', jellege: 'Vallásóra 1. csoport', cim: 'Tízparancsolat',
  jelenlet_ferfi: null, jelenlet_no: null, jelenlet_gyermek: null,
  jelenlet_osszesen: 12, szolgalt: 'Szőcs Endre', persely: null,
  megjegyzes: null, bibliaolvasas: null, enekek: null, ...t,
})

// N1: CsL/BL — a hivatalos két kategória (beteg-jellegű → BL, minden más → CsL)
const blEsetek = [
  ['Beteglátogatás', 'BL'], ['Kórházlátogatás', 'BL'], ['Idősek otthona', 'BL'],
  ['Családlátogatás', 'CsL'], ['Börtönlátogatás', 'CsL'], ['Egyéb látogatás', 'CsL'],
  [null, 'CsL'],
]
for (const [jellege, vart] of blEsetek) {
  if (csalBlJel(jellege) === vart) ok(`N1: csalBlJel(${jellege ?? 'null'}) = ${vart}`)
  else fail(`N1: csalBlJel(${jellege}) = ${csalBlJel(jellege)}, várt: ${vart}`)
}

// N2: folyamatos sorszám a LAPHATÁRON át (spec: éven belül folyamatos)
const sokSor = Array.from({ length: KIS_NAPLO_SOR_PER_LAP + 3 }, (_, i) =>
  sor({ idopont: `2026-03-${String((i % 28) + 1).padStart(2, '0')}` }))
const html2 = buildKatekezisNaploLapok(sokSor, 'Teszt Gyülekezet', '2026')
const lapDb = (html2.match(/class="page"/g) || []).length
if (lapDb === 2) ok(`N2a: ${sokSor.length} sor → 2 lap (${KIS_NAPLO_SOR_PER_LAP}/lap)`)
else fail(`N2a: ${sokSor.length} sorra ${lapDb} lap jött (várt: 2)`)
const utolsoSorszam = `<td class="text-center">${sokSor.length}</td>`
if (html2.includes(utolsoSorszam)) ok('N2b: a sorszám a laphatáron át folyamatos')
else fail('N2b: az utolsó sorszám nem folyamatos a laphatáron át!')

// N3: a Jegyzet a bibliai részt, az énekeket és a megjegyzést fűzi össze
const csHtml = buildCsaladlatogatasNaploLapok(
  [sor({ jellege: 'Beteglátogatás', cim: 'Kovács család', bibliaolvasas: 'Zsolt 23', enekek: '90, 265', megjegyzes: 'úrvacsorát kért' })],
  'Teszt Gyülekezet', '2026',
)
if (csHtml.includes('Zsolt 23 · é.: 90, 265 · úrvacsorát kért') && csHtml.includes('>BL<')) {
  ok('N3: Jegyzet-összefűzés (bibliai rész · ének · egyéb) + BL jel')
} else fail('N3: a Jegyzet-összefűzés vagy a BL jel hiányzik!')

// N4: a hivatalos oszlopfejlécek jelen vannak
if (html2.includes('Katekézis jellege') && html2.includes('Tananyag') && html2.includes('A katekézist tartotta')) {
  ok('N4a: Katekézis lap hivatalos fejlécei')
} else fail('N4a: hiányzó Katekézis-fejléc!')
if (csHtml.includes('CsL/BL') && csHtml.includes('A meglátogatott család neve') && csHtml.includes('A meglátogatott család címe')) {
  ok('N4b: Családlátogatás lap hivatalos fejlécei')
} else fail('N4b: hiányzó Családlátogatás-fejléc!')

// N5: üres időszak → üres-állapot sor, nem üres tábla
const ures = buildKatekezisNaploLapok([], 'Teszt', '2026')
if (ures.includes('Nincs bejegyzés az időszakban.')) ok('N5: üres időszak kimondva')
else fail('N5: üres időszaknál néma üres tábla!')

// N6: a jelenlét részszám-összegre esik vissza, ha az összesen 0
const reszHtml = buildKatekezisNaploLapok(
  [sor({ jelenlet_osszesen: 0, jelenlet_ferfi: 3, jelenlet_no: 4, jelenlet_gyermek: 5 })],
  'Teszt', '2026',
)
if (reszHtml.includes('<td class="text-center">12</td>')) ok('N6: jelenlét fallback (3+4+5=12)')
else fail('N6: a jelenlét-fallback nem működik!')

// N7: az anyakönyv-szinkron a HIVATALOS típusneveket írja (F./N. bontás,
// Azonos/Vegyes esketés) — forrás-őr a legacy nevekre való visszacsúszás ellen.
const anyak = fs.readFileSync(
  path.join(REPO_ROOT, 'apps', 'web', 'app', '(dashboard)', 'anyakonyv', 'actions.ts'), 'utf8',
)
if (anyak.includes("'F. keresztelő'") && anyak.includes("'Azonos esketés'") && anyak.includes("'F. temetés'")) {
  ok('N7: az anyakönyv-szinkron hivatalos típusneveket ír')
} else fail('N7: az anyakönyv-szinkron visszacsúszott a legacy típusnevekre!')

if (failed) { console.error('\nKIS-NAPLÓK selftest: HIBA'); process.exit(1) }
console.log('\nKIS-NAPLÓK selftest: minden rendben ✅')
