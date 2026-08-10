'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { MapPin, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyFirstRecord } from '@/components/ui/empty-first-record'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModuleHero } from '@/components/shared/module-hero'
import { ColorTabs } from '@/components/ui/color-tabs'
import { SirhelyekHelp } from './sirhelyek-help'
import { getCemeteries, saveCemetery, deleteCemetery, getPlots, savePlot, deletePlot, saveRental, saveDeceased } from '@/app/(dashboard)/sirhelyek/actions'
import { PLOT_STATUSES, PLOT_STATUS_LABELS, PLOT_STATUS_COLORS } from '@/lib/constants/cemetery'
import type { Cemetery, Deceased, Plot, PlotStatus, Rental } from '@/lib/constants/cemetery'
import { toast } from 'sonner'

interface CemeteryMainProps {
  congregationName?: string
  /** 2026-05-25: ha true, "Rendszergazdai importáló" tab (red-prominent). */
  showAdminImport?: boolean
  /** A Rendszergazdai importáló tab tartalma. */
  adminImportContent?: React.ReactNode
}

type CemeteryTab = 'munkafelulet' | 'help' | 'admin-import'

export function CemeteryMain({ congregationName, showAdminImport = false, adminImportContent }: CemeteryMainProps) {
  const [activeTab, setActiveTab] = useState<CemeteryTab>('munkafelulet')
  const [cemeteries, setCemeteries] = useState<Cemetery[]>([])
  const [plots, setPlots] = useState<Plot[]>([])
  const [rentalsMap, setRentalsMap] = useState<Record<number, Rental[]>>({})
  const [deceasedMap, setDeceasedMap] = useState<Record<number, Deceased[]>>({})
  const [loading, setLoading] = useState(true)
  const [cemeteryFilter, setCemeteryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')

  const [cemDialogOpen, setCemDialogOpen] = useState(false)
  const [plotDialogOpen, setPlotDialogOpen] = useState(false)
  const [rentalDialogOpen, setRentalDialogOpen] = useState(false)
  const [deceasedDialogOpen, setDeceasedDialogOpen] = useState(false)
  const [editCemetery, setEditCemetery] = useState<Cemetery | null>(null)
  const [editPlot, setEditPlot] = useState<Plot | null>(null)
  const [currentPlotId, setCurrentPlotId] = useState<number | null>(null)

  const [fCemNev, setFCemNev] = useState('')
  const [fCemCim, setFCemCim] = useState('')
  const [fPlotTemeto, setFPlotTemeto] = useState<number>(0)
  const [fPlotParcella, setFPlotParcella] = useState('')
  const [fPlotSor, setFPlotSor] = useState<number>(0)
  const [fPlotSzam, setFPlotSzam] = useState('')
  const [fPlotAllapot, setFPlotAllapot] = useState<PlotStatus>('szabad')
  const [fRentalBerlo, setFRentalBerlo] = useState('')
  const [fRentalMegvaltas, setFRentalMegvaltas] = useState('')
  const [fRentalLejarata, setFRentalLejarata] = useState('')
  const [fRentalOsszeg, setFRentalOsszeg] = useState<number>(0)
  const [fDecNev, setFDecNev] = useState('')
  const [fDecSzDatum, setFDecSzDatum] = useState('')
  const [fDecHdatum, setFDecHdatum] = useState('')
  const [fDecTdatum, setFDecTdatum] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [cemsData, plotsData] = await Promise.all([getCemeteries(), getPlots()])
    setCemeteries(cemsData)
    setPlots(plotsData.plots)
    setRentalsMap(plotsData.rentals)
    setDeceasedMap(plotsData.deceased)
    setLoading(false)
  }, [])

  const refreshData = useCallback(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        void load()
      }
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const filtered = useMemo(() => {
    let result = plots
    if (cemeteryFilter) result = result.filter((plot) => plot.temetoid === Number(cemeteryFilter))
    if (statusFilter) result = result.filter((plot) => plot.allapot === statusFilter)
    return result
  }, [plots, cemeteryFilter, statusFilter])

  const stats = useMemo(() => ({
    total: filtered.length,
    szabad: filtered.filter((plot) => plot.allapot === 'szabad').length,
    foglalt: filtered.filter((plot) => plot.allapot === 'foglalt').length,
    lejart: filtered.filter((plot) => plot.allapot === 'lejart').length,
  }), [filtered])

  function getCemName(id: number) {
    return cemeteries.find((cemetery) => cemetery.id === id)?.nev || '—'
  }

  function openCemDialog(cemetery?: Cemetery) {
    setEditCemetery(cemetery || null)
    setFCemNev(cemetery?.nev || '')
    setFCemCim(cemetery?.cim || '')
    setCemDialogOpen(true)
  }

  async function handleSaveCem() {
    if (!fCemNev) {
      toast.error('A temető neve kötelező!')
      return
    }
    setSaving(true)
    const result = await saveCemetery({ id: editCemetery?.id, nev: fCemNev, cim: fCemCim || null })
    if (result.error) toast.error(result.error)
    else {
      toast.success('Temető mentve!')
      setCemDialogOpen(false)
      refreshData()
    }
    setSaving(false)
  }

  // 2026-08-11 (P1 #22): eddig a szerver-akció eredményét meg sem néztük, így
  // sikertelen törlésnél is zöld „Temető törölve." toast jelent meg, miközben a
  // sor a listán maradt — a lelkész azt hitte, csak a képernyő nem frissült.
  //
  // 2026-08-11 (P2 #24): a megerősítő kérdés csak annyi volt, hogy „Biztosan
  // törli?" — nem mondta meg, MELYIK temetőt, és azt sem, hogy a benne lévő
  // sírhelyek is eltűnnek a listáról. Pedig eltűnnek: a `getPlots` a nem törölt
  // temetők ID-jai szerint szűr (sirhelyek/actions.ts:110-116), tehát a temető
  // törlésével az összes sírhelye, bérlete és elhunyt-bejegyzése kikerül a
  // nyilvántartásból. Ezt most kimondjuk, darabszámmal együtt.
  async function handleDeleteCem(cemetery: Cemetery) {
    const plotCount = plots.filter((plot) => plot.temetoid === cemetery.id).length
    const question = plotCount > 0
      ? `Biztosan törli a(z) „${cemetery.nev}" temetőt?\n\nA benne nyilvántartott ${plotCount} sírhely (a hozzájuk tartozó bérletekkel és elhunytakkal együtt) ezzel eltűnik a listáról.`
      : `Biztosan törli a(z) „${cemetery.nev}" temetőt?`
    if (!confirm(question)) return
    const result = await deleteCemetery(cemetery.id)
    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }
    toast.success(`A(z) „${cemetery.nev}" temető törölve.`)
    refreshData()
  }

  // 2026-08-11 (P2 #25): temető nélkül ez a dialógus zsákutca volt — a „Temető"
  // select NULLA opcióval renderelődött (se placeholder, se magyarázat), a
  // lelkész kitöltötte a parcellát/sort/számot, mentett, és ezt kapta:
  // „A megadott temető nem található vagy nem hozzáférhető."
  // (sirhelyek/actions.ts:180) — ami jogosultsági gondot sugall, holott csak
  // temetőt kellett volna előbb létrehoznia. Most minden belépési pontról
  // (üres-állapot CTA, „+ Sírhely" gomb) a temető-dialógus nyílik meg.
  function openPlotDialog(plot?: Plot) {
    if (!plot && cemeteries.length === 0) {
      toast.error('Előbb hozz létre egy temetőt — a sírhely mindig egy temetőhöz tartozik.')
      openCemDialog()
      return
    }
    setEditPlot(plot || null)
    setFPlotTemeto(plot?.temetoid || cemeteries[0]?.id || 0)
    setFPlotParcella(plot?.parcella || '')
    setFPlotSor(plot?.sor ?? 0)
    setFPlotSzam(plot?.szam || '')
    setFPlotAllapot((plot?.allapot as PlotStatus) || 'szabad')
    setPlotDialogOpen(true)
  }

  async function handleSavePlot() {
    // 2026-08-11 (P2 #25): fail-closed a szerver félrevezető jogosultsági
    // hibaüzenete ELŐTT — így a lelkész azt olvassa, amit tennie kell.
    if (!fPlotTemeto) {
      toast.error('Válassz temetőt — ha még nincs egy sem, előbb hozz létre egyet a „+ Temető" gombbal.')
      return
    }
    if (!fPlotParcella || !fPlotSzam || fPlotSor < 0) {
      toast.error('A parcella, sor és szám mind kötelezőek.')
      return
    }
    setSaving(true)
    const result = await savePlot({
      id: editPlot?.id,
      temetoid: fPlotTemeto,
      parcella: fPlotParcella,
      sor: fPlotSor,
      szam: fPlotSzam,
      allapot: fPlotAllapot,
    })
    if (result.error) toast.error(result.error)
    else {
      toast.success('Sírhely mentve!')
      setPlotDialogOpen(false)
      refreshData()
    }
    setSaving(false)
  }

  // 2026-08-11 (P1 #22): lásd a handleDeleteCem feletti megjegyzést.
  // 2026-08-11 (P2 #24): a kérdés itt sem mondta meg, MELYIK sírhelyről van szó.
  async function handleDeletePlot(plot: Plot) {
    const label = [plot.parcella, plot.sor, plot.szam].filter((v) => v !== null && v !== undefined && v !== '').join('/') || '—'
    if (!confirm(`Biztosan törli a(z) ${getCemName(plot.temetoid)} temető ${label} jelű sírhelyét?\n\nA hozzá rögzített bérletek és elhunytak is eltűnnek a listáról.`)) return
    const result = await deletePlot(plot.id)
    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Sírhely törölve.')
    refreshData()
  }

  function openRentalDialog(plotId: number) {
    setCurrentPlotId(plotId)
    setFRentalBerlo('')
    setFRentalOsszeg(0)
    const today = new Date().toISOString().slice(0, 10)
    setFRentalMegvaltas(today)
    const end = new Date()
    end.setFullYear(end.getFullYear() + 25)
    setFRentalLejarata(end.toISOString().slice(0, 10))
    setRentalDialogOpen(true)
  }

  async function handleSaveRental() {
    if (!fRentalBerlo || !currentPlotId) {
      toast.error('A bérlő neve kötelező!')
      return
    }
    setSaving(true)
    const result = await saveRental({
      sirhelyid: currentPlotId,
      berlo: fRentalBerlo,
      megvaltas: fRentalMegvaltas,
      lejarata: fRentalLejarata || null,
      osszeg: fRentalOsszeg || null,
    })
    if (result.error) toast.error(result.error)
    else {
      toast.success('Bérlet mentve!')
      setRentalDialogOpen(false)
      refreshData()
    }
    setSaving(false)
  }

  function openDeceasedDialog(plotId: number) {
    setCurrentPlotId(plotId)
    setFDecNev('')
    setFDecSzDatum('')
    setFDecHdatum('')
    setFDecTdatum('')
    setDeceasedDialogOpen(true)
  }

  async function handleSaveDeceased() {
    if (!fDecNev || !currentPlotId) {
      toast.error('A név kötelező!')
      return
    }
    setSaving(true)
    const result = await saveDeceased({
      sirhelyid: currentPlotId,
      nev: fDecNev,
      sz_datum: fDecSzDatum || null,
      hdatum: fDecHdatum || null,
      tdatum: fDecTdatum || null,
    })
    if (result.error) toast.error(result.error)
    else {
      toast.success('Elhunyt rögzítve!')
      setDeceasedDialogOpen(false)
      refreshData()
    }
    setSaving(false)
  }

  return (
    <>
      <ModuleHero
        eyebrow="Sírhelyek"
        title="Temetők és sírhelyek nyilvántartása"
        description="Temetők, parcellák, sírhelyállapotok, bérletek és elhunytak kezelése egy egységes, átlátható felületen."
        pills={[
          congregationName ? { label: congregationName, tone: 'neutral' } : undefined,
          { label: `${filtered.length} látható sírhely`, tone: 'emerald' },
          { label: `${cemeteries.length} temető`, tone: 'sky' },
        ].filter(Boolean) as { label: string; tone?: 'neutral' | 'emerald' | 'sky' }[]}
      />

      {/* 2026-05-25: ColorTabs Hero alatt (Tagnyilvántartás minta) */}
      <ColorTabs
        tabs={[
          { value: 'munkafelulet', label: 'Sírhelyek munkafelület', color: 'blue' },
          { value: 'help', label: 'Súgó', color: 'teal' },
          ...(showAdminImport ? [
            { value: 'admin-import', label: 'Rendszergazdai importáló', color: 'red-prominent' },
          ] : []),
        ]}
        active={activeTab}
        onChange={(v) => setActiveTab(v as CemeteryTab)}
      />

      {activeTab === 'help' ? <SirhelyekHelp /> : activeTab === 'admin-import' && showAdminImport ? adminImportContent : (<>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Összesen" value={String(stats.total)} />
        <StatCard label="Szabad" value={String(stats.szabad)} accent="text-emerald-600" />
        <StatCard label="Foglalt" value={String(stats.foglalt)} accent="text-blue-600" />
        <StatCard label="Lejárt" value={String(stats.lejart)} accent="text-red-500" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={cemeteryFilter} onChange={(event) => setCemeteryFilter(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">Minden temető</option>
          {cemeteries.map((cemetery) => (
            <option key={cemetery.id} value={cemetery.id}>{cemetery.nev}</option>
          ))}
        </select>

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">Minden állapot</option>
          {PLOT_STATUSES.map((status) => (
            <option key={status} value={status}>{PLOT_STATUS_LABELS[status]}</option>
          ))}
        </select>

        <div className="flex gap-1">
          <Button size="sm" variant={viewMode === 'table' ? 'default' : 'outline'} onClick={() => setViewMode('table')}>Táblázat</Button>
          <Button size="sm" variant={viewMode === 'cards' ? 'default' : 'outline'} onClick={() => setViewMode('cards')}>Kártyák</Button>
        </div>

        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => openCemDialog()}>+ Temető</Button>
          <Button size="sm" onClick={() => openPlotDialog()}>+ Sírhely</Button>
        </div>
      </div>

      {/* 2026-08-11 (P2 #24): a temető-chipek eddig `Badge`-ek voltak `onClick`-kel
          — se `role`, se `tabIndex`, tehát billentyűzettel és képernyőolvasóval a
          temetők EGYÁLTALÁN nem voltak szerkeszthetők. A beágyazott törlő gomb
          szövege maga a „×" karakter volt: `aria-label` nélkül (a felolvasó csak
          annyit mondott: „szorzás"), `type="button"` nélkül, és a `text-xs`
          méretből adódóan ~12×16px tapintható felülettel — közvetlenül a
          szerkesztés-kattintózóna mellett. Telefonon egy elcsúszott koppintás a
          TELJES temetőt törölte. Mostantól két külön, valódi gomb: a szerkesztés
          `min-h-11`, a törlés `size-11` (a projekt saját mércéje —
          `muhely/project/task-list.tsx:275-297`), mindkettő beszédes
          `aria-label`-lel. */}
      {cemeteries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {cemeteries.map((cemetery) => (
            <div
              key={cemetery.id}
              className="inline-flex items-center gap-0.5 rounded-full border border-input bg-background pl-1 pr-0.5"
            >
              <button
                type="button"
                onClick={() => openCemDialog(cemetery)}
                aria-label={`${cemetery.nev} temető szerkesztése`}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Pencil className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span>{cemetery.nev}{cemetery.cim ? ` (${cemetery.cim})` : ''}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteCem(cemetery)}
                aria-label={`${cemetery.nev} temető törlése`}
                title={`${cemetery.nev} törlése`}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Betöltés...</div>
      ) : filtered.length === 0 ? (
        /* 2026-08-11 (P2 #25): három külön eset — eddig mindhármat ugyanaz a
           „Még nincs sírhely rögzítve" üres-állapot fedte, a SZŰRT lista alapján.
           Emiatt 200 meglévő sírhely mellett is ez jelent meg, ha egy szűrő nem
           adott találatot, a CTA pedig temető nélkül is a sírhely-űrlapot nyitotta.
           A leltár modul ezt már helyesen megkülönbözteti
           (inventory-main-v3.tsx:706-723) — most a sírhelyek is. */
        cemeteries.length === 0 ? (
          <EmptyFirstRecord
            accent="emerald"
            icon={MapPin}
            title="Még nincs temető rögzítve"
            description="A sírhelyek mindig egy temetőhöz tartoznak, ezért az első lépés a temető felvétele — elég a neve, a cím később is pótolható. Utána jöhetnek a parcellák és a sírhelyek."
            ctaLabel="Hozd létre az első temetőt"
            onCta={() => openCemDialog()}
          />
        ) : plots.length === 0 ? (
          <EmptyFirstRecord
            accent="emerald"
            icon={MapPin}
            title="Még nincs sírhely rögzítve"
            description="Kezdd el a temetői nyilvántartást — rögzítsd az első sírhelyet (parcella, sor, szám, állapot). A bérlet és az elhunytak utólag is felvehetők."
            ctaLabel="Rögzítsd az első sírhelyet"
            onCta={() => openPlotDialog()}
            secondaryLabel="Újabb temető létrehozása"
            onSecondary={() => openCemDialog()}
          />
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              A megadott szűrés mellett nincs megjeleníthető sírhely. Válassz másik temetőt vagy állapotot a fenti legördülőkben.
            </CardContent>
          </Card>
        )
      ) : viewMode === 'table' ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="p-2 text-left">Temető</th>
                <th className="p-2 text-left">Parcella / sor / hely</th>
                <th className="p-2 text-left">Állapot</th>
                <th className="hidden p-2 text-left md:table-cell">Bérlő</th>
                <th className="hidden p-2 text-left lg:table-cell">Elhunyt(ak)</th>
                <th className="w-40 p-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((plot) => {
                const rentals = rentalsMap[plot.id] || []
                const deceased = deceasedMap[plot.id] || []
                return (
                  <tr key={plot.id} className="border-b hover:bg-slate-50">
                    <td className="p-2 text-xs text-muted-foreground">{getCemName(plot.temetoid)}</td>
                    <td className="p-2 font-medium">{[plot.parcella, plot.sor, plot.szam].filter(v => v !== null && v !== undefined && v !== '').join('/') || '—'}</td>
                    <td className="p-2"><Badge variant="secondary" className={`text-xs ${PLOT_STATUS_COLORS[plot.allapot as PlotStatus] || ''}`}>{PLOT_STATUS_LABELS[plot.allapot as PlotStatus] || plot.allapot}</Badge></td>
                    <td className="hidden p-2 text-xs md:table-cell">{rentals.length > 0 ? rentals.map((rental) => rental.berlo || '—').join(', ') : '—'}</td>
                    <td className="hidden p-2 text-xs lg:table-cell">{deceased.length > 0 ? deceased.map((item) => item.nev || '—').join(', ') : '—'}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => openRentalDialog(plot.id)}>+ Bérlet</Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => openDeceasedDialog(plot.id)}>+ Elhunyt</Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-blue-600" onClick={() => openPlotDialog(plot)}>Szerk.</Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-red-500" onClick={() => void handleDeletePlot(plot)}>Törlés</Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((plot) => {
            const rentals = rentalsMap[plot.id] || []
            const deceased = deceasedMap[plot.id] || []
            return (
              <Card key={plot.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{[plot.parcella, plot.sor, plot.szam].filter(v => v !== null && v !== undefined && v !== '').join('/') || '—'}</span>
                    <Badge variant="secondary" className={`text-xs ${PLOT_STATUS_COLORS[plot.allapot as PlotStatus] || ''}`}>{PLOT_STATUS_LABELS[plot.allapot as PlotStatus]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{getCemName(plot.temetoid)}</p>
                  {rentals.length > 0 && <p className="text-xs"><strong>Bérlő:</strong> {rentals.map((rental) => rental.berlo || '—').join(', ')}</p>}
                  {deceased.length > 0 && <p className="text-xs"><strong>Elhunyt:</strong> {deceased.map((item) => item.nev || '—').join(', ')}</p>}
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => openRentalDialog(plot.id)}>+ Bérlet</Button>
                    <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => openDeceasedDialog(plot.id)}>+ Elhunyt</Button>
                    <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-[11px] text-blue-600" onClick={() => openPlotDialog(plot)}>Szerk.</Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
      </>)}

      <Dialog open={cemDialogOpen} onOpenChange={setCemDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{editCemetery ? 'Temető szerkesztése' : 'Új temető'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Név *</Label><Input value={fCemNev} onChange={(event) => setFCemNev(event.target.value)} /></div>
            <div className="space-y-1.5"><Label>Cím</Label><Input value={fCemCim} onChange={(event) => setFCemCim(event.target.value)} /></div>
            <div className="flex justify-end gap-2 border-t pt-2"><Button variant="ghost" onClick={() => setCemDialogOpen(false)}>Mégse</Button><Button onClick={handleSaveCem} disabled={saving}>{saving ? 'Mentés...' : 'Mentés'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={plotDialogOpen} onOpenChange={setPlotDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editPlot ? 'Sírhely szerkesztése' : 'Új sírhely'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Temető *</Label>
              {/* 2026-08-11 (P2 #25): temető nélkül ez a select NULLA opcióval
                  renderelődött — üres, néma mező. Most van beszédes, letiltott
                  placeholder-opciója, és a Mentés is tiltva marad. */}
              <select value={fPlotTemeto} onChange={(event) => setFPlotTemeto(Number(event.target.value))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {cemeteries.length === 0 && (
                  <option value={0} disabled>Előbb hozz létre egy temetőt</option>
                )}
                {cemeteries.map((cemetery) => (
                  <option key={cemetery.id} value={cemetery.id}>{cemetery.nev}</option>
                ))}
              </select>
              {cemeteries.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {'Zárd be ezt az ablakot, és a „+ Temető" gombbal vedd fel az első temetőt — a sírhely mindig egy temetőhöz tartozik.'}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="space-y-1.5"><Label>Parcella *</Label><Input value={fPlotParcella} onChange={(event) => setFPlotParcella(event.target.value)} /></div>
              <div className="space-y-1.5"><Label>Sor *</Label><Input type="number" value={fPlotSor} onChange={(event) => setFPlotSor(Number(event.target.value) || 0)} /></div>
              <div className="space-y-1.5"><Label>Szám *</Label><Input value={fPlotSzam} onChange={(event) => setFPlotSzam(event.target.value)} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Állapot *</Label>
              <select value={fPlotAllapot} onChange={(event) => setFPlotAllapot(event.target.value as PlotStatus)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {PLOT_STATUSES.map((status) => (
                  <option key={status} value={status}>{PLOT_STATUS_LABELS[status]}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 border-t pt-2"><Button variant="ghost" onClick={() => setPlotDialogOpen(false)}>Mégse</Button><Button onClick={handleSavePlot} disabled={saving || !fPlotTemeto}>{saving ? 'Mentés...' : 'Mentés'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={rentalDialogOpen} onOpenChange={setRentalDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Bérlet rögzítése</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Bérlő neve *</Label><Input value={fRentalBerlo} onChange={(event) => setFRentalBerlo(event.target.value)} /></div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Megváltás *</Label><Input type="date" value={fRentalMegvaltas} onChange={(event) => setFRentalMegvaltas(event.target.value)} /></div>
              <div className="space-y-1.5"><Label>Lejárata</Label><Input type="date" value={fRentalLejarata} onChange={(event) => setFRentalLejarata(event.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Összeg (RON)</Label><Input type="number" value={fRentalOsszeg || ''} onChange={(event) => setFRentalOsszeg(Number(event.target.value))} /></div>
            <div className="flex justify-end gap-2 border-t pt-2"><Button variant="ghost" onClick={() => setRentalDialogOpen(false)}>Mégse</Button><Button onClick={handleSaveRental} disabled={saving}>{saving ? 'Mentés...' : 'Mentés'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deceasedDialogOpen} onOpenChange={setDeceasedDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Elhunyt rögzítése</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Név *</Label><Input value={fDecNev} onChange={(event) => setFDecNev(event.target.value)} /></div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="space-y-1.5"><Label>Született</Label><Input type="date" value={fDecSzDatum} onChange={(event) => setFDecSzDatum(event.target.value)} /></div>
              <div className="space-y-1.5"><Label>Halál dátuma</Label><Input type="date" value={fDecHdatum} onChange={(event) => setFDecHdatum(event.target.value)} /></div>
              <div className="space-y-1.5"><Label>Temetés dátuma</Label><Input type="date" value={fDecTdatum} onChange={(event) => setFDecTdatum(event.target.value)} /></div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-2"><Button variant="ghost" onClick={() => setDeceasedDialogOpen(false)}>Mégse</Button><Button onClick={handleSaveDeceased} disabled={saving}>{saving ? 'Mentés...' : 'Mentés'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function StatCard({ label, value, accent = 'text-slate-800' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card-raised p-3 text-center">
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  )
}
