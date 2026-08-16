#!/usr/bin/env node
/**
 * EGYHÁZKERÜLETI HATÓKÖR önellenőrzés (2026-08-15, S1 szelet).
 *
 * Mit véd: az APP és az ADATBÁZIS kerületi szerep-listáinak EGYEZÉSÉT, a
 * kerületi belépő-kapukat, és a megyei/gyülekezeti alak VÁLTOZATLANSÁGÁT.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A TESZT — A PROJEKT LEGDRÁGÁBB HIBAOSZTÁLYA
 * ════════════════════════════════════════════════════════════════════════════
 * A megyei körben ez történt: az APP (`resolveDioceseScopeIds`) BÁRMELY
 * `diocese` hatókörű szerepkör-sort elfogadott, az ADATBÁZIS
 * (`current_user_diocese_ids()`) viszont CSAK az espereset és a megyei admint.
 * Az app tehát feloldott egy egyházmegyét, lefuttatta rá a lekérdezéseket, az
 * RLS pedig 0 sort adott vissza — HIBAÜZENET NÉLKÜL. A számvevő ÜRES
 * KÉPERNYŐT kapott, és senki nem tudta, miért.
 *
 * A két réteg NEM tud egymásról: a TypeScript-fordító nem látja az SQL-t, az
 * SQL nem látja a TypeScriptet. Ha valaki bármelyik oldalon hozzányúl a
 * szerep-listához, a másik NÉMÁN széthúz vele. Ez a teszt az EGYETLEN kötés
 * a két réteg között.
 *
 * NÉGY DOLGOT ŐRZÜNK:
 *
 *  (1) SZEREP-LISTA EGYEZÉS. A level-scope.ts DISTRICT_WRITE_ROLES /
 *      DISTRICT_READ_ROLES betűre ugyanaz legyen, mint az SQL-oldali
 *      current_user_district_ids() / current_user_district_olvaso_ids()
 *      szerep-szűrője.
 *
 *  (2) A KÉT KERÜLETI BELÉPŐ-KAPU. A /dashboard-kerulet és az /admin kapuja
 *      NEM állhat a puszta `egyhazkeruletiAdmin` skaláron: az KIZÁRÓLAG a
 *      profiles.role-ból jön, tehát a `profile_roles`-only kerületi admin
 *      MINDKÉT útvonalról kiesett — zsákutcába, magyarázat nélkül.
 *      ⚠️ És a kettő NEM ugyanaz a kapu: a dashboard OLVASÓ (a számvevő is
 *      bejöhet), az /admin ÍRÓ (a számvevő NEM — nincs `admin` modulja).
 *
 *  (3) AZ ÍRÁS ÉS AZ OLVASÁS KÉT KÜLÖN HATÓKÖR MARAD. A kerületi számvevő
 *      SOHA nem kerülhet bele az ÍRÓ listába — sem az appban, sem az SQL-ben.
 *      Ez a legkönnyebben visszaírható szabály („logikusnak" tűnik egyesíteni).
 *
 *  (4) A MEGYEI ÉS GYÜLEKEZETI ALAK VÁLTOZATLAN. A kerületi kör NEM
 *      módosíthatta a megyei szerep-listákat. Ha ez elmozdul, a 2. szint
 *      törik el — észrevétlenül.
 *
 * Futtatás:  node scripts/selftest-kerulet-hatokor.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

/** Fájl beolvasása — hiányzó fájl HANGOS hiba, nem néma átugrás. */
function olvas(...reszek) {
  const p = path.join(REPO_ROOT, ...reszek)
  if (!fs.existsSync(p)) {
    fail(`hiányzik a fájl: ${path.join(...reszek)}`)
    return null
  }
  return fs.readFileSync(p, 'utf8')
}

