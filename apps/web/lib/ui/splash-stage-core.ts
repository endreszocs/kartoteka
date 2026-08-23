/**
 * A splash ELRENDEZÉSÉNEK GEOMETRIÁJA — import-mentes mag.
 *
 * MIÉRT KÜLÖN FÁJL: a `components/ui/splash-screen.tsx` `'use client'` és React-et
 * importál, ezért önmagában nem tesztelhető. Ez a mag tiszta matematika, és a
 * `scripts/selftest-splash-stage.mjs` ezt fordítja/futtatja. Ugyanaz a minta, mint
 * a `finance-scope-core.ts` / `module-scope-core.ts` esetében.
 *
 * ⛔ MIÉRT VAN EGYÁLTALÁN ŐRSZEM EGY SPLASH-EN — NÉGY, EGYMÁSRA RAKÓDOTT HIBA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * (1) IGAZÍTÁS (2026-08-22 délelőtt, Endre bejelentése). A réteg
 *     `place-items: center`-rel igazított, a színpad LAYOUT-doboza viszont
 *     1920×1080 marad (a kicsinyítést a `transform: scale()` végzi, ami a
 *     layout-méretet nem változtatja). Laptopon ez a doboz nagyobb a rétegnél,
 *     a középre igazítás negatív pozíciót adna, a böngésző pedig a túllógó
 *     rács-elemet a kezdőélre kapcsolja — így a doboz közepe elcsúszik a
 *     képernyő közepétől, és a `scale` már félre landol.
 *
 * (2) VÁGÁS. A „kitölt és vág" (`Math.max`) mód a böngésző-viewportnál — ami
 *     laptopon szinte mindig szélesebb a 16:9-nél, mert a böngésző fejléce
 *     függőlegesen eszik — gyakorlatilag MINDIG függőlegesen vágott, pont ott,
 *     ahol a főcím van.
 *
 * (3) FEKETE SÁV (2026-08-22 délután, Endre bejelentése: „bejelentkezés előtt a
 *     splash két oldalán fekete sáv marad"). Ez a (2) javításának az ÁRA volt:
 *     amint a színpad „minden látszik" módba váltott, oldalt/fent maradt hely —
 *     és mivel a HÁTTÉRKÉP a színpadon BELÜL élt, együtt zsugorodott a
 *     tartalommal, a maradékot pedig a külső réteg majdnem fekete `#0d0a07`
 *     alapszíne festette ki. Kimért sávok: 2000×950 → 156 px oldalt,
 *     1536×730 → 119 px, ultrawide 3440×1350 → 520 px, tablet álló
 *     820×1180 → 359 px fent és lent.
 *
 *     → A JAVÍTÁS NEM A SKÁLÁBAN VAN, hanem a RÉTEGRENDBEN: a háttérkép (+
 *       vignette, porszemcsék, napsugarak) fölkerült a külső, `fixed inset-0`
 *       rétegre, teljes szélességben (`objectFit: cover`). Így a színpad körüli
 *       terület már nem fekete, hanem MAGA A HÁTTÉRFOTÓ — nincs mit „kitölteni".
 *       Ezt méri a lenti `splashHatterSav`, ezt őrzi a G6/G6b. EZ VÁLTOZATLAN.
 *
 * (4) A TARTALOM FELESLEGESEN KICSI (2026-08-23, Endre eredeti kérése: „bármekkora
 *     legyen is a képernyő […] tökéletesen passzoljon! Készítsd fel mindenre!").
 *     A (3) után a sáv eltűnt, DE a színpad továbbra is egy FIX 1920×1080-as
 *     doboz maradt, amit a `transform: scale()` kicsinyít. A skála a LEGSZŰKEBB
 *     tengelyhez igazodik, ezért a szélesebb tengely kihasználatlan marad:
 *
 *       · 1366×625  → skála 0,579 → a főcím 55,6 px, a tartalom 1111 px széles
 *                     egy 1366 px széles ablakban (255 px üresen áll);
 *       · 1280×600  → skála 0,556 → főcím 53,3 px;
 *       · 1024×1366 (tablet álló) → skála 0,533 → a látvány 1024×576, a képernyő
 *                     1366 magas: a tartalom a magasság 42%-át használja;
 *       · 3440×1350 (ultrawide) → skála 1,25 → a főcím 120 px, a tartalom
 *                     2400 px széles: TÚLNŐ a tervezői arányokon.
 *
 *     → A JAVÍTÁS: a fix színpad + `scale()` helyett FLUID elrendezés. A tartalom
 *       függőleges flex-oszlop `width: min(1920px, 100%)` + `margin-inline: auto`
 *       + `container-type: size` kerettel, a méretek pedig `clamp()`-pel, a
 *       KONTÉNER-egységekre (`cqi` = inline méret, `cqb` = blokk méret) kötve.
 *
 *     ⚠️ MIÉRT NEM `vw`/`vh`: a puszta viewport-egység sérti a WCAG 1.4.4-et
 *        (200%-os szöveg-átméretezés) — a `vw`-hez kötött szöveg a böngésző
 *        nagyításakor NEM nő. A konténer-egység a szülő dobozához mér, a doboz
 *        pedig a nagyítással együtt nő, tehát a nagyítás érvényesül.
 *
 *     ⚠️ MIÉRT VAN BLOKK-TENGELYŰ PLAFON is (`min(..., 26cqb)` stb.): pusztán
 *        `cqi`-re kötve egy alacsony laptop-ablakban (1366×625) a címerek és a
 *        főcím kilógnának függőlegesen. Minden magas elem kap `min(..., N cqb)`
 *        plafont — ez az, ami a régi `scale()` „legszűkebb tengely" logikáját
 *        pótolja, de CSAK a magas elemekre, nem az egész kompozícióra.
 *
 *     ℹ️ BÖNGÉSZŐ-IGÉNY: a `container-type` + `cqi`/`cqb` Chrome 105 / Safari 16 /
 *        Firefox 110 óta él (2022 ősz – 2023 eleje), tehát minden karbantartott
 *        böngészőben. A desktop (Tauri) a Windows evergreen WebView2-jét, azaz
 *        friss Chromiumot használ. Ha valaha mégis régebbi böngésző kerülne elő:
 *        a splash a `overflow: hidden` miatt akkor sem tud kilógni a képernyőről,
 *        csak a méretezés lenne alapértelmezett — és 5 másodperc múlva eltűnik.
 *
 * ⛔ MI MARADT MEG A RÉGI MAGBÓL, ÉS MIÉRT
 * ═══════════════════════════════════════════════════════════════════════════
 * A `splashStageScale`, a `focimKepernyoY` és a `SZINPAD_MAGASSAG` MÁR NEM
 * VEZÉRLI A FELÜLETET (`@deprecated`), de NEM töröltük: az önellenőrzés NEGATÍV
 * ASSZERTJE ezekkel játssza újra a régi, fix színpados viselkedést, és ezzel
 * bizonyítja, hogy az új mérce meg tudja különböztetni a két állapotot.
 * Ha ezeket törlöd, az őrszem vakká válik.
 */

