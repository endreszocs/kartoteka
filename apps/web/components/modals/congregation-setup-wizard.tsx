'use client'

/**
 * Gyülekezeti setup wizard — a gyülekezet alapadatainak kötelező bevitele.
 *
 * Mikor jelenik meg:
 *   - Automatikusan a /dashboard első betöltéskor, ha a gyülekezet alapadatai
 *     még hiányoznak (lásd checkCongregationSetupStatus).
 *   - Kattintásra a globális CongregationSetupBanner-ből (minden oldalon).
 *
 * 5 lépéses (mindent ki kell tölteni):
 *   1. Alapadatok + címer feltöltés
 *   2. Cím (megye, város, utca+házszám)
 *   3. Elérhetőségek (email, telefon, weboldal)
 *   4. Bank (bank név, IBAN)
 *   5. Megerősítés + mentés
 *
 * A wizard az X gombbal bezárható — ekkor a banner marad, és a lelkész
 * bármikor újra elindíthatja.
 */

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ArrowRight, Church, CheckCircle2, FileText, Image as ImageIcon,
  Landmark, Loader2, MapPin, Phone, Save, Upload, X, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModalField } from '@/components/ui/modal-field'
import { Badge } from '@/components/ui/badge'
import { AddressForm, EMPTY_ADDRESS, type AddressValue } from '@/components/ui/address-form'
import {
  getCongregationForSetup,
  saveCongregationSetup,
  saveCongregationSetupStep,
  uploadCongregationCimer,
} from '@/app/(dashboard)/congregation/actions'

type WizardStep = 'basics' | 'address' | 'contact' | 'bank' | 'confirm'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  congregationId: string
  onCompleted?: () => void | Promise<void>
}

interface SetupFormState {
  nev_hu: string
  nev_ro: string
  nev_en: string
  adoszam: string
  cimer_url: string
  megye: string
  varos: string
  cim: string
  email: string
  telefon: string
  web: string
  bank: string
  iban: string
  // Új cím-mezők (2026-04-21)
  iranyitoszam: string
  hazszam: string
  country: string
  adrlocality_id: number | null
  adrstreet_id: number | null
  isForeign: boolean
}

type SetForm = (f: SetupFormState) => void

const STEP_ORDER: WizardStep[] = ['basics', 'address', 'contact', 'bank', 'confirm']

// Pure step-validáció — a wizard kliens ÉS az init ugyanazt használja
// (így a betöltés után meg tudja mondani, melyik az első hiányos lépés).
function isStepValidOn(s: WizardStep, form: SetupFormState): boolean {
  // FIX 2026-05-04: a címer-kötelezőség levéve (Endre kérése). A wizard
  // tovább engedi enélkül; később bármikor feltölthető a Gyülekezetünk
  // dialógusban. Hasonlóan a cím (utca) is opcionális — csak a megye + város
  // kötelező (sok kis falusi gyülekezetnél nincs külön utcanév).
  if (s === 'basics')
    return form.nev_hu.length >= 2 && form.adoszam.trim().length > 0
  if (s === 'address')
    return form.megye.trim().length > 0 && form.varos.trim().length > 0
  if (s === 'contact')
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) && form.telefon.trim().length > 0
  if (s === 'bank')
    return form.bank.trim().length > 0 && form.iban.trim().length > 0
  if (s === 'confirm')
    return STEP_ORDER.slice(0, -1).every((st) => isStepValidOn(st, form))
  return false
}

// Melyik mezőket ment a partial-save action az adott lépésen?
// Megjegyzés: a "Partial<SetupFormState>" típust direkt `Record`-ként adjuk, hogy
// a save-step-action minden új mezőjét is vehessük.
function stepFields(s: WizardStep, form: SetupFormState): Record<string, unknown> {
  switch (s) {
    case 'basics':
      return {
        nev_hu: form.nev_hu,
        nev_ro: form.nev_ro,
        nev_en: form.nev_en,
        adoszam: form.adoszam,
        cimer_url: form.cimer_url,
      }
    case 'address':
      return {
        megye: form.megye,
        varos: form.varos,
        cim: form.cim,
        iranyitoszam: form.iranyitoszam,
        hazszam: form.hazszam,
        country: form.country,
        adrlocality_id: form.adrlocality_id,
        adrstreet_id: form.adrstreet_id,
      }
    case 'contact':
      return { email: form.email, telefon: form.telefon, web: form.web }
    case 'bank':
      return { bank: form.bank, iban: form.iban }
    default:
      return {}
  }
}

