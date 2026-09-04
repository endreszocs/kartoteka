#!/usr/bin/env node
/**
 * OBLIO / ANAF SPV IMPORT önellenőrzés (2026-09-04 — Endre valódi exportján mérve)
 *
 * Endre egy valódi ANAF SPV-exportot adott (14 számla + 14 aláírás + 5 PDF), és
 * azt kérte: „ellenőrizd, hogy jól működik-e az Oblio SPV feltöltés is!"
 * A kibontás, az aláírás-szűrés és a PDF-párosítás hibátlan volt. Négy hiba
 * viszont CSAK valódi adaton derült ki — a repó eddigi példái nem fedték:
 *
 *   (1) A FÁJLNÉV-KULCS AZ ELSŐ FUTAM VOLT, NEM AZ UTOLSÓ. Az ANAF neve
 *       `<CÉG>_<SOROZAT>_<INDEX>.xml`; ha a SOROZAT is 8+ jegyű (LIDL, Electrica),
 *       az első futam a szállító számlaszáma — 14-ből 6 fájlnál rossz kulcs,
 *       ami ELTÉRT a PDF-párosító (utolsó rész) kulcsától. MINDKÉT parser
 *       (webes feltöltés + böngészős/desktop mappa) így csinálta.
 *
 *   (2) A SZTORNÓ +TARTOZÁSKÉNT RÖGZÜLT. A román kiállító a sztornót
 *       `InvoiceTypeCode 380`-as Invoice-ként adja NEGATÍV tételekkel — a
 *       gyökér-elem hazudik. A típus csak a gyökérből dőlt el, az összeg
 *       `Math.abs`-ot kapott: a −22 010-es sztornó +22 010-es MÁSODIK
 *       tartozás lett. A desktop `credit_note`-kapuja (5 hely) is átengedte.
 *
 *   (3) A BÖNGÉSZŐS PARSER MÉG VISSZAESETT A CSUPASZ FÁJLNÉVRE, és a két
 *       hívó (webes Oblio-fül, desktop-fül) még rá is tett egy `|| f.name`-et.
 *       A webes feltöltési út ezt 2026-09-03-án P0-ként kivette — a két
 *       implementáció széthúzott.
 *
 *   (4) A KULCSVÁLTÁS DUPLIKÁLNA. Az élő sorok a RÉGI kulccsal állnak
 *       (UNIQUE (congregation_id, anaf_uuid)). Ha az import csak az ÚJ kulcsot
 *       nézné, egy újraimport nem találná őket, és második sort szúrna be.
 *       Ezért KETTŐS kulcsú duplikátum-ellenőrzés kell.
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): minden őrhöz
 * visszajátsszuk a hibás világot, és bizonyítjuk, hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-oblio-spv-import.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const WEB_PARSER = path.join(REPO, 'apps', 'web', 'lib', 'oblio', 'ubl-parser.ts')
const UI_PARSER = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'oblio', 'ubl-parser.ts')
const WEB_TAB = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'oblio', 'OblioEllenorzesTab.tsx')
const DESK_TAB = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'desktop-oblio-tab.tsx')
const IMPORT = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'dokumentumtar', 'szamla-actions.ts')
const TYPES = path.join(REPO, 'apps', 'web', 'lib', 'dokumentumtar', 'szamla-types.ts')

let failed = false
const ok = (m) => console.log(`OK:   ${m}`)
const fail = (m) => { failed = true; console.error(`HIBA: ${m}`) }

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const f of [WEB_PARSER, UI_PARSER, WEB_TAB, DESK_TAB, IMPORT, TYPES]) {
  if (!fs.existsSync(f)) fail(`hiányzó fájl: ${path.relative(REPO, f)}`)
}
if (failed) { console.error('\nAz SPV-import önellenőrzés ELBUKOTT.'); process.exit(1) }

function orzo(cimke, forras, minta, mutans) {
  const kod = kodCsak(forras)
  if (!minta.test(kod)) { fail(`${cimke} — hiányzik`); return }
  if (minta.test(kodCsak(mutans(forras)))) fail(`${cimke} — az őr VAK: a mutáns is átment`)
  else ok(cimke)
}
/** Függvényhatáros ablak — a vég-jelző KÓD legyen, ne komment (a kodCsak kitörli). */
function ablak(forras, kezdo, veg) {
  const k = kodCsak(forras)
  const i = k.indexOf(kezdo)
  if (i < 0) return ''
  const j = k.indexOf(veg, i + kezdo.length)
  return j < 0 ? k.slice(i) : k.slice(i, j)
}

const web = olvas(WEB_PARSER)
const ui = olvas(UI_PARSER)
const webTab = olvas(WEB_TAB)
const deskTab = olvas(DESK_TAB)
const imp = olvas(IMPORT)

