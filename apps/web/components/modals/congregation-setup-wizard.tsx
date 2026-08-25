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
  Banknote, Check, Church, FileText, Image as ImageIcon,
  Landmark, Loader2, MapPin, Network, Pencil, Percent, Phone, Plus, Save, Stamp, Star, Trash2, Upload, UserCog, Wallet, X,
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
  WizardInputGrid,
  Input as WizardInput,
} from '@/components/onboarding/wizard/_helpers/wizard-ui'
// #Endre 2026-07-02: a haladó szerkesztő (kedvezmények, egyéb díjak, évenkénti díjak,
// lelkész-átadás) BEOLVAD a beállítás-ablakba — külön self-contained komponensek, a meglévő
// (változatlan) szerver-actionökre építve. A régi „Haladó szerkesztő" ablak megszűnik.
import { FeeDiscountsManager } from '@/components/congregation/fee-discounts-manager'
import { CustomFeesManager } from '@/components/congregation/custom-fees-manager'
import { AnnualFeesManager } from '@/components/congregation/annual-fees-manager'
import { OpeningBalancesManager } from '@/components/congregation/opening-balances-manager'
import { PastorTransferManager } from '@/components/congregation/pastor-transfer-manager'
import {
  getCongregationForSetup,
  saveCongregationSetup,
  uploadCongregationCimer,
  getCongregationBankAccounts,
  saveCongregationBankAccount,
  deleteCongregationBankAccount,
  getDioceses,
  getCongregationIratKepek,
  uploadCongregationIratKep,
  removeCongregationIratKep,
} from '@/app/(dashboard)/congregation/actions'
// 2026-08-15 (S4): a pecsét/aláírás-feltöltő UI a KÖZÖS komponensből — az
// egyházmegyei wizard ugyanezt használja a megyei akciókkal.
import { IratKepekSection } from '@/components/shared/irat-kepek-section'
// 2026-08-25 (gyülekezeti egységek, terv 3.1–3.2): a szervezeti forma READ-ONLY
// megjelenítése + a leány/szórvány egységek kezelő panelje.
import {
  listGyulekezetiEgysegek,
  saveGyulekezetiEgyseg,
  deleteGyulekezetiEgyseg,
  getEgysegHasznalat,
} from '@/app/(dashboard)/congregation/egysegek-actions'
import {
  EGYSEG_TIPUS_CIMKEK,
  SZERVEZETI_TIPUS_CIMKEK,
  SZERVEZETI_TIPUS_LEIRAS,
  type EgysegTipus,
  type GyulekezetiEgyseg,
  type SzervezetiTipus,
} from '@/lib/gyulekezet/egysegek-shared'

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
  // 2026-08-15 (beállítás-felmérés 2.1, P0): ÁFA-alanyiság — eddig csak kézi
  // SQL-lel volt állítható, pedig az Oblio-számla ÁFA-kulcsa ebből dől el.
  tva_alany: boolean
  tva_kod: string
  tva_alany_tol: string
}

type SetForm = (f: SetupFormState) => void

/** A bal oldali kategória-sáv kulcsai. Az 'egysegek' OPCIONÁLIS panel:
 *  a paneMissing-be nem számít bele, és a készültség-jelzőben sem szerepel. */
type PaneKey = 'attekintes' | 'egysegek' | 'cim' | 'bank' | 'penzugy' | 'kedvezmenyek' | 'lelkesz'

/** Egy bankszámla a szerkesztőben (meglévő → id; új → id undefined). */
interface BankSlot {
  id?: number
  bank_neve: string
  iban: string
  valuta: 'RON' | 'EUR' | 'USD' | 'HUF'
  is_default: boolean
  /** 2026-07-17 (F4): megőrzött aktiv-flag — a nyitó-egyenleg pane szűréséhez. */
  aktiv?: boolean | null
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

  const [activePane, setActivePane] = useState<PaneKey>('attekintes')

  const [form, setForm] = useState<SetupFormState>({
    nev: '', nev_hu: '', nev_ro: '', nev_en: '', adoszam: '', cimer_url: '',
    megye: '', varos: '', cim: '', email: '', telefon: '', web: '',
    bank: '', iban: '', iranyitoszam: '', hazszam: '', country: 'Románia',
    adrlocality_id: null, adrstreet_id: null, isForeign: false,
    diocese_id: '', eves_jarulek: 100, jarulek_kedvezmenyes: 0, jarulek_hatarid: '07-01', tartozas_szamitas_mod: 'akkori',
    tva_alany: false, tva_kod: '', tva_alany_tol: '',
  })
  const [dioceses, setDioceses] = useState<Array<{ id: string; name: string; district_id: string | null; district_name: string | null }>>([])
  // 2026-08-10: ha az egyházmegye-lista betöltése hibázik, a választó NEM
  // maradhat néma és üres (lásd getDioceses).
  const [diocesesError, setDiocesesError] = useState<string | null>(null)

