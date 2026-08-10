'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Church, Download, Info, Loader2, Mail, User, Wallet } from 'lucide-react'
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
import { SupportEmailDialog } from './support-email-dialog'
import {
  type BankAccountSlot,
} from './wizard/_helpers/bank-accounts-section'
import {
  type ServiceHistorySlot,
} from './wizard/_helpers/service-history-section'
import {
  type DiscountPeriodSlot,
  type AgeDiscountSlot,
  type OccupationDiscountSlot,
  createDefaultAgeDiscount,
} from './wizard/_helpers/fee-discounts-section'
import {
  type PastYearSlot,
  buildPastYearsList,
} from './wizard/_helpers/past-years-section'

// A wizard teljes kliens-oldali állapota (web-only, M6.3 óta).
// A korábbi standalone (portable) Step 1 (licensz-aktiválás) kivezetve 2026-04-22.
// 2026-05-05: bankAccounts[], serviceHistory[], discountPeriods[], ageDiscount,
// pastYears[] strukturált bővítés.
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
    // Megj.: 2026-05-05 — a `iban` és `bank` mezők már nem használtak a
    // wizardból (a bankszámlák a `bankAccounts` tömbbe mennek). Marad a
    // típuson backward-compat miatt, de nem írunk rá a UI-ból.
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

  // Step 2 — Banki adatok (új, multi-bankszámla)
  bankAccounts: BankAccountSlot[]

  // Step 3 — Lelkész
  pastor: {
    fullName: string
    birthDate: string
    phone: string
    email: string
    serviceStartedAt: string
    /**
     * @deprecated 2026-05-05 — a `serviceHistory[]` strukturált tömb váltja le.
     * Megőrizve a wizard_progress.data jsonb backward-compat miatt.
     */
    previousPlaces: string
  }

  // Step 3 — Szolgálati előzmények (új, multi-row)
  serviceHistory: ServiceHistorySlot[]

  // Step 4 — Pénzügy
  finance: {
    eves_jarulek: number
    jarulek_kedvezmenyes: number
    jarulek_hatarid: string
    /** Tartozás-számítási mód: 'akkori' (default) vagy 'aktualis'. */
    tartozas_szamitas_mod: 'akkori' | 'aktualis'
  }

  // Step 4 — Kedvezmények és múlt évek (új)
  discountPeriods: DiscountPeriodSlot[]
  ageDiscount: AgeDiscountSlot
  occupationDiscounts: OccupationDiscountSlot[]
  pastYears: PastYearSlot[]
}

const CURRENT_YEAR = new Date().getFullYear()

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
  bankAccounts: [],
  pastor: {
    fullName: '',
    birthDate: '',
    phone: '',
    email: '',
    serviceStartedAt: '',
    previousPlaces: '',
  },
  serviceHistory: [],
  finance: {
    eves_jarulek: 0,
    jarulek_kedvezmenyes: 0,
    // 2026-06-04: a teljes-összegre vonatkozó fizetési határidőt a wizardból
    // eltávolítottuk — alapértelmezetten egész évben fizethető (12-31). A
    // határidő csak a kedvezményes időszakoknál releváns (periódusonként).
    jarulek_hatarid: '12-31',
    tartozas_szamitas_mod: 'akkori',
  },
  discountPeriods: [],
  ageDiscount: createDefaultAgeDiscount(),
  occupationDiscounts: [],
  pastYears: buildPastYearsList(CURRENT_YEAR, 5),
}

