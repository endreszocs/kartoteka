'use client'

/**
 * 2026-06-05 (F4b-2) — Tevékenység-napló (sor-szintű audit) megtekintő.
 * Az admin / egyházmegyei számvevő szűrhet táblára + időszakra, és látja:
 * ki, mikor, milyen műveletet (létrehoz/módosít/töröl) végzett, a régi → új
 * értékekkel. A jogosultságot a `get_record_audit()` RPC RLS-aware módon kezeli.
 *
 * 2026-07-11 admin-redesign:
 *   - AdminTable (mobil kártya-nézettel) + részlet-dialógus a sorokra,
 *   - a szűrők azonnal alkalmazódnak (az Import-naplóval konzisztensen),
 *   - az „Eddig" dátum a kiválasztott nap VÉGÉIG szűr (korábban kizárta
 *     az aznapi bejegyzéseket az UTC-konverzió miatt),
 *   - „Továbbiak betöltése" a fix 200-as limit helyett,
 *   - token-alapú színek (dark-safe), StatusBadge/AdminEmptyState.
 */

import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, History, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { AdminEmptyState } from '@/components/admin/_shared/admin-empty-state'
import { AdminTable } from '@/components/admin/_shared/admin-table'
import { StatusBadge, type StatusIntent } from '@/components/admin/_shared/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getRecordAudit, type RecordAuditRow } from '@/app/(dashboard)/admin/audit-log-actions'

const TABLE_LABELS: Record<string, string> = {
  befizetes: 'Befizetések',
  kiadas: 'Kiadások',
  szemely: 'Tagok',
  profiles: 'Felhasználói profilok',
  profile_roles: 'Szerepkörök',
  congregations: 'Gyülekezetek',
  bealitas: 'Pénzügyi beállítások',
  jarulek_kedvezmeny: 'Járulék-kedvezmények',
  felmentes: 'Felmentések',
}

const TABLE_FILTER_ITEMS: Record<string, string> = {
  '': 'Minden tábla',
  ...TABLE_LABELS,
}

const OP_LABELS: Record<string, { label: string; intent: StatusIntent }> = {
  INSERT: { label: 'Létrehozás', intent: 'success' },
  UPDATE: { label: 'Módosítás', intent: 'warning' },
  DELETE: { label: 'Törlés', intent: 'danger' },
}

const PAGE_SIZE = 200

// A diffből kihagyandó "zajos" technikai mezők
const NOISE_KEYS = new Set(['revision', 'updated_at', 'created', 'created_at'])

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('hu-HU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function opBadge(op: string) {
  const meta = OP_LABELS[op] || { label: op, intent: 'neutral' as StatusIntent }
  return <StatusBadge intent={meta.intent}>{meta.label}</StatusBadge>
}

function diffRows(row: RecordAuditRow): Array<{ key: string; from: unknown; to: unknown }> {
  const oldR = row.old_record || {}
  const newR = row.new_record || {}
  const keys = new Set([...Object.keys(oldR), ...Object.keys(newR)])
  const out: Array<{ key: string; from: unknown; to: unknown }> = []
  for (const k of keys) {
    if (NOISE_KEYS.has(k)) continue
    const a = (oldR as Record<string, unknown>)[k]
    const b = (newR as Record<string, unknown>)[k]
    if (row.op === 'UPDATE') {
      if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ key: k, from: a, to: b })
    } else if (row.op === 'INSERT') {
      if (b !== null && b !== undefined) out.push({ key: k, from: undefined, to: b })
    } else {
      if (a !== null && a !== undefined) out.push({ key: k, from: a, to: undefined })
    }
  }
  return out.slice(0, 40)
}

