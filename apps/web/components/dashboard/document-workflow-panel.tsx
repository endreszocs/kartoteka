'use client'

/**
 * Egyházmegyei dokumentum workflow panel.
 * Mátrix nézet: sorok = gyülekezetek, oszlopok = dokumentum típusok.
 */

import { useState, useTransition } from 'react'
import { Check, Clock, Eye, FileCheck, Forward, MailCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  updateSubmissionStatus,
  forwardToKerulet,
} from '@/app/(dashboard)/dashboard-egyhazmegye/document-actions'
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_DEADLINES,
  type DocumentSubmission,
  type DocumentType,
  type DocumentStatus,
} from '@/lib/constants/documents'

interface DocumentWorkflowPanelProps {
  submissions: DocumentSubmission[]
  year: number
}

const DOC_TYPES: DocumentType[] = [
  'szamadas', 'koltsegvetes', 'koltsegvetes_modositas', 'vagyonleltar', 'valasztok_nevjegyzeke',
]

const STATUS_CONFIG: Record<DocumentStatus, { label: string; className: string; icon: typeof Clock }> = {
  submitted: { label: 'Beküldve', className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock },
  received: { label: 'Átvéve', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: MailCheck },
  reviewed: { label: 'Ellenőrizve', className: 'bg-violet-50 text-violet-700 border-violet-200', icon: Eye },
  finalized: { label: 'Véglegesítve', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: FileCheck },
}

export function DocumentWorkflowPanel({ submissions, year }: DocumentWorkflowPanelProps) {
  const [isPending, startTransition] = useTransition()
  const [processingId, setProcessingId] = useState<string | null>(null)

  // Gyülekezetek egyedi listája
  const congregations = [...new Map(
    submissions.map((s) => [s.congregation_id, s.congregation_name || 'Ismeretlen']),
  ).entries()].sort((a, b) => (a[1] || '').localeCompare(b[1] || ''))

  function findSubmission(congId: string, docType: DocumentType): DocumentSubmission | undefined {
    return submissions.find(
      (s) => s.congregation_id === congId && s.document_type === docType,
    )
  }

  function handleStatusUpdate(id: string, newStatus: DocumentStatus) {
    setProcessingId(id)
    startTransition(async () => {
      const result = await updateSubmissionStatus(id, newStatus)
      setProcessingId(null)
      if ('error' in result && result.error) toast.error(result.error)
      else toast.success(`Státusz frissítve: ${STATUS_CONFIG[newStatus].label}`)
    })
  }

  function handleForward(id: string) {
    setProcessingId(id)
    startTransition(async () => {
      const result = await forwardToKerulet(id)
      setProcessingId(null)
      if ('error' in result && result.error) toast.error(result.error)
      else toast.success('Dokumentum továbbítva a kerületnek.')
    })
  }

  if (submissions.length === 0) {
    return (
      <div className="card-raised p-8 text-center">
        <p className="text-slate-500">Nincs beküldött dokumentum a {year}. évre.</p>
        <p className="mt-1 text-xs text-slate-400">A gyülekezetek a véglegesítés után küldhetik be az iratokat.</p>
      </div>
    )
  }

  return (
    <div className="card-raised overflow-hidden">
      <div className="bg-slate-50 px-5 py-4 border-b border-slate-200/60">
        <h3 className="font-heading text-lg text-slate-800">Dokumentum workflow — {year}. év</h3>
        <p className="mt-1 text-xs text-slate-500">
          A gyülekezetek beküldött dokumentumainak állapotát és jóváhagyását kezelheti.
        </p>
      </div>

      {/* Határidők jelzői */}
      <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-3">
        {DOC_TYPES.filter((t) => t !== 'koltsegvetes_modositas').map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{DOCUMENT_TYPE_LABELS[t]}:</span>
            {DOCUMENT_DEADLINES[t]}
          </span>
        ))}
      </div>

      {/* Mátrix tábla */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/80">
            <tr>
              <th className="p-2.5 text-left text-xs font-medium text-slate-500 sticky left-0 bg-slate-50/80 min-w-[160px]">Gyülekezet</th>
              {DOC_TYPES.map((t) => (
                <th key={t} className="p-2.5 text-center text-[10px] font-medium text-slate-500 min-w-[110px]">
                  {DOCUMENT_TYPE_LABELS[t]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {congregations.map(([congId, congName]) => (
              <tr key={congId} className="hover:bg-slate-50/40">
                <td className="p-2.5 font-medium text-slate-700 sticky left-0 bg-white">
                  {congName}
                </td>
                {DOC_TYPES.map((docType) => {
                  const sub = findSubmission(congId, docType)
                  return (
                    <td key={docType} className="p-2.5 text-center">
                      {sub ? (
                        <DocumentCell
                          submission={sub}
                          isProcessing={isPending && processingId === sub.id}
                          onStatusUpdate={handleStatusUpdate}
                          onForward={handleForward}
                        />
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DocumentCell({
  submission,
  isProcessing,
  onStatusUpdate,
  onForward,
}: {
  submission: DocumentSubmission
  isProcessing: boolean
  onStatusUpdate: (id: string, status: DocumentStatus) => void
  onForward: (id: string) => void
}) {
  const config = STATUS_CONFIG[submission.status as DocumentStatus]
  const Icon = config?.icon || Clock
  const nextStatus: DocumentStatus | null =
    submission.status === 'submitted' ? 'received'
    : submission.status === 'received' ? 'reviewed'
    : submission.status === 'reviewed' ? 'finalized'
    : null

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <Badge
        variant="outline"
        className={`text-[10px] ${config?.className || ''}`}
      >
        <Icon className="mr-0.5 size-3" />
        {config?.label || submission.status}
      </Badge>

      <div className="flex gap-0.5">
        {nextStatus && (
          <button
            type="button"
            onClick={() => onStatusUpdate(submission.id, nextStatus)}
            disabled={isProcessing}
            className="rounded-full bg-slate-100 p-1 text-slate-500 hover:bg-blue-100 hover:text-blue-600 transition-colors"
            title={`${STATUS_CONFIG[nextStatus].label}nek jelölés`}
          >
            <Check className="size-3" />
          </button>
        )}
        {submission.status === 'finalized' && !submission.forwarded_to_kerulet && (
          <button
            type="button"
            onClick={() => onForward(submission.id)}
            disabled={isProcessing}
            className="rounded-full bg-slate-100 p-1 text-slate-500 hover:bg-emerald-100 hover:text-emerald-600 transition-colors"
            title="Továbbítás a kerületnek"
          >
            <Forward className="size-3" />
          </button>
        )}
        {submission.forwarded_to_kerulet && (
          <span className="text-[9px] text-emerald-600 font-semibold">✓ Kerület</span>
        )}
      </div>
    </div>
  )
}
