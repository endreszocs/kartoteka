#!/usr/bin/env node
/**
 * PÉNZÜGYI HATÓKÖR-MAG önellenőrzés (2026-08-17, kerületi S5 szelet).
 *
 * Mit véd: `apps/web/lib/auth/finance-scope-core.ts` — a `tablesFor` és a
 * `yearValueFor` TISZTA függvény, ami eldönti, hogy egy pénzügyi művelet MELYIK
 * TÁBLÁRA ír, és milyen TÍPUSÚ év-értékkel szűr.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A TESZT — A 12. CSAPDA
 * ════════════════════════════════════════════════════════════════════════════
 * A két függvény 2026-08-17 előtt „minden más" ággal zárt:
 *
 *     if (scope === 'diocese') { return { …megyei… } }
 *     return { …gyülekezeti… }
 *     …
 *     return scope === 'diocese' ? year : String(year)
 *
 * Amikor a `FinanceScope` unió HARMADIK értéket kapott (`'district'` — a
 * kerület saját könyvet vezet, Endre K2 döntése), A FORDÍTÓ NEM SZÓLT VOLNA:
 * a kerületi könyvelés NÉMÁN a GYÜLEKEZETI `befizetes` / `kiadas` táblákba
 * írt volna. Nem hibaüzenet, nem üres lista — rossz helyre könyvelt, hivatalos
 * pénz. Ugyanez az év-értékkel: `String(2026)` egy `int` PK-ra 0 sort ad,
 * vagyis a zárás-ellenőrzés „nincs véglegesítve"-t mondana egy LEZÁRT évre.
 *
 * A javítás EXHAUSTIVE SWITCH `never`-ellenőrzésű `default` ággal. Ez a fajta
 * szabály a legkönnyebben esik vissza egy későbbi refaktorban, mert a `default`
 * ág „fölösleges kódnak" látszik. Ezért van rá assert.
 *
 * ÖT DOLGOT ŐRZÜNK:
 *   (1) mind a HÁROM scope a HELYES tábla-készletet adja;
 *   (2) a district SOHA nem ad gyülekezeti (és soha nem ad megyei) táblát;
 *   (3) a `yearValueFor` TÍPUSA scope-onként helyes (string ⇄ number);
 *   (4) ISMERETLEN scope DOB — nem esik vissza némán a gyülekezeti ágra;
 *   (5) a GYÜLEKEZETI és a MEGYEI térkép BYTE-RA VÁLTOZATLAN (regresszió-őr:
 *       ez a szelet az élesben futó 1. és 2. szintet nem mozdíthatja el).
 *
 * Futtatás:  node scripts/selftest-finance-scope.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const FORRAS = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'auth', 'finance-scope-core.ts')
const GAZDA = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'auth', 'finance-scope.ts')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

if (!fs.existsSync(FORRAS)) {
  fail(`hiányzik a forrás: ${FORRAS}`)
  process.exit(1)
}

const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try {
  ts = require_('typescript')
} catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-finance-scope-selftest-'))

/**
 * TS → CJS, majd betöltés.
 *
 * Fail-closed: ha valaha PROJEKT-import kerülne a magba (pl. `server-only`, a
 * Supabase kliens vagy a level-scope), a `require()` ismeretlen modulra futna.
 * Inkább ITT bukjon el, érthető üzenettel — a döntési magnak import-mentesnek
 * KELL maradnia, különben ez a teszt némán kihagyhatóvá válna.
 */
function loadTs(srcFile, outName) {
  const code = fs.readFileSync(srcFile, 'utf8')
  const out = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      isolatedModules: true,
    },
    fileName: outName + '.ts',
  })
  const idegen = [...out.outputText.matchAll(/require\(["']([^"']+)["']\)/g)]
    .map((m) => m[1])
    .filter((m) => !m.startsWith('node:') && !m.startsWith('.'))
  if (idegen.length > 0) {
    throw new Error(
      `${outName}: FUTÁSIDEJŰ PROJEKT-IMPORT került a fájlba (${idegen.join(', ')}). ` +
        'A pénzügyi hatókör-döntés magja csak import nélkül tesztelhető önállóan.',
    )
  }
  const dest = path.join(tmp, outName + '.js')
  fs.writeFileSync(dest, out.outputText, 'utf8')
  return require_(dest)
}

