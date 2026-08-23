#!/usr/bin/env node
/**
 * ADMIN ÁTTEKINTÉS + CHANGELOG önellenőrzés (2026-08-12).
 *
 * Mit véd:
 *   · apps/web/app/(dashboard)/admin/overview-shared.ts   — sürgősség-sorrend,
 *     újdonság-számítás, fejléc-mondat
 *   · apps/web/lib/broadcasts/changelog-parse-core.ts     — a CHANGELOG-elemző
 *   · apps/web/lib/broadcasts/changelog-status.ts         — „kiküldésre vár?"
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A TESZT
 * ════════════════════════════════════════════════════════════════════════════
 * A most javított hiba („azokat is mutatja, hogy nem volt kiküldve, amik már
 * voltak") HÁROM olyan szabályon múlt, amit egy későbbi refaktor „logikusnak
 * tűnő" egyszerűsítéssel visszaírhat:
 *
 *   (1) A CHANGELOG-elemző NEM lehet sorvég-érzékeny. A JavaScript `$` — a
 *       Perl/Python szokással ellentétben — nem illeszkedik a `\r` elé, ezért
 *       CRLF-es munkapéldányon sem a `<!-- key: -->` sor, sem a `## [dátum]`
 *       FEJLÉC nem parse-olódott: a régi elemző CRLF-en NULLA bejegyzést adott,
 *       vagyis a Windows-os fejlesztői gépen a Frissítések lista üres volt.
 *       (Éles, LF-es futáson ez a hiba nem jelentkezett — a bejelentett éles
 *       tünet gyökere a CÍMBŐL generált kulcs, lásd (4).)
 *   (2) A „kiküldésre vár" definíciójának EGY helyen kell élnie, és a KÉZI
 *       jelölést is figyelembe kell vennie.
 *   (3) A riadók sorrendje FIX kell legyen (fokozat-sáv + alapsúly), különben
 *       elveszik az izommemória — pont attól a felhasználótól, akinek a
 *       legnagyobb szüksége van rá.
 *   (4) A betűvel toldott dátumú, JAVÍTÁS ELŐTTI bejegyzések nem billenhetnek
 *       be egyszerre a „kiküldésre vár" listába: 63 ilyen van, és a tömeges
 *       küldés gombja egy kattintással 285 VALÓDI kiküldést kínálna fel
 *       ~495 gyülekezetnek.
 *   (5) A kiküldési státusz beolvasása NEM mehet `.limit()`-tel: a PostgREST
 *       1000 soros plafonja mindig erősebb nála, tehát a rá épített csonkolás-
 *       őr sosem sülne el. Lapozni kell (`selectAllPaged`).
 *
 * Futtatás:  node scripts/selftest-attekintes.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const WEB = path.join(REPO_ROOT, 'apps', 'web')

const FORRASOK = {
  overview: path.join(WEB, 'app', '(dashboard)', 'admin', 'overview-shared.ts'),
  parser: path.join(WEB, 'lib', 'broadcasts', 'changelog-parse-core.ts'),
  status: path.join(WEB, 'lib', 'broadcasts', 'changelog-status.ts'),
  // 2026-08-12: az idő-formázó KÖZÖS modulja. Szintén import-mentes, tehát
  // ugyanígy betölthető — és mostantól ez az EGYETLEN relatív-idő
  // implementáció a kódbázisban (korábban három másolat élt belőle).
  ido: path.join(WEB, 'lib', 'utils', 'idopont-bukarest.ts'),
  // 2026-08-22 (7. pont): a SZERVEZETI FA döntési magja. Szintén import-mentes
  // — a „nem tudjuk ≠ 0" szabály itt él, és az R) szakasz ezt őrzi.
  szervezet: path.join(WEB, 'app', '(dashboard)', 'admin', 'szervezet-shared.ts'),
}

/** A szervezeti fa szerver-akciója és felülete — SZÖVEGES ellenőrzésekhez. */
const SZERVEZET_FORRASOK = {
  akcio: path.join(WEB, 'app', '(dashboard)', 'admin', 'szervezet-actions.ts'),
  csomopont: path.join(WEB, 'components', 'admin', 'szervezet', 'fa-csomopont.tsx'),
}

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

for (const [nev, p] of Object.entries(FORRASOK)) {
  if (!fs.existsSync(p)) {
    fail(`hiányzik a forrás (${nev}): ${p}`)
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-attekintes-selftest-'))

/**
 * TS → CJS, majd betöltés.
 *
 * FAIL-CLOSED: ha valaha PROJEKT-import kerülne ezekbe a fájlokba (pl.
 * `server-only` vagy egy `@/lib/...` érték-import), a `require()` ismeretlen
 * modulra futna. Inkább ITT bukjon el, érthető üzenettel — a döntési magnak
 * import-mentesnek KELL maradnia.
 */
function loadTs(srcFile, outName) {
  const code = fs.readFileSync(srcFile, 'utf8')
  const out = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  })
  const file = path.join(tmp, outName)
  fs.writeFileSync(file, out.outputText)
  try {
    return require_(file)
  } catch (e) {
    fail(`${path.basename(srcFile)} betöltése elhasalt (projekt-import került bele?): ${e.message}`)
    return null
  }
}

const O = loadTs(FORRASOK.overview, 'overview.cjs')
const P = loadTs(FORRASOK.parser, 'parser.cjs')
const S = loadTs(FORRASOK.status, 'status.cjs')
const T = loadTs(FORRASOK.ido, 'ido.cjs')
const SZ = loadTs(FORRASOK.szervezet, 'szervezet.cjs')
if (!O || !P || !S || !T || !SZ) {
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

/**
 * Kód a kommentek NÉLKÜL — szöveges ellenőrzésekhez.
 *
 * ⚠️ MIÉRT KELL: a fájlok tele vannak olyan magyarázó kommenttel, ami SZÓ
 *    SZERINT tartalmazza a keresett mintát („nem eshet vissza `?? 0`-ra").
 *    Kommentek nélkül nézve az őrszem a VALÓDI kódot méri, nem a szándékot.
 */
function tisztitKod(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return !t.startsWith('//') && !t.startsWith('*')
    })
    .map((l) => l.replace(/\s\/\/.*$/, ''))
    .join('\n')
}

