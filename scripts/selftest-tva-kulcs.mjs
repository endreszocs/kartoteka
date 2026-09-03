#!/usr/bin/env node
/**
 * BEÁLLÍTHATÓ ÁFA-KULCS önellenőrzés (2026-09-03, Endre kérése)
 *
 * MIT ŐRIZ — Endre szó szerint: „az áfa kulcs értékét lehessen beállítani,
 * mert az bármikor változhat!"
 *
 * A JAVÍTOTT HIBA: a kimenő (Oblio) e-Factura TVA-kulcsa KÉT HELYEN volt
 * beégetve 19%-kal — a számlára írt `vatPercentage`-ben és a DB-be mentett
 * `osszeg_tva`-ban. A román normál kulcs 2025-08-01-én 19%-ról 21%-ra
 * emelkedett, tehát azóta hibás adótartalmú, ANAF SPV-re felmenő hivatalos
 * számla készült. Ráadásul a két hely EGYMÁSTÓL FÜGGETLENÜL is elcsúszhatott
 * volna: a KARTOTEKA mást tartott volna nyilván, mint ami az ANAF-hoz felment.
 *
 * Öt, egymástól függetlenül elromolható dolog:
 *
 *   (1) NINCS beégetett kulcs az Oblio-számlázás útvonalán.
 *   (2) A builder KÖTELEZŐ paraméterként kapja a kulcsot (nincs alapértéke —
 *       egy elfelejtett paraméter nem tud némán régi kulccsal számlázni).
 *   (3) A számlára írt és a DB-be mentett kulcs UGYANAZ a változó.
 *   (4) FAIL-LOUD: ÁFA-alanyként 0%-os kulccsal nem állítunk ki számlát.
 *   (5) SÉMA-DRIFT-TŰRÉS: ha a `tva_kulcs_szazalek` oszlop még nincs meg
 *       élesben, a számlázás nem hasal el, hanem a dokumentált tartalékra esik
 *       vissza (a migrációs fájl NEM bizonyíték az élő sémára).
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): minden őrhöz
 * visszajátsszuk a hibás világot, és bizonyítjuk, hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-tva-kulcs.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const BUILDER = path.join(REPO, 'apps', 'web', 'lib', 'finance', 'oblio', 'oblio-invoice-builder.ts')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'oblio-actions.ts')
const KONST = path.join(REPO, 'apps', 'web', 'lib', 'finance', 'tva-plafon-constants.ts')
const WIZARD = path.join(REPO, 'apps', 'web', 'components', 'modals', 'congregation-setup-wizard.tsx')
const CONG = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'congregation', 'actions.ts')
const SQL = path.join(REPO, 'migration-docs', 'sql', '2026-09-03-tva-kulcs-beallithato.sql')

let failed = false
const ok = (m) => console.log(`OK:   ${m}`)
const fail = (m) => { failed = true; console.error(`HIBA: ${m}`) }

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const f of [BUILDER, ACTIONS, KONST, WIZARD, CONG, SQL]) {
  if (!fs.existsSync(f)) fail(`hiányzó fájl: ${path.relative(REPO, f)}`)
}
if (failed) { console.error('\nAz ÁFA-kulcs önellenőrzés ELBUKOTT.'); process.exit(1) }

function orzo(cimke, forras, minta, mutans) {
  const kod = kodCsak(forras)
  if (!minta.test(kod)) { fail(`${cimke} — hiányzik`); return }
  if (minta.test(kodCsak(mutans(forras)))) fail(`${cimke} — az őr VAK: a mutáns is átment`)
  else ok(cimke)
}

const builderNyers = olvas(BUILDER)
const actionsNyers = olvas(ACTIONS)

// ── (1) NINCS BEÉGETETT KULCS ────────────────────────────────────────────
{
  const BEEGETETT = [
    { minta: /vatPercentage:\s*[^,\n]*\b(19|21|24)\b/, nev: 'vatPercentage beégetett százalék' },
    { minta: /\*\s*0\.(19|21|24)\b/, nev: 'szorzás beégetett kulccsal (pl. * 0.19)' },
    { minta: /tvaAlany\s*\?\s*(19|21|24)\b/, nev: 'tvaAlany ? <szám>' },
  ]
  for (const [cimke, forras] of [['builder', builderNyers], ['issueInvoice', actionsNyers]]) {
    const kod = kodCsak(forras)
    const talalt = BEEGETETT.filter((b) => b.minta.test(kod)).map((b) => b.nev)
    if (talalt.length) fail(`(1) ${cimke} — beégetett ÁFA-kulcs: ${talalt.join(', ')}`)
    else ok(`(1) ${cimke} — nincs beégetett ÁFA-kulcs`)
  }
  // NEGATÍV: a régi világ (fix 19%) bukjon.
  const regi = 'vatPercentage: tvaAlany ? 19 : 0,\nconst osszegTva = tvaAlany ? Math.round(osszegNet * 0.19 * 100) / 100 : 0'
  if (BEEGETETT.some((b) => b.minta.test(regi))) ok('NEGATÍV — a régi, beégetett 19%-ot a minták elkapják')
  else fail('NEGATÍV — a beégetés-kereső minták VAKOK: a régi világ is átmenne')
}

// ── (2) A BUILDER KÖTELEZŐEN KAPJA A KULCSOT ─────────────────────────────
orzo(
  '(2) a builder kötelező paraméterként kapja a TVA-kulcsot',
  builderNyers,
  /tvaKulcsSzazalek:\s*number\b/,
  (s) => s.replace(/tvaKulcsSzazalek:\s*number\b/g, 'tvaKulcsSzazalek?: number'),
)
{
  // Opcionális paraméter VAGY alapérték = néma visszaesés a régi kulcsra.
  const kod = kodCsak(builderNyers)
  if (/tvaKulcsSzazalek\?\s*:/.test(kod) || /tvaKulcsSzazalek\s*=\s*\d/.test(kod)) {
    fail('(2) a TVA-kulcs opcionális vagy van alapértéke — egy elfelejtett paraméter némán régi kulccsal számlázna')
  } else ok('(2) a TVA-kulcsnak nincs alapértéke (nem lehet „elfelejteni")')
}
orzo(
  '(2) a builder a kapott kulcsot írja a számlára',
  builderNyers,
  /vatPercentage:\s*tvaAlany\s*\?\s*tvaKulcsSzazalek\s*:\s*0/,
  (s) => s.replace(/vatPercentage: tvaAlany \? tvaKulcsSzazalek : 0/g, 'vatPercentage: tvaAlany ? 19 : 0'),
)

// ── (3) A SZÁMLA ÉS A DB UGYANAZT A KULCSOT HASZNÁLJA ────────────────────
orzo(
  '(3) a mentett osszeg_tva UGYANABBÓL a változóból számol, mint a számla',
  actionsNyers,
  /osszegTva\s*=\s*tvaAlany\s*\?\s*Math\.round\(osszegNet\s*\*\s*\(tvaKulcsSzazalek\s*\/\s*100\)/,
  (s) => s.replace(/\(tvaKulcsSzazalek \/ 100\)/g, '0.19'),
)
orzo(
  '(3) a builder-hívás megkapja a kulcsot',
  actionsNyers,
  /tvaKulcsSzazalek,\s*\}\)/,
  (s) => s.replace(/\n\s*tvaKulcsSzazalek,(?=\s*\}\))/g, ''),
)

// ── (4) FAIL-LOUD: ÁFA-ALANY + 0% ────────────────────────────────────────
orzo(
  '(4) ÁFA-alanyként 0%-os kulccsal NEM állítunk ki számlát',
  actionsNyers,
  /if\s*\(tvaAlany\s*&&\s*!\(tvaKulcsSzazalek\s*>\s*0\)\)/,
  (s) => s.replace(/if \(tvaAlany && !\(tvaKulcsSzazalek > 0\)\)/g, 'if (false)'),
)

// ── (5) SÉMA-DRIFT-TŰRÉS ─────────────────────────────────────────────────
orzo(
  '(5) hiányzó oszlopnál a számlázás nem hasal el (tartalék-kulcs)',
  actionsNyers,
  /isMissingColumnError\(teljes\.error\.message\)/,
  (s) => s.replace(/isMissingColumnError\(teljes\.error\.message\)/g, 'false'),
)
orzo(
  '(5) a tartalék-kulcs a dokumentált konstansból jön (nem beírt szám)',
  actionsNyers,
  /TVA_NORMAL_SZAZALEK_ALAP/,
  (s) => s.replace(/TVA_NORMAL_SZAZALEK_ALAP/g, '19'),
)
{
  const kod = kodCsak(olvas(KONST))
  const m = /export const TVA_NORMAL_SZAZALEK_ALAP\s*=\s*(\d+(?:\.\d+)?)/.exec(kod)
  if (!m) fail('(5) nincs TVA_NORMAL_SZAZALEK_ALAP konstans')
  else if (Number(m[1]) === 19) fail('(5) a tartalék-kulcs 19% — ez a 2025-08-01 előtti, hatályát vesztett érték')
  else ok(`(5) a tartalék-kulcs ${m[1]}% (a hatályos normál kulcs)`)
}

// ── (6) A LELKÉSZ TÉNYLEG BE TUDJA ÁLLÍTANI ──────────────────────────────
// Enélkül a „beállítható" csak papíron igaz: kód nélkül nincs mit beállítani.
{
  const w = kodCsak(olvas(WIZARD))
  if (/id="tva_kulcs_szazalek"/.test(w) && /form\.tva_kulcs_szazalek/.test(w)) {
    ok('(6) a beállítás-varázslóban van ÁFA-kulcs mező')
  } else fail('(6) a felületen NINCS ÁFA-kulcs mező — a kulcs csak kézi SQL-lel lenne állítható')

  const c = kodCsak(olvas(CONG))
  if (/tva_kulcs_szazalek/.test(c)) ok('(6) a mentő action ismeri a mezőt')
  else fail('(6) a mentő action nem menti a kulcsot')
  // A drift-lecsupaszító listában is ott kell lennie, különben egy migráció
  // előtti mentés az EGÉSZ beállítás-mentést elbuktatná.
  if (/'tva_alany_tol', 'tva_kulcs_szazalek'/.test(c)) ok('(6) migráció előtt a mező lecsupaszítható (a mentés nem bukik el)')
  else fail('(6) a kulcs hiányzik a drift-lecsupaszító listából: migráció előtt az egész mentés elbukna')

  const s = olvas(SQL)
  if (/ADD COLUMN IF NOT EXISTS tva_kulcs_szazalek/.test(s)) ok('(6) a migrációs SQL idempotens')
  else fail('(6) a migrációs SQL nem idempotens vagy nem ezt az oszlopot adja')
}

if (failed) { console.error('\nAz ÁFA-kulcs önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nAz ÁFA-kulcs önellenőrzés rendben.')
