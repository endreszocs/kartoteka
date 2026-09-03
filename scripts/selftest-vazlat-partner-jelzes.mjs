#!/usr/bin/env node
/**
 * VÁZLAT + PARTNER-JELZÉS önellenőrzés (2026-09-02, Endre észrevétele)
 *
 * MIT ŐRIZ — Endre szó szerint: „A készpénznél a vázlat mentése után, ha
 * visszalépek, akkor a cégeket újra ellenőrzi — ami már eleve egyeztetés után
 * mentette vázlatként —, és újra kellene kattintgatni mindegyikre. Inkább csak
 * egy kis jel legyen ott, hogy ez a cég már benne van a gyülekezet cégeinek a
 * nyilvántartásában; ha nincs, akkor most a mentéssel bekerül abban a formában,
 * ahogy beírta a felhasználó."
 *
 * A GYÖKÉROK: a `PayerNameSearch` kereső-effektje a `value`-ra fut, tehát
 * MOUNTKOR is. Vázlat-visszaállításkor minden sor kitöltött névvel születik
 * újra → mindegyik lefuttat egy keresést → mindegyik legördülője kinyílik.
 *
 * Öt, egymástól függetlenül elromolható dolog:
 *
 *   (1) A kereső CSAK GÉPELÉSRE indul (`gepeltRef` kapu az effektben).
 *   (2) A gépelés-jelzőt a mező `onChange`-e állítja be — enélkül a kapu
 *       SOSEM nyílna ki, és a kereső egyáltalán nem működne.
 *   (3) A partner-jelzés PASSZÍV és csak a kiadás-oldalon jelenik meg.
 *   (4) FAIL-SAFE: amíg a partner-lista nem töltődött be (vagy hibázott), NINCS
 *       jelzés — egy üres lista nem mondhatja minden régi partnerre, hogy „új".
 *   (5) A partner-lista LAPOZVA jön (a PostgREST 1000 soros plafonja némán
 *       csonkítana, és a levágott partnerek tévesen „új"-ként világítanának).
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): minden őrhöz
 * visszajátsszuk a hibás világot, és bizonyítjuk, hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-vazlat-partner-jelzes.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const BODY = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'CombinedEntryBody.tsx')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')
const DIALOG = path.join(REPO, 'apps', 'web', 'components', 'modals', 'combined-entry-dialog.tsx')

let failed = false
const ok = (m) => console.log(`OK:   ${m}`)
const fail = (m) => { failed = true; console.error(`HIBA: ${m}`) }

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
/** Kommentek nélkül — egy komment sosem bizonyíték a viselkedésre. */
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const f of [BODY, ACTIONS, DIALOG]) {
  if (!fs.existsSync(f)) fail(`hiányzó fájl: ${path.relative(REPO, f)}`)
}
if (failed) { console.error('\nA vázlat/partner-jelzés önellenőrzés ELBUKOTT.'); process.exit(1) }

const bodyNyers = olvas(BODY)
const bodyKod = kodCsak(bodyNyers)

/** Egy őr + a hozzá tartozó mutáns egyben. */
function orzo(cimke, forras, minta, mutans) {
  const kod = kodCsak(forras)
  if (!minta.test(kod)) { fail(`${cimke} — hiányzik`); return }
  if (minta.test(kodCsak(mutans(forras)))) fail(`${cimke} — az őr VAK: a mutáns is átment`)
  else ok(cimke)
}

// ── (1) A KERESŐ CSAK GÉPELÉSRE INDUL ────────────────────────────────────
orzo(
  '(1) a kereső-effektben ott a gépelés-kapu (mountkor nem nyílik legördülő)',
  bodyNyers,
  /if\s*\(\s*!\s*gepeltRef\.current\s*\)\s*return/,
  (s) => s.replace(/if\s*\(\s*!\s*gepeltRef\.current\s*\)\s*return/g, 'void 0'),
)

// A kapu a KERESŐ-EFFEKTBEN legyen, ne máshol: a `value`-ra futó effekt előtt.
{
  const effektKezdet = bodyKod.indexOf('if (justPickedRef.current)')
  const effektVeg = bodyKod.indexOf('debounceRef.current = window.setTimeout')
  const szakasz = effektKezdet >= 0 && effektVeg > effektKezdet ? bodyKod.slice(effektKezdet, effektVeg) : ''
  if (!szakasz) fail('(1) a kereső-effekt nem azonosítható — az őr nem tud célozni')
  else if (/gepeltRef\.current/.test(szakasz)) ok('(1) a kapu a kereső-effekt belsejében van (a debounce ELŐTT)')
  else fail('(1) a gépelés-kapu nincs a kereső-effektben: mountkor újra keresne')
}

