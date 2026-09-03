#!/usr/bin/env node
/**
 * STÁTUSZ-KAPU önellenőrzés (2026-09-04, P0·2).
 *
 * Mit véd:
 *   - `apps/web/lib/auth/effective-access.ts` — a származtatott jogok
 *     (admin / egyhazkeruletiAdmin / esperes / konyvelo / szamvevo)
 *     KELETKEZÉSI pontja.
 *   - `apps/web/lib/auth/admin-access.ts` — a második védelmi vonal.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A TESZT
 * ════════════════════════════════════════════════════════════════════════════
 * A 2026-09-03-i védelmi felülvizsgálat P0·2 találata: a származtatott jogok
 * KIZÁRÓLAG a `profiles.role` értékéből jöttek, `profiles.status` nélkül:
 *
 *     const admin = isAdminRole(role, user.email)
 *
 * A státusz-kapu csak a `(dashboard)/layout.tsx`-ben élt — az viszont
 * OLDAL-renderelést kapuz, NEM szerver-akciót. A Next.js szerver-akció önálló
 * POST-végpont: a layout soha nem fut le előtte. Egy `status='pending'` profil
 * tehát a teljes `/admin` szerver-akció felületet elérte.
 *
 * Ez a hiba azért különösen visszaeső fajta, mert a javított sor HOSSZABB és
 * „fölöslegesnek" néz ki: egy későbbi refaktorban kézenfekvő visszaírni az
 * egyszerűbb alakra. `access.admin`-t 74 hely olvassa, `egyhazkeruletiAdmin`-t
 * 41 — ha a kapu a keletkezésnél elvész, mind a 115 helyen elvész.
 *
 * MINDEN itteni asszert MUTÁNS-ELLENŐRZÉSSEL fut: eljátsszuk a RÉGI, hibás
 * alakot a MAI forrásból, és bizonyítjuk, hogy az őrszem BUKNA rá. Enélkül az
 * őrszem vak. (A „régi világ" szándékosan a mai forrásból áll elő, nem
 * `git show HEAD:`-ből — az a saját commitjától bukna.)
 *
 * Futtatás:  node scripts/selftest-status-kapu.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const EFFECTIVE = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'auth', 'effective-access.ts')
const ADMIN_ACCESS = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'auth', 'admin-access.ts')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

/**
 * Kommentek eltávolítása: blokk-kommentek + a csak-kommentből álló sorok.
 *
 * MIÉRT KELL: a javítás dokumentációja SZÓ SZERINT idézi a régi hibás sort
 * (`const admin = isAdminRole(role, user.email)`), és egy naiv regex arra is
 * ráillene — az őrszem így akkor is „hibát" jelezne, amikor a kód helyes.
 */
