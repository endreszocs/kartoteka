#!/usr/bin/env node
/**
 * EGYHÁZKERÜLETI ÖSSZESÍTŐ önellenőrzés (2026-08-17, kerületi S4).
 *
 * Mit véd: `apps/web/lib/district/osszesito-core.ts` — a kerületi összesítés
 * TISZTA számoló magja, ami a MEGYEI FELTERJESZTÉSEK fagyasztott
 * `snapshot_data`-jából dolgozik (K4 döntés: a kerület csak a hivatalosan
 * beküldött adatokat és azok összesítőjét látja).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A TESZT
 * ════════════════════════════════════════════════════════════════════════════
 * Ugyanaz a négy szabály áll a kerületi összesítő hitele mögött, mint a
 * megyeié (scripts/selftest-osszesito.mjs) — csak eggyel feljebb, MEGYÉKRE
 * alkalmazva. Mindegyiket könnyű egy későbbi „egyszerűsítéssel" visszaírni, és
 * mindegyik NÉMÁN hazudna:
 *
 *  (1) AMI NINCS FELTERJESZTVE, AZ LÁTHATÓAN HIÁNYZIK. A hatókör TELJES
 *      egyházmegye-listájából dolgozunk, nem a felterjesztésekből — különben
 *      egy „kerek" kerületi végösszeg mögött fél kerület hiánya rejtőzne, és a
 *      püspöki hivatal ezt tekintené a kerület hivatalos képének.
 *
 *  (2) A VISSZAKÜLDÖTT ('returned') IRAT NEM SZÁMÍT BELE. Azt épp a kerület
 *      küldte vissza javításra: ha beleszámolnánk, a kerület a saját maga által
 *      megkifogásolt számot összesítené. Ugyanígy nem számít a 'draft' (fel sem
 *      küldött vagy VISSZAVONT irat — a feloldás-kérés első ága szándékosan
 *      'draft'-ra állítja vissza a sort).
 *
 *  (3) A PILLANATKÉPNEK TÖBB ALAKJA VAN, ÉS A KANONIKUS AZ ERŐSEBB. A megyei
 *      számadás csomagja lehet kanonikus (`income`/`totalIncome`), régi
 *      wizard-alak (`actualIncome`/`totalActualIncome`) vagy alakVerzió 1
 *      (`kanonikus` alobjektum); a számvevői összesítő lehet burkolt
 *      (`{osszesito:{…}}`) vagy csupasz. Ha a mag csak az egyiket olvasná, a
 *      korábbi évek kerületi összesítője 0 lejt mutatna — ez a hiba a
 *      dokumentumközpontban egyszer már megtörtént.
 *      ⚠️ ALAKVERZIÓ 1-nél a FELSŐ SZINT a NYERS szerver-összesítés (a hivatalos
 *      ívre NEM szűrve), a hivatalos adat a `kanonikus` alobjektumban van —
 *      ezért ott a kanonikus MINDIG erősebb. A fordított sorrend a hivatalos
 *      kerületi ívre az íven KÍVÜLI pénzt is felvinné (C6–C8 blokk).
 *
 *  (4) A KÖLTSÉGVETÉSNÉL A LEGUTOLSÓ MÓDOSÍTÁS AZ ÉRVÉNYES — KÉT SZINTEN: a
 *      magasabb sorszámú módosítás-FELTERJESZTÉS veri az alacsonyabbat és az
 *      alap tervet, soron belül pedig a legkésőbbi kitöltött módosítás.
 *
 * Futtatás:  node scripts/selftest-keruleti-osszesito.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const FORRAS = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'district', 'osszesito-core.ts')

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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-keruleti-osszesito-selftest-'))

/**
 * TS → CJS, majd betöltés.
 *
 * FAIL-CLOSED: ha valaha PROJEKT-import kerülne a magba (pl. `server-only`, egy
 * `@/lib/...` érték-import vagy a Supabase-kliens), a `require()` ismeretlen
 * modulra futna. Inkább ITT bukjon el, érthető üzenettel — a számoló magnak
 * import-mentesnek KELL maradnia, különben sem ez a teszt, sem a jövőbeli
 * nyomtatvány-/desktop-újrafelhasználás nem tudja betölteni.
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
    fileName: `${outName}.ts`,
  })
  const idegen = [...out.outputText.matchAll(/require\(["']([^"']+)["']\)/g)]
    .map((m) => m[1])
    .filter((m) => !m.startsWith('node:') && !m.startsWith('.'))
  if (idegen.length > 0) {
    throw new Error(
      `${outName}: FUTÁSIDEJŰ PROJEKT-IMPORT került a fájlba (${idegen.join(', ')}). ` +
        'A kerületi összesítő magja csak import nélkül tesztelhető önállóan.',
    )
  }
  const dest = path.join(tmp, `${outName}.js`)
  fs.writeFileSync(dest, out.outputText, 'utf8')
  return require_(dest)
}

let C
try {
  C = loadTs(FORRAS, 'keruleti-osszesito-core')
} catch (e) {
  fail(`transpile/betöltés hiba: ${e?.message || e}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

// ────────────────────────────────────────────────────────────────────────────
// Próbaadatok
// ────────────────────────────────────────────────────────────────────────────

const MEGYEK = [
  { id: 'm1', nev: 'Alsó Egyházmegye' },
  { id: 'm2', nev: 'Bodoki Egyházmegye' },
  { id: 'm3', nev: 'Csernátoni Egyházmegye' },
]

const KOD_KATALOGUS = [
  { kod: '101', nev: 'Egyházfenntartói járulék', tipus: 'B', sorszam: 1 },
  { kod: '102', nev: 'Perselypénz', tipus: 'B', sorszam: 2 },
  { kod: '201', nev: 'Lelkészi javadalom', tipus: 'K', sorszam: 10 },
]

const alap = (extra = {}) => ({
  ev: 2025,
  megyek: MEGYEK,
  felterjesztesek: [],
  kodKatalogus: KOD_KATALOGUS,
  ...extra,
})

/** Számadás-felterjesztés a KANONIKUS pillanatkép-alakkal. */
const szamadas = (dioceseId, { bevetel, kiadas, status = 'submitted', ev = 2025 }) => ({
  dioceseId,
  docType: 'megyei_szamadas',
  year: ev,
  modificationNumber: 0,
  status,
  submittedAt: '2026-01-10T08:00:00Z',
  snapshot: {
    income: { 101: bevetel },
    expense: { 201: kiadas },
    totalIncome: bevetel,
    totalExpense: kiadas,
    alakVerzio: 2,
  },
})

