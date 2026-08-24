#!/usr/bin/env node
/**
 * 2FA-KAPU önellenőrzés (2026-08-24, biztonsági javító kör).
 *
 * Mit véd:
 *   · apps/web/lib/supabase/middleware.ts   — a proxy-kapu ÉS a döntés magja
 *   · apps/web/app/(auth)/login/actions.ts  — a jelszavas belépés 2. lépcsője
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ MIÉRT VAN EZ A FÁJL — A KAPU NEM HITELESÍTETT SÜTITARTALOMBÓL DÖNTÖTT
 * ════════════════════════════════════════════════════════════════════════════
 * A kétlépcsős belépésnek EGYETLEN kikényszerítő pontja van: ez a kapu. 2026-
 * 08-24-ig mindkét hívási helye így nézett ki:
 *
 *     const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
 *     if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') { … }
 *
 * A telepített @supabase/auth-js ARGUMENTUM NÉLKÜL a `getSession()`-ből
 * dolgozik. Ott a `currentLevel` az ALÁÍRT JWT `aal` claim-jéből jön (az
 * hiteles), DE a `nextLevel` a `session.user.factors` tömbből — az pedig a
 * SÜTIBŐL visszaolvasott, ALÁÍRATLAN JSON. A @supabase/ssr saját kódja meg is
 * jelöli: „isServer: true — coming from a server environment and their value
 * should not be trusted".
 *
 * A TÁMADÁS: a támadó ismeri az áldozat jelszavát, de a telefonját nem.
 * Bejelentkezik → érvényes, aláírt, aal1-es access_token + átirányítás a
 * /login/ellenorzes-re. A böngésző eszköztárában kiveszi az
 * `sb-<projekt>-auth-token` sütit, base64url-ből dekódolja, a `user.factors`
 * tömböt KIÜRÍTI (`"factors":[]`), visszakódolja. Az access_token és a
 * refresh_token VÁLTOZATLAN — az aláírás érvényes marad —, de a kapu már nem
 * követeli a második faktort.
 *
 * A JAVÍTÁS: a faktor-listát a SZERVER mondja meg (`supabase.auth.getUser()`
 * = hálózati `/user` hívás; ugyanabból a forrásból dolgozik a könyvtár
 * `mfa.listFactors()`-a is). A `currentLevel` maradhat a könyvtártól: az az
 * ALÁÍRT tokenből jön.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AZ ÖT MÉRCE
 * ════════════════════════════════════════════════════════════════════════════
 *  M1  A MAG BETÖLTHETŐ  — a `kellEMasodikFaktor()` a MAI forrásból betöltve
 *                          futtatható (import-mentes, tiszta függvény).
 *  M2  VISELKEDÉS        — 10 határeset: fail-closed, opt-in ígéret, az
 *                          ellenőrizetlen (enrollment alatti) faktor, aal2.
 *  M3  HÍVÁSI HELY       — MINDKÉT kapu a szerver-oldali felhasználóból dönt,
 *                          és EGYIK SEM a könyvtár `nextLevel` mezőjéből.
 *  M4  NEGATÍV ASSZERT   — a RÉGI világot a MAI forrásból állítjuk elő
 *                          string-átalakítással, és bizonyítjuk, hogy a mércék
 *                          elbuknak rajta. Őrszem negatív asszert nélkül vak.
 *  M5  NEM-REGRESSZIÓ    — a mérce a TÚLSZIGORÍTÁST is elkapja: aki nem
 *                          kapcsolt be 2FA-t, azt a kapu SOHA nem térítheti el.
 *
 * ⛔ A negatív asszert SZÁNDÉKOSAN nem a git-történelemre épül. A projektben ez
 *    már elsült: commitkor a HEAD maga lett a javított fájl, az őrszem pedig
 *    saját magára írt hibát; rögzített commit pedig sekély CI-klónban
 *    (fetch-depth 1) nem elérhető. Minden „régi világ" itt a MAI forrás
 *    string-átalakítása, FAIL-CLOSED ráhagyással: ha a csere nem történik meg
 *    (elmozdult horgony), az őrszem SZÓL.
 *
 * Futtatás:  node scripts/selftest-2fa-kapu.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const REL = {
  proxy: 'apps/web/lib/supabase/middleware.ts',
  login: 'apps/web/app/(auth)/login/actions.ts',
  authJs: 'node_modules/@supabase/auth-js/dist/main/GoTrueClient.js',
}

let hibak = 0
const bukottUzenetek = []

function jelent(merce, rendben, uzenet) {
  if (rendben) {
    console.log(`   ✓ [${merce}] ${uzenet}`)
    return true
  }
  hibak++
  bukottUzenetek.push(`[${merce}] ${uzenet}`)
  console.log(`   ✗ [${merce}] ${uzenet}`)
  return false
}

function info(uzenet) {
  console.log(`   · ${uzenet}`)
}

function olvas(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8')
  } catch {
    return null
  }
}

/**
 * Kommentek eltávolítása. A szöveges mércék CSAK a ténylegesen lefutó kódot
 * nézhetik: ez a javítás szó szerint IDÉZI a régi, hibás sort a magyarázatában
 * („aal.nextLevel === 'aal2'"), és egy naiv keresés arra is ráillene — az
 * őrszem így akkor jelezne hibát, amikor a kód épp helyes.
 */
