#!/usr/bin/env node
/**
 * ADATVÉDELMI FEDEZET 3. — önellenőrzés (2026-08-23).
 *
 * Mit véd:
 *   · `apps/web/lib/export/gyulekezeti-export.ts` — a teljes gyülekezeti
 *     adatexport HATÓKÖR-KAPUJA, terve és csomag-összeállítása;
 *   · `apps/web/lib/export/betekintes-naplo.ts` — az audit-bejegyzés →
 *     közérthető magyar mondat fordítása;
 *   · `apps/web/lib/export/tabla-cimek.ts` — a KÖZÖS tábla-cím szótár;
 *   · `apps/web/app/(dashboard)/profile/adatvedelem-actions.ts` — a
 *     szerver-oldali kapuk SZÖVEGES őrei (kommentek nélkül mérve).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ MIÉRT VAN EZ A TESZT
 * ════════════════════════════════════════════════════════════════════════════
 * (1) HATÓKÖR. Egy „töltsd le a teljes adatállományt" gomb a rendszer
 *     legveszélyesebb felülete. A projekt bizonyított hibaosztálya (3. kör):
 *     NULL skalár hatókör + `if (id) filter` = NÉMA, TELJES szivárgás. Itt ez
 *     egyetlen kattintással EGY MÁSIK gyülekezet — vagy egy egész egyházmegye —
 *     anyakönyvét adná ki. Ezért a kapu ENGEDÉLYEZŐ, és ezt a teszt
 *     NEGATÍV ASSZERTTEL is bizonyítja: a kapu NÉLKÜLI változatnak BUKNIA KELL
 *     ugyanezen a mércén (őrszem negatív asszert nélkül vak).
 *
 * (2) IGAZMONDÁS. A betekintés-kimutatás egy JOGI ÍGÉRETET vált be. Ha egy
 *     ismeretlen naplókulcsra kitalálnánk egy jelentést, HAMIS iratot
 *     gyártanánk. A teszt megköveteli, hogy az ismeretlen kulcs NYERSEN
 *     látszódjon, és hogy a felület KIMONDJA: a puszta megtekintést a rendszer
 *     ma nem naplózza.
 *
 * Futtatás:  node scripts/selftest-adatexport.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const LIB_DIR = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'export')
const AKCIOK = path.join(
  REPO_ROOT,
  'apps',
  'web',
  'app',
  '(dashboard)',
  'profile',
  'adatvedelem-actions.ts',
)

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

const FORRASOK = {
  'tabla-cimek': path.join(LIB_DIR, 'tabla-cimek.ts'),
  'gyulekezeti-export': path.join(LIB_DIR, 'gyulekezeti-export.ts'),
  'betekintes-naplo': path.join(LIB_DIR, 'betekintes-naplo.ts'),
}

for (const [nev, fajl] of Object.entries(FORRASOK)) {
  if (!fs.existsSync(fajl)) {
    fail(`hiányzik a forrás: ${fajl} (${nev})`)
    process.exit(1)
  }
}

const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try {
  ts = require_('typescript')
} catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-adatexport-selftest-'))

/**
 * TS → CJS, majd betöltés.
 *
 * Fail-closed: a `@/lib/export/*` importokat helyi fájlra írjuk át, MINDEN MÁS
 * projekt-import HIBA. Ha valaha `server-only` vagy Supabase-import kerülne
 * ezekbe a magokba, a betöltés ITT bukik el, érthető üzenettel — nem pedig
 * némán kihagyhatóvá válik a teszt.
 */
