#!/usr/bin/env node
/**
 * ÁTVEZETÉS-PÁR ROLLBACK-ELLENŐRZÉS önellenőrzés (P0-13, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-13 találata:
 *   A webes kassza↔bank átvezetés két külön insert (kiadás, majd bevétel). A
 *   bevétel-láb hibájánál a kód visszavonja a már beszúrt kiadás-lábat — de a
 *   visszavonó UPDATE eredményét SENKI nem olvasta. Ha a rollback is elhasal
 *   (hálózat, RLS), a kiadás-láb bent marad (fél átvezetés → téves kassza/bank
 *   egyenleg), és a hibaüzenet ezt elhallgatja.
 *
 * A JAVÍTOTT VILÁG INVARIÁNSAI:
 *   (1) a rollback eredménye VÁLTOZÓBA kerül (nem fire-and-forget),
 *   (2) az érintett sorok száma ellenőrizhető (.select('id') az update után),
 *   (3) az eredményt tényleg ellenőrzi (rb.error / sor-szám),
 *   (4) kettős hibánál a felhasználó EXPLICIT üzenetet kap arról, hogy fél pár
 *       maradt ("sem sikerült").
 *
 * NEGATÍV ASSZERT: a régi világ visszajátszása mutánsokkal.
 *
 * Futtatás:  node scripts/selftest-atvezetes-par-rollback.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function ellenoriz(src) {
  const s = stripComments(src)
  const hibak = []

  const iFn = s.indexOf('async function saveKasszaBankTransferPair')
  const iVege = s.indexOf('export async function saveInternalTransfer')
  if (iFn < 0 || iVege < 0 || iVege < iFn) {
    hibak.push('a saveKasszaBankTransferPair régió nem található (fail-closed)')
    return hibak
  }
  const fn = s.slice(iFn, iVege)

  const iHiba = fn.indexOf('if (befIns.error)')
  const iUtana = fn.indexOf('refreshNextYearCarryoverUseCase', iHiba)
  if (iHiba < 0 || iUtana < 0) {
    hibak.push('a bevétel-oldali hibaág régiója nem található (fail-closed)')
    return hibak
  }
  const blokk = fn.slice(iHiba, iUtana)

  const varMatch = /const (\w+) = await supabase\s*[\s\S]{0,200}?\.update\(\{ deleted: true \}\)/.exec(blokk)
  if (!varMatch) {
    hibak.push('a kiadás-láb visszavonása fire-and-forget — az eredménye nincs változóba kötve')
    return hibak
  }
  const rbNev = varMatch[1]

  if (!blokk.includes(".select('id')")) {
    hibak.push('a visszavonó UPDATE után nincs .select(\'id\') — az érintett sorszám nem ellenőrizhető (0 sor = néma nem-történt-semmi)')
  }
  if (!new RegExp(`${rbNev}\\.error`).test(blokk)) {
    hibak.push(`a visszavonás eredménye (${rbNev}.error) nincs ellenőrizve`)
  }
  if (!/sem sikerült/.test(blokk)) {
    hibak.push('kettős hibánál nincs explicit "a visszavonás sem sikerült" üzenet — a fél pár néma maradna')
  }

  return hibak
}

const src = fs.readFileSync(ACTIONS, 'utf8')

const hibak = ellenoriz(src)
if (hibak.length === 0) {
  pass('átvezetés-pár: a rollback eredménye ellenőrzött, kettős hibánál hangos fél-pár jelzés')
} else {
  for (const h of hibak) bukik(h)
}

if (hibak.length === 0) {
  // M1: vissza a fire-and-forget világba
  const m1 = src.replace(/const (\w+) = (await supabase\s*\n\s*\.from\('kiadas'\)\s*\n\s*\.update\(\{ deleted: true \}\))/, '$2')
  if (m1 === src) bukik('M1 mutáció nem változtatott a forráson (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: a fire-and-forget mutánsra az őr NEM bukik — vak')
  else pass('M1 mutáns (eredmény változó nélkül) → az őr elbuktatja')

  // M2: a sorszám-ellenőrzés (.select) elhagyása a rollback-blokkban
  const iFnRaw = src.indexOf('async function saveKasszaBankTransferPair')
  const iVegeRaw = src.indexOf('export async function saveInternalTransfer')
  const iHibaRaw = src.indexOf('if (befIns.error)', iFnRaw)
  const iUtanaRaw = src.indexOf('refreshNextYearCarryoverUseCase', iHibaRaw)
  if (iHibaRaw < 0 || iUtanaRaw < 0 || iVegeRaw < iFnRaw) {
    bukik('M2 mutáció: a hibaág nem található (fail-closed)')
  } else {
    const blokkRaw = src.slice(iHibaRaw, iUtanaRaw)
    const blokkMut = blokkRaw.replace(/\s*\.select\('id'\)/, '')
    const m2 = src.slice(0, iHibaRaw) + blokkMut + src.slice(iUtanaRaw)
    if (m2 === src) bukik('M2 mutáció nem változtatott a forráson (fail-closed)')
    else if (ellenoriz(m2).length === 0) bukik('M2: a select-elhagyó mutánsra az őr NEM bukik — vak')
    else pass('M2 mutáns (.select nélkül) → az őr elbuktatja')
  }
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — átvezetés-pár rollback rendben`)
