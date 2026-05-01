'use client'

/**
 * Onboarding flow — 4 lépéses bevezető wizard (Sprint R F5 · v0.8.4).
 *
 * Származás: a `Kartoteka.html` design-handoff `screens.jsx` `OnboardingScreen`
 * komponensének TSX portja, body-pattern, callback-prop alapú.
 *
 * 4 lépés:
 *   1. Üdvözlés (welcome) — templom kép, „Üdvözöljük a Kartotékában"
 *   2. Gyülekezet (church) — gyülekezet név / egyházkerület / lelkipásztor
 *   3. Adatimport (import) — Excel/CSV import flow demo
 *   4. Kész (done) — pipa, „Belépés a Kartotékába" CTA → onComplete()
 *
 * A bal oldalon végig a téma `--sidebar` színe + Bibliai idézet + központi ikon.
 * A jobb oldalon a step-progress sáv + cím + szöveg + step-specifikus widget +
 * navigáció.
 *
 * Asseteket a caller adja meg `assetBase` prop-pal — default `/onboarding`,
 * amelyet a web `apps/web/public/onboarding/`-ban tárol (27-church.png,
 * 28-bible-rays.png). A 4. lépés (done) SVG pipa, nem külső asset.
 */

import { useCallback, useState } from 'react'

// ──────────────────────────────────────────────────────────────────────
// Konstans: 4 lépés tartalma
// ──────────────────────────────────────────────────────────────────────

interface OnboardingStep {
  art: 'welcome' | 'church' | 'import' | 'done'
  title: string
  lead: string
  body: string
  cta: string
}

const STEPS: OnboardingStep[] = [
  {
    art: 'welcome',
    title: 'Üdvözöljük a Kartotékában',
    lead: 'Korszerű digitális anyakönyv és gyülekezeti nyilvántartó — egy helyen.',
    body: 'A rendszer 24 modult kínál a tagnyilvántartástól az anyakönyvön és pénzügyön át a leltárig. Most pár lépésben beállítjuk a gyülekezetét.',
    cta: 'Kezdjük',
  },
  {
    art: 'church',
    title: 'Gyülekezet beállítása',
    lead: 'Adja meg a gyülekezet nevét és elérhetőségeit.',
    body: 'Ezeket az adatokat a fejléc, a hivatalos dokumentumok és az exportok használják. Bármikor módosíthatja a Beállítások panelben.',
    cta: 'Tovább',
  },
  {
    art: 'import',
    title: 'Adatok importálása',
    lead: 'Hozza át a meglévő nyilvántartását — Excel, CSV vagy korábbi rendszer.',
    body: 'A varázsló segít az oszlopok megfeleltetésében, és minden importot ellenőriz, mielőtt mentené. Most ki is hagyhatja, és később is megteheti.',
    cta: 'Importálás indítása',
  },
  {
    art: 'done',
    title: 'Kész vagyunk',
    lead: 'A Kartotéka indulásra kész.',
    body: 'Megnyitjuk a kezdőlapot. A jobb felső sarokban a beállítások, balra pedig az összes modul közvetlenül elérhető.',
    cta: 'Belépés a Kartotékába',
  },
]

// ──────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────

export interface OnboardingScreenProps {
  /** Kezdő lépés. Default: 0. */
  initialStep?: number
  /** Asset path-ja a templom és Biblia képekhez. Default: `/onboarding`. */
  assetBase?: string
  /** „Belépés a Kartotékába" gomb callback-je (a 4. lépés végén). */
  onComplete?: () => void
  /** Kihagyom callback-je (csak az 1-3. lépésen jelenik meg). */
  onSkip?: () => void
}

// ──────────────────────────────────────────────────────────────────────
// Fő komponens
// ──────────────────────────────────────────────────────────────────────

