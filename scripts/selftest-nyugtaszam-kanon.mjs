#!/usr/bin/env node
/**
 * NYUGTASZÁM-KÁNON önellenőrzés (D3 / D-blokk, 2026-08-29)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P2-találata: NÉGY párhuzamos
 * nyugtaszám-generátor élt, ELTÉRŐ szűrőkkel — ugyanarra az állapotra
 * különböző következő számot adtak. A KÁNON a befizetés-oldali core
 * generátor 2026-08-11-es hármas javítása (S3-#12 + 2026-06-30 döntések):
 *   (1) LAPOZOTT lekérés (a PostgREST 1000-es plafonja némán levágná a MAX-ot),
 *   (2) készpénz = `bankszamla_id IS NULL` (NEM az irattipus szövege —
 *       az importált nyugták irattipusa tetszőleges),
 *   (3) a STORNÓZOTT szám újra kiadható → nem tolja a MAX-ot
 *       (`.or('stornozott.eq.false,stornozott.is.null')` — a régi sorokban NULL).
 * ÉS ugyanez a szemantika a DUP-CHECK-ekben: a stornózott sor NEM duplikátum
 * (eddig a generátor felajánlotta a stornózott számot, a dup-check meg
 * elutasította — desktop zsákutca).
 *
 * NEGATÍV ASSZERT: kánon-visszabontó mutánsok.
 *
 * Futtatás:  node scripts/selftest-nyugtaszam-kanon.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const KIA_GEN = path.join(REPO, 'packages', 'core', 'src', 'finance', 'kiadas', 'next-receipt-number.ts')
const BEF_GEN = path.join(REPO, 'packages', 'core', 'src', 'finance', 'befizetes', 'next-receipt-number.ts')
const BEF_DUP = path.join(REPO, 'packages', 'core', 'src', 'finance', 'befizetes', 'check-receipt-duplicate.ts')
const KIA_DUP = path.join(REPO, 'packages', 'core', 'src', 'finance', 'kiadas', 'check-receipt-duplicate.ts')
const DESK = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'finance-entry-lookups.ts')

const STORNO_SZURO = ".or('stornozott.eq.false,stornozott.is.null')"

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

  // (1) a kiadás-generátor a kánon szerint
  const kg = stripComments(files.get(KIA_GEN))
  if (!/selectAllPaged/.test(kg)) hibak.push('kiadás-generátor: nincs lapozás — 1000+ tételnél újra kiadott szám')
  if (/ilike\('irattipus'/.test(kg)) hibak.push('kiadás-generátor: még az irattipus-szöveg azonosítja a készpénzt — az importált tételek kimaradnak')
  if (!/\.is\('bankszamla_id', null\)/.test(kg)) hibak.push('kiadás-generátor: nincs kanonikus kassza-szűrő (bankszamla_id IS NULL)')
  if (!kg.includes(STORNO_SZURO)) hibak.push('kiadás-generátor: a stornózott szám tolja a MAX-ot (S3-#12 sérül)')

  // (2) a befizetés-generátor kánonja NEM bomolhat vissza
  const bg = stripComments(files.get(BEF_GEN))
  if (!/selectAllPaged/.test(bg) || !bg.includes(STORNO_SZURO) || !/\.is\('bankszamla_id', null\)/.test(bg)) {
    hibak.push('befizetés-generátor: a kánon visszabomlott')
  }

  // (3) a dup-checkek a stornózott sort NEM számítják duplikátumnak.
  //     ⚠️ 2026-08-31: LEKÉRDEZÉSENKÉNT mérünk, nem fájlonként. A fájlban immár KÉT
  //     lekérdezés van (egyszemélyes + KÖTEGES előellenőrzés); a „van-e valahol a
  //     fájlban" alakú asszert az egyikük vakítására már nem bukott volna el.
  for (const [nev, fajl, tabla] of [
    ['befizetés dup-check', BEF_DUP, 'befizetes'],
    ['kiadás dup-check', KIA_DUP, 'kiadas'],
  ]) {
    const s = stripComments(files.get(fajl))
    const lekerdezesek = (s.match(new RegExp(`\\.from\\('${tabla}'\\)`, 'g')) || []).length
    const szurok = (s.match(/\.or\('stornozott\.eq\.false,stornozott\.is\.null'\)/g) || []).length
    if (lekerdezesek === 0) {
      hibak.push(`${nev}: nem található lekérdezés (fail-closed)`)
    } else if (szurok < lekerdezesek) {
      hibak.push(`${nev}: ${lekerdezesek} lekérdezésből csak ${szurok} szűri ki a stornózott sort — az egyszemélyes és a KÖTEGES változat széthúzott, az előellenőrzés mást mondana, mint a mentés`)
    }
  }

  // (4) a desktop nextReceiptNumbersOnline mindhárom lekérdezése stornó-szűrős
  const d = stripComments(files.get(DESK))
  const iFn = d.indexOf('nextReceiptNumbersOnline')
  const fn = iFn >= 0 ? d.slice(iFn, iFn + 6000) : ''
  const db = (fn.match(/\.or\('stornozott\.eq\.false,stornozott\.is\.null'\)/g) || []).length
  if (db < 3) {
    hibak.push(`desktop nextReceiptNumbersOnline: a stornó-szűrő ${db}× van meg (várt: 3×) — a desktop mást ajánl, mint a web`)
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const fp of [KIA_GEN, BEF_GEN, BEF_DUP, KIA_DUP, DESK]) m.set(fp, fs.readFileSync(fp, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('nyugtaszám-kánon: generátorok + dup-checkek + desktop egy szemantikán')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a kiadás-generátor stornó-szűrőjének törlése
  const m1files = beolvas()
  const k1 = m1files.get(KIA_GEN)
  const k1mut = k1.replace(".or('stornozott.eq.false,stornozott.is.null')", '')
  m1files.set(KIA_GEN, k1mut)
  if (k1mut === k1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1files).length === 0) bukik('M1: a stornó-szűrő törlésére az őr NEM bukik — vak')
  else pass('M1 mutáns (kiadás-generátor stornó-szűrő törölve) → az őr elbuktatja')

  // M2: a dup-check visszavakítása — SZÁNDÉKOSAN csak az ELSŐ előfordulás
  //     (`replace`, nem `replaceAll`): éppen azt játssza vissza, amikor a köteges
  //     és az egyszemélyes lekérdezés SZÉTHÚZ egymástól.
  const m2files = beolvas()
  const b2 = m2files.get(BEF_DUP)
  const b2mut = b2.replace(".or('stornozott.eq.false,stornozott.is.null')", '')
  m2files.set(BEF_DUP, b2mut)
  if (b2mut === b2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2files).length === 0) bukik('M2: a dup-check vakítására az őr NEM bukik — vak')
  else pass('M2 mutáns (dup-check stornó-szűrő törölve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — nyugtaszám-kánon rendben`)
