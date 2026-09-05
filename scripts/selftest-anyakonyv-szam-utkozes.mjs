#!/usr/bin/env node
/**
 * ANYAKÖNYVI SORSZÁM-ÜTKÖZÉS ÜZENETE önellenőrzés (2026-09-04)
 *
 * ELŐZMÉNY: a 2026-09-04-i élő felmérés kimutatta, hogy az `egyhazi_szam`-on
 * EGYETLEN anyakönyvi táblán sem volt egyediségi index. Az index azóta mind a
 * 8 táblán megvan (`uniq_<tábla>_egyhazi_szam`) — ezzel viszont megjelent egy
 * ÚJ tünet: ütközéskor a nyers, angol Postgres-hiba jutott a lelkészhez:
 *
 *     Hiba: duplicate key value violates unique constraint "uniq_keresztseg_egyhazi_szam"
 *
 * ⚠️ A GYAKORI ESET NEM A VERSENYHELYZET. A generátor MAX+1-et ad, tehát
 * automatikus számnál ütközés csak két egyidejű mentésből lehet. A valószínű
 * eset a KÉZZEL beírt, már foglalt szám — és az a SZERKESZTÉSI útvonalon is
 * előjön, nemcsak új rögzítéskor.
 *
 * Hat védelem:
 *
 *   (1) A felismerés az INDEX NEVÉRE néz, nem a puszta „duplicate key"-re —
 *       különben egy másik megszorítás sértését is sorszám-ütközésnek hazudnánk.
 *   (2) Az üzenet MEGMONDJA, MIT TEGYEN (kézi és automatikus eset külön).
 *   (3) NINCS néma újragenerálás: ha a lelkész kézzel írta be a számot, egy
 *       csendes felülírás elvenné a szándékát — hivatalos anyakönyvi számnál
 *       a hangos hiba a helyes.
 *   (4) MIND a 8 anyakönyvi táblának van magyar megnevezése az üzenethez.
 *   (5) MINDEN mentési út használja: 4 beszúrás + 4 szerkesztés + a mozgás-ág.
 *   (6) A DELETE-ág SZÁNDÉKOSAN kimarad (ott nem lehet egyediség-ütközés), és
 *       a nem-ütközéses hibák üzenete VÁLTOZATLAN (nem nyelünk el semmit).
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): a modul TISZTA
 * függvény, ezért itt nem mintát grepelünk, hanem VALÓDIAN LEFUTTATJUK — és
 * visszajátsszuk a hibás világot is.
 *
 * Futtatás:  node scripts/selftest-anyakonyv-szam-utkozes.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const MODUL = path.join(REPO, 'apps', 'web', 'lib', 'anyakonyv', 'szam-utkozes.ts')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'anyakonyv', 'actions.ts')

let failed = false
const ok = (m) => console.log(`OK:   ${m}`)
const fail = (m) => { failed = true; console.error(`HIBA: ${m}`) }

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const f of [MODUL, ACTIONS]) {
  if (!fs.existsSync(f)) fail(`hiányzó fájl: ${path.relative(REPO, f)}`)
}
if (failed) { console.error('\nA sorszám-ütközés önellenőrzés ELBUKOTT.'); process.exit(1) }

// ── A modul VALÓDI betöltése (izolált transpile — a bevált ubl-parser minta) ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'szam-utkozes-'))
let mod
try {
  const require_ = createRequire(path.join(REPO, 'package.json'))
  const ts = require_('typescript')
  const out = ts.transpileModule(olvas(MODUL), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: 'szam-utkozes.ts',
  })
  const dest = path.join(tmp, 'szam-utkozes.js')
  fs.writeFileSync(dest, out.outputText, 'utf8')
  mod = require_(dest)
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}
fs.rmSync(tmp, { recursive: true, force: true })

const { sorszamUtkozesE, anyakonyviHibaUzenet } = mod
if (typeof sorszamUtkozesE !== 'function' || typeof anyakonyviHibaUzenet !== 'function') {
  fail('a modul nem exportálja a két függvényt')
  process.exit(1)
}

// ── (1) A FELISMERÉS AZ INDEX NEVÉRE NÉZ ─────────────────────────────────
{
  const utkozes = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "uniq_keresztseg_egyhazi_szam"',
  }
  if (sorszamUtkozesE(utkozes)) ok('(1) a valódi sorszám-ütközést felismeri')
  else fail('(1) a valódi sorszám-ütközést NEM ismeri fel')

  // ⛔ NEGATÍV: MÁSIK megszorítás sértése NEM sorszám-ütközés. Ha annak
  //    hazudnánk, a lelkész rossz helyen keresné a hibát.
  const masik = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "csalad_id_ferfi_idx"',
  }
  if (!sorszamUtkozesE(masik)) ok('NEGATÍV — másik megszorítás sértését NEM mondja sorszám-ütközésnek')
  else fail('NEGATÍV — VAK: bármilyen duplicate key-t sorszám-ütközésnek mond')

  // A CNP-index is 23505-öt ad — az sem sorszám.
  const cnp = { code: '23505', message: 'duplicate key value violates unique constraint "uniq_szemely_cnp_congregation_visible"' }
  if (!sorszamUtkozesE(cnp)) ok('NEGATÍV — a CNP-ütközést sem mondja sorszám-ütközésnek')
  else fail('NEGATÍV — a CNP-ütközést sorszám-ütközésnek mondja')

  // Nem-ütközéses hibák és a hiányzó hiba.
  for (const [cimke, e] of [
    ['null', null],
    ['undefined', undefined],
    ['üres objektum', {}],
    ['jogosultsági hiba', { code: '42501', message: 'permission denied for table keresztseg' }],
  ]) {
    if (!sorszamUtkozesE(e)) ok(`(1) ${cimke} → nem sorszám-ütközés`)
    else fail(`(1) ${cimke} → tévesen sorszám-ütközésnek mondja`)
  }
  // A `details` mezőben érkező index-név is számít (a PostgREST oda teszi).
  const detailsben = { code: '23505', message: 'duplicate key value violates unique constraint', details: 'Key (congregation_id, egyhazi_szam)=(…) already exists. uniq_temetes_egyhazi_szam' }
  if (sorszamUtkozesE(detailsben)) ok('(1) a `details` mezőből is felismeri')
  else fail('(1) a `details` mezőben érkező index-nevet nem veszi észre')
}

// ── (2) AZ ÜZENET MEGMONDJA, MIT TEGYEN ──────────────────────────────────
{
  const e = { code: '23505', message: 'duplicate key value violates unique constraint "uniq_keresztseg_egyhazi_szam"' }
  const u = anyakonyviHibaUzenet(e, 'keresztseg', '2026010007')
  const kell = [
    ['a foglaltság kimondva', /MÁR FOGLALT/],
    ['a tábla magyarul', /keresztelési/],
    ['a konkrét szám', /2026010007/],
    ['kézi eset teendője', /kézzel írtad be[\s\S]*szabad sorszám/],
    ['automatikus eset teendője', /hagyd üresen[\s\S]*mentsd újra/],
    ['megnyugtatás: az adat megvan', /nem kell újra begépelned/],
  ]
  for (const [cimke, minta] of kell) {
    if (minta.test(u)) ok(`(2) ${cimke}`)
    else fail(`(2) HIÁNYZIK az üzenetből: ${cimke}`)
  }
  if (!/duplicate key|unique constraint/i.test(u)) ok('(2) a nyers angol hiba NEM szivárog ki a lelkészhez')
  else fail('(2) a nyers angol Postgres-hiba benne maradt az üzenetben')
}

// ── (3) NINCS NÉMA ÚJRAGENERÁLÁS ─────────────────────────────────────────
{
  const kod = kodCsak(olvas(ACTIONS))
  // Ütközés után NEM hívjuk újra a generátort — az felülírná a kézi számot.
  if (/sorszamUtkozesE[\s\S]{0,200}?generate_egyhazi_anyakonyvi_szam/.test(kod)) {
    fail('(3) ütközés után újragenerálás történik — ez felülírná a kézzel beírt számot')
  } else ok('(3) nincs néma újragenerálás ütközés után')
}

// ── (4) MIND A 8 TÁBLÁNAK VAN MAGYAR NEVE ────────────────────────────────
{
  const tablak = ['keresztseg', 'konfirmalas', 'hazassag', 'temetes', 'bekoltozott', 'elkoltozott', 'attert', 'kitert']
  const e = { code: '23505', message: 'duplicate key value violates unique constraint "uniq_x_egyhazi_szam"' }
  const hianyzik = tablak.filter((t) => {
    const u = anyakonyviHibaUzenet(e, t, null)
    // Ha nincs magyar név, az üzenetből hiányzik a fajta — a „bejegyzésen" elé
    // nem kerül semmi.
    return /másik bejegyzésen/.test(u)
  })
  if (hianyzik.length === 0) ok('(4) mind a 8 anyakönyvi táblának van magyar megnevezése')
  else fail(`(4) nincs magyar megnevezés: ${hianyzik.join(', ')}`)
  // Ismeretlen tábla → az üzenet AKKOR IS értelmes marad (nem dob, nem csonkul).
  const ismeretlen = anyakonyviHibaUzenet(e, 'valami_mas', null)
  if (/MÁR FOGLALT/.test(ismeretlen)) ok('(4) ismeretlen táblánál is értelmes az üzenet')
  else fail('(4) ismeretlen táblánál elromlik az üzenet')
}

// ── (5) MINDEN MENTÉSI ÚT HASZNÁLJA ──────────────────────────────────────
{
  const kod = kodCsak(olvas(ACTIONS))
  const db = (kod.match(/anyakonyviHibaUzenet\(/g) || []).length
  // 10 hívás: keresztseg (upd+ins), hazassag (upd+ins), temetes (upd+ins),
  // konfirmalas (batch ins + single upd), mozgás (upd+ins).
  if (db >= 10) ok(`(5) mind a ${db} anyakönyvi mentési út emberi üzenetet ad`)
  else fail(`(5) csak ${db} mentési út használja (10 kell) — a többi nyers angol hibát adna`)
  for (const t of ['keresztseg', 'hazassag', 'temetes', 'konfirmalas']) {
    if (new RegExp(`anyakonyviHibaUzenet\\(error, '${t}'`).test(kod)) ok(`(5) ${t}: bekötve`)
    else fail(`(5) ${t}: NINCS bekötve`)
  }
  // A mozgás-ág a `table` változóval megy (bekoltozott/elkoltozott/attert/kitert).
  if (/anyakonyviHibaUzenet\(error, table,/.test(kod)) ok('(5) a mozgás-táblák ága is bekötve (dinamikus tábla)')
  else fail('(5) a mozgás-táblák ága nincs bekötve')
}

// ── (6) A DELETE KIMARAD + A TÖBBI HIBA VÁLTOZATLAN ──────────────────────
{
  const kod = kodCsak(olvas(ACTIONS))
  const i = kod.indexOf(".delete().eq('id', id)")
  const szakasz = i >= 0 ? kod.slice(i, i + 260) : ''
  if (!szakasz) fail('(6) a törlés-ág nem található')
  else if (/anyakonyviHibaUzenet/.test(szakasz)) {
    fail('(6) a DELETE-ág is a sorszám-üzenetet adja — ott nem lehet egyediség-ütközés')
  } else ok('(6) a DELETE-ág SZÁNDÉKOSAN a mai üzenetet adja')

  // Nem-ütközéses hiba → a mai alak, változatlanul.
  const mas = anyakonyviHibaUzenet({ code: '42501', message: 'permission denied' }, 'keresztseg', null)
  if (mas === 'Hiba: permission denied') ok('(6) nem-ütközéses hibánál a mai üzenet marad (nem nyelünk el semmit)')
  else fail(`(6) a nem-ütközéses hiba üzenete megváltozott: ${mas}`)
}

if (failed) { console.error('\nA sorszám-ütközés önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nA sorszám-ütközés önellenőrzés rendben.')
