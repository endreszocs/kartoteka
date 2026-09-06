// selftest-naptar-retegek.mjs — a NAPTÁR-RÉTEGEK (anyakönyv / születésnap / névnap)
// és az anyakönyv ⇄ naptár kör őrszemei (2026-09-05, Endre 2. pontja)
//
// ⛔ MIÉRT: a naptár-csempe EGY napon a PROGRAMOKAT (tervezett keresztelő) és a
//    RÉTEGEKET (a megtörtént, anyakönyvezett keresztelő) is mutatja. Ha a kettő
//    össze van kötve (gyulekezeti_programok.anyakonyv_tabla/-_id), a tény NEM
//    jelenhet meg kétszer — de el sem tűnhet némán, ha a program nincs a listában.
//    A magán típus (szabadság, anyakönyvi alkalom — személynév a címben) pedig
//    SOHA nem mehet ki a gyülekezet weboldalára és a Google-feedbe.
//
// ŐRSZEMEK (transpile-minta: a tiszta függvények futtatva, a komponensek forrás-őrrel)
//   R1   dedupe: a KÖTÖTT anyakönyvi tény nem duplázódik (program + link ↔ réteg programId)
//   R1b  kétirányú felismerés: csak a program hordozza a linket / csak a réteg a programId-t
//   R1c  a kötött tény NEM tűnik el, ha a program nincs a listában — semmi nem vész el némán
//   R1n  negatív: a dedupe-szűrő kivéve → a tény kétszer jelenik meg → az őrszem BUKIK
//   R2   kapcsolók: kikapcsolt réteg nem ad tételt; a pöttyök naponként; havi darabszám
//   D1   a program-dialógus MAGÁN típusnál LETILTJA a publikus kapcsolót (forrás-őr)
//   D1n  negatív: a `disabled={magan}` kivéve → BUKIK
//   D2   szabadság-mód a típusválasztáskor (többnapos + egész napos), ikon-fallback, rejtett mező ürül
//   P1   a 4 anyakönyvi dialógus `initialDate`/`onSaved` propja létezik ÉS az onSaved hívódik
//   A1   a mentő-akciók visszaadják az id-t; deleteRegistryEntry bontja a program-linket
//   I1   ICS: a magán típus (keresztelő NÉVVEL, szabadság) NEM megy a feedbe; 'evi' → „évente"
//   I1n  negatív: a kliens-oldali szűrő kivéve → a név megjelenik → BUKIK
//   S1   a csempe: getNaptarRetegek + kapcsolók localStorage try/catch + a hibák kirajzolva
//   B1   tömeges bevitel: ismeretlen típusnév NEM néma 'egyeb' (figyelmeztető toast)
//   U1   desktop tükör: 'evi' kibontás + ismetlodes_vege vágás + az 5 új típus címkéje
//   ── 2026-09-05 P3-utómunka ──
//   L1   kapcsolProgramAnyakonyvhoz: ISMÉTLŐDŐ sorozat anyakönyvezése TILOS (a toggleProgramDone
//        mintája, közös üzenet); L1n negatív: a kapu kivéve → BUKIK
//   L2   a csempe a dialógus megnyitása ELŐTT tilt (toast), az onSaved-út hibája toastban;
//        a kártya gomb-címkéje az okot mondja
//   L3   év-metszet (cal-print-11): a tiszta predikátum futtatva (dec 30–jan 2 → januárban
//        látszik; jan 1 egynapos → látszik; előző évi egynapos → nem) + a getProgramsForYear
//        szűrőjének alakja + id-dedupe; L3n negatív: a régi „kezdő nap éve" szabály → BUKIK
//   L5   (ellenőrzés-ügynök) a program-recurrence.ts fejléce a VALÓSÁGOT mondja: horizonYear +
//        ismetlodes_vege, a sorozat átnyúlik az évhatáron (nem „évhatáron túli ismétlődés nincs");
//        L5n negatív: a régi fejléc-szöveg → BUKIK
//   L4   a naptár-SQL fejléce + COMMENT ON FUNCTION a valóságot mondja (mind az 5 magán
//        típus kizárva az ICS-ből), a törzs érintetlen

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let total = 0
let failedCount = 0
function assert(cond, msg) {
  total += 1
  if (cond) console.log(`OK:   ${msg}`)
  else {
    failedCount += 1
    console.error(`FAIL: ${msg}`)
  }
}

let ts
try {
  ts = require_(path.join(ROOT, 'node_modules/typescript'))
} catch {
  console.log('typescript nem elérhető — a selftest kihagyva (nem hiba).')
  process.exit(0)
}

