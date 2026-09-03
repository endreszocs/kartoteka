#!/usr/bin/env node
/**
 * OBLIO P0-KAPUK önellenőrzés (2026-09-03, az átvilágítás javításai)
 *
 * MIT ŐRIZ — három, egymástól függetlenül elromolható védelem, amelyek
 * mindegyike VALÓDI PÉNZT vagy IDEGEN ADATOT véd:
 *
 *   (1) TOKEN-CACHE TENANT-ELKÜLÖNÍTÉS. A cache kulcsa korábban CSAK az Oblio
 *       e-mail volt. Ha két gyülekezet ugyanazt az e-mailt használja más
 *       titokkal (pl. közös könyvelő), a második hívás az ELSŐ gyülekezet ÉLŐ
 *       Bearer tokenjével futott — idegen CIF- és kintlévőség-lista szivárgott.
 *       Titok-cserénél ráadásul a régi token a lejáratáig élt tovább.
 *
 *   (2) DEVIZA- ÉS JÓVÁÍRÓ-KAPU a desktop „Bevezetés új kiadásként" varázslóban.
 *       A párosító motor SZÁNDÉKOSAN kihagyja a devizás és a jóváíró számlákat —
 *       épp ezért maradtak „nincs párosítva" állapotban, és épp ezeken világított
 *       a zöld bevezetés-gomb. A varázsló viszont a NYERS összeget könyvelte el:
 *       500 EUR-ból 500 RON-os kiadás lett, árfolyam nélkül.
 *
 *   (3) KETTŐS KÖNYVELÉS ELLENI KAPU. A desktop fül a webes `szallitoi_szamla`
 *       táblát sosem nézte, így egy ott már rögzített számláról MÁSODIK kiadás
 *       keletkezhetett — utána mindkét felület zöld pipát mutatott.
 *       A kapunak FAIL-CLOSED-nak kell lennie: ha az ellenőrzés nem futtatható,
 *       NEM vezetünk be.
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): minden őrhöz
 * visszajátsszuk a hibás világot, és bizonyítjuk, hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-oblio-p0-kapuk.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const AUTH = path.join(REPO, 'apps', 'web', 'lib', 'finance', 'oblio', 'oblio-auth.ts')
const DESKTOP = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'desktop-oblio-tab.tsx')
const MATCHER = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'oblio', 'oblio-matcher.ts')

let failed = false
const ok = (m) => console.log(`OK:   ${m}`)
const fail = (m) => { failed = true; console.error(`HIBA: ${m}`) }

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const f of [AUTH, DESKTOP, MATCHER]) {
  if (!fs.existsSync(f)) fail(`hiányzó fájl: ${path.relative(REPO, f)}`)
}
if (failed) { console.error('\nAz Oblio P0-kapuk önellenőrzés ELBUKOTT.'); process.exit(1) }

function orzo(cimke, forras, minta, mutans) {
  const kod = kodCsak(forras)
  if (!minta.test(kod)) { fail(`${cimke} — hiányzik`); return }
  if (minta.test(kodCsak(mutans(forras)))) fail(`${cimke} — az őr VAK: a mutáns is átment`)
  else ok(cimke)
}

const authNyers = olvas(AUTH)
const deskNyers = olvas(DESKTOP)

// ── (1) TOKEN-CACHE ──────────────────────────────────────────────────────
orzo(
  '(1) a cache-kulcs a titok ujjlenyomatát is tartalmazza',
  authNyers,
  /function cacheKey\(email: string, apiSecret: string\)/,
  (s) => s.replace(/function cacheKey\(email: string, apiSecret: string\)/g, 'function cacheKey(email: string)'),
)
orzo(
  '(1) a token-kérés a titokkal együtt kulcsol',
  authNyers,
  /cacheKey\(email,\s*apiSecret\)/,
  (s) => s.replace(/cacheKey\(email, apiSecret\)/g, 'cacheKey(email)'),
)
{
  // A titok MAGA nem kerülhet a kulcsba (memória-dump, hibaüzenet).
  const kod = kodCsak(authNyers)
  if (/createHash\('sha256'\)/.test(kod)) ok('(1) a kulcs HASH-t használ, nem a nyers titkot')
  else fail('(1) a kulcs nem hash-eli a titkot')
  if (/\$\{apiSecret\}/.test(kod) || /:\s*\+\s*apiSecret/.test(kod)) {
    fail('(1) a NYERS titok bekerül a cache-kulcsba')
  } else ok('(1) a nyers titok nem kerül a kulcsba')
}
orzo(
  '(1) a cache-ürítés ELŐTAG szerint takarít (titok-csere után nem ragad be a régi token)',
  authNyers,
  /k\.startsWith\(elotag\)/,
  (s) => s.replace(/for \(const k of \[\.\.\.tokenCache\.keys\(\)\]\) \{[\s\S]*?\n  \}/, 'tokenCache.delete(elotag)'),
)

// ── (2) DEVIZA- ÉS JÓVÁÍRÓ-KAPU ──────────────────────────────────────────
orzo(
  '(2) devizás számlát a bevezetés-varázsló elutasít',
  deskNyers,
  /if\s*\(!isRon\(target\.meta\.currency\)\)/,
  (s) => s.replace(/if \(!isRon\(target\.meta\.currency\)\)/g, 'if (false)'),
)
orzo(
  '(2) jóváíró (CreditNote) számlát a varázsló elutasít',
  deskNyers,
  /target\.meta\.documentType === 'credit_note'/,
  (s) => s.replace(/target\.meta\.documentType === 'credit_note'/g, 'false'),
)
{
  // A kapuknak a MENTÉS ELŐTT kell állniuk — utána már elkéstek.
  const kod = kodCsak(deskNyers)
  const kapu = kod.indexOf('!isRon(target.meta.currency)')
  const mentes = kod.indexOf('saveExpenseUseCase(')
  if (kapu >= 0 && mentes > kapu) ok('(2) a kapuk a mentés ELŐTT futnak')
  else fail('(2) a deviza-kapu a mentés UTÁN (vagy sehol) van — elkésne')
  // Az `isRon` a KÖZÖS magból jöjjön: helyi másolat széthúzna a matcherrel.
  if (/isRon,/.test(kod) && /@kartoteka\/ui-app/.test(kod)) ok('(2) az isRon a közös csomagból jön (nem helyi másolat)')
  else fail('(2) az isRon nem a közös csomagból jön — széthúzhat a párosítóval')
}
{
  const m = kodCsak(olvas(MATCHER))
  if (/export function isRon\(/.test(m)) ok('(2) az isRon exportált a matcherből')
  else fail('(2) az isRon nincs exportálva — a desktop nem tudja ugyanazt használni')
}

// ── (3) KETTŐS KÖNYVELÉS ELLENI KAPU ─────────────────────────────────────
orzo(
  '(3) a varázsló megnézi a webes szallitoi_szamla táblát',
  deskNyers,
  /\.from\('szallitoi_szamla'\)[\s\S]{0,200}?\.eq\('anaf_uuid', uuid\)/,
  (s) => s.replace(/\.from\('szallitoi_szamla'\)/g, ".from('valami_mas')"),
)
{
  const kod = kodCsak(deskNyers)
  // FAIL-CLOSED: az ellenőrzés hibája MEGÁLLÍTJA a bevezetést.
  const i = kod.indexOf("from('szallitoi_szamla')")
  const szakasz = i >= 0 ? kod.slice(i, i + 1800) : ''
  if (!szakasz) {
    fail('(3) a duplikátum-kapu nem található')
  } else {
    if (/if \(ellenorzesHiba\)[\s\S]{0,400}?return/.test(szakasz)) {
      ok('(3) FAIL-CLOSED: ha az ellenőrzés nem futtatható, nem vezetünk be')
    } else {
      fail('(3) az ellenőrzés hibáját elnyeli a kód — egy DB-hiba után átcsúszna a duplikátum')
    }
    if (/if \(mar && mar\.length > 0\)[\s\S]{0,600}?return/.test(szakasz)) {
      ok('(3) találat esetén a bevezetés megáll, beszédes üzenettel')
    } else {
      fail('(3) a megtalált duplikátum nem állítja meg a bevezetést')
    }
    const mentes = kod.indexOf('saveExpenseUseCase(')
    if (i < mentes) ok('(3) a kapu a mentés ELŐTT fut')
    else fail('(3) a duplikátum-kapu a mentés UTÁN van — elkésne')
  }
}

if (failed) { console.error('\nAz Oblio P0-kapuk önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nAz Oblio P0-kapuk önellenőrzés rendben.')
