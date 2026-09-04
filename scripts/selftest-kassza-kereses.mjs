#!/usr/bin/env node
/**
 * A KASSZA-RÖGZÍTŐ KERESÉSEI önellenőrzés (2026-09-03, Endre 4. kérése)
 *
 * Endre szó szerint: „A kassza beviteli ablakában az automatikus kitöltések,
 * keresések legyenek nagyon gyorsak és jól optimalizáltak!"
 *
 * ⚠️ A MÉRÉS EREDMÉNYE: a látszólagos lassúság NEM a rajzolásból jött (57 sornál
 * a render-költség 1-2 ms). A valódi bajok ezek voltak — és kettő közülük NEM
 * sebesség, hanem HELYESSÉG:
 *
 *   (1) VERSENY-FELTÉTEL. A keresés 300 ms debounce után indult, de a válaszok
 *       tetszőleges sorrendben érkeztek, és AMELYIK KÉSŐBB ÉRT BE, AZ NYERT.
 *       Gyors gépelésnél a rövidebb töredék találatai felülírhatták a hosszabb
 *       lekérdezés listáját — a lelkész ELAVULT listából választott, azaz ROSSZ
 *       tagot linkelt a nyugtára. Ez pénzügyi adathiba, nem kényelmi kérdés.
 *
 *   (2) NÉMA ÜRES LISTA. A tag-kereső lezárása `const { data } = await q.limit(8);
 *       return data || []` volt — az `error` DESTRUKTURÁLVA ELDOBVA. Egyetlen
 *       elgépelt oszlop vagy embed → PostgREST 400 → `data` undefined → ÜRES
 *       LISTA, hangtalanul. A törzs NÉGY felületet szolgál ki.
 *
 *   (3) NÉMA KERESÉS. Nem látszott, hogy a keresés fut-e — a lelkész újragépelt,
 *       ami újabb kérést indított, ami tovább rontotta az (1)-es versenyt.
 *
 *   (4) A CSALÁD-ÚTON CSAK TELEPÜLÉS volt — épp ott hiányzott az utca és a
 *       házszám, ahol a legtöbbet ér: négy azonos vezetéknevű ember egy nyugtán.
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): minden őrhöz
 * visszajátsszuk a hibás világot, és bizonyítjuk, hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-kassza-kereses.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const BODY = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'CombinedEntryBody.tsx')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')

let failed = false
const ok = (m) => console.log(`OK:   ${m}`)
const fail = (m) => { failed = true; console.error(`HIBA: ${m}`) }

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const f of [BODY, ACTIONS]) {
  if (!fs.existsSync(f)) fail(`hiányzó fájl: ${path.relative(REPO, f)}`)
}
if (failed) { console.error('\nA keresés-önellenőrzés ELBUKOTT.'); process.exit(1) }

/** Függvényhatáros ablak — a fix slice(i, i+N) átlógna a szomszéd függvénybe.
 *  A vég-jelző SOHA nem lehet komment: a kodCsak() kitörli, és az ablak a fájl
 *  végéig lóg (ez a hibaosztály már megégetett minket). */
function ablak(forras, kezdoJelzo, vegJelzo) {
  const k = kodCsak(forras)
  const i = k.indexOf(kezdoJelzo)
  if (i < 0) return ''
  const j = k.indexOf(vegJelzo, i + kezdoJelzo.length)
  return j < 0 ? k.slice(i) : k.slice(i, j)
}

const bodyNyers = olvas(BODY)
const actionsNyers = olvas(ACTIONS)

