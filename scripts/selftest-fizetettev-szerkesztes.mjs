#!/usr/bin/env node
/**
 * FIZETETT ÉV SZERKESZTÉS önellenőrzés (2026-08-28, Endre észrevétele)
 *
 * MIT ŐRIZ — Endre 2026-08-28-i kérése: a banki bevételeknél (kiemelten az
 * egyházfenntartásnál) tudni kell, MELYIK ÉVRE fizetett az illető (elmaradás
 * vs. aktuális év) — és ezt a tétel SZERKESZTŐJÉBEN javítani is lehessen.
 * Eddig a szerkesztő a fizetett évhez hozzá sem fért: a banki importból jött
 * tételnél a rendszer a dátum évét vélelmezte, és nem volt hol átírni.
 *
 * A JAVÍTÁS: a „Melyik évre szól" mező a web ÉS a desktop szerkesztő
 * dialógusban (csak bevételnél), a BankTab + CashbookTab átadja a sor
 * fizetett évét, a web updateTransactionBasic és a core
 * updateTransactionUseCase pedig validáltan (2000–2100) írja.
 *
 * NEGATÍV ASSZERT: írás-törlő + küldés-törlő mutánsok.
 *
 * Futtatás:  node scripts/selftest-fizetettev-szerkesztes.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const WEB_DLG = path.join(REPO, 'apps', 'web', 'components', 'modals', 'transaction-edit-dialog.tsx')
const DESK_DLG = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'transaction-edit-dialog.tsx')
const WEB_ACT = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'edit-storno-actions.ts')
const CORE = path.join(REPO, 'packages', 'core', 'src', 'finance', 'update-transaction.ts')
const BANKTAB = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'BankTab.tsx')
const CASHTAB = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'CashbookTab.tsx')

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

  // (1) a két dialógus: mező + küldés
  for (const [nev, fajl] of [['web dialógus', WEB_DLG], ['desktop dialógus', DESK_DLG]]) {
    const s = stripComments(files.get(fajl))
    if (!/Melyik évre szól/.test(s)) {
      hibak.push(`${nev}: nincs „Melyik évre szól" mező — a fizetett év nem javítható`)
    }
    if (!/fizetettev:/.test(s)) {
      hibak.push(`${nev}: a mentés nem küldi a fizetett évet`)
    }
  }

  // (2) a két végrehajtó: validált írás, csak bevételre
  const wa = stripComments(files.get(WEB_ACT))
  if (!/fizetettev\?:/.test(wa) || !/updateData\.fizetettev = input\.fizetettev/.test(wa)) {
    hibak.push('web updateTransactionBasic: a fizetett év nem íródik')
  }
  const co = stripComments(files.get(CORE))
  if (!/fizetettev\?:/.test(co) || !/updateData\.fizetettev = input\.fizetettev/.test(co)) {
    hibak.push('core updateTransactionUseCase: a fizetett év nem íródik')
  }
  for (const [nev, s] of [['web', wa], ['core', co]]) {
    const iIr = s.indexOf('updateData.fizetettev = input.fizetettev')
    const elotte = iIr >= 0 ? s.slice(Math.max(0, iIr - 800), iIr) : ''
    if (iIr >= 0 && !/befizetes/.test(elotte)) {
      hibak.push(`${nev}: a fizetett év írása nincs a bevétel-ágra kötve — kiadásra is íródna`)
    }
    if (!/2000/.test(s) || !/2100/.test(s)) {
      hibak.push(`${nev}: nincs év-tartomány validálás a fizetett évre`)
    }
  }

  // (3) a két fül átadja a sor fizetett évét a szerkesztőnek
  for (const [nev, fajl] of [['BankTab', BANKTAB], ['CashbookTab', CASHTAB]]) {
    const s = stripComments(files.get(fajl))
    if (!/initial: \{[\s\S]{0,600}?fizetettev: r\.fizetettev/.test(s)) {
      hibak.push(`${nev}: a szerkesztő nem kapja meg a sor fizetett évét`)
    }
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const fp of [WEB_DLG, DESK_DLG, WEB_ACT, CORE, BANKTAB, CASHTAB]) {
    m.set(fp, fs.readFileSync(fp, 'utf8'))
  }
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('fizetett év: mező + átadás + validált írás mindkét változatban')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a web akció nem írja tovább
  const m1files = beolvas()
  const w1 = m1files.get(WEB_ACT)
  const w1mut = w1.replace(/updateData\.fizetettev = input\.fizetettev/, 'void input.fizetettev')
  m1files.set(WEB_ACT, w1mut)
  if (w1mut === w1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1files).length === 0) bukik('M1: az írás-törlésre az őr NEM bukik — vak')
  else pass('M1 mutáns (web írás törölve) → az őr elbuktatja')

  // M2: a web dialógus nem küldi
  const m2files = beolvas()
  const d2 = m2files.get(WEB_DLG)
  const d2mut = d2.replace(/fizetettev:/, 'fizetettev_KIKAPCSOLVA:')
  m2files.set(WEB_DLG, d2mut)
  if (d2mut === d2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2files).length === 0) bukik('M2: a küldés-törlésre az őr NEM bukik — vak')
  else pass('M2 mutáns (web dialógus nem küld) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — fizetett év szerkesztés rendben`)
