#!/usr/bin/env node
/**
 * SZERKESZTÉS OPTIMISTA ZÁR önellenőrzés (P0-11, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-11 találata:
 * a tétel-szerkesztő (web updateTransactionBasic + core
 * updateTransactionUseCase) feltétel nélküli UPDATE-et adott ki — ha két
 * felület (két gép, vagy web és desktop egyszerre) ugyanazt a tételt
 * szerkesztette, az utolsó mentés NÉMÁN felülírta a másikét, és senki nem
 * tudta meg.
 *
 * A JAVÍTÁS: a dialógus nyitásakor futó isLastTransactionOfType a sor
 * aktuális revision-jét is visszaadja (a sync_tracking_touch trigger minden
 * UPDATE-nél lépteti), a mentés ezt küldi vissza, az UPDATE
 * `.eq('revision', base)`-szel + `.select('id')`-vel fut — 0 érintett sor =
 * beszédes konfliktus, nem néma felülírás. A kapu csak gyülekezeti
 * hatókörben él (a felső szintek tábláin nincs revision oszlop).
 *
 * NEGATÍV ASSZERT: zár-eltávolító + revision-elhagyó mutánsok.
 *
 * Futtatás:  node scripts/selftest-szerkesztes-revizio.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const CORE = path.join(REPO, 'packages', 'core', 'src', 'finance', 'update-transaction.ts')
const WEB_ACT = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'edit-storno-actions.ts')
const WEB_DLG = path.join(REPO, 'apps', 'web', 'components', 'modals', 'transaction-edit-dialog.tsx')
const DESK_DLG = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'transaction-edit-dialog.tsx')

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

  // ── (1) a két végrehajtó: revision-kapu az UPDATE-en + 0-sor = konfliktus ──
  for (const [nev, fajl] of [['core update-transaction', CORE], ['web edit-storno-actions', WEB_ACT]]) {
    const s = stripComments(files.get(fajl))
    if (!/\.eq\('revision', input\.revision/.test(s)) {
      hibak.push(`${nev}: az UPDATE-en nincs revision-kapu (.eq('revision', input.revision…)) — a párhuzamos mentés némán felülír`)
    }
    if (!/\.eq\('revision', input\.revision[\s\S]{0,120}?\.select\('id'\)/.test(s)) {
      hibak.push(`${nev}: a kapuzott UPDATE után nincs .select('id') — a 0 érintett sor nem detektálható`)
    }
    if (!/Időközben valaki más módosította/.test(s)) {
      hibak.push(`${nev}: nincs beszédes konfliktus-üzenet a 0-sorra`)
    }
    if (!/revision\?: number/.test(s)) {
      hibak.push(`${nev}: az input nem fogad revision-t`)
    }
    if (!/'datum, revision'/.test(s)) {
      hibak.push(`${nev}: az isLast-lekérdezés nem adja vissza a sor revision-jét (a dialógus bázisa)`)
    }
  }

  // ── (2) a két dialógus: nyitáskor eltárolja, mentéskor elküldi ──
  for (const [nev, fajl] of [['web dialógus', WEB_DLG], ['desktop dialógus', DESK_DLG]]) {
    const s = stripComments(files.get(fajl))
    if (!/setBaseRevision\(/.test(s)) {
      hibak.push(`${nev}: a nyitáskori revision nincs state-be téve (setBaseRevision hiányzik)`)
    }
    if (!/revision: baseRevision/.test(s)) {
      hibak.push(`${nev}: a mentés nem küldi a bázis-revision-t — a kapu sosem él`)
    }
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const f of [CORE, WEB_ACT, WEB_DLG, DESK_DLG]) m.set(f, fs.readFileSync(f, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('szerkesztés optimista zár: revision-kapu + 0-sor-konfliktus + dialógus-átadás a helyén')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a revision-kapu eltávolítása a core UPDATE-ről
  const m1files = beolvas()
  const coreRaw = m1files.get(CORE)
  const coreMut = coreRaw.replace(/\s*\.eq\('revision', input\.revision[^)\n]*\)/, '')
  m1files.set(CORE, coreMut)
  if (coreMut === coreRaw) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1files).length === 0) bukik('M1: a core zár-eltávolításra az őr NEM bukik — vak')
  else pass('M1 mutáns (core revision-kapu törölve) → az őr elbuktatja')

  // M2: a web dialógus nem küldi a revision-t
  const m2files = beolvas()
  const dlgRaw = m2files.get(WEB_DLG)
  const dlgMut = dlgRaw.replace(/revision: baseRevision[^,\n]*,?/, '')
  m2files.set(WEB_DLG, dlgMut)
  if (dlgMut === dlgRaw) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2files).length === 0) bukik('M2: a web dialógus revision-elhagyására az őr NEM bukik — vak')
  else pass('M2 mutáns (web dialógus nem küld revision-t) → az őr elbuktatja')

  // M3: a web akció zár-eltávolítása
  const m3files = beolvas()
  const actRaw = m3files.get(WEB_ACT)
  const actMut = actRaw.replace(/\s*\.eq\('revision', input\.revision[^)\n]*\)/, '')
  m3files.set(WEB_ACT, actMut)
  if (actMut === actRaw) bukik('M3 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m3files).length === 0) bukik('M3: a web zár-eltávolításra az őr NEM bukik — vak')
  else pass('M3 mutáns (web revision-kapu törölve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — szerkesztés optimista zár rendben`)