// ────────────────────────────────────────────────────────────────────────────
// A) A CHANGELOG-ELEMZŐ NEM LEHET SORVÉG-ÉRZÉKENY — ez volt a gyökér-ok
// ────────────────────────────────────────────────────────────────────────────
{
  const torzs = [
    '## [2026-08-12] — A mentés élesítése, három néma adatvesztés',
    '<!-- key: 2026-08-12-mentes-elesites-nema-adatvesztes -->',
    '<!-- category: bugfix -->',
    '<!-- version: web v0.9.162 -->',
    '',
    '- **Valami**: leírás',
    '',
  ]
  const lf = P.parseChangelogText(torzs.join('\n'))
  const crlf = P.parseChangelogText(torzs.join('\r\n'))

  if (lf.length === 1 && lf[0].key === '2026-08-12-mentes-elesites-nema-adatvesztes') {
    ok('A1 LF-es fájlból a saját kulcsot olvassa ki')
  } else {
    fail(`A1: LF — ${JSON.stringify(lf.map((e) => e.key))}`)
  }

  if (crlf.length === 1 && crlf[0].key === lf[0].key) {
    ok('A2 CRLF-es fájlból UGYANAZT a kulcsot olvassa ki (ez volt a gyökér-ok)')
  } else {
    fail(
      `A2: CRLF mellett más kulcs jött ki — ${JSON.stringify(crlf.map((e) => e.key))}. ` +
        'A JS `$` nem illeszkedik a `\\r` elé; a sorvég-normalizálás nem törölhető.',
    )
  }

  if (crlf[0].category === 'bugfix' && crlf[0].version === 'web v0.9.162') {
    ok('A3 CRLF mellett a kategória és a verzió sem vész el')
  } else {
    fail(`A3: CRLF — category=${crlf[0].category}, version=${crlf[0].version}`)
  }

  if (!crlf[0].bodyMarkdown.includes('<!--')) {
    ok('A4 a metaadat-kommentek NEM olvadnak bele a törzsbe (különben kimennének e-mailben)')
  } else {
    fail('A4: a törzs metaadat-kommentet tartalmaz')
  }

  if (crlf[0].keyGenerated === false) {
    ok('A5 saját kulcsnál a keyGenerated hamis')
  } else {
    fail('A5: keyGenerated igaz, pedig van saját kulcs')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// B) BETŰVEL TOLDOTT DÁTUM — a régi elemző ezeket NÉMÁN elnyelte
// ────────────────────────────────────────────────────────────────────────────
{
  const szoveg = [
    '## [2026-05-06c] — Harmadik aznapi kiadás',
    '<!-- key: 2026-05-06c-harmadik -->',
    '',
    'törzs C',
    '',
    '## [2026-05-06] — Az aznapi első',
    '<!-- key: 2026-05-06-elso -->',
    '',
    'törzs A',
  ].join('\n')
  const e = P.parseChangelogText(szoveg)
  if (e.length === 2) {
    ok('B1 a betűvel toldott dátumú fejléc ÖNÁLLÓ bejegyzés lett')
  } else {
    fail(`B1: ${e.length} bejegyzés (2 kellene) — a toldott fejléc beleolvadt az előzőbe`)
  }
  if (e[0] && e[0].dateLabel === '2026-05-06c' && e[0].date === '2026-05-06') {
    ok('B2 a dateLabel a teljes címke, a date a sima dátum')
  } else {
    fail(`B2: dateLabel=${e[0] && e[0].dateLabel}, date=${e[0] && e[0].date}`)
  }
  if (e[0] && !e[0].bodyMarkdown.includes('törzs A')) {
    ok('B3 a törzsek NEM csúsznak össze (a 141 kB-os bejegyzés így keletkezett)')
  } else {
    fail('B3: az első bejegyzés törzse elnyelte a következőt')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// C) A SABLON-SOR NEM BEJEGYZÉS
// ────────────────────────────────────────────────────────────────────────────
{
  const e = P.parseChangelogText(
    ['```', '## [YYYY-MM-DD] — Rövid összefoglaló', '<!-- key: YYYY-MM-DD-rovid -->', '```'].join('\n'),
  )
  if (e.length === 0) {
    ok('C1 a fájl tetején lévő `[YYYY-MM-DD]` SABLON nem lesz bejegyzés')
  } else {
    fail(`C1: a sablon bejegyzésként parse-olódott (${e.length} db)`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// D) HIÁNYZÓ KULCS — generálódik, DE meg van jelölve
// ────────────────────────────────────────────────────────────────────────────
{
  const e = P.parseChangelogText('## [2026-07-01] — Cím ékezettel: árvíztűrő\n\ntörzs\n')
  if (e.length === 1 && e[0].keyGenerated === true) {
    ok('D1 saját kulcs nélkül a keyGenerated IGAZ (a felület kiírja a csapdát)')
  } else {
    fail(`D1: keyGenerated=${e[0] && e[0].keyGenerated}`)
  }
  if (e[0] && /^[a-z0-9-]+$/.test(e[0].key)) {
    ok('D2 a generált kulcs ékezet nélküli, kisbetűs, kötőjeles')
  } else {
    fail(`D2: a generált kulcs alakja rossz: ${e[0] && e[0].key}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// E) „KIKÜLDÉSRE VÁR?" — a KÉZI jelölés is elintézettnek számít
// ────────────────────────────────────────────────────────────────────────────
{
  const alap = {
    key: 'k',
    keyGenerated: false,
    date: '2026-08-01',
    dateLabel: '2026-08-01',
    title: 'c',
    category: null,
    version: null,
    targetsHint: null,
    bodyMarkdown: '',
    alreadySent: false,
    broadcastStatus: null,
    jeloles: null,
  }
  const jelolt = {
    ...alap,
    jeloles: {
      kiemelt: false,
      kiemelteNev: null,
      kiemelveAt: null,
      kikuldottnekJelolveAt: '2026-08-12T10:00:00Z',
      kikuldottnekJelolteNev: 'Szőcs Endre',
      megjegyzes: null,
    },
  }

  if (S.varKikuldesre(alap) === true) ok('E1 jelöletlen, ki nem küldött bejegyzés VÁR kiküldésre')
  else fail('E1: nem vár, pedig kellene')

  if (S.varKikuldesre({ ...alap, alreadySent: true }) === false) {
    ok('E2 a valódi kiküldés elintézi')
  } else {
    fail('E2: alreadySent mellett is várna')
  }

  if (S.varKikuldesre(jelolt) === false) {
    ok('E3 a KÉZI „kiküldöttnek jelölés" is elintézi — ez a kiút újraküldés nélkül')
  } else {
    fail('E3: a kézi jelölés nem számít elintézettnek')
  }

  if (S.elintezett(jelolt) === true && jelolt.alreadySent === false) {
    ok('E4 a kézi jelölés NEM állítja azt, hogy valódi kiküldés történt (alreadySent marad hamis)')
  } else {
    fail('E4: a kézi jelölés összemosódott a valódi kiküldéssel')
  }

  if (S.varKikuldesre({ ...alap, readMarked: true }) === false) {
    ok('E5 az archivált (küszöb előtti) bejegyzés nem vár kiküldésre')
  } else {
    fail('E5: archivált bejegyzés kiküldésre várna')
  }

  // E6–E8: az elemző-javítás hozta felszínre? A feltétel PONTOS legyen.
  const toldott = { ...alap, date: '2026-05-06', dateLabel: '2026-05-06c' }
  if (S.elemzoJavitasHoztaFelszinre(toldott) === true) {
    ok('E6 a javítás ELŐTTI, betűvel toldott bejegyzést felismeri (63 ilyen van)')
  } else {
    fail('E6: nem ismerte fel — 63 régi tétel billenne be a kiküldésre várók közé')
  }
  if (S.elemzoJavitasHoztaFelszinre({ ...alap, date: '2026-05-06', dateLabel: '2026-05-06' }) === false) {
    ok('E7 a toldalék NÉLKÜLI régi bejegyzést NEM archiválja (azok valódi tételek)')
  } else {
    fail('E7: toldalék nélküli bejegyzést is archivált volna')
  }
  const ujToldott = { ...alap, date: '2026-09-01', dateLabel: '2026-09-01b' }
  if (S.elemzoJavitasHoztaFelszinre(ujToldott) === false) {
    ok('E8 a javítás UTÁN írt, toldalékos bejegyzés teljes értékű, kiküldhető marad')
  } else {
    fail('E8: az új toldalékos bejegyzéseket is elnyelné — a hiba az ellenkező irányba fordulna')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F) RENDEZÉS — kiemelt elöl, azon belül a legfrissebb; a bemenet nem sérül
// ────────────────────────────────────────────────────────────────────────────
{
  const mk = (key, dateLabel, kiemelt) => ({
    key,
    keyGenerated: false,
    date: dateLabel.slice(0, 10),
    dateLabel,
    title: key,
    category: null,
    version: null,
    targetsHint: null,
    bodyMarkdown: '',
    alreadySent: false,
    broadcastStatus: null,
    jeloles: kiemelt
      ? {
          kiemelt: true,
          kiemelteNev: null,
          kiemelveAt: '2026-08-12T00:00:00Z',
          kikuldottnekJelolveAt: null,
          kikuldottnekJelolteNev: null,
          megjegyzes: null,
        }
      : null,
  })
  const bemenet = [mk('a', '2026-08-01', false), mk('b', '2026-05-06', true), mk('c', '2026-08-05', false)]
  const eredeti = bemenet.map((e) => e.key).join(',')
  const r = S.rendez(bemenet)
  if (r.map((e) => e.key).join(',') === 'b,c,a') {
    ok('F1 a kiemelt elöl, azon belül a legfrissebb felül')
  } else {
    fail(`F1: ${r.map((e) => e.key).join(',')}`)
  }
  if (bemenet.map((e) => e.key).join(',') === eredeti) {
    ok('F2 a rendezés nem módosítja a bemeneti tömböt')
  } else {
    fail('F2: a rendez() felülírta a hívó tömbjét')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// G) TÖRZS-MÉRET ŐR — a 141 kB-os bejegyzés nem mehet ki
// ────────────────────────────────────────────────────────────────────────────
{
  const nagy = { bodyMarkdown: 'x'.repeat(S.TORZS_FIGYELMEZTETES_KARAKTER + 1) }
  const kicsi = { bodyMarkdown: 'x'.repeat(100) }
  if (S.torzsTulNagy(nagy) === true && S.torzsTulNagy(kicsi) === false) {
    ok('G1 a méret-őr a nagy törzset kiszűri, a normálisat átengedi')
  } else {
    fail('G1: a méret-őr nem működik')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// H) RIADÓ-SORREND — FIX, determinisztikus, a bemenet nem sérül
// ────────────────────────────────────────────────────────────────────────────
{
  const mk = (id, fokozat) => ({
    id,
    fokozat,
    cim: id,
    mondat: '',
    szam: null,
    gombFelirat: '',
    ut: '/',
    jelvenyek: [],
    alsorok: [],
  })

  const r1 = O.riadokSorrendben([
    mk('arva_gyulekezet', 'tajekoztato'),
    mk('god_mode', 'kritikus'),
    mk('kerelem', 'figyelem'),
  ])
  if (r1.map((r) => r.id).join(',') === 'god_mode,kerelem,arva_gyulekezet') {
    ok('H1 a kritikus a figyelem elé, a figyelem a tájékoztató elé kerül')
  } else {
    fail(`H1: ${r1.map((r) => r.id).join(',')}`)
  }

  // Ugyanazon fokozaton belül az alapsúly dönt — és MINDIG ugyanúgy.
  const parban = [mk('jegy', 'figyelem'), mk('kerelem', 'figyelem'), mk('import', 'figyelem')]
  const a = O.riadokSorrendben(parban).map((r) => r.id).join(',')
  const b = O.riadokSorrendben([...parban].reverse()).map((r) => r.id).join(',')
  if (a === 'kerelem,jegy,import' && a === b) {
    ok('H2 azonos fokozaton belül a sorrend FIX, és nem függ a bemenet sorrendjétől')
  } else {
    fail(`H2: ${a} vs ${b}`)
  }

  // A már LEJÁRT licenc (kritikus) verje a függő kérelmet (figyelem).
  const r3 = O.riadokSorrendben([mk('kerelem', 'figyelem'), mk('licenc', 'kritikus')])
  if (r3[0].id === 'licenc') {
    ok('H3 a fokozat SÁVOT ad: a kritikus licenc a figyelem-szintű kérelem elé kerül')
  } else {
    fail('H3: a fokozat-sáv nem érvényesül')
  }

  const bemenet = [mk('jegy', 'figyelem'), mk('god_mode', 'kritikus')]
  const eredeti = bemenet.map((r) => r.id).join(',')
  O.riadokSorrendben(bemenet)
  if (bemenet.map((r) => r.id).join(',') === eredeti) {
    ok('H4 a riadó-rendezés nem módosítja a bemeneti tömböt')
  } else {
    fail('H4: a riadokSorrendben() felülírta a hívó tömbjét')
  }

  if (O.napTeendoje([]) === null) ok('H5 riadó nélkül nincs „nap teendője" (nem találunk ki tanácsot)')
  else fail('H5: üres listára is adott teendőt')

  if (O.napTeendoje(bemenet).id === 'god_mode') ok('H6 a nap teendője a legsúlyosabb riadó')
  else fail('H6: rossz teendőt választott')
}

// ────────────────────────────────────────────────────────────────────────────
// I) ÚJDONSÁG-SZÁMÍTÁS — időablak és érintetlenség, KIMONDOTT forrással
// ────────────────────────────────────────────────────────────────────────────
{
  const most = Date.parse('2026-08-12T12:00:00Z')
  const oraja = (n) => new Date(most - n * 3600_000).toISOString()

  if (O.ablakban(oraja(5), most, 24) && !O.ablakban(oraja(30), most, 24)) {
    ok('I1 a 24 órás ablak helyesen zár')
  } else {
    fail('I1: a 24 órás ablak rossz')
  }

  if (!O.ablakban(null, most, 24) && !O.ablakban('nem-datum', most, 24)) {
    ok('I2 hiányzó/hibás időpont NEM számít újnak (fail-closed)')
  } else {
    fail('I2: hiányzó időpont újnak számított')
  }

  const jovo = new Date(most + 3600_000).toISOString()
  if (!O.ablakban(jovo, most, 24)) {
    ok('I3 jövőbeli időpont nem számít az elmúlt 24 órába')
  } else {
    fail('I3: jövőbeli időpont beleszámított')
  }

  if (O.ablakban_szamol([oraja(1), oraja(2), oraja(100)], most, 24) === 2) {
    ok('I4 az ablakban_szamol jól számol')
  } else {
    fail('I4: rossz darabszám')
  }

  const j = O.idoJelveny(3, 24)
  if (j && j.szoveg === '3 új az elmúlt 24 órában' && !/nem láttad/.test(j.szoveg)) {
    ok('I5 az időablak-jelvény KIMONDJA a forrást, és NEM állítja, hogy „nem láttad"')
  } else {
    fail(`I5: ${JSON.stringify(j)}`)
  }

  if (O.idoJelveny(0, 24) === null && O.erintetlenJelveny(0, 'x') === null && O.olvasatlanJelveny(0) === null) {
    ok('I6 nullára NINCS jelvény (üres jelvényt nem teszünk ki)')
  } else {
    fail('I6: nullára is jelvényt adott')
  }

  const olv = O.olvasatlanJelveny(2)
  if (olv && /még nem olvastad/.test(olv.szoveg)) {
    ok('I7 a „még nem olvastad" KIZÁRÓLAG az olvasatlan harang-üzenetnél jelenik meg')
  } else {
    fail(`I7: ${JSON.stringify(olv)}`)
  }

  if (O.eltelt_nap(new Date(most - 9 * 86400_000).toISOString(), most) === 9) {
    ok('I8 az eltelt napok számítása helyes')
  } else {
    fail('I8: rossz nap-számítás')
  }

  if (O.eltelt_nap(null, most) === null) ok('I9 hiányzó időpontra null (nem 0)')
  else fail('I9: hiányzó időpontra 0-t adott — a néma nulla tilos')
}

// ────────────────────────────────────────────────────────────────────────────
// J) FEJLÉC-MONDAT — bukott ág mellett SOHA nem nyugtat meg
// ────────────────────────────────────────────────────────────────────────────
{
  if (O.fejlecMondat({ riadokSzama: 0, hibasAgak: 0 }) === 'Ma nincs teendő.') {
    ok('J1 minden rendben esetén rövid, megnyugtató mondat')
  } else {
    fail('J1: rossz mondat')
  }

  const m = O.fejlecMondat({ riadokSzama: 0, hibasAgak: 2 })
  if (/hiányos/.test(m) && !/^Ma nincs teendő\.$/.test(m)) {
    ok('J2 bukott ág mellett NEM állítja, hogy nincs teendő — kimondja, hogy a kép hiányos')
  } else {
    fail(`J2: "${m}" — hamis megnyugtatás`)
  }

  if (O.fejlecMondat({ riadokSzama: 1, hibasAgak: 0 }) === 'Ma 1 dolog vár rád.') {
    ok('J3 egyes számnál is helyes a magyar mondat')
  } else {
    fail('J3: rossz egyes számú mondat')
  }

  // ── J4–J6: A FEJLÉC NEVEZŐJE — a csoporton BELÜLI hiány is számít ─────────
  // A javított hiba: a `hibasAgak` KIZÁRÓLAG a `nemFutottLe` tömböt nézte, a
  // téma-csoportok `hianyzo` tömbjeit NEM. Márpedig a legfontosabb bukások
  // (mentés-lefedettség, tagszám-RPC, országos head-count-ok) PONT oda mennek:
  // az ág maga „ok" volt, csak egy szám nem jött meg belőle. Ezért riadó
  // nélküli napon a lap tetején „Ma nincs teendő." állt — közvetlenül egy piros
  // „NEM nulla, hanem nem tudjuk" doboz fölött.
  const csoport = (id, hianyzo) => ({
    id,
    cim: id,
    megjegyzes: null,
    sorok: [{ id: `${id}-1`, cimke: 'x', ertek: '1', alsor: null, ut: null }],
    hianyzo,
  })

  const csakCsoportHiany = {
    nemFutottLe: [],
    szamCsoportok: [csoport('gyulekezetek', []), csoport('rendszer', ['a mentés lefedettsége'])],
  }
  if (O.hibasAgakSzama(csakCsoportHiany) === 1) {
    ok('J4 a csoporton belüli bevallott hiány BELESZÁMÍT a hibás ágakba')
  } else {
    fail(`J4: ${O.hibasAgakSzama(csakCsoportHiany)} — a hianyzo tömbök megint kimaradtak`)
  }

  const m4 = O.fejlecMondat({
    riadokSzama: 0,
    hibasAgak: O.hibasAgakSzama(csakCsoportHiany),
  })
  if (m4 !== 'Ma nincs teendő.' && /hiányos/.test(m4)) {
    ok('J5 bevallott csoport-hiány mellett a fejléc SOHA nem „Ma nincs teendő."')
  } else {
    fail(`J5: "${m4}" — hamis megnyugtatás egy piros „nem tudjuk" doboz fölött`)
  }

  const mindenRendben = {
    nemFutottLe: [],
    szamCsoportok: [csoport('gyulekezetek', []), csoport('rendszer', [])],
  }
  if (
    O.hibasAgakSzama(mindenRendben) === 0 &&
    O.fejlecMondat({ riadokSzama: 0, hibasAgak: 0 }) === 'Ma nincs teendő.'
  ) {
    ok('J6 hiánytalan méréssel viszont MEGMARAD a rövid, megnyugtató mondat (a csend elve)')
  } else {
    fail('J6: hiánytalan mérésre is „hiányos"-t mondott — a riasztás-infláció is hiba')
  }

  // Mindkét csatorna együtt adódik össze.
  if (
    O.hibasAgakSzama({
      nemFutottLe: [{ mi: 'a', miert: 'b', fajta: 'hiba' }, { mi: 'c', miert: 'd', fajta: 'hiba' }],
      szamCsoportok: [csoport('rendszer', ['x', 'y', 'z'])],
    }) === 5
  ) {
    ok('J7 a két csatorna (nemFutottLe + hianyzo) összeadódik')
  } else {
    fail('J7: rossz összeg')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// K) ÁG-ÁLLAPOT — a hiba nem lehet néma nulla
// ────────────────────────────────────────────────────────────────────────────
{
  const jo = O.agOk([1, 2, 3])
  const rossz = O.agHiba('hiba', 'elhasalt')
  if (jo.ok === true && O.agAdat(jo).length === 3) ok('K1 a sikeres ág adata kiolvasható')
  else fail('K1')
  if (rossz.ok === false && O.agAdat(rossz) === null) {
    ok('K2 a hibás ág adata NULL, nem üres tömb — az üres tömb „minden rendben"-nek látszana')
  } else {
    fail('K2: a hibás ág üres adatot adott')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// L) A VALÓDI docs/CHANGELOG.md — a mérhető állítások ne csússzanak el
// ────────────────────────────────────────────────────────────────────────────
{
  const clPath = path.join(REPO_ROOT, 'docs', 'CHANGELOG.md')
  if (!fs.existsSync(clPath)) {
    fail(`L: hiányzik a ${clPath}`)
  } else {
    const nyers = fs.readFileSync(clPath, 'utf8')
    const bejegyzesek = P.parseChangelogText(nyers)

    // A régi elemző LF-en 342 bejegyzést adott. Az újnak TÖBBET kell adnia:
    // a 111 betűvel toldott fejléc mostantól önálló bejegyzés.
    if (bejegyzesek.length > 342) {
      ok(`L1 az elemző ${bejegyzesek.length} bejegyzést talál (a régi 342-t adott)`)
    } else {
      fail(`L1: csak ${bejegyzesek.length} bejegyzés — a toldalékos fejlécek megint elvesznek`)
    }

    // A 141 kB-os, 58 kiadást elnyelő törzs SOHA többé.
    const hizott = bejegyzesek.filter((e) => S.torzsTulNagy(e))
    if (hizott.length === 0) {
      ok('L2 egyetlen bejegyzés törzse sem lépi túl a méret-őrt (a 141 kB-os blob eltűnt)')
    } else {
      fail(
        `L2: ${hizott.length} bejegyzés törzse túl nagy (${hizott
          .map((e) => `${e.dateLabel}=${S.torzsMeretFelirat(e)}`)
          .join(', ')}) — egy „Kiküldés" ekkora e-mailt küldene ~495 gyülekezetnek`,
      )
    }

    // Minden javítás előtti toldalékos bejegyzés archiválandó, egy sem maradhat ki.
    const toldottRegi = bejegyzesek.filter(
      (e) => e.dateLabel !== e.date && e.date < S.ELEMZO_JAVITAS_DATUMA,
    )
    const kimaradt = toldottRegi.filter((e) => !S.elemzoJavitasHoztaFelszinre(e))
    if (toldottRegi.length > 0 && kimaradt.length === 0) {
      ok(
        `L3 mind a ${toldottRegi.length} javítás előtti toldalékos bejegyzés archiváltnak minősül`,
      )
    } else {
      fail(`L3: ${kimaradt.length} toldalékos bejegyzés kimaradt az archiválásból`)
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// M) A KIKÜLDÉSI STÁTUSZ BEOLVASÁSA — lapozás, NEM `.limit()`
// ────────────────────────────────────────────────────────────────────────────
// FORRÁS-SZINTŰ ŐR. A `.limit(N)` itt azért TILOS, mert a PostgREST `max-rows`
// plafonja (1000) mindig erősebb nála: a szerver csendben levág, az `order
// sent_at desc` miatt a LEGRÉGEBBI kiküldések esnek le, és pont azok a
// bejegyzések billennek vissza „Még nincs kiküldve"-be, amik miatt ez a javítás
// készült. A rá épített „beolvastunk-e N sort?" őr pedig sosem sülhet el.
{
  const p = path.join(WEB, 'app', '(dashboard)', 'admin', 'broadcasts-actions.ts')
  if (!fs.existsSync(p)) {
    fail(`M: hiányzik a ${p}`)
  } else {
    const src = fs.readFileSync(p, 'utf8')
    const blokk = src.slice(src.indexOf('export async function listChangelogEntries'))
    // A KOMMENTEKET ki kell venni: bennük szándékosan szerepel a `.limit()`
    // mint TILTOTT minta. Ha a kommentre is ránéznénk, az őr saját magyarázatán
    // bukna el — ez pont az a fajta hamis riasztás, ami után kikapcsolják.
    const kodOnly = blokk
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
    const lekerdezes = kodOnly.slice(0, kodOnly.indexOf('loadChangelogJelolesek'))

    if (/selectAllPaged\s*</.test(lekerdezes)) {
      ok('M1 a kiküldési státusz a kanonikus selectAllPaged-en jön (üres lap a stop-feltétel)')
    } else {
      fail('M1: a státusz-lekérdezés nem lapoz — a PostgREST 1000 sornál némán levágja')
    }
    if (!/\.limit\(/.test(lekerdezes)) {
      ok('M2 nincs `.limit()` a státusz-lekérdezésen (a szerver-plafon úgyis erősebb nála)')
    } else {
      fail('M2: `.limit()` került vissza a státusz-lekérdezésbe — a csonkolás megint néma lenne')
    }
    if (/sentRes\.truncated/.test(kodOnly)) {
      ok('M3 a csonkolást a helper `truncated` jelzője mondja ki, nem sorszám-összehasonlítás')
    } else {
      fail('M3: nincs `truncated`-alapú csonkolás-jelzés')
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// N) NYERS SZÁM SOHA NEM SZIVÁROGHAT A FELHASZNÁLÓI SZÖVEGBE
// ────────────────────────────────────────────────────────────────────────────
// A javított hiba: „Utolsó igazolt mentés: 10.650685 órája". A `BackupHealth`
// `oraSzam` mezője NYERS lebegőpontos szám (ms / 3 600 000), és a csempe
// formázás nélkül írta ki. Ez a blokk azt védi, hogy az emberi alak ne
// csússzon vissza egy „logikusnak tűnő" egyszerűsítéssel.
{
  const most = Date.UTC(2026, 7, 12, 12, 0, 0) // 2026-08-12 12:00 UTC = 15:00 Bukarest
  const oraval = (h) => new Date(most - h * 3_600_000).toISOString()

  // A KONKRÉT hibás érték, ami a képernyőképen szerepelt.
  const bugos = T.huRelativIdo(oraval(10.650685), most)
  if (bugos === '10 órája') {
    ok('N1 10,650685 óra → „10 órája" (nem „10.650685 órája")')
  } else {
    fail(`N1: "${bugos}" — a nyers lebegőpontos szám visszaszivárgott`)
  }

  // Határok. A 23,9 óra NEM lehet „24 órája": az már nap.
  const hatarok = [
    [0.004, 'az imént'],
    [0.4, '24 perce'],
    [10.650685, '10 órája'],
    [23.9, '23 órája'],
    [25, 'tegnap'],
    [48, '2 napja'],
    [24 * 6, '6 napja'],
    [24 * 9, 'egy hete'],
    [24 * 40, 'egy hónapja'],
  ]
  let hatarHiba = null
  for (const [h, vart] of hatarok) {
    const kapott = T.huRelativIdo(oraval(h), most)
    if (kapott !== vart) hatarHiba = `${h} óra → "${kapott}" (várt: "${vart}")`
  }
  if (!hatarHiba) ok('N2 a relatív idő minden határon emberi alakot ad')
  else fail(`N2: ${hatarHiba}`)

  // ⛔ A LEGFONTOSABB ÁLLÍTÁS: SEHOL nem lehet tizedes tört a kimenetben.
  let tizedes = null
  for (let h = 0; h <= 24 * 40; h += 0.37) {
    const s = T.huRelativIdo(oraval(h), most)
    if (/\d+[.,]\d/.test(s)) {
      tizedes = `${h} óra → "${s}"`
      break
    }
  }
  if (!tizedes) ok('N3 1600 mintavételen SEHOL nem jelenik meg tizedes tört a szövegben')
  else fail(`N3: tizedes tört a felhasználói szövegben — ${tizedes}`)

  // A relatív idő SOHA nem áll magában: a teljes alakban ott a pontos időpont.
  const teljes = T.huIdopontRelativval(oraval(10.650685), most)
  if (/\(10 órája\)$/.test(teljes) && /\d{1,2}:\d{2}/.test(teljes)) {
    ok(`N4 a teljes alak a PONTOS időponttal kezd: "${teljes}"`)
  } else {
    fail(`N4: "${teljes}" — hiányzik a pontos időpont vagy a relatív alak`)
  }

  // Jövőbeli időbélyeg (két gép óraeltérése) — nem írunk ki negatív órát.
  const jovo = T.huRelativIdo(new Date(most + 3_600_000).toISOString(), most)
  if (jovo === 'az imént' && !/-/.test(jovo)) {
    ok('N5 jövőbeli időbélyegre „az imént", nem negatív szám')
  } else {
    fail(`N5: "${jovo}"`)
  }

  // Hiányzó/érvénytelen bemenet: a felület nem kap „Invalid Date"-et.
  if (T.huRelativIdo(null, most) === '' && T.huIdopontRelativval(null, most) === '—') {
    ok('N6 hiányzó időpontra üres/„—", nem „NaN órája"')
  } else {
    fail('N6: hiányzó időpontra hibás kimenet')
  }

  // FORRÁS-SZINTŰ ŐR: a nyers `oraSzam` nem kerülhet vissza a csempe szövegébe.
  const oaPath = path.join(WEB, 'app', '(dashboard)', 'admin', 'overview-actions.ts')
  if (!fs.existsSync(oaPath)) {
    fail(`N7: hiányzik a ${oaPath}`)
  } else {
    const src = fs.readFileSync(oaPath, 'utf8')
    const kodOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    if (!/\$\{[^}]*oraSzam[^}]*\}/.test(kodOnly)) {
      ok('N7 az `oraSzam` NINCS közvetlenül beleinterpolálva felhasználói szövegbe')
    } else {
      fail('N7: a nyers `oraSzam` visszakerült egy sablon-literálba')
    }
  }

  // ── N9: JÖVŐBELI IDŐPONTRA NEM MEGY RELATÍV FORMÁZÓ ─────────────────────
  // A God Mode lejárata a JÖVŐBEN van. A `huRelativIdo` negatív különbségre
  // szándékosan „az imént"-et ad (lásd N5), ezért a csempe önmagával került
  // ellentmondásba: fent „Magától 42 perc múlva jár le.", alatta
  // „Lejárat: ma 15:12 (az imént)". A javítás: naptári alak, relatív nélkül.
  {
    const jovoIso = new Date(most + 42 * 60_000).toISOString()
    const naptari = T.huNaptariIdopontBukarest(jovoIso, most)
    if (/^ma \d{2}:\d{2}$/.test(naptari) && !/imént/.test(naptari)) {
      ok(`N9 jövőbeli lejáratra tiszta naptári alak: "${naptari}"`)
    } else {
      fail(`N9: "${naptari}" — a jövőbeli időpont formázása rossz`)
    }

    // FORRÁS-SZINTŰ ŐR: a God Mode lejárat-alsora ne kapjon vissza relatív
    // formázót egy „legyen egységes" refaktorban.
    const oaPath2 = path.join(WEB, 'app', '(dashboard)', 'admin', 'overview-actions.ts')
    const src2 = fs.readFileSync(oaPath2, 'utf8')
    const kezd = src2.indexOf("id: 'god_mode'")
    const godBlokk = kezd >= 0 ? src2.slice(kezd, src2.indexOf('})', src2.indexOf('alsorok:', kezd))) : ''
    const godKod = godBlokk
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    if (kezd >= 0 && /huNaptariIdopontBukarest/.test(godKod) && !/huIdopontRelativval/.test(godKod)) {
      ok('N10 a God Mode lejárata NAPTÁRI formázót hív, relatívat nem')
    } else {
      fail('N10: a God Mode lejáratára visszakerült a múltra tervezett relatív formázó')
    }
  }

  // FORRÁS-SZINTŰ ŐR: nem születhet NEGYEDIK relatív-idő másolat.
  const masolatok = [
    path.join(WEB, 'components', 'notifications', 'ertesites-vizualis.ts'),
    path.join(WEB, 'components', 'admin', 'attekintes', 'idovonal-panel.tsx'),
    path.join(WEB, 'components', 'offline', 'sync-status-panel.tsx'),
  ]
  const sajatLogika = masolatok.filter((p) => {
    if (!fs.existsSync(p)) return false
    const src = fs.readFileSync(p, 'utf8')
    // Saját implementációnak számít, ha kiírja a „perce"/„órája" alakot ANÉLKÜL,
    // hogy a közös modult importálná.
    return /`\$\{[^}]+\} (perce|órája|napja)`/.test(src) && !/idopont-bukarest/.test(src)
  })
  if (sajatLogika.length === 0) {
    ok('N8 mind a három korábbi másolat a KÖZÖS relatív időt hívja (nincs negyedik)')
  } else {
    fail(`N8: saját relatív-idő logika maradt itt: ${sajatLogika.join(', ')}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// O) HIBÁTLAN MENTÉS-SOROZAT — a „nem tudom" soha nem lehet zöld
// ────────────────────────────────────────────────────────────────────────────
{
  const nap = (i, allapot) => {
    const alap = { nap: `2026-08-${String(i).padStart(2, '0')}`, varhato: 10, letezett: true }
    if (allapot === 'jo') return { ...alap, igazolt: 10, hibas: 0 }
    if (allapot === 'hibas') return { ...alap, igazolt: 10, hibas: 2 }
    if (allapot === 'hianyos') return { ...alap, igazolt: 7, hibas: 0 }
    if (allapot === 'ismeretlen') return { ...alap, varhato: 0, igazolt: 0, hibas: 0 }
    return { ...alap, letezett: false, igazolt: 0, hibas: 0 }
  }

  if (O.hibatlanSorozat([]) === null && O.hibatlanSorozat([nap(1, 'jo')]) === null) {
    ok('O1 üres vagy egyelemű pulzusra null — nem állítunk sorozatot')
  } else {
    fail('O1: kiértékelhetetlen pulzusra is adott sorozatot')
  }

  // A MAI (utolsó) nap kimarad: a hajnali cron miatt reggel még nyitva van.
  // 5 jó nap + egy még üres mai nap → 5, nem 0.
  const maNyitva = [nap(1, 'jo'), nap(2, 'jo'), nap(3, 'jo'), nap(4, 'jo'), nap(5, 'jo'), nap(6, 'hianyos')]
  const r1 = O.hibatlanSorozat(maNyitva)
  if (r1 && r1.napok === 5) {
    ok('O2 a MAI nap kimarad a sorozatból (különben minden reggel 0-ra esne)')
  } else {
    fail(`O2: ${JSON.stringify(r1)} — a mai, még nyitott nap beleszámított`)
  }

  const megszakad = [nap(1, 'jo'), nap(2, 'hibas'), nap(3, 'jo'), nap(4, 'jo'), nap(5, 'jo')]
  const r2 = O.hibatlanSorozat(megszakad)
  if (r2 && r2.napok === 2 && r2.teljesAblak === false) {
    ok('O3 a hibás nap MEGSZAKÍTJA a sorozatot, és a teljesAblak false lesz')
  } else {
    fail(`O3: ${JSON.stringify(r2)}`)
  }

  // ⛔ A „nem tudjuk, mit vártunk" nap NEM sikeres nap.
  // [jo, ISMERETLEN, jo, MA] → a mai kimarad, egy jó nap után az ismeretlen
  // megállítja a számlálást: 1, NEM 3. Ha valaha 3 jönne ki, az azt jelentené,
  // hogy a „nem tudjuk, mit vártunk" nap zöldnek számított.
  const nemTudjuk = [nap(1, 'jo'), nap(2, 'ismeretlen'), nap(3, 'jo'), nap(4, 'jo')]
  const r3 = O.hibatlanSorozat(nemTudjuk)
  if (r3 && r3.napok === 1 && r3.teljesAblak === false) {
    ok('O4 a `varhato: 0` nap ISMERETLEN, nem zöld — a sorozat ott megáll')
  } else {
    fail(`O4: ${JSON.stringify(r3)} — a „nem tudom" sikeresnek számított`)
  }

  // A rendszer születése előtti nap lezárja, de nem hibáztat.
  const szuletesElott = [nap(1, 'nemvolt'), nap(2, 'jo'), nap(3, 'jo'), nap(4, 'jo')]
  const r4 = O.hibatlanSorozat(szuletesElott)
  if (r4 && r4.napok === 2 && r4.teljesAblak === false) {
    ok('O5 a telepítés előtti nap LEZÁRJA a sorozatot, de nem számít hibának')
  } else {
    fail(`O5: ${JSON.stringify(r4)}`)
  }

  const mindJo = [nap(1, 'jo'), nap(2, 'jo'), nap(3, 'jo'), nap(4, 'jo')]
  const r5 = O.hibatlanSorozat(mindJo)
  if (r5 && r5.napok === 3 && r5.teljesAblak === true) {
    ok('O6 hézagmentes ablaknál teljesAblak = true („N+ nap")')
  } else {
    fail(`O6: ${JSON.stringify(r5)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// P) NAP-KÜLÖNBSÉG + CSOPORT-SZŰRÉS
// ────────────────────────────────────────────────────────────────────────────
{
  // Az óraátállítás napjait átívelő szakasz sem csúszhat el egy nappal.
  if (O.napKulonbseg('2026-03-01', '2026-04-01') === 31) {
    ok('P1 az óraátállításon átívelő napszám pontos (Date.UTC-alapú számítás)')
  } else {
    fail(`P1: ${O.napKulonbseg('2026-03-01', '2026-04-01')} — óraátállítás-csúszás`)
  }
  if (O.napKulonbseg('2026-08-11', '2026-08-12') === 1 && O.napKulonbseg('2026-08-12', '2026-08-12') === 0) {
    ok('P2 a szomszédos és az azonos nap különbsége helyes')
  } else {
    fail('P2: rossz nap-különbség')
  }
  if (O.napKulonbseg('2026-8-1', '2026-08-12') === null && O.napKulonbseg('', 'x') === null) {
    ok('P3 rossz alakú dátumra null (nem 0) — a 0 „ma indult"-nak látszana')
  } else {
    fail('P3: rossz alakú dátumra számot adott')
  }

  const csoportok = O.csoportokSorrendben([
    { id: 'a', cim: 'A', megjegyzes: null, sorok: [{ id: 'x', cimke: 'x', ertek: '1', alsor: null, ut: null }], hianyzo: [] },
    { id: 'b', cim: 'B', megjegyzes: null, sorok: [], hianyzo: [] },
    { id: 'c', cim: 'C', megjegyzes: null, sorok: [], hianyzo: ['nem futott le'] },
  ])
  if (csoportok.length === 2 && csoportok[0].id === 'a' && csoportok[1].id === 'c') {
    ok('P4 az üres csoport kiesik, a BEVALLOTT HIÁNNYAL rendelkező MARAD (a csend elve)')
  } else {
    fail(`P4: ${JSON.stringify(csoportok.map((c) => c.id))}`)
  }

  // A sorrend FIX: a szűrés nem rendezhet át.
  const sorrend = O.csoportokSorrendben([
    { id: 'rendszer', cim: 'R', megjegyzes: null, sorok: [{ id: '1', cimke: 'a', ertek: '1', alsor: null, ut: null }], hianyzo: [] },
    { id: 'gyulekezetek', cim: 'GY', megjegyzes: null, sorok: [{ id: '2', cimke: 'b', ertek: '2', alsor: null, ut: null }], hianyzo: [] },
  ])
  if (sorrend[0].id === 'rendszer' && sorrend[1].id === 'gyulekezetek') {
    ok('P5 a csoport-szűrés NEM rendez át — a sorrendet a hívó adja (izommemória)')
  } else {
    fail('P5: a szűrés átrendezte a csoportokat')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Q) VERZIÓ-FELIRAT — a „vweb v0.9.162" SOHA többé, és a FUTÓ kiadás a futó
// ────────────────────────────────────────────────────────────────────────────
// A javított hiba KETTŐS volt:
//   (1) FORMÁZÁS: a `version.replace(/^v/i,'')` elé tett `v` csak akkor helyes,
//       ha a szöveg `v`-vel kezdődik. A `docs/CHANGELOG.md` MINDEN
//       `<!-- version: ... -->` sora `web v0.9.1XX` alakú, tehát a `^v` nem
//       illeszkedett, és a csempén szó szerint `vweb v0.9.162` állt.
//   (2) IGAZSÁG: a csempe címkéje „Futó kiadás" volt, a forrás viszont a
//       CHANGELOG — ami 2026-08-12-én KÉT kiadással elmaradt a valóságtól
//       (changelog v0.9.162 ⇄ `apps/web/package.json` 0.9.164).
{
  const esetek = [
    ['web v0.9.162', 'v0.9.162'],
    ['desktop v0.9.5', 'v0.9.5'],
    ['v0.9.164', 'v0.9.164'],
    ['0.9.164', 'v0.9.164'],
    ['  WEB   V1.0.0  ', 'v1.0.0'],
  ]
  let baj = null
  for (const [be, vart] of esetek) {
    const kapott = O.verzioFelirat(be)
    if (kapott !== vart) baj = `"${be}" → "${kapott}" (várt: "${vart}")`
  }
  if (!baj) ok('Q1 a verzió-felirat minden bemeneti alakból tiszta „vX.Y.Z"-t ad')
  else fail(`Q1: ${baj}`)

  // ⛔ A LEGFONTOSABB ÁLLÍTÁS: a kimenet SOHA nem tartalmazhat `vweb`/`vdesktop`
  //    mintát — ez volt a képernyőn látható konkrét hiba.
  const gyanus = esetek
    .map(([be]) => O.verzioFelirat(be))
    .filter((s) => /v(web|desktop)/i.test(String(s)))
  if (gyanus.length === 0) {
    ok('Q2 SEHOL nem keletkezik „vweb"/„vdesktop" alak')
  } else {
    fail(`Q2: ${gyanus.join(', ')} — a nyers előtag visszaszivárgott`)
  }

  if (O.verzioFelirat(null) === null && O.verzioFelirat('') === null && O.verzioFelirat('v') === null) {
    ok('Q3 üres/hiányzó verzióra null — csupasz „v"-t nem írunk ki')
  } else {
    fail('Q3: üres verzióra is feliratot adott')
  }

  // A FUTÓ kiadás forrása az `apps/web/package.json`, NEM a changelog.
  const pkgPath = path.join(WEB, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const verzioPath = path.join(WEB, 'lib', 'app-verzio.ts')
  if (fs.existsSync(verzioPath) && /from '\.\.\/package\.json'/.test(fs.readFileSync(verzioPath, 'utf8'))) {
    ok(`Q4 a futó kiadás a package.json-ból jön (most: ${pkg.version})`)
  } else {
    fail('Q4: a futó kiadás forrása nem az apps/web/package.json')
  }

  const oaSrc = fs.readFileSync(path.join(WEB, 'app', '(dashboard)', 'admin', 'overview-actions.ts'), 'utf8')
  const oaKod = oaSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')
  if (/cimke: 'Futó kiadás'/.test(oaKod) && /FUTO_WEB_VERZIO/.test(oaKod)) {
    ok('Q5 a „Futó kiadás" csempe a FUTO_WEB_VERZIO-t írja ki')
  } else {
    fail('Q5: a „Futó kiadás" csempe megint nem a futó verzióból dolgozik')
  }
  // A changelogból származó szám MARADHAT — de akkor a címkéje nem állíthatja,
  // hogy az a futó kiadás.
  const jegyzetIdx = oaKod.indexOf("id: 'kiadasi_jegyzet'")
  const jegyzetBlokk = jegyzetIdx >= 0 ? oaKod.slice(jegyzetIdx, jegyzetIdx + 400) : ''
  if (jegyzetIdx >= 0 && /cimke: 'Utolsó kiadási jegyzet'/.test(jegyzetBlokk)) {
    ok('Q6 a changelogból származó szám címkéje „Utolsó kiadási jegyzet", nem „Futó kiadás"')
  } else {
    fail('Q6: a changelog-verzió megint „Futó kiadás" néven szerepel')
  }
  if (!/\$\{?verzios[?.]*\.?version/.test(oaKod) && !/`v\$\{[^}]*version/.test(oaKod)) {
    ok('Q7 nincs kézi „v" + nyers verziószám összefűzés (mindenütt a verzioFelirat fut)')
  } else {
    fail('Q7: kézi verzió-összefűzés került vissza a kódba')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// R) SZERVEZETI FA — „NEM TUDJUK" ≠ 0 (2026-08-22, 7. pont)
// ────────────────────────────────────────────────────────────────────────────
//
// MIT VÉD: a fa taglétszáma KÉT külön forrásból jön (K4, 2026-08-16):
//   · rendszergazda → `admin_overview_member_counts()`   (SECURITY INVOKER)
//   · kerületi admin → `district_member_counts(uuid)`    (SECURITY DEFINER)
//
// Ha a kerületi ág a kézenfekvő `admin_overview_member_counts()`-ot hívná, az
// S1c migráció után NULLA SORT adna — és a fa MINDEN gyülekezetnél „0 tag"-ot
// mutatna, hibaüzenet nélkül. Ez pontosan az a hibaosztály, ami az /admin
// Áttekintés egyházmegye-bontásán már egyszer elsült (`tagszamElerheto`).
//
// ⚠️ MINDEN ÁLLÍTÁS MELLETT OTT A NEGATÍV KONTROLL: eljátsszuk a RÉGI, hibás
//    viselkedést (`?? 0`), és bizonyítjuk, hogy elbukna ezen az őrszemen.
//    Negatív asszert nélkül az őrszem VAK — a régi kód átcsúszna rajta.
{
  // ── R1: az ismeretlen tagszám SOHA nem szám ────────────────────────────
  const ismeretlen = SZ.tagszamFelirat(null)
  if (ismeretlen === SZ.TAGSZAM_ISMERETLEN && !/^\d/.test(ismeretlen)) {
    ok(`R1 ismeretlen tagszám felirata „${ismeretlen}" — nem szám`)
  } else {
    fail(`R1: tagszamFelirat(null) = ${JSON.stringify(ismeretlen)} — a néma nulla visszatért`)
  }

  // NEGATÍV KONTROLL: a RÉGI viselkedés (`String(x ?? 0)`) ugyanerre „0"-t adna.
  const regiViselkedes = String(null ?? 0)
  if (regiViselkedes === '0' && regiViselkedes !== ismeretlen) {
    ok('R2 a régi `?? 0` viselkedés „0"-t adna — az őrszem TÉNYLEG megkülönbözteti')
  } else {
    fail('R2: a negatív kontroll nem különbözik — az R1 assert vak lenne')
  }

  // ── R3: a VALÓDI nulla viszont kiírandó (üres nyilvántartás) ────────────
  if (SZ.tagszamFelirat(0) === '0') {
    ok('R3 a valódi nulla (üres nyilvántartás) továbbra is „0"')
  } else {
    fail(`R3: tagszamFelirat(0) = ${JSON.stringify(SZ.tagszamFelirat(0))}`)
  }

  // ── R4: EGYETLEN ismeretlen az EGÉSZ összeget ismeretlenné teszi ────────
  const osszeg = SZ.osszegTagszam([5, null, 3])
  const regiOsszeg = [5, null, 3].reduce((s, x) => s + (x ?? 0), 0)
  if (osszeg === null) {
    ok('R4 egy ismeretlen tag az egész összeget „nem tudjuk"-ra viszi')
  } else {
    fail(`R4: osszegTagszam([5, null, 3]) = ${osszeg} — részleges összeg magabiztosan hazudik`)
  }
  if (regiOsszeg === 8 && regiOsszeg !== osszeg) {
    ok('R5 a régi reduce(`?? 0`) 8-at adna — az őrszem ezt is elkapja')
  } else {
    fail('R5: a negatív kontroll nem különbözik az R4 eredményétől')
  }
  if (SZ.osszegTagszam([]) === 0 && SZ.osszegTagszam([5, 3]) === 8) {
    ok('R6 üres bemenetre 0, ismert értékekre valódi összeg')
  } else {
    fail('R6: az összegzés ismert értékeken is hibás')
  }

  // ── R7: az összegzés a fa MINDEN szintjén továbbviszi az ismeretlent ────
  const gy = (nev, tagszam) => ({
    id: nev,
    nev,
    dioceseId: 'm1',
    tagszam,
    felhasznalok: 1,
    szerepek: [],
    aktiv: true,
    utolsoAktivitas: null,
    hianyzoMezok: null,
  })
  const megye = { id: 'm1', nev: 'M', esperesNev: null, districtId: 'k1', gyulekezetek: [gy('A', 4), gy('B', null)] }
  const kerulet = { id: 'k1', nev: 'K', nevRo: null, cimerUrl: null, puspokNev: null, egyhazmegyek: [megye] }
  if (
    SZ.megyeOsszeg(megye).tagszam === null &&
    SZ.keruletOsszeg(kerulet).tagszam === null &&
    SZ.faOsszeg([kerulet]).tagszam === null
  ) {
    ok('R7 megye / kerület / teljes fa: mindhárom szint „nem tudjuk"-ot ad, ha egy tag ismeretlen')
  } else {
    fail('R7: valamelyik szint összeadta az ismeretlent nullaként')
  }
  // A darabszámok viszont IGENIS számok — a hiány csak a tagszámra terjed ki.
  if (SZ.faOsszeg([kerulet]).gyulekezetek === 2 && SZ.faOsszeg([kerulet]).egyhazmegyek === 1) {
    ok('R8 a gyülekezet- és egyházmegye-darabszám attól még pontos marad')
  } else {
    fail('R8: a darabszámok is elvesztek')
  }

  // ── R9: rendezésnél az ismeretlen a VÉGÉRE kerül, NEM a nulla helyére ───
  // ⚠️ A `?? 0` itt is elsülne: az ismeretlen beolvadna a 0 tagú gyülekezetek
  //    közé, és a felület megint azt sugallná, hogy megnéztük.
  const rendezve = SZ.gyulekezetekRendezve([gy('Aismeretlen', null), gy('Bures', 0), gy('Cnagy', 7)], 'tagszam')
  const sorrend = rendezve.map((g) => g.nev)
  const regiRendezes = [gy('Aismeretlen', null), gy('Bures', 0), gy('Cnagy', 7)]
    .slice()
    .sort((a, b) => (b.tagszam ?? 0) - (a.tagszam ?? 0) || a.nev.localeCompare(b.nev, 'hu'))
    .map((g) => g.nev)
  if (sorrend.join('>') === 'Cnagy>Bures>Aismeretlen') {
    ok('R9 tagszám szerinti rendezésnél az ismeretlen a lista VÉGÉN áll')
  } else {
    fail(`R9: ${sorrend.join(' > ')} — az ismeretlen beolvadt a nullák közé`)
  }
  if (regiRendezes.join('>') === 'Cnagy>Aismeretlen>Bures' && regiRendezes.join('>') !== sorrend.join('>')) {
    ok('R10 a régi `?? 0`-s rendezés MÁS sorrendet adna — a negatív kontroll fog')
  } else {
    fail(`R10: a negatív kontroll (${regiRendezes.join(' > ')}) nem különbözik`)
  }

  // ── R11: kötelező mezők — a csupa szóköz is HIÁNY ───────────────────────
  const teljes = {
    nev_hu: 'Barátosi Református Egyházközség',
    nev_ro: 'Parohia Reformată Brateș',
    adoszam: '12345678',
    cim: 'Fő út 1.',
    email: 'a@b.hu',
    telefon: '0700000000',
    iban: 'RO49AAAA1B31007593840000',
    bank: 'BT',
    diocese_id: 'm1',
  }
  if (SZ.hianyzoKotelezoMezok(teljes).length === 0) {
    ok('R11 hiánytalan törzsadatnál üres a hiánylista')
  } else {
    fail(`R11: ${JSON.stringify(SZ.hianyzoKotelezoMezok(teljes))}`)
  }
  const hianyos = SZ.hianyzoKotelezoMezok({ ...teljes, iban: '   ', bank: '', diocese_id: null })
  if (hianyos.length === 3 && hianyos.includes('IBAN') && hianyos.includes('Egyházmegye')) {
    ok('R12 a csupa szóköz, az üres string és a null EGYARÁNT hiány')
  } else {
    fail(`R12: ${JSON.stringify(hianyos)} — a „kitöltött" szóköz átcsúszott`)
  }

  // ── R13: keresés — a megye-találat NEM üríti ki a megyét ────────────────
  const fa = [
    {
      id: 'k1',
      nev: 'Erdélyi Református Egyházkerület',
      nevRo: 'Eparhia Reformată din Ardeal',
      cimerUrl: null,
      puspokNev: null,
      egyhazmegyek: [
        { id: 'm1', nev: 'Sepsi Egyházmegye', esperesNev: null, districtId: 'k1', gyulekezetek: [gy('Barátos', 12)] },
        { id: 'm2', nev: 'Kalotaszegi Egyházmegye', esperesNev: null, districtId: 'k1', gyulekezetek: [gy('Bánffyhunyad', 8)] },
      ],
    },
  ]
  const sepsi = SZ.faSzures(fa, 'sepsi')
  if (sepsi.length === 1 && sepsi[0].egyhazmegyek.length === 1 && sepsi[0].egyhazmegyek[0].gyulekezetek.length === 1) {
    ok('R13 az egyházmegye nevére keresve a megye a GYÜLEKEZETEIVEL együtt marad meg')
  } else {
    fail(`R13: ${JSON.stringify(sepsi.map((k) => k.egyhazmegyek.map((m) => m.gyulekezetek.length)))}`)
  }
  const nincs = SZ.faSzures(fa, 'zzz-nincs-ilyen')
  if (nincs.length === 0) {
    ok('R14 nem illeszkedő keresésre ÜRES a fa (nem esik vissza a teljes listára)')
  } else {
    fail('R14: a keresés nem szűrt — a nem illeszkedő ág is bent maradt')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// S) SZERVEZETI FA — A SZERVER-AKCIÓ HÁROM KÖTELEZŐ ÁGA (szöveges + mutáns)
// ────────────────────────────────────────────────────────────────────────────
{
  const akcioPath = SZERVEZET_FORRASOK.akcio
  const csomopontPath = SZERVEZET_FORRASOK.csomopont
  if (!fs.existsSync(akcioPath) || !fs.existsSync(csomopontPath)) {
    fail(`S0: hiányzik a szervezeti fa forrása (${akcioPath} / ${csomopontPath})`)
  } else {
    const akcio = tisztitKod(fs.readFileSync(akcioPath, 'utf8'))
    const csomopont = tisztitKod(fs.readFileSync(csomopontPath, 'utf8'))

    // Az őrszemek — mindegyik EGY függvény, hogy a mutáns is átfuttatható legyen.
    const orok = [
      {
        id: 'S1',
        cim: 'a tagszám hibás forrásnál `null`, nem 0',
        // `tagszam: tagszamRes.terkep ? (...) : null,`
        orszem: (src) => /tagszam:[^\n]*:\s*null/.test(src),
        mutans: (src) =>
          src.replace(/tagszam:[^\n]*:\s*null,/, 'tagszam: tagszamRes.terkep?.get(id) ?? 0,'),
      },
      {
        id: 'S2',
        cim: 'FAIL-CLOSED kapu: hatókör nélkül ÜRES fa, nem országos lista',
        orszem: (src) => /districtIds\.length === 0/.test(src) && /hatokorUres:\s*true/.test(src),
        mutans: (src) => src.replace(/hatokorUres:\s*true/, 'hatokorUres: false'),
      },
      {
        id: 'S3',
        cim: 'a kerületi ág a SECURITY DEFINER `district_member_counts`-ot hívja',
        orszem: (src) =>
          /'admin_overview_member_counts'/.test(src) && /'district_member_counts'/.test(src),
        // A KÉZENFEKVŐ HIBA: a kerületi ág is az INVOKER RPC-t hívja → az S1c
        // után 0 sor → néma „0 tag" minden gyülekezetnél.
        mutans: (src) =>
          src.replace(/'district_member_counts'/g, "'admin_overview_member_counts'"),
      },
      {
        id: 'S4',
        cim: 'K4: a kötelező-mező oszlopokat csak a rendszergazda kéri le',
        orszem: (src) =>
          /const GY_ALAP = '(?![^']*adoszam)[^']*'/.test(src) &&
          /const GY_ADMIN = [^\n]*adoszam/.test(src) &&
          /hianyzoMezokElerheto:\s*rendszergazda/.test(src),
        mutans: (src) => src.replace(/const GY_ALAP = '/, "const GY_ALAP = 'adoszam, "),
      },
      {
        id: 'S5',
        cim: '`.in()` URL-korlát: az azonosító-listás szűrők darabolva mennek',
        orszem: (src) => /const IN_DARAB = (?:[1-9]\d?|100)\b/.test(src) && /darabolvaLekerd/.test(src),
        mutans: (src) => src.replace(/const IN_DARAB = \d+/, 'const IN_DARAB = 5000'),
      },
      {
        id: 'S9',
        cim: 'PostgREST 1000 soros plafon: a nagy listák lapozva jönnek',
        // A `profiles` és a `profile_roles` bőven ezer sor fölött van; plafonon
        // a szerver NÉMÁN vág — a fa alján ebből „0 felhasználó" lenne.
        orszem: (src) =>
          /selectAllPaged/.test(src) &&
          /from\('profiles'\)/.test(src) &&
          /lapozvaLekerd|darabolvaLekerd/.test(src),
        mutans: (src) => src.replace(/selectAllPaged/g, 'nemLapozunk'),
      },
      {
        id: 'S8',
        cim: 'a hatókör-feloldás HIBÁJA hangos, nem üres fa',
        // A rövid burkolók (`getScopedDioceseIds`) a lekérdezés-hibát is üres
        // tömbbé nyelik → tökéletesen üres, magabiztos képernyő. Az admin-scope.ts
        // ezért adta a `…Result` változatokat: ÚJ hívóhely azokat használja.
        orszem: (src) =>
          /getScopedDioceseIdsResult/.test(src) &&
          /getScopedCongregationIdsResult/.test(src) &&
          /!\w+\.feloldhato/.test(src),
        mutans: (src) => src.replace(/if \(!\w+\.feloldhato\)/g, 'if (false)'),
      },
    ]

    for (const o of orok) {
      if (!o.orszem(akcio)) {
        fail(`${o.id}: ${o.cim} — az őrszem NEM találja a mintát a szervezet-actions.ts-ben`)
        continue
      }
      // ⚠️ MUTÁNS-PRÓBA: eljátsszuk a régi/hibás változatot, és megköveteljük,
      //    hogy az őrszem elbukjon rajta. Enélkül egy „mindig igaz" regex
      //    zöldet mutatna a hibás kódra is.
      if (o.orszem(o.mutans(akcio))) {
        fail(`${o.id}: a MUTÁNS is átment — az őrszem vak, nem véd semmit`)
      } else {
        ok(`${o.id} ${o.cim} (a mutáns elbukik rajta)`)
      }
    }

    // ── S6–S7: a FELÜLET sem eshet vissza nullára ─────────────────────────
    // A regressziót leginkább ITT írná vissza egy refaktor: „miért ez a fura
    // komponens, írjuk ki simán a számot".

    // S6: van külön, KIMONDOTT ismeretlen-ág, ami a tagszamFelirat(null)-t írja.
    const s6 = (src) => /ertek === null/.test(src) && /tagszamFelirat\(null\)/.test(src)
    if (!s6(csomopont)) {
      fail('S6: a fa-csomopont.tsx-ből eltűnt az ismeretlen-ág (tagszamFelirat(null))')
    } else if (s6(csomopont.replace(/ertek === null/, 'false'))) {
      fail('S6: a MUTÁNS (ismeretlen-ág kivágva) is átment — az őrszem vak')
    } else {
      ok('S6 a felületnek külön, kimondott „nem tudjuk" ága van (a mutáns elbukik)')
    }

    // S7: SEHOL nincs numerikus nulla-visszaesés (`?? 0` / `|| 0`) a fában.
    const s7 = (src) => !/(\?\?|\|\|)\s*0\b/.test(src)
    if (!s7(csomopont)) {
      fail('S7: a fa-csomopont.tsx-ben megjelent egy `?? 0` / `|| 0` nulla-visszaesés')
    } else if (s7(`${csomopont}\nconst x = gyulekezet.tagszam ?? 0\n`)) {
      fail('S7: a MUTÁNS is átment — a nulla-visszaesés őrszeme vak')
    } else {
      ok('S7 a fa felületén nincs numerikus nulla-visszaesés (a mutáns elbukik)')
    }
  }
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nAdmin áttekintés + changelog önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nAdmin áttekintés + changelog önellenőrzés: minden zöld')
