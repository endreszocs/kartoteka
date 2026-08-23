/**
 * SplashScreen (desktop) — a web `apps/web/components/ui/splash-screen.tsx`
 * pixelpontos portja Tauri-ra (2026-06-11, desktop⇄web paritás; 2026-08-23:
 * fluid elrendezés).
 *
 * Eltérés a webhez képest (csak technikai, vizuálisan azonos):
 *   - `next/image` helyett sima `<img>` (a Vite/Tauri build nem Next.js);
 *     az assetek a `apps/desktop/public`-ból jönnek (Hatter/KEREK/EREK/KARTOTEKA_V3).
 *   - A fontok és a splash-CSS a közös `packages/ui/src/kartoteka.css`-ből
 *     jönnek (self-hosted fontsource) — mindkét kliens ugyanazt tölti.
 *   - Az elrendezés SZABÁLYAI (méret-kifejezések, sormagasságok, ág-választó) a
 *     web `lib/ui/splash-stage-core.ts` magjából vannak IDEMÁSOLVA, mert a
 *     desktop nem tud az `apps/web` fájljaira hivatkozni. Hogy a két példány ne
 *     húzhasson szét NÉMÁN (ez a projekt visszatérő hibaosztálya), a
 *     `scripts/selftest-splash-stage.mjs` G8c őrszeme kiveszi innen ezeket, és
 *     karakterre összeveti a web magjával. Ha itt bármit átírsz, az pirosra vált.
 *
 *
 * Sablon: `Kartotéka-handoff-Splash → Splash.html`.
 *
 * 5-fázisos animáció:
 *   0–20% (s-on)        — háttér fade-in (Hatter.png + vignette + por + napsugarak)
 *   20–40% (s-sides)    — KEREK + EREK egyházkerületi címerek megjelennek
 *   40–60% (s-center)   — KARTOTEKA_V3 logó zoom + halo
 *   60–80% (s-headline) — "✦ Békesség Istentől!" + ornament-line
 *   60–100% (s-text)    — "Egyházi nyilvántartó rendszer" + tagline + loader
 *
 * Reszponzív viselkedés (2026-08-23 óta FLUID, nincs többé `transform: scale()`):
 *   - `szinpad` — vízszintes kompozíció: KEREK · KARTOTÉKA · EREK egy sorban.
 *   - `oszlop`  — álló telefon: a logó fölött a főcím, alatta a két kis címer.
 *   A választás a `splashElrendezes()` magban él (szélesség ÉS képarány alapján).
 *
 * ⚠️ HÁROM SZABÁLY, AMIT NE ÍRJ VISSZA:
 *
 *   1. NINCS FIX 1920×1080-AS SZÍNPAD `transform: scale()`-lel (2026-08-23-ig ez
 *      volt). A skála a legszűkebb tengelyhez igazodott, ezért a szélesebb
 *      tengely kihasználatlan maradt: 1366×625-ön a főcím 55,6 px lett (ma
 *      81,3), 1024×1366-on a látvány a magasság 42%-át használta, ultrawide
 *      3440×1350-en pedig 120 px-es főcímmel TÚLNŐTT a tervezői arányokon.
 *      Ma: `width: min(1920px, 100%)` + `container-type: size` + `clamp()`.
 *
 *   2. A MÉRETEK KONTÉNER-EGYSÉGRE (`cqi`/`cqb`) VANNAK KÖTVE, NEM `vw`/`vh`-ra.
 *      A puszta viewport-egység sérti a WCAG 1.4.4-et (200%-os szöveg-átméretezés):
 *      a `vw`-hez kötött szöveg a böngésző nagyításakor NEM nő. A szabályok a
 *      `lib/ui/splash-stage-core.ts` `SZINPAD_CSS` / `OSZLOP_CSS` konstansaiban
 *      élnek — onnan jönnek ide ÉS onnan méri az önellenőrzés is ugyanazokat.
 *      ⚠️ NE írj ide nyers méretet: két példány némán széthúzna.
 *
 *   3. A HÁTTÉR (Hatter.png + vignette + porszemcsék + napsugarak) a KÜLSŐ,
 *      `fixed inset-0` rétegen él, a tartalom-oszlop ELŐTT. Ez volt Endre
 *      „fekete sáv a splash két oldalán" panaszának a javítása (2026-08-22).
 *      A réteg alapszíne ezért sem fekete többé, hanem a krém `#d8cfba`:
 *      ha a kép valaha nem töltődik be, akkor sem FEKETE sáv marad.
 *
 * Implementáció: az opacity/transform inline `style`-szal kezelt (nem CSS
 * cascade-classszal), így a Tailwind 4 layer-prioritás-konfliktusoktól
 * függetlenül megbízhatóan érvényesül.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

/* ══════════════════════════════════════════════════════════════════════════
 * A WEB MAGJÁBÓL IDEMÁSOLT SZABÁLYOK — `apps/web/lib/ui/splash-stage-core.ts`
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠️ NE ÍRD ÁT ITT. A desktop (Vite/Tauri) nem tud az `apps/web` fájljaira
 *    hivatkozni — nincs közös alias, és egy app-határon átnyúló relatív import
 *    a build-et kockáztatná —, ezért a szabályok itt SZÓ SZERINT meg vannak
 *    ismételve. A `scripts/selftest-splash-stage.mjs` G8c őrszeme kiveszi
 *    ezeket a blokkokat, és KARAKTERRE összeveti a web magjával; ha eltérnek,
 *    pirosra vált. Változtatni tehát a magban kell, és onnan idemásolni.
 * ══════════════════════════════════════════════════════════════════════════ */

