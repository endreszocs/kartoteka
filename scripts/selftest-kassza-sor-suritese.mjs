#!/usr/bin/env node
/**
 * A TÉTEL-SOR SŰRÍTÉSE önellenőrzés (2026-09-03, Endre 5. kérése)
 *
 * Endre szó szerint: „az egyes tételek sorai legyenek egyszerűsítve és szépítve!
 * - pl. az életkora és az utca, helység és házszám legyenek vesszővel a neve
 * mellett megjelenítve, a család csatolása, több évre és még egy befizető gombok
 * is legyenek ugyanott és »A ✓ Ajánlott összeg (…) maradék — erre az évre már
 * fizetett 130,00 RON (éves díj 160,00)« legyen szebben elhelyezve és kevesebb
 * helyet foglaljon!"
 *
 * Nyolc, egymástól függetlenül elromolható dolog:
 *
 *   (1) TIPOGRÁFIAI PADLÓ. A `<table className="w-full text-sm">` 20 px-es
 *       sormagasságát ÖRÖKLIK a `text-[10px]`-féle spanek, mert az arbitrary
 *       betűméret NEM állít sormagasságot. Egy „10 pixeles" tördelt sor
 *       valójában 20 px. Explicit `leading-` nélkül ez némán visszakúszik.
 *
 *   (2) A 160→30 REJTÉLY ŐRE. A „maradék — erre az évre már fizetett …"
 *       mondatrész a KÉPERNYŐN marad, nem a `title`-ben. Épp ennek a hiánya
 *       okozta, hogy a rendszer indoklás nélkül látszott más díjat ajánlani.
 *
 *   (3) FENNTARTOTT HELY. A járulék-jelzés aszinkron érkezik; hely nélkül a sor
 *       UGRÁL a gépelő kéz alatt (megjön → lelök, javítás → összeugrik → kiugrik).
 *       A hely-döntés CSAK szerkezeti tényezőkből jöhet, hálózati adatból SOHA.
 *
 *   (4) A JELZÉS NEM A 120 px-ES OSZLOPBAN. A fájl leghosszabb szövege ült a
 *       legszűkebb cellában — ez volt a sor-magasság fele.
 *
 *   (5) VESSZŐS AZONOSÍTÓ-SOR, `truncate` NÉLKÜL (épp a házszám vágódott le).
 *
 *   (6) A HÁROM GOMB EGY FORRÁSBÓL. Eddig három külön blokkban éltek, más
 *       sorrenddel és más súgóval — a repó visszatérő hibaosztálya, hogy „a
 *       második felület a régi implementációt őrzi".
 *
 *   (7) A KÉT PÁRHUZAMOS DOM-FA NEM HÚZHAT SZÉT. Asztali táblázat ⇄ mobil
 *       kártya: a fél migráció nem látszik a CI-n, csak a lelkésznél.
 *
 *   (8) A „MÁR KIFIZETTE" JELZÉS HANGOS MARAD. Ez a DUPLA FIZETÉS elleni őr;
 *       a halkítása nem stílus-kérdés.
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): minden őrhöz
 * visszajátsszuk a hibás világot, és bizonyítjuk, hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-kassza-sor-suritese.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const BODY = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'CombinedEntryBody.tsx')

let failed = false
const ok = (m) => console.log(`OK:   ${m}`)
const fail = (m) => { failed = true; console.error(`HIBA: ${m}`) }

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

if (!fs.existsSync(BODY)) { fail('hiányzó fájl: CombinedEntryBody.tsx'); process.exit(1) }
const nyers = olvas(BODY)
const kod = kodCsak(nyers)

/** Függvényhatáros ablak — a fix slice(i, i+N) átlógna a szomszéd függvénybe. */
function ablak(forras, kezdoJelzo, vegJelzo) {
  const k = kodCsak(forras)
  const i = k.indexOf(kezdoJelzo)
  if (i < 0) return ''
  const j = k.indexOf(vegJelzo, i + kezdoJelzo.length)
  return j < 0 ? k.slice(i) : k.slice(i, j)
}

