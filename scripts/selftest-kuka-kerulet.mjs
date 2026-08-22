#!/usr/bin/env node
/**
 * KERÜLETI KUKA önellenőrzés (2026-08-22, egyházkerületi S7 szelet).
 *
 * Mit véd: `apps/web/app/(dashboard)/kuka/actions.ts` KERÜLETI ágát —
 * `listDistrictDeletedRows()` és `restoreDistrictRow()`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ MI ELLEN ÉPÜLT — A HIBAOSZTÁLY, AMI EBBEN A REPÓBAN MÁR ELSÜLT
 * ════════════════════════════════════════════════════════════════════════════
 * A 3. kör (2026-08-09) tanulsága: „SKALÁR HATÓKÖR + `if (id) filter` = NÉMA
 * TELJES SZIVÁRGÁS". A hibás alak így nézett ki:
 *
 *     let q = supabase.from(tabla).select('*')
 *     if (scopeId) q = q.eq('congregation_id', scopeId)   // ← a csapda
 *     const { data } = await q
 *
 * Ha a `scopeId` üres/NULL (rossz profil, hiányzó hozzárendelés, egy jövőbeli
 * refaktor), a szűrő NÉMÁN eltűnik, a lekérdezés viszont LEFUT — és a
 * felhasználó MINDEN gyülekezet (itt: minden egyházkerület) törölt sorait
 * megkapja. Nincs hibaüzenet, nincs üres lista: több adat jön, mint kellene.
 * Ez a Kukában különösen drága, mert a Kuka a TÖRÖLT állományt mutatja, és a
 * visszaállítás WRITE művelet: idegen kerület sorát lehetne feltámasztani.
 *
 * A második, olcsóbbnak látszó változata ugyanennek: KÉZZEL ÍRT oszlopnév.
 * A hat scope-oszlopos tábla MINDHÁROM szintet ugyanazon a táblán tartja
 * (`congregation_id` / `diocese_id` / `district_id`), tehát egy elgépelt vagy
 * bemásolt `'congregation_id'` literál a kerületi ágon nem fordítási hiba —
 * csak SZÓ NÉLKÜL a MÁSIK szint sorait adja vissza.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT ÍGY MÉR — VALÓDI HÍVÁS, HAMIS SUPABASE
 * ════════════════════════════════════════════════════════════════════════════
 * Az `actions.ts` `'use server'`-es, és `import 'server-only'`-os láncot húz be
 * (Supabase szerver-kliens, effective-access, level-scope), ezért önmagában nem
 * tölthető be. NEM ÍRJUK ÚJRA a logikáját tesztkódban (az csak a saját másolatát
 * mérné): a fájlt TRANSPILÁLJUK, az import-jait ISMERT csonkokra irányítjuk át,
 * és a VALÓDI exportált függvényeket hívjuk meg egy naplózó, hamis Supabase
 * kliens fölött. Így a mérés a tényleges kódúton fut:
 *   · a `table-registry.ts` és a `module-scope-core.ts` VALÓDI (import-mentes,
 *     ezért transpilálva betöltjük) — a tábla-metszet és a hatókör-oszlop tehát
 *     nem a teszt kitalációja;
 *   · a hatókör-kontextust és a Supabase-t csonkoljuk, mert azok a hálózat és a
 *     bejelentkezés — a mért ÁLLÍTÁS viszont az, hogy MIT KÉRDEZ a kód, és
 *     MIKOR NEM KÉRDEZ SEMMIT.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A KILENC MÉRCE
 * ════════════════════════════════════════════════════════════════════════════
 *   K1  az `actions.ts` import-halmaza ISMERT (nem bújt be negyedik
 *       hatókör-feloldó a kanonikus `getModuleScopeContext()` mellé);
 *   K2  FAIL-CLOSED: üres / NULL / undefined `scopeId`-nál — és nem-kerületi
 *       hatókörnél — EGYETLEN lekérdezés sem indul el (az építő agens kérése);
 *   K3  MINDEN lista-lekérdezés hordozza a hatókör-szűrőt, a `deleted_at`
 *       nélküli adatbázisra visszaeső MÁSODIK select-ág is;
 *   K4a a szűrő oszlopa a KANONIKUS `moduleScopeColumn('district')` eredménye,
 *       és az az oszlop, amit az S5a SQL a hat táblára felvett;
 *   K4b a kerületi szakasz KÓDJÁBAN nincs kézzel írt scope-oszlop-literál
 *       (szöveges mérce — komment-kiszedéssel, lásd lentebb);
 *   K5  a tábla-METSZET nem tartalmaz `congregation_id`-only táblát (az építő
 *       agens kérése), és minden lekérdezett tábla soft-delete a registryben;
 *   K6  a visszaállítás szűrője MINDIG tartalmazza a scope-oszlopot — nem elég
 *       az `id` —, és csak TÖRÖLT sort állít vissza;
 *   K7  a kerületi SZÁMVEVŐ nem tud visszaállítani (`moduleWriteBlock` kapu),
 *       és nála a lista olvasói felirata jelenik meg;
 *   K8  a GYÜLEKEZETI út változatlanul fail-closed (`fetchExactDeletedAt`) —
 *       a kerületi szelet ígérete, hogy a régi ág byte-ra változatlan;
 *   K9  hibára futó táblánál a felület NEM ígér üreset (`hibasTablak`).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ NEGATÍV ASSZERTEK — EZ AZ ŐRSZEM TUD PIROSRA VÁLTANI
 * ════════════════════════════════════════════════════════════════════════════
 * Egy őrszem, ami sosem bukik, rosszabb a semminél (a repó bevett szabálya).
 * NYOLC MUTÁNST gyártunk a forrásból — köztük magát az EREDETI HIBAALAKOT —, és
 * igazoljuk, hogy a mércék mindegyikre pirosra váltanak.
 *
 * A mutáns-gyártás `csere()`-vel megy, ami MEGSZÁMOLJA a találatokat, és eltérő
 * darabszámnál HANGOSAN elbukik. Így nem fordulhat elő, hogy egy átfogalmazott
 * `actions.ts` mellett a „mutáns" némán azonos legyen az eredetivel — vagyis a
 * negatív asszert nem tud vakká válni.
 *
 * ⚠️ KOMMENT-KISZEDÉS a szöveges mércénél (K4b): az `actions.ts` fejléce
 *    SZÁNDÉKOSAN IDÉZI a mért kódsort (``.eq(ctx.scopeCol, ctx.scopeId)``).
 *    Nyers szövegben mérve az őrszem akkor is zöld maradna, ha a VALÓDI kód
 *    literálra cserélődik és csak a róla szóló komment marad — pontosan ez a
 *    „vak zöld", ami ebben a projektben már elsült. A K4b-hez tartozó mutáns
 *    KIZÁRÓLAG a kódsorokat írja át (a kommentet szándékosan MEGHAGYJA), tehát
 *    ha valaki kiveszi a komment-kiszedést, ez az önellenőrzés bukik.
 *
 * Futtatás:  node scripts/selftest-kuka-kerulet.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const F_AKCIO = path.join(REPO_ROOT, 'apps', 'web', 'app', '(dashboard)', 'kuka', 'actions.ts')
const F_REGISTRY = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'offline', 'table-registry.ts')
const F_SCOPE_MAG = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'auth', 'module-scope-core.ts')
const F_SCOPE_GAZDA = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'auth', 'module-scope.ts')
const F_SQL = path.join(
  REPO_ROOT, 'migration-docs', 'sql', '2026-08-17-egyhazkeruleti-S5a-scope-oszlopok.sql',
)

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

for (const f of [F_AKCIO, F_REGISTRY, F_SCOPE_MAG, F_SCOPE_GAZDA, F_SQL]) {
  if (!fs.existsSync(f)) {
    fail(`hiányzik a forrás: ${f}`)
    process.exit(1)
  }
}

/**
 * KOMMENT-KISZEDÉS — minden szöveges méréshez KÖTELEZŐ (lásd a fejlécet).
 * A `selftest-override-elsobbseg.mjs` bevált példánya.
 */
