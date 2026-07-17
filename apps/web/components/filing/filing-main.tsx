'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  AlertCircle,
  Copy as CopyIcon,
  Files,
  FolderArchive,
  FolderInput,
  Lock,
  Paperclip,
  Stamp,
  Unlock,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModuleHero } from '@/components/shared/module-hero'
import { EmptyFirstRecord } from '@/components/ui/empty-first-record'
import {
  getFilingEntries,
  saveFilingEntry,
  deleteFilingEntry,
  getNextSequenceNumber,
  closeFilingYear,
  reopenFilingYear,
  getYearClosure,
} from '@/app/(dashboard)/iktato/actions'
import { assignEntryToCsomo, listIratcsomok } from '@/app/(dashboard)/iktato/csomo-actions'
import type { FilingEntryWithCsomo, IratcsomoWithCount } from '@/lib/iktato/csomo-types'
import { createClient } from '@/lib/supabase/client'
import { FILING_DIRECTIONS, FILING_DIRECTION_LABELS, FILING_FOLDERS } from '@/lib/constants/filing'
import type { FilingDirection, FilingEntry, IktatoYearlyClosure } from '@/lib/constants/filing'
import {
  FILING_UGYKOROK,
  FILING_UGYKOROK_MAP,
  getRetentionForUgykor,
  validateHivataliUt,
  type RetentionType,
  type HivataliUtWarning,
} from '@/lib/constants/filing-ugykorjegyzek'
import { toast } from 'sonner'
import { FilingTemplatesTab } from './filing-templates-tab'
import { ColorTabs } from '@/components/ui/color-tabs'
import { IktatoHelp } from './iktato-help'
import { printIktatoPecset, printIktatokonyv } from './iktato-print'
import { FilingOverview } from './filing-overview'
import { IratcsomoPanel } from './iratcsomo-panel'
import { CsatolmanyPanel } from './csatolmany-panel'

// 2026-07-17 (F6/K6): az Igazolás/levél-kiállító dialógus KATTINTÁSKORI lazy-
// importtal töltődik (a worklog-tabs lelkészi-jelentés mintája szerint) — NEM
// modul-szintű dynamic().catch(), mert ott egy átmeneti chunk-hiba után a
// hibakomponens örökre beégne; így hibánál toast jelez, és a KÖVETKEZŐ
// kattintás újra próbálja az importot. A type-only import build-kor törlődik.
type CertificateIssueDialogComponent =
  typeof import('./certificate-issue-dialog').CertificateIssueDialog

interface FilingMainProps {
  congregationName?: string
  /** 2026-05-25: ha true, "Rendszergazdai importáló" tab a sor végén (red-prominent). */
  showAdminImport?: boolean
  /** A Rendszergazdai importáló tab tartalma. */
  adminImportContent?: React.ReactNode
}

type FilingTab = 'iratok' | 'csomok' | 'sablonok' | 'help' | 'admin-import'

