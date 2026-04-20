'use client'

import { useState, useTransition } from 'react'
import {
  CheckCircle2,
  Eye,
  FileCheck,
  FileText,
  MailCheck,
  Send,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  forwardAnnualReportToKerulet,
  updateAnnualReportStatus,
  type AnnualReportRow,
} from '@/app/(dashboard)/eves-jelentes/actions'
import type { AnnualReportSnapshot } from '@/lib/annual-report/generator'
import { formatCurrency } from '@/lib/constants/finance'

type DioceseReport = AnnualReportRow & { congregation_name: string | null }

interface DioceseAnnualReportsPanelProps {
  reports: DioceseReport[]
  year: number
}

export function DioceseAnnualReportsPanel({ reports, year }: DioceseAnnualReportsPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reviewNotesMap, setReviewNotesMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(reports.map(r => [r.id, r.review_notes || ''])),
  )
  const [isPending, startTransition] = useTransition()

  function setReviewNote(id: string, value: string) {
    setReviewNotesMap(prev => ({ ...prev, [id]: value }))
  }

  function handleStatusUpdate(report: DioceseReport, newStatus: 'received' | 'reviewed' | 'finalized') {
    const reviewNotes =
      newStatus === 'reviewed' ? (reviewNotesMap[report.id] || '').trim() || null : undefined

    startTransition(async () => {
      const result = await updateAnnualReportStatus({
        id: report.id,
        newStatus,
        reviewNotes,
      })
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      const labels = {
        received: 'Átvéve',
        reviewed: 'Ellenőrizve',
        finalized: 'Véglegesítve',
      }
      toast.success(`A jelentés státusza módosítva: ${labels[newStatus]}`)
    })
  }

  function handleForward(report: DioceseReport) {
    startTransition(async () => {
      const result = await forwardAnnualReportToKerulet(report.id)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success('A jelentés továbbítva az egyházkerületnek.')
    })
  }

  if (reports.length === 0) {
    return (
      <div className="card-raised p-8 text-center">
        <FileText className="mx-auto mb-2 h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">
          Még nem érkezett be éves jelentés a {year}. évre.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Ha a gyülekezet leadja a jelentését, itt fog megjelenni feldolgozásra.
        </p>
      </div>
    )
  }

  // Csoportosítás státusz szerint
  const submitted = reports.filter(r => r.status === 'submitted')
  const inProgress = reports.filter(r => r.status === 'received' || r.status === 'reviewed')
  const finalized = reports.filter(r => r.status === 'finalized')

  return (
    <div className="card-raised overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-violet-50/40 px-5 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-violet-600" />
          <h3 className="font-heading text-lg text-slate-800">
            Beérkezett éves jelentések — {year}. év
          </h3>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {submitted.length > 0 && (
            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
              {submitted.length} új beküldés
            </Badge>
          )}
          {inProgress.length > 0 && (
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
              {inProgress.length} folyamatban
            </Badge>
          )}
          {finalized.length > 0 && (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              {finalized.length} véglegesítve
            </Badge>
          )}
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {reports.map(report => {
          const isExpanded = expandedId === report.id
          const snapshot = report.snapshot_data as AnnualReportSnapshot
          const lelkipasztor = snapshot?.szekcio1_gyulekezet?.lelkipasztor || '—'

          return (
            <div key={report.id} className="px-5 py-4">
              {/* Sor fejléc */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : report.id)}
                  className="flex flex-1 items-start gap-3 text-left hover:opacity-80"
                >
                  <StatusIcon status={report.status} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800">
                      {report.congregation_name || 'Ismeretlen gyülekezet'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Lelkipásztor: {lelkipasztor}
                      {report.submitted_at && (
                        <>
                          {' '}
                          • Beküldve: {new Date(report.submitted_at).toLocaleDateString('hu-HU')}
                        </>
                      )}
                      {report.forwarded_to_kerulet && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          <TrendingUp className="size-3" />
                          Kerülethez továbbítva
                        </span>
                      )}
                    </p>
                  </div>
                </button>

                {/* Akció gombok a státusz alapján */}
                <div className="flex flex-wrap gap-2">
                  {report.status === 'submitted' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg border-amber-200 text-amber-700 hover:bg-amber-50"
                      onClick={() => handleStatusUpdate(report, 'received')}
                      disabled={isPending}
                    >
                      <MailCheck className="mr-1 size-3.5" />
                      Átvettem
                    </Button>
                  )}
                  {report.status === 'received' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg border-violet-200 text-violet-700 hover:bg-violet-50"
                      onClick={() => setExpandedId(report.id)}
                    >
                      <Eye className="mr-1 size-3.5" />
                      Ellenőrzöm
                    </Button>
                  )}
                  {report.status === 'reviewed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      onClick={() => handleStatusUpdate(report, 'finalized')}
                      disabled={isPending}
                    >
                      <FileCheck className="mr-1 size-3.5" />
                      Véglegesítem
                    </Button>
                  )}
                  {report.status === 'finalized' && !report.forwarded_to_kerulet && (
                    <Button
                      size="sm"
                      className="rounded-lg bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => handleForward(report)}
                      disabled={isPending}
                    >
                      <Send className="mr-1 size-3.5" />
                      Kerületnek
                    </Button>
                  )}
                </div>
              </div>

              {/* Kibővített nézet */}
              {isExpanded && snapshot && (
                <div className="mt-4 space-y-3 rounded-xl bg-slate-50/60 p-4">
                  {/* Mini KPI-k a snapshotból */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MiniKpi
                      label="Tagok (presbiter)"
                      value={String(snapshot.szekcio7_presbiterium?.presbiterekSzama || 0)}
                    />
                    <MiniKpi
                      label="Istentiszteletek"
                      value={String(snapshot.szekcio2_istentisztelet?.osszesAlkalom || 0)}
                    />
                    <MiniKpi
                      label="Kazuáliák"
                      value={String(snapshot.szekcio3_kazualiak?.osszes || 0)}
                    />
                    <MiniKpi
                      label="Bevétel"
                      value={`${formatCurrency(snapshot.szekcio6_penzugy?.bevetel || 0)} RON`}
                    />
                  </div>

                  {/* Pásztori megjegyzés ha van */}
                  {report.pastor_note && (
                    <div className="rounded-lg bg-white/70 px-3 py-2 text-sm">
                      <p className="text-xs font-semibold text-slate-500">Lelkipásztori megjegyzés</p>
                      <p className="mt-1 text-slate-700">{report.pastor_note}</p>
                    </div>
                  )}

                  {/* Esperesi review notes — ha received vagy reviewed */}
                  {(report.status === 'received' || report.status === 'reviewed') && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-500">
                        Esperesi megjegyzés (a véglegesítés előtt)
                      </label>
                      <Textarea
                        value={reviewNotesMap[report.id] || ''}
                        onChange={e => setReviewNote(report.id, e.target.value)}
                        placeholder="Pl. „Köszönjük a részletes leírást. Néhány rész pontosítást igényel..."
                        rows={2}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg"
                          onClick={() => handleStatusUpdate(report, 'reviewed')}
                          disabled={isPending}
                        >
                          <Eye className="mr-1 size-3.5" />
                          Mentés ellenőrzöttként
                        </Button>
                        <Button
                          size="sm"
                          className="rounded-lg bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => handleStatusUpdate(report, 'finalized')}
                          disabled={isPending}
                        >
                          <FileCheck className="mr-1 size-3.5" />
                          Véglegesítés
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Megjelenítés ha már reviewed/finalized */}
                  {report.review_notes && report.status !== 'received' && (
                    <div className="rounded-lg bg-amber-50/60 px-3 py-2 text-sm">
                      <p className="text-xs font-semibold text-amber-700">
                        Esperesi megjegyzés
                      </p>
                      <p className="mt-1 text-slate-700">{report.review_notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: AnnualReportRow['status'] }) {
  const config = {
    draft: { icon: FileText, color: 'text-slate-400' },
    submitted: { icon: MailCheck, color: 'text-blue-600' },
    received: { icon: Eye, color: 'text-amber-600' },
    reviewed: { icon: FileCheck, color: 'text-violet-600' },
    finalized: { icon: CheckCircle2, color: 'text-emerald-600' },
  }
  const { icon: Icon, color } = config[status]
  return (
    <div className={`mt-0.5 ${color}`}>
      <Icon className="size-5" />
    </div>
  )
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/80 px-3 py-2 ring-1 ring-slate-200/60">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  )
}
