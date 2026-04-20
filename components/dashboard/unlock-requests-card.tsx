'use client'

/**
 * Feloldási kérelmek kártya — egyházmegyei dashboard-hoz.
 * Megjelenít minden aktív kérelmet a gyülekezetek részéről.
 */

import { useState, useTransition } from 'react'
import { Check, X, ShieldAlert, Wallet, BarChart3, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  approveUnlockRequest,
  rejectUnlockRequest,
} from '@/app/(dashboard)/dashboard-egyhazmegye/actions'
import type { UnlockRequest } from '@/lib/constants/documents'

interface UnlockRequestsCardProps {
  requests: UnlockRequest[]
}

const TYPE_LABELS: Record<string, { label: string; icon: typeof Wallet; color: string }> = {
  budget: { label: 'Költségvetés', icon: Wallet, color: 'text-blue-600 bg-blue-50' },
  accounting: { label: 'Számadás', icon: BarChart3, color: 'text-amber-600 bg-amber-50' },
  inventory: { label: 'Vagyonleltár', icon: Package, color: 'text-teal-600 bg-teal-50' },
}

export function UnlockRequestsCard({ requests }: UnlockRequestsCardProps) {
  const [isPending, startTransition] = useTransition()
  const [processingId, setProcessingId] = useState<string | null>(null)

  if (requests.length === 0) return null

  function handleApprove(r: UnlockRequest) {
    const id = `${r.congregationId}-${r.year}-${r.type}`
    setProcessingId(id)
    startTransition(async () => {
      const result = await approveUnlockRequest(r.congregationId, r.year, r.type)
      setProcessingId(null)
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success(`${r.congregationName} — ${TYPE_LABELS[r.type]?.label} feloldva.`)
      }
    })
  }

  function handleReject(r: UnlockRequest) {
    const id = `${r.congregationId}-${r.year}-${r.type}`
    setProcessingId(id)
    startTransition(async () => {
      const result = await rejectUnlockRequest(r.congregationId, r.year, r.type)
      setProcessingId(null)
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success(`${r.congregationName} — ${TYPE_LABELS[r.type]?.label} kérelem elutasítva.`)
      }
    })
  }

  return (
    <div className="card-raised p-5">
      <div className="flex items-center gap-2 mb-4">
        <ShieldAlert className="size-5 text-red-500" />
        <div>
          <h3 className="font-heading text-lg text-slate-800">Feloldási kérelmek</h3>
          <p className="text-xs text-slate-500">{requests.length} aktív kérelem a gyülekezetek részéről</p>
        </div>
      </div>

      <div className="space-y-3">
        {requests.map((r) => {
          const typeInfo = TYPE_LABELS[r.type] || TYPE_LABELS.budget
          const Icon = typeInfo.icon
          const id = `${r.congregationId}-${r.year}-${r.type}`
          const isProcessing = isPending && processingId === id

          return (
            <div
              key={id}
              className="rounded-2xl border border-slate-100 bg-white/80 p-4 transition hover:border-slate-200"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${typeInfo.color}`}>
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{r.congregationName}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">{typeInfo.label}</Badge>
                      <span className="text-xs text-slate-400">{r.year}. év</span>
                    </div>
                    {r.reason && (
                      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        {r.reason}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => handleReject(r)}
                    disabled={isProcessing}
                  >
                    <X className="mr-1 size-3.5" />
                    Elutasítás
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 rounded-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => handleApprove(r)}
                    disabled={isProcessing}
                  >
                    <Check className="mr-1 size-3.5" />
                    Jóváhagyás
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
