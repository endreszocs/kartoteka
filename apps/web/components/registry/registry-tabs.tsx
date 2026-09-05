'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { ColorTabs } from '@/components/ui/color-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyFirstRecord } from '@/components/ui/empty-first-record'
import { RegistryOverview } from './registry-overview'
import { RegistryDetailDialog } from './registry-detail-dialog'
import { getRegistryData, deleteRegistryEntry } from '@/app/(dashboard)/anyakonyv/actions'
import { REGISTRY_TABS, REGISTRY_TAB_LABELS, REGISTRY_BUTTON_CONFIG } from '@/lib/constants/registry'
import type { RegistryTab, RegistryEntry } from '@/lib/constants/registry'
import { BaptismDialog } from '@/components/modals/baptism-dialog'
import { MarriageDialog } from '@/components/modals/marriage-dialog'
import { BurialDialog } from '@/components/modals/burial-dialog'
import { MovementDialog } from '@/components/modals/movement-dialog'
import { ConfirmationDialog } from '@/components/modals/confirmation-dialog'
import { ModuleHero } from '@/components/shared/module-hero'
import { AnyakonyvHelp } from './anyakonyv-help'
import { EmleklapDialog } from './emleklap/emleklap-dialog'
import type { EmleklapType } from '@/lib/constants/emleklap-templates'
import { mapRegistryEntryToEmleklapData, registryTabToEmleklapType } from '@/lib/utils/emleklap-data-mapper'
import { Award } from 'lucide-react'
import { toast } from 'sonner'

interface RegistryTabsProps {
  congregationId: string
  congregationName: string
  /** 2026-05-25: ha true, a tab-lista végén megjelenik egy "Rendszergazdai importáló" fül (red-prominent). */
  showAdminImport?: boolean
  /** A Rendszergazdai importáló fül tartalma. */
  adminImportContent?: React.ReactNode
}

/**
 * View-state külön az `activeTab`-tól — így a meglévő RegistryTab-alapú logika
 * (loadData, getColumns, hash-routing) érintetlen marad, és a Súgó/Admin-import
 * tabok csak a megjelenítést befolyásolják.
 */
type ActiveView = 'tab' | 'help' | 'admin-import'

// Hash-routing: a sidebar `/anyakonyv#keresztseg` stb. URL-jeiből közvetlen tab-ugrás.
const VALID_TAB_HASHES = new Set<string>(REGISTRY_TABS as readonly string[])
const DEFAULT_TAB: RegistryTab = 'attekinto'