  // Több bankszámla + a törlésre jelölt (meglévő) számlák id-jei.
  const [bankAccounts, setBankAccounts] = useState<BankSlot[]>([])
  const [removedBankIds, setRemovedBankIds] = useState<number[]>([])

  // Read-only kontextus: egyházkerület + egyházmegye név + (2026-08-25)
  // a hivatalos szervezeti forma és az anyaegyházközség neve — az ADMIN kezeli,
  // a wizard csak megjeleníti (SetupFormState-be szándékosan NEM került be).
  const [context, setContext] = useState<{
    dioceseName: string | null
    districtName: string | null
    szervezetiTipus: SzervezetiTipus | null
    anyaNev: string | null
  }>({ dioceseName: null, districtName: null, szervezetiTipus: null, anyaNev: null })

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      void getDioceses()
        .then((res) => {
          if (cancelled) return
          setDioceses(res.data)
          setDiocesesError(res.error)
          if (res.error) toast.error(res.error)
        })
        .catch((e) => {
          if (cancelled) return
          const msg = e instanceof Error ? e.message : 'Az egyházmegyék betöltése sikertelen.'
          setDiocesesError(msg)
          toast.error(msg)
        })
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
            tva_alany: d.tva_alany ?? false,
            tva_kod: d.tva_kod || '',
            tva_alany_tol: d.tva_alany_tol || '',
          })
          setContext({
            dioceseName: d.diocese_name,
            districtName: d.district_name,
            szervezetiTipus: d.szervezeti_tipus,
            anyaNev: d.anya_nev,
          })

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
                aktiv: typeof r.aktiv === 'boolean' ? r.aktiv : true,
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
  // Az 'egysegek' kulcs mindig üres marad — a panel OPCIONÁLIS, sosem blokkolja a mentést.
  const paneMissing: Record<PaneKey, string[]> = { attekintes: [], egysegek: [], cim: [], bank: [], penzugy: [], kedvezmenyek: [], lelkesz: [] }
  if (form.nev_hu.trim().length < 2) paneMissing.attekintes.push('magyar név')
  // 2026-08-10 (K4 regisztráció-diagnosztika #2): az egyházmegye KÖTELEZŐ.
  // Enélkül a gyülekezet egyetlen egyházmegyei/kerületi felületen sem látszik,
  // az irat-beküldése senkit nem értesít, és a regisztrációs választóban sem
  // jelenik meg — a mentés-kapu ezért most blokkol, ha nincs kiválasztva.
  if (!form.diocese_id.trim()) paneMissing.attekintes.push('egyházmegye')
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
    // 2026-08-25 (gyülekezeti egységek): OPCIONÁLIS panel — nem számít bele a
    // készültségbe (paneMissing.egysegek mindig üres), és nem blokkolja a mentést.
    { key: 'egysegek' as const, label: 'Egységek', icon: Network, chipBg: 'bg-amber-50', chipText: 'text-amber-600' },
    { key: 'cim' as const, label: 'Cím és elérhetőség', icon: MapPin, chipBg: 'bg-sky-50', chipText: 'text-sky-600' },
    { key: 'bank' as const, label: 'Bankszámlák', icon: Banknote, chipBg: 'bg-indigo-50', chipText: 'text-indigo-600' },
    { key: 'penzugy' as const, label: 'Pénzügyi alap', icon: Landmark, chipBg: 'bg-emerald-50', chipText: 'text-emerald-600' },
    { key: 'kedvezmenyek' as const, label: 'Kedvezmények és díjak', icon: Percent, chipBg: 'bg-violet-50', chipText: 'text-violet-600' },
    { key: 'lelkesz' as const, label: 'Lelkészek és átadás', icon: UserCog, chipBg: 'bg-rose-50', chipText: 'text-rose-600' },
  ]
  // A készültség-jelzőben csak a kötelező panelek szerepelnek (az Egységek opcionális).
  const kotelezoPanes = PANES.filter((p) => p.key !== 'egysegek')
  const doneCount = kotelezoPanes.filter((p) => paneMissing[p.key].length === 0).length
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
      // 2026-08-10: a szerver oszlop-sodródásnál kihagyhat mezőket — ez eddig
      // néma volt („ok: true"), most figyelmeztetést kapunk róla.
      if (res.warning) toast.warning(res.warning, { duration: 8000 })

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
          !h-[92dvh] !max-h-[92dvh]
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
                      {p.key === 'egysegek' ? null : miss.length === 0 ? (
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
                        <span className="text-xs text-slate-500">{doneCount} / {kotelezoPanes.length} szakasz kész</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${Math.round((doneCount / kotelezoPanes.length) * 100)}%` }}
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
                      diocesesError={diocesesError}
                      szervezetiTipus={context.szervezetiTipus}
                      anyaNev={context.anyaNev}
                    />
                    {/* 24. pont: pecsét + aláírás kép az iktató-nyomtatványokra —
                        a címer-feltöltő MELLÉ, saját (azonnal mentő) adatlánccal. */}
                    <SectionIratKepek congregationId={congregationId} />
                  </>
                )}

                {activePane === 'egysegek' && (
                  <SectionEgysegek />
                )}

                {activePane === 'penzugy' && (
                  <>
                    <SectionFinance form={form} setForm={setForm} />
                    {/* #Endre 2026-07-02: az évenkénti (visszamenőleges) díjak beolvadtak ide a
                        haladó szerkesztőből. A kedvezmény-szabályok + egyéb díjak a „Kedvezmények
                        és díjak" panelen, a lelkész-átadás a „Lelkészek és átadás" panelen. */}
                    <AnnualFeesManager congregationId={congregationId} currentYearFee={form.eves_jarulek} />
                    {/* 2026-07-17 (F4): Induló (nyitó) egyenlegek — a rendszer egy meglévő
                        könyvelésbe illeszkedik, az évkezdő kassza- és bank-egyenlegeket
                        jellemzően EGYSZER, a legelső évre kell megadni. A szerkesztő eddig
                        elérhetetlen volt a felületről. Csak a már MENTETT bankszámlák
                        jelennek meg (új számla előbb mentendő a Bankszámlák panelen). */}
                    <div className="card-raised p-4">
                      <p className="mb-3 text-sm font-semibold text-slate-800">
                        Induló (nyitó) egyenlegek — év eleji kassza és bank
                      </p>
                      <OpeningBalancesManager
                        congregationId={congregationId}
                        bankAccounts={bankAccounts
                          .filter((b) => Number(b.id) > 0)
                          .map((b) => ({
                            id: Number(b.id),
                            bank_neve: b.bank_neve,
                            valuta: b.valuta,
                            aktiv: b.aktiv ?? true,
                          }))}
                      />
                    </div>
                    {/* 2026-07-16 (Endre): a korai-fizetési kedvezményt a „Kedvezmények és díjak”
                        panelen lehet felvenni (több időszakkal is), de ő ITT kereste — a panel
                        csak említette, nem vitt oda. Kattintható átvezetés. */}
                    <div className="rounded-[1.2rem] border border-violet-200 bg-violet-50/50 p-4">
                      <p className="text-sm font-medium text-violet-900">
                        Korai fizetés kedvezménye — több időszakkal is
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-violet-800/90">
                        Ha azt szeretnéd, hogy aki előbb fizet, kevesebbet fizessen (pl.{' '}
                        <strong>január 1. – július 1. → 160 lej</strong>, utána{' '}
                        <strong>július 2. – november 1. → 190 lej</strong>, azután a teljes díj),
                        azt a <strong>Kedvezmények és díjak</strong> panelen veheted fel. Több
                        időszak is megadható; amelyik időszakba nem esik bele, ott a teljes éves
                        díj érvényes.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-3 border-violet-300 bg-white text-violet-800 hover:bg-violet-100"
                        onClick={() => setActivePane('kedvezmenyek')}
                      >
                        <Percent className="mr-2 size-4" />
                        Kedvezmények beállítása
                      </Button>
                    </div>
                  </>
                )}

                {activePane === 'kedvezmenyek' && (
                  <>
                    <FeeDiscountsManager congregationId={congregationId} />
                    <CustomFeesManager congregationId={congregationId} />
                  </>
                )}

                {activePane === 'lelkesz' && (
                  <PastorTransferManager congregationId={congregationId} />
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
  form, setForm, onCimerUpload, uploading, fieldErrors, dioceseName, districtName, dioceses, diocesesError,
  szervezetiTipus, anyaNev,
}: {
  form: SetupFormState
  setForm: SetForm
  onCimerUpload: (ev: React.ChangeEvent<HTMLInputElement>) => void
  uploading: boolean
  fieldErrors: Record<string, string>
  dioceseName: string | null
  districtName: string | null
  dioceses: Array<{ id: string; name: string; district_id: string | null; district_name: string | null }>
  /** 2026-08-10: az egyházmegye-lista betöltési hibája (ha volt) — a select alatt jelenik meg. */
  diocesesError: string | null
  /** 2026-08-25: hivatalos szervezeti forma (READ-ONLY — az admin kezeli); migráció előtt null. */
  szervezetiTipus: SzervezetiTipus | null
  /** A kapcsolt anyaegyházközség neve (csak leánynál). */
  anyaNev: string | null
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
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Egyházmegye *</p>
                {/* 2026-08-10 (K4 regisztráció-diagnosztika #1): CSAPDA-JAVÍTÁS.
                    Korábban az első opció CÍMKÉJE a jelenlegi egyházmegye neve volt
                    („… (jelenlegi)"), az ÉRTÉKE viszont üres — aki rákattintott, hogy
                    „megerősítse" a jelenlegit, az valójában kinullázta a kötést.
                    Mostantól a jelenlegi egyházmegye VALÓDI, kiválasztott értékként
                    jelenik meg a listában, a helyőrző pedig disabled (nem választható),
                    és csak akkor látszik, ha még nincs beállított egyházmegye. */}
                <select
                  value={form.diocese_id}
                  onChange={(e) => {
                    // Védelem elavult/hibás DOM-esemény ellen: üres értéket sosem írunk vissza.
                    if (!e.target.value) return
                    setForm({ ...form, diocese_id: e.target.value })
                  }}
                  disabled={dioceses.length === 0}
                  aria-invalid={!form.diocese_id}
                  className="mt-0.5 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm focus-visible:border-teal-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500/25 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  {!form.diocese_id && (
                    <option value="" disabled>
                      — válassz egyházmegyét —
                    </option>
                  )}
                  {dioceses.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.district_name ? ` (${d.district_name})` : ''}
                    </option>
                  ))}
                </select>
                {diocesesError ? (
                  <p className="mt-1 text-xs text-rose-600">
                    {diocesesError} — a mentés előtt töltsd újra az ablakot.
                  </p>
                ) : !form.diocese_id ? (
                  <p className="mt-1 text-xs text-amber-700">
                    A gyülekezet még egyetlen egyházmegyéhez sem tartozik — enélkül nem jelenik meg
                    az egyházmegyei és egyházkerületi felületeken.
                  </p>
                ) : dioceseName && dioceseName !== dioceses.find((d) => d.id === form.diocese_id)?.name ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Jelenleg mentett: <b>{dioceseName}</b> — a mentés ezt írja felül.
                  </p>
                ) : null}
                {fieldErrors.diocese_id && (
                  <p className="mt-1 text-xs text-rose-600">{fieldErrors.diocese_id}</p>
                )}
              </div>
            </div>
            {/* 2026-08-25 (gyülekezeti egységek, terv 3.1): a hivatalos szervezeti
                forma READ-ONLY — egyházmegyei javaslat + kerületi jóváhagyás után
                az admin állítja, a wizard csak megjeleníti. */}
            <div className="grid gap-2 border-t border-sky-100 pt-2 sm:grid-cols-2">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Szervezeti forma</p>
                <p
                  className="text-sm font-semibold text-slate-800"
                  title={szervezetiTipus ? SZERVEZETI_TIPUS_LEIRAS[szervezetiTipus] : undefined}
                >
                  {szervezetiTipus
                    ? SZERVEZETI_TIPUS_CIMKEK[szervezetiTipus]
                    : <span className="italic font-normal text-slate-400">még nincs beállítva</span>}
                </p>
              </div>
              {szervezetiTipus === 'leany' && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">Anyaegyházközség</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {anyaNev || <span className="italic font-normal text-slate-400">nincs megadva</span>}
                  </p>
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              A szervezeti formát és az anya-kapcsolatot a rendszergazda állítja be.
            </p>
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

// ─────────────────────────────────────────────────────────────────────────
// 24. pont: Pecsét + aláírás kép az iktató-nyomtatványokra
// ─────────────────────────────────────────────────────────────────────────

/**
 * A gyülekezet pecsét- és aláírás-képének feltöltője.
 *
 * 2026-08-15 (egyházmegyei szint, S4): a teljes UI+folyamat a KÖZÖS
 * IratKepekSection komponensbe költözött (components/shared/
 * irat-kepek-section.tsx) — az egyházmegyei setup-wizard UGYANEZT használja a
 * megyei akciókkal (közös helper, soha széthúzó másolat). Itt csak a
 * gyülekezeti szerver-akciók és a feliratok kötése maradt.
 */
function SectionIratKepek({ congregationId }: { congregationId: string }) {
  return (
    <IratKepekSection
      feliratok={{ pecset: 'Hivatalos pecsét', alairas: 'Lelkipásztori aláírás' }}
      leiras={
        'PNG vagy WEBP kép, átlátszó háttérrel, max 1 MB. A pecsét a nyomtatott ' +
        'iratok közepére kerül (halványan, a keltezés mellé), az aláírás az aláíró neve fölé — ' +
        'az iktatópecsét-nyomtatványon, az iktatókönyvön és a kiadott igazolásokon. Amíg nincs ' +
        'kép feltöltve, minden nyomtatvány a mai formájában (üres aláírás-vonallal) készül.'
      }
      load={() => getCongregationIratKepek(congregationId)}
      upload={(fajta, fd) => uploadCongregationIratKep(congregationId, fajta, fd)}
      remove={(fajta) => removeCongregationIratKep(congregationId, fajta)}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 2026-08-25 (gyülekezeti egységek, terv 3.2): a leány/szórvány egységek
// kezelője. A CRUD az egysegek-actions server actionjeire épül — azok a
// hívó EFFEKTÍV gyülekezetére dolgoznak (getEffectiveCongregationContext),
// ezért a komponensnek nem kell congregationId prop. Fail-closed: a lista-
// betöltés hibája (pl. a tábla még nincs migrálva) borostyán sávban jelenik
// meg, és SOHA nem számít üres listának.
// ─────────────────────────────────────────────────────────────────────────

interface EgysegFormState {
  id?: string
  nev: string
  tipus: EgysegTipus
  megjegyzes: string
}

function SectionEgysegek() {
  const [egysegek, setEgysegek] = useState<GyulekezetiEgyseg[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [szerkesztett, setSzerkesztett] = useState<EgysegFormState | null>(null)
  // Törlés-megerősítés: a getEgysegHasznalat eredményével együtt. A null
  // darabszám = „nem tudjuk" (SOHA nem 0-ként kezeljük).
  const [torlendo, setTorlendo] = useState<{
    egyseg: GyulekezetiEgyseg
    tagok: number | null
    naploSorok: number | null
    usageError?: string
  } | null>(null)

  async function frissit() {
    const res = await listGyulekezetiEgysegek({ inaktivakIs: true })
    if (res.error) {
      setLoadError(res.error)
      setEgysegek([])
    } else {
      setLoadError(null)
      setEgysegek(res.egysegek || [])
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const res = await listGyulekezetiEgysegek({ inaktivakIs: true })
      if (cancelled) return
      if (res.error) {
        setLoadError(res.error)
        setEgysegek([])
      } else {
        setLoadError(null)
        setEgysegek(res.egysegek || [])
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  async function handleMentes() {
    if (!szerkesztett) return
    setBusy(true)
    try {
      // Módosításnál a NEM szerkesztett mezőket (adrlocality_id, sorrend, aktiv)
      // az eredeti sorból adjuk tovább — az update különben kinullázná őket.
      const eredeti = szerkesztett.id ? egysegek.find((e) => e.id === szerkesztett.id) : undefined
      const res = await saveGyulekezetiEgyseg({
        id: szerkesztett.id,
        nev: szerkesztett.nev.trim(),
        tipus: szerkesztett.tipus,
        megjegyzes: szerkesztett.megjegyzes.trim() || null,
        ...(eredeti
          ? { adrlocality_id: eredeti.adrlocality_id, sorrend: eredeti.sorrend, aktiv: eredeti.aktiv }
          : {}),
      })
      if (res.error) { toast.error(res.error); return }
      toast.success(szerkesztett.id ? 'Egység módosítva.' : 'Új egység felvéve.')
      setSzerkesztett(null)
      await frissit()
    } finally {
      setBusy(false)
    }
  }

  async function handleAktivValtas(e: GyulekezetiEgyseg) {
    setBusy(true)
    try {
      const res = await saveGyulekezetiEgyseg({
        id: e.id,
        nev: e.nev,
        tipus: e.tipus,
        megjegyzes: e.megjegyzes,
        adrlocality_id: e.adrlocality_id,
        sorrend: e.sorrend,
        aktiv: !e.aktiv,
      })
      if (res.error) { toast.error(res.error); return }
      toast.success(
        e.aktiv
          ? 'Egység inaktiválva — új adatnál nem választható, a meglévő címkék megmaradnak.'
          : 'Egység újra aktív.',
      )
      await frissit()
    } finally {
      setBusy(false)
    }
  }

  async function handleTorlesElokeszites(e: GyulekezetiEgyseg) {
    setSzerkesztett(null)
    setBusy(true)
    try {
      const hasznalat = await getEgysegHasznalat(e.id)
      setTorlendo({
        egyseg: e,
        tagok: hasznalat.tagok,
        naploSorok: hasznalat.naploSorok,
        usageError: hasznalat.error,
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleTorles() {
    if (!torlendo) return
    setBusy(true)
    try {
      const res = await deleteGyulekezetiEgyseg(torlendo.egyseg.id)
      if (res.error) { toast.error(res.error); return }
      toast.success('Egység törölve — a rá mutató címkék az anyaközpontra estek vissza.')
      setTorlendo(null)
      await frissit()
    } finally {
      setBusy(false)
    }
  }

  const hasznalatIsmeretlen = torlendo
    ? torlendo.tagok === null || torlendo.naploSorok === null
    : false
  const vanCimkezettAdat = torlendo
    ? (torlendo.tagok ?? 0) > 0 || (torlendo.naploSorok ?? 0) > 0
    : false

  return (
    <section className="space-y-4">
      <div className="card-raised p-4 bg-amber-50/30 border-amber-100">
        <div className="flex items-start gap-2">
          <Network className="size-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading text-base text-slate-800">Leány- és szórványegységek</h3>
            <p className="text-xs text-slate-600 mt-1">
              A leányegyházközségek és szórványok az anyaegyházközség kartotékán belüli
              címkézhető egységek — nem külön fiókok. A munkanaplóban és a tagoknál
              megjelölhető, melyik egységhez tartozik egy alkalom vagy személy, a
              lelkészi jelentés „Gyülekezetenkénti bontás&rdquo; táblájában pedig minden egység
              külön oszlopot kap. Az egység nélküli (címkézetlen) adat mindig az
              anyaközpontot jelenti.
            </p>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="rounded-[1rem] border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-xs text-amber-900">
          {loadError}
        </div>
      )}

      {loading ? (
        <p className="flex items-center gap-2 px-1 text-sm text-slate-400">
          <Loader2 className="size-4 animate-spin" /> Az egységek betöltése…
        </p>
      ) : !loadError && egysegek.length === 0 ? (
        <p className="px-1 text-sm italic text-slate-500">
          Még nincs felvett egység. Ha a gyülekezethez leányegyházközség vagy szórvány
          tartozik, az „Új egység&rdquo; gombbal veheted fel.
        </p>
      ) : (
        <div className="space-y-2">
          {egysegek.map((e) => (
            <div
              key={e.id}
              className={`rounded-xl border p-3 ${e.aktiv ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-80'}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">{e.nev}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    e.tipus === 'leany' ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800'
                  }`}
                >
                  {EGYSEG_TIPUS_CIMKEK[e.tipus]}
                </span>
                {!e.aktiv && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    Inaktív
                  </span>
                )}
                <span className="ml-auto flex shrink-0 flex-wrap gap-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setTorlendo(null)
                      setSzerkesztett({ id: e.id, nev: e.nev, tipus: e.tipus, megjegyzes: e.megjegyzes || '' })
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    title="Egység szerkesztése"
                  >
                    <Pencil className="size-3.5" />
                    <span className="hidden sm:inline">Szerkesztés</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleAktivValtas(e)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                    title={e.aktiv ? 'Inaktiválás — új adatnál nem választható, a meglévő címkék megmaradnak' : 'Újra aktiválás'}
                  >
                    {e.aktiv ? 'Inaktiválás' : 'Aktiválás'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleTorlesElokeszites(e)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    title="Egység törlése (megerősítéssel)"
                  >
                    <Trash2 className="size-3.5" />
                    <span className="hidden sm:inline">Törlés</span>
                  </button>
                </span>
              </div>
              {e.megjegyzes && <p className="mt-1 text-xs text-slate-500">{e.megjegyzes}</p>}

              {torlendo?.egyseg.id === e.id && (
                <div className="mt-2 rounded-[1rem] border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-900">
                  <p className="font-semibold">Biztosan törlöd a(z) „{torlendo.egyseg.nev}&rdquo; egységet?</p>
                  {hasznalatIsmeretlen ? (
                    <p className="mt-1">
                      A címkézett adatok száma most nem állapítható meg
                      {torlendo.usageError ? ` (${torlendo.usageError})` : ''} — ilyenkor a
                      biztonságos út az <strong>inaktiválás</strong>: a meglévő címkék
                      megmaradnak, csak új adatra nem választható.
                    </p>
                  ) : vanCimkezettAdat ? (
                    <p className="mt-1">
                      Ehhez az egységhez jelenleg <strong>{torlendo.tagok} tag</strong> és{' '}
                      <strong>{torlendo.naploSorok} munkanapló-sor</strong> van címkézve.
                      Törléskor a címkék az anyaközpontra esnek vissza (az adatok megmaradnak,
                      csak az egység-besorolásuk vész el) — ehelyett az{' '}
                      <strong>inaktiválást</strong> ajánljuk.
                    </p>
                  ) : (
                    <p className="mt-1">Az egységhez nem tartozik címkézett adat — a törlés biztonságos.</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setTorlendo(null)}
                      disabled={busy}
                    >
                      Mégse
                    </Button>
                    {torlendo.egyseg.aktiv && (hasznalatIsmeretlen || vanCimkezettAdat) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-amber-300 bg-white text-amber-800 hover:bg-amber-50"
                        onClick={() => {
                          const cel = torlendo.egyseg
                          setTorlendo(null)
                          void handleAktivValtas(cel)
                        }}
                        disabled={busy}
                      >
                        Inkább inaktiválom
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      className="bg-rose-600 text-white hover:bg-rose-700"
                      onClick={() => void handleTorles()}
                      disabled={busy}
                    >
                      Törlés véglegesen
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {szerkesztett ? (
        <div className="card-raised space-y-3 p-4">
          <p className="text-sm font-semibold text-slate-800">
            {szerkesztett.id ? 'Egység szerkesztése' : 'Új egység'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ModalField label="Egység neve *">
              <Input
                value={szerkesztett.nev}
                maxLength={120}
                onChange={(ev) => setSzerkesztett({ ...szerkesztett, nev: ev.target.value })}
                placeholder="pl. Páva (leányegyházközség)"
                className={FIELD_INPUT_CLASS}
              />
            </ModalField>
            <ModalField label="Típus *">
              <select
                value={szerkesztett.tipus}
                onChange={(ev) => setSzerkesztett({ ...szerkesztett, tipus: ev.target.value as EgysegTipus })}
                className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/25"
              >
                {(Object.keys(EGYSEG_TIPUS_CIMKEK) as EgysegTipus[]).map((t) => (
                  <option key={t} value={t}>{EGYSEG_TIPUS_CIMKEK[t]}</option>
                ))}
              </select>
            </ModalField>
          </div>
          <ModalField label="Megjegyzés (opcionális)">
            <Input
              value={szerkesztett.megjegyzes}
              maxLength={500}
              onChange={(ev) => setSzerkesztett({ ...szerkesztett, megjegyzes: ev.target.value })}
              placeholder="pl. kéthetente délutáni istentisztelet"
              className={FIELD_INPUT_CLASS}
            />
          </ModalField>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setSzerkesztett(null)} disabled={busy}>
              Mégse
            </Button>
            <Button
              type="button"
              onClick={() => void handleMentes()}
              disabled={busy || szerkesztett.nev.trim().length < 2}
            >
              {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Save className="mr-1 size-4" />}
              Mentés
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setTorlendo(null)
            setSzerkesztett({ nev: '', tipus: 'leany', megjegyzes: '' })
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-300 bg-white/50 p-3 text-sm font-medium text-amber-700 transition hover:bg-amber-50/40 disabled:opacity-50"
        >
          <Plus className="size-4" />
          Új egység
        </button>
      )}
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

      {/* #Endre (6a): a kedvezmény NEM itt állítható — a „Kedvezmények és díjak" panelen (időszaki,
          kor-, foglalkozás-, szociális kedvezmények). A jarulek_kedvezmenyes/hatarid skalár mezők a
          háttérben megmaradnak (nem törlődnek), de itt nem szerkesztjük. */}
      <WizardBanner tone="info">
        <p>
          A <strong>kedvezményeket</strong> (korai fizetés / kor / foglalkozás / szociális) a bal
          oldali <strong>&bdquo;Kedvezmények és díjak&rdquo;</strong> panelen állíthatod be — több szabály is
          felvehető, akár évenként.
        </p>
      </WizardBanner>

      {/* 2026-08-15 (beállítás-felmérés 2.1, P0): ÁFA-alanyiság (TVA). A kapcsolót az
          Oblio-számlaépítő olvassa: bekapcsolva a kimenő számlák 19% ÁFÁ-val
          („Normala"), kikapcsolva ÁFA nélkül („Scutit fără drept de deducere")
          készülnek (lib/finance/oblio/oblio-invoice-builder.ts). Eddig a mezőt
          semmilyen felület nem írta — plafon-átlépéskor a lelkész csak kézi SQL-lel
          tudta volna rögzíteni, és a számlák továbbra is ÁFA nélkül mentek volna ki. */}
      <WizardSectionCard
        icon={Percent}
        iconColor="text-rose-700"
        iconBg="bg-rose-50"
        title="ÁFA-alanyiság (TVA)"
        description="A kimenő számlák (pl. a bérleti díjak Oblio-számlái) ÁFA-kezelését határozza meg."
      >
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
            form.tva_alany
              ? 'border-rose-200 bg-rose-50/40'
              : 'border-slate-200 bg-slate-50/40 hover:border-slate-300'
          }`}
        >
          <input
            type="checkbox"
            checked={form.tva_alany}
            onChange={(e) => setForm({ ...form, tva_alany: e.target.checked })}
            className="mt-0.5 size-4 accent-rose-600"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-slate-800">
              ÁFA-alany a gyülekezet?
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Csak akkor kapcsold be, ha az ANAF-nál már megtörtént a TVA-regisztráció.
            </span>
          </span>
        </label>

        {form.tva_alany && (
          <WizardInputGrid cols={2}>
            <WizardField
              id="tva_kod"
              label="TVA-kód"
              hint="Pl. RO12345678 — az ANAF-regisztrációkor kapott cod de TVA."
            >
              <WizardInput
                id="tva_kod"
                value={form.tva_kod}
                onChange={(e) => setForm({ ...form, tva_kod: e.target.value })}
                placeholder="pl. RO12345678"
              />
            </WizardField>
            <WizardField
              id="tva_alany_tol"
              label="ÁFA-alanyiság kezdete"
              hint="Az ANAF által visszaigazolt hatálybalépés napja."
            >
              <WizardInput
                id="tva_alany_tol"
                type="date"
                value={form.tva_alany_tol}
                onChange={(e) => setForm({ ...form, tva_alany_tol: e.target.value })}
              />
            </WizardField>
          </WizardInputGrid>
        )}

        <WizardBanner tone={form.tva_alany ? 'warning' : 'info'}>
          {form.tva_alany ? (
            <p>
              A gyülekezet <strong>ÁFA-alanyként</strong> van beállítva — a mentés után a
              kimenő (Oblio) számlák <strong>19% ÁFÁ-val</strong> készülnek.
            </p>
          ) : (
            <p>
              <strong>Mikor ÁFA-alany egy gyülekezet?</strong> Ha az éves gazdasági forgalma
              (pl. bérbeadásból) meghaladja a <strong>395 000 RON</strong> plafont — ekkor a
              könyvelő 10 napon belül benyújtja a 010-es nyomtatványt az ANAF-hoz —, vagy ha
              önként regisztrált ÁFA-körbe. Amíg a kapcsoló ki van kapcsolva, a kimenő
              számlák ÁFA nélkül készülnek. A plafon közeledését a Pénzügy oldal
              TVA-figyelője mutatja.
            </p>
          )}
        </WizardBanner>
      </WizardSectionCard>

      {/* 2026-07-17 (F5, Q6 — user-döntés): a „Tartozás-számítási mód" választó
          KIVEZETVE — a rendszer mindig az „akkori" (a tartozás évének beállításai
          szerinti) módon számol; az 'aktualis' a listákon no-op volt, és képernyők
          közti eltérést okozott. A form-mező pass-through marad (nem írjuk át a
          tárolt értéket), de a számítás már nem olvassa. */}
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
