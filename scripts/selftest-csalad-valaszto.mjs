#!/usr/bin/env node
/**
 * CSALÁD-VÁLASZTÓ önellenőrzés (2026-09-04)
 *
 * ELŐZMÉNY — Endre észrevétele: a személyi karton „Családhoz rendelés"
 * dialógusában a találat CSAK ennyit mutatott:
 *
 *     Csoma család
 *     Vasút 189 · 0 gyermek
 *
 * Három „Csoma család" mellett ebből NEM derül ki, kiket választ a lelkész.
 * A rossz családhoz rendelés pedig a `csalad`, `gyerek`, `haztartas`,
 * `haztartas_tag` és `szemely_kapcsolat` sorokat is mozgatja, áthelyezésnél
 * ráadásul a KORÁBBI tagságot lezárja — nem egy gombnyom visszacsinálni.
 *
 * Hat védelem, amit ez az őr fog:
 *
 *   (1) A találat viszi a felnőtt tagok TELJES NEVÉT (a régi lekérdezés csak
 *       `id_ferfi`/`id_no`-t hozott, a `loadFamilyDisplayNames` pedig CSAK
 *       `csaladnev`-et — innen a több egyforma „Csoma család").
 *   (2) A gyermekek NEVE is jön, és a darabszám a személyi kartonnal AZONOS
 *       forrásból (`haztartas_tag`, gyermek+unoka) UNIÓBAN a legacy `gyerek`
 *       táblával — különben a sor „0 gyermek"-et állíthat egy gyerekes
 *       családról, és a lelkész épp a JÓ családot zárja ki.
 *   (3) A keresés a GYERMEK nevére is talál — enélkül a lelkész azt hiszi,
 *       nincs ilyen család, és ÚJAT hoz létre (a duplikátumok gyökéroka).
 *   (4) Fail-safe minimál újrapróbálkozás minden bővített lekérdezésen: a
 *       kényelmi mező a select-ben néma ÜRES listát okozhat, ami
 *       megkülönböztethetetlen attól, hogy tényleg nincs találat.
 *   (5) Fail-closed hatókör: ha a háztartás-lekérdezés hibázik, ÜRES listát
 *       adunk — idegen gyülekezet családja nem csúszhat ki.
 *   (6) A levágás LÁTHATÓ (teljes találatszám + determinisztikus `.order`),
 *       és a visszafordíthatatlan lépés előtt a felület MEGNEVEZI a
 *       kiválasztott családot a tagjaival együtt.
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): a szöveg-építő
 * modult VALÓDIAN LEFUTTATJUK (izolált transpile — a bevált ubl-parser minta),
 * a szerver/UI-oldali szerkezetre pedig mutánsokat játszunk vissza.
 *
 * Futtatás:  node scripts/selftest-csalad-valaszto.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const MODUL = path.join(REPO, 'apps', 'web', 'lib', 'family', 'csalad-kereses.ts')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'tagnyilvantartas', 'family-actions.ts')
const DIALOG = path.join(REPO, 'apps', 'web', 'components', 'modals', 'family-assign-dialog.tsx')

let failed = false
const ok = (m) => console.log(`OK:   ${m}`)
const fail = (m) => { failed = true; console.error(`HIBA: ${m}`) }

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const f of [MODUL, ACTIONS, DIALOG]) {
  if (!fs.existsSync(f)) fail(`hiányzó fájl: ${path.relative(REPO, f)}`)
}
if (failed) { console.error('\nA család-választó önellenőrzés ELBUKOTT.'); process.exit(1) }

// ── (A) A SZÖVEG-ÉPÍTŐ MODUL VALÓDI LEFUTTATÁSA ──────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csalad-kereses-'))
let mod
try {
  const require_ = createRequire(path.join(REPO, 'package.json'))
  const ts = require_('typescript')
  const out = ts.transpileModule(olvas(MODUL), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: 'csalad-kereses.ts',
  })
  const dest = path.join(tmp, 'csalad-kereses.js')
  fs.writeFileSync(dest, out.outputText, 'utf8')
  mod = require_(dest)
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}
fs.rmSync(tmp, { recursive: true, force: true })

const { tagFelirat, felnottekFelirat, gyermekekFelirat } = mod
if (typeof tagFelirat !== 'function') fail('tagFelirat nem exportált függvény')
if (typeof felnottekFelirat !== 'function') fail('felnottekFelirat nem exportált függvény')
if (typeof gyermekekFelirat !== 'function') fail('gyermekekFelirat nem exportált függvény')
if (failed) { console.error('\nA család-választó önellenőrzés ELBUKOTT.'); process.exit(1) }

const JANOS = { name: 'Csoma János', bornYear: 1971 }
const MARIA = { name: 'Kis Mária', bornYear: 1974 }
const EVTELEN = { name: 'Csoma Gábor', bornYear: null }

// 1. A születési év DÖNT — két azonos nevű rokonnál ez az egyetlen fogódzó.
if (tagFelirat(JANOS) === 'Csoma János (1971)') ok('a tag felirata viszi a születési évet')
else fail(`tagFelirat: várt „Csoma János (1971)", kapott „${tagFelirat(JANOS)}"`)

// 2. Év nélkül nem írunk üres zárójelet.
if (tagFelirat(EVTELEN) === 'Csoma Gábor') ok('ismeretlen születési évnél nincs üres zárójel')
else fail(`tagFelirat évtelenre: „${tagFelirat(EVTELEN)}"`)

// 3. Mindkét felnőtt megjelenik — EZ a sor lényege.
{
  const s = felnottekFelirat(JANOS, MARIA)
  if (s.includes('Csoma János') && s.includes('Kis Mária')) ok('mindkét felnőtt tag neve megjelenik')
  else fail(`felnottekFelirat: „${s}"`)
}

// 4. Egyedülálló/özvegy karton: csak az egyik oldal — és ez maga is megkülönböztet.
if (felnottekFelirat(JANOS, null) === 'Csoma János (1971)') ok('egyetlen felnőttnél nincs lógó elválasztó')
else fail(`felnottekFelirat(férj, null): „${felnottekFelirat(JANOS, null)}"`)

// 5. Ha egyik felnőtt sincs, ÜRES sztringet adunk — a hívó ilyenkor mást ír ki,
//    nem egy néma üres sávot.
if (felnottekFelirat(null, null) === '') ok('felnőtt nélkül üres a felirat (a hívó dönt)')
else fail(`felnottekFelirat(null, null): „${felnottekFelirat(null, null)}"`)

// 6. „nincs gyermek" — kimondva, nem elhallgatva.
if (gyermekekFelirat(0, []) === 'nincs rögzített gyermek') ok('gyermektelen családnál a szűkebb, mindig igaz állítást írjuk ki')
else fail(`gyermekekFelirat(0): „${gyermekekFelirat(0, [])}"`)

// 7. A gyermekek NEVE megjelenik — azonos nevű, azonos utcájú családoknál ez dönt.
{
  const s = gyermekekFelirat(2, [{ name: 'Csoma Anna', bornYear: 2010 }, { name: 'Csoma Péter', bornYear: 2013 }])
  if (s.includes('Csoma Anna') && s.includes('Csoma Péter') && s.includes('2 gyermek')) ok('a gyermekek neve és száma is látszik')
  else fail(`gyermekekFelirat(2, [2 név]): „${s}"`)
}

// 8. A LEVÁGÁS MEGSZÁMOLVA — a néma csonkítás pont azt a bizonytalanságot
//    hozná vissza, ami miatt ez a kör elindult.
{
  const sok = [1, 2, 3, 4, 5].map((i) => ({ name: `Gyerek ${i}`, bornYear: 2000 + i }))
  const s = gyermekekFelirat(5, sok)
  if (/\+2\b/.test(s)) ok('a ki nem írt gyermekek száma megjelenik (+N)')
  else fail(`gyermekekFelirat(5, [5 név]) nem jelzi a maradékot: „${s}"`)
}

// 9. Ha a nevek nem jöttek le, a DARABSZÁM akkor is helyes marad.
if (gyermekekFelirat(3, []) === '3 gyermek') ok('nevek nélkül is helyes a gyermekszám')
else fail(`gyermekekFelirat(3, []): „${gyermekekFelirat(3, [])}"`)

// 10. A darabszám a MÉRVADÓ, nem a nevek hossza (a nevek listája rövidebb lehet).
{
  const s = gyermekekFelirat(4, [{ name: 'Csoma Anna', bornYear: 2010 }])
  if (s.startsWith('4 gyermek')) ok('a kiírt szám a TELJES gyermekszám, nem a nevek darabszáma')
  else fail(`gyermekekFelirat(4, [1 név]): „${s}"`)
}

// ── (B) A SZERVER-ACTION SZERKEZETE ──────────────────────────────────────────
const actions = olvas(ACTIONS)
const actionsKod = kodCsak(actions)

const KEZDET = 'export async function searchAssignableFamilies'
const VEG = 'export interface AssignMemberInput'
const ai = actionsKod.indexOf(KEZDET)
const av = actionsKod.indexOf(VEG)
if (ai < 0 || av < 0 || av < ai) {
  fail('nem találom a kereső-ablakot a family-actions.ts-ben (kezdet/vég jelölő)')
} else {
  const ablak = actionsKod.slice(ai, av)

  // 11. A felnőttek NEVE lejön — ez a gyökérok javítása.
  if (/ferfi:szemely!id_ferfi\([^)]*k_nev/.test(ablak) && /no:szemely!id_no\([^)]*k_nev/.test(ablak)) {
    ok('a család-lekérdezés a felnőttek KERESZTNEVÉT is kéri')
  } else fail('a család-lekérdezésből hiányzik a felnőttek k_nev mezője — marad a puszta „Csoma család"')

  // 12. Születési év is — azonos nevű rokonoknál ez dönt.
  if (/ferfi:szemely!id_ferfi\([^)]*sz_datum/.test(ablak)) ok('a felnőttek születési dátuma is lejön')
  else fail('a felnőtt-join nem kéri a sz_datum-ot')

  // 13. A GYERMEK nevére is keresünk — a duplikált családok gyökéroka.
  if (/from\('gyerek'\)[\s\S]{0,200}?\.in\('id_szemely', personIds\)/.test(ablak)) {
    ok('a keresés a gyermekek nevére is talál (gyerek.id_szemely)')
  } else fail('a keresés CSAK a felnőttek felől szűr — a gyerek nevére keresve a család nem jön elő')

  // 14. A gyermekszám a személyi kartonnal azonos forrásból is merít.
  if (/haztartas_tag/.test(ablak) || /haztartas_tag/.test(kodCsak(actions).slice(av))) {
    ok('a gyermek-gyűjtés a haztartas_tag forrást is bevonja')
  } else fail('a gyermekszám csak a legacy `gyerek` táblából jön — a sor „0 gyermek"-et hazudhat')

  // 15. Determinisztikus sorrend MINDHÁROM plafonos lekérdezésen.
  //     ⚠️ A korábbi változat egyetlen `.order('id'` előfordulást keresett az
  //     EGÉSZ ablakban — a felnőtt-ág rendezése zöldre vitte a személy- és a
  //     gyermek-ágat is, pedig azok rendezetlenek voltak. Az őr így RÖGZÍTETTE
  //     a hibás mintát. Most lekérdezésenként nézünk.
  {
    const rendezettAgak = [
      { nev: 'személy-keresés', minta: /from\('szemely'\)[\s\S]{0,600}?\.order\('id'/ },
      { nev: 'felnőtt-jelöltek', minta: /from\('csalad'\)[\s\S]{0,400}?\.order\('id'/ },
      { nev: 'gyermek-jelöltek', minta: /from\('gyerek'\)[\s\S]{0,300}?\.order\('id_csalad'/ },
    ]
    const rendezetlen = rendezettAgak.filter((a) => !a.minta.test(ablak)).map((a) => a.nev)
    if (rendezetlen.length === 0) ok('mindhárom plafonos lekérdezés determinisztikusan rendezett')
    else fail(`rendezetlen, plafonos lekérdezés: ${rendezetlen.join(', ')} — a levágás véletlenszerű`)
  }

  // 16. Fail-safe minimál újrapróbálkozás a bővített család-lekérdezésen.
  if (/CSALAD_MINIMAL/.test(ablak) && /bovitett\.error/.test(ablak)) {
    ok('a bővített család-lekérdezésnek van minimál visszaesése')
  } else fail('nincs fail-safe visszaesés — a select hibája néma ÜRES listát adna')

  // 17. FAIL-CLOSED hatókör.
  if (/hhError[\s\S]{0,320}?return hibas/.test(ablak)) ok('a hatókör-lekérdezés hibája fail-closed ÉS kimondott')
  else fail('a háztartás-hatókör hibája nem fail-closed — idegen gyülekezet családja kicsúszhat')

  // 18. A teljes találatszám kimegy a felületre.
  if (/osszesTalalat/.test(ablak)) ok('a válasz viszi a TELJES találatszámot (látható levágás)')
  else fail('a válasz nem viszi a teljes találatszámot — a levágás néma marad')

  // 19. A gyermek-lekérést csak a megjelenített sorokra futtatjuk (URL-hossz).
  if (/mutatottIds/.test(ablak)) ok('a gyermek-lekérés a megjelenített sorokra szűkül')
  else fail('a gyermek-lekérés az összes jelöltre megy — hosszú `.in()` URL, 414 kockázat')

  // 19b. A RLS-szűrt beágyazás NEM hiba, csak NULL — a sor nem hazudhat.
  if (/felnottRejtve/.test(ablak)) ok('a rejtett felnőtt adatait a sor JELZI, nem „nincs felnőtt"-nek hazudja')
  else fail('a sor „Nincs rögzített felnőtt tag"-ot állítana RLS-szűrt beágyazásnál is — ez HAMIS')

  // 19c. A keresési hiba nem tűnhet el „nincs találat"-ként.
  if (/keresesHibas/.test(ablak) && /return hibas/.test(ablak)) {
    ok('a keresési hibát a válasz KIMONDJA (nem „nincs találat")')
  } else fail('a keresési hiba néma üres listaként jelenne meg — ebből születnek a duplikált családok')

  // 19d. A találatszám alsó becslés-e, ha plafonba értünk.
  if (/vagott/.test(ablak)) ok('a plafonba ütközést a válasz jelzi (a szám alsó becslés)')
  else fail('a találatszám hamis pontosságot állítana a plafon fölött')

  // 19e. A név a MÁR lekért beágyazásból épül — nincs második, néma kör-út.
  if (/csaladNev\(/.test(ablak)) ok('a család neve a beágyazott adatból épül (nem néma második lekérésből)')
  else fail('a családnév külön, hibáját elnyelő helperből jön — „Család #412" jelzés nélkül')
}


// 20. A közös helper NEM változott: sok hívója van, a bővítés külön úton ment.
{
  const membership = olvas(path.join(REPO, 'apps', 'web', 'lib', 'family', 'family-membership.ts'))
  if (/loadFamilyDisplayNames/.test(membership)) ok('a közös loadFamilyDisplayNames helyben maradt')
  else fail('eltűnt a loadFamilyDisplayNames — sok hívója van, nem szabad átírni')

  // 20b. A hatókör-halmaz LAPOZVA jön: az egy menetes lekérdezés a PostgREST
  //      néma 1000 soros plafonja fölött családokat vesztett, és a mentés
  //      elutasította azt, amit a kereső megmutatott.
  const scope = kodCsak(membership).match(/export async function getAllowedFamilyIds[\s\S]{0,900}/)
  if (scope && /selectAllPaged/.test(scope[0])) ok('a gyülekezet-hatókör lapozva olvas (nincs néma 1000-es plafon)')
  else fail('a getAllowedFamilyIds egy menetben olvas — 1000 háztartás fölött némán családokat veszít')
}

// ── (C) A DIALÓGUS ───────────────────────────────────────────────────────────
const dialog = olvas(DIALOG)
const dialogKod = kodCsak(dialog)

// 21. A találati sor kiírja a felnőtt tagokat.
if (/felnottekFelirat\(fam\.ferfi, fam\.no\)/.test(dialogKod)) ok('a találati sor kiírja a felnőtt tagokat')
else fail('a találati sor nem hívja a felnottekFelirat-ot — marad a régi, vak sor')

// 22. A gyermekek is látszanak a soron.
if (/gyermekekFelirat\(fam\.childrenCount, fam\.gyermekek\)/.test(dialogKod)) ok('a találati sor kiírja a gyermekeket')
else fail('a találati sor nem írja ki a gyermekeket')

// 23. A DÖNTŐ sort NEM vágjuk el — épp ezt kellett eddig kitalálni.
{
  const m = dialogKod.match(/felnottekFelirat\(fam\.ferfi, fam\.no\)[\s\S]{0,400}/)
  if (m && !/truncate/.test(m[0].slice(0, 300))) ok('a felnőtt-sor nincs truncate-elve')
  else fail('a felnőtt-sor truncate-elve van — a név elveszhet, pont a döntő helyen')
}

// 24. Ha nincs rögzített felnőtt, azt KIMONDJUK.
if (/Nincs rögzített felnőtt tag/.test(dialog)) ok('felnőtt nélküli családnál ezt kimondjuk')
else fail('felnőtt nélküli családnál üres sáv marad')

// 25. A levágás látható.
if (/osszesTalalat > results\.length/.test(dialogKod)) ok('a levágást a felület kiírja')
else fail('a levágás néma — a felhasználó nem tudja, volt-e több találat')

// 26. A tagnevek betöltési hibáját NEM hallgatjuk el.
if (/tagokIsmertek/.test(dialogKod)) ok('a hiányos tagnév-betöltést a felület jelzi')
else fail('a hiányos tagnév-betöltésről a felület hallgat')

// 27. A visszafordíthatatlan lépés előtt MEGNEVEZZÜK a választott családot.
if (/Ezt a családot választottad/.test(dialog) && /felnottekFelirat\(selected\.ferfi, selected\.no\)/.test(dialogKod)) {
  ok('a választás visszaigazolása megnevezi a család tagjait')
} else fail('a választás visszaigazolása nem nevezi meg a tagokat — az áthelyezés lezárja a korábbi tagságot')

// ── (D) MUTÁNSOK — a régi, hibás világ visszajátszása ────────────────────────
// M1: a felnőtt-join nélküli (mai) select → a 11. asszertnek buknia kell.
{
  const mutans = actionsKod.replace(/ferfi:szemely!id_ferfi\([^)]*\)/g, 'ferfi:szemely!id_ferfi(id)')
  const ai2 = mutans.indexOf(KEZDET)
  const av2 = mutans.indexOf(VEG)
  const ablak2 = ai2 >= 0 && av2 > ai2 ? mutans.slice(ai2, av2) : ''
  if (!/ferfi:szemely!id_ferfi\([^)]*k_nev/.test(ablak2)) ok('M1 mutáns: k_nev nélküli join → az őr buktatná')
  else fail('M1 mutáns TÚLÉLTE — a 11. asszert vak')
}

// M2: a gyermek-irányú keresés kivétele → a 13. asszertnek buknia kell.
{
  const mutans = actionsKod.replace(/\.in\('id_szemely', personIds\)/g, ".in('id_szemely', [])")
  const ai2 = mutans.indexOf(KEZDET)
  const av2 = mutans.indexOf(VEG)
  const ablak2 = ai2 >= 0 && av2 > ai2 ? mutans.slice(ai2, av2) : ''
  if (!/from\('gyerek'\)[\s\S]{0,200}?\.in\('id_szemely', personIds\)/.test(ablak2)) {
    ok('M2 mutáns: gyermek-irányú keresés nélkül → az őr buktatná')
  } else fail('M2 mutáns TÚLÉLTE — a 13. asszert vak')
}

// M3: fail-open hatókör → a 17. asszertnek buknia kell.
{
  const mutans = actionsKod.replace(/return ures \/\/[^\n]*/g, '').replace(/if \(hhError\) \{/g, 'if (false) {')
  const ai2 = mutans.indexOf(KEZDET)
  const av2 = mutans.indexOf(VEG)
  const ablak2 = ai2 >= 0 && av2 > ai2 ? mutans.slice(ai2, av2) : ''
  if (!/hhError[\s\S]{0,220}?return ures/.test(ablak2)) ok('M3 mutáns: fail-open hatókör → az őr buktatná')
  else fail('M3 mutáns TÚLÉLTE — a 17. asszert vak')
}

