#!/usr/bin/env node
/**
 * SPLASH-ELRENDEZÉS önellenőrzés (2026-08-22 · bővítve 2026-08-23).
 *
 * Mit véd:
 *   - `apps/web/lib/ui/splash-stage-core.ts`            — az elrendezés magja,
 *   - `apps/web/components/ui/splash-screen.tsx`        — a WEB rétegrendje,
 *   - `apps/desktop/src/components/splash-screen.tsx`   — a DESKTOP párja.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ MIÉRT VAN EZ A TESZT — MIND A NÉGY HIBA ÉLESBEN JELENT MEG
 * ════════════════════════════════════════════════════════════════════════════
 *
 * (1) IGAZÍTÁS. A réteg `display: grid` + `place-items: center` volt, a színpad
 *     LAYOUT-doboza viszont 1920×1080 maradt, mert a kicsinyítést a `transform:
 *     scale()` végezte, ami a layout-méretet NEM változtatja meg. Laptopon ez a
 *     doboz nagyobb a rétegnél → a középre igazítás negatív pozíciót adna →
 *     a böngésző a túllógó rács-elemet a KEZDŐÉLRE kapcsolja → a látvány
 *     jobbra-lefelé csúszik. Kimérve 1536×730-on: +192 px, +108 px.
 *
 * (2) VÁGÁS. A „kitölt és vág" (`Math.max`) mód laptopon gyakorlatilag mindig
 *     FÜGGŐLEGESEN vágott, pont ott, ahol a főcím van.
 *
 * (3) FEKETE SÁV (Endre: „bejelentkezés előtt a splash két oldalán fekete sáv
 *     marad"). A háttérkép a színpadon BELÜL élt, ezért a `scale()` vele együtt
 *     zsugorította. Kimért sávok: 2000×950 → 156 px, 1536×730 → 119 px,
 *     3440×1350 → 520 px, 820×1180 → 359 px. A javítás a RÉTEGREND: a háttér
 *     fölkerült a külső, `fixed inset-0` rétegre.                → G6/G6b/G7/G8
 *
 * (4) A TARTALOM FELESLEGESEN KICSI (2026-08-23). A (3) után a sáv eltűnt, de a
 *     színpad MARADT egy fix 1920×1080-as, `scale()`-elt doboz, ami a LEGSZŰKEBB
 *     tengelyhez igazodott — ezért a szélesebb tengely kihasználatlan maradt:
 *     1366×625-ön 55,6 px-es főcím és 255 px üresen álló szélesség; 1024×1366-on
 *     a látvány a magasság 42%-a; 3440×1350-en viszont 120 px-es főcím, vagyis
 *     TÚLNŐTT a tervezői arányokon. A javítás: FLUID elrendezés (nincs `scale()`),
 *     `width: min(1920px, 100%)` + `container-type: size` + `clamp()` a
 *     konténer-egységekre kötve.                                   → G1/G2/G3/G4
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ MI VÁLTOZOTT EBBEN A FÁJLBAN 2026-08-23-án, ÉS MIÉRT
 * ════════════════════════════════════════════════════════════════════════════
 * A régi G1–G4b a `splashStageScale()` skálát mérte — az a szabály viszont MÁR
 * NEM VEZÉRLI A FELÜLETET, tehát a régi asszertek tárgya megszűnt. Helyükre a
 * FLUID megfelelőjük került, UGYANARRA A KÉRDÉSRE:
 *
 *   régi G1  „a főcím a képernyőn van-e?"      → új G1  ugyanez, de a fluid
 *                                                 geometriából, 20 nézetben,
 *                                                 bevágással ÉS anélkül;
 *   régi G2  „16:9-en kitölt-e a színpad?"     → új G2  „a tartalom-oszlop a
 *                                                 teljes viewportot lefedi-e,
 *                                                 és 1920×1080-on megmaradt-e a
 *                                                 tervezői 96 px / 280 px?";
 *   régi G3  „tablet ág változatlan?"          → új G3  „az ág-választó (szélesség
 *                                                 ÉS képarány) jól dönt-e?";
 *   régi G4  negatív: a `Math.max` levágja     → új G4  negatív: a RÉGI, fix
 *            a főcímet                           színpados szabály ROSSZABB
 *                                                 értéket ad (3440×1350-en 120 px
 *                                                 → kilóg a 24–96 px-es sávból;
 *                                                 1366×625-ön 55,6 px a fluid
 *                                                 81,3 helyett);
 *   régi G4b „nem lóg ki a színpad?"           → új G4b „nincs GÖRGETÉS, és sem a
 *                                                 főcím, sem a címerek nem lógnak
 *                                                 ki egyik tengelyen sem".
 *
 * A G5 (rácsos igazítás) és a MAX_VAGAS tárgya végleg megszűnt: nincs többé
 * `scale()`-elt doboz, amit el lehetne csúsztatni. A helyükre a fluid keret
 * forrás-őrszemei kerültek (G7/G8: `min(1920px, 100%)`, `margin-inline: auto`,
 * `container-type: size`, `env(safe-area-inset-*)`, és a `scale()` TILALMA).
 * A G6/G6b (fekete sáv) VÁLTOZATLAN — azt a fázis 1 oldotta meg, és a
 * háttér-réteg most sem mozdult.
 *
 * ÚJ: G10 — a splash egyetlen CSS-hossza sem lehet `vw`/`vh` alapú. A puszta
 * viewport-egység sérti a WCAG 1.4.4-et (200%-os szöveg-átméretezés): a `vw`-hez
 * kötött szöveg a böngésző nagyításakor NEM nő. (A `sizes="100vw"` KIVÉTEL: az
 * nem CSS-hossz, hanem a `<img>` forrásválasztó attribútuma — az őrszem kiszedi.)
 *
 * ⚠️ A TESZT NEM A KÉPLETET ISMÉTLI MEG, hanem a KÖVETKEZMÉNYÉT méri, és
 *    minden szabályhoz tartozik NEGATÍV ASSZERT: a régi, hibás viselkedést
 *    újrajátsszuk (mutáns forráson vagy a régi képlettel), és bizonyítjuk,
 *    hogy a mérce ELBUKNA rajta. Őrszem negatív asszert nélkül vak.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const FORRAS = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'ui', 'splash-stage-core.ts')
const WEB_KOMPONENS = path.join(REPO_ROOT, 'apps', 'web', 'components', 'ui', 'splash-screen.tsx')
const DESKTOP_KOMPONENS = path.join(REPO_ROOT, 'apps', 'desktop', 'src', 'components', 'splash-screen.tsx')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)
const ker = (n) => Math.round(n * 10) / 10

for (const f of [FORRAS, WEB_KOMPONENS, DESKTOP_KOMPONENS]) {
  if (!fs.existsSync(f)) {
    fail(`hiányzik a fájl: ${f}`)
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartoteka-splash-selftest-'))

/**
 * TS → CJS, majd betöltés. Fail-closed: ha valaha PROJEKT-import kerülne a
 * magba, a `require()` ismeretlen modulra futna, és ITT bukik el, érthetően —
 * a magnak import-mentesnek KELL maradnia, különben ez a teszt kihagyhatóvá válna.
 */