// ── (1) VERSENY-FELTÉTEL: AZ ELAVULT VÁLASZ NEM ÍRHAT FELÜL ──────────────
{
  const w = ablak(bodyNyers, 'debounceRef.current = window.setTimeout(', '}, 300)')
  if (!w) {
    fail('(1) a kereső debounce-blokkja nem található')
  } else {
    if (/const sorszam = \+\+kerelemRef\.current/.test(w)) {
      ok('(1) minden keresés SORSZÁMOT kap')
    } else {
      fail('(1) nincs kérés-sorszám — a később beérkező RÉGI válasz felülírhatja az újat, és a lelkész elavult listából választ')
    }
    const orDb = (w.match(/if \(sorszam !== kerelemRef\.current\) return/g) || []).length
    if (orDb >= 2) ok(`(1) az elavult választ MINDKÉT ág eldobja (siker + hiba, ${orDb} őr)`)
    else fail(`(1) csak ${orDb} ágon van elavultság-őr (2 kell: .then és .catch) — a hibaág visszaüríthetné a friss listát`)
    // A kijelölés minden érkezésnél nullázódik: az `aktivIdx` INDEX a lapos
    // listában; két találati halmaz összeolvadásánál az Enter MÁST választana,
    // mint ami ki van emelve — bevételi soron ez ROSSZ `id_szemely`-t könyvelne.
    if (/setAktivIdx\(-1\)/.test(w)) ok('(1) a nyíl-kijelölés minden új találat-halmaznál nullázódik')
    else fail('(1) a kijelölés NEM nullázódik — az Enter mást választhat, mint ami ki van emelve')
  }
  // NEGATÍV: a sorszám-őr kivétele bukjon.
  const mutans = ablak(
    bodyNyers.split('if (sorszam !== kerelemRef.current) return').join(''),
    'debounceRef.current = window.setTimeout(', '}, 300)',
  )
  if (!/if \(sorszam !== kerelemRef\.current\) return/.test(mutans)) {
    ok('NEGATÍV — az elavultság-őr kivételét az őr elkapná')
  } else fail('NEGATÍV — az őr VAK az elavultság-őr kivételére')
}

// ── (2) A KIVÁLASZTÁS ÉRVÉNYTELENÍTI A FÜGGŐ KERESÉST ────────────────────
{
  const kod = kodCsak(bodyNyers)
  if (/kerelemRef\.current \+= 1/.test(kod)) {
    ok('(2) kiválasztáskor a függőben lévő keresés válasza már nem nyit vissza listát')
  } else {
    fail('(2) kiválasztás után egy késve érkező válasz ÚJRA kinyitná a legördülőt')
  }
}

// ── (3) LÁTSZIK, HOGY FUT A KERESÉS ──────────────────────────────────────
{
  const kod = kodCsak(bodyNyers)
  if (/setKeres\(true\)/.test(kod) && /!linked && keres &&/.test(kod)) {
    ok('(3) a mezőben diszkrét töltés-jelző mutatja, hogy a keresés fut')
  } else {
    fail('(3) nincs töltés-jelző — a lelkész nem tudja, üres-e a lista vagy még úton van, ezért újragépel')
  }
  const kikapcsDb = (kod.match(/setKeres\(false\)/g) || []).length
  if (kikapcsDb >= 3) ok(`(3) a jelző minden kimeneten kikapcsol (${kikapcsDb} hely: siker, hiba, kiválasztás)`)
  else fail(`(3) a töltés-jelző csak ${kikapcsDb} helyen kapcsol ki — beragadhat`)
}

