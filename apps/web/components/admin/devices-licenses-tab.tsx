'use client'

/**
 * Admin → Eszközök, licencek, napló fül (M0.5).
 *
 * A Tauri-kliens (M1-M5) infrastruktúrájának admin-oldala:
 *   1. Regisztrált eszközök (read + revoke)
 *   2. Kibocsátott licencek (read only — a kibocsátás M5-ben jön)
 *   3. Audit-log (utolsó 200 esemény, kliens-oldali szűrővel)
 *
 * 2026-07-11 admin-redesign: token-alapú színek, AdminTable mobil kártya-nézettel,
 * mindhárom lista egyszerre töltődik (pontos al-tab számlálók), napló-szűrő +
 * kibontható metaadat.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Monitor, Key, ScrollText, RefreshCw, XCircle, CheckCircle2, Info,
  Calendar, User, RotateCcw, Search,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { AdminConfirmDialog } from './admin-confirm-dialog'
import { AdminTable, type AdminTableColumn } from './_shared/admin-table'
import { AdminEmptyState } from './_shared/admin-empty-state'
import { StatusBadge } from './_shared/status-badge'

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

/**
 * Licenc-lejárat: a dátum-only string (YYYY-MM-DD) a nap VÉGÉIG érvényes
 * lokális idő szerint. A nyers `new Date(str)` UTC-éjfélre esne, ami
 * Romániában (UTC+2/3) már hajnaltól tévesen lejártnak mutatná az aznap
 * még érvényes licencet.
 */
function isLicenseExpired(validUntil: string): boolean {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(validUntil)
    ? new Date(`${validUntil}T23:59:59.999`)
    : new Date(validUntil)
  return d.getTime() < Date.now()
}

export function DevicesLicensesTab() {
  const [subTab, setSubTab] = useState<SubTab>('devices')
  const [devices, setDevices] = useState<UserDevice[]>([])
  const [licenses, setLicenses] = useState<License[]>([])
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Mindhárom listát egyszerre töltjük: így az al-tab számlálók az első
  // betöltéstől pontosak (korábban csak a meglátogatott tab számolt), és a
  // gyors tabváltás sem indít versengő kéréseket.
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [devRes, licRes, auditRes] = await Promise.all([
        listUserDevices(),
        listLicenses(),
        listAuditLog({ limit: 200 }),
      ])
      if (devRes.error) toast.error(`Eszközök: ${devRes.error}`)
      else if (devRes.data) setDevices(devRes.data)
      if (licRes.error) toast.error(`Licencek: ${licRes.error}`)
      else if (licRes.data) setLicenses(licRes.data)
      if (auditRes.error) toast.error(`Napló: ${auditRes.error}`)
      else if (auditRes.data) setAuditLog(auditRes.data)
    } finally {
      setLoading(false)
    }
  }, [])

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
      toast.success('Eszköz visszavonva. A rendszer értesítő emailt küld a felhasználónak.')
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
      toast.success('Eszköz visszaállítva. A rendszer értesítő emailt küld a felhasználónak.')
      setRestoreTarget(null)
      void refresh()
    }
  }

  return (
    <div className="space-y-5">
      {/* ─── Info-banner (mit csinál ez a fül) ─── */}
      <div className="rounded-2xl border border-border bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Info className="size-4" />
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-foreground">A desktop-kliens felügyelete</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Az eszköz-regisztráció automatikus: amikor egy lelkész először bejelentkezik a
              Kartotéka desktop-alkalmazással, az eszköze itt jelenik meg, és szükség esetén
              visszavonható. A licencek kibocsátása egy későbbi fázisban (M5) érkezik.
              A napló az admin-műveleteket rögzíti folyamatosan.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Sub-tab-ok ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-card p-0.5 shadow-sm">
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
          variant="outline"
          onClick={() => void refresh()}
          disabled={loading}
          className="min-h-10 gap-1.5"
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          Frissítés
        </Button>
      </div>

      {/* ─── Tartalom ─── */}
      <div className="card-raised p-4 sm:p-5">
        {subTab === 'devices' && (
          <DevicesList
            devices={devices}
            loading={loading}
            onRevoke={setRevokeTarget}
            onRestore={setRestoreTarget}
          />
        )}
        {subTab === 'licenses' && <LicensesList licenses={licenses} loading={loading} />}
        {subTab === 'audit' && <AuditLogList audit={auditLog} loading={loading} />}
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
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      aria-pressed={isActive}
      className={cn(
        'min-h-10 shrink-0 gap-1.5 rounded-lg px-3 text-xs font-medium',
        isActive
          ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
            isActive ? 'bg-primary-foreground/25' : 'bg-muted',
          )}
        >
          {count}
        </span>
      )}
    </Button>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Devices list