function loadTs(srcFile, outName) {
  const code = fs.readFileSync(srcFile, 'utf8')
  const out = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const f = path.join(tmp, outName)
  fs.writeFileSync(f, out, 'utf8')
  return require_(f)
}

const mag = loadTs(FORRAS, 'splash-stage-core.cjs')
const {
  splashStageScale,
  focimKepernyoY,
  splashHatterSav,
  splashElrendezes,
  splashFluidElrendezes,
  cssHossz,
  regiSzinpadFocimMeret,
  regiSzinpadCimerMeret,
  SZINPAD_CSS,
  OSZLOP_CSS,
  SOR_MAGASSAG,
  SZINPAD_SZELESSEG,
  SZINPAD_MAGASSAG,
  SAV_MAGASSAG,
  OSZLOP_MAX_SZELESSEG,
  FEKVO_ARANY,
} = mag

/** A `useViewportMode()` RÉGI szabálya — a G6/G6b (háttér-sáv) mércéjéhez kell. */
function modeFor(vw) {
  if (vw < 768) return 'mobile'
  if (vw < 1024) return 'tablet'
  return 'desktop'
}

/**
 * Valósághű böngésző-viewportok (nem képernyő-méretek!): a fejléc/könyvjelzősáv
 * már le van vonva. Az első 16 a feladat kötelező listája; az utolsó négy a
 * fekete sáv kimért eseteiből és a fekvő telefonokból jön.
 */
const NEZETEK = [
  [3440, 1350], [2560, 1300], [1920, 1080], [1920, 940],
  [1536, 730], [1366, 625], [1280, 600], [1180, 820],
  [1024, 1366], [820, 1180], [844, 390], [390, 844],
  [360, 640], [768, 1024], [2000, 950], [1440, 900],
  [1600, 900], [1024, 500], [667, 375], [640, 360],
]

/**
 * Valósághű telefonos bevágás. FEKVŐ tájolásban a bevágás OLDALRA vándorol
 * (bal/jobb 47 px), álló tájolásban fent van (47 px) és lent a home-indikátor
 * (34 px). Minden nézetet LEMÉRÜNK bevágással is: ez a szűkebb eset.
 */
function bevagas(vw, vh) {
  return vw > vh ? { bal: 47, jobb: 47, lent: 21 } : { fent: 47, lent: 34 }
}

const VALTOZATOK = [
  { nev: 'sík', sav: {} },
  { nev: 'bevágással', sav: null }, // nézetenként számolt
]

// ────────────────────────────────────────────────────────────────────────────
// G0 · A CSS-KIÉRTÉKELŐ MAGA IS HELYES (a mérce alapja)
// ────────────────────────────────────────────────────────────────────────────
// Ha a `cssHossz()` téved, MINDEN további mérés hazudik. Ezért előbb ezt mérjük,
// kézzel kiszámolt értékekkel.
{
  const ctx = { cqi: 1000, cqb: 500 }
  const PELDAK = [
    ['16px', 16],
    ['2rem', 32],
    ['5cqi', 50],
    ['5cqb', 25],
    // 1rem + 5.2cqi = 16 + 52 = 68 → a 2rem padló fölött, a 6rem plafon alatt.
    ['clamp(2rem, 1rem + 5.2cqi, 6rem)', 68],
    // 1.6cqi = 16 → a 10 px padló fölött, a 30 px plafon alatt.
    ['clamp(10px, 1.6cqi, 30px)', 16],
    // 16cqi = 160 → a clamp 160-at ad, a 26cqb = 130 viszont lehúzza.
    ['min(clamp(96px, 16cqi, 280px), 26cqb)', 130],
    ['max(10px, 1cqb)', 10],
    ['clamp(12px, 3cqi, 64px)', 30],
  ]
  let hiba = 0
  for (const [kif, vart] of PELDAK) {
    const kapott = cssHossz(kif, ctx)
    if (Math.abs(kapott - vart) > 1e-9) {
      fail(`G0 a cssHossz("${kif}") ${kapott}-t adott a várt ${vart} helyett`)
      hiba += 1
    }
  }
  if (hiba === 0) ok(`G0 a CSS-kiértékelő mind a ${PELDAK.length} kézi példán helyes`)

  // NEGATÍV ASSZERT: a kiértékelő tényleg FÜGG a konténer méretétől — ha nem
  // függne (pl. valaki kivenné a cqi-ágat), ez az assert bukna.
  const kicsi = cssHossz('clamp(2rem, 1rem + 5.2cqi, 6rem)', { cqi: 400, cqb: 400 })
  const nagy = cssHossz('clamp(2rem, 1rem + 5.2cqi, 6rem)', { cqi: 1800, cqb: 1800 })
  if (nagy > kicsi) ok(`G0 negatív asszert: a méret követi a konténert (${ker(kicsi)} → ${ker(nagy)})`)
  else fail('G0 negatív asszert: a kiértékelő NEM függ a konténer méretétől — a mérce vak')
}

