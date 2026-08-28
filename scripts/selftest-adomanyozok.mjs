#!/usr/bin/env node
/**
 * ADOMÁNYOZÓK ÉS SZPONZOROK önellenőrzés (2026-08-27, Endre 5. kérése)
 *
 * MIT ŐRIZ — három, egymástól független módon elromolható dolog:
 *
 *   (1) A 10 KÓD egyezik-e BETŰRE a hivatalos EREK-katalógussal
 *       (`migration-docs/excel-2026-katalogus.json`). Endre külön kérése volt,
 *       hogy „tökéletesen egyezzen az Excelben található kódokkal". Egy elgépelt
 *       kód itt NÉMÁN kihagyna egy egész adomány-kategóriát a listából — és a
 *       hiányzó pénz sehol nem jelenne meg hibaként.
 *       Ugyanitt őrizzük, hogy KIADÁS-kód (2xx) ne kerülhessen be: a 202.04 és a
 *       203.01 neve is tartalmazza a „támogatás" szót, de azok azt írják le,
 *       amit MI adunk másnak.
 *
 *   (2) AZ ÖSSZEVONÁS VISELKEDÉSE — ugyanaz a tag ne essen szét két sorra a
 *       névírás miatt, két KÜLÖNBÖZŐ adományozó viszont ne olvadjon össze;
 *       a készpénz/bank bontás stimmeljen; a besorolás a mérhető jelekből jöjjön.
 *
 *   (3) A LEKÉRDEZÉS SZŰRŐI a weben ÉS a desktopon — ugyanaz a halmaz.
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): minden szöveges
 * őrhöz visszajátsszuk a hibás világot, és bizonyítjuk, hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-adomanyozok.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const MAG = path.join(REPO, 'packages', 'core', 'src', 'finance', 'adomanyozok', 'aggregate.ts')
const JW = path.join(REPO, 'packages', 'core', 'src', 'finance', 'hasonlo-tetel', 'jaro-winkler.ts')
const KATALOGUS = path.join(REPO, 'migration-docs', 'excel-2026-katalogus.json')
const WEB = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'adomanyozok-actions.ts')
const DESKTOP = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'finance-entry-lookups.ts')

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')

let failed = false
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true }
const ok = (m) => console.log(`OK:   ${m}`)

for (const f of [MAG, JW, KATALOGUS, WEB, DESKTOP]) {
  if (!fs.existsSync(f)) { fail(`hiányzik: ${f}`); process.exit(1) }
}

const require_ = createRequire(path.join(REPO, 'package.json'))
let ts = null
try { ts = require_('typescript') } catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

// ── A MAG BETÖLTÉSE ──────────────────────────────────────────────────────
const magRaw = olvas(MAG)
const jwRaw = olvas(JW)

let szamlalo = 0
function betolt(forras) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `kartoteka-adom-${szamlalo++}-`))
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"commonjs"}', 'utf8')
  // A mappa-szerkezetet TÜKRÖZNI kell: az aggregate.ts a `../hasonlo-tetel/…`
  // relatív úton importál, tehát mindkét fájlnak a saját mappájába kell kerülnie.
  fs.mkdirSync(path.join(tmp, 'hasonlo-tetel'), { recursive: true })
  fs.mkdirSync(path.join(tmp, 'adomanyozok'), { recursive: true })
  const emit = (nev, src, file) => {
    const out = ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: file,
    })
    fs.writeFileSync(path.join(tmp, nev), out.outputText, 'utf8')
  }
  emit(path.join('hasonlo-tetel', 'jaro-winkler.js'), jwRaw, 'jaro-winkler.ts')
  emit(path.join('adomanyozok', 'aggregate.js'), forras, 'aggregate.ts')
  return require_(path.join(tmp, 'adomanyozok', 'aggregate.js'))
}

const mod = betolt(magRaw)
const { ADOMANY_KODOK, osszesitAdomanyozok, adomanyKodE, cegGyanusNev } = mod

// ── (1) A KÓDOK EGYEZNEK A HIVATALOS KATALÓGUSSAL ───────────────────────
const katRaw = JSON.parse(fs.readFileSync(KATALOGUS, 'utf8'))
const kat = Array.isArray(katRaw)
  ? katRaw
  : (katRaw.items || katRaw.kategoriak || Object.values(katRaw).find((v) => Array.isArray(v)) || [])
if (!kat.length) { fail('a katalógus nem olvasható tömbként'); process.exit(1) }
const katMap = new Map(kat.map((k) => [String(k.kod), String(k.nev)]))

if (ADOMANY_KODOK.length !== 10) fail(`10 adomány-kódot várunk, ${ADOMANY_KODOK.length} van`)
else ok('10 adomány/szponzor kód')

for (const k of ADOMANY_KODOK) {
  const katNev = katMap.get(k.kod)
  if (!katNev) { fail(`(1) a ${k.kod} kód NINCS a hivatalos katalógusban`); continue }
  if (katNev !== k.nev) fail(`(1) ${k.kod} neve eltér — katalógus: „${katNev}", kód: „${k.nev}"`)
  else ok(`(1) ${k.kod} — ${k.nev}`)
  // KIADÁS-kód nem kerülhet a BEVÉTELI listába.
  if (/^2/.test(k.kod)) fail(`(1) ${k.kod} KIADÁS-kód (2xx) — ez azt írja le, amit MI adunk másnak`)
}
if (ADOMANY_KODOK.some((k) => /^2/.test(k.kod))) {
  // már jelezve fent
} else ok('(1) egyetlen KIADÁS-kód (2xx) sincs a listában')

// A szervezeti jelölés is TÉNY: a 4 szervezeti kód pontosan a 103.01/103.09/105.01/105.02.
const szervezeti = ADOMANY_KODOK.filter((k) => k.szervezeti).map((k) => k.kod).sort().join(',')
if (szervezeti === '103.01,103.09,105.01,105.02') ok('(1) a szervezeti kódok: 103.01, 103.09, 105.01, 105.02')
else fail(`(1) a szervezeti kódok halmaza eltér: ${szervezeti}`)

// NEGATÍV ASSZERT: elgépelt kóddal az őrnek buknia KELL.
{
  const m = betolt(magRaw.replace("kod: '103.09'", "kod: '103.90'"))
  const rossz = m.ADOMANY_KODOK.find((k) => k.kod === '103.90')
  if (rossz && !katMap.has('103.90')) ok('NEGATÍV — egy elgépelt kódot a katalógus-összevetés elkapna')
  else fail('NEGATÍV — az elgépelt kód is átment volna a katalóguson: az őr vak')
}

if (adomanyKodE('103.09') && !adomanyKodE('101.01') && !adomanyKodE('')) ok('adomanyKodE csak a 10 kódra igaz')
else fail('adomanyKodE rosszul szűr')

// ── (2) AZ ÖSSZEVONÁS VISELKEDÉSE ───────────────────────────────────────
const t = (o) => ({
  id: o.id, datum: o.datum, osszeg: o.osszeg, nev: o.nev ?? '',
  szemelyId: o.szemelyId ?? null, kod: o.kod, banki: !!o.banki,
  iratszam: o.iratszam ?? null, megjegyzes: o.megjegyzes ?? null,
})

{
  const r = osszesitAdomanyozok([
    // Ugyanaz a CÉG, két írásmóddal — össze kell vonni.
    t({ id: 1, datum: '2025-03-01', osszeg: 1000, nev: 'ELECTRICA FURNIZARE SA', kod: '103.09', banki: true }),
    t({ id: 2, datum: '2026-04-02', osszeg: 500, nev: 'Electrica Furnizare S.A.', kod: '103.09', banki: false }),
    // Tagnyilvántartáshoz kötött személy.
    t({ id: 3, datum: '2025-05-03', osszeg: 250, nev: 'Kovács János', szemelyId: 42, kod: '101.04', banki: false }),
    // Ugyanaz a személy, MÁSKÉNT írva — az id_szemely köti össze.
    t({ id: 4, datum: '2026-06-04', osszeg: 150, nev: 'Kovacs Janos', szemelyId: 42, kod: '101.05', banki: true }),
    // Persely: nincs név.
    t({ id: 5, datum: '2026-01-05', osszeg: 90, nev: '', kod: '101.03', banki: false }),
    // MÁSIK adományozó, hasonló névvel — NEM olvadhat össze.
    t({ id: 6, datum: '2026-02-06', osszeg: 70, nev: 'Kovács Jánosné', kod: '101.04', banki: false }),
  ])

  const byKulcs = new Map(r.adomanyozok.map((a) => [a.kulcs, a]))
  const ceg = r.adomanyozok.find((a) => a.nev.toLowerCase().includes('electrica'))
  const szem = byKulcs.get('p:42')
  const nevtelen = r.adomanyozok.find((a) => a.tipus === 'nevtelen')
  const masik = r.adomanyozok.find((a) => a.nev === 'Kovács Jánosné')

  if (ceg && ceg.alkalmak === 2 && ceg.osszesen === 1500) ok('(2) az eltérő írásmódú cégnév EGY adományozóvá vonódik (1500)')
  else fail(`(2) a cég összevonása hibás: ${JSON.stringify(ceg && { a: ceg.alkalmak, o: ceg.osszesen })}`)

  if (ceg && ceg.bank === 1000 && ceg.keszpenz === 500) ok('(2) bank/készpénz bontás: 1000 / 500')
  else fail(`(2) a bank/készpénz bontás hibás: ${JSON.stringify(ceg && { b: ceg.bank, k: ceg.keszpenz })}`)

  if (ceg && ceg.tipus === 'szervezet') ok('(2) a 103.09 kód SZERVEZET besorolást ad (tény, nem névtipp)')
  else fail(`(2) a 103.09 nem szervezetnek minősült: ${ceg && ceg.tipus}`)

  if (szem && szem.tipus === 'szemely' && szem.alkalmak === 2 && szem.osszesen === 400) {
    ok('(2) az id_szemely köti össze a két írásmódot (400, „szemely")')
  } else fail(`(2) a személy-összevonás hibás: ${JSON.stringify(szem && { t: szem.tipus, a: szem.alkalmak, o: szem.osszesen })}`)

  if (masik && masik.alkalmak === 1) ok('(2) a hasonló nevű MÁSIK adományozó külön sor marad')
  else fail('(2) két különböző adományozó összeolvadt — ez pénzt rendel rossz emberhez')

  if (nevtelen && nevtelen.osszesen === 90 && r.adomanyozok[r.adomanyozok.length - 1].tipus === 'nevtelen') {
    ok('(2) a névtelen (persely) csoport megvan, és a lista VÉGÉN áll')
  } else fail('(2) a névtelen csoport hiányzik vagy nem a lista végén van')

  if (r.adomanyozoDb === 3) ok('(2) az adományozók száma a névtelen csoport NÉLKÜL: 3')
  else fail(`(2) adományozoDb=${r.adomanyozoDb}, várt 3`)

  if (r.osszesen === 2060 && r.bankOsszesen === 1150 && r.keszpenzOsszesen === 910) {
    ok('(2) végösszegek: 2060 (bank 1150 + készpénz 910)')
  } else fail(`(2) végösszeg hibás: ${r.osszesen} / ${r.bankOsszesen} / ${r.keszpenzOsszesen}`)

  if (JSON.stringify(r.evek) === '[2026,2025]') ok('(2) az évek csökkenő sorrendben: 2026, 2025')
  else fail(`(2) az év-lista hibás: ${JSON.stringify(r.evek)}`)

  if (szem && szem.evenkent[2025] === 250 && szem.evenkent[2026] === 150) ok('(2) évenkénti bontás („visszamenőleg is")')
  else fail('(2) az évenkénti bontás hibás')
}

// NEGATÍV ASSZERT: ha az összevonás NEM normalizálná a nevet, a cég két sorra esne.
{
  const m = betolt(magRaw.replace(
    'const normalt = adomanyozoKulcsNev(nyersNev)',
    'const normalt = nyersNev',
  ))
  const r = m.osszesitAdomanyozok([
    t({ id: 1, datum: '2025-03-01', osszeg: 1000, nev: 'ELECTRICA FURNIZARE SA', kod: '103.09', banki: true }),
    t({ id: 2, datum: '2026-04-02', osszeg: 500, nev: 'Electrica Furnizare S.A.', kod: '103.09', banki: false }),
  ])
  if (r.adomanyozok.length === 2) ok('NEGATÍV — normalizálás nélkül a cég tényleg két sorra esne (a teszt lát)')
  else fail('NEGATÍV — a normalizálás nélküli mutáns is összevonta: az összevonás nincs valóban ellenőrizve')
}

// A cég-gyanú CSAK jelzés — de működjön.
if (cegGyanusNev('ELECTRICA FURNIZARE SA') && cegGyanusNev('Fundatia Sf. Maria') && !cegGyanusNev('Kovács János')) {
  ok('cég-gyanú jelzés: cégnévre igaz, személynévre hamis')
} else fail('a cég-gyanú jelzés hibásan működik')

// ── (3) A LEKÉRDEZÉS SZŰRŐI — web ÉS desktop ────────────────────────────
const SZUROK = [
  {
    minta: /\.eq\(\s*['"]deleted['"]\s*,\s*false\s*\)/,
    nev: 'törölt tétel nem számít',
    mutans: (s) => s.replace(/\s*\.eq\(\s*['"]deleted['"]\s*,\s*false\s*\)/g, ''),
  },
  {
    minta: /\.eq\(\s*['"]stornozott['"]\s*,\s*false\s*\)/,
    nev: 'sztornózott tétel nem számít',
    mutans: (s) => s.replace(/\s*\.eq\(\s*['"]stornozott['"]\s*,\s*false\s*\)/g, ''),
  },
  {
    minta: /\.is\(\s*['"]belso_mozgas_xkey['"]\s*,\s*null\s*\)/,
    nev: 'belső mozgás nem adomány',
    mutans: (s) => s.replace(/\s*\.is\(\s*['"]belso_mozgas_xkey['"]\s*,\s*null\s*\)/g, ''),
  },
  {
    minta: /osszeg_ron\s*\?\?\s*s\.osszeg/,
    nev: 'devizás soron az osszeg_ron a mérvadó',
    mutans: (s) => s.replace(/osszeg_ron\s*\?\?\s*s\.osszeg/g, 's.osszeg'),
  },
  {
    minta: /banki:\s*s\.bankszamla_id\s*!=\s*null/,
    nev: '„banki" = bankszamla_id IS NOT NULL (nem az irattipus szövege)',
    mutans: (s) => s.replace(/banki:\s*s\.bankszamla_id\s*!=\s*null/g, "banki: s.iratszam?.startsWith('Extr') ?? false"),
  },
  {
    minta: /selectAllPaged/,
    nev: 'lapozás (több év adata — az 1000 soros plafon némán csonkítana)',
    mutans: (s) => s.replace(/selectAllPaged/g, 'egyLapos'),
  },
  {
    minta: /congregation_id/,
    nev: 'gyülekezeti hatókör-szűrő',
    mutans: (s) => s.replace(/congregation_id/g, 'valami_mas'),
  },
]

const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const [cimke, ut, vago] of [
  ['web', WEB, null],
  ['desktop', DESKTOP, 'export async function adomanyozokOnline'],
]) {
  const nyers = olvas(ut)
  const resz = vago ? (nyers.split(vago)[1] ?? '') : nyers
  if (vago && !resz) { fail(`${cimke} — az adomanyozokOnline függvény nem található`); continue }
  const kod = kodCsak(resz)
  for (const sz of SZUROK) {
    if (!sz.minta.test(kod)) { fail(`${cimke} — hiányzik: ${sz.nev}`); continue }
    if (sz.minta.test(kodCsak(sz.mutans(resz)))) fail(`${cimke} — az őr VAK: a mutáns (${sz.nev}) is átment`)
    else ok(`${cimke} — ${sz.nev}`)
  }
  // A két felület UGYANAZT a magot hívja.
  if (/osszesitAdomanyozok/.test(resz)) ok(`${cimke} — a közös magból összesít (@kartoteka/core)`)
  else fail(`${cimke} — saját összesítést végez: két felület, két végösszeg`)
  // FAIL-LOUD az üres katalógusra: a „0 adomány" NEM lehet néma válasz.
  if (/error/.test(resz) && /befizetescel/.test(resz)) ok(`${cimke} — a hiányzó kategória-katalógus HANGOS hiba, nem „0 adomány"`)
  else fail(`${cimke} — hiányzó katalógusnál némán 0 adományt jelentene`)
}

if (failed) { console.error('\nAz Adományozók önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nAz Adományozók önellenőrzés rendben.')
