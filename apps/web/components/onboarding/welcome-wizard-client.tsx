'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Church, Download, Info, Loader2, User, Wallet } from 'lucide-react'
import { toast } from 'sonner'

import {
  getWizardProgress,
  saveWizardStep,
  type WizardData as ServerWizardData,
} from '@/app/(setup)/welcome/actions'

import { Step2Congregation } from './wizard/step-2-congregation'
import { Step3Pastor } from './wizard/step-3-pastor'
import { Step4Finance } from './wizard/step-4-finance'
import { Step5Finish } from './wizard/step-5-finish'

// A wizard teljes kliens-oldali állapota (web-only, M6.3 óta).
// A korábbi standalone (portable) Step 1 (licensz-aktiválás) kivezetve 2026-04-22.
export interface WizardData {
  // Step 2 — Gyülekezet
  congregationId: string | null
  congregation: {
    nev: string
    nev_hu: string
    nev_ro: string
    adoszam: string
    bejegyzesiszam: string
    cim: string
    email: string
    telefon: string
    web: string
    iban: string
    bank: string
    // Strukturált cím-mezők (2026-04-21)
    megye: string
    varos: string
    iranyitoszam: string
    hazszam: string
    country: string
    adrlocality_id: number | null
    adrstreet_id: number | null
    isForeign: boolean
  }

  // Step 3 — Lelkész
  pastor: {
    fullName: string
    birthDate: string
    phone: string
    email: string
    serviceStartedAt: string
    previousPlaces: string
  }

  // Step 4 — Pénzügy
  finance: {
    eves_jarulek: number
    jarulek_kedvezmenyes: number
    jarulek_hatarid: string
    nyito_keszpenz: number
    nyito_bank: number
  }
}

const INITIAL_DATA: WizardData = {
  congregationId: null,
  congregation: {
    nev: '',
    nev_hu: '',
    nev_ro: '',
    adoszam: '',
    bejegyzesiszam: '',
    cim: '',
    email: '',
    telefon: '',
    web: '',
    iban: '',
    bank: '',
    megye: '',
    varos: '',
    iranyitoszam: '',
    hazszam: '',
    country: 'Románia',
    adrlocality_id: null,
    adrstreet_id: null,
    isForeign: false,
  },
  pastor: {
    fullName: '',
    birthDate: '',
    phone: '',
    email: '',
    serviceStartedAt: '',
    previousPlaces: '',
  },
  finance: {
    eves_jarulek: 0,
    jarulek_kedvezmenyes: 0,
    jarulek_hatarid: '07-01',
    nyito_keszpenz: 0,
    nyito_bank: 0,
  },
}

// Step-ID-k 2-5 (a korábbi 1. lépés — portable licensz — kivezetve; a
// wizard_progress.current_step értékek kompatibilisek maradnak).
const STEPS = [
  { id: 2, title: 'Gyülekezet', icon: Church, description: 'Alapadatok és elérhetőség' },
  { id: 3, title: 'Lelkész', icon: User, description: 'Személyes adatok' },
  { id: 4, title: 'Pénzügy', icon: Wallet, description: 'Járulék és nyitó egyenleg' },
  { id: 5, title: 'Kész', icon: Download, description: 'Beállítás véglegesítése' },
]
const FIRST_STEP_ID = 2
const LAST_STEP_ID = 5