const SZINPAD_SZELESSEG = 1920
const FOCIM_SZOVEG = 'Békesség Istentől!'
const ALCIM_SZOVEG = 'Egyházi nyilvántartó rendszer'
const TAGLINE_SZOVEG = 'Hit. Hagyomány. Közösség. Szolgálat.'
const SAV_MAGASSAG = 3
const OSZLOP_MAX_SZELESSEG = 768
const FEKVO_ARANY = 1.3

type SplashElrendezesFajta = 'szinpad' | 'oszlop'

const SOR_MAGASSAG = {
  focim: 1.05,
  csillag: 1,
  alcim: 1.2,
  tagline: 1.3,
  toltesCimke: 1.25,
  pontok: 1.2,
} as const

const SZINPAD_CSS = {
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

const OSZLOP_CSS = {
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

function splashElrendezes(
  viewportSzelesseg: number,
  viewportMagassag: number,
): SplashElrendezesFajta {
  const fekvo = viewportMagassag > 0 && viewportSzelesseg / viewportMagassag >= FEKVO_ARANY
  if (viewportSzelesseg < OSZLOP_MAX_SZELESSEG && !fekvo) return 'oszlop'
  return 'szinpad'
}

/** next/image-kompatibilis minimál `<img>` shim (fill + width/height). */
interface ImageProps {
  src: string
  alt: string
  width?: number
  height?: number
  fill?: boolean
  priority?: boolean
  sizes?: string
  'aria-hidden'?: boolean
  style?: CSSProperties
}

function Image({ src, alt, width, height, fill, priority: _priority, sizes: _sizes, style, ...rest }: ImageProps) {
  const fillStyle: CSSProperties = fill
    ? { position: 'absolute', inset: 0, width: '100%', height: '100%' }
    : {}
  return (
    <img
      src={src}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      draggable={false}
      style={{ ...fillStyle, ...style }}
      {...rest}
    />
  )
}

const SESSION_KEY = 'kartoteka_splash_shown'
const DURATION_MS = 5000
const FADE_DELAY_MS = 5500
const HIDE_DELAY_MS = 6500

const HEADLINE = FOCIM_SZOVEG
const SUBTITLE = ALCIM_SZOVEG
const TAGLINE = TAGLINE_SZOVEG
const LOADER_LABEL = 'Betöltés...'

type Phase = 's-on' | 's-sides' | 's-center' | 's-headline' | 's-text'

const ARANY_VONAL =
  'linear-gradient(90deg, transparent, #cda454 35%, #b48a3b 50%, #cda454 65%, transparent)'

/**
 * A telefonos bevágás / home-indikátor miatti biztonsági sáv. FEKVŐ tájolásban a
 * bevágás OLDALRA vándorol, ezért mind a négy oldal kell — nem elég a felső.
 */
const BIZTONSAGI_SAV: CSSProperties = {
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  paddingLeft: 'env(safe-area-inset-left, 0px)',
  paddingRight: 'env(safe-area-inset-right, 0px)',
}

/**
 * A `container-type: size` keret: ehhez mér minden `cqi`/`cqb` a tartalomban.
 * ⚠️ A keret SAJÁT stílusában nem szabad `cqi`/`cqb`-t használni (az a SZÜLŐ
 *    konténerhez mérne) — a belső oszlop viszont már nyugodtan használhatja.
 */
const KONTENER: CSSProperties = {
  width: `min(${SZINPAD_SZELESSEG}px, 100%)`,
  height: '100%',
  marginInline: 'auto',
  containerType: 'size',
}

function useSplashElrendezes(): SplashElrendezesFajta {
  const [fajta, setFajta] = useState<SplashElrendezesFajta>('szinpad')
  useEffect(() => {
    function update() {
      setFajta(splashElrendezes(window.innerWidth, window.innerHeight))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])
  return fajta
}

function useSplashLifecycle() {
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)
  const [phases, setPhases] = useState<Set<Phase>>(new Set())
  const [progress, setProgress] = useState(0)
  const startRef = useRef(0)

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return

    setVisible(true)
    startRef.current = performance.now()

    const D = DURATION_MS
    const t1 = setTimeout(() => setPhases(p => new Set(p).add('s-on')), 80)
    const t2 = setTimeout(() => setPhases(p => new Set(p).add('s-sides')), D * 0.2)
    const t3 = setTimeout(() => setPhases(p => new Set(p).add('s-center')), D * 0.4)
    const t4 = setTimeout(() => setPhases(p => new Set(p).add('s-headline')), D * 0.6)
    const t5 = setTimeout(() => setPhases(p => new Set(p).add('s-text')), D * 0.65)

    const startAt = D * 0.6
    const endAt = D * 0.98
    let raf = 0
    function tick() {
      const now = performance.now() - startRef.current
      if (now < startAt) {
        setProgress(0)
      } else if (now > endAt) {
        setProgress(100)
      } else {
        setProgress(((now - startAt) / (endAt - startAt)) * 100)
      }
      if (now < D) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const fadeTimer = setTimeout(() => setFading(true), FADE_DELAY_MS)
    const hideTimer = setTimeout(() => {
      setVisible(false)
      sessionStorage.setItem(SESSION_KEY, '1')
    }, HIDE_DELAY_MS)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
      clearTimeout(t5)
      cancelAnimationFrame(raf)
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [])

  return { visible, fading, phases, progress }
}

export function SplashScreen() {
  const fajta = useSplashElrendezes()
  const { visible, fading, phases, progress } = useSplashLifecycle()

  if (!visible) return null
  if (fajta === 'oszlop') {
    return <MobileSplash fading={fading} phases={phases} progress={progress} />
  }
  return <StageSplash fading={fading} phases={phases} progress={progress} />
}

// ──────────────────────────────────────────────────────────────────────
// StageSplash — vízszintes kompozíció (címer · logó · címer), FLUID
// ──────────────────────────────────────────────────────────────────────

interface SplashAgProps {
  fading: boolean
  phases: Set<Phase>
  progress: number
}

function StageSplash({ fading, phases, progress }: SplashAgProps) {
  const onPhase = useMemo(() => phases.has('s-on'), [phases])
  const sidesPhase = useMemo(() => phases.has('s-sides'), [phases])
  const centerPhase = useMemo(() => phases.has('s-center'), [phases])
  const headlinePhase = useMemo(() => phases.has('s-headline'), [phases])
  const textPhase = useMemo(() => phases.has('s-text'), [phases])

  const S = SZINPAD_CSS

  return (
    <div
      className="fixed inset-0 z-50"
      style={{
        // ⛔ 2026-08-22 — „a splash két oldalán fekete sáv marad" (Endre).
        // A réteg alapszíne korábban `#0d0a07` (majdnem fekete) volt, és a
        // látvány körüli területet ez festette ki. Ma a réteget a HÁTTÉRFOTÓ
        // fedi (lásd rögtön lentebb), ez a szín pedig már csak a kép betöltése
        // előtti/melletti fallback — ezért KRÉM, nem fekete.
        background: '#d8cfba',
        overflow: 'hidden',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
        opacity: fading ? 0 : 1,
        transition: 'opacity 700ms ease-in',
      }}
    >
      {/*
        ⛔ A HÁTTÉR-RÉTEG A TARTALOM-OSZLOPON KÍVÜL VAN — EZ A FEKETE SÁV JAVÍTÁSA.
        Amíg a háttérkép a `transform: scale()`-elt színpadon BELÜL élt, vele
        együtt zsugorodott, és nem ért a viewport széléig: 2000×950-en 156
        képpont, 1536×730-on 119, ultrawide 3440×1350-en 520, tablet álló
        820×1180-on 359 képpont maradt fedetlenül. Itt, a `fixed inset-0`
        rétegen az `objectFit: cover` a TELJES viewportot fedi minden
        képernyőarányon. (A `sizes="100vw"` azért kell, hogy a Next.js a
        viewport szélességéhez válasszon forrást, ne a régi, fix `1920px`-hez.)
      */}
      <Image
        src="/Hatter.png"
        alt=""
        fill
        priority
        aria-hidden
        sizes="100vw"
        style={{
          objectFit: 'cover',
          objectPosition: '50% 42%',
          transform: onPhase ? 'scale(1)' : 'scale(1.04)',
          opacity: onPhase ? 1 : 0,
          transition: 'opacity 1.1s cubic-bezier(.2,.7,.2,1), transform 6s cubic-bezier(.2,.7,.2,1)',
        }}
      />

      {/* Vignette — szintén a rétegen, hogy a teljes képernyőn egységes legyen */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse 70% 55% at 50% 50%, rgba(255,246,222,.18) 0%, rgba(255,246,222,0) 60%), radial-gradient(ellipse 100% 80% at 50% 40%, rgba(0,0,0,0) 55%, rgba(38,30,18,.32) 100%)',
          opacity: onPhase ? 1 : 0,
          transition: 'opacity 1.4s ease-out',
        }}
      />

      {/* Por- / fényszemcsék */}
      <div
        aria-hidden
        className="kt-splash-motes-anim"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage:
            'radial-gradient(circle at 12% 80%, rgba(255,240,210,.45) 0 1.2px, transparent 2px), radial-gradient(circle at 78% 22%, rgba(255,240,210,.35) 0 1px, transparent 2px), radial-gradient(circle at 55% 70%, rgba(255,240,210,.5) 0 1.4px, transparent 2px), radial-gradient(circle at 33% 35%, rgba(255,240,210,.3) 0 1px, transparent 2px), radial-gradient(circle at 88% 65%, rgba(255,240,210,.4) 0 1.1px, transparent 2px)',
          backgroundSize: '1200px 800px',
          opacity: onPhase ? 0.9 : 0,
          transition: 'opacity 2s ease-out',
        }}
      />

      {/* Napsugarak */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '-10%',
          left: '50%',
          width: '90%',
          height: '70%',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
          background:
            'conic-gradient(from 180deg at 50% 0%, rgba(255,236,196,0) 0deg, rgba(255,236,196,0) 70deg, rgba(255,238,200,.18) 85deg, rgba(255,242,210,.32) 90deg, rgba(255,238,200,.18) 95deg, rgba(255,236,196,0) 110deg, rgba(255,236,196,0) 360deg)',
          filter: 'blur(14px)',
          opacity: onPhase ? 0.55 : 0,
          transition: 'opacity 1.6s ease-out',
        }}
      />

      {/*
        ⛔ 2026-08-23 — FLUID TARTALOM-OSZLOP a fix 1920×1080-as, `scale()`-elt
        színpad HELYETT. A régi színpad LAYOUT-doboza 1920×1080 maradt (a
        kicsinyítést a `transform` végezte, ami a layout-méretet nem változtatja),
        és a legszűkebb tengelyhez igazodott — ezért alacsony laptop-ablakban és
        álló tableten a tartalom feleslegesen kicsi volt, ultrawide-on pedig
        túlnőtt. Itt nincs `scale()`: a doboz maga alkalmazkodik, a méreteket a
        `clamp()` + konténer-egységek adják.
      */}
      <div style={{ position: 'absolute', inset: 0, boxSizing: 'border-box', ...BIZTONSAGI_SAV }}>
        <div style={KONTENER}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              height: '100%',
              paddingTop: S.padY,
              paddingBottom: S.padY,
              paddingLeft: S.padX,
              paddingRight: S.padX,
              gap: S.res,
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
          >
            {/* Headline */}
            <div
              style={{
                flex: '0 0 auto',
                width: '100%',
                textAlign: 'center',
                transform: headlinePhase ? 'translateY(0)' : 'translateY(-14px)',
                opacity: headlinePhase ? 1 : 0,
                filter: headlinePhase ? 'blur(0)' : 'blur(6px)',
                transition:
                  'opacity 0.9s cubic-bezier(.2,.7,.2,1) 0.1s, transform 0.9s cubic-bezier(.2,.7,.2,1) 0.1s, filter 0.9s ease-out 0.1s',
              }}
            >
              <div
                style={{
                  color: '#b48a3b',
                  fontSize: S.csillag,
                  lineHeight: SOR_MAGASSAG.csillag,
                  marginBottom: S.csillagAlatt,
                  opacity: 0.9,
                  textShadow: '0 1px 0 rgba(255,255,255,.3)',
                }}
              >
                ✦
              </div>
              <h1
                style={{
                  fontFamily: '"Cormorant Garamond", "Cormorant", serif',
                  fontWeight: 500,
                  fontStyle: 'italic',
                  fontSize: S.focim,
                  lineHeight: SOR_MAGASSAG.focim,
                  letterSpacing: '0.5px',
                  color: '#1f2a24',
                  margin: 0,
                  marginBottom: S.focimAlatt,
                  // A modell EGY sorral számol; a `nowrap` teszi ezt igazzá, a
                  // „kifér-e" kérdést pedig az önellenőrzés G1c-je méri.
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                  textShadow: '0 1px 0 rgba(255,255,255,.55), 0 12px 40px rgba(255,235,200,.35)',
                }}
              >
                {HEADLINE}
              </h1>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: S.disz,
                  color: '#b48a3b',
                }}
              >
                <div style={{ height: 1, width: S.diszVonal, background: ARANY_VONAL }} />
                <div
                  style={{
                    width: `calc(${S.disz} / 2)`,
                    height: `calc(${S.disz} / 2)`,
                    borderRadius: '50%',
                    background: '#cda454',
                  }}
                />
                <div
                  style={{
                    width: S.disz,
                    height: S.disz,
                    background: '#b48a3b',
                    transform: 'rotate(45deg)',
                    boxShadow: '0 0 0 2px rgba(180,138,59,.18)',
                  }}
                />
                <div
                  style={{
                    width: `calc(${S.disz} / 2)`,
                    height: `calc(${S.disz} / 2)`,
                    borderRadius: '50%',
                    background: '#cda454',
                  }}
                />
                <div style={{ height: 1, width: S.diszVonal, background: ARANY_VONAL }} />
              </div>
            </div>

            {/* Logósor — KEREK · KARTOTÉKA · EREK */}
            <div
              style={{
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: S.logoRes,
                width: '100%',
              }}
            >
              {/* Bal — KEREK */}
              <div
                style={{
                  flex: '0 0 auto',
                  width: S.cimer,
                  height: S.cimer,
                  display: 'grid',
                  placeItems: 'center',
                  filter: sidesPhase
                    ? 'drop-shadow(0 18px 36px rgba(20,16,8,.25))'
                    : 'drop-shadow(0 16px 30px rgba(20,16,8,.18))',
                  opacity: sidesPhase ? 1 : 0,
                  transform: sidesPhase ? 'translateX(0) scale(1)' : 'translateX(-40px) scale(.94)',
                  transition:
                    'opacity 1s cubic-bezier(.2,.7,.2,1), transform 1s cubic-bezier(.2,.7,.2,1), filter 1s ease',
                }}
              >
                <Image
                  src="/KEREK.png"
                  alt="Királyhágómelléki Református Egyházkerület címere"
                  width={280}
                  height={280}
                  priority
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>

              {/* Közép — KARTOTEKA_V3 */}
              <div
                style={{
                  flex: '0 0 auto',
                  position: 'relative',
                  width: S.kozepLogo,
                  height: S.kozepLogo,
                  display: 'grid',
                  placeItems: 'center',
                  opacity: centerPhase ? 1 : 0,
                  transform: centerPhase ? 'scale(1)' : 'scale(.86)',
                  filter: centerPhase ? 'blur(0)' : 'blur(8px)',
                  transition:
                    'opacity 1.1s cubic-bezier(.2,.7,.2,1), transform 1.1s cubic-bezier(.2,.7,.2,1), filter 1.1s ease-out',
                }}
              >
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    // A halo a logó méretének arányában nő (a régi fix −40 px a
                    // 460 px-es logóhoz képest kb. −8,7%).
                    inset: '-9%',
                    borderRadius: '50%',
                    background:
                      'radial-gradient(circle at 50% 45%, rgba(255,244,210,.85) 0%, rgba(255,238,196,.55) 22%, rgba(255,232,180,.18) 45%, rgba(255,232,180,0) 65%)',
                    filter: 'blur(10px)',
                    zIndex: 1,
                    opacity: centerPhase ? 1 : 0,
                    transition: 'opacity 1.2s ease-out',
                  }}
                />
                <Image
                  src="/KARTOTEKA_V3.png"
                  alt="Kartotéka"
                  width={460}
                  height={460}
                  priority
                  style={{
                    position: 'relative',
                    zIndex: 2,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 24px 50px rgba(20,16,8,.28))',
                  }}
                />
              </div>

              {/* Jobb — EREK. A kép természetes aránya 0,625 (250×400, keskeny/magas),
                  ezért a NÉGYZETES dobozon belül 62,5% széles: így a KEREK-kel
                  optikailag azonos magasságú marad, a doboz pedig szimmetrikus. */}
              <div
                style={{
                  flex: '0 0 auto',
                  width: S.cimer,
                  height: S.cimer,
                  display: 'grid',
                  placeItems: 'center',
                  filter: sidesPhase
                    ? 'drop-shadow(0 18px 36px rgba(20,16,8,.25))'
                    : 'drop-shadow(0 16px 30px rgba(20,16,8,.18))',
                  opacity: sidesPhase ? 1 : 0,
                  transform: sidesPhase ? 'translateX(0) scale(1)' : 'translateX(40px) scale(.94)',
                  transition:
                    'opacity 1s cubic-bezier(.2,.7,.2,1), transform 1s cubic-bezier(.2,.7,.2,1), filter 1s ease',
                }}
              >
                <Image
                  src="/EREK.png"
                  alt="Erdélyi Református Egyházkerület címere"
                  width={175}
                  height={280}
                  priority
                  style={{ width: '62.5%', height: '100%', objectFit: 'contain' }}
                />
              </div>
            </div>

            {/* Alcím + választóvonal + mottó */}
            <div
              style={{
                flex: '0 0 auto',
                width: '100%',
                textAlign: 'center',
                opacity: textPhase ? 1 : 0,
                transform: textPhase ? 'translateY(0)' : 'translateY(6px)',
                transition:
                  'opacity 0.9s cubic-bezier(.2,.7,.2,1) 0.15s, transform 0.9s cubic-bezier(.2,.7,.2,1) 0.15s',
              }}
            >
              <p
                style={{
                  fontFamily: '"Cormorant Garamond", serif',
                  fontWeight: 500,
                  fontSize: S.alcim,
                  lineHeight: SOR_MAGASSAG.alcim,
                  letterSpacing: S.alcimBetukoz,
                  color: '#2f3d34',
                  margin: 0,
                }}
              >
                {SUBTITLE}
              </p>
              <div
                style={{
                  marginTop: S.valasztoMargo,
                  marginBottom: S.valasztoMargo,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  width: S.valasztoSzeles,
                  height: 1,
                  background: 'linear-gradient(90deg, transparent, rgba(180,138,59,.6), transparent)',
                }}
              />
              <p
                style={{
                  fontFamily: '"Inter", sans-serif',
                  fontSize: S.tagline,
                  lineHeight: SOR_MAGASSAG.tagline,
                  fontWeight: 400,
                  letterSpacing: S.taglineBetukoz,
                  textTransform: 'uppercase',
                  color: '#4a5a4f',
                  margin: 0,
                }}
              >
                {TAGLINE}
              </p>
            </div>

            {/* Töltés-jelző */}
            <div
              style={{
                flex: '0 0 auto',
                width: S.savSzelesseg,
                maxWidth: '100%',
                textAlign: 'center',
                opacity: textPhase ? 1 : 0,
                transition: 'opacity 0.9s ease-out 0.25s',
              }}
            >
              <div
                style={{
                  fontFamily: '"Cormorant Garamond", serif',
                  fontStyle: 'italic',
                  fontSize: S.toltesCimke,
                  lineHeight: SOR_MAGASSAG.toltesCimke,
                  color: '#2f3d34',
                  letterSpacing: '1.5px',
                  marginBottom: S.toltesCimkeAlatt,
                }}
              >
                {LOADER_LABEL}
              </div>
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: SAV_MAGASSAG,
                  background: 'rgba(47,93,63,.18)',
                  borderRadius: 999,
                  overflow: 'hidden',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35)',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, #2f5d3f, #4f8e63, #e6c98a)',
                    borderRadius: 999,
                    boxShadow: '0 0 12px rgba(79,142,99,.6)',
                    transition: 'width 0.15s linear',
                  }}
                />
              </div>
              <div
                style={{
                  marginTop: S.pontokFelett,
                  color: 'rgba(47,93,63,.55)',
                  fontSize: S.pontok,
                  lineHeight: SOR_MAGASSAG.pontok,
                  letterSpacing: '8px',
                }}
              >
                ✦ ✦ ✦
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// MobileSplash — álló telefon: egyetlen függőleges oszlop
//
// A vízszintes kompozíció (címer · logó · címer) egy 390 képpont széles
// telefonon nem fér ki egymás mellé, ezért itt a KARTOTÉKA logó alatt,
// kisebb formában áll a két címer: főcím → logó → címerek → szöveg + töltés.
// ⚠️ A méretek ITT IS konténer-egységre (`cqi`/`cqb`) vannak kötve, nem
//    `vw`/`vh`-ra — WCAG 1.4.4 (200%-os szöveg-átméretezés).
// ──────────────────────────────────────────────────────────────────────

