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
 *   (4) A PERSELY (101.03) NEM NÉVSOR-TÉTEL — Endre szabálya (2026-09-02):
 *       „A perselypénzt ne számítsuk az adományozók/szponzorok oldalhoz, az
 *       külön tétel." A kód adomány-KATEGÓRIA marad (a BankTab hiányzó-befizető
 *       jelzése a teljes családot nézi), de a NÉVSORBÓL kimarad. Ez két irányba
 *       tud elromlani: a persely visszaszivárog a fülre, vagy a szűkítés
 *       átszivárog a BankTab jelzésébe — mindkettőt őrizzük.
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
    // Persely: KÜLÖN kategória — nem adományozó, nem is „névtelen" csoport
    // (Endre, 2026-09-02). A végösszegekben nem szerepelhet.
    t({ id: 5, datum: '2026-01-05', osszeg: 90, nev: '', kod: '101.03', banki: false }),
    // MÁSIK adományozó, hasonló névvel — NEM olvadhat össze.
    t({ id: 6, datum: '2026-02-06', osszeg: 70, nev: 'Kovács Jánosné', kod: '101.04', banki: false }),
    // NÉVTELENÜL leadott adomány (nem persely!): ez marad a „nevtelen" csoport —
    // a pénz nem tűnhet el a képből, de a lista végére kerül.
    t({ id: 7, datum: '2026-01-20', osszeg: 60, nev: '', kod: '101.04', banki: false }),
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

  if (nevtelen && nevtelen.osszesen === 60 && r.adomanyozok[r.adomanyozok.length - 1].tipus === 'nevtelen') {
    ok('(2) a névtelenül leadott adomány csoportja megvan, és a lista VÉGÉN áll')
  } else fail(`(2) a névtelen csoport hiányzik, rossz összegű vagy nem a lista végén van: ${JSON.stringify(nevtelen && { o: nevtelen.osszesen })}`)

  // A persely NEM keveredhet a „névtelen" adományozói csoportba.
  if (!nevtelen || !('101.03' in (nevtelen.kodonkent || {}))) ok('(2) a persely nem csúszott a névtelen adományozói csoportba')
  else fail('(2) a persely a névtelen csoportba került — külön kategóriának kell lennie')

  if (r.adomanyozoDb === 3) ok('(2) az adományozók száma a névtelen csoport NÉLKÜL: 3')
  else fail(`(2) adományozoDb=${r.adomanyozoDb}, várt 3`)

  // 2030 = 2120 összes tétel − 90 persely. A persely a saját kártyáján jelenik meg.
  if (r.osszesen === 2030 && r.bankOsszesen === 1150 && r.keszpenzOsszesen === 880) {
    ok('(2) adományozói végösszegek: 2030 (bank 1150 + készpénz 880) — a persely nélkül')
  } else fail(`(2) végösszeg hibás: ${r.osszesen} / ${r.bankOsszesen} / ${r.keszpenzOsszesen} (2030 / 1150 / 880 várt)`)

  if (r.persely && r.persely.osszeg === 90 && r.persely.alkalmak === 1) ok('(2) a persely a saját kategóriájában: 90 RON / 1 tétel')
  else fail(`(2) a persely-kategória hibás: ${JSON.stringify(r.persely)}`)

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