// Step-ID-k 2-5 (a korábbi 1. lépés — portable licensz — kivezetve; a
// wizard_progress.current_step értékek kompatibilisek maradnak).
const STEPS = [
  { id: 2, title: 'Gyülekezet', icon: Church, description: 'Alapadatok és elérhetőség' },
  { id: 3, title: 'Lelkész', icon: User, description: 'Személyes adatok' },
  { id: 4, title: 'Pénzügy', icon: Wallet, description: 'Járulék és nyitó egyenleg' },
  { id: 5, title: 'Kész', icon: Download, description: 'Beállítás véglegesítése' },
]
// Rövid flow (2026-06-05): ha a gyülekezetet egy korábbi lelkész már beállította,
// az új felhasználó csak a SAJÁT adatait adja meg (Lelkész), majd átnézheti a
// gyülekezeti adatokat (Adatok ellenőrzése — Step 2, előre kitöltve, opcionális),
// végül Kész. A Pénzügy lépés kimarad (a meglévő gyülekezeti értékből pótlódik).
const SHORT_FLOW_STEPS = [
  { id: 3, title: 'Saját adatok', icon: User, description: 'Személyes adataid' },
  { id: 2, title: 'Adatok ellenőrzése', icon: Church, description: 'Gyülekezeti adatok — opcionális' },
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
  const [supportOpen, setSupportOpen] = useState(false)
  // 2026-06-05: ha a gyülekezetet egy korábbi lelkész már beállította, az új
  // felhasználónak csak a saját (Lelkész) lépését kell kitöltenie — a
  // Gyülekezet (2) + Pénzügy (4) lépést kihagyjuk.
  const [congregationConfigured, setCongregationConfigured] = useState(false)

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

      const congConfigured = result.congregationConfigured === true
      setCongregationConfigured(congConfigured)

      const wp = result.data
      if (wp.completed_at) {
        // Már kész a wizard → redirect a dashboard-ra
        router.replace('/dashboard')
        return
      }

      // Állapot visszatöltése
      const savedData = (wp.data || {}) as Partial<WizardData>
      setData(prev => ({
        ...prev,
        congregation: {
          ...prev.congregation,
          ...(savedData.congregation || {}),
        },
        bankAccounts:
          Array.isArray(savedData.bankAccounts) && savedData.bankAccounts.length > 0
            ? (savedData.bankAccounts as BankAccountSlot[])
            : prev.bankAccounts,
        pastor: {
          ...prev.pastor,
          ...(savedData.pastor || {}),
        },
        serviceHistory:
          Array.isArray(savedData.serviceHistory)
            ? (savedData.serviceHistory as ServiceHistorySlot[])
            : prev.serviceHistory,
        finance: {
          ...prev.finance,
          ...(savedData.finance || {}),
        },
        discountPeriods:
          Array.isArray(savedData.discountPeriods)
            ? (savedData.discountPeriods as DiscountPeriodSlot[])
            : prev.discountPeriods,
        ageDiscount: savedData.ageDiscount
          ? { ...prev.ageDiscount, ...savedData.ageDiscount }
          : prev.ageDiscount,
        occupationDiscounts:
          Array.isArray(savedData.occupationDiscounts)
            ? (savedData.occupationDiscounts as OccupationDiscountSlot[])
            : prev.occupationDiscounts,
        pastYears:
          Array.isArray(savedData.pastYears) && savedData.pastYears.length > 0
            ? (savedData.pastYears as PastYearSlot[])
            : prev.pastYears,
      }))

      // A régi (portable) sorokban `current_step` lehet 1 — azt is FIRST_STEP_ID-re
      // korrigáljuk, hogy a wizard mindig a Gyülekezet lépésen induljon.
      const savedStep = wp.current_step || FIRST_STEP_ID
      let initialStep = savedStep < FIRST_STEP_ID ? FIRST_STEP_ID : savedStep
      // Rövid flow (konfigurált gyülekezet): csak a 3 / 2 / 5 lépés érvényes —
      // bármi mást (pl. a kihagyott Pénzügy 4-et) a Saját adatok (3) lépésre
      // korrigálunk.
      if (congConfigured && ![3, 2, LAST_STEP_ID].includes(initialStep)) {
        initialStep = 3
      }
      setCurrentStep(initialStep)
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

  // Aktív lépések: rövid flow esetén (konfigurált gyülekezet) Saját adatok (3) →
  // Adatok ellenőrzése (2) → Kész (5); egyébként mind a négy.
  const activeSteps = congregationConfigured ? SHORT_FLOW_STEPS : STEPS
  const firstActiveStepId = activeSteps[0].id

  const goNext = () =>
    setCurrentStep(s => {
      const i = activeSteps.findIndex(st => st.id === s)
      return activeSteps[Math.min(i + 1, activeSteps.length - 1)]?.id ?? s
    })
  const goBack = () =>
    setCurrentStep(s => {
      const i = activeSteps.findIndex(st => st.id === s)
      return i <= 0 ? s : activeSteps[i - 1].id
    })

  const handleNextFromStep2 = async (
    congregation: WizardData['congregation'],
    bankAccounts: BankAccountSlot[],
  ) => {
    setData(prev => ({ ...prev, congregation, bankAccounts }))
    const ok = await saveStep(2, { congregation, bankAccounts })
    if (ok) goNext()
  }
  const handleNextFromStep3 = async (
    pastor: WizardData['pastor'],
    serviceHistory: ServiceHistorySlot[],
  ) => {
    setData(prev => ({ ...prev, pastor, serviceHistory }))
    const ok = await saveStep(3, { pastor, serviceHistory })
    if (ok) goNext()
  }
  const handleNextFromStep4 = async (
    finance: WizardData['finance'],
    discountPeriods: DiscountPeriodSlot[],
    ageDiscount: AgeDiscountSlot,
    occupationDiscounts: OccupationDiscountSlot[],
    pastYears: PastYearSlot[],
  ) => {
    setData(prev => ({
      ...prev,
      finance,
      discountPeriods,
      ageDiscount,
      occupationDiscounts,
      pastYears,
    }))
    const ok = await saveStep(4, {
      finance,
      discountPeriods,
      ageDiscount,
      occupationDiscounts,
      pastYears,
    })
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
      {/* Brand fejléc minden lépésen — Kartotéka logó + cím */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-3">
          <Image
            src="/KARTOTEKA_V3.png"
            alt="Kartotéka"
            width={64}
            height={64}
            priority
            className="size-12 md:size-16"
          />
          <div className="text-left">
            <p className="font-heading text-xl text-slate-800 md:text-2xl">
              KARTOTÉKA
            </p>
            <p className="text-xs text-slate-500 md:text-sm">
              Egyházi nyilvántartó rendszer
            </p>
          </div>
        </div>
      </div>

      {/* Üdvözlő szöveg (csak a legelső aktív lépésen) */}
      {currentStep === firstActiveStepId && (
        <div className="text-center">
          <h1 className="font-heading text-2xl text-slate-800 md:text-3xl">
            Üdvözlünk! 🎉
          </h1>
          {congregationConfigured ? (
            <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
              A gyülekezet adatait egy korábbi lelkész már beállította, így neked
              {' '}
              <span className="font-medium text-slate-700">
                csak a saját adataidat kell megadnod
              </span>
              . Utána átnézheted a gyülekezeti adatokat is, és ha valami kimaradt,
              ott ki tudod egészíteni — pár perc az egész.
            </p>
          ) : (
            <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
              Egy rövid varázsló vezet végig, amelyben beállítjuk a rendszert a
              gyülekezeted igényeire. Kb. 5-10 percet vesz igénybe.
              {' '}
              <span className="font-medium text-slate-700">
                Ha most kilépsz, onnan folytathatod, ahol abbahagytad.
              </span>
            </p>
          )}
        </div>
      )}

      {/* Progress bar */}
      <ProgressBar currentStep={currentStep} steps={activeSteps} />

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
                reviewMode={congregationConfigured}
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

      {/* Help note — gomb nyitja a support-email-modalt */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p>
              <strong>Probléma van?</strong> Írj e-mailt a rendszergazdának, és
              személyesen végigvezetünk a beállításon.
            </p>
            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              className="mt-2 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100"
            >
              <Mail className="size-4" />
              <span>Üzenet a rendszergazdának</span>
            </button>
          </div>
        </div>
      </div>

      <SupportEmailDialog
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        defaultSubject={`Kartotéka — segítség a beállító varázslóhoz (${currentStep}. lépés)`}
      />
    </div>
  )
}

function ProgressBar({
  currentStep,
  steps = STEPS,
}: {
  currentStep: number
  steps?: typeof STEPS
}) {
  // Index-alapú állapot (a rövid flow sorrendje nem növekvő id szerinti: 3→2→5).
  const currentIndex = steps.findIndex(s => s.id === currentStep)
  return (
    <ol className="flex items-center justify-between gap-2">
      {steps.map((step, idx) => {
        const isActive = idx === currentIndex
        const isDone = currentIndex >= 0 && idx < currentIndex
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
                    // 2026-08-11: `text-white` → `text-primary-foreground`. A
                    // sötét témák `--primary-foreground`-ja mostantól sötét
                    // tinta (AA a világosabb primaryn); a hardkódolt fehér itt
                    // 2,43:1-re esett volna vissza.
                    ? 'border-primary bg-primary text-primary-foreground'
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
            {idx < steps.length - 1 && (
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
