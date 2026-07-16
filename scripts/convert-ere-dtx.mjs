#!/usr/bin/env node
/**
 * Erdélyi Református Énekeskönyv (ERE.dtx, Diatár formátum) → strukturált JSON konverter.
 *
 * BEMENET (1. CLI-argumentum, opcionális):
 *   "C:/Users/endre/Documents/APPS/Egyházi APP/Adatok/ERE.dtx"  (UTF-8, CRLF)
 *
 * KIMENET:
 *   packages/enekeskonyv/src/data/enekeskonyv.json
 *
 * Diatár formátum:
 *   ;szöveg      — komment (cím/szerző-metaadat, kihagyjuk)
 *   N/R/C sor    — gyűjtemény-metaadat a fájl elején (kihagyjuk)
 *   >szám[betű][. cím] — ének kezdete (1–150 genfi zsoltár cím nélkül: ">23";
 *                  dicséretek címmel: ">400a. Légy csendes szívvel…";
 *                  a pont utáni szóköz hiányozhat/duplázódhat: ">321.Ments meg…")
 *   >cím         — tematikus szakaszfejléc (szám nélkül, pl. ">Advent")
 *   /n           — versszak kezdete (n a versszak jele)
 *   #hex         — versszak-azonosító (kihagyjuk)
 *   ␣szöveg      — énekszöveg-sor (egy vezető szóközzel)
 *
 * VÁRT EREDMÉNY (a script assert-eli):
 *   513 ének (1–150 zsoltár + 151–504 dicséret), 18 betűs változat,
 *   44 tematikus szakaszfejléc, 2697 versszak, hiánytalan 1–504 lefedettség,
 *   duplikátum nélkül.
 *
 * FUTTATÁS:
 *   node scripts/convert-ere-dtx.mjs [ere.dtx útvonal]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')
const DEFAULT_INPUT = 'C:/Users/endre/Documents/APPS/Egyházi APP/Adatok/ERE.dtx'
const OUT_FILE = join(ROOT, 'packages', 'enekeskonyv', 'src', 'data', 'enekeskonyv.json')

// A zsoltárok (1–150) előtt nincs szakaszfejléc a fájlban — szintetikus szakasznevet kapnak.
const ZSOLTAR_SZAKASZ = 'Zsoltárok'

const inputPath = process.argv[2] ?? DEFAULT_INPUT
if (!existsSync(inputPath)) {
  console.error(`HIBA: nem található a bemeneti fájl: ${inputPath}`)
  process.exit(1)
}

const lines = readFileSync(inputPath, 'utf8').split(/\r\n|\n|\r/)

/** @type {{szam:number,betu:string|null,azonosito:string,cim:string|null,szakasz:string,versszakok:string[],elsoSor:string}[]} */
const enekek = []
/** Szakaszfejlécek a fájlbeli sorrendben (a nevek ismétlődhetnek, pl. "Karácsony" kétszer). */
const szakaszFejlecek = []

let aktualisSzakasz = ZSOLTAR_SZAKASZ
let aktualisEnek = null
let aktualisVersSorok = null
const ismeretlenSorok = []

function lezarVersszak() {
  if (aktualisEnek && aktualisVersSorok && aktualisVersSorok.length > 0) {
    aktualisEnek.versszakok.push(aktualisVersSorok.join('\n'))
  }
  aktualisVersSorok = null
}

function lezarEnek() {
  lezarVersszak()
  if (aktualisEnek) {
    aktualisEnek.elsoSor = (aktualisEnek.versszakok[0] ?? '').split('\n')[0] ?? ''
    enekek.push(aktualisEnek)
  }
  aktualisEnek = null
}

for (const sor of lines) {
  if (sor.trim() === '') continue
  const c = sor[0]

  if (c === ';' || c === '#') continue

  if (c === '>') {
    const m = sor.match(/^>(\d+)([a-zA-Z])?\.?\s*(.*)$/)
    if (m) {
      lezarEnek()
      const szam = Number(m[1])
      const betu = m[2] ? m[2].toLowerCase() : null
      const cim = m[3].trim() === '' ? null : m[3].trim()
      aktualisEnek = {
        szam,
        betu,
        azonosito: `${szam}${betu ?? ''}`,
        cim,
        szakasz: aktualisSzakasz,
        versszakok: [],
        elsoSor: '',
      }
    } else {
      // szám nélküli '>' sor = tematikus szakaszfejléc
      lezarEnek()
      aktualisSzakasz = sor.slice(1).trim()
      szakaszFejlecek.push(aktualisSzakasz)
    }
    continue
  }

  if (c === '/') {
    lezarVersszak()
    if (aktualisEnek) aktualisVersSorok = []
    continue
  }

  if (c === ' ') {
    if (aktualisVersSorok) {
      aktualisVersSorok.push(sor.slice(1).replace(/\s+$/, ''))
    }
    continue
  }

  // N/R/C fejléc-metaadat a fájl elején — kihagyjuk, de számoljuk (sanity)
  ismeretlenSorok.push(sor)
}
lezarEnek()

