// selftest-naptar-nyomtatvany.mjs — az ÉVES PROGRAMTERV és a KÖSZÖNTŐ (születésnapos/
// névnapos) NAPTÁR nyomtatványának őrszemei (2026-09-05, Endre 2. pontja)
//
// ⛔ MI VOLT A HIBA (Endre élesben: „a mentett programok nem jelennek meg a
//    nyomtatható éves naptárban")
//   A 2026-06-08-i egylapos nyomtatványon a program CSAK egy 3 px-es színes
//   pötty volt, a neve kizárólag a `title=` tooltipbe került; a névsoros lista
//   pedig csak a `fontos`/`kiemelt` prioritású sorokat írta ki — az
//   alapértelmezett `normal` program NÉV NÉLKÜL maradt a papíron.
//
// ŐRSZEMEK (az építők TISZTA függvényein, transpile-mintával)
//   E1   a NORMÁL prioritású program NÉVVEL szerepel a havi sorban
//   E1n  negatív: a RÉGI „csak kiemelt/fontos" szűrő az építőbe visszaírva → a név
//        eltűnik → az őrszem BUKIK (nem a `git show HEAD:` — az kioltaná magát)
//   E2   gyülekezeti példány: a MAGÁN típus (szabadság, keresztelő) CÍME sincs a lapon;
//        a lelkészin igen; a személyes rétegek csak lelkészin
//   E2n  negatív: a magán-szűrő kivéve → a gyülekezeti példányon ott a cím → BUKIK
//   E3   többnapos program MINDEN napján, n/N. nap sorszámmal
//   E4   sheetCount == `.page` blokkok == data-sheet-count (12 / 300 / 1200 program)
//   E5   ünnepnapi program neve ÉS a ✝ is; nincs „ma" kiemelés; hosszú cím tördelhető
//   E6   XSS-próba escape-elve (a nyomtató-motor same-origin fut)
//   E7   oldalszám SZÖVEGKÉNT a láblécben; nincs counter(page); ≥5 px pötty, piros vasárnap
//   E8   jelmagyarázat CSAK az előforduló típusokra
//   K1   köszöntő: a kiskorú kora ALAPBÓL hiányzik, a felnőtté ott; kapcsolókkal változik
//   K1n  negatív: a kor-szabály mutánsa → a kiskorú kora megjelenik → BUKIK
//   K2   ékezet-helyes rendezés (Ábel, Anna, Zita — nem Anna, Zita, Ábel)
//   K3   hónap-tartomány; lapszám-egyezés; a hónap-fejléc SOHA nem árva a lap alján
//   K4   lábléc „Belső használatra — személyes adat"; csak-névnap mód oszlopai
//   F1–F5 forrás-őrök a komponenseken: közös motor + hangos PDF-tartalék, nincs CDN/
//        contenteditable, gomb-kapu a betöltésig, modál-méret + zoom-lépcső, naplózás
//   F2n  negatív: a PDF-tartalék kivéve → az őrszem BUKIK
//   F6   az ÉVES TERV lelkészi példánya IS naplóz (bíráló P2: ugyanaz a réteg két
//        csatornán, csak a köszöntő naplózott); kapu: lelkészi ÉS bekapcsolt réteg;
//        EGY naplózó (naplozNaptarNyomtatas) mindkét csatornára
//   F6n  negatív: a naplózó-hívás kivéve az éves terv modáljából → BUKIK
//   F7   a betekintés-kimutatás MINDKÉT audit-kulcsot emberi mondatra fordítja
//        (viselkedés: auditMondat); a naplózó térképének minden kulcsa a szótárban
//   F7n  negatív: ismeretlen kulcsra „ismeretlen műveletet" — a szótár nem talál ki

import fs from 'node:fs'
import os from 'node:os'
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

const SRC = {
  eves: path.join(ROOT, 'packages/ui-app/src/dashboard/eves-naptar-print.ts'),
  koszonto: path.join(ROOT, 'packages/ui-app/src/members/koszonto-naptar.ts'),
  annual: path.join(ROOT, 'apps/web/components/dashboard/annual-plan-print.tsx'),
  szul: path.join(ROOT, 'apps/web/components/dashboard/szuletesnapos-naptar-print.tsx'),
  modal: path.join(ROOT, 'apps/web/components/dashboard/naptar-nyomtatvany-modal.tsx'),
  retegek: path.join(ROOT, 'apps/web/app/(dashboard)/naptar/retegek-actions.ts'),
  naplo: path.join(ROOT, 'apps/web/lib/export/betekintes-naplo.ts'),
}
const read = (f) => fs.readFileSync(f, 'utf8')

const t = (src) =>
  ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-naptar-nyomtatvany-'))
process.on('exit', () => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true })
  } catch {
    /* takarítás */
  }
})
let szamlalo = 0
function ir(nev, tartalom) {
  const f = path.join(tmp, `${nev}-${(szamlalo += 1)}.cjs`)
  fs.writeFileSync(f, tartalom)
  return f
}

