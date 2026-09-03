#!/usr/bin/env node
/**
 * ANAF-HATÁRIDŐ + ZIP-BEN-ZIP önellenőrzés (2026-09-03, átvilágítás P1)
 *
 * Négy védelem:
 *
 *   (1) A 60 NAPOS CSENGŐ HIBÁJA NEM NÉMA. Az RPC 2026-04 óta hibára futott
 *       (`ertesitesek.megjegyzes` nem létezett), a hívólánc pedig KÉTSZER
 *       elnyelte: a `checkOblioDeadline` egy adatbázis-hibát `no_congregation`-nek
 *       fordított, a `penzugy/page.tsx` pedig `.catch(() => {})`-tal takarta.
 *       Így a bírság-kockázatú határidőről SOHA nem jött figyelmeztetés, és
 *       senki nem tudta meg, hogy a csengő elromlott.
 *
 *   (2) AZ E-MAIL CSAK KÉRÉSRE MEGY. A rendszer magától SOHA nem küld levelet.
 *       A címzett alapból a saját cím — egy elgépelés sem küldhet idegennek.
 *
 *   (3) ZIP-BOMBA-ŐR A REKURZIÓ ELŐTT. A beolvasó a lelkész gépén fut; méret-
 *       korlát nélküli rekurzió rosszabb lenne a mai állapotnál.
 *
 *   (4) A ZIP-BEN-ZIP BEOLVASÁS, ÉS A NÉMA SIKER MEGSZŰNÉSE. Az ANAF tömeges
 *       exportjából eddig NULLA számla olvasódott be, miközben a program sikert
 *       jelzett és archiválta a külső ZIP-et — a lelkész azt hitte, megvan minden.
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): minden őrhöz
 * visszajátsszuk a hibás világot, és bizonyítjuk, hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-oblio-hatarido-es-zip.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'oblio-ellenorzes-actions.ts')
const PAGE = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'page.tsx')
const KARTYA = path.join(REPO, 'apps', 'web', 'components', 'finance', 'oblio-hatarido-emlekezteto.tsx')
const SABLON = path.join(REPO, 'apps', 'web', 'lib', 'email', 'templates', 'oblio-hatarido.ts')
const RS = path.join(REPO, 'apps', 'desktop', 'src-tauri', 'src', 'excel.rs')
const SQL = path.join(REPO, 'migration-docs', 'sql', '2026-09-03-anaf-60-napos-csengo.sql')

let failed = false
const ok = (m) => console.log(`OK:   ${m}`)
const fail = (m) => { failed = true; console.error(`HIBA: ${m}`) }

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const f of [ACTIONS, PAGE, KARTYA, SABLON, RS, SQL]) {
  if (!fs.existsSync(f)) fail(`hiányzó fájl: ${path.relative(REPO, f)}`)
}
if (failed) { console.error('\nA határidő/ZIP önellenőrzés ELBUKOTT.'); process.exit(1) }

function orzo(cimke, forras, minta, mutans) {
  const kod = kodCsak(forras)
  if (!minta.test(kod)) { fail(`${cimke} — hiányzik`); return }
  if (minta.test(kodCsak(mutans(forras)))) fail(`${cimke} — az őr VAK: a mutáns is átment`)
  else ok(cimke)
}

// ── (1) A CSENGŐ HIBÁJA HANGOS ───────────────────────────────────────────
orzo(
  '(1) az RPC hibája NEM „no_congregation" (külön státusz)',
  olvas(ACTIONS),
  /return \{ status: 'hiba', hibaUzenet: error\.message \}/,
  (s) => s.replace(/return \{ status: 'hiba', hibaUzenet: error\.message \}/g, "return { status: 'no_congregation' }"),
)
orzo(
  '(1) a hibát naplózzuk is (nem csak visszaadjuk)',
  olvas(ACTIONS),
  /console\.error\([\s\S]{0,200}?checkOblioDeadline/,
  (s) => s.replace(/console\.error\(/g, 'void ('),
)
orzo(
  '(1) az oldal sem nyeli el némán',
  olvas(PAGE),
  /if \(r\.status === 'hiba'\)[\s\S]{0,300}?console\.error/,
  (s) => s.replace(/if \(r\.status === 'hiba'\)/g, 'if (false)'),
)
{
  // A régi, üres catch nem térhet vissza.
  const p = kodCsak(olvas(PAGE))
  if (/checkOblioDeadline\(\)\.catch\(\(\) => \{\s*\}\)/.test(p)) {
    fail('(1) visszatért az üres `.catch(() => {})` — a csengő hibája megint néma lenne')
  } else ok('(1) nincs üres catch a csengő hívásán')
}

// ── (2) AZ E-MAIL CSAK KÉRÉSRE ───────────────────────────────────────────
orzo(
  '(2) van kérésre induló e-mail-küldő action',
  olvas(ACTIONS),
  /export async function sendOblioDeadlineEmail/,
  (s) => s.replace(/export async function sendOblioDeadlineEmail/g, 'async function nemHasznalt'),
)
{
  const a = kodCsak(olvas(ACTIONS))
  const i = a.indexOf('export async function sendOblioDeadlineEmail')
  const torzs = i >= 0 ? a.slice(i, i + 3000) : ''
  if (!torzs) fail('(2) a küldő action törzse nem található')
  else {
    // Alapból a SAJÁT cím — egy elgépelés se küldjön idegennek.
    if (/\|\| sajatEmail/.test(torzs)) ok('(2) alapértelmezett címzett a saját cím')
    else fail('(2) nincs saját-cím alapértelmezés — elgépelésre idegennek menne')
    // Cím-alak ellenőrzés.
    if (/test\(cimzettEmail\)/.test(torzs)) ok('(2) a címzett formátumát ellenőrizzük')
    else fail('(2) nincs e-mail-formátum ellenőrzés')
    // FAIL-LOUD: nem küldünk „valószínűleg" levelet.
    if (/if \(fiokErr\)[\s\S]{0,200}?return \{ error/.test(torzs)) {
      ok('(2) ha az adat nem olvasható, NEM küldünk levelet')
    } else fail('(2) hibás adatnál is elmenne a levél')
  }
}
{
  // A küldés SEHOL nem indulhat automatikusan: csak a kártya gombjából.
  const hivok = []
  for (const f of [PAGE, KARTYA, path.join(REPO, 'apps', 'web', 'components', 'finance', 'oblio-ellenorzes-tab.tsx')]) {
    if (fs.existsSync(f) && /sendOblioDeadlineEmail/.test(kodCsak(olvas(f)))) hivok.push(path.basename(f))
  }
  if (hivok.length === 1 && hivok[0] === 'oblio-hatarido-emlekezteto.tsx') {
    ok('(2) a küldésnek EGYETLEN hívója van: a gombos kártya')
  } else {
    fail(`(2) a küldést máshonnan is hívják (${hivok.join(', ') || 'sehonnan'}) — automatikus küldés kockázata`)
  }
}
orzo(
  '(2) a levél kimondja, hogy KÉRÉSRE ment (nem a rendszer küldte)',
  olvas(SABLON),
  /magától nem küld ilyen emlékeztetőt/,
  (s) => s.replace(/magától nem küld ilyen emlékeztetőt/g, 'automatikusan küldi'),
)

// ── (3) ZIP-BOMBA-ŐR ─────────────────────────────────────────────────────
const rs = olvas(RS)
orzo(
  '(3) van bejegyzés-szintű méret-korlát',
  rs,
  /const MAX_ZIP_ENTRY_BYTES: u64/,
  (s) => s.replace(/const MAX_ZIP_ENTRY_BYTES: u64/g, 'const NEM_HASZNALT: u64'),
)
orzo(
  '(3) van összméret-korlát a teljes beolvasásra',
  rs,
  /const MAX_ZIP_TOTAL_BYTES: u64/,
  (s) => s.replace(/const MAX_ZIP_TOTAL_BYTES: u64/g, 'const NEM_HASZNALT2: u64'),
)
orzo(
  '(3) a DEKLARÁLT méretet a kibontás ELŐTT ellenőrizzük',
  rs,
  /if deklaralt > MAX_ZIP_ENTRY_BYTES/,
  (s) => s.replace(/if deklaralt > MAX_ZIP_ENTRY_BYTES/g, 'if false'),
)
orzo(
  '(3) a tényleges olvasás is korlátozott (hazudós fejléc ellen)',
  rs,
  /\.take\(MAX_ZIP_ENTRY_BYTES \+ 1\)/,
  (s) => s.replace(/\.take\(MAX_ZIP_ENTRY_BYTES \+ 1\)\s*\n\s*/g, ''),
)