function kommentNelkul(szoveg) {
  return szoveg
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ')
}

const PROXY = olvas(REL.proxy)
const LOGIN = olvas(REL.login)

console.log('═══ 2FA-KAPU ÖNELLENŐRZÉS ═══')

if (PROXY === null || LOGIN === null) {
  console.log(`   ✗ hiányzó fájl: ${PROXY === null ? REL.proxy : REL.login}`)
  process.exit(1)
}

/* ══════════════════════════════════════════════════════════════════════════
   ESZKÖZÖK — a MAI forrásból futtatható mag + feltétel-kinyerés
   ══════════════════════════════════════════════════════════════════════════ */

const require_ = createRequire(path.join(ROOT, 'package.json'))
let ts = null
try {
  ts = require_('typescript')
} catch {
  console.log('   ✗ a typescript csomag nem elérhető — a mérce NEM hagyható ki némán')
  process.exit(1)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-2fa-kapu-'))
let magSorszam = 0

/**
 * TS → CJS betöltés. A `middleware.ts` tetején három import áll (next/server,
 * @supabase/ssr, session-mode); ezeket kiszedjük, mert a MAG nem használja
 * őket — így a tiszta függvény projekt-infrastruktúra nélkül futtatható.
 *
 * FAIL-CLOSED: ha a mag valaha importra szorulna, a betöltés ITT bukna el
 * hangosan, nem pedig némán kihagyná magát.
 */
function magBetoltes(forras, cimke) {
  const importNelkul = forras.replace(/^import[^\n]*\r?\n/gm, '')
  if (/^\s*import\s/m.test(importNelkul)) {
    throw new Error(`${cimke}: több soros import maradt a forrásban`)
  }
  const kimenet = ts.transpileModule(importNelkul, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const fajl = path.join(tmp, `kapu-mag-${++magSorszam}.cjs`)
  fs.writeFileSync(fajl, kimenet, 'utf8')
  return require_(fajl)
}

/**
 * Egy `if (…)` feltétel szövegének kinyerése kiegyensúlyozott zárójel-
 * párosítással. Azért nem regexszel: a feltételben magában is vannak zárójelek
 * (`kellEMasodikFaktor(user, aal?.currentLevel)`).
 */
function feltetelKinyeres(forras, kezdoMinta) {
  const i = forras.indexOf(kezdoMinta)
  if (i === -1) return null
  const nyito = forras.indexOf('(', i)
  if (nyito === -1) return null
  let melyseg = 0
  for (let j = nyito; j < forras.length; j++) {
    const ch = forras[j]
    if (ch === '(') melyseg++
    else if (ch === ')') {
      melyseg--
      if (melyseg === 0) return forras.slice(nyito + 1, j).trim()
    }
  }
  return null
}

/* ══════════════════════════════════════════════════════════════════════════
   M1 — A DÖNTÉS MAGJA BETÖLTHETŐ ÉS FUTTATHATÓ
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n── M1: a döntés magja ──')

let mag = null
try {
  mag = magBetoltes(PROXY, 'proxy')
} catch (err) {
  jelent('M1', false, `a mag nem tölthető be: ${err instanceof Error ? err.message : err}`)
}
jelent(
  'M1',
  mag !== null && typeof mag.kellEMasodikFaktor === 'function',
  'a `kellEMasodikFaktor()` exportált, import-mentes, tiszta függvény',
)

if (!mag || typeof mag.kellEMasodikFaktor !== 'function') {
  console.log('\n2FA-kapu önellenőrzés: HIBA (a mag nélkül a többi mérce vak lenne)')
  process.exit(1)
}

const kellEMasodikFaktor = mag.kellEMasodikFaktor

/* ══════════════════════════════════════════════════════════════════════════
   M2 — VISELKEDÉS: HATÁRESETEK
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n── M2: a döntés határesetei ──')

const TOTP_ELLENORZOTT = { id: 'f1', factor_type: 'totp', status: 'verified' }
const TOTP_ELLENORIZETLEN = { id: 'f2', factor_type: 'totp', status: 'unverified' }

/**
 * @typedef {{ nev: string, user: unknown, szint: unknown, vart: boolean, miert: string }} Eset
 * @type {Eset[]}
 */
const ESETEK = [
  {
    nev: 'E1',
    user: { factors: [TOTP_ELLENORZOTT] },
    szint: 'aal1',
    vart: true,
    miert: 'van ellenőrzött faktor + aal1-es munkamenet → a 2. lépcsőre kell terelni',
  },
  {
    nev: 'E2',
    user: { factors: [TOTP_ELLENORZOTT] },
    szint: 'aal2',
    vart: false,
    miert: 'van faktor, de a munkamenet MÁR aal2 → átengedjük (nincs végtelen kör)',
  },
  {
    nev: 'E3',
    user: { factors: [TOTP_ELLENORZOTT] },
    szint: null,
    vart: true,
    miert: 'van faktor, de a szintet nem tudjuk → FAIL-CLOSED',
  },
  {
    nev: 'E4',
    user: { factors: [TOTP_ELLENORZOTT] },
    szint: undefined,
    vart: true,
    miert: 'van faktor, hiányzó szint → FAIL-CLOSED',
  },
  {
    nev: 'E5',
    user: { factors: [] },
    szint: 'aal1',
    vart: false,
    miert: 'OPT-IN ÍGÉRET: üres faktor-lista → semmi nem változik',
  },
  {
    nev: 'E6',
    user: {},
    szint: 'aal1',
    vart: false,
    miert: 'OPT-IN ÍGÉRET: a szerver el sem küldte a `factors` mezőt (nincs faktor)',
  },
  {
    nev: 'E7',
    user: { factors: null },
    szint: 'aal1',
    vart: false,
    miert: 'OPT-IN ÍGÉRET: `factors: null` sem zárhat ki senkit',
  },
  {
    nev: 'E8',
    user: { factors: [TOTP_ELLENORIZETLEN] },
    szint: 'aal1',
    vart: false,
    miert: 'enrollment alatti, ELLENŐRIZETLEN faktor → azzal még nem lehet belépni, ne is zárjon ki',
  },
  {
    nev: 'E9',
    user: { factors: [TOTP_ELLENORIZETLEN, TOTP_ELLENORZOTT] },
    szint: 'aal1',
    vart: true,
    miert: 'vegyes lista: EGY ellenőrzött faktor is elég a kapuhoz',
  },
  {
    nev: 'E10',
    user: null,
    szint: 'aal2',
    vart: true,
    miert: 'nincs hitelesített szerver-válasz → FAIL-CLOSED, akkor is, ha a token aal2-t állít',
  },
  {
    nev: 'E11',
    user: undefined,
    szint: 'aal1',
    vart: true,
    miert: 'hiányzó szerver-válasz → FAIL-CLOSED',
  },
]

for (const eset of ESETEK) {
  const kapott = kellEMasodikFaktor(eset.user, eset.szint)
  jelent(
    'M2',
    kapott === eset.vart,
    `${eset.nev}: ${eset.miert} (várt ${eset.vart}, kapott ${kapott})`,
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   M3 — HÍVÁSI HELY: MINDKÉT KAPU A SZERVERBŐL DÖNT
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n── M3: a két hívási hely ──')

/** A proxy-kapu feltétele a `kellEMasodikFaktor()` hívás, a `user`-rel. */
function h1ProxyFeltetel(proxyForras) {
  const tiszta = kommentNelkul(proxyForras)
  const feltetel = feltetelKinyeres(tiszta, 'if (kellEMasodikFaktor(')
  if (feltetel === null) return false
  // Az ELSŐ argumentum a `getUser()` eredménye — a szerver hitelesített válasza.
  return /^kellEMasodikFaktor\(\s*user\s*,/.test(feltetel)
}

/** A proxy-kapu döntése NEM a könyvtár süti-alapú `nextLevel` mezőjéből jön. */
function h2ProxyNemNextLevel(proxyForras) {
  const tiszta = kommentNelkul(proxyForras)
  const feltetel = feltetelKinyeres(tiszta, 'if (kellEMasodikFaktor(')
  if (feltetel === null) return false
  return !feltetel.includes('nextLevel')
}

/** A jelszavas belépés a SZERVERTŐL kéri le a felhasználót, és abból dönt. */
function h3LoginSzerverbol(loginForras) {
  const tiszta = kommentNelkul(loginForras)
  const feltetel = feltetelKinyeres(tiszta, 'if (kellEMasodikFaktor(')
  if (feltetel === null) return false
  if (feltetel.includes('nextLevel')) return false
  // A hitelesítés forrása: `supabase.auth.getUser()` — hálózati /user hívás.
  const getUserIdx = tiszta.indexOf('await supabase.auth.getUser()')
  const feltetelIdx = tiszta.indexOf('if (kellEMasodikFaktor(')
  if (getUserIdx === -1 || feltetelIdx === -1 || getUserIdx > feltetelIdx) return false
  // …és épp az ő eredménye megy be a döntésbe.
  const valtozo = /const\s*\{\s*data:\s*(\w+)\s*\}\s*=\s*await supabase\.auth\.getUser\(\)/.exec(
    tiszta.slice(0, feltetelIdx),
  )
  if (!valtozo) return false
  return feltetel.includes(`${valtozo[1]}?.user`) || feltetel.includes(`${valtozo[1]}.user`)
}

/** A mag maga fail-closed, és az ELLENŐRZÖTT faktorokra szűr. */
function h4MagFailClosed(proxyForras) {
  const tiszta = kommentNelkul(proxyForras)
  const kezd = tiszta.indexOf('export function kellEMasodikFaktor(')
  if (kezd === -1) return false
  const torzs = tiszta.slice(kezd, kezd + 900)
  if (!/if\s*\(!szerverFelhasznalo\)\s*return true/.test(torzs)) return false
  if (!/status\s*===\s*'verified'/.test(torzs)) return false
  return true
}

const H_MERCEK = [
  ['H1', 'a proxy-kapu feltétele a `kellEMasodikFaktor(user, …)` hívás', h1ProxyFeltetel, 'proxy'],
  ['H2', 'a proxy-kapu feltételében NINCS `nextLevel` (nem a sütiből dönt)', h2ProxyNemNextLevel, 'proxy'],
  ['H3', 'a jelszavas belépés a `getUser()` szerver-válaszából dönt', h3LoginSzerverbol, 'login'],
  ['H4', 'a mag fail-closed, és csak az ELLENŐRZÖTT faktorokat számolja', h4MagFailClosed, 'proxy'],
]

for (const [nev, leiras, pred, melyik] of H_MERCEK) {
  jelent('M3', pred(melyik === 'proxy' ? PROXY : LOGIN), `${nev}: ${leiras}`)
}

/* ══════════════════════════════════════════════════════════════════════════
   M4 — NEGATÍV ASSZERT: A RÉGI VILÁG A MAI FORRÁSBÓL
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n── M4: negatív asszert (a régi világ BUKJON) ──')

/**
 * A 2026-08-24 ELŐTTI, hibás feltétel — szó szerint ez állt mindkét fájlban.
 * NEM másolt fájl: a MAI forrásba írjuk vissza string-cserével, hogy a mutáns
 * együtt mozogjon a kóddal.
 */
const REGI_FELTETEL = "aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2'"

/**
 * Egy string-csere FAIL-CLOSED ráhagyással: ha a horgony elmozdult, a mutáns
 * nem készül el, és az őrszem NEM hallgat róla.
 */
function mutans(nev, forras, mit, mire) {
  const eredmeny = forras.replace(mit, mire)
  if (eredmeny === forras) {
    jelent('M4', false, `${nev}: a mutáns NEM készült el (elmozdult horgony: „${mit.slice(0, 60)}…")`)
    return null
  }
  return eredmeny
}

/** A mérce BUKJON a mutánson — ez a negatív asszert lényege. */
function bukniaKell(nev, pred, mutaltForras, leiras) {
  if (mutaltForras === null) return
  jelent('M4', pred(mutaltForras) === false, `${nev}: ${leiras}`)
}

// ── M4/a: a régi, könyvtár-alapú feltétel a proxy-kapuban ──────────────────
const PROXY_REGI = mutans(
  'M4/a',
  PROXY,
  'if (kellEMasodikFaktor(user, aal?.currentLevel)) {',
  `if (${REGI_FELTETEL}) {`,
)
bukniaKell('M4/a', h1ProxyFeltetel, PROXY_REGI, 'a régi, süti-alapú proxy-feltételen a H1 elbukik')
bukniaKell('M4/a', h2ProxyNemNextLevel, PROXY_REGI, 'a régi, süti-alapú proxy-feltételen a H2 elbukik')

// ── M4/b: a régi, könyvtár-alapú feltétel a jelszavas belépésben ───────────
let LOGIN_REGI = mutans(
  'M4/b',
  LOGIN,
  'if (kellEMasodikFaktor(hitelesAdat?.user, aal?.currentLevel)) {',
  `if (${REGI_FELTETEL}) {`,
)
if (LOGIN_REGI !== null) {
  // A régi világban a `getUser()` hívás sem volt ott — vegyük ki azt is.
  LOGIN_REGI = mutans(
    'M4/b',
    LOGIN_REGI,
    'const { data: hitelesAdat } = await supabase.auth.getUser()',
    '',
  )
}
bukniaKell('M4/b', h3LoginSzerverbol, LOGIN_REGI, 'a régi, süti-alapú belépés-feltételen a H3 elbukik')

// ── M4/c: fail-open mag (a `!szerverFelhasznalo` ág megfordítva) ───────────
const PROXY_FAILOPEN = mutans(
  'M4/c',
  PROXY,
  'if (!szerverFelhasznalo) return true',
  'if (!szerverFelhasznalo) return false',
)
bukniaKell('M4/c', h4MagFailClosed, PROXY_FAILOPEN, 'a fail-open magon a H4 elbukik')
if (PROXY_FAILOPEN !== null) {
  try {
    const failOpenMag = magBetoltes(PROXY_FAILOPEN, 'fail-open')
    const kapott = failOpenMag.kellEMasodikFaktor(null, 'aal1')
    jelent(
      'M4/c',
      kapott === false,
      `a fail-open mag tényleg átengedne szerver-válasz nélkül (kapott ${kapott}) — az M2/E10–E11 fogja meg`,
    )
  } catch (err) {
    jelent('M4/c', false, `a fail-open mutáns mag nem tölthető be: ${err instanceof Error ? err.message : err}`)
  }
}

// ── M4/d: A TÁMADÁS ÚJRAJÁTSZÁSA — hamisított `factors: []` süti ───────────
//
// A könyvtár viselkedését szimuláljuk (a telepített auth-js pontosan ezt teszi
// argumentum nélkül): a `currentLevel` az ALÁÍRT tokenből, a `nextLevel` a
// SÜTIBŐL visszaolvasott faktor-tömbből.
function konyvtarAal(sutiFaktorok, jwtAal) {
  const ellenorzott = (sutiFaktorok ?? []).filter((f) => f?.status === 'verified')
  return {
    currentLevel: jwtAal,
    nextLevel: ellenorzott.length > 0 ? 'aal2' : jwtAal,
    currentAuthenticationMethods: [],
  }
}

/** A kapu feltételének kiértékelése a MAI, ill. a mutált forrásból kinyerve. */
function feltetelKiertekelo(forras, kezdoMinta, cimke) {
  const feltetel = feltetelKinyeres(kommentNelkul(forras), kezdoMinta)
  if (feltetel === null) {
    jelent('M4', false, `${cimke}: a feltétel nem nyerhető ki a forrásból`)
    return null
  }
  // eslint-disable-next-line no-new-func
  return new Function('user', 'aal', 'kellEMasodikFaktor', `return !!(${feltetel})`)
}

const UJ_KAPU = feltetelKiertekelo(PROXY, 'if (kellEMasodikFaktor(', 'M4/d új kapu')
const REGI_KAPU =
  PROXY_REGI === null ? null : feltetelKiertekelo(PROXY_REGI, `if (${REGI_FELTETEL.slice(0, 20)}`, 'M4/d régi kapu')

if (UJ_KAPU && REGI_KAPU) {
  /**
   * A négy forgatókönyv. `szerver` = amit a `/user` válasz mond (hiteles),
   * `suti` = amit a támadó a böngészőjében átírhat.
   */
  const FORGATOKONYVEK = [
    {
      nev: 'T1 — A TÁMADÁS',
      szerver: [TOTP_ELLENORZOTT],
      suti: [], // ⬅ a támadó kiürítette
      jwtAal: 'aal1',
      ujVart: true,
      regiVart: false,
      miert: 'hamisított `factors: []` süti: az ÚJ kapu fog, a RÉGI átengedte volna',
    },
    {
      nev: 'T2 — békés 2FA',
      szerver: [TOTP_ELLENORZOTT],
      suti: [TOTP_ELLENORZOTT],
      jwtAal: 'aal1',
      ujVart: true,
      regiVart: true,
      miert: 'ép sütinél mindkét kapu terel — a mérce nem lett trivális',
    },
    {
      nev: 'T3 — nincs 2FA',
      szerver: [],
      suti: [],
      jwtAal: 'aal1',
      ujVart: false,
      regiVart: false,
      miert: 'faktor nélküli fióknál egyik kapu sem térít el (opt-in ígéret)',
    },
    {
      nev: 'T4 — már aal2',
      szerver: [TOTP_ELLENORZOTT],
      suti: [TOTP_ELLENORZOTT],
      jwtAal: 'aal2',
      ujVart: false,
      regiVart: false,
      miert: 'a második lépcső után átengedünk (nincs pattogás)',
    },
  ]

  for (const f of FORGATOKONYVEK) {
    const aal = konyvtarAal(f.suti, f.jwtAal)
    const szerverUser = { factors: f.szerver }
    const uj = UJ_KAPU(szerverUser, aal, kellEMasodikFaktor)
    const regi = REGI_KAPU(szerverUser, aal, kellEMasodikFaktor)
    jelent('M4/d', uj === f.ujVart, `${f.nev}: az ÚJ kapu ${uj} (várt ${f.ujVart}) — ${f.miert}`)
    jelent('M4/d', regi === f.regiVart, `${f.nev}: a RÉGI kapu ${regi} (várt ${f.regiVart})`)
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   M5 — NEM-REGRESSZIÓ: A TÚLSZIGORÍTÁST IS ELKAPJUK
   ══════════════════════════════════════════════════════════════════════════
   ⚠️ A kör élesbe megy egy működő egyházi nyilvántartásra. Egy „biztonságos"
   javítás, ami MINDENKITŐL második faktort követel, ugyanolyan súlyos hiba,
   mint a kihagyott kapu: kizárná azt a több száz felhasználót, aki soha nem
   kapcsolt be 2FA-t. Ezért a túlszigorítás is mutáns-ellenőrzött.
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n── M5: nem-regresszió (a túlszigorítás is bukjon) ──')

const PROXY_TULSZIGOR = mutans(
  'M5',
  PROXY,
  'if (ellenorzottFaktorok.length === 0) return false',
  'if (ellenorzottFaktorok.length === 0) return true',
)
if (PROXY_TULSZIGOR !== null) {
  try {
    const tulszigorMag = magBetoltes(PROXY_TULSZIGOR, 'túlszigor')
    const kizartEsetek = ESETEK.filter(
      (e) => e.vart === false && tulszigorMag.kellEMasodikFaktor(e.user, e.szint) === true,
    )
    jelent(
      'M5',
      kizartEsetek.length > 0,
      `a túlszigorító mutáns ${kizartEsetek.length} 2FA-mentes esetet zárna ki ` +
        `(pl. ${kizartEsetek.map((e) => e.nev).slice(0, 4).join(', ')}) — az M2 elkapja`,
    )
  } catch (err) {
    jelent('M5', false, `a túlszigorító mutáns mag nem tölthető be: ${err instanceof Error ? err.message : err}`)
  }
}

// Az élő magon ugyanezek az esetek ÁTMENNEK — ez a nem-regresszió bizonyítéka.
const elesAtengedett = ESETEK.filter((e) => e.vart === false)
jelent(
  'M5',
  elesAtengedett.every((e) => kellEMasodikFaktor(e.user, e.szint) === false),
  `az ÉLES mag mind a ${elesAtengedett.length} 2FA-mentes esetet átengedi`,
)

/* ══════════════════════════════════════════════════════════════════════════
   TÁJÉKOZTATÓ — él-e még a javítás indoka a telepített könyvtárban
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n── tájékoztató ──')
const AUTH_JS = olvas(REL.authJs)
if (AUTH_JS === null) {
  info('a @supabase/auth-js nincs telepítve — a könyvtár-ellenőrzés kimarad')
} else if (AUTH_JS.includes('session.user.factors')) {
  info(
    'a telepített @supabase/auth-js valóban a `session.user.factors` tömbből számolná ' +
      'a `nextLevel`-t argumentum nélkül — a javítás indoka ÉL',
  )
} else {
  info(
    'a telepített @supabase/auth-js már NEM a `session.user.factors`-ból számol — ' +
      'a javítás így is helyes (a szerver a hiteles forrás), de érdemes átnézni',
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   ÖSSZEGZÉS
   ══════════════════════════════════════════════════════════════════════════ */
try {
  fs.rmSync(tmp, { recursive: true, force: true })
} catch {
  // a temp-könyvtár takarítása nem befolyásolja az eredményt
}

if (hibak > 0) {
  console.log(`\n2FA-kapu önellenőrzés: HIBA — ${hibak} bukott mérce`)
  for (const u of bukottUzenetek) console.log(`   · ${u}`)
  process.exit(1)
}
console.log('\n2FA-kapu önellenőrzés: minden rendben ✅')
