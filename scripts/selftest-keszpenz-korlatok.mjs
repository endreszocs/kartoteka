#!/usr/bin/env node
/**
 * KÉSZPÉNZ-KORLÁTOK önellenőrzés — build/tesztkeret nélkül futtatható
 * (a selftest-csoportnaplo.mjs mintájára).
 *
 * MIT ŐRIZ (2026-08-14, Endre kérése — „Változások 2026" készpénz-szabályok):
 *   50 000 lej kassza-plafon · 1 000 lej decont-előleg/nap/személy ·
 *   5 000 lej partnerenként/nap · 10 000 lej/nap összes kifizetés ·
 *   a kifizetés feldarabolásának tilalma · bevételi határok.
 *
 * A packages/core/src/finance/keszpenz-korlatok.ts NULLA importtal készül,
 * ezért önállóan fordítható.
 *
 * Futtatás:  node scripts/selftest-keszpenz-korlatok.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const SRC = path.join(REPO_ROOT, 'packages', 'core', 'src', 'finance', 'keszpenz-korlatok.ts')

let failed = false
const fail = (msg) => { console.error(`FAIL: ${msg}`); failed = true }
const ok = (msg) => console.log(`OK:   ${msg}`)

if (!fs.existsSync(SRC)) { fail(`hiányzik a forrás: ${SRC}`); process.exit(1) }

const require_ = createRequire(path.join(REPO_ROOT, 'package.json'))
let ts = null
try { ts = require_('typescript') } catch {
  console.log('INFO: a typescript csomag nem elérhető — az önellenőrzés kihagyva')
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-keszpenz-selftest-'))
const out = ts.transpileModule(fs.readFileSync(SRC, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: 'keszpenz-korlatok.ts',
})
if (/require\(["'][^."']/.test(out.outputText)) {
  fail('FUTÁSIDEJŰ IMPORT került a fájlba — a modulnak önállónak kell maradnia.')
  process.exit(1)
}
const dest = path.join(tmp, 'keszpenz-korlatok.js')
fs.writeFileSync(dest, out.outputText, 'utf8')
const M = require_(dest)

const {
  KASSZAPLAFON_LEJ,
  DECONT_ELOLEG_NAPI_SZEMELYENKENT_LEJ,
  kasszaplafonUzenet,
  decontElolegUzenet,
  keszpenzKorlatFigyelmeztetesek,
} = M

const kp = (r) => ({ keszpenz: true, ...r })

// ── K1: kassza-plafon ─────────────────────────────────────────────────────
{
  if (kasszaplafonUzenet(50_000) !== null && kasszaplafonUzenet(49_999.99) !== null) {
    fail('K1  a plafonon BELÜLI egyenlegre is figyelmeztet')
  } else if (kasszaplafonUzenet(50_000.01)?.kod !== 'kasszaplafon') {
    fail('K1  a plafon FELETTI egyenlegre nem figyelmeztet')
    // Az Intl 'hu-HU' NEM TÖRŐ szóközzel tagol (U+00A0/U+202F) — normalizálva vetjük össze.
  } else if (!kasszaplafonUzenet(63_500).uzenet.replace(/[  ]/g, ' ').includes('13 500')) {
    fail('K1  a többlet összege (63 500 − 50 000 = 13 500) nincs a szövegben')
  } else {
    ok(`K1  kassza-plafon: ${KASSZAPLAFON_LEJ} lejig csend, felette figyelmeztetés a többlettel`)
  }
}

// ── K2: decont-előleg 1 000 lej ───────────────────────────────────────────
{
  if (decontElolegUzenet(1_000) !== null) fail('K2  pontosan 1 000 lejre is figyelmeztet (határ = megengedett)')
  else if (decontElolegUzenet(1_000.01)?.kod !== 'decont_eloleg_1000') fail('K2  1 000 lej felett nem figyelmeztet')
  else ok(`K2  decont-előleg: ${DECONT_ELOLEG_NAPI_SZEMELYENKENT_LEJ} lejig csend, felette figyelmeztetés`)
}

// ── K3: egyetlen készpénzes kifizetés 5 000 felett ────────────────────────
{
  const w = keszpenzKorlatFigyelmeztetesek([
    kp({ datum: '2026-08-14', osszeg: 7_200, irany: 'kiadas', partner: 'Építő Kft.' }),
  ])
  const hit = w.filter((x) => x.kod === 'tetel_5000_felett')
  if (hit.length === 1 && hit[0].osszeg === 7_200) ok('K3  7 200 lejes készpénzes tétel → tetel_5000_felett')
  else fail(`K3  várt 1 tetel_5000_felett, kaptunk: ${JSON.stringify(w.map((x) => x.kod))}`)
}

// ── K4: BANKI tételre a korlátok NEM szólnak ──────────────────────────────
{
  const w = keszpenzKorlatFigyelmeztetesek([
    { datum: '2026-08-14', osszeg: 250_000, irany: 'kiadas', partner: 'Építő Kft.', keszpenz: false },
  ])
  if (w.length === 0) ok('K4  banki (nem készpénzes) tételre nincs figyelmeztetés')
  else fail(`K4  banki tételre is szólt: ${JSON.stringify(w.map((x) => x.kod))}`)
}

// ── K5: feldarabolás-gyanú — több tétel, ugyanaz a partner, ugyanaz a nap ─
{
  const w = keszpenzKorlatFigyelmeztetesek([
    kp({ datum: '2026-08-14', osszeg: 3_000, irany: 'kiadas', partner: 'Építő Kft.' }),
    kp({ datum: '2026-08-14', osszeg: 2_800, irany: 'kiadas', partner: 'építő  kft.' }), // más írásmód!
  ])
  const hit = w.filter((x) => x.kod === 'feldarabolas_gyanu')
  if (hit.length === 1 && Math.round(hit[0].osszeg) === 5_800) {
    ok('K5  3 000 + 2 800 ugyanannak (eltérő írásmóddal is) → feldarabolás-gyanú, 5 800 lej')
  } else {
    fail(`K5  várt 1 feldarabolas_gyanu 5 800-zal, kaptunk: ${JSON.stringify(w)}`)
  }
}

// ── K6: feldarabolás-gyanú NEM szól, ha a napi összeg 5 000 alatt marad ───
{
  const w = keszpenzKorlatFigyelmeztetesek([
    kp({ datum: '2026-08-14', osszeg: 2_000, irany: 'kiadas', partner: 'Építő Kft.' }),
    kp({ datum: '2026-08-14', osszeg: 2_500, irany: 'kiadas', partner: 'Építő Kft.' }),
  ])
  if (w.length === 0) ok('K6  2 000 + 2 500 (= 4 500) ugyanannak → nincs figyelmeztetés')
  else fail(`K6  4 500 lejnél is szólt: ${JSON.stringify(w.map((x) => x.kod))}`)
}

// ── K7: MÁS napon vagy MÁS partnernek nem vonódik össze ───────────────────
{
  const w = keszpenzKorlatFigyelmeztetesek([
    kp({ datum: '2026-08-14', osszeg: 4_000, irany: 'kiadas', partner: 'Építő Kft.' }),
    kp({ datum: '2026-08-15', osszeg: 4_000, irany: 'kiadas', partner: 'Építő Kft.' }),
    kp({ datum: '2026-08-14', osszeg: 4_000, irany: 'kiadas', partner: 'Másik Bt.' }),
  ])
  if (w.length === 0) ok('K7  más nap / más partner nem vonódik össze')
  else fail(`K7  tévesen összevont: ${JSON.stringify(w.map((x) => x.kod))}`)
}

// ── K8: napi összes kifizetés 10 000 felett ───────────────────────────────
{
  const w = keszpenzKorlatFigyelmeztetesek([
    kp({ datum: '2026-08-14', osszeg: 4_000, irany: 'kiadas', partner: 'A Kft.' }),
    kp({ datum: '2026-08-14', osszeg: 4_000, irany: 'kiadas', partner: 'B Kft.' }),
    kp({ datum: '2026-08-14', osszeg: 4_000, irany: 'kiadas', partner: 'C Kft.' }),
  ])
  const hit = w.filter((x) => x.kod === 'napi_osszes_kifizetes_10000')
  if (hit.length === 1 && hit[0].osszeg === 12_000) ok('K8  3 × 4 000 egy napon → napi 10 000 átlépve (12 000)')
  else fail(`K8  várt napi_osszes 12 000-rel, kaptunk: ${JSON.stringify(w.map((x) => x.kod))}`)
}

// ── K9: bevételi határok — 5 000 (jogi személy) és 10 000 (magánszemély) ──
{
  const w1 = keszpenzKorlatFigyelmeztetesek([
    kp({ datum: '2026-08-14', osszeg: 6_000, irany: 'bevetel', partner: 'Testvér Egyházközség' }),
  ])
  const w2 = keszpenzKorlatFigyelmeztetesek([
    kp({ datum: '2026-08-14', osszeg: 11_000, irany: 'bevetel', partner: 'Nagy Adakozó' }),
  ])
  const jo1 = w1.length === 1 && w1[0].kod === 'partner_napi_bevetel_5000'
  const jo2 = w2.length === 1 && w2[0].kod === 'partner_napi_bevetel_10000'
  if (jo1 && jo2) ok('K9  bevétel: 6 000 → 5000-es jelzés; 11 000 → 10000-es jelzés (nem mindkettő)')
  else fail(`K9  bevételi határok hibásak: 6000→${JSON.stringify(w1.map((x) => x.kod))}, 11000→${JSON.stringify(w2.map((x) => x.kod))}`)
}

// ── K10: hibás bemenet némán kimarad (nem dob, nem riaszt tévesen) ────────
{
  const w = keszpenzKorlatFigyelmeztetesek([
    kp({ datum: 'nem-datum', osszeg: 99_999, irany: 'kiadas', partner: 'X' }),
    kp({ datum: '2026-08-14', osszeg: NaN, irany: 'kiadas', partner: 'X' }),
    kp({ datum: '2026-08-14', osszeg: -5, irany: 'kiadas', partner: 'X' }),
  ])
  if (w.length === 0) ok('K10 hibás dátum / NaN / negatív összeg kimarad az értékelésből')
  else fail(`K10 hibás bemenetre riasztott: ${JSON.stringify(w.map((x) => x.kod))}`)
}

// ── K11: egy nagy tétel NEM kap feldarabolás-gyanút is (nincs dupla) ──────
{
  const w = keszpenzKorlatFigyelmeztetesek([
    kp({ datum: '2026-08-14', osszeg: 8_000, irany: 'kiadas', partner: 'Építő Kft.' }),
  ])
  const kodok = w.map((x) => x.kod).sort()
  if (kodok.length === 1 && kodok[0] === 'tetel_5000_felett') {
    ok('K11 egyetlen 8 000-es tétel → csak tetel_5000_felett (nincs dupla jelzés)')
  } else {
    fail(`K11 dupla/hiányzó jelzés: ${JSON.stringify(kodok)}`)
  }
}

fs.rmSync(tmp, { recursive: true, force: true })
if (failed) { console.error('\nKészpénz-korlátok önellenőrzés: BUKOTT'); process.exit(1) }
console.log('\nKészpénz-korlátok önellenőrzés: minden zöld')
