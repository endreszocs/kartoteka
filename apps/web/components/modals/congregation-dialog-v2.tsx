'use client'

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgePercent,
  Building2,
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
  getCongregation,
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
  updateCongregation,
  type CustomFeeRow,
} from '@/app/(dashboard)/congregation/actions'
import { CongregationSummary, type CongregationSummaryData } from './congregation-summary'
// 2026-07-10 (S2-1a): a Kedvezmények / Egyéb díjak / Évenkénti díjak felület MINDKÉT helyen
// (ez a dialog + a Gyülekezet beállítása wizard) UGYANAZ a megosztott komponens legyen —
// a korábbi inline másolat elsodródott (hiányzó „él" jelvény, más mentés-utáni viselkedés,
// „3 típus" szöveg 4 típusnál, láthatatlan input-mezők).
import { FeeDiscountsManager } from '@/components/congregation/fee-discounts-manager'
import { CustomFeesManager } from '@/components/congregation/custom-fees-manager'
import { AnnualFeesManager } from '@/components/congregation/annual-fees-manager'
import { OpeningBalancesManager } from '@/components/congregation/opening-balances-manager'
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
  tipus: 'idoszak' | 'kor' | 'jovedelem' | 'foglalkozas'
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
  /** #Endre 2026-07-02: 'view' = tisztán read-only „Gyülekezetünk adatai" (nincs szerkesztés);
   *  'advanced-edit' = a beállításokból nyíló haladó szerkesztő (kedvezmények, díjak, lelkész-átadás). */
  variant?: 'view' | 'advanced-edit'
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

