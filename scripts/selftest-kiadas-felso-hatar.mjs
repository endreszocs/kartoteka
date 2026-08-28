#!/usr/bin/env node
/**
 * KIADAS.DATUM FELSŐ HATÁR önellenőrzés (P0-2, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P0-2 találata (ismert hibaosztály):
 *   A kiadas.datum TIMESTAMP (a befizetes.datum DATE) — a `.lte('datum',
 *   'ÉÉÉÉ-12-31')` felső határ a kiadáson ÉJFÉLT jelent, és HÁROM különböző
 *   minta élt egymás mellett: web `.lte '12-31'`, desktop `.lte 'T23:59:59'`,
 *   resolver `.lt` (köv. jan 1). Egyetlen nem-éjféli dec. 31-i sornál a web
 *   éves listája/zárása kihagyta volna, a desktop-tükör és a köv. évi nyitó
 *   tartalmazta volna — három felület három összeget mutat. (Az éles
 *   diagnosztika 2026-08-28-án 0 nem-éjféli sort mért — a javítás tisztán
 *   megelőző kód-egységesítés.)
 *
 * A JAVÍTOTT VILÁG — EGYETLEN kanonikus minta:
 *   kiadas-t (vagy dinamikus táblát) érintő év-felső-határ = KIZÁRÓ
 *   `.lt('datum', 'KÖV_ÉV-01-01')`. A csak-DATE táblák (befizetes,
 *   belsomozgas, diocese/district) `.lte '12-31'` alakja helyes és maradhat.
 *   A 'T23:59:59' minta sehol nem maradhat (a 23:59:59.5 is kicsúszna rajta).
 *
 * ELLENŐRZÉS: minden `.lte('datum'...)` előfordulásnál a lánc legközelebbi
 * megelőző `.from(...)` argumentuma CSAK engedélyezett DATE-tábla lehet.
 *
 * NEGATÍV ASSZERT: kiadas-lánc visszabutítása lte-re + T23:59:59 visszaírása.
 *
 * Futtatás:  node scripts/selftest-kiadas-felso-hatar.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const FAJLOK = [
  'apps/web/app/(dashboard)/penzugy/actions.ts',
  'apps/web/app/(dashboard)/penzugy/edit-storno-actions.ts',
  'apps/web/app/(dashboard)/penzugy/finalization-actions.ts',
  'apps/web/app/(dashboard)/penzugy/oblio-ellenorzes-actions.ts',
  'apps/web/app/(dashboard)/penzugy/decont-actions.ts',
  'apps/web/app/(dashboard)/penzugy/dispozitie-actions.ts',
  'apps/desktop/src/components/desktop-oblio-tab.tsx',
  'apps/desktop/src/components/finance-print-dialog.tsx',
  'apps/desktop/src/components/settings/konyveles-panel.tsx',
  'apps/desktop/src/lib/finance-entry-lookups.ts',
  'apps/desktop/src/lib/finance-sync.ts',
  'packages/core/src/finance/kiadas/list.ts',
  'packages/core/src/finance/kiadas/next-receipt-number.ts',
  'packages/core/src/finance/update-transaction.ts',
].map((p) => [p, path.join(REPO, ...p.split('/'))])

/** DATE-táblák, ahol az inkluzív `.lte '12-31'` helyes. */
const ENGEDETT_FROM = new Set([
  "'befizetes'",
  "'belsomozgas'",
  'T.befizetes',
  "'bankszamla_nyito_egyenleg'",
  "'valuta_atert'",
])

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function ellenoriz(nev, src) {
  const s = stripComments(src)
  const hibak = []

  if (s.includes('12-31T23:59:59')) {
    hibak.push(`${nev}: a 'T23:59:59' felső határ még él — a kanonikus minta a kizáró '< köv. jan 1'`)
  }

  const lteRegex = /\.lte\('datum'/g
  let m
  while ((m = lteRegex.exec(s)) !== null) {
    const ablak = s.slice(Math.max(0, m.index - 1200), m.index)
    const fromok = [...ablak.matchAll(/\.from\(([^)]+)\)/g)]
    if (fromok.length === 0) {
      hibak.push(`${nev}: .lte('datum'...) lánc-forrás nélkül a(z) ${m.index}. pozíciónál (fail-closed)`)
      continue
    }
    const utolso = fromok[fromok.length - 1][1].trim()
    if (!ENGEDETT_FROM.has(utolso)) {
      hibak.push(`${nev}: .lte('datum'...) egy ${utolso} láncon — kiadas/dinamikus táblán a kizáró .lt(köv. jan 1) a kanonikus`)
    }
  }

  return hibak
}

let osszHiba = 0
for (const [nev, teljes] of FAJLOK) {
  if (!fs.existsSync(teljes)) { bukik(`hiányzik: ${teljes}`); osszHiba++; continue }
  const hibak = ellenoriz(nev, fs.readFileSync(teljes, 'utf8'))
  osszHiba += hibak.length
  for (const h of hibak) bukik(h)
}
if (osszHiba === 0) pass(`mind a ${FAJLOK.length} pénzügyi fájl felső határa kanonikus (kiadas: kizáró .lt; DATE-táblák: .lte)`)

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (osszHiba === 0) {
  const actionsPath = FAJLOK[0][1]
  const src = fs.readFileSync(actionsPath, 'utf8')

  // M1: egy kiadas-lánc visszabutítása inkluzív lte-re
  const m1 = src.replace(/\.lt\('datum', `\$\{year \+ 1\}-01-01`\)/, ".lte('datum', `${year}-12-31`)")
  if (m1 === src) bukik('M1 mutáció nem változtatott a forráson (fail-closed)')
  else if (ellenoriz('actions', m1).length === 0) bukik('M1: a visszabutított kiadas-láncra az őr NEM bukik — vak')
  else pass('M1 mutáns (kiadas-lánc lte-re butítva) → az őr elbuktatja')

  // M2: a T23:59:59 minta visszaírása a desktop-pullba
  const syncPath = FAJLOK[10][1]
  const syncSrc = fs.readFileSync(syncPath, 'utf8')
  const m2 = syncSrc.replace(/\$\{year \+ 1\}-01-01/, '${year}-12-31T23:59:59')
  if (m2 === syncSrc) bukik('M2 mutáció nem változtatott a finance-sync-en (fail-closed)')
  else if (ellenoriz('finance-sync', m2).length === 0) bukik('M2: a T23:59:59 visszaírására az őr NEM bukik — vak')
  else pass('M2 mutáns (T23:59:59 visszaírva) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — kiadas felső határ kanonikus`)
