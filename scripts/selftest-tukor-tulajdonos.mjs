#!/usr/bin/env node
/**
 * DESKTOP TÜKÖR-TULAJDONOS önellenőrzés (P1-4 / B-blokk, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P1-4 találata:
 * a desktop lokális SQLCipher-tükre kijelentkezés / felhasználó-váltás után a
 * lemezen maradt. Közös Windows-loginon: A user (X gyülekezet) kijelentkezik,
 * B user (Y gyülekezet) belép → X pénzügyi + tag-adatai a helyi DB-ben
 * maradnak, és B az alkalmazáson keresztül eléri őket.
 *
 * A JAVÍTÁS: tulajdonos-jelölő a lokális DB-ben (local_meta). Az auth-gate a
 * belépő user beengedése ELŐTT lefuttatja az ensureLocalMirrorOwner-t:
 *   - más tulajdonos → MINDEN lokális tábla kiürül (sqlite_master-enumeráció,
 *     így a jövőben létrejövő tükör-táblák is), új tulajdonos bejegyezve;
 *   - nincs jelölő (frissítés utáni első belépés) → ha a tárolt lastUser
 *     UGYANEZ a személy, örökbefogadás törlés NÉLKÜL (a függő offline adat
 *     nem veszhet el); különben fail-closed törlés;
 *   - a kapu SPINNERT mutat, amíg az ellenőrzés fut — az új belépő egyetlen
 *     lekérdezést sem futtat a régi tükrön.
 * Kijelentkezéskor NEM törlünk — a saját, még fel nem töltött offline adat
 * újra-belépésig megmarad.
 *
 * NEGATÍV ASSZERT: kapu-eltávolító + wipe-vakító mutánsok.
 *
 * Futtatás:  node scripts/selftest-tukor-tulajdonos.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const OWNER = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'local-mirror-owner.ts')
const GATE = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'auth-gate.tsx')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function ellenoriz(files) {
  const hibak = []

  // ── (1) a tulajdonos-modul ──
  if (!files.has(OWNER)) {
    hibak.push('local-mirror-owner.ts HIÁNYZIK — nincs tulajdonos-ellenőrzés')
    return hibak
  }
  const o = stripComments(files.get(OWNER))
  if (!/FROM sqlite_master\b/i.test(o)) {
    hibak.push('a wipe nem a sqlite_master-ből enumerál — egy új tükör-tábla kimaradna a törlésből')
  }
  if (!/DELETE FROM/i.test(o)) {
    hibak.push('a wipe nem ürít táblát (DELETE FROM hiányzik)')
  }
  if (!/local_meta/.test(o)) {
    hibak.push('nincs local_meta jelölő-tábla — a tulajdonos nem tárolódik')
  }
  if (!/getLastUser\(/.test(o)) {
    hibak.push('a null-jelölős örökbefogadási ág (getLastUser egyezés) hiányzik — frissítés után a saját függő adat is törlődne')
  }

  // ── (2) az auth-gate kapuzása ──
  const g = stripComments(files.get(GATE))
  if (!/ensureLocalMirrorOwner\(/.test(g)) {
    hibak.push('auth-gate: az ensureLocalMirrorOwner nincs bekötve — a belépő a régi tükröt látja')
  }
  // A session-ág Outlet-je csak az ellenőrzött user-rel egyező state után jöhet.
  if (!/tukorOwnerOk !== session\.user\.id/.test(g)) {
    hibak.push('auth-gate: a session-ág nincs a tulajdonos-ellenőrzéshez kötve (spinner-kapu hiányzik)')
  }
  // Az offline (PIN) ág is kapuzott.
  if (!/offlineActive/.test(g) || !/tukorOwnerOk !== offlineUid/.test(g)) {
    hibak.push('auth-gate: az offline (PIN) ág nincs a tulajdonos-ellenőrzéshez kötve')
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  m.set(GATE, fs.readFileSync(GATE, 'utf8'))
  if (fs.existsSync(OWNER)) m.set(OWNER, fs.readFileSync(OWNER, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('tükör-tulajdonos: jelölő + generikus wipe + kapuzott beengedés a helyén')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: az ellenőrzés kikötése az auth-gate-ből
  const m1files = beolvas()
  const g1 = m1files.get(GATE)
  const g1mut = g1.replace(/ensureLocalMirrorOwner\(/g, 'ensureLocalMirrorOwner_KIKAPCSOLVA(')
  m1files.set(GATE, g1mut)
  if (g1mut === g1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1files).length === 0) bukik('M1: a kapu kikötésére az őr NEM bukik — vak')
  else pass('M1 mutáns (ensure kikötve a gate-ből) → az őr elbuktatja')

  // M2: a wipe enumerációjának vakítása
  const m2files = beolvas()
  const o2 = m2files.get(OWNER)
  const o2mut = o2.replace(/sqlite_master/g, 'sqlite_master_KIKAPCSOLVA')
  m2files.set(OWNER, o2mut)
  if (o2mut === o2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2files).length === 0) bukik('M2: a wipe-vakításra az őr NEM bukik — vak')
  else pass('M2 mutáns (sqlite_master enumeráció kilőve) → az őr elbuktatja')

  // M3: a session-ági spinner-kapu kiütése
  const m3files = beolvas()
  const g3 = m3files.get(GATE)
  const g3mut = g3.replace(/tukorOwnerOk !== session\.user\.id/, 'false')
  m3files.set(GATE, g3mut)
  if (g3mut === g3) bukik('M3 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m3files).length === 0) bukik('M3: a spinner-kapu kiütésére az őr NEM bukik — vak')
  else pass('M3 mutáns (session-ági kapu kiütve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — tükör-tulajdonos rendben`)