/** Az építők betöltése ADOTT forrásszöveggel (mutánsokhoz is). */
function betolt({ evesSrc, koszontoSrc } = {}) {
  const evesCjs = ir('eves', t(evesSrc ?? read(SRC.eves)))
  const koszCjs = ir(
    'koszonto',
    t(koszontoSrc ?? read(SRC.koszonto)).replace(
      /require\(["']\.\.\/dashboard\/eves-naptar-print["']\)/g,
      `require(${JSON.stringify(evesCjs)})`,
    ),
  )
  return { eves: require_(evesCjs), koszonto: require_(koszCjs) }
}

const { eves, koszonto } = betolt()

// ---------------------------------------------------------------------------
// Próba-adatok
// ---------------------------------------------------------------------------

const TIPUS_META = {
  istentisztelet: { cimke: 'Istentisztelet', szin: '#3b82f6', emoji: '⛪' },
  gyerekprogram: { cimke: 'Gyerekprogram', szin: '#14b8a6', emoji: '🧒' },
  hangverseny: { cimke: 'Hangverseny', szin: '#6366f1', emoji: '🎵' },
  bibliaora: { cimke: 'Bibliaóra', szin: '#f59e0b', emoji: '📖' },
  szabadsag: { cimke: 'Szabadság', szin: '#84cc16', emoji: '🌴' },
  kereszteles: { cimke: 'Keresztelő', szin: '#0ea5e9', emoji: '💧' },
}
const MAGAN = ['szabadsag', 'kereszteles', 'eskuvo', 'konfirmacio', 'temetes']

let progId = 0
function prog(over = {}) {
  progId += 1
  return {
    id: `p-${progId}`,
    cim: 'Alkalom',
    datum: '2026-03-01',
    datum_vege: null,
    ido_kezdes: '10:00:00',
    ido_befejezes: null,
    helyszin: 'Templom',
    tipus: 'gyerekprogram',
    prioritas: 'normal',
    ismetlodes_tipus: null,
    egyedi_tipus_nev: null,
    egyedi_emoji: null,
    megjegyzes: null,
    ...over,
  }
}

// Az Endre képernyőjén rögzített állapot: VBH, normál prioritás, 5 nap.
const VBH = prog({ id: 'vbh', cim: 'Vakációs Bibliahét', datum: '2026-09-01', datum_vege: '2026-09-05', tipus: 'gyerekprogram', prioritas: 'normal' })
const SZABADSAG = prog({ id: 'szab', cim: 'Szabadság — Balaton', datum: '2026-07-06', datum_vege: '2026-07-10', ido_kezdes: null, tipus: 'szabadsag', megjegyzes: 'helyettes: Nagy Lelkész' })
const KERESZTELO = prog({ id: 'ker', cim: 'Keresztelő — Kovács Anna', datum: '2026-05-03', tipus: 'kereszteles' })
const KARACSONY = prog({ id: 'kar', cim: 'Karácsonyi hangverseny', datum: '2026-12-25', tipus: 'hangverseny', ido_kezdes: '18:00:00' })
const HOSSZU_CIM = 'Egyetemes imahét — vendégszolgálat az evangélikus testvérgyülekezettel, esti alkalom szeretetvendégséggel és a gyermekek szolgálatával'
const HOSSZU = prog({ id: 'hosszu', cim: HOSSZU_CIM, datum: '2026-01-20', tipus: 'bibliaora' })
const XSS = prog({ id: 'xss', cim: '<img src=x onerror=alert(1)>Gonosz alkalom', datum: '2026-02-02', tipus: 'bibliaora' })

const RETEGEK = {
  anyakonyv: [{ kulcs: 'keresztseg:7', datum: '2026-04-12', cim: 'Keresztelő — Nagy Bence', tabla: 'keresztseg', programId: null }],
  szuletesnapok: [{ kulcs: 'szul:1:2026', datum: '2026-06-14', nev: 'Kis Pál', kor: 70 }],
  nevnapok: [{ kulcs: 'nevnap:2:6-13:2026', datum: '2026-06-13', nev: 'Szabó Antal', nevnapNev: 'Antal' }],
}

function bemenet(over = {}) {
  return {
    ev: 2026,
    gyulekezetNev: 'Barátosi Református Egyházközség',
    logoUrl: null,
    vezerige: { text: 'Az Úr az én világosságom és üdvösségem: kitől féljek?', ref: 'Zsoltárok 27,1' },
    elofordulasok: [VBH, SZABADSAG, KERESZTELO, KARACSONY, HOSSZU, XSS],
    unnepek: [{ date: '2026-01-01', name: 'Újév' }, { date: '2026-12-25', name: 'Karácsony' }],
    retegek: RETEGEK,
    tipusMeta: TIPUS_META,
    maganTipusok: MAGAN,
    valtozat: 'lelkeszi',
    kapcsolok: { anyakonyv: true, szuletesnapok: true, nevnapok: true },
    keszult: '2026. szeptember 5.',
    ...over,
  }
}

const lapokSzama = (html) => (html.match(/<div class="page"/g) || []).length
const sheetCountAttr = (html) => {
  const m = html.match(/data-sheet-count="(\d+)"/)
  return m ? Number(m[1]) : null
}
/** Egy adott nap sorai (a havi lapokon) — a tr `data-nap` attribútuma alapján. */
function napSorok(html, datum) {
  const re = new RegExp(`<tr[^>]*data-nap="${datum}"[^>]*>[\\s\\S]*?<\\/tr>`, 'g')
  return html.match(re) || []
}

// ---------------------------------------------------------------------------
// E1 — a NORMÁL prioritású program NÉVVEL a havi sorban
// ---------------------------------------------------------------------------
{
  const r = eves.buildEvesNaptar(bemenet())
  const sorok = napSorok(r.html, '2026-09-01')
  assert(sorok.some((s) => s.includes('Vakációs Bibliahét')), 'E1: a normál prioritású „Vakációs Bibliahét" NÉVVEL szerepel a szeptember 1-i sorban')
  assert(sorok.some((s) => s.includes('10:00') && s.includes('Templom')), 'E1b: időpont és helyszín is a sorban')
  assert(r.orientation === 'landscape' && r.filename.endsWith('_lelkeszi.pdf'), 'E1c: fekvő tájolás, a fájlnév a változatot hordozza')
}

// E1n (negatív) — a RÉGI szűrő visszaírva az építőbe: a lelkészi példány
// csak a fontos/kiemelt, nem-istentisztelet sorokat kapja → a VBH eltűnik.
{
  const eredeti = read(SRC.eves)
  const mutans = eredeti.replace(
    ': input.elofordulasok.slice()',
    ": input.elofordulasok.filter((p) => (p.prioritas === 'kiemelt' || p.prioritas === 'fontos') && p.tipus !== 'istentisztelet')",
  )
  if (mutans === eredeti) {
    assert(false, 'E1n: a régi-szűrő mutáns NEM különbözik az eredetitől — a negatív asszert vak')
  } else {
    const { eves: regi } = betolt({ evesSrc: mutans })
    const r = regi.buildEvesNaptar(bemenet())
    assert(!r.html.includes('Vakációs Bibliahét'), 'E1n: a RÉGI „csak kiemelt/fontos" szűrővel a VBH neve ELTŰNIK — az őrszem tud pirosra váltani')
  }
}

// ---------------------------------------------------------------------------
// E2 — két változat: a magán típus címe és a személyes rétegek
// ---------------------------------------------------------------------------
{
  const lelkeszi = eves.buildEvesNaptar(bemenet({ valtozat: 'lelkeszi' })).html
  const gyul = eves.buildEvesNaptar(bemenet({ valtozat: 'gyulekezeti' })).html
  assert(lelkeszi.includes('Balaton') && lelkeszi.includes('Kovács Anna'), 'E2: a lelkészi példányon a szabadság és a keresztelő címe ott van')
  assert(lelkeszi.includes('helyettes: Nagy Lelkész'), 'E2b: a szabadság belső jegyzete (helyettes) a lelkészi példányon')
  assert(!gyul.includes('Balaton') && !gyul.includes('Kovács Anna') && !gyul.includes('Nagy Lelkész'), 'E2c: a gyülekezeti példányról a magán típusok CÍMESTŐL hiányoznak')
  assert(lelkeszi.includes('Nagy Bence') && lelkeszi.includes('Kis Pál') && lelkeszi.includes('Szabó Antal'), 'E2d: anyakönyvi tény, születésnap, névnap a lelkészi példányon (kapcsolók be)')
  assert(!gyul.includes('Nagy Bence') && !gyul.includes('Kis Pál') && !gyul.includes('Szabó Antal'), 'E2e: a gyülekezeti példányon NINCS személyes réteg (kapcsolóktól függetlenül)')
  const kapcsoloKi = eves.buildEvesNaptar(bemenet({ kapcsolok: { anyakonyv: true, szuletesnapok: false, nevnapok: false } })).html
  assert(kapcsoloKi.includes('Nagy Bence') && !kapcsoloKi.includes('Kis Pál') && !kapcsoloKi.includes('Szabó Antal'), 'E2f: a kapcsolók rétegenként hatnak a lelkészi példányon')
  assert(gyul.includes('Vakációs Bibliahét') && gyul.includes('Karácsonyi hangverseny'), 'E2g: a gyülekezeti példányon a nyilvános programok névvel maradnak')
  assert(gyul.includes('Gyülekezeti terjesztésre') && lelkeszi.includes('Lelkészi példány'), 'E2h: a változat felirata a fejlécben')
}

// E2n (negatív) — a magán-szűrő kivéve: a gyülekezeti példány is hozza a címet.
{
  const eredeti = read(SRC.eves)
  const mutans = eredeti.replace('? input.elofordulasok.filter((p) => !magan.has(p.tipus))', '? input.elofordulasok.slice()')
  if (mutans === eredeti) {
    assert(false, 'E2n: a magán-szűrő mutáns NEM különbözik az eredetitől — a negatív asszert vak')
  } else {
    const { eves: regi } = betolt({ evesSrc: mutans })
    const gyul = regi.buildEvesNaptar(bemenet({ valtozat: 'gyulekezeti' })).html
    assert(gyul.includes('Balaton'), 'E2n: a szűrő nélkül a gyülekezeti példányra kikerül a szabadság — az őrszem tud pirosra váltani')
  }
}

// ---------------------------------------------------------------------------
// E3 — többnapos program minden napján
// ---------------------------------------------------------------------------
{
  const r = eves.buildEvesNaptar(bemenet())
  const napok = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']
  const mind = napok.every((d) => napSorok(r.html, d).some((s) => s.includes('Vakációs Bibliahét')))
  assert(mind, 'E3: az ötnapos VBH mind az 5 napján saját sort kap')
  assert(napSorok(r.html, '2026-09-01').some((s) => s.includes('(1/5. nap)')) && napSorok(r.html, '2026-09-05').some((s) => s.includes('(5/5. nap)')), 'E3b: n/N. nap sorszám az első és az utolsó napon')
  assert(napSorok(r.html, '2026-09-06').every((s) => !s.includes('Vakációs Bibliahét')), 'E3c: a záró nap után már nincs sor')
  // Előző évben kezdődő, az évbe átnyúló program: januárban ott van, a napszám folytatódik.
  const atnyulo = prog({ id: 'tabor', cim: 'Szilveszteri ifjúsági tábor', datum: '2025-12-30', datum_vege: '2026-01-02', tipus: 'gyerekprogram' })
  const r2 = eves.buildEvesNaptar(bemenet({ elofordulasok: [atnyulo] }))
  assert(napSorok(r2.html, '2026-01-01').some((s) => s.includes('Szilveszteri ifjúsági tábor') && s.includes('(3/4. nap)')), 'E3d: az előző évben kezdődő tábor jan. 1-jén (3/4. nap) szerepel')
  assert(!r2.html.includes('data-nap="2025-'), 'E3e: a nézett éven kívüli nap nem kerül a lapokra')
}

// ---------------------------------------------------------------------------
// E4 — lapszám-egyezés 3 méretnél
// ---------------------------------------------------------------------------
function sokProgram(n) {
  const out = []
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + (i % 365))).toISOString().slice(0, 10)
    out.push(prog({ id: `sok-${i}`, cim: `Gyülekezeti alkalom ${i + 1} — hosszabb megnevezéssel`, datum: d, tipus: i % 3 === 0 ? 'bibliaora' : 'gyerekprogram', ido_kezdes: `${String(8 + (i % 12)).padStart(2, '0')}:00:00` }))
  }
  return out
}
for (const n of [12, 300, 1200]) {
  const r = eves.buildEvesNaptar(bemenet({ elofordulasok: sokProgram(n), retegek: null }))
  const lapok = lapokSzama(r.html)
  assert(r.sheetCount === lapok && sheetCountAttr(r.html) === lapok, `E4: ${n} program → sheetCount (${r.sheetCount}) == .page blokkok (${lapok}) == data-sheet-count (${sheetCountAttr(r.html)})`)
  assert(lapok >= 13, `E4b: ${n} program → legalább 13 lap (áttekintő + 12 havi lap): ${lapok}`)
  const megvan = Array.from({ length: n }, (_, i) => `Gyülekezeti alkalom ${i + 1} —`).every((c) => r.html.includes(c))
  assert(megvan, `E4c: ${n} program MINDEGYIKE névvel a lapokon (semmi nem veszett el a tördelésben)`)
}
{
  const r = eves.buildEvesNaptar(bemenet({ elofordulasok: sokProgram(1200), retegek: null }))
  assert(r.html.includes('(folytatás)'), 'E4d: 1200 programnál a túlcsorduló hónap folytatás-lapot kap')
}

