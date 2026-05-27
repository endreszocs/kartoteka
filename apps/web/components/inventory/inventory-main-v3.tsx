'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleHelp, Scale } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModuleHero } from '@/components/shared/module-hero'
import { ColorTabs } from '@/components/ui/color-tabs'
import { InventoryAmortizationDialog } from '@/components/inventory/inventory-amortization-dialog'
import { InventoryGuideTab } from '@/components/inventory/inventory-guide-tab'
import { MaterialWarehouseTab } from '@/components/inventory/material-warehouse-tab'
import {
  getAnyagraktarStats,
  type AnyagraktarStats,
} from '@/app/(dashboard)/leltar/anyagraktar-actions'
import { InventoryPrintDialog } from '@/components/inventory/inventory-print-dialog-v2'
import {
  deleteInventoryItem,
  finalizeLeltar,
  getInventoryItems,
  getLeltarFinalizationStatus,
  requestLeltarUnlock,
  saveInventoryItem,
} from '@/app/(dashboard)/leltar/actions'
import { submitDocument } from '@/app/(dashboard)/dashboard-egyhazmegye/document-actions'
import {
  INVENTORY_AMORTIZATION_CATALOG,
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  getInventoryAmortizationCatalogEntry,
  getInventoryCategoryLabel,
  type InventoryCategory,
  type InventoryItem,
} from '@/lib/constants/inventory.next'
import { calculateInventoryCurrentValue } from '@/lib/inventory/reporting'
import { formatCurrency } from '@/lib/constants/finance'
import { toast } from 'sonner'

interface InventoryMainProps {
  congregationName?: string
  /** 2026-05-25: ha true, "Rendszergazdai importáló" tab a sor végén (red-prominent). */
  showAdminImport?: boolean
  /** A Rendszergazdai importáló tab tartalma. */
  adminImportContent?: React.ReactNode
}

type LeltarTab = 'nyilvantartas' | 'anyagraktar' | 'sugo'
type ActiveView = 'tab' | 'admin-import'

