'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Sparkles,
  X,
} from 'lucide-react'

import {
  markWalkthroughComplete,
  skipWalkthrough,
} from '@/app/(dashboard)/profile/walkthrough-actions'
import { Button } from '@/components/ui/button'

import { WALKTHROUGH_STEPS, type WalkthroughStep } from './walkthrough-steps'

interface WalkthroughClientProps {
  /** A lelkész keresztneve — a megszólításhoz ("Üdvözlöm, [keresztnév]!") */
  firstName: string
  /** Ha false, nem renderelünk semmit (a walkthrough már befejezett). */
  shouldStart: boolean
}

const SPOTLIGHT_PADDING = 10
const TOOLTIP_MAX_WIDTH = 360
const VIEWPORT_MARGIN = 16

interface TargetRect {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Interaktív walkthrough a dashboard fölött.
 *
 * A komponens:
 *  - Megkeresi a target elemet CSS selector alapján (data-walkthrough="...")
 *  - Mért pozíció alapján spotlight overlay + tooltip kártya
 *  - Előző / Tovább / Kihagyás gombok
 *  - Befejezéskor / kihagyáskor server action-be ment
 *
 * Ha a target nem található (pl. sidebar collapsed), a step-et átugorja.
 * Az `{firstName}` placeholder automatikusan cserélődik a prop-ra.
 */
export function WalkthroughClient({ firstName, shouldStart }: WalkthroughClientProps) {
  const [active, setActive] = useState(shouldStart)
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const [targetLost, setTargetLost] = useState(false)
  const savingRef = useRef(false)

  const step = WALKTHROUGH_STEPS[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === WALKTHROUGH_STEPS.length - 1
  const totalSteps = WALKTHROUGH_STEPS.length

  // Target elem megkeresése + pozíció mérése
  const measureTarget = useCallback(() => {
    if (!step || !step.target) {
      setTargetRect(null)
      setTargetLost(false)
      return
    }
    const el = document.querySelector(step.target) as HTMLElement | null
    if (!el) {
      setTargetRect(null)
      setTargetLost(true)
      return
    }
    const rect = el.getBoundingClientRect()
    // Ha a target nincs a viewport-ban (teljes mértékben), próbáljunk scrollolni
    const isOutside =
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth
    if (isOutside) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      // Várj picit a scroll-ra, aztán mérés újra
      setTimeout(() => {
        const r = el.getBoundingClientRect()
        setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height })
        setTargetLost(false)
      }, 320)
      return
    }
    setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
    setTargetLost(false)
  }, [step])

  useEffect(() => {
    if (!active) return
    // requestAnimationFrame — a setState-t egy frame-re kitoljuk, hogy
    // elkerüljük a synchronous setState-in-effect kaszkád-render figyelmeztetést.
    const rafId = requestAnimationFrame(measureTarget)
    const onResize = () => measureTarget()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [active, stepIndex, measureTarget])

  const handleNext = useCallback(() => {
    if (isLast) {
      if (savingRef.current) return
      savingRef.current = true
      void markWalkthroughComplete().finally(() => {
        savingRef.current = false
        setActive(false)
      })
      return
    }
    setStepIndex(i => Math.min(i + 1, WALKTHROUGH_STEPS.length - 1))
  }, [isLast])

  const handleBack = useCallback(() => {
    setStepIndex(i => Math.max(i - 1, 0))
  }, [])

  const handleSkip = useCallback(() => {
    if (savingRef.current) return
    savingRef.current = true
    void skipWalkthrough().finally(() => {
      savingRef.current = false
      setActive(false)
    })
  }, [])

  // Keyboard support
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext()
      else if (e.key === 'ArrowLeft') handleBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, handleNext, handleBack, handleSkip])

  if (!active) return null

  const hasTarget = !!step.target && !!targetRect && !targetLost
  const placement = step.placement || (hasTarget ? 'bottom' : 'center')

  return (
    <AnimatePresence>
      <motion.div
        key="walkthrough-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[9999]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkthrough-title"
      >
        {/* Spotlight overlay — box-shadow trick */}
        {hasTarget && targetRect ? (
          <motion.div
            key={step.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="absolute rounded-xl"
            style={{
              top: targetRect.top - SPOTLIGHT_PADDING,
              left: targetRect.left - SPOTLIGHT_PADDING,
              width: targetRect.width + SPOTLIGHT_PADDING * 2,
              height: targetRect.height + SPOTLIGHT_PADDING * 2,
              boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.72)',
              pointerEvents: 'none',
            }}
          >
            {/* Pulse ring körül */}
            <motion.div
              animate={{
                opacity: [0.6, 0, 0.6],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="absolute inset-0 rounded-xl border-2 border-amber-300"
            />
          </motion.div>
        ) : (
          // Nincs target → sima fullscreen overlay
          <div
            className="absolute inset-0 bg-slate-900/72"
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* Tooltip kártya */}
        <TooltipCard
          step={step}
          firstName={firstName}
          stepIndex={stepIndex}
          totalSteps={totalSteps}
          targetRect={targetRect}
          placement={placement}
          isFirst={isFirst}
          isLast={isLast}
          onNext={handleNext}
          onBack={handleBack}
          onSkip={handleSkip}
        />
      </motion.div>
    </AnimatePresence>
  )
}

// ────────────────────────────────────────────────────────────────────
// Tooltip kártya — pozicionálás + tartalom
// ────────────────────────────────────────────────────────────────────

interface TooltipCardProps {
  step: WalkthroughStep
  firstName: string
  stepIndex: number
  totalSteps: number
  targetRect: TargetRect | null
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center'
  isFirst: boolean
  isLast: boolean
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

function TooltipCard({
  step,
  firstName,
  stepIndex,
  totalSteps,
  targetRect,
  placement,
  isFirst,
  isLast,
  onNext,
  onBack,
  onSkip,
}: TooltipCardProps) {
  // Placement-alapú helyzet-számítás
  const positionStyle = computePosition(targetRect, placement)

  const title = step.title.replace(/\{firstName\}/g, firstName)
  const description = step.description.replace(/\{firstName\}/g, firstName)

  return (
    <motion.div
      key={`tooltip-${step.id}`}
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', damping: 22, stiffness: 260 }}
      className="pointer-events-auto absolute rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
      style={{
        maxWidth: TOOLTIP_MAX_WIDTH,
        width: 'calc(100vw - 32px)',
        ...positionStyle,
      }}
    >
      {/* Fejléc: step ikon + progress + close */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-100 to-teal-100">
            <Sparkles className="size-4 text-amber-700" />
          </div>
          <span className="text-xs font-medium text-slate-500">
            {stepIndex + 1} / {totalSteps}
          </span>
        </div>
        <button
          onClick={onSkip}
          className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          title="Kihagyom (Esc)"
          aria-label="Kihagyom"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-1 overflow-hidden rounded-full bg-slate-100">
        <motion.div
          initial={false}
          animate={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-teal-500"
        />
      </div>

      {/* Tartalom */}
      <h3
        id="walkthrough-title"
        className="font-heading text-lg font-semibold leading-tight text-slate-900"
      >
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        {description}
      </p>

      {/* Action gombok */}
      <div className="mt-5 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSkip}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          Kihagyom
        </Button>
        <div className="flex items-center gap-2">
          {!isFirst && (
            <Button
              variant="outline"
              size="sm"
              onClick={onBack}
              className="gap-1"
            >
              <ChevronLeft className="size-4" />
              Előző
            </Button>
          )}
          <Button size="sm" onClick={onNext} className="gap-1">
            {isLast ? (
              <>
                Kész
                <CircleHelp className="size-4" />
              </>
            ) : (
              <>
                Tovább
                <ChevronRight className="size-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Pozicionálási logika
// ────────────────────────────────────────────────────────────────────

function computePosition(
  rect: TargetRect | null,
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center'
): React.CSSProperties {
  const vpW = typeof window !== 'undefined' ? window.innerWidth : 1920
  const vpH = typeof window !== 'undefined' ? window.innerHeight : 1080

  // Center — nincs target, vagy a step explicit center
  if (!rect || placement === 'center') {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    }
  }

  const gap = 16

  // Placement alapú pozicionálás
  switch (placement) {
    case 'bottom': {
      const top = Math.min(
        rect.top + rect.height + gap,
        vpH - VIEWPORT_MARGIN - 200 // becsült tooltip magasság
      )
      const left = clamp(
        rect.left + rect.width / 2,
        TOOLTIP_MAX_WIDTH / 2 + VIEWPORT_MARGIN,
        vpW - TOOLTIP_MAX_WIDTH / 2 - VIEWPORT_MARGIN
      )
      return { top, left, transform: 'translateX(-50%)' }
    }
    case 'top': {
      const top = Math.max(rect.top - gap - 200, VIEWPORT_MARGIN)
      const left = clamp(
        rect.left + rect.width / 2,
        TOOLTIP_MAX_WIDTH / 2 + VIEWPORT_MARGIN,
        vpW - TOOLTIP_MAX_WIDTH / 2 - VIEWPORT_MARGIN
      )
      return { top, left, transform: 'translateX(-50%)' }
    }
    case 'right': {
      const left = rect.left + rect.width + gap
      // Ha nem fér ki jobbra, helyezzük balra
      if (left + TOOLTIP_MAX_WIDTH + VIEWPORT_MARGIN > vpW) {
        const altLeft = Math.max(rect.left - gap - TOOLTIP_MAX_WIDTH, VIEWPORT_MARGIN)
        return { top: clamp(rect.top, VIEWPORT_MARGIN, vpH - 200), left: altLeft }
      }
      return {
        top: clamp(rect.top, VIEWPORT_MARGIN, vpH - 200),
        left,
      }
    }
    case 'left': {
      const left = Math.max(rect.left - gap - TOOLTIP_MAX_WIDTH, VIEWPORT_MARGIN)
      return {
        top: clamp(rect.top, VIEWPORT_MARGIN, vpH - 200),
        left,
      }
    }
    default:
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
