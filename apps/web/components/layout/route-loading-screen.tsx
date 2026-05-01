'use client'

import { Check } from 'lucide-react'

interface RouteLoadingScreenProps {
  /** A betöltött modul neve — pl. "Tagnyilvántartás", "Pénzügy". */
  module?: string
  /** Lépéseket felülíró tömb (alapértelmezett: 4 lépéses Kartotéka folyamat). */
  steps?: Array<{ label: string; state: 'done' | 'active' | 'pending' }>
}

const DEFAULT_STEPS: Array<{ label: string; state: 'done' | 'active' | 'pending' }> = [
  { label: 'Kapcsolódás a szerverhez', state: 'done' },
  { label: 'Helyi adatbázis ellenőrzése', state: 'done' },
  { label: 'Aktuális rekordok szinkronizálása', state: 'active' },
  { label: 'Modul beállítások betöltése', state: 'pending' },
]

export function RouteLoadingScreen({ module = 'Kartotéka', steps = DEFAULT_STEPS }: RouteLoadingScreenProps) {
  return (
    <div className="card-raised relative isolate overflow-hidden p-8 sm:p-10">
      <div
        aria-hidden
        className="absolute -left-12 -top-10 h-36 w-36 rounded-full blur-3xl"
        style={{ background: 'color-mix(in oklab, var(--accent) 22%, transparent)' }}
      />
      <div
        aria-hidden
        className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full blur-3xl"
        style={{ background: 'color-mix(in oklab, var(--primary) 18%, transparent)' }}
      />

      <div className="relative flex min-h-[46vh] flex-col items-center justify-center gap-5 text-center">
        <CalvinSpinner />

        <h2 className="font-heading text-2xl text-foreground sm:text-3xl">
          {module} betöltése
        </h2>

        <div className="mt-2 flex w-full max-w-xs flex-col gap-2.5">
          {steps.map((step, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 text-[13px]"
              style={{ opacity: step.state === 'done' ? 0.7 : 1 }}
            >
              <div
                className="flex size-[18px] shrink-0 items-center justify-center rounded-full transition-colors"
                style={{
                  background: step.state === 'done' ? 'var(--accent)' : 'transparent',
                  border: step.state === 'done' ? 'none' : `1.5px solid ${step.state === 'active' ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {step.state === 'done' && <Check className="size-3 text-white" strokeWidth={3} />}
                {step.state === 'active' && (
                  <span
                    aria-hidden
                    className="size-2 animate-pulse rounded-full"
                    style={{ background: 'var(--accent)' }}
                  />
                )}
              </div>
              <span
                className="text-left"
                style={{
                  color: step.state === 'active' ? 'var(--foreground)' : 'var(--muted-foreground)',
                  fontWeight: step.state === 'active' ? 500 : 400,
                }}
              >
                {step.label}{step.state === 'active' && '…'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CalvinSpinner() {
  // Egyszerű, pulzáló kör spinner — a sablon CalvinSpinner mintájára.
  // Az `accent` szín a témára kötött, az animáció CSS keyframe-en megy.
  return (
    <div className="relative flex size-16 items-center justify-center">
      <span
        aria-hidden
        className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent"
        style={{ borderTopColor: 'var(--accent)', borderRightColor: 'var(--accent)', animationDuration: '1.4s' }}
      />
      <span
        aria-hidden
        className="absolute inset-2 animate-spin rounded-full border-[2px] border-transparent"
        style={{ borderTopColor: 'var(--accent2)', borderLeftColor: 'var(--accent2)', animationDuration: '2.2s', animationDirection: 'reverse' }}
      />
      <span
        aria-hidden
        className="size-2 animate-pulse rounded-full"
        style={{ background: 'var(--accent)' }}
      />
    </div>
  )
}