// ── (1) TIPOGRÁFIAI PADLÓ ────────────────────────────────────────────────
const MERET = /text-\[(?:9\.5|10|10\.5|11)px\]/
{
  const sorMagassagNelkul = (forras) =>
    forras.split('\n').filter((l) => MERET.test(l) && !/leading-/.test(l))
  const hianyzik = sorMagassagNelkul(kod)
  if (hianyzik.length === 0) {
    const db = (kod.match(new RegExp(MERET.source, 'g')) || []).length
    ok(`(1) mind a ${db} kis-szöveg osztály explicit sormagasságot kap`)
  } else {
    fail(`(1) ${hianyzik.length} kis-szöveg osztály sormagasság NÉLKÜL — a táblázat 20 px-es sorát örökli: ${hianyzik[0].trim().slice(0, 70)}`)
  }
  // NEGATÍV: egyetlen leading- eltávolítása bukjon.
  const mutans = kodCsak(nyers.replace(' leading-[1.15]', ''))
  if (sorMagassagNelkul(mutans).length > 0) ok('NEGATÍV — egyetlen hiányzó sormagasságot is elkap az őr')
  else fail('NEGATÍV — az őr VAK: a sormagasság eltávolítása átmenne')
}

// ── (2) A 160→30 REJTÉLY ŐRE ─────────────────────────────────────────────
{
  const w = ablak(nyers, 'function renderJarulekHint(', 'function renderJarulekHintKompakt(')
  if (!w) {
    fail('(2) a renderJarulekHint törzse nem található')
  } else {
    const KULCS = 'erre az évre már fizetett {formatRon(h.paid)}'
    const talalatSorok = w.split('\n').filter((l) => l.includes(KULCS))
    if (talalatSorok.length === 0) {
      fail('(2) ELTŰNT a „maradék — erre az évre már fizetett …" mondatrész — ez a 160→30 rejtély visszahozása')
    } else if (talalatSorok.every((l) => /title=/.test(l))) {
      fail('(2) a mondatrész CSAK a title-ben van — a képernyőn megint indoklás nélkül látszana más díj')
    } else {
      ok('(2) a „már fizetett" mondatrész a KÉPERNYŐRE renderelt szövegben van')
    }
    if (/formatRon\(h\.expected\)/.test(w)) ok('(2) az ÉVES DÍJ is látszik mellette (a maradék viszonyítási pontja)')
    else fail('(2) az éves díj nem szerepel — a „maradék" önmagában értelmezhetetlen')
  }
  // NEGATÍV-B (a legfontosabb mutáns): a törzs lecserélése a KOMPAKT változatra,
  // ami csak „✓ maradék"-ot ír, a számpárt pedig visszateszi a title-be.
  // ⚠️ GLOBÁLIS csere: a mondatrész KÉT ágban is szerepel (ajánlott = beírt, és
  // eltérő összeg). Részleges cserével a mutáns túlélne, és az őr vaknak látszana.
  const mutans = nyers.split('erre az évre már fizetett {formatRon(h.paid)}').join('✓ maradék')
  const wm = ablak(mutans, 'function renderJarulekHint(', 'function renderJarulekHintKompakt(')
  if (!wm.includes('erre az évre már fizetett {formatRon(h.paid)}')) {
    ok('NEGATÍV — a kompakt (title-be rejtő) változatra cserélést az őr elkapná')
  } else {
    fail('NEGATÍV — az őr VAK: a title-be rejtő változat átmenne')
  }
}

