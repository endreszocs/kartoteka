'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { completeWizard } from '@/app/(setup)/welcome/actions'
import { Button } from '@/components/ui/button'

type Phase = 'committing' | 'done' | 'error'

/**
 * Step 5 — a web-onboarding wizard befejező lépése.
 *
 * M6.3 (2026-04-22) óta a fájl neve step-5-finish.tsx (korábban -finish-web),
 * és az export `Step5Finish` — a korábbi portable (SQLite save-initial +
 * initial-pull + write-license) verzió kivezetve.
 *
 * Egyetlen server action fut (completeWizard), ami:
 *  - profiles, congregations, pastor_profiles, bealitas táblákba committal
 *  - profiles.onboarding_completed_at = now()
 *  - wizard_progress.completed_at = now()
 *
 * Siker után redirect /dashboard-ra.
 */
export function Step5Finish() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('committing')
  const [error, setError] = useState<string | null>(null)
  const runningRef = useRef(false)

  const run = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true

    try {
      const result = await completeWizard()
      if ('error' in result) {
        setPhase('error')
        setError(result.error)
        toast.error('Nem sikerült a beállítás véglegesítése')
        return
      }

      setPhase('done')
      setError(null)
      toast.success('Minden készen áll! 🎉')

      // Dashboard-ra átirányítás — adunk egy kis időt az animációnak
      setTimeout(() => {
        router.push('/dashboard')
        router.refresh()
      }, 1800)
    } catch (e) {
      setPhase('error')
      setError(e instanceof Error ? e.message : 'Ismeretlen hiba')
      toast.error('Hiba történt')
    } finally {
      runningRef.current = false
    }
  }, [router])

  useEffect(() => {
    void run()
  }, [run])

  const phaseIcons: Record<Phase, React.ReactNode> = {
    committing: <Loader2 className="size-8 animate-spin text-primary" />,
    done: <CheckCircle2 className="size-8 text-emerald-600" />,
    error: <Sparkles className="size-8 text-red-500" />,
  }

  const phaseTitles: Record<Phase, string> = {
    committing: 'Beállítás véglegesítése…',
    done: 'Készen is vagyunk!',
    error: 'Hiba történt',
  }

  return (
    <div className="space-y-6 p-8 md:p-12">
      <div className="text-center">
        <div className="mx-auto flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-emerald-100 shadow-inner">
          {phaseIcons[phase]}
        </div>

        <h2 className="mt-6 font-heading text-3xl text-slate-800">
          {phaseTitles[phase]}
        </h2>

        {phase === 'committing' && (
          <p className="mt-2 text-base text-slate-600">
            Az adatokat most véglegesítjük a rendszerben. Ez pár másodperc.
          </p>
        )}
      </div>

      {/* Done üzenet */}
      {phase === 'done' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-6 text-center">
          <h3 className="font-heading text-xl text-emerald-900">
            🎉 A Kartotéka készen áll!
          </h3>
          <p className="mt-2 text-sm text-emerald-800">
            Pár másodperc múlva átirányítunk a kezdőoldalra.
            <br />
            Áldás kísérje szolgálatodat!
          </p>
          <Button
            size="lg"
            className="mt-4 rounded-xl bg-emerald-600 hover:bg-emerald-700"
            onClick={() => router.push('/dashboard')}
          >
            Ugrás a Főoldalra →
          </Button>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && error && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-6">
          <h3 className="font-heading text-lg text-red-900">
            Nem sikerült véglegesíteni
          </h3>
          <p className="mt-2 text-sm text-red-800">{error}</p>
          <div className="mt-4 text-xs text-red-700">
            <p>Mit tehetsz:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>Ellenőrizd az internetkapcsolatot</li>
              <li>Kattints a &quot;Újrapróbálkozás&quot; gombra</li>
              <li>
                Ha továbbra is problémás, írj nekünk:{' '}
                <a
                  href="mailto:support@kartoteka.erek.ro"
                  className="font-semibold underline"
                >
                  support@kartoteka.erek.ro
                </a>
              </li>
            </ul>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              className="rounded-xl bg-red-600 hover:bg-red-700"
              onClick={() => {
                setError(null)
                setPhase('committing')
                void run()
              }}
            >
              <RotateCcw className="mr-1.5 size-4" />
              Újrapróbálkozás
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