// ─────────────────────────────────────────────────────────────────────────

const DEVICE_COLUMNS: AdminTableColumn[] = [
  { key: 'user', label: 'Felhasználó' },
  { key: 'device', label: 'Eszköz' },
  { key: 'platform', label: 'Platform', hideBelow: 'md' },
  { key: 'registered', label: 'Regisztrálva', hideBelow: 'lg' },
  { key: 'last_seen', label: 'Utolsó aktivitás', hideBelow: 'lg' },
  { key: 'status', label: 'Státusz', align: 'center' },
  { key: 'actions', label: <span className="sr-only">Műveletek</span>, align: 'right' },
]

function DeviceStatus({ device }: { device: UserDevice }) {
  if (!device.revoked) {
    return (
      <StatusBadge intent="success" icon={CheckCircle2}>
        Aktív
      </StatusBadge>
    )
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <StatusBadge intent="danger" icon={XCircle}>
        Visszavont
      </StatusBadge>
      {device.revoke_reason && (
        <span className="max-w-44 truncate text-[11px] text-muted-foreground" title={device.revoke_reason}>
          Ok: {device.revoke_reason}
        </span>
      )}
    </div>
  )
}

function DeviceActionButton({
  device, onRevoke, onRestore, className,
}: {
  device: UserDevice
  onRevoke: (d: UserDevice) => void
  onRestore: (d: UserDevice) => void
  className?: string
}) {
  return device.revoked ? (
    <Button
      size="sm"
      variant="outline"
      onClick={() => onRestore(device)}
      className={cn(
        'min-h-10 gap-1 rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40',
        className,
      )}
    >
      <RotateCcw className="size-3" /> Visszaállít
    </Button>
  ) : (
    <Button
      size="sm"
      variant="outline"
      onClick={() => onRevoke(device)}
      className={cn(
        'min-h-10 gap-1 rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40',
        className,
      )}
    >
      <XCircle className="size-3" /> Visszavonás
    </Button>
  )
}

function DevicesList({
  devices,
  loading,
  onRevoke,
  onRestore,
}: {
  devices: UserDevice[]
  loading: boolean
  onRevoke: (d: UserDevice) => void
  onRestore: (d: UserDevice) => void
}) {
  return (
    <AdminTable
      columns={DEVICE_COLUMNS}
      rows={devices}
      rowKey={(d) => d.id}
      loading={loading}
      minWidthClass="min-w-[680px]"
      empty={
        <AdminEmptyState
          icon={Monitor}
          title="Nincs regisztrált eszköz"
          hint="Amint az első lelkész bejelentkezik a Kartotéka desktop-alkalmazással, az eszköze itt fog megjelenni."
        />
      }
      renderCell={(d, key) => {
        switch (key) {
          case 'user':
            return (
              <div className={d.revoked ? 'opacity-60' : ''}>
                <p className="font-medium text-foreground">{d.user_full_name || '—'}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{d.user_email}</p>
              </div>
            )
          case 'device':
            return (
              <div className={d.revoked ? 'opacity-60' : ''}>
                <p className="font-medium text-foreground">{d.device_name || 'Névtelen'}</p>
                <p className="max-w-40 truncate font-mono text-[10px] text-muted-foreground">
                  {d.device_fingerprint}
                </p>
              </div>
            )
          case 'platform':
            return <StatusBadge intent="neutral">{d.platform}</StatusBadge>
          case 'registered':
            return (
              <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {formatDateTime(d.registered_at)}
              </span>
            )
          case 'last_seen':
            return (
              <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {d.last_seen ? formatDateTime(d.last_seen) : '—'}
              </span>
            )
          case 'status':
            return <DeviceStatus device={d} />
          case 'actions':
            return <DeviceActionButton device={d} onRevoke={onRevoke} onRestore={onRestore} />
          default:
            return null
        }
      }}
      renderMobileCard={(d) => (
        <div className={cn('rounded-xl border border-border bg-card p-3', d.revoked && 'opacity-80')}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{d.device_name || 'Névtelen'}</p>
              <p className="truncate text-xs text-muted-foreground">
                {d.user_full_name || d.user_email || '—'}
              </p>
            </div>
            <StatusBadge intent={d.revoked ? 'danger' : 'success'} icon={d.revoked ? XCircle : CheckCircle2}>
              {d.revoked ? 'Visszavont' : 'Aktív'}
            </StatusBadge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge intent="neutral">{d.platform}</StatusBadge>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              Regisztrálva: {formatDate(d.registered_at)}
            </span>
            {d.last_seen && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                · Aktív: {formatDate(d.last_seen)}
              </span>
            )}
          </div>
          {d.revoked && d.revoke_reason && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              A visszavonás oka: {d.revoke_reason}
            </p>
          )}
          <div className="mt-2">
            <DeviceActionButton device={d} onRevoke={onRevoke} onRestore={onRestore} className="w-full" />
          </div>
        </div>
      )}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Licenses list
