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
if (!O || !P || !S) {
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
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

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nAdmin áttekintés + changelog önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nAdmin áttekintés + changelog önellenőrzés: minden zöld')
