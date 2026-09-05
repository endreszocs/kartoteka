#!/usr/bin/env node
/**
 * HIVATALOS SZEMÉLYI SZÁM (CNP) önellenőrzés (2026-09-05)
 *
 * ELŐZMÉNY — Endre észrevétele:
 *   „Személyi szám (CNP) az nem az ami a kartotékon szerepel. Az a rendszer
 *    által adott azonosító kód. A hivatalos CNP-t külön lehet menteni!"
 *
 * A `szemely.cnp` HÁROMFÉLE dolgot tárol (EC-… import-generált, 999+7 webes
 * generált, és VALÓDI 13 jegyű CNP a desktop új-tag útjáról), a felület mégis
 * mindet „Személyi szám (CNP)" címkével mutatta — az Excel-export fejléce
 * pedig szó szerint „CNP" volt. A lelkész tehát abban a hitben adta tovább a
 * fájlt, hogy abban személyi szám van.
 *
 * Nyolc védelem, amit ez az őr fog:
 *
 *   (1) A `cnp` mező címkéje ŐSZINTE: „Egyházi azonosító".
 *   (2) A címke ÉRTÉK-FÜGGŐ: ami nem bizonyítottan generált alak, azt
 *       SZEMÉLYES ADATNAK vesszük és maszkoljuk (fail-safe irány) — különben
 *       a desktopról érkezett VALÓDI CNP-ket fednénk fel „egyházi azonosító"
 *       címke alatt, ami ROSSZABB a mai állapotnál.
 *   (3) Az Excel-export fejléce sem hazudik többé.
 *   (4) A hivatalos szám KÜLÖN táblában él — nem a `szemely` oszlopaként.
 *   (5) Az érték NEM jön le a kartonnal: külön, naplózott hívás kéri el.
 *   (6) A napló SOHA nem tartalmazza magát a számot.
 *   (7) A 13 jegyű román CNP ellenőrző számjegyét megvizsgáljuk.
 *   (8) Az audit-naplózás tényleg ír: a nem-UUID azonosító a metaadatba megy,
 *       különben a Postgres 22P02-t dob, a hívó pedig lenyeli.
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): a döntő
 * modulokat VALÓDIAN LEFUTTATJUK (izolált transpile), és visszajátsszuk a
 * hibás világot is.
 *
 * Futtatás:  node scripts/selftest-szemelyi-szam.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const LIB = path.join(REPO, 'apps', 'web', 'lib', 'members', 'szemelyi-szam.ts')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'tagnyilvantartas', 'szemelyi-szam-actions.ts')
const MEZO = path.join(REPO, 'apps', 'web', 'components', 'members', 'szemelyi-szam-mezo.tsx')
const KARTON = path.join(REPO, 'apps', 'web', 'components', 'modals', 'member-details-dialog-v2.tsx')
const EXCEL = path.join(REPO, 'apps', 'web', 'lib', 'offline', 'excel-schema', 'registry.ts')
const AUDIT = path.join(REPO, 'apps', 'web', 'lib', 'audit', 'log.ts')
const MIGRACIO = path.join(REPO, 'migration-docs', 'sql', '2026-09-05-szemelyi-szam-kulon-tabla.sql')
const TABLA_REGISTRY = path.join(REPO, 'apps', 'web', 'lib', 'offline', 'table-registry.ts')

let failed = false
const ok = (m) => console.log(`OK:   ${m}`)
const fail = (m) => { failed = true; console.error(`HIBA: ${m}`) }

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const f of [LIB, ACTIONS, MEZO, KARTON, EXCEL, AUDIT, MIGRACIO, TABLA_REGISTRY]) {
  if (!fs.existsSync(f)) fail(`hiányzó fájl: ${path.relative(REPO, f)}`)
}
if (failed) { console.error('\nA személyi szám önellenőrzés ELBUKOTT.'); process.exit(1) }

// ── (A) A DÖNTŐ MODUL VALÓDI LEFUTTATÁSA ─────────────────────────────────────
// A `@kartoteka/validations` importot kiváltjuk a VALÓDI validátor forrásával,
// hogy izoláltan futtatható legyen — de ne egy leegyszerűsített utánzattal.
const VALIDATOR_FORRAS = olvas(path.join(REPO, 'packages', 'validations', 'src', 'members', 'szemely-create.ts'))
const VALIDATOR_TORZS = VALIDATOR_FORRAS.match(/export function validateRomanianCnp[\s\S]*?\n}/)
if (!VALIDATOR_TORZS) {
  fail('nem találom a validateRomanianCnp törzsét a packages/validations-ben')
  console.error('\nA személyi szám önellenőrzés ELBUKOTT.')
  process.exit(1)
}

function betolt(forras, nev) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'szemelyi-szam-'))
  try {
    const require_ = createRequire(path.join(REPO, 'package.json'))
    const ts = require_('typescript')
    const kivaltott = forras.replace(
      /import \{ validateRomanianCnp \} from '@kartoteka\/validations'/,
      VALIDATOR_TORZS[0],
    )
    const out = ts.transpileModule(kivaltott, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: nev,
    })
    const dest = path.join(tmp, `${nev.replace(/\.ts$/, '')}.js`)
    fs.writeFileSync(dest, out.outputText, 'utf8')
    return require_(dest)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

let mod
try {
  mod = betolt(olvas(LIB), 'szemelyi-szam.ts')
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  console.error('\nA személyi szám önellenőrzés ELBUKOTT.')
  process.exit(1)
}

const { azonositoFajta, egyhaziAzonositoE, cnpMaszkolando, cnpMezoCimke, ellenorizSzemelyiSzam } = mod
for (const [nev, fn] of Object.entries({ azonositoFajta, egyhaziAzonositoE, cnpMaszkolando, cnpMezoCimke, ellenorizSzemelyiSzam })) {
  if (typeof fn !== 'function') fail(`${nev} nem exportált függvény`)
}
if (failed) { console.error('\nA személyi szám önellenőrzés ELBUKOTT.'); process.exit(1) }

// Endre kartonján ez az érték állt, „Személyi szám (CNP)" címke alatt.
const ENDRE_ERTEKE = 'EC-2026-999YQWMWU7'
// Valódi, checksummal helyes román CNP (teszt-érték, nem élő személyé).
const VALODI_CNP = '1960229414127'

// 1. Az import-generált alak felismerése — ez volt Endre panaszának tárgya.
if (azonositoFajta(ENDRE_ERTEKE) === 'egyhazi') ok('az EC-… kód egyházi azonosítóként ismerhető fel')
else fail(`az EC-… kód besorolása: ${azonositoFajta(ENDRE_ERTEKE)}`)

// 2. A webes generátor alakja is (999 + 7 jegy) — ez SEMMIVEL nem árulja el
//    magát, ezért kell külön minta.
if (egyhaziAzonositoE('9991234567')) ok('a 999+7 jegyű webes generált kód is felismerhető')
else fail('a 999+7 jegyű webes generált kódot nem ismerjük fel — pedig ezt adja a kézi felvitel')

// 3. FAIL-SAFE IRÁNY: a valódi CNP NEM egyházi azonosító.
if (!egyhaziAzonositoE(VALODI_CNP)) ok('a valódi 13 jegyű CNP NEM minősül egyházi azonosítónak')
else fail('a valódi CNP-t egyházi azonosítónak vennénk — ez felfedné az állami azonosítót')

// 4. Ismeretlen alak → SZEMÉLYES ADAT (maszkolunk). Fordítva egy legacy
//    importból származó valódi számot fednénk fel némán.
if (cnpMaszkolando('ABC-12345')) ok('ismeretlen alakot személyes adatnak veszünk (fail-safe)')
else fail('ismeretlen alakot csupaszon mutatnánk — a fail-safe irány fordítva van')

// 5. A generált kódot NEM maszkoljuk — a „mindent maszkolunk" szabály épp azt
//    mosta össze, amit szét kellett volna választani.
if (!cnpMaszkolando(ENDRE_ERTEKE)) ok('a generált egyházi azonosítót nem rejtegetjük fölöslegesen')
else fail('a generált kódot is maszkolnánk — az összemosás marad')

// 6. A címke ŐSZINTE.
if (/Egyházi azonosító/.test(cnpMezoCimke(ENDRE_ERTEKE))) ok('a cnp mező címkéje „Egyházi azonosító"')
else fail(`a cnp mező címkéje: „${cnpMezoCimke(ENDRE_ERTEKE)}"`)

// 7. Üres bemenet = törlés, nem hiba.
{
  const e = ellenorizSzemelyiSzam('')
  if (e.rendben && e.tisztitott === '') ok('az üres bemenet a szám törlését jelenti, nem hibát')
  else fail(`üres bemenet: ${JSON.stringify(e)}`)
}

// 8. A VALÓDI román CNP átmegy, és jelezzük is, hogy annak ismertük fel.
{
  const e = ellenorizSzemelyiSzam(VALODI_CNP)
  if (e.rendben && e.romanCnp) ok('az érvényes román CNP átmegy, és felismerjük')
  else fail(`érvényes CNP elutasítva: ${JSON.stringify(e)}`)
}

// 9. AZ ELLENŐRZŐ SZÁMJEGY SZÁMÍT — elgépelt CNP rosszabb, mint a hiányzó.
{
  const rossz = VALODI_CNP.slice(0, 12) + (Number(VALODI_CNP[12]) === 9 ? '8' : String(Number(VALODI_CNP[12]) + 1))
  const e = ellenorizSzemelyiSzam(rossz)
  if (!e.rendben && /ellenőrző/i.test(e.hiba || '')) ok('a hibás ellenőrző számjegyű CNP-t elutasítjuk')
  else fail(`a hibás checksumú CNP átment: ${JSON.stringify(e)}`)
}

// 10. Külföldi azonosítót NEM utasítunk el — a rendszer nem csak romániai
//     tagokat tart nyilván (és a merev 13-jegyes szabály korábban elárasztotta
//     a Hibák fület ál-hibákkal).
{
  const e = ellenorizSzemelyiSzam('HU-1234567AB')
  if (e.rendben && !e.romanCnp) ok('külföldi azonosító menthető, de nem állítjuk róla, hogy román CNP')
  else fail(`külföldi azonosító elutasítva: ${JSON.stringify(e)}`)
}

// 11. A NEM 13 JEGYŰ, csupa számjegyű azonosítót ELFOGADJUK — de kimondjuk,
//     hogy nem ellenőriztük. A korábbi változat HANGOS HIBÁVAL utasította el,
//     ami a magyar (11 jegy), a bolgár EGN (10) és az ukrán (10) azonosítót is
//     „elgépelted a CNP-t"-ként dobta vissza. A rendszer nem csak romániai
//     tagokat tart nyilván.
{
  const magyar = ellenorizSzemelyiSzam('12345678901')
  if (magyar.rendben && !magyar.romanCnp && magyar.figyelmeztetes) {
    ok('a 11 jegyű (magyar) azonosító menthető, de jelezzük, hogy nem ellenőriztük')
  } else fail(`11 jegyű azonosító: ${JSON.stringify(magyar)}`)
}

// 11b. A perjeles (cseh/szlovák) írásképet NEM csonkoljuk el.
{
  const e = ellenorizSzemelyiSzam('760319/0000')
  if (e.rendben && e.tisztitott === '760319/0000') ok('a perjeles hivatalos íráskép megmarad')
  else fail(`perjeles azonosító: ${JSON.stringify(e)}`)
}

// 11c. A TESZT-GYÜLEKEZET seedje (EC-TSZT-…) is egyházi azonosító. Élesben 48
//      ilyen sor van; a korábbi minta négy SZÁMJEGYET várt az EC- után, ezért
//      mind a 48 tag „személyes adatnak tűnő érték" címkét kapott.
{
  const alakok = ['EC-TSZT-01F', 'EC-TSZT-15C3', 'EC-TSZT2-L01']
  const rosszak = alakok.filter((a) => azonositoFajta(a) !== 'egyhazi')
  if (rosszak.length === 0) ok('a teszt-gyülekezet EC-TSZT-… kódjait is felismerjük')
  else fail(`nem ismertük fel egyházi azonosítóként: ${rosszak.join(', ')}`)
}

// 11d. A VALÓDI CNP kapuja: erre épül a szemely.cnp mentési tiltása.
{
  if (mod.valodiCnpGyanus(VALODI_CNP) && !mod.valodiCnpGyanus('EC-2026-999YQWMWU7') && !mod.valodiCnpGyanus('9991234567')) {
    ok('a valódiCnpGyanus kapu pontosan a valódi CNP-re illeszkedik')
  } else fail('a valodiCnpGyanus kapu téves — vagy átenged valódi CNP-t, vagy generált kódot tilt')
}

// 12. A formázás (szóköz, kötőjel) nem akadály — a tárolt érték tiszta.
{
  const e = ellenorizSzemelyiSzam('1 960229-414127')
  if (e.rendben && e.tisztitott === VALODI_CNP) ok('a szóköz/kötőjel eltávolítódik a mentés előtt')
  else fail(`normalizálás: ${JSON.stringify(e)}`)
}

// ── (B) A TÁROLÁS HELYE ──────────────────────────────────────────────────────
const migracio = olvas(MIGRACIO)

// 13. KÜLÖN TÁBLA, nem a szemely oszlopa.
if (/CREATE TABLE IF NOT EXISTS public\.szemely_szemelyi_szam/.test(migracio)) {
  ok('a hivatalos szám KÜLÖN táblában él')
} else fail('nincs külön tábla — a szemely oszlopaként a taglista tömegesen kiadná')

// 14. A `szemely.cnp`-hez NEM nyúlunk (nincs ALTER a cnp-n).
if (!/ALTER TABLE public\.szemely[\s\S]{0,200}cnp/.test(migracio)) {
  ok('a migráció NEM nyúl a szemely.cnp oszlophoz (a szülő-FK célpontja)')
} else fail('a migráció hozzányúl a cnp-hez — a hivatkozott érték átírása 23503-mal bukik')

// 15. RLS bekapcsolva + SZŰK policy (saját gyülekezet, aktív munkatárs).
if (/ENABLE ROW LEVEL SECURITY/.test(migracio) && /current_user_congregation_id\(\)/.test(migracio)) {
  ok('a táblán RLS van, saját gyülekezetre szűkítve')
} else fail('nincs RLS vagy nem saját gyülekezetre szűk — állami azonosítónál ez kötelező')

// 16. A tágabb, felettes szinteket is beengedő helper NEM szerepel a POLICY-ban.
//     ⚠️ A fejléc-komment SZÁNDÉKOSAN megnevezi (elmagyarázza, miért térünk el
//     tőle), ezért a kommenteket ki kell szűrni — különben az őr a saját
//     magyarázatunkon bukna el.
{
  const migracioKod = migracio.replace(/^\s*--.*$/gm, '')
  if (!/current_user_can_access_congregation/.test(migracioKod)) {
    ok('a policy NEM a tágabb, felettes szinteket is beengedő helpert használja')
  } else fail('a policy beengedi a felettes szinteket — állami azonosítónál ez túl tág')
}

// 17. MENTÉS-BESOROLÁS — enélkül a napi mentés fail-closed megáll.
if (/backup_table_policy[\s\S]{0,400}szemely_szemelyi_szam/.test(migracio)) {
  ok('a tábla be van sorolva a mentés-politikába')
} else fail('BESOROLATLAN tábla — a napi mentés meg fog állni')

// 18. anon jog visszavonva.
if (/REVOKE ALL ON public\.szemely_szemelyi_szam FROM anon/.test(migracio)) ok('az anon jogosultság visszavonva')
else fail('az anon jogosultság nincs visszavonva')

// ── (C) AZ ÉRTÉK NEM JÖN LE A KARTONNAL ──────────────────────────────────────
const actions = olvas(ACTIONS)
const actionsKod = kodCsak(actions)

// 19. Két külön út: állapot (érték nélkül) és felfedés (naplózva).
if (/export async function vanSzemelyiSzam/.test(actionsKod) && /export async function getSzemelyiSzam/.test(actionsKod)) {
  ok('külön út az állapotra és az érték felfedésére')
} else fail('nincs szétválasztva az állapot és az érték — a maszk puszta látvány lenne')

// 20. Az állapot-lekérdezés NEM választja ki magát a számot.
{
  const ablak = actionsKod.match(/export async function vanSzemelyiSzam[\s\S]*?\n}/)
  if (ablak && !/select\('[^']*szemelyi_szam/.test(ablak[0])) {
    ok('az állapot-lekérdezés nem kéri le magát a számot')
  } else fail('az állapot-lekérdezés lehozza a számot — akkor a maszkolásnak nincs értelme')
}

// 21. A felfedés NAPLÓZÓDIK.
{
  const ablak = actionsKod.match(/export async function getSzemelyiSzam[\s\S]*?\n}/)
  if (ablak && /logAuditEvent/.test(ablak[0]) && /szemelyi_szam_megtekintve/.test(ablak[0])) {
    ok('a felfedés naplózódik')
  } else fail('a felfedés nem naplózódik — a GDPR-ígéret üres')
}

// 22. A NAPLÓ SOHA nem viszi magát a számot.
if (!/metadata:\s*\{[^}]*szemelyi_szam:/.test(actionsKod)) ok('a napló nem tartalmazza magát a számot')
else fail('a napló metaadatába bekerülne az állami azonosító')

// 23. Fail-closed kapu: idegen gyülekezet tagjánál elutasítás.
if (/congregation_id !== congregationId/.test(actionsKod) && /ok: false/.test(actionsKod)) {
  ok('idegen gyülekezet tagjánál a kapu fail-closed')
} else fail('a kapu nem zárja ki az idegen gyülekezet tagját')

// 24. A migráció hiánya NEM hoz nyers Postgres-hibát a lelkészhez.
if (/TABLA_HIANY_MINTA/.test(actionsKod)) ok('a hiányzó tábla érthető magyar üzenetet ad')
else fail('a migráció előtt nyers hibaüzenet jutna a lelkészhez')

// 25. Az egyediségi ütközés MAGYARUL szól.
if (/23505/.test(actionsKod) && /MÁR egy másik személyhez tartozik/.test(actions)) {
  ok('a duplikált szám érthető magyar üzenetet ad')
} else fail('a duplikált szám nyers angol Postgres-hibát adna')

// ── (D) A FELÜLET ────────────────────────────────────────────────────────────
const karton = olvas(KARTON)
const kartonKod = kodCsak(karton)

// 26. A kartonon a `cnp` ŐSZINTE címkét kap.
if (/label=\{cnpMezoCimke\(member\.cnp\)\}/.test(kartonKod)) ok('a kartonon a cnp címkéje érték-függő és őszinte')
else fail('a kartonon a cnp továbbra is „Személyi szám (CNP)" fix címkét kap')

// 27. A hivatalos szám KÜLÖN mezőként jelenik meg.
if (/<SzemelyiSzamMezo[^>]*szemelyId=\{member\.id\}/.test(kartonKod)) ok('a hivatalos szám külön mezőként jelenik meg')
else fail('a hivatalos szám nem jelenik meg a kartonon')

// 27b. ⛔ ADATVÉDELMI ŐR: a karton NEM remountol személyváltáskor (a host
//      `key` nélkül rendereli a dialógust). `key` nélkül a felfedett érték és
//      a „már naplóztam" jelző ÁTÖRÖKLŐDNE a KÖVETKEZŐ személyre — annak
//      azonosítója azonnal csupaszon látszana, naplóbejegyzés nélkül.
{
  const kulcsosak = [
    { nev: 'CnpRejtett', minta: /<CnpRejtett[^>]*key=\{member\.id\}/ },
    { nev: 'SzemelyiSzamMezo', minta: /<SzemelyiSzamMezo[^>]*key=\{member\.id\}/ },
  ]
  const hianyzo = kulcsosak.filter((k) => !k.minta.test(kartonKod)).map((k) => k.nev)
  if (hianyzo.length === 0) ok('mindkét azonosító-mező személyenként remountol (key)')
  else fail(`key nélküli mező — az előző személy értéke átöröklődne: ${hianyzo.join(', ')}`)
}

// 28. Az érték-függő maszkolás a kartonon is érvényes.
if (/cnpMaszkolando\(member\.cnp\)/.test(kartonKod)) ok('a kartonon a maszkolás érték-függő')
else fail('a kartonon nem érték-függő a maszkolás')

// 29. A mező-komponens az ÁLLAPOTOT tölti be, nem az értéket.
{
  const mezo = kodCsak(olvas(MEZO))
  if (/vanSzemelyiSzam\(szemelyId\)/.test(mezo) && /getSzemelyiSzam\(szemelyId\)/.test(mezo)) {
    ok('a mező betöltéskor csak az állapotot kéri, az értéket külön')
  } else fail('a mező betöltéskor az értéket is lehozza')
}

// 30. A szerkesztés ÜRES mezővel indul — a meglévő érték előtöltése napló
//     nélküli felfedés volna.
{
  const mezo = olvas(MEZO)
  if (/setPiszkozat\(''\)\n\s*setSzerkeszt\(true\)/.test(mezo)) ok('a szerkesztés üres mezővel indul (nincs napló nélküli felfedés)')
  else fail('a szerkesztés előtölti a meglévő értéket — az naplózatlan felfedés')
}

// ── (E) AZ EXCEL-EXPORT FEJLÉCE ──────────────────────────────────────────────
const excel = olvas(EXCEL)

// 31. A fejléc nem mondja „CNP"-nek a generált kódot.
if (/displayName: 'Egyházi azonosító', technical: 'cnp'/.test(excel)) {
  ok('az Excel-export fejléce „Egyházi azonosító"')
} else fail('az Excel-export „CNP" fejléccel írja ki a generált kódot — HAMIS ADAT')

// 32. A hivatalos szám NEM kerül az Excel-tükörbe.
if (!/szemelyi_szam/.test(excel)) ok('a hivatalos szám nincs az Excel-tükörben')
else fail('a hivatalos szám bekerülne az Excel-exportba')

// 33. Sem a kapcsolat nélküli (Dexie) tükörbe.
if (!/szemely_szemelyi_szam/.test(olvas(TABLA_REGISTRY))) ok('a hivatalos szám nincs a kapcsolat nélküli tükörben')
else fail('a hivatalos szám bekerülne a kapcsolat nélküli másolatba')

// ── (F) AZ AUDIT TÉNYLEG ÍR ──────────────────────────────────────────────────
const audit = olvas(AUDIT)
const auditKod = kodCsak(audit)

// 34. A nem-UUID azonosító a metaadatba megy — különben a Postgres 22P02-t dob
//     az UUID oszlopra, és a hívó `console.warn`-nal lenyeli. A tagnyilvántartás
//     EGÉSZ audit-nyomvonala (member.remove, note_update, consent_update,
//     registry.note_update, cnp_megtekintve) emiatt SOHA nem írt egy sort sem.
if (/UUID_MINTA/.test(auditKod) && /target_ref/.test(auditKod)) {
  ok('a nem-UUID azonosító a metaadatba kerül (az audit tényleg ír)')
} else fail('a nem-UUID target_id 22P02-t dobna — az audit némán elveszne')

// 35. A visszaesési (legacy) ág is a JAVÍTOTT értékeket küldi.
{
  const legacy = auditKod.match(/const legacy = await supabase\.rpc[\s\S]{0,300}/)
  if (legacy && /p_target_id: targetId/.test(legacy[0]) && /p_metadata: metadata/.test(legacy[0])) {
    ok('a visszaesési ág is a szétválasztott értékeket küldi')
  } else fail('a visszaesési ág a nyers targetId-t küldi — ott újra elveszne az audit')
}

// ── (F2) A MÁSODIK KÖR VÉDELMEI (adversariális felülvizsgálat után) ─────────
// A PR #229 friss kódjában nyolc hiba volt; ezek az asszertek azokat őrzik.

// 36. HATÓKÖR: EGY igazságforrás. A kapu az EFFEKTÍV gyülekezettel dolgozott,
//     a DB-policy a PROFIL-skalárral — ahol a kettő eltért (admin-belépés,
//     szerepkör-váltás), a kapu átengedett, a policy 0 sort adott, és a mező
//     azt írta: „nincs rögzítve". Néma hazugság.
if (/profileCongregationId/.test(actionsKod) && /profileCongregationId !== congregationId/.test(actionsKod)) {
  ok('a kapu MÉRI a hatókör-eltérést, és kimondja')
} else fail('a kapu nem méri a profil ⇄ effektív gyülekezet eltérést — a mező némán „nincs rögzítve"-t írna')

// 37. Az RLS-elutasításból ne jusson nyers angol Postgres-szöveg a lelkészhez.
if (/rlsElutasitas/.test(actionsKod) && /42501/.test(actionsKod)) ok('az RLS-elutasítás magyar üzenetet kap')
else fail('az RLS-elutasítás nyers 42501-es szövegként jutna ki')

// 38. ⛔ A TÖRLÉS NE LEGYEN NÉMA SIKER 0 SORNÁL. `.select()` nélkül a Supabase
//     nem hibázik, ha semmit nem érintett — a kód „törölve"-t jelentett volna,
//     és HAMIS audit-bejegyzést írt volna egy meg nem történt törlésről.
{
  const torles = actionsKod.match(/if \(!e\.tisztitott\)[\s\S]*?\n  \}/)
  if (torles && /\.select\('id_szemely'\)/.test(torles[0]) && /torolt\.length === 0/.test(torles[0])) {
    ok('a törlés ellenőrzi az érintett sorokat (nincs néma siker)')
  } else fail('a törlés `.select()` nélkül fut — 0 érintett sornál „sikeres törlést" jelentene')
}

// 39. Ugyanez az írásra.
if (/mentett\.length === 0/.test(actionsKod)) ok('a mentés ellenőrzi az érintett sorokat')
else fail('a mentés néma 0-soros írásnál is sikert jelentene')

// 40. ⛔ FAIL-CLOSED FELFEDÉS: naplózatlanul NEM adjuk ki az értéket. A súgó azt
//     ígéri, hogy „minden megjelenítés naplózódik" — a `logAuditEvent` viszont
//     minden hibát elnyelt, tehát az ígéret csendben hamissá válhatott.
{
  const felfed = actionsKod.match(/export async function getSzemelyiSzam[\s\S]*?\n}/)
  if (felfed && /const naplozva = await logAuditEvent/.test(felfed[0]) && /if \(!naplozva\)/.test(felfed[0])) {
    ok('a felfedés fail-closed: napló nélkül nincs érték')
  } else fail('a felfedés naplózatlanul is kiadná a számot — a GDPR-ígéret üres lenne')
}

// 41. A `logAuditEvent` MEGMONDJA, sikerült-e — enélkül a 40. asszert nem is
//     volna teljesíthető.
if (/Promise<boolean>/.test(auditKod)) ok('a logAuditEvent jelzi, ha nem sikerült írnia')
else fail('a logAuditEvent továbbra is Promise<void> — a hívó nem tudhatja, írt-e')

// 42. ⛔ FELFEDÉS-VERSENY: kérés-token nélkül „A" hivatalos száma megjelenhetne
//     „B" kartonján (a karton nem remountol, a kérés meg úton van).
{
  const mezo = kodCsak(olvas(MEZO))
  const felfed = mezo.match(/async function felfed\(\)[\s\S]*?\n  \}/)
  if (felfed && /const token = \+\+kerelemRef\.current/.test(felfed[0]) && /kerelemRef\.current !== token/.test(felfed[0])) {
    ok('a felfedésnek van kérés-tokenje (nem keveredhet két személy száma)')
  } else fail('a felfedésnek NINCS kérés-tokenje — „A" száma megjelenhet „B" neve alatt')
}

// 43. A FORRÁS-ÚT LEZÁRÁSA: valódi CNP nem kerülhet az egyházi azonosítóba.
{
  const tagActions = olvas(path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'tagnyilvantartas', 'actions.ts'))
  const kod = kodCsak(tagActions)
  const helyek = (kod.match(/valodiCnpGyanus\(/g) || []).length
  if (helyek >= 2) ok('a tag-mentés MINDKÉT ágán (INSERT + UPDATE) tiltja a valódi CNP-t')
  else fail(`a valódi CNP tiltása csak ${helyek} helyen van — az INSERT és az UPDATE ág is kell`)
}

// 44. Az Excel-visszaírás NEM módosíthatja az egyházi azonosítót (a szülő-FK-n
//     ON UPDATE CASCADE van: egy átírt cella némán átkulcsolná a gyermekek
//     szülő-hivatkozását, a gyülekezet-határon is átnyúlva).
{
  const excelKod = kodCsak(excel)
  const diff = kodCsak(olvas(path.join(REPO, 'apps', 'web', 'lib', 'offline', 'excel-import-diff.ts')))
  const review = kodCsak(olvas(path.join(REPO, 'apps', 'web', 'components', 'offline', 'excel-import-review.tsx')))
  const jo =
    /technical: 'cnp'[^}]*csakOlvashato: true/.test(excelKod) &&
    /field\.csakOlvashato/.test(diff) &&
    /csakOlvashatoNelkul\(/.test(review)
  if (jo) ok('az Excel-körút nem írhatja vissza az egyházi azonosítót')
  else fail('az Excelben átírt azonosító visszamenne a szerverre — néma szülő-átkulcsolás')
}

// 45. Az ADATEXPORT allowlist: ami nincs benne, az némán kimarad a „teljes"
//     csomagból — pedig az érintettnek joga van hozzá.
{
  const exportTerv = olvas(path.join(REPO, 'apps', 'web', 'lib', 'export', 'gyulekezeti-export.ts'))
  if (/kozvetlen\('szemely_szemelyi_szam'/.test(exportTerv)) ok('a hivatalos szám benne van az adatexport tervében')
  else fail('a hivatalos szám kimaradna az adatexportból — jogi kitettség')
}

// 46. A zod-plafon az ÉLŐ oszlophoz igazodik (varchar(20)), különben 21-40
//     karakternél nyers 22001 jut a lelkészhez.
{
  const val = olvas(path.join(REPO, 'apps', 'web', 'lib', 'validations', 'members.ts'))
  if (/cnp: z\.string\(\)\.trim\(\)\.max\(20/.test(val)) ok('az egyházi azonosító hossz-plafonja az élő oszlophoz igazodik (20)')
  else fail('a zod-plafon nem 20 — az élő oszlop varchar(20), a különbség nyers 22001-et ad')
}

// 47. A migráció indoklása a MÉRT tényeket írja le (nem a séma-dumpból vett
//     téves NO ACTION-t).
if (/UPDATE: CASCADE/.test(migracio) && /HELYESBÍTÉS/.test(migracio)) ok('a migráció a mért FK-viselkedést rögzíti')
else fail('a migráció indoklása nem tartalmazza a mért FK-viselkedést')

// ── (G) MUTÁNSOK — a hibás világ visszajátszása ──────────────────────────────
// M1: a fail-safe irány megfordítása (ismeretlen alak → egyházi) → a 4.
//     asszertnek buknia kell. Ez a legveszélyesebb elrontás: a legacy
//     importból származó VALÓDI CNP-ket fedné fel.
{
  const forras = olvas(LIB).replace(
    "  return 'szemelyes'\n}",
    "  return 'egyhazi'\n}",
  )
  try {
    const m = betolt(forras, 'mutans1.ts')
    if (!m.cnpMaszkolando('ABC-12345')) ok('M1 mutáns: fordított fail-safe irány → az őr buktatná')
    else fail('M1 mutáns TÚLÉLTE — a 4. asszert vak')
  } catch (e) {
    fail(`M1 mutáns futtatási hiba: ${e?.message || e}`)
  }
}

// M2: a checksum-ellenőrzés kivétele → a 9. asszertnek buknia kell.
{
  const forras = olvas(LIB).replace(
    'if (!validateRomanianCnp(tisztitott)) {',
    'if (false) {',
  )
  try {
    const m = betolt(forras, 'mutans2.ts')
    const rossz = VALODI_CNP.slice(0, 12) + (Number(VALODI_CNP[12]) === 9 ? '8' : String(Number(VALODI_CNP[12]) + 1))
    if (m.ellenorizSzemelyiSzam(rossz).rendben) ok('M2 mutáns: checksum nélkül → az őr buktatná')
    else fail('M2 mutáns TÚLÉLTE — a 9. asszert vak')
  } catch (e) {
    fail(`M2 mutáns futtatási hiba: ${e?.message || e}`)
  }
}

// M3: az állapot-lekérdezés lehozza az értéket → a 20. asszertnek buknia kell.
{
  const mutans = actionsKod.replace(
    /(export async function vanSzemelyiSzam[\s\S]*?)\.select\('orszag, modositva'\)/,
    "$1.select('szemelyi_szam, orszag, modositva')",
  )
  const ablak = mutans.match(/export async function vanSzemelyiSzam[\s\S]*?\n}/)
  if (ablak && /select\('[^']*szemelyi_szam/.test(ablak[0])) ok('M3 mutáns: állapot-lekérdezés az értékkel → az őr buktatná')
  else fail('M3 mutáns TÚLÉLTE — a 20. asszert vak')
}

// M4: a felfedés naplózásának kivétele → a 21. asszertnek buknia kell.
{
  const mutans = actionsKod.replace(/szemelyi_szam_megtekintve/g, 'valami_mas')
  const ablak = mutans.match(/export async function getSzemelyiSzam[\s\S]*?\n}/)
  if (ablak && !/szemelyi_szam_megtekintve/.test(ablak[0])) ok('M4 mutáns: naplózatlan felfedés → az őr buktatná')
  else fail('M4 mutáns TÚLÉLTE — a 21. asszert vak')
}

// M5: a régi, hazug Excel-fejléc → a 31. asszertnek buknia kell.
{
  const mutans = excel.replace(/displayName: 'Egyházi azonosító', technical: 'cnp'/, "displayName: 'CNP', technical: 'cnp'")
  if (!/displayName: 'Egyházi azonosító', technical: 'cnp'/.test(mutans)) ok('M5 mutáns: „CNP" fejléc → az őr buktatná')
  else fail('M5 mutáns TÚLÉLTE — a 31. asszert vak')
}

// M6: az audit-javítás visszavonása → a 34. asszertnek buknia kell.
{
  const mutans = auditKod.replace(/UUID_MINTA/g, 'MAS_NEV').replace(/target_ref/g, 'valami')
  if (!/UUID_MINTA/.test(mutans) || !/target_ref/.test(mutans)) ok('M6 mutáns: audit-javítás nélkül → az őr buktatná')
  else fail('M6 mutáns TÚLÉLTE — a 34. asszert vak')
}

// M7: a hatókör-eltérés mérésének kivétele → a 36. asszertnek buknia kell.
{
  const mutans = actionsKod.replace(/profileCongregationId !== congregationId/g, 'false')
  if (!/profileCongregationId !== congregationId/.test(mutans)) ok('M7 mutáns: hatókör-eltérés mérése nélkül → az őr buktatná')
  else fail('M7 mutáns TÚLÉLTE — a 36. asszert vak')
}

// M8: a törlés `.select()`-jének kivétele → a 38. asszertnek buknia kell.
{
  const mutans = actionsKod.replace(/\.select\('id_szemely'\)/g, '')
  const torles = mutans.match(/if \(!e\.tisztitott\)[\s\S]*?\n  \}/)
  if (!torles || !/\.select\('id_szemely'\)/.test(torles[0])) ok('M8 mutáns: ellenőrizetlen törlés → az őr buktatná')
  else fail('M8 mutáns TÚLÉLTE — a 38. asszert vak')
}

// M9: a fail-closed felfedés visszavonása → a 40. asszertnek buknia kell.
{
  const mutans = actionsKod.replace(/if \(!naplozva\)/g, 'if (false)')
  const felfed = mutans.match(/export async function getSzemelyiSzam[\s\S]*?\n}/)
  if (!felfed || !/if \(!naplozva\)/.test(felfed[0])) ok('M9 mutáns: naplózatlanul is kiadná → az őr buktatná')
  else fail('M9 mutáns TÚLÉLTE — a 40. asszert vak')
}

// M10: a felfedés kérés-tokenjének kivétele → a 42. asszertnek buknia kell.
{
  const mezo = kodCsak(olvas(MEZO)).replace(/const token = \+\+kerelemRef\.current\n/g, '')
  const felfed = mezo.match(/async function felfed\(\)[\s\S]*?\n  \}/)
  if (!felfed || !/const token = \+\+kerelemRef\.current/.test(felfed[0])) {
    ok('M10 mutáns: token nélküli felfedés → az őr buktatná')
  } else fail('M10 mutáns TÚLÉLTE — a 42. asszert vak')
}

// M11: a `key` elvétele → a 27b. asszertnek buknia kell.
{
  const mutans = kartonKod.replace(/<SzemelyiSzamMezo key=\{member\.id\}/g, '<SzemelyiSzamMezo')
  if (!/<SzemelyiSzamMezo[^>]*key=\{member\.id\}/.test(mutans)) ok('M11 mutáns: key nélküli mező → az őr buktatná')
  else fail('M11 mutáns TÚLÉLTE — a 27b. asszert vak')
}

// M12: a csak-olvasható jelölés elvétele → a 44. asszertnek buknia kell.
{
  const mutans = kodCsak(excel).replace(/, csakOlvashato: true/g, '')
  if (!/technical: 'cnp'[^}]*csakOlvashato: true/.test(mutans)) ok('M12 mutáns: visszaírható azonosító-oszlop → az őr buktatná')
  else fail('M12 mutáns TÚLÉLTE — a 44. asszert vak')
}

if (failed) {
  console.error('\nA személyi szám önellenőrzés ELBUKOTT.')
  process.exit(1)
}
console.log('\nA személyi szám önellenőrzés RENDBEN.')