/* ══════════════════════════════════════════════════════════════════════════
 * 0. RÉGI, FIX SZÍNPAD — CSAK a negatív asszert referenciájaként él tovább
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * A tervezői színpad szélessége. ÚJ SZEREPE: a fluid tartalom-oszlop MAXIMÁLIS
 * szélessége (`width: min(1920px, 100%)`) — ultrawide képernyőn ennél nem nő
 * tovább, hanem középen marad, és a háttérfotó tölti ki a két szélét.
 */
export const SZINPAD_SZELESSEG = 1920

/**
 * @deprecated A fix színpad magassága. A felület már NEM használja (nincs
 * `scale()`), csak a régi viselkedés újrajátszása a negatív asszertben.
 */
export const SZINPAD_MAGASSAG = 1080

/**
 * @deprecated A főcím teteje a RÉGI, fix színpad koordinátarendszerében.
 * Csak a `focimKepernyoY` (negatív asszert) használja.
 */
export const FOCIM_TETEJE = 78

/** A főcím betűmérete a RÉGI, fix színpadon (`fontSize: 96`). */
export const FOCIM_ALAP_MERET = 96

/** Az oldalsó címerek mérete a RÉGI, fix színpadon (280×280). */
export const CIMER_ALAP_MERET = 280

export type SplashViewportMode = 'mobile' | 'tablet' | 'desktop'

export interface SplashStageScale {
  /** A színpadra alkalmazandó nagyítás. */
  skala: number
  /** Melyik szabály döntött (`fill` = pontosan 16:9, egyébként `fit`). */
  mod: 'fill' | 'fit-tablet' | 'fit'
}

/**
 * @deprecated A RÉGI, fix színpad nagyítása egy adott viewportra („minden
 * látszik", contain). A felületet 2026-08-23 óta NEM ez vezérli — helyette a
 * `splashFluidElrendezes` fluid oszlopa. Itt azért maradt, mert az önellenőrzés
 * ezzel játssza újra a régi viselkedést, és bizonyítja, hogy az új mérce
 * megkülönbözteti a két állapotot (a régi 3440×1350-en 120 px-es főcímet ad,
 * ami kilóg az elfogadható 24–96 px-es sávból; 1366×625-ön pedig 55,6 px-et,
 * a fluid 81,3 px-hez képest).
 *
 * ⚠️ NE tedd vissza a `Math.max` („kitölt és vág") ágat — az vágta le a főcímet.
 */
export function splashStageScale(
  viewportSzelesseg: number,
  viewportMagassag: number,
  mode: SplashViewportMode,
): SplashStageScale {
  const sx = viewportSzelesseg / SZINPAD_SZELESSEG
  const sy = viewportMagassag / SZINPAD_MAGASSAG
  const fit = Math.min(sx, sy) // minden látszik

  if (mode === 'tablet') return { skala: fit, mod: 'fit-tablet' }

  const pontosan169 = Math.abs(sx - sy) <= 1e-9
  return { skala: fit, mod: pontosan169 ? 'fill' : 'fit' }
}

/**
 * @deprecated A főcím tetejének képernyő-koordinátája a RÉGI, fix színpadon.
 * Csak a negatív asszert használja.
 */
export function focimKepernyoY(
  viewportMagassag: number,
  skala: number,
): number {
  const latvanyMagassag = SZINPAD_MAGASSAG * skala
  const szinpadTeteje = viewportMagassag / 2 - latvanyMagassag / 2
  return szinpadTeteje + FOCIM_TETEJE * skala
}

