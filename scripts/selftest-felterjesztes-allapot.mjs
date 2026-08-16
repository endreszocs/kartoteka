#!/usr/bin/env node
/**
 * FELKÜLDÉS-ÁLLAPOT önellenőrzés (2026-08-16).
 *
 * Mit véd: `apps/web/lib/finance/felterjesztes-allapot-core.ts` — a megye →
 * egyházkerület felterjesztés állapotát MONDATTÁ fogalmazó TISZTA mag.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A TESZT
 * ════════════════════════════════════════════════════════════════════════════
 * A tünet, amiért a mag megszületett: a megyei felületek a NYERS `status`-t
 * olvasták, és a négy állapotból hármat (`submitted`, `received`, `returned`)
 * UGYANAZZAL a zöld „Felküldve" jelvénnyel mutattak. Az esperesi hivatal tehát
 * nem tudta, megérkezett-e egyáltalán, amit felküldött — a VISSZAKÜLDÉS indoka
 * pedig sehol nem látszott, így azt sem, mit kellene javítania.
 *
 * Négy szabály áll itt, és mindegyiket könnyű egy későbbi „egyszerűsítéssel"
 * visszaírni, mert mindegyik ÖSSZEVONHATÓNAK látszik:
 *
 *  (1) A HÁROM „fent van" ÁLLAPOT HÁROM KÜLÖN MONDAT. Ha bármelyik kettő
 *      összecsúszik, visszatér az eredeti hiba.
 *  (2) A VISSZAKÜLDÉSNÉL AZ INDOK A TEENDŐBEN VAN. Enélkül a megye tudja, hogy
 *      baj van, de nem tudja, mit javítson — a jelvény önmagában használhatatlan.
 *  (3) A VISSZAVONT FELKÜLDÉS (`status: 'draft'`) NEM „Felküldve". A feloldás-
 *      kérés első ága szándékosan 'draft'-ra állítja vissza a sort: ilyenkor az
 *      irat MÁR NINCS FENT, és ha a kártya továbbra is „Felküldve"-t írna, az
 *      esperes nem küldené fel újra a javított iratot.
 *  (4) A MAG TISZTA. Nincs `new Date()`, nincs projekt-import, a bemenetet nem
 *      írja át — különben sem itt, sem a szerveren/kliensen nem adna
 *      determinisztikus, azonos szöveget (hidratálás-eltérés + széthúzó
 *      feliratok, ez a hibaosztály a Dokumentumtárban egyszer már megtörtént).
 *
 * Futtatás:  node scripts/selftest-felterjesztes-allapot.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const FORRAS = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'finance', 'felterjesztes-allapot-core.ts')

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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-felterjesztes-selftest-'))

/**
 * TS → CJS, majd betöltés.
 *
 * FAIL-CLOSED: ha valaha PROJEKT-import kerülne a magba (pl. `server-only`, egy
 * `@/lib/...` érték-import vagy a Supabase-kliens), a `require()` ismeretlen
 * modulra futna. Inkább ITT bukjon el, érthető üzenettel — a megfogalmazó magnak
 * import-mentesnek KELL maradnia, hogy a szerver és a kliens ugyanazt a szöveget
 * kapja, és hogy ez a teszt egyáltalán be tudja tölteni.
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
        'A felküldés-állapot megfogalmazója csak import nélkül tesztelhető önállóan.',
    )
  }
  const dest = path.join(tmp, outName + '.js')
  fs.writeFileSync(dest, out.outputText, 'utf8')
  return require_(dest)
}

let mag
try {
  mag = loadTs(FORRAS, 'felterjesztes-allapot-core')
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

const { felterjesztesAllapotSzoveg } = mag

if (typeof felterjesztesAllapotSzoveg !== 'function') {
  fail('a modul nem exportálja a felterjesztesAllapotSzoveg függvényt')
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

/** Minden szöveg-mezőt EGY sztringgé fűz — a „szerepel-e benne" állításokhoz. */
const mind = (r) => [r.cimke, r.reszletek || '', r.tennivalo || ''].join(' | ')

