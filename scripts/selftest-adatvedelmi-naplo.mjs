#!/usr/bin/env node
/**
 * ADATVÉDELMI NAPLÓ önellenőrzés (2026-08-23).
 *
 * Mit véd:
 *   · `apps/web/app/(dashboard)/admin/adatvedelem-shared.ts` — a határidő-
 *     számítás és az állapot-derivált TISZTA magja,
 *   · `apps/web/app/(dashboard)/admin/adatvedelem-actions.ts` — a hiányzó
 *     tábla (42P01) kezelése,
 *   · `migration-docs/sql/2026-08-23-adatvedelmi-kerelmek.sql` — a DB CHECK-
 *     listák és a TS-konstansok EGYEZÉSE.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A TESZT
 * ════════════════════════════════════════════════════════════════════════════
 * Az Adatvédelmi tájékoztató EGY HÓNAPOS határidőt ígér az érintetti
 * kérelmekre, a GDPR 5(2) cikke pedig elszámoltathatóságot követel. Négy dolog
 * romolhat el NÉMÁN, és mind a négy csak egy hatósági kérdésnél derülne ki:
 *
 *  (1) A HATÁRIDŐ „egyszerűsítése" 30 NAPRA vagy a hónap-vég elrontása.
 *      Jan. 31. + 1 hónap = FEBR. 28., nem „febr. 31." és nem márc. 2.
 *  (2) A LEJÁRT/KÖZELGŐ HATÁRESET elcsúszása. A határidő NAPJÁN még nem
 *      lejárt; egy nappal utána már igen. Egy `<` → `<=` csere elég hozzá.
 *  (3) A HIÁNYZÓ TÁBLA (42P01) KEZELETLENSÉGE. Ez a kód ELŐBB ment élesbe,
 *      mint az SQL: kezeletlenül PIROS HIBAOLDALT festene.
 *  (4) A FORDÍTOTT HIBA: „nyeljünk el minden hibát" — ekkor egy valódi
 *      jogosultsági hiba is „még nincs bekapcsolva"-ként jelenne meg, és a
 *      lelkész sosem tudná meg, hogy baj van. (Néma üres lista — a projekt
 *      visszatérő, már megfizetett hibaosztálya.)
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ NEGATÍV ASSZERTEK — a mérce ÖNMAGÁT is méri
 * ════════════════════════════════════════════════════════════════════════════
 * MUNKASZABÁLY: „őrszem negatív asszert nélkül vak." Ezért minden állítás-
 * csomagot lefuttatunk MUTÁNSOKON is: a mag forrásába visszaírjuk a RÉGI,
 * HIBÁS viselkedést, és megköveteljük, hogy a mérce ELBUKJON rajta. Ha egy
 * mutáns zölden átmegy, az a TESZT hibája — és azt is FAIL-nek jelentjük.
 *
 * Futtatás:  node scripts/selftest-adatvedelmi-naplo.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const MAG_FAJL = path.join(
  REPO_ROOT, 'apps', 'web', 'app', '(dashboard)', 'admin', 'adatvedelem-shared.ts',
)
const ACTIONS_FAJL = path.join(
  REPO_ROOT, 'apps', 'web', 'app', '(dashboard)', 'admin', 'adatvedelem-actions.ts',
)
const PANEL_FAJL = path.join(
  REPO_ROOT, 'apps', 'web', 'components', 'admin', 'adatvedelem', 'adatvedelem-panel.tsx',
)
const AKADALY_FAJL = path.join(
  REPO_ROOT, 'apps', 'web', 'components', 'admin', 'adatvedelem', 'akadaly-panel.tsx',
)
const OLDAL_FAJL = path.join(
  REPO_ROOT, 'apps', 'web', 'app', '(dashboard)', 'admin', 'adatvedelem', 'page.tsx',
)
const SQL_FAJL = path.join(
  REPO_ROOT, 'migration-docs', 'sql', '2026-08-23-adatvedelmi-kerelmek.sql',
)

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

for (const f of [MAG_FAJL, ACTIONS_FAJL, PANEL_FAJL, AKADALY_FAJL, OLDAL_FAJL, SQL_FAJL]) {
  if (!fs.existsSync(f)) {
    fail(`hiányzik a forrás: ${f}`)
  }
}
if (failed) process.exit(1)

const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try {
  ts = require_('typescript')
} catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-adatvedelem-selftest-'))
const takarits = () => fs.rmSync(tmp, { recursive: true, force: true })

let sorszam = 0

/**
 * TS → CJS, majd betöltés.
 *
 * FAIL-CLOSED: ha valaha PROJEKT-import kerülne a magba (`server-only`, egy
 * `@/lib/...` érték-import vagy a Supabase-kliens), a `require()` ismeretlen
 * modulra futna. Inkább ITT bukjon el, érthető üzenettel — a magnak
 * import-mentesnek KELL maradnia, hogy a szerver és a kliens ugyanazt a
 * határidőt számolja, és hogy ez a teszt egyáltalán be tudja tölteni.
 */
