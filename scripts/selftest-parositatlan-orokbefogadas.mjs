#!/usr/bin/env node
/**
 * PÁROSÍTATLAN TÉTEL ÖRÖKBEFOGADÁSA önellenőrzés (2026-09-03, Endre 1. — P0)
 *
 * A JAVÍTOTT HIBA. A készpénzes rögzítő „Párosítatlan tétel átvétele" választója
 * azt ígérte a feliratában, hogy a bankban MÁR MEGLÉVŐ tétel PÁRJÁT rögzíti.
 * A valóság más volt:
 *
 *   1. az onChange csak a dátumot, az összeget és a bankszámlát írta a sorba,
 *      a kiválasztott tétel AZONOSÍTÓJÁT ELDOBTA;
 *   2. mentéskor a saveInternalTransferUseCase FRISS párosító kulccsal
 *      MINDKÉT lábat újra beszúrta.
 *
 * Vagyis minden „átvétel" egy TELJES ÚJ átvezetést gyártott: ugyanarra a pénzre
 * két könyvelési sor keletkezett, a régi árva sor pedig érintetlen maradt. A
 * hiba NÉMA és ÖNGERJESZTŐ volt: a piros „párosítatlan" jelzés nem tűnt el
 * (most a régi árva maradt pár nélkül), amit a lelkész úgy értett, hogy „nem
 * sikerült" — és újra átvette. Kapu sem védett: a belső mozgás sorok kimaradnak
 * a mentés-előellenőrzésből ÉS a hasonló-tétel kapuból is.
 *
 * Kilenc, egymástól függetlenül elromolható védelem:
 *
 *   (1) A választó ELTÁROLJA a kiválasztott tételt — side + id PÁRKÉNT.
 *   (2) A side + id pár KÖTELEZŐ: a két oldal azonosítói KÉT KÜLÖNBÖZŐ tábláé
 *       (befizetes.id / kiadas.id), csupasz szám némán hamis találatot ad.
 *   (3) A mentés VELE VISZI az azonosítót (pushTransfer → payload → action).
 *   (4) A szerver CSAK A HIÁNYZÓ LÁBAT szúrja be (kellBef / kellKia).
 *   (5) FAIL-CLOSED ELŐELLENŐRZÉS, a mestersor ELŐTT: törölt/sztornózott,
 *       eltérő összeg, rossz helyszín → megállunk, mielőtt bármit írtunk.
 *   (6) A KOMPENZÁCIÓ nem törölhet kulcs szerint — az elvinné az örökbefogadott
 *       (idegen) sort is.
 *   (7) A SAJÁT kiválasztás mindig bent marad a jelölt-listában, különben a
 *       select értékéhez nincs opció, és a jelölés némán elpárolog.
 *   (8) A „már a vázlatban" rejtés DARABSZÁM szerint megy, nem összeg szerint.
 *   (9) ÜRES ÁLLAPOT + helyszín-szűrés + devizás tételek kizárása.
 *
 * NEGATÍV ASSZERT (a repó szabálya: őrszem mutáns nélkül vak): minden őrhöz
 * visszajátsszuk a hibás világot, és bizonyítjuk, hogy az őr elbuktatná.
 *
 * Futtatás:  node scripts/selftest-parositatlan-orokbefogadas.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

const BODY = path.join(REPO, 'packages', 'ui-app', 'src', 'finance', 'CombinedEntryBody.tsx')
const SAVE = path.join(REPO, 'packages', 'core', 'src', 'finance', 'belsomozgas', 'save.ts')
const SCHEMA = path.join(REPO, 'packages', 'validations', 'src', 'finance', 'belsomozgas.ts')
const ACTIONS = path.join(REPO, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')
const HEALTH = path.join(REPO, 'apps', 'web', 'lib', 'finance', 'internal-movement-health.ts')

let failed = false
const ok = (m) => console.log(`OK:   ${m}`)
const fail = (m) => { failed = true; console.error(`HIBA: ${m}`) }

const CR = String.fromCharCode(13)
const olvas = (f) => fs.readFileSync(f, 'utf8').split(CR).join('')
/** Kommentek nélkül — a repó tele van MIÉRT-kommentekkel, amelyekben SZÓ SZERINT
 *  szerepelnek a keresett minták; nélküle az őr a saját magyarázatát mérné. */
const kodCsak = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const f of [BODY, SAVE, SCHEMA, ACTIONS, HEALTH]) {
  if (!fs.existsSync(f)) fail(`hiányzó fájl: ${path.relative(REPO, f)}`)
}
if (failed) { console.error('\nAz örökbefogadás-önellenőrzés ELBUKOTT.'); process.exit(1) }

