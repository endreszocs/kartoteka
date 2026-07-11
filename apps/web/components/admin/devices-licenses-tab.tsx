'use client'

/**
 * Admin → Eszközök, licencek, napló fül (M0.5 + admin-redesign 2. kör).
 *
 * A Tauri-kliens infrastruktúrájának admin-oldala:
 *   1. Regisztrált eszközök (read + revoke/restore, alvó-eszköz kiemelés)
 *   2. Kibocsátott licencek — TELJES CRUD (kibocsátás, hosszabbítás,
 *      szerkesztés, visszavonás/visszaállítás)
 *   3. Audit-napló — felhasználó/akció/dátum-szűrő + CSV-export
 *
 * 2026-07-11 admin-redesign 2. kör: KPI-sáv (kattintható szűrőkkel), licenc-
 * életciklus StatusBadge, token-alapú színek, AdminTable mobil kártya-nézettel.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Monitor, Key, ScrollText, RefreshCw, XCircle, CheckCircle2, Info,
  Calendar, User, RotateCcw, Search, Plus, MoreHorizontal, CalendarClock,
  Pencil, Download, FilterX,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { AdminConfirmDialog } from './admin-confirm-dialog'
import { AdminTable, type AdminTableColumn } from './_shared/admin-table'
import { AdminEmptyState } from './_shared/admin-empty-state'
import { StatusBadge, type StatusIntent } from './_shared/status-badge'
import { DevicesLicensesKpiRow } from './devices/kpi-row'
import { LicenseCreateDialog } from './devices/license-create-dialog'
import { LicenseExtendDialog, LicenseEditDialog } from './devices/license-manage-dialogs'

import {
  listUserDevices,
  listLicenses,
  listAuditLog,
  revokeDevice,
  restoreDevice,
  revokeLicense,
  restoreLicense,
} from '@/app/(dashboard)/admin/devices-licenses-actions'
import {
  auditActionLabel,
  getLicenseLifecycle,
  isDeviceDormant,
  licenseDaysLeft,
  type AuditLogEntry,
  type License,
  type UserDevice,
} from '@/app/(dashboard)/admin/devices-licenses-shared'

type SubTab = 'devices' | 'licenses' | 'audit'
type DeviceFilter = 'all' | 'active' | 'dormant' | 'revoked'
type LicenseFilter = 'all' | 'valid' | 'expiring' | 'expired' | 'revoked'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('hu-HU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('hu-HU')
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Token-alapú, mobil-barát szűrő-legördülő (a natív select-re építve). */
function FilterSelect({
  value, onChange, options, ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  ariaLabel: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="h-10 w-auto min-w-36 flex-none rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export function DevicesLicensesTab() {
  const [subTab, setSubTab] = useState<SubTab>('devices')
  const [devices, setDevices] = useState<UserDevice[]>([])
  const [licenses, setLicenses] = useState<License[]>([])
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const [deviceFilter, setDeviceFilter] = useState<DeviceFilter>('all')
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>('all')

  // Mindhárom listát egyszerre töltjük: így az al-tab számlálók és a KPI-sáv
  // az első betöltéstől pontosak, és a gyors tabváltás sem indít versengő kéréseket.
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

  // ─── KPI-számítás (a KPI-sáv + a kattintható szűrők közös forrása) ───
  // A „most" a helper-ek belső alapértéke (Date.now()) — így a komponens
  // render-teste tiszta marad (react-hooks/purity).
  const kpis = useMemo(() => {
    let activeDevices = 0
    let dormantDevices = 0
    for (const d of devices) {
      if (!d.revoked) activeDevices++
      if (isDeviceDormant(d)) dormantDevices++
    }
    let activeLicenses = 0
    let expiringLicenses = 0
    for (const l of licenses) {
      const lc = getLicenseLifecycle(l)
      if (lc === 'active' || lc === 'expiring') activeLicenses++
      if (lc === 'expiring') expiringLicenses++
    }
    return { activeDevices, activeLicenses, expiringLicenses, dormantDevices }
  }, [devices, licenses])

  // ─── Eszköz-műveletek ───
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

  // ─── Licenc-műveletek ───
  const [createOpen, setCreateOpen] = useState(false)
  const [extendTarget, setExtendTarget] = useState<License | null>(null)
  const [editTarget, setEditTarget] = useState<License | null>(null)
  const [licenseRevokeTarget, setLicenseRevokeTarget] = useState<License | null>(null)
  const [licenseRestoreTarget, setLicenseRestoreTarget] = useState<License | null>(null)
  const [licenseBusy, setLicenseBusy] = useState(false)

  async function doLicenseRevoke(reason?: string) {
    if (!licenseRevokeTarget) return
    setLicenseBusy(true)
    const r = await revokeLicense({ id: licenseRevokeTarget.id, reason: (reason || '').trim() || undefined })
    setLicenseBusy(false)
    if (r.error) toast.error(r.error)
    else {
      toast.success('Licenc visszavonva.')
      setLicenseRevokeTarget(null)
      void refresh()
    }
  }

  async function doLicenseRestore() {
    if (!licenseRestoreTarget) return
    setLicenseBusy(true)
    const r = await restoreLicense({ id: licenseRestoreTarget.id })
    setLicenseBusy(false)
    if (r.error) toast.error(r.error)
    else {
      toast.success('Licenc visszaállítva.')
      setLicenseRestoreTarget(null)
      void refresh()
    }
  }

  return (
    <div className="space-y-5">
      {/* ─── KPI-sáv ─── */}
      <DevicesLicensesKpiRow
        kpis={kpis}
        onShowActiveDevices={() => { setSubTab('devices'); setDeviceFilter('active') }}
        onShowActiveLicenses={() => { setSubTab('licenses'); setLicenseFilter('valid') }}
        onShowExpiringLicenses={() => { setSubTab('licenses'); setLicenseFilter('expiring') }}
        onShowDormantDevices={() => { setSubTab('devices'); setDeviceFilter('dormant') }}
      />

      {/* ─── Info-banner ─── */}
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
              visszavonható. A licenceket itt bocsáthatod ki és kezelheted (eszközszám, lejárat).
              A napló minden admin-műveletet rögzít.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Sub-tab-ok ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-card p-0.5 shadow-sm">
          <SubTabButton
            value="devices" current={subTab} onClick={() => setSubTab('devices')}
            label="Eszközök" icon={<Monitor className="size-4" />} count={devices.length}
          />
          <SubTabButton
            value="licenses" current={subTab} onClick={() => setSubTab('licenses')}
            label="Licencek" icon={<Key className="size-4" />} count={licenses.length}
          />
          <SubTabButton
            value="audit" current={subTab} onClick={() => setSubTab('audit')}
            label="Napló" icon={<ScrollText className="size-4" />} count={auditLog.length}
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
            filter={deviceFilter}
            onFilterChange={setDeviceFilter}
            onRevoke={setRevokeTarget}
            onRestore={setRestoreTarget}
          />
        )}
        {subTab === 'licenses' && (
          <LicensesList
            licenses={licenses}
            loading={loading}
            filter={licenseFilter}
            onFilterChange={setLicenseFilter}
            onCreate={() => setCreateOpen(true)}
            onExtend={setExtendTarget}
            onEdit={setEditTarget}
            onRevoke={setLicenseRevokeTarget}
            onRestore={setLicenseRestoreTarget}
          />
        )}
        {subTab === 'audit' && <AuditLogList initialAudit={auditLog} loading={loading} />}
      </div>

      {/* ─── Eszköz-dialógusok ─── */}
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

      {/* ─── Licenc-dialógusok ─── */}
      <LicenseCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void refresh()}
      />
      <LicenseExtendDialog
        license={extendTarget}
        onOpenChange={(o) => !o && setExtendTarget(null)}
        onDone={() => void refresh()}
      />
      <LicenseEditDialog
        license={editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onDone={() => void refresh()}
      />
      <AdminConfirmDialog
        open={!!licenseRevokeTarget}
        onOpenChange={(o) => !o && setLicenseRevokeTarget(null)}
        title="Licenc visszavonása"
        tone="danger"
        description={
          licenseRevokeTarget ? (
            <>
              Visszavonod{' '}
              <strong>{licenseRevokeTarget.user_full_name || licenseRevokeTarget.user_email || 'a felhasználó'}</strong>{' '}
              licencét? A desktop-kliens ezután nem tekinti érvényesnek. Bármikor visszaállítható.
            </>
          ) : null
        }
        reasonLabel="A visszavonás oka (opcionális)"
        reasonPlaceholder="Pl. előfizetés lejárt, kérésre…"
        confirmLabel="Visszavonás"
        loading={licenseBusy}
        onConfirm={(reason) => doLicenseRevoke(reason)}
      />
      <AdminConfirmDialog
        open={!!licenseRestoreTarget}
        onOpenChange={(o) => !o && setLicenseRestoreTarget(null)}
        title="Licenc visszaállítása"
        description={
          licenseRestoreTarget ? (
            <>
              Visszaállítod{' '}
              <strong>{licenseRestoreTarget.user_full_name || licenseRestoreTarget.user_email || 'a felhasználó'}</strong>{' '}
              licencét? A desktop-kliens ismét érvényesnek fogja tekinteni.
            </>
          ) : null
        }
        confirmLabel="Visszaállítás"
        loading={licenseBusy}
        onConfirm={() => doLicenseRestore()}
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

const DEVICE_FILTER_OPTIONS: { value: DeviceFilter; label: string }[] = [
  { value: 'all', label: 'Minden eszköz' },
  { value: 'active', label: 'Aktív' },
  { value: 'dormant', label: 'Alvó (30+ nap)' },
  { value: 'revoked', label: 'Visszavont' },
]

function DeviceStatus({ device, dormant }: { device: UserDevice; dormant: boolean }) {
  if (device.revoked) {
    return (
      <div className="flex flex-col items-center gap-1">
        <StatusBadge intent="danger" icon={XCircle}>Visszavont</StatusBadge>
        {device.revoke_reason && (
          <span className="max-w-44 truncate text-[11px] text-muted-foreground" title={device.revoke_reason}>
            Ok: {device.revoke_reason}
          </span>
        )}
      </div>
    )
  }
  if (dormant) {
    return <StatusBadge intent="warning">Alvó</StatusBadge>
  }
  return (
    <StatusBadge intent="success" icon={CheckCircle2}>Aktív</StatusBadge>
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
  devices, loading, filter, onFilterChange, onRevoke, onRestore,
}: {
  devices: UserDevice[]
  loading: boolean
  filter: DeviceFilter
  onFilterChange: (f: DeviceFilter) => void
  onRevoke: (d: UserDevice) => void
  onRestore: (d: UserDevice) => void
}) {
  const filtered = useMemo(() => devices.filter((d) => {
    switch (filter) {
      case 'active': return !d.revoked
      case 'revoked': return d.revoked
      case 'dormant': return isDeviceDormant(d)
      default: return true
    }
  }), [devices, filter])

  const isFiltering = filter !== 'all'

  return (
    <div className="space-y-3">
      {devices.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FilterSelect
            value={filter}
            onChange={(v) => onFilterChange(v as DeviceFilter)}
            options={DEVICE_FILTER_OPTIONS}
            ariaLabel="Eszközök szűrése"
          />
          <span className="text-xs tabular-nums text-muted-foreground">
            {filtered.length} / {devices.length} eszköz
          </span>
        </div>
      )}
      <AdminTable
        columns={DEVICE_COLUMNS}
        rows={filtered}
        rowKey={(d) => d.id}
        loading={loading}
        minWidthClass="min-w-[680px]"
        empty={
          isFiltering ? (
            <AdminEmptyState
              icon={Search}
              title="Nincs a szűrésnek megfelelő eszköz"
              hint="Módosítsd a szűrőt a többi eszköz megjelenítéséhez."
            />
          ) : (
            <AdminEmptyState
              icon={Monitor}
              title="Nincs regisztrált eszköz"
              hint="Amint az első lelkész bejelentkezik a Kartotéka desktop-alkalmazással, az eszköze itt fog megjelenni."
            />
          )
        }
        renderCell={(d, key) => {
          const dormant = isDeviceDormant(d)
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
              return <DeviceStatus device={d} dormant={dormant} />
            case 'actions':
              return <DeviceActionButton device={d} onRevoke={onRevoke} onRestore={onRestore} />
            default:
              return null
          }
        }}
        renderMobileCard={(d) => {
          const dormant = isDeviceDormant(d)
          return (
            <div className={cn('rounded-xl border border-border bg-card p-3', d.revoked && 'opacity-80')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{d.device_name || 'Névtelen'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.user_full_name || d.user_email || '—'}
                  </p>
                </div>
                <DeviceStatus device={d} dormant={dormant} />
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
          )
        }}
      />
    </div>
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
  { key: 'notes', label: 'Megjegyzés', hideBelow: 'lg' },
  { key: 'actions', label: <span className="sr-only">Műveletek</span>, align: 'right' },
]

const LICENSE_FILTER_OPTIONS: { value: LicenseFilter; label: string }[] = [
  { value: 'all', label: 'Minden licenc' },
  { value: 'valid', label: 'Aktív' },
  { value: 'expiring', label: '30 napon belül lejár' },
  { value: 'expired', label: 'Lejárt' },
  { value: 'revoked', label: 'Visszavont' },
]

function licenseStatusView(l: License, now: number = Date.now()): { intent: StatusIntent; label: string; sub?: string } {
  const lc = getLicenseLifecycle(l, now)
  switch (lc) {
    case 'revoked': return { intent: 'danger', label: 'Visszavont' }
    case 'expired': return { intent: 'danger', label: 'Lejárt' }
    case 'expiring': {
      const days = licenseDaysLeft(l.valid_until, now)
      return { intent: 'warning', label: 'Hamarosan lejár', sub: `${days} nap` }
    }
    default: return { intent: 'success', label: 'Aktív' }
  }
}

function LicenseRowActions({
  license, onExtend, onEdit, onRevoke, onRestore,
}: {
  license: License
  onExtend: (l: License) => void
  onEdit: (l: License) => void
  onRevoke: (l: License) => void
  onRestore: (l: License) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-lg" aria-label="Licenc műveletek" />}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {!license.revoked && (
          <>
            <DropdownMenuItem onClick={() => onExtend(license)} className="gap-2">
              <CalendarClock className="size-4" /> Hosszabbítás
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(license)} className="gap-2">
              <Pencil className="size-4" /> Szerkesztés
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onRevoke(license)} className="gap-2">
              <XCircle className="size-4" /> Visszavonás
            </DropdownMenuItem>
          </>
        )}
        {license.revoked && (
          <DropdownMenuItem onClick={() => onRestore(license)} className="gap-2">
            <RotateCcw className="size-4" /> Visszaállítás
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function LicensesList({
  licenses, loading, filter, onFilterChange, onCreate, onExtend, onEdit, onRevoke, onRestore,
}: {
  licenses: License[]
  loading: boolean
  filter: LicenseFilter
  onFilterChange: (f: LicenseFilter) => void
  onCreate: () => void
  onExtend: (l: License) => void
  onEdit: (l: License) => void
  onRevoke: (l: License) => void
  onRestore: (l: License) => void
}) {
  const filtered = useMemo(() => licenses.filter((l) => {
    const lc = getLicenseLifecycle(l)
    switch (filter) {
      case 'valid': return lc === 'active' || lc === 'expiring'
      case 'expiring': return lc === 'expiring'
      case 'expired': return lc === 'expired'
      case 'revoked': return lc === 'revoked'
      default: return true
    }
  }), [licenses, filter])

  const isFiltering = filter !== 'all'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {licenses.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              value={filter}
              onChange={(v) => onFilterChange(v as LicenseFilter)}
              options={LICENSE_FILTER_OPTIONS}
              ariaLabel="Licencek szűrése"
            />
            <span className="text-xs tabular-nums text-muted-foreground">
              {filtered.length} / {licenses.length} licenc
            </span>
          </div>
        ) : (
          <span />
        )}
        <Button onClick={onCreate} className="min-h-10 gap-1.5">
          <Plus className="size-4" /> Új licenc
        </Button>
      </div>
      <AdminTable
        columns={LICENSE_COLUMNS}
        rows={filtered}
        rowKey={(l) => l.id}
        loading={loading}
        minWidthClass="min-w-[620px]"
        empty={
          isFiltering ? (
            <AdminEmptyState
              icon={Search}
              title="Nincs a szűrésnek megfelelő licenc"
              hint="Módosítsd a szűrőt, vagy bocsáss ki új licencet."
              action={
                <Button onClick={onCreate} className="gap-1.5">
                  <Plus className="size-4" /> Új licenc
                </Button>
              }
            />
          ) : (
            <AdminEmptyState
              icon={Key}
              title="Nincs kibocsátott licenc"
              hint="Bocsáss ki licencet egy felhasználónak: meghatározza a maximális eszközszámot és a lejáratot."
              action={
                <Button onClick={onCreate} className="gap-1.5">
                  <Plus className="size-4" /> Új licenc
                </Button>
              }
            />
          )
        }
        renderCell={(l, key) => {
          const status = licenseStatusView(l)
          const inactive = status.label === 'Visszavont' || status.label === 'Lejárt'
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
              return (
                <div className="flex flex-col items-center gap-0.5">
                  <StatusBadge intent={status.intent}>{status.label}</StatusBadge>
                  {status.sub && (
                    <span className="text-[11px] tabular-nums text-muted-foreground">{status.sub}</span>
                  )}
                </div>
              )
            case 'notes':
              return (
                <span className="block max-w-60 truncate text-xs text-muted-foreground" title={l.notes || undefined}>
                  {l.notes || '—'}
                </span>
              )
            case 'actions':
              return (
                <LicenseRowActions
                  license={l}
                  onExtend={onExtend}
                  onEdit={onEdit}
                  onRevoke={onRevoke}
                  onRestore={onRestore}
                />
              )
            default:
              return null
          }
        }}
        renderMobileCard={(l) => {
          const status = licenseStatusView(l)
          return (
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{l.user_full_name || '—'}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{l.user_email}</p>
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex flex-col items-end gap-0.5">
                    <StatusBadge intent={status.intent}>{status.label}</StatusBadge>
                    {status.sub && (
                      <span className="text-[11px] tabular-nums text-muted-foreground">{status.sub}</span>
                    )}
                  </div>
                  <LicenseRowActions
                    license={l}
                    onExtend={onExtend}
                    onEdit={onEdit}
                    onRevoke={onRevoke}
                    onRestore={onRestore}
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">
                Érvényes: {formatDate(l.valid_from)} — {formatDate(l.valid_until)} · {l.device_limit} eszköz
              </p>
              {l.notes && <p className="mt-1 text-xs text-muted-foreground">{l.notes}</p>}
            </div>
          )
        }}
      />
    </div>
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

const SYSTEM_USER = '__system__'

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

function csvEscape(value: unknown): string {
  const s = String(value ?? '')
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function exportAuditCsv(rows: AuditLogEntry[]) {
  const headers = ['Időpont', 'Felhasználó', 'Akció', 'Cél tábla', 'Cél azonosító', 'IP', 'Metaadat']
  const lines = [headers.join(';')]
  for (const e of rows) {
    lines.push([
      formatDateTime(e.created_at),
      e.user_email || '(rendszer)',
      auditActionLabel(e.action),
      e.target_table || '',
      e.target_id || '',
      e.ip || '',
      e.metadata != null ? JSON.stringify(e.metadata) : '',
    ].map(csvEscape).join(';'))
  }
  // BOM (﻿) + CRLF — így az Excel helyesen kezeli az ékezetes UTF-8 tartalmat.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kartoteka-naplo-${isoDate(new Date())}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function AuditLogList({ initialAudit, loading }: { initialAudit: AuditLogEntry[]; loading: boolean }) {
  const [query, setQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [serverRows, setServerRows] = useState<AuditLogEntry[] | null>(null)
  const [serverLoading, setServerLoading] = useState(false)

  // Dátum-tartomány → szerveroldali újralekérés (a kezdeti 200-on túli
  // bejegyzésekhez is). Üres tartománynál a szülő adta listát használjuk.
  useEffect(() => {
    // A közvetlen setState-et egy frame-re kitoljuk (a set-state-in-effect
    // lint elkerülésére — ugyanaz a minta, mint az AdminConfirmDialog-ban).
    if (!dateFrom && !dateTo) {
      const raf = requestAnimationFrame(() => {
        setServerRows(null)
        setServerLoading(false)
      })
      return () => cancelAnimationFrame(raf)
    }
    let cancelled = false
    const filter: { limit: number; dateFrom?: string; dateTo?: string } = { limit: 500 }
    if (dateFrom) filter.dateFrom = new Date(`${dateFrom}T00:00:00`).toISOString()
    if (dateTo) filter.dateTo = new Date(`${dateTo}T23:59:59.999`).toISOString()
    const raf = requestAnimationFrame(() => setServerLoading(true))
    const t = setTimeout(() => {
      void listAuditLog(filter).then((res) => {
        if (cancelled) return
        setServerLoading(false)
        if (res.error) {
          toast.error(`Napló: ${res.error}`)
          setServerRows([])
          return
        }
        setServerRows(res.data ?? [])
      })
    }, 200)
    return () => { cancelled = true; cancelAnimationFrame(raf); clearTimeout(t) }
  }, [dateFrom, dateTo])

  const workingRows = serverRows ?? initialAudit

  const actionOptions = useMemo(
    () => Array.from(new Set(workingRows.map((e) => e.action))).sort(),
    [workingRows],
  )
  const userOptions = useMemo(() => {
    const emails = new Set<string>()
    let hasSystem = false
    for (const e of workingRows) {
      if (e.user_email) emails.add(e.user_email)
      else hasSystem = true
    }
    const opts = Array.from(emails).sort().map((email) => ({ value: email, label: email }))
    if (hasSystem) opts.push({ value: SYSTEM_USER, label: '(rendszer)' })
    return opts
  }, [workingRows])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return workingRows.filter((e) => {
      if (actionFilter && e.action !== actionFilter) return false
      if (userFilter) {
        if (userFilter === SYSTEM_USER) {
          if (e.user_email) return false
        } else if (e.user_email !== userFilter) {
          return false
        }
      }
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
  }, [workingRows, query, actionFilter, userFilter])

  const isFiltering =
    query.trim() !== '' || actionFilter !== '' || userFilter !== '' || dateFrom !== '' || dateTo !== ''

  function clearFilters() {
    setQuery('')
    setActionFilter('')
    setUserFilter('')
    setDateFrom('')
    setDateTo('')
  }

  const busy = loading || serverLoading

  return (
    <div className="space-y-3">
      {(initialAudit.length > 0 || isFiltering) && (
        <div className="space-y-2">
          {/* 1. sor: keresés + akció + felhasználó */}
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
            <FilterSelect
              value={actionFilter}
              onChange={setActionFilter}
              options={[{ value: '', label: 'Minden akció' }, ...actionOptions.map((a) => ({ value: a, label: auditActionLabel(a) }))]}
              ariaLabel="Szűrés akció szerint"
            />
            <FilterSelect
              value={userFilter}
              onChange={setUserFilter}
              options={[{ value: '', label: 'Minden felhasználó' }, ...userOptions]}
              ariaLabel="Szűrés felhasználó szerint"
            />
          </div>
          {/* 2. sor: dátum-tartomány + export + törlés */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="size-3.5" aria-hidden />
              Ettől
              <Input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-10 w-auto tabular-nums"
                aria-label="Napló szűrése: kezdő dátum"
              />
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              Eddig
              <Input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-10 w-auto tabular-nums"
                aria-label="Napló szűrése: záró dátum"
              />
            </label>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              {isFiltering && (
                <Button variant="ghost" onClick={clearFilters} className="min-h-10 gap-1.5">
                  <FilterX className="size-4" /> Szűrők törlése
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => exportAuditCsv(filtered)}
                disabled={filtered.length === 0}
                className="min-h-10 gap-1.5"
              >
                <Download className="size-4" /> CSV export
              </Button>
            </div>
          </div>
          {serverRows && (
            <p className="text-[11px] text-muted-foreground">
              {dateFrom || dateTo
                ? `A megadott időszak ${workingRows.length} bejegyzése (max. 500).`
                : null}
            </p>
          )}
        </div>
      )}
      <AdminTable
        columns={AUDIT_COLUMNS}
        rows={filtered}
        rowKey={(e) => e.id}
        loading={busy}
        minWidthClass="min-w-[640px]"
        empty={
          isFiltering ? (
            <AdminEmptyState
              icon={Search}
              title="Nincs találat"
              hint="Módosítsd a keresést, a szűrőket vagy a dátum-tartományt."
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