export function FilingMain({ congregationName, showAdminImport = false, adminImportContent }: FilingMainProps) {
  const currentYear = new Date().getFullYear()
  const [activeTab, setActiveTab] = useState<FilingTab>('iratok')
  const [year, setYear] = useState(currentYear)
  const [direction, setDirection] = useState<FilingDirection | 'all'>('all')
  const [entries, setEntries] = useState<FilingEntryWithCsomo[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<FilingEntryWithCsomo | null>(null)

  // ── 2026-07-17 (F6/K6): iratcsomók, csatolmányok, kiállító-dialógus ──
  const [csomok, setCsomok] = useState<IratcsomoWithCount[]>([])
  const [csatolmanyCounts, setCsatolmanyCounts] = useState<Record<string, number>>({})
  const [csomoPickerEntry, setCsomoPickerEntry] = useState<FilingEntryWithCsomo | null>(null)
  const [csomoAssigning, setCsomoAssigning] = useState(false)
  const [attachmentEntry, setAttachmentEntry] = useState<FilingEntryWithCsomo | null>(null)
  const [certOpen, setCertOpen] = useState(false)
  const [CertDialog, setCertDialog] = useState<CertificateIssueDialogComponent | null>(null)
  const [certChunkLoading, setCertChunkLoading] = useState(false)

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

  // 2026-05-29 Fázis 3: másodpéldány-flag + évvégi lezárás
  const [fHasDuplicate, setFHasDuplicate] = useState(false)
  const [yearClosure, setYearClosure] = useState<IktatoYearlyClosure | null>(null)
  const [closing, setClosing] = useState(false)
  const [reopening, setReopening] = useState(false)

  /**
   * 2026-07-17 (F6/K6): csatolmány-darabszámok a sor-jelvényekhez — egyetlen
   * kliens-oldali, chunkolt select az iktato_csatolmany táblára (RLS-védett).
   * Az F6-SQL lefuttatása ELŐTT a tábla még nem létezik → a hiba NÉMÁN üres
   * darabszám-térképet ad (a gemkapocs-gomb szám nélkül is működik, és a
   * csatolmány-panel maga hangosan jelez, ha tényleg baj van).
   */
  const loadCsatolmanyCounts = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setCsatolmanyCounts({})
      return
    }
    try {
      const supabase = createClient()
      const counts: Record<string, number> = {}
      for (let i = 0; i < ids.length; i += 150) {
        const chunk = ids.slice(i, i + 150)
        const { data, error } = await supabase
          .from('iktato_csatolmany')
          .select('iktato_id')
          .in('iktato_id', chunk)
        if (error) {
          setCsatolmanyCounts({})
          return
        }
        for (const row of (data || []) as { iktato_id: string }[]) {
          counts[row.iktato_id] = (counts[row.iktato_id] || 0) + 1
        }
      }
      setCsatolmanyCounts(counts)
    } catch {
      setCsatolmanyCounts({})
    }
  }, [])

  // 2026-07-17 (F6/K6): mindig az ÉV ÖSSZES irata töltődik (direction='all'),
  // az irány-szűrés kliens-oldali — így az év-összkép (FilingOverview) és a
  // lista egyetlen fetch-ből él, a régi getFilingStats-hívás kiesett.
  const load = useCallback(async () => {
    setLoading(true)
    const [data, closure, csomoRes] = await Promise.all([
      getFilingEntries(year, 'all'),
      getYearClosure(year),
      listIratcsomok(year),
    ])
    setEntries(data as FilingEntryWithCsomo[])
    setYearClosure(closure)
    // Az iratcsomó-lista a sor-címkékhez és a „Csomóba" választóhoz kell.
    // Az F6-SQL előtt a tábla még nem létezik — ilyenkor csendben üres
    // listával megyünk tovább (az Iratcsomók fül a saját felületén jelez).
    setCsomok(csomoRes.error ? [] : csomoRes.csomok)
    setLoading(false)
    void loadCsatolmanyCounts(data.map((e) => e.id))
  }, [year, loadCsatolmanyCounts])

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
    const byDirection =
      direction === 'all' ? entries : entries.filter((entry) => entry.direction === direction)
    if (!searchQuery) return byDirection
    const q = searchQuery.toLowerCase()
    return byDirection.filter((entry) =>
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
  }, [entries, direction, searchQuery])

  // Csomó-azonosító → név térkép a sor-címkékhez és a „Csomóba" választóhoz.
  const csomoNameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const csomo of csomok) map[csomo.id] = csomo.nev
    return map
  }, [csomok])

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
      setFHasDuplicate(entry.has_duplicate ?? false)
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
      setFHasDuplicate(false)
      // Az előnézeti sorszámot a kelt-évet követő useEffect kéri le (P3-fix).
      setFSeqNum(0)
    }
    setDialogOpen(true)
  }

  // 2026-07-11 P3: az iktatás a KELT évére történik (saveFilingEntry), ezért az
  // előnézeti sorszámnak is a dialógusban megadott kelt dátum évét kell követnie
  // — nem a lista-szűrő évét. Kelt-változáskor (évváltásnál) újrakérjük.
  const keltYear = useMemo(() => {
    const y = Number(fKelt?.slice(0, 4))
    return Number.isFinite(y) && y >= 1800 && y <= 2200 ? y : currentYear
  }, [fKelt, currentYear])

  useEffect(() => {
    if (!dialogOpen || editEntry) return
    let cancelled = false
    setFSeqNum(0)
    getNextSequenceNumber(keltYear).then((n) => {
      if (!cancelled) setFSeqNum(n)
    })
    return () => {
      cancelled = true
    }
  }, [dialogOpen, editEntry, keltYear])

  // 2026-05-29 Fázis 3: hivatali út validáció (figyelmeztetés)
  const hivataliUtWarnings: HivataliUtWarning[] = useMemo(
    () =>
      validateHivataliUt({
        ugykorKod: fUgykorKod || null,
        direction: fDirection,
        hasDuplicate: fHasDuplicate,
      }),
    [fUgykorKod, fDirection, fHasDuplicate],
  )

  async function handleCloseYear() {
    if (yearClosure) {
      toast.error(`A ${year}-es év már lezárva (${yearClosure.closed_at?.slice(0, 10)}).`)
      return
    }
    const note = window.prompt(
      `Biztosan le szeretnéd zárni a ${year}-es iktatókönyvet?\n\nA lezárás után nem lehet új bejegyzést felvenni, és a meglévőket sem szerkeszteni. A jelenleg ${entries.length} bejegyzés végleges lesz.\n\nOpcionális zárszó:`,
      '',
    )
    if (note === null) return
    setClosing(true)
    const result = await closeFilingYear({ year, closingNote: note || undefined })
    if (result.error) toast.error(result.error)
    else {
      toast.success(
        `A ${year}-es iktatókönyv lezárva (${result.totalEntries ?? 0} bejegyzés).`,
      )
      void load()
    }
    setClosing(false)
  }

  // 2026-07-11 P2: lezárt év feloldása (reopen_iktato_year RPC, admin/master).
  async function handleReopenYear() {
    if (!yearClosure) return
    const ok = window.confirm(
      `Biztosan feloldod a ${year}-es iktatókönyv lezárását?\n\nA feloldás után újra lehet bejegyzést felvenni és a meglévőket szerkeszteni. A művelet lelkészi vagy admin jogosultsághoz kötött.`,
    )
    if (!ok) return
    setReopening(true)
    const result = await reopenFilingYear(year)
    if (result.error) toast.error(result.error)
    else {
      toast.success(`A ${year}-es iktatókönyv lezárása feloldva.`)
      void load()
    }
    setReopening(false)
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
      // 2026-05-29 Fázis 3
      has_duplicate: fHasDuplicate,
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

  // ── 2026-07-17 (F6/K6): Igazolás/levél-kiállító megnyitása ──────────
  // Az első hívás tölti be a lazy chunkot; hibánál toast, és a következő
  // kattintás ÚJRA próbálja (nincs beégett hibakomponens). Siker után a
  // komponens state-ben marad — a dialógus maga resetel nyitáskor (K4).
  async function openCertDialog() {
    if (CertDialog) {
      setCertOpen(true)
      return
    }
    if (certChunkLoading) return
    setCertChunkLoading(true)
    try {
      const mod = await import('./certificate-issue-dialog')
      // Függvény-formájú setState kell: a komponens maga is függvény, a sima
      // setState updater-nek értelmezné és azonnal meghívná.
      setCertDialog(() => mod.CertificateIssueDialog)
      setCertOpen(true)
    } catch (err) {
      console.warn('[iktato] kiállító-dialógus chunk-betöltési hiba:', err)
      toast.error('Az igazolás-kiállító most nem tölthető be — próbáld újra.')
    } finally {
      setCertChunkLoading(false)
    }
  }

  // ── 2026-07-17 (F6/K6): irat iratcsomóba rendezése / kivétele ───────
  async function handleAssignCsomo(entry: FilingEntryWithCsomo, csomoId: string | null) {
    setCsomoAssigning(true)
    const { error } = await assignEntryToCsomo(entry.id, csomoId)
    setCsomoAssigning(false)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(
      csomoId
        ? `A(z) ${entry.year}/${entry.sequence_number} irat a csomóba került.`
        : `A(z) ${entry.year}/${entry.sequence_number} irat kikerült a csomóból.`,
    )
    setCsomoPickerEntry(null)
    refreshEntries()
  }

  // A csomó-választóban lévő irat JELENLEGI csomója — lezárt forrás-csomóból
  // kivenni sem lehet, a „Kivétel" gomb ezt tükrözi (a szerver-oldali guard
  // az assignEntryToCsomo-ban van, ez csak UX-visszajelzés).
  const csomoPickerJelenlegi = csomoPickerEntry?.csomo_id
    ? (csomok.find((c) => c.id === csomoPickerEntry.csomo_id) ?? null)
    : null

  const yearOptions = Array.from({ length: 5 }, (_, index) => currentYear - index)

  return (
    <>
      <ModuleHero
        eyebrow="Iktató"
        title="Iratkezelés és dokumentumkövetés"
        description="Bejövő és kimenő iratok, iktatószámok, ügyintézés és irattári besorolás egy átlátható, egységes felületen."
        pills={[
          congregationName ? { label: congregationName, tone: 'neutral' as const } : undefined,
          { label: `${filtered.length} látható irat`, tone: 'emerald' as const },
          { label: `${year}. év`, tone: 'sky' as const },
          yearClosure ? { label: `Lezárt (${yearClosure.closed_at?.slice(0, 10)})`, tone: 'neutral' as const } : undefined,
        ].filter(Boolean) as { label: string; tone?: 'neutral' | 'emerald' | 'sky' }[]}
        actions={
          activeTab === 'iratok' && !yearClosure ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCloseYear}
              disabled={closing}
              className="border-amber-400 text-amber-700 hover:bg-amber-50"
            >
              <Lock className="size-3.5 mr-1.5" />
              {closing ? 'Lezárás folyamatban…' : `${year}-es év lezárása`}
            </Button>
          ) : undefined
        }
      />

      {yearClosure && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex flex-1 items-start gap-2">
            <Lock className="size-4 mt-0.5 shrink-0" />
            <div>
              <strong>A {year}-es iktatókönyv lezárt.</strong>{' '}
              Lezárva: <span className="font-mono">{yearClosure.closed_at?.slice(0, 19).replace('T', ' ')}</span>
              {yearClosure.total_entries_at_close != null && ` · ${yearClosure.total_entries_at_close} bejegyzés`}
              {yearClosure.closing_note && (
                <>
                  {' · '}
                  <em>„{yearClosure.closing_note}”</em>
                </>
              )}
              <div className="text-xs mt-0.5 text-amber-800">
                Új bejegyzés vagy módosítás nem lehetséges. A lezárás feloldása lelkészi vagy admin jogosultsághoz kötött.
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReopenYear}
            disabled={reopening}
            className="self-start shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100"
          >
            <Unlock className="size-3.5 mr-1.5" />
            {reopening ? 'Feloldás folyamatban…' : 'Év feloldása'}
          </Button>
        </div>
      )}

      {/* 2026-05-25: ColorTabs a Hero ALATT (Tagnyilvántartás minta) — Iratok /
          Iratcsomók / Sablonok / Súgó / Rendszergazdai importáló. */}
      <ColorTabs
        tabs={[
          { value: 'iratok', label: 'Iktatott iratok', color: 'blue' },
          { value: 'csomok', label: 'Iratcsomók', color: 'violet' },
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
      ) : activeTab === 'csomok' ? (
        /* 2026-07-17 (F6/K6): iratcsomó-fül — év-szűrővel; a hozzárendelés-
           változás a fő iratlistát is frissíti (onChanged → refreshEntries). */
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="csomo-ev-valaszto" className="text-sm text-muted-foreground">
              Év:
            </label>
            <select
              id="csomo-ev-valaszto"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {yearOptions.map((optionYear) => (
                <option key={optionYear} value={optionYear}>{optionYear}</option>
              ))}
            </select>
          </div>
          <IratcsomoPanel
            year={year}
            congregationName={congregationName}
            onChanged={refreshEntries}
          />
        </div>
      ) : (
        <FilingEntriesView
          congregationName={congregationName}
          allEntries={entries}
          filtered={filtered}
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
          isClosed={Boolean(yearClosure)}
          onOpenCert={() => void openCertDialog()}
          certLoading={certChunkLoading}
          csomoNameById={csomoNameById}
          csatolmanyCounts={csatolmanyCounts}
          onOpenCsatolmany={(entry) => setAttachmentEntry(entry)}
          onOpenCsomoPicker={(entry) => setCsomoPickerEntry(entry)}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editEntry ? 'Irat szerkesztése' : `Új irat - ${keltYear}/${fSeqNum > 0 ? fSeqNum : '…'} (várható)`}
            </DialogTitle>
            {!editEntry && (
              <DialogDescription>
                Az iktatószám a kelt dátum évét követi, és csak a mentéskor véglegesedik — a fenti szám előnézet, nem foglalt.
              </DialogDescription>
            )}
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

            {/* ─── 2026-05-29 Fázis 3: Másodpéldány-flag + hivatali út validáció ─── */}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fHasDuplicate}
                  onChange={(e) => setFHasDuplicate(e.target.checked)}
                  className="size-4"
                />
                <CopyIcon className="size-4 text-slate-500" />
                Az iratnak van archivált másodpéldánya
              </label>
              <p className="text-[11px] text-slate-500 leading-relaxed pl-6">
                Jellemzően jelentések, választói névjegyzékek és más felsőbb hatósághoz küldött iratok esetén pipálandó.
                Az iktatókönyv-printen külön jelzéssel jelenik meg.
              </p>

              {hivataliUtWarnings.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-200">
                  {hivataliUtWarnings.map((w, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-1.5 text-xs ${
                        w.severity === 'warning' ? 'text-amber-800' : 'text-slate-600'
                      }`}
                    >
                      <AlertCircle className={`size-3.5 mt-0.5 shrink-0 ${w.severity === 'warning' ? 'text-amber-600' : 'text-slate-400'}`} />
                      <span>{w.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2026-07-17 (F6/K6): csatolmányok a szerkesztő-dialógusban is —
                csak MENTETT iratnál (új iratnak még nincs azonosítója). */}
            {editEntry && (
              <div className="rounded-lg border border-slate-200 p-3">
                <CsatolmanyPanel
                  iktatoId={editEntry.id}
                  iktatoszam={`${editEntry.year}/${editEntry.sequence_number}`}
                  onChanged={() => void loadCsatolmanyCounts(entries.map((e) => e.id))}
                />
              </div>
            )}

            {yearClosure && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-1.5">
                <Lock className="size-3.5 mt-0.5 shrink-0" />
                <span>
                  Ez az év (<strong>{year}</strong>) lezárva — a mentés nem fog sikerülni. A lezárás lelkészi vagy admin jogosultsággal oldható fel.
                </span>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Mégse</Button>
            <Button
              onClick={handleSave}
              disabled={saving || Boolean(yearClosure)}
              title={yearClosure ? 'Az iktatókönyv ezen az évre lezárt.' : undefined}
            >
              {saving ? 'Mentés...' : 'Mentés'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 2026-07-17 (F6/K6): csatolmány-dialógus (gemkapocs a sorban) ── */}
      <Dialog
        open={attachmentEntry !== null}
        onOpenChange={(open) => {
          if (!open) setAttachmentEntry(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {/* A CsatolmanyPanel saját fejlécet hoz — a Radix-hez kötelező cím
              képernyőolvasónak szól (sr-only). */}
          <DialogHeader className="sr-only">
            <DialogTitle>
              Csatolmányok
              {attachmentEntry ? ` — ${attachmentEntry.year}/${attachmentEntry.sequence_number}` : ''}
            </DialogTitle>
            <DialogDescription>
              Az irat befotózott vagy feltöltött oldalai, illetve papíralapú jelzései.
            </DialogDescription>
          </DialogHeader>
          {attachmentEntry && (
            <CsatolmanyPanel
              iktatoId={attachmentEntry.id}
              iktatoszam={`${attachmentEntry.year}/${attachmentEntry.sequence_number}`}
              onChanged={() => void loadCsatolmanyCounts(entries.map((e) => e.id))}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── 2026-07-17 (F6/K6): „Csomóba" választó-dialógus ── */}
      <Dialog
        open={csomoPickerEntry !== null}
        onOpenChange={(open) => {
          if (!open) setCsomoPickerEntry(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Iratcsomóba rendezés
              {csomoPickerEntry ? ` — ${csomoPickerEntry.year}/${csomoPickerEntry.sequence_number}` : ''}
            </DialogTitle>
            <DialogDescription>
              Válaszd ki, melyik {year}. évi csomóba kerüljön az irat. A lezárt
              csomók nem választhatók.
            </DialogDescription>
          </DialogHeader>
          {csomoPickerEntry && (
            <div className="space-y-2">
              {csomoPickerEntry.csomo_id ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  // Lezárt forrás-csomóból kivenni sem lehet (szerver-guard tükrözése)
                  disabled={csomoAssigning || !!csomoPickerJelenlegi?.lezarva}
                  title={
                    csomoPickerJelenlegi?.lezarva
                      ? 'A csomó lezárva — az irat kivételéhez előbb old fel az Iratcsomók fülön.'
                      : undefined
                  }
                  onClick={() => void handleAssignCsomo(csomoPickerEntry, null)}
                >
                  <X className="size-4 mr-1.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-left">
                    Kivétel a jelenlegi csomóból
                    {csomoNameById[csomoPickerEntry.csomo_id]
                      ? ` („${csomoNameById[csomoPickerEntry.csomo_id]}")`
                      : ''}
                    {csomoPickerJelenlegi?.lezarva ? ' — lezárva' : ''}
                  </span>
                </Button>
              ) : null}
              {csomok.length === 0 ? (
                <div className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
                  {year}. évben még nincs iratcsomó — előbb hozz létre egyet az
                  Iratcsomók fülön.
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto px-1 py-0"
                    onClick={() => {
                      setCsomoPickerEntry(null)
                      setActiveTab('csomok')
                    }}
                  >
                    Ugrás az Iratcsomók fülre
                  </Button>
                </div>
              ) : (
                <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                  {csomok.map((csomo) => {
                    const isCurrent = csomo.id === csomoPickerEntry.csomo_id
                    return (
                      <li key={csomo.id}>
                        <Button
                          type="button"
                          variant={isCurrent ? 'secondary' : 'outline'}
                          className="w-full justify-start"
                          disabled={csomoAssigning || csomo.lezarva || isCurrent}
                          title={
                            csomo.lezarva
                              ? 'A csomó lezárva — előbb old fel az Iratcsomók fülön.'
                              : isCurrent
                                ? 'Az irat már ebben a csomóban van.'
                                : undefined
                          }
                          onClick={() => void handleAssignCsomo(csomoPickerEntry, csomo.id)}
                        >
                          <FolderArchive className="size-4 mr-1.5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate text-left">{csomo.nev}</span>
                          <span className="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">
                            {csomo.iratSzam} irat
                          </span>
                          {csomo.lezarva ? <Lock className="size-3.5 ml-1.5 shrink-0" /> : null}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 2026-07-17 (F6/K6): a kiállító-chunk betöltése alatti visszajelzés —
          a pointer-events-none KÖTELEZŐ: a backdrop csak vizuális jelzés,
          chunk-hiba esetén sem ragadhat kattinthatatlan overlay a képernyőn. */}
      {certChunkLoading && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4">
          <div className="rounded-2xl border border-border bg-card px-6 py-4 text-sm text-muted-foreground shadow-lg">
            Igazolás-kiállító betöltése…
          </div>
        </div>
      )}

      {/* 2026-07-17 (F6/K6): az Igazolás/levél-kiállító — csak az első sikeres
          chunk-betöltés után mountolódik; önhordó, nyitáskor maga resetel és
          tölti az adatait (K4-kontraktus). Sikeres iktatás → lista-frissítés. */}
      {CertDialog && (
        <CertDialog
          open={certOpen}
          onOpenChange={setCertOpen}
          year={year}
          onIssued={refreshEntries}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Filing entries view — kiemelve, hogy tabolható legyen
// ─────────────────────────────────────────────────────────────────

interface FilingEntriesViewProps {
  congregationName?: string
  /** 2026-07-17 (F6/K6): az év ÖSSZES irata — az év-összképnek (FilingOverview). */
  allEntries: FilingEntryWithCsomo[]
  filtered: FilingEntryWithCsomo[]
  year: number
  setYear: (y: number) => void
  direction: FilingDirection | 'all'
  setDirection: (d: FilingDirection | 'all') => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  yearOptions: number[]
  loading: boolean
  openDialog: (entry?: FilingEntryWithCsomo) => void
  handleDelete: (id: string) => void
  /** 2026-05-28: Iktatópecsét nyomtatás call-back. */
  onPrintPecset?: (entry: FilingEntry) => void
  /** 2026-05-28: Iktatókönyv (9 rovat) nyomtatás call-back. */
  onPrintIktatokonyv?: () => void
  /** 2026-05-29 Fázis 3: lezárt-e az évi iktatókönyv (az "+ Új irat" gombhoz). */
  isClosed?: boolean
  /** 2026-07-17 (F6/K6): Igazolás/levél-kiállító megnyitása (lazy chunk). */
  onOpenCert: () => void
  /** A kiállító-chunk épp töltődik (gomb-visszajelzéshez). */
  certLoading?: boolean
  /** Csomó-azonosító → név (a sor-címkékhez). */
  csomoNameById: Record<string, string>
  /** Iktató-id → csatolmány-darabszám (a gemkapocs-jelvényhez). */
  csatolmanyCounts: Record<string, number>
  /** Csatolmány-dialógus nyitása az adott irathoz. */
  onOpenCsatolmany: (entry: FilingEntryWithCsomo) => void
  /** „Csomóba" választó nyitása az adott irathoz. */
  onOpenCsomoPicker: (entry: FilingEntryWithCsomo) => void
}

function FilingEntriesView({
  allEntries,
  filtered,
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
  isClosed = false,
  onOpenCert,
  certLoading = false,
  csomoNameById,
  csatolmanyCounts,
  onOpenCsatolmany,
  onOpenCsomoPicker,
}: FilingEntriesViewProps) {
  return (
    <>
      {/* 2026-07-17 (F6/K3+K6): év-összkép a régi 4 stat-kártya HELYETT —
          stat-kártyák (érkező/kimenő, elintézetlen, iratcsomóban, ügykörök)
          + havi mini-oszlopdiagram, mindig a teljes évből számolva.
          Üres évnél nem renderelünk: a lista EmptyFirstRecord-ja (CTA-val)
          az egyetlen üres-állapot — nem duplázzuk a kártyákat. */}
      {allEntries.length > 0 && <FilingOverview entries={allEntries} year={year} />}

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
        <div className="ml-auto flex flex-wrap gap-2">
          {onPrintIktatokonyv && (
            <Button size="sm" variant="outline" onClick={onPrintIktatokonyv}>
              Iktatókönyv nyomtatás
            </Button>
          )}
          {/* 2026-07-17 (F6/K6): igazolás/hivatalos levél kiállítása sablonból,
              anyakönyvi adatokkal — a mentés automatikusan iktat (kimenő). */}
          <Button
            size="sm"
            onClick={onOpenCert}
            disabled={certLoading}
          >
            <Stamp className="size-3.5 mr-1.5" />
            {certLoading ? 'Betöltés…' : 'Igazolás / levél kiállítása'}
          </Button>
          <Button
            size="sm"
            onClick={() => openDialog()}
            disabled={isClosed}
            title={isClosed ? 'Az év lezárt — nem vehető fel új bejegyzés.' : undefined}
          >
            + Új irat
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Betöltés...</div>
      ) : filtered.length === 0 ? (
        <EmptyFirstRecord
          accent="sky"
          icon={Files}
          title="Még nincs iktatott irat"
          description="Indítsd el az iktatókönyvet — rögzítsd az első érkező vagy kimenő iratot, és a rendszer adja a következő sorszámot."
          ctaLabel="Iktasd az első iratot"
          onCta={() => openDialog()}
        />
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
                <th className="w-52 p-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id} className="border-b hover:bg-slate-50">
                  <td className="p-2 font-mono text-xs">{entry.year}/{entry.sequence_number}</td>
                  <td className="p-2 text-xs text-muted-foreground">{entry.kelt?.split('T')[0]}</td>
                  <td className="max-w-[260px] p-2 font-medium">
                    <span className="block truncate">{entry.subject}</span>
                    {entry.external_ref_szam && (
                      <div className="text-[10px] font-normal text-slate-500 font-mono">ext: {entry.external_ref_szam}</div>
                    )}
                    {/* 2026-07-17 (F6/K6): csomó-jelzés — a csomo_id az F6-SQL
                        előtt undefined, ilyenkor nincs címke. */}
                    {entry.csomo_id ? (
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] font-normal text-violet-700">
                        <FolderArchive className="size-3 shrink-0" aria-hidden />
                        <span className="truncate">
                          {csomoNameById[entry.csomo_id] || 'Iratcsomóban'}
                        </span>
                      </div>
                    ) : null}
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
                      {/* 2026-07-17 (F6/K6): csatolmányok (gemkapocs + darabszám) */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-1.5 text-xs text-slate-600"
                        onClick={() => onOpenCsatolmany(entry)}
                        title="Csatolmányok — befotózott/feltöltött oldalak"
                        aria-label={`Csatolmányok — ${entry.year}/${entry.sequence_number}`}
                      >
                        <Paperclip className="size-3.5" aria-hidden />
                        {csatolmanyCounts[entry.id] ? (
                          <span className="ml-0.5 tabular-nums">{csatolmanyCounts[entry.id]}</span>
                        ) : null}
                      </Button>
                      {/* 2026-07-17 (F6/K6): iratcsomóba rendezés */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-1.5 text-xs text-violet-700"
                        onClick={() => onOpenCsomoPicker(entry)}
                        title="Iratcsomóba rendezés"
                        aria-label={`Iratcsomóba rendezés — ${entry.year}/${entry.sequence_number}`}
                      >
                        <FolderInput className="size-3.5" aria-hidden />
                      </Button>
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
