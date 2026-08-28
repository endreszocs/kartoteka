#!/usr/bin/env node
/**
 * ZÁRT ÉV INSERT-TRIGGER önellenőrzés (D9+D10 / D-blokk, 2026-08-28)
 *
 * MIT ŐRIZ — a 2026-08-28-i pénzügyi audit P2-találata:
 * a véglegesített évbe ÚJ tétel INSERT-jét SEMMILYEN DB-szintű kapu nem
 * tiltotta — a RESTRICTIVE policy csak az UPDATE…deleted=true-t fogta. A zár
 * teljes egészében az app-rétegen állt: egy régi desktop-kliens vagy egy
 * nyers PostgREST-hívás a lelkész által már beküldött évbe könyvelhetett.
 * Ráadásul (D10, TOCTOU) az app-oldali ellenőrzés és az insert nem egy
 * tranzakció — egy éppen futó véglegesítés közben rögzített tétel kicsúszhat
 * a pillanatképből. A BEFORE INSERT trigger MINDKETTŐT zárja: az insert
 * pillanatában, ugyanabban a tranzakcióban olvassa a zár-állapotot.
 *
 * A JAVÍTÁS: 2026-08-28-zart-ev-insert-trigger.sql — közös trigger-függvény
 * + BEFORE INSERT trigger a befizetes ÉS a kiadas táblán. CSAK az
 * accounting_finalized zár (a költségvetés év eleji véglegesítése normál
 * állapot — az évközi rögzítést nem foghatja). A feloldás (unlock) után a
 * trigger automatikusan enged (élő állapotot olvas).
 *
 * NEGATÍV ASSZERT: trigger-csonkító mutánsok.
 *
 * Futtatás:  node scripts/selftest-zart-ev-insert-trigger.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const SQL = path.join(REPO, 'migration-docs', 'sql', '2026-08-28-zart-ev-insert-trigger.sql')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripSqlComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
}

function ellenoriz(src) {
  const hibak = []
  const s = stripSqlComments(src)

  if (!/FUNCTION public\.tg_zart_ev_insert_tiltas\(\)/.test(s)) {
    hibak.push('nincs tg_zart_ev_insert_tiltas trigger-függvény')
  }
  if (!/BEFORE INSERT ON public\.befizetes\b/.test(s)) {
    hibak.push('a befizetes táblán nincs BEFORE INSERT trigger')
  }
  if (!/BEFORE INSERT ON public\.kiadas\b/.test(s)) {
    hibak.push('a kiadas táblán nincs BEFORE INSERT trigger')
  }
  // A FÜGGVÉNYTÖRZS (a $zart_ev$ határolók közt) — a COMMENT és az
  // ellenőrző rács szövege kívül esik rajta.
  const iEleje = s.indexOf('$zart_ev$')
  const iVege = s.indexOf('$zart_ev$', iEleje + 1)
  const torzs = iEleje >= 0 && iVege > iEleje ? s.slice(iEleje, iVege) : ''
  if (!/accounting_finalized/.test(torzs)) {
    hibak.push('a trigger-törzs nem az accounting_finalized-ot olvassa')
  }
  if (/budget_finalized/.test(torzs)) {
    hibak.push('a trigger-törzs a budget_finalized-ra IS zár — az évközi normál rögzítést fogná (a költségvetés év elején véglegesül)')
  }
  if (!/RAISE EXCEPTION/.test(s)) {
    hibak.push('a zárt-év ág nem dob kivételt')
  }
  // Az ellenőrző rács EGY UNION ALL-ban (Supabase editor: csak az utolsó rács látszik)
  if (!/UNION ALL/.test(s)) {
    hibak.push('nincs egy-rácsos (UNION ALL) ellenőrző blokk a fájl végén')
  }
  return hibak
}

if (!fs.existsSync(SQL)) {
  bukik('a 2026-08-28-zart-ev-insert-trigger.sql fájl HIÁNYZIK')
  console.error('\n1 teszt HIBÁS, 0 zöld')
  process.exit(1)
}

const src = fs.readFileSync(SQL, 'utf8')
const hibak = ellenoriz(src)
if (hibak.length === 0) {
  pass('zárt-év INSERT-trigger: közös függvény + két tábla-trigger, csak accounting-zár')
} else {
  for (const h of hibak) bukik(h)
}

// ── NEGATÍV — mutánsok ──────────────────────────────────────────────────────
if (hibak.length === 0) {
  // M1: a kiadas-trigger törlése
  const m1 = src.replace(/BEFORE INSERT ON public\.kiadas\b/, 'BEFORE INSERT ON public.kiadas_KIKAPCSOLVA')
  if (m1 === src) bukik('M1 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m1).length === 0) bukik('M1: a kiadas-trigger törlésére az őr NEM bukik — vak')
  else pass('M1 mutáns (kiadas-trigger törölve) → az őr elbuktatja')

  // M2: a kivétel-dobás kilövése
  const m2 = src.replace(/RAISE EXCEPTION/g, 'RAISE NOTICE')
  if (m2 === src) bukik('M2 mutáció nem változtatott (fail-closed)')
  else if (ellenoriz(m2).length === 0) bukik('M2: a kivétel kilövésére az őr NEM bukik — vak')
  else pass('M2 mutáns (RAISE EXCEPTION → NOTICE) → az őr elbuktatja')
}

console.log('')
if (fail) {
  console.error(`${fail} teszt HIBÁS, ${ok} zöld`)
  process.exit(1)
}
console.log(`${ok}/${ok} teszt zöld — zárt-év INSERT-trigger SQL rendben`)
