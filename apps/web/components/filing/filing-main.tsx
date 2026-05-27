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
import { FILING_UGYKOROK, FILING_UGYKOROK_MAP, getRetentionForUgykor, type RetentionType } from '@/lib/constants/filing-ugykorjegyzek'
import { toast } from 'sonner'
import { FilingTemplatesTab } from './filing-templates-tab'
import { ColorTabs } from '@/components/ui/color-tabs'
import { IktatoHelp } from './iktato-help'
import { printIktatoPecset, printIktatokonyv } from './iktato-print'

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

  // 2026-05-28: EREK 2024-es ügykörjegyzék szerinti új mezők
  const [fExternalRefSzam, setFExternalRefSzam] = useState('')
  const [fExternalRefKelt, setFExternalRefKelt] = useState('')
  const [fBeerkezesIdeje, setFBeerkezesIdeje] = useState('')
  const [fMellekletekSzama, setFMellekletekSzama] = useState<string>('') // string, hogy üres lehessen
  const [fValaszIktatoszam, setFValaszIktatoszam] = useState('')
  const [fUgykorKod, setFUgykorKod] = useState('')

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
      setFFolder((entry.file_folder as typeof FILING_FOLDERS[number]) || 'F.Á.')
      setFElintDatum(entry.elintezes_ideje?.split('T')[0] || '')
      setFElintMod(entry.elintezes_modja || '')
      setFTargykivonat(entry.targykivonat || '')
      setFIrattarijel(entry.irattarijel || '')
      setFMegj(entry.megjegyzes || '')
      setFSeqNum(entry.sequence_number)
      // 2026-05-28: új mezők betöltése
      setFExternalRefSzam(entry.external_ref_szam || '')
      setFExternalRefKelt(entry.external_ref_kelt?.split('T')[0] || '')
      setFBeerkezesIdeje(entry.beerkezes_ideje?.split('T')[0] || '')
      setFMellekletekSzama(entry.mellekletek_szama != null ? String(entry.mellekletek_szama) : '')
      setFValaszIktatoszam(entry.valasz_iktatoszam || '')
      setFUgykorKod(entry.ugykor_kod || '')
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
      setFExternalRefSzam('')
      setFExternalRefKelt('')
      setFBeerkezesIdeje(new Date().toISOString().slice(0, 10)) // alapból ma
      setFMellekletekSzama('')
      setFValaszIktatoszam('')
      setFUgykorKod('')
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
    const mellekSzam = fMellekletekSzama.trim() === '' ? null : Number(fMellekletekSzama)
    const retentionFromUgykor: RetentionType | null = fUgykorKod ? getRetentionForUgykor(fUgykorKod) : null
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
      // 2026-05-28: EREK 2024-es ügykörjegyzék szerinti új mezők
      external_ref_szam: fExternalRefSzam || null,
      external_ref_kelt: fExternalRefKelt || null,
      beerkezes_ideje: fBeerkezesIdeje || null,
      mellekletek_szama: mellekSzam !== null && Number.isFinite(mellekSzam) ? mellekSzam : null,
      valasz_iktatoszam: fValaszIktatoszam || null,
      ugykor_kod: fUgykorKod || null,
      retention_type: retentionFromUgykor,
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
          onPrintPecset={(entry) => printIktatoPecset(entry, { congregationName: congregationName || '', year })}
          onPrintIktatokonyv={() => printIktatokonyv(filtered, { congregationName: congregationName || '', year })}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editEntry ? 'Irat szerkesztése' : `Új irat - ${year}/${fSeqNum}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* ─── Alapinformációk ─── */}
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
                <Label>Ügykörjegyzék pontszáma (2024-)</Label>
                <select
                  value={fUgykorKod}
                  onChange={(event) => setFUgykorKod(event.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">— Válassz ügykört —</option>
                  {FILING_UGYKOROK.map((entry) => (
                    <option key={entry.kod} value={entry.kod}>
                      {entry.parentKod ? '  ' : ''}{entry.kod} {entry.nev} ({entry.retention})
                    </option>
                  ))}
                </select>
                {fUgykorKod && FILING_UGYKOROK_MAP[fUgykorKod]?.desc && (
                  <p className="text-xs text-slate-500 mt-1">
                    {FILING_UGYKOROK_MAP[fUgykorKod].desc}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Kelt (irat keltezése) *</Label>
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

            {/* ─── EREK Iktatókönyv-rovatok (2026-05-28) ─── */}
            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-2">
                EREK iktatókönyv-rovatok (PDF 2-9. rovat)
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Külső iktatószám (a küldőtől)</Label>
                  <Input
                    value={fExternalRefSzam}
                    onChange={(event) => setFExternalRefSzam(event.target.value)}
                    placeholder="pl. Esperesi 479/2023"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Külső irat kelte</Label>
                  <Input type="date" value={fExternalRefKelt} onChange={(event) => setFExternalRefKelt(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Beérkezés ideje (hivatalunkba)</Label>
                  <Input type="date" value={fBeerkezesIdeje} onChange={(event) => setFBeerkezesIdeje(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Mellékletek száma</Label>
                  <Input
                    type="number"
                    min={0}
                    value={fMellekletekSzama}
                    onChange={(event) => setFMellekletekSzama(event.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Hivatkozás más iktatószámra</Label>
                  <Input
                    value={fValaszIktatoszam}
                    onChange={(event) => setFValaszIktatoszam(event.target.value)}
                    placeholder='pl. "lásd 36/2023" — a válaszlevél iktatószáma'
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Elintézés dátuma (postázás)</Label>
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
  /** 2026-05-28: Iktatópecsét nyomtatás call-back. */
  onPrintPecset?: (entry: FilingEntry) => void
  /** 2026-05-28: Iktatókönyv (9 rovat) nyomtatás call-back. */
  onPrintIktatokonyv?: () => void
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
  onPrintPecset,
  onPrintIktatokonyv,
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
        <div className="ml-auto flex gap-2">
          {onPrintIktatokonyv && (
            <Button size="sm" variant="outline" onClick={onPrintIktatokonyv}>
              Iktatókönyv nyomtatás
            </Button>
          )}
          <Button size="sm" onClick={() => openDialog()}>+ Új irat</Button>
        </div>
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
                <th className="hidden p-2 text-left lg:table-cell">Ügykör</th>
                <th className="p-2 text-center">Elintézés</th>
                <th className="w-36 p-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id} className="border-b hover:bg-slate-50">
                  <td className="p-2 font-mono text-xs">{entry.year}/{entry.sequence_number}</td>
                  <td className="p-2 text-xs text-muted-foreground">{entry.kelt?.split('T')[0]}</td>
                  <td className="max-w-[260px] truncate p-2 font-medium">
                    {entry.subject}
                    {entry.external_ref_szam && (
                      <div className="text-[10px] font-normal text-slate-500 font-mono">ext: {entry.external_ref_szam}</div>
                    )}
                  </td>
                  <td className="hidden p-2 text-xs text-muted-foreground md:table-cell">{entry.sender_or_recipient || '—'}</td>
                  <td className="hidden p-2 lg:table-cell">
                    {entry.ugykor_kod ? (
                      <Badge variant="outline" className="text-[10px] font-mono">{entry.ugykor_kod}</Badge>
                    ) : entry.file_folder ? (
                      <Badge variant="outline" className="text-[10px] text-slate-400">{entry.file_folder} (legacy)</Badge>
                    ) : (
                      <span className="text-[10px] text-slate-400">—</span>
                    )}
                  </td>
                  <td className="p-2 text-center">{entry.elintezes_ideje ? 'Kész' : 'Nyitott'}</td>
                  <td className="p-2">
                    <div className="flex justify-end gap-1">
                      {onPrintPecset && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-teal-700"
                          onClick={() => onPrintPecset(entry)}
                          title="Iktatópecsét nyomtatás"
                        >
                          Pecsét
                        </Button>
                      )}
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