// ─────────────────────────────────────────────────────────────────────────

const LICENSE_COLUMNS: AdminTableColumn[] = [
  { key: 'user', label: 'Felhasználó' },
  { key: 'limit', label: 'Eszköz-limit', align: 'center', hideBelow: 'sm', className: 'tabular-nums' },
  { key: 'valid', label: 'Érvényes' },
  { key: 'status', label: 'Státusz', align: 'center' },
  { key: 'notes', label: 'Megjegyzés', hideBelow: 'md' },
]

function licenseStatus(l: License): { intent: 'success' | 'warning' | 'danger'; label: string } {
  if (l.revoked) return { intent: 'danger', label: 'Visszavont' }
  if (isLicenseExpired(l.valid_until)) return { intent: 'warning', label: 'Lejárt' }
  return { intent: 'success', label: 'Aktív' }
}

function LicensesList({ licenses, loading }: { licenses: License[]; loading: boolean }) {
  return (
    <AdminTable
      columns={LICENSE_COLUMNS}
      rows={licenses}
      rowKey={(l) => l.id}
      loading={loading}
      minWidthClass="min-w-[560px]"
      empty={
        <AdminEmptyState
          icon={Key}
          title="Nincs kibocsátott licenc"
          hint="A licenc-kibocsátás a desktop-kliens egy későbbi fázisában (M5) érkezik. Minden licenc: felhasználó + max eszközszám + lejárat."
        />
      }
      renderCell={(l, key) => {
        const status = licenseStatus(l)
        const inactive = l.revoked || status.label === 'Lejárt'
        switch (key) {
          case 'user':
            return (
              <div className={inactive ? 'opacity-60' : ''}>
                <p className="font-medium text-foreground">{l.user_full_name || '—'}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{l.user_email}</p>
              </div>
            )
          case 'limit':
            return <span className="text-foreground">{l.device_limit}</span>
          case 'valid':
            return (
              <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {formatDate(l.valid_from)} — {formatDate(l.valid_until)}
              </span>
            )
          case 'status':
            return <StatusBadge intent={status.intent}>{status.label}</StatusBadge>
          case 'notes':
            return (
              <span className="block max-w-60 truncate text-xs text-muted-foreground" title={l.notes || undefined}>
                {l.notes || '—'}
              </span>
            )
          default:
            return null
        }
      }}
      renderMobileCard={(l) => {
        const status = licenseStatus(l)
        return (
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{l.user_full_name || '—'}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">{l.user_email}</p>
              </div>
              <StatusBadge intent={status.intent}>{status.label}</StatusBadge>
            </div>
            <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">
              Érvényes: {formatDate(l.valid_from)} — {formatDate(l.valid_until)} · {l.device_limit} eszköz
            </p>
            {l.notes && <p className="mt-1 text-xs text-muted-foreground">{l.notes}</p>}
          </div>
        )
      }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────────────────

const AUDIT_COLUMNS: AdminTableColumn[] = [
  { key: 'time', label: 'Időpont' },
  { key: 'user', label: 'Felhasználó', hideBelow: 'sm' },
  { key: 'action', label: 'Akció' },
  { key: 'target', label: 'Cél', hideBelow: 'md' },
  { key: 'metadata', label: 'Metaadat', hideBelow: 'lg' },
]

function metadataPreview(metadata: unknown): string {
  const s = JSON.stringify(metadata)
  return s.length > 60 ? `${s.slice(0, 60)}…` : s
}

/** Kibontható metaadat — a nyers JSON 60 karakteres vágása helyett. */
function MetadataCell({ metadata }: { metadata: unknown }) {
  if (metadata == null) return <span className="text-muted-foreground">—</span>
  return (
    <details className="max-w-64">
      <summary className="cursor-pointer list-none truncate font-mono text-[11px] text-muted-foreground transition hover:text-foreground">
        {metadataPreview(metadata)}
      </summary>
      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-2 text-[10px] text-foreground">
        {JSON.stringify(metadata, null, 2)}
      </pre>
    </details>
  )
}

function AuditLogList({ audit, loading }: { audit: AuditLogEntry[]; loading: boolean }) {
  const [query, setQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('')

  const actionOptions = useMemo(
    () => Array.from(new Set(audit.map((e) => e.action))).sort(),
    [audit],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return audit.filter((e) => {
      if (actionFilter && e.action !== actionFilter) return false
      if (!needle) return true
      const hay = [
        e.user_email ?? '',
        e.target_table ?? '',
        e.target_id ?? '',
        auditActionLabel(e.action),
        e.metadata ? JSON.stringify(e.metadata) : '',
      ].join(' ').toLowerCase()
      return hay.includes(needle)
    })
  }, [audit, query, actionFilter])

  const isFiltering = query.trim() !== '' || actionFilter !== ''

  return (
    <div className="space-y-3">
      {audit.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-52">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Keresés (email, cél, metaadat)…"
              className="h-10 pl-9"
              aria-label="Keresés a naplóban"
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-10 w-auto min-w-36 flex-none rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label="Szűrés akció szerint"
          >
            <option value="">Minden akció</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>{auditActionLabel(a)}</option>
            ))}
          </select>
        </div>
      )}
      <AdminTable
        columns={AUDIT_COLUMNS}
        rows={filtered}
        rowKey={(e) => e.id}
        loading={loading}
        minWidthClass="min-w-[640px]"
        empty={
          isFiltering ? (
            <AdminEmptyState
              icon={Search}
              title="Nincs találat"
              hint="Módosítsd a keresést vagy az akció-szűrőt — a napló az utolsó 200 bejegyzést mutatja."
            />
          ) : (
            <AdminEmptyState
              icon={ScrollText}
              title="Nincs naplóbejegyzés"
              hint="A napló az első admin-akciónál (pl. hozzáférés-kérelem jóváhagyása) jön létre."
            />
          )
        }
        renderCell={(e, key) => {
          switch (key) {
            case 'time':
              return (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                  <Calendar className="size-3 shrink-0" aria-hidden />
                  {formatDateTime(e.created_at)}
                </span>
              )
            case 'user':
              return (
                <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
                  <User className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                  {e.user_email || '(rendszer)'}
                </span>
              )
            case 'action':
              return <StatusBadge intent="neutral">{auditActionLabel(e.action)}</StatusBadge>
            case 'target':
              return e.target_table ? (
                <span className="text-xs text-muted-foreground">
                  <span className="font-mono">{e.target_table}</span>
                  {e.target_id && <span className="font-mono opacity-70"> / {e.target_id.slice(0, 8)}</span>}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            case 'metadata':
              return <MetadataCell metadata={e.metadata} />
            default:
              return null
          }
        }}
        renderMobileCard={(e) => (
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge intent="neutral">{auditActionLabel(e.action)}</StatusBadge>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {formatDateTime(e.created_at)}
              </span>
            </div>
            <p className="mt-1.5 truncate text-xs text-foreground">{e.user_email || '(rendszer)'}</p>
            {e.target_table && (
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {e.target_table}
                {e.target_id ? ` / ${e.target_id.slice(0, 8)}` : ''}
              </p>
            )}
            {e.metadata != null && (
              <div className="mt-1.5">
                <MetadataCell metadata={e.metadata} />
              </div>
            )}
          </div>
        )}
      />
    </div>
  )
}
