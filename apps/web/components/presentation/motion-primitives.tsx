'use client'

/**
 * Motion primitívek a Prezentáció Studio slide-jaihoz.
 *
 * A framer-motion-ra épít. A cél: finom, nem tolakodó animációk,
 * amik a slide megjelenésekor kellemes "belép" érzetet adnak,
 * de nem vonják el a figyelmet a tartalomtól.
 *
 * Elvek:
 *   - Minden animáció prefer-reduced-motion-tudatos
 *   - A "stagger" minta jó egyensúly 4-8 elemre, de pl. 50+ soros
 *     listánál csak a gyors fade-ben használjuk
 *   - Sosem animálunk color-t (GPU-nem-barát) — transform + opacity
 */

import { useEffect, useRef, useState } from 'react'
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionProps,
  type Variants,
} from 'framer-motion'

import { cn } from '@/lib/utils'

// ──────────────────────────────────────────────────────────────
// Animation variants — újrafelhasználható belépések
// ──────────────────────────────────────────────────────────────

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
  },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.4 } },
}

export const slideStagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.15,
    },
  },
}

export const slideStaggerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.08,
    },
  },
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
}

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 260, damping: 20 },
  },
}

// Slide-szintű belépő (SlideFrame wrapper)
export const slideEnter: Variants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    scale: 1.02,
    transition: { duration: 0.25 },
  },
}

// ──────────────────────────────────────────────────────────────
// AnimatedNumber — spring-alapú szám-számláló
// ──────────────────────────────────────────────────────────────

interface AnimatedNumberProps {
  value: number
  /** A szám-formázás hu-HU locale-lal */
  formatter?: (n: number) => string
  /** Duration-szerű: minél nagyobb, annál gyorsabb a spring */
  stiffness?: number
  damping?: number
  className?: string
  /** Késleltetés ms-ben a start előtt */
  delayMs?: number
  /** "+" előtagot rakjunk pozitív érték elé? */
  showPlus?: boolean
}

/**
 * Szám, ami a megjelenéskor 0-ról a célra pörög fel.
 * Ha a user reduced motion-t kért, azonnal a célra ugrik.
 */