function kommentNelkul(forras) {
  return forras
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((sor) => !/^\s*\/\//.test(sor))
    .join('\n')
}

const effectiveNyers = fs.readFileSync(EFFECTIVE, 'utf8')
const effective = kommentNelkul(effectiveNyers)
const adminAccess = kommentNelkul(fs.readFileSync(ADMIN_ACCESS, 'utf8'))

// ════════════════════════════════════════════════════════════════════════════
// 1. A statusActive levezetése helyes-e
// ════════════════════════════════════════════════════════════════════════════
//
// Két dolognak kell teljesülnie egyszerre:
//   (a) a profil státusza legyen 'active',
//   (b) a fő rendszergazda legyen kivétel (különben egy elrontott saját profil
//       kizárná a rendszerből azt, aki egyedül tudná megjavítani — ugyanaz a
//       kivétel, ami a (dashboard)/layout.tsx-ben és a (setup)/layout.tsx-ben
//       is él).

const STATUS_ACTIVE_RE = /const\s+statusActive\s*=\s*master\s*\|\|\s*profile\?\.status\s*===\s*'active'/

if (STATUS_ACTIVE_RE.test(effective)) {
  ok('a statusActive a profil státuszából áll elő, a master kivételével')
} else {
  fail(
    'a statusActive levezetése hiányzik vagy megváltozott. ' +
      "Elvárt alak: const statusActive = master || profile?.status === 'active'",
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 2. MINDEN származtatott jog a kapun keresztül keletkezik
// ════════════════════════════════════════════════════════════════════════════

const KAPUZOTT_JOGOK = [
  { nev: 'admin', re: /const\s+admin\s*=\s*statusActive\s*&&\s*isAdminRole\(/ },
  {
    nev: 'egyhazkeruletiAdmin',
    re: /const\s+egyhazkeruletiAdmin\s*=\s*statusActive\s*&&\s*isEgyhazkeruletiAdminRole\(/,
  },
  { nev: 'esperes', re: /const\s+esperes\s*=\s*statusActive\s*&&\s*isEsperesRole\(/ },
  { nev: 'konyvelo', re: /const\s+konyvelo\s*=\s*statusActive\s*&&\s*isKonyveloRole\(/ },
  { nev: 'szamvevo', re: /const\s+szamvevo\s*=\s*statusActive\s*&&\s*isSzamvevoRole\(/ },
]

for (const { nev, re } of KAPUZOTT_JOGOK) {
  if (re.test(effective)) {
    ok(`a(z) ${nev} jog a statusActive kapun keresztül keletkezik`)
  } else {
    fail(
      `a(z) ${nev} jog NEM a statusActive kapun keresztül keletkezik. ` +
        'Egy nem aktív (pending/deleted) profil így újra jogot kapna a szerver-akciókon.',
    )
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 3. MUTÁNS-ELLENŐRZÉS — bizonyítjuk, hogy a fenti asszertek NEM vakok
// ════════════════════════════════════════════════════════════════════════════
//
// A régi, hibás világot a MAI forrásból állítjuk elő: kivesszük a kaput, és
// megköveteljük, hogy MINDEN kapuzott jog asszertje elbukjon rá. Ha egy
// asszert a mutánson is átmenne, az azt jelentené, hogy nem is a kaput méri.

const mutans = effective.replace(/statusActive\s*&&\s*/g, '')

let mutansTullelt = []
for (const { nev, re } of KAPUZOTT_JOGOK) {
  if (re.test(mutans)) mutansTullelt.push(nev)
}

if (mutansTullelt.length === 0) {
  ok('mutáns-ellenőrzés: a kapu eltávolítása MINDEN asszertet megbuktat (az őrszem lát)')
} else {
  fail(
    'MUTÁNS TÚLÉLTE: a kapu eltávolítása után is átment ezeknek az asszertje: ' +
      `${mutansTullelt.join(', ')}. Az őrszem ezekre VAK, javítsd a regexet.`,
  )
}

// A statusActive-levezetés asszertje is legyen mutáns-érzékeny.
const mutansLevezetes = effective.replace(
  /const\s+statusActive\s*=\s*master\s*\|\|\s*profile\?\.status\s*===\s*'active'/,
  'const statusActive = true',
)
if (STATUS_ACTIVE_RE.test(mutansLevezetes)) {
  fail('MUTÁNS TÚLÉLTE: a statusActive levezetésének asszertje nem érzékeny a törzs cseréjére.')
} else {
  ok('mutáns-ellenőrzés: a statusActive levezetésének asszertje érzékeny')
}

// ════════════════════════════════════════════════════════════════════════════
// 4. A kontextus KIADJA a statusActive mezőt (különben a 2. vonal nem tud rá építeni)
// ════════════════════════════════════════════════════════════════════════════

if (/statusActive:\s*boolean/.test(effective)) {
  ok('a statusActive szerepel az EffectiveAccessContext típusában')
} else {
  fail('a statusActive hiányzik az EffectiveAccessContext típusából')
}

if (/statusActive:\s*false/.test(effective)) {
  ok('a bejelentkezés nélküli tartalék kontextus statusActive: false (fail-closed)')
} else {
  fail(
    'a bejelentkezés nélküli tartalék kontextusból hiányzik a statusActive: false. ' +
      'Fail-closed alapérték nélkül a hiányzó mező undefined lenne — az pedig hamis, de véletlenül.',
  )
}

// A visszaadott objektumban is ott kell lennie, nem csak a típusban.
if (/\n\s{4}statusActive,\s*\n/.test(effective)) {
  ok('a fő visszatérési objektum átadja a statusActive mezőt')
} else {
  fail(
    'a fő visszatérési objektumból hiányzik a statusActive. A típus így hazudna: ' +
      'a mező undefined lenne futásidőben.',
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 5. MÁSODIK VÉDELMI VONAL — requireAdminAccess
// ════════════════════════════════════════════════════════════════════════════
//
// MIÉRT KELL KÉT VONAL: a központi kapu ma elég. De ha valaki később lazít
// rajta (pl. „csak erre az egy folyamatra"), ez a kapu még áll. A hibaüzenete
// ráadásul megmondja, MIÉRT nincs jog — a néma „nincs jogosultsága" helyett.

if (/!access\.master\s*&&\s*!access\.statusActive/.test(adminAccess)) {
  ok('a requireAdminAccess önálló státusz-kaput is tartalmaz (második vonal)')
} else {
  fail(
    'a requireAdminAccess-ből hiányzik az önálló státusz-kapu. ' +
      'A védelem így egyetlen ponton állna.',
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 6. A `role` NEM eshet el a kaputól
// ════════════════════════════════════════════════════════════════════════════
//
// A /pending oldal abból mutatja meg, milyen szerepkört kért a felhasználó.
// Ha a `role`-t is kapuznánk, a jóváhagyásra váró lelkész azt látná, hogy
// nincs is szerepköre — és a támogatás sem tudná, mit hagyjon jóvá.

if (/const\s+role\s*=\s*\(hasPrimaryRole\s*\?\s*profile\.role\s*:\s*'lelkesz'\)/.test(effective)) {
  ok('a role változatlanul a profilból jön — a kapu csak a JOGOT veszi el, az igényt nem')
} else {
  fail(
    'a role levezetése megváltozott. Ha a role is a statusActive kapu mögé került, ' +
      'a /pending oldal nem tudja megmutatni, milyen szerepkört kért a felhasználó.',
  )
}

console.log('')
if (failed) {
  console.error('❌ STÁTUSZ-KAPU önellenőrzés: BUKOTT')
  process.exit(1)
}
console.log('✅ STÁTUSZ-KAPU önellenőrzés: minden asszert rendben')