const kommentNelkul = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const NYERS_AKCIO = fs.readFileSync(F_AKCIO, 'utf8')

// ════════════════════════════════════════════════════════════════════════════
// FÜGGETLEN HARMADIK FORRÁS: melyik táblának VAN `district_id` oszlopa?
// ────────────────────────────────────────────────────────────────────────────
// A K5 mércének kell egy olyan igazság-forrás, ami NEM az `actions.ts` és NEM
// a `table-registry.ts` — különben a mérés önmagát igazolná. Ez az S5a
// migrációs SQL: pontosan az vette fel a `district_id`-t a hat scope-oszlopos
// táblára. Ha ez a lista valaha kiürül vagy elmozdul, MEGÁLLUNK, mert a K5
// vizsgálat némán vaddá (tartalom nélkülivé) válna.
// ════════════════════════════════════════════════════════════════════════════
const SQL_DISTRICT_TABLAK = (() => {
  const sql = fs
    .readFileSync(F_SQL, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
  const re = /ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+district_id\b/gi
  return new Set([...sql.matchAll(re)].map((m) => m[1]))
})()

if (SQL_DISTRICT_TABLAK.size < 6) {
  fail(
    `az S5a SQL-ből mindössze ${SQL_DISTRICT_TABLAK.size} darab district_id-t kapó tábla olvasható ki ` +
      '(legalább 6 várt) — a K5 tábla-metszet mércéje enélkül tartalom nélküli lenne. ' +
      `Forrás: ${F_SQL}`,
  )
  process.exit(1)
}

// ════════════════════════════════════════════════════════════════════════════
// TYPESCRIPT — enélkül csak a szöveges rész mérhető (a repó bevett mintája)
// ════════════════════════════════════════════════════════════════════════════
const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try {
  ts = require_('typescript')
} catch {
  console.log('INFO: a typescript csomag nem elérhető — a futtatásos mércék (K1–K3, K4a, K5–K9) kimaradnak')
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-kuka-kerulet-selftest-'))
const takarit = () => fs.rmSync(tmp, { recursive: true, force: true })

/**
 * TS → CJS + betöltés IMPORT-MENTES modulokhoz (table-registry, module-scope-core).
 * FAIL-CLOSED: ha ezekbe valaha futásidejű projekt-import kerül, inkább itt
 * bukjunk el érthető üzenettel, mint hogy a mérés némán kihagyhatóvá váljon.
 */
function valodiModul(srcFile, outName) {
  const out = ts.transpileModule(fs.readFileSync(srcFile, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      isolatedModules: true,
    },
    fileName: `${outName}.ts`,
  })
  const idegen = [...out.outputText.matchAll(/require\(["']([^"']+)["']\)/g)]
    .map((m) => m[1])
    .filter((m) => !m.startsWith('node:') && !m.startsWith('.'))
  if (idegen.length > 0) {
    throw new Error(
      `${outName}: FUTÁSIDEJŰ PROJEKT-IMPORT került a fájlba (${idegen.join(', ')}) — ` +
        'így nem tölthető be önállóan, és a mérés bemenete elveszne.',
    )
  }
  const dest = path.join(tmp, `${outName}.js`)
  fs.writeFileSync(dest, out.outputText, 'utf8')
  return require_(dest)
}

// ════════════════════════════════════════════════════════════════════════════
// K4b — SZÖVEGES MÉRCE (typescript nélkül is fut)
// ════════════════════════════════════════════════════════════════════════════

/** A kerületi szakasz KEZDETE — kód-horgony, nem komment (a komment kiesik). */
const SZAKASZ_HORGONY = 'const SCOPE_OSZLOPOS_TABLAK'

/**
 * A kerületi szakasz kódja, kommentek nélkül. `null`, ha a horgony eltűnt —
 * ilyenkor MEGÁLLUNK, mert nem tudjuk, mit mérünk.
 */
function keruletiSzakasz(nyers) {
  const kod = kommentNelkul(nyers)
  const idx = kod.indexOf(SZAKASZ_HORGONY)
  return idx < 0 ? null : kod.slice(idx)
}

/** Kézzel írt scope-oszlop egy `.eq(...)` szűrőben — a tiltott alak. */
const KEZI_LITERAL_RE = /\.eq\(\s*['"](?:congregation_id|diocese_id|district_id)['"]/

/**
 * K4b: a kerületi szakaszban a szűrő-oszlop a `ctx.scopeCol`-ból jön.
 * Két állítás:
 *  (i)  a `ctx.scopeCol` LEGALÁBB kétszer szerepel a KÓDBAN (lista + visszaállítás);
 *  (ii) nincs `.eq('<scope-oszlop>'` alakú kézzel írt literál.
 * Az (i) miatt load-bearing a komment-kiszedés: a fájl fejléce idézi a
 * `ctx.scopeCol`-t, tehát nyers szövegen a mérce akkor is zöld lenne, ha a
 * kódból eltűnik.
 */
function mercek_K4b(nyers) {
  const szakasz = keruletiSzakasz(nyers)
  if (szakasz === null) {
    return `nem található a kerületi szakasz horgonya (${SZAKASZ_HORGONY}) — a fájl szerkezete elmozdult`
  }
  const db = [...szakasz.matchAll(/ctx\.scopeCol/g)].length
  if (db < 2) {
    return `a kerületi szakasz KÓDJÁBAN mindössze ${db}× szerepel a \`ctx.scopeCol\` (2 várt: lista + visszaállítás) — kézzel írt oszlopnév került a helyére?`
  }
  const kezi = szakasz.match(KEZI_LITERAL_RE)
  if (kezi) {
    return `KÉZZEL ÍRT scope-oszlop-literál a kerületi szakaszban: ${kezi[0]} — a hat tábla mindhárom szintet tartja, egy bemásolt literál NÉMÁN a másik szint sorait adná`
  }
  return null
}

/**
 * A `moduleWriteBlock` SZERZŐDÉSE (a K7 csonkja ezt játssza újra). Ha a valódi
 * kapu alakja elmozdul, a csonk némán mást mérne, mint ami élesben fut.
 */
{
  const gazda = kommentNelkul(fs.readFileSync(F_SCOPE_GAZDA, 'utf8'))
  if (/export function moduleWriteBlock[\s\S]{0,400}?if\s*\(ctx\.canWrite\)\s*return null/.test(gazda)) {
    ok('K7c a valódi `moduleWriteBlock` szerződése változatlan (canWrite → null, különben blokk)')
  } else {
    fail(
      'K7c: a `moduleWriteBlock` alakja elmozdult a module-scope.ts-ben — a K7 csonkja ' +
        'ettől NÉMÁN mást mérne, mint ami élesben fut. Mérd újra, és igazítsd a csonkot.',
    )
  }
}

if (!ts) {
  // typescript nélkül CSAK a szöveges mérce fut le — de az fusson le.
  const k4bHiba = mercek_K4b(NYERS_AKCIO)
  if (k4bHiba) fail(`K4b: ${k4bHiba}`)
  else ok('K4b a kerületi szakasz a kanonikus `ctx.scopeCol`-t használja, kézzel írt oszlopnév nincs')
  takarit()
  if (failed) {
    console.error('\nKerületi Kuka önellenőrzés: HIBA')
    process.exit(1)
  }
  console.log('\nKerületi Kuka önellenőrzés: a szöveges rész zöld (a futtatásos mércék kihagyva)')
  process.exit(0)
}

// ════════════════════════════════════════════════════════════════════════════
// A VALÓDI SEGÉD-MODULOK (import-mentesek, ezért betölthetők)
// ════════════════════════════════════════════════════════════════════════════
let REGISTRY = null
let SCOPE_MAG = null
try {
  REGISTRY = valodiModul(F_REGISTRY, 'table-registry')
  SCOPE_MAG = valodiModul(F_SCOPE_MAG, 'module-scope-core')
} catch (e) {
  fail(`a segéd-modulok nem tölthetők be — ${e?.message || e}`)
  takarit()
  process.exit(1)
}

/** A registry SOFT-DELETE bejegyzései (a Kuka merítése). */
const SOFT_DELETE = REGISTRY.TABLE_REGISTRY.filter((t) => t.softDelete)

/**
 * `congregation_id`-only soft-delete táblák: a Kukában szerepelnek, de az S5a
 * SQL NEM adott nekik `district_id`-t. Ezeknek SOHA nem szabad a kerületi
 * metszetbe kerülniük. Ha ez a halmaz üresre fogyna, a K5 tartalom nélkülivé
 * válna — akkor MEGÁLLUNK.
 */
const GYULEKEZETI_CSAK = SOFT_DELETE
  .map((t) => t.supabaseTable)
  .filter((t) => !SQL_DISTRICT_TABLAK.has(t))

if (GYULEKEZETI_CSAK.length === 0) {
  fail(
    'nincs egyetlen `congregation_id`-only soft-delete tábla sem — a K5 mérce (és a hozzá ' +
      'tartozó mutáns) ettől tartalom nélkülivé válna. Mérd újra a modellt.',
  )
  takarit()
  process.exit(1)
}

const VART_SCOPE_OSZLOP = SCOPE_MAG.moduleScopeColumn('district')

// ════════════════════════════════════════════════════════════════════════════
// CSONKOK — a hálózat és a bejelentkezés helyére
// ════════════════════════════════════════════════════════════════════════════
//
// A kontextust globálison adjuk át, mert a csonkokat a `require()` tölti be, és
// paraméterezni nem tudjuk. A csonkok SEMMIT nem döntenek el: a hatókör és a
// Supabase-válasz is a hívó teszteset kezében van — a mért ÁLLÍTÁS az, hogy az
// `actions.ts` MIT KEZD velük.

fs.writeFileSync(
  path.join(tmp, 'csonk-next-cache.js'),
  'exports.revalidatePath = () => {}\n',
  'utf8',
)
fs.writeFileSync(
  path.join(tmp, 'csonk-next-navigation.js'),
  // A `redirect()` élesben dob (a Next így szakítja meg a Server Actiont) —
  // a csonk ugyanígy dob, hogy a hívási sorrend valósághű maradjon.
  'exports.redirect = (url) => { const e = new Error("REDIRECT"); e.kartotekaRedirect = url; throw e }\n',
  'utf8',
)
fs.writeFileSync(
  path.join(tmp, 'csonk-effective-access.js'),
  'exports.getEffectiveCongregationContext = async () => globalThis.__KUKA_ONELLENORZES.effektiv\n',
  'utf8',
)
fs.writeFileSync(
  path.join(tmp, 'csonk-module-scope.js'),
  // A `moduleWriteBlock` a valódi szerződését játssza újra (K7c őrzi, hogy a
  // valódi alak nem mozdult el); a `getModuleScopeContext` a teszteset kontextusa.
  'exports.getModuleScopeContext = async () => globalThis.__KUKA_ONELLENORZES.modul\n' +
    'exports.moduleWriteBlock = (ctx) => (ctx.canWrite ? null : { error: ctx.readOnlyReason ?? "ELLENŐRI NÉZET" })\n',
  'utf8',
)
fs.writeFileSync(
  path.join(tmp, 'csonk-labels.js'),
  // A címkézés tartalma nem tárgya ennek az őrszemnek (azt a selftest-kuka.mjs
  // méri) — itt csak determinisztikus, sorra jellemző szöveg kell.
  'exports.buildRecycleBinLabel = (tabla) => (sor) => `${tabla}#${sor && sor.id}`\n',
  'utf8',
)

/** Az `actions.ts` ISMERT import-halmaza → hova irányítjuk át. */
const IMPORT_TERKEP = {
  'next/cache': './csonk-next-cache.js',
  'next/navigation': './csonk-next-navigation.js',
  '@/lib/auth/effective-access': './csonk-effective-access.js',
  '@/lib/auth/module-scope': './csonk-module-scope.js',
  '@/lib/offline/recycle-bin-labels': './csonk-labels.js',
  '@/lib/offline/table-registry': './table-registry.js',
}

let epitesSorszam = 0

/**
 * Az `actions.ts` (esetleg mutált) forrásának betöltése.
 *
 * K1 ITT MÉRŐDIK: ha ISMERETLEN import kerül a fájlba — például egy negyedik,
 * saját hatókör-feloldó a kanonikus `getModuleScopeContext()` mellé —, itt
 * MEGÁLLUNK. Az a hibaosztály, ami miatt a `module-scope.ts` egyáltalán
 * megszületett („két réteg némán széthúz"), így nem tud visszaszivárogni.
 */
function epitAkcio(forras) {
  const out = ts.transpileModule(forras, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      isolatedModules: true,
    },
    fileName: 'kuka-actions.ts',
  })
  let kod = out.outputText
  const kertek = [...kod.matchAll(/require\(["']([^"']+)["']\)/g)].map((m) => m[1])
  const ismeretlen = kertek.filter((k) => !(k in IMPORT_TERKEP))
  if (ismeretlen.length) {
    throw new Error(
      `ISMERETLEN import az actions.ts-ben: [${ismeretlen.join(', ')}]. ` +
        'Ha ez egy új hatókör-feloldó, akkor a Kuka már NEM kizárólag a kanonikus ' +
        '`getModuleScopeContext()`-ből dolgozik — állj meg és mérd újra.',
    )
  }
  for (const [eredeti, cel] of Object.entries(IMPORT_TERKEP)) {
    kod = kod.split(`require("${eredeti}")`).join(`require("${cel}")`)
    kod = kod.split(`require('${eredeti}')`).join(`require('${cel}')`)
  }
  const dest = path.join(tmp, `kuka-actions-${++epitesSorszam}.js`)
  fs.writeFileSync(dest, kod, 'utf8')
  return require_(dest)
}

// ════════════════════════════════════════════════════════════════════════════
// HAMIS SUPABASE — minden hívást naplóz
// ════════════════════════════════════════════════════════════════════════════
function hamisSupabase(valaszol) {
  const naplo = []
  return {
    naplo,
    from(tabla) {
      const rec = { tabla, muvelet: 'select', oszlopok: null, szurok: [], adat: null, limit: null }
      naplo.push(rec)
      const b = {
        select(c) { rec.oszlopok = c; return b },
        update(p) { rec.muvelet = 'update'; rec.adat = p; return b },
        eq(c, v) { rec.szurok.push([c, v]); return b },
        in(c, v) { rec.szurok.push([c, v]); return b },
        order() { return b },
        limit(n) { rec.limit = n; return b },
        // Thenable: az `await` így a választ kapja, a lánc viszont végig a
        // naplózó buildert adja tovább.
        then(res, rej) { return Promise.resolve().then(() => valaszol(rec)).then(res, rej) },
      }
      return b
    },
  }
}

const SIKER_SOR = {
  id: '99999999-8888-4777-8666-555544443333',
  updated_at: '2026-08-20T10:00:00.000Z',
  deleted_at: '2026-08-20T09:30:00.000Z',
}
const valaszSiker = () => ({ data: [SIKER_SOR], error: null })
const valaszHiba = (uz) => () => ({ data: null, error: { message: uz } })
/** Az S5 előtti adatbázis: a `deleted_at`-os ELSŐ select 42703-mal elhasal. */
const valaszNincsDeletedAt = (rec) =>
  String(rec.oszlopok ?? '').endsWith(', deleted_at')
    ? { data: null, error: { message: 'column "deleted_at" does not exist' } }
    : { data: [{ id: SIKER_SOR.id, updated_at: SIKER_SOR.updated_at }], error: null }

const KERULETI_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const VISSZAALLITANDO_ID = '11111111-2222-4333-8444-555566667777'

const alapKtx = (tulajdonsagok = {}) => ({
  scope: 'district',
  scopeId: KERULETI_ID,
  scopeCol: VART_SCOPE_OSZLOP,
  scopeName: 'Teszt Egyházkerület',
  canWrite: true,
  readOnlyReason: null,
  ...tulajdonsagok,
})

// ════════════════════════════════════════════════════════════════════════════
// A MÉRCÉK — EGY függvényben, hogy a mutánsok UGYANEZT fussák
// ════════════════════════════════════════════════════════════════════════════

const KOD_LEIRAS = {
  K1: 'az actions.ts import-halmaza ismert (nincs negyedik hatókör-feloldó)',
  K2: 'FAIL-CLOSED: üres/NULL scopeId-nál és nem-kerületi hatókörnél EGYETLEN lekérdezés sem indul',
  K3: 'minden lista-lekérdezés hordozza a hatókör-szűrőt (a visszaeső select-ág is)',
  K4a: 'a szűrő oszlopa a kanonikus moduleScopeColumn(\'district\') = az S5a SQL oszlopa',
  K4b: 'a kerületi szakasz KÓDJA a `ctx.scopeCol`-ból dolgozik, kézzel írt oszlopnév nincs',
  K5: 'a tábla-metszet nem tartalmaz congregation_id-only táblát, és mind soft-delete',
  K6: 'a visszaállítás szűrője tartalmazza az id-t, a scope-oszlopot ÉS a törölt-jelzőt',
  K7: 'a kerületi SZÁMVEVŐ nem tud visszaállítani (moduleWriteBlock kapu), csak olvas',
  K8: 'a gyülekezeti fetchExactDeletedAt változatlanul fail-closed',
  K9: 'hibára futó táblánál a felület nem ígér üreset (hibasTablak)',
}

/** Egyetlen kerületi lista-futás a megadott kontextussal és válasz-adóval. */
async function futtatLista(akcio, ktx, valaszol) {
  const sb = hamisSupabase(valaszol)
  globalThis.__KUKA_ONELLENORZES = { modul: { ...ktx, supabase: sb }, effektiv: null }
  const eredmeny = await akcio.listDistrictDeletedRows()
  return { eredmeny, naplo: sb.naplo }
}

/** Egyetlen visszaállítás-futás; a `redirect()` dobását elkapjuk. */
async function futtatVisszaallitas(akcio, ktx, mezok, valaszol) {
  const sb = hamisSupabase(valaszol)
  globalThis.__KUKA_ONELLENORZES = { modul: { ...ktx, supabase: sb }, effektiv: null }
  const urlap = { get: (k) => (k in mezok ? mezok[k] : null) }
  let url = null
  let dobas = null
  try {
    await akcio.restoreDistrictRow(urlap)
  } catch (e) {
    if (e && e.kartotekaRedirect) url = e.kartotekaRedirect
    else dobas = e
  }
  return { url, dobas, naplo: sb.naplo }
}

/**
 * A teljes mércekészlet EGY forrásváltozaton. A hibák KÓDDAL térnek vissza,
 * hogy a negatív asszertek ne csak azt tudják, hogy „valami elromlott", hanem
 * azt is, hogy A VÁRT mérce bukott-e el.
 */
async function mercek(forras) {
  const hibak = []
  const jelez = (kod, uzenet) => hibak.push({ kod, uzenet })

  // K4b — SZÖVEGES mérce (komment-kiszedéssel). Azért ITT is, a mércekészletben,
  // hogy a hozzá tartozó mutáns ténylegesen mérhető legyen.
  const k4bHiba = mercek_K4b(forras)
  if (k4bHiba) jelez('K4b', k4bHiba)

  let akcio
  try {
    akcio = epitAkcio(forras)
  } catch (e) {
    jelez('K1', e?.message || String(e))
    return hibak
  }

  const eredetiWarn = console.warn
  const eredetiError = console.error
  console.warn = () => {}
  console.error = () => {}
  try {
    // ── K2: FAIL-CLOSED ────────────────────────────────────────────────────
    const k2Esetek = [
      ['üres scopeId', alapKtx({ scopeId: '' })],
      ['NULL scopeId', alapKtx({ scopeId: null })],
      ['undefined scopeId', alapKtx({ scopeId: undefined })],
      ['nincs feloldható hatókör (error-ág)', { error: 'nincs hatókör' }],
      ['GYÜLEKEZETI hatókör (változatlan út)', alapKtx({ scope: 'congregation', scopeCol: 'congregation_id' })],
      ['MEGYEI hatókör (szándékosan nincs megnyitva)', alapKtx({ scope: 'diocese', scopeCol: 'diocese_id' })],
    ]
    for (const [nev, ktx] of k2Esetek) {
      const { eredmeny, naplo } = await futtatLista(akcio, ktx, valaszSiker)
      if (eredmeny?.keruleti !== false) {
        jelez('K2', `${nev}: a válasz nem \`{ keruleti: false }\` (${JSON.stringify(eredmeny)?.slice(0, 120)})`)
      }
      if (naplo.length !== 0) {
        jelez(
          'K2',
          `${nev}: ${naplo.length} lekérdezés INDULT EL (0 várt) — ` +
            `[${naplo.map((r) => `${r.tabla}(${r.szurok.map((s) => s[0]).join('+') || 'SZŰRŐ NÉLKÜL'})`).join(', ')}]. ` +
            'Ez a „NULL skalár → szűretlen lista" hibaosztály.',
        )
      }
    }

    // ── K3 / K4a / K5 / K9: a kerületi lista ───────────────────────────────
    const futasok = [
      ['deleted_at-tal', valaszSiker],
      ['deleted_at NÉLKÜLI adatbázis (visszaeső select-ág)', valaszNincsDeletedAt],
    ]
    let elsoFutasNaplo = null
    for (const [nev, valaszol] of futasok) {
      const { eredmeny, naplo } = await futtatLista(akcio, alapKtx(), valaszol)
      if (!elsoFutasNaplo) elsoFutasNaplo = naplo
      if (eredmeny?.keruleti !== true) {
        jelez('K3', `${nev}: érvényes kerületi hatókörnél nem kerületi állapot jött vissza`)
        continue
      }
      if (naplo.length === 0) {
        jelez('K3', `${nev}: EGYETLEN lekérdezés sem futott — a mérés tartalom nélküli lenne`)
        continue
      }
      for (const rec of naplo) {
        // ⚠️ A ROSSZ-OSZLOP mérce SZÁNDÉKOSAN ELŐBB fut, mint a hiányzó-szűrő ág:
        //    ha a kerületi szűrő helyére a MÁSIK szint oszlopa kerül, akkor a
        //    lekérdezésen „van szűrő", csak épp rossz — ilyenkor a K4a-nak KELL
        //    megszólalnia, nem szabad a K3 `continue`-ja mögé bújnia. (Enélkül a
        //    hozzá tartozó negatív asszert csak a K3-at látta volna pirosnak.)
        const rosszOszlop = rec.szurok.find(
          ([c]) => (c === 'congregation_id' || c === 'diocese_id') && c !== VART_SCOPE_OSZLOP,
        )
        if (rosszOszlop) {
          jelez(
            'K4a',
            `${nev}: a(z) \`${rec.tabla}\` MÁSIK SZINT oszlopára szűr (\`${rosszOszlop[0]}\`) — ` +
              `a kanonikus moduleScopeColumn('district') = \`${VART_SCOPE_OSZLOP}\`. ` +
              'Ugyanaz a hat tábla tartja mind a három szintet, tehát ez NÉMÁN a másik szint sorait adná.',
          )
        }
        const scopeSzuro = rec.szurok.find(([c]) => c === VART_SCOPE_OSZLOP)
        if (!scopeSzuro) {
          jelez(
            'K3',
            `${nev}: a(z) \`${rec.tabla}\` lekérdezésén NINCS hatókör-szűrő ` +
              `(szűrők: ${JSON.stringify(rec.szurok)}) — MINDEN egyházkerület törölt sorai jönnének`,
          )
          continue
        }
        if (scopeSzuro[1] !== KERULETI_ID) {
          jelez('K3', `${nev}: a(z) \`${rec.tabla}\` hatókör-szűrője idegen értékre mutat: ${scopeSzuro[1]}`)
        }
      }
    }

    // K4a: a kanonikus oszlop keresztbe igazolva az S5a SQL-lel
    if (!SQL_DISTRICT_TABLAK.size || VART_SCOPE_OSZLOP !== 'district_id') {
      jelez(
        'K4a',
        `a moduleScopeColumn('district') = \`${VART_SCOPE_OSZLOP}\`, de az S5a SQL a hat táblára ` +
          '`district_id`-t vett fel — a kód és az adatbázis széthúz',
      )
    }

    // ── K5: a tábla-metszet ────────────────────────────────────────────────
    if (elsoFutasNaplo) {
      const tablak = [...new Set(elsoFutasNaplo.map((r) => r.tabla))]
      if (tablak.length === 0) {
        jelez('K5', 'a kerületi Kuka EGYETLEN táblát sem kérdez — a metszet üresre fogyott')
      }
      const idegen = tablak.filter((t) => !SQL_DISTRICT_TABLAK.has(t))
      if (idegen.length) {
        jelez(
          'K5',
          `a metszetben \`congregation_id\`-only tábla van: [${idegen.join(', ')}] — ` +
            'ezeknek NINCS `district_id` oszlopuk az S5a SQL szerint, tehát a kerületi szűrő ' +
            'rajtuk 42703-at adna (a tábla némán kiesne), vagy — ami rosszabb — a szűrő ' +
            'elhagyásával idegen gyülekezetek törölt sorait mutatnák',
        )
      }
      const gyulekezeti = tablak.filter((t) => GYULEKEZETI_CSAK.includes(t))
      if (gyulekezeti.length) {
        jelez('K5', `a metszet gyülekezeti-only táblát tartalmaz: [${gyulekezeti.join(', ')}]`)
      }
      const nemSoft = tablak.filter((t) => !SOFT_DELETE.some((e) => e.supabaseTable === t))
      if (nemSoft.length) {
        jelez(
          'K5',
          `a metszetben NEM soft-delete tábla van: [${nemSoft.join(', ')}] — ` +
            'a Kuka a törölt-jelzőre szűr, ott ilyen oszlop nincs',
        )
      }
    }

    // ── K9: hibás táblánál nem ígérünk üreset ──────────────────────────────
    {
      const { eredmeny } = await futtatLista(akcio, alapKtx(), valaszHiba('kapcsolat megszakadt'))
      if (eredmeny?.keruleti !== true) {
        jelez('K9', 'hibás lekérdezésnél nem kerületi állapot jött vissza')
      } else if (!Array.isArray(eredmeny.hibasTablak) || eredmeny.hibasTablak.length === 0) {
        jelez(
          'K9',
          'MINDEN tábla olvasása hibára futott, mégis üres a `hibasTablak` — a felület ' +
            '„a kuka üres"-t ígérne, és a lelkész azt hinné, hogy az adat véglegesen elveszett',
        )
      } else if (eredmeny.csoportok.length !== 0) {
        jelez('K9', 'hibára futott olvasásnál mégis jelent meg csoport a listában')
      }
    }

    // ── K6: a visszaállítás szűrője ────────────────────────────────────────
    // A táblát és a törölt-jelzőt a VALÓDI metszetből vesszük, hogy a mérce a
    // registry változásait magától kövesse.
    const celTabla = elsoFutasNaplo && elsoFutasNaplo.length ? elsoFutasNaplo[0].tabla : null
    const celEntry = celTabla ? SOFT_DELETE.find((e) => e.supabaseTable === celTabla) : null
    if (!celEntry) {
      jelez('K6', 'nincs mérhető kerületi tábla — a visszaállítás mércéje tartalom nélküli lenne')
    } else {
      const jelzo = celEntry.softDeleteColumn ?? 'deleted'
      const { url, dobas, naplo } = await futtatVisszaallitas(
        akcio,
        alapKtx(),
        { tabla: celTabla, id: VISSZAALLITANDO_ID },
        () => ({ data: [{ id: VISSZAALLITANDO_ID }], error: null }),
      )
      if (dobas) {
        jelez('K6', `a visszaállítás nem várt hibát dobott: ${dobas?.message || dobas}`)
      } else if (naplo.length !== 1) {
        jelez('K6', `${naplo.length} lekérdezés futott a visszaállításnál (1 várt)`)
      } else {
        const rec = naplo[0]
        if (rec.muvelet !== 'update') jelez('K6', 'a visszaállítás nem UPDATE-et futtatott')
        if (!rec.adat || rec.adat[jelzo] !== false) {
          jelez('K6', `az update nem a \`${jelzo}\` jelzőt állítja false-ra (${JSON.stringify(rec.adat)})`)
        }
        const van = (c, v) => rec.szurok.some(([oc, ov]) => oc === c && ov === v)
        if (!van('id', VISSZAALLITANDO_ID)) jelez('K6', 'az update szűrőjében nincs `id`')
        if (!van(VART_SCOPE_OSZLOP, KERULETI_ID)) {
          jelez(
            'K6',
            `az update szűrőjében NINCS hatókör-oszlop (\`${VART_SCOPE_OSZLOP}\`), csak ` +
              `${JSON.stringify(rec.szurok.map((s) => s[0]))} — az \`id\` önmagában GLOBÁLISAN egyedi, ` +
              'tehát egy idegen kerület sorát is fel lehetne támasztani, ha az RLS valaha tágul',
          )
        }
        if (!van(jelzo, true)) {
          jelez('K6', `az update nem szűkít TÖRÖLT sorra (\`${jelzo} = true\` hiányzik)`)
        }
        if (!url || !url.includes('success')) {
          jelez('K6', `sikeres visszaállítás után nem siker-visszajelzés jött: ${url}`)
        }
      }

      // ── K7: a kerületi SZÁMVEVŐ nem ír ───────────────────────────────────
      const olvasoUzenet = 'Ellenőri (számvevői) nézetben vagy: az egyházkerület adatait megtekintheted.'
      const szamvevoKtx = alapKtx({ canWrite: false, readOnlyReason: olvasoUzenet })
      const szamvevo = await futtatVisszaallitas(
        akcio,
        szamvevoKtx,
        { tabla: celTabla, id: VISSZAALLITANDO_ID },
        () => ({ data: [{ id: VISSZAALLITANDO_ID }], error: null }),
      )
      if (szamvevo.naplo.length !== 0) {
        jelez(
          'K7',
          `a kerületi SZÁMVEVŐ visszaállítása ${szamvevo.naplo.length} lekérdezést INDÍTOTT el ` +
            '(0 várt) — a `moduleWriteBlock` kapu nem áll az írás előtt',
        )
      }
      if (!szamvevo.url || !szamvevo.url.startsWith('/kuka?error=')) {
        jelez('K7', `a számvevő nem hiba-visszajelzést kapott: ${szamvevo.url}`)
      } else if (new URLSearchParams(szamvevo.url.split('?')[1]).get('error') !== olvasoUzenet) {
        jelez('K7', 'a számvevő visszajelzése nem a `readOnlyReason` szövege — más okból állt meg?')
      }

      // A lista viszont OLVASHATÓ neki, olvasói felirattal.
      const { eredmeny: szamvevoLista } = await futtatLista(akcio, szamvevoKtx, valaszSiker)
      if (szamvevoLista?.keruleti !== true) {
        jelez('K7', 'a kerületi számvevő nem kapja meg a kerületi listát (olvasnia kell tudnia)')
      } else if (szamvevoLista.irhat !== false || szamvevoLista.olvasoiUzenet !== olvasoUzenet) {
        jelez(
          'K7',
          `a számvevő listája nem olvasói módban jött (irhat: ${szamvevoLista.irhat}, ` +
            `üzenet: ${JSON.stringify(szamvevoLista.olvasoiUzenet)?.slice(0, 80)})`,
        )
      }
    }

    // ── K8: a GYÜLEKEZETI út változatlanul fail-closed ─────────────────────
    {
      const gyulekezetiTabla = SOFT_DELETE.find((e) => GYULEKEZETI_CSAK.includes(e.supabaseTable))
      const tetel = [{ table: gyulekezetiTabla.dexieTable, ids: [VISSZAALLITANDO_ID] }]

      const sbUres = hamisSupabase(valaszSiker)
      globalThis.__KUKA_ONELLENORZES = { modul: null, effektiv: { supabase: sbUres, congregationId: null } }
      const uresValasz = await akcio.fetchExactDeletedAt(tetel)
      if (sbUres.naplo.length !== 0) {
        jelez(
          'K8',
          `congregation-kontextus NÉLKÜL ${sbUres.naplo.length} lekérdezés indult el a gyülekezeti ` +
            'úton (0 várt) — a változatlanul hagyott ág fail-closed őre eltűnt',
        )
      }
      if (!uresValasz || Object.keys(uresValasz).length !== 0) {
        jelez('K8', 'congregation-kontextus nélkül nem üres térkép jött vissza')
      }

      const sbTeljes = hamisSupabase(valaszSiker)
      globalThis.__KUKA_ONELLENORZES = { modul: null, effektiv: { supabase: sbTeljes, congregationId: 'gyul-1' } }
      await akcio.fetchExactDeletedAt(tetel)
      if (sbTeljes.naplo.length === 0) {
        jelez('K8', 'érvényes congregation-kontextusnál sem futott lekérdezés — a mérés tartalom nélküli')
      }
      for (const rec of sbTeljes.naplo) {
        if (!rec.szurok.some(([c, v]) => c === 'congregation_id' && v === 'gyul-1')) {
          jelez('K8', `a gyülekezeti \`${rec.tabla}\` lekérdezésről eltűnt a congregation_id szűrő`)
        }
      }
    }
  } finally {
    console.warn = eredetiWarn
    console.error = eredetiError
    globalThis.__KUKA_ONELLENORZES = undefined
  }

  return hibak
}

// ════════════════════════════════════════════════════════════════════════════
// MUTÁNS-GYÁROSOK
// ────────────────────────────────────────────────────────────────────────────
// A `csere()` MEGSZÁMOLJA a találatokat: eltérő darabszámnál HANGOSAN elbukik.
// Enélkül egy átfogalmazott `actions.ts` mellett a „mutáns" némán azonos
// maradhatna az eredetivel — és a negatív asszert vakká válna.
// ════════════════════════════════════════════════════════════════════════════
function csere(forras, re, ujra, varhatoDb) {
  let db = 0
  const ki = forras.replace(re, (...a) => {
    db += 1
    return typeof ujra === 'function' ? ujra(...a) : ujra
  })
  if (db !== varhatoDb) {
    throw new Error(
      `a mutáns-minta ${db}× illeszkedett (${varhatoDb} várt): ${re} — ` +
        'az actions.ts szerkezete elmozdult, a negatív asszert vakká válna',
    )
  }
  return ki
}

/**
 * A hatókör-szűrő KÓDSORAI. Szándékosan SOR-alakú a minta: a fájl fejléce
 * ugyanezt a kifejezést IDÉZI egy kommentben, és a K4b mutánsnak azt MEG KELL
 * HAGYNIA — így bizonyítjuk, hogy a komment-kiszedés load-bearing.
 */
const RE_SZURO_SOR = /^([ \t]*)\.eq\(ctx\.scopeCol, ctx\.scopeId\)([ \t]*\r?)$/gm
const RE_URES_OR = /^[ \t]*if \(!ctx\.scopeId\) return null[ \t]*\r?$/m
const RE_IRAS_KAPU =
  /^[ \t]*const blokk = moduleWriteBlock\(ctx\)[ \t]*\r?\n[ \t]*if \(blokk\) keruletiValasz\('error', blokk\.error\)[ \t]*\r?$/m
const RE_GYULEKEZETI_OR = /^[ \t]*if \(!congregationId\) return \{\}[ \t]*\r?$/m
const RE_HIBAS_TABLAK = /^([ \t]*)hibasTablak\.push\(csoportCim\(entry\)\)([ \t]*\r?)$/m
const RE_TABLA_LISTA = /const SCOPE_OSZLOPOS_TABLAK: readonly string\[\] = \[\r?\n/

const MUTANSOK = [
  [
    'a hatókör-szűrő KITÖRÖLVE mindkét lekérdezésből',
    (f) => csere(f, RE_SZURO_SOR, '', 2),
    ['K3', 'K6'],
  ],
  [
    'AZ EREDETI HIBAALAK: az üres-azonosító őr eltűnik, a szűrő pedig „ha van id" alapon marad el',
    (f) => csere(csere(f, RE_URES_OR, '', 1), RE_SZURO_SOR, '', 2),
    ['K2'],
  ],
  [
    "kézzel írt 'district_id' literál a kanonikus `ctx.scopeCol` helyett (a komment marad!)",
    (f) => csere(f, RE_SZURO_SOR, (_m, ws) => `${ws}.eq('district_id', ctx.scopeId)`, 2),
    ['K4b'],
  ],
  [
    "kézzel írt 'congregation_id' literál — a MÁSIK szint oszlopa ugyanezen a táblán",
    (f) => csere(f, RE_SZURO_SOR, (_m, ws) => `${ws}.eq('congregation_id', ctx.scopeId)`, 2),
    ['K4a'],
  ],
  [
    'a `moduleWriteBlock` írás-kapu kitörölve',
    (f) => csere(f, RE_IRAS_KAPU, '  void moduleWriteBlock', 1),
    ['K7'],
  ],
  [
    `congregation_id-only tábla ('${GYULEKEZETI_CSAK[0]}') csúszik a metszetbe`,
    (f) => csere(f, RE_TABLA_LISTA, (m) => `${m}  '${GYULEKEZETI_CSAK[0]}',\n`, 1),
    ['K5'],
  ],
  [
    'a GYÜLEKEZETI fail-closed őr kitörölve (a változatlanul hagyott ág)',
    (f) => csere(f, RE_GYULEKEZETI_OR, '', 1),
    ['K8'],
  ],
  [
    'a hibás tábla NÉMÁN kimarad (nincs `hibasTablak` jelzés)',
    (f) => csere(f, RE_HIBAS_TABLAK, (_m, ws) => `${ws}void csoportCim(entry)`, 1),
    ['K9'],
  ],
]

// ════════════════════════════════════════════════════════════════════════════
// FUTTATÁS
// ════════════════════════════════════════════════════════════════════════════
const foMerce = async () => {
  // 1) A VALÓDI forrás: minden mércének zöldnek kell lennie.
  const hibak = await mercek(NYERS_AKCIO)
  if (hibak.length === 0) {
    for (const [kod, leiras] of Object.entries(KOD_LEIRAS)) {
      ok(`${kod} ${leiras}`)
    }
  } else {
    for (const h of hibak) fail(`${h.kod}: ${h.uzenet}`)
  }

  // 2) A MUTÁNSOK: mindegyiknek pirosra kell váltania, ÉS a VÁRT mércén.
  console.log('')
  for (const [nev, gyar, vartKodok] of MUTANSOK) {
    let mutans
    try {
      mutans = gyar(NYERS_AKCIO)
    } catch (e) {
      fail(`MUTÁNS („${nev}") nem gyártható: ${e?.message || e}`)
      continue
    }
    if (mutans === NYERS_AKCIO) {
      fail(`MUTÁNS („${nev}") NEM különbözik az eredetitől — a negatív asszert vak`)
      continue
    }
    const mutansHibak = await mercek(mutans)
    const kapott = [...new Set(mutansHibak.map((h) => h.kod))]
    if (kapott.length === 0) {
      fail(
        `MUTÁNS („${nev}"): az őrszem ZÖLD maradt az elrontott forráson — ` +
          `a(z) [${vartKodok.join(', ')}] mérce sosem tudna pirosra váltani`,
      )
      continue
    }
    const hianyzo = vartKodok.filter((k) => !kapott.includes(k))
    if (hianyzo.length) {
      fail(
        `MUTÁNS („${nev}"): a várt mérce NEM bukott el ([${hianyzo.join(', ')}] hiányzik); ` +
          `a bukott mércék: [${kapott.join(', ')}] — az őrszem más okból lett piros`,
      )
      continue
    }
    ok(`negatív asszert — „${nev}" → BUKIK a(z) [${kapott.join(', ')}] mércén`)
  }
}

foMerce()
  .catch((e) => {
    fail(`az önellenőrzés kivétellel állt meg: ${e?.stack || e?.message || e}`)
  })
  .finally(() => {
    takarit()
    if (failed) {
      console.error('\nKerületi Kuka önellenőrzés: HIBA')
      process.exit(1)
    }
    console.log('\nKerületi Kuka önellenőrzés: minden zöld')
  })