// ── (1) AZ UTOLSÓ FUTAM AZ INDEX — MINDKÉT PARSERBEN ─────────────────────
orzo(
  '(1) webes parser: az UTOLSÓ 8+ jegyű futam a kulcs',
  web,
  /if \(futamok\.length > 0\) return futamok\[futamok\.length - 1\]/,
  (s) => s.replace(/return futamok\[futamok\.length - 1\]/, 'return futamok[0]'),
)
orzo(
  '(1) böngészős parser: az UTOLSÓ 8+ jegyű futam a kulcs',
  ui,
  /if \(runs && runs\.length > 0\) return runs\[runs\.length - 1\]/,
  (s) => s.replace(/return runs\[runs\.length - 1\]/, 'return runs[0]'),
)
orzo(
  '(1) a RÉGI (első-futam) kulcs KÜLÖN, névvel megjelölve él tovább',
  web,
  /export function anafUuidFajlnevbolElso\(/,
  (s) => s.replace(/export function anafUuidFajlnevbolElso\(/, 'function nemExportalt('),
)

// ── (2) ELŐJEL-TUDATOS TÍPUS — MINDKÉT PARSERBEN ─────────────────────────
orzo(
  '(2) webes parser: negatív végösszeg → jóváíró',
  web,
  /if \(meta\.vegosszeg != null && meta\.vegosszeg < 0\) \{[\s\S]{0,120}?meta\.tipus = 'jovairo'/,
  (s) => s.replace(/if \(meta\.tipus === 'szamla'\) meta\.tipus = 'jovairo'/, ''),
)
orzo(
  '(2) webes parser: a végösszeg ELŐJELESEN marad (a hívó dönt az abs-ról)',
  web,
  /elojel: 1 \| -1/,
  (s) => s.replace(/elojel: 1 \| -1/, 'elojel: 1'),
)
orzo(
  '(2) webes parser: a hivatkozott EREDETI számla (BillingReference) kijön',
  web,
  /if \(gy\.nev !== 'BillingReference'\) continue[\s\S]{0,300}?meta\.hivatkozottSzamla = id/,
  (s) => s.replace(/meta\.hivatkozottSzamla = id/, 'void id'),
)
orzo(
  '(2) böngészős parser: negatív bruttó → credit_note (a desktop 5 kapuja ezen áll)',
  ui,
  /result\.amounts\.brut < 0 && result\.documentType === 'invoice'\) \{\s*result\.documentType = 'credit_note'/,
  (s) => s.replace(/result\.documentType = 'credit_note'\n\s*\}\n\s*\/\/ ─── Hivatkozott/, '}\n  // ─── Hivatkozott'),
)
orzo(
  '(2) böngészős parser: BillingReference → referencedInvoice',
  ui,
  /result\.referencedInvoice = id/,
  (s) => s.replace(/result\.referencedInvoice = id/, 'void id'),
)

// ── (3) NINCS CSUPASZ FÁJLNÉV-VISSZAESÉS — parser ÉS hívók ───────────────
{
  const w = ablak(ui, 'export function extractAnafUuidFromFilename(', 'export function identityKeyFromInvoice(')
  if (/return base\.length > 0 \? base : null/.test(w)) {
    fail('(3) a böngészős parser VISSZAESIK a csupasz fájlnévre — két szállító factura.xml-je azonos kulcsot kapna')
  } else if (/return null/.test(w)) {
    ok('(3) a böngészős parser NEM esik vissza a csupasz fájlnévre')
  } else fail('(3) a böngészős kinyerő vége nem azonosítható')
  const regi = 'return base.length > 0 ? base : null'
  if (/return base\.length > 0 \? base : null/.test(regi)) ok('NEGATÍV — a régi visszaesést a minta elkapja')
  else fail('NEGATÍV — a visszaesés-kereső minta VAK')
}
orzo(
  '(3) a böngészős oldalon is van identitás-kulcs (azon:CUI|SZÁM|DÁTUM — a webessel azonos alak)',
  ui,
  /return `azon:\$\{cui\}\|\$\{num\}\|\$\{date\}`/,
  (s) => s.replace(/return `azon:\$\{cui\}\|\$\{num\}\|\$\{date\}`/, "return `${cui}-${num}`"),
)
for (const [cimke, forras] of [['webes Oblio-fül', webTab], ['desktop-fül', deskTab]]) {
  const kod = kodCsak(forras)
  // A csupasz fájlnév az anafUuid-ba SEHOL nem kerülhet.
  if (/meta\.anafUuid = fallback(Uuid)?\b/.test(kod)) {
    fail(`(3) ${cimke}: a csupasz fájlnév-fallback még bekerül az anafUuid-ba`)
  } else ok(`(3) ${cimke}: a fájlnév nem lesz anafUuid`)
  if (/meta\.anafUuid = identityKeyFromInvoice\(meta\.supplier\.cui, meta\.invoiceNumber, meta\.issueDate\)/.test(kod)) {
    ok(`(3) ${cimke}: kulcs nélkül a számla IDENTITÁSÁBÓL képez`)
  } else fail(`(3) ${cimke}: nincs identitás-kulcs tartalék`)
  if (/if \(!meta\.anafUuid\) \{[\s\S]{0,200}?console\.warn\([\s\S]{0,200}?continue/.test(kod)) {
    ok(`(3) ${cimke}: kulcs nélkül a fájl HANGOSAN kimarad (nem néma)`)
  } else fail(`(3) ${cimke}: kulcs nélküli fájl némán menne tovább`)
}

// ── (4) KETTŐS KULCSÚ DUPLIKÁTUM-ELLENŐRZÉS AZ IMPORTBAN ─────────────────
orzo(
  '(4) a duplikátum-előszűrő az ÚJ ÉS a RÉGI kulcsot is lekéri',
  imp,
  /\.in\('anaf_uuid', \[\.\.\.new Set\(jeloltek\.flatMap\(\(j\) => \(j\.regiKulcs \? \[j\.anafUuid, j\.regiKulcs\] : \[j\.anafUuid\]\)\)\)\]\)/,
  (s) => s.replace(/\.in\('anaf_uuid', \[\.\.\.new Set\(jeloltek\.flatMap\(\(j\) => \(j\.regiKulcs \? \[j\.anafUuid, j\.regiKulcs\] : \[j\.anafUuid\]\)\)\)\]\)/, ".in('anaf_uuid', jeloltek.map((j) => j.anafUuid))"),
)
orzo(
  '(4) a találat-keresés a RÉGI kulcsra is visszaesik',
  imp,
  /const letezo = letezoMap\.get\(jelolt\.anafUuid\) \?\? letezoRegi/,
  (s) => s.replace(/ \?\? letezoRegi/, ''),
)
orzo(
  '(4) a régi kulcs a fájlnévből számolódik (anafUuidFajlnevbolElso)',
  imp,
  /const regiKulcs = anafUuidFajlnevbolElso\(par\.xml\.fajlnev\)/,
  (s) => s.replace(/anafUuidFajlnevbolElso\(par\.xml\.fajlnev\)/, 'null'),
)
{
  // ÚJ sor SOHA nem kaphatja a régi kulcsot: az insert az anafUuid-t írja.
  const w = ablak(imp, ".from('szallitoi_szamla')\n      .insert([", '.select(\'id\')')
  if (/anaf_uuid: jelolt\.anafUuid,/.test(w) && !/anaf_uuid: jelolt\.regiKulcs/.test(w)) {
    ok('(4) ÚJ sor mindig az ÚJ kulcsot kapja (a régi csak keresésre szolgál)')
  } else fail('(4) az új sor a régi kulcsot kaphatja — a kulcsváltás félbemaradna')
}
orzo(
  '(4) a régi kulccsal talált duplikátum JELÖLVE van (regiKulcs)',
  imp,
  /regiKulcs: !!letezoRegi && !letezoMap\.has\(jelolt\.anafUuid\)/,
  (s) => s.replace(/regiKulcs: !!letezoRegi && !letezoMap\.has\(jelolt\.anafUuid\),\n/, ''),
)
{
  const t = kodCsak(olvas(TYPES))
  if (/regiKulcs\?: boolean/.test(t)) ok('(4) a duplikátum-típus ismeri a regiKulcs jelzőt')
  else fail('(4) a duplikátum-típusban nincs regiKulcs — a UI nem tudná kiírni')
}

// ── (5) A SZTORNÓ HIVATKOZÁSA MEGMARAD (megjegyzésben, séma-változtatás nélkül) ──
orzo(
  '(5) az import a hivatkozott eredeti számlát a megjegyzésbe írja',
  imp,
  /megjegyzes: jelolt\.meta\.hivatkozottSzamla\s*\?\s*`Sztornó \/ jóváírás — a\(z\) \$\{jelolt\.meta\.hivatkozottSzamla\} számlára hivatkozik\.`/,
  (s) => s.replace(/megjegyzes: jelolt\.meta\.hivatkozottSzamla[\s\S]{0,200}?: null,\n/, ''),
)
{
  // A típus a PARSER előjel-tudatos döntése — az import nem írhatja felül a gyökérből.
  const kod = kodCsak(imp)
  if (/tipus: jelolt\.meta\.tipus === 'jovairo' \? 'jovairo' : 'szamla'/.test(kod)) {
    ok('(5) az import a parser (előjel-tudatos) típusát tárolja')
  } else fail('(5) az import saját típus-döntést hoz — a negatív Invoice tartozás lenne')
  if (/osszeg: Math\.abs\(jelolt\.meta\.vegosszeg as number\)/.test(kod)) {
    ok('(5) az összeg pozitívan tárolt (a séma így várja), a típus viszi az előjelet')
  } else fail('(5) az összeg-tárolás alakja változott — ellenőrizd a séma-kontraktust')
}

if (failed) { console.error('\nAz SPV-import önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nAz SPV-import önellenőrzés rendben.')
