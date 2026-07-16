'use client'

// 2026-07-11 (F2 — W6 integráció): a munkanapló-főoldal token-alapú
// újraszerkesztése. A korábbi ModuleHero + ColorTabs (hardkódolt-színes)
// szerkezet helyett:
//
//   fejléc (cím + év/hónap-választó) → év-összkép (WorklogOverview) →
//   token-stílusú fülek → kategória-tartalom.
//
// ADATFOLYAM: mindig a TELJES év töltődik be (getWorklogs('YYYY')), a
// hónap-szűrés kliens-oldalon történik — így az év-összkép, a táblázatos
// rögzítő (éven belüli folyamatos Ssz.) és a havi lista egyetlen fetch-ből él.
//
// MOBILE-FIRST: md alatt a kártyás lista + dialógusos rögzítés az elsődleges
// (a táblázat ott nem is renderelődik — teljesítmény), md-től a soron belül
// szerkeszthető WorklogTableEditor. Az oldal sosem görget vízszintesen.

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Download, FileText, NotebookPen, Pencil, Plus, Printer, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getWorklogs, deleteWorklog } from '@/app/(dashboard)/munkanaplo/actions'
import { WorklogDialog } from '@/components/modals/worklog-dialog'
import {
  categorizeWorklogEntry,
  formatRon,
  NAPSZAK_OPTIONS,
  WORKLOG_CATEGORIES,
  WORKLOG_CATEGORY_LABELS,
} from '@/lib/constants/worklog'
import type { WorklogCategory, WorklogEntry } from '@/lib/constants/worklog'
import { HU_MONTHS } from '@/lib/constants/dashboard'
import { WorklogOverview } from '@/components/worklog/worklog-overview'
import { WorklogTableEditor } from '@/components/worklog/worklog-table-editor'
import { WorklogPrintDialog } from '@/components/worklog/worklog-print-dialog'
import { MunkanaploHelp } from './munkanaplo-help'

// 2026-07-16 (F4/S2): az év-statisztika lazy-load-dal töltődik — a statisztika-
// kód (+ a mögötte lusta énekeskönyv-korpusz) nem növeli a munkanapló fő
// chunkját, csak a Lelkészi jelentés fülre lépéskor jön le.
//
// A .catch ág a chunk-betöltési hibát (deploy-skew: régi HTML már nem létező
// chunk-URL-t kér; vagy átmeneti hálózati hiba) szelíd fallback-kártyává
// alakítja — enélkül a hiba az egész Jelentés-fület eldobná.
// A type-only import build-kor törlődik, nem húzza be a statisztika-chunkot.
// A props szándékosan nincs felhasználva — a komponens csak a hibakártyát
// rendereli, de típusa a WorklogStatistics-szal kompatibilis marad.
function WorklogStatisticsLoadError() {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
      Az év-statisztika most nem tölthető be — frissítse az oldalt.
    </div>
  )
}

const WorklogStatistics = dynamic(
  () =>
    import('@/components/worklog/worklog-statistics')
      .then((m) => m.WorklogStatistics)
      .catch((err) => {
        console.warn('[worklog] év-statisztika chunk-betöltési hiba:', err)
        return WorklogStatisticsLoadError
      }),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        Év-statisztika betöltése…
      </div>
    ),
  },
)

// 2026-07-17 (F5/J5): a hivatalos lelkészi jelentés szerkesztő-dialógusa
// KATTINTÁSKORI lazy-importtal jön (NEM modul-szintű dynamic + .catch!) —
// a nagy dialog-chunk (I–X. fejezet szerkesztő + élő A4-előnézet +
// véglegesítő wizard) csak az első gombnyomásra töltődik le, nem növeli a
// munkanapló fő chunkját.
//
// MIÉRT NEM a WorklogStatistics-féle dynamic().catch() minta: ott a .catch
// visszaadott hibakomponens ÖRÖKRE beég a dynamic-be — egy átmeneti hálózati
// hiba után a felhasználó az oldal frissítéséig soha többé nem tudná
// megnyitni a dialógust. A kattintáskori import + state-ben tárolt komponens
// mintával hibánál toast jelez, és a KÖVETKEZŐ kattintás újra próbálkozik;
// siker után a komponens state-ben marad (a mounted-retesz viselkedés őrzve:
// zárás után is mountolva marad, a szerkesztő állapota nem veszik el).
type LelkesziJelentesDialogComponent =
  typeof import('@/components/worklog/lelkeszi-jelentes-dialog').LelkesziJelentesDialog

