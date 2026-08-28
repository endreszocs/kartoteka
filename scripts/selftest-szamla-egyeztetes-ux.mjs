#!/usr/bin/env node
/**
 * SZÁMLÁK EGYEZTETÉSE UX önellenőrzés (2026-08-28, Endre UX-köre)
 *
 * MIT ŐRIZ — Endre jóváhagyott kérése:
 *   (1) a „Számlák egyeztetése" a Pénzügyből OLDALRÓL KIGÖRDÜLŐ panelként
 *       nyílik (nem navigál el);
 *   (2) weben a FELTÖLTÉS az első: nagy dropzone + a feltöltött számlák
 *       listáján azonnal látszik, melyiknek van meg a párja a könyvelésben
 *       és HOL (bank vagy kassza) — a külön „Kifizetetlen/párosítatlan" fül
 *       megszűnt;
 *   (3) a webes Oblio-mappás fül megszűnt (a mappa-út az asztali programé);
 *   (4) a „Megnyitás" a szépen formázott, nyomtatható számla-adatlapot
 *       nyitja új fülön (nem a nyers XML-t);
 *   (5) a köteg-párosítás lekérdezés 80-asával darabol (414-es URL-csapda).
 *
 * NEGATÍV ASSZERT: navigáció-visszahozó + jelző-törlő mutánsok.
 *
 * Futtatás:  node scripts/selftest-szamla-egyeztetes-ux.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const MAIN = path.join(REPO, 'apps', 'web', 'components', 'dokumentumtar', 'szamla-egyeztetes-main.tsx')
const TABS = path.join(REPO, 'apps', 'web', 'components', 'dokumentumtar', 'szamlak-egyeztetese-tabs.tsx')
const FIN = path.join(REPO, 'apps', 'web', 'components', 'finance', 'finance-tabs.tsx')
const LAP = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'dokumentumtar', 'szamla', '[id]', 'page.tsx')
const ACT = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'dokumentumtar', 'szamla-actions.ts')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
}

function ellenoriz(files) {
  const hibak = []

  if (!files.has(MAIN)) {
    hibak.push('szamla-egyeztetes-main.tsx HIÁNYZIK — nincs feltöltés-első nézet')
    return hibak
  }
  const m = stripComments(files.get(MAIN))
  if (!/Számlák feltöltése/.test(m)) hibak.push('főnézet: nincs szembetűnő feltöltő-sáv')
  if (!/Könyvelve —/.test(m)) hibak.push('főnézet: nincs párosítás-jelző (Könyvelve — hol)')
  if (!/SzamlaKapcsolasDialog/.test(m)) hibak.push('főnézet: nincs Kapcsolás a párosítatlan számlán')
  if (!/\/dokumentumtar\/szamla\//.test(m)) hibak.push('főnézet: a Megnyitás nem a nyomtatható adatlapot nyitja')
  if (!/finally/.test(m) || !/setLoading\(false\)/.test(m)) {
    hibak.push('főnézet: a betöltő nincs try/catch/finally-ben — örök spinner jöhet')
  }

  const t = stripComments(files.get(TABS))
  if (/OblioEllenorzesTab|KifizetetlenMain/.test(t)) {
    hibak.push('fülek: a webes Oblio-mappás / Kifizetetlen fül visszakerült — Endre döntése szerint megszűnt')
  }
  if (!/'szamlak'/.test(t) || !/SzamlaEgyeztetesMain/.test(t)) {
    hibak.push('fülek: a feltöltés-első Számlák nézet nem az alapértelmezett')
  }

  const f = stripComments(files.get(FIN))
  if (/router\.push\('\/dokumentumtar#oblio'\)/.test(f)) {
    hibak.push('finance-tabs: a gomb még elnavigál — a kigördülő panel a kérés')
  }
  if (!/setSzamlaEgyeztetesOpen\(true\)/.test(f) || !/SzamlaEgyeztetesMain/.test(f)) {
    hibak.push('finance-tabs: nincs kigördülő Számlák-egyeztetése panel')
  }

  if (!files.has(LAP)) {
    hibak.push('szamla/[id]/page.tsx HIÁNYZIK — a Megnyitás nyers XML-re esne vissza')
  } else {
    const l = stripComments(files.get(LAP))
    if (!/@media print/.test(l) || !/szamla-lap/.test(l)) {
      hibak.push('számla-adatlap: nincs nyomtatási CSS — az app-héj is papírra kerülne')
    }
  }

  const a = stripComments(files.get(ACT))
  if (!/listSzamlaParositasok/.test(a) || !/i \+= 80/.test(a)) {
    hibak.push('szamla-actions: a köteg-párosítás nem 80-asával darabol (414-es URL-csapda)')
  }

  return hibak
}

function beolvas() {
  const map = new Map()
  for (const fp of [TABS, FIN, ACT]) map.set(fp, fs.readFileSync(fp, 'utf8'))
  if (fs.existsSync(MAIN)) map.set(MAIN, fs.readFileSync(MAIN, 'utf8'))
  if (fs.existsSync(LAP)) map.set(LAP, fs.readFileSync(LAP, 'utf8'))
  return map
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('Számlák egyeztetése UX: kigördülő panel + feltöltés-első + párosítás-jelzők + nyomtatható adatlap')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a finance-tabs visszaáll a navigációra
  const m1files = beolvas()
  const f1 = m1files.get(FIN)
  const f1mut = f1.replace(/setSzamlaEgyeztetesOpen\(true\)/, "router.push('/dokumentumtar#oblio')")
  m1files.set(FIN, f1mut)
  if (f1mut === f1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1files).length === 0) bukik('M1: a navigáció-visszahozásra az őr NEM bukik — vak')
  else pass('M1 mutáns (panel → navigáció) → az őr elbuktatja')

  // M2: a párosítás-jelző törlése a főnézetből
  const m2files = beolvas()
  const m2 = m2files.get(MAIN)
  const m2mut = m2.replace(/Könyvelve —/g, 'MUTANS —')
  m2files.set(MAIN, m2mut)
  if (m2mut === m2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2files).length === 0) bukik('M2: a jelző-törlésre az őr NEM bukik — vak')
  else pass('M2 mutáns (párosítás-jelző törölve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — Számlák egyeztetése UX rendben`)