// ────────────────────────────────────────────────────────────────────
// Segédfunkciók — AddressValue ↔ SetupFormState átalakítás
// ────────────────────────────────────────────────────────────────────

function formToAddressValue(form: SetupFormState): AddressValue {
  return {
    countyId: null,                      // A county_id a megyenéven keresztül nincs tárolva — a helység-alapú match-re bízzuk
    localityId: form.adrlocality_id,
    streetId: form.adrstreet_id,
    country: form.country || 'Románia',
    county: form.megye || '',
    locality: form.varos || '',
    street: form.cim || '',
    houseNumber: form.hazszam || '',
    postalcode: form.iranyitoszam || '',
    isForeign: form.isForeign || false,
  }
}

function applyAddressToForm(form: SetupFormState, v: AddressValue): SetupFormState {
  return {
    ...form,
    country: v.country,
    megye: v.county,
    varos: v.locality,
    cim: v.street,
    hazszam: v.houseNumber,
    iranyitoszam: v.postalcode,
    adrlocality_id: v.localityId,
    adrstreet_id: v.streetId,
    isForeign: v.isForeign,
  }
}

export function CongregationSetupWizard({ open, onOpenChange, congregationId, onCompleted }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<WizardStep>('basics')
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState<SetupFormState>({
    nev_hu: '',
    nev_ro: '',
    nev_en: '',
    adoszam: '',
    cimer_url: '',
    megye: '',
    varos: '',
    cim: '',
    email: '',
    telefon: '',
    web: '',
    bank: '',
    iban: '',
    iranyitoszam: '',
    hazszam: '',
    country: 'Románia',
    adrlocality_id: null,
    adrstreet_id: null,
    isForeign: false,
  })

  // Read-only kontextus: egyházkerület + egyházmegye név, már mentett bankszámlák
  const [context, setContext] = useState<{
    dioceseName: string | null
    districtName: string | null
    existingBankCount: number
  }>({
    dioceseName: null,
    districtName: null,
    existingBankCount: 0,
  })

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [stepSaving, setStepSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      void getCongregationForSetup(congregationId).then((res) => {
        if (cancelled) return
        if (res.data) {
          const d = res.data
          const loadedForm: SetupFormState = {
            nev_hu: d.nev_hu || '',
            nev_ro: d.nev_ro || '',
            nev_en: d.nev_en || '',
            adoszam: d.adoszam || '',
            cimer_url: d.cimer_url || '',
            megye: d.megye || '',
            varos: d.varos || '',
            cim: d.cim || '',
            email: d.email || '',
            telefon: d.telefon || '',
            web: d.web || '',
            bank: d.bank || '',
            iban: d.iban || '',
            iranyitoszam: d.iranyitoszam || '',
            hazszam: d.hazszam || '',
            country: d.country || 'Románia',
            adrlocality_id: d.adrlocality_id,
            adrstreet_id: d.adrstreet_id,
            isForeign: (d.country && d.country !== 'Románia') || false,
          }
          setForm(loadedForm)
          setContext({
            dioceseName: d.diocese_name,
            districtName: d.district_name,
            existingBankCount: d.existing_bank_count,
          })

          // Folytatás-logika: az első olyan lépésre ugrunk, amelyik még
          // hiányos. Ha mindenki teljes, akkor a confirm-re.
          const firstInvalid =
            STEP_ORDER.slice(0, -1).find((s) => !isStepValidOn(s, loadedForm)) ||
            'confirm'
          setStep(firstInvalid)
        } else {
          setStep('basics')
        }
        setLoading(false)
      })
    })
    return () => { cancelled = true }
  }, [open, congregationId])

  function isStepValid(s: WizardStep): boolean {
    return isStepValidOn(s, form)
  }

  async function handleNext() {
    if (stepSaving) return
    const idx = STEP_ORDER.indexOf(step)
    if (idx >= STEP_ORDER.length - 1) return

    // Partial save — a lelkész kilépéskor NEM veszít adatot
    setStepSaving(true)
    try {
      const res = await saveCongregationSetupStep({
        id: congregationId,
        ...stepFields(step, form),
      })
      if (res.error) {
        toast.error(`Mentés sikertelen: ${res.error}`)
        return
      }
      setStep(STEP_ORDER[idx + 1])
    } finally {
      setStepSaving(false)
    }
  }

  function handleBack() {
    const idx = STEP_ORDER.indexOf(step)
    if (idx > 0) setStep(STEP_ORDER[idx - 1])
  }

  async function handleCimerUpload(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await uploadCongregationCimer(congregationId, fd)
    setUploading(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    if (res.url) {
      setForm({ ...form, cimer_url: res.url })
      toast.success('Címer feltöltve.')
    }
  }

  function handleSave() {
    setFieldErrors({})
    startTransition(async () => {
      const res = await saveCongregationSetup({ id: congregationId, ...form })
      if (res.error) {
        toast.error(res.error)
        if (res.fieldErrors) setFieldErrors(res.fieldErrors)
        return
      }
      toast.success('Gyülekezet beállítva! 🎉', { duration: 4000 })
      if (onCompleted) await onCompleted()
      onOpenChange(false)
      router.refresh()
    })
  }

  const progressPercent = ((STEP_ORDER.indexOf(step) + 1) / STEP_ORDER.length) * 100

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          !w-[96vw] !max-w-[96vw] sm:!max-w-[min(900px,96vw)]
          !h-[92vh] !max-h-[92vh]
          overflow-hidden p-0 gap-0
          border border-teal-200 bg-gradient-to-br from-white via-white to-teal-50/20
          rounded-2xl flex flex-col
        "
      >
        <DialogHeader className="shrink-0 border-b border-teal-100 bg-white/70 px-6 py-4 rounded-t-2xl">
          <DialogTitle className="font-heading text-xl text-slate-800 flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm">
              <Church className="size-5" />
            </span>
            <span>
              Gyülekezet beállítása
              <p className="text-xs text-zinc-400 font-normal mt-0.5">
                Az alapadatok kitöltése — a hivatalos dokumentumokhoz szükséges
              </p>
            </span>
          </DialogTitle>

          {/* Progressz */}
          <div className="flex items-center gap-2 mt-3 text-xs">
            {STEP_ORDER.map((s, idx) => {
              const isActive = s === step
              const isDone = STEP_ORDER.indexOf(step) > idx
              return (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div
                    className={`size-6 rounded-full flex items-center justify-center text-[10px] font-bold transition ${
                      isActive
                        ? 'bg-teal-600 text-white ring-4 ring-teal-200'
                        : isDone
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="size-3" /> : idx + 1}
                  </div>
                  {idx < STEP_ORDER.length - 1 && (
                    <div className={`h-px flex-1 ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-2 h-1 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-emerald-600 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              <Loader2 className="inline-block size-6 animate-spin mb-2" />
              <p>Betöltés…</p>
            </div>
          ) : (
            <>
              {step === 'basics' && (
                <StepBasics
                  form={form}
                  setForm={setForm}
                  onCimerUpload={handleCimerUpload}
                  uploading={uploading}
                  fieldErrors={fieldErrors}
                  dioceseName={context.dioceseName}
                  districtName={context.districtName}
                />
              )}
              {step === 'address' && <StepAddress form={form} setForm={setForm} fieldErrors={fieldErrors} />}
              {step === 'contact' && <StepContact form={form} setForm={setForm} fieldErrors={fieldErrors} />}
              {step === 'bank' && (
                <StepBank
                  form={form}
                  setForm={setForm}
                  fieldErrors={fieldErrors}
                  existingBankCount={context.existingBankCount}
                />
              )}
              {step === 'confirm' && <StepConfirm form={form} />}
            </>
          )}
        </div>

        {/* Léptető gombok */}
        <div className="shrink-0 border-t border-zinc-100 bg-zinc-50/50 px-6 py-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={step === 'basics' ? () => onOpenChange(false) : handleBack}
            disabled={isPending || stepSaving}
            className="rounded-xl"
          >
            {step === 'basics' ? (
              <>
                <X className="mr-1 size-4" />
                Később
              </>
            ) : (
              <>
                <ArrowLeft className="mr-1 size-4" />
                Vissza
              </>
            )}
          </Button>

          {step !== 'confirm' ? (
            <Button
              type="button"
              onClick={handleNext}
              disabled={!isStepValid(step) || isPending || stepSaving}
              className="rounded-xl bg-teal-600 text-white hover:bg-teal-700"
            >
              {stepSaving ? (
                <>
                  <Loader2 className="mr-1 size-4 animate-spin" />
                  Mentés…
                </>
              ) : (
                <>
                  Tovább
                  <ArrowRight className="ml-1 size-4" />
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSave}
              disabled={isPending || !isStepValid('confirm')}
              className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white hover:from-teal-700 hover:to-emerald-700"
            >
              {isPending ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <Save className="mr-1 size-4" />
              )}
              Mentés és befejezés
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Lépések
// ─────────────────────────────────────────────────────────────────────────

function StepBasics({
  form, setForm, onCimerUpload, uploading, fieldErrors, dioceseName, districtName,
}: {
  form: SetupFormState
  setForm: SetForm
  onCimerUpload: (ev: React.ChangeEvent<HTMLInputElement>) => void
  uploading: boolean
  fieldErrors: Record<string, string>
  dioceseName: string | null
  districtName: string | null
}) {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="card-raised p-4 bg-teal-50/30 border-teal-100">
        <div className="flex items-start gap-2">
          <FileText className="size-5 text-teal-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading text-base text-slate-800">Alapadatok + címer</h3>
            <p className="text-xs text-slate-600 mt-1">
              A gyülekezet hivatalos neve, adószám, és a címer-kép.
            </p>
          </div>
        </div>
      </div>

      {/* Read-only kontextus: Egyházkerület + Egyházmegye */}
      <div className="card-raised p-4 bg-sky-50/40 border-sky-200">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-100">
            <Landmark className="size-4 text-sky-700" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
              Egyházi hovatartozás
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Egyházkerület</p>
                <p className="text-sm font-semibold text-slate-800">
                  {districtName || (
                    <span className="italic text-slate-400">nincs beállítva</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Egyházmegye</p>
                <p className="text-sm font-semibold text-slate-800">
                  {dioceseName || (
                    <span className="italic text-slate-400">nincs beállítva</span>
                  )}
                </p>
              </div>
            </div>
            {(!districtName || !dioceseName) && (
              <p className="text-[11px] text-sky-900/70 italic pt-1">
                A hiányzó hozzárendelést a rendszergazda állíthatja be az Admin panelen.
              </p>
            )}
          </div>
        </div>
      </div>

      <ModalField label="Magyar név *">
        <Input
          value={form.nev_hu}
          onChange={(e) => setForm({ ...form, nev_hu: e.target.value })}
          placeholder="Pl. Barátosi Református Egyházközség"
        />
        {fieldErrors.nev_hu && <p className="text-xs text-rose-600 mt-1">{fieldErrors.nev_hu}</p>}
      </ModalField>

      <div className="grid gap-3 md:grid-cols-2">
        <ModalField label="Román név (opcionális)">
          <Input
            value={form.nev_ro}
            onChange={(e) => setForm({ ...form, nev_ro: e.target.value })}
            placeholder="Pl. Parohia Reformată Brateș"
          />
        </ModalField>
        <ModalField label="Angol név (opcionális)">
          <Input
            value={form.nev_en}
            onChange={(e) => setForm({ ...form, nev_en: e.target.value })}
            placeholder="Pl. Brateș Reformed Parish"
          />
        </ModalField>
      </div>

      <ModalField label="Adószám / CIF *">
        <Input
          value={form.adoszam}
          onChange={(e) => setForm({ ...form, adoszam: e.target.value })}
          placeholder="Pl. 12345678"
        />
        {fieldErrors.adoszam && <p className="text-xs text-rose-600 mt-1">{fieldErrors.adoszam}</p>}
      </ModalField>

      {/* Címer feltöltés */}
      <div className="card-raised p-4 bg-indigo-50/30 border-indigo-200">
        <p className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
          <ImageIcon className="size-4 text-indigo-600" />
          Gyülekezeti címer
          <span className="text-[10px] font-normal text-slate-400">(opcionális — később is feltöltheted)</span>
        </p>
        <p className="text-xs text-slate-500 mb-3">
          Tölts fel egy képet (JPG, PNG, vagy WEBP, max 2 MB). A címer a hivatalos
          dokumentumokon (számadás, költségvetés, nyugták) jelenik meg. Ha még nincs
          kéznél, kihagyhatod — a Gyülekezetünk dialógusban később bármikor feltöltheted.
        </p>
        {form.cimer_url ? (
          <div className="flex items-start gap-3">
            <img src={form.cimer_url} alt="Gyülekezeti címer" className="size-24 rounded-xl border border-slate-200 object-cover" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">✅ Címer feltöltve</p>
              <p className="text-[10px] text-slate-400 truncate">{form.cimer_url}</p>
              <label className="mt-2 inline-flex items-center gap-1.5 cursor-pointer text-xs text-indigo-700 hover:text-indigo-900">
                <Upload className="size-3.5" />
                Másik feltöltése
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onCimerUpload} disabled={uploading} />
              </label>
            </div>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-300 bg-white/50 p-6 cursor-pointer hover:bg-indigo-50/40 transition">
            <Upload className="size-5 text-indigo-600" />
            <span className="text-sm font-medium text-indigo-700">
              {uploading ? 'Feltöltés…' : 'Kattints ide a címer feltöltéséhez'}
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onCimerUpload} disabled={uploading} />
          </label>
        )}
        {fieldErrors.cimer_url && <p className="text-xs text-rose-600 mt-2">{fieldErrors.cimer_url}</p>}
      </div>
    </div>
  )
}

function StepAddress({
  form, setForm, fieldErrors,
}: { form: SetupFormState; setForm: SetForm; fieldErrors: Record<string, string> }) {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="card-raised p-4 bg-sky-50/30 border-sky-100">
        <div className="flex items-start gap-2">
          <MapPin className="size-5 text-sky-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading text-base text-slate-800">Cím</h3>
            <p className="text-xs text-slate-600 mt-1">
              Hivatalos postacím — a nyugtákon, számadáson megjelenik. A megye és
              helység a hivatalos romániai adatbázisból választható; az irányítószám
              automatikusan kitöltődik.
            </p>
          </div>
        </div>
      </div>

      <AddressForm
        value={formToAddressValue(form)}
        onChange={(v) => setForm(applyAddressToForm(form, v))}
        lang="hu"
        errors={{
          county: fieldErrors.megye,
          locality: fieldErrors.varos,
          street: fieldErrors.cim,
        }}
      />
    </div>
  )
}

function StepContact({
  form, setForm, fieldErrors,
}: { form: SetupFormState; setForm: SetForm; fieldErrors: Record<string, string> }) {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="card-raised p-4 bg-emerald-50/30 border-emerald-100">
        <div className="flex items-start gap-2">
          <Phone className="size-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading text-base text-slate-800">Elérhetőségek</h3>
            <p className="text-xs text-slate-600 mt-1">A gyülekezet hivatalos kontakt adatai.</p>
          </div>
        </div>
      </div>

      <ModalField label="E-mail *">
        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="pl. lelkeszi.hivatal@gyulekezet.ro" />
        {fieldErrors.email && <p className="text-xs text-rose-600 mt-1">{fieldErrors.email}</p>}
      </ModalField>

      <ModalField label="Telefon *">
        <Input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} placeholder="pl. +40 267 123 456" />
      </ModalField>

      <ModalField label="Weboldal (opcionális)">
        <Input value={form.web} onChange={(e) => setForm({ ...form, web: e.target.value })} placeholder="https://..." />
      </ModalField>
    </div>
  )
}

function StepBank({
  form, setForm, fieldErrors, existingBankCount,
}: {
  form: SetupFormState
  setForm: SetForm
  fieldErrors: Record<string, string>
  existingBankCount: number
}) {
  const alreadyFilled = form.bank.trim().length > 0 && form.iban.trim().length > 0

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="card-raised p-4 bg-teal-50/30 border-teal-100">
        <div className="flex items-start gap-2">
          <Landmark className="size-5 text-teal-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading text-base text-slate-800">Bankszámla</h3>
            <p className="text-xs text-slate-600 mt-1">
              A fő bankszámla adatai. (További bankszámlákat a Pénzügy fülön adhatsz hozzá.)
            </p>
          </div>
        </div>
      </div>

      {/* Vizuális visszajelzés — már meglévő adat */}
      {alreadyFilled && (
        <div className="card-raised p-3 bg-emerald-50/50 border-emerald-200">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-900">
              <p className="font-semibold">A fő bankszámla adatai már be vannak állítva.</p>
              <p className="mt-0.5 text-emerald-800">
                Alább ellenőrizheted és szerkesztheted.
                {existingBankCount > 1 && (
                  <> A gyülekezetnek {existingBankCount} aktív bankszámlája van — a többi a Pénzügy fülön kezelhető.</>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      <ModalField label="Bank neve *">
        <Input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} placeholder="Pl. BCR" />
        {fieldErrors.bank && <p className="text-xs text-rose-600 mt-1">{fieldErrors.bank}</p>}
      </ModalField>

      <ModalField label="IBAN *">
        <Input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="RO..." className="font-mono text-xs" />
        {fieldErrors.iban && <p className="text-xs text-rose-600 mt-1">{fieldErrors.iban}</p>}
      </ModalField>
    </div>
  )
}

function StepConfirm({ form }: { form: SetupFormState }) {
  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div className="card-raised p-4 bg-emerald-50/30 border-emerald-200">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading text-base text-slate-800">Összefoglaló</h3>
            <p className="text-xs text-slate-600 mt-1">Ellenőrizd az adatokat, majd kattints a &bdquo;Mentés és befejezés&rdquo; gombra.</p>
          </div>
        </div>
      </div>

      {form.cimer_url && (
        <div className="flex items-center gap-3 card-raised p-3">
          <img src={form.cimer_url} alt="Címer" className="size-16 rounded-xl border border-slate-200 object-cover" />
          <div>
            <p className="font-heading text-lg text-slate-800">{form.nev_hu}</p>
            {form.nev_ro && <p className="text-xs text-slate-500 italic">{form.nev_ro}</p>}
            <p className="text-xs text-slate-500">Adószám: <strong>{form.adoszam}</strong></p>
          </div>
        </div>
      )}

      <SummaryRow icon={<MapPin className="size-4 text-sky-600" />} label="Cím">
        {form.cim}, {form.varos} ({form.megye})
      </SummaryRow>
      <SummaryRow icon={<Phone className="size-4 text-emerald-600" />} label="Elérhetőségek">
        {form.email} · {form.telefon}{form.web && <> · <a href={form.web} target="_blank" rel="noopener" className="underline">{form.web}</a></>}
      </SummaryRow>
      <SummaryRow icon={<Landmark className="size-4 text-teal-600" />} label="Bank">
        {form.bank} · <span className="font-mono text-xs">{form.iban}</span> <Badge className="bg-slate-100 text-slate-700 border-0 ml-1 text-[10px]">RON</Badge>
      </SummaryRow>

      <div className="card-raised p-3 bg-amber-50/40 border-amber-200">
        <div className="flex items-start gap-2">
          <AlertCircle className="size-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900">
            <strong>Mi történik a mentés után?</strong> A gyülekezeti alapadatok elmentődnek. A teljes rendszer (pénzügy, tagnyilvántartás, stb.) készen áll a használatra.
          </p>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="card-raised p-3 flex items-start gap-2 text-sm">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
        <p className="text-slate-700 break-words mt-0.5">{children}</p>
      </div>
    </div>
  )
}
