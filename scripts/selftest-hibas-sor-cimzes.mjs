#!/usr/bin/env node
/**
 * HIBÁS SOR CÍMZÉSE + BELSŐ MOZGÁS RENDEZÉSE önellenőrzés (2026-09-01)
 *
 * KÉT PROBLÉMA, EGY KÖR (Endre kérése):
 *
 * (A) A hibaüzenet ROSSZ SORSZÁMRA hivatkozott. A mentés hibája így hangzott:
 *     „3. bevétel-sor: …" — csakhogy ez a SZERVERRE KÜLDÖTT köteg indexe, ami
 *     (1) DÁTUM szerint át van rendezve, és (2) befizetőnként SZÉT VAN BONTVA
 *     (egy két befizetős nyugta KÉT köteg-tétel). A felhasználó a képernyőn
 *     SOHA nem lát ilyen sorszámot — több száz soros rögzítésnél gyakorlatilag
 *     lehetetlen volt megtalálni, melyik sort kell javítani.
 *     JAVÍTÁS: a mentő-visszahívások a `failedIndex`-et adják vissza (előtag
 *     NÉLKÜLI üzenettel), a rögzítő pedig a köteg-tétel `sourceRowId`-ján át
 *     megtalálja a VALÓDI űrlapsort, arra hivatkozik (sorszám a saját fülén +
 *     dátum + név + összeg + iratszám), MEGJELÖLI pirosan és KÉPRE GÖRGETI.
 *
 * (B) A BELSŐ MOZGÁS sorok nem voltak dátum szerint rendezve — egyedül ezek
 *     maradtak ki —, miközben a siker-üzenet „dátum szerint rendezve"-t állít.
 *
 * MIT ŐRIZ:
 *  (1) a belső mozgások is dátum szerint rendeződnek, a két köteggel egy helyen;
 *  (2) a WEB szerver-akciók a hiba mellé a köteg-INDEXET adják vissza, és NEM
 *      égetik többé az üzenetbe a „N. sor:" előtagot;
 *  (3) a DESKTOP batch-kezelők ugyanígy (a `savedRowIds` mellett `failedIndex`);
 *  (4) a rögzítő az indexből a `sourceRowId`-n át keresi meg a sort — NEM
 *      index-alapon hivatkozik (a köteg rendezett és szétbontott);
 *  (5) a címke a KÉPERNYŐN LÁTHATÓ adatokból épül (incomeRows/expenseRows);
 *  (6) a hibás sort megjelöli (`jelolHibasSort`) mindhárom fázis hiba-ága;
 *  (7) FAIL-SAFE: ha az index hiányzik vagy nem képezhető sorra, az üzenet
 *      akkor is értelmes előtagot kap (nem kezdődik a semmiből);
 *  (8) a jelölés TÖRLŐDIK, amint a sorhoz hozzányúlnak, és minden új mentésnél;
 *  (9) a sorok `data-row-id`-t viselnek — enélkül a képre görgetés nem találná meg.
 *
 * NEGATÍV ASSZERT: a régi/elrontott világot visszajátszó mutánsok (H1–H8).
 *
 * Futtatás:  node scripts/selftest-hibas-sor-cimzes.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const BODY = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'CombinedEntryBody.tsx')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')
const DESKTOP = path.join(REPO, 'apps', 'desktop', 'src', 'components', 'combined-entry-dialog.tsx')
const WEBDLG = path.join(REPO, 'apps', 'web', 'components', 'modals', 'combined-entry-dialog.tsx')

let fail = 0
let ok = 0
function pass(msg) { ok++; console.log(`OK:   ${msg}`) }
function bukik(msg) { fail++; console.error(`HIBA: ${msg}`) }

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Függvényhatáros ablak — a fix hosszú ablak átlóg a szomszédba és vakítja a mutánst. */
function ablak(src, jelzo, vegJelzok) {
  const start = src.indexOf(jelzo)
  if (start < 0) return null
  let end = src.length
  for (const v of vegJelzok) {
    const i = src.indexOf(v, start + jelzo.length)
    if (i >= 0 && i < end) end = i
  }
  return src.slice(start, end)
}

