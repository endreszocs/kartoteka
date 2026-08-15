#!/usr/bin/env node
/**
 * EGYHÁZMEGYEI ÖSSZESÍTŐ önellenőrzés (2026-08-15).
 *
 * Mit véd: `apps/web/lib/diocese/osszesito-core.ts` — a megyei összesítés
 * TISZTA számoló magja, amit KÉT hívó használ: a képernyő
 * (`getMegyeiOsszesito`) és a felküldött, FAGYASZTOTT hivatalos pillanatkép
 * (`veglegesitEsFelkuldOsszesito`).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A TESZT
 * ════════════════════════════════════════════════════════════════════════════
 * Négy olyan szabályon áll az összesítő hitele, amit egy későbbi „egyszerűsítés"
 * könnyen visszaír — és mindegyik NÉMÁN hazudna:
 *
 *  (1) AMI NINCS BEKÜLDVE, AZ LÁTHATÓAN HIÁNYZIK. A hatókör TELJES gyülekezet-
 *      listájából dolgozunk, nem a beküldésekből — különben egy „kerek"
 *      végösszeg mögött fél megye hiánya rejtőzne, és az esperes ezt terjesztené
 *      fel az egyházkerületnek.
 *
 *  (2) A VISSZAKÜLDÖTT ('returned') IRAT NEM SZÁMÍT BELE. Azt épp az egyházmegye
 *      küldte vissza javításra: ha beleszámolnánk, a megye a saját maga által
 *      megkifogásolt számot összesítené.
 *
 *  (3) A SZÁMADÁS PILLANATKÉPÉNEK KÉT ALAKJA VAN (2026-08-11, 6. kör P0): a
 *      régi beküldések `actualIncome/totalActualIncome`, az újak
 *      `income/totalIncome` kulcsokkal. Ha a mag csak az egyiket olvasná, a
 *      korábbi évek megyei összesítője 0 lejt mutatna — pontosan az a hiba,
 *      ami a dokumentumközpontban egyszer már megtörtént.
 *
 *  (4) A KÖLTSÉGVETÉSNÉL A LEGUTOLSÓ MÓDOSÍTÁS AZ ÉRVÉNYES. Az év eleji terv
 *      összesítése hivatalosan téves adat, ha közben módosítás született.
 *
 * Futtatás:  node scripts/selftest-osszesito.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const FORRAS = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'diocese', 'osszesito-core.ts')

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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-osszesito-selftest-'))

/**
 * TS → CJS, majd betöltés.
 *
 * FAIL-CLOSED: ha valaha PROJEKT-import kerülne a magba (pl. `server-only`
 * vagy egy `@/lib/...` érték-import), a `require()` ismeretlen modulra futna.
 * Inkább ITT bukjon el, érthető üzenettel — a számoló magnak import-mentesnek
 * KELL maradnia, különben sem ez a teszt, sem a jövőbeli desktop-újrafelhasználás
 * nem tudja betölteni.
 */
function loadTs(srcFile, outName) {
  const code = fs.readFileSync(srcFile, 'utf8')
  const out = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  })
  const file = path.join(tmp, outName)
  fs.writeFileSync(file, out.outputText)
  try {
    return require_(file)
  } catch (e) {
    fail(`${path.basename(srcFile)} betöltése elhasalt (projekt-import került bele?): ${e.message}`)
    return null
  }
}

const C = loadTs(FORRAS, 'osszesito-core.cjs')
if (!C) {
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(1)
}

const GYULEKEZETEK = [
  { id: 'g1', nev: 'Alsó gyülekezet' },
  { id: 'g2', nev: 'Bodoki gyülekezet' },
  { id: 'g3', nev: 'Csernátoni gyülekezet' },
]

const KOD_KATALOGUS = [
  { kod: '101', nev: 'Egyházfenntartói járulék', tipus: 'B', sorszam: 1 },
  { kod: '102', nev: 'Perselypénz', tipus: 'B', sorszam: 2 },
  { kod: '201', nev: 'Lelkészi javadalom', tipus: 'K', sorszam: 10 },
]

const MEZO_KATALOGUS = [
  { id: 'I.10', label: 'Lélekszám december 31-én', egyseg: 'fő' },
  { id: 'I.2c', label: 'Keresztelt — együtt', egyseg: 'fő' },
]

