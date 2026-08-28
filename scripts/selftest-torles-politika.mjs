#!/usr/bin/env node
/**
 * TÖRLÉS-POLITIKA önellenőrzés (D13 / D-blokk, 2026-08-28 — Endre döntése)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P2-találata + Endre döntése
 * („legyen a javaslatod szerint"): a webes szabály (2026-06-20) a kánon —
 * pénzügyi tételt NEM TÖRLÜNK, hanem SZTORNÓZUNK (indoklással, nyomon
 * követhetően). Ehhez képest:
 *   - a desktop befizetés- és kiadás-listáján indok nélküli szabad
 *     Törlés-gomb élt (softDelete*UseCase hívással),
 *   - a web hívatlan deleteTransaction végpontja BÁRMELY tételt törölt
 *     volna egy nyers POST-ra.
 *
 * A JAVÍTÁS:
 *   - a desktop két listáján a sor-szintű Törlés megszűnt (a Sztornó marad);
 *     a kassza↔bank átvezetés eltávolítása a Belső mozgások listából megy
 *     (a mester törlése a P0-7 óta mindkét lábat viszi);
 *   - a web deleteTransaction gyülekezeti ága KIZÁRÓLAG belső-mozgás lábat
 *     fogad el (annak a törlése a hivatalos út) — minden másra beszédes
 *     hibával a sztornóra irányít.
 *
 * NEGATÍV ASSZERT: gomb-visszacsempésző + kapu-törlő mutánsok.
 *
 * Futtatás:  node scripts/selftest-torles-politika.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const BEF = path.join(REPO, 'apps', 'desktop', 'src', 'pages', 'befizetes-page.tsx')
const KIA = path.join(REPO, 'apps', 'desktop', 'src', 'pages', 'kiadas-page.tsx')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')

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

  // ── (1) desktop listák: nincs sor-szintű törlés, a sztornó megvan ──
  for (const [nev, fajl, useCase] of [
    ['befizetes-page', BEF, 'softDeleteIncomeUseCase'],
    ['kiadas-page', KIA, 'softDeleteExpenseUseCase'],
  ]) {
    const s = stripComments(files.get(fajl))
    if (new RegExp(`${useCase}\\(`).test(s)) {
      hibak.push(`desktop ${nev}: még él a sor-szintű törlés (${useCase} hívás) — a webes sztornó-szabály a kánon`)
    }
    if (!/Sztorn/.test(s)) {
      hibak.push(`desktop ${nev}: a Sztornó eltűnt — így semmilyen javítási út nem maradna`)
    }
  }

  // ── (2) web deleteTransaction: csak belső-mozgás láb ──
  const a = stripComments(files.get(ACTIONS))
  const iFn = a.indexOf('export async function deleteTransaction')
  const fn = iFn >= 0 ? a.slice(iFn, iFn + 6000) : ''
  if (!/if \(!r\.belso_mozgas_xkey\)/.test(fn) || !/sztorn/i.test(fn)) {
    hibak.push('web deleteTransaction: a gyülekezeti ág nem csak belső-mozgás lábat fogad — bármely tétel törölhető nyers POST-tal')
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const fp of [BEF, KIA, ACTIONS]) m.set(fp, fs.readFileSync(fp, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('törlés-politika: desktop sor-törlés megszűnt + web végpont belső-mozgásra szűkítve')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a desktop törlés visszacsempészése (a régi hívás beszúrása)
  const m1files = beolvas()
  const b1 = m1files.get(BEF)
  const b1mut = b1.replace(/export function/, 'const _mutans = async () => softDeleteIncomeUseCase({} as never, {} as never)\nexport function')
  m1files.set(BEF, b1mut)
  if (b1mut === b1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1files).length === 0) bukik('M1: a törlés-visszacsempészésre az őr NEM bukik — vak')
  else pass('M1 mutáns (desktop törlés-hívás vissza) → az őr elbuktatja')

  // M2: a web kapu törlése
  const m2files = beolvas()
  const a2 = m2files.get(ACTIONS)
  const a2mut = a2.replace(/if \(!r\.belso_mozgas_xkey\)/, 'if (false)')
  m2files.set(ACTIONS, a2mut)
  if (a2mut === a2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2files).length === 0) bukik('M2: a web-kapu törlésére az őr NEM bukik — vak')
  else pass('M2 mutáns (web-kapu kiütve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — törlés-politika rendben`)
