'use client'

/**
 * Admin → Eszközök, licencek, napló fül (M0.5).
 *
 * A Tauri-kliens (M1-M5) infrastruktúrájának admin-oldala:
 *   1. Regisztrált eszközök (read + revoke)
 *   2. Kibocsátott licencek (read only — a kibocsátás M5-ben jön)
 *   3. Audit-log (utolsó 100 esemény, szűrhető)
 *
 * Most (M0.5) még nincs adat — üres állapot magyarázattal, hogy mi lesz itt
 * az M1-M5 után.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Monitor, Key, ScrollText, RefreshCw, XCircle, CheckCircle2, Info,
  Calendar, User, RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AdminConfirmDialog } from './admin-confirm-dialog'

import {
  listUserDevices,
  listLicenses,
  listAuditLog,
  revokeDevice,
  restoreDevice,
} from '@/app/(dashboard)/admin/devices-licenses-actions'
import {
  auditActionLabel,
  type AuditLogEntry,
  type License,
  type UserDevice,
} from '@/app/(dashboard)/admin/devices-licenses-shared'

type SubTab = 'devices' | 'licenses' | 'audit'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('hu-HU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('hu-HU')
}

export function DevicesLicensesTab() {
  const [subTab, setSubTab] = useState<SubTab>('devices')
  const [devices, setDevices] = useState<UserDevice[]>([])
  const [licenses, setLicenses] = useState<License[]>([])
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      if (subTab === 'devices') {
        const r = await listUserDevices()
        if (r.error) toast.error(r.error)
        else if (r.data) setDevices(r.data)
      } else if (subTab === 'licenses') {
        const r = await listLicenses()
        if (r.error) toast.error(r.error)
        else if (r.data) setLicenses(r.data)
      } else if (subTab === 'audit') {
        const r = await listAuditLog({ limit: 200 })
        if (r.error) toast.error(r.error)
        else if (r.data) setAuditLog(r.data)
      }
    } finally {
      setLoading(false)
    }
  }, [subTab])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void refresh()
    })
    return () => { cancelled = true }
  }, [refresh])

  // 2026-06-07: natív prompt/confirm helyett szép dialógusok.
  const [revokeTarget, setRevokeTarget] = useState<UserDevice | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<UserDevice | null>(null)
  const [actionBusy, setActionBusy] = useState(false)

  async function doRevoke(reason?: string) {
    if (!revokeTarget) return
    setActionBusy(true)
    const r = await revokeDevice({ id: revokeTarget.id, reason: (reason || '').trim() })
    setActionBusy(false)
    if (r.error) toast.error(r.error)
    else {
      toast.success('Eszköz visszavonva — a user email-ben értesítve.')
      setRevokeTarget(null)
      void refresh()
    }
  }

  async function doRestore() {
    if (!restoreTarget) return
    setActionBusy(true)
    const r = await restoreDevice({ id: restoreTarget.id })
    setActionBusy(false)
    if (r.error) toast.error(r.error)
    else {
      toast.success('Eszköz visszaállítva — a user email-ben értesítve.')
      setRestoreTarget(null)
      void refresh()
    }
  }

  return (
    <div className="space-y-5">
      {/* ─── Info-banner (M0.5 kontextus) ─── */}
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-violet-50 to-white p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
            <Info className="size-4" />
          </div>
          <div className="flex-1 text-sm text-indigo-900">
            <p className="font-semibold">M0.5 — Eszközök, licencek, napló (Tauri-infra)</p>
            <p className="mt-1 text-xs leading-relaxed text-indigo-800">
              Ez a fül a Tauri-kliens (M1-M5) adminisztrálására készült. Jelenleg még nincsenek adatok —
              az eszköz-regisztráció automatikus lesz, mikor a lelkész először bejelentkezik a Tauri-appal.
              A licencek az M5 fázistól bocsáthatók ki. Az audit-log már most gyűlik (access-request akcióknál).
            </p>
          </div>
        </div>
      </div>

      {/* ─── Sub-tab-ok ─── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          <SubTabButton
            value="devices"
            current={subTab}
            onClick={() => setSubTab('devices')}
            label="Eszközök"
            icon={<Monitor className="size-4" />}
            count={devices.length}
          />
          <SubTabButton
            value="licenses"
            current={subTab}
            onClick={() => setSubTab('licenses')}
            label="Licencek"
            icon={<Key className="size-4" />}
            count={licenses.length}
          />
          <SubTabButton
            value="audit"
            current={subTab}
            onClick={() => setSubTab('audit')}
            label="Napló"
            icon={<ScrollText className="size-4" />}
            count={auditLog.length}
          />
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

      {/* ─── Tartalom ─── */}
      <div className="card-raised p-5">
        {loading && <div className="py-8 text-center text-sm text-slate-400">Betöltés…</div>}
        {!loading && subTab === 'devices' && (
          <DevicesList devices={devices} onRevoke={setRevokeTarget} onRestore={setRestoreTarget} />
        )}
        {!loading && subTab === 'licenses' && <LicensesList licenses={licenses} />}
        {!loading && subTab === 'audit' && <AuditLogList audit={auditLog} />}
      </div>

      <AdminConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        title="Eszköz visszavonása"
        tone="danger"
        description={
          revokeTarget ? (
            <>
              Visszavonod a(z) <strong>{revokeTarget.device_name || revokeTarget.platform}</strong> eszközt
              {revokeTarget.user_email ? <> ({revokeTarget.user_email})</> : null} hozzáférését? A felhasználó
              email-ben értesítést kap, és ezzel az eszközzel nem tud többé belépni.
            </>
          ) : null
        }
        reasonLabel="A visszavonás oka"
        reasonPlaceholder="Pl. elveszett eszköz, biztonsági ok…"
        reasonRequired
        confirmLabel="Visszavonás"
        loading={actionBusy}
        onConfirm={(reason) => doRevoke(reason)}
      />

      <AdminConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(o) => !o && setRestoreTarget(null)}
        title="Eszköz visszaállítása"
        description={
          restoreTarget ? (
            <>
              Feloldod a(z) <strong>{restoreTarget.device_name || restoreTarget.platform}</strong> eszköz
              visszavonását{restoreTarget.user_email ? <> ({restoreTarget.user_email})</> : null} számára? A
              felhasználó email-ben értesítést kap, és ismét beléphet ezzel az eszközzel.
            </>
          ) : null
        }
        confirmLabel="Visszaállítás"
        loading={actionBusy}
        onConfirm={() => doRestore()}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-tab button
