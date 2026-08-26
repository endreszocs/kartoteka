// selftest-gyulekezeti-oldal.mjs — a GYÜLEKEZETI WEBOLDAL őrszemei (2026-08-27)
//
// ⛔ MI VOLT A HIBA (Endre élesben találta a Barátosi oldalon)
//   1. A betöltő-képernyőn és a fejlécben a KARTOTÉKA termék-logója állt a
//      gyülekezet címere helyett. KÉT oka volt: (a) a weboldal csak a
//      `public_sites.crest_image_url`-t nézte, Endre viszont a gyülekezeti
//      adatoknál töltötte fel a címert; (b) a hiányzó címer TARTALÉKA maga a
//      termék-logó volt.
//   2. Az elérhetőségek ugyanígy: a gyülekezeti adatoknál mentve, a weboldalon
//      „hamarosan felkerülnek".
//   3. A „Következő alkalom" üres maradt, pedig a határidőnaplóban volt mentve
//      alkalom — a kártya csak az ISMÉTLŐDŐ istentiszteleti rendet nézte.
//   4. Nem volt gyülekezetenkénti aldomain.
//
// ŐRSZEMEK
//   A1–A9   aldomain-feloldás: slug, fenntartott címkék, több szintű aldomain,
//           port/kisbetűsítés, útvonal-átírás
//   A9n     NEGATÍV: fenntartott lista nélkül a `www` gyülekezetnek látszana
//   B1–B4   magyar dátum/időpont formázás (a naptár és a kártya közös forrása)
//   C1–C6   forrás-őrök: RPC-tartalék, nincs termék-logó, nincs megjegyzés-
//           szivárgás, a kártya a valódi alkalmat használja, a proxy nem
//           futtat munkamenet-kezelőt a gyülekezeti aldomainen
//   C1n/C2n/C4n  NEGATÍV mutánsok — az óvilági forráson mindegyik BUKIK

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
  aldomain: path.join(ROOT, 'apps/web/lib/public-site/aldomain.ts'),
  format: path.join(ROOT, 'apps/web/lib/public-site/esemeny-format.ts'),
  splash: path.join(ROOT, 'apps/web/components/public/public-site-splash.tsx'),
  highlights: path.join(ROOT, 'apps/web/components/public/public-home-highlights.tsx'),
  home: path.join(ROOT, 'apps/web/app/(public)/gy/[slug]/page.tsx'),
  proxy: path.join(ROOT, 'apps/web/proxy.ts'),
  ics: path.join(ROOT, 'apps/web/app/(public)/gy/[slug]/naptar.ics/route.ts'),
  loader: path.join(ROOT, 'apps/web/lib/public-site/tisztsegek-events-loader.ts'),
  migracio: path.join(ROOT, 'migration-docs/sql/2026-08-27-gyulekezeti-oldal-naptar-cimer.sql'),
  alkalmak: path.join(ROOT, 'apps/web/app/(public)/gy/[slug]/alkalmak/page.tsx'),
}

const t = src =>
  ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText

/** A kommenteket kiszedi — a szöveges őrszem ne a MAGYARÁZATRA illeszkedjen. */
function kommentNelkul(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** SQL-kommentek nélkül. */
function sqlKommentNelkul(src) {
  return src.replace(/^\s*--[^\n]*$/gm, '')
}

/**
 * Egy dollár-idézőjeles SQL függvénytörzs KIVÁGÁSA.
 *
 * ⚠️ Miért nem elég a „minden a nyitó jel után": a migráció ELLENŐRZŐ
 * lekérdezései maguk is idézik a keresett mezőneveket (`NOT LIKE
 * '%gp.megjegyzes%'`), tehát a naiv szeletelés SAJÁT MAGÁTÓL bukna meg.
 */
function fuggvenyTorzs(sql, jel) {
  const hatarolo = `$${jel}$`
  const nyit = sql.indexOf(hatarolo)
  if (nyit < 0) return ''
  const zar = sql.indexOf(hatarolo, nyit + hatarolo.length)
  return zar < 0 ? sql.slice(nyit) : sql.slice(nyit + hatarolo.length, zar)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-gyul-oldal-'))
process.on('exit', () => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true })
  } catch {
    /* takarítás */
  }
})

let szamlalo = 0
function betolt(nev, src) {
  const f = path.join(tmp, `${nev}-${(szamlalo += 1)}.cjs`)
  fs.writeFileSync(f, t(src))
  return require_(f)
}

const BAZIS = 'kartoteka.app'
const SLUG = 'baratosi-reformatus-egyhazkozseg'