/**
 * Hol él a háttérkép a rétegrendben?
 *
 * - `kulso-reteg` — a MAI, helyes felállás: a `fixed inset-0` rétegen, teljes
 *   szélességben. A háttér a viewportot fedi, nem a tartalom-oszlopot.
 * - `szinpadon`   — a RÉGI, hibás felállás: a háttér a `transform: scale()`-lel
 *   kicsinyített színpadon belül volt, ezért vele együtt zsugorodott.
 */
export type SplashHatterHelye = 'kulso-reteg' | 'szinpadon'

/** A háttérkép által NEM fedett sáv szélessége képpontban, oldalanként. */
export interface SplashHatterSav {
  bal: number
  jobb: number
  fent: number
  lent: number
}

/**
 * Mekkora sáv marad a háttérkép mellett egy adott viewportban?
 *
 * Ez az a mérce, amit Endre panasza mér: „a splash két oldalán fekete sáv
 * marad". Amíg a háttér a külső rétegen van, MINDEN nézetben nulla — ezt
 * követeli a G6. A `szinpadon` ág a régi viselkedést játssza újra, hogy a
 * G6b bizonyíthassa: a mérce tud pirosra váltani (2000×950 → ~156 px).
 *
 * ⚠️ A fluid elrendezésre való átállás EZT NEM ÉRINTI: a háttér-réteg
 *    változatlan maradt, ezért a G6/G6b mércéje is változatlan.
 */
export function splashHatterSav(
  viewportSzelesseg: number,
  viewportMagassag: number,
  mode: SplashViewportMode,
  hatterHelye: SplashHatterHelye = 'kulso-reteg',
): SplashHatterSav {
  // A külső rétegen fekvő, `objectFit: cover` háttér mindig a teljes viewportot
  // fedi — bármilyen arányban. A mobil ág mindig is így csinálta.
  if (hatterHelye === 'kulso-reteg' || mode === 'mobile') {
    return { bal: 0, jobb: 0, fent: 0, lent: 0 }
  }

  const { skala } = splashStageScale(viewportSzelesseg, viewportMagassag, mode)
  const latvanySzelesseg = SZINPAD_SZELESSEG * skala
  const latvanyMagassag = SZINPAD_MAGASSAG * skala
  const vizszintes = Math.max(0, (viewportSzelesseg - latvanySzelesseg) / 2)
  const fuggoleges = Math.max(0, (viewportMagassag - latvanyMagassag) / 2)
  return { bal: vizszintes, jobb: vizszintes, fent: fuggoleges, lent: fuggoleges }
}

/* ══════════════════════════════════════════════════════════════════════════
 * 1. CSS-HOSSZ KIÉRTÉKELŐ — a `clamp()` / `min()` / `max()` MÉRHETŐVÉ tétele
 * ══════════════════════════════════════════════════════════════════════════
 *
 * MIÉRT: az előző kör tudatosan kihagyta ezt a fázist, ezzel az indokkal: „a
 * »jól néz-e ki« vizuális kérdés, és én nem látom a rendert". Jogos aggály —
 * ezért a fluid szabályok NEM szóródnak szét a JSX-ben, hanem ITT, egyetlen
 * helyen, SZÖVEGES CSS-kifejezésként élnek. A felület ezeket a sztringeket
 * teszi a `style`-ba, az önellenőrzés pedig UGYANEZEKET a sztringeket értékeli
 * ki számmá — így a „jól néz-e ki" kérdés helyett MÉRHETŐ kérdéseket tehetünk
 * fel: a főcím a képernyőn van-e, kilóg-e a címer, kell-e görgetni.
 */

export interface SplashCqKontextus {
  /** A konténer INLINE (vízszintes) mérete képpontban — az `1cqi` ennek az 1%-a. */
  cqi: number
  /** A konténer BLOKK (függőleges) mérete képpontban — az `1cqb` ennek az 1%-a. */
  cqb: number
  /** A gyökér betűméret; a `rem` ehhez mér. Alapértelmezés: 16. */
  rem?: number
}

function parosZarojel(s: string): boolean {
  let melyseg = 0
  for (const c of s) {
    if (c === '(') melyseg += 1
    else if (c === ')') {
      melyseg -= 1
      if (melyseg < 0) return false
    }
  }
  return melyseg === 0
}

/** Felső szintű (zárójelen kívüli) vesszős darabolás. */
function vesszosDarabok(s: string): string[] {
  const ki: string[] = []
  let melyseg = 0
  let kezdet = 0
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i]
    if (c === '(') melyseg += 1
    else if (c === ')') melyseg -= 1
    else if (c === ',' && melyseg === 0) {
      ki.push(s.slice(kezdet, i))
      kezdet = i + 1
    }
  }
  ki.push(s.slice(kezdet))
  return ki
}

/**
 * Felső szintű összeadás/kivonás. A CSS-ben a `+`/`-` operátort SZÓKÖZ veszi
 * körül (`1rem + 5.2cqi`) — ezt itt megköveteljük, különben egy negatív szám
 * előjelét operátornak néznénk.
 */
