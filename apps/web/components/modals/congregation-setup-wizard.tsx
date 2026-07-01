'use client'

/**
 * Gyülekezeti setup — a gyülekezet alapadatainak bevitele / szerkesztése.
 *
 * 2026-06-05 (Endre kérése): a korábbi lépcsős "kezdő beállítás varázsló" helyett
 * EGYLAPOS, görgethető szerkesztő. Minden szakasz egyszerre látható és bármikor
 * szerkeszthető — ugyanaz a tartalom, ami a welcome oldalon is megtalálható és
 * változtatható: alapadatok + címer, cím, elérhetőség, és TÖBB bankszámla.
 *
 * Mikor jelenik meg:
 *   - Automatikusan a /dashboard első betöltéskor, ha a gyülekezet alapadatai
 *     még hiányoznak (lásd checkCongregationSetupStatus). A "Később" gomb
 *     24 órára elhalasztja (lásd CongregationSetupAutoOpen).
 *   - Kattintásra a globális CongregationSetupBanner-ből (minden oldalon).
 */

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Banknote, Calculator, Check, Church, FileText, Image as ImageIcon,
  Landmark, Loader2, MapPin, Phone, Plus, Save, Star, Trash2, Upload, Wallet, X,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModalField } from '@/components/ui/modal-field'
import { AddressForm, type AddressValue } from '@/components/ui/address-form'
// #3 (Endre): a Pénzügyi alap szakasz a welcome finance-lépés vizuális mintáját kövesse
// (kártya-szakaszok + magyarázó bannerek + radio-kártyák) — közös helper-komponensek.
import {
  WizardSectionCard,
  WizardField,
  WizardBanner,
  Input as WizardInput,
} from '@/components/onboarding/wizard/_helpers/wizard-ui'
import {
  getCongregationForSetup,
  saveCongregationSetup,
  uploadCongregationCimer,
  getCongregationBankAccounts,
  saveCongregationBankAccount,
  deleteCongregationBankAccount,
  getDioceses,
} from '@/app/(dashboard)/congregation/actions'

/**
 * A beviteli mezők erősebb kiemelése (tömör fehér háttér + határozott keret),
 * hogy ne olvadjanak a wizard világos/teal gradient hátterébe.
 */
const FIELD_INPUT_CLASS =
  'bg-white border-slate-300 shadow-sm hover:border-slate-400 focus-visible:border-teal-500 focus-visible:ring-teal-500/25'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  congregationId: string
  onCompleted?: () => void | Promise<void>
}

interface SetupFormState {
  /** Hivatalos név (→ congregations.name); a magyar rövid név külön a nev_hu. */
  nev: string
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
  // #Endre 2026-07-02: átmigrálva a „Gyülekezetünk adatai" ablakból
  diocese_id: string
  eves_jarulek: number
  jarulek_kedvezmenyes: number
  jarulek_hatarid: string
  tartozas_szamitas_mod: 'akkori' | 'aktualis'
}

type SetForm = (f: SetupFormState) => void

/** Egy bankszámla a szerkesztőben (meglévő → id; új → id undefined). */
interface BankSlot {
  id?: number
  bank_neve: string
  iban: string
  valuta: 'RON' | 'EUR' | 'USD' | 'HUF'
  is_default: boolean
  /** Megőrzött, nem szerkesztett mezők (a mentésnél visszaírjuk). */
  nyito_egyenleg: number
  szin: string
  ikon: string
  _key: string
}

let bankKeySeq = 0
function newBankSlot(isDefault: boolean): BankSlot {
  bankKeySeq += 1
  return {
    bank_neve: '',
    iban: '',
    valuta: 'RON',
    is_default: isDefault,
    nyito_egyenleg: 0,
    szin: '#206bc4',
    ikon: 'building-2',
    _key: `bank-new-${bankKeySeq}`,
  }
}

// ────────────────────────────────────────────────────────────────────
// Segédfunkciók — AddressValue ↔ SetupFormState átalakítás
// ────────────────────────────────────────────────────────────────────

