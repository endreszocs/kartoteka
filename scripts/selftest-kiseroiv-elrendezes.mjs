#!/usr/bin/env node
/**
 * KÍSÉRŐÍV-ELRENDEZÉS önellenőrzés (2026-08-28, Endre észrevétele)
 *
 * MIT ŐRIZ:
 *   (1) a kísérőív-dialógusban EGYETLEN görgetés van — az előnézet-doboz
 *       saját overflow-y-auto-ja a DialogContent görgetésével DUPLA csúszkát
 *       adott, és a szűk (24px) szélesség-ráhagyás vízszintes csúszkát +
 *       balra csúszott lapot okozott;
 *   (2) a nyomtatvány fejléce rács-elrendezésű (1fr/auto/1fr) — a közös
 *       flexben a hosszú bal oldali gyülekezetnév KITOLTA a címet a középről.
 *
 * NEGATÍV ASSZERT: dupla-görgetés visszahozó + rács-visszabontó mutánsok.
 *
 * Futtatás:  node scripts/selftest-kiseroiv-elrendezes.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const DLG = path.join(REPO, 'apps', 'web', 'components', 'finance', 'kiseroiv-print-dialog.tsx')
const REP = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'reporting.ts')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function ellenoriz(dlg, rep) {
  const hibak = []
  // (1) az előnézet-doboznak nincs saját függőleges görgetése
  const iPreview = dlg.indexOf('ref={previewRef}')
  const previewBlokk = iPreview >= 0 ? dlg.slice(iPreview, iPreview + 400) : ''
  if (/overflow-y-auto|max-h-\[/.test(previewBlokk)) {
    hibak.push('kísérőív-dialógus: az előnézet-doboz saját görgetést kapott — dupla csúszka')
  }
  if (!/boxW - 40/.test(dlg)) {
    hibak.push('kísérőív-dialógus: a szélesség-ráhagyás visszaszűkült — vízszintes csúszka jönne')
  }
  // (2) a nyomtatvány-fejléc rácsos (valódi közép)
  // Az entitás-kódolt alak CSAK a sablonban él (a doksi-komment sima szöveg).
  const iBord = rep.indexOf('BORDEROU DE PL&#258;')
  const fejlecKornyek = iBord >= 0 ? rep.slice(Math.max(0, iBord - 600), iBord) : ''
  if (!/grid-template-columns:1fr auto 1fr/.test(fejlecKornyek)) {
    hibak.push('kísérőív-fejléc: nem rácsos — a hosszú gyülekezetnév kitolja a címet a középről')
  }
  return hibak
}

const dlg = fs.readFileSync(DLG, 'utf8')
const rep = fs.readFileSync(REP, 'utf8')
const hibak = ellenoriz(dlg, rep)
if (hibak.length === 0) {
  pass('kísérőív: egyetlen görgetés + szélesség-ráhagyás + rácsos (közép) fejléc')
} else {
  for (const h of hibak) bukik(h)
}

if (hibak.length === 0) {
  // M1: dupla görgetés visszahozása
  const m1 = dlg.replace(/self-start overflow-hidden/, 'max-h-[80dvh] overflow-y-auto')
  if (m1 === dlg) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1, rep).length === 0) bukik('M1: a dupla-görgetés visszahozására az őr NEM bukik — vak')
  else pass('M1 mutáns (dupla görgetés vissza) → az őr elbuktatja')

  // M2: a rácsos fejléc visszabontása
  const m2 = rep.replace(/grid-template-columns:1fr auto 1fr/, 'grid-template-columns:auto')
  if (m2 === rep) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(dlg, m2).length === 0) bukik('M2: a rács-visszabontásra az őr NEM bukik — vak')
  else pass('M2 mutáns (fejléc-rács visszabontva) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — kísérőív-elrendezés rendben`)
