#!/usr/bin/env node
/**
 * HASONLÓ (esetleg duplikált) TÉTEL FIGYELMEZTETÉS önellenőrzés (2026-08-27)
 *
 * MIT ŐRIZ — Endre 8. kérése:
 *   „ha valaki pont abban az összegben, pont azon a cégnévvel (kb. egyezés is
 *   elég) és kb. ugyanazon a napon (±3 nap) akarja bevezetni, akkor jelezze a
 *   rendszer, hogy egy hasonló tételt már rögzítettünk a banki résznél."
 *
 * Két dolgot őriz, mert két külön módon tud elromlani:
 *
 *   (1) VISELKEDÉS — a párosítás magja (`hasonloTetelekKeresese`) tényleg
 *       ±3 napra, pontos összegre és KÖZELÍTŐ névre szűr-e.
 *   (2) A LEKÉRDEZÉS SZŰRŐI — a web és a desktop UGYANAZOKAT a szűrőket
 *       használja-e. A legfontosabb a `belso_mozgas_xkey IS NULL`: a kassza↔bank
 *       átvezetés két lába DEFINÍCIÓ SZERINT azonos dátumú és összegű, tehát
 *       enélkül MINDEN készpénzletétel álriasztást adna a saját, kötelező
 *       párjára — a funkció napokon belül zajjá válna, és a lelkész elszokna
 *       attól, hogy elolvassa.
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak):
 *   minden szöveges őrhöz visszajátsszuk a hibás világot, és bizonyítjuk, hogy
 *   az őr elbuktatná. A viselkedési ághoz küszöb-mutánst is futtatunk.
 *
 * Futtatás:  node scripts/selftest-hasonlo-tetel.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const MAG = path.join(REPO, 'packages', 'core', 'src', 'finance', 'hasonlo-tetel', 'match.ts')
const JW = path.join(REPO, 'packages', 'core', 'src', 'finance', 'hasonlo-tetel', 'jaro-winkler.ts')
const WEB = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'hasonlo-tetel-actions.ts')
const DESKTOP = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'finance-entry-lookups.ts')
const ROGZITO = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'CombinedEntryBody.tsx')

// A repó egy része CRLF sorvégekkel van, más része LF-fel. A mutáns-regexek
// sorvégre is illeszkednek, ezért MINDEN forrást normalizálva olvasunk.
// Enélkül a negatív asszert némán vak lenne: a mutáns nem alkalmazódna, és a
// teszt „az őr vak"-ot jelentene egy teljesen ép őrre.
const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')

let failed = false
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true }
const ok = (m) => console.log(`OK:   ${m}`)

for (const f of [MAG, JW, WEB, DESKTOP, ROGZITO]) {
  if (!fs.existsSync(f)) { fail(`hiányzik: ${f}`); process.exit(1) }
}

const require_ = createRequire(path.join(REPO, 'package.json'))
let ts = null
try { ts = require_('typescript') } catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

// ── A MAG BETÖLTÉSE (a mutánsokhoz újratölthetően) ───────────────────────
const magRaw = olvas(MAG)
const jwRaw = olvas(JW)

let tmpSzamlalo = 0
function betolt(magForras) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `kartoteka-hasonlo-${tmpSzamlalo++}-`))
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"commonjs"}', 'utf8')
  for (const [nev, forras] of [['jaro-winkler', jwRaw], ['match', magForras]]) {
    const out = ts.transpileModule(forras, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: `${nev}.ts`,
    })
    fs.writeFileSync(path.join(tmp, `${nev}.js`), out.outputText, 'utf8')
  }
  return require_(path.join(tmp, 'match.js'))
}

// A magnak a `./jaro-winkler`-en KÍVÜL nem lehet importja: mindkét felületen
// (Next.js serveraction ÉS Tauri kliens) futnia kell.
const magOut = ts.transpileModule(magRaw, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: 'match.ts',
}).outputText
const idegenImport = [...magOut.matchAll(/require\(["']([^"']+)["']\)/g)]
  .map((m) => m[1])
  .filter((m) => m !== './jaro-winkler')
if (idegenImport.length) fail(`a mag idegen importot kapott: ${idegenImport.join(', ')}`)
else ok('a párosítás magja import-mentes (csak a saját jaro-winkler-e)')

const mod = betolt(magRaw)
const { hasonloTetelekKeresese, hasonloDatumAblak, HASONLO_NAP_ABLAK } = mod

if (HASONLO_NAP_ABLAK !== 3) fail(`Endre ±3 napot kért, a mag ${HASONLO_NAP_ABLAK}-t használ`)
else ok('a dátum-ablak ±3 nap — Endre kérése szerint')

// ── (1) VISELKEDÉS ───────────────────────────────────────────────────────
// A „már könyvelt" banki tétel, amire riasztani kell.
const MEGLEVO = [{ datum: '2026-03-10', osszeg: 1500, nev: 'ELECTRICA FURNIZARE SA', iratszam: 'OP-42' }]

const eset = (nev, kerdes, varhatoTalalat) => {
  const t = hasonloTetelekKeresese([{ rowId: 'r1', type: 'income', ...kerdes }], MEGLEVO, [])
  const talalt = t.length > 0
  if (talalt === varhatoTalalat) ok(`viselkedés — ${nev}: ${talalt ? 'riaszt' : 'nem riaszt'} (helyes)`)
  else fail(`viselkedés — ${nev}: várt ${varhatoTalalat ? 'riasztás' : 'csend'}, kapott ${talalt ? 'riasztás' : 'csend'}`)
}

eset('azonos nap, azonos összeg, azonos név', { datum: '2026-03-10', osszeg: 1500, nev: 'ELECTRICA FURNIZARE SA' }, true)
eset('+3 nap (a határon) — még riaszt', { datum: '2026-03-13', osszeg: 1500, nev: 'ELECTRICA FURNIZARE SA' }, true)
eset('−3 nap (a másik határon) — még riaszt', { datum: '2026-03-07', osszeg: 1500, nev: 'ELECTRICA FURNIZARE SA' }, true)
eset('+4 nap — MÁR NEM riaszt', { datum: '2026-03-14', osszeg: 1500, nev: 'ELECTRICA FURNIZARE SA' }, false)
eset('„kb. egyező" cégnév (ékezet+sorrend+rövidítés)', { datum: '2026-03-11', osszeg: 1500, nev: 'Electrica Furnizare S.A.' }, true)
eset('teljesen más név — nem riaszt', { datum: '2026-03-10', osszeg: 1500, nev: 'Kovács János' }, false)
eset('más összeg — nem riaszt', { datum: '2026-03-10', osszeg: 1500.5, nev: 'ELECTRICA FURNIZARE SA' }, false)
eset('üres név — az összeg+dátum önmagában is jelzés', { datum: '2026-03-10', osszeg: 1500, nev: '' }, true)

// A kiadás-oldal NEM keveredhet a bevétel-oldallal: a rögzítő mindkettőt egyszerre küldi.
{
  const t = hasonloTetelekKeresese(
    [{ rowId: 'k1', type: 'expense', datum: '2026-03-10', osszeg: 1500, nev: 'ELECTRICA FURNIZARE SA' }],
    MEGLEVO, // csak BEVÉTEL-oldali meglévő
    [],
  )
  if (t.length === 0) ok('viselkedés — a kiadás-sor nem a bevétel-halmazból kap találatot')
  else fail('viselkedés — egy kiadás-sor a BEVÉTEL-halmazból kapott találatot (oldal-keveredés)')
}

// A dátum-ablak tényleg lefedi a szélső sorokat is.
{
  const a = hasonloDatumAblak([
    { rowId: 'a', type: 'income', datum: '2026-03-10', osszeg: 1, nev: '' },
    { rowId: 'b', type: 'income', datum: '2026-03-20', osszeg: 1, nev: '' },
  ])
  // A felső határ KIZÁRÓ (`igExkl`), mert a `kiadas.datum` timestamp: a
  // `<= '2026-03-23'` éjfélt jelentene, és a +3. nap délelőtti kiadása kiesne.
  if (a && a.tol === '2026-03-07' && a.ig === '2026-03-23' && a.igExkl === '2026-03-24')
    ok(`dátum-ablak: ${a.tol} … < ${a.igExkl}`)
  else fail(`dátum-ablak hibás: ${JSON.stringify(a)}`)
}

// ── NEGATÍV ASSZERT (viselkedés): küszöb-mutánsok ────────────────────────
{
  // M1: ±3 nap helyett 0 nap → a „+3 nap" esetnek el KELL buknia.
  const m = betolt(magRaw.replace('HASONLO_NAP_ABLAK = 3', 'HASONLO_NAP_ABLAK = 0'))
  const t = m.hasonloTetelekKeresese([{ rowId: 'r', type: 'income', datum: '2026-03-13', osszeg: 1500, nev: 'ELECTRICA FURNIZARE SA' }], MEGLEVO, [])
  if (t.length === 0) ok('NEGATÍV — 0 napos ablakkal a ±3 napos eset tényleg elveszne (a teszt lát)')
  else fail('NEGATÍV — a 0 napos mutáns is riasztott: a dátum-ablak nincs valóban ellenőrizve')
}
{
  // M2: a névküszöb 0.999-re húzva → a „kb. egyező" cégnévnek el KELL buknia.
  const m = betolt(magRaw.replace('HASONLO_NEV_KUSZOB = 0.82', 'HASONLO_NEV_KUSZOB = 0.999'))
  const t = m.hasonloTetelekKeresese([{ rowId: 'r', type: 'income', datum: '2026-03-10', osszeg: 1500, nev: 'Electrica Furnizare S.A.' }], MEGLEVO, [])
  if (t.length === 0) ok('NEGATÍV — 0.999-es küszöbbel a „kb. egyezés" tényleg elveszne (a teszt lát)')
  else fail('NEGATÍV — a 0.999-es mutáns is riasztott: a névhasonlóság nincs valóban ellenőrizve')
}

// ── (2) A LEKÉRDEZÉS SZŰRŐI — web ÉS desktop ─────────────────────────────
// Ezek NEM stílus-kérdések: mindegyik egy-egy konkrét, korábban megégett hiba.
const SZUROK = [
  {
    minta: /\.not\(\s*['"]bankszamla_id['"]\s*,\s*['"]is['"]\s*,\s*null\s*\)/,
    nev: '„banki eredetű" = bankszamla_id IS NOT NULL (SOHA nem az irattipus szövege)',
    mutans: (s) => s.replace(/\.not\(\s*['"]bankszamla_id['"]\s*,\s*['"]is['"]\s*,\s*null\s*\)/g, ".ilike('irattipus', '%banki%')"),
  },
  {
    minta: /\.is\(\s*['"]belso_mozgas_xkey['"]\s*,\s*null\s*\)/,
    nev: 'belso_mozgas_xkey IS NULL (enélkül minden készpénzletétel álriaszt a saját párjára)',
    mutans: (s) => s.replace(/\s*\.is\(\s*['"]belso_mozgas_xkey['"]\s*,\s*null\s*\)/g, ''),
  },
  {
    minta: /\.eq\(\s*['"]stornozott['"]\s*,\s*false\s*\)/,
    nev: 'a sztornózott tétel nem riaszthat',
    mutans: (s) => s.replace(/\s*\.eq\(\s*['"]stornozott['"]\s*,\s*false\s*\)/g, ''),
  },
  {
    minta: /\.eq\(\s*['"]deleted['"]\s*,\s*false\s*\)/,
    nev: 'a törölt tétel nem riaszthat',
    mutans: (s) => s.replace(/\s*\.eq\(\s*['"]deleted['"]\s*,\s*false\s*\)/g, ''),
  },
  {
    minta: /\.lt\(\s*['"]datum['"]\s*,\s*ablak\.igExkl\s*\)/,
    nev: 'KIZÁRÓ felső dátum-határ (a kiadas.datum timestamp — a `<=` éjfelet jelentene)',
    mutans: (s) => s.replace(/\.lt\(\s*['"]datum['"]\s*,\s*ablak\.igExkl\s*\)/g, ".lte('datum', ablak.ig)"),
  },
  {
    minta: /osszeg_ron\s*\?\?\s*r\.osszeg/,
    nev: 'devizás számlán az osszeg_ron a mérvadó (az `osszeg` a DEVIZA-összeg)',
    mutans: (s) => s.replace(/osszeg_ron\s*\?\?\s*r\.osszeg/g, 'r.osszeg'),
  },
]

// A kommenteket kiszedjük: az őr a KÓDOT nézze, ne a magyarázó szöveget.
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const [cimke, ut] of [['web', WEB], ['desktop', DESKTOP]]) {
  const nyers = olvas(ut)
  // A desktop fájl sok mást is tartalmaz — csak a mi függvényünket nézzük.
  const resz = cimke === 'desktop'
    ? (nyers.split('export async function similarBankEntriesOnline')[1] ?? '')
    : nyers
  if (cimke === 'desktop' && !resz) { fail('desktop — a similarBankEntriesOnline függvény nem található'); continue }
  const kod = kodCsak(resz)
  for (const sz of SZUROK) {
    if (!sz.minta.test(kod)) { fail(`${cimke} — hiányzik a szűrő: ${sz.nev}`); continue }
    // NEGATÍV ASSZERT: a hibás világ visszajátszása.
    if (sz.minta.test(kodCsak(sz.mutans(resz)))) {
      fail(`${cimke} — az őr VAK: a mutáns (${sz.nev}) is átment`)
    } else {
      ok(`${cimke} — ${sz.nev}`)
    }
  }
}

// A két felület UGYANAZT a magot hívja — külön párosítási logika nélkül.
for (const [cimke, ut] of [['web', WEB], ['desktop', DESKTOP]]) {
  const s = olvas(ut)
  if (/hasonloTetelekKeresese/.test(s) && /@kartoteka\/core/.test(s)) ok(`${cimke} — a döntés a közös magból jön (@kartoteka/core)`)
  else fail(`${cimke} — nem a közös magot hívja: két felület, két „kb. ugyanaz" fogalom`)
}

// ── (3) A RÖGZÍTŐ KAPUJA ─────────────────────────────────────────────────
{
  const nyers = olvas(ROGZITO)
  const kod = kodCsak(nyers)

  // (a) FAIL-OPEN: ha az ellenőrzés elhasal, a mentés NEM állhat meg.
  //     Ez figyelmeztetés, nem védelem — a lelkész munkája fontosabb.
  // A kapu-régió a `setBusy(true)`-ig tart. FONTOS, hogy itt álljon meg: a
  // handleSave alatt van másik try/catch is, és egy túlnyúló régió azt találná
  // meg — vagyis az őr akkor is „fail-open"-t jelentene, ha a kapunkból hiányzik.
  const kapuRegex = /if \(onCheckSimilarEntries && !hasonloMegerositve\)[\s\S]*?setBusy\(true\)/
  const kapu = kod.match(kapuRegex)
  if (!kapu) fail('rögzítő — a hasonló-tétel kapu nem található')
  else if (!/try\s*\{[\s\S]{0,400}?\}\s*catch\s*\{/.test(kapu[0])) {
    fail('rögzítő — a kapu NEM fail-open: egy elhasaló ellenőrzés megakadályozná a rögzítést')
  } else ok('rögzítő — a kapu fail-open (elhasaló ellenőrzés nem blokkol)')

  // (b) A megerősítés EGYSZERI: sikeres mentés után visszaáll.
  //     Enélkül egy „Mégis rögzítem" a munkamenet végéig némítaná a jelzést.
  if (/setHasonloMegerositve\(false\)/.test(kod)) ok('rögzítő — a megerősítés egyszeri (mentés után visszaáll)')
  else fail('rögzítő — a megerősítés NEM áll vissza: egy kattintás a munkamenet végéig némítaná a jelzést')

  // NEGATÍV ASSZERT mindkettőre — a hibás világ visszajátszása.
  // A mutáns CÉLZOTT: a kapu saját try-ját veszi ki, nem a fájl első try-ját
  // (a handleSave-ben több is van — egy vak csere semmit nem bizonyítana).
  const m1 = kodCsak(nyers.replace(/try \{(\s*const talalatok = await onCheckSimilarEntries)/, '{$1'))
  const kapu1 = m1.match(kapuRegex)
  if (kapu1 && /try\s*\{[\s\S]{0,400}?\}\s*catch\s*\{/.test(kapu1[0])) {
    fail('rögzítő — az őr VAK: a try/catch nélküli mutáns is átment')
  } else ok('NEGATÍV — a try/catch nélküli kapu tényleg elbukna')

  const m2 = kodCsak(nyers.replace(/setHasonloMegerositve\(false\)/g, ''))
  if (/setHasonloMegerositve\(false\)/.test(m2)) {
    fail('rögzítő — az őr VAK: a visszaállítás nélküli mutáns is átment')
  } else ok('NEGATÍV — a visszaállítás nélküli rögzítő tényleg elbukna')
}

if (failed) { console.error('\nA hasonló-tétel önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nA hasonló-tétel önellenőrzés rendben.')
