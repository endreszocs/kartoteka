#!/usr/bin/env node
/**
 * KÉSZPÉNZES RÖGZÍTŐ JELZÉSEI önellenőrzés (2026-09-02, Endre 11 észrevétele)
 *
 * MIT ŐRIZ — öt olyan jelzés, ami NÉMÁN visszaronthat, és a visszarontást
 * semmi nem mutatná meg a lelkésznek:
 *
 *   (1) A „Korábbi, mint az utolsó rögzített" figyelmeztetés CSAK a készpénzes
 *       tételekhez viszonyít. (Endre 5.) A banki import hónapokkal előrébb tart,
 *       ezért ha a lekérdezés a banki sorokat is nézi, MINDEN kasszába írt
 *       korábbi soron kigyullad a figyelmeztetés — egy figyelmeztetés, ami
 *       mindig világít, megtanítja a lelkészt átnézni rajta.
 *
 *   (2) Az „erre az évre MÁR KIFIZETTE" jelzés megvan. (Endre 1.) Az ajánlott
 *       összeg eddig is a MARADÉK tartozás volt, de ezt csak a title-ben mondta
 *       ki — a képernyőn úgy tűnt, mintha a rendszer indoklás nélkül más díjat
 *       ajánlana (Endre 9.: „160 helyett hirtelen 30").
 *
 *   (3) A Monetár ELTÉRÉSE előjeles. (Endre 11.) `Math.abs` mellett a hiány és
 *       a többlet BETŰRE ugyanúgy néz ki; a szín nyomtatásban elveszik.
 *
 *   (4) A Bevétel/Kiadás fül-sáv RAGAD, és tételszámot + ÖSSZEGET mutat.
 *       (Endre 3.) Sok sor után eddig vissza kellett görgetni a fülváltáshoz.
 *
 *   (5) A név-kereső legördülőjében működik a NYÍL-navigáció. (Endre 2.)
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): minden őrhöz
 * visszajátsszuk a hibás világot, és bizonyítjuk, hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-kassza-rogzito-jelzesek.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const BODY = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'CombinedEntryBody.tsx')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')
const MONETAR = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'MonetaryTab.tsx')

let failed = false
const ok = (m) => console.log(`OK:   ${m}`)
const fail = (m) => { failed = true; console.error(`HIBA: ${m}`) }

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const f of [BODY, ACTIONS, MONETAR]) {
  if (!fs.existsSync(f)) fail(`hiányzó fájl: ${path.relative(REPO, f)}`)
}
if (failed) { console.error('\nA rögzítő-jelzések önellenőrzés ELBUKOTT.'); process.exit(1) }

/** Egy őr + a hozzá tartozó mutáns egyben. */
function orzo(cimke, forras, minta, mutans) {
  const kod = kodCsak(forras)
  if (!minta.test(kod)) { fail(`${cimke} — hiányzik`); return }
  if (minta.test(kodCsak(mutans(forras)))) fail(`${cimke} — az őr VAK: a mutáns is átment`)
  else ok(cimke)
}

