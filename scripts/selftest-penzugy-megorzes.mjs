#!/usr/bin/env node
/**
 * PÉNZÜGYI MEGŐRZÉS + VÁLTOZÁSNAPLÓ önellenőrzés (P4-26 — 2026-08-29)
 *
 * Endre döntése: a pénzügyi bizonylat-sorok 5 évig maradnak a Kukában, a
 * változásnapló 5 év után törlődik.
 *
 * MIT ŐRIZ:
 *   (1) az SQL: a purge-terv a 3 pénzügyi táblán 1825 napos (5 év), máshol
 *       30 napos; a változásnapló-triggerek mind a 3 táblára települnek
 *       (UPDATE+DELETE); a napló kliens-írása revoke-olva; 5 éves takarítás;
 *   (2) a kliens-visszaszámláló tábla-tudatos (retentionDaysFor), és mind a
 *       3 hívó (web actions, web view, desktop) ezt adja át;
 *   (3) az 5 éves konstans a kliensen is 1825.
 *
 * NEGATÍV ASSZERT: visszabontó mutánsok.
 *
 * Futtatás:  node scripts/selftest-penzugy-megorzes.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const SQL = path.join(REPO, 'migration-docs', 'sql', '2026-08-29-penzugy-audit-naplo-5ev.sql')
const COUNTDOWN = path.join(REPO, 'packages', 'ui-app', 'src', 'recycle-bin', 'countdown.ts')
const WEB_ACTIONS = path.join(REPO, 'apps', 'web', 'lib', 'offline', 'recycle-bin-actions.ts')
const WEB_VIEW = path.join(REPO, 'apps', 'web', 'components', 'shared', 'recycle-bin-view.tsx')
const DESKTOP = path.join(REPO, 'apps', 'desktop', 'src', 'lib', 'recycle-bin.ts')

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

  // (1) SQL
  const q = files.get(SQL)
  for (const t of ['befizetes', 'kiadas', 'belsomozgas']) {
    const re = new RegExp(String.raw`ARRAY\['${t}',\s*'deleted',\s*'1825'\]`)
    if (!re.test(q)) hibak.push(`SQL: a(z) ${t} nem 1825 napos (5 éves) megőrzést kap a purge-tervben`)
  }
  if (!/ARRAY\['munkanaplo',\s*'deleted',\s*'30'\]/.test(q)) {
    hibak.push('SQL: a nem-pénzügyi táblák 30 napos megőrzése sérült')
  }
  if (!/penzugy_valtozas_naplo_iro/.test(q) || !/AFTER UPDATE ON public\.%I/.test(q) || !/AFTER DELETE ON public\.%I/.test(q)) {
    hibak.push('SQL: a változásnapló-triggerek (UPDATE+DELETE) hiányoznak')
  }
  if (!/REVOKE INSERT, UPDATE, DELETE ON public\.penzugy_valtozas_naplo FROM authenticated/.test(q)) {
    hibak.push('SQL: a napló kliens-írása nincs revoke-olva — nem append-only')
  }
  if (!/letrejott < now\(\) - interval '5 years'/.test(q)) {
    hibak.push('SQL: a változásnapló 5 éves takarítása hiányzik')
  }

  // (2) kliens
  const c = stripComments(files.get(COUNTDOWN))
  if (!/PENZUGYI_RETENTION_DAYS = 1825/.test(c)) {
    hibak.push('kliens: a PENZUGYI_RETENTION_DAYS nem 1825 — a Kuka hamis visszaszámlálót mutatna')
  }
  if (!/\['befizetes', 'kiadas', 'belsomozgas'\]/.test(c)) {
    hibak.push('kliens: a pénzügyi tábla-készlet sérült a retentionDaysFor-ban')
  }
  for (const [nev, fp] of [
    ['web actions', WEB_ACTIONS],
    ['web view', WEB_VIEW],
    ['desktop', DESKTOP],
  ]) {
    const s = stripComments(files.get(fp))
    if (!/purgeCountdownDays\([^)]*retentionDaysFor\(/.test(s)) {
      hibak.push(`kliens (${nev}): a visszaszámláló nem tábla-tudatos — a pénzügyi soron 30 napot mutatna`)
    }
  }

  return hibak
}

function beolvas() {
  const m = new Map()
  for (const fp of [SQL, COUNTDOWN, WEB_ACTIONS, WEB_VIEW, DESKTOP]) m.set(fp, fs.readFileSync(fp, 'utf8'))
  return m
}

const files = beolvas()
const hibak = ellenoriz(files)
if (hibak.length === 0) {
  pass('pénzügyi megőrzés: 5 éves purge-terv + változásnapló + tábla-tudatos kliens rendben')
} else {
  for (const hb of hibak) bukik(hb)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a purge-terv visszabontása 30 napra a befizetésen
  const m1 = beolvas()
  const q1 = m1.get(SQL)
  const q1mut = q1.replace(/ARRAY\['befizetes',(\s*)'deleted',(\s*)'1825'\]/, "ARRAY['befizetes',$1'deleted',$2'30']")
  m1.set(SQL, q1mut)
  if (q1mut === q1) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: az 5 év visszabontására NEM bukik — vak')
  else pass('M1 mutáns (befizetes vissza 30 napra) → az őr elbuktatja')

  // M2: a kliens tábla-tudatosságának kilövése
  const m2 = beolvas()
  const w2 = m2.get(WEB_ACTIONS)
  const w2mut = w2.replace(/purgeCountdownDays\(deletedAt, now, retentionDaysFor\(table\)\)/, 'purgeCountdownDays(deletedAt, now)')
  m2.set(WEB_ACTIONS, w2mut)
  if (w2mut === w2) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2).length === 0) bukik('M2: a tábla-tudatosság kilövésére NEM bukik — vak')
  else pass('M2 mutáns (web visszaszámláló tábla-vak) → az őr elbuktatja')

  // M3: a REVOKE törlése (a napló írhatóvá válna)
  const m3 = beolvas()
  const q3 = m3.get(SQL)
  const q3mut = q3.replace(/REVOKE INSERT, UPDATE, DELETE ON public\.penzugy_valtozas_naplo FROM authenticated;\n/, '')
  m3.set(SQL, q3mut)
  if (q3mut === q3) bukik('M3 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m3).length === 0) bukik('M3: a REVOKE törlésére NEM bukik — vak')
  else pass('M3 mutáns (napló-REVOKE törölve) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — pénzügyi megőrzés rendben`)