export function CongregationDialogV2({ open, onOpenChange, congregationId, variant = 'view' }: CongregationDialogProps) {
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  // 2026-07-10 (S2-1a): az évenkénti díjak, a kedvezmény-űrlap és az egyéb díj-űrlap
  // state-je a megosztott manager-komponensekbe költözött (AnnualFeesManager,
  // FeeDiscountsManager, CustomFeesManager). Itt csak a listák maradnak, amelyek a
  // fül-badge-ekhez és a read-only összefoglalóhoz kellenek.
  const [dioceses, setDioceses] = useState<SimpleDiocese[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccountRow[]>([])
  const [bankSchemaReady, setBankSchemaReady] = useState(true)
  const [bankWarning, setBankWarning] = useState<string | null>(null)
  const [discounts, setDiscounts] = useState<FeeDiscountRow[]>([])
  const [customFees, setCustomFees] = useState<CustomFeeRow[]>([])
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
  // #Endre 2026-07-01: az ablak alapból a read-only, nyomtatható ÖSSZEFOGLALÓT mutatja;
  // a „Szerkesztés" gombra vált a meglévő szerkesztő nézetre.
  const [mode, setMode] = useState<'summary' | 'edit'>(variant === 'advanced-edit' ? 'edit' : 'summary')
  const [districtName, setDistrictName] = useState<string | null>(null)
  const [bankForm, setBankForm] = useState(getEmptyBankForm())
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

    const [congregation, dioceseList, bankResult, discountResult, customFeeResult, pastorResult, transferResult] = await Promise.all([
      getCongregation(congregationId),
      getDioceses(),
      getCongregationBankAccounts(congregationId),
      getCongregationFeeDiscounts(congregationId),
      getCongregationCustomFees(congregationId),
      getCongregationPastors(congregationId),
      getOpenTransfer(congregationId),
    ])

    if ('error' in bankResult && bankResult.error) toast.error(bankResult.error)
    if ('error' in discountResult && discountResult.error) toast.error(discountResult.error)
    if ('error' in customFeeResult && customFeeResult.error) toast.error(customFeeResult.error)

    // 2026-08-10 (K4 regisztráció-diagnosztika #7): a getDioceses mostantól
    // { data, error }-t ad — a hiba nem tűnhet el némán egy üres listában.
    setDioceses(dioceseList.data)
    if (dioceseList.error) toast.error(dioceseList.error)
    setBankAccounts((bankResult.rows || []) as BankAccountRow[])
    setBankSchemaReady(bankResult.schemaReady !== false)
    setBankWarning('warning' in bankResult ? bankResult.warning || null : null)
    // 2026-07-10 (S2-1a): a kedvezmény/díj listák itt csak a fül-badge-ekhez és az
    // összefoglalóhoz kellenek — a CRUD a megosztott manager-komponensekben történik.
    setDiscounts((discountResult.rows || []) as FeeDiscountRow[])
    setCustomFees(customFeeResult.rows || [])
    setPastors(pastorResult.rows || [])
    setPastorsSchemaReady(pastorResult.schemaReady !== false)
    if (pastorResult.error) toast.error(pastorResult.error)
    setOpenTransfer(transferResult.transfer)

    if (congregation) {
      setCongStatus((congregation as { status?: string | null }).status ?? null)
      setDistrictName(
        (congregation as { district?: string | null }).district
        || (congregation as { egyhazkerulet?: string | null }).egyhazkerulet
        || null,
      )
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
        // 2026-07-17 (F5): a szigorított HH-NN validáció miatt a régi, érvénytelen
        // tárolt érték (pl. '31-12') mentés-blokkolót okozna — a mező a UI-ból nem
        // szerkeszthető, ezért betöltéskor sanitizáljuk.
        jarulekHatarid: /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(congregation.jarulek_hatarid || '')
          ? (congregation.jarulek_hatarid as string)
          : '12-31',
        iban: congregation.iban || '',
        bank: congregation.bank || '',
        dioceseId: congregation.diocese_id || '',
        tartozasSzamitasMod: normalizeDebtCalcMode(congregation.tartozas_szamitas_mod),
        cimerUrl: congregation.cimer_url || '',
      })
      setBankForm(getEmptyBankForm())
    }
  }, [congregationId])

  useEffect(() => {
    if (!open || !congregationId) return

    setMode(variant === 'advanced-edit' ? 'edit' : 'summary') // view = read-only összefoglaló; advanced-edit = szerkesztő
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void loadData()
    })

    return () => {
      cancelled = true
    }
  }, [open, congregationId, loadData, variant])

  // #Endre 2026-07-01: a read-only összefoglaló + nyomtatás adatai a betöltött form-ból/listákból.
  // (A hook-oknak a feltételes `return null` ELŐTT kell lenniük — rules-of-hooks.)
  const summaryData: CongregationSummaryData = useMemo(() => {
    const dioceseName = dioceses.find((d) => d.id === form.dioceseId)?.name || null
    const cimSor = [
      form.iranyitoszam,
      form.varos,
      [form.cim, form.hazszam].filter(Boolean).join(' '),
      form.megye && form.megye !== form.varos ? `${form.megye} megye` : '',
      form.country && form.country !== 'Románia' ? form.country : '',
    ].filter(Boolean).join(', ')
    const amt = (n: number | null) => `${(Number(n) || 0).toLocaleString('hu-HU')} RON`
    const fmtDiscount = (d: FeeDiscountRow): string => {
      if (d.tipus === 'idoszak') return `Időablak ${d.kezdet || '—'}–${d.hatarid || '—'}: ${amt(d.kedv_osszeg)}`
      if (d.tipus === 'kor') return `${d.kor_tol ?? '?'}+ év: ${d.szazalek ? `${d.szazalek}%` : amt(d.fix_osszeg)}`
      if (d.tipus === 'foglalkozas') return `${d.jov_leiras || 'Foglalkozás'}: ${Number(d.fix_osszeg) === 0 ? 'nem fizet' : amt(d.fix_osszeg)}`
      return `${d.jov_leiras || 'Jövedelem'}: ${d.szazalek ? `${d.szazalek}%` : amt(d.fix_osszeg)}`
    }
    return {
      cimerUrl: form.cimerUrl || '',
      nevHu: form.nevHu,
      nev: form.nev,
      nevRo: form.nevRo,
      nevEn: form.nevEn,
      adoszam: form.adoszam,
      districtName,
      dioceseName,
      cimSor,
      email: form.email,
      telefon: form.telefon,
      web: form.web,
      banks: bankAccounts.filter((b) => b.aktiv !== false).map((b) => ({
        bank_neve: b.bank_neve, iban: b.iban, valuta: b.valuta, is_default: b.is_default,
      })),
      evesJarulek: form.evesJarulek,
      jarulekKedvezmenyes: form.jarulekKedvezmenyes,
      jarulekHatarid: form.jarulekHatarid,
      tartozasSzamitasMod: form.tartozasSzamitasMod as 'akkori' | 'aktualis',
      discounts: discounts.filter((d) => d.aktiv !== false).map(fmtDiscount),
      pastors: pastors.map((p) => ({ full_name: p.full_name, started_at: p.started_at, ended_at: p.ended_at })),
      status: congStatus,
    }
  }, [form, dioceses, districtName, bankAccounts, discounts, pastors, congStatus])

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

  // 2026-07-10 (S2-1a): a megosztott manager-komponensek mentése/törlése után a dialog
  // saját listáit frissítjük (fül-badge + MetricCard + read-only összefoglaló), hogy ne
  // mutassanak elavult darabszámot.
  async function refreshDiscounts() {
    const refreshed = await getCongregationFeeDiscounts(activeCongregationId)
    setDiscounts((refreshed.rows || []) as FeeDiscountRow[])
  }

  async function refreshCustomFees() {
    const refreshed = await getCongregationCustomFees(activeCongregationId)
    setCustomFees(refreshed.rows || [])
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* #Endre 2026-07-02: a read-only összefoglaló (view) keskenyebb — a 2 oszlopos kártyák nem
          igényelnek 94vw-t; a haladó szerkesztő (advanced-edit, táblázatok/tabok) marad széles. */}
      <DialogContent className={`max-h-[92vh] overflow-y-auto w-[calc(100%-1rem)] ${variant === 'advanced-edit' ? 'sm:max-w-6xl xl:max-w-[94vw]' : 'sm:max-w-4xl'}`}>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {variant === 'advanced-edit' ? 'Kedvezmények, díjak és lelkész-átadás' : 'Gyülekezetünk adatai'}
            {congStatus === 'inactive' && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                Inaktív — 1+ éve nincs aktivitás
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {mode === 'summary' ? (
          // #Endre 2026-07-02: TISZTÁN read-only — a szerkesztés a Gyülekezet beállítása ablakban.
          <CongregationSummary
            data={summaryData}
            onEdit={() => {
              if (variant === 'advanced-edit') { setMode('edit'); return }
              onOpenChange(false)
              window.dispatchEvent(new Event('kartoteka:open-congregation-setup-wizard'))
            }}
          />
        ) : (
        <div className="space-y-5">
          <div>
            <button
              type="button"
              onClick={() => setMode('summary')}
              className="text-sm font-medium text-teal-700 hover:text-teal-900"
            >
              ← Vissza az összefoglalóhoz
            </button>
          </div>
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

          {/* advanced-edit (a beállításokból): az Alapadatok a Gyülekezet beállítása ablakban van,
              ezért itt csak Pénzügy + Lelkészek látszik, Pénzügy-alapértelmezéssel. */}
          <Tabs defaultValue={variant === 'advanced-edit' ? 'penzugy' : 'alap'} className="w-full">
            <TabsList className={`grid w-full grid-cols-1 gap-2 rounded-[1.4rem] bg-slate-50 p-2 ${variant === 'advanced-edit' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
              {variant !== 'advanced-edit' && <TabsTrigger value="alap">Alapadatok</TabsTrigger>}
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
                      {/* 2026-08-10 (K4 regisztráció-diagnosztika #1/#2): a helyőrző
                          opció disabled, és csak akkor látszik, ha még nincs beállított
                          egyházmegye — üres értéket nem lehet visszamenteni. A szerver
                          (updateCongregation) is védve van: üres érték esetén a
                          diocese_id kulcs ki sem kerül a payloadba. */}
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-muted"
                        value={form.dioceseId}
                        disabled={dioceses.length === 0}
                        onChange={(event) => {
                          if (!event.target.value) return
                          update('dioceseId', event.target.value)
                        }}
                      >
                        {!form.dioceseId && (
                          <option value="" disabled>
                            — Válasszon egyházmegyét —
                          </option>
                        )}
                        {dioceses.map((diocese) => (
                          <option key={diocese.id} value={diocese.id}>
                            {diocese.name}
                            {diocese.district_name ? ` (${diocese.district_name})` : ''}
                          </option>
                        ))}
                      </select>
                      {!form.dioceseId && (
                        <p className="mt-1 text-xs text-amber-700">
                          A gyülekezet még egyetlen egyházmegyéhez sem tartozik — enélkül nem
                          jelenik meg az egyházmegyei és egyházkerületi felületeken.
                        </p>
                      )}
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
                  {/* 2026-07-11 (S6-#3): évkezdő (nyitó) egyenlegek szerkesztése —
                      a legelső készpénz- és banki egyenlegek, az egyenleg-lánc bázisa. */}
                  <TabsTrigger value="nyitok" className="md:w-full md:justify-start md:px-3 md:py-2">
                    <PiggyBank className="mr-2 size-4" />
                    Nyitó egyenlegek
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

                      {/* 2026-07-17 (F5, Q6 — user-döntés): a „Tartozás számítási módja"
                          választó KIVEZETVE — a rendszer mindig az akkori év beállításai
                          szerint számol. Statikus tájékoztató maradt a helyén. */}
                      <Panel title="Tartozás számítási módja">
                        <div className="rounded-[1rem] border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-xs leading-5 text-slate-600">
                          A rendszer a régi évek tartozását mindig az <strong>akkori év</strong>{' '}
                          beállításai (díja és kedvezményei) szerint számolja — pl. a 2023-as
                          tartozás a 2023-as díjon marad. Ez a könyvelésileg helyes, rögzített mód.
                        </div>
                      </Panel>
                    </div>

                    <div className="flex justify-end gap-2 border-t pt-3">
                      <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Bezárás</Button>
                      <Button type="submit" disabled={loading || uploading}>{loading ? 'Mentés...' : 'Mentés'}</Button>
                    </div>
                  </form>

                  {/* ─── ÉVENKÉNTI DÍJAK (visszamenőleg) ───
                      2026-07-10 (S2-1a): a wizarddal közös, self-contained komponens
                      (látható input-mezőkkel) az inline AnnualFeesPanel helyett. */}
                  <AnnualFeesManager
                    congregationId={activeCongregationId}
                    currentYearFee={form.evesJarulek}
                  />
                </TabsContent>

                {/* ─── KEDVEZMÉNYEK AL-TAB ───
                    2026-07-10 (S2-1a): a Gyülekezet beállítása wizarddal KÖZÖS
                    FeeDiscountsManager fut itt is — azonos űrlap és mentés-utáni viselkedés
                    (év+típus megtartása), „él" típus-jelvények, látható input-mezők. */}
                <TabsContent value="kedvezmenyek">
                  <FeeDiscountsManager
                    congregationId={activeCongregationId}
                    onChanged={refreshDiscounts}
                  />
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

                {/* ─── EGYÉB DÍJAK AL-TAB (gyülekezet-specifikus díjak) ───
                    2026-07-10 (S2-1a): a wizarddal KÖZÖS CustomFeesManager fut itt is. */}
                <TabsContent value="nyitok" className="pt-4">
                  <OpeningBalancesManager bankAccounts={bankAccounts} />
                </TabsContent>

                <TabsContent value="egyebdij">
                  <CustomFeesManager
                    congregationId={activeCongregationId}
                    onChanged={refreshCustomFees}
                  />
                </TabsContent>
                </div>
              </Tabs>
            </TabsContent>

          </Tabs>
        </div>
        )}
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

// 2026-07-10 (S2-1a): az AnnualFeesPanel, CustomFeeCard, DiscountTypeCard és DiscountCard
// al-komponensek innen TÖRÖLVE — a megosztott manager-komponensek
// (components/congregation/{annual-fees,custom-fees,fee-discounts}-manager.tsx) tartalmazzák
// őket, így a beállítás-dialog és a wizard nem tud többé szétcsúszni.

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