function betoltMag(forrasSzoveg, cimke) {
  const out = ts.transpileModule(forrasSzoveg, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      isolatedModules: true,
    },
    fileName: cimke + '.ts',
  })
  const idegen = [...out.outputText.matchAll(/require\(["']([^"']+)["']\)/g)]
    .map((m) => m[1])
    .filter((m) => !m.startsWith('node:') && !m.startsWith('.'))
  if (idegen.length > 0) {
    throw new Error(
      `${cimke}: FUTÁSIDEJŰ PROJEKT-IMPORT került a magba (${idegen.join(', ')}). ` +
        'A határidő-számítás csak import nélkül tesztelhető önállóan.',
    )
  }
  sorszam += 1
  const dest = path.join(tmp, `${cimke}-${sorszam}.js`)
  fs.writeFileSync(dest, out.outputText, 'utf8')
  return require_(dest)
}

const MAG_FORRAS = fs.readFileSync(MAG_FAJL, 'utf8')

let mag
try {
  mag = betoltMag(MAG_FORRAS, 'adatvedelem-shared')
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  takarits()
  process.exit(1)
}

// ════════════════════════════════════════════════════════════════════════════
// AZ ÁLLÍTÁS-CSOMAG — ugyanez fut az ÉLES magon és minden MUTÁNSON
// ════════════════════════════════════════════════════════════════════════════

/**
 * @returns {string[]} a megbukott állítások leírásai (üres tömb = minden jó)
 */