// ── (2) A GÉPELÉS-JELZŐT AZ onChange ÁLLÍTJA ─────────────────────────────
// Enélkül a kapu sosem nyílna ki: a kereső teljesen megszűnne (néma funkcióvesztés).
orzo(
  '(2) a mező onChange-e beállítja a gépelés-jelzőt (a kereső működik)',
  bodyNyers,
  // A jelző beállítása után MÁS is állhat (pl. a nyíl-navigáció kijelölés-nullázása),
  // ezért csak a jelző beállítására horgonyzunk — de az `onType` hívásra is,
  // hogy a mező tényleg írható maradjon.
  /onChange=\{\(e\)\s*=>\s*\{\s*gepeltRef\.current\s*=\s*true;[^}]*onType\(/,
  (s) => s.replace(/gepeltRef\.current = true;\s*/g, ''),
)

// ── (3) A PARTNER-JELZÉS PASSZÍV ÉS KIADÁS-OLDALI ────────────────────────
orzo(
  '(3) a partner-jelzés csak a kiadás-oldalon jelenik meg',
  bodyNyers,
  /partnerStatus=\{mode === 'expense'\s*\?\s*\(partnerJelzes\?\.\(row\.partner\)\s*\?\?\s*null\)\s*:\s*null\}/,
  (s) => s.replace(/mode === 'expense' \? \(partnerJelzes\?\.\(row\.partner\) \?\? null\) : null/g, 'partnerJelzes?.(row.partner) ?? null'),
)
{
  // A jelzés NEM kattintható: nem lehet gomb/onClick a jelvényen.
  const i = bodyKod.indexOf('{partnerStatus && !open && (')
  const szakasz = i >= 0 ? bodyKod.slice(i, i + 1400) : ''
  if (!szakasz) fail('(3) a partner-jelvény nem található')
  else if (/onClick|<button/.test(szakasz)) fail('(3) a partner-jelvény kattintható lett — passzív jelzésnek kell maradnia')
  else ok('(3) a partner-jelvény passzív: nem kér kattintást')
}

// ── (4) FAIL-SAFE: betöltetlen listánál NINCS jelzés ─────────────────────
orzo(
  '(4) betöltetlen partner-listánál nincs jelzés (nem mond mindenre „új"-at)',
  bodyNyers,
  /if\s*\(\s*!ismertPartnerek\s*\)\s*return null/,
  (s) => s.replace(/if\s*\(\s*!ismertPartnerek\s*\)\s*return null/g, 'if (false) return null'),
)
{
  // A halmaz `undefined` bemenetnél `null` — NEM üres Set (az „minden új"-at jelentene).
  const i = bodyKod.indexOf('const ismertPartnerek = useMemo(')
  const szakasz = i >= 0 ? bodyKod.slice(i, i + 500) : ''
  if (/if\s*\(\s*!knownExpensePartners\s*\)\s*return null/.test(szakasz)) {
    ok('(4) a hiányzó lista `null` halmazt ad (nem üres Set-et)')
  } else fail('(4) a hiányzó partner-lista nem `null`-t ad: minden partner „új"-nak látszana')
}
{
  // A dialógus hibánál sem állíthat üres listát.
  const d = kodCsak(olvas(DIALOG))
  if (/\.catch\(\(\)\s*=>\s*\{[^}]*setIsmertPartnerek\(undefined\)/.test(d)) {
    ok('(4) a betöltés hibájánál a lista `undefined` marad → nincs jelzés')
  } else if (/setIsmertPartnerek\(\[\]\)/.test(d)) {
    fail('(4) hiba esetén ÜRES listát állít: minden partner tévesen „új"-ként világítana')
  } else {
    fail('(4) a betöltés hibaága nem azonosítható a rögzítő dialógusban')
  }
}

// ── (5) A PARTNER-LISTA LAPOZVA JÖN ──────────────────────────────────────
{
  const a = olvas(ACTIONS)
  const i = a.indexOf('export async function listExpensePartnerNames')
  const szakasz = i >= 0 ? a.slice(i, i + 1600) : ''
  if (!szakasz) {
    fail('(5) nincs listExpensePartnerNames action — a jelzésnek nincs adatforrása')
  } else {
    orzo(
      '(5) a partner-lista LAPOZVA jön (az 1000 soros plafon nem csonkíthat némán)',
      szakasz,
      /selectAllPaged/,
      (s) => s.replace(/selectAllPaged/g, 'egyLapos'),
    )
    orzo(
      '(5) a partner-lista gyülekezeti hatókörre szűr',
      szakasz,
      /congregation_id/,
      (s) => s.replace(/congregation_id/g, 'valami_mas'),
    )
    orzo(
      '(5) a törölt kiadások partnerei nem számítanak ismertnek',
      szakasz,
      /\.eq\(\s*['"]deleted['"]\s*,\s*false\s*\)/,
      (s) => s.replace(/\.eq\(\s*['"]deleted['"]\s*,\s*false\s*\)/g, ''),
    )
  }
}

if (failed) { console.error('\nA vázlat/partner-jelzés önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nA vázlat/partner-jelzés önellenőrzés rendben.')