// ---------------------------------------------------------------------------
// E5 — ünnep ÉS program együtt; nincs „ma"; hosszú cím
// ---------------------------------------------------------------------------
{
  const r = eves.buildEvesNaptar(bemenet())
  const kar = napSorok(r.html, '2026-12-25')
  assert(kar.some((s) => s.includes('✝') && s.includes('Karácsony')) && kar.some((s) => s.includes('Karácsonyi hangverseny')), 'E5: december 25-én az ünnep ✝ sora ÉS a hangverseny neve is ott van (a régi else-ág elnyelte)')
  assert(!/ep-today|class="[^"]*\bma\b/.test(r.html), 'E5b: a „ma" kiemelés a papírra NEM kerül')
  assert(r.html.includes(eves.esc(HOSSZU_CIM)), 'E5c: a 130+ karakteres cím teljes egészében a lapon')
  assert(/overflow-wrap:\s*anywhere/.test(r.html), 'E5d: a hosszú cím tördelhető (overflow-wrap: anywhere)')
  const mini = r.html.match(/<div class="mc[^"]*u[^"]*" data-nap="2026-12-25">[\s\S]*?<\/div><\/div>/)
  assert(!!mini && mini[0].includes('✝') && mini[0].includes('class="pt"'), 'E5e: a mini-naptár cellájában az ünnep ✝ ÉS a típus-pötty együtt')
  assert(r.html.includes('Az Úr az én világosságom') && r.html.includes('Zsoltárok 27,1'), 'E5f: a vezérige és igehely az áttekintő lapon')
}

