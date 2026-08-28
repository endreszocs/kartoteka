#!/usr/bin/env node
/**
 * XKEY-IDEMPOTENCIA önellenőrzés (P0-10, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-10 találata:
 *   A desktop push-workerek retry-a szerveroldali idempotencia-kulcs nélkül
 *   futott: ha az insert SIKERÜLT, de a HTTP-válasz elveszett (timeout), a
 *   következő futás UGYANAZT a payloadot MÁSODSZOR is beszúrta. A nem
 *   'Készpénz' irattípusú sorokon semmilyen DB-index nem védett — néma
 *   duplikátum keletkezett. (Az éles diagnosztika 0 xkey-ütközést mért.)
 *
 * A JAVÍTOTT VILÁG:
 *   (1) mindkét pusher az insert ELŐTT xkey-alapú idempotencia-kaput futtat:
 *       ha a szerveren már van sor ezzel a kliens-generált xkey-jel, a tételt
 *       SIKERKÉNT zárja (markSynced + Excel-enqueue + mutation törlés),
 *       insert nélkül; a kapu hibája fail-closed retry (nem vak insert),
 *   (2) a védelmi mélységhez UNIQUE index SQL készült (Endre futtatja):
 *       migration-docs/sql/2026-08-28-xkey-unique-index.sql.
 *
 * NEGATÍV ASSZERT: a kapu törlése a befizetés-pusherből.
 *
 * Futtatás:  node scripts/selftest-xkey-idempotencia.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const PUSHEREK = [
  ['befizetes', path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'befizetes-write-sync.ts'), "'befizetes'", 'markBefizetesSynced'],
  ['kiadas', path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'kiadas-write-sync.ts'), "'kiadas'", 'markKiadasSynced'],
]
const SQL = path.join(REPO, 'migration-docs', 'sql', '2026-08-28-xkey-unique-index.sql')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function ellenorizPusher(nev, src, tabla, markFn) {
  const s = stripComments(src)
  const hibak = []
  const iKapu = s.indexOf(".eq('xkey', xkeyErtek)")
  const iInsert = s.indexOf(`.from(${tabla})\n        .insert(payload)`)
  const iInsertAlt = iInsert >= 0 ? iInsert : s.indexOf('.insert(payload)')
  if (iKapu < 0) {
    hibak.push(`${nev}-pusher: nincs xkey-alapú idempotencia-kapu — elveszett válasz utáni retry duplikál`)
    return hibak
  }
  if (iInsertAlt > 0 && iKapu > iInsertAlt) {
    hibak.push(`${nev}-pusher: az idempotencia-kapu az insert UTÁN van`)
  }
  const blokk = s.slice(iKapu, iKapu + 2200)
  if (!/letezo\.error/.test(blokk)) {
    hibak.push(`${nev}-pusher: a kapu lekérdezési hibája nincs fail-closed kezelve (vak insert)`)
  }
  if (!blokk.includes(markFn)) {
    hibak.push(`${nev}-pusher: a már-fent-lévő tétel nem záródik sikerként (${markFn} hiányzik a kapu-ágból)`)
  }
  return hibak
}

let osszHiba = 0
for (const [nev, fajl, tabla, markFn] of PUSHEREK) {
  const hibak = ellenorizPusher(nev, fs.readFileSync(fajl, 'utf8'), tabla, markFn)
  osszHiba += hibak.length
  if (hibak.length === 0) pass(`${nev}-pusher: xkey-idempotencia-kapu az insert előtt (fail-closed + siker-lezárás)`)
  else for (const h of hibak) bukik(h)
}

// A védelmi mélység SQL-je létezik és mindkét táblára UNIQUE indexet ad
if (!fs.existsSync(SQL)) {
  bukik('az xkey UNIQUE index SQL (migration-docs/sql/2026-08-28-xkey-unique-index.sql) hiányzik')
  osszHiba++
} else {
  const sqlS = fs.readFileSync(SQL, 'utf8')
  if (!/UNIQUE INDEX IF NOT EXISTS uniq_befizetes_xkey/.test(sqlS) || !/UNIQUE INDEX IF NOT EXISTS uniq_kiadas_xkey/.test(sqlS)) {
    bukik('az SQL nem hoz létre UNIQUE indexet mindkét (befizetes+kiadas) xkey-re')
    osszHiba++
  } else {
    pass('a védelmi-mélység SQL kész (uniq_befizetes_xkey + uniq_kiadas_xkey)')
  }
}

// ── NEGATÍV — mutáns ────────────────────────────────────────────────────────
if (osszHiba === 0) {
  const [nev, fajl, tabla, markFn] = PUSHEREK[0]
  const src = fs.readFileSync(fajl, 'utf8')
  const m1 = src.replace(/\.eq\('xkey', xkeyErtek\)/, ".eq('xkey_KIKAPCSOLVA', xkeyErtek)")
  if (m1 === src) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenorizPusher(nev, m1, tabla, markFn).length === 0) bukik('M1: a kapu kiütésére az őr NEM bukik — vak')
  else pass('M1 mutáns (xkey-kapu kiütve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — xkey-idempotencia rendben`)
