#!/usr/bin/env node
/**
 * SZÁLLÍTÓI SZÁMLA NYOMTATVÁNY önellenőrzés (2026-09-04, Endre 3. kérése)
 *
 * Endre: „A fakturák kinézete legyen ilyen, a csatolt képhez hasonló nyomtatási
 * képpel! Legyen jelölve az is, hogy a Kartotékából volt nyomtatva! A nyomtatási
 * kép előnézete legyen szép előugró ablakban, és a nyomtatás gombra kattintva
 * jelenjen meg más lapon."
 *
 * Tíz, egymástól függetlenül elromolható védelem:
 *
 *   (1) XSS: MINDEN kiírt érték `esc()`-en megy át — a sortétel-megnevezés, a
 *       szállító neve, a megjegyzés IDEGEN cég XML-jéből jön, és a print-engine
 *       same-originben, sandbox nélkül futtatja a HTML-t.
 *   (2) NEM másoljuk az ANAF arculatát és az Oblio védjegyét.
 *   (3) „Kartotékából nyomtatva" jelölés + „NEM a hiteles bizonylat" mondat.
 *   (4) FAIL-LOUD: ha az XML nem érhető el, a lap KIMONDJA, hogy a tételek
 *       hiányoznak — nem nyomtat némán üres tétel-táblát.
 *   (5) A tétel-tábla `table-layout: fixed` + `<colgroup>`, és NINCS görgető
 *       wrapper a nyomtatott ágon (az `overflow-x-auto` papíron kivágná az oszlopokat).
 *   (6) A betöltő KÜLÖN kezeli a DB-hibát és a „nincs sor"-t — egy átmeneti
 *       503 nem lehet 404 („eltűnt a számla").
 *   (7) EGY forrás: a szamla/[id] lap ÉS az action ugyanazt a betöltőt hívja.
 *   (8) A dialógus a print-engine `printToBrowser`-ét hívja (új lapon nyílik).
 *   (9) A 'use server' fájl CSAK async függvényt exportál (Next.js 16 — a CI
 *       zölden átmegy, a DEPLOY buildje bukik).
 *  (10) A pénznem a tételekből jön (EUR-számla nem RON-ként nyomtatódik).
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): minden őrhöz
 * visszajátsszuk a hibás világot, és bizonyítjuk, hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-szamla-nyomtatvany.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const BUILDER = path.join(REPO, 'apps', 'web', 'lib', 'dokumentumtar', 'szamla-nyomtatvany.ts')
const LOADER = path.join(REPO, 'apps', 'web', 'lib', 'dokumentumtar', 'szamla-nyomtatvany-load.ts')
const ACTION = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'dokumentumtar', 'szamla-nyomtatvany-actions.ts')
const PAGE = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'dokumentumtar', 'szamla', '[id]', 'page.tsx')
const DIALOG = path.join(REPO, 'apps', 'web', 'components', 'dokumentumtar', 'szamla-nyomtatas-dialog.tsx')

let failed = false
const ok = (m) => console.log(`OK:   ${m}`)
const fail = (m) => { failed = true; console.error(`HIBA: ${m}`) }

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const f of [BUILDER, LOADER, ACTION, PAGE, DIALOG]) {
  if (!fs.existsSync(f)) fail(`hiányzó fájl: ${path.relative(REPO, f)}`)
}
if (failed) { console.error('\nA nyomtatvány-önellenőrzés ELBUKOTT.'); process.exit(1) }

function orzo(cimke, forras, minta, mutans) {
  const kod = kodCsak(forras)
  if (!minta.test(kod)) { fail(`${cimke} — hiányzik`); return }
  if (minta.test(kodCsak(mutans(forras)))) fail(`${cimke} — az őr VAK: a mutáns is átment`)
  else ok(cimke)
}

const builder = olvas(BUILDER)
const loader = olvas(LOADER)
const action = olvas(ACTION)
const page = olvas(PAGE)
const dialog = olvas(DIALOG)

// ── (1) XSS: minden interpolált mező esc()-elt ───────────────────────────
{
  const kod = kodCsak(builder)
  // POZITÍV: a KÜLSŐ eredetű mezők (idegen cég XML-je, a lelkész megjegyzése)
  // kiírási pontjai MIND esc()-en mennek át. Ezek a valódi támadási felületek.
  const kiirasok = [
    ['tétel-megnevezés', /<td>\$\{esc\(nev \|\| '—'\)\}<\/td>/],
    ['fél neve', /<div class="party-name">\$\{esc\(nev \?\? '—'\)\}<\/div>/],
    ['kulcs-érték sor (Reg. com., CIF, IBAN, cím…)', /<span class="k">\$\{esc\(k\)\}<\/span><span class="v">\$\{esc\(v\)\}<\/span>/],
    ['kiállítói megjegyzés', /<span class="v">\$\{esc\(m\)\}<\/span>/],
    ['saját megjegyzés (sztornó-hivatkozás is)', /\$\{esc\(szamla\.megjegyzes\)\}/],
    ['nyilvántartási azonosító', /\$\{esc\(szamla\.anaf_uuid\)\}/],
    ['könyvelési pár iratszáma', /\$\{esc\(p\.iratszam \|\| '—'\)\}/],
    ['könyvelési hely (bank neve)', /\$\{esc\(p\.hely\)\}/],
    ['dokumentum címe', /<title>\$\{esc\(kind\)\} \$\{esc\(szam\)\}/],
    ['fizetési feltétel', /\$\{esc\(r\.fizetesiFeltetel\)\}/],
    ['mértékegység', /\$\{esc\(um\(t\.mertekegyseg\)\)\}/],
  ]
  for (const [nev, minta] of kiirasok) {
    if (minta.test(kod)) ok(`(1) esc(): ${nev}`)
    else fail(`(1) a(z) ${nev} NEM esc()-en át íródik ki — XSS az idegen XML-ből`)
  }
  // NEGATÍV (célzott): külső adat-olvasó KÖZVETLENÜL a template-ben, esc() nélkül.
  // Ezek az accessorok hordozzák az idegen szöveget: t.* (tétel), f?.* (fél),
  // r?.*/r.* (részletek), szamla.* (a sor), p.* (pár), m (jegyzet), nev/v/k.
  const CSUPASZ = /\$\{(?!esc\()(?:t|f\?|r\?|r|szamla|p|extra|vevo)\.[a-zA-Z_.?]+\}/
  if (CSUPASZ.test(kod)) fail(`(1) esc() nélküli külső mező a HTML-ben: ${kod.match(CSUPASZ)?.[0]}`)
  else ok('(1) nincs esc() nélküli külső adat-olvasó a HTML-ben')
  // NEGATÍV: egy esc() eltávolítása a tétel-megnevezésről bukjon (mindkét ágon).
  const mutans = kodCsak(builder.replace("<td>${esc(nev || '—')}</td>", "<td>${nev || '—'}</td>"))
  const pozitivBukik = !/<td>\$\{esc\(nev \|\| '—'\)\}<\/td>/.test(mutans)
  const mutans2 = kodCsak(builder.replace('${esc(szamla.megjegyzes)}', '${szamla.megjegyzes}'))
  const negativBukik = CSUPASZ.test(mutans2)
  if (pozitivBukik && negativBukik) ok('NEGATÍV — az esc() elhagyását MINDKÉT irányból elkapja az őr (pozitív + célzott negatív)')
  else fail(`NEGATÍV — az őr VAK az esc() elhagyására (pozitív: ${pozitivBukik}, negatív: ${negativBukik})`)
  if (/function esc\(v: unknown\): string \{[\s\S]{0,200}?replaceAll\('"', '&quot;'\)/.test(kod)) {
    ok('(1) az esc() az idézőjelet is kódolja (attribútum-injekció ellen)')
  } else fail('(1) az esc() nem kódolja az idézőjelet')
}

// ── (2) NEM másoljuk az ANAF arculatát és az Oblio védjegyét ─────────────
{
  const kod = kodCsak(builder)
  const tiltott = [/oblio\.eu/i, /generat[ăa] de pe site-ul ANAF/i, /Agen[țt]ia Na[țt]ional[ăa] de Administrare Fiscal[ăa]/i, /anaf\.ro\/.*logo/i]
  const talalt = tiltott.filter((t) => t.test(kod))
  if (talalt.length === 0) ok('(2) az építő nem viseli az ANAF-arculatot és az Oblio-védjegyet')
  else fail(`(2) idegen arculat/védjegy az építőben: ${talalt.map(String).join(', ')}`)
  const regi = 'e-Factura generata de pe site-ul ANAF cu Oblio | www.oblio.eu'
  if (tiltott.some((t) => t.test(regi))) ok('NEGATÍV — a lemásolt Oblio-lábat a minták elkapnák')
  else fail('NEGATÍV — a védjegy-kereső minták VAKOK')
}

// ── (3) „Kartotékából nyomtatva" + nem hiteles bizonylat ─────────────────
orzo(
  '(3) a lap kimondja: Kartotékából nyomtatva',
  builder,
  /Kartotékából nyomtatva/,
  (s) => s.replace(/Kartotékából nyomtatva/g, 'Nyomtatva'),
)
orzo(
  '(3) a lap kimondja: NEM a hiteles bizonylat',
  builder,
  /NEM a hiteles bizonylat — az az ANAF e-Factura XML/,
  (s) => s.replace(/NEM a hiteles bizonylat — az az ANAF e-Factura XML[^<]*/g, ''),
)

// ── (4) FAIL-LOUD hiányzó XML-nél ─────────────────────────────────────────
orzo(
  '(4) tételek nélkül a lap HANGOSAN mondja, hogy hiányoznak',
  builder,
  /A sortételek nem szerepelnek ezen a lapon\./,
  (s) => s.replace(/<div class="warn">[\s\S]*?<\/div>\s*<div class="totals">/, '<div class="totals">'),
)
orzo(
  '(4) a betöltő az XML minden bukását xmlHiba-ként adja tovább (nem nyeli el)',
  loader,
  /xmlHiba = `Az XML letöltése a tárhelyről sikertelen/,
  (s) => s.replace(/xmlHiba = `Az XML letöltése a tárhelyről sikertelen[^`]*`/, 'xmlHiba = null'),
)
{
  const kod = kodCsak(loader)
  if (/if \(!szamla\.xml_dokumentum_id\) \{\s*xmlHiba = /.test(kod)) ok('(4) a „nincs kapcsolt XML" eset (FK SET NULL) is kimondott')
  else fail('(4) a hiányzó xml_dokumentum_id némán maradna')
}

// ── (5) fix tábla-elrendezés, nincs görgető wrapper ──────────────────────
orzo(
  '(5) a tétel-tábla table-layout: fixed',
  builder,
  /table\.items \{[^}]*table-layout: fixed/,
  (s) => s.replace(/table-layout: fixed;/, ''),
)
orzo(
  '(5) a tétel-tábla colgroup-pal rögzíti az oszlopokat',
  builder,
  /<colgroup>/,
  (s) => s.replace(/<colgroup>[\s\S]*?<\/colgroup>/, ''),
)
{
  const kod = kodCsak(builder)
  if (/overflow-x:\s*auto|overflow:\s*auto|overflow-x-auto/.test(kod)) {
    fail('(5) görgető wrapper a nyomtatott ágon — papíron kivágná az oszlopokat')
  } else ok('(5) nincs görgető wrapper a nyomtatott ágon')
}

// ── (6) DB-hiba ≠ nincs sor ───────────────────────────────────────────────
orzo(
  '(6) a betöltő KÜLÖN ágban adja a DB-hibát (notFound: false)',
  loader,
  /if \(error\) \{\s*return \{ ok: false, notFound: false, error:/,
  (s) => s.replace(/return \{ ok: false, notFound: false, error:[^}]*\}/, 'return { ok: false, notFound: true, error: \'x\' }'),
)
orzo(
  '(6) a lap DB-hibánál NEM 404-et ad, hanem kimondja',
  page,
  /if \(r\.notFound\) return notFound\(\)[\s\S]{0,400}?A számla-adatlap most nem tölthető be/,
  (s) => s.replace(/if \(r\.notFound\) return notFound\(\)/, 'return notFound()'),
)
{
  const kod = kodCsak(page)
  if (/if \(error \|\| !data\) return notFound\(\)/.test(kod)) fail('(6) visszatért a régi `error || !data → notFound()` — a 503 „eltűnt számla" lenne')
  else ok('(6) nincs `error || !data → notFound()` a lapon')
}

// ── (7) EGY forrás: lap és action ugyanazt a betöltőt hívja ──────────────
{
  const p = kodCsak(page), a = kodCsak(action)
  if (/loadSzamlaNyomtatvany\(/.test(p) && /loadSzamlaNyomtatvany\(/.test(a)) ok('(7) a lap ÉS az action a közös betöltőt hívja')
  else fail('(7) a lap vagy az action saját HTML-t épít — a két felület széthúzhat')
  if (/buildSzallitoiSzamlaHtml\(/.test(p) || /buildSzallitoiSzamlaHtml\(/.test(a)) fail('(7) az építő közvetlenül hívva a lapból/actionből — kerüld meg a betöltőt csak indokkal')
  else ok('(7) az építőt csak a betöltő hívja')
  // A lap őrzi a nyomtatási CSS-t és a #szamla-lap azonosítót (a régi őr erre asszertál).
  if (/@media print/.test(p) && /szamla-lap/.test(p)) ok('(7) a lap megtartotta a #szamla-lap + @media print őrzött szerkezetet')
  else fail('(7) a lapról eltűnt a nyomtatási CSS vagy a #szamla-lap')
}

// ── (8) a dialógus új lapon nyomtat (print-engine) ───────────────────────
orzo(
  '(8) a Nyomtatás a print-engine printToBrowser-ét hívja (új lapon nyílik)',
  dialog,
  /await printToBrowser\(html\)/,
  (s) => s.replace(/await printToBrowser\(html\)/, 'window.print()'),
)
orzo(
  '(8) az előnézet a lapozható PrintPreviewFrame (.sheet)',
  dialog,
  /<PrintPreviewFrame[\s\S]{0,300}?szelektor="\.sheet"/,
  (s) => s.replace(/szelektor="\.sheet"/, ''),
)

// ── (9) 'use server' fájl csak async függvényt exportál ─────────────────
{
  const a = kodCsak(action)
  if (!/^'use server'/.test(action.trim())) fail("(9) az action fájl nem 'use server'")
  else if (/^export (type|interface|const|let|enum) /m.test(a)) fail("(9) a 'use server' fájl nem-függvényt exportál — a DEPLOY buildje bukik (Next.js 16)")
  else ok("(9) a 'use server' fájl csak async függvényt exportál")
  const mutans = kodCsak(action.replace(/^export async function/m, 'export type X = 1\nexport async function'))
  if (/^export (type|interface|const|let|enum) /m.test(mutans)) ok('NEGATÍV — egy visszacsempészett export type-ot az őr elkapna')
  else fail('NEGATÍV — az őr VAK a type-exportra')
}

// ── (10) pénznem a tételekből ─────────────────────────────────────────────
orzo(
  '(10) a pénznem az összesítő/számla pénzneméből jön, nem beégetett RON',
  builder,
  /const penznem = \(r\?\.osszesito\.penznem \|\| szamla\.penznem \|\| 'RON'\)\.toUpperCase\(\)/,
  (s) => s.replace(/const penznem = \(r\?\.osszesito\.penznem \|\| szamla\.penznem \|\| 'RON'\)\.toUpperCase\(\)/, "const penznem = 'RON'"),
)

if (failed) { console.error('\nA nyomtatvány-önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nA nyomtatvány-önellenőrzés rendben.')