function asszertek(files, jelent) {
  let helyi = 0
  const hiba = (msg) => { helyi++; if (jelent) bukik(msg) }
  const jo = (msg) => { if (jelent) pass(msg) }

  const body = stripComments(files.get(BODY))
  const act = stripComments(files.get(ACTIONS))
  const desk = stripComments(files.get(DESKTOP))
  const dlg = stripComments(files.get(WEBDLG))

  const mentes = ablak(body, 'async function handleSaveInner', ['\n  const dateInvalid'])
  if (!mentes) {
    hiba('nem található a handleSaveInner — az őr vak')
    return helyi
  }

  // ── (1) a belső mozgások is dátum szerint ─────────────────────────────
  if (/transfers\.sort\(\(a, b\) => a\.payload\.datum\.localeCompare\(b\.payload\.datum\)\)/.test(mentes)) {
    jo('belső mozgás: dátum szerint rendezve (a siker-üzenet „dátum szerint rendezve" immár rájuk is igaz)')
  } else {
    hiba('a belső mozgás sorok NINCSENEK dátum szerint rendezve — miközben a siker-üzenet ezt állítja')
  }
  // A rendezésnek EGY helyen, a köteg-rendezésekkel együtt kell állnia (a mentés előtt).
  const rendezesek = (mentes.match(/\.sort\(\(a, b\) =>/g) || []).length
  if (rendezesek >= 3) {
    jo(`mentés: mind a ${rendezesek} kimenő lista rendezve (bevétel, kiadás, belső mozgás)`)
  } else {
    hiba(`a mentésben csak ${rendezesek} rendezés van — valamelyik kimenő lista rendezetlenül megy ki`)
  }

  // ── (2) WEB szerver-akciók: failedIndex + NINCS „N. sor:" előtag ──────
  for (const [jelzo, veg, nev] of [
    ['export async function saveIncomeBatch', '\nexport async function saveExpenseBatch', 'bevétel-köteg'],
    // ⚠️ A vég-jelző NEM lehet komment (`\n/**`): a stripComments kitörli, és az ablak
    //    a fájl VÉGÉIG lógna át — több tucat idegen függvényre, ami vakká teszi a mérést.
    ['export async function saveExpenseBatch', '\nexport async function ellenorizMentesElore', 'kiadás-köteg'],
  ]) {
    const teljes = ablak(act, jelzo, [veg])
    if (!teljes) { hiba(`nem található a szerver ${nev}`); continue }
    // ⚠️ CSAK a SOR-CIKLUSON BELÜLI hiba-ágakat mérjük: a ciklus előtti visszatérések
    //    (nincs bejelentkezve, írási kapu, zod-séma, év-zár) NEM egyetlen sorra
    //    vonatkoznak — azoknak helyesen nincs köteg-indexük.
    const a = ablak(teljes, 'for (let index = 0;', ["revalidatePath('/penzugy')"])
    if (!a) { hiba(`nem található a szerver ${nev} sor-ciklusa (fail-closed)`); continue }
    // ⚠️ DARABSZÁM-alapú mérés: a sor-cikluson belül MINDEN `return {` hiba-ág (a
    //    sikeres sor `continue`-val vagy átfolyással megy tovább). Szövegdarabot NEM
    //    vágunk: a nem-mohó `}` a template-literál `${result.error}` kapcsos zárójelénél
    //    elvágná a return-t, és a failedIndex-et akkor sem látná, ha ott van.
    const sorHibaDb = (a.match(/return \{/g) || []).length
    const idxDb = (a.match(/failedIndex: index/g) || []).length
    if (sorHibaDb > 0 && idxDb >= sorHibaDb) {
      jo(`szerver ${nev}: mind a ${sorHibaDb} SOR-szintű hiba-ág visszaadja a köteg-indexet`)
    } else {
      hiba(`szerver ${nev}: ${sorHibaDb} sor-szintű hiba-ágból csak ${idxDb} adja vissza a failedIndex-et — a rögzítő nem tudná, MELYIK sort jelölje meg`)
    }
    if (/\$\{index \+ 1\}\. sor:/.test(teljes)) {
      hiba(`szerver ${nev}: még mindig az üzenetbe égeti a „N. sor:" előtagot — az a RENDEZETT, szétbontott köteg indexe, amit a felhasználó sehol nem lát`)
    } else {
      jo(`szerver ${nev}: nincs többé félrevezető „N. sor:" előtag az üzenetben`)
    }
  }

  // ── (3) DESKTOP batch-kezelők ────────────────────────────────────────
  for (const [jelzo, veg, nev] of [
    ['async function handleIncomeBatch', 'async function handleExpenseBatch', 'bevétel'],
    ['async function handleExpenseBatch', 'async function handlePreflight', 'kiadás'],
  ]) {
    const a = ablak(desk, jelzo, [veg])
    if (!a) { hiba(`nem található a desktop ${nev}-batch kezelője`); continue }
    // A ZÁRÓ `return { error: null, savedRowIds }` a SIKER-ág — annak nincs bukott tétele.
    const hibasSorok = (a.match(/return \{ error: .*$/gm) || []).filter((r) => !/error: null/.test(r))
    const hianyos = hibasSorok.filter((r) => !r.includes('failedIndex'))
    if (hibasSorok.length > 0 && hianyos.length === 0) {
      jo(`desktop ${nev}: mind a ${hibasSorok.length} hiba-ág megmondja, HÁNYADIK tételen bukott el`)
    } else {
      hiba(`desktop ${nev}: ${hianyos.length} hiba-ág nem adja vissza a failedIndex-et`)
    }
    if (/\$\{i \+ 1\}\. (bevétel|kiadás)-sor:/.test(a)) {
      hiba(`desktop ${nev}: még mindig a köteg-indexet írja az üzenetbe („N. ${nev}-sor:")`)
    } else {
      jo(`desktop ${nev}: nincs többé félrevezető köteg-index az üzenetben`)
    }
  }

  // ── (3b) az ELŐELLENŐRZÉS is a sorra mutasson (a leggyakoribb bukás-ok itt fut) ──
  const eloDesk = ablak(desk, 'async function handlePreflight', ['async function handleInternalTransfer'])
  if (!eloDesk) {
    hiba('nem található a desktop előellenőrzés')
  } else {
    const idxDb = (eloDesk.match(/failedIndex/g) || []).length
    const oldalDb = (eloDesk.match(/failedSide/g) || []).length
    if (idxDb >= 4 && oldalDb >= 4) {
      jo(`desktop előellenőrzés: a sor-szintű hibák megmondják, MELYIK oldal HÁNYADIK tétele (${idxDb}×)`)
    } else {
      hiba(`desktop előellenőrzés: csak ${idxDb} index / ${oldalDb} oldal-jelzés — a hiba nem lenne sorra köthető`)
    }
    if (/\$\{i \+ 1\}\. (bevétel|kiadás)-sor:/.test(eloDesk)) {
      hiba('a desktop előellenőrzés még mindig a köteg-indexet írja az üzenetbe')
    } else {
      jo('desktop előellenőrzés: nincs félrevezető köteg-index az üzenetben')
    }
  }
  const eloWeb = ablak(act, 'export async function ellenorizMentesElore', ['\nexport async function deleteTransaction'])
  if (!eloWeb) {
    hiba('nem található a web előellenőrzés (ellenorizMentesElore)')
  } else {
    const idxDb = (eloWeb.match(/failedIndex/g) || []).length
    const oldalDb = (eloWeb.match(/failedSide/g) || []).length
    if (idxDb >= 6 && oldalDb >= 6) {
      jo(`web előellenőrzés: a sor-szintű hibák megmondják, MELYIK oldal HÁNYADIK tétele (${idxDb}×)`)
    } else {
      hiba(`web előellenőrzés: csak ${idxDb} index / ${oldalDb} oldal-jelzés — a hiba nem lenne sorra köthető`)
    }
  }
  // A rögzítő az előellenőrzés hibáját is a látható sorra fordítja.
  const eloAg = ablak(mentes, 'const elo = await onPreflightCheck(', ['const kerdesek = ['])
  if (eloAg && eloAg.includes('jelolHibasSort(') && eloAg.includes('sorCimke(')) {
    jo('rögzítő: az ELŐELLENŐRZÉS hibája is a látható sorra mutat és megjelöli')
  } else {
    hiba('az előellenőrzés hibája nem mutat sorra — pedig a leggyakoribb bukás-ok ezen fut')
  }

  // ── (4) a rögzítő az indexből a sourceRowId-n át keres ───────────────
  const bukottFn = ablak(body, 'const bukottSorId = (', ['const sorCimke ='])
  if (bukottFn && bukottFn.includes('batch[failedIndex]') && bukottFn.includes('sourceRowId')) {
    jo('rögzítő: a köteg-indexből a sourceRowId-n át keresi meg a VALÓDI űrlapsort')
  } else {
    hiba('a rögzítő nem a sourceRowId-n át képezi le a hibát — index-alapú hivatkozás a rendezett, szétbontott kötegre értelmetlen')
  }

  // ── (5) a címke a KÉPERNYŐN LÁTHATÓ adatokból épül ───────────────────
  const cimkeFn = ablak(body, 'const sorCimke = (', ['const jelolHibasSort ='])
  if (!cimkeFn) {
    hiba('nincs sorCimke — a hibaüzenet nem tud a látható sorra hivatkozni')
  } else {
    const forras = cimkeFn.includes('incomeRows') && cimkeFn.includes('expenseRows')
    const idx = cimkeFn.includes('findIndex') && cimkeFn.includes('idx + 1')
    if (forras && idx) {
      jo('címke: a KÉPERNYŐN látható sorlistából épül (sorszám a saját fülén belül), nem a kötegből')
    } else {
      hiba('a címke nem a látható sorlistából épül — újra egy belső sorszámra hivatkoznánk')
    }
    // ⛔ ÖSSZEG: befizetős sornál az r.amount mező SZÁNDÉKOSAN üres (az érték a
    //    people[].osszeg-ben van) — a nyers mező olvasása a LEGGYAKORIBB esetből
    //    hagyná ki az összeget, pont ahol két azonos nevű/napi sort meg kell különböztetni.
    if (cimkeFn.includes('payerSum(r)')) {
      jo('címke: az összeg a KÉPERNYŐN látott értékből jön (befizetőknél a részösszegek összege)')
    } else {
      hiba('a címke a nyers r.amount-ot olvassa — befizetős sornál az összeg MINDIG kimaradna')
    }
    // ⛔ NÉV: befizetős sornál az r.partner csak az ÁRVA keresőpuffer (a mentés is
    //    tiltja fallbackként) — félig gépelt keresőszó kerülne az üzenetbe.
    if (/nevek\.length > 0 \? nevek\.join/.test(cimkeFn)) {
      jo('címke: a befizetők nevei előzik meg az árva keresőpuffert (a mentéssel azonos sorrend)')
    } else {
      hiba('a címke az árva keresőpuffert (r.partner) részesíti előnyben — félig gépelt szó kerülne az üzenetbe')
    }
  }

  // ── (6) mindhárom fázis hiba-ága megjelöli a sort ────────────────────
  const fazisok = [
    [ablak(mentes, 'const res = await onSaveIncomeBatch(', ['const res = await onSaveExpenseBatch(']), 'bevétel'],
    [ablak(mentes, 'const res = await onSaveExpenseBatch(', ['for (const t of transfers)']), 'kiadás'],
    [ablak(mentes, 'for (const t of transfers)', ['const parts = []']), 'belső mozgás'],
  ]
  for (const [a, nev] of fazisok) {
    if (!a) { hiba(`nem található a ${nev}-fázis`); continue }
    if (a.includes('jelolHibasSort(')) {
      jo(`${nev}-fázis: hibánál MEGJELÖLI a felelős sort a képernyőn`)
    } else {
      hiba(`${nev}-fázis: nem jelöli meg a hibás sort — a felhasználónak kézzel kell megkeresnie`)
    }
  }

  // ── (7) FAIL-SAFE előtag, ha az index nem képezhető sorra ────────────
  const fallbackDb = (mentes.match(/cimke \? .* : '(Bevétel|Kiadás|Belső mozgás): '/g) || []).length
  if (fallbackDb >= 3) {
    jo('fail-safe: ha a sor nem azonosítható, az üzenet akkor is értelmes előtagot kap (mind a 3 fázison)')
  } else {
    hiba(`csak ${fallbackDb} fázison van fail-safe előtag — azonosíthatatlan sornál az üzenet előtag nélkül indulna`)
  }

  // ── (8) a jelölés törlődik szerkesztéskor és új mentésnél ────────────
  // ⛔ A jelölésnek TARTALOM-alapon kell oldódnia, NEM egyetlen mutátorhoz kötve: a sort
  //    tíz különböző függvény írja (befizető-almenü, mátrix), és a nagy részük megkerüli
  //    az updateRow-t — egyetlen kifelejtett mutátornál a javított sor pirosan ragadna.
  if (body.includes('sorUjjlenyomat(r) !== hibasSor.ujjlenyomat')) {
    jo('a piros jelölés TARTALOM-alapon oldódik — bármelyik mutátoron át javít a felhasználó')
  } else {
    hiba('a jelölés törlése nincs tartalomhoz kötve — a befizető-almenüs/mátrixos javítás után pirosan ragadna')
  }
  if (body.includes('const r = lista.find((x) => x.id === hibasSor.id)') && /if \(!r \|\| sorUjjlenyomat/.test(body)) {
    jo('a jelölés a sor TÖRLÉSEKOR is eltűnik (nem mutat nem létező sorra)')
  } else {
    hiba('a törölt sorra mutató jelölés bent ragadna')
  }
  // A címke-sorszám és a képernyő számozása NE tudjon széthúzni: a jelöléskor
  // feloldjuk az „elmentett sorok elrejtése" szűrőt, így a teljes lista látszik.
  const jelolFn = ablak(body, 'const jelolHibasSort = (', ['const jelolMentettnek ='])
  if (jelolFn && jelolFn.includes('setMentettekRejtve(false)')) {
    jo('jelöléskor a szűrt nézet feloldódik — a címke sorszáma megegyezik a képernyőn látottal')
  } else {
    hiba('a címke a TELJES listából számoz, a képernyő a szűrtből — a sorszám eltérne (pont amit javítani akartunk)')
  }
  if (mentes.indexOf('setHibasSor(null)') >= 0 && mentes.indexOf('setHibasSor(null)') < mentes.indexOf('const transfers')) {
    jo('minden ÚJ mentés-kísérlet nullázza a korábbi hibás-sor jelölést')
  } else {
    hiba('az új mentés nem nullázza a korábbi jelölést — két hiba jelölése összekeveredne')
  }

  // ── (9) a sorok azonosíthatók a DOM-ban (képre görgetés) ────────────
  const domDb = (body.match(/data-row-id=\{r\.id\}/g) || []).length
  if (domDb >= 2) {
    jo(`a hibás sor képre görgethető: mind a ${domDb} nézet (táblázat + kártya) jelöli a sorokat data-row-id-vel`)
  } else {
    hiba(`csak ${domDb} nézet visel data-row-id-t — a képre görgetés az egyik nézetben néma maradna`)
  }
  if (body.includes("querySelectorAll<HTMLElement>('[data-row-id]')") && body.includes('scrollIntoView')) {
    jo('a megjelölt sor KÉPRE GÖRGET (több száz soros rögzítésnél a puszta szín nem elég)')
  } else {
    hiba('nincs képre görgetés — a megjelölt sor a képernyőn kívül maradhat')
  }
  // A táblázat- ÉS a kártya-nézet IS a DOM-ban van (csak CSS rejti az egyiket):
  // a rejtett elemre a görgetés NÉMA, ezért a láthatót kell választani.
  if (/offsetParent !== null/.test(body)) {
    jo('görgetés: a LÁTHATÓ nézet elemét választja (a rejtett táblázatra/kártyára a görgetés néma lenne)')
  } else {
    hiba('a görgetés a DOM ELSŐ találatát veszi — telefonon a rejtett táblázat-sorra futna, és semmi nem történne')
  }

  // ── (9b) a jelölés LÁTSZIK is: az állapot beállása önmagában semmit nem mutat ──
  const jelolesDb = (body.match(/hibasSor\?\.id === r\.id/g) || []).length
  if (jelolesDb >= 4) {
    jo(`a jelölés MEGJELENIK: mindkét nézet külön festi és jelvényezi a sort (${jelolesDb} felhasználás)`)
  } else {
    hiba(`a hibás sor jelölése csak ${jelolesDb} helyen jelenik meg — a felhasználó nem látna semmit`)
  }
  if (body.includes('itt akadt el')) {
    jo('a hibás sor beszédes jelvényt kap („itt akadt el")')
  } else {
    hiba('nincs látható jelvény a hibás soron — csak a háttérszín különböztetné meg')
  }

  // ── (10) a web-dialógus továbbadja az indexet ────────────────────────
  // ⚠️ ABLAKONKÉNT mérünk: a puszta darabszám MÁS előfordulásokat is beszámítana
  //    (pl. az előellenőrzés átadását), és mindkét köteg-átadás törölhető lenne úgy,
  //    hogy az őr zöld marad.
  for (const [jelzo, veg, nev] of [
    ['onSaveIncomeBatch={', 'onSaveExpenseBatch={', 'bevétel-köteg'],
    ['onSaveExpenseBatch={', 'onPreflightCheck={', 'kiadás-köteg'],
    ['onPreflightCheck={', 'onSaveInternalTransfer={', 'előellenőrzés'],
  ]) {
    const a = ablak(dlg, jelzo, [veg])
    if (!a) { hiba(`web-dialógus: nem található a(z) ${nev} bekötése`); continue }
    if (a.includes('failedIndex')) {
      jo(`web-dialógus: a(z) ${nev} továbbadja a köteg-indexet a rögzítőnek`)
    } else {
      hiba(`web-dialógus: a(z) ${nev} NEM adja tovább a failedIndex-et — a weben ott nem lenne sor-jelölés`)
    }
  }
  const eloOldal = ablak(dlg, 'onPreflightCheck={', ['onSaveInternalTransfer={'])
  if (eloOldal && eloOldal.includes('failedSide')) {
    jo('web-dialógus: az előellenőrzés azt is megmondja, MELYIK köteget indexeli (failedSide)')
  } else {
    hiba('az előellenőrzés indexe oldal nélkül kétértelmű — a rögzítő rossz fülön keresné a sort')
  }

  return helyi
}

function beolvas() {
  const m = new Map()
  for (const fp of [BODY, ACTIONS, DESKTOP, WEBDLG]) m.set(fp, fs.readFileSync(fp, 'utf8'))
  return m
}

const files = beolvas()
console.log('— Pozitív asszertek —')
asszertek(files, true)

console.log('— Mutánsok (a régi/elrontott világ visszajátszása) —')
const mutansok = [
  {
    nev: 'H1: a belső mozgás rendezésének kivétele (a RÉGI viselkedés)',
    fajl: BODY,
    alkalmaz: (s) => {
      const sor = '    transfers.sort((a, b) => a.payload.datum.localeCompare(b.payload.datum))\n'
      return s.includes(sor) ? s.replace(sor, '') : null
    },
  },
  {
    nev: 'H2: a szerver nem adja vissza a köteg-indexet',
    fajl: ACTIONS,
    alkalmaz: (s) => (s.includes(', failedIndex: index') ? s.replaceAll(', failedIndex: index', '') : null),
  },
  {
    nev: 'H3: a desktop nem adja vissza a köteg-indexet',
    fajl: DESKTOP,
    alkalmaz: (s) => (s.includes(', failedIndex: i }') ? s.replaceAll(', failedIndex: i }', ' }') : null),
  },
  {
    nev: 'H4: a szerver visszaírja a félrevezető „N. sor:" előtagot (dupla sorszámozás)',
    fajl: ACTIONS,
    alkalmaz: (s) => (s.includes('return { error: `${result.error}${vissza}`, failedIndex: index }')
      ? s.replaceAll(
          'return { error: `${result.error}${vissza}`, failedIndex: index }',
          'return { error: `${index + 1}. sor: ${result.error}${vissza}`, failedIndex: index }',
        )
      : null),
  },
  {
    nev: 'H5: a hibás sor megjelölésének kivétele — a felhasználó újra keresgélhet',
    fajl: BODY,
    alkalmaz: (s) => (s.includes('jelolHibasSort(') ? s.replaceAll('jelolHibasSort(', 'nincsJeloles(') : null),
  },
  {
    nev: 'H6: a címke a KÖTEGBŐL épül a látható sorlista helyett (a régi, félrevezető sorszám)',
    fajl: BODY,
    alkalmaz: (s) => {
      const a = ablak(s, '    const sorCimke = (', ['    const jelolHibasSort ='])
      if (!a || !a.includes('findIndex')) return null
      return s.replace(a, a.replace('findIndex', 'nincsKereses'))
    },
  },
  {
    nev: 'H9: a görgetés a rejtett nézet elemét is elfogadja (telefonon néma marad)',
    fajl: BODY,
    alkalmaz: (s) => (s.includes('jeloltek.find((el) => el.offsetParent !== null) ?? jeloltek[0]')
      ? s.replace('jeloltek.find((el) => el.offsetParent !== null) ?? jeloltek[0]', 'jeloltek[0]')
      : null),
  },
  {
    nev: 'H7: a data-row-id elhagyása — a megjelölt sor nem görgethető képre',
    fajl: BODY,
    alkalmaz: (s) => (s.includes('data-row-id={r.id}') ? s.replaceAll('data-row-id={r.id}', 'data-nincs-id={r.id}') : null),
  },
  {
    nev: 'H8: a jelölés nem törlődik szerkesztéskor — a javított sor is pirosan marad',
    fajl: BODY,
    alkalmaz: (s) => (s.includes('sorUjjlenyomat(r) !== hibasSor.ujjlenyomat')
      ? s.replace('if (!r || sorUjjlenyomat(r) !== hibasSor.ujjlenyomat) setHibasSor(null)', 'if (!r) setHibasSor(null)')
      : null),
  },
  {
    nev: 'H10: a jelöléskor bent marad a szűrt nézet — a címke sorszáma eltér a képernyőtől',
    fajl: BODY,
    alkalmaz: (s) => {
      const sor = '      setMentettekRejtve(false)\n'
      return s.includes(sor) ? s.replace(sor, '') : null
    },
  },
  {
    nev: 'H11: az előellenőrzés hibája nem mutat sorra (a régi, sor nélküli üzenet)',
    fajl: BODY,
    alkalmaz: (s) => {
      const a = ablak(s, '    if (onPreflightCheck &&', ['    if (onCheckSimilarEntries'])
      if (!a || !a.includes('jelolHibasSort(')) return null
      return s.replace(a, a.replace('if (oldal) jelolHibasSort(oldal, bukott)', 'void bukott'))
    },
  },
  {
    nev: 'H12: a címke a nyers r.amount-ot olvassa — befizetős sornál MINDIG összeg nélkül',
    fajl: BODY,
    alkalmaz: (s) => (s.includes('? payerSum(r)\n        : Number(r.amount)')
      ? s.replace('? payerSum(r)\n        : Number(r.amount)', '? Number(r.amount)\n        : Number(r.amount)')
      : null),
  },
]

for (const m of mutansok) {
  const mm = beolvas()
  const eredeti = mm.get(m.fajl)
  const mutalt = m.alkalmaz(eredeti)
  if (mutalt == null || mutalt === eredeti) {
    bukik(`${m.nev} — a mutáns nem alkalmazható (vak minta?)`)
    continue
  }
  mm.set(m.fajl, mutalt)
  const hibak = asszertek(mm, false)
  if (hibak > 0) pass(`${m.nev} — az őr elkapja (${hibak} asszert bukik)`)
  else bukik(`${m.nev} — az őr VAK erre a mutánsra!`)
}

console.log('')
if (fail > 0) {
  console.error(`${fail} hiba, ${ok} rendben — a hibás-sor címzés őr BUKIK`)
  process.exit(1)
}
console.log(`${ok}/${ok} rendben — hibás sor címzése + belső mozgás rendezése őr zöld`)