// ─────────────────────────────────────────────────────────────────────────

function SubTabButton({
  value, current, onClick, label, icon, count,
}: {
  value: SubTab
  current: SubTab
  onClick: () => void
  label: string
  icon: React.ReactNode
  count?: number
}) {
  const isActive = value === current
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition flex items-center gap-1.5 ${
        isActive ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${isActive ? 'bg-white/20' : 'bg-slate-100'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Devices list
// ─────────────────────────────────────────────────────────────────────────

function DevicesList({
  devices,
  onRevoke,
  onRestore,
}: {
  devices: UserDevice[]
  onRevoke: (d: UserDevice) => void
  onRestore: (d: UserDevice) => void
}) {
  if (devices.length === 0) {
    return (
      <EmptyState
        icon={<Monitor className="size-6 text-slate-400" />}
        title="Nincs regisztrált eszköz"
        description="Amint az első lelkész bejelentkezik a Tauri-desktop kliensen (M1+), az eszköze itt fog megjelenni."
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 text-xs">
          <tr>
            <th className="p-3 text-left font-medium text-slate-600">Felhasználó</th>
            <th className="p-3 text-left font-medium text-slate-600">Eszköz</th>
            <th className="p-3 text-left font-medium text-slate-600">Platform</th>
            <th className="p-3 text-left font-medium text-slate-600">Regisztrálva</th>
            <th className="p-3 text-left font-medium text-slate-600">Utolsó aktivitás</th>
            <th className="p-3 text-center font-medium text-slate-600">Státusz</th>
            <th className="p-3 text-right font-medium text-slate-600">Művelet</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {devices.map((d) => (
            <tr key={d.id} className={d.revoked ? 'opacity-50' : ''}>
              <td className="p-3">
                <p className="font-medium text-slate-800">{d.user_full_name || '—'}</p>
                <p className="text-[11px] text-slate-500 font-mono">{d.user_email}</p>
              </td>
              <td className="p-3">
                <p className="font-medium text-slate-800">{d.device_name || 'Névtelen'}</p>
                <p className="text-[10px] text-slate-400 font-mono truncate max-w-[160px]">
                  {d.device_fingerprint}
                </p>
              </td>
              <td className="p-3">
                <Badge className="bg-slate-100 text-slate-700 border-0 text-[10px]">{d.platform}</Badge>
              </td>
              <td className="p-3 text-xs text-slate-600 font-mono">{formatDateTime(d.registered_at)}</td>
              <td className="p-3 text-xs text-slate-600 font-mono">
                {d.last_seen ? formatDateTime(d.last_seen) : '—'}
              </td>
              <td className="p-3 text-center">
                {d.revoked ? (
                  <Badge className="bg-rose-100 text-rose-800 border-0 gap-1 text-[10px]">
                    <XCircle className="size-3" /> Visszavont
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-800 border-0 gap-1 text-[10px]">
                    <CheckCircle2 className="size-3" /> Aktív
                  </Badge>
                )}
              </td>
              <td className="p-3 text-right">
                {d.revoked ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRestore(d)}
                    className="rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-1"
                    title={d.revoke_reason ? `Visszavonás oka: ${d.revoke_reason}` : undefined}
                  >
                    <RotateCcw className="size-3" /> Visszaállít
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRevoke(d)}
                    className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 gap-1"
                  >
                    <XCircle className="size-3" /> Visszavonás
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Licenses list
// ─────────────────────────────────────────────────────────────────────────

function LicensesList({ licenses }: { licenses: License[] }) {
  if (licenses.length === 0) {
    return (
      <EmptyState
        icon={<Key className="size-6 text-slate-400" />}
        title="Nincs kibocsátott licenc"
        description="Az M5 fázistól (kb. 2026 őszén) licenceket fogunk kibocsátani a Tauri-desktop klienshez. Minden licenc: user_id + max eszközszám + lejárat."
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 text-xs">
          <tr>
            <th className="p-3 text-left font-medium text-slate-600">Felhasználó</th>
            <th className="p-3 text-center font-medium text-slate-600">Eszköz-limit</th>
            <th className="p-3 text-left font-medium text-slate-600">Érvényes</th>
            <th className="p-3 text-center font-medium text-slate-600">Státusz</th>
            <th className="p-3 text-left font-medium text-slate-600">Megjegyzés</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {licenses.map((l) => {
            const expired = new Date(l.valid_until) < new Date()
            return (
              <tr key={l.id} className={l.revoked || expired ? 'opacity-50' : ''}>
                <td className="p-3">
                  <p className="font-medium text-slate-800">{l.user_full_name || '—'}</p>
                  <p className="text-[11px] text-slate-500 font-mono">{l.user_email}</p>
                </td>
                <td className="p-3 text-center font-mono text-slate-700">{l.device_limit}</td>
                <td className="p-3 text-xs text-slate-600">
                  {formatDate(l.valid_from)} — {formatDate(l.valid_until)}
                </td>
                <td className="p-3 text-center">
                  {l.revoked ? (
                    <Badge className="bg-rose-100 text-rose-800 border-0 text-[10px]">Visszavont</Badge>
                  ) : expired ? (
                    <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px]">Lejárt</Badge>
                  ) : (
                    <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px]">Aktív</Badge>
                  )}
                </td>
                <td className="p-3 text-xs text-slate-600 truncate max-w-[240px]">
                  {l.notes || '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────────────────

function AuditLogList({ audit }: { audit: AuditLogEntry[] }) {
  if (audit.length === 0) {
    return (
      <EmptyState
        icon={<ScrollText className="size-6 text-slate-400" />}
        title="Nincs naplóbejegyzés"
        description="Az audit-log az első admin-akciónál (pl. access-request jóváhagyás) jön létre."
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 text-xs">
          <tr>
            <th className="p-3 text-left font-medium text-slate-600">Időpont</th>
            <th className="p-3 text-left font-medium text-slate-600">Felhasználó</th>
            <th className="p-3 text-left font-medium text-slate-600">Akció</th>
            <th className="p-3 text-left font-medium text-slate-600">Cél</th>
            <th className="p-3 text-left font-medium text-slate-600">Metaadat</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {audit.map((e) => (
            <tr key={e.id}>
              <td className="p-3 text-xs text-slate-600 font-mono whitespace-nowrap flex items-center gap-1.5">
                <Calendar className="size-3 text-slate-400" />
                {formatDateTime(e.created_at)}
              </td>
              <td className="p-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-700">
                  <User className="size-3 text-slate-400" />
                  {e.user_email || '(rendszer)'}
                </div>
              </td>
              <td className="p-3">
                <Badge className="bg-slate-100 text-slate-700 border-0 text-[10px]">
                  {auditActionLabel(e.action)}
                </Badge>
              </td>
              <td className="p-3 text-xs text-slate-600">
                {e.target_table ? (
                  <>
                    <span className="font-mono">{e.target_table}</span>
                    {e.target_id && <span className="text-slate-400 font-mono"> / {e.target_id.slice(0, 8)}</span>}
                  </>
                ) : '—'}
              </td>
              <td className="p-3 text-xs text-slate-500 font-mono truncate max-w-[240px]">
                {e.metadata ? JSON.stringify(e.metadata).slice(0, 60) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Empty state (közös)
// ─────────────────────────────────────────────────────────────────────────

function EmptyState({
  icon, title, description,
}: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-12 text-center">
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-slate-100">
        {icon}
      </div>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">{description}</p>
    </div>
  )
}
