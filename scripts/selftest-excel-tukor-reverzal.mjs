#!/usr/bin/env node
/**
 * EXCEL-TÜKÖR REVERZÁL + AUTO-EGYEZTETÉS önellenőrzés (D12, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P2-találata + Endre döntése:
 * a hivatalos Excel-főkönyv és a DB több úton széthúzott —
 *   (1) az átvezetés (belső mozgás) törlése/sztornója az Excelben NEM kapott
 *       ellensort: a sorok a `belsomozgas:<id>` kulcs alatt éltek, a
 *       reverzáló viszont `befizetes/kiadas:<id>` kulcsot keresett → sosem
 *       talált; a törölt átvezetés bent maradt az Excel-összegekben;
 *   (2) az E4-egyeztetés (Excel ↔ Kartotéka) kézi volt, és semmi nem
 *       figyelmeztetett, ha sosem futott.
 *
 * A JAVÍTÁS:
 *   - enqueueTransferReversal: negált átvezetés-sorok (mindkét lapra),
 *     `:…-reverz` dedup-kulccsal; csak ha az eredeti az Excel-úton volt;
 *   - az enqueueStornoReversal felismeri a BM-iratszámú pár-lábat, és a
 *     MESTER átvezetés-reverzáljára delegál (minden hívóhelyen egységesen);
 *   - a Belső mozgások lista törlése is reverzált enqueue-ol;
 *   - az E4-összevetés lib-be került (excel-egyeztetes.ts), a sikeres
 *     Excel-írás után throttled AUTO-futással; eltérésnél a
 *     'kartoteka:excel-elteres' esemény megy ki, amit a shell figyelmeztető
 *     sávként jelenít meg.
 *
 * NEGATÍV ASSZERT: delegálás-törlő + auto-futás-kilövő mutánsok.
 *
 * Futtatás:  node scripts/selftest-excel-tukor-reverzal.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const ENQ = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'excel-enqueue.ts')
const BM_PAGE = path.join(REPO, 'apps', 'desktop', 'src', 'pages', 'belsomozgas-page.tsx')
const EGYEZTETES = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'excel-egyeztetes.ts')
const WRITE_SYNC = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'excel-write-sync.ts')
const SHELL = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'shell', 'desktop-shell.tsx')
const PANEL = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'settings', 'konyveles-panel.tsx')

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

  // ── (1) átvezetés-reverzál ──
  const e = stripComments(files.get(ENQ))
  if (!/export async function enqueueTransferReversal\(/.test(e)) {
    hibak.push('excel-enqueue: nincs enqueueTransferReversal — a törölt átvezetés bent marad az Excel-összegekben')
  }
  if (!/-Math\.abs\(/.test(e)) {
    hibak.push('excel-enqueue: a reverzál nem negált összeggel épül — a SUMIF nem nettózna')
  }
  if (!/-reverz/.test(e)) {
    hibak.push('excel-enqueue: nincs dedup reverz-kulcs — ismételt hívás duplázna')
  }
  // BM-delegálás a sztornó-reverzálban
  if (!/BM-\\d\{8\}/.test(e) || !/enqueueTransferReversal\(\{/.test(e)) {
    hibak.push('excel-enqueue: az enqueueStornoReversal nem delegál a mester átvezetés-reverzáljára (BM-iratszám híd)')
  }

  // ── (2) a Belső mozgások lista törlése reverzált enqueue-ol ──
  const b = stripComments(files.get(BM_PAGE))
  if (!/enqueueTransferReversal\(/.test(b)) {
    hibak.push('belsomozgas-page: a törlés nem enqueue-ol Excel-reverzált')
  }

  // ── (3) auto-egyeztetés ──
  if (!files.has(EGYEZTETES)) {
    hibak.push('excel-egyeztetes.ts HIÁNYZIK — az E4-összevetésnek nincs közös, auto-futtatható magja')
  } else {
    const g = stripComments(files.get(EGYEZTETES))
    if (!/export async function excelKartotekaOsszevetes\(/.test(g)) {
      hibak.push('excel-egyeztetes: nincs excelKartotekaOsszevetes export')
    }
  }
  const w = stripComments(files.get(WRITE_SYNC))
  if (!/excelKartotekaOsszevetes\(/.test(w) || !/kartoteka:excel-elteres/.test(w)) {
    hibak.push('excel-write-sync: a sikeres írás után nincs auto-egyeztetés + elteres-esemény')
  }
  const s = stripComments(files.get(SHELL))
  if (!/kartoteka:excel-elteres/.test(s)) {
    hibak.push('desktop-shell: az elteres-eseményre nincs figyelmeztető sáv')
  }
  const p = stripComments(files.get(PANEL))
  if (!/excelKartotekaOsszevetes\(/.test(p)) {
    hibak.push('konyveles-panel: a kézi E4 nem a közös magot használja — a két implementáció széthúzna')
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const fp of [ENQ, BM_PAGE, WRITE_SYNC, SHELL, PANEL]) m.set(fp, fs.readFileSync(fp, 'utf8'))
  if (fs.existsSync(EGYEZTETES)) m.set(EGYEZTETES, fs.readFileSync(EGYEZTETES, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('Excel-tükör: átvezetés-reverzál + BM-delegálás + auto-egyeztetés a helyén')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a BM-delegálás kilövése
  const m1files = beolvas()
  const e1 = m1files.get(ENQ)
  const e1mut = e1.replace(/BM-\\d\{8\}/, 'XX-\\d{8}')
  m1files.set(ENQ, e1mut)
  if (e1mut === e1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1files).length === 0) bukik('M1: a BM-delegálás kilövésére az őr NEM bukik — vak')
  else pass('M1 mutáns (BM-delegálás kilőve) → az őr elbuktatja')

  // M2: az auto-egyeztetés kilövése a write-syncből
  const m2files = beolvas()
  const w2 = m2files.get(WRITE_SYNC)
  const w2mut = w2.replace(/excelKartotekaOsszevetes\(/g, 'excelKartotekaOsszevetes_KIKAPCSOLVA(')
  m2files.set(WRITE_SYNC, w2mut)
  if (w2mut === w2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2files).length === 0) bukik('M2: az auto-egyeztetés kilövésére az őr NEM bukik — vak')
  else pass('M2 mutáns (auto-egyeztetés kilőve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — Excel-tükör reverzál + auto-egyeztetés rendben`)
