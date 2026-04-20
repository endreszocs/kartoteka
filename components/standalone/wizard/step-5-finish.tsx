'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Download, Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

import type { WizardData } from '../welcome-wizard-client'

interface Step5Props {
  data: WizardData
}

type Phase =
  | 'saving-profile'    // Profil, gyülekezet, pénzügyi mentés Supabase + SQLite
  | 'initial-pull'       // Supabase → SQLite teljes pull
  | 'writing-license'    // license.dat írás
  | 'done'               // kész, redirect
  | 'error'

/**
 * Phase-szintű progress flag-ek — ha egy fázis sikeres, NEM ismételjük meg a
 * retry során. Pl. ha a `saving-profile` átment, de a `initial-pull` megszakadt
 * (megszakadt internet), retry-kor csak az `initial-pull`-ról folytatjuk.
 *
 * Ez kritikus, mert a `save-initial` írhat Supabase-be (profile insert) — az
 * újbóli futása duplikációt okozhatna vagy unique constraint hibát.
 */
interface ProgressFlags {
  profileSaved: boolean
  initialPullDone: boolean
  licenseWritten: boolean
}

export function Step5Finish({ data }: Step5Props) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('saving-profile')
  const [error, setError] = useState<string | null>(null)
  const [errorPhase, setErrorPhase] = useState<Phase | null>(null)
  // Retry-akkor szükséges: melyik fázisok futottak már sikeresen
  const progressRef = useRef<ProgressFlags>({
    profileSaved: false,
    initialPullDone: false,
    licenseWritten: false,
  })
  // Re-entry guard a retry gombhoz — ne lehessen kétszer egymás után klikkelni
  const runningRef = useRef(false)

  const run = useCallback(
    async (cancelledRef: { value: boolean }) => {
      if (runningRef.current) return
      runningRef.current = true

      try {
        // 1) Profil, gyülekezet, pénzügyi beállítások mentése — csak ha még nem
        if (!progressRef.current.profileSaved) {
          setPhase('saving-profile')
          const saveResp = await fetch('/api/standalone/save-initial', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              userId: data.userId,
              congregationId: data.congregationId,
              congregation: data.congregation,
              pastor: data.pastor,
              finance: data.finance,
            }),
          })
          if (!saveResp.ok) {
            const err = await saveResp.json().catch(() => ({}))
            const msg = err.error || 'Profil mentése sikertelen'
            setErrorPhase('saving-profile')
            throw new Error(msg)
          }
          if (cancelledRef.value) return
          progressRef.current.profileSaved = true
        }

        // 2) Initial pull Supabase → SQLite — csak ha még nem
        if (!progressRef.current.initialPullDone) {
          setPhase('initial-pull')
          const pullResp = await fetch('/api/standalone/initial-pull', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              congregationId: data.congregationId,
            }),
          })
          if (!pullResp.ok) {
            const err = await pullResp.json().catch(() => ({}))
            const msg = err.error || 'Adatok letöltése sikertelen'
            setErrorPhase('initial-pull')
            throw new Error(msg)
          }
          await pullResp.json() // eat the response, stats-okat nem mutatjuk itt
          if (cancelledRef.value) return
          progressRef.current.initialPullDone = true
        }

        // 3) license.dat írása — csak ha még nem
        if (!progressRef.current.licenseWritten) {
          setPhase('writing-license')
          const licenseResp = await fetch('/api/standalone/write-license', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: data.licenseToken }),
          })
          if (!licenseResp.ok) {
            const err = await licenseResp.json().catch(() => ({}))
            const msg = err.error || 'Licensz fájl írása sikertelen'
            setErrorPhase('writing-license')
            throw new Error(msg)
          }
          if (cancelledRef.value) return
          progressRef.current.licenseWritten = true
        }

        // 4) Kész → redirect
        setPhase('done')
        setError(null)
        setErrorPhase(null)
        toast.success('Készen is vagyunk! 🎉')
        setTimeout(() => {
          if (!cancelledRef.value) {
            router.push('/dashboard')
            router.refresh()
          }
        }, 2000)
      } catch (e) {
        if (!cancelledRef.value) {
          setPhase('error')
          setError(e instanceof Error ? e.message : 'Ismeretlen hiba')
          toast.error('Hiba történt a beállításkor')
        }
      } finally {
        runningRef.current = false
      }
    },
    [data, router],
  )

  useEffect(() => {
    const cancelledRef = { value: false }
    void run(cancelledRef)
    return () => {
      cancelledRef.value = true
    }
  }, [run])

  function handleRetry() {
    const cancelledRef = { value: false }
    setError(null)
    setErrorPhase(null)
    void run(cancelledRef)
  }

  const phaseLabels: Record<Phase, string> = {
    'saving-profile': 'Profil mentése…',
    'initial-pull': 'Gyülekezeti adatok letöltése…',
    'writing-license': 'Licensz tárolása…',
    done: 'Kész! 🎉',
    error: 'Hiba történt',
  }

  const phaseIcons: Record<Phase, React.ReactNode> = {
    'saving-profile': <Loader2 className="size-8 animate-spin text-primary" />,
    'initial-pull': <Download className="size-8 animate-pulse text-blue-600" />,
    'writing-license': <Loader2 className="size-8 animate-spin text-emerald-600" />,
    done: <CheckCircle2 className="size-8 text-emerald-600" />,
    error: <Sparkles className="size-8 text-red-500" />,
  }

  return (
    <div className="space-y-6 p-8 md:p-12">
      {/* Üdvözlet + állapot */}
      <div className="text-center">
        <div className="mx-auto flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-emerald-100 shadow-inner">
          {phaseIcons[phase]}
        </div>

        <h2 className="mt-6 font-heading text-3xl text-slate-800">
          {phase === 'done'
            ? 'Készen is vagyunk!'
            : phase === 'error'
              ? 'Hiba történt'
              : 'Beállítás folyamatban…'}
        </h2>

        <p className="mt-2 text-base text-slate-600">
          {phaseLabels[phase]}
        </p>
      </div>

      {/* Folyamat-lista */}
      {phase !== 'error' && (
        <div className="mx-auto max-w-md space-y-2">
          <PhaseRow
            label="Profil és gyülekezet mentése"
            active={phase === 'saving-profile'}
            done={phase !== 'saving-profile'}
          />
          <PhaseRow
            label="Gyülekezeti adatok letöltése"
            active={phase === 'initial-pull'}
            done={phase === 'writing-license' || phase === 'done'}
          />
          <PhaseRow
            label="Licensz tárolása a gépen"
            active={phase === 'writing-license'}
            done={phase === 'done'}
          />
        </div>
      )}

      {/* Done üzenet */}
      {phase === 'done' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-6 text-center">
          <h3 className="font-heading text-xl text-emerald-900">
            🎉 A KARTOTEKA készen áll!
          </h3>
          <p className="mt-2 text-sm text-emerald-800">
            Mostantól offline is dolgozhatsz. Pár másodperc múlva átirányítunk a
            kezdőoldalra. Áldás kísérje szolgálatodat!
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

      {/* Error üzenet */}
      {phase === 'error' && error && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-6">
          <h3 className="font-heading text-lg text-red-900">
            Nem sikerült a beállítás
          </h3>
          {errorPhase && (
            <p className="mt-1 text-xs uppercase tracking-wider text-red-600">
              Hibás fázis:{' '}
              <strong>
                {errorPhase === 'saving-profile' && 'Profil mentése'}
                {errorPhase === 'initial-pull' && 'Gyülekezeti adatok letöltése'}
                {errorPhase === 'writing-license' && 'Licensz tárolása'}
              </strong>
            </p>
          )}
          <p className="mt-2 text-sm text-red-800">{error}</p>

          {/* Eddigi haladás megjelenítése — a sikeres lépéseket nem ismételjük */}
          <div className="mt-3 rounded-lg border border-red-100 bg-white/60 p-3 text-xs text-red-800">
            <p className="font-semibold">Eddigi haladás:</p>
            <ul className="mt-1 space-y-0.5">
              <li>
                {progressRef.current.profileSaved ? '✓' : '○'} Profil és gyülekezet mentése
              </li>
              <li>
                {progressRef.current.initialPullDone ? '✓' : '○'} Gyülekezeti adatok letöltése
              </li>
              <li>
                {progressRef.current.licenseWritten ? '✓' : '○'} Licensz tárolása a gépen
              </li>
            </ul>
            <p className="mt-2 italic">
              A &quot;Folytatás&quot; gomb csak az utolsó megakadt lépéstől
              folytat tovább — a sikeres lépéseket nem ismétli meg (nem keletkezik
              duplikált adat).
            </p>
          </div>

          <div className="mt-4 text-xs text-red-700">
            <p>Mit tehetsz:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>Ellenőrizd az internetkapcsolatot</li>
              <li>Kattints a &quot;Folytatás&quot; gombra</li>
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
              onClick={handleRetry}
            >
              <RotateCcw className="mr-1.5 size-4" />
              Folytatás
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => window.location.reload()}
              title="Csak ha a Folytatás nem segít — a wizardot teljesen újraindítja"
            >
              Wizard újraindítása
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function PhaseRow({
  label,
  active,
  done,
}: {
  label: string
  active: boolean
  done: boolean
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
        active
          ? 'border-primary bg-primary/5 text-primary'
          : done
            ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700'
            : 'border-slate-200 bg-slate-50/40 text-slate-500'
      }`}
    >
      {active && <Loader2 className="size-4 animate-spin" />}
      {done && !active && <CheckCircle2 className="size-4" />}
      {!active && !done && <div className="size-4 rounded-full border-2 border-slate-300" />}
      <span className="font-medium">{label}</span>
    </div>
  )
}
