'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { ColorTabs } from '@/components/ui/color-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { RegistryOverview } from './registry-overview'
import { getRegistryData, deleteRegistryEntry } from '@/app/(dashboard)/anyakonyv/actions'
import { REGISTRY_TABS, REGISTRY_TAB_LABELS, REGISTRY_BUTTON_CONFIG } from '@/lib/constants/registry'
import type { RegistryTab, RegistryEntry } from '@/lib/constants/registry'
import { BaptismDialog } from '@/components/modals/baptism-dialog'
import { MarriageDialog } from '@/components/modals/marriage-dialog'
import { BurialDialog } from '@/components/modals/burial-dialog'
import { MovementDialog } from '@/components/modals/movement-dialog'
import { ConfirmationDialog } from '@/components/modals/confirmation-dialog'
import { ModuleHero } from '@/components/shared/module-hero'
import { toast } from 'sonner'

interface RegistryTabsProps {
  congregationId: string
  congregationName: string
}

// Hash-routing: a sidebar `/anyakonyv#keresztseg` stb. URL-jeiből közvetlen tab-ugrás.
const VALID_TAB_HASHES = new Set<string>(REGISTRY_TABS as readonly string[])
const DEFAULT_TAB: RegistryTab = 'attekinto'

function getTabFromHash(hash: string): RegistryTab {
  const clean = hash.replace(/^#/, '')
  return VALID_TAB_HASHES.has(clean) ? (clean as RegistryTab) : DEFAULT_TAB
}

export function RegistryTabs({ congregationName }: RegistryTabsProps) {
  const [activeTab, setActiveTab] = useState<RegistryTab>(DEFAULT_TAB)
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

  // Hash-routing — sidebar almenüből (`/anyakonyv#keresztseg` stb.) tab-ugrás.
  // pushState monkey-patch: a Next.js Link `pushState`-tel navigál, ami nem
  // trigger-eli a hashchange-et — saját HashChangeEvent dispatch-szel pótoljuk.
  useEffect(() => {
    const apply = () => setActiveTab(getTabFromHash(window.location.hash))
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

  // (A handleTabChange az alábbi function declaration-ben van, ami a hash-t is frissíti)

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
          d.lelkeszneve || '', d.okirat || '', d.megjegyzes || '', d.tanuk || '',
          d.felekezet || '', d.hoka || '', d.igazolas || '',
        ].join(' ').toLowerCase()
        return fields.includes(q)
      })
    }

    if (sortCol) {
      result = [...result].sort((a, b) => {
        const va = String((a as Record<string, unknown>)[sortCol] || '')
        const vb = String((b as Record<string, unknown>)[sortCol] || '')
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
      })
    }

    return result
  }, [allData, filterYear, searchText, sortCol, sortAsc])

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

  function openEdit(d: RegistryEntry) {
    openModal(d)
  }

  function handleTabChange(tab: RegistryTab) {
    resetViewState()
    setLoading(tab !== 'attekinto')
    setActiveTab(tab)
    // Bookmarkolható URL: a hash-t is frissítjük (sidebar almenüvel együttműködik)
    if (typeof window !== 'undefined') {
      const newHash = tab === DEFAULT_TAB ? '' : `#${tab}`
      if (window.location.hash !== newHash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search + newHash)
      }
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Biztosan törli ezt a bejegyzést? A törlés végleges.')) return
    const result = await deleteRegistryEntry(activeTab, id)
    if (result.error) toast.error(result.error)
    else { toast.success('Bejegyzés törölve.'); refreshData(activeTab) }
  }

  function closeAndRefresh(open: boolean) {
    if (open) return
    setBaptismOpen(false); setConfirmationOpen(false); setMarriageOpen(false); setBurialOpen(false); setMovementOpen(false)
    setEditEntry(null)
    refreshData(activeTab)
  }

  // Táblázat oszlopok fülönként
  function renderTable() {
    if (filtered.length === 0) return <Card><CardContent className="py-8 text-center text-muted-foreground">Nincs bejegyzés.</CardContent></Card>

    const getName = (d: RegistryEntry) => d.szemely ? `${d.szemely.csaladnev} ${d.szemely.k_nev}` : '—'
    const getDate = (d: RegistryEntry) => (d.datum || d.mikor || d.hdatum || '')?.toString().split('T')[0] || '—'

    return (
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              {activeTab === 'keresztseg' && <><th className="p-2 text-left cursor-pointer" onClick={() => handleSort('okirat')}>Anyakönyvi szám</th><th className="p-2 text-left">Név</th><th className="p-2 text-left cursor-pointer" onClick={() => handleSort('datum')}>Dátum</th><th className="p-2 text-left hidden md:table-cell">Lelkész</th></>}
              {activeTab === 'konfirmalas' && <><th className="p-2 text-left cursor-pointer" onClick={() => handleSort('okirat')}>Anyakönyvi szám</th><th className="p-2 text-left">Név</th><th className="p-2 text-left cursor-pointer" onClick={() => handleSort('datum')}>Dátum</th><th className="p-2 text-left hidden md:table-cell">Lelkész</th></>}
              {activeTab === 'hazassag' && <><th className="p-2 text-left cursor-pointer" onClick={() => handleSort('hlevel')}>Anyakönyvi szám</th><th className="p-2 text-left">Vőlegény</th><th className="p-2 text-left">Menyasszony</th><th className="p-2 text-left cursor-pointer" onClick={() => handleSort('datum')}>Dátum</th></>}
              {activeTab === 'temetes' && <><th className="p-2 text-left">Név</th><th className="p-2 text-left">Halál</th><th className="p-2 text-left">Temetés</th><th className="p-2 text-left hidden md:table-cell">Ok</th></>}
              {['bekoltozott','elkoltozott','attert','kitert'].includes(activeTab) && <><th className="p-2 text-left">Név</th><th className="p-2 text-left">Dátum</th><th className="p-2 text-left hidden md:table-cell">Megjegyzés</th></>}
              <th className="p-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => (
              <tr key={d.id} className="border-b hover:bg-slate-50">
                {activeTab === 'keresztseg' && <><td className="p-2 text-xs font-mono text-violet-700">{d.okirat || '—'}</td><td className="p-2 font-medium">{getName(d)}</td><td className="p-2 text-muted-foreground">{getDate(d)}</td><td className="p-2 hidden md:table-cell text-muted-foreground">{d.lelkeszneve || '—'}</td></>}
                {activeTab === 'konfirmalas' && <><td className="p-2 text-xs font-mono text-violet-700">{(d.okirat as string | undefined) || '—'}</td><td className="p-2 font-medium">{getName(d)} {d.szemely?.ferfi ? '♂' : '♀'}</td><td className="p-2 text-muted-foreground">{getDate(d)}</td><td className="p-2 hidden md:table-cell text-muted-foreground">{d.lelkeszneve || '—'}</td></>}
                {activeTab === 'hazassag' && <><td className="p-2 text-xs font-mono text-violet-700">{(d.hlevel as string | undefined) || '—'}</td><td className="p-2 font-medium">{d.ferfi ? `${d.ferfi.csaladnev} ${d.ferfi.k_nev}` : '—'}</td><td className="p-2 font-medium">{d.no ? `${d.no.csaladnev} ${d.no.k_nev}` : '—'}</td><td className="p-2 text-muted-foreground">{getDate(d)}</td></>}
                {activeTab === 'temetes' && <><td className="p-2 font-medium">{getName(d)}</td><td className="p-2 text-muted-foreground">{d.hdatum?.toString().split('T')[0] || '—'}</td><td className="p-2 text-muted-foreground">{d.tdatum?.toString().split('T')[0] || '—'}</td><td className="p-2 hidden md:table-cell text-muted-foreground text-xs">{d.hoka || '—'}</td></>}
                {['bekoltozott','elkoltozott','attert','kitert'].includes(activeTab) && <><td className="p-2 font-medium">{getName(d)}</td><td className="p-2 text-muted-foreground">{getDate(d)}</td><td className="p-2 hidden md:table-cell text-muted-foreground text-xs truncate max-w-[200px]">{d.megjegyzes || '—'}</td></>}
                <td className="p-2 text-right flex gap-1 justify-end">
                  {activeTab !== 'konfirmalas' && (
                    <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-blue-500 hover:text-blue-700" onClick={() => openEdit(d)}>✏️</Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={() => handleDelete(d.id)}>✕</Button>
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
        title="Szentségi és életfordulós nyilvántartás"
        description="Keresztelések, konfirmációk, házasságkötések, temetések és mozgási bejegyzések egy rendezett, áttekinthető felületen."
        pills={[
          { label: congregationName, tone: 'neutral' },
          { label: `${filtered.length} látható bejegyzés`, tone: 'emerald' },
        ]}
      />

      <div className="mb-4 hidden">
        <h2 className="text-xl font-bold text-slate-800">Anyakönyv</h2>
        <p className="text-sm text-slate-400">Keresztelések, konfirmációk, esküvők és egyéb bejegyzések</p>
      </div>

      <Tabs value={activeTab} onValueChange={v => handleTabChange(v as RegistryTab)}>
        <ColorTabs
          tabs={REGISTRY_TABS.map(t => {
            const colors: Record<string, string> = { attekinto: 'blue', keresztseg: 'emerald', konfirmacio: 'violet', hazassag: 'pink', temetes: 'slate', bekoltozott: 'cyan', elkoltozott: 'orange', attert: 'amber', kitert: 'red' }
            return { value: t, label: REGISTRY_TAB_LABELS[t], color: colors[t] || 'blue' }
          })}
          active={activeTab}
          onChange={v => handleTabChange(v as RegistryTab)}
        />
        <TabsContent value="attekinto" className="mt-4">
          <RegistryOverview />
        </TabsContent>

        {REGISTRY_TABS.filter(t => t !== 'attekinto').map(tab => (
          <TabsContent key={tab} value={tab} className="mt-4 space-y-3">
            {/* Szűrő sáv + gomb */}
            <div className="flex flex-wrap items-center gap-3">
              <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Minden év</option>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <Input placeholder="Keresés..." value={searchText} onChange={e => setSearchText(e.target.value)} className="w-48" />
              <Badge variant="secondary" className="text-xs">{filtered.length}{filterYear || searchText ? ` / ${allData.length}` : ''} bejegyzés</Badge>
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

      {/* Modal-ok */}
      <BaptismDialog open={baptismOpen} onOpenChange={closeAndRefresh} congregationName={congregationName} editEntry={editEntry} />
      <ConfirmationDialog open={confirmationOpen} onOpenChange={closeAndRefresh} />
      <MarriageDialog open={marriageOpen} onOpenChange={closeAndRefresh} editEntry={editEntry} />
      <BurialDialog open={burialOpen} onOpenChange={closeAndRefresh} editEntry={editEntry} />
      <MovementDialog open={movementOpen} onOpenChange={closeAndRefresh} movementType={activeTab as 'bekoltozott' | 'elkoltozott' | 'attert' | 'kitert'} editEntry={editEntry} />
    </>
  )
}
