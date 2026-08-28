#!/usr/bin/env node
/**
 * DESKTOP SYNC + PRINT önellenőrzés
 * (E-blokk: P3-18, P3-19, P3-21, P4-31, P4-33 — 2026-08-29)
 *
 * MIT ŐRIZ:
 *   (1) P3-18 a desktop print-út TARTALOM-alapú készenlétet vár (nem fix
 *       300 ms), és a data-sheet-count lapszám-őr csonka nyomtatás helyett
 *       hangosan megáll;
 *   (2) P3-19 a sync-badge ÉV-FÜGGETLENÜL számol (countLocalPendingPenzugyOsszes);
 *   (3) P3-21 a három pénzügyi pusher hálózati hibánál NEM billen végleges
 *       „ütközés"-re (plafonos örök retry) — konfliktus csak nem-hálózati
 *       tartós hibára jár;
 *   (4) P4-31 a desktop befizetés a TÉNYLEGES befizető-nevet menti forrasa-ba;
 *   (5) P4-33 a Cargo crate-verzió egyezik a tauri.conf verziójával.
 *
 * Futtatás:  node scripts/selftest-desktop-sync-print.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const PRINT = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'print-html.ts')
const BADGE = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'sync-status-indicator.tsx')
const BACKEND = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'tauri-sqlite-backend.ts')
const PUSHERS = [
  path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'befizetes-write-sync.ts'),
  path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'kiadas-write-sync.ts'),
  path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'chitanta-sync.ts'),
]
const BEF_PAGE = path.join(REPO, 'apps', 'desktop', 'src', 'pages', 'befizetes-page.tsx')
const CARGO = path.join(REPO, 'apps', 'desktop', 'src-tauri', 'Cargo.toml')
const TAURI_CONF = path.join(REPO, 'apps', 'desktop', 'src-tauri', 'tauri.conf.json')

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

  // (1) P3-18 — print-készenlét
  const p = stripComments(files.get(PRINT))
  if (/setTimeout\(resolve, 300\)/.test(p) && !/childElementCount/.test(p)) {
    hibak.push('P3-18: a desktop print még fix 300 ms-ot vár — csonka nyomtatás lassú gépen')
  }
  if (!/childElementCount > 0/.test(p)) {
    hibak.push('P3-18: nincs tartalom-alapú készenlét a desktop printben')
  }
  if (!/sheetCount/.test(p) || !/\.sheet, body \.page/.test(p)) {
    hibak.push('P3-18: nincs data-sheet-count lapszám-őr a desktop printben')
  }

  // (2) P3-19 — badge év-független
  const b = stripComments(files.get(BADGE))
  if (!/countLocalPendingPenzugyOsszes/.test(b)) {
    hibak.push('P3-19: a sync-badge nem az év-független számolót hívja')
  }
  if (/listLocalPendingBefizetes\(congregationId, currentYear\)/.test(b)) {
    hibak.push('P3-19: a badge visszatért az év-szűrt listázásra')
  }
  const be = stripComments(files.get(BACKEND))
  if (!/countLocalPendingPenzugyOsszes/.test(be)) {
    hibak.push('P3-19: a backendből hiányzik a countLocalPendingPenzugyOsszes')
  }

  // (3) P3-21 — pusherek hálózati osztályozása. A KAPU maga kell (\b + a
  // pontos `if (!halozatiHiba)` alak), nem csak a változónév jelenléte —
  // különben egy átnevezett/kikapcsolt kapu mellett is zöld maradna.
  for (const fp of PUSHERS) {
    const s = stripComments(files.get(fp))
    if (!/econnrefused\|offline/.test(s) || !/if \(!halozatiHiba\) \{/.test(s)) {
      hibak.push(`P3-21: ${path.basename(fp)} — nincs hálózati-hiba kapu a max-attempt ágon`)
    }
    if (/ellenőrizd az iratszámot|ellenőrizd a sorszámot/.test(s)) {
      hibak.push(`P3-21: ${path.basename(fp)} — visszatért a félrevezető „ellenőrizd az iratszámot" üzenet`)
    }
  }

  // (4) P4-31 — valódi befizető-név
  const bp = stripComments(files.get(BEF_PAGE))
  if (!/selectedTag\.csaladnev, selectedTag\.k_nev/.test(bp)) {
    hibak.push('P4-31: a desktop befizetés nem a tényleges befizető-nevet menti forrasa-ba')
  }

  // (5) P4-33 — verzió-egyezés
  const cargoVer = (files.get(CARGO).match(/^version = "([^"]+)"/m) || [])[1]
  const confVer = JSON.parse(files.get(TAURI_CONF)).version
  if (!cargoVer || cargoVer !== confVer) {
    hibak.push(`P4-33: verzió-széthúzás — Cargo.toml=${cargoVer || '?'} vs tauri.conf.json=${confVer}`)
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const fp of [PRINT, BADGE, BACKEND, ...PUSHERS, BEF_PAGE, CARGO, TAURI_CONF]) {
    m.set(fp, fs.readFileSync(fp, 'utf8'))
  }
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('desktop sync+print: tartalom-készenlét, év-független badge, hálózat-tudatos retry, valódi befizető-név, verzió-egyezés')
} else {
  for (const hb of hibak) bukik(hb)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a print visszabontása fix 300 ms-ra
  const m1 = beolvas()
  const p1 = m1.get(PRINT)
  const p1mut = p1
    .replace(/childElementCount > 0/g, 'childElementCount >= 0')
    .replace(/childElementCount/g, 'childElementCount_KIKAPCSOLVA')
  m1.set(PRINT, p1mut)
  if (p1mut === p1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: a tartalom-készenlét kilövésére NEM bukik — vak')
  else pass('M1 mutáns (print tartalom-készenlét kilőve) → az őr elbuktatja')

  // M2: a badge visszabontása év-szűrt listázásra
  const m2 = beolvas()
  const b2 = m2.get(BADGE)
  const b2mut = b2.replace(/countLocalPendingPenzugyOsszes\(congregationId\)/, 'listLocalPendingBefizetes(congregationId, currentYear)')
  m2.set(BADGE, b2mut)
  if (b2mut === b2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2).length === 0) bukik('M2: a badge év-szűrt visszabontására NEM bukik — vak')
  else pass('M2 mutáns (badge év-szűrt vissza) → az őr elbuktatja')

  // M3: a hálózati kapu hatástalanítása (mindig konfliktusra billen — a RÉGI világ)
  const m3 = beolvas()
  const s3 = m3.get(PUSHERS[0])
  const s3mut = s3.replace(/if \(!halozatiHiba\) \{/, 'if (true) {')
  m3.set(PUSHERS[0], s3mut)
  if (s3mut === s3) bukik('M3 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m3).length === 0) bukik('M3: a hálózati osztályozás törlésére NEM bukik — vak')
  else pass('M3 mutáns (pusher hálózat-osztályozás kilőve) → az őr elbuktatja')

  // M4: verzió-széthúzás visszajátszása
  const m4 = beolvas()
  const c4 = m4.get(CARGO)
  const c4mut = c4.replace(/^version = "[^"]+"/m, 'version = "0.9.5"')
  m4.set(CARGO, c4mut)
  if (c4mut === c4) bukik('M4 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m4).length === 0) bukik('M4: a verzió-széthúzásra NEM bukik — vak')
  else pass('M4 mutáns (Cargo-verzió visszahúzva) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — desktop sync+print rendben`)
