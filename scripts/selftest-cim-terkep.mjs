#!/usr/bin/env node
/**
 * CÍM ⇄ TÉRKÉP önellenőrzés (2026-08-11) — build/tesztkeret nélkül futtatható
 * (a selftest-reszszamadas.mjs mintájára).
 *
 * KÉT tiszta forrást fordít le és ellenőriz:
 *   apps/web/lib/members/directions.ts        (a térkép-állapot + a külföld-kapu)
 *   apps/web/lib/members/validation-engine.ts (a Hibák fül tétele)
 *
 * A LEGFONTOSABB ÁLLÍTÁS (K-blokk):
 *   KÜLFÖLDI TELEPÜLÉSRE SOHA NEM SZÜLETIK HIBA.
 *   A gyülekezet tagjainak egy része Budapesten, Debrecenben, Gödöllőn,
 *   Győrben, Hollandiában él. Ezeknek nincs és nem is lehet román nevük, a
 *   Google Térkép viszont a saját nevükön tökéletesen megtalálja őket — a
 *   címük tehát NEM hibás. Ha ezekre jeleznénk, a lelkész tucatnyi HAMIS
 *   hibát kapna egy eddig megbízható listában, és onnantól az egészet
 *   figyelmen kívül hagyná. Ez a visszaesés legvalószínűbb formája, ezért
 *   kap saját, sűrű lefedettséget.
 *
 * Futtatás:  node scripts/selftest-cim-terkep.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const DIRECTIONS_SRC = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'members', 'directions.ts')
const ENGINE_SRC = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'members', 'validation-engine.ts')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)
const check = (cond, msg) => (cond ? ok(msg) : fail(msg))

for (const f of [DIRECTIONS_SRC, ENGINE_SRC]) {
  if (!fs.existsSync(f)) {
    fail(`hiányzik a forrás: ${f}`)
    process.exit(1)
  }
}

const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try {
  ts = require_('typescript')
} catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-cim-terkep-selftest-'))
function loadTs(srcFile, outName) {
  const code = fs.readFileSync(srcFile, 'utf8')
  const out = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: outName + '.ts',
  })
  // Fail-closed: a `validation-engine.ts` CSAK `import type`-ot használ (azt a
  // transpiler kidobja). Ha valaha VALÓDI futásidejű import kerülne bele, a
  // motor elveszítené a tisztaságát — inkább ITT bukjon el, érthető üzenettel.
  if (/require\(["'][^."']/.test(out.outputText)) {
    throw new Error(
      `${outName}: FUTÁSIDEJŰ IMPORT került a fájlba — a tiszta modul önállóan nem fordítható.`,
    )
  }
  const dest = path.join(tmp, outName + '.js')
  fs.writeFileSync(dest, out.outputText, 'utf8')
  return require_(dest)
}

let dir, engine
try {
  dir = loadTs(DIRECTIONS_SRC, 'directions')
  engine = loadTs(ENGINE_SRC, 'validation-engine')
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

const {
  assessAddressMap,
  buildDirectionsTarget,
  formatRomanianAddress,
  isCountryNamedLocality,
  isLocalityMapResolvable,
  isStreetMapResolvable,
  isRomanianCountry,
  isOrszagtorzsErtelmes,
  isPlaceholderLocality,
  isProvablyRomanianLocality,
  resolveCountyName,
  shouldReportUnresolvableLocality,
} = dir
const { validateMember, validateAll } = engine

// ── Adat-gyártók ────────────────────────────────────────────────────────────

const ROMANIA = { id: 1, name: 'România', sname: 'RO', name_hu: 'Románia', name_ro: 'România' }
const MAGYARORSZAG = { id: 2, name: 'Magyarország', sname: 'HU', name_hu: 'Magyarország', name_ro: 'Ungaria' }
const HOLLANDIA = { id: 3, name: 'Hollandia', sname: 'NL', name_hu: 'Hollandia', name_ro: 'Olanda' }

/**
 * ⏳ AZ ORSZÁGTÖRZS KÉT ÁLLAPOTA — EZ A KÖR LEGFONTOSABB ÚJ FIXTURE-JE.
 *
 * MÉRT TÉNY: az éles `adrcountry` táblában EGYETLEN sor van (Románia). Ilyen
 * törzsben a „Románia" NEM tény, hanem ALAPÉRTELMEZÉS — Budapest, Debrecen,
 * Gödöllő, Győr és „Hollandia" is annak látszik. A kód ezért ilyenkor
 * SZÁNDÉKOSAN néma; a jelzés a 2026-08-11-orszagok-es-kulfoldi-telepulesek.sql
 * lefutása után indul.
 *
 * ⚠️ MINDEN „jelzünk" irányú állítás MINDKÉT állapotban meg van írva:
 *    egy sorosban NÉMA, három sorosban JELEZ. Az előző körben pontosan ez
 *    hiányzott — 90 zöld állítás fért meg 0 éles jelzéssel.
 */
const ORSZAGTORZS_EGYSOROS = { ismertOrszagok: 1 } // a MAI éles állapot
const ORSZAGTORZS_KESZ = { ismertOrszagok: 3 } // a migráció UTÁNI állapot

/** A migráció által létrehozott semleges külföldi megye (name_ro NÉLKÜL). */
const kulfoldMegye = (orszag) => ({
  id: 900 + (orszag.id ?? 0), name: '(külföld)', name_hu: '(külföld)', name_ro: null,
  siruta_code: null, auto_code: null, country: orszag,
})

/** Egy VALÓDI, seedelt román megye (mind a 42-nek van SIRUTA + rendszámkód). */
const COVASNA = {
  id: 15, name: 'Covasna', name_hu: 'Kovászna', name_ro: 'Covasna',
  siruta_code: '15', auto_code: 'CV', country: ROMANIA,
}
/**
 * A LEGACY „?" PLACEHOLDER MEGYE — pontosan ez ült a Barátos-soron, mielőtt a
 * 2026-08-11-roman-helysegnevek-potlasa.sql átkötötte Covasnára. Ilyen megye
 * mellett az ország NEM állapítható meg, tehát hallgatni kell.
 */
const KERDOJEL_MEGYE = { id: 99, name: '?', name_hu: null, name_ro: null, siruta_code: null, auto_code: null, country: ROMANIA }
/** Megye, aminek az országa nem is jött le (RLS, hiányzó JOIN). */
const ISMERETLEN_MEGYE = { id: 98, name: 'valami', name_ro: null, siruta_code: null, auto_code: null, country: null }

const loc = (over = {}) => ({
  id: 1, name: 'Falu', name_hu: null, name_ro: null,
  default_postalcode: null, siruta_code: null, needs_review: false,
  geo_lat: null, geo_lng: null, geo_verified_at: null,
  county: COVASNA,
  ...over,
})

const member = (over = {}) => ({
  id: 1, cnp: null, csaladnev: 'Kovács', k_nev: 'János', sz_datum: '1970-01-01',
  anyjaneve: 'Szabó Anna', email: null, telefon: null, meghalt: false,
  c_helysegid: null, c_utcaid: null,
  ...over,
})