function allitasCsomag(m) {
  const bukas = []
  const jelent = (cimke, felt, reszlet) => {
    if (!felt) bukas.push(`${cimke}${reszlet ? ' — ' + reszlet : ''}`)
  }

  if (
    typeof m.hataridoSzamitas !== 'function' ||
    typeof m.hataridoAllapot !== 'function' ||
    typeof m.ertelmezdLekerdezesHibat !== 'function' ||
    typeof m.kerelemOsszesito !== 'function'
  ) {
    bukas.push('A0: a mag nem exportálja a szükséges függvényeket')
    return bukas
  }

  // ── H) HATÁRIDŐ = BEÉRKEZÉS + 1 HÓNAP ────────────────────────────────────
  const hataridoEsetek = [
    ['2026-08-23', '2026-09-23', 'sima hónapváltás'],
    ['2026-01-15', '2026-02-15', 'sima hónap közepe'],
    ['2026-12-31', '2027-01-31', 'ÉVFORDULÓ (dec. → jan.)'],
    ['2026-01-31', '2026-02-28', 'HÓNAP-VÉG: jan. 31. → febr. 28. (nem szökőév)'],
    ['2024-01-31', '2024-02-29', 'HÓNAP-VÉG szökőévben: jan. 31. → febr. 29.'],
    ['2026-03-31', '2026-04-30', 'HÓNAP-VÉG: márc. 31. → ápr. 30.'],
    ['2026-01-30', '2026-02-28', 'HÓNAP-VÉG: jan. 30. → febr. 28.'],
  ]
  for (const [be, vart, miert] of hataridoEsetek) {
    const kapott = m.hataridoSzamitas(be)
    jelent(`H(${be})`, kapott === vart, `${miert}: várt ${vart}, kapott ${String(kapott)}`)
  }
  // 30 NAPOS KÖZELÍTÉS TILOS: ha valaki „egyszerűsít", ez a kettő buktatja.
  jelent(
    'H(nem 30 nap)',
    m.hataridoSzamitas('2026-08-23') !== '2026-09-22',
    'a beérkezés + 30 nap NEM egy hónap',
  )
  jelent('H(hibás bemenet)', m.hataridoSzamitas('nem-datum') === null, 'hibás dátum → null')
  jelent('H(üres bemenet)', m.hataridoSzamitas(null) === null, 'null → null')

  // ── B) HATÁRESETEK a lejárt / közelgő / rendben besorolásban ─────────────
  const szint = (hatarido, ma, allapot) => m.hataridoAllapot({ hatarido, ma, allapot }).szint
  const napok = (hatarido, ma) => m.hataridoAllapot({ hatarido, ma }).hatralevoNapok

  jelent(
    'B1 pontosan a határidőn',
    szint('2026-09-23', '2026-09-23') === 'kozelgo',
    `a határidő NAPJÁN még NEM lejárt (kapott: ${szint('2026-09-23', '2026-09-23')})`,
  )
  jelent(
    'B2 egy nappal a határidő ELŐTT',
    szint('2026-09-23', '2026-09-22') === 'kozelgo',
    `kapott: ${szint('2026-09-23', '2026-09-22')}`,
  )
  jelent(
    'B3 egy nappal a határidő UTÁN',
    szint('2026-09-23', '2026-09-24') === 'lejart',
    `kapott: ${szint('2026-09-23', '2026-09-24')}`,
  )
  jelent(
    'B4 pontosan a küszöbön (7 nap)',
    szint('2026-09-23', '2026-09-16') === 'kozelgo',
    `a 7. nap MÉG közelgő (kapott: ${szint('2026-09-23', '2026-09-16')})`,
  )
  jelent(
    'B5 a küszöbön kívül (8 nap)',
    szint('2026-09-23', '2026-09-15') === 'rendben',
    `a 8. nap MÁR rendben (kapott: ${szint('2026-09-23', '2026-09-15')})`,
  )
  jelent('B6 hátralévő napok (0)', napok('2026-09-23', '2026-09-23') === 0, 'ma jár le → 0')
  jelent('B7 hátralévő napok (−1)', napok('2026-09-23', '2026-09-24') === -1, 'tegnap járt le → −1')
  jelent(
    'B8 hónap- és évhatáron át',
    napok('2027-01-02', '2026-12-31') === 2,
    `dec. 31. → jan. 2. = 2 nap (kapott: ${napok('2027-01-02', '2026-12-31')})`,
  )

  // ── L) LEZÁRT ÁLLAPOT: a határidő már nem ketyeg ─────────────────────────
  jelent(
    'L1 teljesítve → lezárt (akkor is, ha rég lejárt)',
    szint('2020-01-01', '2026-09-23', 'teljesitve') === 'lezart',
    `kapott: ${szint('2020-01-01', '2026-09-23', 'teljesitve')}`,
  )
  jelent(
    'L2 elutasítva → lezárt',
    szint('2020-01-01', '2026-09-23', 'elutasitva') === 'lezart',
  )
  jelent(
    'L3 részben teljesítve → lezárt (érdemi válasz)',
    szint('2020-01-01', '2026-09-23', 'reszben') === 'lezart',
  )
  jelent(
    'L4 folyamatban + lejárt határidő → LEJÁRT (nem lezárt!)',
    szint('2020-01-01', '2026-09-23', 'folyamatban') === 'lejart',
    `kapott: ${szint('2020-01-01', '2026-09-23', 'folyamatban')}`,
  )
  jelent(
    'L5 hiányzó határidő → ismeretlen, NEM „rendben"',
    szint(null, '2026-09-23', 'uj') === 'ismeretlen',
    `kapott: ${szint(null, '2026-09-23', 'uj')}`,
  )

  // ── Ö) ÖSSZESÍTŐ ─────────────────────────────────────────────────────────
  const sorok = [
    { id: 'a', hatarido: '2026-09-01', allapot: 'uj' },            // lejárt
    { id: 'b', hatarido: '2026-09-25', allapot: 'folyamatban' },   // közelgő (2 nap)
    { id: 'c', hatarido: '2026-12-01', allapot: 'uj' },            // rendben
    { id: 'd', hatarido: '2026-09-01', allapot: 'teljesitve' },    // lezárt
  ]
  const o = m.kerelemOsszesito(sorok, '2026-09-23')
  jelent('Ö1 összes', o.osszes === 4, `kapott: ${o.osszes}`)
  jelent('Ö2 nyitott', o.nyitott === 3, `kapott: ${o.nyitott}`)
  jelent('Ö3 lejárt', o.lejart === 1, `kapott: ${o.lejart}`)
  jelent('Ö4 közelgő', o.kozelgo === 1, `kapott: ${o.kozelgo}`)
  jelent('Ö5 lezárt', o.lezart === 1, `kapott: ${o.lezart}`)

  // ── T) A HIÁNYZÓ TÁBLA ÁGA — NEM DOB, MAGYARUL MAGYARÁZ ──────────────────
  // (1) csak a hibakód árulkodik (a PostgREST néha üzenet nélkül válaszol)
  let e1
  try {
    e1 = m.ertelmezdLekerdezesHibat({ code: '42P01', message: '' })
  } catch (err) {
    bukas.push(`T1: DOBOTT a 42P01-re (${err?.message || err}) — a felület hibaoldalt festene`)
    e1 = null
  }
  jelent('T1 42P01 → tabla_hianyzik', e1 != null && e1.fajta === 'tabla_hianyzik',
    `kapott: ${e1 && e1.fajta}`)
  jelent(
    'T1b 42P01 → MAGYAR magyarázat',
    e1 != null && typeof e1.uzenet === 'string' && /nincs bekapcsolva/i.test(e1.uzenet),
    `kapott üzenet: ${e1 && e1.uzenet}`,
  )
  // (2) a PostgREST séma-gyorsítótár változata
  let e2
  try {
    e2 = m.ertelmezdLekerdezesHibat({ code: 'PGRST205', message: '' })
  } catch (err) {
    bukas.push(`T2: DOBOTT a PGRST205-re (${err?.message || err})`)
    e2 = null
  }
  jelent('T2 PGRST205 → tabla_hianyzik', e2 != null && e2.fajta === 'tabla_hianyzik')
  // (3) csak a szöveg árulkodik
  const e3 = m.ertelmezdLekerdezesHibat({
    code: '', message: 'relation "public.adatvedelmi_kerelmek" does not exist',
  })
  jelent('T3 szöveges felismerés', e3.fajta === 'tabla_hianyzik', `kapott: ${e3.fajta}`)

  // ── N) A FORDÍTOTT IRÁNY: VALÓDI HIBA MARADJON HANGOS ────────────────────
  const n1 = m.ertelmezdLekerdezesHibat({ code: '42501', message: 'permission denied for table' })
  jelent('N1 jogosultsági hiba NEM „nincs bekapcsolva"', n1.fajta === 'egyeb', `kapott: ${n1.fajta}`)
  jelent(
    'N1b a valódi hibaüzenet TOVÁBBMEGY',
    typeof n1.uzenet === 'string' && n1.uzenet.includes('permission denied'),
    `kapott: ${n1.uzenet}`,
  )
  const n2 = m.ertelmezdLekerdezesHibat(null)
  jelent('N2 nincs hiba → nincs_hiba', n2.fajta === 'nincs_hiba', `kapott: ${n2.fajta}`)

  // ── R) RENDEZÉS: a legsürgetőbb elöl, a lezártak hátul ───────────────────
  if (typeof m.rendezdKerelmeket === 'function') {
    const r = m.rendezdKerelmeket([
      { id: 'x', hatarido: '2026-09-30', beerkezesDatuma: '2026-08-30', allapot: 'uj' },
      { id: 'y', hatarido: '2026-09-01', beerkezesDatuma: '2026-08-01', allapot: 'teljesitve' },
      { id: 'z', hatarido: '2026-09-10', beerkezesDatuma: '2026-08-10', allapot: 'folyamatban' },
    ]).map((s) => s.id).join(',')
    jelent('R1 sorrend', r === 'z,x,y', `várt: z,x,y — kapott: ${r}`)
  }

  return bukas
}