function getTabFromHash(hash: string): RegistryTab {
  const clean = hash.replace(/^#/, '')
  return VALID_TAB_HASHES.has(clean) ? (clean as RegistryTab) : DEFAULT_TAB
}

// Sortálható oszlop deklaráció
interface ColDef {
  key: string
  label: string
  /** A sortáláshoz kinyert érték — string vagy number. */
  sortVal: (d: RegistryEntry) => string | number
  /** Megjelenítés cellában. */
  render: (d: RegistryEntry) => React.ReactNode
  /** Kis méretű képernyőn elrejtve? */
  hidden?: 'md' | 'lg'
  className?: string
}

function fmtName(d: RegistryEntry): string {
  return d.szemely ? `${d.szemely.csaladnev} ${d.szemely.k_nev}` : '—'
}
function fmtDate(s?: string | null): string {
  if (!s) return '—'
  return s.toString().split('T')[0]
}
function lowerKey(d: RegistryEntry, key: string): string {
  const v = (d as Record<string, unknown>)[key]
  return String(v || '').toLowerCase()
}

// ── Oszlop-konfiguráció fülönként ────────────────────────────
function getColumns(tab: RegistryTab): ColDef[] {
  if (tab === 'keresztseg') return [
    { key: 'egyhazi_szam', label: 'Egyházi szám', sortVal: d => String(d.egyhazi_szam || ''), render: d => <span className="font-mono text-xs text-violet-700">{(d.egyhazi_szam as string) || '—'}</span> },
    { key: 'okirat', label: 'Állami szám', hidden: 'lg', sortVal: d => String(d.okirat || ''), render: d => <span className="text-xs text-slate-500">{d.okirat || '—'}</span> },
    { key: 'nev', label: 'Név', sortVal: fmtName, render: d => <span className="font-medium">{fmtName(d)}</span> },
    { key: 'datum', label: 'Dátum', sortVal: d => String(d.datum || ''), render: d => <span className="text-muted-foreground">{fmtDate(d.datum as string)}</span> },
    { key: 'lelkeszneve', label: 'Lelkész', hidden: 'md', sortVal: d => lowerKey(d, 'lelkeszneve'), render: d => <span className="text-muted-foreground">{d.lelkeszneve || '—'}</span> },
  ]

  if (tab === 'konfirmalas') return [
    { key: 'egyhazi_szam', label: 'Egyházi szám', sortVal: d => String(d.egyhazi_szam || ''), render: d => <span className="font-mono text-xs text-violet-700">{(d.egyhazi_szam as string) || '—'}</span> },
    { key: 'nev', label: 'Név', sortVal: fmtName, render: d => <span className="font-medium">{fmtName(d)} {d.szemely?.ferfi !== null && d.szemely?.ferfi !== undefined ? (d.szemely.ferfi ? '♂' : '♀') : ''}</span> },
    { key: 'datum', label: 'Dátum', sortVal: d => String(d.datum || ''), render: d => <span className="text-muted-foreground">{fmtDate(d.datum as string)}</span> },
    { key: 'lelkeszneve', label: 'Lelkész', hidden: 'md', sortVal: d => lowerKey(d, 'lelkeszneve'), render: d => <span className="text-muted-foreground">{d.lelkeszneve || '—'}</span> },
  ]

  if (tab === 'hazassag') return [
    { key: 'egyhazi_szam', label: 'Egyházi szám', sortVal: d => String(d.egyhazi_szam || ''), render: d => <span className="font-mono text-xs text-violet-700">{(d.egyhazi_szam as string) || '—'}</span> },
    { key: 'hlevel', label: 'Hlevel', hidden: 'lg', sortVal: d => String(d.hlevel || ''), render: d => <span className="text-xs text-slate-500">{(d.hlevel as string) || '—'}</span> },
    { key: 'volegeny', label: 'Vőlegény', sortVal: d => d.ferfi ? `${d.ferfi.csaladnev} ${d.ferfi.k_nev}` : '', render: d => <span className="font-medium">{d.ferfi ? `${d.ferfi.csaladnev} ${d.ferfi.k_nev}` : '—'}</span> },
    { key: 'menyasszony', label: 'Menyasszony', sortVal: d => d.no ? `${d.no.csaladnev} ${d.no.k_nev}` : '', render: d => <span className="font-medium">{d.no ? `${d.no.csaladnev} ${d.no.k_nev}` : '—'}</span> },
    { key: 'datum', label: 'Dátum', sortVal: d => String(d.datum || ''), render: d => <span className="text-muted-foreground">{fmtDate(d.datum as string)}</span> },
  ]

  if (tab === 'temetes') return [
    { key: 'egyhazi_szam', label: 'Egyházi szám', sortVal: d => String(d.egyhazi_szam || ''), render: d => <span className="font-mono text-xs text-violet-700">{(d.egyhazi_szam as string) || '—'}</span> },
    { key: 'nev', label: 'Név', sortVal: fmtName, render: d => <span className="font-medium">{fmtName(d)}</span> },
    { key: 'hdatum', label: 'Halál', sortVal: d => String(d.hdatum || ''), render: d => <span className="text-muted-foreground">{fmtDate(d.hdatum as string)}</span> },
    { key: 'tdatum', label: 'Temetés', sortVal: d => String(d.tdatum || ''), render: d => <span className="text-muted-foreground">{fmtDate(d.tdatum as string)}</span> },
    { key: 'hoka', label: 'Ok', hidden: 'md', sortVal: d => lowerKey(d, 'hoka'), render: d => <span className="text-muted-foreground text-xs">{d.hoka || '—'}</span> },
  ]

  if (tab === 'bekoltozott') return [
    { key: 'egyhazi_szam', label: 'Egyházi szám', sortVal: d => String(d.egyhazi_szam || ''), render: d => <span className="font-mono text-xs text-violet-700">{(d.egyhazi_szam as string) || '—'}</span> },
    { key: 'nev', label: 'Név', sortVal: fmtName, render: d => <span className="font-medium">{fmtName(d)}</span> },
    { key: 'honnan', label: 'Honnan', sortVal: d => (d.adrlocality?.name || '').toLowerCase(), render: d => <span className="text-xs text-slate-600">{(d.adrlocality as { name: string } | null)?.name || '—'}</span> },
    { key: 'mikor', label: 'Dátum', sortVal: d => String(d.mikor || ''), render: d => <span className="text-muted-foreground">{fmtDate(d.mikor as string)}</span> },
    { key: 'megjegyzes', label: 'Megjegyzés', hidden: 'md', sortVal: d => lowerKey(d, 'megjegyzes'), render: d => <span className="text-muted-foreground text-xs truncate max-w-[200px] inline-block">{d.megjegyzes || '—'}</span> },
  ]

  if (tab === 'elkoltozott') return [
    { key: 'egyhazi_szam', label: 'Egyházi szám', sortVal: d => String(d.egyhazi_szam || ''), render: d => <span className="font-mono text-xs text-violet-700">{(d.egyhazi_szam as string) || '—'}</span> },
    { key: 'nev', label: 'Név', sortVal: fmtName, render: d => <span className="font-medium">{fmtName(d)}</span> },
    {
      key: 'hova', label: 'Hova / Célgyülekezet',
      sortVal: d => {
        const helyseg = (d.adrlocality as { name: string } | null)?.name || ''
        const target = Array.isArray(d.hova_congregation) ? d.hova_congregation[0] : d.hova_congregation
        return (helyseg + ' ' + (target?.nev_hu || target?.name || '')).toLowerCase()
      },
      render: d => {
        const helyseg = (d.adrlocality as { name: string } | null)?.name
        const target = Array.isArray(d.hova_congregation) ? d.hova_congregation[0] : d.hova_congregation
        const congName = target?.nev_hu || target?.name
        return (
          <span className="text-xs">
            {helyseg && <div className="text-slate-700">{helyseg}</div>}
            {congName && <div className="text-[10px] text-violet-600">{congName}</div>}
            {!helyseg && !congName && <span className="text-slate-400">—</span>}
          </span>
        )
      },
    },
    {
      key: 'allapot', label: 'Állapot',
      sortVal: d => {
        const isKulfoldre = (d.kulfoldre as boolean | undefined) === true
        const notif = Array.isArray(d.transfer_notification) ? d.transfer_notification[0] : d.transfer_notification
        if (isKulfoldre) return '0-kulfold'
        if (!notif) return '1-nincs'
        return `2-${notif.status}`
      },
      render: d => {
        const isKulfoldre = (d.kulfoldre as boolean | undefined) === true
        const notif = Array.isArray(d.transfer_notification) ? d.transfer_notification[0] : d.transfer_notification
        if (isKulfoldre) return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">🌍 Külföld</span>
        if (!notif) return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">— Nincs cél —</span>
        if (notif.status === 'pending') return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">⏳ Függőben</span>
        if (notif.status === 'accepted') return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">✓ Elfogadva</span>
        return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">✕ Elutasítva</span>
      },
    },
    { key: 'mikor', label: 'Dátum', sortVal: d => String(d.mikor || ''), render: d => <span className="text-muted-foreground">{fmtDate(d.mikor as string)}</span> },
  ]

  if (tab === 'attert') return [
    { key: 'egyhazi_szam', label: 'Egyházi szám', sortVal: d => String(d.egyhazi_szam || ''), render: d => <span className="font-mono text-xs text-violet-700">{(d.egyhazi_szam as string) || '—'}</span> },
    { key: 'nev', label: 'Név', sortVal: fmtName, render: d => <span className="font-medium">{fmtName(d)}</span> },
    { key: 'felekezet', label: 'Korábbi felekezet', sortVal: d => lowerKey(d, 'felekezet'), render: d => <span className="text-xs text-slate-600">{d.felekezet || '—'}</span> },
    { key: 'honnan', label: 'Honnan', hidden: 'md', sortVal: d => (d.adrlocality?.name || '').toLowerCase(), render: d => <span className="text-xs text-slate-500">{(d.adrlocality as { name: string } | null)?.name || '—'}</span> },
    { key: 'mikor', label: 'Dátum', sortVal: d => String(d.mikor || ''), render: d => <span className="text-muted-foreground">{fmtDate(d.mikor as string)}</span> },
  ]

  if (tab === 'kitert') return [
    { key: 'egyhazi_szam', label: 'Egyházi szám', sortVal: d => String(d.egyhazi_szam || ''), render: d => <span className="font-mono text-xs text-violet-700">{(d.egyhazi_szam as string) || '—'}</span> },
    { key: 'nev', label: 'Név', sortVal: fmtName, render: d => <span className="font-medium">{fmtName(d)}</span> },
    { key: 'felekezet', label: 'Új felekezet', sortVal: d => lowerKey(d, 'felekezet'), render: d => <span className="text-xs text-slate-600">{d.felekezet || '—'}</span> },
    { key: 'hova', label: 'Hova', hidden: 'md', sortVal: d => (d.adrlocality?.name || '').toLowerCase(), render: d => <span className="text-xs text-slate-500">{(d.adrlocality as { name: string } | null)?.name || '—'}</span> },
    { key: 'mikor', label: 'Dátum', sortVal: d => String(d.mikor || ''), render: d => <span className="text-muted-foreground">{fmtDate(d.mikor as string)}</span> },
  ]

  return []
}

export function RegistryTabs({ congregationName, showAdminImport = false, adminImportContent }: RegistryTabsProps) {
  const [activeTab, setActiveTab] = useState<RegistryTab>(DEFAULT_TAB)
  const [activeView, setActiveView] = useState<ActiveView>('tab')
  const [emleklapOpen, setEmleklapOpen] = useState(false)
  /** Sor-specifikus megnyitásnál a bejegyzésből származó adatok. */
  const [emleklapPrefill, setEmleklapPrefill] = useState<{
    type: EmleklapType
    data: Record<string, string>
  } | null>(null)

  // Az aktív tab szerint inferáljuk az emléklap-típust
  const emleklapTypeForActiveTab: EmleklapType | undefined = registryTabToEmleklapType(activeTab)

  /**
   * Egy konkrét anyakönyvi bejegyzéshez nyitja meg az emléklap-stúdiót,
   * a meglévő adatokkal előtöltve. A 3 sákramentumi tabon (keresztelés,
   * konfirmáció, esketés) működik.
   */
  function openEmleklapForEntry(entry: RegistryEntry) {
    const emleklapType = registryTabToEmleklapType(activeTab)
    if (!emleklapType) return
    const data = mapRegistryEntryToEmleklapData(entry, activeTab, {
      congregationName,
    })
    setEmleklapPrefill({ type: emleklapType, data })
    setEmleklapOpen(true)
  }
  const [allData, setAllData] = useState<RegistryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filterYear, setFilterYear] = useState('')
  const [searchText, setSearchText] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(true)

  // Modal-ok
  const [baptismOpen, setBaptismOpen] = useState(false)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [marriageOpen, setMarriageOpen] = useState(false)
  const [burialOpen, setBurialOpen] = useState(false)
  const [movementOpen, setMovementOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<RegistryEntry | null>(null)

  // Részletes nézet (Endre kérése: kattintásra megnyíló olvasó dialog)
  const [detailEntry, setDetailEntry] = useState<RegistryEntry | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const resetViewState = useCallback(() => {
    setFilterYear('')
    setSearchText('')
    setSortCol(null)
    setSortAsc(true)
  }, [])

  const loadData = useCallback(async (tab: RegistryTab) => {
    if (tab === 'attekinto') return
    const data = await getRegistryData(tab)
    setAllData(data)
    setLoading(false)
  }, [])

  const refreshData = useCallback((tab: RegistryTab = activeTab) => {
    if (tab === 'attekinto') return
    setLoading(true)
    void loadData(tab)
  }, [activeTab, loadData])

  useEffect(() => {
    if (activeTab === 'attekinto') return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        void loadData(activeTab)
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeTab, loadData])

  // Hash-routing — sidebar Link navigációja után visszaállítjuk a tab view-t,
  // különben a help/admin-import view tovább „ragadna" amikor a felhasználó
  // pl. anyakonyv#konfirmalas-ra navigál.
  useEffect(() => {
    const apply = () => {
      setActiveTab(getTabFromHash(window.location.hash))
      setActiveView('tab')
    }
    apply()
    const originalPushState = window.history.pushState
    const originalReplaceState = window.history.replaceState
    let lastHash = window.location.hash
    const dispatchIfHashChanged = () => {
      const newHash = window.location.hash
      if (newHash !== lastHash) {
        lastHash = newHash
        setTimeout(() => window.dispatchEvent(new HashChangeEvent('hashchange')), 0)
      }
    }
    window.history.pushState = function (...args) {
      originalPushState.apply(this, args)
      dispatchIfHashChanged()
    }
    window.history.replaceState = function (...args) {
      originalReplaceState.apply(this, args)
      dispatchIfHashChanged()
    }
    window.addEventListener('hashchange', apply)
    window.addEventListener('popstate', apply)
    return () => {
      window.removeEventListener('hashchange', apply)
      window.removeEventListener('popstate', apply)
      window.history.pushState = originalPushState
      window.history.replaceState = originalReplaceState
    }
  }, [])

  // Év opciók
  const yearOptions = useMemo(() => {
    const years: Record<string, boolean> = {}
    allData.forEach(d => {
      const dt = d.datum || d.mikor || d.hdatum || d.tdatum || ''
      const y = typeof dt === 'string' ? dt.substring(0, 4) : ''
      if (y.length === 4) years[y] = true
    })
    return Object.keys(years).sort().reverse()
  }, [allData])

  const columns = useMemo(() => getColumns(activeTab), [activeTab])

  // Szűrt + rendezett adat
  const filtered = useMemo(() => {
    let result = allData

    if (filterYear) {
      result = result.filter(d => {
        const dt = d.datum || d.mikor || d.hdatum || d.tdatum || ''
        return typeof dt === 'string' && dt.startsWith(filterYear)
      })
    }

    if (searchText) {
      const q = searchText.toLowerCase()
      result = result.filter(d => {
        const fields = [
          d.szemely ? `${d.szemely.csaladnev} ${d.szemely.k_nev}` : '',
          d.ferfi ? `${d.ferfi.csaladnev} ${d.ferfi.k_nev}` : '',
          d.no ? `${d.no.csaladnev} ${d.no.k_nev}` : '',
          d.lelkeszneve || '', d.okirat || '', (d.egyhazi_szam as string | undefined) || '',
          (d.hlevel as string | undefined) || '', d.megjegyzes || '', d.tanuk || '',
          d.felekezet || '', d.hoka || '', d.igazolas || '',
          (d.adrlocality as { name: string } | null)?.name || '',
        ].join(' ').toLowerCase()
        return fields.includes(q)
      })
    }

    if (sortCol) {
      const col = columns.find(c => c.key === sortCol)
      if (col) {
        result = [...result].sort((a, b) => {
          const va = col.sortVal(a)
          const vb = col.sortVal(b)
          if (typeof va === 'number' && typeof vb === 'number') {
            return sortAsc ? va - vb : vb - va
          }
          return sortAsc
            ? String(va).localeCompare(String(vb), 'hu')
            : String(vb).localeCompare(String(va), 'hu')
        })
      }
    }

    return result
  }, [allData, filterYear, searchText, sortCol, sortAsc, columns])

  function handleSort(col: string) {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(true) }
  }

  function openModal(entry?: RegistryEntry) {
    setEditEntry(entry || null)
    if (activeTab === 'keresztseg') setBaptismOpen(true)
    else if (activeTab === 'konfirmalas') setConfirmationOpen(true)
    else if (activeTab === 'hazassag') setMarriageOpen(true)
    else if (activeTab === 'temetes') setBurialOpen(true)
    else setMovementOpen(true)
  }

  function openDetail(d: RegistryEntry) {
    setDetailEntry(d)
    setDetailOpen(true)
  }

  function handleTabChange(tab: RegistryTab) {
    resetViewState()
    setLoading(tab !== 'attekinto')
    setActiveTab(tab)
    if (typeof window !== 'undefined') {
      const newHash = tab === DEFAULT_TAB ? '' : `#${tab}`
      if (window.location.hash !== newHash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search + newHash)
      }
    }
  }

  /**
   * 2026-05-25: Súgó és Rendszergazdai importáló tab-ok kezelése.
   * Ezek nem registry-domain tabok, így nem futtatunk loadData-t / hash-routing-ot.
   * Külön `activeView` state-ben tartjuk őket, hogy a meglévő RegistryTab-os
   * logika érintetlen maradjon.
   */
  function handleExtendedTabChange(value: string) {
    if (value === 'help' || value === 'admin-import') {
      resetViewState()
      setLoading(false)
      setActiveView(value)
      return
    }
    setActiveView('tab')
    handleTabChange(value as RegistryTab)
  }

  async function handleDelete(id: number) {
    if (!confirm('Biztosan törli ezt a bejegyzést? A törlés végleges.')) return
    const result = await deleteRegistryEntry(activeTab, id)
    if (result.error) toast.error(result.error)
    else {
      toast.success('Bejegyzés törölve.')
      // 2026-09-05: a naptár-program anyakönyvi kapcsolatának bontása külön
      // lépés — ha az nem sikerült, a lelkész lássa (nem néma).
      const figyelmeztetes = (result as { warning?: string | null }).warning
      if (figyelmeztetes) toast.warning(figyelmeztetes)
      refreshData(activeTab)
    }
  }

  function closeAndRefresh(open: boolean) {
    if (open) return
    setBaptismOpen(false); setConfirmationOpen(false); setMarriageOpen(false); setBurialOpen(false); setMovementOpen(false)
    setEditEntry(null)
    refreshData(activeTab)
  }

  function SortIcon({ col }: { col: string }) {
    if (sortCol !== col) return <ChevronsUpDown className="size-3 inline-block ml-1 text-slate-300" />
    return sortAsc
      ? <ChevronUp className="size-3 inline-block ml-1 text-slate-600" />
      : <ChevronDown className="size-3 inline-block ml-1 text-slate-600" />
  }

  function renderTable() {
    if (filtered.length === 0) {
      const tabLabel = (REGISTRY_TAB_LABELS[activeTab] || 'anyakönyvi').toLowerCase()
      return (
        <EmptyFirstRecord
          accent="rose"
          icon={Award}
          title="Még nincs anyakönyvi bejegyzés"
          description={`Ebben a nyilvántartásban (${tabLabel}) még nincs bejegyzés. Rögzítsd az elsőt — a kiállított oklevelek innen generálhatók.`}
          ctaLabel="Rögzítsd az első bejegyzést"
          onCta={() => openModal()}
        />
      )
    }

    return (
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              {columns.map(c => (
                <th
                  key={`h-${c.key}`}
                  className={`p-2 text-left cursor-pointer select-none hover:bg-slate-100 transition-colors ${c.hidden === 'md' ? 'hidden md:table-cell' : c.hidden === 'lg' ? 'hidden lg:table-cell' : ''}`}
                  onClick={() => handleSort(c.key)}
                  title="Kattints a rendezéshez"
                >
                  {c.label}
                  <SortIcon col={c.key} />
                </th>
              ))}
              <th key="h-act" className="p-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => (
              <tr
                key={d.id}
                className="border-b hover:bg-blue-50/50 cursor-pointer transition-colors"
                onClick={() => openDetail(d)}
                title="Kattints a részletek megtekintéséhez"
              >
                {columns.map(c => (
                  <td
                    key={`c-${c.key}`}
                    className={`p-2 ${c.hidden === 'md' ? 'hidden md:table-cell' : c.hidden === 'lg' ? 'hidden lg:table-cell' : ''}`}
                  >
                    {c.render(d)}
                  </td>
                ))}
                <td key="c-act" className="p-2 text-right">
                  <div className="flex gap-1 justify-end items-center" onClick={(e) => e.stopPropagation()}>
                    {/* 2026-05-28: Emléklap-stúdió a kereszteles/konfirmalas/hazassag tabokon */}
                    {(activeTab === 'keresztseg' || activeTab === 'konfirmalas' || activeTab === 'hazassag') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        onClick={() => openEmleklapForEntry(d)}
                        title="Emléklap-stúdió megnyitása ezzel a bejegyzéssel"
                      >
                        <Award className="size-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-xs text-blue-500 hover:text-blue-700"
                      onClick={() => openModal(d)}
                      title="Szerkesztés"
                    >
                      ✏️
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                      onClick={() => handleDelete(d.id)}
                      title="Törlés"
                    >
                      ✕
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const btnConfig = REGISTRY_BUTTON_CONFIG[activeTab]

  return (
    <>
      <ModuleHero
        eyebrow="Anyakönyv"
        title="Anyakönyvi nyilvántartás"
        description="Keresztelések, konfirmációk, házasságkötések, temetések és mozgási bejegyzések egy rendezett, áttekinthető felületen."
        pills={[
          { label: congregationName, tone: 'neutral' },
          { label: `${filtered.length} látható bejegyzés`, tone: 'emerald' },
        ]}
        actions={
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl border-amber-200 bg-white/80 text-amber-700 hover:bg-amber-50"
            onClick={() => setEmleklapOpen(true)}
          >
            <Award className="mr-1.5 size-4" />
            Emléklap-stúdió
          </Button>
        }
      />

      <div className="mb-4 hidden">
        <h2 className="text-xl font-bold text-slate-800">Anyakönyv</h2>
        <p className="text-sm text-slate-400">Keresztelések, konfirmációk, esküvők és egyéb bejegyzések</p>
      </div>

      <ColorTabs
        tabs={[
          ...REGISTRY_TABS.map(t => {
            const colors: Record<string, string> = { attekinto: 'blue', keresztseg: 'emerald', konfirmacio: 'violet', hazassag: 'pink', temetes: 'slate', bekoltozott: 'cyan', elkoltozott: 'orange', attert: 'amber', kitert: 'red' }
            return { value: t, label: REGISTRY_TAB_LABELS[t], color: colors[t] || 'blue' }
          }),
          // 2026-05-25: lelkészi Súgó + Rendszergazdai importáló a sor végén
          { value: 'help', label: 'Súgó', color: 'teal' },
          ...(showAdminImport ? [
            { value: 'admin-import', label: 'Rendszergazdai importáló', color: 'red-prominent' },
          ] : []),
        ]}
        active={activeView === 'tab' ? activeTab : activeView}
        onChange={handleExtendedTabChange}
      />

      {activeView === 'help' ? (
        <div className="mt-4">
          <AnyakonyvHelp />
        </div>
      ) : activeView === 'admin-import' && showAdminImport && adminImportContent ? (
        <div className="mt-4">{adminImportContent}</div>
      ) : (
      <Tabs value={activeTab} onValueChange={v => handleTabChange(v as RegistryTab)}>
        <TabsContent value="attekinto" className="mt-4">
          <RegistryOverview />
        </TabsContent>

        {REGISTRY_TABS.filter(t => t !== 'attekinto').map(tab => (
          <TabsContent key={tab} value={tab} className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Minden év</option>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <Input placeholder="Keresés..." value={searchText} onChange={e => setSearchText(e.target.value)} className="w-48" />
              <Badge variant="secondary" className="text-xs">{filtered.length}{filterYear || searchText ? ` / ${allData.length}` : ''} bejegyzés</Badge>
              {sortCol && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  Rendezés: {columns.find(c => c.key === sortCol)?.label} {sortAsc ? '▲' : '▼'}
                  <button
                    type="button"
                    onClick={() => setSortCol(null)}
                    className="ml-1 text-slate-400 hover:text-slate-700"
                    aria-label="Rendezés törlése"
                  >
                    ✕
                  </button>
                </Badge>
              )}
              {btnConfig && (
                <div className="ml-auto">
                  <Button size="sm" className={`text-white ${btnConfig.color}`} onClick={() => openModal()}>{btnConfig.label}</Button>
                </div>
              )}
            </div>

            {loading ? <div className="py-8 text-center text-sm text-muted-foreground">Betöltés...</div> : renderTable()}
          </TabsContent>
        ))}
      </Tabs>
      )}

      {/* Részletes olvasó dialog */}
      <RegistryDetailDialog
        open={detailOpen}
        onOpenChange={(o) => { setDetailOpen(o); if (!o) setDetailEntry(null) }}
        entry={detailEntry}
        tab={activeTab}
        congregationName={congregationName}
        onEdit={() => detailEntry && openModal(detailEntry)}
        onDelete={() => detailEntry && handleDelete(detailEntry.id)}
      />

      {/* Modal-ok */}
      <BaptismDialog open={baptismOpen} onOpenChange={closeAndRefresh} congregationName={congregationName} editEntry={editEntry} />
      <ConfirmationDialog open={confirmationOpen} onOpenChange={closeAndRefresh} congregationName={congregationName} editEntry={editEntry} />
      <MarriageDialog open={marriageOpen} onOpenChange={closeAndRefresh} congregationName={congregationName} editEntry={editEntry} />
      <BurialDialog open={burialOpen} onOpenChange={closeAndRefresh} congregationName={congregationName} editEntry={editEntry} />
      <MovementDialog open={movementOpen} onOpenChange={closeAndRefresh} movementType={activeTab as 'bekoltozott' | 'elkoltozott' | 'attert' | 'kitert'} editEntry={editEntry} />

      {/* 2026-05-28: Anyakönyvi emléklap-stúdió — sablon-alapú szerkeszthető
          emléklap-generátor. A `emleklapPrefill` egy konkrét anyakönyvi
          bejegyzésből előtöltött adatokkal nyílik (sor-szintű "Emléklap" gomb);
          ennek hiányában a hero "Emléklap-stúdió" gomb az aktív tab default
          típusát használja. */}
      <EmleklapDialog
        open={emleklapOpen}
        onOpenChange={(open) => {
          setEmleklapOpen(open)
          if (!open) setEmleklapPrefill(null)
        }}
        initialType={emleklapPrefill?.type ?? emleklapTypeForActiveTab}
        initialVariant="erek"
        initialData={emleklapPrefill?.data ?? { congregationName }}
        // 2026-05-29: ha tudjuk az aktív anyakönyvi típust (keresztelés/
        // konfirmáció/esketés), a típus-választó eltűnik — csak az adott
        // sablon jelenik meg, nem lehet átváltani a többire.
        lockType={Boolean(emleklapPrefill?.type ?? emleklapTypeForActiveTab)}
      />
    </>
  )
}