let mag
try {
  mag = loadTs(FORRAS, 'finance-scope-core')
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

const { tablesFor, yearValueFor } = mag

if (typeof tablesFor !== 'function' || typeof yearValueFor !== 'function') {
  fail('a mag nem exportálja a tablesFor / yearValueFor függvényt')
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

const egyenlo = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ────────────────────────────────────────────────────────────────────────────
// A VÁRT TÉRKÉPEK — SZÁNDÉKOSAN KÉZZEL KIÍRVA, NEM A FORRÁSBÓL SZÁRMAZTATVA.
// Ha a forrásból olvasnánk ki őket, a teszt együtt mozdulna a hibával, és
// pontosan azt a regressziót nem venné észre, amiért írtuk.
// ────────────────────────────────────────────────────────────────────────────

/** GYÜLEKEZET — élesben fut 2024 óta. Ez az alak NEM mozdulhat el. */
const VART_GYULEKEZET = {
  befizetes: 'befizetes',
  kiadas: 'kiadas',
  bealitas: 'bealitas',
  koltsegvetes: 'koltsegvetes',
  annualReport: 'annual_reports',
  scopeCol: 'congregation_id',
  yearColBealitas: 'id',
  yearColKtvs: 'bealitasid',
  finalizedCol: 'accounting_finalized',
  budgetFinalizedCol: 'budget_finalized',
  categoryColBefizetes: 'id_befizetescel',
  categoryColKiadas: 'id_kiadascel',
}

/** EGYHÁZMEGYE — élesben fut 2026-08-15 óta. Ez az alak sem mozdulhat el. */
const VART_MEGYE = {
  befizetes: 'diocese_befizetes',
  kiadas: 'diocese_kiadas',
  bealitas: 'diocese_bealitas',
  koltsegvetes: 'diocese_koltsegvetes',
  annualReport: 'diocese_annual_reports',
  scopeCol: 'diocese_id',
  yearColBealitas: 'eve',
  yearColKtvs: 'eve',
  finalizedCol: 'szamadas_veglegesitve',
  budgetFinalizedCol: 'koltsegvetes_veglegesitve',
  categoryColBefizetes: 'id_szamadasicel',
  categoryColKiadas: 'id_szamadasicel',
}

/** EGYHÁZKERÜLET — 2026-08-17 (K2). A megyei alak tükre, `district_` előtaggal. */
const VART_KERULET = {
  befizetes: 'district_befizetes',
  kiadas: 'district_kiadas',
  bealitas: 'district_bealitas',
  koltsegvetes: 'district_koltsegvetes',
  annualReport: 'district_annual_reports',
  scopeCol: 'district_id',
  yearColBealitas: 'eve',
  yearColKtvs: 'eve',
  finalizedCol: 'szamadas_veglegesitve',
  budgetFinalizedCol: 'koltsegvetes_veglegesitve',
  categoryColBefizetes: 'id_szamadasicel',
  categoryColKiadas: 'id_szamadasicel',
}

// ────────────────────────────────────────────────────────────────────────────
// F1 — GYÜLEKEZET: az élesben futó alak BYTE-RA változatlan.
// ────────────────────────────────────────────────────────────────────────────
{
  const t = tablesFor('congregation')
  if (egyenlo(t, VART_GYULEKEZET)) {
    ok('F1 gyülekezeti térkép változatlan (nincs regresszió az 1. szinten)')
  } else {
    fail(`F1: a gyülekezeti térkép ELMOZDULT — ${JSON.stringify(t)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F2 — EGYHÁZMEGYE: az élesben futó alak BYTE-RA változatlan.
// ────────────────────────────────────────────────────────────────────────────
{
  const t = tablesFor('diocese')
  if (egyenlo(t, VART_MEGYE)) {
    ok('F2 megyei térkép változatlan (nincs regresszió a 2. szinten)')
  } else {
    fail(`F2: a megyei térkép ELMOZDULT — ${JSON.stringify(t)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F3 — EGYHÁZKERÜLET: saját `district_*` táblák, `district_id` scope-oszlop.
// ────────────────────────────────────────────────────────────────────────────
{
  const t = tablesFor('district')
  if (egyenlo(t, VART_KERULET)) {
    ok('F3 kerületi térkép: district_* táblák + district_id scope-oszlop')
  } else {
    fail(`F3: ${JSON.stringify(t)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F4 — ⛔ EZ A LÉNYEG. A KERÜLET SOHA NEM KAPHAT GYÜLEKEZETI TÁBLÁT.
//      Ez volt a 12. csapda tünete: a néma visszaesés a „minden más" ágra.
//      Nem elég a térkép-egyezés: külön, NEVESÍTETT assert kell rá, mert ez az,
//      amit egy későbbi „egyszerűsítés" (`if/else` visszaírása) elront.
// ────────────────────────────────────────────────────────────────────────────
{
  const k = tablesFor('district')
  const gy = tablesFor('congregation')
  const megye = tablesFor('diocese')
  const tablaMezok = ['befizetes', 'kiadas', 'bealitas', 'koltsegvetes', 'annualReport', 'scopeCol']
  const gyulekezetiSzivargas = tablaMezok.filter((m) => k[m] === gy[m])
  const megyeiSzivargas = tablaMezok.filter((m) => k[m] === megye[m])
  if (gyulekezetiSzivargas.length === 0 && megyeiSzivargas.length === 0) {
    ok('F4 a kerület SOHA nem ad gyülekezeti vagy megyei táblát (12. csapda)')
  } else {
    fail(
      'F4: a kerületi ág VISSZAESETT egy másik szint tábláira — ' +
        `gyülekezeti egyezés: [${gyulekezetiSzivargas}], megyei egyezés: [${megyeiSzivargas}]`,
    )
  }
  // Öv-és-nadrágtartó: minden kerületi tábla-név `district_` előtagú.
  const rosszElotag = ['befizetes', 'kiadas', 'bealitas', 'koltsegvetes', 'annualReport'].filter(
    (m) => !String(k[m]).startsWith('district_'),
  )
  if (rosszElotag.length === 0) {
    ok('F4b minden kerületi tábla-név district_ előtagú')
  } else {
    fail(`F4b: nem district_ előtagú kerületi tábla-nevek: [${rosszElotag}]`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F5 — ÉV-ÉRTÉK TÍPUSA scope-onként.
//      congregation → string (a `bealitas.id` szöveges PK),
//      diocese/district → number (a `*_bealitas.eve` int PK).
//      Ha ez elcsúszik, a PostgREST 0 sort ad, és a zárás-ellenőrzés NÉMÁN
//      „nincs véglegesítve"-t mond egy LEZÁRT évre → kinyílik a zárt év.
// ────────────────────────────────────────────────────────────────────────────
{
  const gy = yearValueFor('congregation', 2026)
  const me = yearValueFor('diocese', 2026)
  const ke = yearValueFor('district', 2026)
  if (typeof gy === 'string' && gy === '2026') {
    ok('F5a congregation → string ("2026")')
  } else {
    fail(`F5a: congregation év-érték ${typeof gy} (${JSON.stringify(gy)}) — stringnek kell lennie`)
  }
  if (typeof me === 'number' && me === 2026) {
    ok('F5b diocese → number (2026)')
  } else {
    fail(`F5b: diocese év-érték ${typeof me} (${JSON.stringify(me)}) — számnak kell lennie`)
  }
  if (typeof ke === 'number' && ke === 2026) {
    ok('F5c district → number (2026) — NEM string, mert a PK int')
  } else {
    fail(`F5c: district év-érték ${typeof ke} (${JSON.stringify(ke)}) — számnak kell lennie`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F6 — ISMERETLEN SCOPE DOB, mindkét függvényben.
//      Futásidőben ez a fail-closed háló a fordítói kapu alatt: soha nem esünk
//      vissza némán a gyülekezeti ágra. (A fordítói kapu maga a `never`
//      értékadás — azt a `tsc` őrzi, ezt a teszt.)
// ────────────────────────────────────────────────────────────────────────────
{
  let dobott = false
  try {
    tablesFor('negyedik_szint')
  } catch {
    dobott = true
  }
  if (dobott) {
    ok('F6a ismeretlen scope → tablesFor DOB (nem esik vissza gyülekezetire)')
  } else {
    fail('F6a: az ismeretlen scope NÉMÁN visszaesett — pontosan a 12. csapda')
  }

  let dobott2 = false
  try {
    yearValueFor('negyedik_szint', 2026)
  } catch {
    dobott2 = true
  }
  if (dobott2) {
    ok('F6b ismeretlen scope → yearValueFor DOB')
  } else {
    fail('F6b: az ismeretlen scope NÉMÁN String(year)-re esett vissza')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F7 — A FORDÍTÓI KAPU MEGLÉTE. A `never` értékadás az EGYETLEN, ami egy
//      jövőbeli NEGYEDIK szintnél fordítási hibát ad néma adatvesztés helyett.
//      Ha valaki „fölösleges kódként" kitörli, a futásidejű dobás megmaradhat,
//      de a fordító elnémul — ezért erre KÜLÖN assert kell.
// ────────────────────────────────────────────────────────────────────────────
{
  const forras = fs.readFileSync(FORRAS, 'utf8')
  // ⚠️ A KOMMENTEKET KI KELL SZEDNI a számolás előtt: a fájl fejléce SZÁNDÉKOSAN
  //    idézi a `const _nemLehet: never = scope` sort (ott magyarázza el, miért
  //    nem törölhető). Ha a nyers szövegben számolnánk, a teszt akkor is zöld
  //    maradna, ha a VALÓDI kapu eltűnik és csak a róla szóló komment marad.
  const kodCsak = forras.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
  const neverek = (kodCsak.match(/:\s*never\s*=\s*scope/g) || []).length
  if (neverek === 2) {
    ok('F7 a never-ellenőrzésű default ág megvan MINDKÉT függvényben (2 db, kommentek nélkül)')
  } else {
    fail(
      `F7: a \`const _nemLehet: never = scope\` fordítói kapu ${neverek} helyen van meg (2 kell). ` +
        'Enélkül egy negyedik szint NÉMÁN rossz táblába könyvelne.',
    )
  }
  if (!/\bswitch\s*\(\s*scope\s*\)/.test(kodCsak)) {
    fail('F7b: a magban nincs `switch (scope)` — visszaírták if/else-re?')
  } else {
    ok('F7b exhaustive switch (scope) alak megvan')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F8 — A GAZDA-MODUL RE-EXPORTÁLJA A MAGOT. A ~40 meglévő hívó a
//      `@/lib/auth/finance-scope`-ból importál — ha a re-export eltűnik, a
//      build áll meg (az még jó), de ha valaki „megjavítja" egy helyi
//      másolattal, visszatér a két, széthúzó implementáció hibaosztálya.
// ────────────────────────────────────────────────────────────────────────────
{
  if (!fs.existsSync(GAZDA)) {
    fail(`F8: hiányzik a gazda-modul: ${GAZDA}`)
  } else {
    // Ugyanaz a komment-kiszedés, mint az F7-ben, és ugyanabból az okból: a
    // gazda-modul KOMMENTJEI is emlegetik a `tablesFor`-t, a `district`-et és a
    // `kerulet` szintet — kommentre alapozott zöld jelzés hamis biztonság.
    const gazda = fs
      .readFileSync(GAZDA, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
    const reexport = /export\s*\{[^}]*tablesFor[^}]*yearValueFor[^}]*\}/.test(gazda)
    const helyiMasolat = /export\s+function\s+(tablesFor|yearValueFor)\s*\(/.test(gazda)
    if (reexport && !helyiMasolat) {
      ok('F8 a finance-scope.ts a magot re-exportálja (nincs helyi másolat)')
    } else if (helyiMasolat) {
      fail('F8: a finance-scope.ts HELYI MÁSOLATOT tart a tablesFor/yearValueFor-ból')
    } else {
      fail('F8: a finance-scope.ts nem re-exportálja a tablesFor/yearValueFor párost')
    }
    // A kerületi ág három kötelező eleme a kontextus-feloldóban.
    const keruletiAg =
      /resolveDistrictReadScopeIds/.test(gazda) &&
      /scope:\s*'district'/.test(gazda) &&
      /szamadasicelSzint:\s*'kerulet'/.test(gazda)
    if (keruletiAg) {
      ok('F8b a getFinanceScopeContext kerületi ága megvan (szerep-szűrt + kerulet szint)')
    } else {
      fail('F8b: a getFinanceScopeContext kerületi ága hiányos vagy nem szerep-szűrt feloldót hív')
    }
    // ⚠️ A kerületi ág CSAK a szerep-szűrt olvasó feloldót használhatja. A tág,
    //    szerep-SZŰRETLEN `resolveDistrictScopeId(s)` egy elavult
    //    `profiles.district_id` skalárral IDEGEN kerület könyveit nyitná meg.
    if (/resolveDistrictScopeIds?\s*\(/.test(gazda)) {
      fail(
        'F8c: a finance-scope.ts a SZEREP-SZŰRETLEN resolveDistrictScopeId(s)-t hívja — ' +
          'az elavult profiles.district_id skalárral idegen kerület könyveit nyithatja meg',
      )
    } else {
      ok('F8c a kerületi feloldás szerep-szűrt (nincs szűretlen resolveDistrictScopeIds hívás)')
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F9 — A SCOPE-TUDATOS BEFIZETŐ-KERESŐ EXHAUSTIVE KAPUJA (2026-08-22, 5a).
//
// A TÜNET, AMIT ŐRZÜNK: a megyei/kerületi „Tétel rögzítése" befizető-mezője
// SEMMIT nem adott. Nem „csak személyeket" — semmit: az egyetlen forrás a
// `searchMembersForFinance` volt, ami a `getProfileCongregation()` szerinti
// `effectiveCongregationId`-re szűr, az pedig FELSŐ SZINTŰ aktív profilnál
// definíció szerint `null` → azonnali üres tömb. NÉMA ÜRES LISTA.
//
// A javítás az új `searchIncomePartners` action, ami a `getFinanceScope()`-ra
// épül, EXHAUSTIVE SWITCH-csel. Ha valaki ezt egyszer visszaírja
// „egyszerűbb" `if (scope === 'diocese')` alakra, a negyedik szint (vagy egy
// átnevezett scope) MEGINT némán a gyülekezeti keresőre esne — ugyanaz a
// hibaosztály, csak egy szinttel feljebb.
//
// ⚠️ EZ SZÖVEG-ELLENŐRZÉS, ÉS AZ NÉMÁN VAKKÁ VÁLHAT (pl. ha a függvényt
//    átnevezik, az extraktor üres törzset adna, és minden „zöld" lenne).
//    Ezért MINDEN asszerthez tartozik NEGATÍV PÁR: legyártjuk a RÉGI, hibás
//    alakot (mutáns), és bizonyítjuk, hogy az ellenőrző elbukik rajta.
// ────────────────────────────────────────────────────────────────────────────
{
  const AKCIOK = path.join(REPO_ROOT, 'apps', 'web', 'app', '(dashboard)', 'penzugy', 'actions.ts')

  /** Kommentek kiszedése — a fájl SZÖVEGESEN is emlegeti a scope-ágakat. */
  const kodCsak = (szoveg) =>
    szoveg.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

  /** Egy top-level `export async function NEV(` törzsének kivágása a záró `}`-ig. */
  const fuggvenyTorzs = (szoveg, nev) => {
    const kezd = szoveg.indexOf(`export async function ${nev}(`)
    if (kezd < 0) return null
    const veg = szoveg.indexOf('\n}\n', kezd)
    return veg < 0 ? szoveg.slice(kezd) : szoveg.slice(kezd, veg + 3)
  }

  /**
   * AZ ELLENŐRZŐ. Ugyanez fut az ÉLES törzsön (üres listát kell adnia) és a
   * MUTÁNSOKON (nem-üres listát kell adnia).
   */
  const hibakSearch = (torzs) => {
    const h = []
    if (!torzs) return ['nincs meg a searchIncomePartners function']
    if (!/switch\s*\(\s*scope\.scope\s*\)/.test(torzs)) h.push('nincs `switch (scope.scope)` — visszaírták if/else-re?')
    for (const ag of ['congregation', 'diocese', 'district']) {
      if (!new RegExp(`case\\s*'${ag}'\\s*:`).test(torzs)) h.push(`hiányzik a \`case '${ag}'\` ág`)
    }
    if (!/:\s*never\s*=\s*scope\.scope/.test(torzs)) h.push('nincs `const _nemLehet: never = scope.scope` fordítói kapu')
    if (!/getFinanceScope\s*\(/.test(torzs)) h.push('nem a getFinanceScope()-ot használja (a getProfileCongregation() felső szinten null!)')
    if (/getProfileCongregation\s*\(/.test(torzs)) h.push('MÉG MINDIG a getProfileCongregation()-t hívja — az felső szinten null → néma üres lista')
    return h
  }

  if (!fs.existsSync(AKCIOK)) {
    fail(`F9: hiányzik a pénzügyi action-fájl: ${AKCIOK}`)
  } else {
    const forras = kodCsak(fs.readFileSync(AKCIOK, 'utf8'))
    const torzs = fuggvenyTorzs(forras, 'searchIncomePartners')

    // ── F9a: POZITÍV — az éles törzs hibátlan ───────────────────────────────
    const elesHibak = hibakSearch(torzs)
    if (elesHibak.length === 0) {
      ok('F9a searchIncomePartners: exhaustive switch + never-kapu + getFinanceScope')
    } else {
      fail(`F9a: ${elesHibak.join(' · ')}`)
    }

    // ── F9b: NEGATÍV — hiányzó scope-ág (a néma üres lista visszatérése) ────
    // ⚠️ Enélkül az asszert VAK lenne: egy mindig-üres ellenőrző is „zöld".
    const mutansAgNelkul = (torzs || '').replace(/case\s*'district'\s*:/, "case 'ELGEPELT':")
    if (hibakSearch(mutansAgNelkul).some((x) => x.includes("case 'district'"))) {
      ok("F9b NEGATÍV: hiányzó `case 'district'` ágra az ellenőrző ELBUKIK (nem vak)")
    } else {
      fail("F9b: a mutáns (district-ág elrontva) ÁTMENT — az F9a asszert VAK, nem véd semmit")
    }

    // ── F9c: NEGATÍV — kitörölt never-kapu (a fordítói kapu „fölösleges kód") ─
    const mutansKapuNelkul = (torzs || '').replace(/const\s+_nemLehet\s*:\s*never\s*=\s*scope\.scope/, 'const _nemLehet = scope.scope')
    if (hibakSearch(mutansKapuNelkul).some((x) => x.includes('never'))) {
      ok('F9c NEGATÍV: a never-kapu törlésére az ellenőrző ELBUKIK')
    } else {
      fail('F9c: a mutáns (never-kapu nélkül) ÁTMENT — a kapu-asszert VAK')
    }

    // ── F9d: NEGATÍV — visszaírás a RÉGI, hibás forrásra ────────────────────
    const mutansRegiForras = (torzs || '').replace(/getFinanceScope\s*\(/g, 'getProfileCongregation(')
    if (hibakSearch(mutansRegiForras).length > 0) {
      ok('F9d NEGATÍV: a getProfileCongregation()-re visszaírt alak ELBUKIK (ez volt maga a hiba)')
    } else {
      fail('F9d: a RÉGI, felső szinten mindig üres listát adó alak ÁTMENT az ellenőrzőn')
    }

    // ────────────────────────────────────────────────────────────────────────
    // F10 — A MENTÉS FAIL-CLOSED KAPUJA. A befizető-partner azonosítója a
    //       KLIENSTŐL jön, és a szerver-akció publikus végpont: vakon beírva
    //       egy megyei ügyintéző IDEGEN megye gyülekezetét címezhetné meg a
    //       saját bevételi során. Ezért a `saveIncomeBatch`-nek a saját
    //       hatókörére VISSZA KELL ELLENŐRIZNIE (`feloldBefizetoPartner`).
    // ────────────────────────────────────────────────────────────────────────
    const mentesTorzs = fuggvenyTorzs(forras, 'saveIncomeBatch')
    const hibakMentes = (t) => {
      const h = []
      if (!t) return ['nincs meg a saveIncomeBatch function']
      if (!/feloldBefizetoPartner\s*\(/.test(t)) h.push('nem hívja a feloldBefizetoPartner()-t — a kliens-prop vakon íródna FK-ba')
      return h
    }
    if (hibakMentes(mentesTorzs).length === 0) {
      ok('F10a saveIncomeBatch: a befizető-FK szerveroldali (hatókörre kötött) ellenőrzésen megy át')
    } else {
      fail(`F10a: ${hibakMentes(mentesTorzs).join(' · ')}`)
    }
    const mutansEllenorzesNelkul = (mentesTorzs || '').replace(/feloldBefizetoPartner\s*\(/g, 'nyersKliensAdat(')
    if (hibakMentes(mutansEllenorzesNelkul).length > 0) {
      ok('F10b NEGATÍV: az ellenőrzés kivételére a teszt ELBUKIK (nem vak)')
    } else {
      fail('F10b: a szerveroldali ellenőrzés NÉLKÜLI alak ÁTMENT — az F10a asszert VAK')
    }

    // ── F10c: a feloldó MAGA hatókörre köt (eq diocese_id / district_id) ────
    const feloldoKezd = forras.indexOf('async function feloldBefizetoPartner(')
    const feloldo = feloldoKezd < 0 ? null : forras.slice(feloldoKezd, forras.indexOf('\n}\n', feloldoKezd) + 3)
    const hibakFeloldo = (t) => {
      const h = []
      if (!t) return ['nincs meg a feloldBefizetoPartner function']
      if (!/\.eq\('diocese_id',\s*scopeId\)/.test(t)) h.push("a gyülekezet-partner nincs a SAJÁT megyéhez kötve (.eq('diocese_id', scopeId))")
      if (!/\.eq\('district_id',\s*scopeId\)/.test(t)) h.push("az egyházmegye-partner nincs a SAJÁT kerülethez kötve (.eq('district_id', scopeId))")
      return h
    }
    if (hibakFeloldo(feloldo).length === 0) {
      ok('F10c a feloldó MINDKÉT ágon a saját hatókörre szűr (nincs idegen partner)')
    } else {
      fail(`F10c: ${hibakFeloldo(feloldo).join(' · ')}`)
    }
    const mutansSzuresNelkul = (feloldo || '').replace(/\.eq\('district_id',\s*scopeId\)/g, '')
    if (hibakFeloldo(mutansSzuresNelkul).length > 0) {
      ok('F10d NEGATÍV: a hatókör-szűrő kivételére a teszt ELBUKIK')
    } else {
      fail('F10d: a hatókör-szűrő NÉLKÜLI alak ÁTMENT — az F10c asszert VAK')
    }
  }
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nPénzügyi hatókör-mag önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nPénzügyi hatókör-mag önellenőrzés: minden zöld')
