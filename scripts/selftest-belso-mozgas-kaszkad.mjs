#!/usr/bin/env node
/**
 * BELSŐ MOZGÁS PÁR-KASZKÁD önellenőrzés (2026-08-27)
 *
 * MIT ŐRIZ — élesben elsülő ADATVESZTÉS, és a projekt visszatérő hibaosztálya
 * („a második felület a régi implementációt őrzi"):
 *
 *   Egy belső mozgás MINDIG egy bevétel + egy kiadás PÁR, közös
 *   `belso_mozgas_xkey`-jel. Ha az egyik lábat sztornózzuk vagy töröljük, a
 *   másiknak is mennie kell — különben a pénz eltűnik az összesítésből
 *   (pl. a kassza csökkent, a bank nem nőtt).
 *
 *   A WEB (`deleteTransaction`) ezt mindig helyesen csinálta. A DESKTOP viszont
 *   a core use-case-eken megy át, és ott:
 *     · a `befizetes/storno.ts` kaszkádja CSAK a `befizetes` táblát frissítette
 *       — a pár másik lába viszont MINDIG a `kiadas`-ban van, tehát NULLA sort
 *       érintett, miközben sikert jelentett (hazug visszajelzés);
 *     · a két `soft-delete.ts` a `belso_mozgas_xkey` szót nem is tartalmazta.
 *
 * AMIT ELLENŐRZÜNK:
 *   1. mind a négy use-case ISMERI a `belso_mozgas_xkey`-t;
 *   2. mindegyik kaszkádja MINDKÉT táblát érinti;
 *   3. a törléseknél az év-zár ellenőrzés a PÁR MINDKÉT lábára fut
 *      (egy évfordulós átvezetés két oldala eltérő évre eshet);
 *   4. a felderítés FAIL-CLOSED (ha a párt nem látjuk, nem törlünk).
 *
 * NEGATÍV ASSZERT: a régi, egy-táblás viselkedés visszajátszása — bizonyítjuk,
 * hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-belso-mozgas-kaszkad.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const BASE = path.join(REPO, 'packages', 'core', 'src', 'finance')

const FAJLOK = [
  { nev: 'befizetes/storno.ts', ut: path.join(BASE, 'befizetes', 'storno.ts'), torles: false },
  { nev: 'kiadas/storno.ts', ut: path.join(BASE, 'kiadas', 'storno.ts'), torles: false },
  { nev: 'befizetes/soft-delete.ts', ut: path.join(BASE, 'befizetes', 'soft-delete.ts'), torles: true },
  { nev: 'kiadas/soft-delete.ts', ut: path.join(BASE, 'kiadas', 'soft-delete.ts'), torles: true },
]

let failed = false
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true }
const ok = (m) => console.log(`OK:   ${m}`)

/** Kommentek eltávolítása — a magyarázó szöveg ne adjon hamis találatot. */
function strip(src) {
  let out = '', i = 0, mode = 'code'
  while (i < src.length) {
    const c = src[i], n = src[i + 1]
    if (mode === 'code') {
      if (c === '/' && n === '/') { mode = 'line'; i += 2; continue }
      if (c === '/' && n === '*') { mode = 'block'; i += 2; continue }
      if (c === "'") mode = 'sq'; else if (c === '"') mode = 'dq'; else if (c === '`') mode = 'tpl'
      out += c; i++; continue
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += c }; i++; continue }
    if (mode === 'block') { if (c === '*' && n === '/') { mode = 'code'; i += 2 } else i++; continue }
    if (c === '\\') { out += c + (n ?? ''); i += 2; continue }
    if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"') || (mode === 'tpl' && c === '`')) mode = 'code'
    out += c; i++
  }
  return out
}

