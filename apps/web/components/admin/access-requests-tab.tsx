'use client'

/**
 * Admin → Hozzáférés-kérelmek fül (M0.1 — Tauri-migráció).
 *
 * A Tauri-migráció első lépése: a regisztráció ezentúl nem nyílt, hanem
 * admin-jóváhagyás utáni. Ez a fül mutatja a beérkezett kérelmeket.
 *
 * Funkciók:
 *   - KPI panel: total / pending / approved / rejected / last 24h / last 7d
 *   - Táblázat: szűrés státusz szerint, keresés email/név alapján
 *   - Approve / Reject akciók modális dialógussal
 *
 * Jogosultság: csak `profiles.role = 'admin'`. RLS + szerver actions védik.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  UserCheck, Clock, CheckCircle2, XCircle, Search, RefreshCw,
  Users, CalendarClock, Info,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { AccessRequestsTable } from './access-requests-table'
import { AccessRequestApproveDialog } from './access-request-approve-dialog'
import { AccessRequestRejectDialog } from './access-request-reject-dialog'

import {
  getAccessRequestStats,
  listAccessRequests,
} from '@/app/(dashboard)/admin/access-requests-actions'
import type {
  AccessRequest,
  AccessRequestStats,
  AccessRequestStatus,
} from '@/app/(dashboard)/admin/access-requests-shared'

type StatusFilter = AccessRequestStatus | 'all'

export function AccessRequestsTab() {
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [stats, setStats] = useState<AccessRequestStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [search, setSearch] = useState('')

  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [listRes, statsRes] = await Promise.all([
      listAccessRequests({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: search.trim() || undefined,
      }),
      getAccessRequestStats(),
    ])
    if (listRes.error) toast.error(`Lista hiba: ${listRes.error}`)
    else if (listRes.data) setRequests(listRes.data)

    if (statsRes.error) toast.error(`Statisztika hiba: ${statsRes.error}`)
    else if (statsRes.data) setStats(statsRes.data)
    setLoading(false)
  }, [statusFilter, search])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void refresh()
    })
    return () => { cancelled = true }
  }, [refresh])

  function handleApprove(req: AccessRequest) {
    setSelectedRequest(req)
    setApproveDialogOpen(true)
  }

  function handleReject(req: AccessRequest) {
    setSelectedRequest(req)
    setRejectDialogOpen(true)
  }

  function handleViewDetails(_req: AccessRequest) {
    // Expansion a táblázatban (inline). Későbbi verzióban full dialog lehet.
  }

  return (
    <div className="space-y-5">
      {/* ─── Info-banner (M0.1 kontextus) ─── */}
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-white p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm">
            <Info className="size-4" />
          </div>
          <div className="flex-1 text-sm text-amber-900">
            <p className="font-semibold">M0.1 — Hozzáférés-kérelmek modul (Tauri-migráció első lépése)</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              A publikus oldalon az érdeklődők hozzáférés-kérelmet tudnak majd küldeni (M0.2 fázistól).
              Az admin ezeket átnézi, elfogadja vagy elutasítja. A user-létrehozás + invite-email
              az M0.3-ban jön. Addig manuálisan kell értesíteni az elfogadott kérelmezőt.
            </p>
          </div>
        </div>
      </div>

      {/* ─── KPI Panel ─── */}
      {stats && <KpiPanel stats={stats} />}

      {/* ─── Szűrők + refresh ─── */}
      <div className="card-raised p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <UserCheck className="size-5 text-amber-600" />
            <h3 className="font-heading text-lg text-slate-800">Kérelmek kezelése</h3>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refresh()}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Frissítés
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Státusz-tabok */}
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            <StatusFilterButton
              value="pending"
              current={statusFilter}
              onClick={() => setStatusFilter('pending')}
              label="Várakozó"
              count={stats?.pending}
              activeColor="amber"
            />
            <StatusFilterButton
              value="approved"
              current={statusFilter}
              onClick={() => setStatusFilter('approved')}
              label="Jóváhagyott"
              count={stats?.approved}
              activeColor="emerald"
            />
            <StatusFilterButton
              value="rejected"
              current={statusFilter}
              onClick={() => setStatusFilter('rejected')}
              label="Elutasított"
              count={stats?.rejected}
              activeColor="rose"
            />
            <StatusFilterButton
              value="all"
              current={statusFilter}
              onClick={() => setStatusFilter('all')}
              label="Összes"
              count={stats?.total}
              activeColor="slate"
            />
          </div>

          {/* Keresés */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Keresés email vagy név alapján…"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* ─── Táblázat ─── */}
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">Kérelmek betöltése…</div>
      ) : (
        <AccessRequestsTable
          requests={requests}
          onApprove={handleApprove}
          onReject={handleReject}
          onViewDetails={handleViewDetails}
        />
      )}

      {/* ─── Dialógusok ─── */}
      <AccessRequestApproveDialog
        open={approveDialogOpen}
        onOpenChange={setApproveDialogOpen}
        request={selectedRequest}
        onApproved={() => void refresh()}
      />
      <AccessRequestRejectDialog
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
        request={selectedRequest}
        onRejected={() => void refresh()}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// KPI Panel
