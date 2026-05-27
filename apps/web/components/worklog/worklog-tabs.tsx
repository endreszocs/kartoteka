'use client'

import { useState, useEffect, useMemo } from 'react'
import { Download, FileText, Printer } from 'lucide-react'

import { ColorTabs } from '@/components/ui/color-tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ModuleHero } from '@/components/shared/module-hero'
import { getWorklogs, deleteWorklog } from '@/app/(dashboard)/munkanaplo/actions'
import { WorklogDialog } from '@/components/modals/worklog-dialog'
import type { WorklogCategory, WorklogEntry } from '@/lib/constants/worklog'
import { HU_MONTHS } from '@/lib/constants/dashboard'
import { toast } from 'sonner'
import { WorklogPrintDialog } from '@/components/worklog/worklog-print-dialog'
import { MunkanaploHelp } from './munkanaplo-help'

type WorklogTab = WorklogCategory | 'jelentes'
type ActiveView = 'tab' | 'help' | 'admin-import'

interface WorklogTabsProps {
  congregationName?: string
  /** 2026-05-25: ha true, "Rendszergazdai importáló" tab a sor végén (red-prominent). */
  showAdminImport?: boolean
  /** A Rendszergazdai importáló tab tartalma. */
  adminImportContent?: React.ReactNode
}

const WORKLOG_TYPES: Record<WorklogCategory, string[]> = {
  szolgalat: ['Istentisztelet', 'Igehirdetés', 'Úrvacsora', 'Bibliaóra', 'Imaóra', 'Esti áhítat', 'Alkalmi istentisztelet', 'Egyéb szolgálat'],
  katekezis: ['Bibliaóra', 'Hittan', 'Konfirmáció előkészítő', 'Ifjúsági óra', 'Gyermek foglalkozás', 'Egyéb katekázis'],
  latogatas: ['Családlátogatás', 'Kórházlátogatás', 'Idősek otthona', 'Börtönlátogatás', 'Egyéb látogatás'],
}

function downloadCsv(entries: WorklogEntry[], fileName: string) {
  const header = ['Dátum', 'Típus', 'Cím', 'Alapige', 'Bibliaolvasás', 'Énekek', 'Szolgálatvezető', 'Férfi', 'Nő', 'Gyermek', 'Persely', 'Megjegyzés']
  const rows = entries.map((entry) => [
    (entry.idopont || '').split('T')[0] || '',
    entry.jellege || '',
    entry.cim || '',
    entry.alapige || '',
    entry.bibliaolvasas || '',
    entry.enekek || '',
    entry.szolgalt || '',
    String(entry.jelenlet_ferfi || 0),
    String(entry.jelenlet_no || 0),
    String(entry.jelenlet_gyermek || 0),
    String(entry.persely || 0),
    entry.megjegyzes || '',
  ])
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}