// ---------------------------------------------------------------------------
// E6 — escape-elés
// ---------------------------------------------------------------------------
{
  const r = eves.buildEvesNaptar(bemenet())
  assert(!r.html.includes('<img') && r.html.includes('&lt;img src=x onerror=alert(1)&gt;Gonosz alkalom'), 'E6: az XSS-próba a címben escape-elve kerül a lapra')
  const gonoszRetegek = { anyakonyv: [{ kulcs: 'k:1', datum: '2026-04-01', cim: '<script>x</script>Keresztelő', tabla: 'keresztseg', programId: null }], szuletesnapok: [], nevnapok: [] }
  const r2 = eves.buildEvesNaptar(bemenet({ retegek: gonoszRetegek }))
  assert(!r2.html.includes('<script>x') && r2.html.includes('&lt;script&gt;x'), 'E6b: a réteg-cím is escape-elve')
}

// ---------------------------------------------------------------------------
// E7 — oldalszám szövegként, pötty-méret, vasárnap
// ---------------------------------------------------------------------------
{
  const r = eves.buildEvesNaptar(bemenet())
  assert(r.html.includes(`1/${r.sheetCount}`) && r.html.includes(`${r.sheetCount}/${r.sheetCount}`), 'E7: az oldalszám SZÖVEGKÉNT a láblécben (első és utolsó lap)')
  assert(!/counter\(page/.test(r.html), 'E7b: nincs CSS counter(page) a tartalomban (nem oldódik fel)')
  const pt = r.html.match(/\.pt\s*\{[^}]*width:\s*(\d+(?:\.\d+)?)px/)
  assert(!!pt && Number(pt[1]) >= 5, `E7c: a típus-pötty legalább 5 px (${pt ? pt[1] : '?'} px) — a régi 3 px a papíron eltűnt`)
  assert(/\.mc\.v \.n\s*\{[^}]*color:\s*#c0584a/.test(r.html), 'E7d: a vasárnap piros a mini-naptárban')
  assert(/\.mc\.sz\s*\{[^}]*repeating-linear-gradient/.test(r.html) && /\.r-szab \.tar\s*\{[^}]*repeating-linear-gradient/.test(r.html), 'E7e: a szabadság sraffozott (mini-naptár + havi sor)')
  assert(/print-color-adjust:\s*exact/.test(r.html) && /@page\s*\{\s*size:\s*A4 landscape/.test(r.html), 'E7f: print-color-adjust exact + @page A4 fekvő')
  assert(/\.page:last-child\s*\{[^}]*break-after:\s*auto/.test(r.html), 'E7g: az utolsó lap után nincs törés (fantom üres oldal ellen)')
  // Üres napok tömörítve, a vasárnap saját sor.
  assert(/nincs alkalom/.test(r.html) && /r-vas r-vas-ures/.test(r.html), 'E7h: az üres napok tartományba tömörülnek, a vasárnap saját sort kap')
}

// ---------------------------------------------------------------------------
// E8 — jelmagyarázat csak az előforduló típusokra
// ---------------------------------------------------------------------------
{
  const r = eves.buildEvesNaptar(bemenet({ elofordulasok: [VBH, KARACSONY], retegek: null }))
  const jelm = r.html.match(/<section class="jelm">[\s\S]*?<\/section>/)?.[0] ?? ''
  assert(jelm.includes('Gyerekprogram') && jelm.includes('Hangverseny') && !jelm.includes('Istentisztelet') && !jelm.includes('Bibliaóra'), 'E8: a jelmagyarázat csak a lapon előforduló típusokat fejti meg')
  assert(!jelm.includes('Szabadság') && !jelm.includes('Anyakönyvi alkalom'), 'E8b: szabadság/anyakönyv jel csak akkor, ha van ilyen')
  // Az előző évi (horizont miatt listában lévő) sorozat-alkalom NEM szennyezi a jelmagyarázatot.
  const tavalyi = prog({ id: 'tavaly', cim: 'Tavalyi imaóra', datum: '2025-03-03', tipus: 'istentisztelet' })
  const r2 = eves.buildEvesNaptar(bemenet({ elofordulasok: [VBH, tavalyi], retegek: null }))
  const jelm2 = r2.html.match(/<section class="jelm">[\s\S]*?<\/section>/)?.[0] ?? ''
  assert(!jelm2.includes('Istentisztelet'), 'E8c: a nézett éven kívüli előfordulás típusa nem kerül a jelmagyarázatba')
}

// ---------------------------------------------------------------------------
// K1 — köszöntő naptár: életkor-szabályok
// ---------------------------------------------------------------------------
const SZUL = [
  { kulcs: 's-anna', datum: '2026-03-10', nev: 'Anna Kata', kor: 45 },
  { kulcs: 's-abel', datum: '2026-03-10', nev: 'Ábel Imre', kor: 12 },
  { kulcs: 's-zita', datum: '2026-03-10', nev: 'Zita Réka', kor: 30 },
  { kulcs: 's-pal', datum: '2026-06-14', nev: 'Kis Pál', kor: 70 },
]
const NEVN = [
  { kulcs: 'n-antal', datum: '2026-06-13', nev: 'Szabó Antal', nevnapNev: 'Antal', elsodleges: true },
  { kulcs: 'n-anna', datum: '2026-07-26', nev: 'Anna Kata', nevnapNev: 'Anna', elsodleges: true },
]
function kbemenet(over = {}) {
  return {
    ev: 2026, honapTol: 1, honapIg: 12,
    gyulekezetNev: 'Barátosi Református Egyházközség',
    szuletesnapok: SZUL, nevnapok: NEVN,
    opciok: {}, keszult: '2026. szeptember 5.',
    ...over,
  }
}
{
  const alap = koszonto.buildKoszontoNaptar(kbemenet())
  assert(alap.html.includes('Anna Kata<span class="kor"> (45)</span>'), 'K1: a felnőtt kora alapból a lapon (Anna Kata (45))')
  assert(alap.html.includes('Ábel Imre</td>') && !alap.html.includes('Ábel Imre<span class="kor">'), 'K1b: a KISKORÚ kora alapból HIÁNYZIK — csak a név')
  const kiskoru = koszonto.buildKoszontoNaptar(kbemenet({ opciok: { kiskoruKor: true } }))
  assert(kiskoru.html.includes('Ábel Imre<span class="kor"> (12)</span>'), 'K1c: kifejezett kéréssel a kiskorú kora is kiírható')
  const korNelkul = koszonto.buildKoszontoNaptar(kbemenet({ opciok: { eletkor: false, kiskoruKor: true } }))
  assert(!korNelkul.html.includes('class="kor"'), 'K1d: az Életkor kapcsoló kikapcsolva senkinél nincs kor')
  assert(!/\b19\d\d\b|\b20[0-2]\d-\d\d-\d\d\b/.test(alap.html.replace(/2026(?![-\d])/g, '')), 'K1e: születési ÉV / teljes születési dátum sosem kerül a lapra')
  assert(alap.szuletesnapDb === 4 && alap.nevnapDb === 2 && alap.orientation === 'portrait', 'K1f: tételszámok (naplózáshoz) és álló tájolás')
}

// K1n (negatív) — a kor-szabály mutánsa: a kiskorú kora is megjelenik.
{
  const eredeti = read(SRC.koszonto)
  const mutans = eredeti.replace('if (kor < KOSZONTO_NAGYKORU_KOR && !opciok.kiskoruKor) return \'\'', 'if (false) return \'\'')
  if (mutans === eredeti) {
    assert(false, 'K1n: a kor-szabály mutáns NEM különbözik az eredetitől — a negatív asszert vak')
  } else {
    const { koszonto: regi } = betolt({ koszontoSrc: mutans })
    const r = regi.buildKoszontoNaptar(kbemenet())
    assert(r.html.includes('Ábel Imre<span class="kor"> (12)</span>'), 'K1n: a szabály nélkül a kiskorú kora KIMENNE — az őrszem tud pirosra váltani')
  }
}

// ---------------------------------------------------------------------------
// K2 — ékezet-helyes rendezés
// ---------------------------------------------------------------------------
{
  const r = koszonto.buildKoszontoNaptar(kbemenet())
  const iAbel = r.html.indexOf('Ábel Imre')
  const iAnna = r.html.indexOf('Anna Kata')
  const iZita = r.html.indexOf('Zita Réka')
  assert(iAbel > 0 && iAbel < iAnna && iAnna < iZita, 'K2: ugyanazon a napon Ábel, Anna, Zita a sorrend (localeCompare hu — nem Anna, Zita, Ábel)')
  const regiSorrend = ['Anna Kata', 'Ábel Imre', 'Zita Réka'].sort()
  assert(regiSorrend[2] === 'Ábel Imre', 'K2n: a kódpont-rendezés az Ábelt a végére tenné (ez a régi hiba)')
}

// ---------------------------------------------------------------------------
// K3 — hónap-tartomány, lapszám, árva fejléc
// ---------------------------------------------------------------------------
{
  const r = koszonto.buildKoszontoNaptar(kbemenet({ honapTol: 3, honapIg: 5 }))
  assert(r.html.includes('Március<span class="db">') && r.html.includes('Május<span class="db">') && !r.html.includes('Január<span class="db">') && !r.html.includes('Június<span class="db">'), 'K3: a hónap-tartomány (március–május) szűr')
  assert(!r.html.includes('Kis Pál') && r.html.includes('Anna Kata'), 'K3b: a tartományon kívüli tétel nincs a lapon')
  assert(r.html.includes('Ebben a hónapban nincs köszöntendő.'), 'K3c: az üres hónap is jelen van, kimondva')
  const csere = koszonto.buildKoszontoNaptar(kbemenet({ honapTol: 5, honapIg: 3 }))
  assert(csere.html === r.html.replace(/Koszonto_naptar[^"]*/g, '') || csere.filename === r.filename, 'K3d: felcserélt tartomány (5→3) ugyanazt adja, mint 3→5')
}
{
  // Sok tag: több lap, egyezés, és egyetlen lap sem végződik hónap-fejléccel.
  const sok = []
  for (let i = 0; i < 700; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + (i % 365))).toISOString().slice(0, 10)
    sok.push({ kulcs: `s-${i}`, datum: d, nev: `Próba Tag ${i}`, kor: 20 + (i % 60) })
  }
  const r = koszonto.buildKoszontoNaptar(kbemenet({ szuletesnapok: sok, nevnapok: [] }))
  const lapok = lapokSzama(r.html)
  assert(lapok >= 3 && r.sheetCount === lapok && sheetCountAttr(r.html) === lapok, `K3e: 700 tag → ${lapok} lap; sheetCount és data-sheet-count egyezik`)
  const lapBlokkok = r.html.split('<div class="page"').slice(1)
  const arva = lapBlokkok.filter((lap) => {
    const trs = lap.match(/<tr class="[^"]*"/g) || []
    return trs.length > 0 && trs[trs.length - 1].includes('honap-fej')
  })
  assert(arva.length === 0, 'K3f: egyetlen lap sem végződik árva hónap-fejléccel')
  assert(Array.from({ length: 700 }, (_, i) => `Próba Tag ${i}<`).every((n) => r.html.includes(n)), 'K3g: mind a 700 tag a lapokon (semmi nem veszett el)')
  assert(r.html.includes('1/' + lapok) && r.html.includes(`${lapok}/${lapok}`), 'K3h: oldalszám szövegként')
}

// ---------------------------------------------------------------------------
// K4 — lábléc, módok
// ---------------------------------------------------------------------------
{
  const r = koszonto.buildKoszontoNaptar(kbemenet())
  assert(r.html.includes('Belső használatra — személyes adat'), 'K4: a lábléc figyelmeztet: belső használat, személyes adat')
  assert(/@page\s*\{\s*size:\s*A4 portrait/.test(r.html) && /print-color-adjust:\s*exact/.test(r.html), 'K4b: A4 álló + print-color-adjust exact')
  const csakNev = koszonto.buildKoszontoNaptar(kbemenet({ opciok: { mod: 'nevnap' } }))
  assert(csakNev.title.startsWith('Névnapos naptár') && !csakNev.html.includes('🎂 Születésnap</th>') && csakNev.html.includes('💐 Névnap</th>') && !csakNev.html.includes('Kis Pál'), 'K4c: csak-névnap mód: nincs születésnap-oszlop, nincs születésnapos')
  const csakSzul = koszonto.buildKoszontoNaptar(kbemenet({ opciok: { mod: 'szuletesnap' } }))
  assert(csakSzul.title.startsWith('Születésnapos naptár') && !csakSzul.html.includes('Szabó Antal') && csakSzul.html.includes('Kis Pál'), 'K4d: csak-születésnap mód')
  const gonosz = koszonto.buildKoszontoNaptar(kbemenet({ szuletesnapok: [{ kulcs: 'x', datum: '2026-02-02', nev: '<b onmouseover=alert(1)>Gonosz', kor: 40 }] }))
  assert(!gonosz.html.includes('<b onmouseover') && gonosz.html.includes('&lt;b onmouseover'), 'K4e: a név escape-elve')
  assert(koszonto.korFelirat(17, { eletkor: true, kiskoruKor: false }) === '' && koszonto.korFelirat(18, { eletkor: true, kiskoruKor: false }) === ' (18)', 'K4f: a nagykorúság határa 18 (17 → nincs, 18 → van)')
}

// ---------------------------------------------------------------------------
// F — forrás-őrök a komponenseken (kommentek nélkül, hogy a magyarázat ne
//     elégítse ki a keresést)
// ---------------------------------------------------------------------------
{
  const annual = stripComments(read(SRC.annual))
  assert(!/cdnjs|contenteditable|html2pdf/.test(annual), 'F1: az éves terv modálja NEM tölt CDN-t, nincs contenteditable, nincs saját html2pdf')
  assert(annual.includes("from '@kartoteka/ui-app/src/dashboard/eves-naptar-print'") && annual.includes('buildEvesNaptar('), 'F1b: a HTML-t a közös építő adja (mély import)')
  assert(annual.includes('expandProgramOccurrences(nezet.programs, nezet.year)'), 'F1c: az ismétlődés-kibontás a webes egyetlen forrásból, az építő KIBONTOTT listát kap')
  assert(annual.includes('getNaptarRetegek(ny)') && annual.includes('getProgramsForYear(ny)') && annual.includes('Promise.all('), 'F1d: évváltáskor programok + rétegek együtt töltődnek')
  assert(/setNezet\(\{ year: ny, programs, retegek: r \}\)/.test(annual), 'F1e: az év + programok + rétegek EGY állapotcserével (nem régi programokkal épül az új év)')
  assert(annual.includes("useState<EvesNaptarValtozat>('lelkeszi')"), 'F1f: az alap változat a lelkészi példány')
  assert(!/useEffect\(/.test(annual), 'F1g: nincs propokra figyelő effekt (a szülő újratöltése nem ugrasztja vissza az évet)')
  assert(annual.includes('vezerigeIr(') && annual.includes('className="kt-input"'), 'F1h: a vezérige input-mezőben szerkeszthető a modálban')

  const modal = stripComments(read(SRC.modal))
  assert(modal.includes("from '@/lib/utils/print-engine-v2'") && modal.includes('printToPdf(html, filename') && modal.includes('printToBrowser(html)'), 'F2: a modál a KÖZÖS nyomtató-motort hívja (PDF + böngészős nyomtatás)')
  assert(/catch \(e\) \{[\s\S]*?toast\.error\([\s\S]*?await printToBrowser\(html\)/.test(modal), 'F2b: a PDF-hiba HANGOS (toast) és a tartalék a böngészős nyomtatás')
  assert(modal.includes("width: 'min(1500px, 96vw)', height: 'min(94vh, 1100px)'"), 'F2c: a modál mérete inline: min(1500px,96vw) × min(94vh,1100px)')
  assert(modal.includes('[1, 1.5, 2, 3]'), 'F2d: zoom-lépcső [1, 1.5, 2, 3]')
  assert(/Math\.min\(1, \(boxW - 16\) \/ frameW, \(boxH - 16\) \//.test(modal), 'F2e: a fit() MINDKÉT tengelyre skáláz')
  assert(modal.includes("querySelectorAll('.page').length") && modal.includes('childElementCount > 0') && modal.includes('readyHtml === html'), 'F2f: a készenlét TARTALOM-mérés (lapszám + body-gyerek), nem about:blank')
  assert(modal.includes('disabled={gombTilt}') && modal.includes('const gombTilt = !frameReady || pdfFut'), 'F2g: a Nyomtatás/PDF gomb a betöltésig tiltva')
  assert(modal.includes('sandbox="allow-same-origin"'), 'F2h: az előnézeti iframe sandbox-olt (script nem fut)')
  assert(/toast\.error\(|toast\.info\(/.test(modal) && !/console\.error\(/.test(modal), 'F2i: a hibák a felületre mennek (toast), nem a konzolra')

  const modalMutans = modal.replace(/await printToBrowser\(html\)/g, 'void 0')
  assert(modalMutans !== modal && !/catch \(e\) \{[\s\S]*?toast\.error\([\s\S]*?await printToBrowser\(html\)/.test(modalMutans), 'F2n: a tartalék nélküli mutánson az őrszem BUKIK')

  const szul = stripComments(read(SRC.szul))
  assert(szul.includes("from '@kartoteka/ui-app/src/members/koszonto-naptar'") && szul.includes('buildKoszontoNaptar('), 'F3: a köszöntő naptár a közös építőből')
  assert(szul.includes('naplozNaptarNyomtatas({') && szul.includes("tipus: 'koszonto'") && szul.includes('onNyomtatasElott={naploz}'), 'F3b: a köszöntő naptár nyomtatásának ténye naplózódik (Nyomtatás és PDF előtt, koszonto fajta)')
  assert(szul.includes('getNaptarRetegek(ev)') && szul.includes('setHiba(') && szul.includes('betolt={betolt}'), 'F3c: a rétegek betöltése látható (loading + hiba), nem néma')
  assert(szul.includes("orientation=\"portrait\"") && szul.includes('honapTol') && szul.includes('kiskoruKor'), 'F3d: A4 álló, hónap-tartomány és kiskorú-kapcsoló a felületen')
  assert(!/slate-|bg-white|text-white/.test(szul) && !/slate-|bg-white|text-white/.test(modal) && !/slate-|bg-white|text-white/.test(annual), 'F3e: nincs hardkódolt slate/white szín az új kódban (téma-tokenek)')

  const retegek = stripComments(read(SRC.retegek))
  assert(retegek.includes('export async function naplozNaptarNyomtatas(') && retegek.includes("koszonto: 'naptar.szuletesnapos_nyomtatas'") && retegek.includes("eves_terv: 'naptar.eves_terv_nyomtatas'") && retegek.includes('logAuditEvent('), 'F4: EGY naplózó akció logAuditEvent-tel, zárt kulcs-térképpel (koszonto + eves_terv)')
  assert(/metadata: \{ tipus: input\.tipus, ev, szurok \}/.test(retegek), 'F4b: a metadata a fajtát, az évet és a szűrőket hordozza')
  assert(!/^\s*export (?!async function)/m.test(retegek), "F4c: a 'use server' fájl csak async függvényt exportál")
  assert(!retegek.includes('naplozSzuletesnaposNaptarNyomtatas') && !szul.includes('naplozSzuletesnaposNaptarNyomtatas') && !annual.includes('naplozSzuletesnaposNaptarNyomtatas'), 'F4d: nincs második naplózó (a régi csatorna-specifikus akció megszűnt — egy igazságforrás)')
  assert(/hasOwnProperty\.call\(NYOMTATVANY_NAPLO_KULCS, input\.tipus\)/.test(retegek) && /if \(!action\) return/.test(retegek), 'F4e: az audit-kulcs CSAK a zárt térképből jöhet (a kliens szövege nem válhat kulccsá)')

  const evesSrc = stripComments(read(SRC.eves))
  assert(!/new Date\(\)\.get(?!UTCFullYear)/.test(evesSrc) && !/Date\.now\(\)/.test(evesSrc), 'F5: az építő nem néz órát (a „ma" nem kerülhet a papírra)')
  assert(!/^import /m.test(evesSrc), 'F5b: az éves építő függőség-mentes (desktopról is hívható)')

  // F6 — az ÉVES TERV lelkészi példánya IS naplóz (bíráló P2, 2026-09-05):
  //      a lelkészi példány a bekapcsolt rétegekkel a tagok nevét és korát
  //      (`${s.nev} (${s.kor})`) meg az anyakönyvi neveket nyomtatja — ugyanaz
  //      az adat, mint a köszöntő naptáré, csak az utóbbi naplózott.
  assert(annual.includes('naplozNaptarNyomtatas({') && annual.includes("tipus: 'eves_terv'") && annual.includes('onNyomtatasElott={naploz}'), 'F6: az éves terv modálja a Nyomtatás/PDF előtt naplóz (eves_terv fajta, ugyanaz a naplózó)')
  assert(/valtozat !== 'lelkeszi'[^\n]*\breturn\b/.test(annual) && /if \(!\(kapcsolok\.anyakonyv \|\| kapcsolok\.szuletesnapok \|\| kapcsolok\.nevnapok\)\) return/.test(annual), 'F6b: a naplózás kapuja: CSAK lelkészi példány ÉS legalább egy bekapcsolt személyes réteg')
  assert(/!nezet\.retegek\) return/.test(annual), 'F6c: betöltetlen rétegeknél (semmi tagnév a papíron) nincs hamis napló-bejegyzés')
  assert(annual.includes('anyakonyvDb:') && annual.includes('szuletesnapDb:') && annual.includes('nevnapDb:') && annual.includes('lapszam: kesz.sheetCount'), 'F6d: a metadata a rétegek tételszámát és a lapszámot hordozza (a naplóból látszik, MI ment ki)')
  assert(annual.includes('A személyes rétegek nyomtatása naplózódik.'), 'F6e: a felület kimondja, hogy a személyes rétegek nyomtatása naplózódik (átláthatóság)')
  const annualMutans = annual.replace('onNyomtatasElott={naploz}', '')
  assert(annualMutans !== annual && !(annualMutans.includes('naplozNaptarNyomtatas({') && annualMutans.includes('onNyomtatasElott={naploz}')), 'F6n: a naplózó-hívás nélküli (régi) modál-híváson az F6 őrszem BUKIK')

  // F7 — a betekintés-kimutatás mindkét kulcsot emberi mondatra fordítja
  //      (viselkedés, nem forrás-őr: a betekintes-naplo.ts transpile-olva, a
  //      tabla-cimek import helyi csonkkal).
  const naploSrc = t(read(SRC.naplo)).replace(/require\(["']@\/lib\/export\/tabla-cimek["']\)/g, '({ tablaCim: (x) => String(x ?? "") })')
  const naplo = require_(ir('naplo', naploSrc))
  const kulcsok = [...retegek.matchAll(/(?:koszonto|eves_terv): '(naptar\.[a-z_]+)'/g)].map((m) => m[1])
  assert(kulcsok.length === 2 && kulcsok.every((k) => typeof naplo.MUVELET_MONDATOK[k] === 'string' && naplo.MUVELET_MONDATOK[k].length > 0), `F7: a naplózó térképének MINDEN kulcsa (${kulcsok.join(', ')}) szerepel a betekintés-szótárban`)
  for (const kulcs of kulcsok) {
    const mondat = naplo.auditMondat({ id: 'x', mikor: '2026-09-05T10:00:00Z', muvelet: kulcs, forras: 'esemeny', tabla: 'szemely', kiNeve: 'Próba Lelkész' })
    assert(!mondat.includes('ismeretlen műveletet') && mondat.includes('Próba Lelkész') && mondat.includes('nyomtatott'), `F7b: „${kulcs}" → emberi mondat a kimutatásban: ${mondat}`)
  }
  const ismeretlen = naplo.auditMondat({ id: 'y', mikor: '2026-09-05T10:00:00Z', muvelet: 'naptar.nincs_ilyen_kulcs', forras: 'esemeny' })
  assert(ismeretlen.includes('ismeretlen műveletet'), 'F7n: ismeretlen kulcsra a kimutatás nem talál ki jelentést — az őrszem tud pirosra váltani')
}

console.log(`\n${total - failedCount}/${total} őrszem zöld.`)
process.exit(failedCount > 0 ? 1 : 0)
