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

/**
 * Azok a GRANT/REVOKE sorok, amelyek DO blokkon KÍVÜL nevesítenek egy
 * (esetleg nem létező) szerepkört.
 *
 * ⚠️ PONTOSAN CÉLZUNK: nem az EMLÍTÉS a baj — a pg_roles-lekérdezés és az
 * ellenőrző SELECT jogosan nevezi meg őket. A baj az, ha egy jogosultsági
 * utasítás KÖZVETLENÜL hivatkozik rájuk: az élesben 42704-gyel elszáll, és
 * minden utána következő utasítás elmarad. Pontosan ezen bukott el a
 * 2026-07-18-as migráció.
 *
 * Közös függvény, hogy az őrszem és a NEGATÍV mutánsa UGYANAZT a logikát
 * futtassa — különben a mutáns nem bizonyítana semmit.
 */
function szereplekSzivargasa(sql, szerepek) {
  const doBlokkNelkul = sql.replace(
    /DO \$[a-zA-Z_][a-zA-Z0-9_]*\$[\s\S]*?\$[a-zA-Z_][a-zA-Z0-9_]*\$;/g,
    '',
  )
  return doBlokkNelkul
    .split(String.fromCharCode(10))
    .filter(sor => /(GRANT|REVOKE)[ ]/.test(sor))
    .filter(sor => szerepek.some(sz => sor.includes(sz)))
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

  // ⚠️ A SORRENDET (weboldali érték > gyülekezeti tartalék) itt NEM az SQL
  // dönti el, hanem a betöltő — lásd a G2/G2b őrszemet. Ez SZÁNDÉKOS: élesben
  // három különböző úton érkezhet a weboldal-adat, és csak az alkalmazásban
  // van olyan pont, ahol mindhárom fölött ugyanaz a szabály érvényesül.
  const tartalekTorzs = fuggvenyTorzs(sql, 'congregation_fallback')
  assert(tartalekTorzs.includes('public.public_sites'), 'C1d-elo: a tartalék-RPC törzsének kivágása sikerült')

  // Az ÜRES SZÖVEG nem érték: a „mentettem, mégsem látszik" tünet tipikusan
  // üres stringből jön. Az RPC ezért csak nem üres értéket ad vissza.
  const nullifDb = (tartalekTorzs.match(/NULLIF\(pg_catalog\.btrim\(/g) || []).length
  assert(nullifDb >= 4, `C1e: a tartalék-RPC csak NEM ÜRES értéket ad vissza (${nullifDb} NULLIF(btrim(…)))`)

  // A kapu ugyanaz, mint a weboldalé — nem publikált oldal adata nem szivároghat ki.
  assert(
    /ps\.is_published = true/.test(tartalekTorzs) &&
      /c\.status = 'active'/.test(tartalekTorzs) &&
      /c\.public_site_enabled = true/.test(tartalekTorzs),
    'C1f: a tartalék-RPC ugyanazt a kaput használja, mint a weboldal (publikált + aktív + engedélyezett)',
  )
  assert(
    /SET search_path = ''/.test(sql),
    'C1g: a SECURITY DEFINER függvények üres search_path-tal futnak (nincs útvonal-alapú eszkaláció)',
  )
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

// ---------------------------------------------------------------------------
// F1–F5 — a migráció ÖNHORDÓ és SZEREP-TOLERÁNS
//
// ⛔ MI TÖRTÉNT: az első kiadás élesben elhasalt a SAJÁT előfeltétel-őrén:
//    „a public_site_private.public_site_context_v2(text) nem létezik".
//    A projekt migrációs naplója szerint sem a 2026-07-17-es, sem a
//    2026-07-18-as publikus-oldal lánc nem futott le — az élő rendszer a
//    közvetlen táblaolvasás ágán fut. Az őr olyat követelt, ami a
//    működéshez nem is kellett.
// ---------------------------------------------------------------------------
const MIGRACIO = path.join(ROOT, 'migration-docs/sql/2026-08-27-gyulekezeti-oldal-naptar-cimer.sql')

/** Az előfeltétel-őr DO blokkjának törzse. */
function elofeltetelTorzs(sql) {
  return fuggvenyTorzs(sql, 'elofeltetel')
}

{
  const sql = sqlKommentNelkul(fs.readFileSync(MIGRACIO, 'utf8'))
  const elofeltetel = elofeltetelTorzs(sql)

  assert(elofeltetel.includes('public_sites'), 'F1-elo: az előfeltétel-őr törzsének kivágása sikerült')
  assert(
    !/public_site_context/.test(elofeltetel),
    'F1: az előfeltétel-őr NEM követel kontextus-RPC-t (élesben egyik sem létezik — ezen hasalt el az 1. kiadás)',
  )
  assert(
    !/public_site_private/.test(elofeltetel),
    'F1b: az előfeltétel-őr a belső sémát sem követeli meg',
  )

  // Amit VISZONT meg KELL követelnie — ezek nélkül némán rossz eredményt adna.
  for (const kell of ['public_sites', 'congregations', 'cimer_url', 'publikus', 'show_events']) {
    assert(elofeltetel.includes(kell), `F1c: az őr ellenőrzi a(z) \`${kell}\` meglétét`)
  }
}

// F1n (negatív): az „óvilági" előfeltétellel az őrszem BUKIK.
// ⚠️ A régi világot a MAI forrásból állítjuk elő — `git show HEAD:` alapú
// asszert a saját commitjától bukna meg (2026-08-23-i hibaosztály).
{
  const sql = sqlKommentNelkul(fs.readFileSync(MIGRACIO, 'utf8'))
  const ovilagi = sql.replace(
    "IF to_regclass('public.public_sites') IS NULL THEN",
    "IF to_regprocedure('public_site_private.public_site_context_v2(text)') IS NULL THEN\n    RAISE EXCEPTION 'nem letezik';\n  END IF;\n  IF to_regclass('public.public_sites') IS NULL THEN",
  )
  assert(
    /public_site_context/.test(elofeltetelTorzs(ovilagi)),
    'F1n: az óvilági (kontextus-RPC-t követelő) előfeltétellel az F1 őrszem BUKNA — nem vak',
  )
}

// F2 — SZEREP-TOLERANCIA. Ezen bukott el a 2026-07-18-as migráció (42704).
{
  const sql = sqlKommentNelkul(fs.readFileSync(MIGRACIO, 'utf8'))
  const nemLetezoSzerepek = ['app_staff_user', 'app_pending_user', 'member_portal_user']

  // ⚠️ PONTOSAN CÉLZUNK: nem az EMLÍTÉS a baj (a pg_roles-lekérdezés és az
  // ellenőrző SELECT jogosan nevezi meg őket), hanem ha egy GRANT vagy REVOKE
  // utasítás közvetlenül rájuk hivatkozik pg_roles-őr nélkül — az élesben
  // 42704-gyel elszáll, és MINDEN utána következő utasítás elmarad.
  // Pontosan ezen bukott el a 2026-07-18-as migráció.
  const szivargas = szereplekSzivargasa(sql, nemLetezoSzerepek)
  assert(
    szivargas.length === 0,
    `F2: DO blokkon KÍVÜL nincs olyan GRANT/REVOKE, ami nem létező szerepkört nevez meg (${szivargas.length} ilyen sor)`,
  )

  const aclBlokk = fuggvenyTorzs(sql, 'jogosultsagok')
  assert(/pg_roles/.test(aclBlokk), 'F2b: az ACL-blokk tényleg ellenőrzi a szerepkörök létezését')

  // ⚠️ Üres szereplistából `FROM PUBLIC, ` (vesszőre végződő) hibás SQL lenne.
  // A `PUBLIC` ezért a lista ELSŐ, mindig meglévő eleme.
  assert(
    /v_letezo text\[\] := ARRAY\['PUBLIC'\]/.test(aclBlokk),
    'F2c: a szereplista SOSEM lehet üres (a PUBLIC mindig benne van) — nincs vesszőre végződő REVOKE',
  )
  assert(
    !/FROM PUBLIC, %s/.test(aclBlokk),
    'F2d: nincs olyan format-minta, ami üres listánál vesszőre végződne',
  )
}

// F2n (negatív): szerep-ellenőrzés nélküli ACL-lel az őrszem BUKIK.
{
  const mutans = sqlKommentNelkul(fs.readFileSync(MIGRACIO, 'utf8')).replace(
    /DO \$jogosultsagok\$[\s\S]*?\$jogosultsagok\$;/,
    "GRANT EXECUTE ON FUNCTION public.public_site_events_v2(text, integer) TO anon, app_staff_user;",
  )
  // ⚠️ Az őrszem SAJÁT LOGIKÁJÁT futtatjuk a mutánson — nem csak azt nézzük,
  // hogy a szöveg tartalmazza-e a szerepnevet. Egy mutáns, ami nem a valódi
  // ellenőrzést gyakorolja, semmit nem bizonyít.
  const mutansSzivargas = szereplekSzivargasa(mutans, [
    'app_staff_user',
    'app_pending_user',
    'member_portal_user',
  ])
  assert(
    mutansSzivargas.length > 0,
    `F2n: a szerep-ellenőrzés nélküli ACL-en az F2 őrszem TÉNYLEG megbukna (${mutansSzivargas.length} talált sor) — nem vak`,
  )
}

// F3 — a migráció NEM nyúl hozzá működő éles kontextus-függvényhez
{
  const sql = sqlKommentNelkul(fs.readFileSync(MIGRACIO, 'utf8'))
  assert(
    !/CREATE OR REPLACE FUNCTION[\s\S]{0,80}public_site_context/.test(sql),
    'F3: a migráció NEM ír felül kontextus-függvényt — önhordó, új RPC-t ad helyette',
  )
  assert(
    /public_site_congregation_fallback/.test(sql),
    'F3b: …és ez az önhordó tartalék-RPC tényleg létrejön',
  )
  assert(
    /public_sites\s+ADD COLUMN IF NOT EXISTS service_times/.test(sql.replace(/\s+/g, ' ')),
    'F3c: a service_times oszlop is létrejön (ettől látszik a „Rendszeres alkalmak" szerkesztő)',
  )
}

// ---------------------------------------------------------------------------
// F4 — a KAPUK egyetlen eredményhalmazban, a fájl UTOLSÓ utasításaként
//
// ⚠️ HIBAOSZTÁLY: a Supabase SQL editor egy szkriptből CSAK AZ UTOLSÓ, sorokat
//    visszaadó utasítás rácsát mutatja (a projekt saját tapasztalata,
//    docs/CHANGELOG.md: „Studio »Run« csak az utolsó…"). Ha a kapuk külön
//    SELECT-ek lennének, a `❌`-ek NEM látszanának — előállna a „lefutott, nem
//    hibázott" hamis jelentés. Ez a ház bevett mintája (UNION ALL riport-blokk),
//    a `selftest:sql-union` őrszem is ezt a formát védi.
// ---------------------------------------------------------------------------
{
  const nyers = fs.readFileSync(MIGRACIO, 'utf8')
  const sql = sqlKommentNelkul(nyers)

  // Hány önálló, sorokat visszaadó SELECT áll a fájlban? (A DO blokkokon és
  // az al-lekérdezéseken kívül — azokat a sorkezdő SELECT szűri ki.)
  const felsoSzintuSelectek = (sql.match(/^SELECT /gm) || []).length
  assert(
    felsoSzintuSelectek === 1,
    `F4: a migráció EGYETLEN felső szintű SELECT-tel zárul (${felsoSzintuSelectek} db) — különben a kapuk nem látszanának`,
  )

  // …és ez tényleg az UTOLSÓ utasítás.
  // ⚠️ Nem `split(';')`-tel: egy SQL sztringben is állhat pontosvessző, attól a
  // naiv darabolás félrevágna. A fájl VÉGÉT nézzük.
  assert(
    /SELECT lepes, eredmeny FROM \([\s\S]*\) AS kapuk\s*ORDER BY lepes;\s*$/.test(sql),
    'F4b: a kapu-blokk a fájl UTOLSÓ utasítása (ezt látja a Supabase editor)',
  )
  assert((sql.match(/UNION ALL/g) || []).length >= 6, 'F4c: mind a hét kapu egy UNION ALL blokkban áll')

  // A tájékoztató listák KÜLÖN fájlban — a kapuk elé nem kerülhetnek.
  const listak = path.join(ROOT, 'migration-docs/sql/2026-08-27-gyulekezeti-oldal-ELLENORZO-listak.sql')
  assert(fs.existsSync(listak), 'F4d: a tájékoztató listák külön fájlban élnek')

  // ⚠️ A CROSS JOIN LATERAL pont a BUKÓ sorokat tüntetné el (a függvény 0 sort
  //    ad, ha a kapu zárva) — vagyis a diagnosztika épp ott vakulna meg, ahol
  //    a legfontosabb lenne.
  const listakSzoveg = sqlKommentNelkul(fs.readFileSync(listak, 'utf8'))
  assert(
    !/CROSS JOIN LATERAL/.test(listakSzoveg) && /LEFT JOIN LATERAL/.test(listakSzoveg),
    'F4e: a listák LEFT JOIN LATERAL-t használnak — a CROSS JOIN elrejtené a bukó eseteket',
  )
}

// F4n (negatív): CROSS JOIN LATERAL-lal az őrszem BUKIK.
{
  const mutans = sqlKommentNelkul(
    fs.readFileSync(path.join(ROOT, 'migration-docs/sql/2026-08-27-gyulekezeti-oldal-ELLENORZO-listak.sql'), 'utf8'),
  ).replace(/LEFT JOIN LATERAL/g, 'CROSS JOIN LATERAL')
  assert(/CROSS JOIN LATERAL/.test(mutans), 'F4n: a bukó sorokat elrejtő változaton az F4e őrszem BUKNA — nem vak')
}

// F5 — az előfeltétel-őr MINDEN hivatkozott oszlopot ellenőriz (fail-closed)
{
  const sql = sqlKommentNelkul(fs.readFileSync(MIGRACIO, 'utf8'))
  const elofeltetel = fuggvenyTorzs(sql, 'elofeltetel')

  // ⚠️ Egy `LANGUAGE sql` függvény törzsét a CREATE MÁR feloldja: hiányzó
  // oszlopnál OTT szállna el, zavaros hibával és félkész állapotot hagyva.
  const tartalekMezok = ['email', 'telefon', 'cim', 'hazszam', 'iranyitoszam', 'varos', 'megye']
  const hianyzok = tartalekMezok.filter(m => !new RegExp(`'${m}'`).test(elofeltetel))
  assert(
    hianyzok.length === 0,
    `F5: az őr a tartalék-RPC MINDEN gyülekezeti mezőjét ellenőrzi (hiányzik: ${hianyzok.join(', ') || 'egy sem'})`,
  )
  assert(/'leiras'/.test(elofeltetel), 'F5b: …és a gyulekezeti_programok.leiras oszlopot is')
  assert(/data_type/.test(elofeltetel), 'F5c: …és a service_times TÍPUSÁT is (az ADD COLUMN IF NOT EXISTS nem nézi)')
}

// ---------------------------------------------------------------------------
// G1–G4 — az app-oldali tartalék MINDHÁROM betöltési ág fölött hat
// ---------------------------------------------------------------------------
{
  const loader = kommentNelkul(fs.readFileSync(path.join(ROOT, 'apps/web/lib/public-site/site-loader.ts'), 'utf8'))

  assert(/public_site_congregation_fallback/.test(loader), 'G1: a betöltő lekéri a gyülekezeti tartalékot')

  // ⚠️ A weboldalon MEGADOTT érték mindig erősebb — a tartalék nem írhat felül.
  assert(
    /nemUres\(site\.contact_email\) \?\? tartalek/.test(loader),
    'G2: a weboldalon megadott érték ERŐSEBB a gyülekezeti tartaléknál',
  )
  assert(
    /safePublicHttpsUrl\(site\.crest_image_url\) \?\?/.test(loader),
    'G2b: ugyanez a címernél',
  )
  assert(/function nemUres/.test(loader), 'G2c: az ÜRES SZÖVEG is tartalékot vált ki, nem csak a hiányzó érték')

  // ⚠️ EZ AZ AZ ÁG, AMI MA ÉLESBEN FUT (a _RUN_LOG szerint egyik kontextus-RPC
  // sem létezik): a közvetlen táblaolvasás. Ha az nem kéri le a service_times-t,
  // a szerkesztő megjelenne, de az oldal továbbra sem mutatna menetrendet.
  assert(
    /PUBLIC_SITE_SAFE_COLUMNS\}, service_times/.test(loader),
    'G3: a közvetlen (átmeneti) olvasási ág is lekéri a service_times-t',
  )
  assert(
    /isMissingServiceTimesColumn/.test(loader),
    'G3b: …és hiányzó oszlopnál kecsesen visszaesik (a migráció előtt sem törik el az oldal)',
  )
}

// G4n (negatív): ha a tartalék FELÜLÍRNÁ a weboldali értéket, a G2 őrszem BUKIK.
{
  const mutans = kommentNelkul(
    fs.readFileSync(path.join(ROOT, 'apps/web/lib/public-site/site-loader.ts'), 'utf8'),
  ).replace(
    'nemUres(site.contact_email) ?? tartalek?.contact_email ?? null',
    'tartalek?.contact_email ?? nemUres(site.contact_email) ?? null',
  )
  assert(
    !/nemUres\(site\.contact_email\) \?\? tartalek/.test(mutans),
    'G4n: a tartalékot előre soroló (hibás) változaton a G2 őrszem BUKNA — nem vak',
  )
}

// ---------------------------------------------------------------------------
// H1–H5 — AMIT PUBLIKÁLUNK, AZT KI IS LEHET TÖLTENI
//
// ⛔ MI VOLT A HIBA (Endre képernyőképpel jelezte 2026-08-27-én): a program-
//    rögzítő űrlapon CSAK „Megjegyzés" volt, „Leírás" nem. A nyilvános naptár
//    viszont a `leiras` oszlopot publikálja — amit a webes felület SOHA nem
//    írt (nem volt se a Program típusban, se a zod sémában, se a mentésben).
//    Vagyis azt a mezőt tettük közzé, amit senki nem tudott kitölteni: a
//    „leírással együtt" kérés némán ÜRES eredményt adott volna.
//
//    HIBAOSZTÁLY: ha egy funkció EGY mezőt olvas és egy MÁSIKAT ír, a hiba
//    néma — minden réteg külön-külön helyesnek látszik.
// ---------------------------------------------------------------------------
{
  const tipus = kommentNelkul(fs.readFileSync(path.join(ROOT, 'apps/web/lib/constants/dashboard.ts'), 'utf8'))
  const sema = kommentNelkul(fs.readFileSync(path.join(ROOT, 'apps/web/lib/validations/dashboard.ts'), 'utf8'))
  const mentes = kommentNelkul(fs.readFileSync(path.join(ROOT, 'apps/web/app/(dashboard)/programs/actions.ts'), 'utf8'))
  const dialogus = kommentNelkul(fs.readFileSync(path.join(ROOT, 'apps/web/components/modals/program-dialog.tsx'), 'utf8'))

  // A LÁNC MIND A NÉGY SZEME. Bármelyik hiánya némán elnyeli a leírást.
  assert(/leiras\?:\s*string \| null/.test(tipus), 'H1: a `leiras` szerepel a Program típusban')
  assert(/leiras:\s*z\.string\(\)/.test(sema), 'H1b: …a séma-ellenőrzésben is')
  assert(/leiras:\s*d\.leiras/.test(mentes), 'H1c: …a MENTÉS tényleg ki is írja az adatbázisba')
  assert(/register\('leiras'\)/.test(dialogus), 'H1d: …és az űrlapon VAN hozzá beviteli mező')

  // ⚠️ EZ A LÉNYEGI INVARIÁNS: az a mező, amit az űrlap ÍR, ugyanaz legyen,
  //    amit a nyilvános RPC PUBLIKÁL. Pontosan ez csúszott szét.
  const migracio = sqlKommentNelkul(fs.readFileSync(MIGRACIO, 'utf8'))
  const rpcTorzs = fuggvenyTorzs(migracio, 'public_site_events_v2')
  const publikaltMezo = /gp\.(\w+)::text\)[\s\S]{0,24}?AS leiras/.exec(rpcTorzs)?.[1]
  assert(
    publikaltMezo === 'leiras',
    `H2: a PUBLIKÁLT mező azonos az ŰRLAP által ÍRT mezővel (publikált: ${publikaltMezo || 'ismeretlen'})`,
  )

  // A belső jegyzet a lánc EGYETLEN pontján sem válhat nyilvánossá.
  assert(!/gp\.megjegyzes/.test(rpcTorzs), 'H3: a `megjegyzes` továbbra sem megy ki')
  assert(
    /Megjegyzés \(belső\)/.test(dialogus),
    'H3b: az űrlap KIMONDJA, hogy a megjegyzés belső — a két mező szerepe ne legyen találgatás kérdése',
  )

  // A sablonok nyilvános ismertetőt is adjanak — enélkül minden alkalomhoz
  // kézzel kellene szöveget írni, és a naptár csak címeket sorolna.
  const sablonok = fs.readFileSync(path.join(ROOT, 'apps/web/lib/constants/program-sablonok.ts'), 'utf8')
  // ⚠️ Csak a tényleges bejegyzéseket számoljuk: a `kulcs:` / `nyilvanos_leiras:`
  // a TÍPUSDEFINÍCIÓBAN is szerepel, érték nélkül. Az idézőjeles alak szűr.
  const sablonDb = (sablonok.match(/kulcs: '/g) || []).length
  const nyilvanosDb = (sablonok.match(/nyilvanos_leiras: '/g) || []).length
  assert(
    sablonDb > 0 && nyilvanosDb === sablonDb,
    `H4: MINDEN sablonnak van nyilvános ismertetője (${nyilvanosDb}/${sablonDb})`,
  )
  assert(/setValue\('leiras', sablon\.nyilvanos_leiras\)/.test(dialogus), 'H4b: …és a sablon-gomb elő is tölti vele a Leírás mezőt')
}

// H5n (negatív): ha a mentésből kimarad a `leiras`, a H1c őrszem BUKIK.
{
  const mutans = kommentNelkul(
    fs.readFileSync(path.join(ROOT, 'apps/web/app/(dashboard)/programs/actions.ts'), 'utf8'),
  ).replace(/\s*leiras: d\.leiras[^\n]*\n/, '\n')
  assert(
    !/leiras:\s*d\.leiras/.test(mutans),
    'H5n: a `leiras`-t nem mentő (óvilági) változaton a H1c őrszem BUKNA — nem vak',
  )
}

// H6n (negatív): ha az RPC a `megjegyzes`-t publikálná a `leiras` helyett,
//   a H2 invariáns-őr BUKIK — tehát tényleg a MEZŐ-AZONOSSÁGOT méri.
{
  // A valós alak: `NULLIF(pg_catalog.btrim(gp.leiras::text), '') AS leiras`
  const eredeti = sqlKommentNelkul(fs.readFileSync(MIGRACIO, 'utf8'))
  const mutans = eredeti.replace('gp.leiras::text', 'gp.megjegyzes::text')
  assert(mutans !== eredeti, 'H6n-elo: a mutáció ténylegesen megtörtént (nem üres cserén állítunk)')
  const rpcTorzs = fuggvenyTorzs(mutans, 'public_site_events_v2')
  const publikaltMezo = /gp\.(\w+)::text\)[\s\S]{0,24}?AS leiras/.exec(rpcTorzs)?.[1]
  assert(
    publikaltMezo === 'megjegyzes',
    'H6n: a rossz mezőt publikáló változaton a H2 őrszem BUKNA — nem vak',
  )
}

// ---------------------------------------------------------------------------
// I1–I4 — A KÉT KAPCSOLÓ CSAPDÁJA
//
// ⛔ MI VOLT A HIBA (Endre jelezte 2026-08-27-én, a deploy után):
//    „a rögzített program nem jelent meg a weboldalon". A programon BE volt
//    kapcsolva a „Megjelenhet a gyülekezet weboldalán" — csakhogy KÉT kapcsoló
//    kell: a weboldalon külön be kell kapcsolni a „Közelgő események" szekciót
//    is (`public_sites.show_events`), és az ALAPBÓL KI VAN KAPCSOLVA.
//    A program-ablak kapcsolója tehát olyat ígért, amit egy másik, LÁTHATATLAN
//    kapcsoló megvétózott: a felhasználó mentett, és nem történt semmi.
//
//    HIBAOSZTÁLY: ha egy kapcsoló ígér valamit, de egy MÁSIK, máshol lakó
//    kapcsoló felülbírálhatja, a hiba néma és szoftverhibának látszik.
// ---------------------------------------------------------------------------
{
  const dialogus = kommentNelkul(fs.readFileSync(path.join(ROOT, 'apps/web/components/modals/program-dialog.tsx'), 'utf8'))
  const actions = kommentNelkul(fs.readFileSync(path.join(ROOT, 'apps/web/app/(dashboard)/programs/actions.ts'), 'utf8'))
  const adminUrlap = kommentNelkul(
    fs.readFileSync(path.join(ROOT, 'apps/web/components/admin/public-site/public-site-settings-form.tsx'), 'utf8'),
  )

  assert(/getWeboldalEsemenyKapu/.test(actions), 'I1: van lekérdezés a weboldal esemény-kapujára')
  assert(/getWeboldalEsemenyKapu\(\)/.test(dialogus), 'I1b: …és a program-ablak meg is kérdezi')
  assert(/show_events/.test(actions), 'I1c: …a `show_events` kapcsolót nézi')

  // ⚠️ CSAK BIZONYOSSÁG ESETÉN FIGYELMEZTETÜNK. A `null` (nem tudjuk) NEM
  // válthat ki riasztást: a hamis riasztás rosszabb a hallgatásnál, mert
  // elszoktat a figyelmeztetések olvasásától.
  assert(
    /esemenyKapu && !esemenyKapu\.esemenyekBekapcsolva/.test(dialogus),
    'I2: a figyelmeztetés CSAK akkor jelenik meg, ha biztosan zárva a kapu (a `null` nem ijesztget)',
  )
  assert(
    /publikusBe && esemenyKapu/.test(dialogus),
    'I2b: …és csak akkor, ha a felhasználó tényleg ki akarja tenni az alkalmat',
  )
  assert(/publikus-oldal\/beallitasok/.test(dialogus), 'I2c: a figyelmeztetés MEGMONDJA, hol a másik kapcsoló')
  assert(/catch/.test(actions.slice(actions.indexOf('getWeboldalEsemenyKapu'))), 'I2d: a lekérdezés hibája nem dönti el a program-ablakot')

  // Az admin súgója ne mondjon valótlant: a leírás MOSTANTÓL kikerül.
  const esemenyKapcsoloResz = adminUrlap.slice(
    adminUrlap.indexOf('Közelgő események'),
    adminUrlap.indexOf('Közelgő események') + 1200,
  )
  assert(
    !/a leírás és a megjegyzés sosem kerül ki/.test(esemenyKapcsoloResz),
    'I3: az admin súgója NEM állítja többé, hogy a leírás nem kerül ki (Endre kérésére kimegy)',
  )
  assert(
    /EGYETLEN alkalom sem jelenik meg/.test(esemenyKapcsoloResz),
    'I3b: …és kimondja, hogy kikapcsolva SEMMI nem látszik, a programonkénti pipától függetlenül',
  )
}

// I4n (negatív): ha a figyelmeztetés a `null` (nem tudjuk) állapotra is
//   megjelenne, az I2 őrszem BUKIK — tehát tényleg a bizonyosságot méri.
{
  const mutans = kommentNelkul(
    fs.readFileSync(path.join(ROOT, 'apps/web/components/modals/program-dialog.tsx'), 'utf8'),
  ).replace('esemenyKapu && !esemenyKapu.esemenyekBekapcsolva', '!esemenyKapu?.esemenyekBekapcsolva')
  assert(
    !/esemenyKapu && !esemenyKapu\.esemenyekBekapcsolva/.test(mutans),
    'I4n: a bizonytalanságra is riasztó változaton az I2 őrszem BUKNA — nem vak',
  )
}

// ---------------------------------------------------------------------------
// J1–J5 — KÉTNYELVŰ ELÉRHETŐSÉG, KITALÁLT FORDÍTÁS NÉLKÜL
//
// Endre kérése: „az elérhetőségek az a gyülekezet román és magyar
// megnevezése, a pontos cím két nyelven, a gyülekezeti e-mail és
// telefonszám" + „lehet-e esetleg az egyházmegyét és a kerületet is".
//
// ⚠️ AZ ÉLES FELMÉRÉS SZERINT az egyházmegye és az egyházkerület ROMÁN neve
//    NINCS kitöltve. Egy hivatalos egyházi megnevezésnek pontos alakja van —
//    a kitalált fordítás rosszabb a hiánynál. Ezért a hiányzó nyelvnél a
//    meglévő áll EGYEDÜL, jelölés nélkül.
// ---------------------------------------------------------------------------
{
  // ⚠️ A SHARED modul FÜGGŐSÉG NÉLKÜLI — pont ezért van külön fájlban:
  // a betöltő `server-only` Supabase-klienst importál, és ha a megjelenítő
  // onnan venné a típust, a build elszállna („You're importing a module that
  // depends on server-only"). Ezt a szétválasztást a J5e őrszem is méri.
  const forras = fs.readFileSync(path.join(ROOT, 'apps/web/lib/public-site/identitas-shared.ts'), 'utf8')
  assert(
    !/^import /m.test(forras),
    'J1-elo: a shared modulnak NINCS importja (különben visszakerülne a server-only függés)',
  )
  const modul = betolt('identitas', forras)
  const k = modul.ketNyelvenMegjelenitve

  const ketto = k('Barátosi Református Egyházközség', 'Parohia Reformata Brates')
  assert(
    ketto?.elsodleges === 'Barátosi Református Egyházközség' &&
      ketto?.masodlagos === 'Parohia Reformata Brates',
    'J1: ha mindkét nyelv megvan és eltér, MINDKETTŐ látszik',
  )

  const csakHu = k('Kézdi-Orbai Református Egyházmegye', null)
  assert(
    csakHu?.elsodleges === 'Kézdi-Orbai Református Egyházmegye' && csakHu?.masodlagos === null,
    'J2: hiányzó román névnél a magyar áll EGYEDÜL — nem találunk ki fordítást',
  )
  const csakRo = k(null, 'Protopopiatul X')
  assert(csakRo?.elsodleges === 'Protopopiatul X' && csakRo?.masodlagos === null, 'J2b: fordítva ugyanígy')

  const azonos = k('Ugyanaz', 'Ugyanaz')
  assert(
    azonos?.elsodleges === 'Ugyanaz' && azonos?.masodlagos === null,
    'J3: azonos szövegnél NEM ismételjük meg kétszer',
  )
  assert(k(null, null) === null, 'J3b: ha egyik sincs, a sor el is marad (nem írunk „hiányzik"-ot)')

  // A felület a hiányt SOHA nem nevezi meg — egy gyülekezet hivatalos oldalán
  // a hiány nem hibaüzenet.
  const panel = kommentNelkul(
    fs.readFileSync(path.join(ROOT, 'apps/web/components/public/public-service-times.tsx'), 'utf8'),
  )
  assert(!/hiányzik|nincs megadva|ismeretlen/i.test(panel), 'J3c: a panel nem ír ki hiány-feliratot a látogatónak')
}

// J4 — az RPC nem ejt ki sorokat, és nem talál ki fordítást
{
  const MIG2 = path.join(ROOT, 'migration-docs/sql/2026-08-27-gyulekezeti-oldal-ketnyelvu-elerhetoseg.sql')
  assert(fs.existsSync(MIG2), 'J4-elo: a kétnyelvű migráció létezik')
  const sql = sqlKommentNelkul(fs.readFileSync(MIG2, 'utf8'))
  const torzs = fuggvenyTorzs(sql, 'public_site_identitas')

  // ⚠️ MIND LEFT JOIN: egy hiányzó egyházmegye vagy cím-törzs kötés NEM
  //    ejtheti ki az EGÉSZ sort — akkor a név és az e-mail is eltűnne, némán.
  const belsoJoinok = (torzs.match(/\n\s+JOIN /g) || []).length
  assert(
    belsoJoinok === 1,
    `J4: csak a congregations kötés BELSŐ JOIN, a többi LEFT (${belsoJoinok} belső join)`,
  )
  for (const t of ['dioceses', 'districts', 'adrlocality', 'adrcounty']) {
    assert(
      new RegExp(`LEFT JOIN public\\.${t}`).test(torzs),
      `J4b: a(z) ${t} LEFT JOIN — hiánya nem tünteti el az egész blokkot`,
    )
  }
  assert(
    /c\.status = 'active'/.test(torzs) && /ps\.is_published = true/.test(torzs),
    'J4c: ugyanaz a kapu, mint a weboldalé',
  )
  assert(/SET search_path = ''/.test(sql), 'J4d: a SECURITY DEFINER függvény üres search_path-tal fut')

  // Szerep-tolerancia + a kapuk egyetlen, utolsó lekérdezésben (a ház mintája).
  assert(
    szereplekSzivargasa(sql, ['app_staff_user', 'app_pending_user', 'member_portal_user']).length === 0,
    'J4e: nincs DO blokkon kívüli GRANT/REVOKE nem létező szerepkörre',
  )
  assert(
    /SELECT lepes, eredmeny FROM \([\s\S]*\) AS kapuk\s*ORDER BY lepes;\s*$/.test(sql),
    'J4f: a kapuk egyetlen UNION ALL blokkban, a fájl UTOLSÓ utasításaként állnak',
  )
  assert(/NOTIFY pgrst/.test(sql), 'J4g: a PostgREST séma-gyorsítótára újratöltődik')
}

// J5 — a felület tényleg használja is
{
  const panel = kommentNelkul(
    fs.readFileSync(path.join(ROOT, 'apps/web/components/public/public-service-times.tsx'), 'utf8'),
  )
  const kezdolap = kommentNelkul(fs.readFileSync(SRC.home, 'utf8'))
  const alkalmak = kommentNelkul(fs.readFileSync(SRC.alkalmak, 'utf8'))

  assert(/ketNyelvenMegjelenitve/.test(panel), 'J5: a panel a kétnyelvű megjelenítőt használja')
  assert(/egyhazmegye/.test(panel) && /egyhazkerulet/.test(panel), 'J5b: az egyházmegye és a kerület is megjelenik (Endre kérése)')
  assert(
    /<PublicServiceTimes[^>]*identitas=/.test(kezdolap) && /<PublicServiceTimes[^>]*identitas=/.test(alkalmak),
    'J5c: MINDKÉT oldal át is adja az adatot (a prop nem marad kihasználatlan)',
  )
  // A térkép a ROMÁN címre keres: a Google Maps a hivatalos helységnevet ismeri.
  assert(/buildMapSearchUrl\(identitas\?\.cim_ro/.test(panel), 'J5d: a térkép-link a hivatalos (román) címre mutat')
  // ⚠️ A megjelenítő SOHA ne a szerver-oldali betöltőből importáljon: az
  // `server-only` klienst húzna be, és a build elszállna.
  assert(
    /identitas-shared/.test(panel) && !/identitas-loader/.test(panel),
    'J5e: a megjelenítő a FÜGGŐSÉG NÉLKÜLI shared modulból importál, nem a szerver-betöltőből',
  )
}

// J5n (negatív): ha a hiányzó nyelvet „hiányzik" felirattal pótolnánk,
//   a J3c őrszem BUKIK.
{
  const mutans = kommentNelkul(
    fs.readFileSync(path.join(ROOT, 'apps/web/components/public/public-service-times.tsx'), 'utf8'),
  ).replace('{nev.masodlagos}', "{nev.masodlagos || '(román név hiányzik)'}")
  assert(/hiányzik/i.test(mutans), 'J5n: a hiányt kiíró változaton a J3c őrszem BUKNA — nem vak')
}

// ---------------------------------------------------------------------------
// K1–K3 — A FÉLIG ELLENŐRZÖTT KAPU
//
// ⛔ MI TÖRTÉNT: a kétnyelvű felmérés ÍTÉLET-sora „✅ teljes"-t jelentett a
//    címre, holott CSAK a `name_ro`-t nézte — a MAGYAR településnév hiányzott,
//    és a magyar cím a román alakra esett vissza. Élesben ez úgy jelent meg,
//    hogy a „magyar" cím is románul mutatta a települést.
//
//    HIBAOSZTÁLY: a félig ellenőrzött kapu ROSSZABB a nyitottnál — hamis
//    biztonságot ad, és a rá épülő döntés is hibás lesz.
// ---------------------------------------------------------------------------
{
  const felmero = sqlKommentNelkul(
    fs.readFileSync(
      path.join(ROOT, 'migration-docs/sql/2026-08-27-ALLAPOTFELMERES-ketnyelvu-elerhetoseg.sql'),
      'utf8',
    ),
  )
  const itelet = felmero.slice(felmero.indexOf('ÍTÉLET'))
  const hianyzoEllenorzes = ['loc.name_hu', 'loc.name_ro', 'cnty.name_hu', 'cnty.name_ro'].filter(
    mezo => !itelet.includes(mezo),
  )
  assert(
    hianyzoEllenorzes.length === 0,
    `K1: a felmérés ÍTÉLET-e MINDKÉT nyelvet nézi, mindkét szinten (hiányzik: ${hianyzoEllenorzes.join(', ') || 'egy sem'})`,
  )
  assert(
    /hiányzik a MAGYAR/.test(itelet),
    'K1b: …és MEGMONDJA, melyik nyelv hiányzik — nem csak annyit, hogy „hiányos"',
  )

  // A FELMÉRŐ segédlet semmilyen nevet nem ír be magától — az csak megmutatja,
  // hol a hiány. (A kitöltés külön, INDOKOLT fájlban él, lásd K2c.)
  const potlas = path.join(ROOT, 'migration-docs/sql/2026-08-27-magyar-telepulesnevek-potlasa.sql')
  assert(fs.existsSync(potlas), 'K2: van felmérő segédlet a hiányzó magyar településnevekhez')
  const aktivUpdate = fs
    .readFileSync(potlas, 'utf8')
    .split(String.fromCharCode(10))
    .filter(sor => /^\s*UPDATE /.test(sor))
  assert(
    aktivUpdate.length === 0,
    `K2b: a FELMÉRŐ fájlban nincs aktív UPDATE — az csak diagnosztizál (${aktivUpdate.length} aktív)`,
  )

  // ⚠️ A KITÖLTŐ fájl viszont ír — ezért SZIGORÚBB feltételeknek kell megfelelnie.
  //    Az `adrlocality` ORSZÁGOS törzstábla: egy elszaladt UPDATE minden
  //    gyülekezetet érintene, amelyik ahhoz a településhez van kötve.
  const kitoltve = path.join(ROOT, 'migration-docs/sql/2026-08-27-magyar-telepulesnevek-KITOLTVE.sql')
  if (fs.existsSync(kitoltve)) {
    const szoveg = fs.readFileSync(kitoltve, 'utf8')
    assert(
      /AND NULLIF\(btrim\(l\.name_hu\), ''\) IS NULL/.test(szoveg),
      'K2c: a kitöltő UPDATE MÁR KITÖLTÖTT nevet nem írhat felül',
    )
    assert(
      /RAISE EXCEPTION/.test(szoveg) && /az azonosítók elcsúsztak/.test(szoveg),
      'K2d: …és fail-closed őre van arra, ha a törzsbeli azonosítók elcsúsznak',
    )
    // Minden beírt névhez tartozzon INDOKLÁS a fájl fejlécében — a forrás a
    // felhasználó által felvitt gyülekezeti név, nem külső tudás.
    const nevek = [...szoveg.matchAll(/\(\d+, '([^']+)'\)/g)].map(m => m[1])
    const indoklasNelkul = nevek.filter(n => !new RegExp(`→ ${n}\\b`).test(szoveg))
    assert(
      nevek.length > 0 && indoklasNelkul.length === 0,
      `K2e: MINDEN beírt névhez van forrás-indoklás a fejlécben (${nevek.length} név, indoklás nélkül: ${indoklasNelkul.join(', ') || 'egy sem'})`,
    )
  }

  // ⚠️ Ugyanazon az oldalon NE álljon két KÜLÖNBÖZŐ cím és két különböző
  //    térkép-link: a lábléc korábban a régi, vegyes címet mutatta.
  const lablec = kommentNelkul(
    fs.readFileSync(path.join(ROOT, 'apps/web/components/public/public-site-footer.tsx'), 'utf8'),
  )
  const layout = kommentNelkul(
    fs.readFileSync(path.join(ROOT, 'apps/web/app/(public)/gy/[slug]/layout.tsx'), 'utf8'),
  )
  assert(/identitas/.test(lablec), 'K3: a lábléc is a hivatalos, kétnyelvű elérhetőséget használja')
  assert(
    /<PublicSiteFooter[^>]*identitas=/.test(layout),
    'K3b: …és a layout át is adja (a prop nem marad kihasználatlan)',
  )
  // ⚠️ A `site.address` a TARTALÉK-LÁNCBAN legitim (`identitas?.cim_ro || …
  //    || site.address`). A baj az lenne, ha a MEGJELENÍTÉS vagy az
  //    ÜRES-ÁLLAPOT nézné a régi mezőket: akkor a „hamarosan felkerülnek"
  //    felirat ott is megjelenne, ahol a hivatalos elérhetőség épp fölötte áll.
  const lablecTorzs = lablec.slice(lablec.indexOf('return ('))
  const regiMezok = ['site.address', 'site.contact_phone', 'site.contact_email'].filter(m =>
    lablecTorzs.includes(m),
  )
  assert(
    regiMezok.length === 0,
    `K3c: a lábléc MEGJELENÍTŐ része már nem a régi mezőket nézi (${regiMezok.join(', ') || 'egy sem'})`,
  )
  assert(
    /!cim && !telefon && !email/.test(lablecTorzs),
    'K3d: az üres-állapot is a MEGJELENÍTETT értékekre néz',
  )
}

console.log(`\n${total - failedCount}/${total} teszt zöld`)
process.exit(failedCount > 0 ? 1 : 0)
