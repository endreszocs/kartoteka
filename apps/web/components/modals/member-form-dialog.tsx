'use client'

import { useEffect, useState } from 'react'
import { useForm, useWatch, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { memberSchema, type MemberFormValues, type MemberInput } from '@/lib/validations/members'
import { saveMember, searchParent } from '@/app/(dashboard)/tagnyilvantartas/actions'
import { AvatarEditorDialog } from '@/components/modals/avatar-editor-dialog'
import { ENTRY_REASONS, ENTRY_REASON_LABELS } from '@/lib/constants/members'
import type { EnrichedMember } from '@/lib/constants/members'
import { toast } from 'sonner'
import {
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  MapPin,
  ShieldCheck,
  User,
  X,
} from 'lucide-react'

interface MemberFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editMember: EnrichedMember | null
}

// 2026-06-02: a user kérése — input mezők JOBBAN láthatóak legyenek.
// Egységes osztály minden szerkeszthető mezőre: fehér háttér, finom shadow,
// határozott szürke border. (Eddig az alap Input bg-background = transparent-szerű.)
const FIELD_CLASS = 'min-h-11 rounded-xl bg-white shadow-sm border-slate-300 focus-visible:border-emerald-400 focus-visible:ring-emerald-300/40'
const FIELD_CLASS_COMPACT = FIELD_CLASS + ' h-11'

type WizardStep = 1 | 2 | 3
const WIZARD_STEPS: { id: WizardStep; label: string; icon: typeof User }[] = [
  { id: 1, label: 'Személyes', icon: User },
  { id: 2, label: 'Anyakönyvi', icon: BookOpen },
  { id: 3, label: 'Pénzügyi', icon: CreditCard },
]

// 2026-06-10: melyik mező melyik wizard-lépésen van — validációs hibánál
// erre a lépésre ugrunk vissza, különben a hibajelzés láthatatlan maradna
// (a „nem történik semmi a mentésre" bug oka).
const STEP1_FIELDS: readonly (keyof MemberFormValues)[] = ['csaladnev', 'k_nev', 'szcs_nev', 'ferfi', 'sz_datum', 'sz_hely_text', 'foglalkozas', 'vallas', 'c_helyseg_text', 'c_utca_text', 'c_szam', 'c_tombhaz', 'c_lepcsohaz', 'c_emelet', 'c_ajto', 'telefon', 'email', 'megjegyzes', 'apjaneve', 'anyjaneve', 'id_apja_cnp', 'id_anyja_cnp', 'bek_datum', 'bek_honnan', 'bek_igazolas', 'att_datum', 'att_felekezet', 'att_honnan', 'belepes_oka']
const STEP2_FIELDS: readonly (keyof MemberFormValues)[] = ['kereszteles_datum', 'kereszteles_hely', 'kereszteles_lelkesz', 'konfirmacio_datum', 'konfirmacio_hely', 'konfirmacio_lelkesz', 'esketes_datum', 'esketes_hely', 'esketes_lelkesz', 'esketes_hazastars_nev']

