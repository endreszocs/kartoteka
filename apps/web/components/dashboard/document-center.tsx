'use client'

/**
 * Hivatalos dokumentumközpont (2026-08-09) — közös felület az egyházmegyei
 * (/dashboard-egyhazmegye) és az egyházkerületi (/dashboard-kerulet)
 * irányítópulthoz. A `level` prop dönti el a jogosultság-szintet.
 *
 * Amit tud (a régi DocumentWorkflowPanel + FinalizedDocumentsList helyett):
 *   - Év-választó (a beküldések éveiből + aktuális év) + típus-szűrő chipek +
 *     gyülekezet-kereső. Alapértelmezés: MINDEN év (év-kulcsolási hiba,
 *     diagnosztika #5: a vagyonleltár year-1 kulcsú, a januári számadás az
 *     előző évhez tartozik — a naptári évre szegezett régi nézetben ezek
 *     láthatatlanok voltak).
 *   - KPI mini-kártyák a kiválasztott évre.
 *   - TELJESSÉGI MÁTRIX: sorok = a hatókör ÖSSZES gyülekezete (nem csak a
 *     beküldők! — diagnosztika #7), oszlopok = az 5 kötelező dokumentum,
 *     cellák = státusz-jelvény vagy „Hiányzik". Mobilon gyülekezet-kártyák.
 *   - Dokumentumlista státusz-idővonallal és szint-függő akciókkal
 *     (megye: átvétel → áttekintés → véglegesítés → továbbítás / visszaküldés
 *     indoklással; kerület: megtekintés + átvétel visszaigazolása).
 *   - Snapshot-néző dialógus strukturált megjelenítéssel + nyomtatással
 *     (printToBrowser, A4 .sheet).
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  Archive,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileCheck,
  FileText,
  Inbox,
  Loader2,
  MailCheck,
  Printer,
  Search,
  Send,
  ShieldAlert,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import {
  acknowledgeKeruletReceipt,
  forwardToKerulet,
  getSubmissionSnapshot,
  getSubmissionsForYear,
  updateSubmissionStatus,
} from '@/app/(dashboard)/dashboard-egyhazmegye/document-actions'
import type {
  DocumentActionResult,
  DocumentCenterData,
} from '@/app/(dashboard)/dashboard-egyhazmegye/document-shared'
import {
  DOCUMENT_DEADLINES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  REQUIRED_DOCUMENT_TYPES,
  documentSeasonYear,
  type DocumentStatus,
  type DocumentSubmission,
  type DocumentType,
} from '@/lib/constants/documents'
import { formatCurrency } from '@/lib/constants/finance'
import { printToBrowser } from '@/lib/utils/print-engine-v2'

// ---------------------------------------------------------------------------
// Konfiguráció
// ---------------------------------------------------------------------------

interface DocumentCenterProps {
  level: 'diocese' | 'district'
  data: DocumentCenterData
}

/** Státusz-jelvény színkészlet — a components/admin/_shared/status-badge.tsx
 *  ring-mintáját követi, saját dark-párokkal (5 megkülönböztethető állapot). */
const STATUS_UI: Record<
  DocumentStatus,
  { label: string; className: string; icon: typeof Inbox }
> = {
  submitted: {
    label: DOCUMENT_STATUS_LABELS.submitted,
    className:
      'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-400/30',
    icon: Inbox,
  },
  received: {
    label: DOCUMENT_STATUS_LABELS.received,
    className:
      'bg-amber-50 text-amber-700 ring-amber-600/25 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-400/30',
    icon: MailCheck,
  },
  reviewed: {
    label: DOCUMENT_STATUS_LABELS.reviewed,
    className:
      'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-950/50 dark:text-violet-300 dark:ring-violet-400/30',
    icon: Eye,
  },
  finalized: {
    label: DOCUMENT_STATUS_LABELS.finalized,
    className:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-400/30',
    icon: FileCheck,
  },
  returned: {
    label: DOCUMENT_STATUS_LABELS.returned,
    className:
      'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-400/30',
    icon: Undo2,
  },
}

function fmtDate(v?: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' })
}

function typeLabel(sub: DocumentSubmission): string {
  const base = DOCUMENT_TYPE_LABELS[sub.document_type as DocumentType] || String(sub.document_type)
  return sub.modification_number ? `${base} (${sub.modification_number}.)` : base
}

// ---------------------------------------------------------------------------
// Fő komponens
// ---------------------------------------------------------------------------

