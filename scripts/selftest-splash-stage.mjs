#!/usr/bin/env node
/**
 * SPLASH-SZÍNPAD GEOMETRIA önellenőrzés (2026-08-22).
 *
 * Mit véd: `apps/web/lib/ui/splash-stage-core.ts` — a bejelentkezés előtti
 * fogadóképernyő méretezése, ÉS a `components/ui/splash-screen.tsx` igazítása.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ MIÉRT VAN EZ A TESZT — A HIBA ÉLESBEN JELENT MEG
 * ════════════════════════════════════════════════════════════════════════════
 * Endre laptopon nézte meg a kartoteka.app bejelentkező oldalát, és a splash
 * ELCSÚSZOTT: bal oldalt és fölül fekete sáv, a kép pedig jobbra-lefelé kilógott.
 * Kimérve 1536×730-as nézetben: a színpad +192 képpont jobbra, +108 lefelé, és
 * pontosan ennyi a túllógás a jobb és az alsó szélen.
 *
 * KÉT, EGYMÁSTÓL FÜGGETLEN OKA VOLT — ezért két dolgot is őrzünk:
 *
 *  (1) IGAZÍTÁS. A réteg `display: grid` + `place-items: center` volt, a színpad
 *      LAYOUT-doboza viszont 1920×1080 marad, mert a kicsinyítést a `transform:
 *      scale()` végzi, ami a layout-méretet NEM változtatja meg. Laptopon ez a
 *      doboz nagyobb a rétegnél → a középre igazítás negatív pozíciót adna →
 *      a böngésző a túllógó rács-elemet a KEZDŐÉLRE kapcsolja → a doboz közepe
 *      elcsúszik a képernyő közepétől → a `transform-origin: center center`
 *      körüli kicsinyítés félre landol.
 *      A javítás: abszolút pozíció + `translate(-50%, -50%)`.
 *
 *  (2) VÁGÁS. A „kitölt és vág" (`Math.max`) mód a böngésző-viewportnál —
 *      ami laptopon szinte MINDIG szélesebb a 16:9-nél, mert a böngésző fejléce
 *      függőlegesen eszik — gyakorlatilag mindig FÜGGŐLEGESEN vág, pont ott,
 *      ahol a főcím van. 1536×730-on 67 képpontot vágott egy 864 magas
 *      látványból = 7,75%, a főcím viszont a 7,2%-nál kezdődik: LEVÁGVA.
 *
 * ⚠️ A (2) NEM ÍZLÉSKÉRDÉS: a „Békesség Istentől!" a fogadóképernyő egyetlen
 *    mondanivalója. Ha a teteje lelóg, a képernyő elrontottnak látszik — Endre
 *    bejelentése pontosan így szólt.
 *
 * A TESZT NEM A KÉPLETET ISMÉTLI MEG, hanem a KÖVETKEZMÉNYÉT méri: minden
 * valósághű viewportban a főcím tetejének a képernyőn KELL lennie.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const FORRAS = path.join(REPO_ROOT, 'apps', 'web', 'lib', 'ui', 'splash-stage-core.ts')
const KOMPONENS = path.join(REPO_ROOT, 'apps', 'web', 'components', 'ui', 'splash-screen.tsx')

let failed = false
const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  failed = true
}
const ok = (msg) => console.log(`OK:   ${msg}`)

for (const f of [FORRAS, KOMPONENS]) {
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
const { splashStageScale, focimKepernyoY, MAX_VAGAS, FOCIM_TETEJE, SZINPAD_MAGASSAG } = mag

// ────────────────────────────────────────────────────────────────────────────
// G1 · A FŐCÍM MINDEN VALÓSÁGHŰ NÉZETBEN A KÉPERNYŐN VAN
// ────────────────────────────────────────────────────────────────────────────
// Valódi böngésző-viewportok (nem képernyő-méretek!): a fejléc/könyvjelzősáv
// már le van vonva. Az első három Endre laptop-nagyságrendje.
const NEZETEK = [
  [1536, 730], [1366, 625], [1280, 600], [1440, 780],
  [1920, 940], [1920, 1080], [1600, 900], [2560, 1300],
  [1024, 700], [1024, 500],
]

for (const [vw, vh] of NEZETEK) {
  const { skala, mod } = splashStageScale(vw, vh, 'desktop')
  const y = focimKepernyoY(vh, skala)
  if (y > 0) ok(`G1 ${vw}×${vh} (${mod}): a főcím a képernyőn van (y=${Math.round(y)})`)
  else fail(`G1 ${vw}×${vh} (${mod}): a FŐCÍM LEVÁGVA (y=${Math.round(y)})`)
}

// ────────────────────────────────────────────────────────────────────────────
// G2 · A VALÓDI 16:9 KIJELZŐN MARAD AZ EREDETI, TELJES KÉPERNYŐS ÉLMÉNY
// ────────────────────────────────────────────────────────────────────────────
// A védelem nem lehet olyan szigorú, hogy MINDIG letterboxoljon — akkor a
// tervezői szándékot dobtuk volna el a hiba javítása ürügyén.
for (const [vw, vh] of [[1920, 1080], [1600, 900], [2560, 1440]]) {
  const { skala, mod } = splashStageScale(vw, vh, 'desktop')
  if (mod === 'fill' && Math.abs(skala - vw / 1920) < 1e-9) {
    ok(`G2 ${vw}×${vh}: valódi 16:9 → marad a „kitölt" mód`)
  } else {
    fail(`G2 ${vw}×${vh}: 16:9-en NEM maradt a fill (mod=${mod}, skála=${skala})`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// G3 · TABLET ÁG VÁLTOZATLAN (mindig „minden látszik")
// ────────────────────────────────────────────────────────────────────────────
for (const [vw, vh] of [[900, 700], [1000, 1300]]) {
  const { skala, mod } = splashStageScale(vw, vh, 'tablet')
  const vart = Math.min(vw / 1920, vh / 1080)
  if (mod === 'fit-tablet' && Math.abs(skala - vart) < 1e-9) ok(`G3 ${vw}×${vh}: tablet → letterbox`)
  else fail(`G3 ${vw}×${vh}: a tablet ág elmozdult (mod=${mod})`)
}

// ────────────────────────────────────────────────────────────────────────────
// G4 · NEGATÍV ASSZERT — a teszt tudjon PIROSRA váltani
// ────────────────────────────────────────────────────────────────────────────
// Egy őrszem, ami sosem tud bukni, rosszabb a semminél. Itt újrajátsszuk a
// RÉGI (hibás) szabályt — a tiszta `Math.max`-ot —, és igazoljuk, hogy a G1
// mércéje ELBUKNA rajta. Ha ez az assert valaha zöldre vált, a mérce romlott el.
{
  const [vw, vh] = [1536, 730]
  const regiSkala = Math.max(vw / 1920, vh / 1080)
  const regiY = focimKepernyoY(vh, regiSkala)
  if (regiY <= 0) {
    ok(`G4 negatív asszert: a RÉGI szabály ${vw}×${vh}-on tényleg levágta a főcímet (y=${Math.round(regiY)})`)
  } else {
    fail(
      `G4 negatív asszert: a régi, tiszta Math.max szabály NEM vágja le a főcímet (y=${Math.round(regiY)}) — ` +
        'vagy a FOCIM_TETEJE / focimKepernyoY romlott el, vagy a mérce már nem mér semmit.',
    )
  }
}

// A küszöb tényleg a főcím helyzetéből származik-e (nem kézzel hangolt szám).
{
  const vart = (FOCIM_TETEJE / SZINPAD_MAGASSAG) * 2 * 0.85
  if (Math.abs(MAX_VAGAS - vart) < 1e-12) ok('G4b a vágási küszöb a főcím pozíciójából származik')
  else fail(`G4b a MAX_VAGAS elszakadt a főcím pozíciójától (${MAX_VAGAS} ≠ ${vart})`)
}

// ────────────────────────────────────────────────────────────────────────────
// G5 · AZ IGAZÍTÁS — a komponens NE essen vissza rácsos középre igazításra
// ────────────────────────────────────────────────────────────────────────────
// Ez a hiba (1) fele. A magban nem mérhető (CSS), ezért a komponens forrását
// nézzük — a kommenteket kiszedve, hogy egy magyarázó szöveg ne adjon vak zöldet.
{
  const nyers = fs.readFileSync(KOMPONENS, 'utf8')
  const kod = nyers
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  const stageIdx = kod.indexOf('width: 1920')
  if (stageIdx < 0) {
    fail('G5: nem találom a színpad `width: 1920` deklarációját — a teszt vak lett, nézd át')
  } else {
    const blokk = kod.slice(Math.max(0, stageIdx - 400), stageIdx + 400)
    if (/translate\(-50%,\s*-50%\)/.test(blokk)) {
      ok('G5 a színpad `translate(-50%, -50%)`-kal van középen (nem rácsos igazítással)')
    } else {
      fail(
        'G5 a színpad KÖZÉPRE IGAZÍTÁSA elveszett: nincs `translate(-50%, -50%)` a `width: 1920` közelében. ' +
          'Ha visszakerült a `place-items: center`, a splash laptopon ÚJRA elcsúszik — lásd a fájl fejlécét.',
      )
    }
    // A rácsos igazítás a KÜLSŐ rétegen se térjen vissza.
    const retegIdx = kod.indexOf('fixed inset-0 z-50')
    const reteg = retegIdx >= 0 ? kod.slice(retegIdx, retegIdx + 400) : ''
    if (/placeItems:\s*'center'/.test(reteg)) {
      fail('G5b a külső réteg VISSZAKAPTA a `placeItems: center`-t — ez okozta az eredeti elcsúszást')
    } else {
      ok('G5b a külső rétegen nincs `placeItems: center`')
    }
  }
}

fs.rmSync(tmp, { recursive: true, force: true })

if (failed) {
  console.error('\nSplash-színpad önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nSplash-színpad önellenőrzés: minden zöld')