// ---------------------------------------------------------------------------
// A1–A9 — az aldomain feloldása
// ---------------------------------------------------------------------------
{
  const al = betolt('aldomain', fs.readFileSync(SRC.aldomain, 'utf8'))

  assert(al.aldomainSlug(`${SLUG}.${BAZIS}`, BAZIS) === SLUG, 'A1: a gyülekezeti aldomainből előjön a slug')
  assert(al.aldomainSlug(BAZIS, BAZIS) === null, 'A2: az alap-domain NEM gyülekezet')

  // ⚠️ A wildcard DNS pont ott lép életbe, ahol nincs saját rekord — ezért a
  // fenntartott címkéket a KÓDNAK is védenie kell.
  const fenntartott = ['www', 'mail', 'api', 'admin', 'smtp', 'cdn', 'staging', '_acme-challenge']
  const atcsuszott = fenntartott.filter(f => al.aldomainSlug(`${f}.${BAZIS}`, BAZIS) !== null)
  assert(atcsuszott.length === 0, `A3: a fenntartott aldomainek nem gyülekezetek (${atcsuszott.join(', ') || 'egy sem csúszott át'})`)

  assert(al.aldomainSlug(`a.b.${BAZIS}`, BAZIS) === null, 'A4: a több szintű aldomain nem gyülekezet (a wildcard tanúsítvány sem fedi)')
  assert(al.aldomainSlug('gonosz.pelda.hu', BAZIS) === null, 'A5: idegen gazdagép nem gyülekezet')
  assert(al.aldomainSlug(`${SLUG}.${BAZIS}.tamado.hu`, BAZIS) === null, 'A5b: az alap-domaint TARTALMAZÓ idegen hoszt sem gyülekezet')

  assert(al.aldomainSlug(`${SLUG}.${BAZIS}:3000`, BAZIS) === SLUG, 'A6: a port nem zavarja a feloldást')
  assert(al.aldomainSlug(`${SLUG.toUpperCase()}.${BAZIS.toUpperCase()}`, BAZIS) === SLUG, 'A6b: a nagybetűs gazdagépnév is feloldódik')
  assert(al.aldomainSlug(`${SLUG}.${BAZIS}.`, BAZIS) === SLUG, 'A6c: a záró pont (abszolút DNS-név) sem zavar')
  assert(al.aldomainSlug('a.' + BAZIS, BAZIS) === null, 'A6d: a túl rövid címke nem érvényes slug')

  assert(al.aldomainUtvonal(SLUG, '/') === `/gy/${SLUG}`, 'A7: a gyökér a gyülekezet kezdőlapjára íródik át')
  assert(al.aldomainUtvonal(SLUG, '/alkalmak') === `/gy/${SLUG}/alkalmak`, 'A7b: az aloldal is a gyülekezet alá kerül')
  assert(al.aldomainUtvonal(SLUG, '/naptar.ics') === `/gy/${SLUG}/naptar.ics`, 'A7c: a naptár-letöltés is elérhető az aldomainen')

  // ⚠️ EZ VÉDI AZ APPOT: minden út a /gy/<slug> alá kerül, tehát a belső
  // felületek az aldomainen 404-esek — nem sokszorozódik a munkamenet felülete.
  assert(al.aldomainUtvonal(SLUG, '/dashboard') === `/gy/${SLUG}/dashboard`, 'A7d: a belső útvonal is a gyülekezet alá kerül (ott 404) — nem szolgáljuk ki az appot a gyülekezeti címen')

  assert(al.aldomainUtvonal(SLUG, '/_next/static/chunk.js') === null, 'A8: a keretrendszer-belső fájlokat NEM írjuk át')
  assert(al.aldomainUtvonal(SLUG, `/gy/${SLUG}/posts`) === null, 'A9: a már kanonikus útvonal nem kap dupla előtagot')
}

// A9n (negatív): a fenntartott lista NÉLKÜLI (óvilági) modulon az őrszem BUKIK.
{
  const mutans = fs
    .readFileSync(SRC.aldomain, 'utf8')
    .replace(/const FENNTARTOTT = new Set\(\[[\s\S]*?\]\)/, 'const FENNTARTOTT = new Set([])')
  const al = betolt('aldomain-mutans', mutans)
  assert(
    al.aldomainSlug(`www.${BAZIS}`, BAZIS) === 'www',
    'A9n: fenntartott lista nélkül a `www` gyülekezetnek látszana — az A3 őrszem tehát NEM vak',
  )
}