type WorklogTab = WorklogCategory | 'jelentes' | 'help' | 'admin-import'

interface WorklogTabsProps {
  congregationName?: string
  /** 2026-05-25: ha true, "Rendszergazdai importáló" tab a sor végén. */
  showAdminImport?: boolean
  /** A Rendszergazdai importáló tab tartalma. */
  adminImportContent?: React.ReactNode
}

function isCategory(tab: WorklogTab): tab is WorklogCategory {
  return (WORKLOG_CATEGORIES as readonly string[]).includes(tab)
}

/** A napszak felirata — legacy soroknál a `du` boolean a fallback (kontraktus). */
function napszakLabel(entry: WorklogEntry): string {
  const value = entry.napszak ?? (entry.du ? 'du' : 'de')
  return NAPSZAK_OPTIONS.find((o) => o.value === value)?.label ?? ''
}

// 2026-07-11 (F2): a CSV bővült a Napszak + Úrvacsorázók oszlopokkal.
function downloadCsv(entries: WorklogEntry[], fileName: string) {
  const header = ['Dátum', 'Típus', 'Napszak', 'Cím', 'Alapige', 'Bibliaolvasás', 'Énekek', 'Szolgálatvezető', 'Férfi', 'Nő', 'Gyermek', 'Úrv. templomban', 'Úrv. betegnél', 'Persely', 'Megjegyzés']
  const rows = entries.map((entry) => [
    (entry.idopont || '').split('T')[0] || '',
    entry.jellege || '',
    napszakLabel(entry),
    entry.cim || '',
    entry.alapige || '',
    entry.bibliaolvasas || '',
    entry.enekek || '',
    entry.szolgalt || '',
    String(entry.jelenlet_ferfi || 0),
    String(entry.jelenlet_no || 0),
    String(entry.jelenlet_gyermek || 0),
    entry.uv_templomban != null ? String(entry.uv_templomban) : '',
    entry.uv_betegnel != null ? String(entry.uv_betegnel) : '',
    String(entry.persely || 0),
    entry.megjegyzes || '',
  ])
  // UTF-8 BOM — enélkül az Excel torzan (Latin-1-ként) nyitja az ékezeteket.
  const csv = String.fromCharCode(0xfeff) + [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // A revoke késleltetve fut — lassabb böngészőben a szinkron visszavonás
  // megszakíthatja a még el sem indult letöltést.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * md-töréspont figyelése — md alatt a táblázatos rögzítő nem is renderelődik
 * (teljesítmény), helyette a kártyás lista + dialógus az elsődleges út.
 * Az első kliens-render 'false'-szal fut (SSR-hydration-biztos), az effect
 * azonnal korrigál; a JSX-ben CSS-őr (hidden/md:hidden) is van a villanás ellen.
 */
function useIsMdUp(): boolean {
  const [isMdUp, setIsMdUp] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const update = () => setIsMdUp(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return isMdUp
}

// Token-stílusú, kompakt select (fejléc év/hónap-választó).
const SELECT_CLS =
  'h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground shadow-sm ' +
  'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring'

export function WorklogTabs({ congregationName, showAdminImport = false, adminImportContent }: WorklogTabsProps) {
  const now = new Date()
  const [activeTab, setActiveTab] = useState<WorklogTab>('szolgalat')
  // Év + hónap szűrő — a hónap 0 értéke a teljes évet jelenti. A lekérés
  // mindig éves, a hónap-szűrés kliens-oldali.
  const [year, setYear] = useState(now.getFullYear())
  const [monthNum, setMonthNum] = useState<number>(now.getMonth() + 1)
  const [entries, setEntries] = useState<WorklogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<WorklogEntry | null>(null)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  // 2026-07-17 (F5/J5): a hivatalos lelkészi jelentés dialógusa. A komponens
  // maga state-ben él (kattintáskori import tölti be) — amint egyszer sikerült
  // a betöltés, mountolva marad a zárás után is, így a szerkesztő állapota
  // nem veszik el (mounted-retesz viselkedés).
  const [jelentesDialogOpen, setJelentesDialogOpen] = useState(false)
  const [JelentesDialog, setJelentesDialog] = useState<LelkesziJelentesDialogComponent | null>(null)
  const [jelentesChunkLoading, setJelentesChunkLoading] = useState(false)
  const isMdUp = useIsMdUp()
  // A mindenkori aktuális év — a csendes újratöltés stale-year őre ezt
  // hasonlítja össze a híváskor rögzített évvel (lásd refreshEntries).
  // Effect-ben frissül (render közbeni ref-írás lint-hibát adna); a guard
  // számára ez elegendő: az év-váltó effect úgyis teljes újratöltést indít.
  const yearRef = useRef(year)
  useEffect(() => {
    yearRef.current = year
  }, [year])

  const period = monthNum === 0 ? String(year) : `${year}-${String(monthNum).padStart(2, '0')}`

  // Év-váltáskor teljes újratöltés — a loading-ot az év-választó onChange
  // billenti (lint: nincs szinkron setState az effect törzsében).
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      getWorklogs(String(year)).then((data) => {
        if (!cancelled) {
          setEntries(data)
          setLoading(false)
        }
      })
    })
    return () => {
      cancelled = true
    }
  }, [year])

  /**
   * Csendes újratöltés (mentés/törlés/dialógus-zárás után): NEM billenti át a
   * loading state-et, így a táblázatos rögzítő nem unmountol — a fókusz és a
   * még piszkos draftok megmaradnak (a W3-as szerkesztő erre épít).
   *
   * Stale-year őr: a hívás pillanatában rögzítjük az évet, és az eredményt
   * csak akkor írjuk be, ha az év azóta nem változott — különben a lassabban
   * érkező régi-évi válasz felülírná az év-váltó effect friss adatait.
   */
  function refreshEntries() {
    const requestedYear = year
    void getWorklogs(String(requestedYear)).then((data) => {
      if (yearRef.current === requestedYear) setEntries(data)
    })
  }

  // A kiválasztott időszak (hónap vagy egész év) bejegyzései.
  const periodEntries = useMemo(() => {
    if (monthNum === 0) return entries
    return entries.filter((e) => Number((e.idopont || '').slice(5, 7)) === monthNum)
  }, [entries, monthNum])

  // Fül-jelvények: az időszak kategória-darabszámai.
  const counts = useMemo(() => {
    const c: Record<WorklogCategory, number> = { szolgalat: 0, katekezis: 0, latogatas: 0 }
    for (const e of periodEntries) c[categorizeWorklogEntry(e)] += 1
    return c
  }, [periodEntries])

  // Az aktív kategória időszaki bejegyzései (mobil-lista + CSV-export).
  const filteredPeriod = useMemo(() => {
    if (!isCategory(activeTab)) return periodEntries
    return periodEntries.filter((e) => categorizeWorklogEntry(e) === activeTab)
  }, [periodEntries, activeTab])

  // A táblázatos rögzítő a TELJES év adott kategóriájú sorait kapja, dátum
  // szerint NÖVEKVŐ sorrendben (a szerver csökkenőt ad) — az éven belüli
  // folyamatos Ssz.-hoz és a hónap-szűréshez (a W3 kontraktusa szerint).
  const categoryYearAsc = useMemo(() => {
    if (!isCategory(activeTab)) return []
    return entries
      .filter((e) => categorizeWorklogEntry(e) === activeTab)
      .sort((a, b) => (a.idopont || '').localeCompare(b.idopont || ''))
  }, [entries, activeTab])

  const report = useMemo(() => {
    const totalAttendance = periodEntries.reduce((sum, e) => sum + (e.jelenlet_ferfi || 0) + (e.jelenlet_no || 0) + (e.jelenlet_gyermek || 0), 0)
    const totalOffering = periodEntries.reduce((sum, e) => sum + Number(e.persely || 0), 0)
    return {
      totalEntries: periodEntries.length,
      szolgalat: counts.szolgalat,
      katekezis: counts.katekezis,
      latogatas: counts.latogatas,
      totalAttendance,
      totalOffering,
    }
  }, [periodEntries, counts])

  async function handleDelete(id: number) {
    if (!confirm('Biztosan törli?')) return
    const result = await deleteWorklog(id)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Törölve.')
    refreshEntries()
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditEntry(null)
    refreshEntries()
  }

  function openNewDialog() {
    setEditEntry(null)
    setDialogOpen(true)
  }

  // A hivatalos lelkészi jelentés megnyitása — az első hívás tölti be a lazy
  // chunkot. Hibánál (deploy-skew / hálózat) toast jelez, a dialog NEM nyílik
  // meg, és a következő kattintás ÚJRA próbálja az importot (nincs beégett
  // hibakomponens). Siker után a komponens state-ben marad.
  async function openJelentesDialog() {
    if (JelentesDialog) {
      setJelentesDialogOpen(true)
      return
    }
    if (jelentesChunkLoading) return
    setJelentesChunkLoading(true)
    try {
      const mod = await import('@/components/worklog/lelkeszi-jelentes-dialog')
      // Függvény-formájú setState kell: a komponens maga is függvény, a sima
      // setState updater-nek értelmezné és azonnal meghívná.
      setJelentesDialog(() => mod.LelkesziJelentesDialog)
      setJelentesDialogOpen(true)
    } catch (err) {
      console.warn('[worklog] lelkészi jelentés chunk-betöltési hiba:', err)
      toast.error('A hivatalos lelkészi jelentés most nem tölthető be — próbálja újra.')
    } finally {
      setJelentesChunkLoading(false)
    }
  }

  // Év-választó (8 évre vissza) + hónap-választó ("Egész év" opcióval).
  const yearOptions: number[] = []
  for (let i = 0; i < 8; i++) yearOptions.push(now.getFullYear() - i)
  const activeMonthLabel = monthNum === 0 ? `${year} — egész év` : `${HU_MONTHS[monthNum - 1]} ${year}`

  const tabs: { value: WorklogTab; label: string; count?: number; danger?: boolean }[] = [
    { value: 'szolgalat', label: WORKLOG_CATEGORY_LABELS.szolgalat, count: counts.szolgalat },
    { value: 'katekezis', label: WORKLOG_CATEGORY_LABELS.katekezis, count: counts.katekezis },
    { value: 'latogatas', label: WORKLOG_CATEGORY_LABELS.latogatas, count: counts.latogatas },
    { value: 'jelentes', label: 'Lelkészi jelentés' },
    { value: 'help', label: 'Súgó' },
    ...(showAdminImport
      ? [{ value: 'admin-import' as const, label: 'Rendszergazdai importáló', danger: true }]
      : []),
  ]

  const dialogCategory: WorklogCategory = isCategory(activeTab) ? activeTab : 'szolgalat'

  return (
    <div className="space-y-4">
      {/* ── Fejléc: cím + időszak-jelzők + év/hónap-választó ─────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Munkanapló</p>
          <h1 className="mt-0.5 font-heading text-2xl text-foreground sm:text-3xl">
            Munkanapló és lelkészi jelentés
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {congregationName ? (
              <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 font-medium text-foreground">
                {congregationName}
              </span>
            ) : null}
            <span className="tabular-nums">{entries.length} bejegyzés az évben</span>
            <span aria-hidden>·</span>
            <span>{activeMonthLabel}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="worklog-year">Év</label>
          <select
            id="worklog-year"
            value={year}
            onChange={(event) => { setLoading(true); setYear(Number(event.target.value)) }}
            className={SELECT_CLS}
          >
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <label className="sr-only" htmlFor="worklog-month">Hónap</label>
          <select
            id="worklog-month"
            value={monthNum}
            onChange={(event) => setMonthNum(Number(event.target.value))}
            className={SELECT_CLS}
          >
            <option value={0}>Egész év</option>
            {HU_MONTHS.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
          </select>
        </div>
      </header>

      {/* ── Év-összkép (mindig a teljes évből számol) ─────────────────────── */}
      {loading ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          Betöltés…
        </div>
      ) : (
        <WorklogOverview yearEntries={entries} year={year} />
      )}

      {/* ── Token-stílusú fülek ───────────────────────────────────────────── */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div role="tablist" aria-label="Munkanapló nézetek" className="flex min-w-max items-center gap-0.5 border-b border-border">
          {tabs.map((tab) => {
            const active = activeTab === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  '-mb-px inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  tab.danger
                    ? active
                      ? 'border-destructive text-destructive'
                      : 'border-transparent text-destructive/75 hover:bg-destructive/5 hover:text-destructive'
                    : active
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                {tab.label}
                {typeof tab.count === 'number' && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[11px] leading-none tabular-nums',
                      active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Fül-tartalom ──────────────────────────────────────────────────── */}
      {activeTab === 'help' ? (
        <MunkanaploHelp />
      ) : activeTab === 'admin-import' && showAdminImport ? (
        adminImportContent
      ) : loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Betöltés…</div>
      ) : activeTab === 'jelentes' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ReportCard label="Összes bejegyzés" value={report.totalEntries} tone="total" />
            <ReportCard label={WORKLOG_CATEGORY_LABELS.szolgalat} value={report.szolgalat} tone="szolgalat" />
            <ReportCard label={WORKLOG_CATEGORY_LABELS.katekezis} value={report.katekezis} tone="katekezis" />
            <ReportCard label={WORKLOG_CATEGORY_LABELS.latogatas} value={report.latogatas} tone="latogatas" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="card-raised p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Jelentési összkép</p>
              <h3 className="mt-1 font-heading text-2xl text-foreground">
                {monthNum === 0 ? 'Szolgálati ritmus az évben' : 'Szolgálati ritmus egy hónapban'}
              </h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MiniFact label="Összes jelenlét" value={`${report.totalAttendance} fő`} />
                <MiniFact label="Összes persely" value={`${formatRon(report.totalOffering)} RON`} />
              </div>
            </div>

            <div className="card-raised p-5">
              <div className="flex items-center gap-2 text-primary">
                <FileText className="size-4" />
                <p className="text-xs font-semibold uppercase tracking-[0.24em]">Lelkészi jelentés</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {monthNum === 0 ? 'Ebben az évben' : 'Ebben a hónapban'} <strong className="text-foreground">{report.totalEntries}</strong> bejegyzés született, ebből <strong className="text-foreground">{report.szolgalat}</strong> szolgálati,
                <strong className="text-foreground"> {report.katekezis}</strong> katekézis jellegű és <strong className="text-foreground">{report.latogatas}</strong> látogatási tétel.
                A rögzített alkalmak összesített jelenléte <strong className="text-foreground">{report.totalAttendance}</strong> fő, a perselybevétel pedig
                <strong className="text-foreground"> {formatRon(report.totalOffering)} RON</strong>.
              </p>
            </div>
          </div>

          {/* Nyomtatási központ */}
          <div className="card-raised p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Hivatalos nyomtatványok</p>
            <h3 className="mt-1 font-heading text-xl text-foreground">Lelkészi jelentés és nyomtatványok</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              A nyomtatási központban kiválasztható az év, hónap és a nyomtatvány típusa — élő előnézettel.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {/* 2026-07-17 (F5/J5): az éves hivatalos jelentés (I–X. fejezet)
                  szerkesztője — élő adatokból számolt + kézi mezők, élő
                  A4-előnézet, véglegesítés és beküldés az egyházmegyének. */}
              <Button onClick={() => void openJelentesDialog()} disabled={jelentesChunkLoading}>
                <FileText className="size-4" />
                Hivatalos lelkészi jelentés
              </Button>
              <Button variant="outline" onClick={() => setPrintDialogOpen(true)}>
                <Printer className="size-4" />
                Nyomtatási központ megnyitása
              </Button>
              {/* A teljes időszak exportja — mindhárom kategória egyben. */}
              <Button
                variant="outline"
                onClick={() => downloadCsv(periodEntries, `munkanaplo_osszes_${period}.csv`)}
              >
                <Download className="size-4" />
                Export (minden kategória)
              </Button>
            </div>
          </div>

          {/* Év-statisztika (F4/S2) — a ReportCard-blokk alatt; mindig a TELJES
              év bejegyzéseit kapja (entries), a hónap-szűrés erre nem hat. */}
          <WorklogStatistics yearEntries={entries} year={year} />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Eszközsor: rögzítés (közös mentési út a dialógussal), export, nyomtatás */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={openNewDialog}>
              <Plus className="size-4" />
              Új bejegyzés
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCsv(filteredPeriod, `munkanaplo_${activeTab}_${period}.csv`)}
            >
              <Download className="size-4" />
              CSV-export
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPrintDialogOpen(true)}>
              <Printer className="size-4" />
              Nyomtatás
            </Button>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {filteredPeriod.length} bejegyzés
            </span>
          </div>

          {/* md-től: soron belül szerkeszthető táblázatos rögzítő (W3).
              A CSS-őr (hidden md:block) a matchMedia-effect előtti első
              renderben is megakadályozza a villanást. */}
          {isMdUp && (
            <div className="hidden md:block">
              <WorklogTableEditor
                yearEntries={categoryYearAsc}
                year={year}
                month={monthNum === 0 ? null : monthNum}
                category={dialogCategory}
                onChanged={refreshEntries}
                onEditEntry={(entry) => { setEditEntry(entry); setDialogOpen(true) }}
              />
            </div>
          )}

          {/* md alatt: kártyás lista + dialógusos rögzítés (mobile-first). */}
          {!isMdUp && (
            <div className="md:hidden">
              {filteredPeriod.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-10 text-center">
                  <NotebookPen className="mx-auto size-8 text-muted-foreground" aria-hidden />
                  <p className="mt-3 font-heading text-base text-foreground">
                    Még nincs bejegyzés ebben az időszakban
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Az „Új bejegyzés” gombbal rögzítheti az elsőt a(z) {WORKLOG_CATEGORY_LABELS[dialogCategory]} kategóriában.
                  </p>
                  <Button className="mt-4" onClick={openNewDialog}>
                    <Plus className="size-4" />
                    Új bejegyzés
                  </Button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {filteredPeriod.map((entry) => (
                    <MobileEntryCard
                      key={entry.id}
                      entry={entry}
                      category={dialogCategory}
                      onEdit={() => { setEditEntry(entry); setDialogOpen(true) }}
                      onDelete={() => void handleDelete(entry.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <WorklogDialog open={dialogOpen} onOpenChange={closeDialog} editEntry={editEntry} defaultCategory={dialogCategory} />

      {/* A nyomtatási központ saját maga tölti be a kiválasztott év TELJES
          adatait (getWorklogsForYear). */}
      <WorklogPrintDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        initialYear={year}
        congregationName={congregationName}
      />

      {/* 2026-07-17 (F5/J5): a gombnyomás és a chunk megérkezése közti időre
          azonnali visszajelzés. A pointer-events-none KÖTELEZŐ: a backdrop
          csak vizuális jelzés, nem blokkolhatja az appot — chunk-hiba esetén
          sem ragadhat kattinthatatlan overlay a képernyőn. */}
      {jelentesChunkLoading && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4">
          <div className="rounded-2xl border border-border bg-card px-6 py-4 text-sm text-muted-foreground shadow-lg">
            Hivatalos lelkészi jelentés betöltése…
          </div>
        </div>
      )}

      {/* 2026-07-17 (F5/J5): a hivatalos lelkészi jelentés szerkesztője — csak
          az első sikeres chunk-betöltés után mountolódik (state-ben tárolt
          komponens), és saját maga tölti be a kiválasztott év jelentés-adatait
          (getLelkesziJelentes). Zárás után is mountolva marad. */}
      {JelentesDialog && (
        <JelentesDialog
          open={jelentesDialogOpen}
          onOpenChange={setJelentesDialogOpen}
          year={year}
          congregationName={congregationName}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mobil bejegyzés-kártya — érintésbarát, token-alapú; a szerkesztés a
// meglévő dialógust nyitja (közös mentési út).
// ---------------------------------------------------------------------------

function MobileEntryCard({
  entry, category, onEdit, onDelete,
}: {
  entry: WorklogEntry
  category: WorklogCategory
  onEdit: () => void
  onDelete: () => void
}) {
  const attendance = (entry.jelenlet_ferfi || 0) + (entry.jelenlet_no || 0) + (entry.jelenlet_gyermek || 0)
  const date = (entry.idopont || '').split('T')[0]

  const facts: string[] = []
  if (category === 'szolgalat' && entry.alapige) facts.push(entry.alapige)
  if (category !== 'latogatas' && attendance > 0) facts.push(`${attendance} fő`)
  if (category !== 'latogatas' && entry.persely) facts.push(`${formatRon(Number(entry.persely))} RON`)
  if (category === 'szolgalat' && (entry.uv_templomban != null || entry.uv_betegnel != null)) {
    facts.push(`Úrvacsorázók: ${(entry.uv_templomban ?? 0) + (entry.uv_betegnel ?? 0)} fő`)
  }
  if (category === 'latogatas' && entry.megjegyzes) facts.push(entry.megjegyzes)

  return (
    <li className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs tabular-nums text-muted-foreground">
            {date}
            {category === 'szolgalat' ? <span> · {napszakLabel(entry)}</span> : null}
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-foreground">{entry.jellege || '—'}</p>
          {entry.cim ? <p className="truncate text-sm text-muted-foreground">{entry.cim}</p> : null}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" aria-label="Bejegyzés szerkesztése" onClick={onEdit}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Bejegyzés törlése"
            className="hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {facts.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {facts.map((fact, i) => <span key={i} className="max-w-full truncate">{fact}</span>)}
        </p>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Jelentés-fül segédkomponensek — a korábbi tartalom token-alapú stílussal.
// ---------------------------------------------------------------------------

function ReportCard({ label, value, tone }: { label: string; value: number; tone: 'total' | WorklogCategory }) {
  const tones: Record<'total' | WorklogCategory, string> = {
    total: 'bg-muted text-foreground',
    szolgalat: 'bg-primary/10 text-primary',
    katekezis: 'bg-secondary text-secondary-foreground',
    latogatas: 'bg-accent text-accent-foreground',
  }

  return (
    <div className="card-raised p-4">
      <span className={cn('inline-flex rounded-full px-3 py-1 text-xs font-medium', tones[tone])}>{label}</span>
      <p className="mt-4 text-3xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}