// ═════════════════════════════════════════════════════════════════════════════
// A. A TÉRKÉP-ÁLLAPOT HÁROM ÁLLAPOTA (a karton kis ikonja)
// ═════════════════════════════════════════════════════════════════════════════

// A1 — rendben: hivatalos román település- ÉS utcanév.
check(
  assessAddressMap({
    locality: loc({ name: 'Barátos', name_ro: 'Brateș', default_postalcode: '527050' }),
    street: { id: 5, name: 'Főút', name_ro: 'Principală', street_type_ro: 'Strada' },
    houseNumber: '144',
  }).status === 'megtalalhato',
  'A1 · hivatalos román település + utca → „megtalalhato"',
)

// A2 — bizonytalan: a település hivatalos, az utcának nincs román neve.
{
  const a = assessAddressMap({
    locality: loc({ name: 'Barátos', name_ro: 'Brateș' }),
    street: { id: 5, name: 'Főút', name_ro: null },
    houseNumber: '144',
  })
  check(a.status === 'bizonytalan', 'A2 · település hivatalos, utca nem → „bizonytalan"')
  check(a.label.length > 0 && a.detail.length > 20, 'A2 · van rövid címke ÉS teljes magyar mondat (title + aria-label)')
}

// A3 — nem található: a településnek sincs román neve.
// ⚠️ 2026-08-11: az állapot MOST MÁR az országtörzstől is függ. Ez a hívás
//    kimondja, hogy az ország valódi információt hordoz (a migráció lefutott).
check(
  assessAddressMap({
    locality: loc({ name: 'Barátos' }),
    street: { id: 5, name: 'Főút' },
    houseNumber: '144',
  }, ORSZAGTORZS_KESZ).status === 'nem-talalhato',
  'A3 · a település sem oldható fel → „nem-talalhato"',
)
// A3b — ÁTMENETI, DE TEHERHORDÓ: paraméter NÉLKÜL fail-closed. A karton töltés
// közben (`details` még null) pontosan ide esik, és egy pillanatra sem villant
// hamis riasztást.
check(
  assessAddressMap({
    locality: loc({ name: 'Barátos' }),
    street: { id: 5, name: 'Főút' },
    houseNumber: '144',
  }).status === 'nem-ellenorizheto',
  'A3b · országtörzs-adat NÉLKÜL semleges marad (fail-closed, nincs hamis riasztás)',
)

// A4 — utca nélküli falusi cím hivatalos névvel: RENDBEN (ez a normális eset).
check(
  assessAddressMap({
    locality: loc({ name: 'Barátos', name_ro: 'Brateș' }),
    street: null,
    houseNumber: '144',
  }).status === 'megtalalhato',
  'A4 · utca nélküli falusi cím hivatalos településnévvel → „megtalalhato"',
)

// A5 — egyeztetett pont a településen: román név NÉLKÜL is rendben.
check(
  assessAddressMap({
    locality: loc({ name: 'Barátos', geo_lat: 45.9, geo_lng: 26.1, geo_verified_at: '2026-08-11T10:00:00Z' }),
    street: null,
    houseNumber: '144',
  }).status === 'megtalalhato',
  'A5 · egyeztetett település-pont felülírja a hiányzó román nevet',
)

// A6 — nincs semmilyen cím.
check(
  assessAddressMap({ locality: null, street: null, houseNumber: null }).status === 'nincs-cim',
  'A6 · üres cím → „nincs-cim" (a felület ilyenkor hallgat)',
)
check(assessAddressMap(null).status === 'nincs-cim', 'A6b · null cím → „nincs-cim", nem omlik össze')

// A7 — a segédfüggvények külön is helyesek.
check(isLocalityMapResolvable(loc({ name_ro: 'Brateș' })) === true, 'A7 · isLocalityMapResolvable: román névvel igaz')
check(isLocalityMapResolvable(loc()) === false, 'A7b · isLocalityMapResolvable: román név nélkül hamis')
check(isStreetMapResolvable({ name: 'Főút' }) === false, 'A7c · isStreetMapResolvable: magyar utcanévre hamis')
check(isStreetMapResolvable(null) === false, 'A7d · isStreetMapResolvable: null-ra hamis')
// A 0,0 pont (Guineai-öböl) sosem valódi lakcím.
check(
  isLocalityMapResolvable(loc({ geo_lat: 0, geo_lng: 0, geo_verified_at: '2026-08-11T10:00:00Z' })) === false,
  'A7e · a 0,0 „pont" nem számít egyeztetettnek',
)

// ─────────────────────────────────────────────────────────────────────────────
// A8 — A MEGERŐSÍTETT PONT FELÜLÍR MINDEN NÉVHIÁNYT.
// Ez a blokk a REGRESSZIÓ ŐRE: a korábbi változat kiszámolta a célpontot, majd
// eldobta, és csak a település nevét nézte — így a kartonon EGYSZERRE jelent
// meg a piros „A térkép nem találja" pirula ÉS a zöld „Ez a cím egyeztetve van
// a térképpel." mondat. Az elvégzett munkára mondtunk hibát.
// ─────────────────────────────────────────────────────────────────────────────
{
  // Utca-szintű egyeztetett pont, ROMÁN NÉV NÉLKÜLI településen.
  const cim = {
    locality: loc({ name: 'Barátos' }), // nincs name_ro, nincs pont
    street: { id: 5, name: 'Főút', geo_lat: 46.0512, geo_lng: 26.2841, geo_verified_at: '2026-08-11T10:00:00Z' },
    houseNumber: '144',
  }
  const target = buildDirectionsTarget(cim)
  check(
    target.kind === 'koordinata' && target.precision === 'utca' && target.verified === true,
    'A8 · a célpont a HÁZIG visz (egyeztetett utca-pont)',
  )
  check(
    assessAddressMap(cim).status === 'megtalalhato',
    'A8b · …és az állapot is „megtalalhato" — NEM mondhat ellent a saját célpontjának',
  )
}
{
  // Település-szintű pont + magyar nevű utca → a térkép a faluig visz.
  const a = assessAddressMap({
    locality: loc({ name: 'Barátos', geo_lat: 45.9, geo_lng: 26.1, geo_verified_at: '2026-08-11T10:00:00Z' }),
    street: { id: 5, name: 'Főút' },
    houseNumber: '144',
  })
  check(a.status === 'bizonytalan', 'A8c · egyeztetett település-pont + feloldhatatlan utca → „bizonytalan"')
}