export function WorklogTabs({ congregationName, showAdminImport = false, adminImportContent }: WorklogTabsProps) {
  const [activeView, setActiveView] = useState<ActiveView>('tab')
  const now = new Date()
  const [activeTab, setActiveTab] = useState<WorklogTab>('szolgalat')
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [entries, setEntries] = useState<WorklogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<WorklogEntry | null>(null)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)

  function refreshEntries() {
    setLoading(true)
    void getWorklogs(month).then((data) => {
      setEntries(data)
      setLoading(false)
    })
  }

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      getWorklogs(month).then((data) => {
        if (!cancelled) {
          setEntries(data)
          setLoading(false)
        }
      })
    })
    return () => {
      cancelled = true
    }
  }, [month])

  const filtered = useMemo(() => {
    if (activeTab === 'jelentes') return entries
    return entries.filter((entry) => entry.jellege !== null && WORKLOG_TYPES[activeTab].includes(entry.jellege))
  }, [entries, activeTab])

  const report = useMemo(() => {
    const szolgalat = entries.filter((entry) => entry.jellege !== null && WORKLOG_TYPES.szolgalat.includes(entry.jellege))
    const katekezis = entries.filter((entry) => entry.jellege !== null && WORKLOG_TYPES.katekezis.includes(entry.jellege))
    const latogatas = entries.filter((entry) => entry.jellege !== null && WORKLOG_TYPES.latogatas.includes(entry.jellege))
    const totalAttendance = entries.reduce((sum, entry) => sum + (entry.jelenlet_ferfi || 0) + (entry.jelenlet_no || 0) + (entry.jelenlet_gyermek || 0), 0)
    const totalOffering = entries.reduce((sum, entry) => sum + Number(entry.persely || 0), 0)

    return {
      totalEntries: entries.length,
      szolgalat: szolgalat.length,
      katekezis: katekezis.length,
      latogatas: latogatas.length,
      totalAttendance,
      totalOffering,
    }
  }, [entries])

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

  const monthOptions: { value: string; label: string }[] = []
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    monthOptions.push({ value, label: `${HU_MONTHS[date.getMonth()]} ${date.getFullYear()}` })
  }
  const activeMonthLabel = monthOptions.find((option) => option.value === month)?.label || month

  const tabs = [
    { value: 'szolgalat', label: 'Igehirdetés', color: 'blue', count: entries.filter((entry) => entry.jellege !== null && WORKLOG_TYPES.szolgalat.includes(entry.jellege)).length },
    { value: 'latogatas', label: 'Családlátogatás', color: 'violet', count: entries.filter((entry) => entry.jellege !== null && WORKLOG_TYPES.latogatas.includes(entry.jellege)).length },
    { value: 'katekezis', label: 'Katekézis', color: 'emerald', count: entries.filter((entry) => entry.jellege !== null && WORKLOG_TYPES.katekezis.includes(entry.jellege)).length },
    { value: 'jelentes', label: 'Lelkészi jelentés', color: 'amber', count: entries.length },
    // 2026-05-25: lelkészi Súgó + Rendszergazdai importáló a sor végén
    { value: 'help', label: 'Súgó', color: 'teal' },
    ...(showAdminImport ? [
      { value: 'admin-import', label: 'Rendszergazdai importáló', color: 'red-prominent' },
    ] : []),
  ]

  return (
    <>
      <ModuleHero
        eyebrow="Munkanapló"
        title="M3 Munkanapló és lelkészi jelentés"
        description="Igehirdetések, családlátogatások, katekázisok és az időszaki összegzés egy egységes, áttekinthető munkafelületen."
        pills={[
          congregationName ? { label: congregationName, tone: 'neutral' } : undefined,
          { label: `${entries.length} bejegyzés`, tone: 'emerald' },
          { label: activeMonthLabel, tone: 'violet' },
        ].filter(Boolean) as { label: string; tone?: 'neutral' | 'emerald' | 'violet' }[]}
        actions={
          <>
            <select value={month} onChange={(event) => { setLoading(true); setMonth(event.target.value) }} className="rounded-xl border border-white/70 bg-white/85 px-3 py-2 text-sm shadow-sm">
              {monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setPrintDialogOpen(true)}>
              <Printer className="size-4" />
              Nyomtatási központ
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => downloadCsv(filtered, `munkanaplo_${month}.csv`)}>
              <Download className="size-4" />
              Export
            </Button>
            <Button size="sm" className="rounded-xl" onClick={() => { setEditEntry(null); setDialogOpen(true) }}>
              + Új bejegyzés
            </Button>
          </>
        }
      />

      <ColorTabs
        tabs={tabs}
        active={activeView === 'tab' ? activeTab : activeView}
        onChange={(value) => {
          if (value === 'help' || value === 'admin-import') {
            setActiveView(value)
          } else {
            setActiveView('tab')
            setActiveTab(value as WorklogTab)
          }
        }}
      />

      {activeView === 'help' ? (
        <MunkanaploHelp />
      ) : activeView === 'admin-import' && showAdminImport ? (
        adminImportContent
      ) : activeTab === 'jelentes' ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ReportCard label="Összes bejegyzés" value={report.totalEntries} tone="slate" />
            <ReportCard label="Igehirdetés" value={report.szolgalat} tone="blue" />
            <ReportCard label="Katekézis" value={report.katekezis} tone="emerald" />
            <ReportCard label="Látogatás" value={report.latogatas} tone="violet" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="card-raised p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700/70">Jelentési összkép</p>
              <h3 className="mt-1 font-heading text-2xl text-slate-800">Szolgálati ritmus egy hónapban</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MiniFact label="Összes jelenlét" value={`${report.totalAttendance} fő`} />
                <MiniFact label="Összes persely" value={`${report.totalOffering.toFixed(2)} RON`} />
              </div>
            </div>

            <div className="card-raised p-5">
              <div className="flex items-center gap-2 text-amber-700">
                <FileText className="size-4" />
                <p className="text-xs font-semibold uppercase tracking-[0.24em]">Lelkészi jelentés</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Ebben a hónapban <strong>{report.totalEntries}</strong> bejegyzés született, ebből <strong>{report.szolgalat}</strong> szolgálati,
                <strong> {report.katekezis}</strong> katekázis jellegű és <strong>{report.latogatas}</strong> látogatási tétel.
                A rögzített alkalmak összesített jelenléte <strong>{report.totalAttendance}</strong> fő, a perselybevétel pedig
                <strong> {report.totalOffering.toFixed(2)} RON</strong>.
              </p>
            </div>
          </div>

          {/* Nyomtatási központ gomb */}
          <div className="card-raised p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700/70">Hivatalos nyomtatványok</p>
            <h3 className="mt-1 font-heading text-xl text-slate-800">Lelkészi jelentés és nyomtatványok</h3>
            <p className="mt-2 text-sm text-slate-500">
              A nyomtatási központban kiválasztható az év, hónap és a nyomtatvány típusa — élő előnézettel.
            </p>
            <Button
              className="mt-4 rounded-full bg-amber-600 hover:bg-amber-700"
              onClick={() => setPrintDialogOpen(true)}
            >
              <Printer className="mr-1.5 size-4" />
              Nyomtatási központ megnyitása
            </Button>
          </div>
        </div>
      ) : loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Betöltés...</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nincs bejegyzés.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          <Badge variant="secondary" className="text-xs">{filtered.length} bejegyzés</Badge>
          <div className="overflow-x-auto rounded-[1.35rem] border border-slate-200/80 bg-white/85 shadow-[0_18px_36px_-32px_rgba(15,23,42,0.18)]">
            <table className="w-full min-w-[840px] text-sm">
              <thead className="border-b border-slate-200/70 bg-slate-50/90">
                <tr>
                  <th className="p-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Dátum</th>
                  <th className="p-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Típus</th>
                  <th className="p-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Cím / téma</th>
                  <th className="p-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Alapige</th>
                  <th className="p-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Részvétel</th>
                  <th className="p-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Persely</th>
                  <th className="p-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {filtered.map((entry) => {
                  const attendance = (entry.jelenlet_ferfi || 0) + (entry.jelenlet_no || 0) + (entry.jelenlet_gyermek || 0)
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/80">
                      <td className="p-3 text-xs text-slate-500">{(entry.idopont || '').split('T')[0]}</td>
                      <td className="p-3 font-medium text-slate-700">{entry.jellege}</td>
                      <td className="p-3 text-slate-600">{entry.cim || '—'}</td>
                      <td className="p-3 text-slate-500">{entry.alapige || '—'}</td>
                      <td className="p-3 text-slate-600">{attendance > 0 ? `${attendance} fő` : '—'}</td>
                      <td className="p-3 font-semibold text-emerald-700">{entry.persely ? `${Number(entry.persely).toFixed(2)} RON` : '—'}</td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-slate-500 hover:text-blue-600" onClick={() => { setEditEntry(entry); setDialogOpen(true) }}>
                            Szerk.
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-slate-500 hover:text-red-600" onClick={() => handleDelete(entry.id)}>
                            Törlés
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <WorklogDialog open={dialogOpen} onOpenChange={closeDialog} editEntry={editEntry} defaultCategory={activeTab === 'jelentes' ? 'szolgalat' : activeTab} />

      <WorklogPrintDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        entries={entries}
        congregationName={congregationName}
      />
    </>
  )
}

function ReportCard({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'blue' | 'emerald' | 'violet' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-700',
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    violet: 'bg-violet-50 text-violet-700',
  }[tone]

  return (
    <div className="card-raised p-4">
      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${tones}`}>{label}</span>
      <p className="mt-4 text-3xl font-semibold text-slate-800">{value}</p>
    </div>
  )
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.15rem] bg-secondary/70 px-3.5 py-3 ring-1 ring-white/70">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-700">{value}</p>
    </div>
  )
}