// ════════════════════════════════════════════════════════════════════════════
// 1. AZ ÉLES MAG — mindennek zöldnek kell lennie
// ════════════════════════════════════════════════════════════════════════════

{
  const bukas = allitasCsomag(mag)
  if (bukas.length === 0) {
    ok('az éles mag MINDEN állítást teljesít (határidő, határesetek, 42P01, összesítő)')
  } else {
    for (const b of bukas) fail(b)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 2. MUTÁNSOK — a RÉGI, HIBÁS viselkedést visszaírva a mércének BUKNIA KELL
// ════════════════════════════════════════════════════════════════════════════

const MUTANSOK = [
  {
    cimke: 'M1 „nincs határidő-számítás" (a határidő = a beérkezés napja)',
    keres: 'let ho = p.ho + 1',
    csere: 'let ho = p.ho + 0',
  },
  {
    cimke: 'M2 „nincs hónap-vég kezelés" (jan. 31. + 1 hó → febr. 31.)',
    keres: 'const nap = Math.min(p.nap, honapNapjai(ev, ho))',
    csere: 'const nap = p.nap',
  },
  {
    cimke: 'M3 határeset-elcsúszás: a határidő NAPJA már „lejárt"',
    keres: 'if (hatralevo < 0) {',
    csere: 'if (hatralevo <= 0) {',
  },
  {
    cimke: 'M4 „nincs sárga figyelmeztetés" (a küszöb kiiktatva)',
    keres: 'if (hatralevo <= HATARIDO_FIGYELMEZTETES_NAP) {',
    csere: 'if (hatralevo <= -99999) {',
  },
  {
    cimke: 'M5 „a 42P01 kezeletlen" (a hibakódot nem nézzük)',
    keres: "    kod === '42P01' ||\n    kod === 'PGRST205' ||",
    csere: '    false ||\n    false ||',
  },
  {
    cimke: 'M6 „nyeljünk el minden hibát" (minden hiba = nincs bekapcsolva)',
    keres: "  if (hianyzik) return { fajta: 'tabla_hianyzik', uzenet: TABLA_HIANYZIK_UZENET }",
    csere: "  if (true) return { fajta: 'tabla_hianyzik', uzenet: TABLA_HIANYZIK_UZENET }",
  },
  {
    cimke: 'M7 „a lezárt ügy is ketyeg" (a lezárt ág kiiktatva)',
    keres: '  if (lezartAllapot(bemenet.allapot)) {',
    csere: '  if (false) {',
  },
]

for (const mut of MUTANSOK) {
  if (!MAG_FORRAS.includes(mut.keres)) {
    fail(
      `${mut.cimke}: a mutáció HORGONYA ELTŰNT a magból (${JSON.stringify(mut.keres)}). ` +
        'A negatív asszert így VAK lenne — igazítsd a horgonyt a mai forráshoz.',
    )
    continue
  }
  const mutansForras = MAG_FORRAS.replace(mut.keres, mut.csere)
  let mutansMag
  try {
    mutansMag = betoltMag(mutansForras, 'mutans')
  } catch (e) {
    // A mutáns be sem töltődik → az is „bukás", vagyis a mérce fog.
    ok(`${mut.cimke} → a mutáns be sem tölthető (${String(e?.message || e).slice(0, 60)}…)`)
    continue
  }
  const bukas = allitasCsomag(mutansMag)
  if (bukas.length > 0) {
    ok(`${mut.cimke} → a mérce ELBUKTATJA (${bukas.length} állítás)`)
  } else {
    fail(
      `${mut.cimke} → a mutáns ZÖLDEN ÁTMENT. Ez a TESZT hibája: a régi, hibás ` +
        'viselkedésre nincs állítás. Írj rá egyet, mielőtt tovább mész.',
    )
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 3. A SZERVER-AKCIÓK: a 42P01 ág valóban BE VAN KÖTVE
// ════════════════════════════════════════════════════════════════════════════

/** Kommentek nélküli forrás — különben a „magyarázó komment" is találatnak számítana. */
function kommentTelenit(szoveg) {
  return szoveg
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((sor) => {
      const i = sor.indexOf('//')
      if (i < 0) return sor
      // Egyszerű védelem: ne vágjuk le a `://`-t tartalmazó sorokat (URL-ek).
      if (i > 0 && sor[i - 1] === ':') return sor
      return sor.slice(0, i)
    })
    .join('\n')
}

/** @returns {string[]} bukások */
function actionsAllitasok(forrasNyers) {
  const bukas = []
  const forras = kommentTelenit(forrasNyers)
  const jelent = (cimke, felt, reszlet) => {
    if (!felt) bukas.push(`${cimke}${reszlet ? ' — ' + reszlet : ''}`)
  }

  const lekerdezesek =
    (forras.match(/\.from\(KERELEM_TABLA\)/g) || []).length +
    (forras.match(/\.from\(ASZF_TABLA\)/g) || []).length
  const kezelesek = (forras.match(/ertelmezdLekerdezesHibat\(/g) || []).length

  jelent('A1 van legalább egy lekérdezés az új táblákra', lekerdezesek > 0,
    `talált: ${lekerdezesek}`)
  jelent(
    'A2 MINDEN lekérdezés hibája átmegy az értelmezőn',
    kezelesek >= lekerdezesek,
    `${lekerdezesek} lekérdezés, de csak ${kezelesek} hiba-értelmezés`,
  )
  jelent(
    'A3 a hiányzó tábla saját akadály-ágat kap',
    /['"]tabla_hianyzik['"]/.test(forras),
    'nincs `tabla_hianyzik` ág — a felület piros hibaoldalt festene',
  )
  jelent(
    'A4 a szerver-akciók NEM DOBNAK (a `throw` hibaoldalt fest)',
    !/\bthrow\b/.test(forras),
    'találtam `throw`-t: hiányzó tábla esetén a felület elszállna',
  )

  return bukas
}

{
  const nyers = fs.readFileSync(ACTIONS_FAJL, 'utf8')
  const bukas = actionsAllitasok(nyers)
  if (bukas.length === 0) {
    ok('a szerver-akciók minden lekérdezése a 42P01-értelmezőn megy át, és egyik sem dob')
  } else {
    for (const b of bukas) fail(b)
  }

  // NEGATÍV ASSZERT — a régi viselkedés két változata:
  const akcioMutansok = [
    {
      cimke: 'MA1 „a 42P01 kezeletlen" (nincs hiba-értelmezés az akciókban)',
      alkalmaz: (s) => s.replace(/ertelmezdLekerdezesHibat\(/g, 'semmiKezeles('),
    },
    {
      cimke: 'MA2 „dobjunk hibát" (a hiányzó tábla piros hibaoldalt fest)',
      alkalmaz: (s) => s.replace(/const OLDAL_UT = /, 'const X = () => { throw new Error("x") }\nconst OLDAL_UT = '),
    },
  ]
  for (const mut of akcioMutansok) {
    const mutans = mut.alkalmaz(nyers)
    if (mutans === nyers) {
      fail(`${mut.cimke}: a mutáció HORGONYA ELTŰNT — a negatív asszert vak lenne.`)
      continue
    }
    const mutansBukas = actionsAllitasok(mutans)
    if (mutansBukas.length > 0) {
      ok(`${mut.cimke} → a mérce ELBUKTATJA`)
    } else {
      fail(`${mut.cimke} → ZÖLDEN ÁTMENT. A mérce vak erre a hibára.`)
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 4. A FELÜLET: a magyarázó ág tényleg meg is JELENIK
// ════════════════════════════════════════════════════════════════════════════

{
  const panel = kommentTelenit(fs.readFileSync(PANEL_FAJL, 'utf8'))
  const akadaly = kommentTelenit(fs.readFileSync(AKADALY_FAJL, 'utf8'))
  const oldal = kommentTelenit(fs.readFileSync(OLDAL_FAJL, 'utf8'))
  const magNyers = kommentTelenit(MAG_FORRAS)

  const parok = [
    ['F1 a panel rendereli az akadály-magyarázatot', /<AkadalyPanel/.test(panel)],
    [
      'F2 a lista CSAK akadálymentes állapotban jelenik meg',
      /akadaly === 'nincs_akadaly'/.test(panel),
    ],
    [
      'F3 az akadály-panel megnevezi a futtatandó SQL-fájlt',
      /ADATVEDELEM_SQL_FAJL/.test(akadaly),
    ],
    ['F4 az oldal a közös panelre épül', /AdatvedelemPanel/.test(oldal)],
    [
      'F5 a magyarázó üzenet MAGYAR és cselekvésre irányít',
      /nincs bekapcsolva/.test(magNyers) && /adatbázis-lépést/.test(magNyers),
    ],
    [
      'F6 a mag NEM olvas órát (`new Date()` tilos — a „ma" mindig paraméter)',
      !/new Date\(/.test(magNyers),
    ],
  ]
  for (const [cimke, felt] of parok) {
    if (felt) ok(cimke)
    else fail(cimke)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 5. DB ⇄ KÓD: a CHECK-listák és a TS-konstansok EGYEZNEK
// ════════════════════════════════════════════════════════════════════════════
//
// Ha a kettő széthúz, a mentés némán 23514-gyel bukik — a lelkész pedig csak
// annyit lát, hogy „nem sikerült". Ez a projekt „két felület némán széthúz"
// hibaosztályának adatbázis-oldali változata.

function sqlListaKiolvas(sqlSzoveg, constraintNev) {
  const i = sqlSzoveg.indexOf(constraintNev)
  if (i < 0) return null
  const szelet = sqlSzoveg.slice(i, i + 500)
  const kezd = szelet.indexOf('IN (')
  if (kezd < 0) return null
  const zar = szelet.indexOf('))', kezd)
  const belso = szelet.slice(kezd + 4, zar < 0 ? undefined : zar)
  return [...belso.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

{
  const sql = fs.readFileSync(SQL_FAJL, 'utf8')
  const parok = [
    ['tipus', 'adatvedelmi_kerelmek_tipus_check', mag.KERELEM_TIPUSOK],
    ['allapot', 'adatvedelmi_kerelmek_allapot_check', mag.KERELEM_ALLAPOTOK],
  ]
  for (const [nev, constraintNev, tsLista] of parok) {
    const sqlLista = sqlListaKiolvas(sql, constraintNev)
    if (!sqlLista || sqlLista.length === 0) {
      fail(`S(${nev}): nem találom a ${constraintNev} CHECK-listáját az SQL-ben`)
      continue
    }
    const a = [...sqlLista].sort().join(',')
    const b = [...tsLista].sort().join(',')
    if (a === b) ok(`S(${nev}): a DB CHECK-lista és a TS-konstans EGYEZIK (${tsLista.length} érték)`)
    else fail(`S(${nev}): SZÉTHÚZTAK — SQL: [${a}] ⇄ TS: [${b}]`)
  }

  // NEGATÍV ASSZERT: ha az SQL-ből kiesik egy érték, ennek buknia KELL.
  const csonka = sql.replace("'adathordozhatosag', 'hozzajarulas_visszavonas', 'egyeb'", "'egyeb'")
  if (csonka === sql) {
    fail('S(negatív): a mutáció horgonya eltűnt az SQL-ből — a mérce vak lenne.')
  } else {
    const csonkaLista = sqlListaKiolvas(csonka, 'adatvedelmi_kerelmek_tipus_check')
    const egyezik =
      csonkaLista && [...csonkaLista].sort().join(',') === [...mag.KERELEM_TIPUSOK].sort().join(',')
    if (egyezik) fail('S(negatív): a csonkított CHECK-lista ZÖLDEN ÁTMENT — a mérce vak.')
    else ok('S(negatív): a csonkított CHECK-listát a mérce ELBUKTATJA')
  }

  // A GRANT-ok megléte — „a policy GRANT nélkül nem tagad, hanem HIBÁZIK".
  const grantOk = [
    ['GRANT a kérelmek táblára', /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.adatvedelmi_kerelmek TO authenticated/.test(sql)],
    ['GRANT az ÁSZF-naplóra (UPDATE/DELETE nélkül)', /GRANT SELECT, INSERT ON public\.aszf_elfogadasok TO authenticated/.test(sql)],
    ['GRANT a profile_roles-on (a policy ebből olvas)', /GRANT SELECT ON public\.profile_roles TO authenticated/.test(sql)],
    ['REVOKE az anon elől', /REVOKE ALL ON public\.adatvedelmi_kerelmek FROM anon/.test(sql)],
    ['RLS bekapcsolva mindkét táblán', /ENABLE ROW LEVEL SECURITY/.test(sql) && (sql.match(/ENABLE ROW LEVEL SECURITY/g) || []).length >= 2],
    ['az ellenőrzés has_table_privilege-dzsel MÉR (nem a fájl létére hivatkozik)', /has_table_privilege\(/.test(sql)],
  ]
  for (const [cimke, felt] of grantOk) {
    if (felt) ok(`S: ${cimke}`)
    else fail(`S: ${cimke} — HIÁNYZIK`)
  }
}

takarits()

if (failed) {
  console.error('\n⛔ Az adatvédelmi napló önellenőrzése ELBUKOTT.')
  process.exit(1)
}
console.log('\n✅ Adatvédelmi napló önellenőrzés: minden rendben.')
