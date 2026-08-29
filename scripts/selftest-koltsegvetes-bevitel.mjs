#!/usr/bin/env node
/**
 * KÖLTSÉGVETÉS-BEVITEL önellenőrzés (2026-08-30, Endre kérése)
 *
 * MIT ŐRIZ: „ha írom be az értékeket, akkor 3 számjegyenként hagyjon egy kis
 * szünetet" — a Terv (RON) mező gépelés KÖZBEN ezres-csoportokkal jelenik meg
 * (szóköz), tizedes vesszővel.
 *   (1) a TervOsszegInput létezik, és a formázás 3-as csoportokat képez;
 *   (2) a VISSZAFEJTÉS (parse) a szóközöket eltávolítja és a vesszőt pontra
 *       váltja — különben a beírt „50 000" hibás számként mentődne;
 *   (3) a kurzor-pozíció a formázás után helyreáll (jelentős-karakter számlálás);
 *   (4) külső érték-változás (pl. „Alap költségvetés") fókusz NÉLKÜL átveszi
 *       a mezőt — fókusz alatt nem írjuk át a gépelést a kéz alól.
 *
 * NEGATÍV ASSZERT: az elrontott világot visszajátszó mutánsok (B1–B2).
 *
 * Futtatás:  node scripts/selftest-koltsegvetes-bevitel.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const BODY = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'BudgetTab.tsx')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function ablak(src, jelzo, vegJelzok) {
  const start = src.indexOf(jelzo)
  if (start < 0) return null
  let end = src.length
  for (const v of vegJelzok) {
    const i = src.indexOf(v, start + jelzo.length)
    if (i >= 0 && i < end) end = i
  }
  return src.slice(start, end)
}

function asszertek(rawSrc, jelent) {
  const src = stripComments(rawSrc)
  let helyi = 0
  const hiba = (msg) => { helyi++; if (jelent) bukik(msg) }
  const jo = (msg) => { if (jelent) pass(msg) }

  const komp = ablak(src, 'function TervOsszegInput', ['\nexport function', '\nfunction BudgetTab'])
  if (!komp) {
    hiba('nincs TervOsszegInput a BudgetTab-ban (a csoportosított bevitel hiányzik)')
    return helyi
  }
  // (1) 3-as csoportosítás gépelés közben
  if (komp.includes('{3}') && komp.includes("' '")) {
    jo('bevitel: 3 számjegyenként szóköz-csoport a gépelés közben')
  } else {
    hiba('a TervOsszegInput nem képez 3-as szóköz-csoportokat')
  }
  // (2) parse: szóköz ki, vessző → pont (különben hibás szám mentődne!)
  if (komp.includes("replace(/\\s/g, '')") && komp.includes("replace(',', '.')")) {
    jo('visszafejtés: szóköz eltávolítva, vessző → pont (a mentett szám helyes)')
  } else {
    hiba('a visszafejtés nem távolítja el a szóközt / nem váltja a vesszőt — HIBÁS szám mentődne')
  }
  // (3) kurzor-helyreállítás
  if (komp.includes('setSelectionRange(')) {
    jo('kurzor: a formázás után helyreáll (nem ugrik a sor végére)')
  } else {
    hiba('nincs kurzor-helyreállítás — gépelés közben a kurzor elugrana')
  }
  // (4) külső érték csak fókusz nélkül írhatja át a mezőt
  if (komp.includes('fokusz') && komp.includes('useEffect')) {
    jo('külső érték-változás csak fókusz nélkül veszi át a mezőt')
  } else {
    hiba('a külső érték fókusz alatt is átírná a gépelést')
  }
  // (5) a régi type="number" Terv-input eltűnt (szóközt nem tudna mutatni)
  const tervCella = ablak(src, 'canEdit ? (', ['positiveColor'])
  if (tervCella && !tervCella.includes('type="number"') && tervCella.includes('TervOsszegInput')) {
    jo('a Terv-cella a TervOsszegInput-ot használja (a number-input nem tud szóközt)')
  } else {
    hiba('a Terv-cella még type="number" — abban nem jeleníthető meg csoportosítás')
  }
  return helyi
}

const raw = fs.readFileSync(BODY, 'utf8')

console.log('— Pozitív asszertek —')
asszertek(raw, true)

console.log('— Mutánsok —')
const mutansok = [
  {
    nev: 'B1: a csoportosítás törlése — a beírt érték megint tömör számként jelenne meg',
    alkalmaz: (s) => {
      const a = ablak(s, 'function TervOsszegInput', ['\nexport function', '\nfunction BudgetTab'])
      if (!a || !a.includes('{3}')) return null
      return s.replace(a, a.replace('{3}', '{9}'))
    },
  },
  {
    nev: 'B2: a visszafejtés nem szedi ki a szóközt — „50 000" hibás számként mentődne',
    alkalmaz: (s) => {
      const a = ablak(s, 'function TervOsszegInput', ['\nexport function', '\nfunction BudgetTab'])
      if (!a || !a.includes("replace(/\\s/g, '')")) return null
      return s.replace(a, a.replace("replace(/\\s/g, '')", "replace(/x/g, '')"))
    },
  },
]

for (const m of mutansok) {
  const mutalt = m.alkalmaz(raw)
  if (mutalt == null || mutalt === raw) {
    bukik(`${m.nev} — a mutáns nem alkalmazható (vak minta?)`)
    continue
  }
  const mutansHibak = asszertek(mutalt, false)
  if (mutansHibak > 0) pass(`${m.nev} — az őr elkapja (${mutansHibak} asszert bukik)`)
  else bukik(`${m.nev} — az őr VAK erre a mutánsra!`)
}

console.log('')
if (fail > 0) {
  console.error(`${fail} hiba, ${ok} rendben — a költségvetés-bevitel őr BUKIK`)
  process.exit(1)
}
console.log(`${ok}/${ok} rendben — költségvetés-bevitel (3-as csoportosítás) őr zöld`)