// M4: a régi, vak találati sor → a 21. asszertnek buknia kell.
{
  const mutans = dialogKod.replace(/felnottekFelirat\(fam\.ferfi, fam\.no\)/g, "''")
  if (!/felnottekFelirat\(fam\.ferfi, fam\.no\)/.test(mutans)) ok('M4 mutáns: vak találati sor → az őr buktatná')
  else fail('M4 mutáns TÚLÉLTE — a 21. asszert vak')
}

// M5: a szöveg-építő „csendes levágása" → a 8. asszertnek buknia kell.
{
  const forras = olvas(MODUL).replace(/const maradek = count - mutatott\.length/, 'const maradek = 0')
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'csalad-mutans-'))
  try {
    const require_ = createRequire(path.join(REPO, 'package.json'))
    const ts = require_('typescript')
    const out = ts.transpileModule(forras, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: 'mutans.ts',
    })
    const dest = path.join(tmp2, 'mutans.js')
    fs.writeFileSync(dest, out.outputText, 'utf8')
    const m = require_(dest)
    const sok = [1, 2, 3, 4, 5].map((i) => ({ name: `Gyerek ${i}`, bornYear: 2000 + i }))
    if (!/\+2\b/.test(m.gyermekekFelirat(5, sok))) ok('M5 mutáns: néma levágás → az őr buktatná')
    else fail('M5 mutáns TÚLÉLTE — a 8. asszert vak')
  } catch (e) {
    fail(`M5 mutáns futtatási hiba: ${e?.message || e}`)
  } finally {
    fs.rmSync(tmp2, { recursive: true, force: true })
  }
}