// ─────────────────────────────────────────────────────────────────────────

function KpiPanel({ stats }: { stats: AccessRequestStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard
        label="Várakozó"
        value={stats.pending}
        sub="Jóváhagyásra vár"
        tone="amber"
        icon={<Clock className="size-4" />}
      />
      <KpiCard
        label="Jóváhagyva"
        value={stats.approved}
        sub={`${stats.total} összes kérelem`}
        tone="emerald"
        icon={<CheckCircle2 className="size-4" />}
      />
      <KpiCard
        label="Elutasítva"
        value={stats.rejected}
        sub={stats.total > 0 ? `${Math.round((stats.rejected / stats.total) * 100)}% elutasítási arány` : '—'}
        tone="rose"
        icon={<XCircle className="size-4" />}
      />
      <KpiCard
        label="Utolsó 7 nap"
        value={stats.last7d}
        sub={`Utolsó 24h: ${stats.last24h}`}
        tone="indigo"
        icon={<CalendarClock className="size-4" />}
      />
    </div>
  )
}

function KpiCard({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string
  value: number
  sub?: string
  tone: 'amber' | 'emerald' | 'rose' | 'indigo'
  icon: React.ReactNode
}) {
  const colors = {
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  }[tone]
  return (
    <div className={`rounded-2xl border px-4 py-3 ${colors}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.18em] opacity-75">{label}</p>
        {icon}
      </div>
      <p className="text-3xl font-bold mt-1 font-mono tabular-nums">{value}</p>
      {sub && <p className="text-[11px] mt-1 opacity-75 truncate">{sub}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Státusz-szűrő gomb
// ─────────────────────────────────────────────────────────────────────────

function StatusFilterButton({
  value,
  current,
  onClick,
  label,
  count,
  activeColor,
}: {
  value: StatusFilter
  current: StatusFilter
  onClick: () => void
  label: string
  count?: number
  activeColor: 'amber' | 'emerald' | 'rose' | 'slate'
}) {
  const isActive = value === current
  const activeClasses = {
    amber: 'bg-amber-500 text-white shadow-sm',
    emerald: 'bg-emerald-500 text-white shadow-sm',
    rose: 'bg-rose-500 text-white shadow-sm',
    slate: 'bg-slate-700 text-white shadow-sm',
  }[activeColor]

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
        isActive ? activeClasses : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${isActive ? 'bg-white/20' : 'bg-slate-100'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

/** Unused import warning elkerülése — a Users ikon a design-rendszerben létezik, de a
 * KPI-ban most nem kell. Későbbi variánsban használni fogjuk (pl. role-bontás). */
void Users