// ─────────────────────────────────────────────────────────────────────────────
// A9 — A CÉLPONT ORSZÁGA. A `formatRomanianAddress` korábban FELTÉTEL NÉLKÜL
// „România"-t ragasztott a végére, tehát egy budapesti tag célpontja szó
// szerint „…, Budapest, Pest, 1054, România" lett — a Google ilyenkor
// Romániában keres egy magyar utcát.
// ─────────────────────────────────────────────────────────────────────────────
{
  const magyar = formatRomanianAddress({
    locality: loc({
      name: 'Budapest', name_ro: null, default_postalcode: '1054',
      county: { id: 50, name: 'Pest', name_ro: null, siruta_code: null, auto_code: null, country: MAGYARORSZAG },
    }),
    street: { id: 9, name: 'Váci utca' },
    houseNumber: '12',
  })
  check(!/Rom[âa]nia/i.test(magyar), 'A9 · külföldi cím végére NEM kerül „România"')
  check(/Magyarország/.test(magyar), 'A9b · …hanem a tényleges ország neve')
  // ⚠️ A MEGYE KIMARAD a külföldi célpontból. A migráció a külföldi országokhoz
  //    egyetlen, semleges „(külföld)" megyét hoz létre TARTÓOSZLOPNAK — az nem
  //    címelem, és a zárójeles token a geokódolást rontja. A lelkész ezt a
  //    sztringet a kartonon, az „A térkép ezt keresi:" sorban EL IS OLVASSA.
  check(!/Pest/.test(magyar), 'A9e · külföldi címből KIMARAD a megye')

  const roman = formatRomanianAddress({
    locality: loc({ name: 'Barátos', name_ro: 'Brateș', default_postalcode: '527050' }),
    street: { id: 5, name: 'Főút', name_ro: 'Principală', street_type_ro: 'Strada' },
    houseNumber: '144',
  })
  check(/România$/.test(roman), 'A9c · romániai cím végén marad a „România"')

  // Ismeretlen ország (legacy „?" megye) → marad a „România": a nyilvántartás
  // túlnyomó része romániai, és ez volt az eddigi működés is.
  const ismeretlen = formatRomanianAddress({
    locality: loc({ name: 'Valamifalva', county: ISMERETLEN_MEGYE }),
    street: null,
    houseNumber: '3',
  })
  check(/România$/.test(ismeretlen), 'A9d · ismeretlen országnál marad a „România" (nem találgatunk mást)')
}

// ─────────────────────────────────────────────────────────────────────────────
// A11 — A JELENTÉS NÉLKÜLI MEGYENÉV SOHA NEM KERÜL A CÉLPONTBA.
// A címtörzsben KETTŐ van belőle: a legacy „?" megye (élesben ezen ülnek az
// erdélyi sorok) és a migráció „(külföld)" tartóoszlopa. Mindkettő `name_ro`
// NÉLKÜL, tehát a `resolveCountyName` a `name`-re esne vissza, és a Google
// `destination` paraméterébe kerülne — ott a lelkész el is olvassa.
// ─────────────────────────────────────────────────────────────────────────────
{
  check(resolveCountyName(kulfoldMegye(MAGYARORSZAG)) === null, 'A11 · a „(külföld)" megyenév nem címelem')
  check(resolveCountyName(KERDOJEL_MEGYE) === null, 'A11b · a „?" megyenév sem címelem')
  check(resolveCountyName(COVASNA) === 'Covasna', 'A11c · a VALÓDI megye neve viszont megmarad')

  const kulfoldiCel = formatRomanianAddress({
    locality: loc({ name: 'Hollandia', county: kulfoldMegye(HOLLANDIA) }),
    street: null,
    houseNumber: '12',
  })
  check(!/[()]/.test(kulfoldiCel), 'A11d · a külföldi célpont NEM tartalmaz zárójeles tokent')
  check(!/külföld/i.test(kulfoldiCel), 'A11e · …és nem tartalmazza a „külföld" szót sem')

  const legacyCel = formatRomanianAddress({
    locality: loc({ name: 'Barátos', county: KERDOJEL_MEGYE }),
    street: null,
    houseNumber: '144',
  })
  check(!/\?/.test(legacyCel), 'A11f · a „?" megye nem szivárog be a romániai célpontba')
  check(/România$/.test(legacyCel), 'A11g · …de az ország a helyén marad')
}