export function AnimatedNumber({
  value,
  formatter,
  stiffness = 60,
  damping = 18,
  className,
  delayMs = 0,
  showPlus = false,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0%' })
  const reducedMotion = useReducedMotion()
  const motionValue = useMotionValue(0)
  const spring = useSpring(motionValue, { stiffness, damping })

  // Derived érték render time — a reduced-motion ág nem igényel effect-et / setState-et.
  // (M6.5-ig az effect-body közvetlenül hívott setDisplay-t reduced-motion esetén;
  //  React 19 `react-hooks/set-state-in-effect` ezt tiltja.)
  const staticFormatted = formatter ? formatter(value) : value.toLocaleString('hu')
  const staticDisplay = showPlus && value > 0 ? `+${staticFormatted}` : staticFormatted

  const [animatedDisplay, setAnimatedDisplay] = useState<string>(
    formatter ? formatter(0) : '0',
  )

  useEffect(() => {
    if (reducedMotion || !inView) return
    const timer = setTimeout(() => {
      motionValue.set(value)
    }, delayMs)
    return () => clearTimeout(timer)
  }, [inView, value, motionValue, delayMs, reducedMotion])

  useEffect(() => {
    if (reducedMotion) return
    const unsub = spring.on('change', (latest) => {
      const rounded = Math.round(latest)
      const formatted = formatter ? formatter(rounded) : rounded.toLocaleString('hu')
      setAnimatedDisplay(showPlus && rounded > 0 ? `+${formatted}` : formatted)
    })
    return unsub
  }, [spring, formatter, showPlus, reducedMotion])

  return (
    <span ref={ref} className={className}>
      {reducedMotion ? staticDisplay : animatedDisplay}
    </span>
  )
}

// ──────────────────────────────────────────────────────────────
// AnimatedBar — horizontális bar sávval belépő animáció
// ──────────────────────────────────────────────────────────────

interface AnimatedBarProps {
  /** 0-100 arány (%) */
  percent: number
  color: string
  className?: string
  delay?: number
  /** Magasság class (projection módban nagyobb) */
  heightClass?: string
}

export function AnimatedBar({ percent, color, className, delay = 0, heightClass = 'h-5' }: AnimatedBarProps) {
  const reducedMotion = useReducedMotion()
  return (
    <div className={cn('h-full overflow-hidden rounded-md bg-slate-100', className)}>
      <motion.div
        initial={reducedMotion ? { width: `${percent}%` } : { width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={{
          duration: reducedMotion ? 0 : 1.0,
          delay: reducedMotion ? 0 : delay,
          ease: [0.22, 1, 0.36, 1],
        }}
        className={cn('rounded-md', heightClass)}
        style={{ background: color }}
      />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// MotionItem — egy stagger-child egyszerű fade-up elem
// ──────────────────────────────────────────────────────────────

export function MotionItem({
  children,
  className,
  variants = fadeUp,
  ...rest
}: {
  children: React.ReactNode
  className?: string
  variants?: Variants
} & Omit<MotionProps, 'variants'>) {
  return (
    <motion.div variants={variants} className={className} {...rest}>
      {children}
    </motion.div>
  )
}

// ──────────────────────────────────────────────────────────────
// GradientOrbs — dekoratív, lassan lebegő színes blobok
// ──────────────────────────────────────────────────────────────

/**
 * A háttér finom "lélegzése" — blur-os, nagyon áttetsző színes körök,
 * amik lassan mozognak. A slide hátterét dobja meg vizuálisan.
 */
export function GradientOrbs({
  variant = 'violet',
}: {
  variant?: 'violet' | 'teal' | 'amber' | 'emerald' | 'rose' | 'sky'
}) {
  const orbColors: Record<string, { a: string; b: string }> = {
    violet: { a: 'bg-violet-300/30', b: 'bg-fuchsia-300/25' },
    teal: { a: 'bg-teal-300/30', b: 'bg-cyan-300/25' },
    amber: { a: 'bg-amber-300/30', b: 'bg-orange-300/25' },
    emerald: { a: 'bg-emerald-300/30', b: 'bg-teal-300/25' },
    rose: { a: 'bg-rose-300/30', b: 'bg-pink-300/25' },
    sky: { a: 'bg-sky-300/30', b: 'bg-indigo-300/25' },
  }
  const c = orbColors[variant]
  const reducedMotion = useReducedMotion()

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className={cn('absolute -left-20 -top-20 size-[26rem] rounded-full blur-3xl', c.a)}
        animate={reducedMotion ? {} : { x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className={cn('absolute -bottom-32 -right-24 size-[32rem] rounded-full blur-3xl', c.b)}
        animate={reducedMotion ? {} : { x: [0, -30, 0], y: [0, -20, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// ProgressRing — kerek százalékos indikátor (egyházfenntartás-hoz)
// ──────────────────────────────────────────────────────────────

interface ProgressRingProps {
  /** 0..100 */
  percent: number
  size?: number
  strokeWidth?: number
  color?: string
  trackColor?: string
  children?: React.ReactNode
}

export function ProgressRing({
  percent,
  size = 180,
  strokeWidth = 14,
  color = '#10b981',
  trackColor = '#e2e8f0',
  children,
}: ProgressRingProps) {
  const reducedMotion = useReducedMotion()
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10%' })
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const target = Math.max(0, Math.min(100, percent))

  // A dash offset-et spring-gel animáljuk
  const motionValue = useMotionValue(reducedMotion ? target : 0)
  const spring = useSpring(motionValue, { stiffness: 50, damping: 20 })
  const offset = useTransform(spring, (p) => circumference * (1 - p / 100))

  useEffect(() => {
    if (inView) motionValue.set(target)
  }, [inView, target, motionValue])

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg ref={ref} width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: offset }}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  )
}

/**
 * A motion objektum újra-exportja — így a slides.tsx tisztábban érheti
 * el a motion.div-et anélkül, hogy minden fájlba framer-motion-t
 * importálnánk közvetlenül.
 */
export { motion }