export function OnboardingScreen({
  initialStep = 0,
  assetBase = '/onboarding',
  onComplete,
  onSkip,
}: OnboardingScreenProps) {
  const [step, setStep] = useState(initialStep)
  const cur = STEPS[step]

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      onComplete?.()
    }
  }, [step, onComplete])

  const handlePrev = useCallback(() => {
    if (step > 0) setStep(step - 1)
  }, [step])

  const handleSkip = useCallback(() => {
    if (onSkip) {
      onSkip()
    } else {
      setStep(STEPS.length - 1)
    }
  }, [onSkip])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        background: 'var(--background)',
        color: 'var(--foreground)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* ── Bal oldal: szakrális vizuális ── */}
      <aside
        style={{
          width: '46%',
          background: 'var(--sidebar)',
          color: 'var(--sidebar-foreground)',
          padding: '40px 44px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Háttér — koncentrikus körök */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.05,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 400 400" width="540" height="540">
            <g fill="none" stroke="currentColor" strokeWidth="0.5">
              <circle cx="200" cy="200" r="180" />
              <circle cx="200" cy="200" r="130" />
              <circle cx="200" cy="200" r="80" />
            </g>
          </svg>
        </div>

        {/* Logo + márkanév */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(255,255,255,.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-serif)',
              fontSize: 19,
              fontWeight: 600,
              letterSpacing: -0.4,
            }}
          >
            K
          </div>
          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 18,
              fontWeight: 500,
              letterSpacing: -0.2,
            }}
          >
            Kartotéka
          </div>
        </div>

        {/* Központi ikon — animált belépés step-váltáskor */}
        <div
          className="kt-pop"
          key={step}
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flex: 1,
            position: 'relative',
            zIndex: 1,
          }}
        >
          <OnboardArt name={cur.art} assetBase={assetBase} />
        </div>

        {/* Idézet alul */}
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 14,
            opacity: 0.7,
            lineHeight: 1.6,
            position: 'relative',
            zIndex: 1,
          }}
        >
          „Mindeneknek pedig vége közel van. Annakokáért legyetek mértékletesek és vigyázzatok az imádkozásban.”
          <div style={{ fontStyle: 'normal', fontSize: 11, marginTop: 6, opacity: 0.8 }}>
            1Pt 4,7
          </div>
        </div>
      </aside>

      {/* ── Jobb oldal: tartalom ── */}
      <main
        style={{
          flex: 1,
          padding: '40px 50px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Step indikátor */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 36,
          }}
        >
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                height: 4,
                borderRadius: 2,
                width: i === step ? 32 : 16,
                background: i <= step ? 'var(--primary)' : 'var(--border)',
                transition: 'all .35s cubic-bezier(.4, 0, .2, 1)',
              }}
              aria-hidden="true"
            />
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11.5, color: 'var(--muted-foreground)' }}>
            {step + 1} / {STEPS.length}
          </div>
          {step < STEPS.length - 1 && (
            <button
              type="button"
              onClick={handleSkip}
              style={{
                fontSize: 11.5,
                color: 'var(--muted-foreground)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                padding: 0,
              }}
            >
              Kihagyom
            </button>
          )}
        </div>

        {/* Tartalom — slide-up animációval */}
        <div
          className="kt-slide-up"
          key={step}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            maxWidth: 560,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: 38,
              fontWeight: 500,
              letterSpacing: -0.6,
              lineHeight: 1.1,
            }}
          >
            {cur.title}
          </h1>
          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 17,
              fontStyle: 'italic',
              color: 'var(--primary)',
              marginTop: 14,
            }}
          >
            {cur.lead}
          </div>
          <div
            style={{
              fontSize: 14,
              color: 'var(--muted-foreground)',
              lineHeight: 1.65,
              marginTop: 16,
            }}
          >
            {cur.body}
          </div>

          {/* Step-specifikus widget */}
          {cur.art === 'church' && <ChurchSetupWidget />}
          {cur.art === 'import' && <ImportWidget />}
        </div>

        {/* Navigáció */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 32,
          }}
        >
          {step > 0 && (
            <button
              type="button"
              onClick={handlePrev}
              style={{
                padding: '11px 20px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                background: 'transparent',
                color: 'var(--muted-foreground)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Vissza
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={handleNext}
            style={{
              padding: '12px 24px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 6px 20px rgba(0,0,0,.18)',
              transition: 'transform .15s, box-shadow .2s',
            }}
          >
            {cur.cta}
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12 H19 M13 6 L19 12 L13 18" />
            </svg>
          </button>
        </div>
      </main>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// OnboardArt — központi vizuális elem
// ──────────────────────────────────────────────────────────────────────

interface OnboardArtProps {
  name: 'welcome' | 'church' | 'import' | 'done'
  assetBase: string
}

function OnboardArt({ name, assetBase }: OnboardArtProps) {
  if (name === 'welcome' || name === 'church') {
    return (
      <img
        src={`${assetBase}/27-church.png`}
        alt=""
        style={{ width: 280, height: 280, objectFit: 'contain', opacity: 0.85 }}
      />
    )
  }
  if (name === 'import') {
    return (
      <img
        src={`${assetBase}/28-bible-rays.png`}
        alt=""
        style={{ width: 280, height: 280, objectFit: 'contain', opacity: 0.85 }}
      />
    )
  }
  // done — pipa kör
  return (
    <svg
      viewBox="0 0 200 200"
      width="220"
      height="220"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.85"
      aria-hidden="true"
    >
      <circle cx="100" cy="100" r="64" />
      <path d="M70 100 L92 122 L132 82" strokeWidth="2" />
    </svg>
  )
}

// ──────────────────────────────────────────────────────────────────────
// ChurchSetupWidget — gyülekezet adatai (előnézet)
// ──────────────────────────────────────────────────────────────────────

function ChurchSetupWidget() {
  const fields: Array<{ label: string; value: string }> = [
    { label: 'Gyülekezet neve', value: 'Kolozsvár-Belvárosi Református Egyházközség' },
    { label: 'Egyházkerület', value: 'Erdélyi Református Egyházkerület' },
    { label: 'Lelkipásztor', value: 'Kovács Ádám' },
  ]
  return (
    <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {fields.map((f) => (
        <div key={f.label}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--muted-foreground)',
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            {f.label}
          </div>
          <div
            style={{
              padding: '10px 12px',
              background: 'var(--input)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13.5,
              color: 'var(--foreground)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {f.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// ImportWidget — fájl-tallózó előnézet
// ──────────────────────────────────────────────────────────────────────

function ImportWidget() {
  return (
    <div
      style={{
        marginTop: 22,
        padding: 18,
        border: '2px dashed var(--border)',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: 'var(--muted)',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: 'rgba(0,0,0,.04)',
          color: 'var(--primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 4 V16 M7 11 L12 16 L17 11" />
          <path d="M5 19 H19" />
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
          Húzza ide a fájlt vagy tallózzon
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted-foreground)', marginTop: 3 }}>
          Támogatott: .xlsx, .csv, .ods · max 50 MB
        </div>
      </div>
      <button
        type="button"
        style={{
          padding: '8px 14px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          background: 'var(--card)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Tallózás
      </button>
    </div>
  )
}
