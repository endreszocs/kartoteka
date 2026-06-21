'use client'

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgePercent,
  Building2,
  CalendarDays,
  Coins,
  HandCoins,
  Landmark,
  PiggyBank,
  Plus,
  Save,
  Star,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react'

import {
  deleteCongregationBankAccount,
  deleteCongregationCustomFee,
  deleteCongregationFeeDiscount,
  getCongregation,
  getCongregationAnnualFees,
  getCongregationBankAccounts,
  getCongregationCustomFees,
  getCongregationFeeDiscounts,
  getCongregationPastors,
  type CongregationPastorRow,
  initiateCongregationTransfer,
  getOpenTransfer,
  approveTransfer,
  addTransferRemark,
  completeTransfer,
  type OpenTransfer,
  getDioceses,
  saveCongregationBankAccount,
  saveCongregationCustomFee,
  saveCongregationFeeDiscount,
  updateCongregation,
  type CustomFeeRow,
} from '@/app/(dashboard)/congregation/actions'
import {
  deleteAnnualFee,
  saveAnnualFee,
} from '@/app/(dashboard)/penzugy/tartozas-actions'
import { AddressForm, type AddressValue } from '@/components/ui/address-form'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { normalizeDebtCalcMode } from '@/lib/constants/finance'
import { toast } from 'sonner'

interface SimpleDiocese {
  id: string
  name: string
  district_id: string | null
  district_name: string | null
}

interface AnnualFeeRow {
  year: number
  eves_jarulek: number
  jarulek_kedvezmenyes: number | null
  jarulek_hatarid: string | null
  note: string | null
}

interface BankAccountRow {
  id: number
  bank_neve: string
  iban: string | null
  valuta: string
  aktiv: boolean
  nyito_egyenleg: number | null
  szin: string | null
  ikon: string | null
  is_default: boolean
}

interface FeeDiscountRow {
  id: string
  ev: number
  tipus: 'idoszak' | 'kor' | 'jovedelem'
  sorrend: number
  aktiv: boolean
  kezdet: string | null
  hatarid: string | null
  kedv_osszeg: number | null
  kor_tol: number | null
  szazalek: number | null
  fix_osszeg: number | null
  jov_leiras: string | null
}

interface CongregationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  congregationId: string | null
}

const CURRENCY_OPTIONS = ['RON', 'EUR', 'USD', 'HUF']
const ICON_OPTIONS = [
  { value: 'building-2', label: 'Bank' },
  { value: 'landmark', label: 'Pénzintézet' },
  { value: 'wallet', label: 'Tárca' },
  { value: 'piggy-bank', label: 'Tartalék' },
] as const

function getEmptyBankForm() {
  return {
    id: undefined as number | undefined,
    bankNeve: '',
    iban: '',
    valuta: 'RON',
    nyitoEgyenleg: 0,
    szin: '#206bc4',
    ikon: 'building-2',
    isDefault: false,
    aktiv: true,
  }
}

function getEmptyDiscountForm(defaultYear: number) {
  return {
    id: undefined as string | undefined,
    ev: defaultYear,
    tipus: 'idoszak' as 'idoszak' | 'kor' | 'jovedelem',
    sorrend: 0,
    aktiv: true,
    kezdet: '01-01',
    hatarid: '07-01',
    kedvOsszeg: 0,
    korTol: 65,
    szazalek: 50,
    fixOsszeg: 0,
    jovLeiras: '',
  }
}