// ---------------------------------------------------------------------------
// B1–B4 — a magyar dátum-formázás (a kártya és a naptár KÖZÖS forrása)
// ---------------------------------------------------------------------------
{
  const f = betolt('format', fs.readFileSync(SRC.format, 'utf8'))

  assert(f.formazDatum('2026-08-03') === '2026. augusztus 3. (hétfő)', `B1: teljes dátum magyarul (${f.formazDatum('2026-08-03')})`)
  assert(f.hetNapja('2026-08-02') === 0, 'B2: a vasárnap felismerése (UTC-alapon, időzóna-független)')
  assert(f.formazIdo('09:00:00', '13:00:00') === '09:00–13:00', 'B3: idősáv formázása')
  assert(f.formazIdo('09:00:00', null) === '09:00', 'B3b: csak kezdés esetén nincs lógó gondolatjel')
  assert(f.formazIdo(null, null) === '', 'B3c: idő nélküli alkalomnál üres (a hívó dönt, mit ír ki)')

  const tobbnapos = f.formazIdopont({
    datum: '2026-08-03',
    datum_vege: '2026-08-07',
    ido_kezdes: '09:00:00',
    ido_befejezes: '13:00:00',
  })
  assert(
    tobbnapos.includes('augusztus 3.') && tobbnapos.includes('augusztus 7.') && tobbnapos.includes('09:00–13:00'),
    `B4: a többnapos alkalom (pl. vakációs bibliahét) KEZDŐ ÉS ZÁRÓ napja is látszik (${tobbnapos})`,
  )
  const egynapos = f.formazIdopont({ datum: '2026-08-03', datum_vege: '2026-08-03' })
  assert(!egynapos.includes('–'), `B4b: az egynapos alkalomnál nincs fölösleges „–" (${egynapos})`)
}

