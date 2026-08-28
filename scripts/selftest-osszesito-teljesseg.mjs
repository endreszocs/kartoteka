#!/usr/bin/env node
/**
 * ÖSSZESÍTŐ-TELJESSÉG + LÁTHATÓSÁG önellenőrzés
 * (E-blokk: P4-29, P3-20, P3-7, P4-36 — 2026-08-29)
 *
 * MIT ŐRIZ:
 *   (1) P4-29 finalizeAccounting: a KÓD-alapú (xkey nélküli) belső mozgás is
 *       kimarad a szerver-összesítőből (100/3xx/4xx cél-kódok);
 *   (2) P3-20 az Excel-outbox 'blocked' állapota PROAKTÍV jelzést kap
 *       (kartoteka:excel-blocked esemény + shell-sáv), és az enqueue-hiba
 *       sem csak console.error;
 *   (3) P3-7 az AutoSyncOrchestrator full-bundle-je a pénzügyi tükröt
 *       (befizetes/kiadas/bealitas) is pull-olja;
 *   (4) P4-36 a wipe-monetar SQL a sourceid-prefixszel töröl (a monetar-nak
 *       nincs congregation_id oszlopa).
 *
 * Futtatás:  node scripts/selftest-osszesito-teljesseg.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')
const WRITE_SYNC = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'excel-write-sync.ts')
const ENQUEUE = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'excel-enqueue.ts')
const SHELL = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'shell', 'desktop-shell.tsx')
const ORCH = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'sync-orchestrator.ts')
const WIPE_SQL = path.join(REPO, 'migration-docs', 'sql', '2026-08-29-wipe-monetar.sql')

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

  // (1) P4-29 — finalizeAccounting kód-alapú belső-mozgás szűrés
  const a = stripComments(files.get(ACTIONS))
  const iFin = a.indexOf('export async function finalizeAccounting')
  const finFn = iFin >= 0 ? a.slice(iFin, iFin + 20000) : ''
  if (!/belsoBevCelIds/.test(finFn) || !/belsoKiaCelIds/.test(finFn)) {
    hibak.push('P4-29: a finalizeAccounting nem oldja fel a belső cél-kódokat — a kód-alapú belső mozgás benne marad')
  }
  if (!/belsoBevCelIds\.has\(Number\(r\[categoryColBef\]\)\)\) continue/.test(finFn)) {
    hibak.push('P4-29: a bevétel-összesítő nem hagyja ki a kód-alapú belső mozgást')
  }
  if (!/belsoKiaCelIds\.has\(Number\(r\[categoryColKia\]\)\)\) continue/.test(finFn)) {
    hibak.push('P4-29: a kiadás-összesítő nem hagyja ki a kód-alapú belső mozgást')
  }

  // (2) P3-20 — blocked-jelzés
  const w = stripComments(files.get(WRITE_SYNC))
  if (!/'kartoteka:excel-blocked'/.test(w) || !/getExcelOutboxCounts/.test(w)) {
    hibak.push('P3-20: a write-sync nem jelzi a beragadt (blocked) sorokat')
  }
  const e = stripComments(files.get(ENQUEUE))
  if (!/'kartoteka:excel-blocked'/.test(e)) {
    hibak.push('P3-20: az enqueue-hiba csak console.error — a beragadt főkönyv-sor észrevétlen')
  }
  const sh = stripComments(files.get(SHELL))
  if (!/'kartoteka:excel-blocked'/.test(sh) || !/excelBlocked > 0/.test(sh)) {
    hibak.push('P3-20: a shell nem mutat sávot a beragadt Excel-sorokra')
  }

  // (3) P3-7 — pénzügyi pull a bundle-ben
  const o = stripComments(files.get(ORCH))
  if (!/pullFinanceOfOwnCongregation/.test(o) || !/pullBefizetesek/.test(o) || !/pullFinanceSettings/.test(o)) {
    hibak.push('P3-7: a full-bundle nem pull-olja a pénzügyi tükröt (befizetes/kiadas/bealitas)')
  }
  const iBundle = o.indexOf('async function syncFullBundle')
  const bundleFn = iBundle >= 0 ? o.slice(iBundle, iBundle + 1200) : ''
  if (!/pullFinanceOfOwnCongregation\(userId\)/.test(bundleFn)) {
    hibak.push('P3-7: a pullFinanceOfOwnCongregation nincs bekötve a syncFullBundle-be')
  }

  // (4) P4-36 — wipe-monetar SQL
  const q = files.get(WIPE_SQL)
  if (!/sourceid LIKE \$1/.test(q) || !/tbl = 'monetar'/.test(q)) {
    hibak.push('P4-36: a wipe-monetar SQL-ből hiányzik a sourceid-prefix törlő ág')
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const fp of [ACTIONS, WRITE_SYNC, ENQUEUE, SHELL, ORCH, WIPE_SQL]) {
    m.set(fp, fs.readFileSync(fp, 'utf8'))
  }
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('összesítő-teljesség: belső-kód szűrés + blocked-jelzés + pénzügyi pull + monetar-wipe rendben')
} else {
  for (const hb of hibak) bukik(hb)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a belső-kód szűrés kilövése a bevétel-ágon
  const m1 = beolvas()
  const a1 = m1.get(ACTIONS)
  const a1mut = a1.replace(/belsoBevCelIds\.has\(Number\(r\[categoryColBef\]\)\)\) continue/, 'false) continue')
  m1.set(ACTIONS, a1mut)
  if (a1mut === a1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: a belső-kód szűrés kilövésére NEM bukik — vak')
  else pass('M1 mutáns (finalizeAccounting belső-szűrés kilőve) → az őr elbuktatja')

  // M2: a blocked-jelzés törlése a write-syncből
  const m2 = beolvas()
  const w2 = m2.get(WRITE_SYNC)
  const w2mut = w2.replace(/kartoteka:excel-blocked/g, 'kartoteka:excel-blocked_KIKAPCSOLVA')
  m2.set(WRITE_SYNC, w2mut)
  if (w2mut === w2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2).length === 0) bukik('M2: a blocked-jelzés törlésére NEM bukik — vak')
  else pass('M2 mutáns (blocked-jelzés kilőve) → az őr elbuktatja')

  // M3: a pénzügyi pull kivétele a bundle-ből
  const m3 = beolvas()
  const o3 = m3.get(ORCH)
  const o3mut = o3.replace(/\s*pullFinanceOfOwnCongregation\(userId\),/, '')
  m3.set(ORCH, o3mut)
  if (o3mut === o3) bukik('M3 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m3).length === 0) bukik('M3: a pénzügyi pull kivételére NEM bukik — vak')
  else pass('M3 mutáns (pénzügyi pull kivéve a bundle-ből) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — összesítő-teljesség rendben`)