export function WelcomeWizardClient() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(FIRST_STEP_ID)
  const [data, setData] = useState<WizardData>(INITIAL_DATA)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // ─── Init: getWizardProgress — visszatöltés, ha van mentett állapot ───
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const result = await getWizardProgress()
      if (cancelled) return

      if ('error' in result) {
        setLoading(false)
        return
      }

      const wp = result.data
      if (wp.completed_at) {
        // Már kész a wizard → redirect a dashboard-ra
        router.replace('/dashboard')
        return
      }

      // Állapot visszatöltése
      const savedData = wp.data || {}
      setData(prev => ({
        ...prev,
        congregation: {
          ...prev.congregation,
          ...(savedData.congregation || {}),
        },
        pastor: {
          ...prev.pastor,
          ...(savedData.pastor || {}),
        },
        finance: {
          ...prev.finance,
          ...(savedData.finance || {}),
        },
      }))

      // A régi (portable) sorokban `current_step` lehet 1 — azt is FIRST_STEP_ID-re
      // korrigáljuk, hogy a wizard mindig a Gyülekezet lépésen induljon.
      const savedStep = wp.current_step || FIRST_STEP_ID
      setCurrentStep(savedStep < FIRST_STEP_ID ? FIRST_STEP_ID : savedStep)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  const updateData = (patch: Partial<WizardData>) => {
    setData(prev => ({ ...prev, ...patch }))
  }

  const saveStep = async (step: number, slotData: ServerWizardData) => {
    setSaving(true)
    try {
      const result = await saveWizardStep(step, slotData)
      if ('error' in result) {
        toast.error(`Mentés sikertelen: ${result.error}`)
        return false
      }
      return true
    } finally {
      setSaving(false)
    }
  }

  const goNext = () => setCurrentStep(s => Math.min(s + 1, LAST_STEP_ID))
  const goBack = () => setCurrentStep(s => Math.max(s - 1, FIRST_STEP_ID))

  const handleNextFromStep2 = async (congregation: WizardData['congregation']) => {
    setData(prev => ({ ...prev, congregation }))
    const ok = await saveStep(2, { congregation })
    if (ok) goNext()
  }
  const handleNextFromStep3 = async (pastor: WizardData['pastor']) => {
    setData(prev => ({ ...prev, pastor }))
    const ok = await saveStep(3, { pastor })
    if (ok) goNext()
  }
  const handleNextFromStep4 = async (finance: WizardData['finance']) => {
    setData(prev => ({ ...prev, finance }))
    const ok = await saveStep(4, { finance })
    if (ok) goNext()
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <Loader2 className="size-6 animate-spin" />
          <p className="text-sm">Állapot betöltése…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Üdvözlő fejléc (csak a legelső lépésen) */}
      {currentStep === FIRST_STEP_ID && (
        <div className="text-center">
          <h1 className="font-heading text-3xl text-slate-800 md:text-4xl">
            Üdvözlünk a KARTOTEKÁ-ban! 🎉
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
            Egy rövid varázsló vezet végig, amelyben beállítjuk a rendszert a
            gyülekezeted igényeire. Kb. 5-10 percet vesz igénybe.
            {' '}
            <span className="font-medium text-slate-700">
              Ha most kilépsz, onnan folytathatod, ahol abbahagytad.
            </span>
          </p>
        </div>
      )}

      {/* Progress bar */}
      <ProgressBar currentStep={currentStep} />

      {/* Step container — animált átmenetekkel */}
      <div className="card-raised overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={`step-${currentStep}`}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {currentStep === 2 && (
              <Step2Congregation
                data={data}
                updateData={updateData}
                onNext={handleNextFromStep2}
                onBack={goBack}
                saving={saving}
              />
            )}
            {currentStep === 3 && (
              <Step3Pastor
                data={data}
                updateData={updateData}
                onNext={handleNextFromStep3}
                onBack={goBack}
                saving={saving}
              />
            )}
            {currentStep === 4 && (
              <Step4Finance
                data={data}
                updateData={updateData}
                onNext={handleNextFromStep4}
                onBack={goBack}
                saving={saving}
              />
            )}
            {currentStep === 5 && <Step5Finish />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Help note */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <span>
            <strong>Probléma van?</strong> Írj e-mailt a{' '}
            <a
              href="mailto:support@kartoteka.erek.ro"
              className="font-semibold underline hover:no-underline"
            >
              support@kartoteka.erek.ro
            </a>{' '}
            címre, és mi személyesen végigvezetünk a beállításon.
          </span>
        </p>
      </div>
    </div>
  )
}

function ProgressBar({ currentStep }: { currentStep: number }) {
  return (
    <ol className="flex items-center justify-between gap-2">
      {STEPS.map((step, idx) => {
        const isActive = step.id === currentStep
        const isDone = step.id < currentStep
        const Icon = step.icon

        return (
          <li key={step.id} className="flex flex-1 items-center gap-2">
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                animate={{
                  scale: isActive ? 1.08 : 1,
                }}
                transition={{ type: 'spring', damping: 16, stiffness: 220 }}
                className={`flex size-11 items-center justify-center rounded-xl border-2 shadow-sm transition-colors ${
                  isActive
                    ? 'border-primary bg-primary text-white'
                    : isDone
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                      : 'border-slate-200 bg-white text-slate-400'
                }`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isDone ? (
                    <motion.span
                      key="done"
                      initial={{ scale: 0.4, opacity: 0, rotate: -60 }}
                      animate={{ scale: 1, opacity: 1, rotate: 0 }}
                      exit={{ scale: 0.4, opacity: 0 }}
                      transition={{ type: 'spring', damping: 12, stiffness: 240 }}
                    >
                      <CheckCircle2 className="size-5" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="icon"
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.6, opacity: 0 }}
                    >
                      <Icon className="size-5" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
              <div className="hidden text-center sm:block">
                <p
                  className={`text-xs font-semibold transition-colors ${
                    isActive
                      ? 'text-primary'
                      : isDone
                        ? 'text-emerald-700'
                        : 'text-slate-500'
                  }`}
                >
                  {step.title}
                </p>
                <p className="text-[10px] text-slate-400">{step.description}</p>
              </div>
            </div>
            {idx < STEPS.length - 1 && (
              <div className="mb-6 relative h-0.5 flex-1 overflow-hidden rounded bg-slate-200">
                <motion.div
                  initial={false}
                  animate={{ scaleX: isDone ? 1 : 0 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  style={{ originX: 0 }}
                  className="absolute inset-0 rounded bg-emerald-500"
                />
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
