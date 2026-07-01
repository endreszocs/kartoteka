'use client'

import { useEffect, useState } from 'react'
import { useForm, useWatch, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { memberSchema, type MemberInput } from '@/lib/validations/members'
import { saveMember, searchParent, quickCreateParentMember } from '@/app/(dashboard)/tagnyilvantartas/actions'
import { ENTRY_REASONS, ENTRY_REASON_LABELS } from '@/lib/constants/members'
import type { EnrichedMember } from '@/lib/constants/members'
import { toast } from 'sonner'
import { Check, ChevronLeft, ChevronRight, User, BookOpen, CreditCard, UserPlus, X } from 'lucide-react'

interface MemberFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editMember: EnrichedMember | null
}

// 2026-06-02: a user kérése — input mezők JOBBAN láthatóak legyenek.
// Egységes osztály minden szerkeszthető mezőre: fehér háttér, finom shadow,
// határozott szürke border. (Eddig az alap Input bg-background = transparent-szerű.)
const FIELD_CLASS = 'bg-white shadow-sm border-slate-300 focus-visible:border-emerald-400 focus-visible:ring-emerald-300/40'
const FIELD_CLASS_COMPACT = FIELD_CLASS + ' h-9'

type WizardStep = 1 | 2 | 3
const WIZARD_STEPS: { id: WizardStep; label: string; icon: typeof User }[] = [
  { id: 1, label: 'Személyes', icon: User },
  { id: 2, label: 'Anyakönyvi', icon: BookOpen },
  { id: 3, label: 'Pénzügyi', icon: CreditCard },
]

// 2026-06-10: melyik mező melyik wizard-lépésen van — validációs hibánál
// erre a lépésre ugrunk vissza, különben a hibajelzés láthatatlan maradna
// (a „nem történik semmi a mentésre" bug oka).
const STEP1_FIELDS: readonly string[] = ['csaladnev', 'k_nev', 'szcs_nev', 'ferfi', 'sz_datum', 'foglalkozas', 'vallas', 'c_helyseg_text', 'c_utca_text', 'c_szam', 'c_tombhaz', 'c_lepcsohaz', 'c_emelet', 'c_ajto', 'telefon', 'email', 'megjegyzes', 'apjaneve', 'anyjaneve', 'id_apja_cnp', 'id_anyja_cnp', 'bek_datum', 'bek_honnan', 'bek_igazolas', 'att_datum', 'att_felekezet', 'att_honnan', 'belepes_oka']
const STEP2_FIELDS: readonly string[] = ['kereszteles_datum', 'kereszteles_hely', 'kereszteles_lelkesz', 'konfirmacio_datum', 'konfirmacio_hely', 'konfirmacio_lelkesz', 'esketes_datum', 'esketes_hely', 'esketes_lelkesz', 'esketes_hazastars_nev']

