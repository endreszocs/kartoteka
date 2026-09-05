#!/usr/bin/env node
/**
 * NAPTÁR-GEOMETRIA önellenőrzés (2026-08-22).
 *
 * Mit véd:
 *   - `packages/ui/src/kartoteka.css`  → `.kt-cal--compact` (kis kockás
 *     hónapnaptár) + `.kt-widget--tile.is-2col` (két hasábos széles csempe)
 *     + `.kt-auth-page` magassága
 *   - `apps/web/components/dashboard/program-scheduler.tsx` → a mérés és a
 *     „+N további" csonkolás korlátai
 *   - `packages/ui-app/src/dashboard/UpcomingPrograms.tsx` → a desktop widget
 *     belső görgetésének kikapcsolása
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ MIÉRT VAN EZ A TESZT — A HIBA ÉLESBEN JELENT MEG
 * ════════════════════════════════════════════════════════════════════════════
 * Endre észrevétele: „széles képernyőn a naptár dátumai kicsik, és görgetni
 * kell a modulban". Kimérve: a `.kt-cal--compact` rácsnak KEMÉNY, képpontos
 * felső korlátja volt —
 *
 *     max-width: calc(var(--kt-cell) * 7 + var(--kt-cal-gap) * 6)
 *
 * — ahol a `--kt-cell` FIX 38px volt, egy `@media (min-width: 1280px)` blokk
 * pedig egyenesen 32px-re CSÖKKENTETTE. Két következménye volt:
 *   (1) a rács SOHA nem lett szélesebb ~242 képpontnál, akármekkora is a
 *       csempe, tehát az ablakhoz nem alkalmazkodott;
 *   (2) a NAGYOBB csempe KISEBB naptárat kapott, mint a telefon (32px < 38px).
 *
 * A javítás: a rács kitölti a rendelkezésre álló szélességet (a cellák a
 * `repeat(7, 1fr)` + `aspect-ratio: 1` miatt vele nőnek), a `--kt-cell-max`
 * pedig már csak FELSŐ korlát a sormagasság védelmére; széles csempén pedig a
 * napi agenda a naptár MELLÉ kerül (`is-2col`), így a hely vízszintesen telik meg.
 *
 * A TESZT KÉT SZINTEN ŐRZI EZT:
 *   • SZÖVEGESEN (a kommentek KISZEDÉSÉVEL, hogy egy magyarázó mondat ne adjon
 *     vak zöldet) — a régi, hibás deklarációk nem térhetnek vissza;
 *   • VISELKEDÉSBEN — a CSS-ből KIOLVASOTT paraméterekből modellezzük a
 *     cellaméretet, és a KÖVETKEZMÉNYT mérjük: szélesebb csempe SOSEM adhat
 *     kisebb naptárat.
 *
 * 2026-09-05 (Endre 2. pontja, D8) — CSEMPESOR-ARÁNY:
 *   A `.kt-dash-trio` középső (naptáras) csempéje `1fr 1.1fr 1fr` aránnyal
 *   1920px-en ≈548px volt, így a két hasábos mód (`TWO_COL_MIN`) csak ~2300px-es
 *   ablaknál kapcsolt be. Az új arány (1280px: .85/1.4/.85, 1536px: .8/1.6/.8)
 *   1920px-en ≈772px-et ad. Az ESETEK csempeszélességét a LAYOUT-MODELL számolja
 *   a CSS-ből olvasott fr-arányokból (sidebar 288px + main padding 2×28px +
 *   2×16px rácsköz — dashboard-shell.tsx / sidebar-adaptive-v4.tsx), és a
 *   modellt a régi, kimért számok (321 / 412 / 548) hitelesítik (G5m).
 *   G5   1920px-en a csempe ≥ TWO_COL_MIN → az `is-2col` a VALÓS szélességre kapcsol
 *   G5n  a régi `1fr 1.1fr 1fr` arány visszaírva → a G5 mérce ELBUKIK
 *   T9   `.kt-modal` max-width nem fix px (clamp), a mobil 100%-os szélesség marad
 *
 * NEGATÍV ASSZERTEK (a fájl végén, „N" jelzéssel) — mutánsok, amiknek BUKNIA KELL:
 *   M1  a régi CSS-sorok visszaírása (`--kt-cell: 38px`, a régi `max-width`,
 *       és a `@media (min-width: 1280px) { .kt-cal--compact { --kt-cell: 32px } }`)
 *       → a szöveges ellenőrzéseknek PIROSRA kell váltaniuk;
 *   M2  a régi geometriai szabály újrajátszva → a monotonitás-mérce elbukik
 *       rajta (a nagyobb csempe kisebb cellát kap).
 * Ha ezek valaha zöldet adnának, a teszt vakká vált — nézd át.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const CSS = path.join(REPO_ROOT, 'packages', 'ui', 'src', 'kartoteka.css')
const SCHEDULER = path.join(REPO_ROOT, 'apps', 'web', 'components', 'dashboard', 'program-scheduler.tsx')
const DESKTOP = path.join(REPO_ROOT, 'packages', 'ui-app', 'src', 'dashboard', 'UpcomingPrograms.tsx')

let failed = false
const fail = (msg) => { console.error(`FAIL: ${msg}`); failed = true }
const ok = (msg) => console.log(`OK:   ${msg}`)

for (const f of [CSS, SCHEDULER, DESKTOP]) {
  if (!fs.existsSync(f)) { console.error(`FAIL: hiányzik a fájl: ${f}`); process.exit(1) }
}

// ────────────────────────────────────────────────────────────────────────────
// Segédek
// ────────────────────────────────────────────────────────────────────────────

/** CSS-kommentek kiszedése — a magyarázó szöveg NE adjon vak zöldet. */
function cssKommentNelkul(forras) {
  return forras.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** TS/TSX kommentek kiszedése (blokk, JSX-blokk és sorvégi). */
function tsKommentNelkul(forras) {
  return forras
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/**
 * Egy szabályblokk törzse a szelektor első előfordulásától a záró `}`-ig.
 * (Egyszerű zárójel-számláló — a kommentek ekkor már ki vannak szedve.)
 */
function blokkTorzs(kod, szelektor) {
  const i = kod.indexOf(szelektor)
  if (i < 0) return null
  const nyit = kod.indexOf('{', i + szelektor.length - 1)
  if (nyit < 0) return null
  let melyseg = 0
  for (let j = nyit; j < kod.length; j++) {
    if (kod[j] === '{') melyseg++
    else if (kod[j] === '}') {
      melyseg--
      if (melyseg === 0) return kod.slice(nyit + 1, j)
    }
  }
  return null
}

/** `--valtozo: 12.5px` → 12.5 (az adott törzsön belül). */
function pxErtek(torzs, valtozo) {
  if (torzs == null) return null
  const m = torzs.match(new RegExp(`${valtozo.replace(/[-]/g, '\\-')}\\s*:\\s*([0-9.]+)px`))
  return m ? Number(m[1]) : null
}

const cssNyers = fs.readFileSync(CSS, 'utf8')
const css = cssKommentNelkul(cssNyers)
const schedulerNyers = fs.readFileSync(SCHEDULER, 'utf8')
const scheduler = tsKommentNelkul(schedulerNyers)
const desktop = tsKommentNelkul(fs.readFileSync(DESKTOP, 'utf8'))

// ────────────────────────────────────────────────────────────────────────────
// SZÖVEGES ELLENŐRZÉSEK — a régi, hibás deklarációk nem térhetnek vissza
// ────────────────────────────────────────────────────────────────────────────

/**
 * A szöveges ellenőrzések EGY függvényben, hogy a negatív asszert (M1) a
 * MUTÁLT forráson pontosan ugyanezeket tudja lefuttatni.
 * @returns {string[]} a talált hibák (üres tömb = zöld)
 */
function szovegesEllenorzes(cssKod) {
  const hibak = []
  const alap = blokkTorzs(cssKod, '.kt-cal--compact {')
  if (alap == null) {
    hibak.push('nem találom a `.kt-cal--compact {` blokkot — a teszt vak lett')
    return hibak
  }

  // T1 · a régi, KEMÉNY felső korlát nem térhet vissza
  if (/max-width:\s*calc\(\s*var\(--kt-cell\)\s*\*\s*7/.test(cssKod)) {
    hibak.push(
      'T1: visszatért a KEMÉNY `max-width: calc(var(--kt-cell) * 7 …)` — ' +
        'ettől a rács soha nem lesz szélesebb ~242px-nél (lásd a fájl fejlécét)',
    )
  }
  // T1b · a fix `--kt-cell` (méret, nem korlát) sem térhet vissza
  if (/--kt-cell\s*:/.test(cssKod)) {
    hibak.push('T1b: visszatért a FIX `--kt-cell:` deklaráció (a korlát neve `--kt-cell-max`)')
  }

  // T2 · a felső korlát LÉTEZIK, és érdemben nagyobb a régi 38/32px-nél
  const alapMax = pxErtek(alap, '--kt-cell-max')
  if (alapMax == null) {
    hibak.push('T2: a `.kt-cal--compact` blokkban nincs `--kt-cell-max` — mi fogja meg a sormagasságot?')
  } else if (alapMax < 44) {
    hibak.push(`T2: a .kt-cal--compact felső korlátja ${alapMax}px < 44px — ez már megint zsugorítás`)
  } else if (alapMax > 52) {
    hibak.push(`T2: a felső korlát ${alapMax}px > 52px — a 35rem-es közös sormagasság eltorzul`)
  }

  // T3 · SEHOL (media-blokkban sem) nem eshet a naptár-cella 38px alá
  for (const m of cssKod.matchAll(/--kt-cell(?:-max)?\s*:\s*([0-9.]+)px/g)) {
    if (Number(m[1]) < 38) {
      hibak.push(
        `T3: valahol ${m[1]}px-re állítja a naptár-cellát (< 38px). ` +
          'Pont ez volt a hiba: >=1280px-en 32px-re esett vissza.',
      )
    }
  }

  // T4 · a két hasábos elrendezés megvan
  const ketHasab = blokkTorzs(cssKod, '.kt-widget--tile.is-2col .kt-scroll {')
  if (ketHasab == null || !/display:\s*grid/.test(ketHasab)) {
    hibak.push('T4: nincs `.kt-widget--tile.is-2col .kt-scroll { display: grid }` — a széles csempe nem lesz két hasábos')
  }

  // T5 · a két hasábos állapot NEM kisebb korlátot ad
  const ketHasabCal = blokkTorzs(cssKod, '.kt-widget--tile.is-2col .kt-cal--compact {')
  const ketMax = pxErtek(ketHasabCal, '--kt-cell-max')
  if (ketMax == null) {
    hibak.push('T5: a két hasábos ág nem állít `--kt-cell-max`-ot')
  } else if (alapMax != null && ketMax < alapMax) {
    hibak.push(`T5: a SZÉLESEBB (két hasábos) csempén KISEBB a korlát (${ketMax}px < ${alapMax}px)`)
  } else if (ketMax > 64) {
    hibak.push(`T5: a két hasábos korlát ${ketMax}px > 64px — a csempe magassága elszalad`)
  }

  // T6 · az auth-oldal magassága: 100vh TARTALÉK, utána 100svh
  const auth = blokkTorzs(cssKod, '.kt-auth-page {')
  if (auth == null) {
    hibak.push('T6: nem találom a `.kt-auth-page` blokkot')
  } else {
    const vh = auth.indexOf('min-height: 100vh')
    const svh = auth.indexOf('min-height: 100svh')
    if (vh < 0) hibak.push('T6: eltűnt a `min-height: 100vh` tartalék (régi böngészők)')
    else if (svh < 0) hibak.push('T6: nincs `min-height: 100svh` — a splash utáni auth-oldal újra ugrál')
    else if (svh < vh) hibak.push('T6: a `100svh` a `100vh` ELŐTT áll — a tartalék felülírja a jó értéket')
  }

  // T9 · a program-modál szélessége: clamp() (nagy képernyőn szélesebb), nem fix 480px
  const modal = blokkTorzs(cssKod, '.kt-modal {')
  if (modal == null) {
    hibak.push('T9: nem találom a `.kt-modal {` blokkot')
  } else {
    const mw = modal.match(/max-width:\s*([^;]+);/)
    if (!mw) hibak.push('T9: a `.kt-modal` blokkban nincs max-width')
    else if (/^\s*[0-9.]+px\s*$/.test(mw[1]) && Number(mw[1]) <= 480) {
      hibak.push(`T9: a program-modál fix ${mw[1].trim()} — nagy képernyőn 21 típus 10 sorra tör (cal-ux-2)`)
    }
    if (!/width:\s*100%/.test(modal)) hibak.push('T9: a `.kt-modal` nem `width: 100%` — telefonon nem tölti ki a helyet')
  }

  return hibak
}

for (const h of szovegesEllenorzes(css)) fail(h)
if (!failed) ok('T1–T6 + T9 szöveges ellenőrzések: a régi, kemény cellakorlát nem tért vissza, a modál nem fix 480px')

// T7 · a komponens és a CSS UGYANARRÓL az állapot-osztályról beszél
if (/kt-widget--tile\$\{twoCol \? ' is-2col' : ''\}/.test(scheduler) || /' is-2col'/.test(scheduler)) {
  ok('T7 a program-scheduler ugyanazt az `is-2col` osztályt teszi ki, amit a CSS vár')
} else {
  fail('T7 a program-scheduler NEM teszi ki az `is-2col` osztályt — a CSS két hasábos ága holt kód')
}
if (/new ResizeObserver\(/.test(scheduler)) {
  ok('T7b a csempe szélessége MÉRVE van (ResizeObserver), nem viewport-breakpointból tippelve')
} else {
  fail('T7b eltűnt a ResizeObserver — a csempe szélessége nem mérhető a viewportból (a sor 1280-nál 3 hasábra esik)')
}

// T8 · a desktop widget belső görgetése kikapcsolva
if (/className="card-raised kt-widget kt-widget--flow"/.test(desktop)) {
  ok('T8 a desktop UpcomingPrograms `kt-widget--flow` (nincs 760px plafon + belső görgetés)')
} else {
  fail('T8 a desktop UpcomingPrograms gyökeréről eltűnt a `kt-widget--flow` — visszatért a belső görgetés')
}

// ────────────────────────────────────────────────────────────────────────────
// GEOMETRIA — a KÖVETKEZMÉNYT mérjük, a paraméterek a FORRÁSBÓL jönnek
// ────────────────────────────────────────────────────────────────────────────

const alapTorzs = blokkTorzs(css, '.kt-cal--compact {')
const ketHasabTorzs = blokkTorzs(css, '.kt-widget--tile.is-2col .kt-cal--compact {')
const scrollTorzs = blokkTorzs(css, '.kt-widget--tile .kt-scroll {')
const ketScrollTorzs = blokkTorzs(css, '.kt-widget--tile.is-2col .kt-scroll {')

const cfg = {
  gap: pxErtek(alapTorzs, '--kt-cal-gap'),
  cellaMax: pxErtek(alapTorzs, '--kt-cell-max'),
  cellaMax2col: pxErtek(ketHasabTorzs, '--kt-cell-max'),
  // `.kt-widget--tile .kt-scroll { padding: 8px 14px 2px; }` → 2 × 14px
  scrollPadX: (() => {
    const m = scrollTorzs && scrollTorzs.match(/padding:\s*[0-9.]+px\s+([0-9.]+)px/)
    return m ? Number(m[1]) * 2 : null
  })(),
  // `.kt-widget--tile.is-2col .kt-scroll { gap: 4px 18px; }` → hasábköz
  oszlopKoz: (() => {
    const m = ketScrollTorzs && ketScrollTorzs.match(/gap:\s*[0-9.]+px\s+([0-9.]+)px/)
    return m ? Number(m[1]) : null
  })(),
  // `grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr)`
  frArany: (() => {
    const m = ketScrollTorzs && ketScrollTorzs.match(/grid-template-columns:\s*minmax\(0,\s*([0-9.]*)fr\)\s*minmax\(0,\s*([0-9.]*)fr\)/)
    if (!m) return null
    const bal = m[1] === '' ? 1 : Number(m[1])
    const jobb = m[2] === '' ? 1 : Number(m[2])
    return bal / (bal + jobb)
  })(),
  ketHasabMin: (() => {
    const m = scheduler.match(/const TWO_COL_MIN\s*=\s*([0-9]+)/)
    return m ? Number(m[1]) : null
  })(),
  hiszterezis: (() => {
    const m = scheduler.match(/const TWO_COL_HISZTEREZIS\s*=\s*([0-9]+)/)
    return m ? Number(m[1]) : null
  })(),
}

const hianyzo = Object.entries(cfg).filter(([, v]) => v == null || Number.isNaN(v)).map(([k]) => k)
if (hianyzo.length) {
  fail(`G0: a modell paraméterei nem olvashatók ki a forrásból: ${hianyzo.join(', ')} — a geometriai ellenőrzés vak lenne`)
} else {
  ok(`G0 a modell paraméterei a FORRÁSBÓL: cella<=${cfg.cellaMax}px (1 hasáb) / <=${cfg.cellaMax2col}px (2 hasáb), rés ${cfg.gap}px, küszöb ${cfg.ketHasabMin}px`)

  /**
   * Egy naptár-cella oldalhossza a CSEMPE szélességéből.
   * A rács `repeat(7, 1fr)` + `aspect-ratio: 1`, tehát a cella a hasáb
   * szélességéből következik; a `--kt-cell-max` csak felső korlát.
   */
  function cella(csempeW, kenyszer2col = null) {
    const belso = csempeW - cfg.scrollPadX
    const ket = kenyszer2col == null ? csempeW >= cfg.ketHasabMin : kenyszer2col
    const oszlop = ket ? (belso - cfg.oszlopKoz) * cfg.frArany : belso
    const plafon = ket ? cfg.cellaMax2col : cfg.cellaMax
    return Math.min(plafon, (oszlop - cfg.gap * 6) / 7)
  }

  // G1 · SZÉLESEBB CSEMPE SOSEM AD KISEBB NAPTÁRAT (ez Endre panasza)
  let g1 = true
  let elozo = -Infinity
  let torespont = null
  for (let w = 288; w <= 1400; w++) {
    const c = cella(w)
    if (c + 1e-9 < elozo) { g1 = false; torespont = { w, c, elozo }; break }
    elozo = c
  }
  if (g1) ok('G1 a cellaméret a csempe szélességével MONOTON NŐ (288–1400px), a két hasábos váltásnál sem esik vissza')
  else fail(`G1 a cellaméret VISSZAESIK ${torespont.w}px-es csempénél: ${torespont.c.toFixed(1)}px < ${torespont.elozo.toFixed(1)}px`)

  // G1b · a hiszterézis-sávban (visszaváltáskor) sem eshet a cella az egy
  //       hasábos érték alá — ezért kicsi a holtsáv
  {
    const also = cfg.ketHasabMin - cfg.hiszterezis
    const ketHasabban = cella(also, true)
    const egyHasabban = cella(also, false)
    if (ketHasabban + 0.25 >= egyHasabban) {
      ok(`G1b a hiszterézis-sávban (${also}px) a két hasábos cella ${ketHasabban.toFixed(1)}px >= az egy hasábos ${egyHasabban.toFixed(1)}px`)
    } else {
      fail(
        `G1b a hiszterézis TÚL NAGY: ${also}px-en két hasábban ${ketHasabban.toFixed(1)}px, ` +
          `egy hasábban ${egyHasabban.toFixed(1)}px — visszaváltáskor összemenne a naptár`,
      )
    }
  }

  // ── Valósághű csempeszélességek az irányítópultról ──
  // (a hármas sor 1280px alatt EGY hasáb → a csempe teljes szélességű;
  //  1280 fölött három hasáb → a csempe SZŰKEBB lesz, ezért mérünk, nem
  //  viewportot nézünk)
  //
  // 2026-09-05: a csempe szélessége a LAYOUT-MODELLBŐL, a `.kt-dash-trio`
  // fr-arányait a CSS-ből olvasva — így az arány változása itt azonnal mér.
  const LAYOUT = { sidebar: 288, mainPadX: 28 * 2, trioGap: 16 }

  /** A `@media (min-width: Npx) { … .kt-dash-trio { grid-template-columns: … } }` fr-hármasa. */
  function trioArany(cssKod, minWidth) {
    const re = new RegExp(`@media \\(min-width:\\s*${minWidth}px\\)\\s*\\{[\\s\\S]*?\\.kt-dash-trio\\s*\\{([\\s\\S]*?)\\}`)
    const m = cssKod.match(re)
    if (!m) return null
    const g = m[1].match(/grid-template-columns:\s*minmax\(0,\s*([0-9.]*)fr\)\s*minmax\(0,\s*([0-9.]*)fr\)\s*minmax\(0,\s*([0-9.]*)fr\)/)
    if (!g) return null
    return [1, 2, 3].map((i) => (g[i] === '' ? 1 : Number(g[i])))
  }
  /** A KÖZÉPSŐ (naptáras) csempe szélessége egy adott viewportnál, adott aránnyal. */
  function csempeSzelesseg(viewport, arany) {
    if (viewport < 1280) return viewport - 32 // egy hasáb: teljes szélesség, 16px oldalmargó
    const tartalom = viewport - LAYOUT.sidebar - LAYOUT.mainPadX - 2 * LAYOUT.trioGap
    const [a, b, c] = arany
    return tartalom * (b / (a + b + c))
  }
  const arany1280 = trioArany(css, 1280)
  const arany1536 = trioArany(css, 1536) ?? arany1280
  if (!arany1280) {
    fail('G5: a `.kt-dash-trio` 1280px-es fr-aránya nem olvasható ki a CSS-ből — a csempesor-mérce vak')
  }
  const aranyViewportra = (vp) => (vp >= 1536 ? arany1536 : arany1280) ?? [1, 1, 1]
  const ESETEK = [
    { nev: 'telefon 375px',  csempe: 343, viewport: 375 },
    { nev: 'tablet 768px',   csempe: 720, viewport: 768 },
    { nev: 'laptop 1280px',  csempe: csempeSzelesseg(1280, aranyViewportra(1280)), viewport: 1280 },
    { nev: 'asztali 1536px', csempe: csempeSzelesseg(1536, aranyViewportra(1536)), viewport: 1536 },
    { nev: 'asztali 1920px', csempe: csempeSzelesseg(1920, aranyViewportra(1920)), viewport: 1920 },
  ]
  const asztaliCsempe = ESETEK.find((e) => e.viewport === 1920).csempe

  // G5m · a layout-modell HITELESÍTÉSE: a RÉGI aránnyal a kimért régi számokat adja
  {
    const regi = [1, 1.1, 1]
    const v = [[1280, 321], [1536, 412], [1920, 548]]
    const rossz = v.filter(([vp, mert]) => Math.abs(csempeSzelesseg(vp, regi) - mert) > 2)
    if (rossz.length === 0) ok('G5m a layout-modell a régi `1fr 1.1fr 1fr` aránnyal visszaadja a kimért 321 / 412 / 548px-et')
    else fail(`G5m a layout-modell NEM egyezik a kimért régi számokkal: ${rossz.map(([vp, mert]) => `${vp}px→${csempeSzelesseg(vp, regi).toFixed(0)} (mért ${mert})`).join(', ')}`)
  }

  // G5 · a csempesor-arány (D8): 1920px-en a csempe eléri a két hasábos küszöböt
  if (asztaliCsempe >= cfg.ketHasabMin) {
    ok(`G5 1920px-es ablakban a naptár-csempe ${asztaliCsempe.toFixed(0)}px >= ${cfg.ketHasabMin}px — az \`is-2col\` a VALÓS szélességre kapcsol`)
  } else {
    fail(`G5 1920px-es ablakban a naptár-csempe csak ${asztaliCsempe.toFixed(0)}px < ${cfg.ketHasabMin}px — a két hasábos mód nagy monitoron sem kapcsol be (D8)`)
  }
  // G5n · negatív: a RÉGI arány visszaírva a mérce ELBUKIK
  {
    const regiAsztali = csempeSzelesseg(1920, [1, 1.1, 1])
    if (regiAsztali < cfg.ketHasabMin) ok(`G5n negatív asszert: a régi aránnyal ${regiAsztali.toFixed(0)}px < ${cfg.ketHasabMin}px — a G5 mérce elbukna rajta`)
    else fail(`G5n negatív asszert: a régi arány is átmenne a G5 mércén (${regiAsztali.toFixed(0)}px) — a mérce nem mér semmit`)
  }

  // G2 · a nagy képernyő NEM kaphat kisebb naptárat a telefonnál
  {
    const telefon = cella(343)
    const asztali = cella(asztaliCsempe)
    if (asztali >= telefon) ok(`G2 asztali (${asztali.toFixed(1)}px) >= telefon (${telefon.toFixed(1)}px)`)
    else fail(`G2 az ASZTALI naptár kisebb a telefonénál (${asztali.toFixed(1)}px < ${telefon.toFixed(1)}px) — ez volt a bejelentett hiba`)
  }

  // G3 · a bejelentett két nézetben érdemi a javulás (a régi 32px helyett >=44px)
  for (const e of ESETEK.filter((x) => x.viewport >= 1280)) {
    const c = cella(e.csempe)
    if (c >= 44) ok(`G3 ${e.nev}: ${c.toFixed(1)}px cella (a régi 32px helyett)`)
    else fail(`G3 ${e.nev}: csak ${c.toFixed(1)}px cella — a régi 32px-hez képest ez nem érdemi javulás`)
  }

  // G4 · MOBIL ÉRINTŐFELÜLET: a legszűkebb valós csempén sem eshet 32px alá
  {
    const legszukebb = 288 // 320px-es telefon − 32px oldalmargó
    const c = cella(legszukebb)
    if (c >= 32) ok(`G4 a legszűkebb csempén (288px) is ${c.toFixed(1)}px a cella (>=32px érintőfelület)`)
    else fail(`G4 a legszűkebb csempén ${c.toFixed(1)}px a cella — az érintőfelület 32px alá esett`)
  }

  // ──────────────────────────────────────────────────────────────────────
  // N · NEGATÍV ASSZERTEK — a mércének BUKNIA KELL a régi viselkedésen
  // ──────────────────────────────────────────────────────────────────────

  /** A RÉGI szabály újrajátszva (fix cella + viewport-függő zsugorítás). */
  function regiCella(csempeW, viewportW) {
    const cellaFix = viewportW >= 1280 ? 32 : 38
    const gap = viewportW >= 1280 ? 3 : 4
    const racsMax = cellaFix * 7 + gap * 6
    const racs = Math.min(csempeW - 28, racsMax)
    return (racs - gap * 6) / 7
  }

  // M2 · a G2 mércéje ELBUKNA a régi szabályon
  {
    const regiTelefon = regiCella(343, 375)
    const regiAsztali = regiCella(627, 1920)
    if (regiAsztali < regiTelefon) {
      ok(
        `M2 negatív asszert: a RÉGI szabály tényleg kisebb naptárat adott asztalin ` +
          `(${regiAsztali.toFixed(1)}px < ${regiTelefon.toFixed(1)}px) — a G2 mérce elbukna rajta`,
      )
    } else {
      fail(
        `M2 negatív asszert: a régi szabály NEM bukik a G2 mércén ` +
          `(asztali ${regiAsztali.toFixed(1)}px >= telefon ${regiTelefon.toFixed(1)}px) — a mérce nem mér semmit`,
      )
    }
    // A régi rács szélessége ~242px-nél megállt, akármekkora a csempe
    const regiRacs = Math.min(627 - 28, 32 * 7 + 3 * 6)
    if (regiRacs <= 242) ok(`M2b negatív asszert: a régi rács 1920px-en is csak ${regiRacs}px széles volt`)
    else fail(`M2b negatív asszert: a régi rács ${regiRacs}px — nem ez volt a hiba, nézd át a modellt`)
  }
}

// M1 · a régi CSS-sorok visszaírása → a szöveges ellenőrzésnek pirosnak kell lennie
{
  const mutans = css.replace(
    /\.kt-cal--compact \{/,
    '.kt-cal--compact {\n  --kt-cell: 38px;\n  max-width: calc(var(--kt-cell) * 7 + var(--kt-cal-gap) * 6);',
  ) + '\n@media (min-width: 1280px) {\n  .kt-cal--compact { --kt-cell: 32px; --kt-cal-gap: 3px; }\n}\n'
  const hibak = szovegesEllenorzes(mutans)
  const kellene = ['T1:', 'T1b:', 'T3:']
  const hianyzik = kellene.filter((k) => !hibak.some((h) => h.startsWith(k)))
  if (hianyzik.length === 0) {
    ok(`M1 negatív asszert: a régi CSS-sorok visszaírására a teszt PIROSRA vált (${hibak.length} hiba)`)
  } else {
    fail(
      `M1 negatív asszert: a mutáns (régi \`--kt-cell\` + kemény max-width + 1280-as zsugorítás) NEM bukott el ` +
        `a következő ellenőrzéseken: ${hianyzik.join(', ')} — a szöveges őrszem vakká vált`,
    )
  }
}

if (failed) {
  console.error('\nNaptár-geometria önellenőrzés: HIBA')
  process.exit(1)
}
console.log('\nNaptár-geometria önellenőrzés: minden zöld')