// A10 — A CÉLPONT FIGYELMEZTETÉSEI. Ezek a karton szövegsávjában, közvetlenül a
// pirula ALATT jelennek meg: ha a pirula elhallgat, de a figyelmeztetés nem, a
// hamis riasztás egy sorral lejjebb tér vissza.
{
  const kulfoldi = buildDirectionsTarget({
    locality: loc({
      name: 'Budapest',
      county: { id: 50, name: 'Pest', name_ro: null, siruta_code: null, auto_code: null, country: MAGYARORSZAG },
    }),
    street: { id: 9, name: 'Váci utca' },
    houseNumber: '12',
  })
  check(
    kulfoldi.warnings.length === 0,
    'A10 · külföldi címnél NINCS „hiányzik a hivatalos román név" figyelmeztetés',
  )
  const belfoldi = buildDirectionsTarget({
    locality: loc({ name: 'Kézdiszentlélek' }), // COVASNA megye, román név nélkül
    street: { id: 5, name: 'Főút' },
    houseNumber: '144',
  })
  check(
    belfoldi.warnings.length === 2,
    'A10b · …romániai címnél viszont MEGMARAD (település + utca)',
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// K. A KÜLFÖLD-KAPU — EZ A LEGFONTOSABB BLOKK
// ═════════════════════════════════════════════════════════════════════════════

// K1 — az országfelismerés három értéke.
check(isRomanianCountry(ROMANIA) === true, 'K1 · Románia felismerve')
check(isRomanianCountry(MAGYARORSZAG) === false, 'K1b · Magyarország: BIZONYÍTOTTAN nem Románia')
check(isRomanianCountry(HOLLANDIA) === false, 'K1c · Hollandia: BIZONYÍTOTTAN nem Románia')
check(isRomanianCountry(null) === null, 'K1d · hiányzó ország → `null` (nem tudjuk), NEM `false`')
check(isRomanianCountry({ name: 'Romania' }) === true, 'K1e · ékezet nélküli „Romania" is Románia')
check(isRomanianCountry({ sname: 'ro' }) === true, 'K1f · kisbetűs országkód is jó')
check(isRomanianCountry({ id: 7 }) === false, 'K1g · csak idegen id → nem Románia')

// K2 — A KÜLFÖLDI TELEPÜLÉSEKRE SOHA NINCS JELZÉS.
// ⚠️ EZEK A MÉRT, ÉLES NEVEK — pontosan az az 5 település, amelyiken a
//    gyülekezet 8 külföldön élő tagja lakik. A migráció ezeket köti át
//    Magyarországra / Hollandiára; innentől az ORSZÁG védi őket, nem a
//    véletlen. Az állítás MINDKÉT országtörzs-állapotban áll.
for (const [nev, orszag] of [
  ['Budapest', MAGYARORSZAG],
  ['Debrecen', MAGYARORSZAG],
  ['Gödöllő', MAGYARORSZAG],
  ['Győr', MAGYARORSZAG],
  ['Hollandia', HOLLANDIA],
]) {
  const kulfoldi = loc({
    name: nev,
    // Külföldi településnek NINCS román neve — a térkép mégis megtalálja.
    name_ro: null,
    county: kulfoldMegye(orszag),
  })
  for (const [allapotNev, torzs] of [
    ['migráció előtt', ORSZAGTORZS_EGYSOROS],
    ['migráció után', ORSZAGTORZS_KESZ],
  ]) {
    check(
      isProvablyRomanianLocality(kulfoldi, torzs) === false,
      `K2 · ${nev} (${allapotNev}): nem „bizonyíthatóan romániai"`,
    )
    check(
      shouldReportUnresolvableLocality(kulfoldi, torzs) === false,
      `K2 · ${nev} (${allapotNev}): NEM kerül a hibalistába`,
    )
  }

  // ⚠️ A KAPUNAK A KARTONON IS OTT KELL LENNIE. A hibalista és a karton kis
  //    ikonja UGYANARRÓL a településről nem mondhat ellent egymásnak: ha a
  //    Hibák fül hallgat, a kartonon sem villanhat piros „A térkép nem találja".
  const a = assessAddressMap({
    locality: kulfoldi,
    street: { id: 9, name: 'Váci utca' },
    houseNumber: '12',
  }, ORSZAGTORZS_KESZ)
  check(a.status !== 'nem-talalhato', `K2 · ${nev}: a KARTONON sem „nem-talalhato"`)
  check(a.status === 'nem-ellenorizheto', `K2 · ${nev}: a kartonon semleges „nem-ellenorizheto" pirula`)
  // ⚠️ A „Hollandia" KIVÉTEL: ott a település mezőbe egy ORSZÁG neve került
  //    (hibás adatfelvitel, 2 élő tag) — annak SAJÁT címkéje van, mert ott VAN
  //    teendő. Lásd az O-blokkot.
  check(
    a.label === (nev === 'Hollandia' ? 'Országnév a település helyén' : 'Külföldi cím'),
    `K2 · ${nev}: a címke a valódi helyzetet mondja ki`,
  )
  check(
    !/nem tudja feloldani|nem találja/i.test(a.detail),
    `K2 · ${nev}: a szöveg NEM állítja, hogy a térkép nem találja meg`,
  )
  // ⛔ 2026-08-11 — A „nincs mit javítani rajta" MONDAT NEM TÉRHET VISSZA.
  //    A migráció fejléce ugyanerről a 2 tagról azt írja, hogy „a lelkésznek
  //    KÉZZEL kell beírnia a tényleges holland várost" — a karton tehát nem
  //    zárhatja le a kérdést.
  check(
    !/[Nn]incs mit javítani/.test(a.detail),
    `K2 · ${nev}: a szöveg NEM állítja, hogy „nincs mit javítani rajta"`,
  )

  // …és a célpont a SAJÁT országát kapja, nem „România"-t (ez a mai éles hiba,
  // amit CSAK az adatjavítás tud megszüntetni — lásd az M-blokkot).
  const cel = formatRomanianAddress({ locality: kulfoldi, street: null, houseNumber: '12' })
  check(!/Rom[âa]nia/i.test(cel), `K2 · ${nev}: a térkép-célpont végén NEM „România" áll`)
}

// K2b — ROMÁNIAI település legacy „?" megyével (ez BETŰRE a Zágon/Páké/
// Sepsiszentgyörgy/Kovászna/Csíkcsicsó eset — 24 élő tag).
// ⚠️ EZ AZ AZ ÁLLÍTÁS, AMI AZ ELŐZŐ KÖRBEN FORDÍTVA ÁLLT, és emiatt maradt
//    néma a funkció: a régi K2b/K3 a MAI (hibás) viselkedést rögzítette.
{
  const cim = {
    locality: loc({ name: 'Barátos', county: KERDOJEL_MEGYE }),
    street: { id: 5, name: 'Főút' },
    houseNumber: '144',
  }
  const kesz = assessAddressMap(cim, ORSZAGTORZS_KESZ)
  check(kesz.status === 'nem-talalhato', 'K2b · romániai település „?" megyével → a kartonon JELZÜNK')
  check(kesz.label === 'A térkép nem találja', 'K2b · …és a címke ki is mondja')

  const elotte = assessAddressMap(cim, ORSZAGTORZS_EGYSOROS)
  check(elotte.status === 'nem-ellenorizheto', 'K2b · …a migráció ELŐTT viszont semleges marad')
  check(elotte.label === 'Nem ellenőrizhető', 'K2b · …és NEM „Külföldi cím" (Barátos nem külföld)')
}

// K3 — a legacy „?" megye + Románia: a MIGRÁCIÓ UTÁN jelzünk.
check(
  shouldReportUnresolvableLocality(loc({ name: 'Valamifalva', county: KERDOJEL_MEGYE }), ORSZAGTORZS_KESZ) === true,
  'K3 · „?" placeholder megye, de az ország Románia → JELZÜNK (a megye nem feltétel)',
)
check(
  shouldReportUnresolvableLocality(loc({ name: 'Valamifalva', county: ISMERETLEN_MEGYE }), ORSZAGTORZS_KESZ) === false,
  'K3b · le sem jött az ország → nincs jelzés',
)
check(
  shouldReportUnresolvableLocality(loc({ name: 'Valamifalva', county: null }), ORSZAGTORZS_KESZ) === false,
  'K3c · nincs megye → nincs jelzés',
)

// K4 — `needs_review`: az import wizard megye HÍJÁN Kovásznát tippel, ÉS a
// „Nem, külföldi" ágon is hardkódolt 'RO' országkódot küld. Egy így felvett
// „Budapest" tehát román megyében, román országgal ülne — nem bizonyíték.
// ⏳ Ez az ág addig teherhordó, amíg a wizard az országot tippeli.
check(
  shouldReportUnresolvableLocality(
    loc({ name: 'Budapest', needs_review: true, county: COVASNA }), ORSZAGTORZS_KESZ,
  ) === false,
  'K4 · needs_review (importból, tippelt megye ÉS ország) → nincs jelzés',
)

// K5 — VALÓDI romániai eset: seedelt megye, nincs román név → EZT jelezzük.
check(
  shouldReportUnresolvableLocality(loc({ name: 'Kézdiszentlélek', county: COVASNA }), ORSZAGTORZS_KESZ) === true,
  'K5 · seedelt román megye + hiányzó román név → JELZÜNK',
)

// K6 — SIRUTA-kód: a román hivatalos nyilvántartás azonosítója, önmagában
// bizonyít — és ez az EGYETLEN ág, ami az országtörzs állapotától FÜGGETLEN.
check(
  isProvablyRomanianLocality(loc({ siruta_code: '64014', county: ISMERETLEN_MEGYE }), ORSZAGTORZS_KESZ) === true,
  'K6 · SIRUTA-kód → bizonyíthatóan romániai, ismeretlen megye mellett is',
)
check(
  isProvablyRomanianLocality(loc({ siruta_code: '64014', county: ISMERETLEN_MEGYE }), ORSZAGTORZS_EGYSOROS) === true,
  'K6c · …és egy soros országtörzsnél IS (a SIRUTA nem az országtól függ)',
)
// …de a BIZONYÍTOTTAN külföldi ország ezt is felülírja (ellentmondó adat = csend).
check(
  isProvablyRomanianLocality(loc({
    siruta_code: '64014',
    county: kulfoldMegye(MAGYARORSZAG),
  }), ORSZAGTORZS_KESZ) === false,
  'K6b · ellentmondó adat (SIRUTA + külföldi ország) → inkább hallgatunk',
)

// K7 — az IRÁNYÍTÓSZÁM-ÁG KIKERÜLT (2026-08-11). Az indoklás átfordult: nem az
// irsz. dönt, hanem az ORSZÁG. A 6 jegyű irányítószám amúgy sem Románia-
// bizonyíték (Oroszország, India, Kína, Szingapúr is 6 jegyű), a hiánya pedig
// végképp nem külföld-bizonyíték.
check(
  isProvablyRomanianLocality(loc({ default_postalcode: '527050', county: ISMERETLEN_MEGYE }), ORSZAGTORZS_KESZ) === false,
  'K7 · 6 jegyű irsz. ÖNMAGÁBAN nem elég (az ország ismeretlen)',
)
check(
  isProvablyRomanianLocality(loc({
    default_postalcode: '527050',
    county: { id: 97, name: 'valami', name_ro: null, siruta_code: null, auto_code: null, country: ROMANIA },
  }), ORSZAGTORZS_KESZ) === true,
  'K7b · Románia → bizonyíthatóan romániai (az irsz. NEM feltétel, csak együtt jár)',
)
check(
  isProvablyRomanianLocality(loc({
    default_postalcode: null,
    county: { id: 97, name: 'valami', name_ro: null, siruta_code: null, auto_code: null, country: ROMANIA },
  }), ORSZAGTORZS_KESZ) === true,
  'K7d · …irányítószám NÉLKÜL is: a hiányzó irsz. nem külföld-bizonyíték',
)
check(
  isProvablyRomanianLocality(loc({
    default_postalcode: '1088',
    county: kulfoldMegye(MAGYARORSZAG),
  }), ORSZAGTORZS_KESZ) === false,
  'K7c · magyar 4 jegyű irsz. + Magyarország → nincs jelzés',
)

// K8 — ha a térkép ÚGYIS megtalálja, nincs mit jelezni (a kapu másik fele).
check(
  shouldReportUnresolvableLocality(loc({ name_ro: 'Brateș', county: COVASNA }), ORSZAGTORZS_KESZ) === false,
  'K8 · feloldható település → nincs jelzés, akkor sem, ha romániai',
)
check(
  shouldReportUnresolvableLocality(loc({
    county: COVASNA, geo_lat: 45.9, geo_lng: 26.1, geo_verified_at: '2026-08-11T10:00:00Z',
  }), ORSZAGTORZS_KESZ) === false,
  'K8b · már egyeztetett pont → a hiba magától megszűnik',
)
check(shouldReportUnresolvableLocality(null, ORSZAGTORZS_KESZ) === false, 'K8c · null település → nincs jelzés')

// ═════════════════════════════════════════════════════════════════════════════
// M. A MIGRÁCIÓ ELŐTTI ÁLLAPOT — „egy soros országtörzs" (ÁTMENETI)
// ─────────────────────────────────────────────────────────────────────────────
// A mért éles állapot: az `adrcountry`-ban EGYETLEN sor van (Románia), tehát az
// ország-mező semmit nem bizonyít. A kódnak MŰKÖDNIE KELL a migráció előtt is,
// ANÉLKÜL hogy hamis hibát zúdítana a lelkészre — ezt a blokk őrzi.
// ⏳ Ha ezek az állítások valaha megfordulnak, az azt jelenti, hogy a kód a
//    migráció ELŐTT kezdett jelezni. Az 8 hamis hiba lenne.
// ═════════════════════════════════════════════════════════════════════════════

check(isOrszagtorzsErtelmes(ORSZAGTORZS_EGYSOROS) === false, 'M1 · egy soros országtörzs → az ország NEM hordoz információt')
check(isOrszagtorzsErtelmes(ORSZAGTORZS_KESZ) === true, 'M1b · 3 ország → az ország innentől információ')
check(isOrszagtorzsErtelmes(undefined) === false, 'M1c · ismeretlen állapot → FAIL-CLOSED (nem hordoz)')
check(isOrszagtorzsErtelmes({ ismertOrszagok: 0 }) === false, 'M1d · üres törzs → nem hordoz')

// M2 — A MÉRT ERDÉLYI NEVEK. Ezek VALÓDI, szomszédos romániai települések, a
// címük TÉNYLEG javítandó (24 élő tag). A migráció ELŐTT mégis némák maradnak,
// mert az ország nem bizonyít — UTÁNA viszont mind jeleznek.
const ERDELYI_NEVEK = ['Zágon', 'Páké', 'Sepsiszentgyörgy', 'Kovászna', 'Csíkcsicsó']
for (const nev of ERDELYI_NEVEK) {
  // Élesen mért alak: legacy „?" megye, ország România, se SIRUTA, se irsz.
  const eles = loc({ name: nev, name_ro: null, county: KERDOJEL_MEGYE })
  check(
    shouldReportUnresolvableLocality(eles, ORSZAGTORZS_EGYSOROS) === false,
    `M2 · ${nev}: a migráció ELŐTT néma (az ország még nem bizonyít)`,
  )
  check(
    shouldReportUnresolvableLocality(eles, ORSZAGTORZS_KESZ) === true,
    `M2b · ${nev}: a migráció UTÁN JELZÜNK — ez a funkció lényege`,
  )
}

// M3 — a másik oldal: a migráció előtt a KÜLFÖLDIEK is „romániainak" látszanak
// (mind az egy soros törzs miatt) — és pont ezért kell NÉMÁNAK lenniük.
for (const nev of ['Budapest', 'Debrecen', 'Gödöllő', 'Győr', 'Hollandia']) {
  const migracioElott = loc({ name: nev, name_ro: null, county: KERDOJEL_MEGYE }) // ország: România!
  check(
    shouldReportUnresolvableLocality(migracioElott, ORSZAGTORZS_EGYSOROS) === false,
    `M3 · ${nev}: a migráció előtt ROMÁNIÁNAK látszik — mégsem jelzünk rá`,
  )
}

// M4 — A MAI ÉLES CÍM-CÉLPONT. A migráció ELŐTT a budapesti tag célpontja
// tényleg „…, România"-ra végződik, mert a címtörzs ezt állítja. Ezt NEM a kód
// tudja megjavítani, hanem KIZÁRÓLAG az adat — ezért áll itt állításként:
// dokumentálja a mai valóságot, és a migráció után M4b-re fordul.
{
  const elotte = formatRomanianAddress({
    locality: loc({ name: 'Budapest', county: KERDOJEL_MEGYE }), // ország: România
    street: { id: 9, name: 'Váci utca' },
    houseNumber: '12',
  })
  check(/România$/.test(elotte), 'M4 · a migráció ELŐTT a budapesti célpont még „România"-ra végződik (adathiba, nem kódhiba)')

  const utana = formatRomanianAddress({
    locality: loc({ name: 'Budapest', county: kulfoldMegye(MAGYARORSZAG) }),
    street: { id: 9, name: 'Váci utca' },
    houseNumber: '12',
  })
  check(/Magyarország$/.test(utana), 'M4b · …a migráció UTÁN pedig „Magyarország"-ra — ugyanaz a kód, javított adat')
}

// ═════════════════════════════════════════════════════════════════════════════
// P. A „?" HELYKITÖLTŐ TELEPÜLÉS — 70 ÉLŐ TAG
// ─────────────────────────────────────────────────────────────────────────────
// Ezeknek a tagoknak LÁTSZÓLAG van címük, valójában nincs: a `c_helysegid` ki
// van töltve, de egy „?" nevű helykitöltő sorra mutat. NEM térkép-hiba —
// és a térkép-tétel utasítása („egyeztesd a térképen") itt kifejezetten
// ROMBOLNA: egyetlen koordináta 70 különböző valódi lakcímre.
// ═════════════════════════════════════════════════════════════════════════════

check(isPlaceholderLocality(loc({ name: '?' })) === true, 'P1 · a „?" nevű sor helykitöltő')
check(isPlaceholderLocality(loc({ name: '  ?  ' })) === true, 'P1b · körülvágással is')
check(isPlaceholderLocality(loc({ name: '-' })) === true, 'P1c · a „-" is helykitöltő')
check(isPlaceholderLocality(loc({ name: '' })) === true, 'P1d · üres név → helykitöltő')
check(isPlaceholderLocality(loc({ name: 'ismeretlen' })) === true, 'P1e · az „ismeretlen" szó is')
check(isPlaceholderLocality(loc({ name: 'Zágon' })) === false, 'P1f · VALÓDI név NEM helykitöltő')
check(isPlaceholderLocality(loc({ name: 'Hollandia' })) === false, 'P1g · a „Hollandia" hibás felvitel, de NEM helykitöltő — kézzel pontosítandó')
check(isPlaceholderLocality(null) === false, 'P1h · null → nem helykitöltő (nincs mit állítani)')
// Ha BÁRMELYIK névoszlopban valódi név áll, a sor használható.
check(isPlaceholderLocality(loc({ name: '?', name_ro: 'Brateș' })) === false, 'P1i · „?" magyar név + valódi román név → NEM helykitöltő')

// P2 — A HELYKITÖLTŐ SOHA NEM KAP TÉRKÉP-JELZÉST. Ez a legfontosabb állítás:
// e nélkül a 70 tag „a térkép nem találja" hibát kapna, romboló utasítással.
check(
  shouldReportUnresolvableLocality(loc({ name: '?', county: KERDOJEL_MEGYE }), ORSZAGTORZS_KESZ) === false,
  'P2 · a „?" sor NEM kap térkép-hibát (különben az egyeztetés 70 címet rontana el)',
)
check(
  shouldReportUnresolvableLocality(loc({ name: '?', county: COVASNA }), ORSZAGTORZS_KESZ) === false,
  'P2b · …seedelt román megye mellett sem',
)

// P3 — a KARTONON is az igazat mondja, nem azt, hogy „a térkép nem találja".
{
  const a = assessAddressMap({
    locality: loc({ name: '?', county: KERDOJEL_MEGYE }),
    street: null,
    houseNumber: '144',
  }, ORSZAGTORZS_KESZ)
  check(a.status === 'nem-ellenorizheto', 'P3 · a kartonon semleges állapot (nem piros riasztás)')
  check(a.label === 'Hiányzik a település', 'P3b · a címke KIMONDJA, mi a baj')
  check(/Elérhetőségek/.test(a.detail), 'P3c · a szöveg a KONKRÉT helyre küld (Elérhetőségek)')
  check(
    !/nem találja/i.test(a.detail),
    'P3d · a szöveg NEM hárítja a térképre — nem a térkép hibázik',
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// P4 — A HELYKITÖLTŐ ÁLLAPOTA FELÜLÍR MINDEN KOORDINÁTÁT.
//
// ⛔ EZ A BLOKK EGY MÉRT ELLENTMONDÁS ŐRE. Korábban a `koordinata`-ág MEGELŐZTE
//    a helykitöltő-ágat: elég volt EGYETLEN egyeztetett pont a „?" soron (vagy
//    egy ottani utcán), és a karton pirulája „A térkép megtalálja"-ra váltott —
//    miközben a Hibák fülön a `lakcim|logic` tétel HELYESEN nyitva maradt, mert
//    az NÉV-alapú. A lelkész elvégezte az egyeztetést, zöldet kapott, és a
//    hibalista mégis pirosan tartotta, magyarázat nélkül.
//    Attól, hogy van egy pont, még nem tudjuk, HOL LAKIK a tag.
// ─────────────────────────────────────────────────────────────────────────────
{
  const telepulesPonttal = assessAddressMap({
    locality: loc({
      name: '?', county: KERDOJEL_MEGYE,
      geo_lat: 45.9, geo_lng: 26.1, geo_verified_at: '2026-08-11T10:00:00Z',
    }),
    street: null,
    houseNumber: '144',
  }, ORSZAGTORZS_KESZ)
  check(
    telepulesPonttal.status === 'nem-ellenorizheto' && telepulesPonttal.label === 'Hiányzik a település',
    'P4 · geo-ponttal ellátott „?" sor is „Hiányzik a település" marad',
  )

  const utcaPonttal = assessAddressMap({
    locality: loc({ name: '?', county: KERDOJEL_MEGYE }),
    street: { id: 5, name: 'Főút', geo_lat: 46.0512, geo_lng: 26.2841, geo_verified_at: '2026-08-11T10:00:00Z' },
    houseNumber: '144',
  }, ORSZAGTORZS_KESZ)
  check(
    utcaPonttal.status === 'nem-ellenorizheto' && utcaPonttal.label === 'Hiányzik a település',
    'P4b · …és egyeztetett UTCA-pont mellett is (a karton nem mondhat mást, mint a Hibák fül)',
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// O. ORSZÁGNÉV A TELEPÜLÉS HELYÉN — a „Hollandia" nevű település 2 tagja
// ─────────────────────────────────────────────────────────────────────────────
// A címtörzsben van egy „Hollandia" NEVŰ `adrlocality` sor: egy ORSZÁG neve
// került a település mezőbe. A karton korábban azt mondta rá, hogy „nincs mit
// javítani rajta" — miközben ugyanennek a körnek az SQL-je kimondja, hogy a
// lelkésznek KÉZZEL kell beírnia a tényleges holland várost. A teendő SEHOL nem
// jelent meg a felületen, csak egy egyszer lefuttatott SELECT egyik sorában.
// ═════════════════════════════════════════════════════════════════════════════

check(isCountryNamedLocality(loc({ name: 'Hollandia', county: kulfoldMegye(HOLLANDIA) })) === true,
  'O1 · a „Hollandia" nevű település felismerve')
check(isCountryNamedLocality(loc({ name: 'Magyarország', county: kulfoldMegye(MAGYARORSZAG) })) === true,
  'O1b · a magyar országnév is')
check(isCountryNamedLocality(loc({ name: 'Olanda', county: KERDOJEL_MEGYE })) === true,
  'O1c · a román alak („Olanda") is — a legacy megye mellett is')
check(isCountryNamedLocality(loc({ name: 'Budapest', county: kulfoldMegye(MAGYARORSZAG) })) === false,
  'O1d · Budapest VALÓDI város — nem esik ide')
check(isCountryNamedLocality(loc({ name: 'Barátos', county: COVASNA })) === false,
  'O1e · romániai falu sem')
check(isCountryNamedLocality(null) === false, 'O1f · null → nem országnév')
// A SIRUTA-kód mindent felülír: az hivatalos román település, bármi a neve.
check(
  isCountryNamedLocality(loc({ name: 'Hollandia', siruta_code: '64014', county: COVASNA })) === false,
  'O1g · SIRUTA-kódos sorra SOHA (hivatalos román település)',
)
// Ha a román névoszlopban MÁR ott a valódi város, a sor használható.
check(
  isCountryNamedLocality(loc({ name: 'Hollandia', name_ro: 'Amsterdam', county: kulfoldMegye(HOLLANDIA) })) === false,
  'O1h · ha bármelyik névoszlopban valódi város áll, nem jelzünk',
)

// O2 — a KARTONON kimondja a teendőt, és NEM zárja le a kérdést.
{
  const a = assessAddressMap({
    locality: loc({ name: 'Hollandia', county: kulfoldMegye(HOLLANDIA) }),
    street: null,
    houseNumber: '12',
  }, ORSZAGTORZS_KESZ)
  check(a.status === 'nem-ellenorizheto', 'O2 · semleges állapot (nem piros riasztás — a tag címe nem „hibás")')
  check(a.label === 'Országnév a település helyén', 'O2b · a címke KIMONDJA, mi a baj')
  check(/Elérhetőségek/.test(a.detail), 'O2c · a szöveg a KONKRÉT helyre küld')
  check(/tényleges várost/.test(a.detail), 'O2d · …és megmondja, MIT kell odaírni')
  check(!/[Nn]incs mit javítani/.test(a.detail), 'O2e · NEM állítja, hogy nincs mit javítani')
}

// O3 — a Hibák fülön viszont NINCS tétele: ez külföldi cím, nem térkép-hiba.
// (A felület mondja el, nem a hibalista — különben hamis „javítandó" lenne.)
check(
  shouldReportUnresolvableLocality(loc({ name: 'Hollandia', county: kulfoldMegye(HOLLANDIA) }), ORSZAGTORZS_KESZ) === false,
  'O3 · a Hibák fülön nem keletkezik tétel (külföld → csend)',
)

// ═════════════════════════════════════════════════════════════════════════════
// V. A VALIDÁCIÓS MOTOR TÉTELE
// ═════════════════════════════════════════════════════════════════════════════

// ⚠️ A kontextus TELEPÜLÉSENKÉNT EGY tételt ír le: a „gazda" tag (a legkisebb
//    id-jű érintett) és az érintettek száma. A hívó
//    (`validation-actions.buildMapValidationContext`) állítja össze.
const CTX = {
  feloldhatatlanTelepulesek: new Map([
    [42, { nev: 'Kézdiszentlélek', gazdaTagId: 1, erintettTagok: 3 }],
  ]),
  utcaTelepulesId: new Map([[7, 42]]),
}
const terkepHibak = (errors) => errors.filter((e) => e.field_name === 'lakcim' && e.error_type === 'format')

// V1 — kontextus NÉLKÜL semmi nem változik (visszafelé kompatibilis).
check(
  terkepHibak(validateMember(member({ c_helysegid: 42 }))).length === 0,
  'V1 · kontextus nélkül nincs térkép-hiba (a motor tiszta marad)',
)

// V2 — a `c_helysegid` ágon jelez a GAZDA tagnál.
{
  const errors = terkepHibak(validateMember(member({ id: 1, c_helysegid: 42 }), CTX))
  check(errors.length === 1, 'V2 · c_helysegid alapján PONTOSAN egy térkép-hiba')
  const e = errors[0]
  check(e.severity === 'medium', 'V2b · a súlyosság `medium` (nem `critical` — a rekord működik)')
  check(e.field_name === 'lakcim', 'V2c · a mező `lakcim` — ezt látja és javítja a lelkész a kartonon')
  check(e.error_message.includes('Kézdiszentlélek'), 'V2d · az üzenet MEGNEVEZI a települést')
  check(
    e.error_message.includes('Cím egyeztetése') && e.error_message.includes('Elérhetőségek'),
    'V2e · az üzenet a KONKRÉT útvonalat mondja el (cselekvés, nem diagnózis)',
  )
  check(e.error_message.includes('3 tag'), 'V2f · az üzenet KIMONDJA, hány tagot érint ugyanez az egy javítás')
}

// V3 — a `c_utcaid` ágon is jelez (sok import-örökség soron a helység NULL).
check(
  terkepHibak(validateMember(member({ id: 1, c_helysegid: null, c_utcaid: 7 }), CTX)).length === 1,
  'V3 · utca → település visszaesés is jelez',
)

// V4 — ismeretlen (nem jelölt) településre nincs hiba.
check(
  terkepHibak(validateMember(member({ id: 1, c_helysegid: 1234 }), CTX)).length === 0,
  'V4 · nem jelölt településre nincs hiba',
)

// V5 — nincs ÜTKÖZÉS a régi „Hiányzik a lakcím" tétellel: cím nélküli tagnál
// csak az a hiba jön, és a kulcsuk (mező|típus) különbözik.
{
  const errors = validateMember(member({ id: 1, c_helysegid: null, c_utcaid: null }), CTX)
  const hianyzo = errors.filter((e) => e.field_name === 'lakcim' && e.error_type === 'missing')
  check(hianyzo.length === 1 && terkepHibak(errors).length === 0, 'V5 · cím nélküli tag: csak a „Hiányzik a lakcím" jön')
}

// V6 — elhunytra semmi.
check(
  terkepHibak(validateAll([member({ id: 1, c_helysegid: 42, meghalt: true })], CTX)).length === 0,
  'V6 · elhunyt tagot nem validálunk',
)

// ═════════════════════════════════════════════════════════════════════════════
// H. A HIÁNYZÓ TELEPÜLÉS TÉTELE — a „?" helykitöltő 70 tagja
// ─────────────────────────────────────────────────────────────────────────────
// Külön `error_type` (`logic`), hogy a kulcs (`member_id|field_name|error_type|dup`)
// ÜTKÖZÉS NÉLKÜL megférjen a „Hiányzik a lakcím" (`missing`) és a „térkép nem
// találja" (`format`) tételekkel — mindhárom a `lakcim` mezőn ül, mert a
// lelkész mindhármat ugyanott javítja.
// ═════════════════════════════════════════════════════════════════════════════

const CTX_HELYKITOLTO = {
  helykitoltoTelepulesek: new Map([
    [7, { nev: '?', gazdaTagId: 1, erintettTagok: 70 }],
  ]),
  utcaTelepulesId: new Map([[70, 7]]),
}
const hianyzoTelepules = (errors) => errors.filter((e) => e.field_name === 'lakcim' && e.error_type === 'logic')

// H1 — a gazda tag kap tételt, PONTOSAN egyet.
{
  const errors = hianyzoTelepules(validateMember(member({ id: 1, c_helysegid: 7 }), CTX_HELYKITOLTO))
  check(errors.length === 1, 'H1 · a helykitöltő településre PONTOSAN egy tétel')
  const e = errors[0]
  check(e.severity === 'medium', 'H1b · a súlyosság `medium` — a `medium` definíciója szó szerint a lakcímet nevezi meg')
  check(e.field_name === 'lakcim', 'H1c · a mező `lakcim` — ezt javítja a lelkész a kartonon')
  check(e.error_type === 'logic', 'H1d · a típus `logic` — nem ütközik a `missing`/`format` tételekkel')
  check(/hiányzik a település/i.test(e.error_message), 'H1e · az üzenet KIMONDJA, hogy a település hiányzik')
  check(e.error_message.includes('70'), 'H1f · …és megmondja, hányat érint')
  check(
    e.error_message.includes('Elérhetőségek'),
    'H1g · a KONKRÉT útvonalat mondja el (cselekvés, nem diagnózis)',
  )
  check(
    !/térkép nem találja/i.test(e.error_message),
    'H1h · NEM állítja, hogy a térkép hibázik — nem a térkép hibázik',
  )
  check(
    /külön kell pótolni|MINDEGYIKET külön/i.test(e.error_message),
    'H1i · KIMONDJA, hogy — a térkép-hibával ellentétben — tagonként kell javítani',
  )
}

// H2 — a nem-gazda tag NEM kap tételt (különben 70 azonos sor temetné a listát).
check(
  hianyzoTelepules(validateMember(member({ id: 55, c_helysegid: 7 }), CTX_HELYKITOLTO)).length === 0,
  'H2 · a nem-gazda tag NEM kap külön tételt',
)

// H3 — 70 tag → PONTOSAN egy tétel, a legkisebb id-jű tag sorára.
{
  const sokTag = []
  for (let i = 1; i <= 70; i++) sokTag.push(member({ id: i, c_helysegid: 7 }))
  const errors = hianyzoTelepules(validateAll(sokTag, CTX_HELYKITOLTO))
  check(errors.length === 1, 'H3 · 70 tag a „?" soron → PONTOSAN 1 tétel')
  check(errors[0].member_id === 1, 'H3b · a tétel a legkisebb id-jű tag sorára kerül')
}

// H4 — az utca → település visszaesésen keresztül is megtalálja.
check(
  hianyzoTelepules(validateMember(member({ id: 1, c_helysegid: null, c_utcaid: 70 }), CTX_HELYKITOLTO)).length === 1,
  'H4 · utca → település visszaesés is jelez',
)

// H5 — EGY érintettnél nincs többes szám, és nincs „tagonként kell javítani" mondat.
{
  const CTX_EGY = {
    helykitoltoTelepulesek: new Map([[7, { nev: '?', gazdaTagId: 1, erintettTagok: 1 }]]),
    utcaTelepulesId: new Map(),
  }
  const e = hianyzoTelepules(validateMember(member({ id: 1, c_helysegid: 7 }), CTX_EGY))[0]
  check(!/Összesen \d+ tagot érint/.test(e.error_message), 'H5 · egyetlen érintettnél nincs „Összesen N tagot érint" mondat')
}

// H6 — NINCS DUPLA TÉTEL: aki helykitöltő településen lakik, NEM kap egyszerre
// térkép-hibát is. A két térkép egymást kizárja (a hívó a `directions.ts`
// `isPlaceholderLocality`-jével választ), de a motornak is bírnia kell, ha
// valaki tévedésből mindkettőbe beírná ugyanazt a települést.
{
  const CTX_MINDKETTO = {
    feloldhatatlanTelepulesek: new Map([[7, { nev: '?', gazdaTagId: 1, erintettTagok: 70 }]]),
    helykitoltoTelepulesek: new Map([[7, { nev: '?', gazdaTagId: 1, erintettTagok: 70 }]]),
    utcaTelepulesId: new Map(),
  }
  const errors = validateMember(member({ id: 1, c_helysegid: 7 }), CTX_MINDKETTO)
  const lakcimTetelek = errors.filter((e) => e.field_name === 'lakcim')
  const kulcsok = new Set(lakcimTetelek.map((e) => `${e.field_name}|${e.error_type}`))
  check(
    kulcsok.size === lakcimTetelek.length,
    'H6 · a lakcím-tételek kulcsa (mező|típus) EGYEDI — a DB-be írás nem ütközik',
  )
}

// H7 — kontextus nélkül semmi nem változik (a motor tiszta marad).
check(
  hianyzoTelepules(validateMember(member({ c_helysegid: 7 }))).length === 0,
  'H7 · kontextus nélkül nincs „hiányzik a település" tétel',
)

// ═════════════════════════════════════════════════════════════════════════════
// Z. TELEPÜLÉSENKÉNT EGY TÉTEL — a Hibák fül elárasztásának őre
// ─────────────────────────────────────────────────────────────────────────────
// A defekt is, a javítás is TELEPÜLÉS-szintű: egyetlen `adrlocality`-sorból
// hiányzik a hivatalos név. Tagonként kiírva ez Barátos léptékében 549 szó
// szerint azonos `medium` sort jelentene, ami a KPI-t és a listát is maga alá
// temetné — minden VALÓDI hibával együtt.
// ═════════════════════════════════════════════════════════════════════════════

// Z1 — száz tag EGY feloldhatatlan településen → PONTOSAN EGY tétel.
{
  const sokTag = []
  for (let i = 1; i <= 100; i++) sokTag.push(member({ id: i, c_helysegid: 42 }))
  const errors = terkepHibak(validateAll(sokTag, CTX))
  check(errors.length === 1, 'Z1 · 100 tag ugyanazon a településen → PONTOSAN 1 térkép-tétel')
  check(errors[0].member_id === 1, 'Z1b · a tétel a „gazda" (legkisebb id-jű érintett) tag sorára kerül')
}

// Z2 — a nem-gazda tagok NEM kapnak tételt (ez az elárasztás gyökere).
check(
  terkepHibak(validateMember(member({ id: 77, c_helysegid: 42 }), CTX)).length === 0,
  'Z2 · a nem-gazda tag NEM kap külön tételt',
)

// Z3 — `validateAll` továbbadja a kontextust MINDEN ágon (ez a huzalozás
// könnyen elmarad), és a gazda az utca-visszaesésen keresztül is megtalálható.
{
  const CTX_UTCA = {
    feloldhatatlanTelepulesek: new Map([[42, { nev: 'Kézdiszentlélek', gazdaTagId: 2, erintettTagok: 2 }]]),
    utcaTelepulesId: new Map([[7, 42]]),
  }
  const errors = terkepHibak(validateAll(
    [member({ id: 1, c_helysegid: 999 }), member({ id: 2, c_helysegid: null, c_utcaid: 7 })],
    CTX_UTCA,
  ))
  check(errors.length === 1 && errors[0].member_id === 2, 'Z3 · a gazda az utca→település ágon is megtalálható')
}

// Z4 — EGY érintett tagnál nem beszélünk többes számban.
{
  const CTX_EGY = {
    feloldhatatlanTelepulesek: new Map([[42, { nev: 'Kézdiszentlélek', gazdaTagId: 1, erintettTagok: 1 }]]),
    utcaTelepulesId: new Map(),
  }
  const e = terkepHibak(validateMember(member({ id: 1, c_helysegid: 42 }), CTX_EGY))[0]
  check(!/\d+ tag címét érinti/.test(e.error_message), 'Z4 · egyetlen érintettnél nincs „N tag címét érinti" mondat')
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nCím ⇄ térkép önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nCím ⇄ térkép önellenőrzés: minden zöld')
