'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { FileText, Files } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModuleHero } from '@/components/shared/module-hero'
import { getFilingEntries, saveFilingEntry, deleteFilingEntry, getFilingStats, getNextSequenceNumber } from '@/app/(dashboard)/iktato/actions'
import { FILING_DIRECTIONS, FILING_DIRECTION_LABELS, FILING_FOLDERS, FILING_FOLDER_LABELS } from '@/lib/constants/filing'
import type { FilingDirection, FilingEntry } from '@/lib/constants/filing'
import { toast } from 'sonner'
import { FilingTemplatesTab } from './filing-templates-tab'
import { ColorTabs } from '@/components/ui/color-tabs'
import { IktatoHelp } from './iktato-help'

interface FilingMainProps {
  congregationName?: string
  /** 2026-05-25: ha true, "Rendszergazdai importáló" tab a sor végén (red-prominent). */
  showAdminImport?: boolean
  /** A Rendszergazdai importáló tab tartalma. */
  adminImportContent?: React.ReactNode
}

type FilingTab = 'iratok' | 'sablonok' | 'help' | 'admin-import'

export function FilingMain({ congregationName, showAdminImport = false, adminImportContent }: FilingMainProps) {
  const currentYear = new Date().getFullYear()
  const [activeTab, setActiveTab] = useState<FilingTab>('iratok')
  const [year, setYear] = useState(currentYear)
  const [direction, setDirection] = useState<FilingDirection | 'all'>('all')
  const [entries, setEntries] = useState<FilingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [stats, setStats] = useState({ total: 0, incoming: 0, outgoing: 0, pending: 0 })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<FilingEntry | null>(null)

  const [fDirection, setFDirection] = useState<FilingDirection>('incoming')
  const [fKelt, setFKelt] = useState('')
  const [fSubject, setFSubject] = useState('')
  const [fSender, setFSender] = useState('')
  const [fFolder, setFFolder] = useState<typeof FILING_FOLDERS[number]>('F.Á.')
  const [fElintDatum, setFElintDatum] = useState('')
  const [fElintMod, setFElintMod] = useState('')
  const [fTargykivonat, setFTargykivonat] = useState('')
  const [fIrattarijel, setFIrattarijel] = useState('')
  const [fMegj, setFMegj] = useState('')
  const [fSeqNum, setFSeqNum] = useState(0)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [data, currentStats] = await Promise.all([getFilingEntries(year, direction), getFilingStats(year)])
    setEntries(data)
    setStats(currentStats)
    setLoading(false)
  }, [direction, year])

  const refreshEntries = useCallback(() => {
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
    if (!searchQuery) return entries
    const q = searchQuery.toLowerCase()
    return entries.filter((entry) =>
      [
        entry.subject,
        entry.sender_or_recipient,
        entry.targykivonat,
        entry.file_folder,
        entry.megjegyzes,
        `${entry.year}/${entry.sequence_number}`,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [entries, searchQuery])

  function openDialog(entry?: FilingEntry) {
    if (entry) {
      setEditEntry(entry)
      setFDirection(entry.direction as FilingDirection)
      setFKelt(entry.kelt?.split('T')[0] || '')
      setFSubject(entry.subject)
      setFSender(entry.sender_or_recipient || '')
      setFFolder(entry.file_folder as typeof FILING_FOLDERS[number])
      setFElintDatum(entry.elintezes_ideje?.split('T')[0] || '')
      setFElintMod(entry.elintezes_modja || '')
      setFTargykivonat(entry.targykivonat || '')
      setFIrattarijel(entry.irattarijel || '')
      setFMegj(entry.megjegyzes || '')
      setFSeqNum(entry.sequence_number)
    } else {
      setEditEntry(null)
      setFDirection('incoming')
      setFKelt(new Date().toISOString().slice(0, 10))
      setFSubject('')
      setFSender('')
      setFFolder('F.Á.')
      setFElintDatum('')
      setFElintMod('')
      setFTargykivonat('')
      setFIrattarijel('')
      setFMegj('')
      getNextSequenceNumber(year).then(setFSeqNum)
    }
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!fSubject) {
      toast.error('A tárgy kötelező!')
      return
    }
    if (!fKelt) {
      toast.error('A dátum kötelező!')
      return
    }

    setSaving(true)
    const result = await saveFilingEntry({
      id: editEntry?.id,
      direction: fDirection,
      kelt: fKelt,
      subject: fSubject,
      sender_or_recipient: fSender || null,
      file_folder: fFolder,
      targykivonat: fTargykivonat || null,
      elintezes_ideje: fElintDatum || null,
      elintezes_modja: fElintMod || null,
      irattarijel: fIrattarijel || null,
      megjegyzes: fMegj || null,
    })

    if (result.error) toast.error(result.error)
    else {
      toast.success(editEntry ? 'Irat frissítve!' : 'Irat iktatva!')
      setDialogOpen(false)
      refreshEntries()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Biztosan törli?')) return
    const result = await deleteFilingEntry(id)
    if (result.error) toast.error(result.error)
    else {
      toast.success('Irat törölve.')
      refreshEntries()
    }
  }

  const yearOptions = Array.from({ length: 5 }, (_, index) => currentYear - index)

  return (
    <>
      <ModuleHero
        eyebrow="Iktató"
        title="Iratkezelés és dokumentumkövetés"
        description="Bejövő és kimenő iratok, iktatószámok, ügyintézés és irattári besorolás egy átlátható, egységes felületen."
        pills={[
          congregationName ? { label: congregationName, tone: 'neutral' } : undefined,
          { label: `${filtered.length} látható irat`, tone: 'emerald' },
          { label: `${year}. év`, tone: 'sky' },
        ].filter(Boolean) as { label: string; tone?: 'neutral' | 'emerald' | 'sky' }[]}
      />

      {/* 2026-05-25: ColorTabs a Hero ALATT (Tagnyilvántartás minta) — Iratok /
          Sablonok / Súgó / Rendszergazdai importáló. */}
      <ColorTabs
        tabs={[
          { value: 'iratok', label: 'Iktatott iratok', color: 'blue' },
          { value: 'sablonok', label: 'Sablonok', color: 'amber' },
          { value: 'help', label: 'Súgó', color: 'teal' },
          ...(showAdminImport ? [
            { value: 'admin-import', label: 'Rendszergazdai importáló', color: 'red-prominent' },
          ] : []),
        ]}
        active={activeTab}
        onChange={(v) => setActiveTab(v as FilingTab)}
      />

      {activeTab === 'help' ? (
        <IktatoHelp />
      ) : activeTab === 'admin-import' && showAdminImport ? (
        adminImportContent
      ) : activeTab === 'sablonok' ? (
        <FilingTemplatesTab />
      ) : (
        <FilingEntriesView
          congregationName={congregationName}
          filtered={filtered}
          stats={stats}
          year={year}
          setYear={setYear}
          direction={direction}
          setDirection={setDirection}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          yearOptions={yearOptions}
          loading={loading}
          openDialog={openDialog}
          handleDelete={handleDelete}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editEntry ? 'Irat szerkesztése' : `Új irat - ${year}/${fSeqNum}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Irány *</Label>
                <select value={fDirection} onChange={(event) => setFDirection(event.target.value as FilingDirection)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {FILING_DIRECTIONS.map((item) => (
                    <option key={item} value={item}>{FILING_DIRECTION_LABELS[item]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Mappa *</Label>
                <select value={fFolder} onChange={(event) => setFFolder(event.target.value as typeof FILING_FOLDERS[number])} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {FILING_FOLDERS.map((folder) => (
                    <option key={folder} value={folder}>{FILING_FOLDER_LABELS[folder]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Kelt *</Label>
                <Input type="date" value={fKelt} onChange={(event) => setFKelt(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Feladó / címzett</Label>
                <Input value={fSender} onChange={(event) => setFSender(event.target.value)} placeholder={fDirection === 'incoming' ? 'Feladó' : 'Címzett'} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tárgy *</Label>
              <Input value={fSubject} onChange={(event) => setFSubject(event.target.value)} placeholder="Irat rövid tárgya" />
            </div>
            <div className="space-y-1.5">
              <Label>Tárgykivonat</Label>
              <Input value={fTargykivonat} onChange={(event) => setFTargykivonat(event.target.value)} placeholder="Bővebb leírás" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Elintézés dátuma</Label>
                <Input type="date" value={fElintDatum} onChange={(event) => setFElintDatum(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Elintézés módja</Label>
                <Input value={fElintMod} onChange={(event) => setFElintMod(event.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Irattárijel</Label>
                <Input value={fIrattarijel} onChange={(event) => setFIrattarijel(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Megjegyzés</Label>
                <Input value={fMegj} onChange={(event) => setFMegj(event.target.value)} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Mégse</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Mentés...' : 'Mentés'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Filing entries view — kiemelve, hogy tabolható legyen
// ─────────────────────────────────────────────────────────────────

interface FilingEntriesViewProps {
  congregationName?: string
  filtered: FilingEntry[]
  stats: { total: number; incoming: number; outgoing: number; pending: number }
  year: number
  setYear: (y: number) => void
  direction: FilingDirection | 'all'
  setDirection: (d: FilingDirection | 'all') => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  yearOptions: number[]
  loading: boolean
  openDialog: (entry?: FilingEntry) => void
  handleDelete: (id: string) => void
}

function FilingEntriesView({
  filtered,
  stats,
  year,
  setYear,
  direction,
  setDirection,
  searchQuery,
  setSearchQuery,
  yearOptions,
  loading,
  openDialog,
  handleDelete,
}: FilingEntriesViewProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Összes" value={String(stats.total)} />
        <StatCard label="Érkező" value={String(stats.incoming)} accent="text-blue-600" />
        <StatCard label="Kimenő" value={String(stats.outgoing)} accent="text-orange-600" />
        <StatCard label="Függőben" value={String(stats.pending)} accent="text-amber-600" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {(['all', ...FILING_DIRECTIONS] as const).map((item) => (
            <Button key={item} size="sm" variant={direction === item ? 'default' : 'outline'} onClick={() => setDirection(item)}>
              {item === 'all' ? 'Mind' : FILING_DIRECTION_LABELS[item]}
            </Button>
          ))}
        </div>

        <select value={year} onChange={(event) => setYear(Number(event.target.value))} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          {yearOptions.map((optionYear) => (
            <option key={optionYear} value={optionYear}>{optionYear}</option>
          ))}
        </select>

        <Input placeholder="Keresés..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="w-full sm:w-56" />
        <div className="ml-auto"><Button size="sm" onClick={() => openDialog()}>+ Új irat</Button></div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Betöltés...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">Nincs iktatott irat.</CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="p-2 text-left">Sorszám</th>
                <th className="p-2 text-left">Kelt</th>
                <th className="p-2 text-left">Tárgy</th>
                <th className="hidden p-2 text-left md:table-cell">Feladó / címzett</th>
                <th className="hidden p-2 text-left lg:table-cell">Mappa</th>
                <th className="p-2 text-center">Elintézés</th>
                <th className="w-24 p-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id} className="border-b hover:bg-slate-50">
                  <td className="p-2 font-mono text-xs">{entry.year}/{entry.sequence_number}</td>
                  <td className="p-2 text-xs text-muted-foreground">{entry.kelt?.split('T')[0]}</td>
                  <td className="max-w-[260px] truncate p-2 font-medium">{entry.subject}</td>
                  <td className="hidden p-2 text-xs text-muted-foreground md:table-cell">{entry.sender_or_recipient || '—'}</td>
                  <td className="hidden p-2 lg:table-cell"><Badge variant="outline" className="text-[10px]">{entry.file_folder}</Badge></td>
                  <td className="p-2 text-center">{entry.elintezes_ideje ? 'Kész' : 'Nyitott'}</td>
                  <td className="p-2">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-blue-600" onClick={() => openDialog(entry)}>Szerk.</Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-500" onClick={() => handleDelete(entry.id)}>Törlés</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