// ── (4) A PERSELY KÜLÖN KATEGÓRIA (Endre, 2026-09-02) ───────────────────
// „A perselypénzt ne számítsuk az adományozók/szponzorok oldalhoz, az külön
// tétel." + „Vedd fel mindegyiket, de legyen külön kategorizálva."
// Vagyis: a persely (101.03) OTT VAN a fülön, de SAJÁT kategóriaként — nem
// kerül a névsorba, és nem növeli az adományozói végösszegeket.
//
// A leválasztás a KÖZÖS MAGBAN történik (nem a hívóban): a web és a desktop a
// TELJES kódcsaládot kéri le, így nem húzhatnak szét.
{
  const { ADOMANY_NEVSOR_KODOK, adomanyNevsorKodE } = mod

  // (4a) A KATALÓGUS-OLDAL
  if (!Array.isArray(ADOMANY_NEVSOR_KODOK)) {
    fail('(4) nincs ADOMANY_NEVSOR_KODOK — a névsor nem tud a perselytől elkülönülni')
  } else {
    const nevsor = ADOMANY_NEVSOR_KODOK.map((k) => k.kod)
    if (nevsor.includes('101.03')) fail('(4) a persely (101.03) BENNE VAN a névsor-listában')
    else ok('(4) a persely (101.03) nincs a névsor-listában')

    if (ADOMANY_KODOK.some((k) => k.kod === '101.03')) {
      ok('(4) a persely a TELJES kódcsaládban megmarad (BankTab jelzés + külön kategória)')
    } else {
      fail('(4) a persely kiesett az ADOMANY_KODOK-ból: a fülön sem jelenne meg, és a BankTab jelzése is változna')
    }

    if (nevsor.length === ADOMANY_KODOK.length - 1) ok(`(4) a névsor ${nevsor.length} kód — egyedül a persely esik ki`)
    else fail(`(4) a névsor ${nevsor.length} kódot tart, ${ADOMANY_KODOK.length - 1} várt`)

    if (typeof adomanyNevsorKodE === 'function') {
      if (!adomanyNevsorKodE('101.03') && adomanyNevsorKodE('103.09') && !adomanyNevsorKodE('')) {
        ok('(4) adomanyNevsorKodE: perselyre hamis, szponzorra igaz')
      } else fail('(4) adomanyNevsorKodE rosszul szűr')
    } else fail('(4) nincs adomanyNevsorKodE kapu')
  }

  // (4b) A VISELKEDÉS — ez a lényeg, nem a lista.
  const minta = [
    t({ id: 1, datum: '2026-01-05', osszeg: 500, nev: '', kod: '101.03', banki: false }),
    t({ id: 2, datum: '2026-02-10', osszeg: 120, nev: 'Kovács János', kod: '101.04', szemelyId: 7, banki: false }),
    t({ id: 3, datum: '2026-03-11', osszeg: 300, nev: 'ELECTRICA SA', kod: '103.09', banki: true }),
    // Csak-perselyes ÉV: az évválasztóból nem eshet ki.
    t({ id: 4, datum: '2024-12-24', osszeg: 80, nev: '', kod: '101.03', banki: false }),
  ]
  const r = osszesitAdomanyozok(minta)

  if (!r.persely) {
    fail('(4b) az összesítőben nincs `persely` mező — a fül nem tudná külön megmutatni')
  } else {
    if (r.persely.osszeg === 580 && r.persely.alkalmak === 2) ok('(4b) a persely külön összesítve: 580 RON / 2 tétel')
    else fail(`(4b) a persely összesítő rossz: ${r.persely.osszeg} RON / ${r.persely.alkalmak} tétel (580 / 2 várt)`)

    if (r.persely.keszpenz === 580 && r.persely.bank === 0) ok('(4b) a persely készpénz/bank bontása helyes')
    else fail(`(4b) a persely készpénz/bank bontása rossz: ${r.persely.keszpenz} / ${r.persely.bank}`)

    if (r.persely.kod === '101.03' && /persely/i.test(r.persely.nev)) ok('(4b) a persely-kártya a katalógusból kapja a kódot és a nevet')
    else fail(`(4b) a persely-kártya kód/név hibás: ${r.persely.kod} / ${r.persely.nev}`)
  }

  // A VÉGÖSSZEG a perselyt NEM tartalmazza — ez volt a torzítás.
  if (r.osszesen === 420) ok('(4b) az adományozói végösszeg 420 RON — a persely NINCS benne')
  else fail(`(4b) az adományozói végösszeg ${r.osszesen}, de 420 lenne helyes (a persely nem számít bele)`)

  // A NÉVSORBAN nincs persely-tétel.
  const perselyANevsorban = r.adomanyozok.some((a) => '101.03' in (a.kodonkent || {}))
  if (!perselyANevsorban) ok('(4b) egyetlen adományozói sor sem hordoz persely-tételt')
  else fail('(4b) a persely bekerült egy adományozói sorba')

  // A KATEGÓRIA-TÁBLÁBAN sincs — annak az adományozói összeget kell kiadnia.
  if (!r.kodonkent.some((k) => k.kod === '101.03')) ok('(4b) a kategória-tábla a persely nélküli adományokat összegzi')
  else fail('(4b) a persely bekerült a kategória-táblába: az összeg nem egyezne a végösszeggel')
  const kodSzumma = r.kodonkent.reduce((s, k) => s + k.osszeg, 0)
  if (kodSzumma === r.osszesen) ok('(4b) a kategória-tábla összege pontosan a végösszeg')
  else fail(`(4b) a kategória-tábla összege (${kodSzumma}) eltér a végösszegtől (${r.osszesen})`)

  // A CSAK-PERSELYES ÉV nem eshet ki az évválasztóból.
  if (r.evek.includes(2024)) ok('(4b) a csak-perselyes év (2024) is szerepel az évválasztóban')
  else fail('(4b) a csak-perselyes év eltűnt az évválasztóból: a persely-kártya elérhetetlen lenne')

  // NEGATÍV ASSZERT: ha a persely visszakerül a névsorba, buknia KELL.
  {
    const mm = betolt(magRaw.replace(
      "{ kod: '101.03', nev: 'Perselypénz', szervezeti: false, nevsorhoz: false }",
      "{ kod: '101.03', nev: 'Perselypénz', szervezeti: false, nevsorhoz: true }",
    ))
    const rm = mm.osszesitAdomanyozok(minta)
    if (rm.osszesen !== 420 || (rm.persely && rm.persely.osszeg !== 580)) {
      ok('NEGATÍV — a névsorba visszatett perselyt az őr elkapná (a végösszeg elcsúszna)')
    } else {
      fail('NEGATÍV — a mutáns is átment: az őr VAK a persely visszaszivárgására')
    }
  }
}

