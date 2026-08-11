'use client'

/**
 * Admin kereszt-gyülekezeti egyeztetés fül (2026-08-09).
 *
 * A MÁR BENT LÉVŐ adatok egyeztetése: lista minden gyanús tag-egyezésről
 * (két gyülekezet, egy személy), teljes-állomány átvizsgáló gomb, és
 * lelkész-értesítés (e-mail + app-értesítés) tételenként.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BellRing,
  CheckCircle2,
  Link2,
  RefreshCcw,
  ScanSearch,
  UserRoundX,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  listCrossMatchAdmin,
  notifyPastorsForMatch,
  resolveCrossMatchAsAdmin,
  runCrossMatchScan,
} from '@/app/(dashboard)/admin/egyeztetesek-actions'
import type {
  CrossMatchAdminResolution,
  CrossMatchAdminRow,
  CrossMatchAdminSide,
} from '@/app/(dashboard)/admin/egyeztetesek-shared'
import { AdminEmptyState } from '@/components/admin/_shared/admin-empty-state'
import { AdminTable, type AdminTableColumn } from '@/components/admin/_shared/admin-table'
import { StatusBadge, type StatusIntent } from '@/components/admin/_shared/status-badge'
import { Button } from '@/components/ui/button'

const CONFIDENCE_META: Record<string, { label: string; intent: StatusIntent }> = {
  name_phone: { label: 'Név + telefon', intent: 'danger' },
  name_birth: { label: 'Név + szül. dátum', intent: 'warning' },
  phone_only: { label: 'Csak telefon', intent: 'info' },
  name_only: { label: 'Csak név', intent: 'neutral' },
}

const RESOLUTION_META: Record<CrossMatchAdminResolution, { label: string; intent: StatusIntent }> = {
  same_person: { label: 'Azonos személy', intent: 'success' },
  different_person: { label: 'Két külön személy', intent: 'info' },
  dismissed: { label: 'Elvetve', intent: 'neutral' },
}

function fmtDate(value: string | null | undefined, withTime = false): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(d)
}

function SideCell({ side }: { side: CrossMatchAdminSide }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-foreground">
        {side.szemelyName || 'Ismeretlen név'}
        <span className="ml-1.5 font-mono text-[11px] font-normal text-muted-foreground">#{side.szemelyId}</span>
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {side.congregationName || 'Ismeretlen gyülekezet'}
        {side.szDatum ? ` · szül. ${fmtDate(side.szDatum)}` : ''}
      </p>
      <p className="truncate text-[11px] text-muted-foreground/80">
        {side.pastorName
          ? `Lelkész: ${side.pastorName}${side.pastorEmail ? ` (${side.pastorEmail})` : ''}`
          : 'Nincs rögzített lelkész'}
      </p>
    </div>
  )
}

export function CrossMatchTab() {
  const [rows, setRows] = useState<CrossMatchAdminRow[]>([])
  const [loading, setLoading] = useState(true)
  const [needsSql, setNeedsSql] = useState(false)
  const [accessLevel, setAccessLevel] = useState<'master' | 'admin' | 'district_admin' | null>(null)
  const [includeResolved, setIncludeResolved] = useState(false)
  const [scanBusy, setScanBusy] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // 2026-08-11: a betöltés SZÉTVÁLASZTVA. Korábban egyetlen `load()` futott az
  // effect törzséből, és rögtön `setLoading(true)`-t hívott — szinkron setState
  // az effectben (react-hooks/set-state-in-effect → kaszkádoló újrarender).
  // Most:
  //   · az effect maga indítja a lekérést, és CSAK a válasz megérkezésekor
  //     (aszinkron callbackben) ír állapotot — ez a szabály szerinti helyes ág;
  //   · a töltő-állapotot ott kapcsoljuk be, ahol a felhasználó KÉRI:
  //     eseménykezelőben (`reload`, szűrő-kapcsoló);
  //   · az első betöltés látványát a `useState(true)` kezdőérték adja.
  // Ráadásul most már van lemondás (`cancelled`): a gyorsan egymás után váltott
  // szűrő korábban felülírhatta az újabb választ a régivel.
  const applyListResult = useCallback((res: Awaited<ReturnType<typeof listCrossMatchAdmin>>) => {
    if (res.error) {
      toast.error(res.error)
    } else {
      setRows(res.rows || [])
      setNeedsSql(!!res.needsSql)
      setAccessLevel(res.accessLevel || null)
    }
    setLoading(false)
  }, [])

  const reload = useCallback(async (withResolved: boolean) => {
    setLoading(true)
    applyListResult(await listCrossMatchAdmin(withResolved))
  }, [applyListResult])

  useEffect(() => {
    let cancelled = false
    listCrossMatchAdmin(includeResolved).then((res) => {
      if (!cancelled) applyListResult(res)
    })
    return () => { cancelled = true }
  }, [applyListResult, includeResolved])

  const openCount = useMemo(() => rows.filter((r) => !r.resolution).length, [rows])
  const notifiedCount = useMemo(
    () => rows.filter((r) => !r.resolution && r.adminNotifiedAt).length,
    [rows],
  )
  const canScan = accessLevel === 'master' || accessLevel === 'admin'

  async function handleScan() {
    if (
      !window.confirm(
        'A rendszer a TELJES tag-állományt átvizsgálja, és minden erős kereszt-gyülekezeti egyezésre (név + születési dátum vagy név + telefon) egyeztetési tételt hoz létre. Folytatod?',
      )
    ) {
      return
    }
    setScanBusy(true)
    const res = await runCrossMatchScan()
    setScanBusy(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    if (res.needsSql) {
      setNeedsSql(true)
      toast.error('Előbb futtasd le a 2026-08-09-admin-kereszt-egyeztetes.sql migrációt.')
      return
    }
    toast.success(
      res.newMatches
        ? `Átvizsgálás kész — ${res.newMatches} új egyezés került a listába (összesen ${res.totalOpen} nyitott).`
        : `Átvizsgálás kész — új egyezés nem került elő (összesen ${res.totalOpen} nyitott).`,
    )
    await reload(includeResolved)
  }

  async function handleNotify(row: CrossMatchAdminRow) {
    const again = row.adminNotifiedAt
      ? ` (Korábban már ment értesítés: ${fmtDate(row.adminNotifiedAt, true)}.)`
      : ''
    if (
      !window.confirm(
        `Értesítés küldése mindkét lelkésznek (${row.triggering.congregationName || '?'} és ${row.matched.congregationName || '?'}) e-mailben és app-értesítésben?${again}`,
      )
    ) {
      return
    }
    setBusyId(row.id)
    const res = await notifyPastorsForMatch(row.id)
    setBusyId(null)
    if (res.error) {
      toast.error(res.error)
      return
    }
    const parts = []
    if (res.emailed) parts.push(`${res.emailed} e-mail`)
    if (res.inApp) parts.push(`${res.inApp} app-értesítés`)
    toast.success(`Értesítés kiküldve: ${parts.join(' + ') || 'rögzítve'}.`)
    for (const w of res.warnings || []) toast.warning(w)
    await reload(includeResolved)
  }

  async function handleResolve(row: CrossMatchAdminRow, resolution: CrossMatchAdminResolution) {
    const labels: Record<CrossMatchAdminResolution, string> = {
      same_person: 'AZONOS személyként jelölöd',
      different_person: 'KÉT KÜLÖN személyként jelölöd',
      dismissed: 'ELVETED (később visszanyitható SQL-ből)',
    }
    if (!window.confirm(`${row.triggering.szemelyName || '?'} ↔ ${row.matched.szemelyName || '?'}: ${labels[resolution]}. Folytatod?`)) {
      return
    }
    setBusyId(row.id)
    const res = await resolveCrossMatchAsAdmin(row.id, resolution)
    setBusyId(null)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('A döntés rögzítve.')
    await reload(includeResolved)
  }

  if (needsSql) {
    return (
      <AdminEmptyState
        icon={Link2}
        title="Az egyeztetési felülethez adatbázis-frissítés szükséges"
        hint="Futtasd le a migration-docs/sql/2026-08-09-admin-kereszt-egyeztetes.sql fájlt a Supabase SQL Editorban — ez hozza létre az átvizsgáló és lista-függvényeket. Utána frissítsd az oldalt."
        action={
          <Button variant="outline" className="rounded-xl" onClick={() => void reload(includeResolved)}>
            <RefreshCcw className="mr-1.5 size-4" /> Újrapróbálás
          </Button>
        }
      />
    )
  }

  const columns: AdminTableColumn[] = [
    { key: 'triggering', label: 'Személy „A"' },
    { key: 'matched', label: 'Személy „B"' },
    { key: 'confidence', label: 'Egyezés', hideBelow: 'lg' },
    { key: 'created', label: 'Létrejött', hideBelow: 'lg', className: 'whitespace-nowrap' },
    { key: 'status', label: 'Állapot' },
    { key: 'actions', label: '', align: 'right' },
  ]

  const renderActions = (row: CrossMatchAdminRow) => (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button
        size="sm"
        variant="outline"
        className="h-8 rounded-lg px-2 text-xs"
        disabled={busyId === row.id}
        onClick={() => void handleNotify(row)}
        title="E-mail + app-értesítés mindkét érintett lelkésznek"
      >
        <BellRing className="mr-1 size-3.5" />
        {row.adminNotifiedAt ? 'Újraértesítés' : 'Értesítés'}
      </Button>
      {/* A döntés-RPC a kerületi adminnak is engedélyezett (saját kerülete) */}
      {!row.resolution && (
        <>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-lg px-2 text-xs text-emerald-700"
            disabled={busyId === row.id}
            onClick={() => void handleResolve(row, 'same_person')}
            title="Azonos személy — a döntés rögzítése"
          >
            <CheckCircle2 className="mr-1 size-3.5" /> Azonos
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-lg px-2 text-xs text-sky-700"
            disabled={busyId === row.id}
            onClick={() => void handleResolve(row, 'different_person')}
            title="Két külön személy — a döntés rögzítése"
          >
            <UserRoundX className="mr-1 size-3.5" /> Külön
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-lg px-2 text-xs text-muted-foreground"
            disabled={busyId === row.id}
            onClick={() => void handleResolve(row, 'dismissed')}
            title="Elvetés — most nem rendezzük"
          >
            <XCircle className="mr-1 size-3.5" /> Elvetés
          </Button>
        </>
      )}
    </div>
  )

  const renderStatus = (row: CrossMatchAdminRow) => (
    <div className="flex flex-wrap items-center gap-1">
      {row.resolution ? (
        <StatusBadge intent={RESOLUTION_META[row.resolution].intent}>
          {RESOLUTION_META[row.resolution].label}
        </StatusBadge>
      ) : (
        <StatusBadge intent="warning" dot>
          Nyitott
        </StatusBadge>
      )}
      {row.adminNotifiedAt ? (
        <StatusBadge intent="info" icon={BellRing} className="whitespace-nowrap">
          Értesítve: {fmtDate(row.adminNotifiedAt)}
        </StatusBadge>
      ) : null}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-muted/60 px-3 py-2 ring-1 ring-border">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Nyitott egyezés</p>
          <p className="mt-0.5 font-heading text-lg font-semibold tabular-nums text-foreground">{loading ? '…' : openCount}</p>
        </div>
        <div className="rounded-xl bg-muted/60 px-3 py-2 ring-1 ring-border">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Ebből értesítve</p>
          <p className="mt-0.5 font-heading text-lg font-semibold tabular-nums text-foreground">{loading ? '…' : notifiedCount}</p>
        </div>
        <div className="rounded-xl bg-muted/60 px-3 py-2 ring-1 ring-border">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Hatókör</p>
          <p className="mt-0.5 font-heading text-lg font-semibold text-foreground">
            {accessLevel === 'district_admin' ? 'Saját kerület' : 'Teljes rendszer'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 rounded border-input"
            checked={includeResolved}
            onChange={(e) => {
              // A töltő-állapotot itt kapcsoljuk be (eseménykezelő), nem az
              // effect törzsében — lásd a `load` melletti 2026-08-11 jegyzetet.
              setLoading(true)
              setIncludeResolved(e.target.checked)
            }}
          />
          Elrendezett tételek is
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void reload(includeResolved)} disabled={loading}>
            <RefreshCcw className="mr-1.5 size-4" /> Frissítés
          </Button>
          {canScan && (
            <Button size="sm" className="rounded-xl" onClick={() => void handleScan()} disabled={scanBusy}>
              <ScanSearch className="mr-1.5 size-4" />
              {scanBusy ? 'Átvizsgálás folyamatban…' : 'Teljes állomány átvizsgálása'}
            </Button>
          )}
        </div>
      </div>

      <AdminTable<CrossMatchAdminRow>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        minWidthClass="min-w-[900px]"
        empty={
          <AdminEmptyState
            icon={Link2}
            title="Nincs egyeztetésre váró tétel"
            hint={
              canScan
                ? 'A „Teljes állomány átvizsgálása" gombbal a már bent lévő adatokat is ellenőrizheted — az új rögzítéseknél a rendszer automatikusan jelez.'
                : 'Az új rögzítéseknél a rendszer automatikusan jelez; a teljes-állomány átvizsgálást a rendszergazda futtathatja.'
            }
          />
        }
        renderCell={(row, key) => {
          switch (key) {
            case 'triggering':
              return <SideCell side={row.triggering} />
            case 'matched':
              return <SideCell side={row.matched} />
            case 'confidence': {
              const meta = CONFIDENCE_META[row.confidence] || { label: row.confidence, intent: 'neutral' as StatusIntent }
              return <StatusBadge intent={meta.intent}>{meta.label}</StatusBadge>
            }
            case 'created':
              return <span className="text-xs text-muted-foreground">{fmtDate(row.createdAt)}</span>
            case 'status':
              return renderStatus(row)
            case 'actions':
              return renderActions(row)
            default:
              return null
          }
        }}
        renderMobileCard={(row) => {
          const meta = CONFIDENCE_META[row.confidence] || { label: row.confidence, intent: 'neutral' as StatusIntent }
          return (
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <StatusBadge intent={meta.intent}>{meta.label}</StatusBadge>
                <span className="text-[11px] text-muted-foreground">{fmtDate(row.createdAt)}</span>
              </div>
              <div className="mt-2 space-y-2">
                <SideCell side={row.triggering} />
                <div className="border-t border-dashed border-border" />
                <SideCell side={row.matched} />
              </div>
              <div className="mt-2">{renderStatus(row)}</div>
              <div className="mt-2">{renderActions(row)}</div>
            </div>
          )
        }}
      />

      <p className="text-xs text-muted-foreground">
        Az „Értesítés" gomb mindkét érintett lelkésznek hivatalos e-mailt küld (Brevo) és
        app-on belüli értesítést hoz létre, a másik lelkész elérhetőségével. A döntés
        („Azonos" / „Külön" / „Elvetés") a tagnyilvántartásbeli sárga jelölést is lezárja.
      </p>
    </div>
  )
}