// ────────────────────────────────────────────────────────────────────────────
// G0b · MINDEN MÉRET-KIFEJEZÉS ÉRTELMEZHETŐ, ÉS POZITÍV ÉRTÉKET AD
// ────────────────────────────────────────────────────────────────────────────
// Egy elgépelt egység (`cqii`, `clmap(`) a böngészőben NÉMÁN érvénytelen
// deklarációvá válik — az elem az örökölt/alapértelmezett méretet kapja, és a
// splash csendben szétesik. Itt viszont hangosan bukik.
{
  const KESZLETEK = [['SZINPAD_CSS', SZINPAD_CSS], ['OSZLOP_CSS', OSZLOP_CSS]]
  const PROBA = [
    { cqi: 320, cqb: 320 },
    { cqi: 1920, cqb: 1080 },
    { cqi: 750, cqb: 369 },
  ]
  let hiba = 0
  let db = 0
  for (const [keszletNev, keszlet] of KESZLETEK) {
    for (const [kulcs, kifejezes] of Object.entries(keszlet)) {
      db += 1
      for (const ctx of PROBA) {
        let ertek = null
        try {
          ertek = cssHossz(kifejezes, ctx)
        } catch (e) {
          fail(`G0b ${keszletNev}.${kulcs} („${kifejezes}") nem értelmezhető: ${e.message}`)
          hiba += 1
          break
        }
        if (!(ertek > 0) || !Number.isFinite(ertek)) {
          fail(`G0b ${keszletNev}.${kulcs} („${kifejezes}") ${ertek}-t adott ${ctx.cqi}×${ctx.cqb} konténeren`)
          hiba += 1
          break
        }
      }
    }
  }
  if (hiba === 0) ok(`G0b mind a ${db} méret-kifejezés értelmezhető és pozitív (3 konténer-méreten)`)

  // A sormagasságok és a sáv-magasság is épek — ezekkel számol a modell.
  const sorHibak = Object.entries(SOR_MAGASSAG).filter(([, v]) => !(v >= 0.9 && v <= 2))
  if (sorHibak.length === 0 && SAV_MAGASSAG > 0) {
    ok(`G0b a ${Object.keys(SOR_MAGASSAG).length} sormagasság és a ${SAV_MAGASSAG} px-es töltés-sáv értelmes`)
  } else {
    fail(`G0b hibás sormagasság vagy sáv-magasság: ${JSON.stringify(sorHibak)}, sáv=${SAV_MAGASSAG}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// G1 · A FŐCÍM ÉS A CÍMEREK MINDEN NÉZETBEN TELJES EGÉSZÜKBEN A KÉPERNYŐN VANNAK
// ────────────────────────────────────────────────────────────────────────────
{
  let hiba = 0
  for (const [vw, vh] of NEZETEK) {
    for (const v of VALTOZATOK) {
      const sav = v.sav === null ? bevagas(vw, vh) : v.sav
      const L = splashFluidElrendezes(vw, vh, sav)
      const cim = `G1 ${vw}×${vh} ${v.nev} (${L.fajta})`

      // (a) a főcím teljes egészében a képernyőn
      if (!(L.focim.teteje > 0 && L.focim.alja < vh)) {
        fail(`${cim}: a FŐCÍM kilóg függőlegesen (teteje=${ker(L.focim.teteje)}, alja=${ker(L.focim.alja)}, vh=${vh})`)
        hiba += 1
      }
      // (b) a címerek egyik tengelyen sem lógnak ki
      for (const [nev, d] of [['bal címer', L.cimer], ['közép logó', L.kozepLogo]]) {
        if (d.bal < -1e-6 || d.jobb > vw + 1e-6 || d.teteje < -1e-6 || d.alja > vh + 1e-6) {
          fail(
            `${cim}: a ${nev} KILÓG ` +
              `(bal=${ker(d.bal)}, jobb=${ker(d.jobb)}, teteje=${ker(d.teteje)}, alja=${ker(d.alja)})`,
          )
          hiba += 1
        }
      }
      // (c) a főcím egy sorban KIFÉR (a felület `white-space: nowrap`-et használ)
      if (L.focim.szelesseg > L.belsoSzelesseg + 1e-6) {
        fail(
          `${cim}: a FŐCÍM nem fér ki egy sorban ` +
            `(${ker(L.focim.szelesseg)} px > ${ker(L.belsoSzelesseg)} px belső szélesség)`,
        )
        hiba += 1
      }
      // (d) a logósor kifér vízszintesen
      if (L.logosorSzelesseg > L.belsoSzelesseg + 1e-6) {
        fail(
          `${cim}: a LOGÓSOR nem fér ki ` +
            `(${ker(L.logosorSzelesseg)} px > ${ker(L.belsoSzelesseg)} px)`,
        )
        hiba += 1
      }
    }
  }
  if (hiba === 0) {
    ok(`G1 mind a ${NEZETEK.length} nézetben (bevágással és anélkül) a főcím és a címerek a képernyőn vannak`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// G1b · NINCS GÖRGETÉS — a teljes tartalom befér a viewportba
// ────────────────────────────────────────────────────────────────────────────
{
  let hiba = 0
  let legszukebb = { nev: '', tartalek: Infinity }
  for (const [vw, vh] of NEZETEK) {
    for (const v of VALTOZATOK) {
      const sav = v.sav === null ? bevagas(vw, vh) : v.sav
      const L = splashFluidElrendezes(vw, vh, sav)
      const tartalek = L.hasznosMagassag - L.tartalomMagassag
      if (tartalek < legszukebb.tartalek) legszukebb = { nev: `${vw}×${vh} ${v.nev}`, tartalek }
      if (L.gorgetes) {
        fail(
          `G1b ${vw}×${vh} ${v.nev} (${L.fajta}): GÖRGETNI KELLENE — ` +
            `${ker(L.tartalomMagassag)} px tartalom ${ker(L.hasznosMagassag)} px helyen`,
        )
        hiba += 1
      }
    }
  }
  if (hiba === 0) {
    ok(
      `G1b egyetlen nézetben sincs görgetés (a legszűkebb: ${legszukebb.nev}, ` +
        `${ker(legszukebb.tartalek)} px tartalék)`,
    )
  }
}

// ────────────────────────────────────────────────────────────────────────────
// G1c · A FŐCÍM MÉRETE ÉRTELMES SÁVBAN VAN MINDEN NÉZETBEN
// ────────────────────────────────────────────────────────────────────────────
// Sem olvashatatlanul kicsi, sem túlcsorduló. Ez az a mérce, ami a RÉGI, fix
// színpados szabályt megbuktatja (lásd G4).
const FOCIM_MIN = 24
const FOCIM_MAX = 96
{
  let hiba = 0
  let legkisebb = { nev: '', meret: Infinity }
  let legnagyobb = { nev: '', meret: -Infinity }
  for (const [vw, vh] of NEZETEK) {
    for (const v of VALTOZATOK) {
      const sav = v.sav === null ? bevagas(vw, vh) : v.sav
      const L = splashFluidElrendezes(vw, vh, sav)
      if (L.focimMeret < legkisebb.meret) legkisebb = { nev: `${vw}×${vh} ${v.nev}`, meret: L.focimMeret }
      if (L.focimMeret > legnagyobb.meret) legnagyobb = { nev: `${vw}×${vh} ${v.nev}`, meret: L.focimMeret }
      if (L.focimMeret < FOCIM_MIN - 1e-9 || L.focimMeret > FOCIM_MAX + 1e-9) {
        fail(
          `G1c ${vw}×${vh} ${v.nev}: a főcím ${ker(L.focimMeret)} px — ` +
            `kilóg a ${FOCIM_MIN}–${FOCIM_MAX} px-es sávból`,
        )
        hiba += 1
      }
    }
  }
  if (hiba === 0) {
    ok(
      `G1c a főcím mindenütt a ${FOCIM_MIN}–${FOCIM_MAX} px-es sávban ` +
        `(legkisebb ${ker(legkisebb.meret)} px @ ${legkisebb.nev}, ` +
        `legnagyobb ${ker(legnagyobb.meret)} px @ ${legnagyobb.nev})`,
    )
  }
}

// ────────────────────────────────────────────────────────────────────────────
// G2 · A TARTALOM LEFEDI A TELJES VIEWPORTOT, ÉS 1920×1080-ON MEGMARADT A TERV
// ────────────────────────────────────────────────────────────────────────────
// A fluid átállás nem szólhat úgy, hogy közben a tervezői arányok elvesznek.
{
  let hiba = 0
  for (const [vw, vh] of NEZETEK) {
    const L = splashFluidElrendezes(vw, vh)
    const vartSzelesseg = Math.min(SZINPAD_SZELESSEG, vw)
    if (Math.abs(L.containerSzelesseg - vartSzelesseg) > 1e-9 || Math.abs(L.containerMagassag - vh) > 1e-9) {
      fail(
        `G2 ${vw}×${vh}: a tartalom-keret ${ker(L.containerSzelesseg)}×${ker(L.containerMagassag)}, ` +
          `a várt ${vartSzelesseg}×${vh} helyett — maradt kihasználatlan sáv?`,
      )
      hiba += 1
    }
  }
  if (hiba === 0) ok(`G2 a tartalom-keret mind a ${NEZETEK.length} nézetben a teljes (max 1920 px) területet lefedi`)

  // A tervezői referencia-nézeten (1920×1080) a kompozíció mérete NEM változhat.
  const ref = splashFluidElrendezes(1920, 1080)
  const REF = [
    ['főcím', ref.focimMeret, 96, 0],
    ['címer', ref.cimerMeret, 280, 0],
    ['közép logó', ref.kozepLogo.szelesseg, 460, 0.02],
  ]
  for (const [nev, kapott, vart, turés] of REF) {
    const elteres = Math.abs(kapott - vart) / vart
    if (elteres <= turés + 1e-9) {
      ok(`G2 1920×1080: a ${nev} ${ker(kapott)} px — a tervezői ${vart} px megmaradt`)
    } else {
      fail(`G2 1920×1080: a ${nev} ${ker(kapott)} px lett a tervezői ${vart} px helyett (${ker(elteres * 100)}% eltérés)`)
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// G3 · AZ ÁG-VÁLASZTÓ JÓL DÖNT (szélesség ÉS képarány)
// ────────────────────────────────────────────────────────────────────────────
{
  const VART = [
    [390, 844, 'oszlop'],   // álló telefon
    [360, 640, 'oszlop'],   // kis álló telefon
    [667, 375, 'szinpad'],  // FEKVŐ telefon: az oszlop 375 px magasan nem férne ki
    [640, 360, 'szinpad'],  // fekvő telefon
    [768, 1024, 'szinpad'], // álló tablet
    [844, 390, 'szinpad'],  // fekvő telefon (768 fölött)
    [1920, 1080, 'szinpad'],
  ]
  let hiba = 0
  for (const [vw, vh, vart] of VART) {
    const kapott = splashElrendezes(vw, vh)
    if (kapott !== vart) {
      fail(`G3 ${vw}×${vh}: az ág-választó „${kapott}"-ot mondott a várt „${vart}" helyett`)
      hiba += 1
    }
  }
  if (hiba === 0) ok(`G3 az ág-választó mind a ${VART.length} próbán jól dönt (küszöb: ${OSZLOP_MAX_SZELESSEG} px / ${FEKVO_ARANY} arány)`)

  // NEGATÍV ASSZERT: a puszta szélesség-küszöb (a RÉGI szabály) a fekvő telefont
  // az oszlop-ágra küldené — és ott a tartalom NEM férne ki.
  const csakSzelesseg = (vw) => (vw < OSZLOP_MAX_SZELESSEG ? 'oszlop' : 'szinpad')
  if (csakSzelesseg(667) === 'oszlop' && splashElrendezes(667, 375) === 'szinpad') {
    ok('G3 negatív asszert: a régi, csak-szélesség szabály 667×375-öt az oszlop-ágra küldené — a mai nem')
  } else {
    fail('G3 negatív asszert: a régi és az új ág-választó ugyanazt mondja 667×375-re — a mérce vak')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// G4 · NEGATÍV ASSZERT — A RÉGI, FIX SZÍNPADOS SZABÁLY BIZONYÍTHATÓAN ROSSZABB
// ────────────────────────────────────────────────────────────────────────────
// Egy őrszem, ami sosem tud bukni, rosszabb a semminél. Itt újrajátsszuk a RÉGI
// szabályt (`96 × min(vw/1920, vh/1080)`), és igazoljuk, hogy a MAI mércék
// elbuknának rajta — vagyis a mérce tényleg megkülönbözteti a két állapotot.
{
  // (a) ULTRAWIDE: a régi szabály TÚLNÖVI a főcímet — kilóg a G1c sávjából.
  {
    const [vw, vh] = [3440, 1350]
    const regi = regiSzinpadFocimMeret(vw, vh)
    const uj = splashFluidElrendezes(vw, vh).focimMeret
    if (regi > FOCIM_MAX + 1e-9 && uj <= FOCIM_MAX + 1e-9) {
      ok(
        `G4 negatív asszert: ${vw}×${vh}-on a RÉGI szabály ${ker(regi)} px-es főcímet adna ` +
          `(kilóg a ${FOCIM_MAX} px-es plafonon), a fluid ${ker(uj)} px-et`,
      )
    } else {
      fail(
        `G4 negatív asszert: ${vw}×${vh}-on a régi (${ker(regi)} px) és az új (${ker(uj)} px) ` +
          'egyaránt átmenne a G1c sávján — a mérce nem különbözteti meg a két állapotot',
      )
    }
  }

  // (b) ALACSONY LAPTOP-ABLAK: a régi szabály ARÁNYTALANUL KICSIRE húzza a főcímet.
  for (const [vw, vh] of [[1366, 625], [1280, 600]]) {
    const regi = regiSzinpadFocimMeret(vw, vh)
    const uj = splashFluidElrendezes(vw, vh).focimMeret
    if (regi < 0.8 * uj) {
      ok(
        `G4 negatív asszert: ${vw}×${vh}-on a RÉGI szabály ${ker(regi)} px-es főcímet adott, ` +
          `a fluid ${ker(uj)} px-et (${ker((1 - regi / uj) * 100)}%-kal nagyobb)`,
      )
    } else {
      fail(
        `G4 negatív asszert: ${vw}×${vh}-on a régi (${ker(regi)}) alig kisebb az újnál (${ker(uj)}) — ` +
          'vagy a fluid szabály romlott el, vagy a régi viselkedés újrajátszása.',
      )
    }
  }

  // (c) TABLET ÁLLÓ: a régi szabály a képernyő magasságának csak töredékét használta.
  {
    const [vw, vh] = [1024, 1366]
    const regiSkala = splashStageScale(vw, vh, modeFor(vw)).skala
    const regiKihasznaltsag = (SZINPAD_MAGASSAG * regiSkala) / vh
    const L = splashFluidElrendezes(vw, vh)
    const ujKihasznaltsag = L.containerMagassag / vh
    if (regiKihasznaltsag < 0.5 && ujKihasznaltsag > 0.99) {
      ok(
        `G4 negatív asszert: ${vw}×${vh}-on a RÉGI látvány a magasság ${ker(regiKihasznaltsag * 100)}%-át ` +
          `használta, a fluid keret ${ker(ujKihasznaltsag * 100)}%-át`,
      )
    } else {
      fail(
        `G4 negatív asszert: ${vw}×${vh}-on a kihasználtság régen ${ker(regiKihasznaltsag * 100)}%, ` +
          `ma ${ker(ujKihasznaltsag * 100)}% — a mérce nem mutat különbséget`,
      )
    }
  }

  // (d) …és a RÉGI G1 mércéje (a `Math.max`-os vágás) továbbra is tud pirosra váltani.
  {
    const [vw, vh] = [1536, 730]
    const regiSkala = Math.max(vw / SZINPAD_SZELESSEG, vh / SZINPAD_MAGASSAG)
    const regiY = focimKepernyoY(vh, regiSkala)
    if (regiY <= 0) {
      ok(`G4 negatív asszert: a „kitölt és vág" szabály ${vw}×${vh}-on tényleg levágta a főcímet (y=${Math.round(regiY)})`)
    } else {
      fail(
        `G4 negatív asszert: a „kitölt és vág" szabály nem vágja le a főcímet (y=${Math.round(regiY)}) — ` +
          'a régi hiba újrajátszása romlott el',
      )
    }
  }

  // (e) A CÍMEREK: a régi szabály alacsony ablakban is kisebb címert adott.
  {
    const [vw, vh] = [1440, 900]
    const regi = regiSzinpadCimerMeret(vw, vh)
    const uj = splashFluidElrendezes(vw, vh).cimerMeret
    if (uj > regi) ok(`G4 negatív asszert: ${vw}×${vh}-on a címer ${ker(regi)} px volt, ma ${ker(uj)} px`)
    else fail(`G4 negatív asszert: ${vw}×${vh}-on a címer nem lett nagyobb (${ker(regi)} → ${ker(uj)})`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// G4b · NEGATÍV ASSZERT — A GÖRGETÉS-MÉRCE TUD PIROSRA VÁLTANI
// ────────────────────────────────────────────────────────────────────────────
// A G1b csak akkor ér valamit, ha egy rossz méret-szabályon TÉNYLEG elbukna.
// Ezért a magot MUTÁLJUK: a címernek fix, blokk-plafon nélküli méretet adunk —
// pontosan az a hiba, amit a `min(..., 26cqb)` plafon megelőz.
{
  const forras = fs.readFileSync(FORRAS, 'utf8')
  const mutalt = forras.replace(
    "cimer: 'min(clamp(96px, 16cqi, 280px), 26cqb)',",
    "cimer: '280px',",
  )
  if (mutalt === forras) {
    fail('G4b a „címer blokk-plafon nélkül" mutáns nem készült el — a negatív asszert vak lett, nézd át')
  } else {
    const mutansMag = (() => {
      const out = ts.transpileModule(mutalt, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      }).outputText
      const f = path.join(tmp, 'splash-stage-core-mutans.cjs')
      fs.writeFileSync(f, out, 'utf8')
      return require_(f)
    })()
    const bukok = NEZETEK.filter(([vw, vh]) => {
      const L = mutansMag.splashFluidElrendezes(vw, vh, bevagas(vw, vh))
      return L.gorgetes || L.cimer.alja > vh + 1e-6
    })
    if (bukok.length > 0) {
      ok(
        `G4b negatív asszert: a blokk-plafon nélküli címer ${bukok.length} nézetben megbuktatná a G1b/G1-et ` +
          `(pl. ${bukok[0][0]}×${bukok[0][1]})`,
      )
    } else {
      fail('G4b negatív asszert: a blokk-plafon nélküli címer is átmenne — a görgetés-mérce vak')
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// G6 · A HÁTTÉR A TELJES KÉPERNYŐT FEDI — NINCS SÁV EGYETLEN ARÁNYON SEM
// ────────────────────────────────────────────────────────────────────────────
// EZ Endre panaszának a közvetlen mércéje, és a fluid átállás NEM ÉRINTETTE:
// a háttérkép ma is a külső, `fixed inset-0` rétegen fekszik (`objectFit: cover`),
// tehát a fedetlen sáv mind a négy oldalon PONTOSAN nulla — bármilyen arányon.
{
  let hiba = 0
  for (const [vw, vh] of NEZETEK) {
    const mode = modeFor(vw)
    const sav = splashHatterSav(vw, vh, mode)
    const max = Math.max(sav.bal, sav.jobb, sav.fent, sav.lent)
    if (max !== 0) {
      fail(
        `G6 ${vw}×${vh} (${mode}): FEDETLEN SÁV maradt ` +
          `(bal=${Math.round(sav.bal)}, jobb=${Math.round(sav.jobb)}, ` +
          `fent=${Math.round(sav.fent)}, lent=${Math.round(sav.lent)})`,
      )
      hiba += 1
    }
  }
  if (hiba === 0) ok(`G6 mind a ${NEZETEK.length} nézetben 0 px a fedetlen sáv (négy oldalon)`)
}

// ────────────────────────────────────────────────────────────────────────────
// G6b · NEGATÍV ASSZERT — a RÉGI rétegrend (háttér a színpadon belül)
// ────────────────────────────────────────────────────────────────────────────
// Újrajátsszuk azt a felállást, amiben a háttér a `scale()`-elt színpadon belül
// élt, és igazoljuk, hogy a G6 mércéje elbukna rajta. A várt értékek Endre
// KIMÉRT eseteiből jönnek — nem a képletből visszaszámolva.
{
  const KIMERT = [
    { vw: 2000, vh: 950, tengely: 'vizszintes', vart: 156 },
    { vw: 1536, vh: 730, tengely: 'vizszintes', vart: 119 },
    { vw: 3440, vh: 1350, tengely: 'vizszintes', vart: 520 },
    { vw: 820, vh: 1180, tengely: 'fuggoleges', vart: 359 },
  ]
  for (const { vw, vh, tengely, vart } of KIMERT) {
    const mode = modeFor(vw)
    const sav = splashHatterSav(vw, vh, mode, 'szinpadon')
    const mert = tengely === 'vizszintes' ? sav.bal : sav.fent
    if (Math.abs(mert - vart) <= 1.5) {
      ok(`G6b negatív asszert: a RÉGI rétegrend ${vw}×${vh}-on ${Math.round(mert)} px sávot ad (kimérve ${vart})`)
    } else {
      fail(
        `G6b negatív asszert: ${vw}×${vh}-on ${Math.round(mert)} px jött ki a kimért ${vart} helyett — ` +
          'vagy a régi viselkedés újrajátszása romlott el, vagy a `splashHatterSav` nem azt méri, amit Endre látott.',
      )
    }
  }
  const regi = splashHatterSav(2000, 950, 'desktop', 'szinpadon')
  const regiMax = Math.max(regi.bal, regi.jobb, regi.fent, regi.lent)
  if (regiMax > 0) ok('G6b a G6 mércéje (minden sáv = 0) a régi rétegrenden ELBUKNA — a mérce tud pirosra váltani')
  else fail('G6b a G6 mércéje a RÉGI, hibás rétegrenden is zöld lenne — a mérce vak')
}

// ────────────────────────────────────────────────────────────────────────────
// G7 / G8 · A KOMPONENSEK RÉTEGRENDJE ÉS FLUID KERETE (forrás-őrszem)
// ────────────────────────────────────────────────────────────────────────────
// Ezek CSS-szabályok, a magban nem mérhetők — ezért a forrást nézzük, a
// kommenteket KISZEDVE, hogy egy magyarázó szöveg ne adjon vak zöldet.
// A függvény HIBALISTÁT ad vissza (nem ír a konzolra), hogy MUTÁNS forráson is
// futtatható legyen — így bizonyítjuk, hogy tényleg fog a szabályokon.

function kommentMentes(nyers) {
  return nyers
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/**
 * @returns {string[]} hibák; üres tömb = rendben
 */
function retegrendHibak(nyers) {
  const hibak = []
  const kod = kommentMentes(nyers)

  // ── (1) FLUID KERET — nincs többé fix, `scale()`-elt színpad.
  if (!/min\((\$\{SZINPAD_SZELESSEG\}|1920)px,\s*100%\)/.test(kod)) {
    hibak.push(
      'nem találom a fluid tartalom-oszlop `width: min(1920px, 100%)` deklarációját. ' +
        'Ha visszakerült a fix 1920×1080-as színpad, a tartalom alacsony laptop-ablakban ÚJRA feleslegesen kicsi lesz.',
    )
  }
  if (!/marginInline:\s*'auto'/.test(kod)) {
    hibak.push('a tartalom-oszlopról hiányzik a `marginInline: auto` — ultrawide képernyőn nem maradna középen')
  }
  if (!/containerType:\s*'size'/.test(kod)) {
    hibak.push(
      'hiányzik a `containerType: size` — enélkül a `cqi`/`cqb` egységeknek nincs mihez mérniük, ' +
        'és MINDEN méret érvénytelen deklarációvá válik',
    )
  }
  if (/width:\s*1920\b/.test(kod) || /height:\s*1080\b/.test(kod)) {
    hibak.push('visszatért a FIX 1920×1080-as színpad-doboz — pontosan ezt váltotta ki a fluid elrendezés')
  }
  if (/stageScale/.test(kod)) {
    hibak.push('visszatért a `stageScale` (`transform: scale()`-elt színpad) — a fluid elrendezésben nincs skálázás')
  }
  if (/translate\(-50%,\s*-50%\)\s*scale\(/.test(kod)) {
    hibak.push('visszatért a `translate(-50%, -50%) scale(...)` színpad-igazítás — a fluid oszlopnak nincs rá szüksége')
  }

  // ── (2) BIZTONSÁGI SÁV — telefonos bevágás / home-indikátor, mind a négy oldal.
  for (const oldal of ['top', 'bottom', 'left', 'right']) {
    if (!kod.includes(`env(safe-area-inset-${oldal}`)) {
      hibak.push(
        `hiányzik az \`env(safe-area-inset-${oldal})\` padding — fekvő tájolásban a bevágás OLDALRA vándorol, ` +
          'tehát mind a négy oldal kell',
      )
    }
  }

  // ── (3) A FÜGGŐLEGES OSZLOP — mindkét ág flex-oszlop, `space-between`-nel.
  const oszlopok = kod.match(/flexDirection:\s*'column'/g) ?? []
  if (oszlopok.length < 2) {
    hibak.push('nem találom mindkét ág (`StageSplash` + `MobileSplash`) függőleges flex-oszlopát')
  }
  if ((kod.match(/justifyContent:\s*'space-between'/g) ?? []).length < 2) {
    hibak.push('a fluid oszlopokról hiányzik a `justifyContent: space-between` — a blokkok nem töltenék ki a magasságot')
  }
  if (/overflowY:\s*'auto'/.test(kod)) {
    hibak.push(
      'visszatért az `overflowY: auto` görgetés-mentőöv. A fluid elrendezés BIZONYÍTOTTAN kifér ' +
        '(G1b), a görgetés itt hibát takarna el, nem oldana meg.',
    )
  }

  // ── (4) A SZABÁLYOK EGYETLEN FORRÁSBÓL — nincs nyers méret a JSX-ben.
  if (!/SZINPAD_CSS/.test(kod) || !/OSZLOP_CSS/.test(kod)) {
    hibak.push('a komponens nem a közös `SZINPAD_CSS` / `OSZLOP_CSS` méretkészletet használja — két példány némán széthúzna')
  }
  for (const [valtozo, konstans] of [['HEADLINE', 'FOCIM_SZOVEG'], ['SUBTITLE', 'ALCIM_SZOVEG'], ['TAGLINE', 'TAGLINE_SZOVEG']]) {
    if (!new RegExp(`const ${valtozo} = ${konstans}\\b`).test(kod)) {
      hibak.push(
        `a(z) ${valtozo} nem a közös \`${konstans}\` konstansból jön. A modell a szöveg HOSSZÁVAL számol ` +
          '(kifér-e egy sorban) — egy itt átírt szöveg némán meghazudtolná a mércét.',
      )
    }
  }

  // ── (5) RÉTEGREND — a háttér a KÜLSŐ rétegen, a tartalom-oszlop ELŐTT.
  const stageSplashIdx = kod.indexOf('function StageSplash(')
  const mobileSplashIdx = kod.indexOf('function MobileSplash(')
  if (stageSplashIdx < 0 || mobileSplashIdx < 0) {
    hibak.push('nem találom a StageSplash / MobileSplash függvényt — az őrszem vak lett, nézd át')
    return hibak
  }
  const stageSplashTorzs = kod.slice(stageSplashIdx, mobileSplashIdx)
  const hatterIdx = stageSplashTorzs.indexOf('/Hatter.png')
  const tartalomIdx = stageSplashTorzs.indexOf('BIZTONSAGI_SAV')
  if (hatterIdx < 0 || tartalomIdx < 0 || hatterIdx > tartalomIdx) {
    hibak.push(
      'a HÁTTÉRKÉP nincs a tartalom-oszlop ELŐTT, a külső rétegen. Ha visszakerült a tartalomba, a látvány ' +
        'körül újra FEDETLEN SÁV marad (2000×950 → 156 px).',
    )
  }

  // A háttér a viewport szélességéhez válasszon forrást, ne a fix 1920-hoz.
  if (/sizes="1920px"/.test(kod)) {
    hibak.push('a háttérkép `sizes="1920px"`-et használ — a teljes szélességű rétegen `sizes="100vw"` kell')
  }
  if (!/sizes="100vw"/.test(stageSplashTorzs)) {
    hibak.push('a StageSplash háttérképéről hiányzik a `sizes="100vw"`')
  }

  // ── (6) FALLBACK-SZÍN — soha többé majdnem fekete alapszín a réteg alatt.
  if (/#0d0a07/.test(kod)) {
    hibak.push('visszatért a `#0d0a07` (majdnem fekete) alapszín — a fallback a krém `#d8cfba` kell legyen')
  }
  const kremIdx = stageSplashTorzs.indexOf("'#d8cfba'")
  if (kremIdx < 0 || (tartalomIdx >= 0 && kremIdx > tartalomIdx)) {
    hibak.push('a StageSplash külső rétegének nincs krém (`#d8cfba`) fallback alapszíne a tartalom előtt')
  }

  // ── (7) A KÜLSŐ RÉTEG nem igazíthat rácsosan (ez okozta az eredeti elcsúszást).
  const retegIdx = kod.indexOf('fixed inset-0 z-50')
  const reteg = retegIdx >= 0 ? kod.slice(retegIdx, retegIdx + 700) : ''
  if (/placeItems:\s*'center'/.test(reteg)) {
    hibak.push('a külső réteg VISSZAKAPTA a `placeItems: center`-t — ez okozta az eredeti elcsúszást')
  }

  // ── (8) A régi „kitölt és vág" képlet ne éledjen újra egyik kliensben sem.
  if (/Math\.max\(\s*sx\s*,\s*sy\s*\)/.test(kod)) {
    hibak.push('visszatért a `Math.max(sx, sy)` („kitölt és vág") — ez vágta le a főcímet')
  }

  return hibak
}

const KOMPONENSEK = [
  { nev: 'G7 web    ', file: WEB_KOMPONENS },
  { nev: 'G8 desktop', file: DESKTOP_KOMPONENS },
]

for (const { nev, file } of KOMPONENSEK) {
  const nyers = fs.readFileSync(file, 'utf8')
  const hibak = retegrendHibak(nyers)
  if (hibak.length === 0) {
    ok(`${nev} rétegrend + fluid keret rendben (${path.relative(REPO_ROOT, file).replace(/\\/g, '/')})`)
  } else {
    for (const h of hibak) fail(`${nev} ${h}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// G7b / G8b · NEGATÍV ASSZERT — MUTÁNSOK: a régi, hibás forrás bukjon el
// ────────────────────────────────────────────────────────────────────────────
// Nem elég, hogy a mai forráson zöld: bizonyítani kell, hogy a RÉGI kódra piros
// lenne. Ezért a mai forrásból mutánsokat gyártunk, amelyek visszaállítják az
// egykori hibákat, és megköveteljük, hogy az őrszem MINDEGYIKEN elbukjon.
{
  /** A háttérképet visszateszi a tartalom-oszlopba — pontosan a régi rétegrend. */
  function mutansHatterVissza(nyers) {
    const kepBlokk = nyers.match(/<Image\s+src="\/Hatter\.png"[\s\S]*?\/>/)
    if (!kepBlokk) return null
    const nelkul = nyers.replace(kepBlokk[0], '')
    if (!nelkul.includes('{/* Headline */}')) return null
    return nelkul.replace('{/* Headline */}', `${kepBlokk[0]}\n        {/* Headline */}`)
  }

  const MUTANSOK = [
    { nev: 'háttér vissza a tartalomba', gyart: mutansHatterVissza },
    { nev: 'fekete fallback-szín', gyart: (s) => s.replace(/background: '#d8cfba',/g, "background: '#0d0a07',") },
    // ⚠️ GLOBÁLIS csere kell: az első `sizes="100vw"` előfordulás a fájlban egy
    //    MAGYARÁZÓ KOMMENTBEN van, azt pedig az őrszem kiszedi — egy sima
    //    `replace()` olyan mutánst gyártana, ami nem is mutálja a kódot, és az
    //    őrszem hamisan „vaknak" látszana.
    { nev: 'fix sizes="1920px"', gyart: (s) => s.replace(/sizes="100vw"/g, 'sizes="1920px"') },
    {
      nev: 'vissza a fix 1920×1080-as színpadra',
      gyart: (s) => s.replace('width: `min(${SZINPAD_SZELESSEG}px, 100%)`', 'width: 1920'),
    },
    {
      nev: 'konténer-keret nélkül (nincs cqi/cqb alap)',
      gyart: (s) => s.replace("containerType: 'size',", "containerType: 'normal',"),
    },
    {
      nev: 'nincs vízszintes középre igazítás',
      gyart: (s) => s.replace("marginInline: 'auto',", "marginInline: '0',"),
    },
    {
      nev: 'biztonsági sáv (bevágás) elhagyva',
      gyart: (s) => s.replace("  paddingLeft: 'env(safe-area-inset-left, 0px)',\n", ''),
    },
    {
      nev: 'görgetés-mentőöv visszatér',
      gyart: (s) => s.replace("overflow: 'hidden',\n            }}\n          >", "overflowY: 'auto',\n            }}\n          >"),
    },
    {
      nev: 'nyers méret a közös készlet helyett',
      gyart: (s) => s.replace(/SZINPAD_CSS/g, 'NYERS_MERETEK'),
    },
    {
      nev: 'a főcím szövege kimásolva a magból',
      gyart: (s) => s.replace('const HEADLINE = FOCIM_SZOVEG', "const HEADLINE = 'Békesség Istentől!'"),
    },
  ]

  for (const { nev, file } of KOMPONENSEK) {
    const nyers = fs.readFileSync(file, 'utf8')
    for (const mutans of MUTANSOK) {
      const mutalt = mutans.gyart(nyers)
      if (!mutalt || mutalt === nyers) {
        fail(`${nev} mutáns („${mutans.nev}") nem készült el — az őrszem negatív asszertje vak lett, nézd át`)
        continue
      }
      const hibak = retegrendHibak(mutalt)
      if (hibak.length > 0) {
        ok(`${nev} negatív asszert: a „${mutans.nev}" mutáns ELBUKIK (${hibak.length} hiba)`)
      } else {
        fail(`${nev} negatív asszert: a „${mutans.nev}" mutáns ÁTMENT — az őrszem nem fogja ezt a hibát`)
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// G8c · A DESKTOP SZABÁLYAI KARAKTERRE UGYANAZOK, MINT A WEB MAGJÁÉ
// ────────────────────────────────────────────────────────────────────────────
// A desktop (Vite/Tauri) nem tudja importálni a `apps/web` magját, ezért a
// szabályok ott meg vannak ismételve. Két példány NÉMÁN SZÉTHÚZ — ez a projekt
// visszatérő hibaosztálya —, úgyhogy itt KIVESSZÜK a desktop másolatait, és
// karakterre összevetjük a maggal; a `splashElrendezes` törzsét pedig LE IS
// FUTTATJUK minden nézetben.
{
  const magNyers = fs.readFileSync(FORRAS, 'utf8')
  const desktopNyers = fs.readFileSync(DESKTOP_KOMPONENS, 'utf8')

  /** Egy `const NEV = { … } as const` blokk kivétele. */
  function objektumBlokk(forras, nev) {
    const re = new RegExp(`(?:export )?const ${nev} = \\{[\\s\\S]*?\\n\\} as const`)
    const m = forras.match(re)
    return m ? m[0].replace(/^export /, '') : null
  }
  /** Egy `const NEV = …` skalár sor kivétele. */
  function skalarSor(forras, nev) {
    const m = forras.match(new RegExp(`^(?:export )?const ${nev} = .*$`, 'm'))
    return m ? m[0].replace(/^export /, '') : null
  }

  const OBJEKTUMOK = ['SOR_MAGASSAG', 'SZINPAD_CSS', 'OSZLOP_CSS']
  const SKALAROK = [
    'SZINPAD_SZELESSEG',
    'FOCIM_SZOVEG',
    'ALCIM_SZOVEG',
    'TAGLINE_SZOVEG',
    'SAV_MAGASSAG',
    'OSZLOP_MAX_SZELESSEG',
    'FEKVO_ARANY',
  ]

  /** @returns {string[]} eltérések; üres tömb = a két példány azonos */
  function masolatElteresek(desktopForras) {
    const el = []
    for (const nev of OBJEKTUMOK) {
      const a = objektumBlokk(magNyers, nev)
      const b = objektumBlokk(desktopForras, nev)
      if (!a) el.push(`a MAGBÓL hiányzik a(z) ${nev} — az őrszem vak lett, nézd át`)
      else if (!b) el.push(`a DESKTOPBÓL hiányzik a(z) ${nev}`)
      else if (a !== b) el.push(`a(z) ${nev} SZÉTHÚZOTT a mag és a desktop között`)
    }
    for (const nev of SKALAROK) {
      const a = skalarSor(magNyers, nev)
      const b = skalarSor(desktopForras, nev)
      if (!a) el.push(`a MAGBÓL hiányzik a(z) ${nev} — az őrszem vak lett, nézd át`)
      else if (!b) el.push(`a DESKTOPBÓL hiányzik a(z) ${nev}`)
      else if (a !== b) el.push(`a(z) ${nev} SZÉTHÚZOTT (mag: „${a}", desktop: „${b}")`)
    }
    return el
  }

  const elteresek = masolatElteresek(desktopNyers)
  if (elteresek.length === 0) {
    ok(`G8c a desktop mind a ${OBJEKTUMOK.length + SKALAROK.length} másolt szabálya karakterre egyezik a maggal`)
  } else {
    for (const e of elteresek) fail(`G8c ${e}`)
  }

  // NEGATÍV ASSZERT: egyetlen megváltoztatott szám is bukjon meg.
  const romlottMasolat = desktopNyers.replace("padX: 'clamp(12px, 3cqi, 64px)',", "padX: 'clamp(12px, 5cqi, 64px)',")
  if (romlottMasolat === desktopNyers) {
    fail('G8c negatív asszert: a „módosított másolat" mutáns nem készült el — nézd át')
  } else if (masolatElteresek(romlottMasolat).length > 0) {
    ok('G8c negatív asszert: egyetlen megváltoztatott méret is ELBUKTATJA az összevetést')
  } else {
    fail('G8c negatív asszert: a módosított másolat is átmenne — az összevetés vak')
  }

  // …és a `splashElrendezes` TÖRZSÉT le is futtatjuk.
  const m = desktopNyers.match(
    /function splashElrendezes\(\s*viewportSzelesseg: number,\s*viewportMagassag: number,\s*\): SplashElrendezesFajta \{([\s\S]*?)\n\}/,
  )
  if (!m) {
    fail(
      'G8c nem találom a desktop `splashElrendezes()` függvényét — nélküle a két kliens némán széthúzhat. ' +
        'Ha átnevezted, igazítsd ezt az őrszemet is.',
    )
  } else {
    const desktopValaszto = new Function('viewportSzelesseg', 'viewportMagassag', 'FEKVO_ARANY', 'OSZLOP_MAX_SZELESSEG', m[1])
    let elteres = 0
    for (const [vw, vh] of NEZETEK) {
      const vart = splashElrendezes(vw, vh)
      const kapott = desktopValaszto(vw, vh, FEKVO_ARANY, OSZLOP_MAX_SZELESSEG)
      if (vart !== kapott) {
        fail(`G8c ${vw}×${vh}: a desktop ága „${kapott}", a webé „${vart}" — a két kliens SZÉTHÚZOTT`)
        elteres += 1
      }
    }
    if (elteres === 0) ok(`G8c a desktop ág-választója mind a ${NEZETEK.length} nézetben megegyezik a web magjával`)

    const romlott = new Function(
      'viewportSzelesseg',
      'viewportMagassag',
      'FEKVO_ARANY',
      'OSZLOP_MAX_SZELESSEG',
      m[1].replace('OSZLOP_MAX_SZELESSEG', '1024'),
    )
    const romlottElter = NEZETEK.some(
      ([vw, vh]) => splashElrendezes(vw, vh) !== romlott(vw, vh, FEKVO_ARANY, OSZLOP_MAX_SZELESSEG),
    )
    if (romlottElter) ok('G8c negatív asszert: az elrontott küszöbű desktop-változat ELBUKNA az összevetésen')
    else fail('G8c negatív asszert: az elrontott küszöbű változat is átmenne — az összevetés vak')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// G9 · SZINTAXIS — mindkét komponens fájl elemezhető marad
// ────────────────────────────────────────────────────────────────────────────
// Olcsó, de valódi háló: egy félresikerült csere (rossz zárójel, árva JSX-tag)
// itt azonnal kiderül, nem a build-en.
for (const { nev, file } of KOMPONENSEK) {
  const kod = fs.readFileSync(file, 'utf8')
  const eredmeny = ts.transpileModule(kod, {
    fileName: path.basename(file),
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  })
  const diag = eredmeny.diagnostics ?? []
  if (diag.length === 0) {
    ok(`${nev} szintaxis rendben`)
  } else {
    for (const d of diag) {
      fail(`${nev} szintaxishiba: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`)
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// G10 · WCAG 1.4.4 — EGYETLEN CSS-HOSSZ SEM LEHET VIEWPORT-EGYSÉG
// ────────────────────────────────────────────────────────────────────────────
// A `vw`/`vh`-hoz kötött szöveg a böngésző 200%-os nagyításakor NEM nő, tehát a
// nagyítás hatástalan marad. A konténer-egység (`cqi`/`cqb`) a szülő dobozához
// mér, a doboz pedig a nagyítással együtt nő. A `sizes="100vw"` KIVÉTEL: az nem
// CSS-hossz, hanem a `<img>` forrásválasztó attribútuma.
{
  function viewportEgysegek(nyers) {
    const kod = kommentMentes(nyers).replace(/sizes="[^"]*"/g, '')
    const talalatok = kod.match(/[\d.]\s*(vw|vh|vmin|vmax|dvh|svh|lvh|dvw|svw|lvw)\b/g) ?? []
    return [...new Set(talalatok.map(t => t.trim()))]
  }

  const FAJLOK = [
    { nev: 'mag    ', file: FORRAS },
    { nev: 'web    ', file: WEB_KOMPONENS },
    { nev: 'desktop', file: DESKTOP_KOMPONENS },
  ]
  for (const { nev, file } of FAJLOK) {
    const talalt = viewportEgysegek(fs.readFileSync(file, 'utf8'))
    if (talalt.length === 0) ok(`G10 ${nev}: nincs viewport-egység a CSS-hosszakban (WCAG 1.4.4)`)
    else fail(`G10 ${nev}: VIEWPORT-EGYSÉG maradt a CSS-ben (${talalt.join(', ')}) — a 200%-os nagyítás hatástalan lesz`)
  }

  // NEGATÍV ASSZERT: a mag `cqi`-jeit `vw`-re rontva a mércének buknia kell.
  const magNyers = fs.readFileSync(FORRAS, 'utf8')
  const romlott = magNyers.replace(/cqi/g, 'vw')
  if (romlott === magNyers) {
    fail('G10 negatív asszert: a „cqi → vw" mutáns nem készült el — nézd át')
  } else if (viewportEgysegek(romlott).length > 0) {
    ok('G10 negatív asszert: a `cqi`-ről `vw`-re rontott mag ELBUKIK a mércén')
  } else {
    fail('G10 negatív asszert: a `vw`-re rontott mag is átmenne — a mérce vak')
  }
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nSplash-elrendezés önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nSplash-elrendezés önellenőrzés: minden zöld')