// ── Az őr-függvények (a mutánsokon is ezeket futtatjuk) ──────────────────
/** A kaszkád MINDKÉT táblát érinti-e a közös kulcs alapján? */
function orMindketTabla(code) {
  const bef = /from\(['"]befizetes['"]\)[\s\S]{0,400}?belso_mozgas_xkey/.test(code)
  const kia = /from\(['"]kiadas['"]\)[\s\S]{0,400}?belso_mozgas_xkey/.test(code)
  return bef && kia
}
/** Az év-zár a PÁR mindkét lábára fut-e (nem csak a kattintott sorra)? */
function orParEvZar(code) {
  return /assertYearsNotFinalizedForDelete\([^)]*datesToCheck/.test(code)
}
/** Fail-closed a pár felderítésénél? */
function orFailClosed(code) {
  return /befRes\.error\s*\|\|\s*kiaRes\.error/.test(code)
}

for (const f of FAJLOK) {
  if (!fs.existsSync(f.ut)) { fail(`hiányzik: ${f.nev}`); continue }
  const code = strip(fs.readFileSync(f.ut, 'utf8'))

  if (/belso_mozgas_xkey/.test(code)) ok(`${f.nev}: ismeri a belso_mozgas_xkey-t`)
  else { fail(`${f.nev}: NEM ismeri a belso_mozgas_xkey-t — árva felet hagyna`); continue }

  if (orMindketTabla(code)) ok(`${f.nev}: a kaszkád MINDKÉT táblát érinti`)
  else fail(`${f.nev}: a kaszkád CSAK az egyik táblát érinti — a pár másik lába élve marad`)

  if (f.torles) {
    if (orParEvZar(code)) ok(`${f.nev}: az év-zár a pár MINDKÉT lábára fut`)
    else fail(`${f.nev}: az év-zár csak a kattintott sorra fut — egy zárt év másik lába némán törlődhet`)
    if (orFailClosed(code)) ok(`${f.nev}: a pár felderítése fail-closed`)
    else fail(`${f.nev}: a pár felderítése NEM fail-closed — ha nem látjuk a párt, mégis törölnénk`)
  }
}

// ── Kereszt-ellenőrzés: a WEB és a CORE ugyanazt csinálja-e? ─────────────
const WEB = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')
if (fs.existsSync(WEB)) {
  const w = strip(fs.readFileSync(WEB, 'utf8'))
  const webKaszkad =
    /deleteTransaction[\s\S]{0,8000}?from\(['"]befizetes['"]\)[\s\S]{0,300}?belso_mozgas_xkey/.test(w) &&
    /deleteTransaction[\s\S]{0,8000}?from\(['"]kiadas['"]\)[\s\S]{0,300}?belso_mozgas_xkey/.test(w)
  if (webKaszkad) ok('a WEBES deleteTransaction is mindkét lábat törli — a két felület egyezik')
  else fail('a WEBES deleteTransaction kaszkádja megváltozott — a két felület széthúzott')
}

// ══════════════════════════════════════════════════════════════════════════
//  NEGATÍV ASSZERT — a régi, egy-táblás viselkedés visszajátszása
// ══════════════════════════════════════════════════════════════════════════
const MUTANSOK = [
  {
    nev: 'a kiadas-ág eltávolítása a befizetes/storno kaszkádjából',
    ut: path.join(BASE, 'befizetes', 'storno.ts'),
    mutal: (c) => c.replace(/ctx\.supabase\s*\n?\s*\.from\(['"]kiadas['"]\)[\s\S]{0,400}?congregation_id[^)]*\),?/, ''),
    orzo: orMindketTabla,
  },
  {
    nev: 'a pár-alapú év-zár visszavétele (befizetes/soft-delete)',
    ut: path.join(BASE, 'befizetes', 'soft-delete.ts'),
    mutal: (c) => c.replace(/assertYearsNotFinalizedForDelete\(ctx\.supabase, congregationId, datesToCheck\)/,
                            'assertYearsNotFinalizedForDelete(ctx.supabase, congregationId, [null])'),
    orzo: orParEvZar,
  },
  {
    nev: 'a fail-closed pár-felderítés kivétele (kiadas/soft-delete)',
    ut: path.join(BASE, 'kiadas', 'soft-delete.ts'),
    mutal: (c) => c.replace(/if \(befRes\.error \|\| kiaRes\.error\)/, 'if (false)'),
    orzo: orFailClosed,
  },
]
let bukott = 0
for (const m of MUTANSOK) {
  if (!fs.existsSync(m.ut)) { fail(`mutáns forrása hiányzik: ${m.nev}`); continue }
  const eredeti = strip(fs.readFileSync(m.ut, 'utf8'))
  const mutalt = m.mutal(eredeti)
  if (mutalt === eredeti) { fail(`a mutáns nem módosított semmit: ${m.nev} — az őrszem nem bizonyított`); continue }
  if (m.orzo(mutalt)) fail(`AZ ŐRSZEM VAK: a mutáns ÁTMENT — ${m.nev}`)
  else { bukott++; ok(`negatív asszert: az őrszem elbuktatja — ${m.nev}`) }
}
if (bukott !== MUTANSOK.length) fail('nem minden mutáns bukott el — az őrszem nem nyújt valódi védelmet')

if (failed) {
  console.error('\nBELSŐ MOZGÁS PÁR-KASZKÁD ÖNELLENŐRZÉS: BUKOTT')
  process.exit(1)
}
console.log('\nBELSŐ MOZGÁS PÁR-KASZKÁD ÖNELLENŐRZÉS: RENDBEN')