export function DocumentCenter({ level, data }: DocumentCenterProps) {
  const seasonYear = documentSeasonYear()
  // 2026-08-11 (5. kör, P2-#19): a szerver alapból csak egy ÉV-ABLAKOT tölt be
  // (szezon-év + előző év + naptári év), ezért az induló szűrő is konkrét év —
  // a „Minden év" kérésre tölti be a teljes archívumot.
  const serverLoadedYears = useMemo(
    () => data.loadedYears ?? data.years,
    [data.loadedYears, data.years],
  )
  const [yearFilter, setYearFilter] = useState<number | 'all'>(() =>
    (data.loadedYears ?? []).includes(seasonYear) ? seasonYear : 'all',
  )
  const [typeFilter, setTypeFilter] = useState<DocumentType | 'all'>('all')
  const [search, setSearch] = useState('')
  const [viewer, setViewer] = useState<DocumentSubmission | null>(null)
  const [returnTarget, setReturnTarget] = useState<DocumentSubmission | null>(null)
  const [returnNote, setReturnNote] = useState('')
  const [ackTarget, setAckTarget] = useState<DocumentSubmission | null>(null)
  const [ackNote, setAckNote] = useState('')
  const [isPending, startTransition] = useTransition()
  const [processingId, setProcessingId] = useState<string | null>(null)
  // Kérésre betöltött évek (P2-#19)
  const [extraByYear, setExtraByYear] = useState<Record<number, DocumentSubmission[]>>({})
  const [allYearsSubs, setAllYearsSubs] = useState<DocumentSubmission[] | null>(null)
  const [loadingYear, setLoadingYear] = useState<number | 'all' | null>(null)

  const loadedYears = useMemo(
    () => new Set<number>([...serverLoadedYears, ...Object.keys(extraByYear).map(Number)]),
    [serverLoadedYears, extraByYear],
  )

  /** A jelenleg rendelkezésre álló beküldések (alap-ablak + kérésre töltött évek). */
  const availableSubs = useMemo(() => {
    if (allYearsSubs) return allYearsSubs
    const extra = Object.values(extraByYear).flat()
    if (extra.length === 0) return data.submissions
    return [...data.submissions, ...extra].sort((a, b) =>
      (b.submitted_at || '').localeCompare(a.submitted_at || ''),
    )
  }, [data.submissions, extraByYear, allYearsSubs])

  /** Igaz, ha a KIVÁLASZTOTT év sorai még nincsenek a kliensen. */
  const yearPending =
    loadingYear !== null ||
    (!allYearsSubs && yearFilter !== 'all' && !loadedYears.has(yearFilter))

  async function selectYear(y: number | 'all') {
    const previous = yearFilter
    setYearFilter(y)
    if (allYearsSubs || loadingYear !== null) return
    if (y !== 'all' && loadedYears.has(y)) return
    setLoadingYear(y)
    try {
      const res = await getSubmissionsForYear(level, y === 'all' ? null : y)
      if (res.error) {
        // Hangos hiba + visszaállás az előző évre: a néma „nincs beküldés"
        // azt sugallná, hogy a gyülekezetek nem adtak le semmit abban az évben.
        toast.error(res.error)
        setYearFilter(previous)
        return
      }
      if (y === 'all') setAllYearsSubs(res.submissions)
      else setExtraByYear((prev) => ({ ...prev, [y]: res.submissions }))
    } catch {
      toast.error('A választott év dokumentumai most nem tölthetők be — próbálja újra.')
      setYearFilter(previous)
    } finally {
      setLoadingYear(null)
    }
  }

  // A mátrixnak konkrét év kell — „Minden év" mellett a beszámolási szezon éve.
  const matrixYear = yearFilter === 'all' ? seasonYear : yearFilter

  const q = search.trim().toLowerCase()

  const filteredCongs = useMemo(() => {
    if (!q) return data.congregations
    return data.congregations.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.dioceseName || '').toLowerCase().includes(q),
    )
  }, [data.congregations, q])

  const filteredSubs = useMemo(() => {
    return availableSubs.filter((s) => {
      if (yearFilter !== 'all' && s.year !== yearFilter) return false
      if (typeFilter !== 'all' && s.document_type !== typeFilter) return false
      if (q) {
        const name = (s.congregation_name || '').toLowerCase()
        const dio = (s.diocese_name || '').toLowerCase()
        if (!name.includes(q) && !dio.includes(q)) return false
      }
      return true
    })
  }, [availableSubs, yearFilter, typeFilter, q])

  // KPI-k a kiválasztott évre (típus-szűrő és kereső NÉLKÜL — az összképet mutatják).
  const kpiSubs = useMemo(
    () => availableSubs.filter((s) => yearFilter === 'all' || s.year === yearFilter),
    [availableSubs, yearFilter],
  )
  const kpi = useMemo(() => {
    let inProgress = 0
    let finalized = 0
    let forwarded = 0
    let returned = 0
    for (const s of kpiSubs) {
      if (s.forwarded_to_kerulet) forwarded += 1
      if (s.status === 'finalized') finalized += 1
      else if (s.status === 'returned') returned += 1
      else inProgress += 1
    }
    return { total: kpiSubs.length, inProgress, finalized, forwarded, returned }
  }, [kpiSubs])

  // Mátrix-cellák: (gyülekezet, típus) → alap-beküldés a mátrix-évre.
  const matrixCell = useMemo(() => {
    const map = new Map<string, DocumentSubmission>()
    for (const s of availableSubs) {
      if (s.year !== matrixYear) continue
      if (s.modification_number) continue // a mátrix az alapdokumentumot mutatja
      map.set(`${s.congregation_id}::${s.document_type}`, s)
    }
    return map
  }, [availableSubs, matrixYear])

  // Év-szerinti csoportosított lista („Minden év" nézethez).
  const listGroups = useMemo(() => {
    const groups = new Map<number, DocumentSubmission[]>()
    for (const s of filteredSubs) {
      if (!groups.has(s.year)) groups.set(s.year, [])
      groups.get(s.year)!.push(s)
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0])
  }, [filteredSubs])

  function runAction(id: string, fn: () => Promise<DocumentActionResult>, successMsg: string, after?: () => void) {
    setProcessingId(id)
    startTransition(async () => {
      const res = await fn()
      setProcessingId(null)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success(successMsg)
      after?.()
    })
  }

  function handleReturnSubmit() {
    if (!returnTarget) return
    const note = returnNote.trim()
    if (!note) {
      toast.error('Az indoklás megadása kötelező a visszaküldéshez.')
      return
    }
    runAction(
      returnTarget.id,
      () => updateSubmissionStatus(returnTarget.id, 'returned', note),
      'A dokumentum visszaküldve a gyülekezetnek javításra.',
      () => {
        setReturnTarget(null)
        setReturnNote('')
      },
    )
  }

  function handleAckSubmit() {
    if (!ackTarget) return
    runAction(
      ackTarget.id,
      () => acknowledgeKeruletReceipt(ackTarget.id, ackNote.trim() || null),
      'Az átvétel visszaigazolva a kerületben.',
      () => {
        setAckTarget(null)
        setAckNote('')
      },
    )
  }

  // Fail-closed hibaállapot (nincs feloldható hatókör / lekérdezési hiba).
  if (data.error) {
    return (
      <div className="card-raised border-amber-200 bg-amber-50/40 p-6 dark:border-amber-900/50 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div>
            <p className="font-heading text-base text-slate-800 dark:text-slate-100">
              A dokumentumközpont nem tölthető be
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{data.error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Fejléc: cím + kereső + szűrők ─────────────────────────────── */}
      <div className="card-raised overflow-hidden">
        <div className="border-b border-slate-200/60 bg-slate-50 px-5 py-4 dark:border-slate-700/60 dark:bg-slate-900/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Archive className="size-5 text-violet-700 dark:text-violet-400" />
              <div>
                <h3 className="font-heading text-lg text-slate-800 dark:text-slate-100">
                  Hivatalos dokumentumok
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {level === 'diocese'
                    ? 'A gyülekezetek beküldött évi dokumentumai — rendszerezve, minden évből.'
                    : 'A kerülethez véglegesítve vagy továbbítva érkezett dokumentumok — minden évből.'}
                </p>
              </div>
            </div>
            <div className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 sm:w-64 dark:border-slate-700 dark:bg-slate-900">
              <Search className="size-4 shrink-0 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Gyülekezet keresése…"
                className="h-7 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          {data.scopeNotice && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              <ShieldAlert className="size-3.5" />
              {data.scopeNotice}
            </p>
          )}
        </div>

        {/* Év-választó */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Év
          </span>
          <FilterChip active={yearFilter === 'all'} onClick={() => void selectYear('all')}>
            Minden év
          </FilterChip>
          {data.years.map((y) => (
            <FilterChip key={y} active={yearFilter === y} onClick={() => void selectYear(y)}>
              {y}.
            </FilterChip>
          ))}
          {/* 2026-08-11 (P2-#19): a régebbi évek kérésre töltődnek — jelezzük,
              hogy a lista épp érkezik (a 0 találat félrevezető lenne). */}
          {loadingYear !== null && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="size-3.5 animate-spin" />
              {loadingYear === 'all' ? 'Teljes archívum betöltése…' : `${loadingYear}. év betöltése…`}
            </span>
          )}
        </div>

        {/* Típus-szűrő chipek */}
        <div className="flex flex-wrap items-center gap-1.5 px-5 py-3">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Típus
          </span>
          <FilterChip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>
            Mind
          </FilterChip>
          {(Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map((t) => (
            <FilterChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
              {DOCUMENT_TYPE_LABELS[t]}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* ── KPI mini-kártyák ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniKpiCard
          icon={<Inbox className="size-4 text-sky-600 dark:text-sky-400" />}
          label="Beérkezett"
          value={yearPending ? '…' : kpi.total}
          hint={yearFilter === 'all' ? 'minden évből' : `${yearFilter}. évre`}
          tone="sky"
        />
        {level === 'diocese' ? (
          <MiniKpiCard
            icon={<MailCheck className="size-4 text-amber-600 dark:text-amber-400" />}
            label="Folyamatban"
            value={yearPending ? '…' : kpi.inProgress}
            hint="beküldve / átvéve / ellenőrizve"
            tone="amber"
          />
        ) : (
          <MiniKpiCard
            icon={<Send className="size-4 text-amber-600 dark:text-amber-400" />}
            label="Továbbítva"
            value={yearPending ? '…' : kpi.forwarded}
            hint="a kerülethez érkezett"
            tone="amber"
          />
        )}
        <MiniKpiCard
          icon={<FileCheck className="size-4 text-emerald-600 dark:text-emerald-400" />}
          label="Véglegesített"
          value={yearPending ? '…' : kpi.finalized}
          hint={level === 'diocese' ? 'lezárt hivatalos irat' : 'a megyénél lezárva'}
          tone="emerald"
        />
        <MiniKpiCard
          icon={<Undo2 className="size-4 text-rose-600 dark:text-rose-400" />}
          label="Visszaküldött"
          value={yearPending ? '…' : kpi.returned}
          hint="javításra visszaadva"
          tone="rose"
        />
      </div>

      {/* ── Teljességi mátrix ─────────────────────────────────────────── */}
      <CompletenessMatrix
        level={level}
        congregations={filteredCongs}
        matrixCell={matrixCell}
        matrixYear={matrixYear}
        /* 2026-08-11 (P2-#19): amíg a választott év sorai töltődnek, a mátrix
           MINDEN cellája „Hiányzik" lenne — ez a legveszélyesebb néma hiba
           ezen a felületen (azt sugallná, hogy egyetlen gyülekezet sem adta
           le az iratait). Ezért ilyenkor betöltés-jelzést mutatunk. */
        loading={yearPending}
        onOpen={(sub) => setViewer(sub)}
      />

      {/* ── Dokumentumlista ───────────────────────────────────────────── */}
      <div className="card-raised overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 bg-slate-50 px-5 py-3.5 dark:border-slate-700/60 dark:bg-slate-900/40">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-sky-700 dark:text-sky-400" />
            <h4 className="font-heading text-base text-slate-800 dark:text-slate-100">
              Beküldött dokumentumok
            </h4>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {yearPending ? 'betöltés…' : `${filteredSubs.length} találat`}
            {yearFilter !== 'all' ? ` · ${yearFilter}. év` : ' · minden év'}
            {/* A teljes archívum darabszáma akkor is látszik, ha csak az
                alap év-ablak van betöltve (2026-08-11, P2-#19). */}
            {typeof data.totalCount === 'number' ? ` · archívum: ${data.totalCount.toLocaleString('hu-HU')}` : ''}
          </span>
        </div>

        {yearPending ? (
          <div className="p-10 text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              A dokumentumok betöltése folyamatban…
            </p>
          </div>
        ) : filteredSubs.length === 0 ? (
          <div className="p-10 text-center">
            <Inbox className="mx-auto size-10 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Nincs a szűrésnek megfelelő beküldött dokumentum.
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {level === 'diocese'
                ? 'A gyülekezetek a véglegesítés után küldik be az iratokat.'
                : 'Az egyházmegyék a bírálat után véglegesítik és továbbítják az iratokat.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {listGroups.map(([year, subs]) => (
              <div key={year}>
                {listGroups.length > 1 && (
                  <div className="bg-slate-50/70 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
                    {year}. év
                  </div>
                )}
                {subs.map((sub) => (
                  <SubmissionRow
                    key={sub.id}
                    sub={sub}
                    level={level}
                    busy={isPending && processingId === sub.id}
                    onView={() => setViewer(sub)}
                    onAdvance={(next) =>
                      runAction(
                        sub.id,
                        () => updateSubmissionStatus(sub.id, next),
                        `Státusz frissítve: ${DOCUMENT_STATUS_LABELS[next]}`,
                      )
                    }
                    onForward={() =>
                      runAction(
                        sub.id,
                        () => forwardToKerulet(sub.id),
                        'A dokumentum továbbítva az egyházkerületnek.',
                      )
                    }
                    onReturn={() => {
                      setReturnTarget(sub)
                      setReturnNote('')
                    }}
                    onAcknowledge={() => {
                      setAckTarget(sub)
                      setAckNote('')
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Snapshot-néző dialógus ────────────────────────────────────── */}
      <SnapshotDialog sub={viewer} level={level} onClose={() => setViewer(null)} />

      {/* ── Visszaküldés dialógus (kötelező indoklás) ─────────────────── */}
      <Dialog open={!!returnTarget} onOpenChange={(o) => { if (!o) setReturnTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="size-4 text-rose-600" />
              Visszaküldés a gyülekezetnek
            </DialogTitle>
            <DialogDescription>
              {returnTarget
                ? `${returnTarget.congregation_name} — ${typeLabel(returnTarget)}, ${returnTarget.year}. év`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Indoklás a gyülekezetnek (kötelező)
            </label>
            <Textarea
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              rows={4}
              placeholder="Pl. „A számadás 3. sora nem egyezik a mellékelt jegyzőkönyvvel — kérjük javítva újra beküldeni."
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              A gyülekezet lelkésze értesítést kap, a dokumentum újra beküldhetővé
              válik. Az indoklás bekerül a dokumentum naplójába.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-lg" onClick={() => setReturnTarget(null)}>
              Mégse
            </Button>
            <Button
              className="rounded-lg bg-rose-600 text-white hover:bg-rose-700"
              onClick={handleReturnSubmit}
              disabled={isPending}
            >
              <Undo2 className="mr-1 size-3.5" />
              Visszaküldés
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Kerületi átvétel visszaigazolása ──────────────────────────── */}
      <Dialog open={!!ackTarget} onOpenChange={(o) => { if (!o) setAckTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-4 text-emerald-600" />
              Átvétel visszaigazolása a kerületben
            </DialogTitle>
            <DialogDescription>
              {ackTarget
                ? `${ackTarget.congregation_name} — ${typeLabel(ackTarget)}, ${ackTarget.year}. év`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Megjegyzés (nem kötelező)
            </label>
            <Textarea
              value={ackNote}
              onChange={(e) => setAckNote(e.target.value)}
              rows={3}
              placeholder="Pl. „Az irat a kerületi levéltárba iktatva: 123/2026."
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              A visszaigazolás időbélyeggel bekerül a dokumentum naplójába — az
              egyházmegye is látja.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-lg" onClick={() => setAckTarget(null)}>
              Mégse
            </Button>
            <Button
              className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={handleAckSubmit}
              disabled={isPending}
            >
              <ClipboardCheck className="mr-1 size-3.5" />
              Átvétel igazolása
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fejléc-szűrő chip
// ---------------------------------------------------------------------------

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-violet-600 text-white shadow-sm dark:bg-violet-500'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// KPI mini-kártya
// ---------------------------------------------------------------------------

function MiniKpiCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode
  label: string
  /** 2026-08-11 (P2-#19): string is lehet („…"), amíg az adott év sorai töltődnek. */
  value: number | string
  hint?: string
  tone: 'sky' | 'amber' | 'emerald' | 'rose'
}) {
  const toneClasses: Record<string, string> = {
    sky: 'border-sky-200 bg-sky-50/60 dark:border-sky-900/50 dark:bg-sky-950/20',
    amber: 'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20',
    emerald: 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20',
    rose: 'border-rose-200 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20',
  }
  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          {label}
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold leading-tight text-slate-800 dark:text-slate-100">
        {typeof value === 'number' ? value.toLocaleString('hu-HU') : value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Teljességi mátrix
// ---------------------------------------------------------------------------

function CompletenessMatrix({
  level,
  congregations,
  matrixCell,
  matrixYear,
  loading,
  onOpen,
}: {
  level: 'diocese' | 'district'
  congregations: DocumentCenterData['congregations']
  matrixCell: Map<string, DocumentSubmission>
  matrixYear: number
  /** Az adott év beküldései még töltődnek — ne mutassunk hamis „Hiányzik"-ot. */
  loading?: boolean
  onOpen: (sub: DocumentSubmission) => void
}) {
  const perTypeCounts = useMemo(() => {
    const counts = new Map<DocumentType, number>()
    for (const t of REQUIRED_DOCUMENT_TYPES) counts.set(t, 0)
    for (const c of congregations) {
      for (const t of REQUIRED_DOCUMENT_TYPES) {
        if (matrixCell.has(`${c.id}::${t}`)) counts.set(t, (counts.get(t) || 0) + 1)
      }
    }
    return counts
  }, [congregations, matrixCell])

  return (
    <div className="card-raised overflow-hidden">
      <div className="border-b border-slate-200/60 bg-slate-50 px-5 py-3.5 dark:border-slate-700/60 dark:bg-slate-900/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4 text-emerald-700 dark:text-emerald-400" />
            <h4 className="font-heading text-base text-slate-800 dark:text-slate-100">
              Teljességi mátrix — {matrixYear}. év
            </h4>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {congregations.length} gyülekezet · ki adta be, ki nem
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Minden gyülekezet szerepel — a hiányzó beküldés is látszik.
          {level === 'district' && ' A kerület a véglegesített / továbbított dokumentumokat látja.'}
        </p>
      </div>

      {loading ? (
        <div className="p-10 text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            A(z) {matrixYear}. év beküldései töltődnek — egy pillanat.
          </p>
        </div>
      ) : congregations.length === 0 ? (
        <div className="p-10 text-center">
          <Building2 className="mx-auto size-10 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Nincs a keresésnek megfelelő gyülekezet a hatókörben.
          </p>
        </div>
      ) : (
        <>
          {/* Asztali: táblázat */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 dark:bg-slate-900/40">
                <tr>
                  <th className="sticky left-0 z-10 min-w-[180px] bg-slate-50/95 p-2.5 text-left text-xs font-medium text-slate-500 dark:bg-slate-900/95 dark:text-slate-400">
                    Gyülekezet
                  </th>
                  {REQUIRED_DOCUMENT_TYPES.map((t) => (
                    <th
                      key={t}
                      className="min-w-[112px] p-2.5 text-center text-[10px] font-medium text-slate-500 dark:text-slate-400"
                      title={`Határidő: ${DOCUMENT_DEADLINES[t]}`}
                    >
                      {DOCUMENT_TYPE_LABELS[t]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {congregations.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/30">
                    <td className="sticky left-0 z-10 bg-white p-2.5 dark:bg-slate-950">
                      <p className="font-medium text-slate-700 dark:text-slate-200">{c.name}</p>
                      {level === 'district' && c.dioceseName && (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">{c.dioceseName}</p>
                      )}
                    </td>
                    {REQUIRED_DOCUMENT_TYPES.map((t) => {
                      const sub = matrixCell.get(`${c.id}::${t}`)
                      return (
                        <td key={t} className="p-2.5 text-center">
                          <MatrixCell sub={sub} onOpen={onOpen} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200/60 bg-slate-50/60 dark:border-slate-700/60 dark:bg-slate-900/40">
                  <td className="sticky left-0 z-10 bg-slate-50/95 p-2.5 text-xs font-semibold text-slate-600 dark:bg-slate-900/95 dark:text-slate-300">
                    Beadta
                  </td>
                  {REQUIRED_DOCUMENT_TYPES.map((t) => {
                    const n = perTypeCounts.get(t) || 0
                    const full = n >= congregations.length && congregations.length > 0
                    return (
                      <td
                        key={t}
                        className={`p-2.5 text-center text-xs font-semibold ${
                          full
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {n} / {congregations.length}
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobil: gyülekezet-kártyák */}
          <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
            {congregations.map((c) => (
              <div key={c.id} className="px-4 py-3">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{c.name}</p>
                {level === 'district' && c.dioceseName && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">{c.dioceseName}</p>
                )}
                <div className="mt-2 grid grid-cols-1 gap-1.5">
                  {REQUIRED_DOCUMENT_TYPES.map((t) => {
                    const sub = matrixCell.get(`${c.id}::${t}`)
                    return (
                      <div key={t} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">
                          {DOCUMENT_TYPE_LABELS[t]}
                        </span>
                        <MatrixCell sub={sub} onOpen={onOpen} />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function MatrixCell({
  sub,
  onOpen,
}: {
  sub: DocumentSubmission | undefined
  onOpen: (sub: DocumentSubmission) => void
}) {
  if (!sub) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-400/25">
        Hiányzik
      </span>
    )
  }
  const cfg = STATUS_UI[sub.status as DocumentStatus] || STATUS_UI.submitted
  const Icon = cfg.icon
  return (
    <button
      type="button"
      onClick={() => onOpen(sub)}
      title="Megtekintés"
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset transition hover:brightness-95 ${cfg.className}`}
    >
      <Icon className="size-3" />
      {cfg.label}
      {sub.forwarded_to_kerulet && <Send className="size-2.5" />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Dokumentum-sor a listában
// ---------------------------------------------------------------------------

function SubmissionRow({
  sub,
  level,
  busy,
  onView,
  onAdvance,
  onForward,
  onReturn,
  onAcknowledge,
}: {
  sub: DocumentSubmission
  level: 'diocese' | 'district'
  busy: boolean
  onView: () => void
  onAdvance: (next: DocumentStatus) => void
  onForward: () => void
  onReturn: () => void
  onAcknowledge: () => void
}) {
  const cfg = STATUS_UI[sub.status as DocumentStatus] || STATUS_UI.submitted
  const StatusIcon = cfg.icon

  const nextStatus: DocumentStatus | null =
    sub.status === 'submitted'
      ? 'received'
      : sub.status === 'received'
        ? 'reviewed'
        : sub.status === 'reviewed'
          ? 'finalized'
          : null
  const nextLabel =
    nextStatus === 'received' ? 'Átvétel' : nextStatus === 'reviewed' ? 'Áttekintve' : 'Véglegesítés'

  return (
    <div className="px-5 py-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Bal: alapadatok */}
        <button
          type="button"
          onClick={onView}
          className="flex min-w-0 flex-1 items-start gap-3 text-left hover:opacity-80"
        >
          <span
            className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${cfg.className}`}
          >
            <StatusIcon className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-medium text-slate-800 dark:text-slate-100">
                {sub.congregation_name}
              </span>
              {level === 'district' && sub.diocese_name && (
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {sub.diocese_name}
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
              {typeLabel(sub)} · {sub.year}. év · beküldve: {fmtDate(sub.submitted_at)}
            </span>
            {/* Kompakt idővonal (sm+) */}
            <span className="mt-1.5 hidden sm:block">
              <StatusTimeline sub={sub} compact />
            </span>
          </span>
        </button>

        {/* Jobb: státusz + akciók */}
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${cfg.className}`}
          >
            <StatusIcon className="size-3" />
            {cfg.label}
          </span>
          {sub.forwarded_to_kerulet && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-400/30">
              <Send className="size-3" />
              Kerületnél
            </span>
          )}

          <Button
            size="sm"
            variant="outline"
            className="rounded-lg"
            onClick={onView}
            disabled={busy}
          >
            <Eye className="mr-1 size-3.5" />
            Megtekintés
          </Button>

          {level === 'diocese' && !sub.forwarded_to_kerulet && (
            <>
              {nextStatus && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg border-sky-200 text-sky-700 hover:bg-sky-50 dark:border-sky-900 dark:text-sky-300 dark:hover:bg-sky-950/40"
                  onClick={() => onAdvance(nextStatus)}
                  disabled={busy}
                >
                  <CheckCircle2 className="mr-1 size-3.5" />
                  {nextLabel}
                </Button>
              )}
              {sub.status === 'finalized' && (
                <Button
                  size="sm"
                  className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={onForward}
                  disabled={busy}
                >
                  <Send className="mr-1 size-3.5" />
                  Kerületnek
                </Button>
              )}
              {sub.status !== 'returned' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
                  onClick={onReturn}
                  disabled={busy}
                >
                  <Undo2 className="mr-1 size-3.5" />
                  Visszaküldés
                </Button>
              )}
            </>
          )}

          {level === 'district' && sub.forwarded_to_kerulet && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
              onClick={onAcknowledge}
              disabled={busy}
            >
              <ClipboardCheck className="mr-1 size-3.5" />
              Átvétel igazolása
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Státusz-idővonal
// ---------------------------------------------------------------------------

function StatusTimeline({ sub, compact }: { sub: DocumentSubmission; compact?: boolean }) {
  const returned = sub.status === 'returned'
  const steps: Array<{ label: string; at: string | null | undefined; done: boolean }> = [
    { label: 'Beküldve', at: sub.submitted_at, done: true },
    { label: 'Átvéve', at: sub.received_at, done: !!sub.received_at },
    { label: 'Ellenőrizve', at: sub.reviewed_at, done: !!sub.reviewed_at },
    { label: 'Véglegesítve', at: sub.finalized_at, done: sub.status === 'finalized' },
    { label: 'Kerületnél', at: sub.forwarded_at, done: sub.forwarded_to_kerulet },
  ]

  if (compact) {
    return (
      <span className="flex items-center gap-1">
        {steps.map((s, i) => (
          <span key={s.label} className="flex items-center gap-1" title={`${s.label}: ${fmtDate(s.at)}`}>
            {i > 0 && (
              <span
                className={`h-px w-3 ${s.done ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700'}`}
              />
            )}
            <span
              className={`size-1.5 rounded-full ${
                s.done ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            />
          </span>
        ))}
        {returned && (
          <span className="ml-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
            visszaküldve
          </span>
        )}
      </span>
    )
  }

  return (
    <div className="space-y-1.5">
      {steps.map((s) => (
        <div key={s.label} className="flex items-center gap-2 text-sm">
          <span
            className={`size-2 shrink-0 rounded-full ${
              s.done ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
            }`}
          />
          <span
            className={
              s.done
                ? 'font-medium text-slate-700 dark:text-slate-200'
                : 'text-slate-400 dark:text-slate-500'
            }
          >
            {s.label}
          </span>
          <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{fmtDate(s.at)}</span>
        </div>
      ))}
      {returned && (
        <div className="flex items-center gap-2 text-sm">
          <span className="size-2 shrink-0 rounded-full bg-rose-500" />
          <span className="font-medium text-rose-700 dark:text-rose-300">
            Visszaküldve javításra
          </span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Snapshot-néző dialógus + nyomtatás
// ---------------------------------------------------------------------------

/**
 * 2026-08-11 (5. kör, P2-#19): a fagyasztott pillanatkép (`snapshot_data`) MÁR
 * NEM utazik a listával — ez a dialógus kéri le, a megnyitás pillanatában,
 * darabonként. Így az évi több MB-os jsonb-tömeg eltűnt az oldal
 * RSC-csomagjából, viszont a részletkártya tartalma változatlan.
 */
function SnapshotDialog({
  sub,
  level,
  onClose,
}: {
  sub: DocumentSubmission | null
  level: 'diocese' | 'district'
  onClose: () => void
}) {
  // A pillanatképeket beküldés-azonosító szerint gyűjtjük, így a dialógus
  // állapota SZÁRMAZTATHATÓ — az effect csak a szerver-akcióval szinkronizál,
  // nem állít be state-et a törzsében (cascading render).
  const [snapById, setSnapById] = useState<Record<string, Record<string, unknown>>>({})
  const [errorById, setErrorById] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!sub || sub.snapshot_data) return
    if (snapById[sub.id] !== undefined || errorById[sub.id] !== undefined) return
    const id = sub.id
    let cancelled = false
    getSubmissionSnapshot(id, level)
      .then((res) => {
        if (cancelled) return
        if (res.error) setErrorById((prev) => ({ ...prev, [id]: res.error as string }))
        else setSnapById((prev) => ({ ...prev, [id]: res.snapshot ?? {} }))
      })
      .catch(() => {
        if (cancelled) return
        setErrorById((prev) => ({
          ...prev,
          [id]: 'A beküldött adatok most nem tölthetők be — próbálja újra.',
        }))
      })
    return () => {
      cancelled = true
    }
  }, [sub, level, snapById, errorById])

  const snapshot = sub ? sub.snapshot_data ?? snapById[sub.id] ?? null : null
  const snapError = sub ? errorById[sub.id] ?? null : null
  const snapLoading = !!sub && snapshot === null && snapError === null

  async function handlePrint() {
    if (!sub || snapshot === null) return
    try {
      await printToBrowser(buildSubmissionPrintHtml(sub, snapshot))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A nyomtatás nem indítható el.')
    }
  }

  return (
    <Dialog open={!!sub} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        {sub && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="size-4 text-violet-600" />
                {typeLabel(sub)} — {sub.year}. év
              </DialogTitle>
              <DialogDescription>
                {sub.congregation_name}
                {sub.diocese_name ? ` · ${sub.diocese_name}` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Idővonal */}
              <div className="rounded-xl bg-slate-50/70 p-3.5 dark:bg-slate-900/40">
                <StatusTimeline sub={sub} />
              </div>

              {/* Napló (notes) */}
              {sub.notes && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Dokumentum-napló
                  </p>
                  <pre className="mt-1.5 whitespace-pre-wrap break-words font-sans text-sm text-slate-700 dark:text-slate-200">
                    {sub.notes}
                  </pre>
                </div>
              )}

              {/* Snapshot tartalom — kérésre töltve (P2-#19) */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Beküldött adatok (fagyasztott pillanatkép)
                </p>
                {snapLoading ? (
                  <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <Loader2 className="size-4 animate-spin" />
                    A beküldött adatok betöltése…
                  </p>
                ) : snapError ? (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                    <span>{snapError}</span>
                  </div>
                ) : (
                  <SnapshotView sub={sub} snap={snapshot ?? {}} />
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" className="rounded-lg" onClick={onClose}>
                Bezárás
              </Button>
              <Button
                className="rounded-lg"
                onClick={handlePrint}
                disabled={snapLoading || snapshot === null}
                title={
                  snapshot === null
                    ? 'A nyomtatáshoz előbb be kell töltődnie a beküldött adatoknak.'
                    : undefined
                }
              >
                <Printer className="mr-1 size-3.5" />
                Nyomtatás
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Strukturált snapshot-megjelenítés az ismert alakokra, JSON-fallbackkel. */
function SnapshotView({ sub, snap }: { sub: DocumentSubmission; snap: Record<string, unknown> }) {
  const type = sub.document_type as DocumentType

  if (type === 'vagyonleltar') {
    return (
      <StatPair
        stats={[
          { label: 'Leltári tételek száma', value: String(numOr(snap.itemCount, 0)) },
          { label: 'Leltári év', value: `${numOr(snap.year, sub.year)}.` },
        ]}
        note="A vagyonleltári beküldés összesítő adat — a tételes leltár a gyülekezeti Leltár modulban él."
      />
    )
  }

  if (type === 'valasztok_nevjegyzeke') {
    return (
      <StatPair
        stats={[
          { label: 'Választásra jogosultak', value: `${numOr(snap.voterCount, 0)} fő` },
          { label: 'Év', value: `${numOr(snap.year, sub.year)}.` },
        ]}
        note={
          snap.rule === 'eligible_and_paid_or_exempt'
            ? 'Kanonikus szabály: jogosult ÉS járulékot fizetett vagy felmentett.'
            : snap.rule
              ? `Szabály: ${String(snap.rule)}`
              : undefined
        }
      />
    )
  }

  if (type === 'szamadas') {
    const income = recordOfNumbers(snap.income)
    const expense = recordOfNumbers(snap.expense)
    const totalIncome = numOr(snap.totalIncome, sumValues(income))
    const totalExpense = numOr(snap.totalExpense, sumValues(expense))
    return (
      <div className="space-y-3">
        <StatPair
          stats={[
            { label: 'Összes bevétel', value: `${formatCurrency(totalIncome)} RON` },
            { label: 'Összes kiadás', value: `${formatCurrency(totalExpense)} RON` },
            { label: 'Egyenleg', value: `${formatCurrency(totalIncome - totalExpense)} RON` },
          ]}
        />
        {Boolean(snap.jegyzokonyviSzam || snap.targyalasDatuma) && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {snap.jegyzokonyviSzam ? `Jegyzőkönyvi szám: ${String(snap.jegyzokonyviSzam)}` : ''}
            {snap.jegyzokonyviSzam && snap.targyalasDatuma ? ' · ' : ''}
            {snap.targyalasDatuma ? `Tárgyalás dátuma: ${String(snap.targyalasDatuma)}` : ''}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <CodeAmountTable title="Bevételek kódonként" rows={income} />
          <CodeAmountTable title="Kiadások kódonként" rows={expense} />
        </div>
      </div>
    )
  }

  if (type === 'koltsegvetes' || type === 'koltsegvetes_modositas') {
    const budgetData = snap.budgetData
    const rows = budgetData && typeof budgetData === 'object' ? Object.values(budgetData as Record<string, unknown>) : []
    const parsed = rows
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map((r) => ({
        code: String(r.szamadasicelid ?? ''),
        tervezett: numOrNull(r.tervezett),
        mod1: numOrNull(r.modositott),
        mod2: numOrNull(r.mod2),
        mod3: numOrNull(r.mod3),
      }))
      .filter((r) => r.code)
      .sort((a, b) => a.code.localeCompare(b.code, 'hu'))
    const hasMods = parsed.some((r) => r.mod1 != null || r.mod2 != null || r.mod3 != null)
    if (parsed.length === 0) return <JsonFallback snap={snap} />
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/40">
            <tr>
              <th className="p-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Kód</th>
              <th className="p-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Tervezett</th>
              {hasMods && (
                <>
                  <th className="p-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Mód. 1</th>
                  <th className="p-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Mód. 2</th>
                  <th className="p-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Mód. 3</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {parsed.map((r) => (
              <tr key={r.code}>
                <td className="p-2 font-mono text-xs text-slate-600 dark:text-slate-300">{r.code}</td>
                <td className="p-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                  {r.tervezett != null ? formatCurrency(r.tervezett) : '—'}
                </td>
                {hasMods && (
                  <>
                    <td className="p-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                      {r.mod1 != null ? formatCurrency(r.mod1) : '—'}
                    </td>
                    <td className="p-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                      {r.mod2 != null ? formatCurrency(r.mod2) : '—'}
                    </td>
                    <td className="p-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                      {r.mod3 != null ? formatCurrency(r.mod3) : '—'}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // lelkeszi_jelentes + minden egyéb: elsőszintű primitívek + JSON-részletek.
  return <JsonFallback snap={snap} />
}

function JsonFallback({ snap }: { snap: Record<string, unknown> }) {
  const primitives = Object.entries(snap).filter(
    ([, v]) => v == null || ['string', 'number', 'boolean'].includes(typeof v),
  )
  const complex = Object.entries(snap).filter(
    ([, v]) => v != null && !['string', 'number', 'boolean'].includes(typeof v),
  )
  if (primitives.length === 0 && complex.length === 0) {
    return (
      <p className="text-sm italic text-slate-500 dark:text-slate-400">
        A beküldés nem tartalmaz megjeleníthető pillanatkép-adatot.
      </p>
    )
  }
  return (
    <div className="space-y-3">
      {primitives.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          {primitives.map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 dark:border-slate-800"
            >
              <span className="text-slate-500 dark:text-slate-400">{k}</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {v == null ? '—' : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}
      {complex.length > 0 && (
        <details className="rounded-xl border border-slate-200 dark:border-slate-700">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            Részletes adatok (JSON)
          </summary>
          <pre className="max-h-72 overflow-auto px-3 pb-3 text-xs text-slate-600 dark:text-slate-300">
            {JSON.stringify(Object.fromEntries(complex), null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}

function StatPair({
  stats,
  note,
}: {
  stats: Array<{ label: string; value: string }>
  note?: string
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl bg-slate-50/80 px-3 py-2.5 ring-1 ring-slate-200/60 dark:bg-slate-900/40 dark:ring-slate-700/60"
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {s.label}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">{s.value}</p>
          </div>
        ))}
      </div>
      {note && <p className="mt-2 text-xs italic text-slate-500 dark:text-slate-400">{note}</p>}
    </div>
  )
}

function CodeAmountTable({ title, rows }: { title: string; rows: Record<string, number> }) {
  const entries = Object.entries(rows).sort((a, b) => a[0].localeCompare(b[0], 'hu'))
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <p className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
        {title}
      </p>
      {entries.length === 0 ? (
        <p className="px-3 py-2 text-xs italic text-slate-400 dark:text-slate-500">Nincs tétel.</p>
      ) : (
        <div className="max-h-56 overflow-y-auto">
          {entries.map(([code, amount]) => (
            <div
              key={code}
              className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-1.5 text-sm last:border-b-0 dark:border-slate-800"
            >
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{code}</span>
              <span className="tabular-nums text-slate-700 dark:text-slate-200">
                {formatCurrency(amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Snapshot-guardok (ismeretlen JSON biztonságos olvasása)
// ---------------------------------------------------------------------------

function numOr(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function recordOfNumbers(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, number> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const n = typeof val === 'number' ? val : Number(val)
    if (Number.isFinite(n)) out[k] = n
  }
  return out
}

function sumValues(rec: Record<string, number>): number {
  return Object.values(rec).reduce((s, n) => s + n, 0)
}

// ---------------------------------------------------------------------------
// Nyomtatvány (A4 .sheet, printToBrowser) — a lib/inventory/item-card-print.ts
// bevált sémájára építve, egyszerűsítve.
// ---------------------------------------------------------------------------

function escHtml(v: string): string {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function buildSubmissionPrintHtml(
  sub: DocumentSubmission,
  /** 2026-08-11 (P2-#19): a pillanatkép külön érkezik (nincs a listában). */
  snap: Record<string, unknown>,
): string {
  const type = sub.document_type as DocumentType
  const label = typeLabel(sub)

  const metaRows: Array<[string, string]> = [
    ['Gyülekezet', sub.congregation_name || 'Ismeretlen'],
    ...(sub.diocese_name ? ([['Egyházmegye', sub.diocese_name]] as Array<[string, string]>) : []),
    ['Dokumentum', label],
    ['Év', `${sub.year}.`],
    ['Státusz', DOCUMENT_STATUS_LABELS[sub.status as DocumentStatus] || String(sub.status)],
    ['Beküldve', fmtDate(sub.submitted_at)],
    ['Átvéve', fmtDate(sub.received_at)],
    ['Ellenőrizve', fmtDate(sub.reviewed_at)],
    ['Véglegesítve', fmtDate(sub.finalized_at)],
    ['Kerületnek továbbítva', sub.forwarded_to_kerulet ? fmtDate(sub.forwarded_at) : '—'],
  ]

  let body = ''
  if (type === 'szamadas') {
    const income = recordOfNumbers(snap.income)
    const expense = recordOfNumbers(snap.expense)
    const totalIncome = numOr(snap.totalIncome, sumValues(income))
    const totalExpense = numOr(snap.totalExpense, sumValues(expense))
    const table = (title: string, rows: Record<string, number>) => `
      <h2>${escHtml(title)}</h2>
      <table>
        <thead><tr><th>Kód</th><th class="num">Összeg (RON)</th></tr></thead>
        <tbody>
          ${Object.entries(rows)
            .sort((a, b) => a[0].localeCompare(b[0], 'hu'))
            .map(([code, amount]) => `<tr><td>${escHtml(code)}</td><td class="num">${escHtml(formatCurrency(amount))}</td></tr>`)
            .join('')}
        </tbody>
      </table>`
    body = `
      <div class="totals">
        <div><span>Összes bevétel</span><strong>${escHtml(formatCurrency(totalIncome))} RON</strong></div>
        <div><span>Összes kiadás</span><strong>${escHtml(formatCurrency(totalExpense))} RON</strong></div>
        <div><span>Egyenleg</span><strong>${escHtml(formatCurrency(totalIncome - totalExpense))} RON</strong></div>
      </div>
      ${table('Bevételek kódonként', income)}
      ${table('Kiadások kódonként', expense)}`
  } else {
    const primitives = Object.entries(snap).filter(
      ([, v]) => v == null || ['string', 'number', 'boolean'].includes(typeof v),
    )
    body = `
      <h2>Beküldött adatok</h2>
      <table>
        <tbody>
          ${primitives
            .map(([k, v]) => `<tr><td>${escHtml(k)}</td><td class="num">${escHtml(v == null ? '—' : String(v))}</td></tr>`)
            .join('')}
        </tbody>
      </table>`
  }

  const notesBlock = sub.notes
    ? `<h2>Dokumentum-napló</h2><pre class="notes">${escHtml(sub.notes)}</pre>`
    : ''

  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8" />
<title>${escHtml(label)} — ${escHtml(sub.congregation_name || '')} (${sub.year})</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1c2430; margin: 0; background: #e2e8f0; padding: 18px 0; }
  .sheet { width: 210mm; min-height: 297mm; margin: 0 auto 18px; background: #fff; box-shadow: 0 18px 40px rgba(15,23,42,.12); padding: 16mm 18mm; page-break-after: always; }
  .sheet:last-child { page-break-after: auto; margin-bottom: 0; }
  @media print { body { background: #fff; padding: 0; } .sheet { margin: 0; box-shadow: none; min-height: 296mm; } }
  .head { border-bottom: 3px double #4c5a7a; padding-bottom: 8px; }
  .head .eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: .2em; color: #64748b; }
  .head h1 { margin: 3px 0 0; font-size: 20px; color: #1e2a4a; }
  .head .sub { margin-top: 2px; font-size: 12px; font-style: italic; color: #64748b; }
  .meta { margin-top: 12px; width: 100%; border-collapse: collapse; }
  .meta td { padding: 3px 0; font-size: 12px; border-bottom: 1px dotted #cbd5e1; }
  .meta td:first-child { width: 42mm; color: #64748b; font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; }
  h2 { margin: 16px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .16em; color: #4c5a7a; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 3px 6px; border-bottom: 1px solid #e2e8f0; text-align: left; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: #64748b; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .totals { display: flex; gap: 18px; margin-top: 12px; }
  .totals div { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; }
  .totals span { display: block; font-size: 9.5px; text-transform: uppercase; letter-spacing: .12em; color: #64748b; }
  .totals strong { font-size: 14px; }
  .notes { white-space: pre-wrap; font-family: inherit; font-size: 11.5px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; }
  .foot { margin-top: 14mm; display: flex; justify-content: space-between; font-size: 9.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 6px; }
</style>
</head>
<body data-sheet-count="1">
  <div class="sheet">
    <div class="head">
      <p class="eyebrow">Kartotéka — hivatalos beküldés</p>
      <h1>${escHtml(label)} — ${sub.year}. év</h1>
      <p class="sub">${escHtml(sub.congregation_name || 'Ismeretlen gyülekezet')}${sub.diocese_name ? ` · ${escHtml(sub.diocese_name)}` : ''}</p>
    </div>
    <table class="meta">
      <tbody>
        ${metaRows.map(([k, v]) => `<tr><td>${escHtml(k)}</td><td>${escHtml(v)}</td></tr>`).join('')}
      </tbody>
    </table>
    ${body}
    ${notesBlock}
    <div class="foot">
      <span>Nyomtatva: ${escHtml(new Date().toLocaleDateString('hu-HU'))}</span>
      <span>Kartotéka dokumentumközpont</span>
    </div>
  </div>
</body>
</html>`
}