export function MemberFormDialog({ open, onOpenChange, editMember }: MemberFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'choose' | 'form'>('choose')
  // 2026-06-02: wizard step + tetejétől átment lépések (visszamenni szabad)
  const [wizardStep, setWizardStep] = useState<WizardStep>(1)
  const [maxReachedStep, setMaxReachedStep] = useState<WizardStep>(1)

  // Szülő keresés
  const [parentResults, setParentResults] = useState<{ apa: ParentResult[]; anya: ParentResult[] }>({ apa: [], anya: [] })
  const [parentSearchVisible, setParentSearchVisible] = useState<{ apa: boolean; anya: boolean }>({ apa: false, anya: false })

  const { register, handleSubmit, reset, setValue, control, trigger, formState: { errors } } = useForm<MemberFormValues, unknown, MemberInput>({
    resolver: zodResolver(memberSchema),
    defaultValues: { belepes_oka: 'alap' as const, vallas: '', c_szam: '1', csaladnev: '', k_nev: '', c_helyseg_text: '', c_utca_text: '' },
  })

  // A profilkép-szerkesztő KÜLÖN, portálolt dialógus — így az ott lévő gombok
  // (letöltés/mentés) sosem a tag-űrlapot küldik be. A közösségi linket az űrlap
  // menti; a dialógus a kép mentésekor a jelenlegi linket kapja (nincs felülírás).
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)
  const watchedSocial = useWatch({ control, name: 'social_profil_url' })

  const belepesOka = useWatch({ control, name: 'belepes_oka' })
  // Szülő-összekötés állapota.
  const apjaCnpWatch = useWatch({ control, name: 'id_apja_cnp' })
  const anyjaCnpWatch = useWatch({ control, name: 'id_anyja_cnp' })

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
        ferfi: editMember.ferfi ?? undefined,
        sz_datum: editMember.sz_datum || '',
        sz_hely_text: editMember.birthLocality?.name || '',
        foglalkozas: editMember.foglalkozas || '',
        vallas: editMember.vallas || '',
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
        id_apja_cnp: editMember.id_apja || '',
        id_anyja_cnp: editMember.id_anyja || '',
        megjegyzes: editMember.megjegyzes || '',
        belepes_oka: 'alap',
        // #1: GDPR + közösségi link előtöltése (biztonságos — a getMembers már betölti ezeket,
        // így a mentés nem törli a meglévő hozzájárulást).
        gdpr_consent: !!editMember.gdpr_consent_at,
        photo_consent: editMember.photo_consent ?? false,
        mailing_consent: editMember.mailing_consent ?? false,
        social_profil_url: editMember.social_profil_url || '',
      })
    } else {
      setStep('choose')
      setWizardStep(1)
      setMaxReachedStep(1)
      reset({ belepes_oka: 'alap', vallas: '', ferfi: undefined, sz_datum: '', sz_hely_text: '', c_szam: '1', gdpr_consent: false, photo_consent: false, mailing_consent: false, social_profil_url: '' })
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
  function onInvalid(errs: FieldErrors<MemberFormValues>) {
    const keys = Object.keys(errs) as (keyof MemberFormValues)[]
    if (keys.length === 0) return
    const targetStep: WizardStep = keys.some(k => STEP1_FIELDS.includes(k)) ? 1
      : keys.some(k => STEP2_FIELDS.includes(k)) ? 2
      : 3
    setWizardStep(targetStep)
    const firstKey = keys.find(k => STEP1_FIELDS.includes(k)) || keys[0]
    const rawMsg = (errs as Record<string, { message?: string }>)[String(firstKey)]?.message
    const msg = rawMsg && rawMsg !== 'Invalid' ? rawMsg : 'Hiányzó vagy hibás adat — ellenőrizd a pirossal jelölt mezőket.'
    toast.error(msg)
  }

  async function advanceWizard() {
    const fields = wizardStep === 1 ? STEP1_FIELDS : STEP2_FIELDS
    const valid = await trigger(fields, { shouldFocus: true })
    if (!valid) {
      toast.error('Ellenőrizd a pirossal jelölt mezőket, mielőtt továbblépsz.')
      return
    }

    const next = Math.min(3, wizardStep + 1) as WizardStep
    setWizardStep(next)
    setMaxReachedStep((current) => (next > current ? next : current))
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
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-0 left-0 grid h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-none p-0 sm:top-1/2 sm:left-1/2 sm:h-[min(90dvh,56rem)] sm:max-h-[min(90dvh,56rem)] sm:w-[calc(100%-2rem)] sm:max-w-4xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.75rem] [&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3 [&_[data-slot=dialog-close]]:size-11">
        <div className="border-b border-border bg-background/95 px-4 pt-[max(1rem,env(safe-area-inset-top))] pr-16 pb-4 sm:px-6 sm:pt-6 sm:pr-20">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-[0_10px_24px_-12px_rgba(5,150,105,0.9)]">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <div className="min-w-0">
                <DialogTitle className="truncate font-heading text-lg sm:text-xl">{editMember ? 'Tag adatainak módosítása' : 'Új gyülekezeti tag felvétele'}</DialogTitle>
                <DialogDescription className="mt-1 line-clamp-2 text-xs sm:text-sm">
                  {editMember ? 'A személyes, anyakönyvi és pénzügyi adatok áttekinthető szerkesztése.' : 'Először a biztos azonosításhoz szükséges adatokat rögzítjük.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-col">

        {/* Pre-screen: belépés oka */}
        {step === 'choose' && !editMember && (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">Válassza ki a belépés okát:</p>
            {ENTRY_REASONS.map(r => (
              <Button key={r} variant="outline" className="h-auto min-h-14 w-full justify-start rounded-xl py-3 text-left" onClick={() => selectEntryReason(r)}>
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
          <form
            onSubmit={handleSubmit(onSubmit, onInvalid)}
            onKeyDown={(e) => {
              // Wizard-űrlap: az Enter egy szöveges mezőben NE küldje be az űrlapot.
              const el = e.target as HTMLElement
              if (e.key === 'Enter' && el.tagName === 'INPUT') e.preventDefault()
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* #Endre 2026-07-01: az `id` rejtett mező üres string ÚJ tagnál — a séma z.number().optional()-t
                vár, a Zod v4 az ""-t NEM ugorja át → "expected number, received string". setValueAs:
                üres → undefined (INSERT), különben Number (UPDATE). */}
            <input type="hidden" {...register('id', { setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)) })} />

            {/* Görgethető tartalom — a gombok (footer) MINDIG az ablak alján maradnak */}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pt-4 pb-3 sm:px-6 sm:pt-5">

            {/* Wizard-stepper indicator (kötelező lépés-sor) */}
            <div className="mb-1 flex items-center justify-between gap-2 sm:gap-4" aria-label="Rögzítési lépések">
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
                      aria-current={isActive ? 'step' : undefined}
                      className={`group flex min-h-11 flex-1 items-center gap-2 rounded-xl border px-2 py-1.5 transition sm:px-3 sm:py-2 ${
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
              <div className="space-y-4 pt-2">
                <section className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 via-background to-background p-4 shadow-[0_18px_42px_-36px_rgba(5,150,105,0.7)] sm:p-5">
                  <div className="mb-4 flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <ShieldCheck className="size-5" />
                    </span>
                    <div>
                      <h3 className="font-heading text-base font-semibold text-foreground">Biztos személyazonosság</h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        A név, a születési dátum és a születési hely együtt segít elkerülni a kettős rögzítést.
                      </p>
                    </div>
                  </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="member-csaladnev">Családnév *</Label>
                    <Input id="member-csaladnev" {...register('csaladnev')} placeholder="Kovács" className={FIELD_CLASS} aria-invalid={!!errors.csaladnev} />
                    {errors.csaladnev && <p role="alert" className="text-xs text-destructive">{errors.csaladnev.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="member-k-nev">Keresztnév *</Label>
                    <Input id="member-k-nev" {...register('k_nev')} placeholder="János" className={FIELD_CLASS} aria-invalid={!!errors.k_nev} />
                    {errors.k_nev && <p role="alert" className="text-xs text-destructive">{errors.k_nev.message}</p>}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="member-gender">Nem *</Label>
                    <select
                      id="member-gender"
                      {...register('ferfi', {
                        setValueAs: value => value === '' ? undefined : value === 'true' || value === true,
                      })}
                      className={'w-full border px-3 py-2 text-sm ' + FIELD_CLASS}
                      aria-invalid={!!errors.ferfi}
                    >
                      <option value="">Válassz nemet</option>
                      <option value="true">Férfi</option>
                      <option value="false">Nő</option>
                    </select>
                    {errors.ferfi && <p role="alert" className="text-xs text-destructive">{errors.ferfi.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="member-birth-date">Születési dátum *</Label>
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="member-birth-date" type="date" {...register('sz_datum')} className={`${FIELD_CLASS} pl-9`} aria-invalid={!!errors.sz_datum} />
                    </div>
                    {errors.sz_datum && <p role="alert" className="text-xs text-destructive">{errors.sz_datum.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="member-birth-place">Születési hely *</Label>
                    <div className="relative">
                      <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="member-birth-place" {...register('sz_hely_text')} placeholder="Csíkszereda" className={`${FIELD_CLASS} pl-9`} aria-invalid={!!errors.sz_hely_text} />
                    </div>
                    {errors.sz_hely_text && <p role="alert" className="text-xs text-destructive">{errors.sz_hely_text.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="member-religion">Vallás *</Label>
                    <Input id="member-religion" {...register('vallas')} placeholder="Református" className={FIELD_CLASS} aria-invalid={!!errors.vallas} />
                    {errors.vallas && <p role="alert" className="text-xs text-destructive">{errors.vallas.message}</p>}
                  </div>
                </div>
                </section>

                <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                      <MapPin className="size-4" />
                    </span>
                    <div>
                      <h3 className="font-heading text-sm font-semibold text-foreground">Lakóhely és elérhetőség</h3>
                      <p className="text-xs text-muted-foreground">A jelenlegi kapcsolattartási adatok.</p>
                    </div>
                  </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="member-locality">Település *</Label>
                    <Input id="member-locality" {...register('c_helyseg_text')} placeholder="Kovászna" className={FIELD_CLASS} aria-invalid={!!errors.c_helyseg_text} />
                    {errors.c_helyseg_text && <p role="alert" className="text-xs text-destructive">{errors.c_helyseg_text.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="member-street">Utca *</Label>
                    <Input id="member-street" {...register('c_utca_text')} placeholder="Fő utca" className={FIELD_CLASS} aria-invalid={!!errors.c_utca_text} />
                    {errors.c_utca_text && <p role="alert" className="text-xs text-destructive">{errors.c_utca_text.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="member-house-number">Házszám</Label>
                    <Input id="member-house-number" {...register('c_szam')} placeholder="1" className={FIELD_CLASS} />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="member-occupation">Foglalkozás</Label>
                    <Input id="member-occupation" {...register('foglalkozas')} className={FIELD_CLASS} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="member-phone">Telefon</Label>
                    <Input id="member-phone" {...register('telefon')} type="tel" autoComplete="tel" className={FIELD_CLASS} />
                  </div>
                  {/* 2026-06-10: az e-mail eddig hiányzott az űrlapról, pedig a séma
                      validálja — importált hibás címnél láthatatlanul akadt el a mentés. */}
                  <div className="space-y-1.5">
                    <Label htmlFor="member-email">E-mail</Label>
                    <Input id="member-email" {...register('email')} type="email" inputMode="email" autoComplete="email" className={FIELD_CLASS} placeholder="pelda@email.hu" aria-invalid={!!errors.email} />
                    {errors.email && <p role="alert" className="text-xs text-destructive">{errors.email.message}</p>}
                  </div>
                </div>
                </section>

                {/* Szülő keresés */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {(['apa', 'anya'] as const).map(type => (
                    <div key={type} className="space-y-1.5 relative">
                      <Label htmlFor={`member-parent-${type}`}>Édes{type === 'apa' ? 'apa' : 'anya'} neve</Label>
                      <Input
                        id={`member-parent-${type}`}
                        {...register(type === 'apa' ? 'apjaneve' : 'anyjaneve')}
                        placeholder={`Keresés... (3+ karakter)`}
                        className={FIELD_CLASS}
                        onChange={e => {
                          register(type === 'apa' ? 'apjaneve' : 'anyjaneve').onChange(e)
                          setValue(type === 'apa' ? 'id_apja_cnp' : 'id_anyja_cnp', '', { shouldDirty: true })
                          handleParentSearch(e.target.value, type)
                        }}
                      />
                      <input type="hidden" {...register(type === 'apa' ? 'id_apja_cnp' : 'id_anyja_cnp')} />
                      {parentSearchVisible[type] && parentResults[type].length > 0 && (
                        <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                          {parentResults[type].map(r => (
                            <button type="button" key={r.id} className="min-h-11 w-full cursor-pointer border-b p-2 text-left text-sm hover:bg-slate-50 last:border-0" onClick={() => selectParent(r, type)}>
                              <div className="font-medium">{r.csaladnev} {r.k_nev}</div>
                              <div className="text-xs text-muted-foreground">
                                {r.sz_datum ? `${new Date().getFullYear() - new Date(r.sz_datum).getFullYear()} éves` : '?'} · {r.adrlocality?.name || ''} {r.adrstreet?.name || ''} {r.c_szam || ''}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {(type === 'apa' ? apjaCnpWatch : anyjaCnpWatch) ? (
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                          <Check className="size-3.5" /> Összekötve tagrekorddal
                          <button
                            type="button"
                            className="ml-0.5 inline-flex size-11 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                            onClick={() => setValue(type === 'apa' ? 'id_apja_cnp' : 'id_anyja_cnp', '')}
                            aria-label="Összekötés törlése"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          Írhatsz szabad nevet, vagy válassz egy meglévő tagot a biztos családfa-kapcsolathoz.
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {belepesOka === 'bekoltozott' && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                    <h4 className="text-sm font-semibold text-blue-900">Beköltözés részletei</h4>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div><Label htmlFor="member-move-date" className="text-xs">Dátum</Label><Input id="member-move-date" type="date" {...register('bek_datum')} className={FIELD_CLASS_COMPACT} /></div>
                      <div><Label htmlFor="member-move-from" className="text-xs">Honnan</Label><Input id="member-move-from" {...register('bek_honnan')} className={FIELD_CLASS_COMPACT} placeholder="Település" /></div>
                    </div>
                    <div><Label htmlFor="member-move-certificate" className="text-xs">Igazolás</Label><Input id="member-move-certificate" {...register('bek_igazolas')} className={FIELD_CLASS_COMPACT} /></div>
                  </div>
                )}
                {belepesOka === 'attert' && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-2">
                    <h4 className="text-sm font-semibold text-orange-900">Áttérés részletei</h4>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                      <div><Label htmlFor="member-conversion-date" className="text-xs">Dátum</Label><Input id="member-conversion-date" type="date" {...register('att_datum')} className={FIELD_CLASS_COMPACT} /></div>
                      <div><Label htmlFor="member-former-religion" className="text-xs">Korábbi felekezet</Label><Input id="member-former-religion" {...register('att_felekezet')} className={FIELD_CLASS_COMPACT} /></div>
                      <div><Label htmlFor="member-conversion-from" className="text-xs">Honnan</Label><Input id="member-conversion-from" {...register('att_honnan')} className={FIELD_CLASS_COMPACT} /></div>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="member-notes">Megjegyzés</Label>
                  <textarea
                    id="member-notes"
                    {...register('megjegyzes')}
                    className={'w-full border px-3 py-2 text-sm min-h-24 resize-y ' + FIELD_CLASS}
                  />
                </div>
              </div>
            )}

            {/* ─────── 2. ANYAKÖNYVI ─────── */}
            {wizardStep === 2 && (
              <div className="space-y-3 pt-2">
                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 space-y-2">
                  <h4 className="text-sm font-semibold text-blue-900">Keresztelés</h4>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                    <div><Label htmlFor="member-baptism-date" className="text-xs">Dátum</Label><Input id="member-baptism-date" type="date" {...register('kereszteles_datum')} className={FIELD_CLASS_COMPACT} /></div>
                    <div><Label htmlFor="member-baptism-place" className="text-xs">Hely</Label><Input id="member-baptism-place" {...register('kereszteles_hely')} className={FIELD_CLASS_COMPACT} placeholder="Település/templom" /></div>
                    <div><Label htmlFor="member-baptism-pastor" className="text-xs">Lelkész</Label><Input id="member-baptism-pastor" {...register('kereszteles_lelkesz')} className={FIELD_CLASS_COMPACT} /></div>
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
                  <h4 className="text-sm font-semibold text-emerald-900">Konfirmáció</h4>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                    <div><Label htmlFor="member-confirmation-date" className="text-xs">Dátum</Label><Input id="member-confirmation-date" type="date" {...register('konfirmacio_datum')} className={FIELD_CLASS_COMPACT} /></div>
                    <div><Label htmlFor="member-confirmation-place" className="text-xs">Hely</Label><Input id="member-confirmation-place" {...register('konfirmacio_hely')} className={FIELD_CLASS_COMPACT} placeholder="Település/templom" /></div>
                    <div><Label htmlFor="member-confirmation-pastor" className="text-xs">Lelkész</Label><Input id="member-confirmation-pastor" {...register('konfirmacio_lelkesz')} className={FIELD_CLASS_COMPACT} /></div>
                  </div>
                </div>

                {/* 2026-06-02: ESKETÉS — eddig hiányzott! */}
                <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 space-y-2">
                  <h4 className="text-sm font-semibold text-rose-900">Esketés</h4>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                    <div><Label htmlFor="member-wedding-date" className="text-xs">Dátum</Label><Input id="member-wedding-date" type="date" {...register('esketes_datum')} className={FIELD_CLASS_COMPACT} /></div>
                    <div><Label htmlFor="member-wedding-place" className="text-xs">Hely</Label><Input id="member-wedding-place" {...register('esketes_hely')} className={FIELD_CLASS_COMPACT} placeholder="Település/templom" /></div>
                    <div><Label htmlFor="member-wedding-pastor" className="text-xs">Lelkész</Label><Input id="member-wedding-pastor" {...register('esketes_lelkesz')} className={FIELD_CLASS_COMPACT} /></div>
                  </div>
                  <div>
                    <Label htmlFor="member-spouse-name" className="text-xs">Házastárs neve</Label>
                    <Input
                      id="member-spouse-name"
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
                  <Label htmlFor="member-payment-status">Fizetési státusz</Label>
                  <select
                    id="member-payment-status"
                    {...register('fizeto_status')}
                    className={'w-full border px-3 py-2 text-sm ' + FIELD_CLASS}
                  >
                    <option value="fizet">Fizető</option>
                    <option value="felmentett">Felmentett</option>
                    <option value="nem_fizet">Nem fizet (18 év alatti)</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    A pontos járulékösszeg és kedvezmények a Pénzügy modulban állíthatóak.
                  </p>
                </div>

                {/* #1 (Endre): Adatvédelem + fénykép — a személyi kartonról menthető */}
                <div className="space-y-2.5 rounded-lg border border-sky-200 bg-sky-50/50 p-3">
                  <h4 className="text-sm font-semibold text-sky-900">Adatvédelem és fénykép</h4>
                  <div className="space-y-1.5">
                    <Label htmlFor="member-social-profile" className="text-xs text-slate-600">Közösségi profil (Facebook) link</Label>
                    <Input
                      id="member-social-profile"
                      {...register('social_profil_url')}
                      placeholder="https://facebook.com/…"
                      className={FIELD_CLASS_COMPACT}
                    />
                    {editMember ? (
                      <div className="space-y-1 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setAvatarDialogOpen(true)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-50"
                        >
                          <Camera className="size-3.5" />
                          Profilkép beállítása…
                        </button>
                        <p className="text-[11px] leading-relaxed text-slate-500">
                          A profilkép <strong>külön ablakban</strong> állítható be (Facebook-linkből — best-effort —,
                          vagy a gépedről), és <strong>csak ott, a saját „Mentés” gombjával</strong> mentődik.
                          Ez az űrlap a linket a „Módosítások mentése” gombbal menti.
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500">
                        A link mentésre kerül. A <strong>profilképet</strong> a tag mentése után, a
                        szerkesztésénél töltheted fel — Facebook-linkből (best-effort) vagy a gépedről.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5 pt-1">
                    <label className="flex items-start gap-2 text-sm text-slate-700">
                      <input type="checkbox" {...register('gdpr_consent')} className="mt-0.5 size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400" />
                      <span>GDPR-hozzájárulás (adatkezelési tájékoztató elfogadva)</span>
                    </label>
                    <label className="flex items-start gap-2 text-sm text-slate-700">
                      <input type="checkbox" {...register('photo_consent')} className="mt-0.5 size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400" />
                      <span>Fénykép közölhető (pl. gyülekezeti kiadványban, faliújságon)</span>
                    </label>
                    <label className="flex items-start gap-2 text-sm text-slate-700">
                      <input type="checkbox" {...register('mailing_consent')} className="mt-0.5 size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400" />
                      <span>Hírlevél / értesítők küldhetők (e-mail, telefon)</span>
                    </label>
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900">
                  <strong>Utolsó lépés!</strong> Ellenőrizd a megadott adatokat, majd kattints
                  a „Tag mentése” gombra. Az alapadatok mellett a megadott anyakönyvi események
                  rögzítődnek a megfelelő modulokban.
                </div>
              </div>
            )}
            </div>

            {/* Wizard navigáció — alsó footer (MINDIG az ablak alján) */}
            <div className="flex shrink-0 flex-wrap gap-2 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-16px_30px_-28px_rgba(15,23,42,0.55)] sm:px-6 sm:pt-4">
              {wizardStep === 1 ? (
                !editMember && (
                  <Button type="button" variant="ghost" className="min-h-11 rounded-xl" onClick={() => setStep('choose')}>
                    <ChevronLeft className="mr-1 size-4" /> Vissza
                  </Button>
                )
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 rounded-xl"
                  onClick={() => setWizardStep((s) => Math.max(1, s - 1) as WizardStep)}
                >
                  <ChevronLeft className="mr-1 size-4" /> Vissza
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1 rounded-xl bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                onClick={() => onOpenChange(false)}
              >
                Mégse
              </Button>
              {wizardStep < 3 ? (
                <Button
                  type="button"
                  className="min-h-11 flex-[1.5] rounded-xl bg-emerald-600 hover:bg-emerald-700"
                  onClick={advanceWizard}
                >
                  Tovább <ChevronRight className="ml-1 size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={loading}
                  onClick={handleSubmit(onSubmit, onInvalid)}
                  className="min-h-11 flex-[2] rounded-xl bg-emerald-600 hover:bg-emerald-700"
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
    {editMember && (
      <AvatarEditorDialog
        open={avatarDialogOpen}
        onOpenChange={setAvatarDialogOpen}
        person={{
          id: editMember.id,
          name: [editMember.csaladnev, editMember.k_nev].filter(Boolean).join(' ') || 'Tag',
          kepUrl: editMember.photo_url,
          socialUrl: watchedSocial ?? editMember.social_profil_url,
        }}
      />
    )}
    </>
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