function osszegTagok(s: string): { jel: 1 | -1; resz: string }[] {
  const ki: { jel: 1 | -1; resz: string }[] = []
  let melyseg = 0
  let kezdet = 0
  let jel: 1 | -1 = 1
  for (let i = 1; i < s.length - 1; i += 1) {
    const c = s[i]
    if (c === '(') melyseg += 1
    else if (c === ')') melyseg -= 1
    else if (
      (c === '+' || c === '-') &&
      melyseg === 0 &&
      /\s/.test(s[i - 1]) &&
      /\s/.test(s[i + 1])
    ) {
      ki.push({ jel, resz: s.slice(kezdet, i) })
      jel = c === '+' ? 1 : -1
      kezdet = i + 1
    }
  }
  ki.push({ jel, resz: s.slice(kezdet) })
  return ki
}

function hosszErteke(nyers: string, ctx: SplashCqKontextus): number {
  const t = nyers.trim()
  const rem = ctx.rem ?? 16
  const m = t.match(/^(-?\d*\.?\d+)(px|rem|em|cqi|cqb|cqw|cqh|cqmin|cqmax)?$/)
  if (!m) throw new Error(`splash: ismeretlen CSS-hossz: „${nyers}"`)
  const n = Number(m[1])
  switch (m[2]) {
    case 'px':
      return n
    case 'rem':
    case 'em':
      return n * rem
    case 'cqi':
    case 'cqw':
      return (n / 100) * ctx.cqi
    case 'cqb':
    case 'cqh':
      return (n / 100) * ctx.cqb
    case 'cqmin':
      return (n / 100) * Math.min(ctx.cqi, ctx.cqb)
    case 'cqmax':
      return (n / 100) * Math.max(ctx.cqi, ctx.cqb)
    default:
      if (n === 0) return 0
      throw new Error(`splash: mértékegység nélküli hossz: „${nyers}"`)
  }
}

/**
 * Egy CSS-hosszkifejezés értéke képpontban.
 *
 * Támogatja: `clamp()`, `min()`, `max()`, zárójelezést, `+`/`-` összeadást és a
 * `px` / `rem` / `cqi` / `cqb` / `cqmin` / `cqmax` egységeket. Számot változatlanul
 * visszaad (a felületen néhány méret sima szám).
 */
export function cssHossz(kifejezes: string | number, ctx: SplashCqKontextus): number {
  if (typeof kifejezes === 'number') return kifejezes
  const t = kifejezes.trim()

  const fn = t.match(/^(clamp|min|max)\(([\s\S]*)\)$/)
  if (fn && parosZarojel(fn[2])) {
    const args = vesszosDarabok(fn[2]).map(a => cssHossz(a, ctx))
    if (fn[1] === 'clamp') {
      if (args.length !== 3) throw new Error(`splash: a clamp() három argumentumot vár: „${t}"`)
      return Math.max(args[0], Math.min(args[1], args[2]))
    }
    if (args.length === 0) throw new Error(`splash: üres ${fn[1]}(): „${t}"`)
    return fn[1] === 'min' ? Math.min(...args) : Math.max(...args)
  }

  if (t.startsWith('(') && t.endsWith(')') && parosZarojel(t.slice(1, -1))) {
    return cssHossz(t.slice(1, -1), ctx)
  }

  const tagok = osszegTagok(t)
  if (tagok.length > 1) {
    return tagok.reduce((osszeg, tag) => osszeg + tag.jel * cssHossz(tag.resz, ctx), 0)
  }

  return hosszErteke(t, ctx)
}

/* ══════════════════════════════════════════════════════════════════════════
 * 2. A FLUID ELRENDEZÉS SZABÁLYAI — EGYETLEN forrás a felületnek és a mércének
 * ══════════════════════════════════════════════════════════════════════════ */

/** A főcím szövege — a szélesség-becsléshez a HOSSZA is számít. */
export const FOCIM_SZOVEG = 'Békesség Istentől!'
/** Az alcím szövege. */
export const ALCIM_SZOVEG = 'Egyházi nyilvántartó rendszer'
/** A mottó szövege (nagybetűsítve jelenik meg). */
export const TAGLINE_SZOVEG = 'Hit. Hagyomány. Közösség. Szolgálat.'

/**
 * Egy karakter átlagos szélessége a főcím betűméretéhez viszonyítva
 * (Cormorant Garamond, dőlt, vegyes kis- és nagybetű). SZÁNDÉKOSAN nagyvonalú
 * becslés: inkább szélesebbnek mondja a szöveget a valóságosnál, hogy a
 * „kilóg-e" mérce a bizonytalanság rossz oldalán is fogjon.
 */
export const FOCIM_SZELESSEG_ARANY = 0.46

/** Ugyanez az alcímre (Cormorant Garamond, álló) és a mottóra (Inter, NAGYBETŰS). */
export const ALCIM_SZELESSEG_ARANY = 0.5
export const TAGLINE_SZELESSEG_ARANY = 0.62

/**
 * Egy egysoros szöveg becsült szélessége.
 *
 * A FŐCÍMET a felület `white-space: nowrap`-pel rendereli — ott a tördelés
 * felborítaná a magasság-számítást, ezért MÉRNI kell, hogy tényleg kifér (G1c).
 * Az alcím és a mottó viszont tördelődhet: ezeknél a modell a SORSZÁMOT számolja
 * ki (`Math.ceil(szélesség / belső szélesség)`), és a magasságba is beépíti —
 * így a mérce akkor is igazat mond, ha egy keskeny telefonon két sor lesz.
 */
