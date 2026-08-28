#!/usr/bin/env node
/**
 * BELSŐ MOZGÁS INTEGRITÁS önellenőrzés (P0-7, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-7 találata (Endre döntése:
 * a KÖNYVELÉSI PÁR a kanonikus, a mester származtatott, a törlés kaszkádol):
 *   (1) a core mentés 3 insertje (mester + befizetes + kiadas) rollback
 *       nélkül futott — a kiadás-láb hibája féloldalas könyvet hagyott,
 *   (2) a mester Monetár-fülről elérhető törlése a párt életben hagyta —
 *       a „törölt" átvezetés benne maradt az egyenlegben,
 *   (3) a pár törlése a mestert hagyta életben (fordított kaszkád sem volt),
 *   (4) a core szerkesztő (desktop út) a pár egyik lábát átengedte
 *       szerkesztésre — a pár szétcsúszott (a web 2026-08-27 óta tiltja).
 *
 * A HÍD a mester és a pár közt: a pár iratszáma 'BM-<YYYYMMDD>-<mesterId>'
 * (a mentés így írja) — sémamódosítás nélkül determinisztikus a kaszkád.
 *
 * NEGATÍV ASSZERT: rollback-törlés + guard-törlés mutánsok.
 *
 * Futtatás:  node scripts/selftest-belsomozgas-integritas.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const SAVE = path.join(REPO, 'packages', 'core', 'src', 'finance', 'belsomozgas', 'save.ts')
const MESTER_DEL = path.join(REPO, 'packages', 'core', 'src', 'finance', 'belsomozgas', 'soft-delete.ts')
const BEF_DEL = path.join(REPO, 'packages', 'core', 'src', 'finance', 'befizetes', 'soft-delete.ts')
const KIA_DEL = path.join(REPO, 'packages', 'core', 'src', 'finance', 'kiadas', 'soft-delete.ts')
const UPDATE = path.join(REPO, 'packages', 'core', 'src', 'finance', 'update-transaction.ts')
const WEB_ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')

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

  // ── (1) save.ts: kompenzáló rollback mindkét láb hibájánál ──
  const saveS = stripComments(files.get(SAVE))
  const iBefErr = saveS.indexOf('if (befIns.error)')
  const iKiaErr = saveS.indexOf('if (kiaIns.error)')
  const befErrBlokk = iBefErr >= 0 ? saveS.slice(iBefErr, iKiaErr > iBefErr ? iKiaErr : iBefErr + 1800) : ''
  const kiaErrBlokk = iKiaErr >= 0 ? saveS.slice(iKiaErr, iKiaErr + 2600) : ''
  if (iBefErr < 0 || iKiaErr < 0) {
    hibak.push('save.ts: a láb-hibaágak nem találhatók (fail-closed)')
  } else {
    if (!/from\('belsomozgas'\)[\s\S]{0,120}?deleted: true/.test(befErrBlokk)) {
      hibak.push('save.ts: a bevétel-láb hibájánál a MESTER nem vonódik vissza — árva mester marad')
    }
    if (!/from\('befizetes'\)[\s\S]{0,160}?deleted: true/.test(kiaErrBlokk)) {
      hibak.push('save.ts: a kiadás-láb hibájánál a BEVÉTEL-láb nem vonódik vissza — féloldalas könyv marad')
    }
    if (!/from\('belsomozgas'\)[\s\S]{0,160}?deleted: true/.test(kiaErrBlokk)) {
      hibak.push('save.ts: a kiadás-láb hibájánál a MESTER nem vonódik vissza')
    }
  }

  // ── (2) mester-törlés kaszkádol a párra ──
  const mdS = stripComments(files.get(MESTER_DEL))
  if (!/BM-/.test(mdS)) {
    hibak.push('mester soft-delete: nincs BM-iratszám alapú pár-kaszkád — a „törölt" átvezetés az egyenlegben marad')
  } else {
    const iPar = mdS.indexOf('BM-')
    const iMesterDel = mdS.indexOf("from('belsomozgas')\n      .update({ deleted: true })")
    if (iMesterDel > 0 && iPar > iMesterDel) {
      hibak.push('mester soft-delete: a pár-kaszkád a mester törlése UTÁN fut — hibánál a mester már törölt, a pár él')
    }
    if (!/from\('befizetes'\)[\s\S]{0,240}?deleted: true/.test(mdS) || !/from\('kiadas'\)[\s\S]{0,240}?deleted: true/.test(mdS)) {
      hibak.push('mester soft-delete: nem törli MINDKÉT pár-lábat')
    }
  }

  // ── (3) fordított kaszkád: pár-törlés → mester ──
  for (const [nev, fajl] of [['core befizetes/soft-delete', BEF_DEL], ['core kiadas/soft-delete', KIA_DEL], ['web deleteTransaction', WEB_ACTIONS]]) {
    const s = stripComments(files.get(fajl))
    if (!/BM-\\d\{8\}|BM-(\\d|\d)/.test(s) || !s.includes('belsomozgas')) {
      hibak.push(`${nev}: a pár törlése nem kaszkádol a mester-sorra (BM-iratszám visszafejtés hiányzik)`)
    }
  }

  // ── (4) core szerkesztő: belső-mozgás láb tiltása ──
  // Pontos fragmentek: a naiv substring-ellenőrzést egy átnevezés (pl.
  // belso_mozgas_xkey_KIKAPCSOLVA) is átverné.
  const upS = stripComments(files.get(UPDATE))
  if (
    !/\.select\('datum, bankszamla_id, arfolyam, belso_mozgas_xkey'\)/.test(upS) ||
    !/if \(bmXkeyEdit\)/.test(upS)
  ) {
    hibak.push('core update-transaction: a belső-mozgás láb szerkesztése nincs tiltva — a pár szétcsúszhat (a web tiltja)')
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const f of [SAVE, MESTER_DEL, BEF_DEL, KIA_DEL, UPDATE, WEB_ACTIONS]) m.set(f, fs.readFileSync(f, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('belső mozgás: mentés-rollback + kétirányú törlés-kaszkád + core szerkesztés-tiltás a helyén')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a mester-rollback törlése a save kiadás-hibaágából
  const m1files = beolvas()
  const saveRaw = m1files.get(SAVE)
  const iKia = saveRaw.indexOf('if (kiaIns.error)')
  const blokk = saveRaw.slice(iKia, iKia + 2600)
  const blokkMut = blokk.replace(/\.from\('belsomozgas'\)/, ".from('belsomozgas_KIKAPCSOLVA')")
  m1files.set(SAVE, saveRaw.slice(0, iKia) + blokkMut + saveRaw.slice(iKia + 2600))
  if (blokkMut === blokk) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1files).length === 0) bukik('M1: a mester-rollback törlésére az őr NEM bukik — vak')
  else pass('M1 mutáns (mester-rollback törölve) → az őr elbuktatja')

  // M2: a szerkesztés-tiltás törlése a core update-ből
  const m2files = beolvas()
  const upRaw = m2files.get(UPDATE)
  const upMut = upRaw.replace(/belso_mozgas_xkey/g, 'belso_mozgas_xkey_KIKAPCSOLVA')
  m2files.set(UPDATE, upMut)
  if (upMut === upRaw) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2files).length === 0) bukik('M2: a guard törlésére az őr NEM bukik — vak')
  else pass('M2 mutáns (szerkesztés-tiltás törölve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — belső mozgás integritás rendben`)