// ────────────────────────────────────────────────────────────────────────────
// F1 — NINCS SOR: a megyének még nincs mit várnia a kerülettől.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = felterjesztesAllapotSzoveg(null)
  if (r.cimke === 'Nincs felküldve' && r.hangulat === 'semleges' && r.reszletek === null) {
    ok('F1 nincs sor → „Nincs felküldve"')
  } else {
    fail(`F1: ${JSON.stringify(r)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F1b — VAN sor, de a `letezik: false` zászló mond ellent (az összesítő-olvasó
//       így jelzi az üres évet). A zászló erősebb, mint a default státusz.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = felterjesztesAllapotSzoveg({ letezik: false, status: 'submitted' })
  if (r.cimke === 'Nincs felküldve') {
    ok('F1b `letezik: false` → „Nincs felküldve" (a zászló erősebb a státusznál)')
  } else {
    fail(`F1b: ${JSON.stringify(r)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F2 — FELKÜLDVE: fent van, de MÉG NEM vették át. A dátumnak látszania kell,
//      és a mondat NEM sugallhatja, hogy az ügy le van zárva.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = felterjesztesAllapotSzoveg({ status: 'submitted', submittedAt: '2026-03-04T09:12:00Z' })
  if (
    r.cimke === 'Felküldve' &&
    r.hangulat === 'folyamatban' &&
    (r.reszletek || '').includes('2026. 03. 04.') &&
    !!r.tennivalo
  ) {
    ok('F2 status=submitted → „Felküldve" + a felküldés dátuma a részletekben')
  } else {
    fail(`F2: ${JSON.stringify(r)} — hiányzik a dátum vagy a „még nem vették át" közlés`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F3 — ÁTVÉVE: a kerület elismerte a beérkezést. AZ ÁTVÉTEL dátuma a fő adat,
//      és NINCS teendő (ez a megye számára a „megérkezett" pont).
//
//      ⚠️ EZ AZ ASSERT A LÉNYEG: korábban ugyanezt a sort a felület „Felküldve"
//         jelvénnyel mutatta, tehát a megye nem tudta, megérkezett-e az irat.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = felterjesztesAllapotSzoveg({
    status: 'received',
    submittedAt: '2026-03-04T09:12:00Z',
    receivedAt: '2026-03-06T14:00:00Z',
  })
  if (
    r.cimke === 'Átvéve' &&
    r.hangulat === 'kesz' &&
    (r.reszletek || '').includes('2026. 03. 06.') &&
    (r.reszletek || '').includes('2026. 03. 04.') &&
    r.tennivalo === null
  ) {
    ok('F3 status=received → „Átvéve" + az átvétel dátuma (a felküldésé zárójelben)')
  } else {
    fail(`F3: ${JSON.stringify(r)} — az átvétel nem különül el a felküldéstől`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F4 — VISSZAKÜLDVE: az INDOKNAK a teendőben kell lennie. Enélkül a megye
//      tudja, hogy baj van, de nem tudja, mit javítson.
// ────────────────────────────────────────────────────────────────────────────
{
  const indok = 'A 207.02 sor nem egyezik a mellékelt kimutatással'
  const r = felterjesztesAllapotSzoveg({
    status: 'returned',
    submittedAt: '2026-03-04T09:12:00Z',
    receivedAt: '2026-03-06T14:00:00Z',
    returnedReason: indok,
  })
  if (
    r.cimke === 'Visszaküldve' &&
    r.hangulat === 'figyelem' &&
    (r.tennivalo || '').includes(indok)
  ) {
    ok('F4 status=returned → „Visszaküldve" ÉS a teendő tartalmazza az INDOKOT')
  } else {
    fail(`F4: ${JSON.stringify(r)} — a visszaküldés indoka nem jut el a felhasználóig`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F4b — VISSZAKÜLDVE INDOK NÉLKÜL: a felület akkor sem maradhat néma. Ilyenkor
//       is legyen teendő, és az ne úgy hangozzon, mintha lenne indoklás.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = felterjesztesAllapotSzoveg({ status: 'returned', submittedAt: '2026-03-04T09:12:00Z' })
  if (r.cimke === 'Visszaküldve' && !!r.tennivalo && !(r.tennivalo || '').includes('Indoklás:')) {
    ok('F4b visszaküldve indok nélkül → van teendő, üres „Indoklás:" nélkül')
  } else {
    fail(`F4b: ${JSON.stringify(r)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F5 — VISSZAVONT FELKÜLDÉS (`status: 'draft'`): a feloldás-kérés első ága
//      visszaállítja a sort piszkozatba, tehát az irat MÁR NINCS FENT. Ha ide
//      „Felküldve" kerülne, az esperes NEM küldené fel újra a javított iratot —
//      és a kerület örökre a régi, hibás iratra várna.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = felterjesztesAllapotSzoveg({
    status: 'draft',
    submittedAt: null,
    receivedAt: null,
  })
  if (r.cimke === 'Nincs felküldve' && r.hangulat === 'semleges') {
    ok('F5 visszavont felküldés (draft) → „Nincs felküldve", NEM „Felküldve"')
  } else {
    fail(`F5: ${JSON.stringify(r)} — a visszavont felküldés felküldöttnek látszik`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F5b — Ugyanez akkor is, ha a `submitted_at` pecsét BENN MARADT a soron (régi
//       sorokon előfordul). A STÁTUSZ dönt, nem a dátum megléte.
// ────────────────────────────────────────────────────────────────────────────
{
  const r = felterjesztesAllapotSzoveg({ status: 'draft', submittedAt: '2026-03-04T09:12:00Z' })
  if (r.cimke === 'Nincs felküldve') {
    ok('F5b draft + megmaradt felküldés-dátum → továbbra is „Nincs felküldve"')
  } else {
    fail(`F5b: ${JSON.stringify(r)} — a dátum megléte felülírta a státuszt`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F6 — A KERÜLET NEVE csak a részletekbe kerül (a mondatokba nem, mert a
//      magyar intézménynév ragozása mondatonként más lenne).
// ────────────────────────────────────────────────────────────────────────────
{
  const nev = 'Erdélyi Református Egyházkerület'
  const r = felterjesztesAllapotSzoveg(
    { status: 'submitted', submittedAt: '2026-03-04T09:12:00Z' },
    { keruletNev: nev },
  )
  if ((r.reszletek || '').includes(nev) && !(r.tennivalo || '').includes(nev)) {
    ok('F6 a kerület neve a részletekben jelenik meg, a mondatokban nem')
  } else {
    fail(`F6: ${JSON.stringify(r)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F7 — HIBÁS/HIÁNYZÓ IDŐBÉLYEG nem ronthatja el a jelvényt: a címke marad, a
//      dátum egyszerűen kimarad (nem lesz „Invalid Date" a hivatalos iraton).
// ────────────────────────────────────────────────────────────────────────────
{
  const r = felterjesztesAllapotSzoveg({ status: 'submitted', submittedAt: 'nem-datum' })
  if (r.cimke === 'Felküldve' && r.reszletek === null && !mind(r).includes('Invalid')) {
    ok('F7 értelmezhetetlen időbélyeg → a címke áll, a dátum kimarad')
  } else {
    fail(`F7: ${JSON.stringify(r)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F8 — A NÉGY ÁLLAPOT NÉGY KÜLÖN CÍMKE. Ez maga a javítás lényege: ha egy
//      későbbi „egyszerűsítés" kettőt összevonna, visszatérne az eredeti tünet.
// ────────────────────────────────────────────────────────────────────────────
{
  const cimkek = [
    felterjesztesAllapotSzoveg(null).cimke,
    felterjesztesAllapotSzoveg({ status: 'submitted' }).cimke,
    felterjesztesAllapotSzoveg({ status: 'received' }).cimke,
    felterjesztesAllapotSzoveg({ status: 'returned' }).cimke,
  ]
  if (new Set(cimkek).size === 4) {
    ok(`F8 a négy állapot négy KÜLÖN címke: ${cimkek.join(' / ')}`)
  } else {
    fail(`F8: összecsúszott címkék — ${cimkek.join(' / ')}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F9 — A BEMENET NEM MÓDOSUL (a hívó sorát nem írjuk át), és a függvény
//      DETERMINISZTIKUS: ugyanaz a bemenet mindig ugyanazt adja. Utóbbi azt is
//      bizonyítja, hogy nincs benne rejtett `new Date()` — különben a szerveren
//      és a böngészőben más szöveg születne, és a hidratálás eltérésre panaszkodna.
// ────────────────────────────────────────────────────────────────────────────
{
  const bemenet = {
    status: 'returned',
    submittedAt: '2026-03-04T09:12:00Z',
    receivedAt: '2026-03-06T14:00:00Z',
    returnedReason: 'Hiányzik a számvevői aláírás',
  }
  const masolat = JSON.stringify(bemenet)
  const a = felterjesztesAllapotSzoveg(bemenet)
  const b = felterjesztesAllapotSzoveg(bemenet)
  if (JSON.stringify(bemenet) === masolat && JSON.stringify(a) === JSON.stringify(b)) {
    ok('F9 a bemenet változatlan marad, és az eredmény determinisztikus')
  } else {
    fail('F9: a függvény módosította a bemenetet, vagy nem determinisztikus')
  }
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nFelküldés-állapot önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nFelküldés-állapot önellenőrzés: minden zöld')