function orzo(cimke, forras, minta, mutans) {
  const kod = kodCsak(forras)
  if (!minta.test(kod)) { fail(`${cimke} — hiányzik`); return }
  if (minta.test(kodCsak(mutans(forras)))) fail(`${cimke} — az őr VAK: a mutáns is átment`)
  else ok(cimke)
}

/** Függvényhatáros ablak: a fix slice(i, i+N) átlógna a szomszéd függvénybe. */
function ablak(forras, kezdoJelzo, vegJelzo) {
  const kod = kodCsak(forras)
  const i = kod.indexOf(kezdoJelzo)
  if (i < 0) return ''
  const j = kod.indexOf(vegJelzo, i + kezdoJelzo.length)
  return j < 0 ? kod.slice(i) : kod.slice(i, j)
}

const bodyNyers = olvas(BODY)
const saveNyers = olvas(SAVE)

// ── (1) A VÁLASZTÓ ELTÁROLJA A KIVÁLASZTÁST ──────────────────────────────
orzo(
  '(1) az onChange elmenti a kiválasztott tételt a sorra',
  bodyNyers,
  /atvettParositatlan:\s*\{\s*side:\s*m\.side,\s*id:\s*m\.id\s*\}/,
  (s) => s.replace(/atvettParositatlan: \{ side: m\.side, id: m\.id \},\n\s*/g, ''),
)
orzo(
  '(1) a select értéke a kiválasztást tükrözi (nem ugrik vissza a placeholderre)',
  bodyNyers,
  /value=\{kivalasztott \? `\$\{kivalasztott\.side\}:\$\{kivalasztott\.id\}` : ''\}/,
  (s) => s.replace(/value=\{kivalasztott \? `\$\{kivalasztott\.side\}:\$\{kivalasztott\.id\}` : ''\}/g, 'value=""'),
)
orzo(
  '(1) a kiválasztott állapot LÁTHATÓ jelzést kap',
  bodyNyers,
  /ehhez a tételhez csatoljuk, nem lesz belőle új/,
  (s) => s.replace(/ehhez a tételhez csatoljuk, nem lesz belőle új/g, 'kivalasztva'),
)

