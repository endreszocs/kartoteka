'use client'

/**
 * Egyházmegye setup wizard — az egyházmegye alapadatainak kötelező bevitele.
 *
 * Mikor jelenik meg:
 *   - Automatikusan az egyházmegyei dashboard első betöltéskor, ha az
 *     egyházmegye alapadatai még hiányoznak (lásd checkDioceseSetupStatus).
 *   - Kattintásra a globális DioceseSetupBanner-ből (minden oldalon).
 *
 * 5 lépéses (mindent ki kell tölteni):
 *   1. Alapadatok + címer feltöltés
 *   2. Cím
 *   3. Elérhetőségek
 *   4. Bank + vezetés
 *   5. Megerősítés + mentés
 *
 * A wizard az X gombbal bezárható — ekkor a banner marad, és a lelkész
 * bármikor újra elindíthatja.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ArrowRight, Building2, CheckCircle2, FileText, Image as ImageIcon,
  Landmark, Loader2, MapPin, Phone, Save, Upload, Users, X, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModalField } from '@/components/ui/modal-field'
import { Badge } from '@/components/ui/badge'
import { AddressForm, type AddressValue } from '@/components/ui/address-form'
import {
  getDiocese, saveDioceseSetup, saveDioceseSetupStep, uploadDioceseCimer,
  type DioceseRecord,
} from '@/app/(dashboard)/dashboard-egyhazmegye/diocese-actions'

type WizardStep = 'basics' | 'address' | 'contact' | 'bank-leadership' | 'confirm'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  dioceseId: string
  onCompleted?: () => void | Promise<void>
}

interface SetupFormState {
  name: string
  cif: string
  adoszam: string
  cimer_url: string
  cim_orszag: string
  cim_megye: string
  cim_telepules: string
  cim_iranyitoszam: string
  cim_utca: string
  email: string
  telefon: string
  weboldal: string
  bank_nev: string
  bank_fo_iban: string
  bank_fo_iban_valuta: string
  esperes_nev: string
  esperes_cim: string
  jegyzo_nev: string
  // Új cím FK-k (2026-04-21)
  adrlocality_id: number | null
  adrstreet_id: number | null
  isForeign: boolean
}

type SetForm = (f: SetupFormState) => void

const STEP_ORDER: WizardStep[] = ['basics', 'address', 'contact', 'bank-leadership', 'confirm']

// Pure step-validáció — a wizard kliens ÉS az init ugyanazt használja
// (így a betöltés után meg tudja mondani, melyik az első hiányos lépés).
function isStepValidOn(s: WizardStep, form: SetupFormState): boolean {
  if (s === 'basics')
    return form.name.length >= 2 && form.cif.trim().length > 0 && form.cimer_url.trim().length > 0
  if (s === 'address')
    return (
      form.cim_orszag.trim().length > 0 &&
      form.cim_megye.trim().length > 0 &&
      form.cim_telepules.trim().length > 0 &&
      form.cim_iranyitoszam.trim().length > 0 &&
      form.cim_utca.trim().length > 0
    )
  if (s === 'contact')
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) && form.telefon.trim().length > 0
  if (s === 'bank-leadership')
    return (
      form.bank_nev.trim().length > 0 &&
      form.bank_fo_iban.trim().length > 0 &&
      form.esperes_nev.trim().length >= 2 &&
      form.esperes_cim.trim().length >= 2 &&
      form.jegyzo_nev.trim().length >= 2
    )
  if (s === 'confirm')
    return STEP_ORDER.slice(0, -1).every((st) => isStepValidOn(st, form))
  return false
}

// Melyik mezőket ment a partial-save action az adott lépésen?
function stepFields(s: WizardStep, form: SetupFormState): Record<string, unknown> {
  switch (s) {
    case 'basics':
      return {
        name: form.name,
        cif: form.cif,
        adoszam: form.adoszam,
        cimer_url: form.cimer_url,
      }
    case 'address':
      return {
        cim_orszag: form.cim_orszag,
        cim_megye: form.cim_megye,
        cim_telepules: form.cim_telepules,
        cim_iranyitoszam: form.cim_iranyitoszam,
        cim_utca: form.cim_utca,
        adrlocality_id: form.adrlocality_id,
        adrstreet_id: form.adrstreet_id,
      }
    case 'contact':
      return {
        email: form.email,
        telefon: form.telefon,
        weboldal: form.weboldal,
      }
    case 'bank-leadership':
      return {
        bank_nev: form.bank_nev,
        bank_fo_iban: form.bank_fo_iban,
        bank_fo_iban_valuta: form.bank_fo_iban_valuta,
        esperes_nev: form.esperes_nev,
        esperes_cim: form.esperes_cim,
        jegyzo_nev: form.jegyzo_nev,
      }
    default:
      return {}
  }
}

// ────────────────────────────────────────────────────────────────────
// AddressValue ↔ SetupFormState átalakítás
// (a diocese-nek nincs külön `hazszam` — a cim_utca-ba kombinálva)
// ────────────────────────────────────────────────────────────────────

function formToAddressValue(form: SetupFormState): AddressValue {
  // A cim_utca + (nincs hazszam külön) → street + houseNumber = csak street
  return {
    countyId: null,
    localityId: form.adrlocality_id,
    streetId: form.adrstreet_id,
    country: form.cim_orszag || 'Románia',
    county: form.cim_megye || '',
    locality: form.cim_telepules || '',
    street: form.cim_utca || '',
    houseNumber: '', // a diocese-nél nincs külön mező, a cim_utca tartalmazhatja
    postalcode: form.cim_iranyitoszam || '',
    isForeign: form.isForeign || false,
  }
}

function applyAddressToForm(form: SetupFormState, v: AddressValue): SetupFormState {
  // Ha van házszám, hozzácsapjuk az utcához (a diocese-táblán egy mező van)
  const combinedStreet = v.houseNumber
    ? `${v.street} ${v.houseNumber}`.trim()
    : v.street
  return {
    ...form,
    cim_orszag: v.country,
    cim_megye: v.county,
    cim_telepules: v.locality,
    cim_utca: combinedStreet,
    cim_iranyitoszam: v.postalcode,
    adrlocality_id: v.localityId,
    adrstreet_id: v.streetId,
    isForeign: v.isForeign,
  }
}

export function DioceseSetupWizard({ open, onOpenChange, dioceseId, onCompleted }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<WizardStep>('basics')
  const [loading, setLoading] = useState(true)

  // Forma állapot
  const [form, setForm] = useState<SetupFormState>({
    name: '',
    cif: '',
    adoszam: '',
    cimer_url: '',
    cim_orszag: 'Románia',
    cim_megye: '',
    cim_telepules: '',
    cim_iranyitoszam: '',
    cim_utca: '',
    email: '',
    telefon: '',
    weboldal: '',
    bank_nev: '',
    bank_fo_iban: '',
    bank_fo_iban_valuta: 'RON',
    esperes_nev: '',
    esperes_cim: 'esperes',
    jegyzo_nev: '',
    adrlocality_id: null,
    adrstreet_id: null,
    isForeign: false,
  })

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [stepSaving, setStepSaving] = useState(false)

  // Betöltés: meglévő adatok előtöltése + folytatás-logika
  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      void getDiocese(dioceseId).then((res) => {
        if (cancelled) return
        if (res.data) {
          const d = res.data
          const loadedForm: SetupFormState = {
            name: d.name || '',
            cif: d.cif || '',
            adoszam: d.adoszam || '',
            cimer_url: d.cimer_url || '',
            cim_orszag: d.cim_orszag || 'Románia',
            cim_megye: d.cim_megye || '',
            cim_telepules: d.cim_telepules || '',
            cim_iranyitoszam: d.cim_iranyitoszam || '',
            cim_utca: d.cim_utca || '',
            email: d.email || '',
            telefon: d.telefon || '',
            weboldal: d.weboldal || '',
            bank_nev: d.bank_nev || '',
            bank_fo_iban: d.bank_fo_iban || '',
            bank_fo_iban_valuta: d.bank_fo_iban_valuta || 'RON',
            esperes_nev: d.esperes_nev || '',
            esperes_cim: d.esperes_cim || 'esperes',
            jegyzo_nev: d.jegyzo_nev || '',
            adrlocality_id: d.adrlocality_id,
            adrstreet_id: d.adrstreet_id,
            isForeign: (d.cim_orszag && d.cim_orszag !== 'Románia') || false,
          }
          setForm(loadedForm)

          // Folytatás-logika: az első hiányos lépésre ugrunk
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
  }, [open, dioceseId])

  // Lépés szerinti validáció (kliens oldali — a pure isStepValidOn-t használjuk)
  function isStepValid(s: WizardStep): boolean {
    return isStepValidOn(s, form)
  }

  async function handleNext() {
    if (stepSaving) return
    const idx = STEP_ORDER.indexOf(step)
    if (idx >= STEP_ORDER.length - 1) return

    // Partial save — a lelkész kilépéskor nem veszít adatot
    setStepSaving(true)
    try {
      const res = await saveDioceseSetupStep({
        id: dioceseId,
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
    const res = await uploadDioceseCimer(dioceseId, fd)
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
      const res = await saveDioceseSetup({ id: dioceseId, ...form })
      if (res.error) {
        toast.error(res.error)
        if (res.fieldErrors) setFieldErrors(res.fieldErrors)
        return
      }
      toast.success('Egyházmegye beállítva! 🎉', { duration: 4000 })
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
          border border-violet-200 bg-gradient-to-br from-white via-white to-violet-50/20
          rounded-2xl flex flex-col
        "
      >
        <DialogHeader className="shrink-0 border-b border-violet-100 bg-white/70 px-6 py-4 rounded-t-2xl">
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="font-heading text-xl text-slate-800 flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
                <Building2 className="size-5" />
              </span>
              <span>
                Egyházmegye beállítása
                <p className="text-xs text-zinc-400 font-normal mt-0.5">
                  Az alapadatok kitöltése — a hivatalos dokumentumokhoz szükséges
                </p>
              </span>
            </DialogTitle>
          </div>

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
                        ? 'bg-violet-600 text-white ring-4 ring-violet-200'
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
              className="h-full bg-gradient-to-r from-violet-500 to-purple-600 transition-all"
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
                />
              )}
              {step === 'address' && <StepAddress form={form} setForm={setForm} fieldErrors={fieldErrors} />}
              {step === 'contact' && <StepContact form={form} setForm={setForm} fieldErrors={fieldErrors} />}
              {step === 'bank-leadership' && (
                <StepBankLeadership form={form} setForm={setForm} fieldErrors={fieldErrors} />
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
              className="rounded-xl bg-violet-600 text-white hover:bg-violet-700"
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
              className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700"
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
  form, setForm, onCimerUpload, uploading, fieldErrors,
}: {
  form: SetupFormState
  setForm: SetForm
  onCimerUpload: (ev: React.ChangeEvent<HTMLInputElement>) => void
  uploading: boolean
  fieldErrors: Record<string, string>
}) {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="card-raised p-4 bg-violet-50/30 border-violet-100">
        <div className="flex items-start gap-2">
          <FileText className="size-5 text-violet-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading text-base text-slate-800">Alapadatok + címer</h3>
            <p className="text-xs text-slate-600 mt-1">
              Az egyházmegye hivatalos neve, adóazonosító (CIF), és egy címer-kép.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <ModalField label="Egyházmegye neve *">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Pl. Erdélyi Református Egyházkerület"
          />
          {fieldErrors.name && <p className="text-xs text-rose-600 mt-1">{fieldErrors.name}</p>}
        </ModalField>
        <ModalField label="CIF (adóazonosító) *">
          <Input
            value={form.cif}
            onChange={(e) => setForm({ ...form, cif: e.target.value })}
            placeholder="Pl. 12345678"
          />
          {fieldErrors.cif && <p className="text-xs text-rose-600 mt-1">{fieldErrors.cif}</p>}
        </ModalField>
      </div>

      <ModalField label="Magyar adószám (opcionális)">
        <Input
          value={form.adoszam}
          onChange={(e) => setForm({ ...form, adoszam: e.target.value })}
          placeholder="Ha van magyar adószám is"
        />
      </ModalField>

      {/* Címer feltöltés */}
      <div className="card-raised p-4 bg-indigo-50/30 border-indigo-200">
        <p className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
          <ImageIcon className="size-4 text-indigo-600" />
          Egyházmegyei címer *
        </p>
        <p className="text-xs text-slate-500 mb-3">
          Tölts fel egy képet (JPG, PNG, vagy WEBP, max 2 MB). A címer a hivatalos
          dokumentumokon (számadás, költségvetés, nyugták) jelenik meg.
        </p>
        {form.cimer_url ? (
          <div className="flex items-start gap-3">
            <img src={form.cimer_url} alt="Egyházmegyei címer" className="size-24 rounded-xl border border-slate-200 object-cover" />
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
              Hivatalos postacím — a megye és helység a hivatalos romániai
              adatbázisból választható; az irányítószám automatikusan kitöltődik
              az utca alapján.
            </p>
          </div>
        </div>
      </div>

      <AddressForm
        value={formToAddressValue(form)}
        onChange={(v) => setForm(applyAddressToForm(form, v))}
        lang="hu"
        showCountryAlways
        errors={{
          country: fieldErrors.cim_orszag,
          county: fieldErrors.cim_megye,
          locality: fieldErrors.cim_telepules,
          street: fieldErrors.cim_utca,
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
            <p className="text-xs text-slate-600 mt-1">Az egyházmegye hivatalos kontakt adatai.</p>
          </div>
        </div>
      </div>

      <ModalField label="E-mail *">
        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="pl. office@egyhazmegye.ro" />
        {fieldErrors.email && <p className="text-xs text-rose-600 mt-1">{fieldErrors.email}</p>}
      </ModalField>

      <ModalField label="Telefon *">
        <Input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} placeholder="pl. +40 267 123 456" />
      </ModalField>

      <ModalField label="Weboldal (opcionális)">
        <Input value={form.weboldal} onChange={(e) => setForm({ ...form, weboldal: e.target.value })} placeholder="https://..." />
      </ModalField>
    </div>
  )
}

function StepBankLeadership({
  form, setForm, fieldErrors,
}: { form: SetupFormState; setForm: SetForm; fieldErrors: Record<string, string> }) {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="card-raised p-4 bg-teal-50/30 border-teal-100">
        <div className="flex items-start gap-2">
          <Landmark className="size-5 text-teal-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading text-base text-slate-800">Bank + vezetés</h3>
            <p className="text-xs text-slate-600 mt-1">
              A fő bankszámla és a jelenlegi esperes + jegyző neve (a dokumentumokon megjelenik).
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1.2fr_2fr_0.8fr]">
        <ModalField label="Bank neve *">
          <Input value={form.bank_nev} onChange={(e) => setForm({ ...form, bank_nev: e.target.value })} placeholder="Pl. BCR" />
        </ModalField>
        <ModalField label="IBAN *">
          <Input value={form.bank_fo_iban} onChange={(e) => setForm({ ...form, bank_fo_iban: e.target.value })} placeholder="RO..." className="font-mono text-xs" />
        </ModalField>
        <ModalField label="Valuta">
          <select
            value={form.bank_fo_iban_valuta}
            onChange={(e) => setForm({ ...form, bank_fo_iban_valuta: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="RON">RON</option>
            <option value="EUR">EUR</option>
            <option value="HUF">HUF</option>
            <option value="USD">USD</option>
          </select>
        </ModalField>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <div className="flex items-center gap-2 mb-3">
          <Users className="size-4 text-amber-600" />
          <p className="text-sm font-semibold text-slate-800">Vezetés</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <ModalField label="Esperes neve *">
            <Input value={form.esperes_nev} onChange={(e) => setForm({ ...form, esperes_nev: e.target.value })} />
          </ModalField>
          <ModalField label="Esperes címe *">
            <Input value={form.esperes_cim} onChange={(e) => setForm({ ...form, esperes_cim: e.target.value })} placeholder="esperes / esperesi megbízott" />
          </ModalField>
          <ModalField label="Egyházmegyei jegyző *">
            <Input value={form.jegyzo_nev} onChange={(e) => setForm({ ...form, jegyzo_nev: e.target.value })} />
          </ModalField>
        </div>
      </div>
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
            <p className="font-heading text-lg text-slate-800">{form.name}</p>
            <p className="text-xs text-slate-500">CIF: <strong>{form.cif}</strong>{form.adoszam && <> · Adószám: <strong>{form.adoszam}</strong></>}</p>
          </div>
        </div>
      )}

      <SummaryRow icon={<MapPin className="size-4 text-sky-600" />} label="Cím">
        {form.cim_iranyitoszam} {form.cim_telepules}, {form.cim_utca} ({form.cim_megye}, {form.cim_orszag})
      </SummaryRow>
      <SummaryRow icon={<Phone className="size-4 text-emerald-600" />} label="Elérhetőségek">
        {form.email} · {form.telefon}{form.weboldal && <> · <a href={form.weboldal} target="_blank" rel="noopener" className="underline">{form.weboldal}</a></>}
      </SummaryRow>
      <SummaryRow icon={<Landmark className="size-4 text-teal-600" />} label="Bank">
        {form.bank_nev} · <span className="font-mono text-xs">{form.bank_fo_iban}</span> <Badge className="bg-slate-100 text-slate-700 border-0 ml-1 text-[10px]">{form.bank_fo_iban_valuta}</Badge>
      </SummaryRow>
      <SummaryRow icon={<Users className="size-4 text-amber-600" />} label="Vezetés">
        {form.esperes_nev} ({form.esperes_cim}) · Jegyző: {form.jegyzo_nev}
      </SummaryRow>

      <div className="card-raised p-3 bg-amber-50/40 border-amber-200">
        <div className="flex items-start gap-2">
          <AlertCircle className="size-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900">
            <strong>Mi történik a mentés után?</strong> Az egyházmegyei alapadatok elmentődnek, és a rendszer automatikusan létrehozza az idei évre az éves konfigurációt. Utána azonnal használható lesz a pénzügyi modul.
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