export function AuditLogTab() {
  const [rows, setRows] = useState<RecordAuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [schemaReady, setSchemaReady] = useState(true)
  const [table, setTable] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [detail, setDetail] = useState<RecordAuditRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getRecordAudit({
        table: table || null,
        // Lokális nap-kezdet / nap-VÉGE — így az „Eddig" napja is benne van,
        // és a román (UTC+2/+3) időzóna sem tolja el a szűrést.
        from: from ? new Date(`${from}T00:00:00`).toISOString() : null,
        to: to ? new Date(`${to}T23:59:59.999`).toISOString() : null,
        limit,
      })
      setSchemaReady(res.schemaReady)
      if (res.error) toast.error(res.error)
      setRows(res.rows)
    } finally {
      setLoading(false)
    }
  }, [table, from, to, limit])

  // A szűrők (és a limit) változásakor azonnal újratöltünk —
  // az Import-napló szűrő-viselkedésével konzisztensen.
  useEffect(() => {
    void load()
  }, [load])

  if (!schemaReady) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-200">
        A tevékenység-napló adatbázis-része még nincs telepítve, ezért itt még nem
        látszanak bejegyzések.
        <span className="mt-1 block text-xs opacity-75">
          Technikai részlet: <code>2026-06-05n-row-audit.sql</code>
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Ki, mikor, mit módosított a kulcstáblákon (pénzügy, tagok, jogosultságok).
        A számvevő a saját egyházmegyéje gyülekezeteit látja. Egy sorra koppintva a
        részletes régi → új értékek is megjelennek.
      </p>

      {/* Szűrők — módosításkor azonnal frissül a lista */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-muted/30 p-3">
        <div className="space-y-1">
          <Label htmlFor="audit-table-filter" className="text-xs text-muted-foreground">
            Tábla
          </Label>
          <Select
            items={TABLE_FILTER_ITEMS}
            value={table}
            onValueChange={(value) => setTable(value ?? '')}
          >
            <SelectTrigger id="audit-table-filter" className="min-w-40 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TABLE_FILTER_ITEMS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-from" className="text-xs text-muted-foreground">
            Ettől
          </Label>
          <Input
            id="audit-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 w-36 rounded-lg bg-card text-sm sm:w-40"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-to" className="text-xs text-muted-foreground">
            Eddig
          </Label>
          <Input
            id="audit-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 w-36 rounded-lg bg-card text-sm sm:w-40"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
          className="gap-1.5"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Frissítés
        </Button>
      </div>

      <AdminTable
        columns={[
          { key: 'muvelet', label: 'Művelet', className: 'w-28' },
          { key: 'tabla', label: 'Tábla' },
          { key: 'szereplo', label: 'Ki végezte', hideBelow: 'lg' },
          { key: 'idopont', label: 'Időpont', align: 'right', className: 'whitespace-nowrap' },
          { key: 'reszletek', label: <span className="sr-only">Részletek</span>, className: 'w-8' },
        ]}
        rows={rows}
        rowKey={(r) => String(r.id)}
        loading={loading}
        skeletonRows={6}
        minWidthClass="min-w-[560px]"
        onRowClick={(r) => setDetail(r)}
        renderCell={(r, key) => {
          switch (key) {
            case 'muvelet':
              return opBadge(r.op)
            case 'tabla':
              return (
                <span className="font-medium">{TABLE_LABELS[r.table_name] || r.table_name}</span>
              )
            case 'szereplo':
              return (
                <span className="text-muted-foreground">
                  {r.actor_name || 'Ismeretlen / rendszer'}
                </span>
              )
            case 'idopont':
              return (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fmtDateTime(r.ts)}
                </span>
              )
            case 'reszletek':
              return <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            default:
              return null
          }
        }}
        renderMobileCard={(r) => (
          <button
            type="button"
            onClick={() => setDetail(r)}
            className="w-full rounded-xl border border-border bg-card p-3 text-left transition hover:bg-muted/40"
          >
            <div className="flex flex-wrap items-center gap-2">
              {opBadge(r.op)}
              <span className="text-sm font-medium text-foreground">
                {TABLE_LABELS[r.table_name] || r.table_name}
              </span>
              <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{r.actor_name || 'Ismeretlen / rendszer'}</span>
              <span className="tabular-nums">{fmtDateTime(r.ts)}</span>
            </div>
          </button>
        )}
        empty={
          <AdminEmptyState
            icon={History}
            title="Nincs naplóbejegyzés"
            hint="A megadott szűrőkkel nincs találat. A napló a rekord-szintű auditálás bekapcsolása óta gyűlik — próbáld tágítani az időszakot."
          />
        }
      />

      {!loading && rows.length >= limit && (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-xs text-muted-foreground">
            A legutóbbi {limit} bejegyzés látható — lehet, hogy ennél több is van.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setLimit((l) => l + PAGE_SIZE)}
            disabled={loading}
          >
            Továbbiak betöltése
          </Button>
        </div>
      )}

      {/* Részlet-dialógus: régi → új értékek */}
      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
                  {opBadge(detail.op)}
                  {TABLE_LABELS[detail.table_name] || detail.table_name}
                </DialogTitle>
                <DialogDescription>
                  {detail.actor_name || 'Ismeretlen / rendszer'} · {fmtDateTime(detail.ts)}
                </DialogDescription>
              </DialogHeader>

              {(() => {
                const changes = diffRows(detail)
                if (changes.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground">
                      Nincs megjeleníthető mező-változás.
                    </p>
                  )
                }
                return (
                  <div className="overflow-x-auto rounded-xl ring-1 ring-border">
                    <table className="w-full min-w-[320px] border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <th scope="col" className="px-3 py-2 text-left">Mező</th>
                          <th scope="col" className="px-3 py-2 text-left">Régi</th>
                          <th scope="col" className="px-3 py-2 text-left">Új</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changes.map((c) => (
                          <tr key={c.key} className="border-b border-border/60 last:border-b-0 even:bg-muted/30">
                            <td className="px-3 py-1.5 align-top font-mono text-muted-foreground">{c.key}</td>
                            <td className="max-w-40 px-3 py-1.5 align-top break-words text-rose-700 dark:text-rose-300">
                              {fmtVal(c.from)}
                            </td>
                            <td className="max-w-40 px-3 py-1.5 align-top break-words text-emerald-700 dark:text-emerald-300">
                              {fmtVal(c.to)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