// ── (2) side + id PÁR, NEM CSUPASZ SZÁM ──────────────────────────────────
{
  const kod = kodCsak(bodyNyers)
  if (/atvettParositatlan\?:\s*\{\s*side:\s*'income'\s*\|\s*'expense';\s*id:\s*number\s*\}/.test(kod)) {
    ok('(2) az EntryRow mezője side + id pár')
  } else {
    fail('(2) az átvett tétel jelölése nem side+id pár — a két oldal azonosítói KÉT külön tábláé, csupasz számmal a jelölés némán hamis találatot adna')
  }
  const mutans = kodCsak(bodyNyers.replace(
    /atvettParositatlan\?: \{ side: 'income' \| 'expense'; id: number \} \| null/g,
    'atvettParositatlan?: number | null',
  ))
  if (!/atvettParositatlan\?:\s*\{\s*side:/.test(mutans)) ok('NEGATÍV — a csupasz számot az őr elkapná')
  else fail('NEGATÍV — az őr VAK a csupasz számra')
  if (/key=\{`\$\{m\.side\}:\$\{m\.id\}`\}/.test(kod)) ok('(2) az opció React-kulcsa stabil azonosítóból jön')
  else fail('(2) az opció React-kulcsa nem a stabil side:id párból jön')
}

// ── (3) AZ AZONOSÍTÓ ELMEGY A MENTÉSSEL ──────────────────────────────────
orzo(
  '(3) a pushTransfer átadja az átvett tétel azonosítóját',
  bodyNyers,
  /const parositando = r\.atvettParositatlan[\s\S]{0,200}?oldal: r\.atvettParositatlan\.side/,
  (s) => s.replace(/const parositando = r\.atvettParositatlan[\s\S]{0,200}?: null\n/, 'const parositando = null\n'),
)
{
  const kod = kodCsak(bodyNyers)
  const db = (kod.match(/megjegyzes: r\.megjegyzes\.trim\(\) \|\| '[^']*', parositando \}/g) || []).length
  if (db === 2) ok('(3) MINDKÉT irány (letétel + felvét) viszi az azonosítót')
  else fail(`(3) csak ${db} irány viszi az azonosítót (2 kell) — a másik irány továbbra is duplikálna`)
}
{
  const kod = kodCsak(olvas(ACTIONS))
  if (/parositando: data\.parositando \?\? null/.test(kod)) ok('(3) a szerver-action továbbadja a core-nak')
  else fail('(3) a szerver-action NEM adja tovább — az azonosító a webes rétegben elveszne')
  const sema = kodCsak(olvas(SCHEMA))
  if (/parositando: z[\s\S]{0,200}?oldal: z\.enum\(\['income', 'expense'\]\)/.test(sema)) {
    ok('(3) a validációs séma ismeri a mezőt (különben a zod némán levágná)')
  } else fail('(3) a validációs sémában nincs parositando — a zod levágná, és a mentés csendben duplikálna')
}

// ── (4) CSAK A HIÁNYZÓ LÁB ───────────────────────────────────────────────
orzo(
  '(4) örökbefogadásnál a meglévő oldalt NEM szúrjuk be újra',
  saveNyers,
  /const kellBef = !\(orokbe && orokbe\.tabla === 'befizetes'\)[\s\S]{0,200}?const kellKia = !\(orokbe && orokbe\.tabla === 'kiadas'\)/,
  (s) => s.replace(/const kellBef = [^\n]*\n/, 'const kellBef = true\n').replace(/const kellKia = [^\n]*\n/, 'const kellKia = true\n'),
)
orzo(
  '(4) a bevétel-láb beszúrása feltételes',
  saveNyers,
  /if \(kellBef\) \{\s*const befIns = await/,
  (s) => s.replace(/if \(kellBef\) \{\s*const befIns = await/g, 'if (true) { const befIns = await'),
)
orzo(
  '(4) a kiadás-láb beszúrása feltételes',
  saveNyers,
  /if \(kellKia\) \{\s*const kiaIns = await/,
  (s) => s.replace(/if \(kellKia\) \{\s*const kiaIns = await/g, 'if (true) { const kiaIns = await'),
)
orzo(
  '(4) a pár közös kulcsot kap az örökbefogadott sorral',
  saveNyers,
  /const pairXkey = orokbe \? orokbe\.xkey : ujBelsoMozgasXkey\(\)/,
  (s) => s.replace(/const pairXkey = orokbe \? orokbe\.xkey : ujBelsoMozgasXkey\(\)/g, 'const pairXkey = ujBelsoMozgasXkey()'),
)

// ── (5) FAIL-CLOSED ELŐELLENŐRZÉS ────────────────────────────────────────
{
  const w = ablak(saveNyers, 'if (clean.parositando) {', '  try {')
  if (!w) {
    fail('(5) nincs örökbefogadás-előellenőrzés a mestersor BESZÚRÁSA ELŐTT')
  } else {
    const probak = [
      [/if \(c\.deleted \|\| c\.stornozott\)/, 'törölt/sztornózott célsor elutasítása'],
      [/celCent !== ujCent/, 'CENTRE pontos összeg-egyezés'],
      [/\(c\.bankszamla_id \?\? null\) !== \(varhatoBank \?\? null\)/, 'helyszín-őr (kassza vs bank)'],
      [/if \(celErr\)/, 'olvasási hiba → megállunk (fail-closed)'],
      [/if \(!cel\)/, 'eltűnt célsor → megállunk'],
    ]
    for (const [minta, nev] of probak) {
      if (minta.test(w)) ok(`(5) ${nev}`)
      else fail(`(5) HIÁNYZIK: ${nev}`)
    }
    const kod = kodCsak(saveNyers)
    const iEllenor = kod.indexOf('if (clean.parositando) {')
    const iMester = kod.indexOf(".from('belsomozgas')")
    if (iEllenor >= 0 && iMester > iEllenor) ok('(5) az előellenőrzés a mestersor BESZÚRÁSA ELŐTT fut')
    else fail('(5) az előellenőrzés a mestersor UTÁN fut — egy elbukott ellenőrzés árva mestersort hagyna')
  }
}

// ── (6) A KOMPENZÁCIÓ NEM TÖRÖLHET KULCS SZERINT ─────────────────────────
{
  // ⚠️ A VÉG-JELZŐ NEM LEHET KOMMENT: a kodCsak() kitörli, és az ablak a fájl
  // végéig lóg — belefogná a bank→bank ág kompenzációját is, ahol a kulcs
  // szerinti törlés SZABÁLYOS (ott nincs örökbefogadás). Ezért kód-jelző.
  const w = ablak(saveNyers, 'if (kiaIns.error) {', "clean.tipus === 'bank_bank'")
  if (!w) {
    fail('(6) a kiadás-láb kompenzációs ága nem található')
  } else if (/\.eq\('belso_mozgas_xkey', pairXkey\)/.test(w)) {
    fail('(6) a kompenzáció KULCS szerint töröl — örökbefogadásnál ez az idegen, MEGLÉVŐ sort is elvinné')
  } else if (/\.eq\('id', befUjId\)/.test(w)) {
    ok('(6) a kompenzáció csak az ÁLTALUNK beszúrt sort vonja vissza')
  } else {
    fail('(6) a kompenzáció nem azonosító szerint céloz')
  }
  const regiVilag = ".update({ deleted: true }).eq('belso_mozgas_xkey', pairXkey)"
  if (/\.eq\('belso_mozgas_xkey', pairXkey\)/.test(regiVilag)) ok('NEGATÍV — a kulcs szerinti törlést a minta elkapja')
  else fail('NEGATÍV — a kulcs-kereső minta VAK')
}

// ── (7) A SAJÁT KIVÁLASZTÁS MINDIG BENT MARAD ────────────────────────────
orzo(
  '(7) a sor saját kiválasztása sosem esik ki a jelölt-listából',
  bodyNyers,
  /if \(enyem\(m\)\) \{ jeloltek\.push\(m\); continue \}/,
  (s) => s.replace(/if \(enyem\(m\)\) \{ jeloltek\.push\(m\); continue \}\n\s*/g, ''),
)

// ── (8) DARABSZÁM SZERINTI REJTÉS ────────────────────────────────────────
{
  const w = ablak(bodyNyers, 'const foglaltak = new Map<string, number>()', 'const kivalasztott =')
  if (!w) {
    fail('(8) a „már a vázlatban" számláló nem található')
  } else {
    if (/foglaltak\.set\(k, \(foglaltak\.get\(k\) \?\? 0\) \+ 1\)/.test(w)) {
      ok('(8) a foglaltság DARABSZÁMOT számol (nem logikai „van ilyen összeg")')
    } else {
      fail('(8) a rejtés nem darabszám-alapú: két azonos összegű tételnél a MÁSODIK is némán eltűnne')
    }
    if (/if \(sor\.id === r\.id\) continue/.test(w)) {
      ok('(8) a sor SAJÁT maga elől nem foglal')
    } else {
      fail('(8) a sor a saját összegével kizárná a saját jelöltjét')
    }
  }
}

// ── (9) ÜRES ÁLLAPOT + HELYSZÍN + DEVIZA ─────────────────────────────────
orzo(
  '(9) üres állapotban KIMONDJUK, hogy nincs mit átvenni',
  bodyNyers,
  /Nincs párosítatlan tétel, amit ide át lehetne venni/,
  (s) => s.replace(/Nincs párosítatlan tétel, amit ide át lehetne venni/g, 'nincs'),
)
orzo(
  '(9) helyszín-szűrés: csak a megfelelő oldalon álló tétel ajánlható',
  bodyNyers,
  /\(m\.bankszamlaId != null\) === varhatoBankos/,
  (s) => s.replace(/ && \(m\.bankszamlaId != null\) === varhatoBankos/g, ''),
)
orzo(
  '(9) devizás tételt NEM ajánlunk fel (a rögzítő arfolyam: 1-gyel könyvelne)',
  bodyNyers,
  /valaszthatoMind = oldalHelyes\.filter\(\(m\) => !m\.devizas\)/,
  (s) => s.replace(/\.filter\(\(m\) => !m\.devizas\)/g, ''),
)
{
  const kod = kodCsak(bodyNyers)
  const w = ablak(bodyNyers, 'function renderParositatlanValaszto', 'function focusNextField')
  if (/\.slice\(0, 25\)/.test(w)) {
    fail('(9) visszatért a néma 25-ös csonkolás — a felirat a csonkolt hosszt mutatná')
  } else ok('(9) nincs néma csonkolás a jelölt-listán')
  if (/\{szabadDb\} választható/.test(kod)) ok('(9) a felirat a ténylegesen választható darabszámot mutatja')
  else fail('(9) a felirat nem a választható darabszámot mutatja')
}
{
  const h = kodCsak(olvas(HEALTH))
  const db = (h.match(/osszegRon:/g) || []).length
  if (db >= 2) ok('(9) az egészség-ellenőrző MINDKÉT oldalon továbbadja a RON-ekvivalenst')
  else fail(`(9) a RON-ekvivalens csak ${db} helyen megy tovább (2 kell)`)
  if (/devizas: e\.foreign/.test(h) && /devizas: inc\.foreign/.test(h)) ok('(9) a deviza-jelző is végigmegy')
  else fail('(9) a deviza-jelző nem megy tovább — a választó nem tudná kiszűrni a devizás tételeket')
}

if (failed) { console.error('\nAz örökbefogadás-önellenőrzés ELBUKOTT.'); process.exit(1) }
console.log('\nAz örökbefogadás-önellenőrzés rendben.')
