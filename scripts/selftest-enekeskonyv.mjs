#!/usr/bin/env node
/**
 * @kartoteka/enekeskonyv önellenőrzés — a GENERÁLT JSON-adatot validálja.
 *
 * A TS kereső API-t (getEnek/searchEnek/normalizeSearchText) a monorepo typecheckje
 * fedi; natív `node --test` futtatás nem lehetséges, mert az index.ts a repo-minta
 * szerinti resolveJsonModule-os JSON-importot használ (bundler-barát), amihez a
 * Node ESM `with { type: 'json' }` attribútumot követelne.
 *
 * FUTTATÁS:
 *   node scripts/selftest-enekeskonyv.mjs
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')
const JSON_PATH = join(ROOT, 'packages', 'enekeskonyv', 'src', 'data', 'enekeskonyv.json')

const data = JSON.parse(readFileSync(JSON_PATH, 'utf8'))
const { szakaszok, enekek } = data

let hibak = 0
function check(feltetel, uzenet) {
  if (feltetel) {
    console.log(`  ✔ ${uzenet}`)
  } else {
    console.error(`  ✖ HIBA: ${uzenet}`)
    hibak++
  }
}

console.log(`Önellenőrzés: ${JSON_PATH}`)

// --- Darabszámok -----------------------------------------------------------
check(enekek.length === 513, `513 ének (kapott: ${enekek.length})`)
const osszVersszak = enekek.reduce((s, e) => s + e.versszakok.length, 0)
check(osszVersszak === 2697, `2697 versszak (kapott: ${osszVersszak})`)
const betusok = enekek.filter((e) => e.betu !== null)
check(betusok.length === 18, `18 betűs változat (kapott: ${betusok.length})`)
check(szakaszok.length === 44, `44 tematikus szakaszfejléc (kapott: ${szakaszok.length})`)

// --- Egyediség + lefedettség -----------------------------------------------
const azonositok = new Set(enekek.map((e) => e.azonosito))
check(azonositok.size === enekek.length, 'nincs duplikált azonosító')

const szamok = new Set(enekek.map((e) => e.szam))
const hianyzo = []
for (let n = 1; n <= 504; n++) if (!szamok.has(n)) hianyzo.push(n)
check(hianyzo.length === 0, `hiánytalan 1–504 lefedettség${hianyzo.length ? ` (hiányzik: ${hianyzo.join(', ')})` : ''}`)

// --- Betűs változatok ------------------------------------------------------
check(azonositok.has('400a') && azonositok.has('400b'), '400a és 400b létezik')
check(!azonositok.has('400'), "sima '400' nem létezik (csak a/b változat)")
check(azonositok.has('152a') && !azonositok.has('152'), "152a létezik, sima '152' nincs")

// --- Tartalmi minta: 23. zsoltár -------------------------------------------
const zsoltar23 = enekek.find((e) => e.azonosito === '23')
check(!!zsoltar23, 'a 23. zsoltár megvan')
check(zsoltar23?.cim === null, 'a 23. zsoltárnak nincs címe (genfi zsoltár)')
check(zsoltar23?.szakasz === 'Zsoltárok', `a 23. zsoltár szakasza "Zsoltárok" (kapott: ${zsoltar23?.szakasz})`)
check(
  zsoltar23?.elsoSor === 'Az Úr énnékem őriző pásztorom,',
  `a 23. zsoltár első sora értelmes (kapott: "${zsoltar23?.elsoSor}")`
)
check(zsoltar23?.versszakok.length === 3, `a 23. zsoltár 3 versszakos (kapott: ${zsoltar23?.versszakok.length})`)

// --- Szerkezeti minimumok --------------------------------------------------
check(
  enekek.every((e) => e.versszakok.length > 0 && e.elsoSor.length > 0),
  'minden énekben van versszak és első sor'
)
check(
  enekek.filter((e) => e.szam >= 151).every((e) => typeof e.cim === 'string' && e.cim.length > 0),
  'minden dicséretnek (151–504) van címe'
)
check(
  enekek.every((e) => e.azonosito === `${e.szam}${e.betu ?? ''}`),
  'az azonosító mindenütt szam+betu'
)

if (hibak > 0) {
  console.error(`\nÖNELLENŐRZÉS SIKERTELEN — ${hibak} hiba.`)
  process.exit(1)
}
console.log('\nÖnellenőrzés SIKERES ✔ (513 ének, 2697 versszak, 18 betűs változat, 44 szakasz)')
