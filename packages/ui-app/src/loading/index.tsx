'use client'

/**
 * Mikro-interakciók: Splash, Loading, Skeleton, Page transition, Spinner-ek.
 * (Sprint R F4 · v0.8.3)
 *
 * Származás: a `Kartoteka.html` design-handoff `shared/screens.jsx`-éből
 * portolva, a téma-vars-ok (`var(--primary)`, `var(--background)`, …) szerint
 * automatikusan adoptálja a 3 vizuális téma bármelyikét.
 *
 * Animációk a `packages/ui/src/kartoteka.css`-ben definiáltak (kt-pulse,
 * kt-shimmer, kt-spin, kt-page-enter, kt-progress-bar).
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

// ──────────────────────────────────────────────────────────────────────
// Spinner-ek
// ──────────────────────────────────────────────────────────────────────

export interface SpinnerProps {
  size?: number
  color?: string
}

/** Kálvin-csillag forog — Csendes parókia / Zsoltáros vizuális nyelvén. */
export function CalvinSpinner({ size = 56, color = 'currentColor' }: SpinnerProps) {
  return (
    <svg
      viewBox="0 0 80 80"
      width={size}
      height={size}
      className="kt-spin"
      style={{ display: 'block', color }}
      aria-hidden="true"
    >
      <g transform="translate(40 40)" fill={color} stroke={color} strokeWidth="0.5">
        <path
          d="M0 -28 L4 -8 L24 -20 L10 -4 L28 0 L10 4 L24 20 L4 8 L0 28 L-4 8 L-24 20 L-10 4 L-28 0 L-10 -4 L-24 -20 L-4 -8 Z"
          opacity=".95"
        />
      </g>
    </svg>
  )
}

