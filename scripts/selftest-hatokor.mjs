#!/usr/bin/env node
/**
 * MEGJELENÍTÉSI HATÓKÖR önellenőrzés (2026-08-11).
 *
 * Mit véd: `apps/web/lib/auth/display-scope-core.ts` — a mentés-sáv hatókörét
 * eldöntő TISZTA függvény.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A TESZT
 * ════════════════════════════════════════════════════════════════════════════
 * A projekt visszatérő hibaosztálya, hogy a BEKAPCSOLT PROFIL és a MÖGÖTTES
 * JOGOSULTSÁG széthúz: a tulajdonos barátosi lelkészi profilban böngész, de
 * master, ezért a hatókör-feloldó `null`-t (korlátlan) adott, és a mentés-sáv
 * 784 hatókört + idegen gyülekezet-neveket sorolt fel.
 *
 * A javítás egyetlen szabálya: MINDIG `metszet(jogosultság, profil)` — soha
 * unió, soha tágítás. Ez a fajta szabály a legkönnyebben esik vissza egy
 * későbbi refaktorban, mert „logikusnak" tűnik visszaírni az egyszerűbb ágat.
 * Ezért van assert rá.
 *
 * Futtatás:  node scripts/selftest-hatokor.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const FORRAS = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'auth', 'display-scope-core.ts')

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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-hatokor-selftest-'))

/**
 * TS → CJS, majd betöltés.
 *
 * Fail-closed: ha valaha PROJEKT-import kerülne a fájlba (pl. `server-only`),
 * a `require()` ismeretlen modulra futna. Inkább ITT bukjon el, érthető
 * üzenettel — a döntési magnak import-mentesnek KELL maradnia.
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
        'A hatókör-döntés magja csak import nélkül tesztelhető önállóan.',
    )
  }
  const dest = path.join(tmp, outName + '.js')
  fs.writeFileSync(dest, out.outputText, 'utf8')
  return require_(dest)
}

let mag
try {
  mag = loadTs(FORRAS, 'display-scope-core')
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

const { metszHatokort, uresHatokor } = mag

if (typeof metszHatokort !== 'function' || typeof uresHatokor !== 'function') {
  fail('a modul nem exportálja a metszHatokort / uresHatokor függvényt')
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

const egyenlo = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ────────────────────────────────────────────────────────────────────────────
// A1 — RENDSZERGAZDAI PROFIL: a teljes lista HASZNOS, nem vesszük el.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({ jogosultsagi: null, profil: null, aktivScope: 'system' })
  if (r.congregationIds === null && r.globalisIsVarhato === true && r.indok === 'jogosultsagi') {
    ok('A1 rendszergazdai profil + korlátlan jogosultság → országos, globális elvárva')
  } else {
    fail(`A1: ${JSON.stringify(r)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A2 — EZ MAGA A TULAJDONOS KÉRÉSE. Master, DE barátosi gyülekezeti profil.
//      Csak a saját gyülekezetét lássa, és a rendszerszintű mentést NE várja el.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({
    jogosultsagi: null, // master → korlátlan jogosultság
    profil: ['baratos'], // …de a bekapcsolt profil Barátos
    aktivScope: 'congregation',
  })
  if (
    egyenlo(r.congregationIds, ['baratos']) &&
    r.globalisIsVarhato === false &&
    r.indok === 'profil_szukit'
  ) {
    ok('A2 master + gyülekezeti profil → CSAK a saját gyülekezet (a 3. kérés lényege)')
  } else {
    fail(`A2: ${JSON.stringify(r)} — a master gyülekezeti profilban is országos hatókört kapott`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A3 — A PROFILVÁLTÁS SOHA NEM TÁGÍT. Kerületi admin, aki egy hatókörén KÍVÜLI
//      gyülekezet profilját kapcsolná be → üres metszet, nem szivárgás.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({
    jogosultsagi: ['a', 'b'], // a kerülete gyülekezetei
    profil: ['idegen'], // …de egy másik kerület gyülekezete
    aktivScope: 'congregation',
  })
  if (egyenlo(r.congregationIds, []) && uresHatokor(r)) {
    ok('A3 a profilváltás NEM tágít: hatókörön kívüli gyülekezet → üres metszet')
  } else {
    fail(`A3: ${JSON.stringify(r)} — a profilváltás átlépte a jogosultsági hatókört`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A4 — METSZET, nem unió. Kerületi admin megyei profilban: csak a közös rész.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({
    jogosultsagi: ['a', 'b', 'c'],
    profil: ['b', 'c', 'd'],
    aktivScope: 'diocese',
  })
  if (egyenlo(r.congregationIds, ['b', 'c']) && r.globalisIsVarhato === false) {
    ok('A4 metszet (nem unió): a közös rész marad, az idegen „d" kiesik')
  } else {
    fail(`A4: ${JSON.stringify(r)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A5 — FAIL-CLOSED. Ha a profil hatóköre nem oldható fel (`undefined`), a
//      SZŰKEBB ág nyer: ÜRES, soha nem országos.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({ jogosultsagi: null, profil: undefined, aktivScope: 'congregation' })
  if (egyenlo(r.congregationIds, []) && r.indok === 'fail_closed') {
    ok('A5 feloldhatatlan profil-hatókör → ÜRES (fail-closed), NEM országos')
  } else {
    fail(`A5: ${JSON.stringify(r)} — a feloldhatatlan hatókör országosra esett vissza`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A6 — Ugyanez `null` profillal egy SZŰKÍTŐ scope-on: értelmezhetetlen bemenet,
//      tehát szintén fail-closed. (Szűkítő profil nem adhat korlátlan hatókört.)
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({ jogosultsagi: null, profil: null, aktivScope: 'district' })
  if (egyenlo(r.congregationIds, []) && r.indok === 'fail_closed') {
    ok('A6 szűkítő scope + „nem szűkít" profil → fail-closed üres hatókör')
  } else {
    fail(`A6: ${JSON.stringify(r)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A7 — NINCS profile_roles sor (`aktivScope: null`): nincs bekapcsolt profil,
//      amit követni lehetne → a jogosultság MAGA az aktív kontextus.
//      Ez szándékos: enélkül elnémulna az őrszem egy olyan rendszergazdánál,
//      aki még nem kapott multi-role sorokat.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({ jogosultsagi: null, profil: null, aktivScope: null })
  if (r.congregationIds === null && r.globalisIsVarhato === true) {
    ok('A7 nincs profile_roles → a jogosultság dönt (az őrszem nem némul el)')
  } else {
    fail(`A7: ${JSON.stringify(r)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A7b — „ISMERETLEN": a `profile_roles` lekérdezés HIBÁZOTT, tehát NEM tudjuk,
//       van-e bekapcsolt profil. Ez NEM azonos az A7-tel: ott bizonyítékunk van
//       arra, hogy nincs sor, itt csak tudatlanságunk. Fail-closed ÜRES hatókör.
//
//       ⚠️ EZ AZ ASSERT A LÉNYEG. A7 és A7b bemenete korábban UGYANAZ a `null`
//       volt, ezért egy tranziens Supabase/RLS-hiba a `profile_roles` olvasásán
//       NÉMÁN visszahozta az országos hatókört a barátosi profilban — pontosan
//       az a tünet, amit ez a kör javítani hivatott.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({ jogosultsagi: null, profil: undefined, aktivScope: 'ismeretlen' })
  if (egyenlo(r.congregationIds, []) && r.indok === 'fail_closed' && r.globalisIsVarhato === false) {
    ok('A7b beolvashatatlan profile_roles → ÜRES (fail-closed), NEM országos')
  } else {
    fail(`A7b: ${JSON.stringify(r)} — a beolvashatatlan profile_roles országosra tágított`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A7c — Ugyanez akkor is, ha a profil-feloldó véletlenül `null`-t (nem szűkít)
//       adna: az „ismeretlen" ág MINDENT megelőz, nem lehet megkerülni.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({ jogosultsagi: null, profil: null, aktivScope: 'ismeretlen' })
  if (egyenlo(r.congregationIds, []) && r.indok === 'fail_closed') {
    ok('A7c az „ismeretlen" ág megelőzi a profil-feloldást is')
  } else {
    fail(`A7c: ${JSON.stringify(r)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A8 — A KERÜLETI ADMIN MA IS AZT LÁTJA, AMIT EDDIG: a saját kerületét, és a
//      rendszerszintű mentést nem várja el. (Nincs viselkedés-visszalépés.)
// ────────────────────────────────────────────────────────────────────────────
{
  const r = metszHatokort({
    jogosultsagi: ['a', 'b'],
    profil: ['a', 'b'],
    aktivScope: 'district',
  })
  if (egyenlo(r.congregationIds, ['a', 'b']) && r.globalisIsVarhato === false) {
    ok('A8 kerületi admin kerületi profilban: a saját kerülete, globális nélkül')
  } else {
    fail(`A8: ${JSON.stringify(r)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A9 — A BEMENET NEM MÓDOSUL (a hívó tömbjét nem írjuk felül).
// ────────────────────────────────────────────────────────────────────────────
{
  const profil = ['x', 'y']
  const jog = ['x']
  metszHatokort({ jogosultsagi: jog, profil, aktivScope: 'congregation' })
  if (egyenlo(profil, ['x', 'y']) && egyenlo(jog, ['x'])) {
    ok('A9 a bemeneti tömbök változatlanok maradnak')
  } else {
    fail('A9: a függvény módosította a bemenetet')
  }
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nMegjelenítési hatókör önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nMegjelenítési hatókör önellenőrzés: minden zöld')
