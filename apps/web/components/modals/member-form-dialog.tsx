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
import { getVoterPrintContext } from '@/app/(dashboard)/tagnyilvantartas/voter-actions'
import { buildPersonCardHtml, type PersonCardPrintData } from '@/lib/members/person-card-print'
import { printToBrowser } from '@/lib/utils/print-engine-v2'
import { AvatarEditorDialog } from '@/components/modals/avatar-editor-dialog'
import { ParentLinkResultDialog, type ParentLinkResultData } from '@/components/modals/parent-link-result-dialog'
import { CrossCongregationMatchDialog, type CrossMatchAction } from '@/components/members/cross-congregation-match-dialog'
import { CnpRejtett } from '@/components/members/cnp-rejtett'
import {
  findPotentialCrossMatch,
  getCrossMatchPastorContacts,
  type CrossMatchCandidate,
  type CrossMatchPastorContact,
} from '@/lib/members/cross-congregation-actions'
import { ENTRY_REASONS, ENTRY_REASON_LABELS } from '@/lib/constants/members'
import type { EnrichedMember } from '@/lib/constants/members'
// 2026-08-25 (gyülekezeti egységek): egység-választó a Lakóhely blokkban —
// csak akkor jelenik meg, ha a gyülekezetnek van legalább egy aktív egysége.
import { listGyulekezetiEgysegek } from '@/app/(dashboard)/congregation/egysegek-actions'
import { kozpontValasztoCimke, type GyulekezetiEgyseg } from '@/lib/gyulekezet/egysegek-shared'
import { toast } from 'sonner'
import {
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  MapPin,
  Pencil,
  Printer,
  ShieldCheck,
  User,
  X,
} from 'lucide-react'

interface MemberFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editMember: EnrichedMember | null
  /** 2026-08-02 (PR-20): a szülő-összekötő felugró sikeres mentése után —
   *  a mögöttes lista frissítéséhez (a fő űrlap ilyenkor már zárva van) */
  onDataChanged?: () => void
}

// 2026-06-02: a user kérése — input mezők JOBBAN láthatóak legyenek.
// Egységes osztály minden szerkeszthető mezőre: fehér háttér, finom shadow,
// határozott szürke border. (Eddig az alap Input bg-background = transparent-szerű.)
// 2026-07-24 (PR-4): + dark-mode tokenek — a hard-kódolt fehér mezők sötét
// módban fehér foltként világítottak a sötét kártyán.
const FIELD_CLASS = 'min-h-11 rounded-xl bg-white shadow-sm border-slate-300 focus-visible:border-emerald-400 focus-visible:ring-emerald-300/40 dark:bg-slate-900/60 dark:border-slate-700'
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
// 2026-08-25 (gyülekezeti egységek): az 'egyseg_id' a Lakóhely blokk mezője (1. lépés).
// 2026-08-25 (CNP kézi bevitel): a 'cnp' a Személyes blokk mezője (1. lépés).
const STEP1_FIELDS: readonly (keyof MemberFormValues)[] = ['csaladnev', 'k_nev', 'szcs_nev', 'namepattern', 'cnp', 'ferfi', 'sz_datum', 'sz_hely_text', 'foglalkozas', 'vallas', 'c_helyseg_text', 'c_utca_text', 'c_szam', 'c_tombhaz', 'c_lepcsohaz', 'c_emelet', 'c_ajto', 'egyseg_id', 'telefon', 'email', 'megjegyzes', 'apjaneve', 'anyjaneve', 'id_apja_cnp', 'id_anyja_cnp', 'bek_datum', 'bek_honnan', 'bek_igazolas', 'att_datum', 'att_felekezet', 'att_honnan', 'belepes_oka']
// 2026-07-24 (PR-4, D4 döntés): az esketés-mezők KIKERÜLTEK — a saveMember soha
// nem mentette őket (néma adatvesztés volt), az esketés rögzítése kizárólag az
// Anyakönyv → Esketés modulban történik.
const STEP2_FIELDS: readonly (keyof MemberFormValues)[] = ['kereszteles_datum', 'kereszteles_hely', 'kereszteles_lelkesz', 'konfirmacio_datum', 'konfirmacio_hely', 'konfirmacio_lelkesz']