export function InventoryMain({ congregationName, showAdminImport = false, adminImportContent }: InventoryMainProps) {
  const [activeTab, setActiveTab] = useState<LeltarTab>('nyilvantartas')
  const [activeView, setActiveView] = useState<ActiveView>('tab')
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [amortizationDialogOpen, setAmortizationDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [amortizationItem, setAmortizationItem] = useState<InventoryItem | null>(null)
  const [isFinalized, setIsFinalized] = useState(false)
  const [unlockRequested, setUnlockRequested] = useState(false)
  const [anyagraktarStats, setAnyagraktarStats] = useState<AnyagraktarStats | null>(null)

  const [fMegnevezes, setFMegnevezes] = useState('')
  const [fKategoria, setFKategoria] = useState<InventoryCategory>('alapeszkoz')
  const [fErtek, setFErtek] = useState<number>(0)
  const [fDatum, setFDatum] = useState('')
  const [fHelyszin, setFHelyszin] = useState('')
  const [fFelelos, setFFelelos] = useState('')
  const [fMegj, setFMegj] = useState('')
  const [fMennyiseg, setFMennyiseg] = useState<number>(1)
  const [fMertekegyseg, setFMertekegyseg] = useState('db')
  const [fBizonylat, setFBizonylat] = useState('')
  const [fKatalogusKod, setFKatalogusKod] = useState('')
  const [fHasznalatiIdo, setFHasznalatiIdo] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [data, status, araktar] = await Promise.all([
      getInventoryItems(),
      getLeltarFinalizationStatus(),
      getAnyagraktarStats(),
    ])
    setItems(data)
    setIsFinalized(status.finalized)
    setUnlockRequested(status.unlockRequested)
    if (araktar.data) setAnyagraktarStats(araktar.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [load])

  const activeItems = useMemo(() => items.filter(item => !item.deleted), [items])

  const locationOptions = useMemo(
    () => [...new Set(activeItems.map(item => item.helyszin).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'hu')),
    [activeItems],
  )

  const filtered = useMemo(() => {
    const normalizedQuery = searchQuery
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()

    const startDate = periodStart ? new Date(`${periodStart}T00:00:00`) : null
    const endDate = periodEnd ? new Date(`${periodEnd}T23:59:59`) : null

    return activeItems.filter(item => {
      const categoryMatches = !categoryFilter || item.kategoria_key === categoryFilter
      const locationMatches = !locationFilter || (item.helyszin || '') === locationFilter
      const itemDate = item.beszerzes_datuma
        ? new Date(item.beszerzes_datuma.includes('T') ? item.beszerzes_datuma : `${item.beszerzes_datuma}T00:00:00`)
        : null
      const periodMatches =
        (!startDate || (itemDate && itemDate.getTime() >= startDate.getTime())) &&
        (!endDate || (itemDate && itemDate.getTime() <= endDate.getTime()))
      const queryMatches =
        !normalizedQuery ||
        `${item.megnevezes} ${item.leltari_szam || ''} ${item.helyszin || ''} ${item.felelos_nev || ''} ${item.beszerzes_bizonylat || ''}`
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .includes(normalizedQuery)

      return categoryMatches && locationMatches && periodMatches && queryMatches
    })
  }, [activeItems, categoryFilter, locationFilter, periodEnd, periodStart, searchQuery])

  const totalBookValue = useMemo(
    () => filtered.reduce((sum, item) => sum + (Number(item.beszerzes_erteke || 0) || 0) * (Number(item.mennyiseg || 1) || 1), 0),
    [filtered],
  )

  const totalCurrentValue = useMemo(
    () => filtered.reduce((sum, item) => sum + calculateInventoryCurrentValue(item), 0),
    [filtered],
  )

  const deletedCount = useMemo(() => items.filter(item => item.deleted).length, [items])
  const selectedCatalogEntry = useMemo(
    () => getInventoryAmortizationCatalogEntry(fKatalogusKod || null),
    [fKatalogusKod],
  )

  async function handleFinalize() {
    if (!window.confirm('A vagyonleltári jelentés véglegesítése után új jelentést nem lehet lezárni, amíg az egyházmegye feloldást nem ad. A leltári tételek ettől még tovább szerkeszthetők. Folytatja?')) {
      return
    }

    const result = await finalizeLeltar()
    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success('A vagyonleltári jelentés véglegesítve lett.')
    await load()
  }

  async function handleUnlockRequest() {
    const reason = window.prompt('Miért kér feloldást a leltárhoz?', '')
    if (reason === null) return

    const result = await requestLeltarUnlock(reason)
    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success('Feloldási kérelem elküldve.')
    await load()
  }

  function openDialog(item?: InventoryItem) {
    if (item) {
      setEditItem(item)
      setFMegnevezes(item.megnevezes)
      setFKategoria(item.kategoria_key || 'alapeszkoz')
      setFErtek(item.beszerzes_erteke)
      setFDatum(item.beszerzes_datuma?.split('T')[0] || '')
      setFHelyszin(item.helyszin || '')
      setFFelelos(item.felelos_nev || '')
      setFMegj(item.megjegyzes || '')
      setFMennyiseg(item.mennyiseg || 1)
      setFMertekegyseg(item.mertekegyseg || 'db')
      setFBizonylat(item.beszerzes_bizonylat || '')
      setFKatalogusKod(item.katalogus_kod || '')
      setFHasznalatiIdo(item.hasznalati_ido || '')
    } else {
      setEditItem(null)
      setFMegnevezes('')
      setFKategoria('alapeszkoz')
      setFErtek(0)
      setFDatum('')
      setFHelyszin('')
      setFFelelos('')
      setFMegj('')
      setFMennyiseg(1)
      setFMertekegyseg('db')
      setFBizonylat('')
      setFKatalogusKod('')
      setFHasznalatiIdo('')
    }

    setDialogOpen(true)
  }

  function openAmortizationDialog(item: InventoryItem) {
    setAmortizationItem(item)
    setAmortizationDialogOpen(true)
  }

  async function handleSave() {
    if (!fMegnevezes.trim()) {
      toast.error('A megnevezés kötelező.')
      return
    }

    if (fErtek <= 0) {
      toast.error('Az érték pozitív szám kell legyen.')
      return
    }

    setSaving(true)
    const result = await saveInventoryItem({
      id: editItem?.id,
      megnevezes: fMegnevezes.trim(),
      kategoria: fKategoria,
      beszerzes_erteke: fErtek,
      beszerzes_datuma: fDatum || null,
      helyszin: fHelyszin || null,
      felelos_nev: fFelelos || null,
      megjegyzes: fMegj || null,
      mennyiseg: fMennyiseg,
      mertekegyseg: fMertekegyseg || 'db',
      beszerzes_bizonylat: fBizonylat || null,
      katalogus_kod: fKategoria === 'alapeszkoz' ? fKatalogusKod || null : null,
      hasznalati_ido: fKategoria === 'alapeszkoz' && fHasznalatiIdo !== '' ? Number(fHasznalatiIdo) : null,
    })

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(editItem ? 'A leltári tétel frissült.' : 'A leltári tétel rögzítve lett.')
      setDialogOpen(false)
      await load()
    }

    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Biztosan törli ezt a leltári tételt?')) return

    const result = await deleteInventoryItem(id)
    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success('A leltári tétel törölve lett.')
    await load()
  }

  return (
    <>
      <ModuleHero
        eyebrow="Leltár"
        title="Gyülekezeti vagyonleltár"
        description="A hivatalos leltárprogram logikájához igazított, kereshető, helyszín és időszak szerint szűrhető, többféle hivatalos nyomtatványt kezelő felület."
        pills={[
          congregationName ? { label: congregationName, tone: 'neutral' } : undefined,
          { label: `${filtered.length} aktív tétel`, tone: 'emerald' },
          { label: `${deletedCount} törölt tétel`, tone: 'amber' },
          { label: isFinalized ? 'Vagyonleltári jelentés véglegesítve' : 'Jelentés szerkeszthető', tone: isFinalized ? 'amber' : 'teal' },
        ].filter(Boolean) as { label: string; tone?: 'neutral' | 'emerald' | 'amber' | 'teal' }[]}
      />

      <ColorTabs
        tabs={[
          { value: 'nyilvantartas', label: 'Leltári nyilvántartás', color: 'teal', count: filtered.length },
          { value: 'anyagraktar', label: 'Anyagraktár', color: 'emerald' },
          { value: 'sugo', label: 'Súgó', color: 'teal' },
          // 2026-05-25: Rendszergazdai importáló a sor végén, red-prominent háttérrel
          ...(showAdminImport ? [
            { value: 'admin-import', label: 'Rendszergazdai importáló', color: 'red-prominent' },
          ] : []),
        ]}
        active={activeView === 'admin-import' ? 'admin-import' : activeTab}
        onChange={value => {
          if (value === 'admin-import') {
            setActiveView('admin-import')
          } else {
            setActiveView('tab')
            setActiveTab(value as LeltarTab)
          }
        }}
      />

      {activeView === 'admin-import' && showAdminImport ? (
        adminImportContent
      ) : activeTab === 'sugo' ? (
        <InventoryGuideTab />
      ) : activeTab === 'anyagraktar' ? (
        <MaterialWarehouseTab congregationName={congregationName || ''} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Látható tételek" value={`${filtered.length} db`} />
            <StatCard label="Könyv szerinti érték" value={`${formatCurrency(totalBookValue)} RON`} accent="text-slate-800" />
            <StatCard label="Leltári érték" value={`${formatCurrency(totalCurrentValue)} RON`} accent="text-emerald-600" />
            <StatCard label="Helyszínek" value={`${locationOptions.length} db`} />
          </div>

          {/* Vagyonleltári jelentés összesítő — tartalmazza az Anyagraktárt is */}
          {anyagraktarStats && (
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/50 to-yellow-50/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm">
                    <Scale className="size-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Vagyonleltári jelentés összesítő
                    </p>
                    <p className="text-sm text-slate-700">
                      Leltári tárgyak: <strong>{formatCurrency(totalCurrentValue)} RON</strong>
                      {' · '}
                      Anyagraktár: <strong>{formatCurrency(anyagraktarStats.osszes_keszlet_ertek)} RON</strong>
                      {' · '}
                      <span className="text-amber-900 font-bold">
                        Mindösszesen: {formatCurrency(totalCurrentValue + anyagraktarStats.osszes_keszlet_ertek)} RON
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('anyagraktar')}
                  className="text-xs font-medium text-amber-700 underline hover:text-amber-900"
                >
                  Anyagraktár megnyitása →
                </button>
              </div>
            </div>
          )}

          <div className="card-raised flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[210px_210px_180px_180px_minmax(240px,1fr)]">
                <label className="text-sm font-medium text-slate-700">
                  Kategória
                  <select
                    value={categoryFilter}
                    onChange={event => setCategoryFilter(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Minden kategória</option>
                    {INVENTORY_CATEGORIES.map(category => (
                      <option key={category} value={category}>
                        {INVENTORY_CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Helyszín / felelős
                  <select
                    value={locationFilter}
                    onChange={event => setLocationFilter(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Minden helyszín</option>
                    {locationOptions.map(location => (
                      <option key={location} value={location || ''}>
                        {location}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Időszak kezdete
                  <Input type="date" value={periodStart} onChange={event => setPeriodStart(event.target.value)} className="mt-1" />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Időszak vége
                  <Input type="date" value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} className="mt-1" />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Keresés
                  <Input
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder="Megnevezés, leltári szám, helyszín, bizonylat..."
                    className="mt-1"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2 xl:justify-end">
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setPrintDialogOpen(true)}>
                  Nyomtatási központ
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => openDialog()}>
                  Új tétel
                </Button>
                {!isFinalized ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl border-green-300 text-green-700"
                    onClick={() => void handleFinalize()}
                  >
                    Jelentés véglegesítése
                  </Button>
                ) : unlockRequested ? (
                  <Button size="sm" variant="outline" disabled className="rounded-xl">
                    Jelentés-feloldási kérelem elbírálás alatt
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl border-amber-300 text-amber-700"
                    onClick={() => void handleUnlockRequest()}
                  >
                    Jelentés feloldásának kérése
                  </Button>
                )}
                {isFinalized && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    onClick={async () => {
                      if (!confirm('Beküldöd a vagyonleltári jelentést az egyházmegyének?')) return
                      const year = new Date().getFullYear() - 1
                      const snapshot = { itemCount: items.length, year }
                      const result = await submitDocument('vagyonleltar', year, snapshot)
                      if ('error' in result && result.error) toast.error(result.error)
                      else toast.success('Vagyonleltári jelentés beküldve az egyházmegyének!')
                    }}
                  >
                    Beküldés egyházmegyének
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Badge variant="secondary">{filtered.length} aktív tétel</Badge>
              <Badge variant="secondary">Hivatalos nyomtatványok: 5 db</Badge>
              <Badge variant="secondary">Szűrés: kategória + helyszín + időszak + keresés</Badge>
              {periodStart || periodEnd ? <Badge variant="secondary">Időszak: {periodStart || '...'} - {periodEnd || '...'}</Badge> : null}
            </div>
          </div>

          {loading ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                A leltári tételek betöltése folyamatban...
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                A megadott szűrés mellett nincs megjeleníthető leltári tétel.
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50/90">
                  <tr>
                    <th className="p-3 text-left">Leltári sz.</th>
                    <th className="p-3 text-left">Megnevezés</th>
                    <th className="hidden p-3 text-left lg:table-cell">Kategória</th>
                    <th className="hidden p-3 text-left xl:table-cell">Helyszín / felelős</th>
                    <th className="p-3 text-right">Könyv szerinti érték</th>
                    <th className="p-3 text-right">Leltári érték</th>
                    <th className="w-28 p-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id} className="border-b border-slate-100 transition hover:bg-slate-50">
                      <td className="p-3 align-top font-mono text-xs text-slate-500">
                        <div>{item.leltari_szam || '—'}</div>
                        {item.regi_leltari_szam ? <div className="mt-1 text-[11px] text-slate-400">Régi: {item.regi_leltari_szam}</div> : null}
                      </td>
                      <td className="p-3 align-top">
                        <div className="font-semibold text-slate-800">{item.megnevezes}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {item.mennyiseg} {item.mertekegyseg || 'db'}
                          {item.beszerzes_datuma ? ` · ${item.beszerzes_datuma}` : ''}
                        </div>
                      </td>
                      <td className="hidden p-3 align-top lg:table-cell">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                            {getInventoryCategoryLabel(item.kategoria)}
                          </Badge>
                          {item.kategoria_key === 'alapeszkoz' ? (
                            <button
                              type="button"
                              onClick={() => openAmortizationDialog(item)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-teal-200 bg-teal-50 text-teal-700 transition hover:bg-teal-100"
                              title="Amortizációs információk"
                              aria-label="Amortizációs információk"
                            >
                              <CircleHelp className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="hidden p-3 align-top xl:table-cell">
                        <div className="text-sm text-slate-700">{item.helyszin || '—'}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.felelos_nev || 'Nincs megadva'}</div>
                      </td>
                      <td className="p-3 align-top text-right font-semibold text-slate-700">
                        {formatCurrency((Number(item.beszerzes_erteke || 0) || 0) * (Number(item.mennyiseg || 1) || 1))} RON
                      </td>
                      <td className="p-3 align-top text-right font-semibold text-emerald-700">
                        {formatCurrency(calculateInventoryCurrentValue(item))} RON
                      </td>
                      <td className="p-3 align-top">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-xs text-blue-600" onClick={() => openDialog(item)}>
                            Szerk.
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-lg px-2 text-xs text-red-500"
                            onClick={() => void handleDelete(item.id)}
                          >
                            Törlés
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <InventoryPrintDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        items={items}
        congregationName={congregationName}
        visibleItemCount={filtered.length}
        filters={{
          categoryKey: categoryFilter ? (categoryFilter as InventoryCategory) : null,
          categoryLabel: categoryFilter ? INVENTORY_CATEGORY_LABELS[categoryFilter as InventoryCategory] : 'Minden kategória',
          locationFilter: locationFilter || null,
          query: searchQuery || null,
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
        }}
      />

      <InventoryAmortizationDialog
        item={amortizationItem}
        open={amortizationDialogOpen}
        onOpenChange={setAmortizationDialogOpen}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Leltári tétel szerkesztése' : 'Új leltári tétel'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Megnevezés *</Label>
                <Input value={fMegnevezes} onChange={event => setFMegnevezes(event.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Kategória *</Label>
                <select
                  value={fKategoria}
                  onChange={event => {
                    const nextCategory = event.target.value as InventoryCategory
                    setFKategoria(nextCategory)
                    if (nextCategory !== 'alapeszkoz') {
                      setFKatalogusKod('')
                      setFHasznalatiIdo('')
                    }
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {INVENTORY_CATEGORIES.map(category => (
                    <option key={category} value={category}>
                      {INVENTORY_CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>Beszerzési érték (RON) *</Label>
                <Input type="number" min={0.01} step={0.01} value={fErtek || ''} onChange={event => setFErtek(Number(event.target.value))} />
              </div>

              <div className="space-y-1.5">
                <Label>Mennyiség</Label>
                <Input type="number" min={1} step={1} value={fMennyiseg || 1} onChange={event => setFMennyiseg(Number(event.target.value) || 1)} />
              </div>

              <div className="space-y-1.5">
                <Label>Mértékegység</Label>
                <Input value={fMertekegyseg} onChange={event => setFMertekegyseg(event.target.value)} placeholder="db" />
              </div>

              <div className="space-y-1.5">
                <Label>Beszerzési dátum</Label>
                <Input type="date" value={fDatum} onChange={event => setFDatum(event.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Beszerzési irat száma</Label>
                <Input value={fBizonylat} onChange={event => setFBizonylat(event.target.value)} placeholder="Számla / jegyzőkönyv / határozat" />
              </div>

              {fKategoria === 'alapeszkoz' ? (
                <>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Amortizációs katalóguskód</Label>
                    <select
                      value={fKatalogusKod}
                      onChange={event => {
                        const nextCode = event.target.value
                        setFKatalogusKod(nextCode)
                        const entry = getInventoryAmortizationCatalogEntry(nextCode)
                        if (entry) setFHasznalatiIdo(entry.defEv)
                      }}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Kézi beállítás / nincs kiválasztva</option>
                      {INVENTORY_AMORTIZATION_CATALOG.map(entry => (
                        <option key={entry.kod} value={entry.kod}>
                          {entry.kod} - {entry.nev} ({entry.minEv}-{entry.maxEv} év)
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500">
                      Az alapeszközöknél a rendszer a hivatalos katalóguskód és a használati idő alapján számolja az amortizációt.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Használati idő (év)</Label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={fHasznalatiIdo}
                      onChange={event => setFHasznalatiIdo(event.target.value ? Number(event.target.value) : '')}
                      placeholder="pl. 5"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Amortizációs összefoglaló</Label>
                    <div className="rounded-2xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-sm text-slate-700">
                      {selectedCatalogEntry ? (
                        <>
                          <div className="font-semibold text-slate-900">{selectedCatalogEntry.nev}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            Javasolt tartomány: {selectedCatalogEntry.minEv}-{selectedCatalogEntry.maxEv} év · Alapértelmezett: {selectedCatalogEntry.defEv} év
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-slate-500">
                          Ha nincs katalóguskód kiválasztva, a rendszer a kézzel megadott használati idővel számol.
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : null}

              <div className="space-y-1.5">
                <Label>Helyszín</Label>
                <Input value={fHelyszin} onChange={event => setFHelyszin(event.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Felelős személy</Label>
                <Input value={fFelelos} onChange={event => setFFelelos(event.target.value)} />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Megjegyzés</Label>
                <Input value={fMegj} onChange={event => setFMegj(event.target.value)} />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Mégse
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Mentés...' : 'Mentés'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function StatCard({
  label,
  value,
  accent = 'text-slate-800',
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="card-raised p-4 text-center">
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{label}</p>
    </div>
  )
}
