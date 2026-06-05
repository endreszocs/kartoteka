'use client'

/**
 * 2026-06-05 (F4b-2) — Tevékenység-napló (sor-szintű audit) megtekintő.
 * Az admin / egyházmegyei számvevő szűrhet táblára + időszakra, és látja:
 * ki, mikor, milyen műveletet (létrehoz/módosít/töröl) végzett, a régi → új
 * értékekkel. A jogosultságot a `get_record_audit()` RPC RLS-aware módon kezeli.
 */

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

const OP_LABELS: Record<string, { label: string; cls: string }> = {
  INSERT: { label: 'Létrehozás', cls: 'bg-emerald-100 text-emerald-800' },
  UPDATE: { label: 'Módosítás', cls: 'bg-amber-100 text-amber-800' },
  DELETE: { label: 'Törlés', cls: 'bg-rose-100 text-rose-800' },
}

// A diffből kihagyandó "zajos" technikai mezők
const NOISE_KEYS = new Set(['revision', 'updated_at', 'created', 'created_at'])

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
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
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getRecordAudit({
        table: table || null,
        from: from ? new Date(from).toISOString() : null,
        to: to ? new Date(to).toISOString() : null,
        limit: 200,
      })
      setSchemaReady(res.schemaReady)
      if (res.error) toast.error(res.error)
      setRows(res.rows)
    } finally {
      setLoading(false)
    }
  }, [table, from, to])

  useEffect(() => {
    void load()
    // csak mountkor — a szűrőkhöz külön "Frissítés" gomb van
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-slate-500" />
        <div>
          <h2 className="font-heading text-lg text-slate-800">Tevékenység-napló</h2>
          <p className="text-xs text-slate-500">
            Ki, mikor, mit módosított — a kulcstáblákon (pénzügy, tagok, jogosultságok).
            A számvevő a saját egyházmegyéje gyülekezeteit látja.
          </p>
        </div>
      </div>

      {/* Szűrők */}
      <div className="flex flex-wrap items-end gap-2 rounded-[1rem] border border-slate-100 bg-slate-50/50 p-3">
        <label className="text-xs">
          <span className="mb-1 block font-medium text-slate-600">Tábla</span>
          <select
            value={table}
            onChange={(e) => setTable(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">— Mind —</option>
            {Object.entries(TABLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium text-slate-600">Ettől</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" />
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium text-slate-600">Eddig</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" />
        </label>
        <Button type="button" onClick={() => void load()} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Frissítés
        </Button>
      </div>

      {!schemaReady ? (
        <div className="rounded-[1rem] border border-amber-200 bg-amber-50/60 px-3 py-3 text-sm text-amber-900">
          A tevékenység-napló adatbázis-része még nincs telepítve. Futtasd le a
          <code className="mx-1">2026-06-05n-row-audit.sql</code> fájlt.
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-10 text-slate-500">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-[1rem] border border-slate-200 bg-slate-50/60 px-3 py-6 text-center text-sm text-slate-500">
          Nincs naplóbejegyzés a megadott szűrőkkel. (A napló a 2026-06-05n SQL futtatása óta gyűlik.)
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const op = OP_LABELS[r.op] || { label: r.op, cls: 'bg-slate-100 text-slate-700' }
            const isOpen = expanded === r.id
            const changes = isOpen ? diffRows(r) : []
            return (
              <li key={r.id} className="rounded-[0.9rem] border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${op.cls}`}>{op.label}</span>
                  <span className="font-medium text-slate-800">{TABLE_LABELS[r.table_name] || r.table_name}</span>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-600">{r.actor_name || 'Ismeretlen / rendszer'}</span>
                  <span className="ml-auto text-xs text-slate-400">
                    {new Date(r.ts).toLocaleString('hu-HU')}
                  </span>
                  {isOpen ? <ChevronUp className="size-4 text-slate-400" /> : <ChevronDown className="size-4 text-slate-400" />}
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 px-3 py-2">
                    {changes.length === 0 ? (
                      <p className="text-xs text-slate-500">Nincs megjeleníthető mező-változás.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-400">
                            <th className="py-1 text-left font-medium">Mező</th>
                            <th className="py-1 text-left font-medium">Régi</th>
                            <th className="py-1 text-left font-medium">Új</th>
                          </tr>
                        </thead>
                        <tbody>
                          {changes.map((c) => (
                            <tr key={c.key} className="border-t border-slate-50">
                              <td className="py-1 pr-2 font-mono text-slate-600">{c.key}</td>
                              <td className="py-1 pr-2 text-rose-700">{fmtVal(c.from)}</td>
                              <td className="py-1 text-emerald-700">{fmtVal(c.to)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