// ---------------------------------------------------------------------------
// Validáció
// ---------------------------------------------------------------------------
function assertEq(actual, expected, label) {
  if (actual !== expected) {
    console.error(`ASSERT HIBA: ${label} — várt: ${expected}, kapott: ${actual}`)
    process.exit(1)
  }
}

const osszVersszak = enekek.reduce((s, e) => s + e.versszakok.length, 0)
const betusValtozatok = enekek.filter((e) => e.betu !== null)

assertEq(enekek.length, 513, 'énekek száma')
assertEq(szakaszFejlecek.length, 44, 'tematikus szakaszfejlécek száma')
assertEq(betusValtozatok.length, 18, 'betűs változatok száma')
assertEq(osszVersszak, 2697, 'versszakok összesen')

// azonosító-duplikátum
const azonositok = new Set()
for (const e of enekek) {
  if (azonositok.has(e.azonosito)) {
    console.error(`ASSERT HIBA: duplikált azonosító: ${e.azonosito}`)
    process.exit(1)
  }
  azonositok.add(e.azonosito)
}

// 1–504 hiánytalan lefedettség; sima szám és betűs változat nem keveredhet
const szamok = new Map() // szam -> betűk halmaza ('' = sima)
for (const e of enekek) {
  if (!szamok.has(e.szam)) szamok.set(e.szam, new Set())
  szamok.get(e.szam).add(e.betu ?? '')
}
for (let n = 1; n <= 504; n++) {
  const betuk = szamok.get(n)
  if (!betuk) {
    console.error(`ASSERT HIBA: hiányzó énekszám: ${n}`)
    process.exit(1)
  }
  if (betuk.has('') && betuk.size > 1) {
    console.error(`ASSERT HIBA: a(z) ${n}. ének sima ÉS betűs változatként is létezik`)
    process.exit(1)
  }
}
assertEq(szamok.size, 504, 'lefedett énekszámok (1–504)')

// zsoltár/dicséret határ + tartalmi minimumok
for (const e of enekek) {
  if (e.versszakok.length === 0) {
    console.error(`ASSERT HIBA: versszak nélküli ének: ${e.azonosito}`)
    process.exit(1)
  }
  if (e.elsoSor === '') {
    console.error(`ASSERT HIBA: üres első sor: ${e.azonosito}`)
    process.exit(1)
  }
  if (e.szam >= 151 && e.cim === null) {
    console.error(`ASSERT HIBA: cím nélküli dicséret: ${e.azonosito}`)
    process.exit(1)
  }
}

if (ismeretlenSorok.length > 3) {
  console.error(`FIGYELEM: ${ismeretlenSorok.length} ismeretlen sor (várt: max 3 N/R/C fejléc):`)
  for (const s of ismeretlenSorok.slice(0, 10)) console.error(`  ${s}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Kimenet
// ---------------------------------------------------------------------------
const out = {
  forras: 'Erdélyi Református Énekeskönyv — Kolozsvár 1999 / Erdélyi Református Egyházkerület 2013 (ERE.dtx, Diatár)',
  szakaszok: szakaszFejlecek,
  enekek,
}

mkdirSync(dirname(OUT_FILE), { recursive: true })
writeFileSync(OUT_FILE, JSON.stringify(out, null, 1) + '\n', 'utf8')

const zsoltarok = enekek.filter((e) => e.szam <= 150).length
console.log('ERE.dtx konverzió KÉSZ ✔')
console.log(`  Énekek összesen:        ${enekek.length} (${zsoltarok} zsoltár + ${enekek.length - zsoltarok} dicséret)`)
console.log(`  Betűs változatok:       ${betusValtozatok.length} (${betusValtozatok.map((e) => e.azonosito).join(', ')})`)
console.log(`  Tematikus szakaszok:    ${szakaszFejlecek.length} fejléc (+ szintetikus "${ZSOLTAR_SZAKASZ}" az 1–150-nek)`)
console.log(`  Versszakok összesen:    ${osszVersszak}`)
console.log(`  Kimenet:                ${OUT_FILE}`)
