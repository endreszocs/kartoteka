#!/usr/bin/env node
/**
 * MODUL-HATÓKÖR MAG önellenőrzés (2026-08-17, kerületi S5 szelet, 4. hullám).
 *
 * Mit véd: `apps/web/lib/auth/module-scope-core.ts` — a scope-oszlopos modulok
 * (Leltár, Iktató) HÁROM tiszta leképezése:
 *   · `moduleScopeColumn`      — MELYIK OSZLOPRA szűr a lekérdezés;
 *   · `iktatoSequenceRpcFor`   — MELYIK RPC osztja ki az IKTATÓSZÁMOT;
 *   · `altalanosOlvasoiUzenet` — az írás-tiltás tartalék magyar szövege.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ MIÉRT VAN EZ A TESZT — AZ IKTATÓSZÁM VISSZAMENŐLEG JAVÍTHATATLAN
 * ════════════════════════════════════════════════════════════════════════════
 * A leképezések a hívó oldalon eredetileg így éltek:
 *
 *     ctx.scope === 'diocese' ? rpc('next_iktato_sequence_dio') : rpc('next_iktato_sequence')
 *
 * Ez NÉMA CSAPDA: amikor a `ModuleScope` unió HARMADIK értéket kap
 * (`'district'` — a kerület saját iktatót vezet, Endre K2 döntése), A FORDÍTÓ
 * NEM SZÓL. Az új szint csendben a GYÜLEKEZETI RPC-re esik, és a kerületi irat
 * egy gyülekezeti (rosszabb esetben IDEGEN gyülekezeti) számsorból kap
 * iktatószámot: DUPLIKÁLT IKTATÓSZÁM EGY HIVATALOS IRATON. Az iktatókönyv nem
 * írható át utólag — ezt a hibát nem lehet kijavítani, csak elviselni.
 *
 * A javítás EXHAUSTIVE SWITCH `never`-ellenőrzésű `default` ággal. A gazda-modul
 * (`module-scope.ts`) viszont `import 'server-only'`-t húz, ezért ott a szabályt
 * CSAK a `tsc` őrizte — futásidejű assert nem volt rá. Ezért költözött a három
 * függvény az import-mentes magba, és ezért van ez a fájl.
 *
 * HAT DOLGOT ŐRZÜNK:
 *   (1) mind a HÁROM scope a HELYES scope-oszlopot adja;
 *   (2) a district SOHA nem ad `congregation_id`-t és SOHA nem a gyülekezeti
 *       RPC-t (ez a néma visszaesés tünete);
 *   (3) mind a HÁROM scope KÜLÖNBÖZŐ RPC-nevet ad, a kerületié
 *       `next_iktato_sequence_dis`, és az RPC paraméter-neve is scope-helyes;
 *   (4) ISMERETLEN scope DOB mind a három függvényben — nem esik vissza némán;
 *   (5) a GYÜLEKEZETI és a MEGYEI viselkedés BYTE-RA VÁLTOZATLAN (regresszió-őr:
 *       ez a szelet az élesben futó 1. és 2. szintet nem mozdíthatja el);
 *   (6) a fordítói kapu (`never`) és a gazda-modul RE-EXPORTJA megvan.
 *
 * Futtatás:  node scripts/selftest-module-scope.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const FORRAS = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'auth', 'module-scope-core.ts')
const GAZDA = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'auth', 'module-scope.ts')

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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-module-scope-selftest-'))

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
        'A modul-hatókör döntési magja csak import nélkül tesztelhető önállóan.',
    )
  }
  const dest = path.join(tmp, outName + '.js')
  fs.writeFileSync(dest, out.outputText, 'utf8')
  return require_(dest)
}

let mag
try {
  mag = loadTs(FORRAS, 'module-scope-core')
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

const { moduleScopeColumn, iktatoSequenceRpcFor, altalanosOlvasoiUzenet } = mag

if (
  typeof moduleScopeColumn !== 'function' ||
  typeof iktatoSequenceRpcFor !== 'function' ||
  typeof altalanosOlvasoiUzenet !== 'function'
) {
  fail(
    'a mag nem exportálja mind a három függvényt ' +
      '(moduleScopeColumn / iktatoSequenceRpcFor / altalanosOlvasoiUzenet)',
  )
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

// ────────────────────────────────────────────────────────────────────────────
// A VÁRT ÉRTÉKEK — SZÁNDÉKOSAN KÉZZEL KIÍRVA, NEM A FORRÁSBÓL SZÁRMAZTATVA.
// Ha a forrásból olvasnánk ki őket, a teszt együtt mozdulna a hibával, és
// pontosan azt a regressziót nem venné észre, amiért írtuk.
// ────────────────────────────────────────────────────────────────────────────
const VART_OSZLOP = {
  congregation: 'congregation_id',
  diocese: 'diocese_id',
  district: 'district_id',
}
const VART_RPC = {
  congregation: 'next_iktato_sequence',
  diocese: 'next_iktato_sequence_dio',
  district: 'next_iktato_sequence_dis',
}
const VART_RPC_PARAM = {
  congregation: 'p_congregation_id',
  diocese: 'p_diocese_id',
  district: 'p_district_id',
}

// ────────────────────────────────────────────────────────────────────────────
// M1 — MIND A HÁROM SCOPE A HELYES SZŰRŐ-OSZLOPOT ADJA.
//      A gyülekezeti és a megyei érték élesben fut (2024 / 2026-08-15 óta) —
//      ez egyben regresszió-őr is: ez a szelet nem mozdíthatja el őket.
// ────────────────────────────────────────────────────────────────────────────
{
  let mind = true
  for (const [scope, vart] of Object.entries(VART_OSZLOP)) {
    const kapott = moduleScopeColumn(scope)
    if (kapott !== vart) {
      fail(`M1: moduleScopeColumn('${scope}') → '${kapott}' (várt: '${vart}')`)
      mind = false
    }
  }
  if (mind) {
    ok('M1 mind a 3 scope helyes oszlopot ad (congregation_id / diocese_id / district_id)')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// M2 — ⛔ EZ AZ EGYIK LÉNYEG. A KERÜLET SOHA NEM KAPHAT `congregation_id`-T.
//      Ez a néma visszaesés tünete: `.eq('congregation_id', <kerület-uuid>)`
//      nem hibázik, csak 0 sort ad — VAGY írásnál a kerületi leltári tétel a
//      gyülekezet sorai közé kerül. Külön, NEVESÍTETT assert kell rá, mert ezt
//      egy későbbi „egyszerűsítés" (`if/else` visszaírása) rontja el.
// ────────────────────────────────────────────────────────────────────────────
{
  const ker = moduleScopeColumn('district')
  const gyul = moduleScopeColumn('congregation')
  const megye = moduleScopeColumn('diocese')
  if (ker !== gyul && ker !== megye && ker === 'district_id') {
    ok('M2 a district SOHA nem ad congregation_id-t (és nem is diocese_id-t)')
  } else {
    fail(
      `M2: a kerületi ág VISSZAESETT egy másik szint oszlopára — ` +
        `district='${ker}', congregation='${gyul}', diocese='${megye}'`,
    )
  }
  // Öv-és-nadrágtartó: a három oszlop-név páronként különbözik.
  if (new Set([gyul, megye, ker]).size === 3) {
    ok('M2b a 3 scope-oszlop páronként különbözik')
  } else {
    fail(`M2b: két scope UGYANARRA az oszlopra szűr — [${gyul}, ${megye}, ${ker}]`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// M3 — ⛔ EZ A LEGDRÁGÁBB ASSERT: AZ IKTATÓSZÁM-KIOSZTÓ RPC.
//      Mind a három scope KÜLÖNBÖZŐ RPC-t hív, a kerületié
//      `next_iktato_sequence_dis`, és a paraméter-név is scope-helyes.
//      Ha két scope UGYANARRA az RPC-re esik, két szint OSZTOZIK EGY SZÁMSORON
//      → duplikált iktatószám hivatalos iraton, visszamenőleg javíthatatlanul.
// ────────────────────────────────────────────────────────────────────────────
{
  const hivas = {}
  for (const scope of ['congregation', 'diocese', 'district']) {
    hivas[scope] = iktatoSequenceRpcFor({ scope, scopeId: `uuid-${scope}` }, 2026)
  }

  let mind = true
  for (const [scope, vart] of Object.entries(VART_RPC)) {
    if (hivas[scope].fn !== vart) {
      fail(`M3: iktatoSequenceRpcFor('${scope}') → '${hivas[scope].fn}' (várt: '${vart}')`)
      mind = false
    }
  }
  if (mind) ok('M3 mind a 3 scope a saját RPC-jét hívja (a kerületié next_iktato_sequence_dis)')

  const nevek = ['congregation', 'diocese', 'district'].map((s) => hivas[s].fn)
  if (new Set(nevek).size === 3) {
    ok('M3b a 3 RPC-név páronként KÜLÖNBÖZIK (nincs közös számsor két szint közt)')
  } else {
    fail(
      `M3b: két scope UGYANAZT az iktatószám-kiosztó RPC-t hívja — [${nevek}]. ` +
        'Ez KÖZÖS SZÁMSOR: duplikált iktatószám egy hivatalos iraton.',
    )
  }

  if (hivas.district.fn !== hivas.congregation.fn) {
    ok('M3c a district SOHA nem a gyülekezeti RPC-t hívja (a néma visszaesés tünete)')
  } else {
    fail('M3c: a district a GYÜLEKEZETI iktatószám-kiosztóra esett vissza — pontosan a csapda')
  }

  // A paraméter-név is scope-helyes: `p_congregation_id` egy kerületi RPC-nek
  // átadva „function does not exist" PostgREST-hibát adna (a legjobb eset), de
  // egy azonos nevű túlterhelésnél NÉMÁN rossz számsort nyitna.
  let paramOk = true
  for (const [scope, vartParam] of Object.entries(VART_RPC_PARAM)) {
    const args = hivas[scope].args || {}
    if (!(vartParam in args)) {
      fail(`M3d: a '${scope}' RPC-hívásból hiányzik a '${vartParam}' paraméter — ${JSON.stringify(args)}`)
      paramOk = false
    }
    if (args[vartParam] !== `uuid-${scope}`) {
      fail(`M3d: a '${scope}' RPC '${vartParam}' paramétere nem a scopeId-t kapta`)
      paramOk = false
    }
    if (args.p_year !== 2026) {
      fail(`M3d: a '${scope}' RPC p_year paramétere '${args.p_year}' (2026 számot vártunk)`)
      paramOk = false
    }
    // Idegen scope paraméter-neve SOHA nem szivároghat be.
    const idegen = Object.values(VART_RPC_PARAM).filter((p) => p !== vartParam && p in args)
    if (idegen.length > 0) {
      fail(`M3d: a '${scope}' RPC-hívásba IDEGEN scope-paraméter került: [${idegen}]`)
      paramOk = false
    }
  }
  if (paramOk) ok('M3d minden RPC a saját paraméter-nevét kapja (p_*_id + p_year szám)')
}

// ────────────────────────────────────────────────────────────────────────────
// M4 — AZ ÍRÁS-TILTÁS TARTALÉK SZÖVEGE.
//      A gyülekezeti/megyei szöveg BETŰRE a korábbi (regresszió-őr), a kerületi
//      pedig KÜLÖN — különben a kerületi számvevőt „az esperes vagy az
//      egyházmegyei adminisztrátor"-hoz küldenénk, ROSSZ ÜGYINTÉZŐHÖZ.
// ────────────────────────────────────────────────────────────────────────────
{
  const gy = altalanosOlvasoiUzenet('congregation')
  const me = altalanosOlvasoiUzenet('diocese')
  const ke = altalanosOlvasoiUzenet('district')

  if (gy === me) {
    ok('M4 a gyülekezeti és a megyei tartalék-szöveg VÁLTOZATLANUL közös (regresszió-őr)')
  } else {
    fail('M4: a gyülekezeti és a megyei tartalék-szöveg SZÉTHÚZOTT — ez élesben futó viselkedés')
  }
  if (me.includes('egyházmegye') && me.includes('esperes')) {
    ok('M4b a megyei szöveg az esperest / egyházmegyei adminisztrátort nevezi meg')
  } else {
    fail(`M4b: a megyei tartalék-szöveg ELMOZDULT — ${JSON.stringify(me)}`)
  }
  if (ke !== me && ke.includes('egyházkerület') && ke.includes('egyházkerületi adminisztrátor')) {
    ok('M4c a kerületi szöveg KÜLÖN, és az egyházkerületi adminisztrátorhoz irányít')
  } else {
    fail(`M4c: a kerületi tartalék-szöveg némán a megyeire esett vissza — ${JSON.stringify(ke)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// M5 — ISMERETLEN SCOPE DOB, MIND A HÁROM FÜGGVÉNYBEN.
//      Futásidőben ez a fail-closed háló a fordítói kapu alatt: soha nem esünk
//      vissza némán a gyülekezeti ágra. (A fordítói kapu maga a `never`
//      értékadás — azt a `tsc` őrzi, ezt a teszt.)
// ────────────────────────────────────────────────────────────────────────────
{
  const dob = (fn) => {
    try {
      fn()
      return false
    } catch {
      return true
    }
  }

  if (dob(() => moduleScopeColumn('negyedik_szint'))) {
    ok('M5a ismeretlen scope → moduleScopeColumn DOB (nem esik vissza congregation_id-re)')
  } else {
    fail('M5a: az ismeretlen scope NÉMÁN visszaesett egy oszlopra — pontosan a csapda')
  }

  if (dob(() => iktatoSequenceRpcFor({ scope: 'negyedik_szint', scopeId: 'x' }, 2026))) {
    ok('M5b ismeretlen scope → iktatoSequenceRpcFor DOB (nem a gyülekezeti számsor)')
  } else {
    fail(
      'M5b: az ismeretlen scope NÉMÁN kapott iktatószám-kiosztót — ' +
        'ez duplikált iktatószám egy hivatalos iraton',
    )
  }

  if (dob(() => altalanosOlvasoiUzenet('negyedik_szint'))) {
    ok('M5c ismeretlen scope → altalanosOlvasoiUzenet DOB (nem a megyei szöveg)')
  } else {
    fail('M5c: az ismeretlen scope NÉMÁN a megyei szöveget kapta — rossz ügyintézőhöz küld')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// M6 — A FORDÍTÓI KAPU MEGLÉTE. A `never` értékadás az EGYETLEN, ami egy
//      jövőbeli NEGYEDIK szintnél fordítási hibát ad néma adatvesztés helyett.
//      Ha valaki „fölösleges kódként" kitörli, a futásidejű dobás megmaradhat,
//      de a fordító elnémul — ezért erre KÜLÖN assert kell.
// ────────────────────────────────────────────────────────────────────────────
{
  const forras = fs.readFileSync(FORRAS, 'utf8')
  // ⚠️ A KOMMENTEKET KI KELL SZEDNI a számolás előtt: a fájl fejléce SZÁNDÉKOSAN
  //    idézi a `const _nemKezelt: never = scope` sort (ott magyarázza el, miért
  //    nem törölhető). Ha a nyers szövegben számolnánk, a teszt akkor is zöld
  //    maradna, ha a VALÓDI kapu eltűnik és csak a róla szóló komment marad.
  const kodCsak = forras.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
  const neverek = (kodCsak.match(/:\s*never\s*=\s*(ctx\.)?scope/g) || []).length
  if (neverek === 3) {
    ok('M6 a never-ellenőrzésű default ág megvan MIND A 3 függvényben (kommentek nélkül)')
  } else {
    fail(
      `M6: a \`const _nemKezelt: never = scope\` fordítói kapu ${neverek} helyen van meg (3 kell). ` +
        'Enélkül egy negyedik szint NÉMÁN rossz oszlopra szűrne / rossz számsorból iktatna.',
    )
  }
  const switchek = (kodCsak.match(/\bswitch\s*\(\s*(ctx\.)?scope\s*\)/g) || []).length
  if (switchek === 3) {
    ok('M6b mind a 3 leképezés exhaustive `switch (scope)` alakú')
  } else {
    fail(`M6b: ${switchek} db \`switch (scope)\` van a magban (3 kell) — visszaírták if/else-re?`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// M7 — A GAZDA-MODUL RE-EXPORTÁLJA A MAGOT. A meglévő hívók (leltar/actions.ts,
//      iktato/actions.ts, template-actions.ts, csatolmany-actions.ts,
//      szemely-actions.ts, qr-actions.ts, lib/filing/sequence-preview.ts, a két
//      page.tsx) a `@/lib/auth/module-scope`-ból importálnak — ha a re-export
//      eltűnik, a build áll meg (az még jó), de ha valaki „megjavítja" egy helyi
//      másolattal, visszatér a két, széthúzó implementáció hibaosztálya.
// ────────────────────────────────────────────────────────────────────────────
{
  if (!fs.existsSync(GAZDA)) {
    fail(`M7: hiányzik a gazda-modul: ${GAZDA}`)
  } else {
    // Ugyanaz a komment-kiszedés, mint az M6-ban, és ugyanabból az okból: a
    // gazda-modul KOMMENTJEI is emlegetik a függvény-neveket és a `district`
    // szintet — kommentre alapozott zöld jelzés hamis biztonság.
    const gazda = fs
      .readFileSync(GAZDA, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')

    const reexport = /export\s*\{[^}]*moduleScopeColumn[^}]*\}\s*from\s*['"][^'"]*module-scope-core['"]/s.test(
      gazda,
    )
    const rpcReexport = /export\s*\{[^}]*iktatoSequenceRpcFor[^}]*\}\s*from\s*['"][^'"]*module-scope-core['"]/s.test(
      gazda,
    )
    const tipusReexport = /export\s+type\s*\{[^}]*ModuleScopeColumn[^}]*\}\s*from\s*['"][^'"]*module-scope-core['"]/s.test(
      gazda,
    )
    const helyiMasolat =
      /export\s+function\s+(moduleScopeColumn|iktatoSequenceRpcFor|altalanosOlvasoiUzenet)\s*\(/.test(
        gazda,
      ) || /^\s*function\s+altalanosOlvasoiUzenet\s*\(/m.test(gazda)

    if (reexport && rpcReexport && tipusReexport && !helyiMasolat) {
      ok('M7 a module-scope.ts a magot re-exportálja (függvények + típusok, nincs helyi másolat)')
    } else if (helyiMasolat) {
      fail(
        'M7: a module-scope.ts HELYI MÁSOLATOT tart a mag függvényeiből — ' +
          'két, széthúzó implementáció (az iktatószámnál ez duplikált szám)',
      )
    } else {
      fail(
        `M7: hiányos re-export a module-scope.ts-ben ` +
          `(moduleScopeColumn: ${reexport}, iktatoSequenceRpcFor: ${rpcReexport}, típusok: ${tipusReexport})`,
      )
    }

    // A gazda-modul a `scopeCol`-t KIZÁRÓLAG a mag leképezéséből tölti — kézzel
    // írt 'congregation_id' literál a kontextusban némán a MÁSIK scope oszlopára
    // szűrne. A három scope-ág mindegyike `moduleScopeColumn(...)`-t hív.
    const scopeColHivasok = (gazda.match(/scopeCol:\s*moduleScopeColumn\(/g) || []).length
    const kezziLiteral = /scopeCol:\s*['"]/.test(gazda)
    if (scopeColHivasok === 3 && !kezziLiteral) {
      ok('M7b a getModuleScopeContext mind a 3 ágban moduleScopeColumn()-t hív (nincs kézi literál)')
    } else {
      fail(
        `M7b: a scopeCol nem a mag leképezéséből jön minden ágban ` +
          `(moduleScopeColumn hívás: ${scopeColHivasok}/3, kézi literál: ${kezziLiteral})`,
      )
    }

    // ⚠️ A kerületi ág CSAK a SZEREP-SZŰRT olvasó feloldót használhatja. A tág,
    //    szerep-SZŰRETLEN `resolveDistrictScopeId(s)` egy elavult
    //    `profiles.district_id` skalárral IDEGEN kerület leltárát/iktatóját
    //    nyitná meg (a finance-scope párján ugyanez az őr fut).
    if (/resolveDistrictScopeIds?\s*\(/.test(gazda)) {
      fail(
        'M7c: a module-scope.ts a SZEREP-SZŰRETLEN resolveDistrictScopeId(s)-t hívja — ' +
          'az elavult profiles.district_id skalárral idegen kerület iratait nyithatja meg',
      )
    } else if (/resolveDistrictReadScopeIds/.test(gazda) && /scope:\s*'district'/.test(gazda)) {
      ok('M7d a kerületi ág megvan és szerep-szűrt (resolveDistrictReadScopeIds)')
    } else {
      fail('M7d: a getModuleScopeContext kerületi ága hiányzik vagy nem szerep-szűrt feloldót hív')
    }
  }
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nModul-hatókör mag önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nModul-hatókör mag önellenőrzés: minden zöld')