// ── (3) FENNTARTOTT HELY ─────────────────────────────────────────────────
{
  const w = ablak(nyers, 'function jarulekSlotVarhato(', 'function renderJarulekSlot(')
  if (!w) {
    fail('(3) nincs `jarulekSlotVarhato` predikátum — a sor ugrálna a jelzés megérkezésekor')
  } else {
    if (/jarulekHints/.test(w)) {
      fail('(3) a hely-döntés HÁLÓZATI adatból (jarulekHints) jön — így maga a hely ugrálna')
    } else {
      ok('(3) a hely-döntés CSAK szerkezeti tényezőkből jön (nem hálózati adatból)')
    }
  }
  const ws = ablak(nyers, 'function renderJarulekSlot(', 'function rovidSzabaly(')
  if (/min-h-\[/.test(ws)) ok('(3) a slot fix minimum-magasságot tart fenn')
  else fail('(3) a slotnak nincs fenntartott magassága — a sor ugrik, amikor a jelzés megérkezik')
  // NEGATÍV: min-h-0 mutáns.
  const mutans = kodCsak(nyers.replace('min-h-[1.65rem]', 'min-h-0'))
  const wm = mutans.indexOf('function renderJarulekSlot(') >= 0
    ? mutans.slice(mutans.indexOf('function renderJarulekSlot('), mutans.indexOf('function rovidSzabaly('))
    : ''
  if (!/min-h-\[/.test(wm)) ok('NEGATÍV — a fenntartott magasság kivételét az őr elkapná')
  else fail('NEGATÍV — az őr VAK a fenntartott magasság kivételére')
}

// ── (4) A JELZÉS NEM A 120 px-ES OSZLOPBAN ───────────────────────────────
{
  if (/renderJarulekHint\(r, r\.people!\[0\], 0\)/.test(kod)) {
    fail('(4) a járulék-jelzés VISSZAKERÜLT a szűk Összeg-cellába — ott 4-6 sorra tördelődik')
  } else {
    ok('(4) a járulék-jelzés nem a szűk Összeg-cellában van')
  }
  const def = (kod.match(/renderPayerHintSlot\?:/g) || []).length
  const hasznalat = (kod.match(/renderPayerHintSlot/g) || []).length
  if (def === 1 && hasznalat >= 4) ok(`(4) a slot-prop 1 típusdefinícióval és ${hasznalat - 1} felhasználással él`)
  else fail(`(4) a slot-prop bekötése hiányos (definíció: ${def}, előfordulás: ${hasznalat})`)
}

// ── (5) VESSZŐS AZONOSÍTÓ-SOR ────────────────────────────────────────────
{
  const w = ablak(nyers, 'function payerMetaParts(', 'function renderPayerMeta(')
  if (/join\(', '\)/.test(w)) ok('(5) a cím darabjait VESSZŐ köti össze')
  else fail("(5) a cím nem vesszővel áll össze (Endre kifejezetten vesszőt kért)")
  if (/\.split\(/.test(w)) ok('(5) a három különböző forrás-alak normalizálva van')
  else fail('(5) nincs normalizálás — a web és a desktop más elválasztót ad')
  // A `payerInfoText` NEVE megmarad: a kassza-mátrix őre erre asszertál, és ha
  // csak MELLÉ tennénk egy újat, az az őr némán vakká válna.
  if (/function payerInfoText\(/.test(kod) && /payerInfoText\(/.test(kod)) {
    ok('(5) a payerInfoText megmaradt és hívva van (a mátrix-őr becsületes marad)')
  } else fail('(5) a payerInfoText eltűnt — a kassza-mátrix őre némán vakká válna')
  const wm = ablak(nyers, 'function renderPayerMeta(', 'function ')
  if (/truncate/.test(wm)) fail('(5) visszatért a `truncate` — épp a HÁZSZÁM vágódik le tőle')
  else ok('(5) az azonosító-sor nincs csonkolva (a házszám is látszik)')
  // NEGATÍV: pont-elválasztóra visszaírás bukjon.
  // ⚠️ A `.join(', ')` a fájlban több helyen szerepel (nevek, toast), ezért a
  // mutánst CSAK a vizsgált ablakon belül játsszuk vissza — különben egy távoli,
  // ártatlan előfordulás cserélődne, és az őr vaknak látszana.
  const wEredeti = ablak(nyers, 'function payerMetaParts(', 'function renderPayerMeta(')
  const wmut = wEredeti.split(".join(', ')").join(".join(' · ')")
  if (!/join\(', '\)/.test(wmut)) ok('NEGATÍV — a pont-elválasztóra visszaírást az őr elkapná')
  else fail('NEGATÍV — az őr VAK az elválasztó visszaírására')
}

// ── (6) A HÁROM GOMB EGY FORRÁSBÓL ───────────────────────────────────────
{
  const def = (kod.match(/function renderPayerActions\(/g) || []).length
  const hiv = (kod.match(/\{renderPayerActions\(\)\}/g) || []).length
  if (def === 1) ok('(6) PONTOSAN egy `renderPayerActions` definíció')
  else fail(`(6) ${def} definíció (1 kell) — a három ág újra széthúzhat`)
  if (hiv === 3) ok('(6) mind a HÁROM ág ugyanabból a forrásból építi a gombokat')
  else fail(`(6) ${hiv} hívás (3 kell: 0/1-fizetős, többfizetős, mátrix)`)
  // A gomb-felirat CSAK a segédben élhet — másolt példány = széthúzás.
  const feliratDb = (kod.match(/> Még egy befizető/g) || []).length
  if (feliratDb === 1) ok('(6) a gomb-felirat egyetlen példányban él (nincs másolat)')
  else fail(`(6) a „Még egy befizető" felirat ${feliratDb} példányban van — másolt gombok`)
  // NEGATÍV: egy hívás törlése bukjon.
  const mutans = kodCsak(nyers.replace('{renderPayerActions()}', ''))
  if ((mutans.match(/\{renderPayerActions\(\)\}/g) || []).length !== 3) {
    ok('NEGATÍV — egy hiányzó hívást az őr elkapna')
  } else fail('NEGATÍV — az őr VAK egy hiányzó hívásra')
}

// ── (7) A KÉT PÁRHUZAMOS DOM-FA PROPJAI EGYEZNEK ─────────────────────────
{
  const propNevek = (forras) => {
    const ki = []
    let i = 0
    for (;;) {
      const k = forras.indexOf('<PartnerCell', i)
      if (k < 0) break
      const v = forras.indexOf('/>', k)
      const blokk = v < 0 ? forras.slice(k) : forras.slice(k, v)
      const nevek = new Set()
      for (const m of blokk.matchAll(/\n\s*([a-zA-Z][a-zA-Z0-9]*)=/g)) nevek.add(m[1])
      ki.push(nevek)
      i = v < 0 ? forras.length : v + 2
    }
    return ki
  }
  const halmazok = propNevek(kod)
  if (halmazok.length !== 2) {
    fail(`(7) ${halmazok.length} PartnerCell hívást találtam (2 kell: asztali + mobil)`)
  } else {
    const [a, b] = halmazok
    const csakA = [...a].filter((x) => !b.has(x))
    const csakB = [...b].filter((x) => !a.has(x))
    if (csakA.length === 0 && csakB.length === 0) {
      ok(`(7) az asztali és a mobil PartnerCell UGYANAZT a ${a.size} propot kapja`)
    } else {
      fail(`(7) a két DOM-fa SZÉTHÚZ — csak az asztaliban: [${csakA}], csak a mobilban: [${csakB}]`)
    }
    // NEGATÍV: egy prop törlése az egyik példányból bukjon.
    const mutans = kodCsak(nyers.replace('renderPayerHintSlot={renderJarulekSlot}', ''))
    const mh = propNevek(mutans)
    if (mh.length === 2 && [...mh[0]].filter((x) => !mh[1].has(x)).length + [...mh[1]].filter((x) => !mh[0].has(x)).length > 0) {
      ok('NEGATÍV — a fél migrációt (egyik fából hiányzó prop) az őr elkapná')
    } else {
      fail('NEGATÍV — az őr VAK a fél migrációra')
    }
  }
}

// ── (8) A „MÁR KIFIZETTE" HANGOS MARAD ───────────────────────────────────
{
  const w = ablak(nyers, 'function renderJarulekHint(', 'function renderJarulekHintKompakt(')
  const i = w.indexOf('évi járulékot MÁR KIFIZETTE')
  if (i < 0) {
    fail('(8) eltűnt a „MÁR KIFIZETTE" jelzés — ez a DUPLA FIZETÉS elleni őr')
  } else {
    const kornyek = w.slice(Math.max(0, i - 900), i)
    const kell = ['bg-amber-50', 'border-amber-300', 'font-semibold']
    const hianyzik = kell.filter((c) => !kornyek.includes(c))
    if (hianyzik.length === 0) {
      ok('(8) a „MÁR KIFIZETTE" jelzés kitöltött és félkövér (nem halkult el)')
    } else {
      fail(`(8) a „MÁR KIFIZETTE" jelzés elhalkult (hiányzik: ${hianyzik.join(', ')}) — este, fáradt szemnek a halvány szöveg nem létezik`)
    }
  }
  // NEGATÍV: a kitöltés eltávolítása bukjon.
  const mutans = ablak(nyers.replace('border-amber-300 bg-amber-50', ''), 'function renderJarulekHint(', 'function renderJarulekHintKompakt(')
  const im = mutans.indexOf('évi járulékot MÁR KIFIZETTE')
  if (im >= 0 && !mutans.slice(Math.max(0, im - 900), im).includes('bg-amber-50')) {
    ok('NEGATÍV — a halkítást az őr elkapná')
  } else fail('NEGATÍV — az őr VAK a halkításra')
}

if (failed) { console.error('\nA sor-sűrítés önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nA sor-sűrítés önellenőrzés rendben.')
