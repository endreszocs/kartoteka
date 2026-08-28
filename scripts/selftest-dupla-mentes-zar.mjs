#!/usr/bin/env node
/**
 * DUPLA-MENTÉS ZÁR önellenőrzés (P0-9, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-9 találata:
 *   A közös rögzítő (CombinedEntryBody) Mentés gombjának egyetlen védelme a
 *   `disabled={busy}` volt, de a `setBusy(true)` csak a hasonló-tétel
 *   ellenőrzés `await`-je UTÁN futott le. A szerver-válaszra várakozás alatt a
 *   gomb aktív maradt: egy gyors második kattintás MÁSODIK teljes mentést
 *   indított, és mindkét ág beszúrt → duplikált bevétel/kiadás.
 *
 * A JAVÍTOTT VILÁG INVARIÁNSAI (ezeket őrizzük):
 *   (1) A handleSave legelején SZINKRON újra-belépési zár van (busyRef ref):
 *       `if (busyRef.current) return` — MINDEN await ELŐTT. Ref kell, mert a
 *       React state-frissítés aszinkron, a state önmagában nem véd a gyors
 *       második kattintás ellen.
 *   (2) A zár (busyRef.current = true + setBusy(true)) MEGELŐZI a
 *       hasonló-tétel ellenőrzést (onCheckSimilarEntries hívás).
 *   (3) A zár feloldása garantált: finally-ben busyRef.current = false ÉS
 *       setBusy(false) — így a hasonló-tétel modal korai return-je után a
 *       „Mégis rögzítem" újrahívás nem ragad be.
 *   (4) setBusy(true) és setBusy(false) PONTOSAN egyszer szerepel a fájlban
 *       (a wrapper zárjában) — a régi, kapu utáni belső pár kivezetve.
 *   (5) A „Mégis rögzítem" út (setHasonloMegerositve(true) + handleSave())
 *       továbbra is létezik.
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak):
 *   a RÉGI hibás világot a MAI forrásból állítjuk elő (a zár-sorok
 *   eltávolításával), és bizonyítjuk, hogy az őr elbuktatná. Ha a mutáció nem
 *   változtat a forráson, az önellenőrzés FAIL-CLOSED hibával áll le.
 *
 * Futtatás:  node scripts/selftest-dupla-mentes-zar.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const ROGZITO = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'CombinedEntryBody.tsx')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

/** Kommentek eltávolítása a szöveges őrök elől (URL-barát: a :// nem komment). */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * A zár-invariánsok ellenőrzése egy forrás-változaton.
 * Visszatérés: hibalista (üres = minden invariáns áll).
 */
function ellenoriz(src) {
  const s = stripComments(src)
  const hibak = []

  const iStart = s.indexOf('async function handleSave()')
  if (iStart < 0) {
    hibak.push('nincs `async function handleSave()` a rögzítőben')
    return hibak
  }

  const iGuard = s.indexOf('if (busyRef.current) return', iStart)
  const iLock = s.indexOf('busyRef.current = true', iStart)
  const iSetBusy = s.indexOf('setBusy(true)', iStart)
  const iAwait = s.indexOf('await ', iStart)
  const iCheck = s.indexOf('onCheckSimilarEntries(kerdesek)')

  if (iGuard < 0) hibak.push('nincs szinkron újra-belépési zár (`if (busyRef.current) return`) a handleSave-ben')
  if (iLock < 0) hibak.push('nincs `busyRef.current = true` zárfoglalás')
  if (iAwait >= 0) {
    if (iGuard >= 0 && iGuard > iAwait) hibak.push('az újra-belépési zár az első await UTÁN van — a várakozás alatt a mentés újraindítható')
    if (iLock >= 0 && iLock > iAwait) hibak.push('a busyRef zárfoglalás az első await UTÁN van')
    if (iSetBusy >= 0 && iSetBusy > iAwait) hibak.push('a setBusy(true) az első await UTÁN van — a gomb az ellenőrzés alatt aktív marad')
  }
  if (iCheck >= 0 && iLock >= 0 && iLock > iCheck) {
    hibak.push('a zár a hasonló-tétel ellenőrzés (onCheckSimilarEntries) UTÁN áll be — pont a hibás régi világ')
  }

  const release = /finally\s*\{[^}]*busyRef\.current = false[^}]*setBusy\(false\)[^}]*\}/.test(s)
  if (!release) hibak.push('nincs garantált feloldás (finally: busyRef.current = false + setBusy(false))')

  const setTrueDb = (s.match(/setBusy\(true\)/g) || []).length
  const setFalseDb = (s.match(/setBusy\(false\)/g) || []).length
  if (setTrueDb !== 1) hibak.push(`setBusy(true) ${setTrueDb}× szerepel (pontosan 1 kell: a wrapper zárja — a kapu utáni régi belső pár kivezetendő)`)
  if (setFalseDb !== 1) hibak.push(`setBusy(false) ${setFalseDb}× szerepel (pontosan 1 kell: a finally feloldás)`)

  if (!s.includes('setHasonloMegerositve(true)') || !/setHasonloMegerositve\(true\)[\s\S]{0,200}handleSave\(\)/.test(s)) {
    hibak.push('a „Mégis rögzítem" út (setHasonloMegerositve(true) → handleSave()) nem található')
  }

  return hibak
}

const src = fs.readFileSync(ROGZITO, 'utf8')

// ── (A) POZITÍV: a mai forráson minden invariáns áll ─────────────────────────
const hibak = ellenoriz(src)
if (hibak.length === 0) {
  pass('a rögzítő dupla-mentés zárja a helyén van (szinkron guard + zár a kapu előtt + finally feloldás)')
} else {
  for (const h of hibak) bukik(h)
}

// ── (B) NEGATÍV (mutánsok): a régi hibás világra az őr BUKIK ────────────────
// Csak akkor van értelme, ha a mai forrás átment — különben még a fix előtt vagyunk.
if (hibak.length === 0) {
  // M1: a zár eltávolítása (a fix előtti világ visszajátszása)
  const m1 = src
    .replace(/[ \t]*if \(busyRef\.current\) return\n/, '')
    .replace(/[ \t]*busyRef\.current = true\n/, '')
  if (m1 === src) {
    bukik('M1 mutáció nem változtatott a forráson — az önellenőrzés vak lenne (fail-closed)')
  } else if (ellenoriz(m1).length === 0) {
    bukik('M1: a zár eltávolítására az őr NEM bukik — az őrszem vak')
  } else {
    pass('M1 mutáns (zár eltávolítva) → az őr elbuktatja')
  }

  // M2: a feloldás eltávolítása (beragadó gomb-világ)
  const m2 = src.replace(/busyRef\.current = false/, '')
  if (m2 === src) {
    bukik('M2 mutáció nem változtatott a forráson (fail-closed)')
  } else if (ellenoriz(m2).length === 0) {
    bukik('M2: a feloldás eltávolítására az őr NEM bukik — az őrszem vak')
  } else {
    pass('M2 mutáns (feloldás nélkül) → az őr elbuktatja')
  }
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — dupla-mentés zár rendben`)
