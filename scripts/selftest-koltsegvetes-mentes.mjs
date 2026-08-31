#!/usr/bin/env node
/**
 * KÖLTSÉGVETÉS-MENTÉS önellenőrzés (2026-08-30, az átvilágító diagnosztika 4. pontja)
 *
 * MIT ŐRIZ:
 *  (1) A mentés NEM „előbb töröl, aztán ír": UPSERT megy a tábla elsődleges
 *      kulcsára. A régi világ DELETE-tel indult, és ha az INSERT bármiért
 *      elakadt (típushiba, RLS, hálózat), az ÉV TELJES KÖLTSÉGVETÉSE TÖRÖLVE
 *      MARADT, miközben a felhasználó csak egy hibaüzenetet látott.
 *  (2) A takarítás (a kihagyott sorok törlése) a BESZÚRÁS UTÁN fut, és csak a
 *      ténylegesen fölöslegessé vált sorokra — fail-safe: ha ez elakad, az
 *      érdemi adat MÁR helyes.
 *  (3) A törlés DARABOLVA megy (a `.in()` szűrő ~100 azonosító fölött 414-et ad
 *      — a repó visszatérő hibaosztálya).
 *  (4) ⚠️ A gyülekezeti `koltsegvetes.osszeg` / `osszeg_modositott` INTEGER
 *      oszlop: az értéket KEREKÍTVE kell írni. Tizedes írása Postgres-hibát ad
 *      — a régi sorrendben (DELETE után) ez az egész évi tervet elvitte volna.
 *      (A 2026-08-30-i hármas számjegy-csoportosítás óta a mező tizedest is
 *      elfogad, ezért ez ÉLES kockázat volt.)
 *  (5) Az olvasás a VALÓDI oszlopnevekkel kezd (a `tervezett`/`modositott` a
 *      gyülekezeti táblán SOHA nem létezett) — nincs fölösleges 400-as kör.
 *
 * NEGATÍV ASSZERT: a régi/elrontott világot visszajátszó mutánsok (K1–K5).
 *
 * Futtatás:  node scripts/selftest-koltsegvetes-mentes.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const COMPAT = path.join(REPO, 'packages', 'core', 'src', 'finance', 'budget-compat.ts')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Függvényhatáros ablak — a fix hosszú ablak átlóg a szomszédba és vakítja a mutánst. */
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

  const mentes = ablak(src, 'export async function saveBudgetRowsCompat', ['\nexport async function saveBudgetModification'])
  if (!mentes) {
    hiba('nincs saveBudgetRowsCompat — a költségvetés-mentés nem található')
    return helyi
  }

  // (1) UPSERT, nem DELETE-majd-INSERT
  if (mentes.includes('.upsert(') && mentes.includes('onConflict:')) {
    jo('mentés: UPSERT az elsődleges kulcsra (nincs „előbb törlünk mindent")')
  } else {
    hiba('a mentés nem UPSERT-el — egy elakadt beszúrás az ÉV TELJES tervét elvinné')
  }

  // (2) a takarítás HÍVÁSA a beszúrás UTÁN van — MINDKÉT ágon (felső szintű + gyülekezeti).
  // ⚠️ A korábbi változat a mentés ablakában kereste a `.delete()`-et, ami a külön
  // takarító-függvény miatt MINDIG -1 volt: tautológia, vak asszert.
  const upsertHelyek = [...mentes.matchAll(/\.upsert\(/g)].map((m) => m.index)
  const takaritHelyek = [...mentes.matchAll(/await takaritsFolosleges\(/g)].map((m) => m.index)
  if (upsertHelyek.length >= 2 && takaritHelyek.length >= 2
      && takaritHelyek[0] > upsertHelyek[0] && takaritHelyek[1] > upsertHelyek[1]) {
    jo('takarítás: MINDKÉT ágon a beszúrás UTÁN hívjuk (fail-safe sorrend)')
  } else {
    hiba('a takarítás megelőzi az írást (vagy hiányzik az egyik ágról) — visszatért az adatvesztő sorrend')
  }

  // (2b) ÜRES terv-lista nem söpörheti ki az évet (sikertelen betöltés utáni mentés!)
  const takaritoFn = ablak(src, 'async function takaritsFolosleges', ['\nexport async function'])
  if (takaritoFn && /megtartandok\.length === 0/.test(takaritoFn)) {
    jo('takarítás: ÜRES terv-listánál kihagyva (a sikertelen betöltés nem törölheti az évet)')
  } else {
    hiba('üres terv-listánál is takarítana — egy sikertelen betöltés utáni mentés kisöpörné az ÉV TELJES tervét')
  }

  // (2c) a takarítás hibája HANGOS (a régi DELETE-elöl kód is megállt rajta)
  if (takaritoFn && /takarítása nem sikerült \(lekérdezés\)/.test(takaritoFn)
      && /throw new Error\(`A kivett sorok takarítása nem sikerült \(törlés\)/.test(takaritoFn)) {
    jo('takarítás: a hiba HANGOS (nincs hamis „mentve" visszajelzés)')
  } else {
    hiba('a takarítás hibáját elnyeli — a felhasználó sikert látna egy félig végrehajtott mentésre')
  }

  // (2d) a darab MÉRETE is korlátos (nem elég a nevét megőrizni)
  const darabMeret = /const TAKARITAS_DARAB = (\d+)/.exec(src)
  if (darabMeret && Number(darabMeret[1]) > 0 && Number(darabMeret[1]) <= 100) {
    jo(`takarítás: a darab mérete ${darabMeret[1]} (a .in() 100 fölött 414-be fut)`)
  } else {
    hiba('a takarítási darab mérete hiányzik vagy 100 fölötti — 414-es URL-túlcsordulás')
  }

  // (2e) a módosítás-mentés is UPSERT (a sima UPDATE 0 sorra NÉMA)
  const modFn = ablak(src, 'export async function saveBudgetModification', ['\n\nexport '])
  if (modFn && modFn.includes("upsert(payload, { onConflict: 'bealitasid,szamadasicelid,congregation_id' })")) {
    jo('módosítás-mentés: UPSERT (a hiányzó sorra beírt módosítás nem vész el némán)')
  } else {
    hiba('a módosítás-mentés UPDATE-only — hiányzó sornál némán elveszne a beírt érték')
  }

  // (3) darabolt törlés (a .in() ~100 fölött 414-et ad) — a takarító a mentés ELŐTT
  // álló külön függvényben él, ezért a TELJES forrásban nézzük.
  const takarito = ablak(src, 'async function takaritsFolosleges', ['\nexport async function'])
  if (takarito && takarito.includes('TAKARITAS_DARAB') && takarito.includes('slice(i, i + TAKARITAS_DARAB)')) {
    jo('takarítás: darabolt törlés (nincs 414-es URL-túlcsordulás)')
  } else {
    hiba('a takarító törlés nem darabolt — sok jogcímnél 414-be futna')
  }

  // (4) az INTEGER oszlopokra KEREKÍTVE írunk
  if (mentes.includes('egeszre(') || /Math\.round\(/.test(mentes)) {
    jo('gyülekezeti terv: az egész-oszlopokra kerekítve írunk (a tizedes nem dob hibát)')
  } else {
    hiba('a gyülekezeti osszeg/osszeg_modositott nincs kerekítve — tizedesnél Postgres-hiba, és a régi sorrendben ez vitte az évet')
  }

  // (5) az olvasás a VALÓDI oszlopnevekkel kezd
  const olvasas = ablak(src, 'const congregationId = scopeId', ['export async function saveBudgetRowsCompat'])
  if (!olvasas) {
    hiba('nem található a gyülekezeti olvasási ág')
  } else {
    const valodi = olvasas.indexOf('szamadasicelid, osszeg, osszeg_modositott')
    const regi = olvasas.indexOf('szamadasicelid, tervezett, modositott')
    if (valodi >= 0 && (regi < 0 || valodi < regi)) {
      jo('olvasás: a VALÓDI oszlopnevekkel kezd (nincs fölösleges 400-as kör)')
    } else {
      hiba('az olvasás a nem létező `tervezett/modositott` oszlopokkal kezd — minden betöltésnél 400-as kör')
    }
  }

  return helyi
}

const raw = fs.readFileSync(COMPAT, 'utf8')

console.log('— Pozitív asszertek —')
asszertek(raw, true)

console.log('— Mutánsok (a régi/elrontott világ visszajátszása) —')
const mutansok = [
  {
    nev: 'K1: vissza a DELETE-majd-INSERT sorrendre — egy hiba az ÉV tervét vinné',
    alkalmaz: (s) => (s.includes('.upsert(')
      ? s.replaceAll('.upsert(', '.insert(')
      : null),
  },
  {
    nev: 'K2: az onConflict elhagyása — az upsert duplikátum-hibába futna',
    alkalmaz: (s) => (s.includes('onConflict:')
      ? s.replaceAll('onConflict:', 'onConflict_KIKAPCSOLVA:')
      : null),
  },
  {
    nev: 'K3: a kerekítés kivétele — tizedesnél Postgres-hiba az integer oszlopon',
    alkalmaz: (s) => (s.includes('egeszre(')
      ? s.replaceAll('egeszre(', 'nemEgeszre(')
      : null),
  },
  {
    nev: 'K4: a darab méretének felhúzása 5000-re — 414-es URL sok jogcímnél',
    alkalmaz: (s) => (s.includes('const TAKARITAS_DARAB = 80')
      ? s.replace('const TAKARITAS_DARAB = 80', 'const TAKARITAS_DARAB = 5000')
      : null),
  },
  {
    nev: 'K6: az üres-lista kapu kivétele — a sikertelen betöltés utáni mentés kisöpörné az évet',
    alkalmaz: (s) => (s.includes('if (megtartandok.length === 0)')
      ? s.replace('if (megtartandok.length === 0)', 'if (false)')
      : null),
  },
  {
    nev: 'K7: a takarítás hibájának elnyelése — hamis „mentve" visszajelzés',
    alkalmaz: (s) => (s.includes('throw new Error(`A kivett sorok takarítása nem sikerült (törlés)')
      ? s.replace('throw new Error(`A kivett sorok takarítása nem sikerült (törlés)', 'console.error(`A kivett sorok takarítása nem sikerült (törlés)')
      : null),
  },
  {
    nev: 'K8: a módosítás-mentés visszarontása UPDATE-only-ra — néma elvesztés',
    alkalmaz: (s) => {
      const a = ablak(s, 'export async function saveBudgetModification', ['\n\nexport '])
      // replaceAll: az ablak a FELSŐ SZINTŰ ág upsertjét is tartalmazza — egyetlen
      // csere után a gyülekezeti maradna upsert, és a mutáns vak lenne.
      if (!a || !a.includes('.upsert(')) return null
      return s.replace(a, a.replaceAll('.upsert(', '.update('))
    },
  },
  {
    nev: 'K5: az olvasás visszarontása a nem létező oszlopnevekre',
    alkalmaz: (s) => (s.includes("'szamadasicelid, osszeg, osszeg_modositott, osszeg_mod_2, osszeg_mod_3'")
      ? s.replace("'szamadasicelid, osszeg, osszeg_modositott, osszeg_mod_2, osszeg_mod_3'", "'szamadasicelid, tervezett, modositott, osszeg_mod_2, osszeg_mod_3'")
      : null),
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
  console.error(`${fail} hiba, ${ok} rendben — a költségvetés-mentés őr BUKIK`)
  process.exit(1)
}
console.log(`${ok}/${ok} rendben — költségvetés-mentés (upsert + kerekítés + darabolás) őr zöld`)