function formToAddressValue(form: SetupFormState): AddressValue {
  return {
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
  const [loading, setLoading] = useState(true)

  const [activePane, setActivePane] = useState<'attekintes' | 'cim' | 'bank' | 'penzugy'>('attekintes')

  const [form, setForm] = useState<SetupFormState>({
    nev: '', nev_hu: '', nev_ro: '', nev_en: '', adoszam: '', cimer_url: '',
    megye: '', varos: '', cim: '', email: '', telefon: '', web: '',
    bank: '', iban: '', iranyitoszam: '', hazszam: '', country: 'Románia',
    adrlocality_id: null, adrstreet_id: null, isForeign: false,
    diocese_id: '', eves_jarulek: 100, jarulek_kedvezmenyes: 0, jarulek_hatarid: '07-01', tartozas_szamitas_mod: 'akkori',
  })
  const [dioceses, setDioceses] = useState<Array<{ id: string; name: string; district_id: string | null; district_name: string | null }>>([])

  // Több bankszámla + a törlésre jelölt (meglévő) számlák id-jei.
  const [bankAccounts, setBankAccounts] = useState<BankSlot[]>([])
  const [removedBankIds, setRemovedBankIds] = useState<number[]>([])

  // Read-only kontextus: egyházkerület + egyházmegye név
  const [context, setContext] = useState<{
    dioceseName: string | null
    districtName: string | null
  }>({ dioceseName: null, districtName: null })

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      void getDioceses().then((list) => { if (!cancelled) setDioceses(list) }).catch(() => {})
      void Promise.all([
        getCongregationForSetup(congregationId),
        getCongregationBankAccounts(congregationId),
      ]).then(([res, bankRes]) => {
        if (cancelled) return
        // 2026-06-12 (Endre #2): a betöltési hiba eddig néma volt — üres
        // űrlap jelent meg magyarázat nélkül.
        if (res.error) toast.error(`A gyülekezeti adatok betöltése sikertelen: ${res.error}`)
        if (res.data) {
          const d = res.data
          setForm({
            nev: d.name || '',
            nev_hu: d.nev_hu || '', nev_ro: d.nev_ro || '', nev_en: d.nev_en || '',
            adoszam: d.adoszam || '', cimer_url: d.cimer_url || '',
            megye: d.megye || '', varos: d.varos || '', cim: d.cim || '',
            email: d.email || '', telefon: d.telefon || '', web: d.web || '',
            bank: d.bank || '', iban: d.iban || '',
            iranyitoszam: d.iranyitoszam || '', hazszam: d.hazszam || '',
            country: d.country || 'Románia',
            adrlocality_id: d.adrlocality_id, adrstreet_id: d.adrstreet_id,
            isForeign: (d.country && d.country !== 'Románia') || false,
            diocese_id: d.diocese_id || '',
            eves_jarulek: d.eves_jarulek ?? 100,
            jarulek_kedvezmenyes: d.jarulek_kedvezmenyes ?? 0,
            jarulek_hatarid: d.jarulek_hatarid || '07-01',
            tartozas_szamitas_mod: d.tartozas_szamitas_mod || 'akkori',
          })
          setContext({ dioceseName: d.diocese_name, districtName: d.district_name })

          // Bankszámlák betöltése; ha nincs külön rekord, de a congregations.bank
          // ki van töltve (legacy), abból seedelünk egy fő számlát.
          const rows = (bankRes as { rows?: Array<Record<string, unknown>> }).rows || []
          if (rows.length > 0) {
            setBankAccounts(
              rows.map((r, i) => ({
                id: Number(r.id),
                bank_neve: String(r.bank_neve || ''),
                iban: typeof r.iban === 'string' ? r.iban : '',
                valuta: (typeof r.valuta === 'string' ? r.valuta : 'RON') as BankSlot['valuta'],
                is_default: typeof r.is_default === 'boolean' ? r.is_default : i === 0,
                nyito_egyenleg: typeof r.nyito_egyenleg === 'number' ? r.nyito_egyenleg : Number(r.nyito_egyenleg) || 0,
                szin: typeof r.szin === 'string' && r.szin ? r.szin : '#206bc4',
                ikon: typeof r.ikon === 'string' && r.ikon ? r.ikon : 'building-2',
                _key: `bank-${r.id}`,
              })),
            )
          } else if (d.bank || d.iban) {
            const seed = newBankSlot(true)
            seed.bank_neve = d.bank || ''
            seed.iban = d.iban || ''
            setBankAccounts([seed])
          } else {
            setBankAccounts([])
          }
          setRemovedBankIds([])
        }
        setLoading(false)
      })
    })
    return () => { cancelled = true }
  }, [open, congregationId])

  // ── Bankszámla-műveletek ───────────────────────────────────────────
  function addBank() {
    setBankAccounts((prev) => [...prev, newBankSlot(prev.length === 0)])
  }
  function removeBank(idx: number) {
    setBankAccounts((prev) => {
      const removed = prev[idx]
      if (removed.id) setRemovedBankIds((ids) => [...ids, removed.id!])
      const next = prev.filter((_, i) => i !== idx)
      if (removed.is_default && next.length > 0) next[0] = { ...next[0], is_default: true }
      return next
    })
  }
  function updateBank(idx: number, patch: Partial<BankSlot>) {
    setBankAccounts((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)))
  }
  function setDefaultBank(idx: number) {
    setBankAccounts((prev) => prev.map((a, i) => ({ ...a, is_default: i === idx })))
  }

  async function handleCimerUpload(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await uploadCongregationCimer(congregationId, fd)
    setUploading(false)
    if (res.error) { toast.error(res.error); return }
    if (res.url) {
      setForm({ ...form, cimer_url: res.url })
      toast.success('Címer feltöltve.')
    }
  }

  // A fő (alapértelmezett) számla — a legacy congregations.bank/iban mezőkhöz.
  const primaryBank = bankAccounts.find((b) => b.is_default) || bankAccounts[0] || null

  // Készültség kategóriánként (Tier-1 kötelező mezők). A szerver továbbra is szigorúan validál; a
  // hiányzó mezőket panelenként jelezzük (oldalsáv-státusz + készültség-jelző). A `cim` (utca) és a
  // `cimer_url` is itt van — különben a gomb aktív lenne, de a szerver-mentés elbukna.
  const paneMissing: Record<'attekintes' | 'cim' | 'bank' | 'penzugy', string[]> = { attekintes: [], cim: [], bank: [], penzugy: [] }
  if (form.nev_hu.trim().length < 2) paneMissing.attekintes.push('magyar név')
  if (!form.adoszam.trim()) paneMissing.attekintes.push('adószám')
  if (!form.cimer_url.trim()) paneMissing.attekintes.push('címer')
  if (!form.megye.trim()) paneMissing.cim.push('megye')
  if (!form.varos.trim()) paneMissing.cim.push('helység')
  if (!form.cim.trim()) paneMissing.cim.push('utca/cím')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) paneMissing.cim.push('e-mail')
  if (!form.telefon.trim()) paneMissing.cim.push('telefon')
  if (!primaryBank || !primaryBank.bank_neve.trim() || !primaryBank.iban.trim()) paneMissing.bank.push('fő bankszámla (név + IBAN)')
  if (!(form.eves_jarulek > 0)) paneMissing.penzugy.push('éves járulék')

  const PANES = [
    { key: 'attekintes' as const, label: 'Áttekintés és alapadatok', icon: Church, chipBg: 'bg-teal-50', chipText: 'text-teal-600' },
    { key: 'cim' as const, label: 'Cím és elérhetőség', icon: MapPin, chipBg: 'bg-sky-50', chipText: 'text-sky-600' },
    { key: 'bank' as const, label: 'Bankszámlák', icon: Banknote, chipBg: 'bg-indigo-50', chipText: 'text-indigo-600' },
    { key: 'penzugy' as const, label: 'Pénzügyi alap', icon: Landmark, chipBg: 'bg-emerald-50', chipText: 'text-emerald-600' },
  ]
  const doneCount = PANES.filter((p) => paneMissing[p.key].length === 0).length
  const allMissing = [...paneMissing.attekintes, ...paneMissing.cim, ...paneMissing.bank, ...paneMissing.penzugy]

  function handleSave() {
    // Soft-gate: a Mentés mindig kattintható; ha kötelező adat hiányzik, az első hiányos panelra
    // ugrunk és jelezzük, mit kell pótolni (a szerver úgyis szigorúan validál).
    if (allMissing.length > 0) {
      const firstIncomplete = PANES.find((p) => paneMissing[p.key].length > 0)
      if (firstIncomplete) setActivePane(firstIncomplete.key)
      toast.error(`A mentéshez még hiányzik: ${allMissing.join(', ')}`)
      return
    }
    setFieldErrors({})
    startTransition(async () => {
      // 2026-06-12 (Endre #2): SORREND-CSERE — előbb a szigorúan validált
      // gyülekezeti alapadat-mentés fut. Korábban a bankszámla-műveletek
      // (insert/update/DELETE!) előbb futottak, így érvénytelen űrlapnál is
      // részleges mentés történt.

      // 1) Gyülekezeti alapadatok mentése (a fő számla bank/iban-jával)
      const res = await saveCongregationSetup({
        id: congregationId,
        ...form,
        bank: primaryBank?.bank_neve.trim() || form.bank,
        iban: primaryBank?.iban.trim() || form.iban,
      })
      if (res.error) {
        toast.error(res.error)
        if (res.fieldErrors) setFieldErrors(res.fieldErrors)
        return
      }

      // 2) Bankszámlák mentése (meglévő → update, új → insert; a fő számla
      //    a congregations.bank/iban-t is szinkronizálja).
      for (const acc of bankAccounts) {
        if (!acc.bank_neve.trim()) continue
        const bankRes = await saveCongregationBankAccount(congregationId, {
          id: acc.id,
          bankNeve: acc.bank_neve.trim(),
          iban: acc.iban.trim() || undefined,
          valuta: acc.valuta,
          nyitoEgyenleg: acc.nyito_egyenleg,
          szin: acc.szin,
          ikon: acc.ikon,
          isDefault: acc.is_default,
          aktiv: true,
        })
        if ('error' in bankRes && bankRes.error) {
          toast.error(`Bankszámla mentése sikertelen: ${bankRes.error}`)
          return
        }
      }
      // 3) Törlésre jelölt számlák — a hibát eddig némán elnyeltük
      for (const id of removedBankIds) {
        const delRes = await deleteCongregationBankAccount(congregationId, id)
        if ('error' in delRes && delRes.error) {
          toast.error(`Bankszámla törlése sikertelen: ${delRes.error}`)
          return
        }
      }

      toast.success('Gyülekezet beállítva! 🎉', { duration: 4000 })
      if (onCompleted) await onCompleted()
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          !w-[96vw] !max-w-[96vw] sm:!max-w-[min(1040px,96vw)]
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
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-sm text-slate-400">
            <Loader2 className="size-6 animate-spin mb-2" />
            <p>Betöltés…</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            {/* Bal oldali kategória-sáv */}
            <nav className="shrink-0 border-b border-slate-100 bg-white/60 p-2.5 md:w-60 md:border-b-0 md:border-r md:overflow-y-auto">
              <div className="flex gap-1.5 overflow-x-auto md:flex-col md:gap-1 md:overflow-visible">
                {PANES.map((p) => {
                  const Icon = p.icon
                  const miss = paneMissing[p.key]
                  const active = activePane === p.key
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setActivePane(p.key)}
                      className={`flex shrink-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition md:w-full ${active ? 'bg-slate-100 ring-1 ring-slate-200' : 'hover:bg-slate-50'}`}
                    >
                      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${p.chipBg}`}>
                        <Icon className={`size-4 ${p.chipText}`} />
                      </span>
                      <span className="hidden flex-1 min-w-0 text-[13px] font-medium leading-tight text-slate-700 sm:block">
                        {p.label}
                      </span>
                      {miss.length === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                          <Check className="size-3" />
                          <span className="hidden sm:inline">Kész</span>
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                          {miss.length}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </nav>

            {/* Jobb oldali tartalom */}
            <div className="flex-1 min-w-0 overflow-y-auto px-5 py-5 md:px-7">
              <div className="mx-auto max-w-2xl space-y-7">
                {activePane === 'attekintes' && (
                  <>
                    <div className="card-raised p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-800">A beállítás állapota</p>
                        <span className="text-xs text-slate-500">{doneCount} / {PANES.length} szakasz kész</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${Math.round((doneCount / PANES.length) * 100)}%` }}
                        />
                      </div>
                      {allMissing.length > 0 && (
                        <p className="mt-2 text-[11px] text-slate-500">
                          Még hiányzik: <strong className="text-slate-700">{allMissing.join(', ')}</strong>
                        </p>
                      )}
                    </div>
                    <SectionBasics
                      form={form}
                      setForm={setForm}
                      onCimerUpload={handleCimerUpload}
                      uploading={uploading}
                      fieldErrors={fieldErrors}
                      dioceseName={context.dioceseName}
                      districtName={context.districtName}
                      dioceses={dioceses}
                    />
                  </>
                )}

                {activePane === 'penzugy' && (
                  <>
                    <SectionFinance form={form} setForm={setForm} />
                    {/* #Endre 2026-07-02: a haladó pénzügyi + lelkész szerkesztők (kedvezmény-szabályok,
                        egyéb díjak, évenkénti visszamenőleges díjak, lelkész-átadás) átkerültek ide a
                        „Gyülekezetünk adatai"-ból — külön, részletes szerkesztő ablakban nyílnak. */}
                    <div className="card-raised p-4 bg-violet-50/40 border-violet-200">
                      <p className="text-sm font-semibold text-slate-800">Kedvezmények, egyéb díjak és lelkész-átadás</p>
                      <p className="mt-1 mb-3 text-xs text-slate-500">
                        A kedvezmény-szabályok, az egyéb díjak, az évenkénti (visszamenőleges) díjak és a
                        lelkész-átadás részletes szerkesztője külön ablakban nyílik.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          onOpenChange(false)
                          window.dispatchEvent(new Event('kartoteka:open-congregation-advanced'))
                        }}
                      >
                        Haladó szerkesztő megnyitása
                      </Button>
                    </div>
                  </>
                )}

                {activePane === 'cim' && (
                  <>
                    <SectionAddress form={form} setForm={setForm} fieldErrors={fieldErrors} />
                    <SectionContact form={form} setForm={setForm} fieldErrors={fieldErrors} />
                  </>
                )}

                {activePane === 'bank' && (
                  <SectionBanks
                    accounts={bankAccounts}
                    onAdd={addBank}
                    onRemove={removeBank}
                    onUpdate={updateBank}
                    onSetDefault={setDefaultBank}
                    fieldErrors={fieldErrors}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Lábléc: mentés-sáv */}
        <div className="shrink-0 border-t border-zinc-100 bg-zinc-50/60 px-6 py-3 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            {allMissing.length === 0 ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <Check className="size-3.5" /> Minden kötelező adat kész
              </span>
            ) : (
              <>Még <strong className="text-amber-700">{allMissing.length}</strong> kötelező adat hiányzik</>
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="rounded-xl"
              title="Most kihagyom — 24 óra múlva újra emlékeztetjük a hiányzó adatokra"
            >
              <X className="mr-1 size-4" />
              Később
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white hover:from-teal-700 hover:to-emerald-700"
            >
              {isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Save className="mr-1 size-4" />}
              Mentés
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Szakaszok
// ─────────────────────────────────────────────────────────────────────────

function SectionBasics({
  form, setForm, onCimerUpload, uploading, fieldErrors, dioceseName, districtName, dioceses,
}: {
  form: SetupFormState
  setForm: SetForm
  onCimerUpload: (ev: React.ChangeEvent<HTMLInputElement>) => void
  uploading: boolean
  fieldErrors: Record<string, string>
  dioceseName: string | null
  districtName: string | null
  dioceses: Array<{ id: string; name: string; district_id: string | null; district_name: string | null }>
}) {
  // A kiválasztott egyházmegye kerülete (a select alatt read-only megjelenítéshez).
  const selectedDistrictName = form.diocese_id
    ? (dioceses.find((d) => d.id === form.diocese_id)?.district_name || districtName)
    : districtName
  return (
    <section className="space-y-4">
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

      {/* Egyházi hovatartozás: egyházmegye SZERKESZTHETŐ (select), egyházkerület a megyéből derivált read-only */}
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
                  {selectedDistrictName || <span className="italic text-slate-400">a megyéből adódik</span>}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Egyházmegye</p>
                <select
                  value={form.diocese_id}
                  onChange={(e) => setForm({ ...form, diocese_id: e.target.value })}
                  className="mt-0.5 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm focus-visible:border-teal-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500/25"
                >
                  <option value="">{dioceseName ? `${dioceseName} (jelenlegi)` : '— válassz egyházmegyét —'}</option>
                  {dioceses.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ModalField label="Hivatalos név">
        <Input
          value={form.nev}
          onChange={(e) => setForm({ ...form, nev: e.target.value })}
          placeholder="A teljes hivatalos név — ez jelenik meg a hivatalos iratokon"
          className={FIELD_INPUT_CLASS}
        />
      </ModalField>

      <ModalField label="Magyar név (rövid) *">
        <Input
          value={form.nev_hu}
          onChange={(e) => setForm({ ...form, nev_hu: e.target.value })}
          placeholder="Pl. Barátosi Református"
          className={FIELD_INPUT_CLASS}
        />
        {fieldErrors.nev_hu && <p className="text-xs text-rose-600 mt-1">{fieldErrors.nev_hu}</p>}
      </ModalField>

      <div className="grid gap-3 md:grid-cols-2">
        <ModalField label="Román név (opcionális)">
          <Input
            value={form.nev_ro}
            onChange={(e) => setForm({ ...form, nev_ro: e.target.value })}
            placeholder="Pl. Parohia Reformată Brateș"
            className={FIELD_INPUT_CLASS}
          />
        </ModalField>
        <ModalField label="Angol név (opcionális)">
          <Input
            value={form.nev_en}
            onChange={(e) => setForm({ ...form, nev_en: e.target.value })}
            placeholder="Pl. Brateș Reformed Parish"
            className={FIELD_INPUT_CLASS}
          />
        </ModalField>
      </div>

      <ModalField label="Adószám / CIF *">
        <Input
          value={form.adoszam}
          onChange={(e) => setForm({ ...form, adoszam: e.target.value })}
          placeholder="Pl. 12345678"
          className={FIELD_INPUT_CLASS}
        />
        {fieldErrors.adoszam && <p className="text-xs text-rose-600 mt-1">{fieldErrors.adoszam}</p>}
      </ModalField>

      {/* Címer feltöltés */}
      <div className="card-raised p-4 bg-indigo-50/30 border-indigo-200">
        <p className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
          <ImageIcon className="size-4 text-indigo-600" />
          Gyülekezeti címer
        </p>
        <p className="text-xs text-slate-500 mb-3">
          Tölts fel egy képet (JPG, PNG, vagy WEBP, max 2 MB). A címer a hivatalos
          dokumentumokon (számadás, költségvetés, nyugták) jelenik meg.
        </p>
        {form.cimer_url ? (
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
    </section>
  )
}

// #Endre 2026-07-02: Pénzügyi alap — átmigrálva a „Gyülekezetünk adatai" ablakból.
function SectionFinance({ form, setForm }: { form: SetupFormState; setForm: SetForm }) {
  const currentYear = new Date().getFullYear()
  return (
    <section className="space-y-4">
      {/* Aktuális év alapösszege — a welcome finance-lépés mintájára */}
      <WizardSectionCard
        icon={Wallet}
        iconColor="text-amber-700"
        iconBg="bg-amber-50"
        title="Aktuális év alapösszege"
        description={`A ${currentYear}. évre vonatkozó teljes éves egyházfenntartási járulék. Ebből számol a rendszer minden tag hátralékát. Bármikor módosítható.`}
      >
        <div className="md:max-w-md">
          <WizardField
            id="eves_jarulek"
            label="Éves alap járulék (RON)"
            required
            hint="Családonkénti vagy tagsági teljes éves egyházfenntartás."
          >
            <WizardInput
              id="eves_jarulek"
              type="number"
              step="0.01"
              min="0"
              inputMode="numeric"
              placeholder="pl. 120"
              value={form.eves_jarulek || ''}
              onChange={(e) => setForm({ ...form, eves_jarulek: Number(e.target.value) || 0 })}
            />
          </WizardField>
        </div>
      </WizardSectionCard>

      {/* Kedvezményes időszak */}
      <WizardSectionCard
        icon={Calculator}
        iconColor="text-emerald-700"
        iconBg="bg-emerald-50"
        title="Kedvezményes időszak"
        description="Aki a határidő előtt fizet, a kedvezményes alapösszeget fizetheti. Hagyd 0-n, ha nincs kedvezmény."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <WizardField id="jarulek_kedvezmenyes" label="Kedvezményes alapösszeg (RON)" hint="0 = nincs kedvezményes összeg.">
            <WizardInput
              id="jarulek_kedvezmenyes"
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="pl. 100"
              value={form.jarulek_kedvezmenyes || ''}
              onChange={(e) => setForm({ ...form, jarulek_kedvezmenyes: Number(e.target.value) || 0 })}
            />
          </WizardField>
          <WizardField id="jarulek_hatarid" label="Kedvezmény határideje (HH-NN)" hint="Eddig fizetve jár a kedvezményes összeg (pl. 07-01).">
            <WizardInput
              id="jarulek_hatarid"
              placeholder="pl. 07-01"
              value={form.jarulek_hatarid}
              onChange={(e) => setForm({ ...form, jarulek_hatarid: e.target.value })}
            />
          </WizardField>
        </div>
      </WizardSectionCard>

      {/* Tartozás-számítási mód — a welcome radio-kártyáival azonos */}
      <WizardSectionCard
        icon={Calculator}
        iconColor="text-cyan-700"
        iconBg="bg-cyan-50"
        title="Tartozás-számítási mód"
        description="Hogyan számolja a rendszer a régi évek tartozását?"
        banner={
          <WizardBanner tone="info">
            <p>
              Egy tagnak lehet pl. 2022-es tartozása. A rendszer ezt a 2022-es beállítások szerint
              számolja („akkori"), vagy az aktuális évi beállítások alapján („aktuális")? Ha nem vagy
              biztos, válaszd az „akkori"-t — ez a leggyakoribb és legtisztább.
            </p>
          </WizardBanner>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          {([
            ['akkori', 'Akkori év szerint', 'A 2022-es tartozás a 2022-es beállítások szerint van számolva. Ajánlott — ez a hagyományos.'],
            ['aktualis', 'Aktuális év szerint', 'A régi tartozások az aktuális évi járulékkal vannak számolva. Egyszerűbb — de figyeld a változások hatását.'],
          ] as const).map(([val, title, desc]) => (
            <label
              key={val}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors ${
                form.tartozas_szamitas_mod === val
                  ? 'border-cyan-500 bg-cyan-50/50'
                  : 'border-slate-200 bg-white hover:border-cyan-200'
              }`}
            >
              <input
                type="radio"
                name="tartozas_szamitas_mod"
                className="mt-1 size-4"
                checked={form.tartozas_szamitas_mod === val}
                onChange={() => setForm({ ...form, tartozas_szamitas_mod: val })}
              />
              <span className="text-sm">
                <strong className="block text-slate-800">{title}</strong>
                <span className="mt-0.5 block text-xs text-slate-600">{desc}</span>
              </span>
            </label>
          ))}
        </div>
      </WizardSectionCard>
    </section>
  )
}

function SectionAddress({
  form, setForm, fieldErrors,
}: { form: SetupFormState; setForm: SetForm; fieldErrors: Record<string, string> }) {
  return (
    <section className="space-y-4">
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
    </section>
  )
}

function SectionContact({
  form, setForm, fieldErrors,
}: { form: SetupFormState; setForm: SetForm; fieldErrors: Record<string, string> }) {
  return (
    <section className="space-y-4">
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
        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="pl. lelkeszi.hivatal@gyulekezet.ro" className={FIELD_INPUT_CLASS} />
        {fieldErrors.email && <p className="text-xs text-rose-600 mt-1">{fieldErrors.email}</p>}
      </ModalField>

      <ModalField label="Telefon *">
        <Input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} placeholder="pl. +40 267 123 456" className={FIELD_INPUT_CLASS} />
      </ModalField>

      <ModalField label="Weboldal (opcionális)">
        <Input value={form.web} onChange={(e) => setForm({ ...form, web: e.target.value })} placeholder="https://..." className={FIELD_INPUT_CLASS} />
      </ModalField>
    </section>
  )
}

function SectionBanks({
  accounts, onAdd, onRemove, onUpdate, onSetDefault, fieldErrors,
}: {
  accounts: BankSlot[]
  onAdd: () => void
  onRemove: (idx: number) => void
  onUpdate: (idx: number, patch: Partial<BankSlot>) => void
  onSetDefault: (idx: number) => void
  fieldErrors: Record<string, string>
}) {
  return (
    <section className="space-y-4">
      <div className="card-raised p-4 bg-teal-50/30 border-teal-100">
        <div className="flex items-start gap-2">
          <Banknote className="size-5 text-teal-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading text-base text-slate-800">Bankszámlák</h3>
            <p className="text-xs text-slate-600 mt-1">
              Több bankszámla is rögzíthető — pl. egy fő RON-számla és egy valutás (EUR)
              számla. A fő számla szerepel a hivatalos bizonylatokon; a többit a Pénzügy
              menüben is kezelheti később.
            </p>
          </div>
        </div>
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-slate-500 italic px-1">
          Még nincs bankszámla rögzítve. Adjon hozzá legalább egyet (fő számla).
        </p>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc, idx) => (
            <div
              key={acc._key}
              className={`rounded-xl border p-4 ${acc.is_default ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200 bg-white'}`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-700">
                  {acc.bank_neve || `Bankszámla #${idx + 1}`}
                  <span className="ml-2 text-xs font-normal text-slate-400">{acc.valuta}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                  title="Bankszámla törlése"
                >
                  <Trash2 className="size-3.5" />
                  Törlés
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <ModalField label="Bank neve *">
                  <Input
                    value={acc.bank_neve}
                    onChange={(e) => onUpdate(idx, { bank_neve: e.target.value })}
                    placeholder="pl. Banca Transilvania"
                    className={FIELD_INPUT_CLASS}
                  />
                </ModalField>
                <ModalField label="Valuta *">
                  <select
                    value={acc.valuta}
                    onChange={(e) => onUpdate(idx, { valuta: e.target.value as BankSlot['valuta'] })}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/25"
                  >
                    <option value="RON">RON — Román lej</option>
                    <option value="EUR">EUR — Euró</option>
                    <option value="USD">USD — Amerikai dollár</option>
                    <option value="HUF">HUF — Magyar forint</option>
                  </select>
                </ModalField>
              </div>

              <ModalField label="IBAN *">
                <Input
                  value={acc.iban}
                  onChange={(e) => onUpdate(idx, { iban: e.target.value })}
                  placeholder="RO49 AAAA 1B31 0075 9384 0000"
                  className={`${FIELD_INPUT_CLASS} font-mono text-xs`}
                />
              </ModalField>

              <button
                type="button"
                onClick={() => onSetDefault(idx)}
                disabled={acc.is_default}
                className={`mt-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  acc.is_default
                    ? 'cursor-default border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50/50 hover:text-amber-700'
                }`}
              >
                <Star className={`size-4 ${acc.is_default ? 'fill-amber-500 text-amber-500' : ''}`} />
                <span>{acc.is_default ? 'Ez a fő számla' : 'Beállítás fő számlának'}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-teal-300 bg-white/50 p-3 text-sm font-medium text-teal-700 transition hover:bg-teal-50/40"
      >
        <Plus className="size-4" />
        {accounts.length === 0 ? 'Bankszámla hozzáadása' : 'További bankszámla hozzáadása'}
      </button>

      {(fieldErrors.bank || fieldErrors.iban) && (
        <p className="text-xs text-rose-600">
          {fieldErrors.bank || fieldErrors.iban}
        </p>
      )}
    </section>
  )
}