export function becsultSzovegSzelesseg(
  szoveg: string,
  betumeret: number,
  betukoz: number,
  arany: number,
): number {
  return szoveg.length * (arany * betumeret + betukoz)
}

/** Kifejezetten beállított sormagasságok — a felületen ÉS a modellben ugyanezek. */
export const SOR_MAGASSAG = {
  focim: 1.05,
  csillag: 1,
  alcim: 1.2,
  tagline: 1.3,
  toltesCimke: 1.25,
  pontok: 1.2,
} as const

/** A töltés-sáv magassága képpontban (mindkét elrendezésben azonos). */
export const SAV_MAGASSAG = 3

/**
 * A SZÍNPAD-elrendezés (vízszintes kompozíció: címer — logó — címer) fluid
 * méretei. MINDEN érték `cqi`/`cqb` alapú, tehát a KONTÉNERHEZ mér, nem a
 * viewporthoz (WCAG 1.4.4).
 */
export const SZINPAD_CSS = {
  /** Az oszlop vízszintes belső margója. */
  padX: 'clamp(12px, 3cqi, 64px)',
  /** Az oszlop függőleges belső margója. */
  padY: 'clamp(8px, 3.6cqb, 56px)',
  /** A négy blokk közti MINIMÁLIS rés (a `space-between` ennél többet adhat). */
  res: 'clamp(6px, 1.8cqb, 32px)',

  /** ✦ dísz a főcím fölött. */
  csillag: 'clamp(10px, 1.6cqi, 30px)',
  csillagAlatt: 'clamp(3px, 0.6cqb, 10px)',
  /**
   * A FŐCÍM. A `clamp()` a vízszintes tengelyhez köti, a külső `min(..., 13cqb)`
   * pedig alacsony ablakban (1366×625, 844×390) lehúzza — enélkül a főcím a
   * címerek elől enné el a helyet, és görgetni kellene.
   */
  focim: 'min(clamp(2rem, 1rem + 5.2cqi, 6rem), 13cqb)',
  focimAlatt: 'clamp(6px, 1.6cqb, 18px)',
  /** Az ornamentum-sor magasságát a középső rombusz adja. */
  disz: 'clamp(5px, 0.8cqi, 8px)',
  diszVonal: 'clamp(40px, 6.25cqi, 120px)',

  /** Oldalsó címer (négyzetes doboz). Blokk-tengelyű plafonnal. */
  cimer: 'min(clamp(96px, 16cqi, 280px), 26cqb)',
  /** Középső KARTOTÉKA logó. Blokk-tengelyű plafonnal. */
  kozepLogo: 'min(clamp(160px, 26cqi, 460px), 42cqb)',
  logoRes: 'clamp(16px, 4cqi, 60px)',

  alcim: 'clamp(11px, 1.6cqi, 30px)',
  alcimBetukoz: 'clamp(1px, 0.21cqi, 4px)',
  valasztoMargo: 'clamp(4px, 1cqb, 16px)',
  valasztoSzeles: 'clamp(30px, 3.1cqi, 60px)',
  tagline: 'clamp(9px, 0.85cqi, 15px)',
  taglineBetukoz: 'clamp(2px, 0.31cqi, 6px)',

  toltesCimke: 'clamp(12px, 1.2cqi, 22px)',
  toltesCimkeAlatt: 'clamp(4px, 1cqb, 14px)',
  savSzelesseg: 'min(480px, 60cqi)',
  pontok: 'clamp(10px, 1cqi, 18px)',
  pontokFelett: 'clamp(4px, 1cqb, 12px)',
} as const

/**
 * Az OSZLOP-elrendezés (álló telefon: főcím — logó — két kis címer — szöveg)
 * fluid méretei. A régi `MobileSplash` `vw`/`vh`-alapú `clamp()`-jeinek a
 * konténer-egységes megfelelői (WCAG 1.4.4), blokk-tengelyű plafonokkal.
 */
export const OSZLOP_CSS = {
  padX: 'clamp(12px, 6cqi, 48px)',
  padFent: 'clamp(8px, 6cqb, 64px)',
  padLent: 'clamp(8px, 4cqb, 48px)',
  res: 'clamp(8px, 2.5cqb, 24px)',

  csillag: 'min(clamp(14px, 4cqi, 24px), 5cqb)',
  csillagAlatt: 'clamp(3px, 0.8cqb, 6px)',
  focim: 'min(clamp(28px, 9cqi, 56px), 14cqb)',
  focimAlatt: 'clamp(4px, 1.4cqb, 10px)',
  disz: 'clamp(5px, 1.6cqi, 6px)',
  diszVonal: 'clamp(40px, 12cqi, 70px)',

  kozepLogo: 'min(clamp(120px, 50cqi, 240px), 30cqb)',
  logoRes: 'clamp(10px, 2.5cqb, 22px)',
  cimer: 'min(clamp(56px, 18cqi, 96px), 14cqb)',
  cimerRes: 'clamp(20px, 8cqi, 40px)',

  alcim: 'min(clamp(14px, 4.4cqi, 22px), 5cqb)',
  alcimBetukoz: 'clamp(1.5px, 0.5cqi, 3px)',
  belsoRes: 'clamp(4px, 2cqb, 16px)',
  valasztoSzeles: '48px',
  tagline: 'min(clamp(9px, 2.6cqi, 12px), 3cqb)',
  taglineBetukoz: 'clamp(2px, 0.8cqi, 4px)',

  toltesFelett: 'clamp(4px, 2cqb, 16px)',
  toltesCimke: 'min(clamp(12px, 3.6cqi, 18px), 4.5cqb)',
  toltesCimkeAlatt: 'clamp(4px, 1.2cqb, 8px)',
  savSzelesseg: 'min(320px, 80cqi)',
  pontok: 'min(clamp(11px, 3cqi, 14px), 3.5cqb)',
  pontokFelett: 'clamp(4px, 1.2cqb, 8px)',
} as const