export function MemberFormDialog({ open, onOpenChange, editMember }: MemberFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'choose' | 'form'>('choose')
  // 2026-06-02: wizard step + tetejétől átment lépések (visszamenni szabad)
  const [wizardStep, setWizardStep] = useState<WizardStep>(1)
  const [maxReachedStep, setMaxReachedStep] = useState<WizardStep>(1)

  // Szülő keresés
  const [parentResults, setParentResults] = useState<{ apa: ParentResult[]; anya: ParentResult[] }>({ apa: [], anya: [] })
  const [parentSearchVisible, setParentSearchVisible] = useState<{ apa: boolean; anya: boolean }>({ apa: false, anya: false })

  const { register, handleSubmit, reset, setValue, getValues, control, formState: { errors } } = useForm({
    resolver: zodResolver(memberSchema),
    defaultValues: { belepes_oka: 'alap' as const, vallas: 'Református', ferfi: true, c_szam: '1', csaladnev: '', k_nev: '', c_helyseg_text: '', c_utca_text: '' },
  })

  const belepesOka = useWatch({ control, name: 'belepes_oka' })
  // 2026-06-10: szülő-összekötés állapota (chip + gyors-rögzítés gomb)
  const apjaCnpWatch = useWatch({ control, name: 'id_apja_cnp' })
  const anyjaCnpWatch = useWatch({ control, name: 'id_anyja_cnp' })
  const apjaneveWatch = useWatch({ control, name: 'apjaneve' })
  const anyjaneveWatch = useWatch({ control, name: 'anyjaneve' })
  const [parentCreating, setParentCreating] = useState<'apa' | 'anya' | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
    if (editMember) {
      setStep('form')
      setWizardStep(1)
      setMaxReachedStep(3) // szerkesztésnél MIND lépés szabadon elérhető
      reset({
        id: editMember.id,
        csaladnev: editMember.csaladnev || '',
        k_nev: editMember.k_nev || '',
        szcs_nev: editMember.szcs_nev || '',
        ferfi: editMember.ferfi ?? true,
        sz_datum: editMember.sz_datum || '',
        foglalkozas: editMember.foglalkozas || '',
        vallas: editMember.vallas || 'Református',
        c_helyseg_text: editMember.adrlocality?.name || '',
        c_utca_text: editMember.adrstreet?.name || '',
        c_szam: editMember.c_szam || '1',
        c_tombhaz: editMember.c_tombhaz || '',
        c_lepcsohaz: editMember.c_lepcsohaz || '',
        c_emelet: editMember.c_emelet || '',
        c_ajto: editMember.c_ajto || '',
        telefon: editMember.telefon || '',
        email: editMember.email || '',
        apjaneve: editMember.apjaneve || '',
        anyjaneve: editMember.anyjaneve || '',
        megjegyzes: editMember.megjegyzes || '',
        belepes_oka: 'alap',
      })
    } else {
      setStep('choose')
      setWizardStep(1)
      setMaxReachedStep(1)
      reset({ belepes_oka: 'alap', vallas: 'Református', ferfi: true, c_szam: '1' })
    }
    setParentResults({ apa: [], anya: [] })
    setParentSearchVisible({ apa: false, anya: false })
    })
    return () => {
      cancelled = true
    }
  }, [open, editMember, reset])

  function selectEntryReason(reason: typeof ENTRY_REASONS[number]) {
    setValue('belepes_oka', reason)
    setStep('form')
  }

  async function onSubmit(data: MemberInput) {
    setLoading(true)
    const result = await saveMember(data)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(editMember ? 'Tag adatai frissítve!' : 'Új tag sikeresen rögzítve!')
      onOpenChange(false)
    }
    setLoading(false)
  }

  // 2026-06-10: ha a zod-validáció elbukik, ugorjunk a hibás mező lépésére és
  // toast-oljuk az első hibát — eddig a hiba a nem látható lépésen „ragadt".
  function onInvalid(errs: FieldErrors<MemberInput>) {
    const keys = Object.keys(errs)
    if (keys.length === 0) return
    const targetStep: WizardStep = keys.some(k => STEP1_FIELDS.includes(k)) ? 1
      : keys.some(k => STEP2_FIELDS.includes(k)) ? 2
      : 3
    setWizardStep(targetStep)
    const firstKey = keys.find(k => STEP1_FIELDS.includes(k)) || keys[0]
    const rawMsg = (errs as Record<string, { message?: string }>)[firstKey]?.message
    const msg = rawMsg && rawMsg !== 'Invalid' ? rawMsg : 'Hiányzó vagy hibás adat — ellenőrizd a pirossal jelölt mezőket.'
    toast.error(msg)
  }

  // 2026-06-10: a beírt szülő-névből minimális tagrekord + összekötés
  async function handleQuickCreateParent(type: 'apa' | 'anya') {
    const name = (getValues(type === 'apa' ? 'apjaneve' : 'anyjaneve') || '').trim()
    if (name.split(/\s+/).length < 2) {
      toast.error('A szülő teljes nevét add meg (családnév és keresztnév).')
      return
    }
    setParentCreating(type)
    const res = await quickCreateParentMember({
      name,
      isMale: type === 'apa',
      c_helyseg_text: getValues('c_helyseg_text'),
      c_utca_text: getValues('c_utca_text'),
      c_szam: getValues('c_szam'),
    })
    setParentCreating(null)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setValue(type === 'apa' ? 'id_apja_cnp' : 'id_anyja_cnp', res.cnp || '')
    toast.success('A szülő tagként rögzítve és összekötve.')
  }

  async function handleParentSearch(val: string, type: 'apa' | 'anya') {
    if (val.length < 3) {
      setParentSearchVisible(p => ({ ...p, [type]: false }))
      return
    }
    const results = await searchParent(val, type === 'apa')
    setParentResults(p => ({ ...p, [type]: results }))
    setParentSearchVisible(p => ({ ...p, [type]: results.length > 0 }))
  }

  function selectParent(result: ParentResult, type: 'apa' | 'anya') {
    const name = `${result.csaladnev} ${result.k_nev}`
    if (type === 'apa') {
      setValue('apjaneve', name)
      setValue('id_apja_cnp', result.cnp || '')
    } else {
      setValue('anyjaneve', name)
      setValue('id_anyja_cnp', result.cnp || '')
    }
    setParentSearchVisible(p => ({ ...p, [type]: false }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto p-0">
        <div className="px-6 pt-6 pb-4 border-b border-zinc-100">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">{editMember ? 'Tag adatainak módosítása' : 'Új gyülekezeti tag felvétele'}</DialogTitle>
                <p className="text-xs text-zinc-400 mt-0.5">{editMember ? 'Szerkessze a meglévő tag adatait' : 'Adja meg az új tag személyes adatait'}</p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 pt-4">

        {/* Pre-screen: belépés oka */}
        {step === 'choose' && !editMember && (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">Válassza ki a belépés okát:</p>
            {ENTRY_REASONS.map(r => (
              <Button key={r} variant="outline" className="w-full justify-start text-left h-auto py-3" onClick={() => selectEntryReason(r)}>
                <div>
                  <p className="font-semibold">{ENTRY_REASON_LABELS[r]}</p>
                  <p className="text-xs text-muted-foreground">
                    {r === 'alap' && 'Helyi, a gyülekezetben született vagy ide tartozó tag'}
                    {r === 'bekoltozott' && 'Más gyülekezetből érkezett — átjelentkezéssel'}
                    {r === 'attert' && 'Más felekezetből tért át a református egyházba'}
                  </p>
                </div>
              </Button>
            ))}
          </div>
        )}

        {/* Form — WIZARD MÓD (2026-06-02) */}
        {step === 'form' && (
          <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-3">
            {/* #Endre 2026-07-01: az `id` rejtett mező üres string ÚJ tagnál — a séma z.number().optional()-t
                vár, a Zod v4 az ""-t NEM ugorja át → "expected number, received string". setValueAs:
                üres → undefined (INSERT), különben Number (UPDATE). */}
            <input type="hidden" {...register('id', { setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)) })} />

            {/* Wizard-stepper indicator (kötelező lépés-sor) */}
            <div className="mb-1 flex items-center justify-between gap-2 sm:gap-4">
              {WIZARD_STEPS.map((s, idx) => {
                const isActive = wizardStep === s.id
                const isCompleted = wizardStep > s.id || maxReachedStep > s.id
                const isClickable = s.id <= maxReachedStep
                const Icon = s.icon
                return (
                  <div key={s.id} className="flex flex-1 items-center gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => isClickable && setWizardStep(s.id)}
                      disabled={!isClickable}
                      className={`group flex flex-1 items-center gap-2 rounded-lg border px-2 py-1.5 transition sm:px-3 sm:py-2 ${
                        isActive
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm'
                          : isCompleted
                            ? 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50/60'
                            : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                      }`}
                    >
                      <span
                        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                          isActive
                            ? 'bg-emerald-500 text-white'
                            : isCompleted
                              ? 'bg-emerald-200 text-emerald-700'
                              : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        {isCompleted && !isActive ? <Check className="size-3.5" /> : <Icon className="size-3" />}
                      </span>
                      <span className="hidden text-xs font-semibold sm:inline">{s.label}</span>
                      <span className="text-[10px] font-semibold sm:hidden">{idx + 1}/3</span>
                    </button>
                    {idx < WIZARD_STEPS.length - 1 && (
                      <div className={`hidden h-px w-4 sm:block ${maxReachedStep > s.id ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* ─────── 1. SZEMÉLYES ─────── */}
            {wizardStep === 1 && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Családnév *</Label>
                    <Input {...register('csaladnev')} placeholder="Kovács" className={FIELD_CLASS} />
                    {errors.csaladnev && <p className="text-red-500 text-xs">{errors.csaladnev.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Keresztnév *</Label>
                    <Input {...register('k_nev')} placeholder="János" className={FIELD_CLASS} />
                    {errors.k_nev && <p className="text-red-500 text-xs">{errors.k_nev.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Nem *</Label>
                    <select
                      {...register('ferfi', { setValueAs: v => v === 'true' || v === true })}
                      className={'w-full rounded-md border px-3 py-2 text-sm ' + FIELD_CLASS}
                    >
                      <option value="true">Férfi</option>
                      <option value="false">Nő</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Születési dátum</Label>
                    <Input type="date" {...register('sz_datum')} className={FIELD_CLASS} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vallás</Label>
                    <Input {...register('vallas')} placeholder="Református" className={FIELD_CLASS} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Település *</Label>
                    <Input {...register('c_helyseg_text')} placeholder="Kovászna" className={FIELD_CLASS} />
                    {errors.c_helyseg_text && <p className="text-red-500 text-xs">{errors.c_helyseg_text.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Utca *</Label>
                    <Input {...register('c_utca_text')} placeholder="Fő utca" className={FIELD_CLASS} />
                    {errors.c_utca_text && <p className="text-red-500 text-xs">{errors.c_utca_text.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Házszám</Label>
                    <Input {...register('c_szam')} placeholder="1" className={FIELD_CLASS} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Foglalkozás</Label>
                    <Input {...register('foglalkozas')} className={FIELD_CLASS} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Telefon</Label>
                    <Input {...register('telefon')} type="tel" className={FIELD_CLASS} />
                  </div>
                  {/* 2026-06-10: az e-mail eddig hiányzott az űrlapról, pedig a séma
                      validálja — importált hibás címnél láthatatlanul akadt el a mentés. */}
                  <div className="space-y-1.5">
                    <Label>E-mail</Label>
                    <Input {...register('email')} type="email" className={FIELD_CLASS} placeholder="pelda@email.hu" />
                    {errors.email && <p className="text-red-500 text-xs">{errors.email.message}</p>}
                  </div>
                </div>

                {/* Szülő keresés */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(['apa', 'anya'] as const).map(type => (
                    <div key={type} className="space-y-1.5 relative">
                      <Label>Édes{type === 'apa' ? 'apa' : 'anya'} neve</Label>
                      <Input
                        {...register(type === 'apa' ? 'apjaneve' : 'anyjaneve')}
                        placeholder={`Keresés... (3+ karakter)`}
                        className={FIELD_CLASS}
                        onChange={e => {
                          register(type === 'apa' ? 'apjaneve' : 'anyjaneve').onChange(e)
                          handleParentSearch(e.target.value, type)
                        }}
                      />
                      <input type="hidden" {...register(type === 'apa' ? 'id_apja_cnp' : 'id_anyja_cnp')} />
                      {parentSearchVisible[type] && parentResults[type].length > 0 && (
                        <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                          {parentResults[type].map(r => (
                            <div key={r.id} className="p-2 hover:bg-slate-50 cursor-pointer text-sm border-b last:border-0" onClick={() => selectParent(r, type)}>
                              <div className="font-medium">{r.csaladnev} {r.k_nev}</div>
                              <div className="text-xs text-muted-foreground">
                                {r.sz_datum ? `${new Date().getFullYear() - new Date(r.sz_datum).getFullYear()} éves` : '?'} · {r.adrlocality?.name || ''} {r.adrstreet?.name || ''} {r.c_szam || ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* 2026-06-10: összekötés-státusz — szabad szöveg is elég, de a
                          családfához érdemes a szülőt tagként rögzíteni és összekötni. */}
                      {(type === 'apa' ? apjaCnpWatch : anyjaCnpWatch) ? (
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                          <Check className="size-3.5" /> Összekötve tagrekorddal
                          <button
                            type="button"
                            className="ml-0.5 text-slate-400 transition hover:text-slate-600"
                            onClick={() => setValue(type === 'apa' ? 'id_apja_cnp' : 'id_anyja_cnp', '')}
                            aria-label="Összekötés törlése"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ) : ((type === 'apa' ? apjaneveWatch : anyjaneveWatch) || '').trim().split(/\s+/).length >= 2 ? (
                        <button
                          type="button"
                          disabled={parentCreating === type}
                          onClick={() => handleQuickCreateParent(type)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 transition hover:underline disabled:opacity-50"
                          title={`Létrehoz egy ÚJ tagrekordot a beírt névvel (${type === 'apa' ? 'édesapa' : 'édesanya'}), a most szerkesztett tag címét örökölve, és ${type === 'apa' ? 'apaként' : 'anyaként'} összeköti vele. Ha a szülő MÁR tag, inkább a fenti keresőből válaszd ki. (A cím legyen kitöltve, mert a szülő azt örökli.)`}
                        >
                          <UserPlus className="size-3" />
                          {parentCreating === type ? 'Rögzítés…' : 'Nincs a tagok között? Rögzítés tagként + összekötés'}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>

                {belepesOka === 'bekoltozott' && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                    <h4 className="text-sm font-semibold text-blue-900">Beköltözés részletei</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div><Label className="text-xs">Dátum</Label><Input type="date" {...register('bek_datum')} className={FIELD_CLASS_COMPACT} /></div>
                      <div><Label className="text-xs">Honnan</Label><Input {...register('bek_honnan')} className={FIELD_CLASS_COMPACT} placeholder="Település" /></div>
                    </div>
                    <div><Label className="text-xs">Igazolás</Label><Input {...register('bek_igazolas')} className={FIELD_CLASS_COMPACT} /></div>
                  </div>
                )}
                {belepesOka === 'attert' && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-2">
                    <h4 className="text-sm font-semibold text-orange-900">Áttérés részletei</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div><Label className="text-xs">Dátum</Label><Input type="date" {...register('att_datum')} className={FIELD_CLASS_COMPACT} /></div>
                      <div><Label className="text-xs">Korábbi felekezet</Label><Input {...register('att_felekezet')} className={FIELD_CLASS_COMPACT} /></div>
                      <div><Label className="text-xs">Honnan</Label><Input {...register('att_honnan')} className={FIELD_CLASS_COMPACT} /></div>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Megjegyzés</Label>
                  <textarea
                    {...register('megjegyzes')}
                    className={'w-full rounded-md border px-3 py-2 text-sm min-h-[60px] resize-y ' + FIELD_CLASS}
                  />
                </div>
              </div>
            )}

            {/* ─────── 2. ANYAKÖNYVI ─────── */}
            {wizardStep === 2 && (
              <div className="space-y-3 pt-2">
                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 space-y-2">
                  <h4 className="text-sm font-semibold text-blue-900">Keresztelés</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div><Label className="text-xs">Dátum</Label><Input type="date" {...register('kereszteles_datum')} className={FIELD_CLASS_COMPACT} /></div>
                    <div><Label className="text-xs">Hely</Label><Input {...register('kereszteles_hely')} className={FIELD_CLASS_COMPACT} placeholder="Település/templom" /></div>
                    <div><Label className="text-xs">Lelkész</Label><Input {...register('kereszteles_lelkesz')} className={FIELD_CLASS_COMPACT} /></div>
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
                  <h4 className="text-sm font-semibold text-emerald-900">Konfirmáció</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div><Label className="text-xs">Dátum</Label><Input type="date" {...register('konfirmacio_datum')} className={FIELD_CLASS_COMPACT} /></div>
                    <div><Label className="text-xs">Hely</Label><Input {...register('konfirmacio_hely')} className={FIELD_CLASS_COMPACT} placeholder="Település/templom" /></div>
                    <div><Label className="text-xs">Lelkész</Label><Input {...register('konfirmacio_lelkesz')} className={FIELD_CLASS_COMPACT} /></div>
                  </div>
                </div>

                {/* 2026-06-02: ESKETÉS — eddig hiányzott! */}
                <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 space-y-2">
                  <h4 className="text-sm font-semibold text-rose-900">Esketés</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div><Label className="text-xs">Dátum</Label><Input type="date" {...register('esketes_datum')} className={FIELD_CLASS_COMPACT} /></div>
                    <div><Label className="text-xs">Hely</Label><Input {...register('esketes_hely')} className={FIELD_CLASS_COMPACT} placeholder="Település/templom" /></div>
                    <div><Label className="text-xs">Lelkész</Label><Input {...register('esketes_lelkesz')} className={FIELD_CLASS_COMPACT} /></div>
                  </div>
                  <div>
                    <Label className="text-xs">Házastárs neve</Label>
                    <Input
                      {...register('esketes_hazastars_nev')}
                      className={FIELD_CLASS_COMPACT}
                      placeholder="Pl. Kovács Mária"
                    />
                    <p className="mt-0.5 text-[10.5px] text-rose-700/70">
                      Csak név — a kapcsolat összekötése az Anyakönyv → Esketés modulban történik
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ─────── 3. PÉNZÜGYI ─────── */}
            {wizardStep === 3 && (
              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <Label>Fizetési státusz</Label>
                  <select
                    {...register('fizeto_status')}
                    className={'w-full rounded-md border px-3 py-2 text-sm ' + FIELD_CLASS}
                  >
                    <option value="fizet">Fizető</option>
                    <option value="felmentett">Felmentett</option>
                    <option value="nem_fizet">Nem fizet (18 év alatti)</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    A pontos járulékösszeg és kedvezmények a Pénzügy modulban állíthatóak.
                  </p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900">
                  <strong>Utolsó lépés!</strong> Ellenőrizd a megadott adatokat, majd kattints
                  a „Tag mentése” gombra. Az alapadatok mellett a megadott anyakönyvi események
                  rögzítődnek a megfelelő modulokban.
                </div>
              </div>
            )}

            {/* Wizard navigáció — alsó footer */}
            <div className="flex flex-wrap gap-2 pt-3 sm:pt-4 border-t border-zinc-100">
              {wizardStep === 1 ? (
                !editMember && (
                  <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setStep('choose')}>
                    <ChevronLeft className="mr-1 size-4" /> Vissza
                  </Button>
                )
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-xl"
                  onClick={() => setWizardStep((s) => Math.max(1, s - 1) as WizardStep)}
                >
                  <ChevronLeft className="mr-1 size-4" /> Vissza
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600"
                onClick={() => onOpenChange(false)}
              >
                Mégse
              </Button>
              {wizardStep < 3 ? (
                <Button
                  type="button"
                  className="flex-[1.5] rounded-xl bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => {
                    const next = Math.min(3, wizardStep + 1) as WizardStep
                    setWizardStep(next)
                    setMaxReachedStep((m) => (next > m ? next : m))
                  }}
                >
                  Tovább <ChevronRight className="ml-1 size-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-[2] rounded-xl bg-emerald-600 hover:bg-emerald-700"
                >
                  {loading ? 'Mentés...' : editMember ? 'Módosítások mentése' : 'Tag mentése'}
                </Button>
              )}
            </div>
          </form>
        )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Szülő keresés eredmény típus
interface ParentResult {
  id: number
  csaladnev: string
  k_nev: string
  cnp: string | null
  sz_datum: string | null
  c_szam: string | null
  adrlocality: { name: string } | null
  adrstreet: { name: string } | null
}
