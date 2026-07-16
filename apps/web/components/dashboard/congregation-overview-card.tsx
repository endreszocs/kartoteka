'use client'

/**
 * Gyülekezeti áttekintő kártya — egyházmegyei dashboard-hoz.
 * Accordion sorok gyülekezetenként, amelyek mutatják a kérelmeket és dokumentumokat.
 */

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, Users, AlertTriangle, FileCheck, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { approveUnlockRequest, rejectUnlockRequest } from '@/app/(dashboard)/dashboard-egyhazmegye/actions'
import type { UnlockRequest } from '@/lib/constants/documents'

interface CongregationRow {
  congregationId: string
  congregationName: string
  memberCount: number
  unlockRequests: UnlockRequest[]
  documentCount: number
  pendingDocuments: number
}

interface CongregationOverviewCardProps {
  congregations: CongregationRow[]
}

const TYPE_LABELS: Record<string, string> = {
  budget: 'Költségvetés',
  accounting: 'Számadás',
  inventory: 'Vagyonleltár',
  // 2026-07-17 (F5): a hivatalos lelkészi jelentés feloldás-kérelme
  jelentes: 'Lelkészi jelentés',
}

export function CongregationOverviewCard({ congregations }: CongregationOverviewCardProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [processingId, setProcessingId] = useState<string | null>(null)

  const totalRequests = congregations.reduce((s, c) => s + c.unlockRequests.length, 0)

  function handleApprove(r: UnlockRequest) {
    const id = `${r.congregationId}-${r.year}-${r.type}`
    setProcessingId(id)
    startTransition(async () => {
      const result = await approveUnlockRequest(r.congregationId, r.year, r.type)
      setProcessingId(null)
      if ('error' in result && result.error) toast.error(result.error)
      else toast.success(`${r.congregationName} — ${TYPE_LABELS[r.type]} feloldva.`)
    })
  }

  function handleReject(r: UnlockRequest) {
    const id = `${r.congregationId}-${r.year}-${r.type}`
    setProcessingId(id)
    startTransition(async () => {
      const result = await rejectUnlockRequest(r.congregationId, r.year, r.type)
      setProcessingId(null)
      if ('error' in result && result.error) toast.error(result.error)
      else toast.success(`${r.congregationName} — ${TYPE_LABELS[r.type]} elutasítva.`)
    })
  }

  return (
    <div className="card-raised overflow-hidden">
      <div className="bg-slate-50 px-5 py-4 border-b border-slate-200/60">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-heading text-lg text-slate-800">Gyülekezeti áttekintő</h3>
            <p className="mt-0.5 text-xs text-slate-500">{congregations.length} gyülekezet · {totalRequests > 0 ? `${totalRequests} aktív kérelem` : 'nincs aktív kérelem'}</p>
          </div>
          {totalRequests > 0 && (
            <Badge className="bg-red-50 text-red-700 border-red-200">
              <AlertTriangle className="mr-1 size-3" />
              {totalRequests} kérelem
            </Badge>
          )}
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {congregations.map((cong) => {
          const isExpanded = expanded === cong.congregationId
          const hasRequests = cong.unlockRequests.length > 0

          return (
            <div key={cong.congregationId}>
              {/* Sor fejléc */}
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : cong.congregationId)}
                className={`w-full flex items-center gap-3 px-5 py-3 text-left transition hover:bg-slate-50/60 ${hasRequests ? 'bg-red-50/30' : ''}`}
              >
                {isExpanded ? <ChevronDown className="size-4 text-slate-400 shrink-0" /> : <ChevronRight className="size-4 text-slate-400 shrink-0" />}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800 truncate">{cong.congregationName}</span>
                    {hasRequests && (
                      <Badge variant="outline" className="border-red-200 text-red-600 text-[10px]">
                        {cong.unlockRequests.length} kérelem
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Users className="size-3" />
                    {cong.memberCount}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <FileCheck className="size-3" />
                    {cong.documentCount} dok.
                  </span>
                  {cong.pendingDocuments > 0 && (
                    <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                      {cong.pendingDocuments} függő
                    </Badge>
                  )}
                </div>
              </button>

              {/* Kinyitott tartalom */}
              {isExpanded && (
                <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 space-y-3">
                  {/* Feloldási kérelmek */}
                  {cong.unlockRequests.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">Feloldási kérelmek</p>
                      {cong.unlockRequests.map((req) => {
                        const id = `${req.congregationId}-${req.year}-${req.type}`
                        const isProcessing = isPending && processingId === id
                        return (
                          <div key={id} className="flex items-center justify-between gap-3 rounded-xl bg-white border border-red-100 px-4 py-2.5">
                            <div>
                              <span className="text-sm font-medium text-slate-800">{TYPE_LABELS[req.type] || req.type}</span>
                              <span className="ml-2 text-xs text-slate-400">{req.year}. év</span>
                              {req.reason && <p className="mt-0.5 text-xs text-slate-500">{req.reason}</p>}
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <Button size="sm" variant="outline" className="h-7 rounded-full border-red-200 text-red-600 hover:bg-red-50 text-xs" onClick={() => handleReject(req)} disabled={isProcessing}>
                                <X className="mr-0.5 size-3" /> Elutasít
                              </Button>
                              <Button size="sm" className="h-7 rounded-full bg-emerald-600 hover:bg-emerald-700 text-xs" onClick={() => handleApprove(req)} disabled={isProcessing}>
                                <Check className="mr-0.5 size-3" /> Jóváhagy
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Dokumentumok összesítő */}
                  {cong.documentCount > 0 ? (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Beküldött dokumentumok: {cong.documentCount} db</p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">Még nincs beküldött dokumentum.</p>
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