function MobileSplash({ fading, phases, progress }: SplashAgProps) {
  const onPhase = useMemo(() => phases.has('s-on'), [phases])
  const sidesPhase = useMemo(() => phases.has('s-sides'), [phases])
  const centerPhase = useMemo(() => phases.has('s-center'), [phases])
  const headlinePhase = useMemo(() => phases.has('s-headline'), [phases])
  const textPhase = useMemo(() => phases.has('s-text'), [phases])

  const O = OSZLOP_CSS

  return (
    <div
      className="fixed inset-0 z-50"
      style={{
        background: '#d8cfba',
        overflow: 'hidden',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
        opacity: fading ? 0 : 1,
        transition: 'opacity 700ms ease-in',
      }}
    >
      {/* Háttérkép (cover) — a tartalom-oszlopon KÍVÜL, a teljes rétegen */}
      <Image
        src="/Hatter.png"
        alt=""
        fill
        priority
        aria-hidden
        sizes="100vw"
        style={{
          objectFit: 'cover',
          objectPosition: '50% 42%',
          transform: onPhase ? 'scale(1)' : 'scale(1.04)',
          opacity: onPhase ? 1 : 0,
          transition:
            'opacity 1.1s cubic-bezier(.2,.7,.2,1), transform 6s cubic-bezier(.2,.7,.2,1)',
        }}
      />

      {/* Vignette */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(255,246,222,.18) 0%, rgba(255,246,222,0) 60%), radial-gradient(ellipse 110% 90% at 50% 40%, rgba(0,0,0,0) 50%, rgba(38,30,18,.36) 100%)',
          opacity: onPhase ? 1 : 0,
          transition: 'opacity 1.4s ease-out',
        }}
      />

      {/* Por- / fényszemcsék */}
      <div
        aria-hidden
        className="kt-splash-motes-anim"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage:
            'radial-gradient(circle at 12% 80%, rgba(255,240,210,.45) 0 1.2px, transparent 2px), radial-gradient(circle at 78% 22%, rgba(255,240,210,.35) 0 1px, transparent 2px), radial-gradient(circle at 55% 70%, rgba(255,240,210,.5) 0 1.4px, transparent 2px), radial-gradient(circle at 33% 35%, rgba(255,240,210,.3) 0 1px, transparent 2px), radial-gradient(circle at 88% 65%, rgba(255,240,210,.4) 0 1.1px, transparent 2px)',
          backgroundSize: '700px 500px',
          opacity: onPhase ? 0.9 : 0,
          transition: 'opacity 2s ease-out',
        }}
      />

      <div style={{ position: 'absolute', inset: 0, boxSizing: 'border-box', ...BIZTONSAGI_SAV }}>
        <div style={KONTENER}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              height: '100%',
              paddingTop: O.padFent,
              paddingBottom: O.padLent,
              paddingLeft: O.padX,
              paddingRight: O.padX,
              gap: O.res,
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
          >
            {/* Főcím ✦ + Békesség Istentől! */}
            <div
              style={{
                flex: '0 0 auto',
                width: '100%',
                textAlign: 'center',
                transform: headlinePhase ? 'translateY(0)' : 'translateY(-10px)',
                opacity: headlinePhase ? 1 : 0,
                filter: headlinePhase ? 'blur(0)' : 'blur(5px)',
                transition:
                  'opacity 0.9s cubic-bezier(.2,.7,.2,1) 0.1s, transform 0.9s cubic-bezier(.2,.7,.2,1) 0.1s, filter 0.9s ease-out 0.1s',
              }}
            >
              <div
                style={{
                  color: '#b48a3b',
                  fontSize: O.csillag,
                  lineHeight: SOR_MAGASSAG.csillag,
                  marginBottom: O.csillagAlatt,
                  opacity: 0.9,
                  textShadow: '0 1px 0 rgba(255,255,255,.3)',
                }}
              >
                ✦
              </div>
              <h1
                style={{
                  fontFamily: '"Cormorant Garamond", "Cormorant", serif',
                  fontWeight: 500,
                  fontStyle: 'italic',
                  fontSize: O.focim,
                  lineHeight: SOR_MAGASSAG.focim,
                  letterSpacing: '0.3px',
                  color: '#1f2a24',
                  margin: 0,
                  marginBottom: O.focimAlatt,
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                  textShadow: '0 1px 0 rgba(255,255,255,.55), 0 8px 24px rgba(255,235,200,.35)',
                }}
              >
                {HEADLINE}
              </h1>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: O.disz,
                  color: '#b48a3b',
                }}
              >
                <div style={{ height: 1, width: O.diszVonal, background: ARANY_VONAL }} />
                <div
                  style={{
                    width: `calc(${O.disz} / 2)`,
                    height: `calc(${O.disz} / 2)`,
                    borderRadius: '50%',
                    background: '#cda454',
                  }}
                />
                <div
                  style={{
                    width: O.disz,
                    height: O.disz,
                    background: '#b48a3b',
                    transform: 'rotate(45deg)',
                    boxShadow: '0 0 0 2px rgba(180,138,59,.18)',
                  }}
                />
                <div
                  style={{
                    width: `calc(${O.disz} / 2)`,
                    height: `calc(${O.disz} / 2)`,
                    borderRadius: '50%',
                    background: '#cda454',
                  }}
                />
                <div style={{ height: 1, width: O.diszVonal, background: ARANY_VONAL }} />
              </div>
            </div>

            {/* Logók — KARTOTÉKA középen, alatta a két címer */}
            <div
              style={{
                flex: '0 0 auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: O.logoRes,
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: O.kozepLogo,
                  height: O.kozepLogo,
                  display: 'grid',
                  placeItems: 'center',
                  opacity: centerPhase ? 1 : 0,
                  transform: centerPhase ? 'scale(1)' : 'scale(.86)',
                  filter: centerPhase ? 'blur(0)' : 'blur(8px)',
                  transition:
                    'opacity 1.1s cubic-bezier(.2,.7,.2,1), transform 1.1s cubic-bezier(.2,.7,.2,1), filter 1.1s ease-out',
                }}
              >
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: '-9%',
                    borderRadius: '50%',
                    background:
                      'radial-gradient(circle at 50% 45%, rgba(255,244,210,.85) 0%, rgba(255,238,196,.55) 22%, rgba(255,232,180,.18) 45%, rgba(255,232,180,0) 65%)',
                    filter: 'blur(8px)',
                    zIndex: 1,
                    opacity: centerPhase ? 1 : 0,
                    transition: 'opacity 1.2s ease-out',
                  }}
                />
                <Image
                  src="/KARTOTEKA_V3.png"
                  alt="Kartotéka"
                  width={460}
                  height={460}
                  priority
                  style={{
                    position: 'relative',
                    zIndex: 2,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 16px 32px rgba(20,16,8,.28))',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: O.cimerRes,
                  opacity: sidesPhase ? 1 : 0,
                  transform: sidesPhase ? 'translateY(0)' : 'translateY(8px)',
                  transition:
                    'opacity 1s cubic-bezier(.2,.7,.2,1), transform 1s cubic-bezier(.2,.7,.2,1)',
                }}
              >
                <div
                  style={{
                    flex: '0 0 auto',
                    width: O.cimer,
                    height: O.cimer,
                    display: 'grid',
                    placeItems: 'center',
                    filter: 'drop-shadow(0 8px 14px rgba(20,16,8,.22))',
                  }}
                >
                  <Image
                    src="/KEREK.png"
                    alt="Királyhágómelléki Református Egyházkerület címere"
                    width={280}
                    height={280}
                    priority
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>
                <div
                  style={{
                    flex: '0 0 auto',
                    width: O.cimer,
                    height: O.cimer,
                    display: 'grid',
                    placeItems: 'center',
                    filter: 'drop-shadow(0 8px 14px rgba(20,16,8,.22))',
                  }}
                >
                  <Image
                    src="/EREK.png"
                    alt="Erdélyi Református Egyházkerület címere"
                    width={175}
                    height={280}
                    priority
                    style={{ width: '62.5%', height: '100%', objectFit: 'contain' }}
                  />
                </div>
              </div>
            </div>

            {/* Alcím + mottó + töltés-jelző */}
            <div
              style={{
                flex: '0 0 auto',
                width: '100%',
                textAlign: 'center',
                opacity: textPhase ? 1 : 0,
                transform: textPhase ? 'translateY(0)' : 'translateY(8px)',
                transition:
                  'opacity 0.9s cubic-bezier(.2,.7,.2,1) 0.15s, transform 0.9s cubic-bezier(.2,.7,.2,1) 0.15s',
              }}
            >
              <p
                style={{
                  fontFamily: '"Cormorant Garamond", serif',
                  fontWeight: 500,
                  fontSize: O.alcim,
                  lineHeight: SOR_MAGASSAG.alcim,
                  letterSpacing: O.alcimBetukoz,
                  color: '#2f3d34',
                  margin: 0,
                }}
              >
                {SUBTITLE}
              </p>
              <div
                style={{
                  marginTop: O.belsoRes,
                  marginBottom: O.belsoRes,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  width: O.valasztoSzeles,
                  height: 1,
                  background: 'linear-gradient(90deg, transparent, rgba(180,138,59,.6), transparent)',
                }}
              />
              <p
                style={{
                  fontFamily: '"Inter", sans-serif',
                  fontSize: O.tagline,
                  lineHeight: SOR_MAGASSAG.tagline,
                  fontWeight: 400,
                  letterSpacing: O.taglineBetukoz,
                  textTransform: 'uppercase',
                  color: '#4a5a4f',
                  margin: 0,
                }}
              >
                {TAGLINE}
              </p>

              <div
                style={{
                  marginTop: O.toltesFelett,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  width: O.savSzelesseg,
                  maxWidth: '100%',
                }}
              >
                <div
                  style={{
                    fontFamily: '"Cormorant Garamond", serif',
                    fontStyle: 'italic',
                    fontSize: O.toltesCimke,
                    lineHeight: SOR_MAGASSAG.toltesCimke,
                    color: '#2f3d34',
                    letterSpacing: '1px',
                    marginBottom: O.toltesCimkeAlatt,
                  }}
                >
                  {LOADER_LABEL}
                </div>
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: SAV_MAGASSAG,
                    background: 'rgba(47,93,63,.18)',
                    borderRadius: 999,
                    overflow: 'hidden',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35)',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: `${progress}%`,
                      background: 'linear-gradient(90deg, #2f5d3f, #4f8e63, #e6c98a)',
                      borderRadius: 999,
                      boxShadow: '0 0 12px rgba(79,142,99,.6)',
                      transition: 'width 0.15s linear',
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: O.pontokFelett,
                    color: 'rgba(47,93,63,.55)',
                    fontSize: O.pontok,
                    lineHeight: SOR_MAGASSAG.pontok,
                    letterSpacing: '6px',
                  }}
                >
                  ✦ ✦ ✦
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