// ── (4) A TAG-KERESŐ NEM NYELI EL A HIBÁT ────────────────────────────────
{
  const w = ablak(actionsNyers, 'async function queryCongregationMembers(', 'export async function searchMembersForFinance')
  if (!w) {
    fail('(4) a queryCongregationMembers törzse nem található')
  } else {
    if (/const \{ data \} = await q\.limit\(8\)/.test(w)) {
      fail('(4) visszatért a néma alak (`const { data } = …`) — egy elgépelt oszlop NÉGY felületet blankolna hangtalanul')
    } else ok('(4) a lekérdezés hibáját NEM dobjuk el')
    if (/const \{ data, error \} = await q\.limit\(8\)/.test(w)) ok('(4) az `error` ki van olvasva')
    else fail('(4) az `error` nincs kiolvasva')
    if (/console\.error\('\[queryCongregationMembers\]/.test(w)) ok('(4) a hiba a naplóba is kikerül (nem marad néma)')
    else fail('(4) a hiba nem kerül naplóba')
    // FAIL-SAFE: a kényelmi mezők nélkül ÚJRA lekérdezünk — a kereső a legrosszabb
    // esetben is MŰKÖDIK, csak szegényebb; az azonosító-sor marad el, nem a találat.
    if (/\.select\('id, csaladnev, k_nev'\)/.test(w)) ok('(4) van minimál újrapróbálkozás (a találat sosem vész el a kényelmi mező miatt)')
    else fail('(4) nincs minimál újrapróbálkozás')
    // …de ha a MINIMÁL is bukik, az nem „nincs találat", hanem hiba.
    if (/throw new Error\(`A tag-kereső nem futtatható/.test(w)) ok('(4) ha a minimál lekérdezés is bukik, DOBUNK (nem üres lista)')
    else fail('(4) a minimál lekérdezés bukása is üres listaként jelenne meg')
  }
  // NEGATÍV: a régi, néma alak visszaírása bukjon.
  const mutans = ablak(
    actionsNyers.replace('const { data, error } = await q.limit(8)', 'const { data } = await q.limit(8)'),
    'async function queryCongregationMembers(', 'export async function searchMembersForFinance',
  )
  if (/const \{ data \} = await q\.limit\(8\)/.test(mutans)) {
    ok('NEGATÍV — a néma alak visszaírását az őr elkapná')
  } else fail('NEGATÍV — az őr VAK a néma alak visszaírására')
}

// ── (5) A CSALÁD-ÚTON IS VAN UTCA ÉS HÁZSZÁM ─────────────────────────────
{
  const kod = kodCsak(actionsNyers)
  const bovDb = (kod.match(/sz_datum, c_szam, adrlocality!c_helysegid\(name\), adrstreet!c_utcaid\(name\)/g) || []).length
  // 6 = a tag-kereső (queryCongregationMembers) + 5 család-úti (férj, feleség,
  // gyermek, 2× háztartás). MIND a hatnak azonos alakot kell adnia, különben a
  // két út némán széthúz: ugyanarra a tagra más cím jelenne meg attól függően,
  // hogy kereséssel vagy család-csatolással került a nyugtára.
  if (bovDb === 6) {
    ok('(5) mind a 6 lekérdezés (tag-kereső + 5 család-úti) viszi az utcát és a házszámot')
  } else {
    fail(`(5) csak ${bovDb} lekérdezés bővült (6 kell) — a többi úton a cím CSAK település maradna`)
  }
  const regiDb = (kod.match(/sz_datum, adrlocality!c_helysegid\(name\)\)/g) || []).length
  if (regiDb === 0) ok('(5) nem maradt régi, csak-település alakú lekérdezés')
  else fail(`(5) ${regiDb} lekérdezés még a régi, csak-település alakot használja — a két út némán széthúzna`)
  // Az összeállítás alakja azonos a tag-keresőével, hogy a kliens-oldali
  // vesszősítés mindkét úton ugyanazt adja.
  const w = ablak(actionsNyers, 'const telepulesOf = (p: any)', 'const extraOf =')
  if (/reszek\.join\(' · '\)/.test(w)) ok('(5) a család-úti cím alakja azonos a tag-keresőével')
  else fail('(5) a család-úti cím más alakban áll össze — a vesszősítés máshogy sülne el')
  // NEGATÍV: egyetlen select visszaírása a régi alakra bukjon.
  const mutans = kodCsak(actionsNyers.replace(
    'sz_datum, c_szam, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)',
    'sz_datum, adrlocality!c_helysegid(name)',
  ))
  if ((mutans.match(/sz_datum, c_szam, adrlocality!c_helysegid\(name\), adrstreet!c_utcaid\(name\)/g) || []).length !== 6) {
    ok('NEGATÍV — egyetlen visszaírt lekérdezést is elkap az őr')
  } else fail('NEGATÍV — az őr VAK egy visszaírt lekérdezésre')
}

if (failed) { console.error('\nA keresés-önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nA keresés-önellenőrzés rendben.')