// (4c) A LEKÉRDEZÉS a TELJES családot hozza le — a szűrés a magban van.
// Ha a hívó szűrne, a persely-kártya némán üresen maradna.
{
  const BANKTAB = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'BankTab.tsx')
  for (const [cimke, ut] of [['web', WEB], ['desktop', DESKTOP]]) {
    const nyers = olvas(ut)
    const kod = kodCsak(nyers)
    if (!/\bADOMANY_KODOK\b/.test(kod)) {
      fail(`(4c) ${cimke} — nem a TELJES ADOMANY_KODOK listát kéri le: a persely-kártya üres maradna`)
      continue
    }
    if (/ADOMANY_NEVSOR_KODOK/.test(kod)) {
      fail(`(4c) ${cimke} — a hívó szűri ki a perselyt; a szűrésnek a közös magban a helye`)
      continue
    }
    const mutans = kodCsak(nyers.replace(/\bADOMANY_KODOK\b/g, 'ADOMANY_NEVSOR_KODOK'))
    if (/\bADOMANY_KODOK\b/.test(mutans)) fail(`(4c) ${cimke} — az őr VAK: a mutáns is átment`)
    else ok(`(4c) ${cimke} — a teljes kódcsaládot kéri le, a szétválasztás a magban van`)
  }
  if (fs.existsSync(BANKTAB)) {
    const kod = kodCsak(olvas(BANKTAB))
    if (/\bADOMANY_KODOK\b/.test(kod) && !/ADOMANY_NEVSOR_KODOK/.test(kod)) {
      ok('(4c) BankTab — a TELJES kódcsaládot nézi: a befizető-jelzés nem változott')
    } else {
      fail('(4c) BankTab — nem a teljes kódcsaládot nézi: a persely-szabály átszivárgott a jelzésbe')
    }
  } else fail('(4c) a BankTab.tsx nem található')
}

if (failed) { console.error('\nAz Adományozók önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nAz Adományozók önellenőrzés rendben.')