// ────────────────────────────────────────────────────────────────────────────
// A) ÜRES BEMENET — a fail-closed alapállapot
// ────────────────────────────────────────────────────────────────────────────
{
  let o = null
  try {
    o = C.szamitKeruletiOsszesito(alap())
  } catch (e) {
    fail(`A0: üres bemenetre KIVÉTELT dobott: ${e?.message || e}`)
  }

  if (o) {
    if (
      o.szamadas.osszBevetel === 0 &&
      o.szamadas.allapot.bekuldott.length === 0 &&
      o.szamadas.allapot.hianyzo.length === 3
    ) {
      ok('A1 felterjesztés nélkül MINDEN egyházmegye hiányzóként látszik (nem „kerek nulla")')
    } else {
      fail(`A1: ${JSON.stringify(o.szamadas.allapot)}`)
    }

    const mindenSzakasz = [o.szamadas, o.koltsegvetes, o.szamvevoiOsszesito]
    if (mindenSzakasz.every((sz) => sz.allapot.hianyzo.length === 3)) {
      ok('A2 MINDEN szakasz (számadás, költségvetés, számvevői) jelzi a 3 hiányzó megyét')
    } else {
      fail(`A2: ${JSON.stringify(mindenSzakasz.map((sz) => sz.allapot.hianyzo.length))}`)
    }

    if (o.megyeSzam === 3 && o.szamvevoiOsszesito.gyulekezetSzam === 0) {
      ok('A3 a megye-szám a hatókör TELJES listájából jön, a gyülekezet-szám 0')
    } else {
      fail(`A3: megyeSzam=${o.megyeSzam}, gyulekezetSzam=${o.szamvevoiOsszesito.gyulekezetSzam}`)
    }

    // Egyetlen felterjesztett összesítő nélkül a mutató-lista ÜRES: egy csupa
    // nulla mutató-tábla azt sugallná, hogy a kerületben nincs se lélek, se
    // pénz — pedig csak nincs miből számolni.
    if (o.szamvevoiOsszesito.mutatok.length === 0) {
      ok('A4 összesítő nélkül a mutató-lista ÜRES (nem csupa nulla táblázat)')
    } else {
      fail(`A4: ${JSON.stringify(o.szamvevoiOsszesito.mutatok)}`)
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// B) A VISSZAKÜLDÖTT ÉS A PISZKOZAT IRAT NEM SZÁMÍT BELE
// ────────────────────────────────────────────────────────────────────────────
{
  const o = C.szamitKeruletiOsszesito(
    alap({
      felterjesztesek: [
        // A kerület javításra visszaküldte — a saját kifogásolt száma nem összesíthető.
        szamadas('m1', { bevetel: 9999, kiadas: 0, status: 'returned' }),
        // Piszkozat: fel sem küldték (vagy visszavonták a felküldést).
        szamadas('m2', { bevetel: 5555, kiadas: 0, status: 'draft' }),
        // Érvényes, ÁTVETT irat.
        szamadas('m3', { bevetel: 100, kiadas: 40, status: 'received' }),
      ],
    }),
  )

  if (o.szamadas.osszBevetel === 100 && o.szamadas.osszKiadas === 40) {
    ok('B1 sem a visszaküldött (9999), sem a piszkozat (5555) összeg nem került az összesítőbe')
  } else {
    fail(`B1: bevétel=${o.szamadas.osszBevetel} (várt 100), kiadás=${o.szamadas.osszKiadas} (várt 40)`)
  }

  const visszakuldottNevek = o.szamadas.allapot.visszakuldott.map((m) => m.nev)
  if (visszakuldottNevek.length === 1 && visszakuldottNevek[0] === 'Alsó Egyházmegye') {
    ok('B2 a visszaküldött irat egyházmegyéje KÜLÖN, NEVESÍTVE látszik')
  } else {
    fail(`B2: ${JSON.stringify(visszakuldottNevek)}`)
  }

  if (!o.szamadas.allapot.hianyzo.some((m) => m.id === 'm1')) {
    ok('B3 a visszaküldött megye nem duplázódik a „nem terjesztette fel" listába')
  } else {
    fail('B3: a visszaküldött megye a hiányzók közt IS megjelent')
  }

  const hianyzoNevek = o.szamadas.allapot.hianyzo.map((m) => m.nev)
  if (hianyzoNevek.length === 1 && hianyzoNevek[0] === 'Bodoki Egyházmegye') {
    ok('B4 a PISZKOZAT („draft") megye a hiányzók közt van — nem tűnik el, és nem is számít bele')
  } else {
    fail(`B4: ${JSON.stringify(hianyzoNevek)}`)
  }

  const szoveg = C.hianyOsszefoglalo(o.szamadas.allapot)
  if (
    typeof szoveg === 'string' &&
    szoveg.includes('Bodoki Egyházmegye') &&
    szoveg.includes('Alsó Egyházmegye')
  ) {
    ok('B5 a hiány-összefoglaló EGY mondatban megnevezi a hiányzót és a visszaküldöttet')
  } else {
    fail(`B5: ${JSON.stringify(szoveg)}`)
  }

  if (C.hianyOsszefoglalo({ bekuldott: MEGYEK, hianyzo: [], visszakuldott: [] }) === null) {
    ok('B6 teljes összesítőnél a hiány-összefoglaló null (nincs mit mondani)')
  } else {
    fail('B6: teljes összesítőnél is mondatot adott a hiány-összefoglaló')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// C) A PILLANATKÉP TÖBB ALAKJA — a 0 lejes hiba ellen
// ────────────────────────────────────────────────────────────────────────────
{
  const o = C.szamitKeruletiOsszesito(
    alap({
      felterjesztesek: [
        {
          // RÉGI (wizard-)alak: actualIncome / totalActualIncome
          dioceseId: 'm1',
          docType: 'megyei_szamadas',
          year: 2025,
          modificationNumber: 0,
          status: 'submitted',
          submittedAt: '2026-01-10T08:00:00Z',
          snapshot: {
            actualIncome: { 101: 500, 102: 250 },
            actualExpense: { 201: 300 },
            totalActualIncome: 750,
            totalActualExpense: 300,
          },
        },
        {
          // ÚJ (kanonikus) alak — UGYANAZOK a számok, más kulcsokkal.
          dioceseId: 'm2',
          docType: 'megyei_szamadas',
          year: 2025,
          modificationNumber: 0,
          status: 'received',
          submittedAt: '2026-01-11T08:00:00Z',
          snapshot: {
            income: { 101: 500, 102: 250 },
            expense: { 201: 300 },
            totalIncome: 750,
            totalExpense: 300,
            alakVerzio: 2,
          },
        },
        {
          // ALAKVERZIÓ 1: a hivatalos adat a `kanonikus` alobjektumban.
          dioceseId: 'm3',
          docType: 'megyei_szamadas',
          year: 2025,
          modificationNumber: 0,
          status: 'submitted',
          submittedAt: '2026-01-12T08:00:00Z',
          snapshot: {
            alakVerzio: 1,
            kanonikus: {
              income: { 101: 500, 102: 250 },
              expense: { 201: 300 },
              totalIncome: 750,
              totalExpense: 300,
            },
          },
        },
      ],
    }),
  )

  const megyeOsszegek = o.szamadas.megyenkent.map((m) => m.bevetel)
  if (megyeOsszegek.length === 3 && megyeOsszegek.every((b) => b === 750)) {
    ok('C1 mind a HÁROM pillanatkép-alak UGYANAZT az összeget adja (750)')
  } else {
    fail(
      `C1: ${JSON.stringify(megyeOsszegek)} (várt [750,750,750]). ` +
        'Ha a mag csak az egyik kulcs-alakot olvassa, a korábbi évek 0 lejt mutatnának.',
    )
  }

  if (o.szamadas.osszBevetel === 2250 && o.szamadas.osszKiadas === 900) {
    ok('C2 a kerületi végösszeg a három megye pillanatképéből áll össze')
  } else {
    fail(`C2: bevétel=${o.szamadas.osszBevetel} (várt 2250), kiadás=${o.szamadas.osszKiadas} (várt 900)`)
  }

  const kod101 = o.szamadas.bevetelSorok.find((s) => s.kod === '101')
  if (
    kod101 &&
    kod101.osszeg === 1500 &&
    kod101.megyeSzam === 3 &&
    kod101.nev === 'Egyházfenntartói járulék'
  ) {
    ok('C3 a kódonkénti sor mindhárom megyét számolja, a katalógus nevével')
  } else {
    fail(`C3: ${JSON.stringify(kod101)}`)
  }

  const bontasNevek = (kod101?.megyenkent || []).map((m) => m.nev)
  if (
    bontasNevek.length === 3 &&
    bontasNevek[0] === 'Alsó Egyházmegye' &&
    kod101.megyenkent.every((m) => m.osszeg === 500)
  ) {
    ok('C4 a kódsor MEGYÉNKÉNTI bontása név szerint rendezve, összegekkel megvan')
  } else {
    fail(`C4: ${JSON.stringify(kod101?.megyenkent)}`)
  }

  const sorrend = o.szamadas.bevetelSorok.map((s) => s.kod)
  if (sorrend[0] === '101' && sorrend[1] === '102') {
    ok('C5 a sorrend a hivatalos ív katalógus-sorrendje (sorszam)')
  } else {
    fail(`C5: ${JSON.stringify(sorrend)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// C/2) ⚠️ ALAKVERZIÓ 1: A KANONIKUS AZ ERŐSEBB — a legfontosabb assert
//
// TÜNET (2026-08-17, adverzáriális ellenőrzés): a mag `s.income`/`s.totalIncome`
// -mal kezdett, és a `kanonikus` csak fallback volt. Alakverzió 1-nél viszont a
// FELSŐ SZINT a NYERS szerver-összesítés (junction-FK-id kulcsokkal, a hivatalos
// ívre NEM szűrve), a HIVATALOS adat pedig a `kanonikus` alobjektumban van.
// A régi sorrend tehát épp ott vette volna a NEM hivatalos, íven kívüli pénzt is
// tartalmazó számot, ahol a v1-kezelés egyáltalán számít — egy HIVATALOS
// egyházkerületi iratra. Ez a blokk azért van, hogy egy későbbi
// „egyszerűsítés" ne fordíthassa vissza a sorrendet.
//
// A repó kanonikus szabálya ugyanez, lásd
// `apps/web/app/(dashboard)/munkanaplo/lelkeszi-jelentes-actions.ts`:
// „A sorrend SZÁNDÉKOS: a kanonikus (ív-szűrt, beküldött) érték MINDIG erősebb."
// ────────────────────────────────────────────────────────────────────────────
{
  const o = C.szamitKeruletiOsszesito(
    alap({
      felterjesztesek: [
        {
          dioceseId: 'm1',
          docType: 'megyei_szamadas',
          year: 2025,
          modificationNumber: 0,
          status: 'submitted',
          submittedAt: '2026-01-10T08:00:00Z',
          snapshot: {
            alakVerzio: 1,
            // FELSŐ SZINT = NYERS szerver-összesítés. A `999` olyan tétel, ami a
            // hivatalos íven NEM szerepel — pont ettől nyers ez a szint.
            income: { 101: 9999, 999: 1234 },
            expense: { 201: 8888 },
            totalIncome: 11233,
            totalExpense: 8888,
            // KANONIKUS = ív-szűrt, BEKÜLDÖTT hivatalos adat. Ennek kell nyernie.
            kanonikus: {
              income: { 101: 500, 102: 250 },
              expense: { 201: 300 },
              totalIncome: 750,
              totalExpense: 300,
            },
          },
        },
      ],
    }),
  )

  const megye = o.szamadas.megyenkent[0]
  if (megye?.bevetel === 750 && megye?.kiadas === 300) {
    ok('C6 alakVerzió 1-nél a KANONIKUS végösszeg jön ki (750 / 300), nem a nyers (11233 / 8888)')
  } else {
    fail(
      `C6: bevétel=${megye?.bevetel} (várt 750), kiadás=${megye?.kiadas} (várt 300) — ` +
        'a nyers, ívre nem szűrt szám került a HIVATALOS kerületi ívre',
    )
  }

  if (o.szamadas.osszBevetel === 750 && o.szamadas.osszKiadas === 300) {
    ok('C7 a kerületi VÉGÖSSZEG is a kanonikusból áll össze')
  } else {
    fail(`C7: ${o.szamadas.osszBevetel} / ${o.szamadas.osszKiadas} (várt 750 / 300)`)
  }

  const kodok = o.szamadas.bevetelSorok.map((s) => s.kod)
  const kod101 = o.szamadas.bevetelSorok.find((s) => s.kod === '101')
  if (!kodok.includes('999') && kodok.includes('102') && kod101?.osszeg === 500) {
    ok('C8 a KÓD-SOROK is a kanonikusból jönnek: nincs íven kívüli „999", a 101 = 500')
  } else {
    fail(`C8: ${JSON.stringify(o.szamadas.bevetelSorok.map((s) => [s.kod, s.osszeg]))}`)
  }

  // Hiányos kanonikus: VAN ív-szűrt sor, de NINCS hozzá rögzített végösszeg. A
  // végösszeg ilyenkor sem eshet vissza a nyers felső szintre — a „hivatalos
  // sorok + nem hivatalos végösszeg" pár mindkét oldalon hihetőnek látszik, és
  // nem egyezik.
  const felig = C.szamitKeruletiOsszesito(
    alap({
      felterjesztesek: [
        {
          dioceseId: 'm1',
          docType: 'megyei_szamadas',
          year: 2025,
          modificationNumber: 0,
          status: 'submitted',
          submittedAt: '2026-01-10T08:00:00Z',
          snapshot: {
            alakVerzio: 1,
            income: { 101: 9999, 999: 1234 },
            expense: { 201: 8888 },
            totalIncome: 11233,
            totalExpense: 8888,
            kanonikus: { income: { 101: 500, 102: 250 }, expense: { 201: 300 } },
          },
        },
      ],
    }),
  )
  if (felig.szamadas.osszBevetel === 750 && felig.szamadas.osszKiadas === 300) {
    ok('C9 végösszeg nélküli kanonikusnál a KANONIKUS SOROK összege jön (750 / 300)')
  } else {
    fail(
      `C9: ${felig.szamadas.osszBevetel} / ${felig.szamadas.osszKiadas} (várt 750 / 300) — ` +
        'a sorok a kanonikusból, a végösszeg a nyersből: elcsúszott hivatalos irat',
    )
  }

  // VÉDŐHÁLÓ visszafelé: `kanonikus` alobjektum NÉLKÜL (alakVerzió 2 és az
  // ős-alak) továbbra is a felső szint az adat — a javítás nem ronthatja el.
  const kanonNelkul = C.szamitKeruletiOsszesito(
    alap({ felterjesztesek: [szamadas('m1', { bevetel: 4242, kiadas: 42 })] }),
  )
  if (kanonNelkul.szamadas.osszBevetel === 4242 && kanonNelkul.szamadas.osszKiadas === 42) {
    ok('C10 `kanonikus` alobjektum nélkül változatlanul a felső szint az adat')
  } else {
    fail(`C10: ${kanonNelkul.szamadas.osszBevetel} / ${kanonNelkul.szamadas.osszKiadas}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// D) KÖLTSÉGVETÉS: A LEGUTOLSÓ MÓDOSÍTÁS AZ ÉRVÉNYES (két szinten)
// ────────────────────────────────────────────────────────────────────────────
{
  const o = C.szamitKeruletiOsszesito(
    alap({
      felterjesztesek: [
        {
          // Az EREDETI terv — ezt kell felülírnia a módosításoknak.
          dioceseId: 'm1',
          docType: 'megyei_koltsegvetes',
          year: 2025,
          modificationNumber: 0,
          status: 'submitted',
          submittedAt: '2025-01-20T08:00:00Z',
          snapshot: {
            budgetData: {
              a: { szamadasicelid: '101', tervezett: 1000 },
              b: { szamadasicelid: '201', tervezett: 800 },
            },
          },
        },
        {
          // 2. MÓDOSÍTÁS — szándékosan KORÁBBI dátummal, mint az 1.: a
          // sorszámnak kell dönteni, nem a felküldés idejének.
          dioceseId: 'm1',
          docType: 'megyei_koltsegvetes_modositas',
          year: 2025,
          modificationNumber: 2,
          status: 'received',
          submittedAt: '2025-06-01T08:00:00Z',
          snapshot: {
            budgetData: {
              a: { szamadasicelid: '101', tervezett: 1000, modositott: 1100, mod2: 1200 },
              b: { szamadasicelid: '201', tervezett: 800, modositott: 900, mod2: 950 },
            },
          },
        },
        {
          dioceseId: 'm1',
          docType: 'megyei_koltsegvetes_modositas',
          year: 2025,
          modificationNumber: 1,
          status: 'received',
          submittedAt: '2025-09-01T08:00:00Z',
          snapshot: {
            budgetData: {
              a: { szamadasicelid: '101', tervezett: 1000, modositott: 1100 },
              b: { szamadasicelid: '201', tervezett: 800, modositott: 900 },
            },
          },
        },
      ],
    }),
  )

  const bevetel = o.koltsegvetes.bevetelSorok.find((s) => s.kod === '101')
  const kiadas = o.koltsegvetes.kiadasSorok.find((s) => s.kod === '201')
  if (bevetel && bevetel.osszeg === 1200) {
    ok('D1 a 2. MÓDOSÍTÁS felülírja az 1.-et és az eredeti tervet (bevétel 1200)')
  } else {
    fail(`D1: ${JSON.stringify(bevetel)} — az 1000 (terv) vagy 1100 (mod1) hivatalosan téves adat lenne`)
  }
  if (kiadas && kiadas.osszeg === 950) {
    ok('D2 soron belül is a LEGUTOLSÓ kitöltött módosítás az érvényes (kiadás 950)')
  } else {
    fail(`D2: ${JSON.stringify(kiadas)}`)
  }
  if (o.koltsegvetes.osszBevetel === 1200 && o.koltsegvetes.osszKiadas === 950) {
    ok('D3 a bevétel/kiadás szétválasztás a számadási cél katalógusa szerint történik')
  } else {
    fail(`D3: bevétel=${o.koltsegvetes.osszBevetel}, kiadás=${o.koltsegvetes.osszKiadas}`)
  }
  const megye = o.koltsegvetes.megyenkent[0]
  if (megye?.modositassalSzamolt === true && megye?.modositasSzam === 2) {
    ok('D4 a felület jelezni tudja, hogy a 2. módosított tervvel számoltunk')
  } else {
    fail(`D4: ${JSON.stringify(megye)}`)
  }
  if (o.koltsegvetes.allapot.hianyzo.length === 2) {
    ok('D5 a költségvetést fel nem terjesztő két megye láthatóan hiányzik')
  } else {
    fail(`D5: ${JSON.stringify(o.koltsegvetes.allapot.hianyzo)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// E) SZÁMVEVŐI ÖSSZESÍTŐ — kulcs-mutatók + a gyülekezeti hiány felgörgetése
// ────────────────────────────────────────────────────────────────────────────
{
  const megyeiOsszesito = {
    ev: 2025,
    gyulekezetSzam: 5,
    szamadas: {
      osszBevetel: 10000,
      osszKiadas: 4000,
      egyenleg: 6000,
      allapot: {
        bekuldott: [{ id: 'g1', nev: 'Alsó gyülekezet' }, { id: 'g2', nev: 'Bodoki gyülekezet' }],
        hianyzo: [{ id: 'g3', nev: 'Csernátoni gyülekezet' }, { id: 'g4', nev: 'Dálnoki gyülekezet' }],
        visszakuldott: [{ id: 'g5', nev: 'Esztelneki gyülekezet' }],
      },
    },
    koltsegvetes: { osszBevetel: 9000, osszKiadas: 8000 },
    vagyonleltar: { tetelSzam: 12, konyvSzerintiErtek: 5000, jelenlegiErtek: 4200 },
    valasztok: { fo: 87 },
    lelkesziJelentes: {
      mezok: [{ id: 'I.10', label: 'Lélekszám december 31-én', egyseg: 'fő', osszeg: 320, adatSzam: 2 }],
    },
  }

  const o = C.szamitKeruletiOsszesito(
    alap({
      felterjesztesek: [
        {
          // BURKOLT alak: { alakVerzio, keszult, egyhazmegye, osszesito }
          dioceseId: 'm1',
          docType: 'szamvevoi_osszesito',
          year: 2025,
          modificationNumber: 0,
          status: 'submitted',
          submittedAt: '2026-02-01T08:00:00Z',
          snapshot: {
            alakVerzio: 1,
            keszult: '2026-02-01T08:00:00Z',
            egyhazmegye: 'Alsó Egyházmegye',
            osszesito: megyeiOsszesito,
          },
        },
        {
          // CSUPASZ alak: maga a megyei összesítő objektum.
          dioceseId: 'm2',
          docType: 'szamvevoi_osszesito',
          year: 2025,
          modificationNumber: 0,
          status: 'received',
          submittedAt: '2026-02-02T08:00:00Z',
          snapshot: megyeiOsszesito,
        },
      ],
    }),
  )

  const szv = o.szamvevoiOsszesito
  if (szv.bevetel === 20000 && szv.kiadas === 8000 && szv.egyenleg === 12000) {
    ok('E1 a burkolt és a csupasz összesítő-alak UGYANÚGY beleszámít a kerületi végösszegbe')
  } else {
    fail(`E1: ${JSON.stringify({ b: szv.bevetel, k: szv.kiadas })} (várt 20000 / 8000)`)
  }

  if (
    szv.koltsegvetesBevetel === 18000 &&
    szv.leltarTetelSzam === 24 &&
    szv.leltarErtek === 10000 &&
    szv.valasztoFo === 174
  ) {
    ok('E2 a kulcs-mutatók (költségvetés, vagyonleltár, választók) összegződnek')
  } else {
    fail(`E2: ${JSON.stringify(szv)}`)
  }

  const lelekszam = szv.mutatok.find((m) => m.id === 'I.10')
  if (lelekszam && lelekszam.osszeg === 640 && lelekszam.label === 'Lélekszám december 31-én') {
    ok('E3 a lelkészi jelentés mutatói a megyék összesítőiből felfelé görögnek')
  } else {
    fail(`E3: ${JSON.stringify(lelekszam)}`)
  }

  const penzMutato = szv.mutatok.find((m) => m.id === 'kerulet.bevetel')
  if (
    penzMutato &&
    penzMutato.osszeg === 20000 &&
    penzMutato.egyseg === 'RON' &&
    penzMutato.megyeSzam === 2 &&
    szv.mutatok[0]?.id === 'kerulet.gyulekezetSzam'
  ) {
    ok('E3b a mutató-lista FELIRATTAL és mértékegységgel, rögzített sorrendben áll össze')
  } else {
    fail(`E3b: ${JSON.stringify(szv.mutatok.slice(0, 3))}`)
  }

  // A HIÁNY NEM ÁLL MEG A MEGYEHATÁRON: megyénként 2 be nem küldött + 1
  // visszaküldött gyülekezet → 3, két megyére 6.
  if (szv.gyulekezetSzam === 10 && szv.hianyzoGyulekezetSzam === 6) {
    ok('E4 a megyék összesítőiből hiányzó GYÜLEKEZETEK száma is felgörög a kerülethez')
  } else {
    fail(
      `E4: gyulekezetSzam=${szv.gyulekezetSzam} (várt 10), ` +
        `hianyzoGyulekezetSzam=${szv.hianyzoGyulekezetSzam} (várt 6)`,
    )
  }

  const elsoMegye = szv.megyenkent[0]
  if (
    elsoMegye?.hianyzoGyulekezetek?.includes('Csernátoni gyülekezet') &&
    elsoMegye?.visszakuldottGyulekezetek?.includes('Esztelneki gyülekezet')
  ) {
    ok('E5 a hiányzó és a visszaküldött gyülekezetek NÉV SZERINT is megvannak megyénként')
  } else {
    fail(`E5: ${JSON.stringify(elsoMegye)}`)
  }

  const hianyzoMegyeNevek = szv.allapot.hianyzo.map((m) => m.nev)
  if (hianyzoMegyeNevek.length === 1 && hianyzoMegyeNevek[0] === 'Csernátoni Egyházmegye') {
    ok('E6 az összesítőt fel nem terjesztő egyházmegye NÉV SZERINT hiányzóként látszik')
  } else {
    fail(`E6: ${JSON.stringify(hianyzoMegyeNevek)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F) ÉV-SZŰRÉS + ISMERETLEN FELADÓ — a pénz sosem tűnhet el némán
// ────────────────────────────────────────────────────────────────────────────
{
  const o = C.szamitKeruletiOsszesito(
    alap({
      felterjesztesek: [
        szamadas('m1', { bevetel: 100, kiadas: 0 }),
        // MÁSIK ÉV: nem keveredhet bele az idei összesítőbe.
        szamadas('m2', { bevetel: 7000, kiadas: 0, ev: 2024 }),
        // Olyan megye, ami már nincs a hatókör listájában (átsorolták): az
        // összege NEM tűnhet el némán — feliratozva jelenik meg.
        szamadas('m9', { bevetel: 33, kiadas: 0 }),
      ],
    }),
  )

  if (o.szamadas.osszBevetel === 133) {
    ok('F1 a másik évi (2024) felterjesztés NEM keveredik a 2025-ös összesítőbe')
  } else {
    fail(`F1: osszBevetel=${o.szamadas.osszBevetel} (várt 133 — a 7000 másik évi adat)`)
  }

  const ismeretlen = o.szamadas.megyenkent.find((m) => m.id === 'm9')
  if (ismeretlen && ismeretlen.nev === 'Ismeretlen egyházmegye' && ismeretlen.bevetel === 33) {
    ok('F2 a hatókör-listán kívüli feladó pénze LÁTHATÓAN, feliratozva jelenik meg')
  } else {
    fail(`F2: ${JSON.stringify(ismeretlen)} — a néma elnyelés lenne a legrosszabb kimenet`)
  }

  if (o.szamadas.allapot.hianyzo.some((m) => m.id === 'm2')) {
    ok('F3 a csak MÁSIK ÉVBEN felterjesztő megye az idei évben hiányzóként látszik')
  } else {
    fail('F3: a 2024-es felterjesztés „letudta" a 2025-ös évet')
  }

  // A hívó (osszesito-actions.ts) már az adatbázisban egy évre szűr, ezért az
  // `year` mezőt nem kötelező elküldenie. Ha a mag ilyenkor kihagyná a sort, a
  // kerületi összesítő NÉMÁN üres lenne — pontosan a legdrágább hibaosztály.
  const evNelkul = C.szamitKeruletiOsszesito(
    alap({
      felterjesztesek: [
        {
          dioceseId: 'm1',
          docType: 'megyei_szamadas',
          modificationNumber: 0,
          status: 'submitted',
          submittedAt: '2026-01-10T08:00:00Z',
          snapshot: { income: { 101: 42 }, expense: {}, totalIncome: 42, totalExpense: 0 },
        },
      ],
    }),
  )
  if (evNelkul.szamadas.osszBevetel === 42) {
    ok('F4 `year` nélkül érkező sor is beleszámít (a hívó SQL-oldali év-szűrésére hagyatkozva)')
  } else {
    fail(`F4: osszBevetel=${evNelkul.szamadas.osszBevetel} (várt 42)`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// G) A BEMENET NEM MÓDOSUL, AZ EREDMÉNY DETERMINISZTIKUS
// ────────────────────────────────────────────────────────────────────────────
{
  const bemenet = alap({
    felterjesztesek: [
      szamadas('m3', { bevetel: 300, kiadas: 100 }),
      szamadas('m1', { bevetel: 100, kiadas: 50 }),
      szamadas('m2', { bevetel: 200, kiadas: 75, status: 'returned' }),
    ],
  })
  const elotte = JSON.stringify(bemenet)

  const elso = C.szamitKeruletiOsszesito(bemenet)
  const masodik = C.szamitKeruletiOsszesito(bemenet)

  if (JSON.stringify(bemenet) === elotte) {
    ok('G1 a mag NEM írja át a bemenetet (a rendezések másolaton futnak)')
  } else {
    fail('G1: a számítás megváltoztatta a bemeneti objektumot')
  }

  if (JSON.stringify(elso) === JSON.stringify(masodik)) {
    ok('G2 ugyanarra a bemenetre bitre ugyanaz a kimenet (nincs new Date/Math.random)')
  } else {
    fail('G2: két futás KÜLÖNBÖZŐ eredményt adott — a mag nem determinisztikus')
  }

  // A felterjesztések SORRENDJE nem befolyásolhatja az összesítőt: a hivatalos
  // irat nem függhet attól, milyen sorrendben adta vissza a sorokat a PostgREST.
  const kevert = { ...bemenet, felterjesztesek: [...bemenet.felterjesztesek].reverse() }
  if (JSON.stringify(C.szamitKeruletiOsszesito(kevert)) === JSON.stringify(elso)) {
    ok('G3 a bemenő sorok SORRENDJE nem változtat az eredményen')
  } else {
    fail('G3: a felterjesztések sorrendje megváltoztatta az összesítőt')
  }

  const nevek = elso.szamadas.megyenkent.map((m) => m.nev)
  if (nevek[0] === 'Alsó Egyházmegye' && nevek[1] === 'Csernátoni Egyházmegye') {
    ok('G4 a megyénkénti bontás NÉV szerint, magyar ábécével rendezett')
  } else {
    fail(`G4: ${JSON.stringify(nevek)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// H) ÉRVÉNYES **ÉS** VISSZAKÜLDÖTT IRAT UGYANATTÓL A MEGYÉTŐL
//
// TÜNET (2026-08-17): ha az alap költségvetés 'received', az 1. módosítás pedig
// 'returned', a megye a `bekuldott` ágra került, és a `visszakuldott` névsorban
// SEHOL nem jelent meg. A kerület azt látta, ott minden rendben — pedig javítás
// alatt van egy irat, és az összegben az ALAP terv áll, nem a legutolsó.
// ────────────────────────────────────────────────────────────────────────────
{
  const o = C.szamitKeruletiOsszesito(
    alap({
      felterjesztesek: [
        {
          // Az alap költségvetés ÁTVÉVE — ez az érvényes, ez számít bele.
          dioceseId: 'm1',
          docType: 'megyei_koltsegvetes',
          year: 2025,
          modificationNumber: 0,
          status: 'received',
          submittedAt: '2025-01-20T08:00:00Z',
          snapshot: { budgetData: { a: { szamadasicelid: '101', tervezett: 1000 } } },
        },
        {
          // Az 1. MÓDOSÍTÁS javításra visszaküldve — nem számít bele, DE látszania kell.
          dioceseId: 'm1',
          docType: 'megyei_koltsegvetes_modositas',
          year: 2025,
          modificationNumber: 1,
          status: 'returned',
          submittedAt: '2025-06-01T08:00:00Z',
          snapshot: {
            budgetData: { a: { szamadasicelid: '101', tervezett: 1000, modositott: 7777 } },
          },
        },
        // Egy MÁSIK megye, ahol semmi sincs javítás alatt — a jelző nem lehet
        // globálisan igaz.
        {
          dioceseId: 'm2',
          docType: 'megyei_koltsegvetes',
          year: 2025,
          modificationNumber: 0,
          status: 'submitted',
          submittedAt: '2025-01-21T08:00:00Z',
          snapshot: { budgetData: { a: { szamadasicelid: '101', tervezett: 200 } } },
        },
      ],
    }),
  )

  const all = o.koltsegvetes.allapot
  if (all.bekuldott.some((m) => m.id === 'm1') && o.koltsegvetes.osszBevetel === 1200) {
    ok('H1 az érvényes ALAP terv (1000) benne marad, a visszaküldött 7777 nem')
  } else {
    fail(`H1: osszBevetel=${o.koltsegvetes.osszBevetel} (várt 1200)`)
  }

  const javitasAlatt = (all.bekuldottDeVanVisszakuldott || []).map((m) => m.nev)
  if (javitasAlatt.length === 1 && javitasAlatt[0] === 'Alsó Egyházmegye') {
    ok('H2 a megye a `bekuldottDeVanVisszakuldott` listán NEVESÍTVE megjelenik')
  } else {
    fail(
      `H2: ${JSON.stringify(javitasAlatt)} — a 2. szabály nevesítése elmaradt: ` +
        'a kerület azt hinné, ennél a megyénél minden rendben',
    )
  }

  const m1sor = o.koltsegvetes.megyenkent.find((m) => m.id === 'm1')
  const m2sor = o.koltsegvetes.megyenkent.find((m) => m.id === 'm2')
  if (m1sor?.vanVisszakuldottIrat === true && m2sor?.vanVisszakuldottIrat === false) {
    ok('H3 a megyénkénti sor jelzi, kinél van javítás alatt irat (és kinél nincs)')
  } else {
    fail(`H3: m1=${m1sor?.vanVisszakuldottIrat}, m2=${m2sor?.vanVisszakuldottIrat}`)
  }

  const szoveg = C.hianyOsszefoglalo(all)
  if (typeof szoveg === 'string' && szoveg.includes('Alsó Egyházmegye')) {
    ok('H4 a hiány-összefoglaló is kimondja a javítás alatt lévő iratot')
  } else {
    fail(`H4: ${JSON.stringify(szoveg)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// I) A FELIRAT ÉS A SZÁM UGYANAZT MONDJA + a lap-barát (nevek nélküli) mondat
// ────────────────────────────────────────────────────────────────────────────
{
  const o = C.szamitKeruletiOsszesito(
    alap({
      felterjesztesek: [
        {
          dioceseId: 'm1',
          docType: 'szamvevoi_osszesito',
          year: 2025,
          modificationNumber: 0,
          status: 'submitted',
          submittedAt: '2026-02-01T08:00:00Z',
          snapshot: {
            gyulekezetSzam: 3,
            szamadas: {
              osszBevetel: 100,
              osszKiadas: 50,
              allapot: {
                bekuldott: [{ id: 'g1', nev: 'Alsó gyülekezet' }],
                hianyzo: [{ id: 'g2', nev: 'Bodoki gyülekezet' }],
                visszakuldott: [{ id: 'g3', nev: 'Csernátoni gyülekezet' }],
              },
            },
          },
        },
      ],
    }),
  )

  // A mutató KIZÁRÓLAG a `szamadas.allapot`-ból számol — a felirata ezért nem
  // ígérhet „gyülekezeti IRAT"-ot (költségvetés/leltár/választók nélkül).
  const mutato = o.szamvevoiOsszesito.mutatok.find((m) => m.id === 'kerulet.hianyzoGyulekezetSzam')
  if (mutato && mutato.osszeg === 2 && /számadás/.test(mutato.label)) {
    ok('I1 a hiányzó-gyülekezet mutató felirata SZÁMADÁS-ra szűkít — annyit ígér, amennyit a szám takar')
  } else {
    fail(`I1: ${JSON.stringify(mutato)} — a felirat és a szám nem ugyanazt mondja`)
  }

  // A lap a mondatot egy színes doboz TETEJÉN írja ki, alatta a két külön
  // felsorolással. Nevek nélküli alak nélkül ugyanaz a névsor kétszer állna ott.
  const allapot = o.szamvevoiOsszesito.allapot
  const rovid = C.hianyOsszefoglalo(allapot, { nevekkel: false })
  const teljes = C.hianyOsszefoglalo(allapot)
  if (
    typeof rovid === 'string' &&
    !rovid.includes('Bodoki Egyházmegye') &&
    rovid.includes('2') &&
    typeof teljes === 'string' &&
    teljes.includes('Bodoki Egyházmegye')
  ) {
    ok('I2 a hiány-összefoglaló nevek NÉLKÜL is kérhető; alapértelmezésben (visszafelé kompatibilisen) neveket ad')
  } else {
    fail(`I2: rövid=${JSON.stringify(rovid)}, teljes=${JSON.stringify(teljes)}`)
  }
}

fs.rmSync(tmp, { recursive: true, force: true })
if (failed) {
  console.error('\nA kerületi összesítő önellenőrzés ELBUKOTT.')
  process.exit(1)
}
console.log('\nMinden kerületi összesítő-önellenőrzés rendben.')