export function MemberFormDialog({ open, onOpenChange, editMember, onDataChanged }: MemberFormDialogProps) {
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

  // Kereszt-gyülekezeti duplikátum-figyelés (1. fázis): ÚJ tag mentése előtt
  // ellenőrizzük, hogy a személy szerepel-e már más gyülekezetben; ha igen,
  // a döntésig (ugyanaz / nem ugyanaz) függőben tartjuk a mentést.
  const [crossMatch, setCrossMatch] = useState<{
    candidates: CrossMatchCandidate[]
    contacts: CrossMatchPastorContact[]
    pendingData: MemberInput
  } | null>(null)

  const belepesOka = useWatch({ control, name: 'belepes_oka' })
  // Szülő-összekötés állapota.
  const apjaCnpWatch = useWatch({ control, name: 'id_apja_cnp' })
  const anyjaCnpWatch = useWatch({ control, name: 'id_anyja_cnp' })

  // 2026-08-25 (CNP kézi bevitel): a tárolt személyi szám szerkesztésének
  // feloldása (ceruza gomb) + a beírt érték láthatósága (szem-ikon — a mező
  // alapból type="password", mint a CnpRejtett maszkja).
  const [cnpSzerkesztes, setCnpSzerkesztes] = useState(false)
  const [cnpLatszik, setCnpLatszik] = useState(false)
  // Az élő „(változatlan)" jelzéshez: amíg a mező üres, a mentés nem nyúl a
  // tárolt személyi számhoz.
  const cnpWatch = useWatch({ control, name: 'cnp' })

  // ── 2026-07-25 (PR-17): ÉLŐ személyi karton-előnézet ────────────────────
  // Gépelés közben a jobb oldali (2xl+) oszlopban / kisebb kijelzőn a
  // „Karton-előnézet" gombbal nyíló rétegen töltődik ki a nyomtatható karton.
  const allValues = useWatch({ control })
  const [congName, setCongName] = useState('Gyülekezet')
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewOverlayOpen, setPreviewOverlayOpen] = useState(false)
  // 2026-08-02 (PR-20): szülő-név párosítás eredménye a mentés után
  const [parentLinkResult, setParentLinkResult] = useState<ParentLinkResultData | null>(null)

  // 2026-08-25 (gyülekezeti egységek): az aktív egységek listája a
  // „Gyülekezeti egység" mezőhöz. Hibánál (pl. a migráció még nem futott le)
  // a lista üres marad, és a mező egyszerűen NEM jelenik meg — a mentés a
  // szerveroldali oszlop-strip retry miatt akkor sem bukik el.
  const [egysegek, setEgysegek] = useState<GyulekezetiEgyseg[]>([])
  // 2026-08-25 (társegyházközség): a szervezeti forma a „központ" opció feliratához —
  // társnál a címke nélküli adat a KÖZÖS állomány, nem az anyaközpont.
  const [szervezetiTipus, setSzervezetiTipus] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void getVoterPrintContext()
      .then((ctx) => { if (!cancelled) setCongName(ctx.congregationName) })
      .catch(() => { /* fallback marad */ })
    void listGyulekezetiEgysegek()
      .then((res) => {
        if (cancelled) return
        setEgysegek(res.egysegek ?? [])
        setSzervezetiTipus(res.szervezetiTipus ?? null)
      })
      .catch(() => {
        if (cancelled) return
        setEgysegek([])
        setSzervezetiTipus(null)
      })
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      const res = buildPersonCardHtml(
        formValuesToCardData(allValues as Partial<MemberFormValues>, congName, editMember),
      )
      setPreviewHtml(res.html)
    }, 350)
    return () => clearTimeout(t)
  }, [open, allValues, congName, editMember])

  function handlePreviewPrint() {
    const res = buildPersonCardHtml(
      formValuesToCardData(allValues as Partial<MemberFormValues>, congName, editMember),
    )
    void printToBrowser(res.html)
  }

  useEffect(() => {
    if (!open) {
      // A tag-űrlap bezárásakor a beágyazott dialógusokat is zárjuk — különben a
      // fotó-szerkesztő (előnézeti képpel) vagy a kereszt-gyülekezeti ablak
      // „beragad" a képernyőn (X-re kattintva a kép beakadt).
      queueMicrotask(() => {
        setAvatarDialogOpen(false)
        setCrossMatch(null)
        setPreviewOverlayOpen(false)
      })
      return
    }
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
        // 2026-08-01 (PR-19): előtag — ha legacy (nem előtag-szerű) érték van
        // bent, a select üresen mutatja; a szerveroldali mentés (saveMember)
        // csak előtag-szerű értéket tárol, a maradványt kitisztítja.
        namepattern: editMember.namepattern || '',
        // 2026-08-25 (CNP kézi bevitel): szerkesztésnél a mező ÜRESEN indul
        // („(változatlan)" jelzéssel) — a tárolt értéket SOSEM töltjük be az
        // inputba (ne álljon plain textben a DOM-ban), és üresen hagyva a
        // mentés nem is nyúl hozzá (saveMember-szabály).
        cnp: '',
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
        // 2026-08-25 (gyülekezeti egységek): a meglévő besorolás ELŐTÖLTÉSE
        // kötelező — a saveMember mindig menti az egyseg_id-t, előtöltés nélkül
        // minden szerkesztés visszasorolná a tagot az anyaközpontba.
        egyseg_id: editMember.egyseg_id ?? null,
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
        // 2026-07-24 (PR-4 F5.10): a Fizetési státusz előtöltése — eddig
        // szerkesztésnél mindig 'fizet'-en állt, a mentés pedig ignorálta.
        fizeto_status: editMember.paymentStatus === 'felmentett' ? 'felmentett' : 'fizet',
      })
    } else {
      setStep('choose')
      setWizardStep(1)
      setMaxReachedStep(1)
      reset({ belepes_oka: 'alap', vallas: '', ferfi: undefined, sz_datum: '', sz_hely_text: '', c_szam: '1', cnp: '', gdpr_consent: false, photo_consent: false, mailing_consent: false, social_profil_url: '', egyseg_id: null })
    }
    setParentResults({ apa: [], anya: [] })
    setParentSearchVisible({ apa: false, anya: false })
    // 2026-08-25 (CNP kézi bevitel): a feloldás/láthatóság nem élheti túl a
    // dialógus újranyitását — mindig visszazárva indulunk.
    setCnpSzerkesztes(false)
    setCnpLatszik(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, editMember, reset])

  function selectEntryReason(reason: typeof ENTRY_REASONS[number]) {
    setValue('belepes_oka', reason)
    setStep('form')
  }

  async function persistMember(data: MemberInput) {
    setLoading(true)
    const result = await saveMember(data)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(editMember ? 'Tag adatai frissítve!' : 'Új tag sikeresen rögzítve!')
      // 2026-08-02 (PR-20): szülő-név párosítás eredménye — egyértelmű
      // összekötésnél/választásnál/ütközésnél FELUGRÓ ablak (a felhasználó
      // explicit kérése), különben marad a csendes viselkedés.
      const pl = 'parentLink' in result ? result.parentLink : undefined
      const plWorthShowing = !!pl && (
        pl.apa?.status === 'linked' || pl.apa?.status === 'ambiguous' ||
        pl.anya?.status === 'linked' || pl.anya?.status === 'ambiguous' ||
        !!pl.familyWarning ||
        // 2026-08-03 (PR-23): automatikus áthelyezés/összevonás történt — a
        // „honnan hová" jelentést mindig meg kell mutatni
        (pl.familyMoves?.length ?? 0) > 0 ||
        (pl.familyNotes?.length ?? 0) > 0 ||
        (pl.familyInfos?.length ?? 0) > 0 ||
        // 2026-08-04 (PR-38): jóváhagyandó karton-kiegészítés — csak itt tudja
        // a lelkész egy kattintással engedélyezni, ezért mindig meg kell mutatni
        (pl.familyOffers?.length ?? 0) > 0
      )
      if (plWorthShowing && pl && result.id != null) {
        setParentLinkResult({
          ...pl,
          memberId: result.id,
          memberName: [data.csaladnev, data.k_nev].filter(Boolean).join(' '),
        })
      } else if ('warning' in result && result.warning) {
        // 2026-08-01 (PR-18): dupla-tagsági figyelmeztetés a CNP-alapú
        // auto-család őrtől
        toast.warning(result.warning, { duration: 9000 })
      }
      onOpenChange(false)
    }
    setLoading(false)
  }

  async function onSubmit(data: MemberInput) {
    // Kereszt-gyülekezeti előellenőrzés CSAK ÚJ tagnál (szerkesztésnél a DB-trigger figyel).
    if (!editMember && data.csaladnev?.trim() && data.k_nev?.trim()) {
      setLoading(true)
      const match = await findPotentialCrossMatch({
        csaladnev: data.csaladnev,
        k_nev: data.k_nev,
        telefon: data.telefon ?? null,
        szDatum: data.sz_datum ?? null,
      })
      if (match.data && match.data.length > 0) {
        const congIds = match.data.map((c) => c.matched_congregation_id)
        // 2026-08-11 (P0 RPC-hardening): a lelkész-elérhetőséghez „bizonyítékot"
        // is küldünk — a szerver csak akkor adja ki, ha a megadott név +
        // telefon / szül. dátum tényleg ERŐS egyezést ad az adott gyülekezetben.
        const contactsRes = await getCrossMatchPastorContacts(congIds, {
          csaladnev: data.csaladnev,
          k_nev: data.k_nev,
          telefon: data.telefon ?? null,
          szDatum: data.sz_datum ?? null,
        })
        setLoading(false)
        setCrossMatch({
          candidates: match.data,
          contacts: contactsRes.data ?? [],
          pendingData: data,
        })
        return // várunk a felhasználó döntésére (ugyanaz / nem ugyanaz)
      }
      // Ha a keresés hibázna, NEM blokkolunk — a mentés menjen tovább (a DB-trigger amúgy is rögzíti).
      // 2026-08-11: jogosultsági elutasításnál barátságos tájékoztatás, nem hiba.
      if (match.notice) toast.info(match.notice, { duration: 6000 })
    }
    await persistMember(data)
  }

  async function handleCrossDecide(action: CrossMatchAction) {
    const pending = crossMatch?.pendingData
    setCrossMatch(null)
    if (action.kind === 'dismissed') return // mégsem rögzítünk most
    if (action.kind === 'same_person') {
      toast.info('Rögzítve. Egyeztess az ottani lelkésszel a kettős tagságról — az egységes lélekszám nem számol duplán.')
    }
    if (pending) await persistMember(pending)
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
      <DialogContent className="top-0 left-0 grid h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-none p-0 sm:top-1/2 sm:left-1/2 sm:h-[min(90dvh,56rem)] sm:max-h-[min(90dvh,56rem)] sm:w-[calc(100%-2rem)] sm:max-w-4xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.75rem] 2xl:max-w-[min(1420px,calc(100vw-2rem))] [&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3 [&_[data-slot=dialog-close]]:size-11">
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

        <div className="relative grid min-h-0 grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_480px]">
        <div className="flex min-h-0 flex-col">

        {/* Pre-screen: belépés oka */}
        {step === 'choose' && !editMember && (
          <div className="space-y-3 px-4 py-4 sm:px-6">
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

            {/* 2026-07-25 (PR-17): kisebb kijelzőn az élő karton-előnézet gombbal nyílik */}
            <div className="flex justify-end 2xl:hidden">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9 rounded-lg"
                onClick={() => setPreviewOverlayOpen(true)}
              >
                <Eye className="mr-1.5 size-3.5" /> Karton-előnézet
              </Button>
            </div>

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

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                  {/* 2026-08-01 (PR-19): név-előtag — eddig CSAK SQL-ből volt
                      állítható, a felületről sehol */}
                  <div className="space-y-1.5">
                    <Label htmlFor="member-namepattern">Előtag</Label>
                    <select
                      id="member-namepattern"
                      {...register('namepattern')}
                      className={'w-full border px-3 py-2 text-sm ' + FIELD_CLASS}
                    >
                      <option value="">— nincs —</option>
                      <option value="id.">id. (idősebb)</option>
                      <option value="ifj.">ifj. (ifjabb)</option>
                      <option value="legid.">legid.</option>
                      <option value="legifj.">legifj.</option>
                      <option value="özv.">özv.</option>
                      <option value="Dr.">Dr.</option>
                    </select>
                  </div>
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
                  {/* 2026-07-24 (PR-4 F5.10): eddig a mentés írta, de input NEM volt hozzá */}
                  <div className="space-y-1.5">
                    <Label htmlFor="member-szcs-nev">Leánykori név</Label>
                    <Input id="member-szcs-nev" {...register('szcs_nev')} placeholder="Szabó" className={FIELD_CLASS} />
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

                {/* 2026-08-25 (GDPR + kézi bevitel): a személyi szám a
                    SZERKESZTŐBEN is alapból rejtve — mint egy jelszó. A tárolt
                    érték felfedése a szem-ikonnal történik és NAPLÓZÓDIK
                    (CnpRejtett); az ÁTÍRÁS a ceruza gombbal oldható fel, az
                    input pedig type="password" (a beírt érték is rejtve marad,
                    a saját szem-ikonjával fedhető fel — az nem naplózódik, a
                    lelkész a SAJÁT beírását nézi). Üres mező = „nem nyúlunk
                    hozzá": új tagnál a rendszer generál egyházi azonosítót,
                    meglévőnél a tárolt érték marad (saveMember-szabály — a
                    mentés sosem nulláz). */}
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="member-cnp">
                      Személyi szám (CNP)
                      {editMember?.cnp && !(cnpWatch || '').trim() ? (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">(változatlan)</span>
                      ) : null}
                    </Label>
                    {editMember?.cnp && !cnpSzerkesztes ? (
                      <div className={`flex items-center justify-between gap-2 border px-3 py-1 text-sm ${FIELD_CLASS}`}>
                        <CnpRejtett cnp={editMember.cnp} szemelyId={editMember.id} />
                        <button
                          type="button"
                          onClick={() => setCnpSzerkesztes(true)}
                          aria-label="Személyi szám szerkesztése"
                          title="Személyi szám szerkesztése"
                          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-slate-800"
                        >
                          <Pencil className="size-4" aria-hidden />
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Input
                          id="member-cnp"
                          type={cnpLatszik ? 'text' : 'password'}
                          autoComplete="new-password"
                          {...register('cnp')}
                          placeholder={editMember ? '(változatlan)' : 'Üresen hagyva a rendszer tölti ki'}
                          className={`${FIELD_CLASS} ${editMember?.cnp ? 'pr-20' : 'pr-11'}`}
                          aria-invalid={!!errors.cnp}
                        />
                        <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center">
                          <button
                            type="button"
                            onClick={() => setCnpLatszik((v) => !v)}
                            aria-label={cnpLatszik ? 'Beírt személyi szám elrejtése' : 'Beírt személyi szám megjelenítése'}
                            aria-pressed={cnpLatszik}
                            className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-slate-800"
                          >
                            {cnpLatszik ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                          </button>
                          {editMember?.cnp ? (
                            <button
                              type="button"
                              onClick={() => {
                                // Mégse: a beírt érték törlődik, a tárolt marad
                                // (üres mezőhöz a mentés nem nyúl).
                                setValue('cnp', '', { shouldDirty: true })
                                setCnpLatszik(false)
                                setCnpSzerkesztes(false)
                              }}
                              aria-label="Szerkesztés elvetése — a tárolt személyi szám marad"
                              title="Mégse"
                              className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-slate-800"
                            >
                              <X className="size-4" aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )}
                    {errors.cnp && <p role="alert" className="text-xs text-destructive">{errors.cnp.message}</p>}
                    <p className="text-xs text-muted-foreground">
                      Országfüggő személyi szám (nem csak 13 jegyű román CNP) — mindig
                      rejtve tárolódik és jelenik meg.{' '}
                      {editMember?.cnp
                        ? 'Üresen hagyva a tárolt érték változatlan marad.'
                        : 'Üresen hagyva a rendszer generált egyházi azonosítót ad.'}
                    </p>
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

                {/* 2026-07-24 (PR-4 F5.10): tömbházas (romániai) cím-mezők — a mentés
                    eddig is írta őket, de input nem volt: csak importtal kerülhettek be. */}
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="member-block">Tömbház</Label>
                    <Input id="member-block" {...register('c_tombhaz')} placeholder="A2" className={FIELD_CLASS} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="member-staircase">Lépcsőház</Label>
                    <Input id="member-staircase" {...register('c_lepcsohaz')} placeholder="B" className={FIELD_CLASS} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="member-floor">Emelet</Label>
                    <Input id="member-floor" {...register('c_emelet')} placeholder="3" className={FIELD_CLASS} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="member-door">Ajtó</Label>
                    <Input id="member-door" {...register('c_ajto')} placeholder="12" className={FIELD_CLASS} />
                  </div>
                </div>

                {/* 2026-08-25 (gyülekezeti egységek): egység-besorolás — CSAK ha a
                    gyülekezetnek van legalább 1 aktív egysége (leány/szórvány).
                    Üres érték = anyaközpont (a szerveren NULL). */}
                {egysegek.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
                      <Label htmlFor="member-egyseg">Gyülekezeti egység</Label>
                      <select
                        id="member-egyseg"
                        {...register('egyseg_id', {
                          setValueAs: (value) => (value === '' || value == null ? null : String(value)),
                        })}
                        className={'w-full border px-3 py-2 text-sm ' + FIELD_CLASS}
                      >
                        <option value="">{kozpontValasztoCimke(szervezetiTipus)}</option>
                        {egysegek.map((egyseg) => (
                          <option key={egyseg.id} value={egyseg.id}>{egyseg.nev}</option>
                        ))}
                        {/* A tag jelenlegi (időközben inaktivált) egysége ne
                            nullázódjon némán egy sima mentéskor. */}
                        {editMember?.egyseg_id && !egysegek.some((egyseg) => egyseg.id === editMember.egyseg_id) && (
                          <option value={editMember.egyseg_id}>Inaktív egység (megtartva)</option>
                        )}
                      </select>
                      <p className="text-xs text-muted-foreground">
                        Melyik egységhez tartozik a tag — a tömeges (település szerinti) besorolás a taglista „Egység-besorolás" gombjával érhető el.
                      </p>
                    </div>
                  </div>
                )}

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
                        <div className="absolute z-10 top-full left-0 right-0 bg-white dark:bg-slate-900 border rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
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

                {/* 2026-07-24 (PR-4, D4 döntés): az esketés-blokk KIKERÜLT — a mentés
                    sosem tárolta (néma adatvesztés volt); az esketés az Anyakönyv
                    modul hatásköre. */}
                <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-900">
                  <strong>Esketés:</strong> a házassági adatok rögzítése az{' '}
                  <strong>Anyakönyv → Esketés</strong> modulban történik — ott a
                  házastárs-kapcsolat is összeköthető, és a család automatikusan létrejön.
                </div>
              </div>
            )}

            {/* ─────── 3. PÉNZÜGYI ─────── */}
            {wizardStep === 3 && (
              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="member-payment-status">Fizetési státusz</Label>
                  {/* 2026-07-24 (PR-4 F5.10): a "Nem fizet" halott opció törölve (sehol
                      nem volt hatása); a mező mostantól SZERKESZTÉSNÉL is működik —
                      felmentett ⇄ fizető váltásnál felmentés-rekord nyílik/záródik. */}
                  <select
                    id="member-payment-status"
                    {...register('fizeto_status')}
                    className={'w-full border px-3 py-2 text-sm ' + FIELD_CLASS}
                  >
                    <option value="fizet">Fizető</option>
                    <option value="felmentett">Felmentett</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    „Felmentett&rdquo; választásnál felmentés-rekord jön létre (az idei
                    évtől); visszaállításnál a felmentés lezárul. A pontos járulékösszeg
                    és kedvezmények a Pénzügy modulban állíthatóak.
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

        {/* ── 2026-07-25 (PR-17): élő karton-előnézet — 2xl+ állandó oszlop ── */}
        <aside className="hidden min-h-0 flex-col border-l border-border bg-muted/40 2xl:flex">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Személyi karton — élő előnézet
            </p>
            <Button type="button" variant="outline" size="sm" className="min-h-9 rounded-lg" onClick={handlePreviewPrint}>
              <Printer className="mr-1.5 size-3.5" /> Nyomtatás
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <CardPreviewFrame html={previewHtml} scale={0.55} />
            <p className="mt-2 text-center text-[11px] leading-4 text-muted-foreground">
              A karton gépelés közben töltődik ki. Nyomtatásnál a Cél listából a
              &bdquo;Mentés PDF-ként&rdquo; is választható.
            </p>
          </div>
        </aside>

        {/* Kisebb kijelzőn: előnézet-réteg */}
        {previewOverlayOpen && (
          <div className="absolute inset-0 z-20 flex flex-col bg-background 2xl:hidden">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Személyi karton — élő előnézet
              </p>
              <div className="flex items-center gap-1.5">
                <Button type="button" variant="outline" size="sm" className="min-h-9 rounded-lg" onClick={handlePreviewPrint}>
                  <Printer className="mr-1.5 size-3.5" /> Nyomtatás
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-9 rounded-lg p-0"
                  onClick={() => setPreviewOverlayOpen(false)}
                  aria-label="Előnézet bezárása"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <CardPreviewFrame html={previewHtml} scale={0.42} />
            </div>
          </div>
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
    {crossMatch && (
      <CrossCongregationMatchDialog
        open={!!crossMatch}
        onOpenChange={(o) => { if (!o) setCrossMatch(null) }}
        triggeringPerson={{
          csaladnev: crossMatch.pendingData.csaladnev,
          k_nev: crossMatch.pendingData.k_nev,
          telefon: crossMatch.pendingData.telefon,
        }}
        candidates={crossMatch.candidates}
        contacts={crossMatch.contacts}
        context="new_member"
        onDecide={handleCrossDecide}
        isPending={loading}
      />
    )}
    {/* 2026-08-02 (PR-20): szülő-név párosítás eredménye — a fő űrlap zárása
        UTÁN is nyitva marad (testvér-dialógus) */}
    <ParentLinkResultDialog
      open={parentLinkResult !== null}
      onOpenChange={(o) => { if (!o) setParentLinkResult(null) }}
      data={parentLinkResult}
      onLinked={onDataChanged}
    />
    </>
  )
}

// 2026-07-25 (PR-17): skálázott A4-előnézet keret — az iframe valós
// lapméretben renderel, a keret kicsinyíti (nem interaktív, csak nézet).
function CardPreviewFrame({ html, scale }: { html: string; scale: number }) {
  const W = 830
  const H = 1180
  return (
    <div
      className="mx-auto overflow-hidden rounded-xl border border-border bg-white shadow-sm"
      style={{ width: W * scale, height: H * scale }}
    >
      <iframe
        title="Személyi karton előnézet"
        srcDoc={html}
        style={{
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          border: 0,
          pointerEvents: 'none',
          background: 'white',
        }}
      />
    </div>
  )
}

// 2026-07-25 (PR-17): az űrlap-értékek → nyomtatható karton-adat leképezése.
function formValuesToCardData(
  v: Partial<MemberFormValues>,
  congregationName: string,
  editMember: EnrichedMember | null,
): PersonCardPrintData {
  const trim = (x: unknown) => (typeof x === 'string' ? x.trim() : '')
  const address = [trim(v.c_helyseg_text), trim(v.c_utca_text), trim(v.c_szam)].filter(Boolean).join(', ')
  return {
    congregationName,
    personName: [trim(v.csaladnev), trim(v.k_nev)].filter(Boolean).join(' '),
    szcsNev: trim(v.szcs_nev) || null,
    gender: v.ferfi === true ? 'ferfi' : v.ferfi === false ? 'no' : null,
    birthDate: trim(v.sz_datum) || null,
    birthPlace: trim(v.sz_hely_text) || null,
    religion: trim(v.vallas) || null,
    occupation: trim(v.foglalkozas) || null,
    fatherName: trim(v.apjaneve) || null,
    motherName: trim(v.anyjaneve) || null,
    address: address || null,
    phone: trim(v.telefon) || null,
    email: trim(v.email) || null,
    cnp: editMember?.cnp ?? null,
    photoUrl: editMember?.photo_url ?? null,
    baptism: {
      date: trim(v.kereszteles_datum) || null,
      place: trim(v.kereszteles_hely) || null,
      pastor: trim(v.kereszteles_lelkesz) || null,
    },
    confirmation: {
      date: trim(v.konfirmacio_datum) || null,
      place: trim(v.konfirmacio_hely) || null,
      pastor: trim(v.konfirmacio_lelkesz) || null,
    },
    note: trim(v.megjegyzes) || null,
  }
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
