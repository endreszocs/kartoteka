#!/usr/bin/env node
/**
 * OBLIO SZÁMLA-INTEGRITÁS önellenőrzés (2026-09-03, átvilágítás P0/P1)
 *
 * Három védelem, amelyek mindegyike HATÓSÁGNAK MENŐ bizonylatot vagy
 * könyvelési igazságot véd:
 *
 *   (1) IDEMPOTENCIA. Az `issueInvoice` 20 mp-es timeout után újrapróbálva
 *       MÁSODIK, jogilag érvényes e-Facturát állított ki az ANAF SPV-n, és az
 *       elsőről nyoma sem maradt (a DB-írás elmaradt). Kellett: fail-closed
 *       duplikátum-kapu a kiállítás ELŐTT, és ha a DB-írás bukik el az Oblio
 *       sikere UTÁN, a hibaüzenetnek KI KELL MONDANIA a számla számát —
 *       a régi „DB hiba: …" azt sugallta, hogy semmi nem történt.
 *
 *   (2) HALOTT SZÁMLA-KAPCSOLAT. A kiadás stornója nem bontja a
 *       `szallitoi_szamla_kiadas` kapcsolatot. A számla ettől „Könyvelve" és
 *       „Kifizetve" maradt, kiesett a „Nincs a könyvelésben" szűrőből, a
 *       NYOMTATOTT adatlap pedig stornózott tételt sorolt fel könyvelési
 *       tételként. Ráadásul a halott kapcsolat lefoglalta a fedezetet, így az
 *       ÚJ, helyes kiadás nem volt hozzákapcsolható.
 *       ⚠️ A megoldás NEM az elrejtés: a sornak LÁTSZANIA kell, pirosan.
 *
 *   (3) SZTORNÓ FAIL-CLOSED. Ha az Oblio nem tudja törölni a számlát (mert már
 *       felment az SPV-re), a régi kód MÉGIS sztornózottnak jelölte lokálisan —
 *       a Kartotéka mást állított, mint a hatóság.
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): minden őrhöz
 * visszajátsszuk a hibás világot, és bizonyítjuk, hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-oblio-szamla-integritas.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'oblio-actions.ts')
const DIALOG = path.join(REPO, 'apps', 'web', 'components', 'modals', 'oblio-issue-invoice-dialog.tsx')
const SZAMLA = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'dokumentumtar', 'szamla-actions.ts')
const LISTA = path.join(REPO, 'apps', 'web', 'components', 'dokumentumtar', 'szamla-egyeztetes-main.tsx')
// 2026-09-04 (Endre 3.): a nyomtatott adatlap HTML-je KÖZÖS építőbe és betöltőbe
// költözött (a szamla/[id] lap és az előnézet-dialógus ugyanazt hívja). A sztornó-
// jelölés és az „élő párokból Könyvelve" logika ITT él — az őr ide céloz.
const BUILDER = path.join(REPO, 'apps', 'web', 'lib', 'dokumentumtar', 'szamla-nyomtatvany.ts')
const LOADER = path.join(REPO, 'apps', 'web', 'lib', 'dokumentumtar', 'szamla-nyomtatvany-load.ts')
const STORNO = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'edit-storno-actions.ts')

let failed = false
const ok = (m) => console.log(`OK:   ${m}`)
const fail = (m) => { failed = true; console.error(`HIBA: ${m}`) }

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const f of [ACTIONS, DIALOG, SZAMLA, LISTA, BUILDER, LOADER, STORNO]) {
  if (!fs.existsSync(f)) fail(`hiányzó fájl: ${path.relative(REPO, f)}`)
}
if (failed) { console.error('\nA számla-integritás önellenőrzés ELBUKOTT.'); process.exit(1) }

function orzo(cimke, forras, minta, mutans) {
  const kod = kodCsak(forras)
  if (!minta.test(kod)) { fail(`${cimke} — hiányzik`); return }
  if (minta.test(kodCsak(mutans(forras)))) fail(`${cimke} — az őr VAK: a mutáns is átment`)
  else ok(cimke)
}

const aktNyers = olvas(ACTIONS)
const aktKod = kodCsak(aktNyers)

// ── (1) IDEMPOTENCIA ─────────────────────────────────────────────────────
orzo(
  '(1) van duplikátum-kapu a kiállítás előtt',
  aktNyers,
  /from\('oblio_szamlak'\)[\s\S]{0,400}?\.eq\('berleti_szerzodes_id', input\.berletiSzerzodesId\)[\s\S]{0,400}?\.eq\('szamla_datum', input\.szamlaDatum\)/,
  (s) => s.replace(/\.eq\('szamla_datum', input\.szamlaDatum\)/g, ''),
)
{
  // A kapunak a createInvoice ELŐTT kell futnia — utána már elkésett.
  const kapu = aktKod.indexOf("from('oblio_szamlak')")
  const hivas = aktKod.indexOf('await createInvoice(')
  if (kapu >= 0 && hivas > kapu) ok('(1) a kapu az Oblio-hívás ELŐTT fut')
  else fail('(1) a duplikátum-kapu az Oblio-hívás UTÁN (vagy sehol) van — elkésne')
}
orzo(
  '(1) FAIL-CLOSED: ha a kapu nem futtatható, NEM állítunk ki számlát',
  aktNyers,
  /if \(dupErr\) \{[\s\S]{0,400}?return \{/,
  (s) => s.replace(/if \(dupErr\) \{/g, 'if (false) {'),
)
orzo(
  '(1) DB-írás bukásakor a hibaüzenet KIMONDJA a számla számát',
  aktNyers,
  /invoiceData\.seriesName\}-\$\{invoiceData\.number\}/,
  (s) => s.replace(/\$\{invoiceData\.seriesName\}-\$\{invoiceData\.number\}/g, 'X'),
)
orzo(
  '(1) …és megtiltja az újrapróbálkozást',
  aktNyers,
  /NE állíts ki újat/,
  (s) => s.replace(/NE állíts ki újat/g, 'Próbáld újra'),
)
orzo(
  '(1) a felülbírálás TUDATOS (külön jelölő, nem alapértelmezett)',
  olvas(DIALOG),
  /disabled=\{loading \|\| \(!!duplikatumFigyelmeztetes && !duplikatumVallalva\)\}/,
  (s) => s.replace(/ \|\| \(!!duplikatumFigyelmeztetes && !duplikatumVallalva\)/g, ''),
)

// ── (2) HALOTT SZÁMLA-KAPCSOLAT ──────────────────────────────────────────
{
  const sz = olvas(SZAMLA)
  const szKod = kodCsak(sz)
  // Mindkét olvasó ág kéri a zászlókat.
  const db = (szKod.match(/deleted, stornozott/g) || []).length
  if (db >= 2) ok(`(2) a kapcsolat-olvasók lekérik a törölt/sztornózott zászlót (${db} helyen)`)
  else fail(`(2) csak ${db} helyen kérjük le a zászlókat (legalább 2 kell: párosítás-lista + fedezet-őr)`)

  orzo(
    '(2) a halott kapcsolat NEM foglalja a fedezetet',
    sz,
    /\.filter\(\(r\) => !\(r\.kiadas\?\.deleted \|\| r\.kiadas\?\.stornozott\)\)/,
    (s) => s.replace(/\.filter\(\(r\) => !\(r\.kiadas\?\.deleted \|\| r\.kiadas\?\.stornozott\)\)\s*\n\s*/g, ''),
  )
  orzo(
    '(2) a párosítás-bejegyzés hordozza az érvénytelenséget',
    sz,
    /ervenytelen: !!sor\.kiadas\.deleted \|\| !!sor\.kiadas\.stornozott/,
    (s) => s.replace(/ervenytelen: !!sor\.kiadas\.deleted \|\| !!sor\.kiadas\.stornozott,/g, ''),
  )
  // ⚠️ NEM `!inner` embed-szűrő: az elrejtené a sort.
  if (/kiadas!inner/.test(szKod)) {
    fail('(2) `!inner` embed-szűrő került a kódba — az ELREJTENÉ a halott kapcsolatot')
  } else ok('(2) nincs `!inner` elrejtés — a halott kapcsolat látható marad')
}
orzo(
  '(2) a lista PIROSAN jelzi a halott kapcsolatot (nem rejti el)',
  olvas(LISTA),
  /halottParok\.length > 0 && \([\s\S]{0,1600}?sztornózva — bontsd/,
  (s) => s.replace(/sztornózva — bontsd/g, 'rendben'),
)
{
  // A jelzés PIROS (nem szürke/halvány) — a lelkésznek észre kell vennie.
  const l = kodCsak(olvas(LISTA))
  const i = l.indexOf('halottParok.length > 0 && (')
  const szakasz = i >= 0 ? l.slice(i, i + 1600) : ''
  if (/bg-red-50|text-red-700|ring-red-200/.test(szakasz)) ok('(2) a jelzés piros (nem elrejtve, nem halványan)')
  else fail('(2) a halott-kapcsolat jelzése nem piros — elveszne a többi jelvény közt')
}
orzo(
  '(2) a „Nincs a könyvelésben" szűrő az ÉLŐ párokra néz',
  olvas(LISTA),
  /\.some\(\(p\) => !p\.ervenytelen\)/,
  (s) => s.replace(/\.some\(\(p\) => !p\.ervenytelen\)/g, '.length'),
)
orzo(
  '(2) a NYOMTATOTT adatlap megjelöli a sztornózott tételt',
  olvas(BUILDER),
  /p\.ervenytelen[\s\S]{0,300}?sztornózott/,
  (s) => s.replace(/\(sztornózott\)/g, '').replace(/p\.ervenytelen \? 'dead' : ''/g, "''"),
)
orzo(
  '(2) a betöltő a törölt ÉS a sztornózott kiadást is érvénytelennek jelöli',
  olvas(LOADER),
  /ervenytelen: !!k\.kiadas\.deleted \|\| !!k\.kiadas\.stornozott/,
  (s) => s.replace(/ervenytelen: !!k\.kiadas\.deleted \|\| !!k\.kiadas\.stornozott/g, 'ervenytelen: false'),
)
orzo(
  '(2) a „Könyvelve" állítás csak ÉLŐ párokból származik',
  olvas(BUILDER),
  /eloParok\.length > 0[\s\S]{0,80}?Könyvelve/,
  (s) => s.replace(/eloParok\.length > 0/g, 'parok.length > 0'),
)
orzo(
  '(2) a sztornózáskor a lelkész ÉRTESÜL a kapcsolt számlákról',
  olvas(STORNO),
  /szallitoi_szamla_kiadas[\s\S]{0,700}?kaszkadFigyelmeztetes =/,
  (s) => s.replace(/\.from\('szallitoi_szamla_kiadas'\)/g, ".from('valami_mas')"),
)

// ── (3) SZTORNÓ FAIL-CLOSED ──────────────────────────────────────────────
{
  const i = aktKod.indexOf('export async function stornoInvoice')
  const torzs = i >= 0 ? aktKod.slice(i, i + 3000) : ''
  if (!torzs) fail('(3) a stornoInvoice nem található')
  else if (/console\.warn\('\[oblio\] Sztornó/.test(torzs)) {
    fail('(3) az Oblio sztornó-hibáját még mindig elnyeljük, és lokálisan sztornózottnak jelölünk')
  } else if (/SZTORNÓ-SZÁMLÁT kell kiállítani/.test(torzs)) {
    ok('(3) SPV-s számlánál hangos hiba, nem hamis lokális sztornó')
  } else {
    fail('(3) a stornoInvoice OblioError-ága nem azonosítható')
  }
}
orzo(
  '(3) a dialógus nem ígéri, hogy a státusz magától frissül',
  olvas(DIALOG),
  /Kartotéka ezt NEM kérdezi le magától/,
  (s) => s.replace(/Kartotéka ezt NEM kérdezi le magától/g, 'automatikusan frissül'),
)

if (failed) { console.error('\nA számla-integritás önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nA számla-integritás önellenőrzés rendben.')