function loadTs(nev) {
  const kod = fs.readFileSync(FORRASOK[nev], 'utf8')
  const out = ts.transpileModule(kod, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      isolatedModules: true,
    },
    fileName: nev + '.ts',
  })

  let szoveg = out.outputText.replace(
    /require\(["']@\/lib\/export\/([a-z-]+)["']\)/g,
    (_m, modul) => `require("./${modul}")`,
  )

  const idegen = [...szoveg.matchAll(/require\(["']([^"']+)["']\)/g)]
    .map((m) => m[1])
    .filter((m) => !m.startsWith('node:') && !m.startsWith('.'))
  if (idegen.length > 0) {
    throw new Error(
      `${nev}: FUTÁSIDEJŰ PROJEKT-IMPORT került a fájlba (${idegen.join(', ')}). ` +
        'Az adatexport magjai csak import nélkül tesztelhetők önállóan.',
    )
  }

  const dest = path.join(tmp, nev + '.js')
  fs.writeFileSync(dest, szoveg, 'utf8')
  return require_(dest)
}

let cimek
let exp
let naplo
try {
  cimek = loadTs('tabla-cimek')
  exp = loadTs('gyulekezeti-export')
  naplo = loadTs('betekintes-naplo')
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

const {
  EXPORT_TERV,
  IN_DARAB_MERET,
  LAP_MERET,
  TABLA_SOR_PLAFON,
  CSOMAG_TAJEKOZTATO,
  csomagotOsszeallit,
  darabol,
  exportFajlNev,
  exportHatokorEllenorzes,
  szlug,
  tervElem,
  zipTartalom,
} = exp

const { NAPLO_KORLATOK, auditMondat, muveletSulya, cselekvoNeve, auditIdopont } = naplo

for (const [nev, fn] of Object.entries({
  csomagotOsszeallit,
  darabol,
  exportFajlNev,
  exportHatokorEllenorzes,
  szlug,
  tervElem,
  zipTartalom,
  auditMondat,
  muveletSulya,
  cselekvoNeve,
  auditIdopont,
  tablaCim: cimek.tablaCim,
})) {
  if (typeof fn !== 'function') {
    fail(`a mag nem exportálja: ${nev}`)
    fs.rmSync(tmp, { recursive: true, force: true })
    process.exit(1)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// H) HATÓKÖR-MÉRCE — ez a teszt szíve
// ════════════════════════════════════════════════════════════════════════════
//
// A mérce ESETEIT szándékosan KÉZZEL írjuk ki, nem a forrásból származtatjuk:
// ha a forrásból olvasnánk, a teszt együtt mozdulna a hibával.

const HATOKOR_ESETEK = [
  {
    nev: 'null kontextus',
    bemenet: null,
    varOk: false,
  },
  {
    nev: 'undefined kontextus',
    bemenet: undefined,
    varOk: false,
  },
  {
    nev: 'feloldó hibát adott (de van scopeId!)',
    bemenet: { error: 'Nincs jogosultság az egyházmegyei adatokhoz.', scopeId: 'GY-1' },
    varOk: false,
  },
  {
    nev: 'EGYHÁZMEGYEI hatókör — nem gyülekezeti',
    bemenet: { scope: 'diocese', scopeCol: 'diocese_id', scopeId: 'MEGYE-1' },
    varOk: false,
  },
  {
    nev: 'EGYHÁZKERÜLETI hatókör — nem gyülekezeti',
    bemenet: { scope: 'district', scopeCol: 'district_id', scopeId: 'KER-1' },
    varOk: false,
  },
  {
    nev: 'gyülekezeti scope, DE idegen scope-oszlop',
    bemenet: { scope: 'congregation', scopeCol: 'district_id', scopeId: 'KER-1' },
    varOk: false,
  },
  {
    nev: 'gyülekezeti scope, ÜRES azonosító',
    bemenet: { scope: 'congregation', scopeCol: 'congregation_id', scopeId: '   ' },
    varOk: false,
  },
  {
    nev: 'hiányzó scope, csak azonosító',
    bemenet: { scopeId: 'GY-1' },
    varOk: false,
  },
  {
    nev: 'érvényes gyülekezeti hatókör',
    bemenet: {
      scope: 'congregation',
      scopeCol: 'congregation_id',
      scopeId: 'GY-1',
      scopeName: 'Barátosi Református Egyházközség',
    },
    varOk: true,
    varId: 'GY-1',
  },
]

/** A mércét futtatja egy tetszőleges kapu-implementáción; a hibák listáját adja. */
function hatokorMerce(kapu) {
  const hibak = []
  for (const eset of HATOKOR_ESETEK) {
    let eredmeny
    try {
      eredmeny = kapu(eset.bemenet)
    } catch (e) {
      hibak.push(`${eset.nev}: KIVÉTELT dobott (${e?.message || e})`)
      continue
    }
    if (!eredmeny || typeof eredmeny !== 'object') {
      hibak.push(`${eset.nev}: nem objektumot adott vissza`)
      continue
    }
    if (eredmeny.ok !== eset.varOk) {
      hibak.push(`${eset.nev}: ok=${eredmeny.ok}, várt=${eset.varOk}`)
      continue
    }
    if (eset.varOk) {
      if (eredmeny.congregationId !== eset.varId) {
        hibak.push(`${eset.nev}: congregationId=${eredmeny.congregationId}, várt=${eset.varId}`)
      }
    } else {
      // Megtagadásnál MAGYARÁZAT kell — üres string vagy adat NEM elég.
      if (typeof eredmeny.uzenet !== 'string' || eredmeny.uzenet.trim().length < 10) {
        hibak.push(`${eset.nev}: nincs érdemi magyar magyarázat a megtagadásnál`)
      }
      if ('congregationId' in eredmeny) {
        hibak.push(`${eset.nev}: MEGTAGADÁSKOR IS ADOTT gyülekezet-azonosítót`)
      }
    }
  }
  return hibak
}

const valosHibak = hatokorMerce(exportHatokorEllenorzes)
if (valosHibak.length === 0) {
  ok(`H1 a hatókör-kapu fail-closed mind a ${HATOKOR_ESETEK.length} esetben`)
} else {
  fail(`H1: a hatókör-kapu megbukott — ${valosHibak.join(' | ')}`)
}

// ── NEGATÍV ASSZERT: a kapu NÉLKÜLI változatnak BUKNIA KELL ─────────────────
//
// Ez pontosan az a kód, ami a 3. körben élesben elsült: „ha van azonosító,
// szűrj rá". A megyei/kerületi hatókörből így a MÁSIK szint azonosítója menne
// a `congregation_id` szűrőbe (0 sor VAGY idegen sorok), a `{ error }` ág
// pedig teljesen elveszne.
function hatokorKapuNelkul(bemenet) {
  const id = (bemenet && bemenet.scopeId) || ''
  if (id.trim()) {
    return { ok: true, congregationId: id.trim(), congregationName: bemenet.scopeName ?? null }
  }
  return { ok: false, uzenet: 'Nincs feloldható hatókör.' }
}

const mutansHibak = hatokorMerce(hatokorKapuNelkul)
if (mutansHibak.length > 0) {
  ok(`H2 a kapu NÉLKÜLI változat elbukik a mércén (${mutansHibak.length} eset) — a mérce lát`)
} else {
  fail(
    'H2: a hatókör-mérce VAK — a kapu nélküli, „ha van id, szűrj" változat is átment rajta. ' +
      'A mérce eseteit szigorítani kell, mert így nem véd semmit.',
  )
}

// ════════════════════════════════════════════════════════════════════════════
// C) CSOMAG-ÖSSZEÁLLÍTÁS
// ════════════════════════════════════════════════════════════════════════════

const VART_KULCSOK = [
  'formatum',
  'verzio',
  'keszult',
  'gyulekezet',
  'keszitette',
  'osszegzes',
  'tablak',
  'tajekoztato',
]

function csomagSzerkezet(csomag) {
  const hibak = []
  for (const kulcs of VART_KULCSOK) {
    if (!(kulcs in csomag)) hibak.push(`hiányzó kulcs: ${kulcs}`)
  }
  if (csomag.formatum !== 'kartoteka-gyulekezeti-adatexport') hibak.push('rossz formatum-jelölő')
  if (csomag.verzio !== 1) hibak.push('rossz verzió')
  if (!csomag.keszult || Number.isNaN(Date.parse(csomag.keszult))) {
    hibak.push('a keszult nem értelmezhető időbélyeg')
  }
  if (!csomag.tablak || typeof csomag.tablak !== 'object') hibak.push('a tablak nem objektum')
  if (!Array.isArray(csomag.tajekoztato) || csomag.tajekoztato.length === 0) {
    hibak.push('a tajekoztato hiányzik vagy üres')
  }
  return hibak
}

// C1 — ÜRES BEMENET: nem dobhat, és érvényes csomagot kell adnia.
for (const [nev, bemenet] of [
  ['nincs argumentum', undefined],
  ['null', null],
  ['üres objektum', {}],
  ['üres eredmény-lista', { eredmenyek: [] }],
  ['null eredmény-lista', { eredmenyek: null }],
]) {
  let csomag
  try {
    csomag = csomagotOsszeallit(bemenet)
  } catch (e) {
    fail(`C1 (${nev}): a csomag-összeállítás DOBOTT — ${e?.message || e}`)
    continue
  }
  const hibak = csomagSzerkezet(csomag)
  if (hibak.length > 0) {
    fail(`C1 (${nev}): érvénytelen csomag — ${hibak.join(', ')}`)
  } else if (Object.keys(csomag.tablak).length !== 0 || csomag.osszegzes.sorokSzama !== 0) {
    fail(`C1 (${nev}): üres bemenetből NEM üres csomag lett`)
  }
}
ok('C1 üres/hiányos bemenetnél is érvényes, üres csomag születik (nem dob)')

// C2 — valódi bemenet: számok, listák, sorok
const csomag = csomagotOsszeallit({
  gyulekezetId: 'GY-1',
  gyulekezetNev: 'Barátosi Református Egyházközség',
  keszitetteNev: 'Szőcs Endre',
  keszitetteEmail: 'lelkesz@example.org',
  keszult: '2026-08-23T09:15:00.000Z',
  eredmenyek: [
    { tabla: 'szemely', allapot: 'ok', sorok: [{ id: 1, nev: 'A' }, { id: 2, nev: 'B' }] },
    { tabla: 'befizetes', allapot: 'ok', sorok: [{ id: 10 }] },
    { tabla: 'leltar_tetelek', allapot: 'hianyzik', sorok: [], uzenet: 'nincs bekapcsolva' },
    { tabla: 'iktato', allapot: 'hiba', sorok: [], uzenet: 'valami elromlott' },
    { tabla: 'munkanaplo', allapot: 'ok', sorok: [{ id: 5 }], csonkolt: true },
    { tabla: 'bealitas', allapot: 'nincs_jog', sorok: [] },
    { tabla: '', allapot: 'ok', sorok: [{ id: 99 }] },
  ],
})

{
  const hibak = csomagSzerkezet(csomag)
  if (hibak.length > 0) fail(`C2: érvénytelen csomag — ${hibak.join(', ')}`)
}

if (csomag.osszegzes.tablakSzama !== 6) {
  fail(`C2: tablakSzama=${csomag.osszegzes.tablakSzama}, várt 6 (az üres nevű sor kimarad)`)
} else if (csomag.osszegzes.sorokSzama !== 4) {
  fail(`C2: sorokSzama=${csomag.osszegzes.sorokSzama}, várt 4`)
} else if (csomag.osszegzes.hianyzoTablak.join(',') !== 'leltar_tetelek') {
  fail(`C2: hianyzoTablak=${csomag.osszegzes.hianyzoTablak.join(',')}, várt leltar_tetelek`)
} else if (csomag.osszegzes.hibasTablak.join(',') !== 'iktato,bealitas') {
  fail(`C2: hibasTablak=${csomag.osszegzes.hibasTablak.join(',')}, várt iktato,bealitas`)
} else if (csomag.osszegzes.csonkoltTablak.join(',') !== 'munkanaplo') {
  fail(`C2: csonkoltTablak=${csomag.osszegzes.csonkoltTablak.join(',')}, várt munkanaplo`)
} else if (csomag.osszegzes.teljes !== false) {
  fail('C2: a hibás/csonka csomag mégis „teljes"-nek mondja magát')
} else if (csomag.tablak.szemely.sorokSzama !== 2 || csomag.tablak.szemely.sorok.length !== 2) {
  fail('C2: a sorok nem kerültek át hiánytalanul')
} else if (csomag.tablak.szemely.cim !== 'Személyek') {
  fail(`C2: a magyar cím nem a közös szótárból jön (${csomag.tablak.szemely.cim})`)
} else if (csomag.gyulekezet.id !== 'GY-1' || csomag.keszitette.nev !== 'Szőcs Endre') {
  fail('C2: a fejléc-adatok nem kerültek át')
} else {
  ok('C2 a csomag összegzése, cím-feloldása és sorai helyesek')
}

// C3 — a „teljes" jelző csak hibátlan, csonkítatlan csomagra igaz.
{
  const tiszta = csomagotOsszeallit({
    gyulekezetId: 'GY-1',
    eredmenyek: [
      { tabla: 'szemely', allapot: 'ok', sorok: [{ id: 1 }] },
      { tabla: 'leltar_tetelek', allapot: 'hianyzik', sorok: [] },
    ],
  })
  if (tiszta.osszegzes.teljes !== true) {
    fail('C3: a be nem kapcsolt (hiányzó) modul HIBÁSAN rontja el a teljességet')
  } else {
    ok('C3 a hiányzó (be nem kapcsolt) modul nem minősül adatvesztésnek')
  }
}

// C4 — ZIP-tartalom
{
  const bejegyzesek = zipTartalom(csomag)
  const nevek = bejegyzesek.map((b) => b.nev)
  const kell = ['olvassel.txt', 'csomag.json', 'tablak/szemely.json']
  const hianyzo = kell.filter((n) => !nevek.includes(n))
  if (hianyzo.length > 0) {
    fail(`C4: a ZIP-ből hiányzik: ${hianyzo.join(', ')}`)
  } else {
    let jsonHiba = null
    for (const b of bejegyzesek) {
      if (!b.nev.endsWith('.json')) continue
      try {
        JSON.parse(b.tartalom)
      } catch (e) {
        jsonHiba = `${b.nev}: ${e?.message || e}`
        break
      }
    }
    if (jsonHiba) fail(`C4: érvénytelen JSON a csomagban — ${jsonHiba}`)
    else if (!bejegyzesek[0].tartalom.includes('NINCS benne')) {
      fail('C4: az olvassel.txt nem mondja ki, mi NINCS a csomagban')
    } else ok(`C4 a ZIP tartalma teljes és érvényes (${bejegyzesek.length} fájl)`)
  }
}

// C5 — fájlnév és szlug (ékezetek!)
{
  const nev = exportFajlNev(csomag, 'zip')
  if (nev !== 'kartoteka-adatexport-baratosi-reformatus-egyhazkozseg-2026-08-23.zip') {
    fail(`C5: hibás fájlnév — ${nev}`)
  } else if (szlug('Sepsiszentgyörgy — Belváros') !== 'sepsiszentgyorgy-belvaros') {
    fail(`C5: a szlug nem ékezettelenít helyesen — ${szlug('Sepsiszentgyörgy — Belváros')}`)
  } else if (szlug('') !== 'gyulekezet' || szlug(null) !== 'gyulekezet') {
    fail('C5: üres névnél nincs biztonságos tartalék fájlnév')
  } else {
    ok('C5 a fájlnév ékezetmentes, dátumos és üres névnél is biztonságos')
  }
}

// ════════════════════════════════════════════════════════════════════════════
// T) TERV + ALLOWLIST + DARABOLÁS
// ════════════════════════════════════════════════════════════════════════════

{
  const hibak = []
  if (!Array.isArray(EXPORT_TERV) || EXPORT_TERV.length < 20) {
    hibak.push(`a terv gyanúsan rövid (${EXPORT_TERV?.length})`)
  }
  const nevek = new Set()
  for (const elem of EXPORT_TERV || []) {
    if (nevek.has(elem.tabla)) hibak.push(`kétszer szerepel: ${elem.tabla}`)
    nevek.add(elem.tabla)
    if (!elem.cim || !elem.leiras) hibak.push(`${elem.tabla}: nincs magyar cím vagy leírás`)
    if (!elem.forras || !['kozvetlen', 'szarmaztatott'].includes(elem.forras.mod)) {
      hibak.push(`${elem.tabla}: ismeretlen forrás-mód`)
    }
  }
  // A négy legfontosabb nyilvántartás NEM maradhat ki.
  for (const kell of ['szemely', 'befizetes', 'kiadas', 'keresztseg']) {
    if (!nevek.has(kell)) hibak.push(`hiányzik a tervből: ${kell}`)
  }
  // A szülőnek a gyereke ELŐTT kell állnia (a származtatott lekérdezés erre épül).
  const sorrend = (EXPORT_TERV || []).map((e) => e.tabla)
  if (sorrend.indexOf('szemely') > sorrend.indexOf('csalad')) hibak.push('a csalad a szemely elé került')
  if (sorrend.indexOf('csalad') > sorrend.indexOf('gyerek')) hibak.push('a gyerek a csalad elé került')
  if (sorrend.indexOf('sirhelytemeto') > sorrend.indexOf('sirhely')) {
    hibak.push('a sirhely a sirhelytemeto elé került')
  }

  if (hibak.length > 0) fail(`T1: ${hibak.join(' | ')}`)
  else ok(`T1 az export-terv ${EXPORT_TERV.length} nyilvántartása ép és helyes sorrendű`)
}

{
  // ALLOWLIST: a klienstől jövő táblanév kapuja.
  const hibak = []
  if (!tervElem('szemely')) hibak.push('a szemely nincs a tervben')
  for (const tiltott of ['audit_log', 'profiles', 'mfa_mentokodok', '', null, undefined, 'szemely; drop']) {
    if (tervElem(tiltott)) hibak.push(`ÁTENGEDTE a nem tervezett táblát: ${String(tiltott)}`)
  }
  if (hibak.length > 0) fail(`T2: ${hibak.join(' | ')}`)
  else ok('T2 az allowlist csak a tervben szereplő nyilvántartásokat engedi')
}

{
  // DARABOLÁS — a 414-es URL-korlát ellen.
  const hibak = []
  if (IN_DARAB_MERET !== 80) hibak.push(`IN_DARAB_MERET=${IN_DARAB_MERET}, várt 80`)
  if (LAP_MERET !== 1000) hibak.push(`LAP_MERET=${LAP_MERET}, várt 1000`)
  if (!Number.isFinite(TABLA_SOR_PLAFON) || TABLA_SOR_PLAFON < 1000) {
    hibak.push(`értelmetlen TABLA_SOR_PLAFON: ${TABLA_SOR_PLAFON}`)
  }

  const nagy = Array.from({ length: 205 }, (_, i) => i + 1)
  const darabok = darabol(nagy)
  if (darabok.length !== 3) hibak.push(`205 elem → ${darabok.length} darab, várt 3`)
  if (darabok.some((d) => d.length > 80)) hibak.push('van 80-nál nagyobb darab (414-veszély)')
  if (darabok.flat().join(',') !== nagy.join(',')) hibak.push('a darabolás elveszít vagy átrendez elemeket')
  if (darabol([]).length !== 0) hibak.push('üres tömbnél nem üres darab-lista')
  if (darabol(null).length !== 0) hibak.push('null bemenetnél nem üres darab-lista')

  if (hibak.length > 0) fail(`T3: ${hibak.join(' | ')}`)
  else ok('T3 a darabolás 80-asával, hiánytalanul és üres bemenetre is működik')
}

// ════════════════════════════════════════════════════════════════════════════
// N) AUDIT-BEJEGYZÉS → KÖZÉRTHETŐ MAGYAR MONDAT
// ════════════════════════════════════════════════════════════════════════════

const NAPLO_ESETEK = [
  {
    nev: 'ismert esemény, más felhasználó',
    sor: {
      id: '1',
      mikor: '2026-08-23T09:15:00.000Z',
      kiNeve: 'Kovács János',
      muvelet: 'login',
      forras: 'esemeny',
    },
    kell: ['Kovács János', 'belépett a rendszerbe', '2026'],
    tilos: ['undefined', 'null', '[object'],
  },
  {
    nev: 'ismert esemény, SAJÁT',
    sor: {
      id: '2',
      mikor: '2026-08-23T09:15:00.000Z',
      kiNeve: 'Kovács János',
      muvelet: 'member.save',
      forras: 'esemeny',
      sajat: true,
    },
    kell: ['Te', 'mentett egy személyi adatlapot'],
    tilos: ['Kovács János'],
  },
  {
    nev: 'ISMERETLEN esemény — nem találunk ki jelentést',
    sor: {
      id: '3',
      mikor: '2026-08-23T09:15:00.000Z',
      kiNeve: 'Kovács János',
      muvelet: 'valami.uj.muvelet',
      forras: 'esemeny',
    },
    kell: ['ismeretlen műveletet', 'valami.uj.muvelet'],
    tilos: ['megtekintette', 'mentett'],
  },
  {
    nev: 'rekord-szintű INSERT',
    sor: {
      id: '4',
      mikor: '2026-08-23T09:15:00.000Z',
      kiNeve: 'Nagy Anna',
      muvelet: 'INSERT',
      tabla: 'befizetes',
      forras: 'rekord',
    },
    kell: ['Nagy Anna', 'új bejegyzést rögzített', 'Bevételi tételek'],
    tilos: ['befizetes"'],
  },
  {
    nev: 'rekord-szintű DELETE ismeretlen táblán',
    sor: {
      id: '5',
      mikor: '2026-08-23T09:15:00.000Z',
      kiNeve: null,
      muvelet: 'DELETE',
      tabla: 'valami_uj_tabla',
      forras: 'rekord',
    },
    kell: ['törölt egy bejegyzést', 'valami_uj_tabla', 'rendszer'],
    tilos: [],
  },
  {
    nev: 'rekord-szintű ISMERETLEN művelet',
    sor: {
      id: '6',
      mikor: '2026-08-23T09:15:00.000Z',
      kiNeve: 'Nagy Anna',
      muvelet: 'TRUNCATE',
      tabla: 'szemely',
      forras: 'rekord',
    },
    kell: ['ismeretlen műveletet', 'TRUNCATE'],
    tilos: ['rögzített', 'módosított'],
  },
]

function naploMerce(fordito) {
  const hibak = []
  for (const eset of NAPLO_ESETEK) {
    let mondat
    try {
      mondat = fordito(eset.sor)
    } catch (e) {
      hibak.push(`${eset.nev}: DOBOTT (${e?.message || e})`)
      continue
    }
    if (typeof mondat !== 'string' || mondat.trim().length < 10) {
      hibak.push(`${eset.nev}: nem érdemi mondat`)
      continue
    }
    for (const kell of eset.kell) {
      if (!mondat.includes(kell)) hibak.push(`${eset.nev}: hiányzik a mondatból: „${kell}"`)
    }
    for (const tilos of eset.tilos) {
      if (mondat.includes(tilos)) hibak.push(`${eset.nev}: NEM szerepelhetne benne: „${tilos}"`)
    }
    if (!mondat.trim().endsWith('.')) hibak.push(`${eset.nev}: nem mondat (nincs pont a végén)`)
  }
  return hibak
}

{
  const hibak = naploMerce(auditMondat)
  if (hibak.length > 0) fail(`N1: ${hibak.join(' | ')}`)
  else ok(`N1 az audit-bejegyzés mind a ${NAPLO_ESETEK.length} esetben közérthető magyar mondat`)
}

// ── NEGATÍV ASSZERT: a nyers kulcsot visszaadó „fordítónak" buknia kell ─────
{
  const nyersFordito = (b) => `${b?.muvelet ?? ''}`
  const hibak = naploMerce(nyersFordito)
  if (hibak.length > 0) {
    ok(`N2 a nyers (nem fordító) változat elbukik a mércén (${hibak.length} hiba) — a mérce lát`)
  } else {
    fail('N2: a napló-mérce VAK — a nyers naplókulcsot visszaadó változat is átment rajta')
  }
}

// ── NEGATÍV ASSZERT: a jelentést KITALÁLÓ fordítónak is buknia kell ─────────
{
  const talalgatoFordito = (b) =>
    `${b?.kiNeve || 'Valaki'} megtekintette az adatokat (${b?.mikor || ''}).`
  const hibak = naploMerce(talalgatoFordito)
  if (hibak.length > 0) {
    ok('N3 a jelentést KITALÁLÓ változat elbukik — az ismeretlen kulcs nem hazudható „megtekintés"-nek')
  } else {
    fail('N3: a mérce nem fogja meg a kitalált jelentést — HAMIS kimutatás készülhetne')
  }
}

{
  // Hiányos/rossz bemenet nem dobhat.
  const hibak = []
  for (const rossz of [null, undefined, {}, { muvelet: '' }, { forras: 'rekord' }]) {
    try {
      const m = auditMondat(rossz)
      if (typeof m !== 'string' || !m.trim()) hibak.push(`üres mondat: ${JSON.stringify(rossz)}`)
    } catch (e) {
      hibak.push(`DOBOTT (${JSON.stringify(rossz)}): ${e?.message || e}`)
    }
  }
  if (auditIdopont('nem-datum') !== 'nem-datum') hibak.push('rossz időbélyeg nem marad nyersen')
  if (auditIdopont(null) !== 'ismeretlen időpont') hibak.push('üres időbélyegnél nincs magyar szöveg')
  if (cselekvoNeve({ kiNeve: null, kiEmail: null }).length < 5) hibak.push('ismeretlen cselekvőnél nincs szöveg')
  if (hibak.length > 0) fail(`N4: ${hibak.join(' | ')}`)
  else ok('N4 hiányos naplósorra sem dob, és nem talál ki adatot')
}

{
  // Súly-besorolás (a felület ez alapján színez).
  const vart = [
    [{ muvelet: 'login', forras: 'esemeny' }, 'belepes'],
    [{ muvelet: 'member.save', forras: 'esemeny' }, 'modositas'],
    [{ muvelet: 'member.delete.permanent', forras: 'esemeny' }, 'torles'],
    [{ muvelet: 'profile_role.revoke', forras: 'esemeny' }, 'torles'],
    [{ muvelet: 'INSERT', forras: 'rekord' }, 'letrehozas'],
    [{ muvelet: 'UPDATE', forras: 'rekord' }, 'modositas'],
    [{ muvelet: 'DELETE', forras: 'rekord' }, 'torles'],
    [{ muvelet: 'TRUNCATE', forras: 'rekord' }, 'egyeb'],
  ]
  const hibak = []
  for (const [sor, varhato] of vart) {
    const kapott = muveletSulya(sor)
    if (kapott !== varhato) hibak.push(`${sor.muvelet}: ${kapott}, várt ${varhato}`)
  }
  if (hibak.length > 0) fail(`N5: ${hibak.join(' | ')}`)
  else ok('N5 a művelet-súly besorolás helyes (a törlés nem néz ki belépésnek)')
}

// ── IGAZMONDÁS: a felület KIMONDJA a napló korlátját ───────────────────────
{
  const szoveg = (NAPLO_KORLATOK || []).join(' ')
  const hibak = []
  if (!Array.isArray(NAPLO_KORLATOK) || NAPLO_KORLATOK.length < 3) hibak.push('túl kevés korlát-szöveg')
  if (!/megtekint/i.test(szoveg)) hibak.push('nem beszél a MEGTEKINTÉSRŐL')
  if (!/nem kerül naplóba|nem naplózza|NEM kerül/i.test(szoveg)) {
    hibak.push('nem mondja ki, hogy a megtekintés NEM kerül naplóba')
  }
  if (!/nem bizonyítja|nem jelenti/i.test(szoveg)) {
    hibak.push('nem figyelmeztet, hogy az üres kimutatás nem bizonyít semmit')
  }
  if (hibak.length > 0) fail(`N6: ${hibak.join(' | ')} — a kimutatás HAMIS biztonságérzetet adna`)
  else ok('N6 a kimutatás kimondja, hogy a puszta megtekintést a rendszer ma nem naplózza')
}

{
  const szoveg = (CSOMAG_TAJEKOZTATO || []).join(' ')
  if (!/NINCS benne/.test(szoveg) || !/saját gyülekezet/i.test(szoveg)) {
    fail('N7: a csomag-tájékoztató nem mondja ki, mi NINCS benne, illetve hogy csak a saját gyülekezeté')
  } else ok('N7 a csomag-tájékoztató kimondja a csomag határait')
}

// ════════════════════════════════════════════════════════════════════════════
// A) SZERVER-AKCIÓ SZÖVEGES ŐREI (kommentek nélkül mérve)
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ A kommenteket KISZEDJÜK: különben egy „exportHatokorEllenorzes"-t említő
//    magyarázó komment önmagában zöldre festené az őrt, miközben a HÍVÁS
//    hiányzik a kódból.

function kommentNelkul(forras) {
  return forras.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

if (!fs.existsSync(AKCIOK)) {
  fail(`A0: hiányzik a szerver-akció fájl: ${AKCIOK}`)
} else {
  const nyers = fs.readFileSync(AKCIOK, 'utf8')
  const kod = kommentNelkul(nyers)

  // A1 — MINDEN adatot adó akció ELŐSZÖR a hatókör-kapun megy át.
  const kapuHivasok = (kod.match(/exportHatokorEllenorzes\s*\(/g) || []).length
  if (kapuHivasok < 4) {
    fail(
      `A1: a hatókör-kaput csak ${kapuHivasok} helyen hívja a szerver-akció (várt legalább 4: ` +
        'terv, szelet, naplózás, gyülekezeti napló) — valamelyik út KAPU NÉLKÜL adna adatot',
    )
  } else ok(`A1 a hatókör-kapu mind a ${kapuHivasok} adatkiadó úton lefut`)

  // A2 — az allowlist a klienstől jövő táblanevet kapuzza.
  if (!/tervElem\s*\(\s*tabla\s*\)/.test(kod) || !/if\s*\(\s*!\s*terv\s*\)/.test(kod)) {
    fail('A2: a klienstől jövő táblanév nem megy át a tervElem allowlistján')
  } else ok('A2 a klienstől jövő táblanevet az allowlist kapuzza')

  // A3 — azonosító-listás lekérdezés CSAK darabolva.
  const inHivasok = (kod.match(/\.in\s*\(/g) || []).length
  if (inHivasok === 0) {
    fail('A3: nincs egyetlen .in() hívás sem — a származtatott táblák nem kérdeződnek le')
  } else if (!/for\s*\(\s*const\s+darab\s+of\s+darabol\s*\(/.test(kod)) {
    fail('A3: az .in() szűrő NINCS 80-asával darabolva — nagy gyülekezetnél 414-re fut')
  } else if (inHivasok > 1) {
    fail(
      `A3: ${inHivasok} db .in() hívás van, de a darabolás csak egy helyen történik — ` +
        'a többi darabolatlan maradhatott',
    )
  } else ok('A3 minden azonosító-listás szűrő a darabolt segédfüggvényen megy át')

  // A4 — a saját napló EXPLICIT user_id szűrőt kap (nem bízunk pusztán az RLS-re:
  //      a policy `user_id = auth.uid() OR is_admin()`, tehát egy rendszergazda
  //      enélkül MINDENKI sorát látná a SAJÁT kimutatásában).
  if (!/\.eq\(\s*'user_id'\s*,/.test(kod)) {
    fail('A4: az audit_log lekérdezés nem szűr EXPLICIT user_id-re — admin mindenki sorát látná')
  } else ok('A4 a saját tevékenység-napló explicit user_id szűrőt kap')

  // A5 — a hiányzó tábla NEM hibaoldal.
  if (!/42P01/.test(kod)) {
    fail('A5: a hiányzó tábla (42P01) nincs kezelve — a felület piros hibaoldalt festene')
  } else ok('A5 a hiányzó tábla (42P01) magyar magyarázatot kap, nem hibaoldalt')

  // A6 — MUTÁNS: ha a kapu-hívásokat kivesszük, az A1 őrnek buknia kell.
  const mutans = kod.replace(/exportHatokorEllenorzes\s*\(/g, 'valamiMas(')
  const mutansHivasok = (mutans.match(/exportHatokorEllenorzes\s*\(/g) || []).length
  if (mutansHivasok >= 4) {
    fail('A6: az A1 őr VAK — a kapu-hívások eltávolítása után is átmenne')
  } else ok('A6 a kapu-őr mutánson bizonyítottan bukik (nem vak)')
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nAdatexport + betekintés-kimutatás önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nAdatexport + betekintés-kimutatás önellenőrzés: minden zöld')
