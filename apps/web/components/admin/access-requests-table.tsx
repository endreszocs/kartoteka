'use client'

/**
 * Admin → Access Requests táblázat (M0.1 — Tauri-migráció).
 *
 * Megjelenít: pending/approved/rejected kérelmeket.
 * Szűrő: státusz + szabad-szöveges keresés (email/név).
 * Akciók: Approve (zöld), Reject (piros), Részletek.
 */

import { useState } from 'react'
import { CheckCircle2, XCircle, Clock, Mail, Phone, Home, FileText, Eye, Building2, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {
  AccessRequest,
  AccessRequestStatus,
} from '@/app/(dashboard)/admin/access-requests-shared'
import { ROLE_LABELS, STATUS_LABELS } from '@/app/(dashboard)/admin/access-requests-shared'
import { getAccessRequestDocumentUrl } from '@/app/(dashboard)/admin/access-requests-actions'

interface AccessRequestsTableProps {
  requests: AccessRequest[]
  onApprove: (req: AccessRequest) => void
  onReject: (req: AccessRequest) => void
  onViewDetails: (req: AccessRequest) => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StatusBadge({ status }: { status: AccessRequestStatus }) {
  const config = {
    pending: { icon: Clock, className: 'bg-amber-100 text-amber-800 border-amber-200' },
    approved: { icon: CheckCircle2, className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    rejected: { icon: XCircle, className: 'bg-rose-100 text-rose-800 border-rose-200' },
  }[status]

  const Icon = config.icon
  return (
    <Badge className={`${config.className} border gap-1 text-[10px]`}>
      <Icon className="size-3" />
      {STATUS_LABELS[status]}
    </Badge>
  )
}

export function AccessRequestsTable({
  requests,
  onApprove,
  onReject,
  onViewDetails,
}: AccessRequestsTableProps) {
  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-12 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-slate-100">
          <FileText className="size-6 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-600">Nincs hozzáférés-kérelem</p>
        <p className="mt-1 text-xs text-slate-400">
          Az új kérelmek itt fognak megjelenni jóváhagyásra.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 text-xs">
          <tr>
            <th className="p-3 text-left font-medium text-slate-600">Kérelem</th>
            <th className="p-3 text-left font-medium text-slate-600">Kapcsolat</th>
            <th className="p-3 text-left font-medium text-slate-600">Szerepkör</th>
            <th className="p-3 text-center font-medium text-slate-600">Státusz</th>
            <th className="p-3 text-left font-medium text-slate-600">Beérkezett</th>
            <th className="p-3 text-right font-medium text-slate-600">Művelet</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {requests.map((req) => (
            <AccessRequestRow
              key={req.id}
              req={req}
              onApprove={onApprove}
              onReject={onReject}
              onViewDetails={onViewDetails}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AccessRequestRow({
  req,
  onApprove,
  onReject,
  onViewDetails,
}: {
  req: AccessRequest
  onApprove: (req: AccessRequest) => void
  onReject: (req: AccessRequest) => void
  onViewDetails: (req: AccessRequest) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr className={req.status === 'pending' ? 'bg-amber-50/30 hover:bg-amber-50/60' : 'hover:bg-slate-50/60'}>
        <td className="p-3">
          <div className="font-medium text-slate-800">{req.full_name}</div>
          {req.justification && (
            <p className="mt-0.5 max-w-xs truncate text-[11px] text-slate-500">
              &bdquo;{req.justification}&rdquo;
            </p>
          )}
        </td>
        <td className="p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-700">
            <Mail className="size-3 text-slate-400" />
            <a href={`mailto:${req.email}`} className="hover:underline">
              {req.email}
            </a>
          </div>
          {req.phone && (
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Phone className="size-3 text-slate-400" />
              {req.phone}
            </div>
          )}
          {req.congregation_slug && (
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Home className="size-3 text-slate-400" />
              {req.congregation_slug}
            </div>
          )}
          {req.diocese?.name && (
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Building2 className="size-3 text-slate-400" />
              {req.diocese.name}
            </div>
          )}
        </td>
        <td className="p-3">
          <Badge className="bg-indigo-100 text-indigo-800 border-0 text-[10px]">
            {ROLE_LABELS[req.requested_role]}
          </Badge>
        </td>
        <td className="p-3 text-center">
          <StatusBadge status={req.status} />
        </td>
        <td className="p-3 text-xs text-slate-500 font-mono">
          {formatDate(req.created_at)}
        </td>
        <td className="p-3">
          <div className="flex items-center justify-end gap-1.5 flex-wrap">
            {req.status === 'pending' && (
              <>
                <Button
                  size="sm"
                  onClick={() => onApprove(req)}
                  className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 gap-1"
                >
                  <CheckCircle2 className="size-3.5" />
                  Elfogadás
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReject(req)}
                  className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 gap-1"
                >
                  <XCircle className="size-3.5" />
                  Elutasítás
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setExpanded(!expanded)
                if (!expanded) onViewDetails(req)
              }}
              className="size-8 p-0"
              aria-label={expanded ? 'Becsuk' : 'Részletek'}
            >
              <Eye className="size-3.5" />
            </Button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/60">
          <td colSpan={6} className="p-4">
            <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
              {req.district?.name && (
                <div>
                  <p className="font-medium text-slate-600">Egyházkerület:</p>
                  <p className="mt-1 text-slate-700">{req.district.name}</p>
                </div>
              )}
              {req.diocese?.name && (
                <div>
                  <p className="font-medium text-slate-600">Egyházmegye:</p>
                  <p className="mt-1 text-slate-700">{req.diocese.name}</p>
                </div>
              )}
              {req.document_path && (
                <div>
                  <p className="font-medium text-slate-600">Csatolt igazolás:</p>
                  <div className="mt-1">
                    <DocumentButton path={req.document_path} />
                  </div>
                </div>
              )}
              {req.justification && (
                <div>
                  <p className="font-medium text-slate-600">Indoklás:</p>
                  <p className="mt-1 text-slate-700 whitespace-pre-wrap">{req.justification}</p>
                </div>
              )}
              {req.referrer && (
                <div>
                  <p className="font-medium text-slate-600">Honnan tudta meg:</p>
                  <p className="mt-1 text-slate-700">{req.referrer}</p>
                </div>
              )}
              {req.admin_notes && (
                <div>
                  <p className="font-medium text-slate-600">Admin megjegyzés:</p>
                  <p className="mt-1 text-slate-700 whitespace-pre-wrap">{req.admin_notes}</p>
                </div>
              )}
              {req.rejection_reason && (
                <div>
                  <p className="font-medium text-rose-700">Elutasítás oka:</p>
                  <p className="mt-1 text-rose-800 whitespace-pre-wrap">{req.rejection_reason}</p>
                </div>
              )}
              {req.reviewed_at && (
                <div>
                  <p className="font-medium text-slate-600">Átnézve:</p>
                  <p className="mt-1 text-slate-700 font-mono">{formatDate(req.reviewed_at)}</p>
                </div>
              )}
              <div>
                <p className="font-medium text-slate-600">Kérelem-azonosító:</p>
                <p className="mt-1 font-mono text-[10px] text-slate-500">{req.id}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * Letöltő gomb a feltöltött igazoláshoz — rövid életű signed URL-t kér a
 * szervertől (csak admin), majd új lapon megnyitja.
 */
function DocumentButton({ path }: { path: string }) {
  const [loading, setLoading] = useState(false)

  async function handleOpen() {
    setLoading(true)
    try {
      const res = await getAccessRequestDocumentUrl(path)
      if (res.error || !res.url) {
        toast.error(res.error || 'A dokumentum nem nyitható meg.')
        return
      }
      window.open(res.url, '_blank', 'noopener,noreferrer')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleOpen}
      disabled={loading}
      className="gap-1.5 rounded-lg"
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
      Igazolás megnyitása
    </Button>
  )
}