const levelScope = olvas('apps', 'web', 'lib', 'auth', 'level-scope.ts')
const rolesTs = olvas('apps', 'web', 'lib', 'auth', 'roles.ts')
const profileRoleTypes = olvas('apps', 'web', 'lib', 'profile-roles', 'types.ts')
const permissions = olvas('apps', 'web', 'lib', 'profile-roles', 'permissions.ts')
const keruletPage = olvas('apps', 'web', 'app', '(dashboard)', 'dashboard-kerulet', 'page.tsx')
const adminLayout = olvas('apps', 'web', 'app', '(dashboard)', 'admin', 'layout.tsx')
const sqlS1 = olvas('migration-docs', 'sql', '2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql')
const sqlGlobal = olvas('migration-docs', 'sql', '2026-08-11-globalis-hozzaferes-szukites.sql')

if (failed) {
  console.error('\nEgyházkerületi hatókör önellenőrzés: HIBA (hiányzó forrásfájl)')
  process.exit(1)
}

/**
 * Egy `const NEV: readonly string[] = [ ... ]` (vagy spread-elt) tömb elemei.
 * A spread (`...MASIK_LISTA`) feloldása a hívó dolga — itt csak a LITERÁL
 * sztringeket adjuk vissza, plusz jelezzük, volt-e spread.
 */
function tombElemek(forras, nev) {
  const re = new RegExp(`const\\s+${nev}\\s*:[^=]*=\\s*\\[([\\s\\S]*?)\\]`, 'm')
  const m = forras.match(re)
  if (!m) return null
  const torzs = m[1]
  const literalok = [...torzs.matchAll(/'([^']+)'/g)].map((x) => x[1])
  const spreadek = [...torzs.matchAll(/\.\.\.\s*([A-Z_][A-Z0-9_]*)/g)].map((x) => x[1])
  return { literalok, spreadek }
}

/**
 * Egy SQL-függvény törzsében szereplő `role IN ('a','b')` / `pr.role IN (...)`
 * lista. A függvényt a `CREATE OR REPLACE FUNCTION public.<nev>()` és a
 * záró dollar-quote közti szakaszon keressük.
 */
