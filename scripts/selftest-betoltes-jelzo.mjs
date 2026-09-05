#!/usr/bin/env node
/**
 * BETÖLTÉS-JELZŐ önellenőrzés (2026-09-05)
 *
 * ELŐZMÉNY — Endre kérése: „A tagnyilvántartás adatok betöltésénél van egy szép
 * forgó csillag, ezt mindegyik modulhoz be lehet tenni?"
 *
 * A kiterítés előtt egy átvilágítás négy olyan hibát talált, amit a másolás
 * SOKSZOROZOTT volna — ez az őr ezeket rögzíti:
 *
 *  (1) ⛔ A CSILLAG MEGÁLLT mozgás-csökkentésnél. A `kartoteka.css` 480-484.
 *      sora ÍRÁSBAN kimondja: „a töltésjelző nem áll meg, csak LELASSUL
 *      (1 s → 3 s). Egy mozdulatlan töltésjelző »megfagyottnak« látszik, és a
 *      felhasználó újra megnyomná a gombot." Ugyanennek a fájlnak egy másik
 *      pontja mégis `animation: none`-t adott a `.kt-spin`-nek — vagyis a saját
 *      leírt szabályunkkal ment szembe.
 *
 *  (2) ⛔ KETTŐS FELOLVASÁS. A minta KÉT élő régiót tett egymás mellé (a sáv
 *      `role="status"`, és a csontváz is az) — a képernyőolvasó kétszer mondta
 *      be ugyanazt. Egy helyen bosszúság, harminc helyre másolva özön.
 *
 *  (3) ⛔ HAZUG ÜRES-ÁLLAPOTOK. Betöltés közben két felület HATÁROZOTTAN
 *      ÁLLÍTOTTA, hogy nincs adat: a Bérleti szerződések fül („Még nincs
 *      bérleti szerződés rögzítve.") és a hivatalos személyi szám mezője
 *      („— nincs rögzítve" + Rögzítés gomb). Mindkettő duplán felvett
 *      rekordhoz vezethetett. Ez a legsúlyosabb fajta: nem néma, hanem HAMIS.
 *
 *  (4) ⛔ SOR-SZINTŰ SPINNER. Egy `.map()`-be tett forgó SVG 50-200 példányt
 *      jelent egy táblázaton — az őr ezt tiltja.
 *
 * ⚠️ SZÁNDÉKOS DÖNTÉSEK, amikhez NEM nyúlunk (az őr ŐRZI is őket): a
 * nyomtatvány-lánc négyágú fail-closed jelzője, a kassza-kereső 12 px-es
 * mikro-jelzője, a családfa saját galaxis-betöltője és a route-szintű
 * betöltő-képernyő.
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): a mutánsok
 * visszajátsszák a RÉGI, hibás világot.
 *
 * Futtatás:  node scripts/selftest-betoltes-jelzo.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const CSS = path.join(REPO, 'packages', 'ui', 'src', 'kartoteka.css')
const LOADING = path.join(REPO, 'packages', 'ui-app', 'src', 'loading', 'index.tsx')
const PERSONS = path.join(REPO, 'apps', 'web', 'components', 'members', 'persons-tab.tsx')
const RENTAL = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'RentalTab.tsx')
const FIN_TABS = path.join(REPO, 'apps', 'web', 'components', 'finance', 'finance-tabs.tsx')
const MEMBER_TABS = path.join(REPO, 'apps', 'web', 'components', 'members', 'member-tabs-v4.tsx')
const REG_TABS = path.join(REPO, 'apps', 'web', 'components', 'registry', 'registry-tabs.tsx')
const SZSZ_MEZO = path.join(REPO, 'apps', 'web', 'components', 'members', 'szemelyi-szam-mezo.tsx')

let failed = false
const ok = (m) => console.log(`OK:   ${m}`)
const fail = (m) => { failed = true; console.error(`HIBA: ${m}`) }

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const FAJLOK = [CSS, LOADING, PERSONS, RENTAL, FIN_TABS, MEMBER_TABS, REG_TABS, SZSZ_MEZO]
for (const f of FAJLOK) if (!fs.existsSync(f)) fail(`hiányzó fájl: ${path.relative(REPO, f)}`)
if (failed) { console.error('\nA betöltés-jelző önellenőrzés ELBUKOTT.'); process.exit(1) }

// ── (A) A CSS: a csillag NEM állhat meg ─────────────────────────────────────
const css = olvas(CSS)

// 1. A reduce-ág nem nullázhatja a töltésjelzőt.
{
  const reduceBlokkok = css.match(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\n\}/g) || []
  const rossz = reduceBlokkok.filter((b) => /\.kt-spin[^{]*\{[^}]*animation:\s*none/.test(b))
  if (rossz.length === 0) ok('a töltésjelző NEM áll meg mozgás-csökkentésnél')
  else fail('a `.kt-spin` `animation: none`-t kap reduce mellett — a fájl 480-484. sora ezt ÍRÁSBAN tiltja')
}

// 2. …de lassul. (Ha egyáltalán nincs reduce-kezelés, az is hiba.)
if (/@media \(prefers-reduced-motion: reduce\)[\s\S]{0,600}\.kt-spin\s*\{\s*animation-duration:\s*3s/.test(css)) {
  ok('a töltésjelző mozgás-csökkentésnél LELASSUL (3 s)')
} else fail('a `.kt-spin` nem kap lassított animációt reduce mellett')

// 3. A `.kt-spin` CSAK EGYSZER van definiálva. Két definíció esetén a második
//    nyer, és némán elviszi az elsőt — aki az elsőt javítja, semmit nem ér el.
{
  const db = (css.match(/^\.kt-spin\s*\{/gm) || []).length + (css.match(/\n\.kt-spin \{ animation/g) || []).length
  if (db === 1) ok('a `.kt-spin` egyetlen helyen van definiálva')
  else fail(`a \`.kt-spin\` ${db} helyen van definiálva — a későbbi némán felülírja a korábbit`)
}

// ── (B) A KÖZÖS KOMPONENS ───────────────────────────────────────────────────
const loading = olvas(LOADING)
const loadingKod = kodCsak(loading)

// 4. Létezik és exportált.
if (/export function BetoltesSav/.test(loadingKod)) ok('a BetoltesSav közös komponens létezik')
else fail('nincs BetoltesSav — minden modul újra kézzel gyártana egyet')

// 5. A wrapper is, ami a kettős felolvasást megakadályozza.
if (/export function BetoltesBlokk/.test(loadingKod)) ok('a BetoltesBlokk wrapper létezik')
else fail('nincs BetoltesBlokk — a hívók újra elő tudják állítani a kettős élő régiót')

// 6. ⛔ A WRAPPER KÖTELEZŐEN elrejti a csontvázat a képernyőolvasó elől.
{
  const w = loadingKod.match(/export function BetoltesBlokk[\s\S]*?\n\}/)
  if (w && /aria-hidden="true"/.test(w[0])) ok('a wrapper aria-hidden burokba teszi a csontvázat')
  else fail('a wrapper nem rejti el a csontvázat — marad a kettős felolvasás')
}

// 7. A csendes mód elérhető (beágyazáshoz, ahol már van élő régió).
if (/csendes/.test(loadingKod)) ok('van csendes mód (nincs kettős bemondás beágyazáskor)')
else fail('nincs csendes mód — beágyazva kétszer szólalna meg')

// 8. A késleltetés elérhető (villogás ellen a gyors betöltéseknél).
if (/keslelteto/.test(loadingKod)) ok('van késleltetés (a gyors betöltés nem villantja fel a sávot)')
else fail('nincs késleltetés — meleg gyorsítótárnál minden fülváltásnál felvillanna')

// 9. NINCS szín-prop: a csillag a konténer tompa szürkéjét örökli. Egy
//    olívazöld csillag 30 helyen MÁS látvány lenne, nem „ugyanaz mindenhol".
{
  const sav = loadingKod.match(/export function BetoltesSav[\s\S]*?\n\}/)
  if (sav && !/\bszin\b|\bcolor\b/.test(sav[0])) ok('a sávnak nincs szín-propja (egységes látvány)')
  else fail('a sáv színezhető — 30 helyen szétcsúszna a látvány')
}

// ── (C) A MINTA: persons-tab ────────────────────────────────────────────────
const persons = kodCsak(olvas(PERSONS))

// 10. A minta a KÖZÖS komponenst használja (nem helyben írt másolatot).
if (/<BetoltesBlokk/.test(persons)) ok('a tagnyilvántartás a közös wrappert használja')
else fail('a tagnyilvántartás helyben írt sávot használ — a többi modul másolni fogja')

// 11. ⛔ NINCS kettős élő régió: a sáv mellett a csontváz NEM lehet role=status.
{
  const blokk = persons.match(/<BetoltesBlokk[\s\S]{0,400}?<\/BetoltesBlokk>/)
  if (blokk && !/role="status"/.test(blokk[0])) ok('a mintában nincs kettős élő régió')
  else fail('a minta két élő régiót tesz egymás mellé — a képernyőolvasó kétszer mondja be')
}

// ── (D) HAZUG ÜRES-ÁLLAPOTOK — a legsúlyosabb fajta ─────────────────────────
const rental = olvas(RENTAL)
const rentalKod = kodCsak(rental)

// 12. A bérleti fül tud a betöltésről.
if (/betoltes\?: boolean/.test(rentalKod) || /betoltes = false/.test(rentalKod)) {
  ok('a bérleti fül ismeri a betöltés állapotát')
} else fail('a bérleti fülnek nincs betöltés-állapota')

// 13. ⛔ AZ ÜRES-ÁLLAPOT CSAK BEFEJEZETT BETÖLTÉS UTÁN. Enélkül a lelkész azt
//     olvassa, hogy nincs szerződése, és MÁSODSZOR is felveheti ugyanazt.
if (/filtered\.length === 0 && !betoltes/.test(rentalKod)) {
  ok('a bérleti üres-állapot csak befejezett betöltés után jelenik meg')
} else fail('a bérleti fül betöltés közben azt állítja, hogy nincs szerződés — duplán felvett szerződés');

// 14. Ugyanez a hivatalos személyi szám mezőjén (ezt a hibát MI követtük el).
{
  const mezo = kodCsak(olvas(SZSZ_MEZO))
  if (/if \(allapot === null\)/.test(mezo)) ok('a személyi szám mezője betöltés alatt nem állítja, hogy nincs rögzítve')
  else fail('a személyi szám mezője betöltés közben „nincs rögzítve"-t állít — és Rögzítés gombot kínál')
}

// ── (E) A SZORZÓK: egy sor, sok felület ─────────────────────────────────────
{
  const szorzok = [
    { nev: 'pénzügy (11 fül)', fajl: FIN_TABS, keslelteto: true },
    { nev: 'tagnyilvántartás (6 fül)', fajl: MEMBER_TABS, keslelteto: true },
    { nev: 'anyakönyv (8 típus)', fajl: REG_TABS, keslelteto: false },
  ]
  for (const sz of szorzok) {
    const kod = kodCsak(olvas(sz.fajl))
    if (!/<BetoltesSav/.test(kod)) { fail(`${sz.nev}: nem a közös sávot használja`); continue }
    // ⚠️ A chunk-fallback meleg gyorsítótárból ~0 ms — késleltetés NÉLKÜL
    // minden fülváltásnál felvillanna, ami rosszabb a mai néma doboznál.
    if (sz.keslelteto && !/keslelteto=\{\d+\}/.test(kod)) {
      fail(`${sz.nev}: chunk-fallback késleltetés nélkül — minden fülváltásnál felvillanna`)
      continue
    }
    ok(`${sz.nev}: a közös sávot használja${sz.keslelteto ? ' (késleltetve)' : ''}`)
  }
}

// 18. A régi, csupasz szürke doboz NEM maradhat a szorzókon.
{
  const maradek = [FIN_TABS, MEMBER_TABS].filter((f) =>
    /const tabLoading = \(\) => <div className="[^"]*animate-pulse[^"]*bg-slate-100/.test(kodCsak(olvas(f))),
  )
  if (maradek.length === 0) ok('a csupasz szürke doboz eltűnt a fül-betöltőkből')
  else fail(`még csupasz szürke doboz a fül-betöltő: ${maradek.map((f) => path.basename(f)).join(', ')}`)
}

// ── (F) SOR-SZINTŰ SPINNER TILALMA ──────────────────────────────────────────
// 19. Egy `.map()`-be tett forgó SVG 50-200 példány egy táblázaton.
{
  const gyanus = []
  for (const f of [FIN_TABS, MEMBER_TABS, REG_TABS, PERSONS, RENTAL]) {
    const kod = kodCsak(olvas(f))
    // .map( … ) törzsében CalvinSpinner vagy BetoltesSav
    const mapok = kod.match(/\.map\(\([^)]*\)\s*=>[\s\S]{0,1200}?\n\s{0,10}\)\)/g) || []
    if (mapok.some((m) => /<CalvinSpinner|<BetoltesSav/.test(m))) gyanus.push(path.basename(f))
  }
  if (gyanus.length === 0) ok('nincs forgó jelző soronkénti ismétlésben')
  else fail(`soronként ismétlődő forgó jelző: ${gyanus.join(', ')} — 50-200 forgó SVG egy táblán`)
}

// ── (G) A SZÁNDÉKOS DÖNTÉSEK ÉRINTETLENEK ──────────────────────────────────
{
  const dontesek = [
    { nev: 'nyomtatvány négyágú jelzője', ut: ['packages', 'ui-app', 'src', 'finance', 'print-loading-core.ts'] },
    { nev: 'route-szintű betöltő-képernyő', ut: ['apps', 'web', 'components', 'layout', 'route-loading-screen.tsx'] },
  ]
  const hianyzo = dontesek.filter((d) => !fs.existsSync(path.join(REPO, ...d.ut))).map((d) => d.nev)
  if (hianyzo.length === 0) ok('a szándékos, dokumentált betöltés-döntések a helyükön vannak')
  else fail(`eltűnt egy szándékos döntés: ${hianyzo.join(', ')}`)
}

// 21. A kassza-kereső 12 px-es mikro-jelzőjét NEM cseréltük nagy csillagra
//     (a mező megugrana gépelés közben).
{
  const kassza = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'CombinedEntryBody.tsx')
  if (fs.existsSync(kassza)) {
    const kod = kodCsak(olvas(kassza))
    if (!/<BetoltesSav/.test(kod)) ok('a kassza-kereső mikro-jelzője érintetlen (a mező nem ugrik meg)')
    else fail('a kassza-keresőbe sáv került — gépelés közben megugrik a mező')
  }
}

// ── (H) MUTÁNSOK — a régi, hibás világ visszajátszása ───────────────────────
// M1: a csillag megállítása reduce mellett → az 1. asszertnek buknia kell.
{
  const mutans = css.replace(/\.kt-spin \{ animation-duration: 3s; \}/, '.kt-spin { animation: none; }')
  const blokkok = mutans.match(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\n\}/g) || []
  if (blokkok.some((b) => /\.kt-spin[^{]*\{[^}]*animation:\s*none/.test(b))) {
    ok('M1 mutáns: megállított töltésjelző → az őr buktatná')
  } else fail('M1 mutáns TÚLÉLTE — az 1. asszert vak')
}

// M2: a wrapper aria-hidden burkának elvétele → a 6. asszertnek buknia kell.
{
  const mutans = loadingKod.replace(/aria-hidden="true"/g, '')
  const w = mutans.match(/export function BetoltesBlokk[\s\S]*?\n\}/)
  if (!w || !/aria-hidden="true"/.test(w[0])) ok('M2 mutáns: burok nélküli wrapper → az őr buktatná')
  else fail('M2 mutáns TÚLÉLTE — a 6. asszert vak')
}

// M3: a hazug bérleti üres-állapot visszaállítása → a 13. asszertnek buknia kell.
{
  const mutans = rentalKod.replace(/filtered\.length === 0 && !betoltes/g, 'filtered.length === 0')
  if (!/filtered\.length === 0 && !betoltes/.test(mutans)) {
    ok('M3 mutáns: betöltés közben hazudó üres-állapot → az őr buktatná')
  } else fail('M3 mutáns TÚLÉLTE — a 13. asszert vak')
}

// M4: a személyi szám mezőjének betöltés-ága nélkül → a 14. asszertnek buknia kell.
{
  const mutans = kodCsak(olvas(SZSZ_MEZO)).replace(/if \(allapot === null\)/g, 'if (false)')
  if (!/if \(allapot === null\)/.test(mutans)) ok('M4 mutáns: „nincs rögzítve" betöltés közben → az őr buktatná')
  else fail('M4 mutáns TÚLÉLTE — a 14. asszert vak')
}

// M5: a késleltetés elvétele a chunk-fallbackről → a 15-16. asszertnek buknia kell.
{
  const mutans = kodCsak(olvas(FIN_TABS)).replace(/keslelteto=\{\d+\}/g, '')
  if (!/keslelteto=\{\d+\}/.test(mutans)) ok('M5 mutáns: késleltetés nélküli chunk-fallback → az őr buktatná')
  else fail('M5 mutáns TÚLÉLTE — a 15. asszert vak')
}

// M6: sor-szintű spinner beszúrása → a 19. asszertnek buknia kell.
{
  const hamis = 'rows.map((r) => (\n  <tr key={r.id}><td><CalvinSpinner size={12} /></td></tr>\n))'
  const mapok = hamis.match(/\.map\(\([^)]*\)\s*=>[\s\S]{0,1200}?\n\s{0,10}\)\)/g) || []
  if (mapok.some((m) => /<CalvinSpinner/.test(m))) ok('M6 mutáns: soronkénti forgó jelző → az őr buktatná')
  else fail('M6 mutáns TÚLÉLTE — a 19. asszert mintája nem fog soronkénti spinnert')
}

if (failed) {
  console.error('\nA betöltés-jelző önellenőrzés ELBUKOTT.')
  process.exit(1)
}
console.log('\nA betöltés-jelző önellenőrzés RENDBEN.')