export function CongregationDialogV2({ open, onOpenChange, congregationId }: CongregationDialogProps) {
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [annualRows, setAnnualRows] = useState<AnnualFeeRow[]>([])
  // annualSchemaReady és annualWarning már nem kell (az Éves előzmények tab
  // törlésével a megjelenítő UI is megszűnt). A loadData még írja őket —
  // ha szükséges, a banner itt is megjeleníthető, de most nem renderelünk.
  const [dioceses, setDioceses] = useState<SimpleDiocese[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccountRow[]>([])
  const [bankSchemaReady, setBankSchemaReady] = useState(true)
  const [bankWarning, setBankWarning] = useState<string | null>(null)
  const [discounts, setDiscounts] = useState<FeeDiscountRow[]>([])
  const [discountSchemaReady, setDiscountSchemaReady] = useState(true)
  const [discountWarning, setDiscountWarning] = useState<string | null>(null)
  const [customFees, setCustomFees] = useState<CustomFeeRow[]>([])
  const [customFeeSchemaReady, setCustomFeeSchemaReady] = useState(true)
  const [customFeeWarning, setCustomFeeWarning] = useState<string | null>(null)
  // 2026-06-05: lelkészi szolgálati napló
  const [pastors, setPastors] = useState<CongregationPastorRow[]>([])
  const [pastorsSchemaReady, setPastorsSchemaReady] = useState(true)
  // 2026-06-05: gyülekezet-átadás indítása
  const [transferReason, setTransferReason] = useState('')
  const [transferring, setTransferring] = useState(false)
  // 2026-06-05 (F3b): nyitott átadás felülvizsgálata
  const [openTransfer, setOpenTransfer] = useState<OpenTransfer | null>(null)
  const [remarkText, setRemarkText] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  // 2026-06-05 (F3c): véglegesítés (bejövő lelkész)
  const [incomingEmail, setIncomingEmail] = useState('')
  const [completing, setCompleting] = useState(false)
  // 2026-06-05 (F4a): életciklus-státusz (inaktív gyülekezet jelzés)
  const [congStatus, setCongStatus] = useState<string | null>(null)
  const [customFeeForm, setCustomFeeForm] = useState({
    id: undefined as string | undefined,
    name: '',
    description: '',
    amount: 0,
    currency: 'RON',
    yearFrom: new Date().getFullYear(),
    yearTo: null as number | null,
    korTol: null as number | null,
    korIg: null as number | null,
    aktiv: true,
  })
  // historyForm mára elhagyva — az Éves előzmények tab törölve, helyette
  // az AnnualFeesPanel (inline edit) az Alapdíj al-tabon.
  const [bankForm, setBankForm] = useState(getEmptyBankForm())
  const [discountForm, setDiscountForm] = useState(getEmptyDiscountForm(new Date().getFullYear()))
  // Publikus oldal (readonly) — a gyülekezet külön modulban állítja be (/publikus-oldal),
  // itt csak megjelenítjük, hogy a lelkész lássa az élő URL-t.
  const [publicSite, setPublicSite] = useState<{ enabled: boolean; slug: string | null }>({
    enabled: false,
    slug: null,
  })
  const [form, setForm] = useState({
    id: '',
    nev: '',
    nevHu: '',
    nevRo: '',
    nevEn: '',
    adoszam: '',
    cim: '',
    megye: '',
    varos: '',
    iranyitoszam: '',
    hazszam: '',
    country: 'Románia',
    adrlocality_id: null as number | null,
    adrstreet_id: null as number | null,
    isForeign: false,
    email: '',
    telefon: '',
    web: '',
    evesJarulek: 100,
    jarulekKedvezmenyes: 0,
    jarulekHatarid: '12-31', // Alapértelmezett: év vége. A UI-ból nem szerkeszthető (2026-04-21i).
    iban: '',
    bank: '',
    dioceseId: '',
    tartozasSzamitasMod: 'akkori' as 'akkori' | 'aktualis',
    cimerUrl: '',
  })

  const previewUrl = useMemo(() => form.cimerUrl || '/EREK.png', [form.cimerUrl])

  const loadData = useCallback(async () => {
    if (!congregationId) return

    const [congregation, dioceseList, annualFeeResult, bankResult, discountResult, customFeeResult, pastorResult, transferResult] = await Promise.all([
      getCongregation(congregationId),
      getDioceses(),
      getCongregationAnnualFees(congregationId),
      getCongregationBankAccounts(congregationId),
      getCongregationFeeDiscounts(congregationId),
      getCongregationCustomFees(congregationId),
      getCongregationPastors(congregationId),
      getOpenTransfer(congregationId),
    ])

    if ('error' in annualFeeResult && annualFeeResult.error) toast.error(annualFeeResult.error)
    if ('error' in bankResult && bankResult.error) toast.error(bankResult.error)
    if ('error' in discountResult && discountResult.error) toast.error(discountResult.error)
    if ('error' in customFeeResult && customFeeResult.error) toast.error(customFeeResult.error)

    setDioceses(dioceseList)
    setAnnualRows((annualFeeResult.rows || []) as AnnualFeeRow[])
    setBankAccounts((bankResult.rows || []) as BankAccountRow[])
    setBankSchemaReady(bankResult.schemaReady !== false)
    setBankWarning('warning' in bankResult ? bankResult.warning || null : null)
    setDiscounts((discountResult.rows || []) as FeeDiscountRow[])
    setDiscountSchemaReady(discountResult.schemaReady !== false)
    setDiscountWarning('warning' in discountResult ? discountResult.warning || null : null)
    setCustomFees(customFeeResult.rows || [])
    setCustomFeeSchemaReady(customFeeResult.schemaReady !== false)
    setCustomFeeWarning('warning' in customFeeResult ? customFeeResult.warning || null : null)
    setPastors(pastorResult.rows || [])
    setPastorsSchemaReady(pastorResult.schemaReady !== false)
    if (pastorResult.error) toast.error(pastorResult.error)
    setOpenTransfer(transferResult.transfer)

    if (congregation) {
      const currentYear = new Date().getFullYear()
      setCongStatus((congregation as { status?: string | null }).status ?? null)
      setPublicSite({
        enabled: !!congregation.public_site_enabled,
        slug: congregation.public_slug ?? null,
      })
      setForm({
        id: congregation.id,
        nev: congregation.name || '',
        nevHu: congregation.nev_hu || congregation.name || '',
        nevRo: congregation.nev_ro || '',
        nevEn: congregation.nev_en || '',
        adoszam: congregation.adoszam || '',
        cim: congregation.cim || '',
        megye: (congregation.megye as string | null) || '',
        varos: (congregation.varos as string | null) || '',
        iranyitoszam: (congregation.iranyitoszam as string | null) || '',
        hazszam: (congregation.hazszam as string | null) || '',
        country: (congregation.country as string | null) || 'Románia',
        adrlocality_id: (congregation.adrlocality_id as number | null) ?? null,
        adrstreet_id: (congregation.adrstreet_id as number | null) ?? null,
        isForeign: false,
        email: congregation.email || '',
        telefon: congregation.telefon || '',
        web: congregation.web || '',
        evesJarulek: congregation.eves_jarulek ?? 100,
        jarulekKedvezmenyes: congregation.jarulek_kedvezmenyes ?? 0,
        jarulekHatarid: congregation.jarulek_hatarid || '12-31',
        iban: congregation.iban || '',
        bank: congregation.bank || '',
        dioceseId: congregation.diocese_id || '',
        tartozasSzamitasMod: normalizeDebtCalcMode(congregation.tartozas_szamitas_mod),
        cimerUrl: congregation.cimer_url || '',
      })
      setDiscountForm(getEmptyDiscountForm(currentYear))
      setBankForm(getEmptyBankForm())
    }
  }, [congregationId])

  useEffect(() => {
    if (!open || !congregationId) return

    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void loadData()
    })

    return () => {
      cancelled = true
    }
  }, [open, congregationId, loadData])

  if (!congregationId) return null
  const activeCongregationId = congregationId

  function update(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleCrestUpload(file: File) {
    setUploading(true)
    try {
      const supabase = createClient()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
      const path = `congregations/${congregationId}/${Date.now()}-${safeName}`
      const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
      if (error) throw error

      const { data } = supabase.storage.from('logos').getPublicUrl(path)
      if (!data?.publicUrl) throw new Error('A címer nyilvános URL-je nem hozható létre.')

      setForm((prev) => ({ ...prev, cimerUrl: data.publicUrl }))
      toast.success('A címer feltöltése sikerült.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A címer feltöltése sikertelen.')
    }
    setUploading(false)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    const result = await updateCongregation(form)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(result.success)
      onOpenChange(false)
    }

    setLoading(false)
  }

  async function handleSaveBankAccount() {
    const result = await saveCongregationBankAccount(activeCongregationId, bankForm)
    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success(result.success)
    setBankForm(getEmptyBankForm())
    const refreshed = await getCongregationBankAccounts(activeCongregationId)
    if ('error' in refreshed && refreshed.error) toast.error(refreshed.error)
    setBankAccounts((refreshed.rows || []) as BankAccountRow[])
    setBankSchemaReady(refreshed.schemaReady !== false)
    setBankWarning('warning' in refreshed ? refreshed.warning || null : null)
  }

  async function handleDeleteBankAccount(bankAccountId: number) {
    const result = await deleteCongregationBankAccount(activeCongregationId, bankAccountId)
    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success(result.success)
    const refreshed = await getCongregationBankAccounts(activeCongregationId)
    if ('error' in refreshed && refreshed.error) toast.error(refreshed.error)
    setBankAccounts((refreshed.rows || []) as BankAccountRow[])
    setBankSchemaReady(refreshed.schemaReady !== false)
    setBankWarning('warning' in refreshed ? refreshed.warning || null : null)
  }

  async function handleSaveDiscount() {
    const result = await saveCongregationFeeDiscount(activeCongregationId, discountForm)
    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success(result.success)
    setDiscountForm(getEmptyDiscountForm(new Date().getFullYear()))
    const refreshed = await getCongregationFeeDiscounts(activeCongregationId)
    if ('error' in refreshed && refreshed.error) toast.error(refreshed.error)
    setDiscounts((refreshed.rows || []) as FeeDiscountRow[])
    setDiscountSchemaReady(refreshed.schemaReady !== false)
    setDiscountWarning('warning' in refreshed ? refreshed.warning || null : null)
  }

  async function handleDeleteDiscount(discountId: string) {
    const result = await deleteCongregationFeeDiscount(activeCongregationId, discountId)
    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success(result.success)
    const refreshed = await getCongregationFeeDiscounts(activeCongregationId)
    if ('error' in refreshed && refreshed.error) toast.error(refreshed.error)
    setDiscounts((refreshed.rows || []) as FeeDiscountRow[])
    setDiscountSchemaReady(refreshed.schemaReady !== false)
    setDiscountWarning('warning' in refreshed ? refreshed.warning || null : null)
  }

  async function handleInitiateTransfer() {
    setTransferring(true)
    try {
      const res = await initiateCongregationTransfer({
        congregationId: activeCongregationId,
        reason: transferReason,
      })
      if ('error' in res && res.error) {
        toast.error(res.error)
        return
      }
      if (res.alreadyOpen) {
        toast.info('Ehhez a gyülekezethez már folyamatban van egy átadás.')
      } else {
        toast.success(
          res.auditorsNotified && res.auditorsNotified > 0
            ? 'Átadás elindítva — a rendszergazda és az egyházmegyei számvevő értesítve.'
            : 'Átadás elindítva — a rendszergazda értesítve (az egyházmegyében nincs számvevő).',
        )
      }
      await loadData()
    } finally {
      setTransferring(false)
    }
  }

  async function handleApproveTransfer() {
    if (!openTransfer) return
    setReviewBusy(true)
    try {
      const res = await approveTransfer(openTransfer.id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(
        res.status === 'ready'
          ? 'Jóváhagyva — az átadás készen áll a véglegesítésre.'
          : 'A jóváhagyásod rögzítve. A másik fél jóváhagyására várunk.',
      )
      await loadData()
    } finally {
      setReviewBusy(false)
    }
  }

  async function handleAddRemark() {
    if (!openTransfer || !remarkText.trim()) return
    setReviewBusy(true)
    try {
      const res = await addTransferRemark(openTransfer.id, remarkText)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Meghagyás rögzítve — az átadás a rendezésig blokkolva.')
      setRemarkText('')
      await loadData()
    } finally {
      setReviewBusy(false)
    }
  }

  async function handleCompleteTransfer() {
    if (!openTransfer || !incomingEmail.trim()) return
    setCompleting(true)
    try {
      const res = await completeTransfer({
        transferId: openTransfer.id,
        incomingEmail: incomingEmail,
        congregationId: activeCongregationId,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      if (res.needsRegistration) {
        toast.info('A bejövő lelkész még nincs a rendszerben — meghívó emailt küldtünk. Miután regisztrált és jóváhagytad a hozzáférését, véglegesítheted.')
      } else {
        toast.success('Az átadás véglegesítve — az új lelkész hozzáfér a gyülekezethez.')
        setIncomingEmail('')
        await loadData()
      }
    } finally {
      setCompleting(false)
    }
  }

  async function handleSaveCustomFee() {
    const result = await saveCongregationCustomFee(activeCongregationId, customFeeForm)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(result.success)
    const refreshed = await getCongregationCustomFees(activeCongregationId)
    setCustomFees(refreshed.rows || [])
    setCustomFeeSchemaReady(refreshed.schemaReady !== false)
    setCustomFeeWarning('warning' in refreshed ? refreshed.warning || null : null)
    // Form reset — új létrehozás mód
    setCustomFeeForm({
      id: undefined,
      name: '',
      description: '',
      amount: 0,
      currency: 'RON',
      yearFrom: new Date().getFullYear(),
      yearTo: null,
      korTol: null,
      korIg: null,
      aktiv: true,
    })
  }

  async function handleDeleteCustomFee(feeId: string) {
    const result = await deleteCongregationCustomFee(activeCongregationId, feeId)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(result.success)
    const refreshed = await getCongregationCustomFees(activeCongregationId)
    setCustomFees(refreshed.rows || [])
    setCustomFeeSchemaReady(refreshed.schemaReady !== false)
    setCustomFeeWarning('warning' in refreshed ? refreshed.warning || null : null)
  }

  // Évenkénti díjak — inline edit
  async function handleSaveAnnualYearFee(year: number, amount: number) {
    const result = await saveAnnualFee(activeCongregationId, year, amount)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(result.success)
    const refreshed = await getCongregationAnnualFees(activeCongregationId)
    setAnnualRows((refreshed.rows || []) as AnnualFeeRow[])
  }

  async function handleDeleteAnnualYearFee(year: number) {
    if (!confirm(`Biztosan törlöd a ${year}-es díjat?\n\nFigyelmeztetés: ha van erre az évre befizetés, az "árván" marad (a tartozás-számítás átugorja).`)) {
      return
    }
    const result = await deleteAnnualFee(activeCongregationId, year)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(result.success)
    const refreshed = await getCongregationAnnualFees(activeCongregationId)
    setAnnualRows((refreshed.rows || []) as AnnualFeeRow[])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto w-[calc(100%-1rem)] sm:max-w-6xl xl:max-w-[94vw]">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Gyülekezetünk adatai
            {congStatus === 'inactive' && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                Inaktív — 1+ éve nincs aktivitás
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="card-raised relative overflow-hidden p-5 sm:p-6">
            <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-amber-200/35 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-teal-200/25 blur-3xl" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-[1.7rem] border-4 border-white/75 bg-white shadow-[0_22px_44px_-28px_rgba(15,23,42,0.35)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Gyülekezeti címer" className="h-full w-full object-contain p-3" />
                  <label className="absolute bottom-2 right-2 flex cursor-pointer items-center gap-1 rounded-full border border-white/80 bg-white/94 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-white">
                    <Upload className="size-3.5" />
                    {uploading ? 'Feltöltés...' : 'Címer'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) void handleCrestUpload(file)
                      }}
                    />
                  </label>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">Gyülekezeti központ</p>
                  <h2 className="font-heading text-3xl text-slate-800">{form.nevHu || 'Gyülekezet'}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                    Itt tarthatók kézben a gyülekezet főadatai, pénzügyi alapszámai, címerképe, kedvezményrendszere és a korábbi évek egyházfenntartási előzményei.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white/84 px-3 py-1 font-medium text-slate-600 shadow-sm">{form.email || 'Nincs e-mail'}</span>
                    <span className="rounded-full bg-white/84 px-3 py-1 font-medium text-slate-600 shadow-sm">{form.telefon || 'Nincs telefonszám'}</span>
                    <span className="rounded-full bg-white/84 px-3 py-1 font-medium text-slate-600 shadow-sm">{dioceses.find((item) => item.id === form.dioceseId)?.name || 'Nincs egyházmegye'}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:w-[25rem]">
                <MetricCard label="Éves egyházfenntartás" value={`${form.evesJarulek.toLocaleString('hu-HU')} RON`} icon={<Landmark className="size-4" />} />
                <MetricCard label="Kedvezményes alapösszeg" value={`${form.jarulekKedvezmenyes.toLocaleString('hu-HU')} RON`} icon={<BadgePercent className="size-4" />} />
                <MetricCard label="Bankszámlák" value={`${bankAccounts.length} db`} icon={<Wallet className="size-4" />} />
                <MetricCard label="Kedvezményszabályok" value={`${discounts.length} db`} icon={<PiggyBank className="size-4" />} />
              </div>
            </div>
          </div>

          <Tabs defaultValue="alap" className="w-full">
            <TabsList className="grid w-full grid-cols-1 gap-2 rounded-[1.4rem] bg-slate-50 p-2 sm:grid-cols-3">
              <TabsTrigger value="alap">Alapadatok</TabsTrigger>
              <TabsTrigger value="penzugy">Pénzügy</TabsTrigger>
              <TabsTrigger value="lelkeszek">Lelkészek</TabsTrigger>
            </TabsList>

            <TabsContent value="lelkeszek" className="space-y-4 pt-4">
              <Panel title="Lelkészi szolgálati napló">
                <p className="mb-3 text-sm text-slate-600">
                  A gyülekezetben szolgáló (és korábban szolgált) lelkészek, a szolgálat
                  pontos időpontjaival. A lista automatikusan bővül a jóváhagyásokkor és a
                  lelkészcsere-átadásokkor.
                </p>
                {!pastorsSchemaReady ? (
                  <div className="rounded-[1rem] border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-xs text-amber-900">
                    A lelkészi napló adatbázis-táblája még nincs telepítve. Futtasd le a
                    <code className="mx-1">2026-06-05e-congregation-pastor-history.sql</code> fájlt.
                  </div>
                ) : pastors.length === 0 ? (
                  <p className="rounded-[1rem] border border-slate-200 bg-slate-50/60 px-3 py-3 text-sm text-slate-500">
                    Még nincs rögzített lelkészi szolgálat ehhez a gyülekezethez.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {pastors.map((p) => {
                      const fmt = (d: string | null) =>
                        d
                          ? new Date(d).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })
                          : null
                      const isCurrent = !p.ended_at
                      return (
                        <li
                          key={p.id}
                          className={`flex flex-wrap items-center justify-between gap-2 rounded-[1rem] border px-3 py-2.5 ${
                            isCurrent ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800">{p.full_name}</p>
                            <p className="text-xs text-slate-500">
                              {fmt(p.started_at)} –{' '}
                              {isCurrent ? (
                                <span className="font-medium text-emerald-700">jelenleg is szolgál</span>
                              ) : (
                                <>
                                  {fmt(p.ended_at)}
                                  {p.end_reason === 'transfer' && ' · átadás'}
                                  {p.end_reason === 'deletion' && ' · fiók törölve'}
                                </>
                              )}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              isCurrent ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {isCurrent ? 'Aktív' : 'Korábbi'}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Panel>

              <Panel title="Gyülekezet átadása másik lelkésznek">
                {openTransfer ? (
                  <div className="space-y-3 text-sm">
                    <div className="rounded-[1rem] border border-amber-200 bg-amber-50/60 px-3 py-3 text-amber-900">
                      <p className="font-semibold">Folyamatban lévő átadás</p>
                      <p className="mt-1 text-amber-800">
                        Indította: <strong>{openTransfer.from_full_name || 'a lelkész'}</strong>
                        {' · '}Állapot:{' '}
                        <strong>
                          {(({
                            requested: 'felülvizsgálatra vár',
                            review: 'felülvizsgálat alatt',
                            blocked_by_remarks: 'meghagyások miatt blokkolva',
                            ready: 'jóváhagyva — véglegesítésre kész',
                          }) as Record<string, string>)[openTransfer.status] || openTransfer.status}
                        </strong>
                      </p>
                      {openTransfer.reason && (
                        <p className="mt-1 text-amber-800">Indok: {openTransfer.reason}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${openTransfer.admin_approved_at ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                        {openTransfer.admin_approved_at ? '✓ Rendszergazda jóváhagyta' : 'Rendszergazda: várakozik'}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${openTransfer.auditor_approved_at ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                        {openTransfer.auditor_approved_at ? '✓ Számvevő jóváhagyta' : 'Számvevő: várakozik'}
                      </span>
                    </div>

                    {openTransfer.remarks.length > 0 && (
                      <div className="rounded-[1rem] border border-rose-200 bg-rose-50/50 p-3">
                        <p className="mb-1 text-xs font-semibold text-rose-800">Meghagyások</p>
                        <ul className="space-y-1.5">
                          {openTransfer.remarks.map((r) => (
                            <li key={r.id} className="text-xs text-rose-900">
                              <span className="font-medium">
                                {r.author_role === 'admin' ? 'Rendszergazda' : 'Számvevő'}:
                              </span>{' '}
                              {r.szoveg}
                              {r.resolved && <span className="ml-1 text-emerald-700">(rendezve)</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {openTransfer.my_review_role && openTransfer.status !== 'ready' ? (
                      <div className="space-y-2 rounded-[1rem] border border-sky-200 bg-sky-50/50 p-3">
                        <p className="text-xs text-sky-900">
                          Te{' '}
                          <strong>
                            {openTransfer.my_review_role === 'admin' ? 'rendszergazdaként' : 'számvevőként'}
                          </strong>{' '}
                          vizsgálhatod felül. Nézd át a gyülekezet adatait a többi fülön, majd hagyd
                          jóvá, vagy rögzíts meghagyást.
                        </p>
                        <Button
                          type="button"
                          onClick={handleApproveTransfer}
                          disabled={reviewBusy}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          Áttekintés rendben — jóváhagyom
                        </Button>
                        <Field label="Meghagyás / észrevétel (ha valami nincs rendben)">
                          <textarea
                            value={remarkText}
                            onChange={(e) => setRemarkText(e.target.value)}
                            rows={2}
                            placeholder="pl. A 2024-es számadás hiányzik a pénzügynél."
                            className="w-full rounded-xl border border-slate-200 bg-zinc-50 px-3 py-2 text-sm"
                          />
                        </Field>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleAddRemark}
                          disabled={reviewBusy || !remarkText.trim()}
                        >
                          Meghagyás rögzítése
                        </Button>
                      </div>
                    ) : openTransfer.status === 'ready' ? (
                      openTransfer.my_review_role === 'admin' ? (
                        <div className="space-y-2 rounded-[1rem] border border-emerald-200 bg-emerald-50/50 p-3">
                          <p className="text-xs text-emerald-900">
                            Mindkét fél jóváhagyta. Add meg a <strong>bejövő lelkész email-címét</strong>,
                            és véglegesítsd az átadást. Ha még nincs a rendszerben, meghívó emailt küldünk neki.
                          </p>
                          <Field label="Bejövő lelkész email-címe">
                            <Input
                              type="email"
                              value={incomingEmail}
                              onChange={(e) => setIncomingEmail(e.target.value)}
                              placeholder="uj.lelkesz@example.com"
                            />
                          </Field>
                          <Button
                            type="button"
                            onClick={handleCompleteTransfer}
                            disabled={completing || !incomingEmail.trim()}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            {completing ? 'Véglegesítés…' : 'Átadás véglegesítése'}
                          </Button>
                        </div>
                      ) : (
                        <div className="rounded-[1rem] border border-emerald-200 bg-emerald-50/60 px-3 py-3 text-emerald-900">
                          Mindkét fél jóváhagyta. Az átadást a <strong>rendszergazda</strong> véglegesíti — ő
                          adja meg az új lelkésznek a hozzáférést.
                        </div>
                      )
                    ) : (
                      <p className="text-xs text-slate-500">
                        A felülvizsgálók (rendszergazda + egyházmegyei számvevő) jóváhagyására vár.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="mb-3 text-sm text-slate-600">
                      Ha másik gyülekezetbe távozol, itt indíthatod el a gyülekezet
                      <strong> átadását</strong>. Az indítással a <strong>rendszergazda</strong> és az
                      egyházmegye <strong>számvevője</strong> értesül; átnézik a gyülekezet adatait,
                      és jóváhagyják az átadást vagy meghagyásokat rögzítenek. A gyülekezet adatai
                      nem vesznek el — csak a felelős lelkész változik.
                    </p>
                    <Field label="Indok / megjegyzés (opcionális)">
                      <textarea
                        value={transferReason}
                        onChange={(e) => setTransferReason(e.target.value)}
                        rows={2}
                        placeholder="pl. Másik gyülekezetbe helyeztek át 2026 szeptemberétől."
                        className="w-full rounded-xl border border-slate-200 bg-zinc-50 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      />
                    </Field>
                    <div className="mt-3">
                      <Button
                        type="button"
                        onClick={handleInitiateTransfer}
                        disabled={transferring}
                        className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                      >
                        {transferring ? 'Indítás…' : 'Gyülekezet átadásának indítása'}
                      </Button>
                    </div>
                  </>
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="alap" className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Panel title="Megnevezések">
                    <Field label="Hivatalos név"><Input value={form.nev} onChange={(event) => update('nev', event.target.value)} placeholder="pl. Barátosi Református Egyházközség" /></Field>
                    <Field label="Magyar név (rövid)"><Input value={form.nevHu} onChange={(event) => update('nevHu', event.target.value)} required /></Field>
                    <Field label="Román név"><Input value={form.nevRo} onChange={(event) => update('nevRo', event.target.value)} /></Field>
                    <Field label="Angol név"><Input value={form.nevEn} onChange={(event) => update('nevEn', event.target.value)} /></Field>
                    <Field label="Adószám (CUI)"><Input value={form.adoszam} onChange={(event) => update('adoszam', event.target.value)} /></Field>
                  </Panel>

                  <Panel title="Kapcsolati adatok">
                    <Field label="E-mail"><Input value={form.email} onChange={(event) => update('email', event.target.value)} type="email" /></Field>
                    <Field label="Telefon"><Input value={form.telefon} onChange={(event) => update('telefon', event.target.value)} /></Field>
                    <Field label="Weboldal">
                      <Input
                        value={form.web}
                        onChange={(event) => update('web', event.target.value)}
                        placeholder="https://gyulekezet.ro"
                      />
                      {publicSite.enabled && publicSite.slug && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
                          <span className="font-semibold">🌐 Kartotéka publikus oldal:</span>
                          <a
                            href={`/gy/${publicSite.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono underline hover:text-emerald-900"
                          >
                            /gy/{publicSite.slug}
                          </a>
                        </div>
                      )}
                      {!publicSite.enabled && (
                        <p className="mt-1 text-[11px] text-slate-400">
                          Saját Kartotéka-oldal létrehozása: oldalsáv →{' '}
                          <strong className="text-slate-500">Publikus oldal</strong>.
                        </p>
                      )}
                    </Field>
                  </Panel>
                </div>

                <Panel title="Hivatalos cím">
                  <p className="text-xs text-slate-500">
                    A megye és helység a hivatalos romániai adatbázisból választható; az irányítószám
                    automatikusan kitöltődik az utca alapján. Ez a cím jelenik meg a hivatalos iratokon —
                    ha az alapadatok-varázslóban valami kimaradt, itt utólag is pótolható.
                  </p>
                  <div className="mt-3">
                    <AddressForm
                      value={{
                        countyId: null,
                        localityId: form.adrlocality_id,
                        streetId: form.adrstreet_id,
                        country: form.country || 'Románia',
                        county: form.megye || '',
                        locality: form.varos || '',
                        street: form.cim || '',
                        houseNumber: form.hazszam || '',
                        postalcode: form.iranyitoszam || '',
                        isForeign: form.isForeign || false,
                      }}
                      onChange={(v: AddressValue) =>
                        setForm((f) => ({
                          ...f,
                          country: v.country,
                          megye: v.county,
                          varos: v.locality,
                          cim: v.street,
                          hazszam: v.houseNumber,
                          iranyitoszam: v.postalcode,
                          adrlocality_id: v.localityId,
                          adrstreet_id: v.streetId,
                          isForeign: v.isForeign,
                        }))
                      }
                      lang="hu"
                    />
                  </div>
                </Panel>

                <Panel title="Szervezeti hovatartozás">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Egyházkerület">
                      <div className="flex h-10 w-full items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                        {dioceses.find((d) => d.id === form.dioceseId)?.district_name || '— még nincs beállítva —'}
                      </div>
                    </Field>
                    <Field label="Egyházmegye">
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={form.dioceseId}
                        onChange={(event) => update('dioceseId', event.target.value)}
                      >
                        <option value="">— Válasszon egyházmegyét —</option>
                        {dioceses.map((diocese) => (
                          <option key={diocese.id} value={diocese.id}>
                            {diocese.name}
                            {diocese.district_name ? ` (${diocese.district_name})` : ''}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="mt-3 rounded-[1rem] border border-slate-100 bg-slate-50/60 px-4 py-2.5 text-[11px] leading-5 text-slate-500">
                    <strong>ℹ️</strong> A gyülekezet szervezeti hovatartozása. Az egyházkerület az
                    egyházmegye kiválasztása alapján automatikusan beállítódik. Ezt a beállítást
                    csak rendkívüli esetben szükséges változtatni.
                  </div>
                </Panel>

                <div className="flex justify-end gap-2 border-t pt-3">
                  <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Bezárás</Button>
                  <Button type="submit" disabled={loading || uploading}>{loading ? 'Mentés...' : 'Mentés'}</Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="penzugy" className="space-y-4 pt-4">
              <Tabs defaultValue="alapdij" className="flex flex-col md:flex-row md:gap-5">
                <TabsList className="w-full rounded-[1.2rem] bg-white p-1.5 shadow-sm md:w-56 md:shrink-0 md:flex-col md:h-auto md:items-stretch md:self-start md:p-2 md:gap-1">
                  <TabsTrigger value="alapdij" className="md:w-full md:justify-start md:px-3 md:py-2">
                    <Coins className="mr-2 size-4" />
                    Alapdíj
                  </TabsTrigger>
                  <TabsTrigger value="kedvezmenyek" className="md:w-full md:justify-start md:px-3 md:py-2">
                    <BadgePercent className="mr-2 size-4" />
                    <span className="flex-1 text-left">Kedvezmények</span>
                    {discounts.length > 0 && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        {discounts.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="bankszamlak" className="md:w-full md:justify-start md:px-3 md:py-2">
                    <Wallet className="mr-2 size-4" />
                    <span className="flex-1 text-left">Bankszámlák</span>
                    {bankAccounts.length > 0 && (
                      <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                        {bankAccounts.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="egyebdij" className="md:w-full md:justify-start md:px-3 md:py-2">
                    <HandCoins className="mr-2 size-4" />
                    <span className="flex-1 text-left">Egyéb díjak</span>
                    {customFees.length > 0 && (
                      <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                        {customFees.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>

                <div className="mt-3 flex-1 min-w-0 md:mt-0">

                {/* ─── ALAPDÍJ AL-TAB ─── */}
                <TabsContent value="alapdij" className="space-y-4 pt-4">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Két panel egymás mellett (desktop) — egymás alatt (mobile) */}
                    <div className="grid gap-4 xl:grid-cols-2">
                      <Panel title="Éves egyházfenntartás">
                        <Field label="Teljes éves díj (RON / tag)">
                          <Input type="number" min={0} value={form.evesJarulek} onChange={(event) => update('evesJarulek', Number(event.target.value))} />
                        </Field>
                        <div className="mt-2 rounded-[1rem] border border-sky-100 bg-sky-50/60 px-3 py-2.5 text-xs leading-5 text-sky-900">
                          <strong>ℹ️ Mit jelent ez?</strong> Minden egyház-tag éves tagsági díját
                          határozza meg. A <strong>fizetési határidő automatikusan december 31.</strong>.
                          Utána tartozás.
                          Időközi kedvezményeket (pl. &bdquo;júl. 1-ig fizet&rdquo;) a <strong>Kedvezmények</strong> fülön lehet állítani.
                        </div>
                      </Panel>

                      <Panel title="Tartozás számítási módja">
                        <div className="grid gap-2">
                          <label className={`flex cursor-pointer flex-col gap-1 rounded-[1rem] border-2 p-2.5 transition ${form.tartozasSzamitasMod === 'akkori' ? 'border-sky-500 bg-sky-50/80' : 'border-slate-200 hover:border-slate-300'}`}>
                            <span className="flex items-center gap-2">
                              <input type="radio" checked={form.tartozasSzamitasMod === 'akkori'} onChange={() => update('tartozasSzamitasMod', 'akkori')} />
                              <span className="font-semibold text-slate-800">Akkori összeg</span>
                            </span>
                            <span className="pl-6 text-xs text-slate-600">
                              Rögzített évenkénti díj. A 2023-as tartozás a 2023-as díjon marad.
                            </span>
                          </label>
                          <label className={`flex cursor-pointer flex-col gap-1 rounded-[1rem] border-2 p-2.5 transition ${form.tartozasSzamitasMod === 'aktualis' ? 'border-sky-500 bg-sky-50/80' : 'border-slate-200 hover:border-slate-300'}`}>
                            <span className="flex items-center gap-2">
                              <input type="radio" checked={form.tartozasSzamitasMod === 'aktualis'} onChange={() => update('tartozasSzamitasMod', 'aktualis')} />
                              <span className="font-semibold text-slate-800">Aktuális összeg</span>
                            </span>
                            <span className="pl-6 text-xs text-slate-600">
                              Mindig a mai díjat mutatja. Tükrözi az inflációt.
                            </span>
                          </label>
                        </div>
                        <div className="mt-2 rounded-[1rem] border border-amber-100 bg-amber-50/60 px-3 py-2 text-[11px] leading-4 text-amber-900">
                          <strong>📘 Példa:</strong> Egy tag 2023-ban nem fizette ki a 150 RON-os díjat. Ma 2026-ban a díj 200 RON.
                          <ul className="mt-1 list-inside list-disc space-y-0.5">
                            <li>Akkori: a tartozás <strong>150 RON</strong></li>
                            <li>Aktuális: a tartozás <strong>200 RON</strong></li>
                          </ul>
                        </div>
                      </Panel>
                    </div>

                    <div className="flex justify-end gap-2 border-t pt-3">
                      <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Bezárás</Button>
                      <Button type="submit" disabled={loading || uploading}>{loading ? 'Mentés...' : 'Mentés'}</Button>
                    </div>
                  </form>

                  {/* ─── ÉVENKÉNTI DÍJAK (visszamenőleg) ─── */}
                  <AnnualFeesPanel
                    rows={annualRows}
                    onSave={handleSaveAnnualYearFee}
                    onDelete={handleDeleteAnnualYearFee}
                    currentYearAmount={form.evesJarulek}
                  />
                </TabsContent>

                {/* ─── KEDVEZMÉNYEK AL-TAB ─── */}
                <TabsContent value="kedvezmenyek" className="space-y-4 pt-4">
                  {!discountSchemaReady && (
                    <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      A kedvezményrendszer tárolásához még futtatni kell a <code>migration-docs/sql/2026-04-09-god-mode-and-congregation-finance.sql</code> fájlt.
                    </div>
                  )}
                  {discountWarning && (
                    <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {discountWarning}
                    </div>
                  )}

                  <Panel title="Meglévő kedvezmények">
                    <div className="mb-3 rounded-[1rem] border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-xs leading-5 text-emerald-900">
                      <strong>💡 Több kedvezmény egy évben:</strong> Egy évre <strong>több időszaki
                      kedvezményt</strong> is be lehet állítani — pl. lépcsőzetes korai-fizetés
                      kedvezménnyel (jún. 1-ig 130 RON, júl. 15-ig 140 RON, aug. 1-ig 160 RON).
                      A rendszer a <strong>sorrend</strong> szerint alkalmazza: a legalacsonyabb
                      sorrend-értékű a legjobb kedvezmény.
                    </div>

                    {discounts.length === 0 ? (
                      <div className="rounded-[1.2rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                        Még nincs kedvezményszabály. Alul hozhatsz létre újat — 3 típus közül választhatsz, mindhez példát találsz.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Csoportosítás év szerint, évek csökkenő sorrendben */}
                        {Array.from(new Set(discounts.map((d) => d.ev)))
                          .sort((a, b) => b - a)
                          .map((year) => {
                            const yearDiscounts = discounts
                              .filter((d) => d.ev === year)
                              .sort((a, b) => a.sorrend - b.sorrend)
                            return (
                              <div key={year}>
                                <div className="mb-2 flex items-center gap-2">
                                  <span className="rounded-full bg-slate-100 px-3 py-0.5 text-sm font-semibold text-slate-700">
                                    {year}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {yearDiscounts.length} kedvezmény
                                  </span>
                                </div>
                                <div className="grid gap-3 lg:grid-cols-2">
                                  {yearDiscounts.map((discount) => (
                                    <DiscountCard
                                      key={discount.id}
                                      discount={discount}
                                      onEdit={() =>
                                        setDiscountForm({
                                          id: discount.id,
                                          ev: discount.ev,
                                          tipus: discount.tipus,
                                          sorrend: discount.sorrend,
                                          aktiv: discount.aktiv,
                                          kezdet: discount.kezdet || '01-01',
                                          hatarid: discount.hatarid || '07-01',
                                          kedvOsszeg: discount.kedv_osszeg ?? 0,
                                          korTol: discount.kor_tol ?? 65,
                                          szazalek: discount.szazalek ?? 50,
                                          fixOsszeg: discount.fix_osszeg ?? 0,
                                          jovLeiras: discount.jov_leiras || '',
                                        })
                                      }
                                      onDelete={() => void handleDeleteDiscount(discount.id)}
                                    />
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    )}
                  </Panel>

                  <Panel title={discountForm.id ? 'Kedvezmény szerkesztése' : 'Új kedvezmény létrehozása'}>
                    {/* 3 kártyás típus-választó */}
                    <div className="mb-4">
                      <p className="mb-2 text-xs text-slate-500">1. lépés — válaszd ki a kedvezmény típusát:</p>
                      <div className="grid gap-3 md:grid-cols-3">
                        <DiscountTypeCard
                          icon={<CalendarDays className="size-5" />}
                          title="Korai fizetés"
                          description="Határidőhöz kötött kedvezményes összeg."
                          example="Aki júl. 1-ig fizet, 130 RON-t fizet a 150 helyett."
                          selected={discountForm.tipus === 'idoszak'}
                          onClick={() => setDiscountForm((prev) => ({ ...prev, tipus: 'idoszak' }))}
                        />
                        <DiscountTypeCard
                          icon={<BadgePercent className="size-5" />}
                          title="Nyugdíjas / kor"
                          description="Egy korhatárhoz kötött százalékos kedvezmény."
                          example="65+ éves tag 50%-ot kap — 75 RON-t fizet a 150 helyett."
                          selected={discountForm.tipus === 'kor'}
                          onClick={() => setDiscountForm((prev) => ({ ...prev, tipus: 'kor' }))}
                        />
                        <DiscountTypeCard
                          icon={<Coins className="size-5" />}
                          title="Szociális"
                          description="Egyedi elbírálás (betegség, nehéz helyzet)."
                          example="Súlyos beteg tag 100% — 0 RON-t fizet."
                          selected={discountForm.tipus === 'jovedelem'}
                          onClick={() => setDiscountForm((prev) => ({ ...prev, tipus: 'jovedelem' }))}
                        />
                      </div>
                    </div>

                    {/* 2. lépés — típus-specifikus mezők */}
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500">2. lépés — add meg az adatokat:</p>

                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Év">
                          <Input type="number" value={discountForm.ev} onChange={(event) => setDiscountForm((prev) => ({ ...prev, ev: Number(event.target.value) }))} />
                        </Field>
                        <Field label="Sorrend (ha több szabály érvényes)">
                          <Input type="number" value={discountForm.sorrend} onChange={(event) => setDiscountForm((prev) => ({ ...prev, sorrend: Number(event.target.value) }))} />
                        </Field>
                      </div>

                      {discountForm.tipus === 'idoszak' && (
                        <div className="rounded-[1rem] border border-sky-100 bg-sky-50/40 p-3">
                          <div className="grid gap-3 md:grid-cols-3">
                            <Field label="Kezdő dátum (HH-NN)">
                              <Input value={discountForm.kezdet} onChange={(event) => setDiscountForm((prev) => ({ ...prev, kezdet: event.target.value }))} placeholder="01-01" />
                            </Field>
                            <Field label="Vég dátum (HH-NN)">
                              <Input value={discountForm.hatarid} onChange={(event) => setDiscountForm((prev) => ({ ...prev, hatarid: event.target.value }))} placeholder="07-01" />
                            </Field>
                            <Field label="Kedvezményes összeg (RON)">
                              <Input type="number" min={0} value={discountForm.kedvOsszeg} onChange={(event) => setDiscountForm((prev) => ({ ...prev, kedvOsszeg: Number(event.target.value) }))} />
                            </Field>
                          </div>
                          <p className="mt-2 text-[11px] text-slate-500">
                            Aki a <strong>kezdő–vég dátum</strong> időablakban fizet, a &bdquo;kedvezményes összeg&rdquo;-et fizeti a teljes díj helyett. Több időablak is felvehető (pl. 01-01–07-01 → 160, 07-02–10-31 → 190).
                          </p>
                        </div>
                      )}

                      {discountForm.tipus === 'kor' && (
                        <div className="rounded-[1rem] border border-amber-100 bg-amber-50/40 p-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <Field label="Korhatár (-től, év)">
                              <Input type="number" min={0} value={discountForm.korTol} onChange={(event) => setDiscountForm((prev) => ({ ...prev, korTol: Number(event.target.value) }))} />
                            </Field>
                            <Field label="Kedvezmény (%)">
                              <Input type="number" min={0} max={100} value={discountForm.szazalek} onChange={(event) => setDiscountForm((prev) => ({ ...prev, szazalek: Number(event.target.value) }))} />
                            </Field>
                          </div>
                          <p className="mt-2 text-[11px] text-slate-500">
                            Aki a megadott évek fölött van, a kedvezmény százalékával kevesebbet fizet.
                          </p>
                        </div>
                      )}

                      {discountForm.tipus === 'jovedelem' && (
                        <div className="rounded-[1rem] border border-rose-100 bg-rose-50/40 p-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <Field label="Kedvezmény (%) — vagy add meg a fix RON-ot">
                              <Input type="number" min={0} max={100} value={discountForm.szazalek} onChange={(event) => setDiscountForm((prev) => ({ ...prev, szazalek: Number(event.target.value) }))} />
                            </Field>
                            <Field label="Fix RON kedvezmény — ha inkább összeg">
                              <Input type="number" min={0} value={discountForm.fixOsszeg} onChange={(event) => setDiscountForm((prev) => ({ ...prev, fixOsszeg: Number(event.target.value) }))} />
                            </Field>
                          </div>
                          <div className="mt-3">
                            <Field label="Jogosultsági feltétel (szabad szöveg)">
                              <Input value={discountForm.jovLeiras} onChange={(event) => setDiscountForm((prev) => ({ ...prev, jovLeiras: event.target.value }))} placeholder="pl. Tartós betegség presbitériumi döntés alapján" />
                            </Field>
                          </div>
                        </div>
                      )}

                      {/* Aktív toggle — nem dropdown */}
                      <label className="flex cursor-pointer items-center gap-3 rounded-[1rem] border border-slate-200 bg-slate-50/40 p-3">
                        <input
                          type="checkbox"
                          checked={discountForm.aktiv}
                          onChange={(event) => setDiscountForm((prev) => ({ ...prev, aktiv: event.target.checked }))}
                          className="size-4"
                        />
                        <div>
                          <div className="text-sm font-medium text-slate-800">
                            {discountForm.aktiv ? 'Aktív kedvezmény' : 'Inaktív (mentve, de nem alkalmazódik)'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Egy kedvezmény lehet mentve, de kikapcsolva — pl. ha egy évre felfüggeszted.
                          </div>
                        </div>
                      </label>
                    </div>

                    <div className="mt-4 flex justify-between gap-2">
                      <Button type="button" variant="ghost" onClick={() => setDiscountForm(getEmptyDiscountForm(new Date().getFullYear()))}>
                        <Plus className="mr-2 size-4" />
                        Új üres
                      </Button>
                      <Button type="button" onClick={() => void handleSaveDiscount()}>
                        <Save className="mr-2 size-4" />
                        {discountForm.id ? 'Módosítás mentése' : 'Kedvezmény létrehozása'}
                      </Button>
                    </div>
                  </Panel>
                </TabsContent>

                {/* ─── BANKSZÁMLÁK AL-TAB ─── */}
                <TabsContent value="bankszamlak" className="space-y-4 pt-4">
                  <Panel title="Bankszámlák">
                {!bankSchemaReady && (
                  <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Az ikon és az alapértelmezett bankszámla jelölés teljes használatához még futtatni kell a <code>migration-docs/sql/2026-04-09-god-mode-and-congregation-finance.sql</code> fájlt.
                  </div>
                )}

                <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-3">
                {bankWarning && (
                  <div className="mb-4 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {bankWarning}
                  </div>
                )}
                {bankAccounts.length === 0 ? (
                      <div className="rounded-[1.2rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                        Még nincs rögzített bankszámla ehhez a gyülekezethez.
                      </div>
                    ) : (
                      bankAccounts.map((account) => (
                        <BankAccountCard
                          key={account.id}
                          account={account}
                          onEdit={() =>
                            setBankForm({
                              id: account.id,
                              bankNeve: account.bank_neve,
                              iban: account.iban || '',
                              valuta: account.valuta || 'RON',
                              nyitoEgyenleg: account.nyito_egyenleg || 0,
                              szin: account.szin || '#206bc4',
                              ikon: account.ikon || 'building-2',
                              isDefault: account.is_default,
                              aktiv: account.aktiv,
                            })
                          }
                          onDelete={() => void handleDeleteBankAccount(account.id)}
                        />
                      ))
                    )}
                  </div>

                  <div className="rounded-[1.2rem] border border-slate-200/80 bg-white p-4 shadow-[0_18px_36px_-32px_rgba(15,23,42,0.16)]">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-slate-700">Bankszámla hozzáadása</h4>
                      <Button type="button" variant="outline" size="sm" onClick={() => setBankForm(getEmptyBankForm())}>
                        <Plus className="mr-2 size-4" />
                        Új
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <Field label="Megnevezés"><Input value={bankForm.bankNeve} onChange={(event) => setBankForm((prev) => ({ ...prev, bankNeve: event.target.value }))} /></Field>
                      </div>
                      <div className="md:col-span-2">
                        <Field label="IBAN"><Input value={bankForm.iban} onChange={(event) => setBankForm((prev) => ({ ...prev, iban: event.target.value }))} /></Field>
                      </div>
                      <Field label="Valuta">
                        <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={bankForm.valuta} onChange={(event) => setBankForm((prev) => ({ ...prev, valuta: event.target.value }))}>
                          {CURRENCY_OPTIONS.map((currency) => (
                            <option key={currency} value={currency}>{currency}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Nyitó egyenleg"><Input type="number" value={bankForm.nyitoEgyenleg} onChange={(event) => setBankForm((prev) => ({ ...prev, nyitoEgyenleg: Number(event.target.value) }))} /></Field>
                      <Field label="Szín">
                        <div className="flex items-center gap-3">
                          <input type="color" value={bankForm.szin} onChange={(event) => setBankForm((prev) => ({ ...prev, szin: event.target.value }))} className="h-10 w-14 rounded-md border border-slate-200 bg-white" />
                          <Input value={bankForm.szin} onChange={(event) => setBankForm((prev) => ({ ...prev, szin: event.target.value }))} />
                        </div>
                      </Field>
                      <Field label="Ikon">
                        <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={bankForm.ikon} onChange={(event) => setBankForm((prev) => ({ ...prev, ikon: event.target.value }))}>
                          {ICON_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    <div className="mt-4 grid gap-3 rounded-[1.2rem] bg-slate-50 px-4 py-4 text-sm text-slate-600">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={bankForm.isDefault} onChange={(event) => setBankForm((prev) => ({ ...prev, isDefault: event.target.checked }))} />
                        Ez legyen az alapértelmezett bankszámla
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={bankForm.aktiv} onChange={(event) => setBankForm((prev) => ({ ...prev, aktiv: event.target.checked }))} />
                        Aktív bankszámla
                      </label>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <Button type="button" onClick={() => void handleSaveBankAccount()}>
                        <Save className="mr-2 size-4" />
                        Bankszámla mentése
                      </Button>
                    </div>
                  </div>
                </div>
                  </Panel>
                </TabsContent>

                {/* ─── EGYÉB DÍJAK AL-TAB (gyülekezet-specifikus díjak) ─── */}
                <TabsContent value="egyebdij" className="space-y-4 pt-4">
                  {!customFeeSchemaReady && (
                    <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      A gyülekezet-specifikus díjak tárolásához még futtatni kell a{' '}
                      <code>migration-docs/sql/2026-04-21-congregation-custom-fees.sql</code> fájlt.
                    </div>
                  )}
                  {customFeeWarning && (
                    <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {customFeeWarning}
                    </div>
                  )}

                  <Panel title="Meglévő gyülekezeti díjak">
                    <div className="mb-3 rounded-[1rem] border border-rose-100 bg-rose-50/60 px-4 py-3 text-xs leading-5 text-rose-900">
                      <strong>💡 Mi ez?</strong> A gyülekezet által <strong>presbitériumi határozattal</strong>{' '}
                      megszavazott különdíjak — pl. <em>temetős karbantartás</em>, <em>harangozási díj</em>,{' '}
                      <em>kántorilletmény</em>. Ezek nem az egyházfenntartás részei, a rendszer a
                      tartozás számításánál hozzáadja őket.
                    </div>

                    {customFees.length === 0 ? (
                      <div className="rounded-[1.2rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                        Még nincs rögzített gyülekezeti díj. Alul hozhatsz létre újat.
                      </div>
                    ) : (
                      <div className="grid gap-3 lg:grid-cols-2">
                        {customFees.map((fee) => (
                          <CustomFeeCard
                            key={fee.id}
                            fee={fee}
                            onEdit={() =>
                              setCustomFeeForm({
                                id: fee.id,
                                name: fee.name,
                                description: fee.description || '',
                                amount: fee.amount,
                                currency: fee.currency,
                                yearFrom: fee.year_from,
                                yearTo: fee.year_to,
                                korTol: fee.kor_tol,
                                korIg: fee.kor_ig,
                                aktiv: fee.aktiv,
                              })
                            }
                            onDelete={() => void handleDeleteCustomFee(fee.id)}
                          />
                        ))}
                      </div>
                    )}
                  </Panel>

                  <Panel title={customFeeForm.id ? 'Díj szerkesztése' : 'Új gyülekezeti díj'}>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <Field label="Megnevezés *">
                          <Input
                            value={customFeeForm.name}
                            onChange={(event) => setCustomFeeForm((prev) => ({ ...prev, name: event.target.value }))}
                            placeholder="pl. Temetős karbantartási díj"
                          />
                        </Field>
                      </div>
                      <div className="md:col-span-2">
                        <Field label="Leírás / hivatkozás (opcionális)">
                          <Input
                            value={customFeeForm.description}
                            onChange={(event) => setCustomFeeForm((prev) => ({ ...prev, description: event.target.value }))}
                            placeholder="pl. 2025/03. presbitériumi jegyzőkönyv alapján"
                          />
                        </Field>
                      </div>
                      <Field label="Éves összeg (RON / tag)">
                        <Input
                          type="number"
                          min={0}
                          value={customFeeForm.amount}
                          onChange={(event) => setCustomFeeForm((prev) => ({ ...prev, amount: Number(event.target.value) }))}
                        />
                      </Field>
                      <Field label="Érvényesség kezdete (év)">
                        <Input
                          type="number"
                          min={1900}
                          max={2999}
                          value={customFeeForm.yearFrom}
                          onChange={(event) => setCustomFeeForm((prev) => ({ ...prev, yearFrom: Number(event.target.value) }))}
                        />
                      </Field>
                      <Field label="Érvényesség vége (év, opcionális)">
                        <Input
                          type="number"
                          min={1900}
                          max={2999}
                          value={customFeeForm.yearTo ?? ''}
                          onChange={(event) => {
                            const v = event.target.value
                            setCustomFeeForm((prev) => ({ ...prev, yearTo: v ? Number(v) : null }))
                          }}
                          placeholder="Üresen = visszavonásig"
                        />
                      </Field>
                      <Field label="Korhatár — (tól, év, opcionális)">
                        <Input
                          type="number"
                          min={0}
                          value={customFeeForm.korTol ?? ''}
                          onChange={(event) => {
                            const v = event.target.value
                            setCustomFeeForm((prev) => ({ ...prev, korTol: v ? Number(v) : null }))
                          }}
                          placeholder="pl. 18 (csak nagykorúak)"
                        />
                      </Field>
                      <Field label="Korhatár — (ig, év, opcionális)">
                        <Input
                          type="number"
                          min={0}
                          value={customFeeForm.korIg ?? ''}
                          onChange={(event) => {
                            const v = event.target.value
                            setCustomFeeForm((prev) => ({ ...prev, korIg: v ? Number(v) : null }))
                          }}
                          placeholder="üresen = felső határ nincs"
                        />
                      </Field>
                    </div>

                    {/* Aktív toggle */}
                    <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-[1rem] border border-slate-200 bg-slate-50/40 p-3">
                      <input
                        type="checkbox"
                        checked={customFeeForm.aktiv}
                        onChange={(event) => setCustomFeeForm((prev) => ({ ...prev, aktiv: event.target.checked }))}
                        className="size-4"
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-800">
                          {customFeeForm.aktiv ? 'Aktív díj' : 'Inaktív (mentve, de nem számítjuk tartozásnak)'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Ha felfüggesztesz egy díjat — pl. átmenetileg — kapcsold ki a toggle-val,
                          ne töröld. Így a régi adatok megmaradnak.
                        </div>
                      </div>
                    </label>

                    <div className="mt-4 flex justify-between gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setCustomFeeForm({
                            id: undefined,
                            name: '',
                            description: '',
                            amount: 0,
                            currency: 'RON',
                            yearFrom: new Date().getFullYear(),
                            yearTo: null,
                            korTol: null,
                            korIg: null,
                            aktiv: true,
                          })
                        }
                      >
                        <Plus className="mr-2 size-4" />
                        Új üres
                      </Button>
                      <Button type="button" onClick={() => void handleSaveCustomFee()}>
                        <Save className="mr-2 size-4" />
                        {customFeeForm.id ? 'Módosítás mentése' : 'Díj létrehozása'}
                      </Button>
                    </div>
                  </Panel>
                </TabsContent>
                </div>
              </Tabs>
            </TabsContent>

          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card-raised p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

/**
 * AnnualFeesPanel — évenkénti egyházfenntartási díjak kezelő panel (2026-04-21k).
 *
 * Az Alapdíj al-tabon jelenik meg. A lelkész **visszamenőlegesen** is
 * rögzíthet éveket (akár 20-30 évet). Régebbi évekhez **nincs kedvezmény** —
 * csak az összeg állítható.
 *
 * Default nézet: 10 év visszafelé. A "+ Régebbi év" gombbal bővíthető.
 */
function AnnualFeesPanel({
  rows,
  onSave,
  onDelete,
  currentYearAmount,
}: {
  rows: AnnualFeeRow[]
  onSave: (year: number, amount: number) => Promise<void>
  onDelete: (year: number) => Promise<void>
  currentYearAmount: number
}) {
  const currentYear = new Date().getFullYear()
  const [yearsBack, setYearsBack] = useState(10)
  const [editValues, setEditValues] = useState<Record<number, string>>({})

  // Évek listája: currentYear-től visszafelé yearsBack év
  const years = Array.from({ length: yearsBack + 1 }, (_, i) => currentYear - i)
  const rowsByYear = new Map(rows.map((r) => [r.year, r]))

  function handleEditChange(year: number, value: string) {
    setEditValues((prev) => ({ ...prev, [year]: value }))
  }

  async function handleRowSave(year: number) {
    const raw = editValues[year]
    if (raw === undefined || raw === '') return
    const amount = Number(raw)
    if (isNaN(amount) || amount < 0) return
    await onSave(year, amount)
    setEditValues((prev) => {
      const next = { ...prev }
      delete next[year]
      return next
    })
  }

  return (
    <Panel title="Évenkénti díjak (visszamenőleg)">
      <div className="mb-3 rounded-[1rem] border border-slate-100 bg-slate-50/60 px-4 py-3 text-xs leading-5 text-slate-700">
        <strong>ℹ️ Hogyan működik?</strong> Az egyes évek egyházfenntartási díját itt rögzítheted
        visszamenőleg — akár 20-30 évig visszafelé. A <strong>régebbi évekhez nincs kedvezmény</strong>,
        mert azok elmaradásnak számítanak, teljes összegben fizetendők. A rendszer a tartozást
        csak az <strong>utolsó rögzített befizetéstől</strong> számolja — tehát ha a tag 2020-ban
        fizetett utoljára, a tartozás 2021-től indul.
      </div>

      <div className="overflow-hidden rounded-[1rem] border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Év</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Díj (RON)</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500"></th>
            </tr>
          </thead>
          <tbody>
            {years.map((year) => {
              const row = rowsByYear.get(year)
              const isCurrentYear = year === currentYear
              const editing = editValues[year] !== undefined
              const displayValue = editing
                ? editValues[year]
                : row
                  ? String(Number(row.eves_jarulek))
                  : isCurrentYear
                    ? String(currentYearAmount)
                    : ''
              const isEmpty = !row && !isCurrentYear && !editing
              return (
                <tr
                  key={year}
                  className={`border-t border-slate-100 ${
                    isCurrentYear ? 'bg-emerald-50/40' : row ? 'bg-white' : 'bg-slate-50/30'
                  }`}
                >
                  <td className="px-3 py-2 font-semibold text-slate-700">
                    {year}
                    {isCurrentYear && (
                      <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800">
                        Aktuális
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEmpty ? (
                      <span className="text-xs text-slate-400">— nincs rögzítve —</span>
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        value={displayValue}
                        onChange={(e) => handleEditChange(year, e.target.value)}
                        className="h-8 max-w-28 text-sm"
                        disabled={isCurrentYear}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isCurrentYear ? (
                      <span className="text-[11px] text-slate-400">
                        ↑ A fenti &bdquo;Teljes éves díj&rdquo; mezőben szerkeszd
                      </span>
                    ) : isEmpty ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditValues((prev) => ({ ...prev, [year]: '' }))}
                      >
                        <Plus className="mr-1 size-3.5" />
                        Hozzáadás
                      </Button>
                    ) : editing ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleRowSave(year)}
                        >
                          <Save className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setEditValues((prev) => {
                              const next = { ...prev }
                              delete next[year]
                              return next
                            })
                          }
                        >
                          Mégse
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditValues((prev) => ({ ...prev, [year]: String(Number(row!.eves_jarulek)) }))}
                        >
                          Szerkeszt
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void onDelete(year)}
                        >
                          <Trash2 className="size-3.5 text-rose-600" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex justify-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setYearsBack((n) => n + 10)}
        >
          + Régebbi 10 év mutatása (jelenleg {yearsBack} év visszafelé)
        </Button>
      </div>
    </Panel>
  )
}

/**
 * Gyülekezet-specifikus díj megjelenítő kártya — olvasásra, szerkesztés / törlés gombbal.
 */
function CustomFeeCard({
  fee,
  onEdit,
  onDelete,
}: {
  fee: CustomFeeRow
  onEdit: () => void
  onDelete: () => void
}) {
  const yearLabel = fee.year_to ? `${fee.year_from}–${fee.year_to}` : `${fee.year_from}-től`
  const ageLabel =
    fee.kor_tol !== null && fee.kor_ig !== null
      ? `${fee.kor_tol}–${fee.kor_ig} évesek`
      : fee.kor_tol !== null
        ? `${fee.kor_tol}+ évesek`
        : fee.kor_ig !== null
          ? `${fee.kor_ig} éves korig`
          : 'Minden tag'

  return (
    <div className={`rounded-[1.1rem] border-2 p-3 ${fee.aktiv ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-slate-50/70 opacity-70'}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-800">{fee.name}</div>
          {fee.description && (
            <div className="mt-0.5 truncate text-[11px] text-slate-500">{fee.description}</div>
          )}
        </div>
        {!fee.aktiv && (
          <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
            inaktív
          </span>
        )}
      </div>
      <div className="mb-2 flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="rounded-full bg-white/85 px-2 py-0.5 font-mono">
          {fee.amount.toLocaleString('hu-HU')} {fee.currency}
        </span>
        <span className="rounded-full bg-white/85 px-2 py-0.5">{yearLabel}</span>
        <span className="rounded-full bg-white/85 px-2 py-0.5">{ageLabel}</span>
      </div>
      <div className="flex justify-end gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={onEdit}>
          Szerkeszt
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="size-3.5 text-rose-600" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Kedvezmény-típus kártya a 3-kártyás típus-választóhoz.
 * Emerald keretre vált, ha a kártya kiválasztott.
 */
function DiscountTypeCard({
  icon,
  title,
  description,
  example,
  selected,
  onClick,
}: {
  icon: ReactNode
  title: string
  description: string
  example: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-full flex-col items-start gap-2 rounded-[1.1rem] border-2 p-3 text-left transition ${
        selected
          ? 'border-emerald-500 bg-emerald-50/80 shadow-sm'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className={`flex size-9 items-center justify-center rounded-full ${selected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
        {icon}
      </div>
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      <div className="text-xs text-slate-500">{description}</div>
      <div className={`mt-auto rounded-md px-2 py-1 text-[11px] leading-tight ${selected ? 'bg-emerald-100/70 text-emerald-900' : 'bg-slate-50 text-slate-500'}`}>
        <strong>Példa:</strong> {example}
      </div>
    </button>
  )
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-[1.2rem] border border-white/80 bg-white/88 p-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.22)]">
      <div className="flex items-center gap-2 text-teal-600">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-700">{value}</p>
    </div>
  )
}

function DiscountCard({
  discount,
  onEdit,
  onDelete,
}: {
  discount: FeeDiscountRow
  onEdit: () => void
  onDelete: () => void
}) {
  const description =
    discount.tipus === 'idoszak'
      ? `Időablak: ${discount.kezdet || '—'}–${discount.hatarid || '—'} · Kedvezményes összeg: ${Number(discount.kedv_osszeg || 0).toLocaleString('hu-HU')} RON`
      : discount.tipus === 'kor'
        ? `${discount.kor_tol || 0}+ éves kortól · ${discount.szazalek || 0}% kedvezmény`
        : `${discount.szazalek || 0}% vagy ${Number(discount.fix_osszeg || 0).toLocaleString('hu-HU')} RON · ${discount.jov_leiras || 'Szociális kedvezmény'}`

  return (
    <div className="rounded-[1.2rem] border border-slate-200/70 bg-white/92 p-4 shadow-[0_16px_30px_-28px_rgba(15,23,42,0.16)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            {discount.ev}. év · {discount.tipus === 'idoszak' ? 'Kedvezményes időszak' : discount.tipus === 'kor' ? 'Fizetés / nyugdíj alapú' : 'Szociális alapú'}
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-800">{description}</p>
          <p className="mt-2 text-xs text-slate-500">{discount.aktiv ? 'Aktív szabály' : 'Inaktív szabály'}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>Szerkesztés</Button>
          <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={onDelete}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function BankAccountCard({
  account,
  onEdit,
  onDelete,
}: {
  account: BankAccountRow
  onEdit: () => void
  onDelete: () => void
}) {
  const Icon = account.ikon === 'wallet' ? Wallet : account.ikon === 'piggy-bank' ? PiggyBank : account.ikon === 'landmark' ? Landmark : Building2

  return (
    <div className="rounded-[1.2rem] border border-slate-200/70 bg-white/92 p-4 shadow-[0_16px_30px_-28px_rgba(15,23,42,0.16)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${account.szin || '#206bc4'}18`, color: account.szin || '#206bc4' }}
          >
            <Icon className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-800">{account.bank_neve}</p>
              {account.is_default && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  <Star className="size-3.5" />
                  Alapértelmezett
                </span>
              )}
              {!account.aktiv && (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">Inaktív</span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">{account.iban || 'Nincs IBAN megadva'}</p>
            <p className="mt-2 text-sm text-slate-600">
              {Number(account.nyito_egyenleg || 0).toLocaleString('hu-HU')} {account.valuta}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>Szerkesztés</Button>
          <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={onDelete}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

