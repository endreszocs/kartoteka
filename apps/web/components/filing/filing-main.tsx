'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy as CopyIcon,
  Files,
  FolderArchive,
  FolderInput,
  Lock,
  Paperclip,
  Search,
  Stamp,
  Unlock,
  X,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ModuleHero } from '@/components/shared/module-hero'
import { EmptyFirstRecord } from '@/components/ui/empty-first-record'
import {
  getFilingEntries,
  saveFilingEntry,
  deleteFilingEntry,
  getNextSequenceNumber,
  getRetroactiveInfo,
  closeFilingYear,
  reopenFilingYear,
  getYearClosure,
} from '@/app/(dashboard)/iktato/actions'
import { assignEntryToCsomo, listIratcsomok } from '@/app/(dashboard)/iktato/csomo-actions'
import type { FilingEntryWithCsomo, IratcsomoWithCount } from '@/lib/iktato/csomo-types'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
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
import { FilingQuickRow } from './filing-quick-row'

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

// ─── 2026-07-25 (F8d/S3): a lépéses „Új irat" varázsló lépései ───
// (1) Alapok — irány, kelt, tárgy, feladó/címzett + iktatószám-jelvény;
// (2) Részletek — ügykör, hivatkozások, ügyintézés; (3) Összegzés — áttekintés
// + iktatás. Szerkesztésnél ugyanez a varázsló előtöltve indul.
type WizardStep = 1 | 2 | 3
const WIZARD_STEPS: { step: WizardStep; label: string; hint: string }[] = [
  {
    step: 1,
    label: 'Alapok',
    hint: 'Irány, keltezés, tárgy és a levelezőpartner — ennyi az iktatáshoz kötelező.',
  },
  {
    step: 2,
    label: 'Részletek',
    hint: 'Ügykör, EREK-rovatok, ügyintézés és megjegyzések — mind kitölthető később is.',
  },
  {
    step: 3,
    label: 'Összegzés',
    hint: 'Nézd át az adatokat, majd iktasd az iratot.',
  },
]

/**
 * 2026-07-25 (F8d/S3): egy sor az Összegzés-lépés áttekintő kártyáján.
 * Üres érték helyett gondolatjel — így látszik, mi maradt kitöltetlen.
 */
function SummaryRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: ReactNode
  mono?: boolean
}) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground sm:w-44">
        {label}
      </dt>
      <dd
        className={cn(
          'min-w-0 break-words text-sm',
          empty ? 'text-muted-foreground' : 'text-foreground',
          mono && !empty && 'font-mono tabular-nums',
        )}
      >
        {empty ? '—' : value}
      </dd>
    </div>
  )
}

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

  // ── 2026-07-25: visszamenőleges iktatás (kézi sorszám a számláló alatt) ──
  // A mód CSAK új iratra él; a szabad számokat a getRetroactiveInfo adja.
  const [retroOpen, setRetroOpen] = useState(false)
  const [retroLoading, setRetroLoading] = useState(false)
  const [retroInfo, setRetroInfo] = useState<Awaited<ReturnType<typeof getRetroactiveInfo>> | null>(null)
  const [retroManualInput, setRetroManualInput] = useState('')

  // A kézi sorszám csak pozitív egészként érvényes (a chipek is ide írnak).
  const retroManualSeq = useMemo(() => {
    const trimmed = retroManualInput.trim()
    if (!trimmed) return null
    const n = Number(trimmed)
    return Number.isInteger(n) && n > 0 ? n : null
  }, [retroManualInput])
  // Aktív visszamenőleges mód = kinyitott panel + érvényes kézi szám, új iraton.
  const retroActive = retroOpen && !editEntry && retroManualSeq !== null

  /** A visszamenőleges mód teljes resetje — dialógus nyitásakor és zárásakor. */
  function resetRetro() {
    setRetroOpen(false)
    setRetroInfo(null)
    setRetroManualInput('')
  }

  // ── 2026-07-25 (F8d/S3): lépéses varázsló-állapot ──
  const [wizardStep, setWizardStep] = useState<WizardStep>(1)
  const [ugykorSearch, setUgykorSearch] = useState('')
  // A lépés-cím fókusz-célpontja (a11y): lépésváltáskor ide ugrik a fókusz.
  const stepHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const prevStepRef = useRef<WizardStep>(1)

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
    // 2026-07-25: a visszamenőleges mód minden nyitáskor tiszta lappal indul,
    // a varázsló pedig az 1. (Alapok) lépésről — szerkesztésnél előtöltve.
    resetRetro()
    setWizardStep(1)
    setUgykorSearch('')
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

  // 2026-07-25: a szabad számok listája a KELT-ÉV számlálójához tartozik —
  // a panel kinyitásakor és kelt-évváltáskor újratöltjük; ilyenkor a korábban
  // kiválasztott kézi szám is törlődik (más évben már mást jelentene).
  useEffect(() => {
    if (!dialogOpen || editEntry || !retroOpen) return
    let cancelled = false
    setRetroLoading(true)
    setRetroInfo(null)
    setRetroManualInput('')
    getRetroactiveInfo(keltYear).then((info) => {
      if (cancelled) return
      setRetroInfo(info)
      setRetroLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [dialogOpen, editEntry, retroOpen, keltYear])

  // ── 2026-07-25 (F8d/S3): varázsló-navigáció + a11y fókusz-kezelés ──
  // Lépésváltáskor a fókusz a lépés-címre ugrik: a képernyőolvasó bejelenti
  // az új lépést, a billentyűzetes user a tartalom elején folytatja. Az első
  // nyitáskor NEM fut (a Radix a dialógust fókuszálja), csak tényleges váltásnál.
  useEffect(() => {
    if (!dialogOpen) {
      prevStepRef.current = 1
      return
    }
    if (prevStepRef.current !== wizardStep) {
      prevStepRef.current = wizardStep
      requestAnimationFrame(() => stepHeadingRef.current?.focus())
    }
  }, [dialogOpen, wizardStep])

  /**
   * Továbblépés validációval: az Alapok lépésről csak kitöltött kötelező
   * mezőkkel (kelt + tárgy) lehet menni, és a kinyitott visszamenőleges panel
   * értelmezhetetlen kézi száma sem csúszhat tovább némán.
   */
  function goNextStep() {
    if (wizardStep === 1) {
      if (!fKelt) {
        toast.error('A kelt dátum kötelező!')
        return
      }
      if (!fSubject.trim()) {
        toast.error('A tárgy kötelező!')
        return
      }
      if (retroOpen && !editEntry && retroManualInput.trim() !== '' && retroManualSeq === null) {
        toast.error('A kézi iktatószám pozitív egész szám kell legyen.')
        return
      }
    }
    setWizardStep((s) => (s < 3 ? ((s + 1) as WizardStep) : s))
  }

  /** Visszalépés — validáció nélkül (a már megadott adatok megmaradnak). */
  function goPrevStep() {
    setWizardStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s))
  }

  // Az aktuális lépés metaadata (cím + fejléc-magyarázat).
  const activeWizardStep = WIZARD_STEPS[wizardStep - 1]

  /** Dialógus-zárás gombbal — a Radix-féle zárásokkal azonos reset-úton. */
  function closeDialog() {
    setDialogOpen(false)
    resetRetro()
    setWizardStep(1)
  }

  // Ügykör-választó keresője (2. lépés): kód + név + leírás szerint szűr.
  const filteredUgykorok = useMemo(() => {
    const q = ugykorSearch.trim().toLowerCase()
    if (!q) return FILING_UGYKOROK
    return FILING_UGYKOROK.filter((entry) =>
      `${entry.kod} ${entry.nev} ${entry.desc ?? ''}`.toLowerCase().includes(q),
    )
  }, [ugykorSearch])

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
    // 2026-07-25: kinyitott visszamenőleges panel + értelmezhetetlen kézi szám
    // ne csússzon át némán automatikus iktatásba.
    if (retroOpen && !editEntry && retroManualInput.trim() !== '' && retroManualSeq === null) {
      toast.error('A kézi iktatószám pozitív egész szám kell legyen.')
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
      // 2026-07-25: visszamenőleges iktatás — kézi sorszám a számláló alól.
      manualSequenceNumber: retroActive && retroManualSeq !== null ? retroManualSeq : undefined,
    })

    if (result.error) toast.error(result.error)
    else {
      toast.success(
        editEntry
          ? 'Irat frissítve!'
          : retroActive
            ? `Irat visszamenőleg iktatva: ${keltYear}/${retroManualSeq}.`
            : 'Irat iktatva!',
      )
      setDialogOpen(false)
      resetRetro()
      setWizardStep(1)
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
          onQuickSaved={refreshEntries}
        />
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          // 2026-07-25: záráskor a visszamenőleges mód és a varázsló is resetel.
          if (!open) {
            resetRetro()
            setWizardStep(1)
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editEntry ? 'Irat szerkesztése' : 'Új irat iktatása'}</DialogTitle>
            <DialogDescription>{activeWizardStep.hint}</DialogDescription>
          </DialogHeader>

          {/* ── 2026-07-25 (F8d/S3): lépés-jelző (1-2-3) ────────────────────
              A már elvégzett lépések visszafelé kattinthatók; előre csak a
              „Tovább" gomb visz (ott fut a validáció). Telefonon csak az
              aktív lépés neve látszik — a körök végig. */}
          <ol className="flex items-center gap-1 sm:gap-1.5" aria-label="Az iktatás lépései">
            {WIZARD_STEPS.map((item, index) => {
              const done = item.step < wizardStep
              const active = item.step === wizardStep
              return (
                <li key={item.step} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-1.5">
                  <button
                    type="button"
                    onClick={() => setWizardStep(item.step)}
                    disabled={item.step > wizardStep}
                    aria-current={active ? 'step' : undefined}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-1.5 rounded-full border px-2 py-1.5 text-left transition-colors sm:px-2.5',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : done
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60'
                          : 'cursor-not-allowed border-border bg-muted/40 text-muted-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : done
                            ? 'bg-emerald-600 text-white'
                            : 'bg-muted-foreground/20 text-muted-foreground',
                      )}
                    >
                      {done ? <Check className="size-3.5" aria-hidden /> : item.step}
                    </span>
                    <span
                      className={cn(
                        'truncate text-xs font-medium',
                        active ? 'inline' : 'hidden sm:inline',
                      )}
                    >
                      {item.label}
                    </span>
                  </button>
                  {index < WIZARD_STEPS.length - 1 && (
                    <span
                      aria-hidden
                      className={cn('h-px w-2 shrink-0 sm:w-3', done ? 'bg-emerald-400' : 'bg-border')}
                    />
                  )}
                </li>
              )
            })}
          </ol>

          {/* A lépés-cím a fókusz-célpont is (a11y): lépésváltáskor ide ugrik. */}
          <h3
            ref={stepHeadingRef}
            tabIndex={-1}
            className="text-sm font-semibold text-foreground outline-none"
          >
            {wizardStep}. lépés — {activeWizardStep.label}
          </h3>

          {yearClosure && (
            <div className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
              <Lock className="size-3.5 mt-0.5 shrink-0" aria-hidden />
              <span>
                Ez az év (<strong>{year}</strong>) lezárva — a mentés nem fog sikerülni. A lezárás lelkészi vagy admin jogosultsággal oldható fel.
              </span>
            </div>
          )}

          {/* ══════════ 1. LÉPÉS — ALAPOK ══════════ */}
          {wizardStep === 1 && (
            <div className="space-y-4">
              {/* 2026-07-25 (éles teszt-kérés): a következő iktatószám jól
                  láthatóan, token-stílusú jelvényben — a meglévő
                  getNextSequenceNumber-előnézetből; a szám csak a mentéskor
                  véglegesedik (nem foglalt). Alatta a visszamenőleges panel. */}
              {!editEntry && (
                <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                  {retroActive ? (
                    /* 2026-07-25: aktív visszamenőleges mód — a jelvény a KÉZI
                       számot mutatja, figyelmeztető (amber) tónussal. */
                    <p className="inline-flex w-fit max-w-full flex-wrap items-center gap-1.5 rounded-full border border-amber-400 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-200">
                      <Stamp className="size-3.5 shrink-0" aria-hidden />
                      <span>
                        Kézi iktatószám:{' '}
                        <b className="font-mono tabular-nums">
                          {keltYear}/{retroManualSeq}
                        </b>{' '}
                        (visszamenőleges)
                      </span>
                    </p>
                  ) : (
                    <p className="inline-flex w-fit max-w-full flex-wrap items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                      <Stamp className="size-3.5 shrink-0" aria-hidden />
                      <span>
                        Következő iktatószám:{' '}
                        <b className="font-mono tabular-nums">
                          {keltYear}/{fSeqNum > 0 ? fSeqNum : '…'}
                        </b>{' '}
                        (automatikus)
                      </span>
                    </p>
                  )}
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {retroActive
                      ? 'Visszamenőleges iktatás: a kézi szám a számláló alatti szabad számok közül kerül ki — az automatikus sorszámozást nem érinti.'
                      : 'Az iktatószám a kelt dátum évét követi, és csak a mentéskor véglegesedik — a fenti szám előnézet, nem foglalt.'}
                  </p>

                  {/* ── 2026-07-25: visszamenőleges iktatás (korábbi szám kiadása) ──
                      Diszkrét kapcsoló a jelvény alatt; kinyitva a számláló alatti
                      szabad számok chip-listája + kézi szám-input. Biztonsági elv:
                      az automata csak felfelé lépked, ezért a pointer alatti szabad
                      számok kiadása nem okozhat jövőbeli ütközést. */}
                  <button
                    type="button"
                    onClick={() => setRetroOpen((open) => !open)}
                    aria-expanded={retroOpen}
                    className="w-fit text-xs text-amber-700 underline underline-offset-2 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300"
                  >
                    {retroOpen
                      ? 'Visszamenőleges iktatás elrejtése'
                      : 'Visszamenőleges iktatás (korábbi szám kiadása)…'}
                  </button>
                  {retroOpen && (
                    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-left dark:border-amber-700/60 dark:bg-amber-950/30">
                      <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                        Csak a jelenlegi számláló alatti szabad számok adhatók ki — az automatikus sorszámozást nem érinti.
                      </p>
                      {retroLoading ? (
                        <p className="text-xs text-amber-800 dark:text-amber-300">Szabad számok betöltése…</p>
                      ) : retroInfo?.error ? (
                        <p className="text-xs text-destructive">{retroInfo.error}</p>
                      ) : retroInfo ? (
                        <>
                          {retroInfo.szabadSzamok.length === 0 ? (
                            <p className="text-xs text-amber-800 dark:text-amber-300">Nincs szabad szám a számláló alatt.</p>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {retroInfo.szabadSzamok.slice(0, 15).map((szam) => (
                                <button
                                  key={szam}
                                  type="button"
                                  onClick={() => setRetroManualInput(String(szam))}
                                  className={cn(
                                    'rounded-full border px-2.5 py-1 font-mono text-xs tabular-nums transition-colors',
                                    retroManualSeq === szam
                                      ? 'border-amber-500 bg-amber-500 text-white'
                                      : 'border-amber-300 bg-background text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/60',
                                  )}
                                >
                                  {keltYear}/{szam}
                                </button>
                              ))}
                              {retroInfo.osszesSzabad > 15 && (
                                <span className="text-[11px] text-amber-800 dark:text-amber-300">
                                  további {retroInfo.osszesSzabad - 15} szabad szám
                                </span>
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <Label htmlFor="retro-manual-seq" className="text-xs text-amber-900 dark:text-amber-200">
                              Kézi sorszám:
                            </Label>
                            <Input
                              id="retro-manual-seq"
                              type="number"
                              min={1}
                              max={retroInfo.pointer > 0 ? retroInfo.pointer : undefined}
                              inputMode="numeric"
                              value={retroManualInput}
                              onChange={(event) => setRetroManualInput(event.target.value)}
                              placeholder="pl. 88"
                              className="h-8 w-24"
                            />
                            {retroManualSeq !== null && retroInfo.pointer > 0 && retroManualSeq > retroInfo.pointer && (
                              <span className="text-[11px] text-destructive">
                                A számláló ({retroInfo.pointer}) feletti szám kézzel nem adható ki.
                              </span>
                            )}
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {/* ── Irány: nagy, kattintható kártyák (a régi select helyett) ── */}
              <div className="space-y-1.5">
                <Label id="wiz-direction-label">Irány *</Label>
                <div
                  role="radiogroup"
                  aria-labelledby="wiz-direction-label"
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                >
                  {FILING_DIRECTIONS.map((item) => {
                    const selected = fDirection === item
                    const Icon = item === 'incoming' ? ArrowDownLeft : ArrowUpRight
                    return (
                      <button
                        key={item}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setFDirection(item)}
                        className={cn(
                          'flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-all',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          selected
                            ? item === 'incoming'
                              ? 'border-sky-500 bg-sky-50 shadow-sm dark:bg-sky-950/40'
                              : 'border-emerald-500 bg-emerald-50 shadow-sm dark:bg-emerald-950/40'
                            : 'border-border bg-card hover:border-muted-foreground/40 hover:bg-muted/40',
                        )}
                      >
                        <span
                          className={cn(
                            'grid size-9 shrink-0 place-items-center rounded-full',
                            selected
                              ? item === 'incoming'
                                ? 'bg-sky-600 text-white'
                                : 'bg-emerald-600 text-white'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                            {FILING_DIRECTION_LABELS[item]}
                            {selected && <Check className="size-3.5 shrink-0 text-primary" aria-hidden />}
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                            {item === 'incoming'
                              ? 'Hozzánk beérkezett irat — a feladó és a beérkezés napja a lényeg.'
                              : 'Tőlünk kimenő irat — a címzett és a postázás adatai a lényeg.'}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-kelt">Kelt (irat keltezése) *</Label>
                  <Input
                    id="wiz-kelt"
                    type="date"
                    value={fKelt}
                    onChange={(event) => setFKelt(event.target.value)}
                  />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Az iktatószám ennek a dátumnak az évét követi.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-sender">
                    {fDirection === 'incoming' ? 'Feladó' : 'Címzett'}
                  </Label>
                  <Input
                    id="wiz-sender"
                    value={fSender}
                    onChange={(event) => setFSender(event.target.value)}
                    placeholder={fDirection === 'incoming' ? 'Pl. Esperesi Hivatal' : 'Pl. Egyházmegyei Tanács'}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wiz-subject">Tárgy *</Label>
                <Input
                  id="wiz-subject"
                  value={fSubject}
                  onChange={(event) => setFSubject(event.target.value)}
                  placeholder="Irat rövid tárgya"
                />
              </div>
            </div>
          )}

          {/* ══════════ 2. LÉPÉS — RÉSZLETEK ══════════ */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              {/* ── Ügykör-választó: kereshető kártya-lista a régi select helyett ── */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label id="wiz-ugykor-label">Ügykörjegyzék pontszáma (EREK 2024–)</Label>
                  {fUgykorKod && (
                    <button
                      type="button"
                      onClick={() => setFUgykorKod('')}
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      Ügykör törlése
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    value={ugykorSearch}
                    onChange={(event) => setUgykorSearch(event.target.value)}
                    placeholder="Keresés az ügykörök közt (pl. jelentés, anyakönyv, 6/1.)…"
                    aria-label="Ügykör keresése"
                    className="pl-8"
                  />
                </div>
                <div
                  role="radiogroup"
                  aria-labelledby="wiz-ugykor-label"
                  className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border bg-muted/20 p-1.5"
                >
                  {filteredUgykorok.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                      Nincs találat — próbáld más szóval, vagy töröld a keresőt.
                    </p>
                  ) : (
                    filteredUgykorok.map((entry) => {
                      const selected = fUgykorKod === entry.kod
                      return (
                        <button
                          key={entry.kod}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setFUgykorKod(selected ? '' : entry.kod)}
                          className={cn(
                            'flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            entry.parentKod && 'ml-3 w-[calc(100%-0.75rem)]',
                            selected
                              ? 'border-primary/40 bg-primary/10'
                              : 'border-transparent hover:border-border hover:bg-background',
                          )}
                        >
                          <span
                            className={cn(
                              'mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular-nums',
                              selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {entry.kod}
                          </span>
                          <span className="min-w-0 flex-1 text-xs font-medium leading-snug text-foreground">
                            {entry.nev}
                          </span>
                          <Badge variant="outline" className="mt-0.5 shrink-0 text-[10px]">
                            {entry.retention}
                          </Badge>
                        </button>
                      )
                    })
                  )}
                </div>
                {fUgykorKod && FILING_UGYKOROK_MAP[fUgykorKod]?.desc && (
                  <p className="rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs leading-relaxed text-muted-foreground">
                    {FILING_UGYKOROK_MAP[fUgykorKod].desc}
                  </p>
                )}
              </div>

              {/* ─── EREK Iktatókönyv-rovatok (2026-05-28) ─── */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 dark:border-blue-800/60 dark:bg-blue-950/30">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                  EREK iktatókönyv-rovatok (PDF 2-9. rovat)
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="wiz-ext-szam" className="text-xs">Külső iktatószám (a küldőtől)</Label>
                    <Input
                      id="wiz-ext-szam"
                      value={fExternalRefSzam}
                      onChange={(event) => setFExternalRefSzam(event.target.value)}
                      placeholder="pl. Esperesi 479/2023"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wiz-ext-kelt" className="text-xs">Külső irat kelte</Label>
                    <Input
                      id="wiz-ext-kelt"
                      type="date"
                      value={fExternalRefKelt}
                      onChange={(event) => setFExternalRefKelt(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wiz-beerkezes" className="text-xs">Beérkezés ideje (hivatalunkba)</Label>
                    <Input
                      id="wiz-beerkezes"
                      type="date"
                      value={fBeerkezesIdeje}
                      onChange={(event) => setFBeerkezesIdeje(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wiz-mellekletek" className="text-xs">Mellékletek száma</Label>
                    <Input
                      id="wiz-mellekletek"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={fMellekletekSzama}
                      onChange={(event) => setFMellekletekSzama(event.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="wiz-valasz" className="text-xs">Hivatkozás más iktatószámra</Label>
                    <Input
                      id="wiz-valasz"
                      value={fValaszIktatoszam}
                      onChange={(event) => setFValaszIktatoszam(event.target.value)}
                      placeholder='pl. "lásd 36/2023" — a válaszlevél iktatószáma'
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wiz-targykivonat">Tárgykivonat</Label>
                <Textarea
                  id="wiz-targykivonat"
                  value={fTargykivonat}
                  onChange={(event) => setFTargykivonat(event.target.value)}
                  placeholder="Bővebb leírás az iratról"
                  className="min-h-[72px]"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-elint-datum">Elintézés dátuma (postázás)</Label>
                  <Input
                    id="wiz-elint-datum"
                    type="date"
                    value={fElintDatum}
                    onChange={(event) => setFElintDatum(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-elint-mod">Elintézés módja</Label>
                  <Input
                    id="wiz-elint-mod"
                    value={fElintMod}
                    onChange={(event) => setFElintMod(event.target.value)}
                    placeholder="pl. Postázva, Átadva, Iktatva"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-irattarijel">Irattárijel</Label>
                  <Input
                    id="wiz-irattarijel"
                    value={fIrattarijel}
                    onChange={(event) => setFIrattarijel(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-megjegyzes">Megjegyzés</Label>
                  <Input
                    id="wiz-megjegyzes"
                    value={fMegj}
                    onChange={(event) => setFMegj(event.target.value)}
                  />
                </div>
              </div>

              {/* ─── 2026-05-29 Fázis 3: Másodpéldány-flag + hivatali út validáció ─── */}
              <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={fHasDuplicate}
                    onChange={(e) => setFHasDuplicate(e.target.checked)}
                    className="size-4"
                  />
                  <CopyIcon className="size-4 text-muted-foreground" aria-hidden />
                  Az iratnak van archivált másodpéldánya
                </label>
                <p className="pl-6 text-[11px] leading-relaxed text-muted-foreground">
                  Jellemzően jelentések, választói névjegyzékek és más felsőbb hatósághoz küldött iratok esetén pipálandó.
                  Az iktatókönyv-printen külön jelzéssel jelenik meg.
                </p>

                {hivataliUtWarnings.length > 0 && (
                  <div className="space-y-1.5 border-t border-border pt-2">
                    {hivataliUtWarnings.map((w, i) => (
                      <div
                        key={i}
                        className={cn(
                          'flex items-start gap-1.5 text-xs',
                          w.severity === 'warning'
                            ? 'text-amber-800 dark:text-amber-300'
                            : 'text-muted-foreground',
                        )}
                      >
                        <AlertCircle
                          className={cn(
                            'size-3.5 mt-0.5 shrink-0',
                            w.severity === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                          )}
                          aria-hidden
                        />
                        <span>{w.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════ 3. LÉPÉS — ÖSSZEGZÉS ══════════ */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                {/* Fejléc-sáv: iktatószám + irány — ez a „bélyegző" a kártyán. */}
                <div
                  className={cn(
                    'flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5',
                    fDirection === 'incoming'
                      ? 'bg-sky-50 dark:bg-sky-950/40'
                      : 'bg-emerald-50 dark:bg-emerald-950/40',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-full text-white',
                      fDirection === 'incoming' ? 'bg-sky-600' : 'bg-emerald-600',
                    )}
                  >
                    {fDirection === 'incoming' ? (
                      <ArrowDownLeft className="size-4" aria-hidden />
                    ) : (
                      <ArrowUpRight className="size-4" aria-hidden />
                    )}
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {FILING_DIRECTION_LABELS[fDirection]}
                  </span>
                  <span className="ml-auto font-mono text-sm font-semibold tabular-nums text-foreground">
                    {editEntry
                      ? `${editEntry.year}/${editEntry.sequence_number}`
                      : retroActive
                        ? `${keltYear}/${retroManualSeq}`
                        : `${keltYear}/${fSeqNum > 0 ? fSeqNum : '…'}`}
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {editEntry ? 'meglévő' : retroActive ? 'visszamenőleges' : 'automatikus'}
                  </Badge>
                </div>
                <dl className="divide-y divide-border/60 px-3 py-1">
                  <SummaryRow label="Kelt" value={fKelt} mono />
                  <SummaryRow label="Tárgy" value={fSubject} />
                  <SummaryRow
                    label={fDirection === 'incoming' ? 'Feladó' : 'Címzett'}
                    value={fSender}
                  />
                  <SummaryRow
                    label="Ügykör"
                    value={
                      fUgykorKod
                        ? `${fUgykorKod} ${FILING_UGYKOROK_MAP[fUgykorKod]?.nev ?? ''} (${
                            FILING_UGYKOROK_MAP[fUgykorKod]?.retention ?? '—'
                          })`
                        : ''
                    }
                  />
                  <SummaryRow label="Tárgykivonat" value={fTargykivonat} />
                  <SummaryRow label="Külső iktatószám" value={fExternalRefSzam} mono />
                  <SummaryRow label="Külső irat kelte" value={fExternalRefKelt} mono />
                  <SummaryRow label="Beérkezés ideje" value={fBeerkezesIdeje} mono />
                  <SummaryRow label="Mellékletek száma" value={fMellekletekSzama} mono />
                  <SummaryRow label="Hivatkozás" value={fValaszIktatoszam} />
                  <SummaryRow label="Elintézés dátuma" value={fElintDatum} mono />
                  <SummaryRow label="Elintézés módja" value={fElintMod} />
                  <SummaryRow label="Irattárijel" value={fIrattarijel} />
                  <SummaryRow label="Megjegyzés" value={fMegj} />
                  <SummaryRow
                    label="Másodpéldány"
                    value={fHasDuplicate ? 'Van archivált másodpéldány' : 'Nincs'}
                  />
                </dl>
              </div>

              {hivataliUtWarnings.length > 0 && (
                <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-700/60 dark:bg-amber-950/30">
                  {hivataliUtWarnings.map((w, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex items-start gap-1.5 text-xs',
                        w.severity === 'warning'
                          ? 'text-amber-800 dark:text-amber-300'
                          : 'text-muted-foreground',
                      )}
                    >
                      <AlertCircle
                        className={cn(
                          'size-3.5 mt-0.5 shrink-0',
                          w.severity === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                        )}
                        aria-hidden
                      />
                      <span>{w.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 2026-07-17 (F6/K6): csatolmányok a szerkesztő-dialógusban is —
                  csak MENTETT iratnál (új iratnak még nincs azonosítója). */}
              {editEntry && (
                <div className="rounded-lg border border-border p-3">
                  <CsatolmanyPanel
                    iktatoId={editEntry.id}
                    iktatoszam={`${editEntry.year}/${editEntry.sequence_number}`}
                    onChanged={() => void loadCsatolmanyCounts(entries.map((e) => e.id))}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Varázsló-lábléc: Mégse · Vissza · Tovább / Iktatás ── */}
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" onClick={closeDialog} disabled={saving}>
              Mégse
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              {wizardStep > 1 && (
                <Button variant="outline" onClick={goPrevStep} disabled={saving}>
                  <ChevronLeft className="size-4" aria-hidden />
                  Vissza
                </Button>
              )}
              {wizardStep < 3 ? (
                <Button onClick={goNextStep}>
                  Tovább
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              ) : (
                <Button
                  size="lg"
                  onClick={handleSave}
                  disabled={saving || Boolean(yearClosure)}
                  title={yearClosure ? 'Az iktatókönyv ezen az évre lezárt.' : undefined}
                >
                  <Stamp className="size-4" aria-hidden />
                  {saving
                    ? 'Mentés…'
                    : editEntry
                      ? 'Módosítások mentése'
                      : retroActive
                        ? `Iktatás — ${keltYear}/${retroManualSeq}`
                        : 'Iktatás'}
                </Button>
              )}
            </div>
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
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
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
  /**
   * 2026-07-25 (F8d/S3): a táblázatos gyorsrögzítő sikeres iktatása után —
   * a szülő újratölti az év iratait (és a csatolmány-számlálókat).
   */
  onQuickSaved: () => void
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
  onQuickSaved,
}: FilingEntriesViewProps) {
  // 2026-07-25 (F8d/S3): a táblázatos gyorsrögzítő sor nyitva van-e. Csak
  // md-től érhető el (a sor maga is `hidden md:block`) — telefonon a lépéses
  // varázsló a kényelmes út.
  const [quickRowOpen, setQuickRowOpen] = useState(false)

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
          {/* 2026-07-25 (F8d/S3): táblázatos gyorsrögzítés — sorozat-iktatáshoz.
              md alatt rejtve: telefonon a lépéses varázsló a kényelmes út. */}
          <Button
            size="sm"
            variant={quickRowOpen ? 'default' : 'outline'}
            className="hidden md:inline-flex"
            onClick={() => setQuickRowOpen((open) => !open)}
            disabled={isClosed}
            aria-expanded={quickRowOpen}
            aria-controls="filing-quick-row"
            title={
              isClosed
                ? 'Az év lezárt — nem vehető fel új bejegyzés.'
                : 'Kompakt sor a lista fölött: irány, kelt, tárgy, partner, ügykör → Enter = iktatás'
            }
          >
            <Zap className="size-3.5" aria-hidden />
            {quickRowOpen ? 'Gyorsrögzítés elrejtése' : 'Gyorsrögzítés'}
          </Button>
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

      {/* 2026-07-25 (F8d/S3): a gyorsrögzítő sor a lista FÖLÖTT — sikeres
          iktatás után a szülő újratölt, a sor pedig ürül a következő irathoz. */}
      {quickRowOpen && !isClosed && (
        <div id="filing-quick-row">
          <FilingQuickRow onSaved={onQuickSaved} />
        </div>
      )}

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
