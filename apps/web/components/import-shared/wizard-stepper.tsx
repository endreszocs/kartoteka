'use client'

import { Check } from 'lucide-react'

export interface WizardStep {
  id: string
  label: string
  shortLabel?: string
}

interface WizardStepperProps {
  steps: WizardStep[]
  /** Az aktív lépés id-ja */
  activeId: string
  /** A már befejezett lépések id-jai */
  completedIds: string[]
  /** Opcionális kattintás-handler — ha nincs, a stepper csak vizuális */
  onStepClick?: (id: string) => void
}

/**
 * Közös wizard-stepper komponens import-folyamatokhoz.
 *
 * Eredetileg a tagnyilvántartás-import-wizardban élt, de a 2026-05-02 pénzügyi
 * import-wizard miatt kiemeltük közös helyre. A tagnyilvántartás-oldali file
 * (apps/web/components/members/tagnyilvantartas-import/wizard-stepper.tsx)
 * mostantól re-exporttal mutat erre.
 *
 * Mobil: csak az aktív lépés címe + "{n}/{N}" kijelzés.
 * Desktop: vízszintes lista a teljes szövegekkel és kapcsolóvonalakkal.
 */
export function WizardStepper({ steps, activeId, completedIds, onStepClick }: WizardStepperProps) {
  const activeIndex = steps.findIndex((s) => s.id === activeId)
  const safeIndex = activeIndex === -1 ? 0 : activeIndex

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 sm:px-5 sm:py-4">
      {/* Telefonon és tableten kompakt állapotjelző, hogy a hétlépéses folyamat se csorduljon túl. */}
      <div className="flex items-center justify-between gap-4 lg:hidden" aria-live="polite" aria-atomic="true">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            {safeIndex + 1}/{steps.length}. lépés
          </p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">
            {steps[safeIndex].label}
          </p>
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {safeIndex + 1}
        </div>
      </div>

      {/* Desktop: full vizuális stepper */}
      <ol className="hidden min-w-0 items-center lg:flex" aria-label="Az importálás lépései">
        {steps.map((step, idx) => {
          const isActive = step.id === activeId
          const isDone = completedIds.includes(step.id)
          const isClickable = !!onStepClick && (isDone || idx <= safeIndex)

          const circle = isDone ? (
            <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
          ) : (
            <span>{idx + 1}</span>
          )

          const stepClassName = `group flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors ${
            isClickable ? 'cursor-pointer hover:bg-muted' : 'cursor-default'
          }`
          const stepContent = (
            <>
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isDone
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {circle}
              </span>
              <span
                className={`truncate text-sm font-medium transition-colors ${
                  isActive ? 'text-primary' : isDone ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
            </>
          )

          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center">
              {isClickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick?.(step.id)}
                  aria-current={isActive ? 'step' : undefined}
                  className={stepClassName}
                >
                  {stepContent}
                </button>
              ) : (
                <div aria-current={isActive ? 'step' : undefined} className={stepClassName}>
                  {stepContent}
                </div>
              )}
              {idx < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`mx-1 h-px min-w-3 flex-1 transition-colors ${
                    isDone || idx < safeIndex ? 'bg-primary/40' : 'bg-border'
                  }`}
                />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
