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
    <div className="rounded-[1.5rem] bg-white/85 px-4 py-3 ring-1 ring-emerald-100 shadow-[0_18px_40px_-30px_rgba(15,118,110,0.35)] sm:px-6 sm:py-4">
      {/* Mobil: csak aktív lépés szöveggel */}
      <div className="flex items-center justify-between sm:hidden">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
            {safeIndex + 1}/{steps.length}. lépés
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-800">
            {steps[safeIndex].label}
          </p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
          {safeIndex + 1}
        </div>
      </div>

      {/* Desktop: full vizuális stepper */}
      <ol className="hidden sm:flex sm:items-center sm:gap-2">
        {steps.map((step, idx) => {
          const isActive = step.id === activeId
          const isDone = completedIds.includes(step.id)
          const isClickable = !!onStepClick && (isDone || idx <= safeIndex)

          const circle = isDone ? (
            <Check className="size-3.5" strokeWidth={3} />
          ) : (
            <span>{idx + 1}</span>
          )

          return (
            <li key={step.id} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick?.(step.id)}
                className={`group flex items-center gap-2.5 rounded-full px-3 py-1.5 transition ${
                  isClickable ? 'cursor-pointer hover:bg-emerald-50/80' : 'cursor-default'
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-[0_8px_16px_-8px_rgba(5,150,105,0.6)]'
                      : isDone
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {circle}
                </span>
                <span
                  className={`text-sm font-medium transition ${
                    isActive ? 'text-emerald-700' : isDone ? 'text-slate-700' : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </span>
              </button>
              {idx < steps.length - 1 && (
                <span
                  className={`h-px w-6 shrink-0 transition ${
                    isDone || (isActive && idx < safeIndex) ? 'bg-emerald-300' : 'bg-slate-200'
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