// ── (4) ZIP-BEN-ZIP + NÉMA SIKER MEGSZŰNÉSE ──────────────────────────────
orzo(
  '(4) a beágyazott ZIP-eket összegyűjtjük',
  rs,
  /zip_entries\.push\(\(i, base\)\)/,
  (s) => s.replace(/} else if lower\.ends_with\("\.zip"\) \{[\s\S]{0,200}?zip_entries\.push\(\(i, base\)\);/g, '} else if false {'),
)
orzo(
  '(4) rekurzívan feldolgozzuk őket',
  rs,
  /ingest_archive\(belso, processed, report, depth \+ 1/,
  (s) => s.replace(/ingest_archive\(belso, processed, report, depth \+ 1/g, 'nem_hivjuk('),
)
orzo(
  '(4) van MÉLYSÉG-korlát',
  rs,
  /if depth >= MAX_ZIP_DEPTH/,
  (s) => s.replace(/if depth >= MAX_ZIP_DEPTH/g, 'if false'),
)
orzo(
  '(4) NÉMA SIKER TILOS: üres eredménynél hangos hiba',
  rs,
  /nem tartalmaz sem számla-XML-t, sem PDF-et, sem beágyazott ZIP-et/,
  (s) => s.replace(/nem tartalmaz sem számla-XML-t, sem PDF-et, sem beágyazott ZIP-et/g, 'rendben'),
)
orzo(
  '(4) …és akkor is, ha a beágyazottakból sem jött semmi',
  rs,
  /a beágyazott ZIP-ekből SEM jött be egyetlen számla sem/,
  (s) => s.replace(/a beágyazott ZIP-ekből SEM jött be egyetlen számla sem/g, 'rendben'),
)

// ── (5) A MIGRÁCIÓS SQL ──────────────────────────────────────────────────
{
  const sql = olvas(SQL)
  if (/ADD COLUMN IF NOT EXISTS megjegyzes text/.test(sql)) ok('(5) a migrációs SQL idempotens')
  else fail('(5) a migrációs SQL nem az `ertesitesek.megjegyzes` oszlopot adja hozzá idempotensen')
  if (/UNION ALL/.test(sql)) ok('(5) az ellenőrző lekérdezés EGY rácsban jön (UNION ALL)')
  else fail('(5) az ellenőrzés több rácsra bomlik — a szerkesztő csak az utolsót mutatná')
  if (/értesítés/i.test(sql) && /hullám|AZONNAL/i.test(sql)) {
    ok('(5) az SQL előre figyelmeztet az értesítés-hullámra')
  } else fail('(5) az SQL nem mondja meg, hogy a futtatás után értesítések keletkeznek')
}

if (failed) { console.error('\nA határidő/ZIP önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nA határidő/ZIP önellenőrzés rendben.')