/* ══════════════════════════════════════════════════════════════════════════
 * 3. ELRENDEZÉS-VÁLASZTÓ
 * ══════════════════════════════════════════════════════════════════════════ */

export type SplashElrendezesFajta = 'szinpad' | 'oszlop'

/**
 * Melyik kompozíció fér ki ezen a viewporton?
 *
 * - `szinpad` — vízszintes: KEREK címer · KARTOTÉKA logó · EREK címer egy sorban.
 * - `oszlop`  — álló telefon: a logó fölött a főcím, alatta a két kis címer.
 *
 * ⚠️ NEM csak a szélesség dönt. Egy FEKVŐ telefon (667×375) 768 alatt van, de a
 *    függőleges oszlop ott 375 px magasságban nem fér ki — görgetni kellene.
 *    Ilyenkor a vízszintes kompozíció a helyes: alacsony és széles. Ezért a
 *    szabály: oszlop CSAK akkor, ha keskeny ÉS nem fekvő tájolású.
 */
export const OSZLOP_MAX_SZELESSEG = 768
export const FEKVO_ARANY = 1.3

export function splashElrendezes(
  viewportSzelesseg: number,
  viewportMagassag: number,
): SplashElrendezesFajta {
  const fekvo = viewportMagassag > 0 && viewportSzelesseg / viewportMagassag >= FEKVO_ARANY
  if (viewportSzelesseg < OSZLOP_MAX_SZELESSEG && !fekvo) return 'oszlop'
  return 'szinpad'
}

/* ══════════════════════════════════════════════════════════════════════════
 * 4. A KISZÁMÍTOTT ELRENDEZÉS — ezt méri az őrszem
 * ══════════════════════════════════════════════════════════════════════════ */

/** Telefonos bevágás / home-indikátor. Fekvő tájolásban OLDALRA vándorol. */
export interface SplashBiztonsagiSav {
  fent?: number
  lent?: number
  bal?: number
  jobb?: number
}

/** Egy elem képernyő-koordinátái képpontban (a viewport bal felső sarkától). */
export interface SplashDoboz {
  bal: number
  jobb: number
  teteje: number
  alja: number
  szelesseg: number
  magassag: number
}

export interface SplashFluidElrendezes {
  fajta: SplashElrendezesFajta
  /** A `container-type: size` keret mérete — ehhez mér minden `cqi`/`cqb`. */
  containerSzelesseg: number
  containerMagassag: number
  containerBal: number
  containerTeteje: number
  /** A konténer belső margókkal csökkentett szélessége. */
  belsoSzelesseg: number

  /** A főcím számított betűmérete képpontban. */
  focimMeret: number
  /** A főcím SORÁNAK képernyő-doboza (a becsült szövegszélességgel). */
  focim: SplashDoboz

  /** Az oldalsó címer doboz-mérete képpontban. */
  cimerMeret: number
  /** A BAL oldali címer képernyő-doboza (a jobb oldali a tükörképe). */
  cimer: SplashDoboz
  /** A középső KARTOTÉKA logó képernyő-doboza. */
  kozepLogo: SplashDoboz

  /** Az alcím és a mottó becsült egysoros szélessége és a belőle adódó sorszám. */
  alcimSzelesseg: number
  alcimSorok: number
  taglineSzelesseg: number
  taglineSorok: number

  /** A legszélesebb sor (a logósor) szélessége. */
  logosorSzelesseg: number
  /** Padding + blokkok + MINIMÁLIS rések — ennyi hely kell függőlegesen. */
  tartalomMagassag: number
  /** Mennyi hely áll rendelkezésre függőlegesen (viewport − biztonsági sáv). */
  hasznosMagassag: number
  /** Kell-e görgetni? (a `tartalomMagassag` nem fér a `hasznosMagassag`-ba) */
  gorgetes: boolean
}

/** Hány sorba tördelődik egy szöveg a rendelkezésre álló szélességben? */
function sorSzam(szovegSzelesseg: number, belsoSzelesseg: number): number {
  if (!(belsoSzelesseg > 0)) return 1
  return Math.max(1, Math.ceil(szovegSzelesseg / belsoSzelesseg))
}

function doboz(bal: number, teteje: number, szelesseg: number, magassag: number): SplashDoboz {
  return { bal, teteje, szelesseg, magassag, jobb: bal + szelesseg, alja: teteje + magassag }
}

/**
 * Egy adott viewportra kiszámolja a fluid elrendezés MÉRHETŐ geometriáját:
 * a főcím és a címerek méretét és képernyő-koordinátáját, a szükséges
 * függőleges helyet, és azt, hogy kell-e görgetni.
 *
 * A modell a felülettel AZONOS sztringeket (`SZINPAD_CSS` / `OSZLOP_CSS`)
 * értékeli ki, tehát nem a szabály MÁSOLATA, hanem MAGA a szabály — így nem
 * tud némán széthúzni a rendertől.
 *
 * A függőleges elrendezés `display: flex; flex-direction: column;
 * justify-content: space-between; gap: res` — vagyis a `res` a MINIMÁLIS rés,
 * a maradék helyet a `space-between` egyenlően osztja szét a blokkok közt.
 */