/** Egyszerű kör-spinner — Kerített kert vizuális nyelvén. */
export function RingSpinner({ size = 24, color = 'currentColor' }: SpinnerProps & { stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="kt-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeOpacity=".18" strokeWidth="2.5" />
      <path
        d="M21 12 A9 9 0 0 0 12 3"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Skeleton primitívek
// ──────────────────────────────────────────────────────────────────────

export interface SkeletonProps {
  width?: number | string
  height?: number | string
  radius?: number
  dark?: boolean
  className?: string
  style?: CSSProperties
}

export function Skeleton({ width = '100%', height = 14, radius = 6, dark, className, style }: SkeletonProps) {
  return (
    <div
      className={`${dark ? 'kt-skeleton-dark' : 'kt-skeleton'}${className ? ` ${className}` : ''}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  )
}

/** Kártya-skeleton (KPI-tile, dashboard widget). */
export function SkeletonCard() {
  return (
    <div
      className="rounded-[1rem] border border-[var(--border)] bg-[var(--card)] p-4"
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <Skeleton width={36} height={36} radius={10} />
      <Skeleton width="60%" height={11} />
      <Skeleton width="40%" height={26} />
      <Skeleton width="80%" height={9} />
    </div>
  )
}

/** Lista-sor skeleton (avatar + 2 sor + mini badge). */
export function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <Skeleton width={36} height={36} radius={18} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Skeleton width="60%" height={11} />
        <Skeleton width="40%" height={9} />
      </div>
      <Skeleton width={70} height={22} radius={11} />
    </div>
  )
}

/** Táblázat-skeleton: konfigurálható sorszámmal és oszlopszámmal. */
export interface SkeletonTableProps {
  rows?: number
  columns?: number
}

export function SkeletonTable({ rows = 6, columns = 4 }: SkeletonTableProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 12 }}>
          {Array.from({ length: columns }, (_, j) => (
            <Skeleton key={j} height={14} width={j === 0 ? '40%' : '80%'} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Progress bar
// ──────────────────────────────────────────────────────────────────────

export interface IndeterminateBarProps {
  color?: string
  bg?: string
  height?: number
}

export function IndeterminateBar({ color = 'var(--primary)', bg = 'rgba(0,0,0,.06)', height = 4 }: IndeterminateBarProps) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        borderRadius: height,
        background: bg,
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: '40%',
          background: color,
          borderRadius: height,
          animation: 'kt-progress-bar 1.4s cubic-bezier(.4,0,.2,1) infinite',
        }}
      />
    </div>
  )
}

export interface ProgressBarProps {
  value: number // 0-100
  color?: string
  bg?: string
  height?: number
}

export function ProgressBar({ value, color = 'var(--primary)', bg = 'rgba(0,0,0,.08)', height = 6 }: ProgressBarProps) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div
      style={{ width: '100%', height, borderRadius: height, background: bg, overflow: 'hidden' }}
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        style={{
          height: '100%',
          width: `${v}%`,
          background: color,
          borderRadius: height,
          transition: 'width .4s cubic-bezier(.4,0,.2,1)',
        }}
      />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// SplashScreen — full-screen indító képernyő
//
// Reszponzív: mobil (<480px), tablet (480-1023px), desktop (>=1024px) —
// `useSplashSizes` hook a window.innerWidth alapján méretez minden
// elemet (logó, cím, betűsávozás, progress bar). Telefonon vagy
// portrait-tableten is komfortosan elfér; nagy képernyőn megőrzi a
// design-handoff szerinti elegáns arányokat.
// ──────────────────────────────────────────────────────────────────────

export interface SplashScreenProps {
  /** Asset path-ja a logónak. Default: `/icon.png` (Next.js + Tauri statikus). */
  logoSrc?: string
  /** Fő cím (a logó alatt). Default: "Kartotéka". */
  title?: string
  /** Alcím (kis szöveg a cím alatt). Default: "Egyházi Nyilvántartó Rendszer". */
  subtitle?: string
  /** Pasztorális status-szöveg az indeterminate bar alatt. */
  statusText?: string
  /** Verzió-szöveg a lábrészhez. Default nincs. */
  version?: string
}

interface SplashSizes {
  logo: number
  motif: number
  titleSize: number
  subtitleSize: number
  subtitleSpacing: number
  progressWidth: number
  statusSize: number
  versionSize: number
  gap: number
}

function computeSplashSizes(width: number): SplashSizes {
  if (width < 480) {
    // Telefon — kis kompakt
    return {
      logo: Math.max(96, Math.min(128, width * 0.32)),
      motif: Math.min(width, 420),
      titleSize: 30,
      subtitleSize: 11,
      subtitleSpacing: 1,
      progressWidth: Math.min(width * 0.6, 200),
      statusSize: 11,
      versionSize: 10,
      gap: 18,
    }
  }
  if (width < 1024) {
    // Tablet (portrait + landscape) — közbülső
    return {
      logo: 140,
      motif: 520,
      titleSize: 36,
      subtitleSize: 12.5,
      subtitleSpacing: 1.3,
      progressWidth: 220,
      statusSize: 11.5,
      versionSize: 10.5,
      gap: 24,
    }
  }
  // Desktop — eredeti design
  return {
    logo: 168,
    motif: 640,
    titleSize: 42,
    subtitleSize: 14,
    subtitleSpacing: 1.5,
    progressWidth: 220,
    statusSize: 11.5,
    versionSize: 10.5,
    gap: 28,
  }
}

function useSplashSizes(): SplashSizes {
  const [sizes, setSizes] = useState<SplashSizes>(() =>
    computeSplashSizes(typeof window === 'undefined' ? 1280 : window.innerWidth),
  )
  useEffect(() => {
    function update() {
      setSizes(computeSplashSizes(window.innerWidth))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return sizes
}

export function SplashScreen({
  logoSrc = '/icon.png',
  title = 'Kartotéka',
  subtitle = 'Egyházi Nyilvántartó Rendszer',
  statusText = 'Adatok szinkronizálása…',
  version,
}: SplashScreenProps) {
  const s = useSplashSizes()
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--sidebar)',
        color: 'var(--sidebar-foreground)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        zIndex: 9999,
        animation: 'kt-fade-in .25s ease-out',
        fontFamily: 'var(--font-sans)',
        padding: '6vw',
        boxSizing: 'border-box',
      }}
    >
      {/* Halvány motívum-kör középen */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.06,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 400 400" width={s.motif} height={s.motif}>
          <g fill="none" stroke="currentColor" strokeWidth="0.6">
            <circle cx="200" cy="200" r="180" />
            <circle cx="200" cy="200" r="140" />
            <circle cx="200" cy="200" r="100" />
            <line x1="20" y1="200" x2="380" y2="200" />
            <line x1="200" y1="20" x2="200" y2="380" />
          </g>
        </svg>
      </div>

      <img
        src={logoSrc}
        alt={title}
        className="kt-pulse"
        style={{
          width: s.logo,
          height: s.logo,
          objectFit: 'contain',
          filter: 'drop-shadow(0 8px 30px rgba(0,0,0,.3))',
        }}
      />

      <div style={{ textAlign: 'center', lineHeight: 1.4, maxWidth: '90vw' }}>
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: s.titleSize,
            fontWeight: 500,
            letterSpacing: -0.5,
            marginBottom: 6,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: s.subtitleSize,
            opacity: 0.65,
            letterSpacing: s.subtitleSpacing,
            textTransform: 'uppercase',
          }}
        >
          {subtitle}
        </div>
      </div>

      <div style={{ width: s.progressWidth, marginTop: 20 }}>
        <IndeterminateBar color="var(--sidebar-primary)" bg="rgba(255,255,255,.1)" />
      </div>
      <div
        style={{
          fontSize: s.statusSize,
          opacity: 0.55,
          letterSpacing: 0.5,
          textAlign: 'center',
          maxWidth: '90vw',
        }}
      >
        {statusText}
      </div>

      {version && (
        <div
          style={{
            position: 'absolute',
            bottom: 'max(20px, 4vh)',
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: s.versionSize,
            opacity: 0.5,
            letterSpacing: 0.5,
            padding: '0 16px',
          }}
        >
          {version}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// LoadingScreen — full-screen, lépéses checklist
// ──────────────────────────────────────────────────────────────────────

export interface LoadingStep {
  label: string
  status: 'done' | 'active' | 'pending'
}

export interface LoadingScreenProps {
  /** Cím a Spinner alatt. Default: "Kartotéka betöltése". */
  title?: string
  /** Lépés-lista. Ha üres, csak a Spinner és a cím látszik. */
  steps?: LoadingStep[]
  /** Spinner stílus. */
  spinner?: 'calvin' | 'ring'
}

export function LoadingScreen({
  title = 'Kartotéka betöltése',
  steps = [],
  spinner = 'calvin',
}: LoadingScreenProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--background)',
        color: 'var(--foreground)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        zIndex: 9998,
        fontFamily: 'var(--font-sans)',
      }}
    >
      {spinner === 'calvin' ? (
        <CalvinSpinner color="var(--primary)" size={64} />
      ) : (
        <RingSpinner color="var(--primary)" size={48} />
      )}
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 22,
          fontWeight: 500,
          marginTop: 4,
        }}
      >
        {title}
      </div>
      {steps.length > 0 && (
        <div
          style={{
            width: 320,
            marginTop: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {steps.map((s, i) => (
            <LoadingStepRow key={i} step={s} />
          ))}
        </div>
      )}
    </div>
  )
}

function LoadingStepRow({ step }: { step: LoadingStep }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 12.5,
        color: step.status === 'active' ? 'var(--foreground)' : 'var(--muted-foreground)',
        opacity: step.status === 'done' ? 0.7 : 1,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: step.status === 'done' ? 'var(--primary)' : 'transparent',
          border:
            step.status === 'done'
              ? 'none'
              : `1.5px solid ${step.status === 'active' ? 'var(--primary)' : 'var(--border)'}`,
          color: '#fff',
        }}
      >
        {step.status === 'done' && (
          <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6 L5 9 L10 3" />
          </svg>
        )}
        {step.status === 'active' && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--primary)',
              animation: 'kt-pulse 1.2s ease-in-out infinite',
            }}
          />
        )}
      </div>
      <span>
        {step.label}
        {step.status === 'active' && '…'}
      </span>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// PageTransition — fade + translateY + blur belépő wrapper
// ──────────────────────────────────────────────────────────────────────

export interface PageTransitionProps {
  children: ReactNode
  /** Animáció kulcs — ha más, újrarenderelődik. Default: undefined (csak első mount). */
  animationKey?: string
}

export function PageTransition({ children, animationKey }: PageTransitionProps) {
  return (
    <div key={animationKey} className="kt-page-enter" style={{ minHeight: 'inherit' }}>
      {children}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// DelayedLoading — csak >threshold ms után jelenít meg LoadingScreen-t
// (UX best practice: rövid lekérdezésnél ne villogjon a Loading.)
// ──────────────────────────────────────────────────────────────────────

export interface DelayedLoadingProps extends LoadingScreenProps {
  /** Hány ms után jelenjen meg. Default: 800ms. */
  thresholdMs?: number
}

export function DelayedLoading({ thresholdMs = 800, ...props }: DelayedLoadingProps) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setVisible(true), thresholdMs)
    return () => window.clearTimeout(id)
  }, [thresholdMs])
  if (!visible) return null
  return <LoadingScreen {...props} />
}
