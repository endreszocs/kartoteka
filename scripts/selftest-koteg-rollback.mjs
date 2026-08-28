#!/usr/bin/env node
/**
 * KÖTEG-MENTÉS ROLLBACK önellenőrzés (P0-8, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-8 találata:
 *   A bevétel-köteg (saveIncomeBatch) soronként insertelt, és köztes hibánál
 *   rollback NÉLKÜL tért vissza — a már beszúrt sorok bent maradtak, a rögzítő
 *   hibánál minden sort megtart, így az újramentés DUPLIKÁLT. Ugyanez a rés a
 *   kiadás-köteg FELSŐ SZINTŰ (megyei/kerületi) ágán is: ott sem követés, sem
 *   visszavonás nem volt — miközben a gyülekezeti kiadás-ág 2026-08-09 óta
 *   minden-vagy-semmi.
 *
 * A JAVÍTOTT VILÁG INVARIÁNSAI:
 *   (I1) a saveIncomeBatch definiál rollback-helpert (rollbackInsertedIncomes),
 *   (I2) a hiba-ág AWAIT-tel meg is hívja,
 *   (I3) a beszúrt sorokat követi (insertedIncomes.push),
 *   (I4) a rollback SCOPE-TUDATOS: tablesFor-alapú tábla + scope-oszlop
 *        (T.befizetes / T.scopeCol) — különben a felső szintű visszavonás a
 *        rossz táblán némán 0 sorra futna,
 *   (I5) a felhasználó megtudja, hogy a köteg visszavonódott ("visszavonva").
 *   (E1) a saveExpenseBatch felső szintű ága hibánál rollbackol,
 *   (E2) a felső szintű beszúrt sorok is követve vannak,
 *   (E3) a kiadás-rollback is scope-tudatos (T.kiadas / T.scopeCol).
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak):
 *   a régi hibás világot a MAI forrásból állítjuk elő, és bizonyítjuk, hogy az
 *   őr elbuktatná. Ha egy mutáció nem változtat a forráson: fail-closed hiba.
 *
 * Futtatás:  node scripts/selftest-koteg-rollback.mjs
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

/** A három export-határ közti régiók kivágása — fail-closed, ha nem találjuk. */
function regiok(src) {
  const iInc = src.indexOf('export async function saveIncomeBatch')
  const iExp = src.indexOf('export async function saveExpenseBatch')
  const iDel = src.indexOf('export async function deleteTransaction')
  if (iInc < 0 || iExp < 0 || iDel < 0 || !(iInc < iExp && iExp < iDel)) return null
  return { income: src.slice(iInc, iExp), expense: src.slice(iExp, iDel) }
}