const alap = (extra = {}) => ({
  ev: 2025,
  gyulekezetek: GYULEKEZETEK,
  bekuldesek: [],
  kodKatalogus: KOD_KATALOGUS,
  mezoKatalogus: MEZO_KATALOGUS,
  ...extra,
})

// ────────────────────────────────────────────────────────────────────────────
// A) AMI NINCS BEKÜLDVE, AZ LÁTHATÓAN HIÁNYZIK
// ────────────────────────────────────────────────────────────────────────────
{
  const o = C.szamitMegyeiOsszesito(
    alap({
      bekuldesek: [
        {
          congregationId: 'g1',
          documentType: 'szamadas',
          modificationNumber: null,
          status: 'submitted',
          submittedAt: '2026-01-10T08:00:00Z',
          snapshot: { income: { 101: 1000 }, expense: { 201: 400 }, totalIncome: 1000, totalExpense: 400 },
        },
      ],
    }),
  )

  if (o.szamadas.allapot.bekuldott.length === 1 && o.szamadas.allapot.hianyzo.length === 2) {
    ok('A1 a beküldő 1, a hiányzó 2 — a hatókör TELJES gyülekezet-listájából')
  } else {
    fail(
      `A1: bekuldott=${o.szamadas.allapot.bekuldott.length}, hianyzo=${o.szamadas.allapot.hianyzo.length}. ` +
        'A hiányzókat a beküldésekből származtatott lista NEM tudná megmondani.',
    )
  }

  const hianyzoNevek = o.szamadas.allapot.hianyzo.map((gy) => gy.nev)
  if (hianyzoNevek.includes('Bodoki gyülekezet') && hianyzoNevek.includes('Csernátoni gyülekezet')) {
    ok('A2 a hiányzók NÉVVEL szerepelnek (megsürgethetők)')
  } else {
    fail(`A2: ${JSON.stringify(hianyzoNevek)}`)
  }

  if (o.szamadas.osszBevetel === 1000 && o.szamadas.osszKiadas === 400 && o.szamadas.egyenleg === 600) {
    ok('A3 a végösszegek a beküldött pillanatképből jönnek')
  } else {
    fail(`A3: bevétel=${o.szamadas.osszBevetel}, kiadás=${o.szamadas.osszKiadas}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// B) A VISSZAKÜLDÖTT IRAT NEM SZÁMÍT BELE
// ────────────────────────────────────────────────────────────────────────────
{
  const o = C.szamitMegyeiOsszesito(
    alap({
      bekuldesek: [
        {
          congregationId: 'g1',
          documentType: 'szamadas',
          modificationNumber: null,
          status: 'returned',
          submittedAt: '2026-01-10T08:00:00Z',
          snapshot: { income: { 101: 9999 }, totalIncome: 9999, expense: {}, totalExpense: 0 },
        },
        {
          congregationId: 'g2',
          documentType: 'szamadas',
          modificationNumber: null,
          status: 'finalized',
          submittedAt: '2026-01-11T08:00:00Z',
          snapshot: { income: { 101: 100 }, totalIncome: 100, expense: {}, totalExpense: 0 },
        },
      ],
    }),
  )

  if (o.szamadas.osszBevetel === 100) {
    ok('B1 a visszaküldött irat összege NEM került az összesítőbe')
  } else {
    fail(`B1: osszBevetel=${o.szamadas.osszBevetel} (a 9999 visszaküldött adatnak nem szabad beleszámolnia)`)
  }

  const visszakuldottNevek = o.szamadas.allapot.visszakuldott.map((gy) => gy.nev)
  if (visszakuldottNevek.length === 1 && visszakuldottNevek[0] === 'Alsó gyülekezet') {
    ok('B2 a visszaküldött irat gyülekezete KÜLÖN, nevesítve látszik')
  } else {
    fail(`B2: ${JSON.stringify(visszakuldottNevek)}`)
  }

  if (!o.szamadas.allapot.hianyzo.some((gy) => gy.id === 'g1')) {
    ok('B3 a visszaküldött gyülekezet nem duplázódik a „nem küldte be" listába')
  } else {
    fail('B3: a visszaküldött gyülekezet a hiányzók közt IS megjelent')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// C) A SZÁMADÁS PILLANATKÉPÉNEK MINDKÉT ALAKJA — a 0 lejes hiba ellen
// ────────────────────────────────────────────────────────────────────────────
{
  const o = C.szamitMegyeiOsszesito(
    alap({
      bekuldesek: [
        {
          // RÉGI (wizard-)alak: actualIncome / totalActualIncome
          congregationId: 'g1',
          documentType: 'szamadas',
          modificationNumber: null,
          status: 'finalized',
          submittedAt: '2026-01-10T08:00:00Z',
          snapshot: {
            actualIncome: { 101: 500, 102: 250 },
            actualExpense: { 201: 300 },
            totalActualIncome: 750,
            totalActualExpense: 300,
          },
        },
        {
          // ÚJ (kanonikus) alak
          congregationId: 'g2',
          documentType: 'szamadas',
          modificationNumber: null,
          status: 'finalized',
          submittedAt: '2026-01-11T08:00:00Z',
          snapshot: {
            income: { 101: 500 },
            expense: { 201: 200 },
            totalIncome: 500,
            totalExpense: 200,
          },
        },
      ],
    }),
  )

  if (o.szamadas.osszBevetel === 1250 && o.szamadas.osszKiadas === 500) {
    ok('C1 a régi és az új pillanatkép-alak EGYÜTT, helyesen összegződik')
  } else {
    fail(
      `C1: bevétel=${o.szamadas.osszBevetel} (várt 1250), kiadás=${o.szamadas.osszKiadas} (várt 500). ` +
        'Ha csak az egyik kulcs-alakot olvassuk, a korábbi évek 0 lejt mutatnának.',
    )
  }

  const kod101 = o.szamadas.bevetelSorok.find((s) => s.kod === '101')
  if (kod101 && kod101.osszeg === 1000 && kod101.gyulekezetSzam === 2 && kod101.nev === 'Egyházfenntartói járulék') {
    ok('C2 a kódonkénti sor mindkét gyülekezetet számolja, a katalógus nevével')
  } else {
    fail(`C2: ${JSON.stringify(kod101)}`)
  }

  const sorrend = o.szamadas.bevetelSorok.map((s) => s.kod)
  if (sorrend[0] === '101' && sorrend[1] === '102') {
    ok('C3 a sorrend a hivatalos ív katalógus-sorrendje (sorszam)')
  } else {
    fail(`C3: ${JSON.stringify(sorrend)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// D) KÖLTSÉGVETÉS: A LEGUTOLSÓ MÓDOSÍTÁS AZ ÉRVÉNYES
// ────────────────────────────────────────────────────────────────────────────
{
  const o = C.szamitMegyeiOsszesito(
    alap({
      bekuldesek: [
        {
          congregationId: 'g1',
          documentType: 'koltsegvetes',
          modificationNumber: null,
          status: 'finalized',
          submittedAt: '2025-01-20T08:00:00Z',
          snapshot: {
            budgetData: {
              a: { szamadasicelid: '101', tervezett: 1000 },
              b: { szamadasicelid: '201', tervezett: 800, modositott: 900, mod2: 950 },
            },
          },
        },
      ],
    }),
  )

  const bevetel = o.koltsegvetes.bevetelSorok.find((s) => s.kod === '101')
  const kiadas = o.koltsegvetes.kiadasSorok.find((s) => s.kod === '201')
  if (bevetel && bevetel.osszeg === 1000) {
    ok('D1 módosítás nélküli sor: a tervezett összeg számít')
  } else {
    fail(`D1: ${JSON.stringify(bevetel)}`)
  }
  if (kiadas && kiadas.osszeg === 950) {
    ok('D2 módosított sor: a LEGUTOLSÓ módosítás (mod2) az érvényes')
  } else {
    fail(`D2: ${JSON.stringify(kiadas)} — a 800 (terv) vagy 900 (mod1) hivatalosan téves adat lenne`)
  }
  if (o.koltsegvetes.gyulekezetenkent[0]?.modositassalSzamolt === true) {
    ok('D3 a felület jelezni tudja, hogy módosított tervvel számoltunk')
  } else {
    fail('D3: a modositassalSzamolt zászló nem került be')
  }

  // A bevétel/kiadás besorolás a KATALÓGUSBÓL jön (a snapshot nem tárolja).
  if (o.koltsegvetes.osszBevetel === 1000 && o.koltsegvetes.osszKiadas === 950) {
    ok('D4 a bevétel/kiadás szétválasztás a számadási cél katalógusa szerint történik')
  } else {
    fail(`D4: bevétel=${o.koltsegvetes.osszBevetel}, kiadás=${o.koltsegvetes.osszKiadas}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// E) A TÖBBI IRAT-TÍPUS + A FELKÜLDÉS UTÁNI BEKÜLDÉSEK ŐRE
// ────────────────────────────────────────────────────────────────────────────
{
  const o = C.szamitMegyeiOsszesito(
    alap({
      felkuldveEkkor: '2026-02-01T00:00:00Z',
      bekuldesek: [
        {
          congregationId: 'g1',
          documentType: 'vagyonleltar',
          modificationNumber: null,
          status: 'finalized',
          submittedAt: '2026-01-15T08:00:00Z',
          snapshot: { itemCount: 12, totalBookValue: 5000, totalCurrentValue: 4200 },
        },
        {
          congregationId: 'g2',
          documentType: 'valasztok_nevjegyzeke',
          modificationNumber: null,
          status: 'submitted',
          submittedAt: '2026-01-16T08:00:00Z',
          snapshot: { voterCount: 87 },
        },
        {
          congregationId: 'g3',
          documentType: 'lelkeszi_jelentes',
          modificationNumber: null,
          status: 'reviewed',
          submittedAt: '2026-03-01T08:00:00Z', // a FELKÜLDÉS UTÁN érkezett
          snapshot: {},
          lelkesziMezok: { 'I.10': 320, 'I.2c': 4 },
        },
      ],
    }),
  )

  if (o.vagyonleltar.tetelSzam === 12 && o.vagyonleltar.konyvSzerintiErtek === 5000) {
    ok('E1 a vagyonleltári jelentés tételszáma és értéke összegződik')
  } else {
    fail(`E1: ${JSON.stringify(o.vagyonleltar)}`)
  }
  if (o.valasztok.fo === 87) {
    ok('E2 a választói névjegyzék létszáma összegződik')
  } else {
    fail(`E2: ${o.valasztok.fo}`)
  }
  const lelekszam = o.lelkesziJelentes.mezok.find((m) => m.id === 'I.10')
  if (lelekszam && lelekszam.osszeg === 320 && lelekszam.label === 'Lélekszám december 31-én') {
    ok('E3 a lelkészi jelentés mutatói a katalógus feliratával összegződnek')
  } else {
    fail(`E3: ${JSON.stringify(lelekszam)}`)
  }
  if (o.felkuldesUtaniBekuldesek === 1) {
    ok('E4 a felküldés UTÁN érkezett irat számolva van (a felküldött csomag már nem teljes)')
  } else {
    fail(
      `E4: felkuldesUtaniBekuldesek=${o.felkuldesUtaniBekuldesek} (várt 1). ` +
        'Enélkül az esperes azt hinné, hogy a felterjesztett összesítő naprakész.',
    )
  }
}

// ────────────────────────────────────────────────────────────────────────────
// F) ÜRES BEMENET — a fail-closed alapállapot
// ────────────────────────────────────────────────────────────────────────────
{
  const o = C.szamitMegyeiOsszesito(alap())
  if (
    o.szamadas.osszBevetel === 0 &&
    o.szamadas.allapot.bekuldott.length === 0 &&
    o.szamadas.allapot.hianyzo.length === 3
  ) {
    ok('F1 beküldés nélkül MINDEN gyülekezet hiányzóként látszik (nem „kerek nulla")')
  } else {
    fail(`F1: ${JSON.stringify(o.szamadas.allapot)}`)
  }
  if (o.felkuldesUtaniBekuldesek === 0) {
    ok('F2 felküldés nélkül nincs „felküldés utáni beküldés" riasztás')
  } else {
    fail(`F2: ${o.felkuldesUtaniBekuldesek}`)
  }
}

fs.rmSync(tmp, { recursive: true, force: true })
if (failed) {
  console.error('\nAz összesítő önellenőrzés ELBUKOTT.')
  process.exit(1)
}
console.log('\nMinden összesítő-önellenőrzés rendben.')