const SRC = {
  const: path.join(ROOT, 'apps/web/lib/constants/dashboard.ts'),
  types: path.join(ROOT, 'apps/web/lib/calendar/naptar-retegek-types.ts'),
  ossze: path.join(ROOT, 'apps/web/lib/calendar/naptar-retegek-osszefesules.ts'),
  recurrence: path.join(ROOT, 'apps/web/lib/utils/program-recurrence.ts'),
  holidays: path.join(ROOT, 'apps/web/lib/utils/reformed-holidays.ts'),
  ics: path.join(ROOT, 'apps/web/lib/calendar/ics.ts'),
  dialog: path.join(ROOT, 'apps/web/components/modals/program-dialog.tsx'),
  batch: path.join(ROOT, 'apps/web/components/modals/batch-program-dialog.tsx'),
  scheduler: path.join(ROOT, 'apps/web/components/dashboard/program-scheduler.tsx'),
  actions: path.join(ROOT, 'apps/web/app/(dashboard)/anyakonyv/actions.ts'),
  upcoming: path.join(ROOT, 'packages/ui-app/src/dashboard/UpcomingPrograms.tsx'),
  baptism: path.join(ROOT, 'apps/web/components/modals/baptism-dialog.tsx'),
  marriage: path.join(ROOT, 'apps/web/components/modals/marriage-dialog.tsx'),
  burial: path.join(ROOT, 'apps/web/components/modals/burial-dialog.tsx'),
  confirmation: path.join(ROOT, 'apps/web/components/modals/confirmation-dialog.tsx'),
  // 2026-09-05 P3-utómunka
  programActions: path.join(ROOT, 'apps/web/app/(dashboard)/programs/actions.ts'),
  evMetszet: path.join(ROOT, 'apps/web/lib/calendar/program-ev-metszet.ts'),
  card: path.join(ROOT, 'apps/web/components/dashboard/program-agenda-card.tsx'),
  sql: path.join(ROOT, 'migration-docs/sql/2026-09-05-naptar-anyakonyv-szabadsag-nevnap.sql'),
}
const read = (f) => fs.readFileSync(f, 'utf8')

const t = (src) =>
  ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText

/** TS/TSX kommentek kiszedése — a magyarázó szöveg ne adjon vak zöldet. */
function kommentNelkul(kod) {
  return kod
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .split('\n')
    .map((s) => {
      const i = s.indexOf('//')
      if (i === -1) return s
      const elotte = s.slice(0, i)
      return ((elotte.match(/['"`]/g) || []).length % 2 === 0) ? elotte : s
    })
    .join('\n')
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-naptar-retegek-'))
process.on('exit', () => {
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* takarítás */ }
})
let szamlalo = 0
function ir(nev, tartalom) {
  const f = path.join(tmp, `${nev}-${(szamlalo += 1)}.cjs`)
  fs.writeFileSync(f, tartalom)
  return f
}
const req = (modul, fajl) => new RegExp(`require\\(["']${modul.replace(/[/@.]/g, (c) => `\\${c}`)}["']\\)`, 'g')

const constCjs = ir('const', t(read(SRC.const)))
const typesCjs = ir('types', t(read(SRC.types)))

/** Az összefésülő betöltése ADOTT forrásszöveggel (mutánsokhoz is). */
function betoltOssze(forras) {
  const cjs = t(forras)
    .replace(req('@/lib/constants/dashboard'), `require(${JSON.stringify(constCjs)})`)
    .replace(req('@/lib/calendar/naptar-retegek-types'), `require(${JSON.stringify(typesCjs)})`)
  return require_(ir('ossze', cjs))
}

// ---------------------------------------------------------------------------
// Próba-adatok
// ---------------------------------------------------------------------------
const prog = (over = {}) => ({
  id: 'p1', cim: 'Keresztelő', datum: '2026-05-10', datum_vege: null,
  ido_kezdes: '10:00:00', ido_befejezes: null, helyszin: null,
  tipus: 'kereszteles', prioritas: 'normal', ismetlodes_tipus: null, ismetlodes_vege: null,
  publikus: false, egyedi_tipus_nev: null, egyedi_emoji: null, leiras: null, megjegyzes: null,
  teljesitett: true, teljesites_datum: null, letrehozta_id: null, letrehozta_nev: null,
  congregation_id: null, created_at: '', updated_at: '',
  ...over,
})
const teny = (over = {}) => ({
  kulcs: 'keresztseg:5', tabla: 'keresztseg', id: 5, datum: '2026-05-10',
  cim: 'Keresztelő — Kovács Anna', nevek: ['Kovács Anna'], lelkesz: null, programId: null,
  ...over,
})
const retegek = (anyakonyv, szuletesnapok = [], nevnapok = []) => ({ ev: 2026, anyakonyv, szuletesnapok, nevnapok, hibak: [] })
const MIND = { anyakonyv: true, szuletesnapok: true, nevnapok: true }
const NAP = '2026-05-10'

/** A dedupe-mérce: a KÖTÖTT tény napján pontosan EGY tétel van, és az a program. */
function dedupeOk(mod) {
  const tetelek = mod.napTetelei(NAP, [prog({ anyakonyv_tabla: 'keresztseg', anyakonyv_id: 5 })], retegek([teny({ programId: 'p1' })]), MIND)
  return tetelek.length === 1 && tetelek[0].reteg === 'program'
}

// ---------------------------------------------------------------------------
// R · az összefésülés tiszta függvényei
// ---------------------------------------------------------------------------
const osszeNyers = read(SRC.ossze)
const ossze = betoltOssze(osszeNyers)

assert(dedupeOk(ossze), 'R1: a kötött anyakönyvi tény NEM duplázódik — a napon egy tétel, a program („anyakönyvezve")')
{
  const csakProgramLink = ossze.napTetelei(NAP, [prog({ anyakonyv_tabla: 'keresztseg', anyakonyv_id: 5 })], retegek([teny()]), MIND)
  assert(csakProgramLink.length === 1 && csakProgramLink[0].reteg === 'program', 'R1b: a kötést a PROGRAM link-oszlopa egyedül is felismeri (a réteg programId nélkül)')
  const csakRetegLink = ossze.napTetelei(NAP, [prog()], retegek([teny({ programId: 'p1' })]), MIND)
  assert(csakRetegLink.length === 1 && csakRetegLink[0].reteg === 'program', 'R1b: a kötést a RÉTEG programId-ja egyedül is felismeri (a program link nélkül)')
  const masikProgram = ossze.napTetelei(NAP, [prog({ id: 'p2', cim: 'Esküvő', tipus: 'eskuvo' })], retegek([teny({ programId: 'p1' })]), MIND)
  assert(masikProgram.length === 2 && masikProgram.some((x) => x.reteg === 'anyakonyv'), 'R1c: ha a kötött program NINCS a listában (más év/törölt), a tény LÁTSZIK — semmi nem tűnik el némán')
  const kulcsok = masikProgram.map((x) => x.kulcs)
  assert(new Set(kulcsok).size === kulcsok.length && kulcsok.every((k) => /^(pr|ak|sz|nn):/.test(k)), 'R1d: a tételek React-kulcsa stabil előtagos azonosító (id), nem gépelt tartalom')
}
{
  const mutans = osszeNyers.replace(
    /\s*if \(e\.programId && programIdk\.has\(e\.programId\)\) return false\n\s*if \(linkKulcsok\.has\(e\.kulcs\)\) return false\n/,
    '\n',
  )
  if (mutans === osszeNyers) {
    assert(false, 'R1n: a dedupe-mutáns NEM különbözik az eredetitől — a negatív asszert vak')
  } else {
    const mut = betoltOssze(mutans)
    assert(!dedupeOk(mut), 'R1n: a dedupe nélküli mutánson a tény KÉTSZER jelenik meg — az őrszem tud pirosra váltani')
  }
}
{
  const szul = { kulcs: 'szul:7:2026', szemelyId: 7, datum: NAP, nev: 'Nagy Béla', kor: 80, ferfi: true }
  const nev = { kulcs: 'nevnap:8:5-10:2026', szemelyId: 8, datum: NAP, nev: 'Kiss Anna', nevnapNev: 'Anna', elsodleges: true }
  const r = retegek([teny()], [szul], [nev])
  const kiKapcsolva = ossze.napTetelei(NAP, [], r, { anyakonyv: false, szuletesnapok: false, nevnapok: false })
  assert(kiKapcsolva.length === 0, 'R2: kikapcsolt rétegek → nincs réteg-tétel a napon')
  const csakSzul = ossze.napTetelei(NAP, [], r, { anyakonyv: false, szuletesnapok: true, nevnapok: false })
  assert(csakSzul.length === 1 && csakSzul[0].reteg === 'szuletesnap' && csakSzul[0].esemeny.kor === 80, 'R2: csak a születésnap-réteg bekapcsolva → egy születésnap-tétel (kor: 80)')
  const pottyok = ossze.retegPottyokNaponkent(r, MIND, [])
  const napi = pottyok.get(NAP) ?? []
  assert(napi.length === 3 && napi.map((p) => p.reteg).join(',') === 'anyakonyv,szuletesnap,nevnap', 'R2: a hónap-rács pöttyei naponként, a sorrend anyakönyv → születésnap → névnap')
  assert(napi[0].szin && !napi[1].szin && !napi[2].szin, 'R2: az anyakönyvi pötty a típus színét kapja, a köszöntők téma-tokenből (nincs beégetett szín)')
  assert(ossze.retegekSzamaHonapban(pottyok, '2026-05') === 3 && ossze.retegekSzamaHonapban(pottyok, '2026-06') === 0, 'R2: a havi darabszám a hónap-kulcs szerint számol')
  const sorrend = ossze.napTetelei(NAP, [prog({ id: 'p9', ido_kezdes: '18:00:00', cim: 'Bibliaóra', tipus: 'bibliaora' }), prog({ id: 'p8', ido_kezdes: '09:00:00', cim: 'Imaóra', tipus: 'imaora' })], r, MIND)
  assert(sorrend[0].reteg === 'program' && sorrend[0].program.id === 'p8' && sorrend[1].program.id === 'p9' && sorrend[2].reteg === 'anyakonyv', 'R2: a programok idő szerint elöl, utánuk a rétegek')
}

// ---------------------------------------------------------------------------
// D · a program-dialógus forrás-őrei
// ---------------------------------------------------------------------------
const dialogNyers = read(SRC.dialog)
const dialog = kommentNelkul(dialogNyers)

function dialogMaganVed(kod) {
  const k = kommentNelkul(kod)
  return /\{\.\.\.register\('publikus'\)\}\s+disabled=\{magan\}/.test(k) && /const magan = isMaganProgramTipus\(tipus\)/.test(k)
}
assert(dialogMaganVed(dialogNyers), 'D1: a dialógus MAGÁN típusnál letiltja a „Megjelenhet a weboldalon" kapcsolót (disabled={magan})')
{
  const mutans = dialogNyers.replace(/\{\.\.\.register\('publikus'\)\}\s+disabled=\{magan\}/, "{...register('publikus')}")
  if (mutans === dialogNyers) assert(false, 'D1n: a dialógus-mutáns NEM különbözik — a negatív asszert vak')
  else assert(!dialogMaganVed(mutans), 'D1n: a letiltás nélküli mutánson az őrszem BUKIK')
}
assert(/if \(isMaganProgramTipus\(t\)\) setValue\('publikus', false\)/.test(dialog), 'D1: magán típus választásakor a publikus jelző false-ra áll')
assert(/publikus: magan \? false : data\.publikus/.test(dialog), 'D1: a mentés-payloadban a magán típus publikus mezője false')
assert(/if \(t === 'szabadsag'\) \{[\s\S]{0,400}setMultiDay\(true\)[\s\S]{0,80}setAllDay\(true\)/.test(dialog), 'D2: szabadság típusnál a dialógus többnaposra + egész naposra vált (D2)')
assert(/\{!allDay && !szabadsag && \(/.test(dialog) && /\{!szabadsag && \(\s*<div className="kt-field">\s*<label className="kt-label">Prioritás/.test(dialog), 'D2: szabadságnál az idő- és a prioritás-blokk rejtve')
assert(/const SelectedIcon = tipusIkon\(tipus\)/.test(dialog) && /tipusCimke\(tipus\)/.test(dialog), 'D2: ismeretlen típus-értékre ikon/címke fallback (tipusIkon/tipusCimke)')
assert(/if \(!be\) setValue\('datum_vege', ''\)/.test(dialog) && /if \(be\) \{ setValue\('ido_kezdes', ''\); setValue\('ido_befejezes', ''\) \}/.test(dialog), 'D2: a Többnapos kikapcsolásakor a datum_vege, az Egész napos bekapcsolásakor az idők ürülnek')
assert(/errors\.ismetlodes_vege && <p className="kt-err">/.test(dialog) && /errors\.ido_befejezes && <p className="kt-err">/.test(dialog), 'D2: az ismetlodes_vege és az ido_befejezes hibájának van kirajzolt helye')
assert(/TIPUS_CSOPORTOK/.test(dialog) && /kt-typegroup-title/.test(dialog) && /ANYAKONYVI_PROGRAM_TIPUSOK/.test(dialog), 'D2: a típusrács csoportosítva (gyülekezeti / anyakönyvi / szabadság)')
assert(/AUTO_CIMEK/.test(dialog) && /setValue\('cim', PROG_TIPUS_LABELS\[t\]/.test(dialog), 'D2: anyakönyvi típusnál a cím alapértelmezése a típus címkéje (név nélkül)')

// ---------------------------------------------------------------------------
// P · a 4 anyakönyvi dialógus propjai
// ---------------------------------------------------------------------------
for (const nev of ['baptism', 'marriage', 'burial', 'confirmation']) {
  const k = kommentNelkul(read(SRC[nev]))
  const propOk = /initialDate\?:\s*string\s*\|\s*null/.test(k) && /onSaved\?:\s*\(id:\s*number\)\s*=>\s*void/.test(k)
  assert(propOk, `P1: ${nev}-dialog — initialDate?: string | null + onSaved?: (id: number) => void prop létezik`)
  assert(/onSaved\?\.\(/.test(k), `P1: ${nev}-dialog — az onSaved a sikeres mentés után HÍVÓDIK`)
  assert(!/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(k) && /todayYmd\(\)/.test(k), `P1: ${nev}-dialog — a mai nap HELYI (todayYmd), nem UTC`)
}

// ---------------------------------------------------------------------------
// A · anyakönyvi akciók: id vissza + link-bontás törléskor
// ---------------------------------------------------------------------------
{
  const a = kommentNelkul(read(SRC.actions))
  assert(/id: baptismRowId \?\? undefined/.test(a), 'A1: saveBaptism visszaadja a sor id-ját')
  assert(/id: marriageRowId \?\? undefined/.test(a), 'A1: saveMarriage visszaadja a sor id-ját')
  assert(/id: burialRowId \?\? undefined/.test(a), 'A1: saveBurial visszaadja a sor id-ját')
  assert(/id: insertedIds\[0\], ids: insertedIds/.test(a), 'A1: saveConfirmationBatch visszaadja az id-t és az ids listát')
  assert(/return \{ success: true, id: d\.id, warning: voterKonfirmacio\.warning \}/.test(a), 'A1: saveConfirmationSingle visszaadja az id-t')
  const torles = a.slice(a.indexOf('export async function deleteRegistryEntry'))
  assert(
    /\.from\('gyulekezeti_programok'\)\s*\.update\(\{ anyakonyv_tabla: null, anyakonyv_id: null[\s\S]*?\.eq\('anyakonyv_tabla', tab\)\s*\.eq\('anyakonyv_id', id\)/.test(torles),
    'A1: deleteRegistryEntry törléskor bontja a program-kapcsolatot (anyakonyv_tabla/anyakonyv_id → NULL, a linkelt táblára+id-ra célozva)',
  )
  assert(/\.eq\('congregation_id', congId\)\s*\.eq\('anyakonyv_tabla', tab\)/.test(torles), 'A1: a link-bontás a gyülekezetre is szűr (nem nyúl más gyülekezet programjához)')
}

// ---------------------------------------------------------------------------
// I · ICS: a magán típusok kliens-oldali kapuja + 'evi' felirat
// ---------------------------------------------------------------------------
const icsNyers = read(SRC.ics)
const recurrenceCjs = ir('recurrence', t(read(SRC.recurrence)))
const holidaysCjs = ir('holidays', t(read(SRC.holidays)))
function betoltIcs(forras) {
  const cjs = t(forras)
    .replace(req('@/lib/constants/dashboard'), `require(${JSON.stringify(constCjs)})`)
    .replace(req('@/lib/utils/program-recurrence'), `require(${JSON.stringify(recurrenceCjs)})`)
    .replace(req('@/lib/utils/reformed-holidays'), `require(${JSON.stringify(holidaysCjs)})`)
  return require_(ir('ics', cjs))
}
const FEED_PROGRAMOK = [
  prog({ id: 'a1', cim: 'Vasárnapi istentisztelet', tipus: 'istentisztelet', datum: '2026-05-10' }),
  prog({ id: 'a2', cim: 'Keresztelő — Kovács Anna', tipus: 'kereszteles', datum: '2026-05-10' }),
  prog({ id: 'a3', cim: 'Szabadság — helyettes Nagy Pál', tipus: 'szabadsag', datum: '2026-07-01', datum_vege: '2026-07-14', ido_kezdes: null }),
  prog({ id: 'a4', cim: 'Hálaadó istentisztelet', tipus: 'istentisztelet', datum: '2025-10-05', ismetlodes_tipus: 'evi' }),
]
/** A feed-mérce: a magán címek NINCSENEK a feedben, a gyülekezeti igen. (A sorhajtást kibontjuk.) */
function feedOk(mod) {
  const ics = mod.buildCalendarIcs({ congregationName: 'Teszt gyülekezet', programs: FEED_PROGRAMOK, fromYear: 2026, toYear: 2026, includeHolidays: false })
    .replace(/\r\n[ \t]/g, '')
  return !ics.includes('Kovács Anna') && !ics.includes('Szabadság') && ics.includes('Vasárnapi istentisztelet')
}
{
  const ics = betoltIcs(icsNyers)
  assert(feedOk(ics), 'I1: a magán típusok (keresztelő névvel, szabadság) NEM kerülnek a gyülekezeti ICS-feedbe, a gyülekezeti alkalom igen')
  const szoveg = ics.buildCalendarIcs({ congregationName: 'Teszt gyülekezet', programs: FEED_PROGRAMOK, fromYear: 2026, toYear: 2026, includeHolidays: false }).replace(/\r\n[ \t]/g, '')
  assert(szoveg.includes('Hálaadó istentisztelet') && szoveg.includes('Ismétlődés: évente'), "I1: az 'evi' sorozat az idei alkalommal, „Ismétlődés: évente\" felirattal megy ki (nem „havonta\")")
  assert(!szoveg.includes('Ismétlődés: havonta'), "I1: az 'evi' sorozat NEM kap „havonta\" feliratot")
}
{
  const mutans = icsNyers.replace(/const nyilvanosProgramok = programs\.filter\(\(p\) => !isMaganProgramTipus\(p\.tipus\)\)/, 'const nyilvanosProgramok = programs')
  if (mutans === icsNyers) assert(false, 'I1n: az ICS-mutáns NEM különbözik — a negatív asszert vak')
  else assert(!feedOk(betoltIcs(mutans)), 'I1n: a kliens-szűrő nélküli mutánson a személynév kimegy a feedbe — az őrszem BUKIK')
}

// ---------------------------------------------------------------------------
// S · a csempe forrás-őrei
// ---------------------------------------------------------------------------
{
  const s = kommentNelkul(read(SRC.scheduler))
  assert(/getNaptarRetegek\(y\)/.test(s) && /getProgramsForYear\(y\)/.test(s), 'S1: a csempe a rétegeket a programokkal együtt tölti (getNaptarRetegek)')
  assert(/try \{\s*const raw = localStorage\.getItem\(NAPTAR_RETEG_LS_KULCS\)/.test(s) && /try \{ localStorage\.setItem\(NAPTAR_RETEG_LS_KULCS/.test(s), 'S1: a kapcsolók localStorage-olvasása/írása try/catch-ben')
  assert(/kt-reteg-hibak/.test(s) && /\{retegHiba && <p>\{retegHiba\}<\/p>\}/.test(s) && /<p key=\{h\.reteg\}>\{h\.uzenet\}<\/p>/.test(s), 'S1: a rétegek hibái LÁTHATÓ figyelmeztetésként jelennek meg')
  assert(/retegPottyok=\{retegPottyok\}/.test(s) && /<RetegAgendaCard key=\{t\.kulcs\}/.test(s), 'S1: a hónap-rács a réteg-pöttyöket, az agenda a réteg-kártyákat kapja')
  assert(/onAnyakonyvezes=\{onAnyakonyvezes\}/.test(s) && /kapcsolProgramAnyakonyvhoz\(\{ programId: program\.id, anyakonyvId \}\)/.test(s) && /bontProgramAnyakonyv\(bontasTarget\.id\)/.test(s), 'S1: Anyakönyvezés gomb → registry-dialógus → kapcsolProgramAnyakonyvhoz; Bontás → bontProgramAnyakonyv')
  assert(/retegek=\{evRetegek\}/.test(s) && /<SzuletesnaposNaptarPrint/.test(s), 'S1: az AnnualPlanPrint és a SzuletesnaposNaptarPrint a csempe rétegeit kapja')
  assert(/const TWO_COL_MIN = 750/.test(s), 'S1: a két hasábos küszöb 750px (52px-es cellával nem zsugorodik a naptár — D8)')
}

// ---------------------------------------------------------------------------
// B · tömeges bevitel — U · desktop tükör
// ---------------------------------------------------------------------------
{
  const b = kommentNelkul(read(SRC.batch))
  assert(/ismeretlenTipusok\.add\(v\.trim\(\)\)/.test(b) && /if \(ismeretlenTipusok\.size > 0\) \{[\s\S]{0,400}toast\.warning\(/.test(b), 'B1: az ismeretlen típusnév figyelmeztető toastot ad (nem néma „egyéb")')
  assert(/keresztelo: 'kereszteles'/.test(b) && /hazassagkotes: 'eskuvo'/.test(b), 'B1: szinonimák (keresztelő/keresztelés, esküvő/házasságkötés)')
  const u = kommentNelkul(read(SRC.upcoming))
  assert(/rec === 'evi'/.test(u) && /addMonths\(p\.datum, i \* 12\)/.test(u), "U1: a desktop tükör kibontja az 'evi' sorozatot")
  assert(/if \(p\.ismetlodes_vege && p\.ismetlodes_vege < horizon\) horizon = p\.ismetlodes_vege/.test(u), 'U1: a desktop tükör az ismetlodes_vege záró nappal vágja a horizontot')
  assert(/end >= todayStr/.test(u), 'U1: az elkezdődött többnapos program (szabadság) benne marad: (datum_vege ?? datum) >= ma')
  for (const tipus of ['kereszteles', 'eskuvo', 'konfirmacio', 'temetes', 'szabadsag']) {
    assert(new RegExp(`${tipus}: '[^']+'`).test(u) && new RegExp(`${tipus}: '#[0-9a-f]{6}'`).test(u), `U1: a desktop tükörben a(z) '${tipus}' típus címkéje és színe megvan`)
  }
}

// ---------------------------------------------------------------------------
// L · P3-utómunka (2026-09-05): ismétlődő sorozat anyakönyvezése TILOS;
//     év-metszet a program-betöltésben; a naptár-SQL kommentje a valóságot mondja
// ---------------------------------------------------------------------------
{
  const aNyers = read(SRC.programActions)
  const a = kommentNelkul(aNyers)
  const types = kommentNelkul(read(SRC.types))
  assert(/export const ISMETLODO_SOROZAT_ANYAKONYV_HIBA =/.test(types), 'L1: az ismétlődő-sorozat üzenet EGY forrásból (naptar-retegek-types.ts) — a szerver és a felület ugyanazt mondja')

  /** A szerver-kapu mércéje: a link-akció a sorozat-jelzőt LEKÉRI és az UPDATE előtt tilt rá. */
  function anyakonyvKapuOk(kod) {
    const k = kommentNelkul(kod)
    const fn = k.slice(k.indexOf('export async function kapcsolProgramAnyakonyvhoz'), k.indexOf('export async function bontProgramAnyakonyv'))
    return /\.select\('id, tipus, anyakonyv_id, ismetlodes_tipus'\)/.test(fn)
      && /if \(p\.ismetlodes_tipus\) \{\s*return \{ ok: false, error: ISMETLODO_SOROZAT_ANYAKONYV_HIBA \}/.test(fn)
      && fn.indexOf('if (p.ismetlodes_tipus)') < fn.indexOf('.update({')
  }
  assert(anyakonyvKapuOk(aNyers), 'L1: kapcsolProgramAnyakonyvhoz — ISMÉTLŐDŐ sorozatra (ismetlodes_tipus) az összekötés TILOS, az UPDATE előtt, a közös üzenettel (a toggleProgramDone mintája)')
  {
    const mutans = aNyers.replace(/\s*if \(p\.ismetlodes_tipus\) \{\s*return \{ ok: false, error: ISMETLODO_SOROZAT_ANYAKONYV_HIBA \}\s*\}/, '')
    if (mutans === aNyers) assert(false, 'L1n: a kapu-mutáns NEM különbözik — a negatív asszert vak')
    else assert(!anyakonyvKapuOk(mutans), 'L1n: a kapu nélküli (régi) mutánson az őrszem BUKIK')
  }
  assert(/if \(done\) \{[\s\S]{0,300}\.select\('ismetlodes_tipus'\)[\s\S]{0,300}ismetlodes_tipus\) \{\s*return \{\s*error:/.test(a), 'L1: a toggleProgramDone kapuja változatlanul áll (a két kapu együtt fail-closed)')

  const s = kommentNelkul(read(SRC.scheduler))
  assert(/if \(real\.ismetlodes_tipus\) \{\s*toast\.error\(ISMETLODO_SOROZAT_ANYAKONYV_HIBA/.test(s) && s.indexOf('if (real.ismetlodes_tipus)') < s.indexOf('setAnyakonyvezes({ tabla:'), 'L2: a csempe az anyakönyvi dialógus megnyitása ELŐTT tilt (nem keletkezik kötetlen anyakönyvi sor), toastban, ugyanazzal az üzenettel')
  assert(/if \(!res\.ok\) \{[\s\S]{0,400}toast\.error\([\s\S]{0,300}mentve maradt, csak a programhoz nincs hozzákötve/.test(s), 'L2: az onSaved-út hibája toastban látszik, és kimondja: a bejegyzés mentve, a kötés nem jött létre')
  const card = kommentNelkul(read(SRC.card))
  assert(/title=\{p\.ismetlodes_tipus \? ISMETLODO_SOROZAT_ANYAKONYV_HIBA :/.test(card), 'L2: a kártya Anyakönyvezés gombja sorozatnál a tiltás okát írja a címkéjébe')

  // L3 · év-metszet: a tiszta predikátum FUTTATVA + a szerver-akció szűrőjének alakja
  const evMetszetNyers = read(SRC.evMetszet)
  const betoltMetszet = (forras) => require_(ir('evmetszet', t(forras)))
  const em = betoltMetszet(evMetszetNyers)
  const tabor = { datum: '2025-12-30', datum_vege: '2026-01-02' }
  assert(em.programMetsziEvet(tabor, 2026) === true, 'L3: dec. 30. – jan. 2. tábor → 2026-ban LÁTSZIK (az intervallum metszi az évet)')
  assert(em.programMetsziEvet(tabor, 2025) === true, 'L3: ugyanaz a tábor 2025-ben is látszik (dec. 30–31.)')
  assert(em.programMetsziEvet({ datum: '2026-01-01', datum_vege: null }, 2026) === true, 'L3: jan. 1-jei egynapos program → látszik')
  assert(em.programMetsziEvet({ datum: '2025-12-31', datum_vege: null }, 2026) === false, 'L3: előző évi egynapos program → NEM látszik')
  assert(em.programMetsziEvet({ datum: '2026-12-31' }, 2026) === true && em.programMetsziEvet({ datum: '2027-01-01' }, 2026) === false, 'L3: az év utolsó napja még igen, a következő év első napja már nem')
  assert(em.programMetsziEvet({ datum: '2025-12-30', datum_vege: '2025-12-20' }, 2026) === false, 'L3: hibás (kezdő előtti) záró nap → a kezdő nap dönt (nem szivárog át)')
  const szuro = em.programEvMetszetSzuro(2026)
  assert(szuro.datumLegfeljebb === '2026-12-31' && szuro.vagySzuro === 'datum_vege.gte.2026-01-01,datum.gte.2026-01-01', 'L3: a PostgREST-alak: datum ≤ 2026-12-31 ÉS (datum_vege ≥ 2026-01-01 VAGY datum ≥ 2026-01-01)')
  {
    const mutans = evMetszetNyers.replace('return p.datum <= utolso && programZaroNapja(p) >= elso', 'return p.datum <= utolso && p.datum >= elso')
    if (mutans === evMetszetNyers) assert(false, 'L3n: a predikátum-mutáns NEM különbözik — a negatív asszert vak')
    else assert(betoltMetszet(mutans).programMetsziEvet(tabor, 2026) === false, 'L3n: a RÉGI (kezdő nap éve) szabállyal a tábor eltűnik januárból — az őrszem tud pirosra váltani')
  }
  /** A szerver-akció mércéje: az első lekérdezés a metszet-szűrőt használja, nem a kezdő nap évét. */
  function evSzuroOk(kod) {
    const k = kommentNelkul(kod)
    const fn = k.slice(k.indexOf('export async function getProgramsForYear'), k.indexOf('export async function getCalendarFeedToken'))
    return /const evSzuro = programEvMetszetSzuro\(year\)/.test(fn)
      && /\.lte\('datum', evSzuro\.datumLegfeljebb\)\s*\.or\(evSzuro\.vagySzuro\)/.test(fn)
      && !/\.gte\('datum', `\$\{year\}-01-01`\)/.test(fn)
      && /egyszer\.set\(p\.id, p\)/.test(fn)
  }
  assert(evSzuroOk(aNyers), 'L3: getProgramsForYear — az év METSZETE (lte datum + or datum_vege/datum ≥ év eleje) a közös segédből, és id szerinti dedupe a két lekérdezés uniójára')
  {
    const mutans = aNyers.replace(/\.lte\('datum', evSzuro\.datumLegfeljebb\)\s*\.or\(evSzuro\.vagySzuro\)/, ".gte('datum', `${year}-01-01`)\n        .lte('datum', `${year}-12-31`)")
    if (mutans === aNyers) assert(false, 'L3n: a szűrő-mutáns NEM különbözik — a negatív asszert vak')
    else assert(!evSzuroOk(mutans), 'L3n: a RÉGI (kezdő nap éve) szűrőre visszaírt mutánson az őrszem BUKIK')
  }

  // L4 · a naptár-SQL kommentje a törzshöz igazodott (nem fordítva)
  const sql = read(SRC.sql)
  const fejlec = sql.slice(0, sql.indexOf('-- 0) Első-futás-őr'))
  assert(fejlec.length > 0 && !/gyülekezeti ICS-feed: CSAK a szabadság kizárva/.test(fejlec) && /gyülekezeti ICS-feed: UGYANÚGY szabadság \+ mind a 4 anyakönyvi típus/.test(fejlec), 'L4: a naptár-SQL fejléce a valóságot mondja — az ICS-feedből mind az 5 magán típus kizárva (nem „csak a szabadság")')
  assert(/UTÓLAGOS KOMMENT-JAVÍTÁS/.test(fejlec) && /ÚJRAFUTTATÁS NEM SZÜKSÉGES/.test(fejlec), 'L4: a fejléc kimondja: 2026-09-05 utólagos komment-javítás, újrafuttatás nem szükséges')
  const fnComment = sql.match(/COMMENT ON FUNCTION public\.public_calendar_feed\(uuid\) IS\s*'([^']*)'/)?.[1] ?? ''
  assert(/szabadsag, kereszteles, eskuvo, konfirmacio, temetes/.test(fnComment) && !/szabadság-típus NÉLKÜL/.test(fnComment), 'L4: a public_calendar_feed COMMENT ON FUNCTION szövege az 5 magán típust nevezi meg')
  const torzs = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.public_calendar_feed'), sql.indexOf('COMMENT ON FUNCTION public.public_calendar_feed'))
  assert(/AND p\.tipus NOT IN \('szabadsag','kereszteles','eskuvo','konfirmacio','temetes'\);/.test(torzs), 'L4: a SQL-TÖRZS érintetlen — a feed WHERE-je továbbra is mind az 5 típust kizárja (a komment igazodott a törzshöz, nem fordítva)')
}

// ── L5 · (ellenőrzés-ügynök, 2026-09-05) a program-recurrence.ts fejléce a VALÓSÁGOT mondja ──
// A törzs 2026-08-02 (horizonYear) és 2026-08-26 (ismetlodes_vege) óta átnyúlik az
// évhatáron; a fejléc még „évhatáron túli ismétlődés nincs"-et állított — egy
// következő fejlesztő ebből téves invariánst olvasna ki (a cal-print-11 kör tanulsága).
{
  const rec = read(SRC.recurrence)
  const fejlec = rec.slice(0, rec.indexOf('const STEP_DAYS'))
  const torzs = kommentNelkul(rec)
  const fejlecOk = (f) =>
    /horizonYear/.test(f) && /ismetlodes_vege/.test(f) && /átnyúlik az évhatáron/.test(f) && !/„örök" ismétlődés nincs/.test(f) && !/nincs hozzá záró-dátum mező sem/.test(f)
  assert(fejlecOk(fejlec), 'L5: a fejléc a horizonYear-t és az ismetlodes_vege-t írja le — nem az elavult „évhatáron túli ismétlődés nincs" szabályt')
  assert(/horizonYear\?: number/.test(torzs) && /p\.ismetlodes_vege && p\.ismetlodes_vege < horizon/.test(torzs), 'L5: a törzs valóban horizonYear-t és ismetlodes_vege-t használ (a fejléc ehhez igazodott, nem fordítva)')
  const mutans = fejlec.replace(/Záró nap nélküli sorozat tehát átnyúlik az évhatáron[^\n]*\n[^\n]*\n/, 'Évhatáron túli,\n *    „örök" ismétlődés nincs (nincs hozzá záró-dátum mező sem).\n')
  if (mutans === fejlec) assert(false, 'L5n: a fejléc-mutáns NEM különbözik — a negatív asszert vak')
  else assert(!fejlecOk(mutans), 'L5n: a régi fejléc-szöveggel az őrszem BUKIK')
}

console.log(`\nÖsszesen: ${total}, hibás: ${failedCount}`)
if (failedCount > 0) {
  console.error('❌ FAIL — naptár-rétegek őrszemek')
  process.exit(1)
}
console.log('✅ PASS — naptár-rétegek őrszemek')
process.exit(0)