// ---------------------------------------------------------------------------
// C1 — a kontextus-RPC VISSZAESIK a gyülekezeti adatokra
// ---------------------------------------------------------------------------
{
  const sql = sqlKommentNelkul(fs.readFileSync(SRC.migracio, 'utf8'))

  assert(/c\.cimer_url/.test(sql), 'C1: a címer tartaléka a congregations.cimer_url')
  assert(/c\.email/.test(sql) && /c\.telefon/.test(sql), 'C1b: az e-mail és a telefon tartaléka is a gyülekezeti adat')
  assert(/c\.varos/.test(sql) && /c\.iranyitoszam/.test(sql), 'C1c: a cím a gyülekezeti adatok külön mezőiből áll össze')

  // A weboldalon megadott érték MINDIG erősebb — a tartalék nem írhatja felül.
  const cimerAg = /COALESCE\(\s*NULLIF\(pg_catalog\.btrim\(ps\.crest_image_url\)[\s\S]{0,120}?c\.cimer_url/.test(sql)
  assert(cimerAg, 'C1d: a SORREND helyes — előbb a weboldalon megadott címer, csak utána a gyülekezeti')

  // Az ÜRES SZÖVEG is tartaléknak számít: a „mentettem, mégsem látszik" tünet
  // tipikusan üres stringből jön, nem NULL-ból.
  assert(/NULLIF\(pg_catalog\.btrim\(ps\.contact_email\), ''\)/.test(sql), 'C1e: az üres szöveg is tartalékot vált ki (nem csak a NULL)')
}

// C1n (negatív): a MAI, éles RPC-definíción (a repó korábbi migrációja) az
// őrszem BUKIK — tehát valóban az új viselkedést méri.
{
  const regi = fs.readFileSync(
    path.join(ROOT, 'migration-docs/sql/2026-07-18-public-site-content-and-sitemap.sql'),
    'utf8',
  )
  const regiTiszta = sqlKommentNelkul(regi)
  assert(
    !/c\.cimer_url/.test(regiTiszta),
    'C1n: a RÉGI (2026-07-18-as) kontextus-RPC nem ismerte a gyülekezeti címert — a C1 őrszem nem vak',
  )
}

// ---------------------------------------------------------------------------
// C2 — a gyülekezet oldalán NINCS Kartotéka termék-logó
// ---------------------------------------------------------------------------
{
  const splash = kommentNelkul(fs.readFileSync(SRC.splash, 'utf8'))
  assert(
    !/kartoteka-logo/.test(splash),
    'C2: a betöltő-képernyő NEM a Kartotéka termék-logóját mutatja tartalékként (a gyülekezet monogramját)',
  )

  // Az egész publikus felületen se maradjon termék-logó.
  const publikusMappa = path.join(ROOT, 'apps/web/components/public')
  const talalatok = fs
    .readdirSync(publikusMappa)
    .filter(f => f.endsWith('.tsx'))
    .filter(f => /kartoteka-logo/.test(kommentNelkul(fs.readFileSync(path.join(publikusMappa, f), 'utf8'))))
  assert(talalatok.length === 0, `C2b: egyetlen publikus komponens sem hivatkozik a termék-logóra (${talalatok.join(', ') || 'egy sem'})`)
}

// C2n (negatív): a termék-logós (óvilági) forráson az őrszem BUKIK.
{
  const mutans = kommentNelkul(fs.readFileSync(SRC.splash, 'utf8')).replace(
    'src={crestUrl}',
    "src={crestUrl || '/kartoteka-logo.png'}",
  )
  assert(/kartoteka-logo/.test(mutans), 'C2n: a termék-logós változaton a C2 őrszem BUKNA — nem vak')
}

// ---------------------------------------------------------------------------
// C3 — a BELSŐ megjegyzés sehol nem szivárog ki
// ---------------------------------------------------------------------------
{
  const sql = sqlKommentNelkul(fs.readFileSync(SRC.migracio, 'utf8'))
  const rpcTorzs = fuggvenyTorzs(sql, 'public_site_events_v2')
  assert(rpcTorzs.includes('FROM public.gyulekezeti_programok'), 'C3-elo: a függvénytörzs kivágása sikerült (nem üres szövegen állítunk)')
  assert(!/gp\.megjegyzes/.test(rpcTorzs), 'C3: a nyilvános esemény-RPC NEM adja ki a belső megjegyzést')
  assert(/gp\.leiras/.test(rpcTorzs), 'C3b: a leírás viszont kimegy (Endre 2026-08-27-i kifejezett kérése)')

  const ics = kommentNelkul(fs.readFileSync(SRC.ics, 'utf8'))
  assert(/megjegyzes:\s*null/.test(ics), 'C3c: a nyilvános naptárfájl kifejezetten null megjegyzést ad át az ICS-építőnek')

  const loader = kommentNelkul(fs.readFileSync(SRC.loader, 'utf8'))
  assert(!/\bmegjegyzes\b\s*:\s*(?!null)/.test(loader.replace(/megjegyzes:\s*null/g, '')), 'C3d: a betöltő sem olvas megjegyzést az RPC-ből')
}

// C4n (negatív): ha az RPC KIADNÁ a megjegyzést, a C3 őrszem BUKIK.
{
  const mutans = sqlKommentNelkul(fs.readFileSync(SRC.migracio, 'utf8')).replace(
    'gp.leiras::text',
    'gp.leiras::text, gp.megjegyzes::text',
  )
  const rpcTorzs = fuggvenyTorzs(mutans, 'public_site_events_v2')
  assert(/gp\.megjegyzes/.test(rpcTorzs), 'C4n: a megjegyzést kiadó változaton a C3 őrszem BUKNA — nem vak')
}

// ---------------------------------------------------------------------------
// C5 — a „Következő alkalom" a VALÓDI alkalmat használja
// ---------------------------------------------------------------------------
{
  const hl = kommentNelkul(fs.readFileSync(SRC.highlights, 'utf8'))
  assert(/kovetkezoEsemeny/.test(hl), 'C5: a kártya ismeri a legközelebbi konkrét alkalmat')
  // A konkrét alkalomnak ELŐBB kell jönnie, mint a rendszeres rendnek.
  assert(
    hl.indexOf('kovetkezoEsemeny') < hl.indexOf('site.service_times[0]'),
    'C5b: a konkrét alkalom ERŐSEBB a rendszeres istentiszteleti rendnél',
  )

  const home = kommentNelkul(fs.readFileSync(SRC.home, 'utf8'))
  assert(
    /<PublicHomeHighlights[^>]*kovetkezoEsemeny=/.test(home),
    'C5c: a kezdőlap ténylegesen át is adja az alkalmat (a prop nem marad kihasználatlan)',
  )
  assert(
    /<PublicEsemenyekSection[^>]*slug=/.test(home),
    'C5d: a közelgő események szekcióból át lehet lépni a teljes éves naptárra',
  )
}

// ---------------------------------------------------------------------------
// C6 — a proxy a gyülekezeti aldomainen NEM futtat munkamenet-kezelőt
// ---------------------------------------------------------------------------
{
  const proxy = kommentNelkul(fs.readFileSync(SRC.proxy, 'utf8'))
  assert(/aldomainSlug\(/.test(proxy) && /NextResponse\.rewrite\(/.test(proxy), 'C6: a proxy a gazdagépnév alapján ÁTÍR (nem átirányít)')
  assert(
    proxy.indexOf('aldomainSlug(') < proxy.indexOf('updateSession(request)'),
    'C6b: az aldomain-ág ELŐBB fut — az updateSession a `/` útvonalat bejelentkezésre kötelezőnek hinné és a /login-ra dobná a látogatót',
  )

  const alk = kommentNelkul(fs.readFileSync(SRC.alkalmak, 'utf8'))
  assert(/loadPublicEvProgram\(/.test(alk), 'C6c: az Alkalmaink oldal a TELJES évet tölti be, nem a 90 napos ablakot')
  assert(/naptar\.ics/.test(alk), 'C6d: az éves program letölthető naptárfájlként is')
}

// ---------------------------------------------------------------------------
// C7 — a határidőnaplóból KIDERÜL, hogy egy alkalom nyilvános-e
// ---------------------------------------------------------------------------
{
  // ⚠️ EZ AZ, AMI ENDRÉT FÉLREVEZETTE: elmentette a vakációs bibliahetet, és a
  // weboldalon nem látta. A publikálás programonkénti, ALAPBÓL KIKAPCSOLT
  // jelölés — a listában viszont SEMMI nem mutatta, hogy egy alkalom ki
  // van-e téve. Így a hiányzó jelölés némán weboldal-hibának látszott.
  const kartya = kommentNelkul(
    fs.readFileSync(path.join(ROOT, 'apps/web/components/dashboard/program-agenda-card.tsx'), 'utf8'),
  )
  assert(/p\.publikus\s*&&/.test(kartya), 'C7: a határidőnapló listája jelzi, ha egy alkalom megjelenik a weboldalon')
  assert(/kt-public-chip/.test(kartya), 'C7b: a jelzésnek saját, felismerhető stílusa van')

  const css = fs.readFileSync(path.join(ROOT, 'packages/ui/src/kartoteka.css'), 'utf8')
  assert(/\.kt-public-chip\s*\{/.test(css), 'C7c: a stílus tényleg létezik (nem néma, láthatatlan elem)')

  // A szerkesztő-ablak kapcsolója kiírja, hogy a LEÍRÁS is kikerül — a
  // felhasználó ne utólag, a weboldalon szembesüljön a tágítással.
  const dialog = fs.readFileSync(path.join(ROOT, 'apps/web/components/modals/program-dialog.tsx'), 'utf8')
  const kapcsoloResz = dialog.slice(dialog.indexOf("register('publikus')") - 1600, dialog.indexOf("register('publikus')") + 1200)
  assert(/leírás/i.test(kapcsoloResz), 'C7d: a publikálás-kapcsoló kiírja, hogy a LEÍRÁS is nyilvánossá válik')
  assert(/megjegyzés/i.test(kapcsoloResz), 'C7e: …és azt is, hogy a megjegyzés NEM')
}

// ---------------------------------------------------------------------------
// C8 — az Alkalmaink oldal a sitemapbe is bekerül (MINDKÉT ágon)
// ---------------------------------------------------------------------------
{
  const sitemap = kommentNelkul(fs.readFileSync(path.join(ROOT, 'apps/web/app/sitemap.ts'), 'utf8'))
  const talalatok = (sitemap.match(/\/alkalmak/g) || []).length
  // ⚠️ KÉT ág van: az RPC-alapú és a migráció előtti tartalék. Ha csak az
  // egyikbe kerül bele, a kereső az oldalak felénél nem találja meg.
  assert(talalatok >= 2, `C8: az Alkalmaink oldal MINDKÉT sitemap-ágon szerepel (${talalatok} hivatkozás)`)
  assert(/alkalmak:\s*\{\s*changeFrequency/.test(sitemap), 'C8b: van hozzá gyakoriság/súly beállítás')
}

// C7n (negatív): a jelzés nélküli (óvilági) kártyán az őrszem BUKIK.
{
  const mutans = kommentNelkul(
    fs.readFileSync(path.join(ROOT, 'apps/web/components/dashboard/program-agenda-card.tsx'), 'utf8'),
  ).replace(/\{p\.publikus &&[\s\S]*?\)\}/, '')
  assert(!/kt-public-chip/.test(mutans), 'C7n: a jelzés nélküli kártyán a C7 őrszem BUKNA — nem vak')
}

console.log(`\n${total - failedCount}/${total} teszt zöld`)
process.exit(failedCount > 0 ? 1 : 0)