function sqlSzerepLista(sql, fnNev) {
  const kezd = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fnNev}()`)
  if (kezd < 0) return null
  // A törzs a nyitó dollar-quote-tól a párjáig tart.
  const utana = sql.slice(kezd)
  const dq = utana.match(/AS\s+(\$[a-zA-Z0-9_]*\$)/)
  if (!dq) return null
  const cimke = dq[1]
  const torzsKezd = utana.indexOf(cimke) + cimke.length
  const torzsVeg = utana.indexOf(cimke, torzsKezd)
  if (torzsVeg < 0) return null
  const torzs = utana.slice(torzsKezd, torzsVeg)

  const szerepek = new Set()
  // (a) `role IN ('x', 'y')`
  for (const m of torzs.matchAll(/\brole\s+IN\s*\(([^)]*)\)/gi)) {
    for (const s of m[1].matchAll(/'([^']+)'/g)) szerepek.add(s[1])
  }
  // (b) `role = 'x'`
  for (const m of torzs.matchAll(/\brole\s*=\s*'([^']+)'/gi)) szerepek.add(m[1])
  return [...szerepek]
}

const egyenlo = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

// ────────────────────────────────────────────────────────────────────────────
// (1) SZEREP-LISTA EGYEZÉS — app ⇄ adatbázis
// ────────────────────────────────────────────────────────────────────────────

const appWrite = tombElemek(levelScope, 'DISTRICT_WRITE_ROLES')
const appRead = tombElemek(levelScope, 'DISTRICT_READ_ROLES')

if (!appWrite || !appRead) {
  fail('K1: a level-scope.ts-ből nem olvasható ki a DISTRICT_WRITE_ROLES / DISTRICT_READ_ROLES')
} else {
  // A READ lista a WRITE-ot spread-eli + a számvevőt teszi hozzá.
  const appReadTeljes = appRead.spreadek.includes('DISTRICT_WRITE_ROLES')
    ? [...appWrite.literalok, ...appRead.literalok]
    : appRead.literalok

  const sqlWrite = sqlSzerepLista(sqlGlobal, 'current_user_district_ids')
  const sqlRead = sqlSzerepLista(sqlS1, 'current_user_district_olvaso_ids')

  if (!sqlWrite) {
    fail('K1: a current_user_district_ids() törzse nem olvasható ki az SQL-ből')
  } else if (egyenlo(appWrite.literalok, sqlWrite)) {
    ok(`K1a ÍRÓ szerep-lista egyezik app ⇄ adatbázis: [${sqlWrite.join(', ')}]`)
  } else {
    fail(
      `K1a ÍRÓ szerep-lista SZÉTHÚZ — app: [${appWrite.literalok.join(', ')}] ⇄ ` +
        `SQL current_user_district_ids(): [${sqlWrite.join(', ')}]. ` +
        'Ez pontosan az a divergencia, ami ÜRES KÉPERNYŐT ad hibaüzenet nélkül.',
    )
  }

  if (!sqlRead) {
    fail('K1: a current_user_district_olvaso_ids() törzse nem olvasható ki az S1 SQL-ből')
  } else if (egyenlo(appReadTeljes, sqlRead)) {
    ok(`K1b OLVASÓ szerep-lista egyezik app ⇄ adatbázis: [${sqlRead.join(', ')}]`)
  } else {
    fail(
      `K1b OLVASÓ szerep-lista SZÉTHÚZ — app: [${appReadTeljes.join(', ')}] ⇄ ` +
        `SQL current_user_district_olvaso_ids(): [${sqlRead.join(', ')}].`,
    )
  }
}

// ────────────────────────────────────────────────────────────────────────────
// (2) A KÉT KERÜLETI BELÉPŐ-KAPU — és hogy NEM ugyanaz a kettő
// ────────────────────────────────────────────────────────────────────────────

if (keruletPage) {
  if (/if\s*\(!\s*canReadDistrictScope\(access\)\)\s*redirect/.test(keruletPage)) {
    ok('K2a /dashboard-kerulet kapuja az OLVASÓ canReadDistrictScope (a számvevő is bejut)')
  } else {
    fail(
      'K2a a /dashboard-kerulet belépő-kapuja NEM canReadDistrictScope. ' +
        'Ha visszaáll a puszta `egyhazkeruletiAdmin` skalárra, a profile_roles-only ' +
        'kerületi admin és a kerületi számvevő NÉMÁN kiesik (zsákutca).',
    )
  }
  if (/resolveDistrictReadScopeIds\(access\)/.test(keruletPage)) {
    ok('K2b a lista-szűrés a SZEREP-SZŰRT resolveDistrictReadScopeIds-szal megy')
  } else {
    fail(
      'K2b a /dashboard-kerulet listaszűrése nem a szerep-szűrt feloldót használja. ' +
        'A tág resolveDistrictScopeIds bármely district-sort (custom, lelkesz) beenged, ' +
        'az RLS viszont nem → 0 sor, hibaüzenet nélkül.',
    )
  }
}

if (adminLayout) {
  if (/canWriteDistrictScope\(access\)/.test(adminLayout)) {
    ok('K2c az /admin kapuja az ÍRÓ canWriteDistrictScope')
  } else {
    fail(
      'K2c az /admin belépő-kapuja nem canWriteDistrictScope. A /admin panel ' +
        'szerepköröket oszt — a kerületi SZÁMVEVŐ (ellenőr) ide nem jöhet be.',
    )
  }
  if (/canReadDistrictScope\(access\)\)\s*redirect\('\/dashboard-kerulet'\)/.test(adminLayout)) {
    ok('K2d a kizárt kerületi számvevő a /dashboard-kerulet-re megy, nem zsákutcába')
  } else {
    fail(
      'K2d az /admin-ból kizárt kerületi felhasználó nem kap értelmes célt. ' +
        'A számvevőt a /dashboard-kerulet-re kell terelni, nem a gyülekezeti /dashboard-ra.',
    )
  }
}

// ────────────────────────────────────────────────────────────────────────────
// (3) AZ ÍRÁS ÉS AZ OLVASÁS KÉT KÜLÖN HATÓKÖR MARAD
// ────────────────────────────────────────────────────────────────────────────

if (appWrite && appWrite.literalok.includes('egyhazkeruleti_szamvevo')) {
  fail(
    'K3a A KERÜLETI SZÁMVEVŐ BEKERÜLT AZ ÍRÓ LISTÁBA (DISTRICT_WRITE_ROLES). ' +
      'Az ellenőrzés és a rögzítés SZÁNDÉKOSAN két külön kézben van.',
  )
} else {
  ok('K3a a kerületi számvevő NINCS az ÍRÓ szerep-listában')
}

if (appRead && !appRead.literalok.includes('egyhazkeruleti_szamvevo')) {
  fail('K3b a kerületi számvevő HIÁNYZIK az OLVASÓ szerep-listából — üres képernyőt kapna')
} else {
  ok('K3b a kerületi számvevő BENNE van az OLVASÓ szerep-listában')
}

{
  const sqlWriteFn = sqlSzerepLista(sqlGlobal, 'current_user_district_ids')
  if (sqlWriteFn && sqlWriteFn.includes('egyhazkeruleti_szamvevo')) {
    fail(
      'K3c az SQL ÍRÓ függvénye (current_user_district_ids) beengedi a számvevőt — ' +
        'az ellenőr írásjogot kapott az adatbázisban.',
    )
  } else {
    ok('K3c az SQL ÍRÓ függvénye érintetlen (nem ismeri a számvevőt)')
  }
}

// A számvevő sablonjában NEM lehet írás és NEM lehet `admin` modul.
if (permissions) {
  const m = permissions.match(/egyhazkeruleti_szamvevo:\s*\{([\s\S]*?)\n\s*\}/)
  if (!m) {
    fail('K3d a ROLE_TEMPLATES-ben nincs egyhazkeruleti_szamvevo sablon')
  } else {
    const torzs = m[1]
    if (/fullAccess|readWrite/.test(torzs)) {
      fail(`K3d a kerületi számvevő sablonja ÍRÁSI jogot ad: ${torzs.trim().slice(0, 120)}`)
    } else if (/\badmin\s*:/.test(torzs)) {
      fail('K3d a kerületi számvevő sablonjában ott az `admin` modul — szerepköröket oszthatna')
    } else {
      ok('K3d a kerületi számvevő sablonja csak readOnly, admin modul nélkül')
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// (4) A MEGYEI ALAK VÁLTOZATLAN — regressziós őr a 2. szintre
// ────────────────────────────────────────────────────────────────────────────

{
  const dioWrite = tombElemek(levelScope, 'DIOCESE_WRITE_ROLES')
  const dioRead = tombElemek(levelScope, 'DIOCESE_READ_ROLES')
  const vartWrite = ['esperes', 'egyhazmegyei_admin']
  const vartRead = ['egyhazmegyei_szamvevo']

  if (!dioWrite || !egyenlo(dioWrite.literalok, vartWrite)) {
    fail(
      `K4a A MEGYEI ÍRÓ LISTA MEGVÁLTOZOTT: [${dioWrite ? dioWrite.literalok.join(', ') : '?'}] ` +
        `— várt: [${vartWrite.join(', ')}]. A kerületi kör NEM módosíthatja a 2. szintet.`,
    )
  } else {
    ok('K4a a megyei ÍRÓ szerep-lista változatlan (esperes, egyhazmegyei_admin)')
  }

  if (
    !dioRead ||
    !dioRead.spreadek.includes('DIOCESE_WRITE_ROLES') ||
    !egyenlo(dioRead.literalok, vartRead)
  ) {
    fail(
      `K4b A MEGYEI OLVASÓ LISTA MEGVÁLTOZOTT: [${dioRead ? dioRead.literalok.join(', ') : '?'}] ` +
        `(spread: ${dioRead ? dioRead.spreadek.join(', ') : '?'}) — várt: a WRITE + [${vartRead.join(', ')}].`,
    )
  } else {
    ok('K4b a megyei OLVASÓ szerep-lista változatlan (írók + egyhazmegyei_szamvevo)')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// (5) AZ ÚJ SZEREP MINDEN RÉTEGBEN OTT VAN — különben „ismeretlen szerep" ág
// ────────────────────────────────────────────────────────────────────────────

{
  const retegek = [
    ['roles.ts KNOWN_ROLES', rolesTs],
    ['profile-roles/types.ts (ProfileRoleType + ROLE_LABELS)', profileRoleTypes],
    ['profile-roles/permissions.ts (ROLE_TEMPLATES)', permissions],
  ]
  for (const [nev, forras] of retegek) {
    if (forras && forras.includes('egyhazkeruleti_szamvevo')) {
      ok(`K5 az egyhazkeruleti_szamvevo szerepel itt: ${nev}`)
    } else {
      fail(`K5 HIÁNYZIK az egyhazkeruleti_szamvevo innen: ${nev}`)
    }
  }
  // A ROLE_LABELS-nek magyar CÍMKÉT is kell adnia, nem csak a kulcsot.
  if (profileRoleTypes && !/egyhazkeruleti_szamvevo:\s*'Egyházkerületi számvevő'/.test(profileRoleTypes)) {
    fail('K5b a ROLE_LABELS-ben nincs magyar címke az egyhazkeruleti_szamvevo-hoz')
  } else {
    ok('K5b a ROLE_LABELS magyar címkéje megvan')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// (6) AZ SQL ÉS AZ APP UGYANARRA A HÁROM SZABÁLYRA ÉPÜL
// ────────────────────────────────────────────────────────────────────────────

{
  // A skalár-elnyomás („ha van BÁRMILYEN district sor, a skalár nem bővít")
  // mindkét oldalon KÖTELEZŐ — enélkül egy visszavont szerep melletti elavult
  // profiles.district_id tovább nyitna.
  if (levelScope && /hasAnyDistrictRow/.test(levelScope)) {
    ok('K6a az app-oldali feloldóban megvan a szerep-FÜGGETLEN skalár-elnyomás')
  } else {
    fail(
      'K6a az app-oldali kerületi feloldóból eltűnt a skalár-elnyomás (hasAnyDistrictRow). ' +
        'Egy visszavont szerep melletti elavult profiles.district_id tovább nyitna.',
    )
  }
  if (sqlS1 && /barmely_keruleti_sor/.test(sqlS1)) {
    ok('K6b az SQL-oldali feloldóban megvan a skalár-elnyomás (barmely_keruleti_sor CTE)')
  } else {
    fail('K6b az S1 SQL olvasó függvényéből hiányzik a barmely_keruleti_sor skalár-elnyomás')
  }
  // A GRANT nélkül a policy nem tagad, hanem HIBÁZIK (403).
  if (sqlS1 && /GRANT EXECUTE ON FUNCTION public\.current_user_district_olvaso_ids\(\) TO authenticated/.test(sqlS1)) {
    ok('K6c az új olvasó függvény GRANT EXECUTE-ot kap az authenticated-nek')
  } else {
    fail(
      'K6c hiányzik a GRANT EXECUTE az új olvasó függvényre. GRANT nélkül minden ' +
        'erre épülő policy 403-mal ÁLL LE — nem tagad, hanem hibázik.',
    )
  }
}

if (failed) {
  console.error('\nEgyházkerületi hatókör önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nEgyházkerületi hatókör önellenőrzés: minden zöld')
