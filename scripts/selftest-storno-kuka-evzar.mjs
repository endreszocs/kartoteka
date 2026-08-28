#!/usr/bin/env node
/**
 * STORNÓ / KUKA / ÉV-ZÁR RÉSEK önellenőrzés
 * (E-blokk: P3-11, P3-13, P4-27 — 2026-08-29)
 *
 * MIT ŐRIZ:
 *   (1) P3-11 chitanta-stornó: sor-felderítés + ÉV-ZÁR + stornozott_by
 *       audit-mező + a kapcsolt befizetésről szóló hangos figyelmeztetés;
 *   (2) P3-13 Kuka-visszaállítás (befizetes/kiadas): fail-closed online
 *       előellenőrzés — zárt évbe nem állít vissza, foglalt iratszámra nem
 *       állít vissza (23505/duplikátum helyett beszédes magyar hiba);
 *   (3) P4-27 a `skipYearFinalizedCheck` bypass-mező sehol nem létezik többé —
 *       az év-zár a stornó use-case-ekben feltétel nélkül fut.
 *
 * NEGATÍV ASSZERT: a régi világot visszajátszó mutánsok.
 *
 * Futtatás:  node scripts/selftest-storno-kuka-evzar.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const CHIT_STORNO = path.join(REPO, 'packages', 'core', 'src', 'finance', 'chitanta', 'storno.ts')
const BIN = path.join(REPO, 'apps', 'web', 'lib', 'offline', 'recycle-bin-actions.ts')
const BEF_SEMA = path.join(REPO, 'packages', 'validations', 'src', 'finance', 'befizetes-delete.ts')
const KIA_SEMA = path.join(REPO, 'packages', 'validations', 'src', 'finance', 'kiadas-delete.ts')
const BEF_STORNO = path.join(REPO, 'packages', 'core', 'src', 'finance', 'befizetes', 'storno.ts')
const KIA_STORNO = path.join(REPO, 'packages', 'core', 'src', 'finance', 'kiadas', 'storno.ts')

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

  // (1) P3-11 — chitanta-stornó
  const c = stripComments(files.get(CHIT_STORNO))
  if (!/assertYearsNotFinalizedForDelete\(/.test(c)) {
    hibak.push('P3-11: a chitanta-stornóban nincs év-zár — véglegesített év nyugtája is érvényteleníthető')
  }
  if (!/stornozott_by/.test(c)) {
    hibak.push('P3-11: a chitanta-stornó nem írja a stornozott_by audit-mezőt')
  }
  if (!/befizetes_id/.test(c) || !/figyelmeztetes/.test(c)) {
    hibak.push('P3-11: a kapcsolt befizetésről nem szól a figyelmeztetés — aktív bevétel maradhat észrevétlenül')
  }

  // (2) P3-13 — Kuka-visszaállítás előellenőrzés
  const b = stripComments(files.get(BIN))
  const iRestore = b.indexOf('export async function restoreRecord')
  const restoreFn = iRestore >= 0 ? b.slice(iRestore, iRestore + 6000) : ''
  if (!/table === 'befizetes' \|\| table === 'kiadas'/.test(restoreFn)) {
    hibak.push('P3-13: a Kuka-visszaállítás nem kezeli külön a pénzügyi táblákat')
  }
  if (!/accounting_finalized/.test(restoreFn)) {
    hibak.push('P3-13: a visszaállítás nem nézi az év-zárat — zárt évbe is visszaállít')
  }
  if (!/\.eq\('iratszam', rec\.iratszam\)/.test(restoreFn) || !/\.neq\('id', id\)/.test(restoreFn)) {
    hibak.push('P3-13: a visszaállítás nem ellenőrzi, hogy az iratszám időközben foglalt-e — duplikátum/23505')
  }

  // (3) P4-27 — bypass-mező kivezetve
  for (const [nev, fp] of [
    ['befizetes-delete séma', BEF_SEMA],
    ['kiadas-delete séma', KIA_SEMA],
    ['befizetés-stornó core', BEF_STORNO],
    ['kiadás-stornó core', KIA_STORNO],
  ]) {
    const s = stripComments(files.get(fp))
    if (/skipYearFinalizedCheck/.test(s)) {
      hibak.push(`P4-27: a ${nev} még hordozza a skipYearFinalizedCheck bypass-t — nyitott hátsó ajtó az év-záron`)
    }
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const fp of [CHIT_STORNO, BIN, BEF_SEMA, KIA_SEMA, BEF_STORNO, KIA_STORNO]) {
    m.set(fp, fs.readFileSync(fp, 'utf8'))
  }
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('stornó/kuka/év-zár: chitanta-stornó teljes, Kuka-előellenőrzés él, bypass kivezetve')
} else {
  for (const hb of hibak) bukik(hb)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a chitanta év-zár kilövése
  const m1 = beolvas()
  const c1 = m1.get(CHIT_STORNO)
  const c1mut = c1.replace(/assertYearsNotFinalizedForDelete\(/g, 'assertYearsNotFinalizedForDelete_KIKAPCSOLVA(')
  m1.set(CHIT_STORNO, c1mut)
  if (c1mut === c1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: a chitanta év-zár kilövésére NEM bukik — vak')
  else pass('M1 mutáns (chitanta év-zár kilőve) → az őr elbuktatja')

  // M2: a Kuka iratszám-ellenőrzés törlése
  const m2 = beolvas()
  const b2 = m2.get(BIN)
  const b2mut = b2.replace(/\.eq\('iratszam', rec\.iratszam\)/, ".eq('iratszam_KIKAPCSOLVA', rec.iratszam)")
  m2.set(BIN, b2mut)
  if (b2mut === b2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2).length === 0) bukik('M2: az iratszám-ellenőrzés törlésére NEM bukik — vak')
  else pass('M2 mutáns (Kuka iratszám-ellenőrzés kilőve) → az őr elbuktatja')

  // M3: a bypass-mező visszacsempészése a sémába (a RÉGI világ)
  const m3 = beolvas()
  const s3 = m3.get(BEF_SEMA)
  const s3mut = s3.replace(/\}\)\s*\nexport type StornoIncomeInput/, '  skipYearFinalizedCheck: z.boolean().optional(),\n})\nexport type StornoIncomeInput')
  m3.set(BEF_SEMA, s3mut)
  if (s3mut === s3) bukik('M3 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m3).length === 0) bukik('M3: a bypass visszacsempészésére NEM bukik — vak')
  else pass('M3 mutáns (skipYearFinalizedCheck vissza a sémába) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — stornó/kuka/év-zár rendben`)