export function splashFluidElrendezes(
  viewportSzelesseg: number,
  viewportMagassag: number,
  biztonsagiSav: SplashBiztonsagiSav = {},
): SplashFluidElrendezes {
  const savFent = biztonsagiSav.fent ?? 0
  const savLent = biztonsagiSav.lent ?? 0
  const savBal = biztonsagiSav.bal ?? 0
  const savJobb = biztonsagiSav.jobb ?? 0

  const hasznosSzelesseg = Math.max(0, viewportSzelesseg - savBal - savJobb)
  const hasznosMagassag = Math.max(0, viewportMagassag - savFent - savLent)

  const fajta = splashElrendezes(viewportSzelesseg, viewportMagassag)
  const containerSzelesseg = Math.min(SZINPAD_SZELESSEG, hasznosSzelesseg)
  const containerMagassag = hasznosMagassag
  const containerBal = savBal + (hasznosSzelesseg - containerSzelesseg) / 2
  const containerTeteje = savFent

  const ctx: SplashCqKontextus = { cqi: containerSzelesseg, cqb: containerMagassag }
  const e = (kif: string | number) => cssHossz(kif, ctx)
  const kozepX = containerBal + containerSzelesseg / 2

  if (fajta === 'szinpad') {
    const C = SZINPAD_CSS
    const padX = e(C.padX)
    const padY = e(C.padY)
    const res = e(C.res)
    const belsoSzelesseg = Math.max(0, containerSzelesseg - 2 * padX)

    // ── Blokk 1: főcím (✦ + h1 + ornamentum)
    const csillagMagassag = e(C.csillag) * SOR_MAGASSAG.csillag
    const focimMeret = e(C.focim)
    const focimSor = focimMeret * SOR_MAGASSAG.focim
    const focimBlokk = csillagMagassag + e(C.csillagAlatt) + focimSor + e(C.focimAlatt) + e(C.disz)

    // ── Blokk 2: logósor (címer · logó · címer)
    const cimerMeret = e(C.cimer)
    const kozepMeret = e(C.kozepLogo)
    const logoRes = e(C.logoRes)
    const logoBlokk = Math.max(cimerMeret, kozepMeret)
    const logosorSzelesseg = 2 * cimerMeret + kozepMeret + 2 * logoRes

    // ── Blokk 3: alcím + választóvonal + mottó (mindkét szöveg tördelődhet)
    const alcimSzelesseg = becsultSzovegSzelesseg(
      ALCIM_SZOVEG, e(C.alcim), e(C.alcimBetukoz), ALCIM_SZELESSEG_ARANY,
    )
    const taglineSzelesseg = becsultSzovegSzelesseg(
      TAGLINE_SZOVEG, e(C.tagline), e(C.taglineBetukoz), TAGLINE_SZELESSEG_ARANY,
    )
    const alcimSorok = sorSzam(alcimSzelesseg, belsoSzelesseg)
    const taglineSorok = sorSzam(taglineSzelesseg, belsoSzelesseg)
    const metaBlokk =
      e(C.alcim) * SOR_MAGASSAG.alcim * alcimSorok +
      2 * e(C.valasztoMargo) +
      1 +
      e(C.tagline) * SOR_MAGASSAG.tagline * taglineSorok

    // ── Blokk 4: „Betöltés…" + sáv + ✦ ✦ ✦
    const toltesBlokk =
      e(C.toltesCimke) * SOR_MAGASSAG.toltesCimke +
      e(C.toltesCimkeAlatt) +
      SAV_MAGASSAG +
      e(C.pontokFelett) +
      e(C.pontok) * SOR_MAGASSAG.pontok

    const blokkok = [focimBlokk, logoBlokk, metaBlokk, toltesBlokk]
    const blokkOsszeg = blokkok.reduce((a, b) => a + b, 0)
    const tartalomMagassag = 2 * padY + blokkOsszeg + 3 * res
    const koz = Math.max(res, (containerMagassag - 2 * padY - blokkOsszeg) / 3)

    const focimSzoveg = becsultSzovegSzelesseg(FOCIM_SZOVEG, focimMeret, 0, FOCIM_SZELESSEG_ARANY)
    const focimTeteje = containerTeteje + padY + csillagMagassag + e(C.csillagAlatt)
    const logosorTeteje = containerTeteje + padY + focimBlokk + koz
    const logosorBal = kozepX - logosorSzelesseg / 2

    return {
      fajta,
      containerSzelesseg,
      containerMagassag,
      containerBal,
      containerTeteje,
      belsoSzelesseg,
      focimMeret,
      focim: doboz(kozepX - focimSzoveg / 2, focimTeteje, focimSzoveg, focimSor),
      cimerMeret,
      cimer: doboz(
        logosorBal,
        logosorTeteje + (logoBlokk - cimerMeret) / 2,
        cimerMeret,
        cimerMeret,
      ),
      kozepLogo: doboz(
        logosorBal + cimerMeret + logoRes,
        logosorTeteje + (logoBlokk - kozepMeret) / 2,
        kozepMeret,
        kozepMeret,
      ),
      alcimSzelesseg,
      alcimSorok,
      taglineSzelesseg,
      taglineSorok,
      logosorSzelesseg,
      tartalomMagassag,
      hasznosMagassag,
      gorgetes: tartalomMagassag > hasznosMagassag + 1e-9,
    }
  }

  // ── OSZLOP (álló telefon)
  const C = OSZLOP_CSS
  const padX = e(C.padX)
  const padFent = e(C.padFent)
  const padLent = e(C.padLent)
  const res = e(C.res)
  const belsoSzelesseg = Math.max(0, containerSzelesseg - 2 * padX)

  const csillagMagassag = e(C.csillag) * SOR_MAGASSAG.csillag
  const focimMeret = e(C.focim)
  const focimSor = focimMeret * SOR_MAGASSAG.focim
  const focimBlokk = csillagMagassag + e(C.csillagAlatt) + focimSor + e(C.focimAlatt) + e(C.disz)

  const kozepMeret = e(C.kozepLogo)
  const cimerMeret = e(C.cimer)
  const logoRes = e(C.logoRes)
  const cimerRes = e(C.cimerRes)
  const logoBlokk = kozepMeret + logoRes + cimerMeret
  const cimersorSzelesseg = 2 * cimerMeret + cimerRes
  const logosorSzelesseg = Math.max(kozepMeret, cimersorSzelesseg)

  const alcimSzelesseg = becsultSzovegSzelesseg(
    ALCIM_SZOVEG, e(C.alcim), e(C.alcimBetukoz), ALCIM_SZELESSEG_ARANY,
  )
  const taglineSzelesseg = becsultSzovegSzelesseg(
    TAGLINE_SZOVEG, e(C.tagline), e(C.taglineBetukoz), TAGLINE_SZELESSEG_ARANY,
  )
  const alcimSorok = sorSzam(alcimSzelesseg, belsoSzelesseg)
  const taglineSorok = sorSzam(taglineSzelesseg, belsoSzelesseg)
  const metaBlokk =
    e(C.alcim) * SOR_MAGASSAG.alcim * alcimSorok +
    e(C.belsoRes) +
    1 +
    e(C.belsoRes) +
    e(C.tagline) * SOR_MAGASSAG.tagline * taglineSorok +
    e(C.toltesFelett) +
    e(C.toltesCimke) * SOR_MAGASSAG.toltesCimke +
    e(C.toltesCimkeAlatt) +
    SAV_MAGASSAG +
    e(C.pontokFelett) +
    e(C.pontok) * SOR_MAGASSAG.pontok

  const blokkok = [focimBlokk, logoBlokk, metaBlokk]
  const blokkOsszeg = blokkok.reduce((a, b) => a + b, 0)
  const tartalomMagassag = padFent + padLent + blokkOsszeg + 2 * res
  const koz = Math.max(res, (containerMagassag - padFent - padLent - blokkOsszeg) / 2)

  const focimSzoveg = becsultSzovegSzelesseg(FOCIM_SZOVEG, focimMeret, 0, FOCIM_SZELESSEG_ARANY)
  const focimTeteje = containerTeteje + padFent + csillagMagassag + e(C.csillagAlatt)
  const logoTeteje = containerTeteje + padFent + focimBlokk + koz

  return {
    fajta,
    containerSzelesseg,
    containerMagassag,
    containerBal,
    containerTeteje,
    belsoSzelesseg,
    focimMeret,
    focim: doboz(kozepX - focimSzoveg / 2, focimTeteje, focimSzoveg, focimSor),
    cimerMeret,
    cimer: doboz(
      kozepX - cimersorSzelesseg / 2,
      logoTeteje + kozepMeret + logoRes,
      cimerMeret,
      cimerMeret,
    ),
    kozepLogo: doboz(kozepX - kozepMeret / 2, logoTeteje, kozepMeret, kozepMeret),
    alcimSzelesseg,
    alcimSorok,
    taglineSzelesseg,
    taglineSorok,
    logosorSzelesseg,
    tartalomMagassag,
    hasznosMagassag,
    gorgetes: tartalomMagassag > hasznosMagassag + 1e-9,
  }
}

/**
 * A RÉGI, fix színpados szabály által adott FŐCÍM-méret — a negatív asszert
 * referenciája. `96 × skála`, ahol a skála a legszűkebb tengelyhez igazodik.
 *
 * ⚠️ Ez SZÁNDÉKOSAN a régi viselkedés: az önellenőrzés ezzel bizonyítja, hogy a
 *    fluid mérce meg tudja különböztetni a két állapotot.
 */
export function regiSzinpadFocimMeret(
  viewportSzelesseg: number,
  viewportMagassag: number,
  mode: SplashViewportMode = 'desktop',
): number {
  return FOCIM_ALAP_MERET * splashStageScale(viewportSzelesseg, viewportMagassag, mode).skala
}

/** A RÉGI, fix színpados szabály által adott CÍMER-méret (280 × skála). */
export function regiSzinpadCimerMeret(
  viewportSzelesseg: number,
  viewportMagassag: number,
  mode: SplashViewportMode = 'desktop',
): number {
  return CIMER_ALAP_MERET * splashStageScale(viewportSzelesseg, viewportMagassag, mode).skala
}