// ── (1) A DÁTUM-FIGYELMEZTETÉS CSAK KÉSZPÉNZRE VISZONYÍT ─────────────────
{
  const a = olvas(ACTIONS)
  const i = a.indexOf('export async function getLastRecordedDate')
  const szakasz = i >= 0 ? a.slice(i, i + 1400) : ''
  if (!szakasz) {
    fail('(1) a getLastRecordedDate nem található')
  } else {
    const kod = kodCsak(szakasz)
    // MINDKÉT lekérdezésen (befizetés ÉS kiadás) ott a készpénz-szűrő.
    const db = (kod.match(/\.is\(\s*['"]bankszamla_id['"]\s*,\s*null\s*\)/g) || []).length
    if (db >= 2) ok('(1) a getLastRecordedDate MINDKÉT lekérdezése készpénzre szűr')
    else fail(`(1) a készpénz-szűrő csak ${db} lekérdezésen van (2 kell): a banki import újra elárasztaná a figyelmeztetést`)
    // NEGATÍV: a szűrő kivétele bukjon.
    const mutans = kodCsak(szakasz.replace(/\.is\(\s*['"]bankszamla_id['"]\s*,\s*null\s*\)/g, ''))
    const mDb = (mutans.match(/\.is\(\s*['"]bankszamla_id['"]\s*,\s*null\s*\)/g) || []).length
    if (mDb === 0) ok('NEGATÍV — a készpénz-szűrő kivételét az őr elkapná')
    else fail('NEGATÍV — az őr VAK a készpénz-szűrő kivételére')
  }
}

const bodyNyers = olvas(BODY)

// A figyelmeztetés SZÖVEGE is mondja ki, hogy készpénzhez viszonyít — különben
// a lelkész a banki sorokra gyanakszik.
orzo(
  '(1) a figyelmeztetés szövege kimondja: az utolsó KÉSZPÉNZES tételhez viszonyít',
  bodyNyers,
  /Korábbi, mint az utolsó készpénzes tétel/,
  (s) => s.replace(/Korábbi, mint az utolsó készpénzes tétel/g, 'Korábbi, mint az utolsó rögzített'),
)

// ── (2) „MÁR KIFIZETTE" JELZÉS ───────────────────────────────────────────
orzo(
  '(2) a teljes évi járulék teljesítése HANGOS jelzést kap',
  bodyNyers,
  /évi járulékot MÁR KIFIZETTE/,
  (s) => s.replace(/évi járulékot MÁR KIFIZETTE/g, 'évi járulék rendezve'),
)
orzo(
  '(2) a mátrix-nézet tömör jelzése is kimondja („már kifizette")',
  bodyNyers,
  /⚠ már kifizette/,
  (s) => s.replace(/⚠ már kifizette/g, 'rendezve'),
)
// Az ajánlott összeg melletti „maradék" magyarázat (Endre 9.: a 160 → 30 rejtély).
orzo(
  '(2) részben fizetett évnél a képernyőn is látszik, hogy MARADÉK-ot ajánlunk',
  bodyNyers,
  /erre az évre már fizetett \{formatRon\(h\.paid\)\}/,
  (s) => s.replace(/erre az évre már fizetett \{formatRon\(h\.paid\)\}/g, 'x'),
)

// ── (3) A MONETÁR ELTÉRÉSE ELŐJELES ──────────────────────────────────────
{
  const m = olvas(MONETAR)
  const i = m.indexOf('label="Eltérés"')
  const szakasz = i >= 0 ? m.slice(i, i + 900) : ''
  if (!szakasz) {
    fail('(3) a Monetár „Eltérés" kártyája nem található')
  } else {
    const kod = kodCsak(szakasz)
    if (/difference > 0 \? '\+' : difference < 0 \? '−' : ''/.test(kod)) {
      ok('(3) az eltérés előjelesen jelenik meg (+ / −)')
    } else {
      fail('(3) az eltérés előjel NÉLKÜL jelenik meg: a hiány és a többlet betűre egyforma')
    }
    // NEGATÍV: a puszta Math.abs visszaállítása bukjon.
    const mutans = kodCsak(szakasz.replace(/`\$\{difference > 0[^`]*`/, 'formatRon(Math.abs(difference))'))
    if (!/difference > 0 \? '\+'/.test(mutans)) ok('NEGATÍV — az előjel eltávolítását az őr elkapná')
    else fail('NEGATÍV — az őr VAK az előjel eltávolítására')
  }
}

// ── (4) RAGADÓ FÜL-SÁV + ÖSSZEGEK ───────────────────────────────────────
orzo(
  '(4) a Bevétel/Kiadás fül-sáv ragad a görgetés tetején',
  bodyNyers,
  /className="sticky top-0 z-30/,
  (s) => s.replace(/className="sticky top-0 z-30/g, 'className="'),
)
orzo(
  '(4) a fül-sáv a bevétel tételszámát ÉS összegét is mutatja',
  bodyNyers,
  /\{incomeValid\} tétel · \{formatRon\(incomeOsszeg\)\} RON/,
  (s) => s.replace(/ · \{formatRon\(incomeOsszeg\)\} RON/g, ''),
)
orzo(
  '(4) a fül-sáv a kiadás tételszámát ÉS összegét is mutatja',
  bodyNyers,
  /\{expenseValid\} tétel · \{formatRon\(expenseOsszeg\)\} RON/,
  (s) => s.replace(/ · \{formatRon\(expenseOsszeg\)\} RON/g, ''),
)
{
  // Az összeg a TÖBBFIZETŐS nyugtánál a befizetők summája — különben a fejléc
  // mást mondana, mint amit a mentés elkönyvel.
  const kod = kodCsak(bodyNyers)
  if (/r\.people && r\.people\.length > 0 \? payerSum\(r\)/.test(kod)) {
    ok('(4) a fejléc-összeg a többfizetős nyugtán a befizetők summáját használja')
  } else {
    fail('(4) a fejléc-összeg nem a payerSum-ot használja: eltérne a ténylegesen mentett összegtől')
  }
}

// ── (5) NYÍL-NAVIGÁCIÓ A NÉV-KERESŐBEN ───────────────────────────────────
orzo(
  '(5) a név-kereső mezőn ott a billentyű-kezelő',
  bodyNyers,
  /onKeyDown=\{billentyu\}/,
  (s) => s.replace(/onKeyDown=\{billentyu\}/g, ''),
)
orzo(
  '(5) a ↓/↑ lépteti a kijelölést (és nem viszi el a kurzort)',
  bodyNyers,
  /e\.key === 'ArrowDown' \|\| e\.key === 'ArrowUp'/,
  (s) => s.replace(/e\.key === 'ArrowDown' \|\| e\.key === 'ArrowUp'/g, 'false'),
)
orzo(
  '(5) az Enter a kijelölt találatot választja',
  bodyNyers,
  /e\.key === 'Enter' && aktivIdx >= 0/,
  (s) => s.replace(/e\.key === 'Enter' && aktivIdx >= 0/g, 'false'),
)

// ── (6) AZ IGEVERS HELYE + A RAGADÁS ŐS-LÁNCA (2026-09-03, Endre 2.) ─────
// A meglévő (4)-es őr csak az OSZTÁLY-SZÖVEGET grepeli a CombinedEntryBody-ban.
// A ragadás valódi, NÉMA törése viszont a DIALÓGUS-fájlban keletkezik: a
// `sticky top-0` görgető-őse a DialogContent popupja, és ha a fejléc + a törzs
// közös új szülőt kap BÁRMILYEN overflow/transform/filter/contain osztállyal,
// AZ lesz a legközelebbi görgető-ős, a top-0 egy soha nem görgő dobozhoz tapad,
// és a fül-sáv csendben megszűnik ragadni. Hibaüzenet nincs, a CI zöld marad.
{
  const DIALOG = path.join(REPO, 'apps', 'web', 'components', 'modals', 'combined-entry-dialog.tsx')
  const DESKTOP = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'combined-entry-dialog.tsx')
  if (!fs.existsSync(DIALOG)) fail('(6) hiányzik a webes rögzítő-dialógus')
  else {
    const d = kodCsak(olvas(DIALOG))
    const iBiztato = d.indexOf('<RogzitesBiztato />')
    const iHeaderVege = d.indexOf('</DialogHeader>')
    if (iBiztato >= 0 && iHeaderVege > iBiztato) {
      ok('(6) az igevers a fejléc-blokkon BELÜL, az alcím alatt áll')
    } else {
      fail('(6) az igevers nem a DialogHeaderen belül van — vizuálisan a törzshöz tartozna, pedig az alcímre felel')
    }
    const TORO = /\b(overflow-[a-z-]+|transform|backdrop-filter|will-change-[a-z-]+|contain-[a-z-]+)\b/
    const gyanusSorok = (forras) => {
      const ki = []
      for (const sor of forras.split('\n')) {
        if (!/className=/.test(sor)) continue
        if (/<DialogContent/.test(sor)) continue
        if (TORO.test(sor)) ki.push(sor.trim().slice(0, 90))
      }
      return ki
    }
    const gyanus = gyanusSorok(d)
    if (gyanus.length === 0) {
      ok('(6) a DialogContenten kívül semmi nem lesz görgető-ős (a ragadás ép marad)')
    } else {
      fail(`(6) görgető-őssé tévő osztály a dialógusban: ${gyanus.join(' | ')} — a ragadó fül-sáv NÉMÁN elromlana`)
    }
    const mutans = kodCsak(olvas(DIALOG).replace('<div className="mt-3">', '<div className="mt-3 overflow-hidden">'))
    if (gyanusSorok(mutans).length > 0) ok('NEGATÍV — az ős-láncot törő wrappert az őr elkapná')
    else fail('NEGATÍV — az őr VAK: egy overflow-hidden wrapper átmenne')
    if (/className="px-6 pb-6 pt-4"/.test(d)) {
      ok('(6) a törzs-wrapper paddingje változatlan (a mentés-sáv erre támaszkodik)')
    } else {
      fail('(6) a törzs-wrapper paddingje megváltozott — a mentés-sáv fehér háttere elcsúszna')
    }
  }
  if (!fs.existsSync(DESKTOP)) fail('(6) hiányzik a desktop rögzítő-dialógus')
  else {
    const dd = kodCsak(olvas(DESKTOP))
    if (/<RogzitesBiztato \/>/.test(dd)) ok('(6) a desktop is mutatja az igeverset (paritás)')
    else fail('(6) a desktopon nincs igevers — a két felület széthúz')
    if (/Egy mentéssel több bevétel és kiadás is rögzíthető/.test(dd)) {
      ok('(6) a desktop alcíme a webbel azonos')
    } else fail('(6) a desktop alcíme eltér a webtől')
  }
}

if (failed) { console.error('\nA rögzítő-jelzések önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nA rögzítő-jelzések önellenőrzés rendben.')