// M6: a SZEMÉLY-ág rendezésének kivétele → a 15. asszertnek buknia kell.
//     Ez a mutáns azért kell, mert az őr korábbi változata EGYETLEN `.order`
//     előfordulást keresett az egész ablakban — a felnőtt-ág rendezése zöldre
//     vitte a rendezetlen személy-ágat is. Az őr rögzítette a hibás mintát.
{
  const mutans = actionsKod.replace(
    /(from\('szemely'\)[\s\S]{0,600}?)\.order\('id', \{ ascending: true \}\)/,
    '$1',
  )
  const ai2 = mutans.indexOf(KEZDET)
  const av2 = mutans.indexOf(VEG)
  const ablak2 = ai2 >= 0 && av2 > ai2 ? mutans.slice(ai2, av2) : ''
  if (!/from\('szemely'\)[\s\S]{0,600}?\.order\('id'/.test(ablak2)) {
    ok('M6 mutáns: rendezetlen személy-keresés → az őr buktatná')
  } else fail('M6 mutáns TÚLÉLTE — a 15. asszert továbbra is vak a személy-ágra')
}

// M7: a rejtett-felnőtt jelölés kivétele → a 19b. asszertnek buknia kell.
{
  const mutans = actionsKod.replace(/felnottRejtve/g, 'nincsIlyenMezo')
  const ai2 = mutans.indexOf(KEZDET)
  const av2 = mutans.indexOf(VEG)
  const ablak2 = ai2 >= 0 && av2 > ai2 ? mutans.slice(ai2, av2) : ''
  if (!/felnottRejtve/.test(ablak2)) ok('M7 mutáns: rejtett felnőtt jelölése nélkül → az őr buktatná')
  else fail('M7 mutáns TÚLÉLTE — a 19b. asszert vak')
}

if (failed) {
  console.error('\nA család-választó önellenőrzés ELBUKOTT.')
  process.exit(1)
}
console.log('\nA család-választó önellenőrzés RENDBEN.')
