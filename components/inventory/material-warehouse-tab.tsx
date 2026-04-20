'use client'

/**
 * Anyagraktár fül — gyorsan fogyó készletek a leltár oldalon.
 *
 * 2 szekció:
 *   1. ÁLTALÁNOS ANYAGOK (materials + material_movements) — a hivatalos
 *      Anyagraktárkönyv mintáját követi. Minden anyag egy "oldal", folyamatos
 *      egyenleg, bevétel/kiadás mozgásokkal.
 *   2. KERÜLETI NYUGTATÖMBÖK (chitanta_tombok) — speciális eset, saját rendszerrel.
 *      Ott a nyugtakiállítás automatikusan kezeli a mozgásokat.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  Package,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  listChitantaTombok,
  type ChitantaTomb,
} from '@/app/(dashboard)/penzugy/chitanta-tombok-actions'
import {
  getAnyagraktarStats,
  getMaterialBook,
  listMaterials,
  type MaterialWithStock,
} from '@/app/(dashboard)/leltar/anyagraktar-actions'
import { ChitantaTombWizardDialog } from '@/components/modals/chitanta-tomb-wizard-dialog'
import { MaterialAddDialog } from '@/components/modals/material-add-dialog'
import { MaterialBookDialog } from '@/components/modals/material-book-dialog'
import { buildAnyagraktarkonyvHtml } from '@/lib/finance/anyagraktar-print'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'

type Props = {
  congregationName: string
}

function formatRon(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString('hu-HU', { maximumFractionDigits: 2 }) + ' RON'
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function MaterialWarehouseTab({ congregationName }: Props) {
  // ─── Általános anyagok ─────────────────────────────
  const [materials, setMaterials] = useState<MaterialWithStock[]>([])
  const [materialsLoading, setMaterialsLoading] = useState(true)
  const [addMaterialOpen, setAddMaterialOpen] = useState(false)
  const [editMaterialFor, setEditMaterialFor] = useState<MaterialWithStock | null>(null)
  const [bookDialogFor, setBookDialogFor] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [printing, setPrinting] = useState(false)

  // ─── Nyugtatömbök ─────────────────────────────────
  const [tombok, setTombok] = useState<ChitantaTomb[]>([])
  const [tombLoading, setTombLoading] = useState(true)
  const [tombWizardOpen, setTombWizardOpen] = useState(false)

  const [refreshKey, setRefreshKey] = useState(0)

  const loadMaterials = useCallback(async () => {
    setMaterialsLoading(true)
    const res = await listMaterials({ aktivCsak: !showInactive })
    setMaterialsLoading(false)
    if (res.data) setMaterials(res.data)
  }, [showInactive])

  const loadTombok = useCallback(async () => {
    setTombLoading(true)
    const res = await listChitantaTombok()
    setTombLoading(false)
    if (res.data) setTombok(res.data)
  }, [])

  useEffect(() => {
    void loadMaterials()
    void loadTombok()
  }, [loadMaterials, loadTombok, refreshKey])

  // Kategóriák a szűrőhöz
  const availableCategories = useMemo(() => {
    const set = new Set<string>()
    for (const m of materials) {
      if (m.kategoria) set.add(m.kategoria)
    }
    return Array.from(set).sort()
  }, [materials])

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      if (categoryFilter !== 'all' && m.kategoria !== categoryFilter) return false
      return true
    })
  }, [materials, categoryFilter])

  // Aggregált statisztika (általános anyagok)
  const materialStats = useMemo(() => {
    const aktiv = materials.filter((m) => m.aktiv).length
    const osszErtek = materials.reduce((s, m) => s + (m.keszlet_ertek || 0), 0)
    return {
      osszDB: materials.length,
      aktiv,
      osszErtek,
    }
  }, [materials])

  // Nyugtatömb stats
  const tombStats = useMemo(() => {
    const aktivTombok = tombok.filter((t) => t.aktiv).length
    const totalBlocks = tombok.length
    const remainingReceipts = tombok.reduce(
      (s, t) => s + (t.darabszam_ossz - t.felhasznalt_darabszam),
      0,
    )
    const totalValue = tombok.reduce((s, t) => s + (Number(t.vasarlas_ara) || 0), 0)
    return { totalBlocks, aktivTombok, remainingReceipts, totalValue }
  }, [tombok])

  // Összesített érték (vagyonleltári jelentéshez)
  const summaryValue = materialStats.osszErtek + tombStats.totalValue

  async function handlePrintAll(mode: 'preview' | 'pdf') {
    setPrinting(true)
    try {
      // Minden anyaghoz lekérdezzük a teljes könyvet (mozgásokkal)
      const pages = await Promise.all(
        filteredMaterials.map(async (m) => {
          const res = await getMaterialBook(m.id)
          return {
            material: res.material || m,
            movements: res.movements || [],
          }
        }),
      )
      const html = buildAnyagraktarkonyvHtml({
        congregationName,
        materials: pages,
        year: null,
      })
      if (mode === 'pdf') {
        await printToPdf(html, `Anyagraktarkonyv_osszes.pdf`, {
          orientation: 'landscape',
          margin: [10, 10],
          format: 'a4',
        })
        toast.success('Anyagraktárkönyv PDF letöltve.')
      } else {
        await printToBrowser(html)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'A nyomtatás nem sikerült.')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* ─── HERO ─── */}
      <div className="card-raised p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm shrink-0">
              <Package className="size-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">
                Anyagraktár
              </p>
              <h3 className="font-heading text-2xl text-slate-800">
                Gyorsan fogyó készletek
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                A hivatalos Anyagraktárkönyv digitális változata — folyamatos
                egyenleg, többféle anyag egyben. A nyugtatömbök és egyéb anyagok
                egy oldalon a vagyonleltári jelentés kiegészítéseként.
              </p>
            </div>
          </div>
        </div>

        {/* Aggregált statisztika — vagyonleltárhoz is releváns */}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Anyagtípusok"
            value={`${materialStats.osszDB}`}
            sublabel={`${materialStats.aktiv} aktív`}
            icon={<ClipboardList className="size-4" />}
            tone="slate"
          />
          <StatCard
            label="Általános anyagok értéke"
            value={formatRon(materialStats.osszErtek)}
            sublabel="jelenlegi készlet"
            icon={<Package className="size-4" />}
            tone="emerald"
          />
          <StatCard
            label="Nyugtatömbök értéke"
            value={formatRon(tombStats.totalValue)}
            sublabel={`${tombStats.aktivTombok} aktív tömb`}
            icon={<ReceiptText className="size-4" />}
            tone="blue"
          />
          <StatCard
            label="Anyagraktár összérték"
            value={formatRon(summaryValue)}
            sublabel="vagyonleltári kiegészítés"
            icon={<Package className="size-4" />}
            tone="amber"
            highlight
          />
        </div>
      </div>

      {/* ─── SZEKCIÓ 1: Általános anyagok ─── */}
      <div className="card-raised overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-4 text-emerald-700" />
            <h4 className="font-heading text-base text-slate-800">Általános anyagok</h4>
            <span className="text-xs text-slate-500">
              · {filteredMaterials.length} {filteredMaterials.length === 1 ? 'anyag' : 'anyag'}
            </span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {availableCategories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                <option value="all">Minden kategória</option>
                {availableCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="size-3.5 rounded border-slate-300"
              />
              Lezárt anyagok
            </label>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handlePrintAll('preview')}
              disabled={printing || filteredMaterials.length === 0}
              className="rounded-xl text-xs"
            >
              <Printer className="mr-1 size-3.5" />
              Nyomtatás
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handlePrintAll('pdf')}
              disabled={printing || filteredMaterials.length === 0}
              className="rounded-xl text-xs"
            >
              <FileText className="mr-1 size-3.5" />
              PDF
            </Button>
            <Button
              size="sm"
              onClick={() => setAddMaterialOpen(true)}
              className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Plus className="mr-1 size-3.5" />
              Új anyag
            </Button>
          </div>
        </div>

        {materialsLoading ? (
          <div className="p-8 text-center text-slate-500">
            <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
            Betöltés…
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50">
              <Package className="size-6 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {materials.length === 0
                ? 'Még nincs rögzített anyag'
                : 'Nincs találat a szűrőkkel'}
            </p>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              {materials.length === 0
                ? 'Kezdd az első anyag rögzítésével. Pl. papír, tisztítószer, nyomtatópatron — bármi, amit a gyülekezet napi működéséhez használsz.'
                : 'Módosítsd a fenti szűrőket, vagy vegyél fel új anyagot.'}
            </p>
            {materials.length === 0 && (
              <Button
                size="sm"
                onClick={() => setAddMaterialOpen(true)}
                className="mt-4 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Plus className="mr-1 size-3.5" />
                Első anyag rögzítése
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  <th className="p-2.5 text-left text-xs font-medium text-slate-500">Anyag</th>
                  <th className="p-2.5 text-left text-xs font-medium text-slate-500">Kategória</th>
                  <th className="p-2.5 text-right text-xs font-medium text-slate-500">Egységár</th>
                  <th className="p-2.5 text-right text-xs font-medium text-slate-500">Jelenlegi készlet</th>
                  <th className="p-2.5 text-right text-xs font-medium text-slate-500">Érték (RON)</th>
                  <th className="p-2.5 text-left text-xs font-medium text-slate-500">Utolsó mozgás</th>
                  <th className="p-2.5 text-right text-xs font-medium text-slate-500 w-24">Művelet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMaterials.map((m) => {
                  const negative = m.keszlet_mennyiseg < 0
                  const empty = m.keszlet_mennyiseg === 0 && m.mozgas_db > 0
                  return (
                    <tr
                      key={m.id}
                      className={`hover:bg-slate-50/60 cursor-pointer ${!m.aktiv ? 'opacity-60' : ''}`}
                      onClick={() => setBookDialogFor(m.id)}
                    >
                      <td className="p-2.5">
                        <div className="font-medium text-slate-800">{m.nev}</div>
                        {m.megnevezes && (
                          <div className="text-xs text-slate-500">{m.megnevezes}</div>
                        )}
                        {!m.aktiv && (
                          <span className="inline-flex items-center gap-1 mt-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                            <XCircle className="size-2.5" />
                            Lezárt
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-xs text-slate-600">{m.kategoria || '—'}</td>
                      <td className="p-2.5 text-right text-sm">
                        {m.egysegar != null ? formatRon(Number(m.egysegar)) : '—'}
                      </td>
                      <td className="p-2.5 text-right">
                        <span className={`font-semibold ${negative ? 'text-red-600' : empty ? 'text-slate-400' : 'text-slate-800'}`}>
                          {m.keszlet_mennyiseg % 1 === 0
                            ? m.keszlet_mennyiseg.toLocaleString('hu-HU')
                            : m.keszlet_mennyiseg.toLocaleString('hu-HU', { maximumFractionDigits: 3 })}
                        </span>
                        <span className="text-xs text-slate-500 ml-1">{m.mertekegyseg}</span>
                      </td>
                      <td className="p-2.5 text-right text-sm">
                        <span className={negative ? 'text-red-600 font-semibold' : 'text-slate-700'}>
                          {formatRon(m.keszlet_ertek)}
                        </span>
                      </td>
                      <td className="p-2.5 text-xs text-slate-500">
                        {m.utolso_mozgas ? formatDateShort(m.utolso_mozgas) : '—'}
                        {m.mozgas_db > 0 && (
                          <div className="text-[10px] text-slate-400">{m.mozgas_db} mozgás</div>
                        )}
                      </td>
                      <td className="p-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            title="Anyagkönyv megnyitása"
                            onClick={() => setBookDialogFor(m.id)}
                            className="inline-flex items-center justify-center rounded-md border border-slate-200 p-1.5 text-slate-400 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50"
                          >
                            <BookOpen className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Szerkesztés"
                            onClick={() => setEditMaterialFor(m)}
                            className="inline-flex items-center justify-center rounded-md border border-slate-200 p-1.5 text-slate-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── SZEKCIÓ 2: Kerületi nyugtatömbök ─── */}
      <div className="card-raised overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <ReceiptText className="size-4 text-emerald-700" />
            <h4 className="font-heading text-base text-slate-800">Kerületi nyugtatömbök</h4>
            <span className="text-xs text-slate-500">
              · {tombok.length} {tombok.length === 1 ? 'tömb' : 'tömb'}
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => setTombWizardOpen(true)}
            className="ml-auto rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <BookOpen className="mr-1 size-3.5" />
            Új tömb
          </Button>
        </div>

        {tombLoading ? (
          <div className="p-8 text-center text-slate-500">
            <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
            Betöltés…
          </div>
        ) : tombok.length === 0 ? (
          <div className="p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
              <AlertCircle className="size-6 text-amber-600" />
            </div>
            <p className="text-sm font-semibold text-slate-700">
              Még nincs rögzített nyugtatömb
            </p>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              A kerülettől átvett nyugtatömböket itt követed nyomon. A Pénzügy
              fülön a nyugta-kiállítás automatikusan csökkenti a készletet.
            </p>
            <Button
              size="sm"
              onClick={() => setTombWizardOpen(true)}
              className="mt-4 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <BookOpen className="mr-1 size-3.5" />
              Első tömb leltárba vétele
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  <th className="p-2.5 text-left text-xs font-medium text-slate-500">Seria / Blokk</th>
                  <th className="p-2.5 text-right text-xs font-medium text-slate-500">Nyomdai tartomány</th>
                  <th className="p-2.5 text-left text-xs font-medium text-slate-500">Vásárolva</th>
                  <th className="p-2.5 text-right text-xs font-medium text-slate-500">Ár (RON)</th>
                  <th className="p-2.5 text-right text-xs font-medium text-slate-500">Készlet / Össz</th>
                  <th className="p-2.5 text-left text-xs font-medium text-slate-500">Állapot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tombok.map((t) => {
                  const maradek = t.darabszam_ossz - t.felhasznalt_darabszam
                  const pct = t.darabszam_ossz
                    ? Math.round((maradek / t.darabszam_ossz) * 100)
                    : 0
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/60">
                      <td className="p-2.5">
                        <div className="font-medium">{t.seria}</div>
                        {t.block_nr && (
                          <div className="text-xs text-slate-500">Blokk: {t.block_nr}</div>
                        )}
                      </td>
                      <td className="p-2.5 text-right font-mono text-xs">
                        {t.szam_kezdet.toString().padStart(7, '0')} –{' '}
                        {t.szam_veg.toString().padStart(7, '0')}
                      </td>
                      <td className="p-2.5 text-xs">
                        {formatDateShort(t.vasarlas_datuma)}
                      </td>
                      <td className="p-2.5 text-right text-slate-700">
                        {t.vasarlas_ara != null
                          ? Number(t.vasarlas_ara).toLocaleString('hu-HU', { maximumFractionDigits: 2 })
                          : '—'}
                      </td>
                      <td className="p-2.5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <span className="font-semibold">{maradek}</span>
                          <span className="text-xs text-slate-500">/ {t.darabszam_ossz}</span>
                        </div>
                        <div className="mt-1 h-1 w-20 ml-auto rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className={`h-full ${t.aktiv ? 'bg-emerald-500' : 'bg-slate-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="p-2.5">
                        {t.aktiv ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            <CheckCircle2 className="size-3" />
                            Aktív
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            <XCircle className="size-3" />
                            Lezárt
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info doboz — miért külön az Anyagraktár */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
          Miért külön fül az Anyagraktár?
        </p>
        <p className="text-sm text-slate-600 leading-6">
          A <strong>Leltári nyilvántartás</strong> az egyedi, hosszú élettartamú
          eszközöket tartalmazza (bútor, gép, ingatlan). Az <strong>Anyagraktár</strong>
          {' '}ezzel szemben a <strong>gyorsan fogyó készleteket</strong> követi:
          általános anyagok (papír, tisztítószer) és kerületi nyugtatömbök. Az
          anyagraktár záró értéke a <strong>vagyonleltári jelentés</strong> része.
        </p>
      </div>

      {/* Dialog-ok */}
      <MaterialAddDialog
        open={addMaterialOpen}
        onOpenChange={setAddMaterialOpen}
        onSaved={() => setRefreshKey(k => k + 1)}
      />
      <MaterialAddDialog
        open={!!editMaterialFor}
        onOpenChange={(next) => { if (!next) setEditMaterialFor(null) }}
        material={editMaterialFor}
        onSaved={() => setRefreshKey(k => k + 1)}
      />
      <MaterialBookDialog
        open={!!bookDialogFor}
        onOpenChange={(next) => { if (!next) setBookDialogFor(null) }}
        materialId={bookDialogFor}
        congregationName={congregationName}
      />
      <ChitantaTombWizardDialog
        open={tombWizardOpen}
        onOpenChange={setTombWizardOpen}
        onCreated={() => setRefreshKey(k => k + 1)}
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  sublabel,
  icon,
  tone,
  highlight,
}: {
  label: string
  value: string
  sublabel?: string
  icon: React.ReactNode
  tone: 'slate' | 'emerald' | 'blue' | 'amber'
  highlight?: boolean
}) {
  const toneClass = {
    slate: 'bg-slate-50 text-slate-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
  }[tone]

  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200 bg-white'}`}>
      <div className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${toneClass}`}>
        {icon}
      </div>
      <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
      <p className={`mt-1 text-xl font-bold ${highlight ? 'text-amber-700' : 'text-slate-800'}`}>{value}</p>
      {sublabel && <p className="text-xs text-slate-500 mt-0.5">{sublabel}</p>}
    </div>
  )
}