/** Az invariánsok ellenőrzése egy forrás-változaton. Hibalistát ad. */
function ellenoriz(src) {
  const s = stripComments(src)
  const r = regiok(s)
  const hibak = []
  if (!r) {
    hibak.push('a saveIncomeBatch/saveExpenseBatch/deleteTransaction régió-kivágás nem sikerült (fail-closed)')
    return hibak
  }

  // ── bevétel-köteg ──
  if (!/const rollbackInsertedIncomes = async/.test(r.income)) {
    hibak.push('I1: a saveIncomeBatch nem definiál rollback-helpert (rollbackInsertedIncomes)')
  }
  if (!/await rollbackInsertedIncomes\(\)/.test(r.income)) {
    hibak.push('I2: a saveIncomeBatch hiba-ága nem hívja a rollbackot — részleges köteg marad, az újramentés duplikál')
  }
  if (!/insertedIncomes\.push\(/.test(r.income)) {
    hibak.push('I3: a beszúrt bevétel-sorok nincsenek követve (insertedIncomes.push hiányzik)')
  }
  if (!(/T\.befizetes/.test(r.income) && /T\.scopeCol/.test(r.income))) {
    hibak.push('I4: a bevétel-rollback nem scope-tudatos (T.befizetes / T.scopeCol hiányzik) — felső szinten a rossz táblán vonna vissza')
  }
  if (!/visszavonva/.test(r.income)) {
    hibak.push('I5: a bevétel-köteg hibaüzenete nem mondja ki, hogy a köteg visszavonódott')
  }

  // ── kiadás-köteg: felső szintű ág ──
  const iBlokk = r.expense.indexOf("if (scope.scope !== 'congregation')")
  const iBlokkVege = r.expense.indexOf('continue', iBlokk)
  if (iBlokk < 0 || iBlokkVege < 0) {
    hibak.push('a saveExpenseBatch felső szintű ága nem található (fail-closed)')
    return hibak
  }
  const felsoBlokk = r.expense.slice(iBlokk, iBlokkVege)
  if (!/await rollbackInsertedExpenses\(\)/.test(felsoBlokk)) {
    hibak.push('E1: a kiadás-köteg FELSŐ SZINTŰ ága hibánál nem rollbackol — részleges megyei/kerületi köteg marad')
  }
  if (!/insertedExpenses\.push\(/.test(felsoBlokk)) {
    hibak.push('E2: a felső szintű beszúrt kiadás-sorok nincsenek követve')
  }
  if (!(/T\.kiadas/.test(r.expense) && /T\.scopeCol/.test(r.expense))) {
    hibak.push('E3: a kiadás-rollback nem scope-tudatos (T.kiadas / T.scopeCol hiányzik)')
  }

  return hibak
}

const src = fs.readFileSync(ACTIONS, 'utf8')

// ── (A) POZITÍV ──────────────────────────────────────────────────────────────
const hibak = ellenoriz(src)
if (hibak.length === 0) {
  pass('köteg-mentések: minden-vagy-semmi rollback mindkét oldalon, scope-tudatos táblákkal')
} else {
  for (const h of hibak) bukik(h)
}

// ── (B) NEGATÍV (mutánsok) — csak zöld pozitív után van értelmük ────────────
if (hibak.length === 0) {
  // M1: a bevétel-rollback hívás eltávolítása (a fix előtti világ)
  const m1 = src.replace(/await rollbackInsertedIncomes\(\)/g, '')
  if (m1 === src) bukik('M1 mutáció nem változtatott a forráson (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: a bevétel-rollback eltávolítására az őr NEM bukik — vak')
  else pass('M1 mutáns (bevétel-rollback hívás nélkül) → az őr elbuktatja')

  // M2: a felső szintű kiadás-ág rollback-hívásának eltávolítása.
  // Célzottan a blokkon belül cserélünk, a gyülekezeti ágét meghagyjuk.
  const iExpRaw = src.indexOf('export async function saveExpenseBatch')
  const iBlokkRaw = src.indexOf("if (scope.scope !== 'congregation')", iExpRaw)
  const iBlokkVegeRaw = src.indexOf('continue', iBlokkRaw)
  if (iExpRaw < 0 || iBlokkRaw < 0 || iBlokkVegeRaw < 0) {
    bukik('M2 mutáció: a felső szintű blokk nem található (fail-closed)')
  } else {
    const blokk = src.slice(iBlokkRaw, iBlokkVegeRaw)
    const blokkMutalt = blokk.replace(/await rollbackInsertedExpenses\(\)/g, '')
    const m2 = src.slice(0, iBlokkRaw) + blokkMutalt + src.slice(iBlokkVegeRaw)
    if (m2 === src) bukik('M2 mutáció nem változtatott a forráson (fail-closed)')
    else if (ellenoriz(m2).length === 0) bukik('M2: a felső szintű kiadás-rollback eltávolítására az őr NEM bukik — vak')
    else pass('M2 mutáns (felső szintű kiadás-rollback nélkül) → az őr elbuktatja')
  }

  // M3: a scope-tudatosság visszabutítása (hardcoded tábla)
  const m3 = src.replace(/T\.kiadas/g, "'kiadas'")
  if (m3 === src) bukik('M3 mutáció nem változtatott a forráson (fail-closed)')
  else if (ellenoriz(m3).length === 0) bukik('M3: a hardcoded táblanevű mutánsra az őr NEM bukik — vak')
  else pass('M3 mutáns (hardcoded kiadás-tábla) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — köteg-rollback rendben`)
