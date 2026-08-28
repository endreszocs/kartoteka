#!/usr/bin/env node
/**
 * ÁTVEZETÉS — EGY KÖZÖS ÚT önellenőrzés (P0-13 utóda + D5, 2026-08-29)
 *
 * TÖRTÉNET: a P0-13 a webes saveKasszaBankTransferPair ellenőrizetlen
 * rollbackjét javította. A D5 (audit-divergencia) óta a webes átvezetés a
 * KÖZÖS core saveInternalTransferUseCase-en megy — a mester (nyilvántartó)
 * sor + a könyvelési pár + a P0-7-es ellenőrzött rollback EGY helyen él
 * (azt a selftest-belsomozgas-integritas őrzi). Ez az őr azt biztosítja,
 * hogy a web ne térhessen vissza a saját, párhuzamos pár-írására.
 *
 * MIT ŐRIZ:
 *   (1) a web saveInternalTransfer a core use-case-re delegál — a régi
 *       saveKasszaBankTransferPair NEM létezik többé;
 *   (2) a core use-case a bank→bank átvezetést is KÖNYVELI (402.02 kódpár,
 *       kiadás a forrás-bankon + bevétel a cél-bankon), de CSAK RON↔RON
 *       számlapárnál — devizásnál mester-only marad, hangos jelzéssel;
 *   (3) a séma fogadja a cél-bank azonosítót (celBankszamlaId).
 *
 * NEGATÍV ASSZERT: visszabontó mutánsok.
 *
 * Futtatás:  node scripts/selftest-atvezetes-par-rollback.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const WEB = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')
const CORE = path.join(REPO, 'packages', 'core', 'src', 'finance', 'belsomozgas', 'save.ts')
const SEMA = path.join(REPO, 'packages', 'validations', 'src', 'finance', 'belsomozgas.ts')

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

  // (1) a web a közös úton jár
  const w = stripComments(files.get(WEB))
  if (/saveKasszaBankTransferPair/.test(w)) {
    hibak.push('web: a saját pár-író (saveKasszaBankTransferPair) visszatért — két széthúzó implementáció')
  }
  const iSave = w.indexOf('export async function saveInternalTransfer')
  const saveBlokk = iSave >= 0 ? w.slice(iSave, iSave + 5000) : ''
  if (!/saveInternalTransferUseCase\(/.test(saveBlokk)) {
    hibak.push('web: a saveInternalTransfer nem a core use-case-re delegál')
  }

  // (2) a core a bank→bank párt is könyveli, RON-őrrel
  const c = stripComments(files.get(CORE))
  if (!/clean\.tipus === 'bank_bank'/.test(c) || !/celBankszamlaId/.test(c)) {
    hibak.push('core: nincs bank→bank pár-könyvelés — a számlánkénti egyenleg nem látja az átutalást')
  }
  if (!/'RON'/.test(c) || !/valuta/.test(c)) {
    hibak.push('core: nincs pénznem-őr a bank→bank páron — devizás számlára nyers összeg könyvelődne')
  }

  // (3) a séma fogadja a cél-bankot
  const s = stripComments(files.get(SEMA))
  if (!/celBankszamlaId/.test(s)) {
    hibak.push('séma: nincs celBankszamlaId — a bank→bank pár nem kaphat cél-számlát')
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const fp of [WEB, CORE, SEMA]) m.set(fp, fs.readFileSync(fp, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('átvezetés: egyetlen közös út (web→core) + bank→bank pár RON-őrrel')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a web visszabontása saját pár-írásra
  const m1files = beolvas()
  const w1 = m1files.get(WEB)
  const w1mut = w1.replace(/saveInternalTransferUseCase\(/, 'sajatParIro_saveKasszaBankTransferPair(')
  m1files.set(WEB, w1mut)
  if (w1mut === w1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1files).length === 0) bukik('M1: a web-visszabontásra az őr NEM bukik — vak')
  else pass('M1 mutáns (web saját pár-írásra vissza) → az őr elbuktatja')

  // M2: a core bank→bank ág törlése
  const m2files = beolvas()
  const c2 = m2files.get(CORE)
  const c2mut = c2.replace(/clean\.tipus === 'bank_bank'/g, "clean.tipus === 'bank_bank_KIKAPCSOLVA'")
  m2files.set(CORE, c2mut)
  if (c2mut === c2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2files).length === 0) bukik('M2: a bank→bank ág törlésére az őr NEM bukik — vak')
  else pass('M2 mutáns (core bank→bank ág kilőve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — átvezetés közös útja rendben`)
