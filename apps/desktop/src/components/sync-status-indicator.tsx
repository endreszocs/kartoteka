/**
 * SyncStatusIndicator — A-M7.2e (2026-04-24, refaktor 2026-04-25; 2026-09-05
 * MINDEN várólista + látható hibás sorok).
 *
 * MI VOLT A HIBA (desk-sync-13 / desk-sync-22): a fejléc-jelvény csak a
 * pénzügyi (nyugta/befizetés/kiadás) várakozókat számolta — a tag/család/
 * gyermek/munkanapló/Excel függő és hibás sorok láthatatlanok voltak, a
 * végleg `failed` outbox-sorok pedig kizárólag a /dev oldalon látszottak.
 *
 * MOST: a `szamolFuggoSorokat()` (a tükör-tulajdonos váltás számlálójával
 * KÖZÖS forrás) minden queue-t összesít; kattintásra egy lenyíló panel
 * mutatja queue-nként a számokat (ugrás a megfelelő oldalra), a klasszikus
 * outbox hibás sorait Újra / Elvetés gombbal, az ütközötteket a döntő
 * dialógussal, és egy „Szinkronizálás most" gombot.
 *
 * Frissítés: mount, `online` esemény, a lokális mentés utáni szinkron-kérés
 * esemény, 15 s-enként polling. `md` alatt kompakt (csak a szám).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Cloud, RefreshCw } from 'lucide-react'

import { SyncStatusBadge } from '@kartoteka/ui-app'

import { getDesktopUser } from '../lib/desktop-user'
import { errorMessage } from '../lib/error'
import { szamolFuggoSorokat, type FuggoSorok } from '../lib/local-mirror-owner'
import {
  dismissOutboxRow,
  getFailedOutboxRows,
  outboxSorUtkozes,
  retryOutboxRow,
  type OutboxRow,
} from '../lib/sync'
import { notifyLocalDataChanged } from '../lib/sync-orchestrator'
import { SYNC_KERELEM_ESEMENY, runAllWriteSyncsNow } from '../lib/write-sync-registry'
import { OutboxConflictDialog } from './write-sync-conflict-dialog'

const OUTBOX_TABLA_CIMKE: Record<string, string> = {
  szemely: 'Tag-módosítás',
  munkanaplo: 'Munkanapló',
  profiles: 'Saját profil',
}

export function SyncStatusIndicator({ position = 'fixed' }: { position?: 'fixed' | 'inline' } = {}) {
  const navigate = useNavigate()
  const [fuggo, setFuggo] = useState<FuggoSorok | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [nyitva, setNyitva] = useState(false)
  const [hibasSorok, setHibasSorok] = useState<OutboxRow[]>([])
  const [utkozes, setUtkozes] = useState<OutboxRow | null>(null)
  const [muveletHiba, setMuveletHiba] = useState<string | null>(null)
  const [szinkronFut, setSzinkronFut] = useState(false)
  const konteinerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let mounted = true
    getDesktopUser().then((u) => {
      if (mounted) setUserId(u?.id ?? null)
    })
    return () => {
      mounted = false
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const f = await szamolFuggoSorokat()
      setFuggo(f)
      if (f.reszletek.outboxFailed + f.reszletek.outboxConflict > 0) {
        setHibasSorok(await getFailedOutboxRows())
      } else {
        setHibasSorok([])
      }
    } catch (err) {
      // A DB nem olvasható (dev-mód / IPC) — a jelvény ilyenkor nem jelenik
      // meg, de a hibát a konzol őrzi (nem néma csend).
      console.warn('[sync-status] a függő sorok nem olvashatók:', errorMessage(err))
      setFuggo(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onOnline = () => {
      window.setTimeout(() => void refresh(), 500)
    }
    const onKerelem = () => void refresh()
    window.addEventListener('online', onOnline)
    window.addEventListener(SYNC_KERELEM_ESEMENY, onKerelem)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener(SYNC_KERELEM_ESEMENY, onKerelem)
    }
  }, [refresh])

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), 15_000)
    return () => window.clearInterval(id)
  }, [refresh])

  // A panel kattintásra kívülre záródik.
  useEffect(() => {
    if (!nyitva) return
    function onDocClick(e: MouseEvent) {
      if (konteinerRef.current && !konteinerRef.current.contains(e.target as Node)) setNyitva(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [nyitva])

  if (!fuggo || fuggo.irasok === 0) return null

  const pending = Math.max(0, fuggo.irasok - fuggo.hibas)
  const conflict = fuggo.hibas
  const r = fuggo.reszletek

  async function muvelet(fn: () => Promise<unknown>) {
    setMuveletHiba(null)
    try {
      await fn()
      notifyLocalDataChanged()
      await refresh()
    } catch (err) {
      setMuveletHiba(errorMessage(err))
    }
  }

  async function szinkronMost() {
    setSzinkronFut(true)
    setMuveletHiba(null)
    try {
      await runAllWriteSyncsNow()
      await refresh()
    } catch (err) {
      setMuveletHiba(errorMessage(err))
    } finally {
      setSzinkronFut(false)
    }
  }

  const sorok: Array<{ cimke: string; pending: number; hibas: number; ut: string }> = [
    { cimke: 'Nyugta / befizetés / kiadás', pending: r.penzugyiPending, hibas: r.penzugyiConflict, ut: '/penzugy/befizetes' },
    { cimke: 'Új tagok', pending: r.szemelyPending, hibas: r.szemelyConflict, ut: '/tagnyilvantartas' },
    { cimke: 'Családok', pending: r.csaladPending, hibas: r.csaladConflict, ut: '/csaladok' },
    { cimke: 'Gyermek-kapcsolatok', pending: r.gyerekPending, hibas: r.gyerekConflict, ut: '/csaladok' },
    { cimke: 'Tag-módosítás / munkanapló / profil', pending: r.outboxPending, hibas: r.outboxFailed + r.outboxConflict, ut: '/munkanaplo' },
    { cimke: 'Excel-főkönyv', pending: r.excelPending, hibas: r.excelBlocked, ut: '/penzugy' },
  ].filter((s) => s.pending + s.hibas > 0)

  const kompaktCimke = conflict > 0 ? `${conflict}!` : String(pending)

  return (
    <div ref={konteinerRef} className={position === 'fixed' ? 'fixed right-3 top-12 z-40' : 'relative'}>
      {/* md fölött a közös jelvény; md alatt kompakt szám-pötty (desk-sync-22) */}
      <div className="hidden md:block">
        <SyncStatusBadge pending={pending} conflict={conflict} onClick={() => setNyitva((v) => !v)} position="inline" />
      </div>
      <button
        type="button"
        onClick={() => setNyitva((v) => !v)}
        className={`flex min-h-9 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold md:hidden ${
          conflict > 0
            ? 'border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-200'
            : 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200'
        }`}
        aria-label={conflict > 0 ? `${conflict} tétel döntést vár` : `${pending} tétel szinkronra vár`}
        title={conflict > 0 ? `${conflict} tétel döntést vár` : `${pending} tétel szinkronra vár`}
      >
        {conflict > 0 ? <AlertTriangle className="size-3.5" /> : <Cloud className="size-3.5" />}
        {kompaktCimke}
      </button>

      {nyitva && (
        <div className="absolute right-0 top-full z-40 mt-1 w-96 max-w-[92vw] rounded-md border border-border bg-card p-3 text-xs text-foreground shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-semibold">
              {pending} tétel szinkronra vár{conflict > 0 ? `, ${conflict} döntést vár` : ''}
            </p>
            <button
              type="button"
              className="flex min-h-9 items-center gap-1 rounded-md border border-border bg-card px-2 font-medium hover:bg-secondary disabled:opacity-50"
              onClick={() => void szinkronMost()}
              disabled={szinkronFut}
            >
              <RefreshCw className={`size-3.5 ${szinkronFut ? 'animate-spin' : ''}`} />
              {szinkronFut ? 'Szinkron…' : 'Szinkronizálás most'}
            </button>
          </div>
          <ul className="space-y-1">
            {sorok.map((s) => (
              <li key={s.ut + s.cimke} className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="min-h-9 truncate text-left underline-offset-2 hover:underline"
                  onClick={() => {
                    setNyitva(false)
                    navigate(s.ut)
                  }}
                >
                  {s.cimke}
                </button>
                <span className="shrink-0 text-muted-foreground">
                  {s.pending > 0 ? `${s.pending} vár` : ''}
                  {s.pending > 0 && s.hibas > 0 ? ' · ' : ''}
                  {s.hibas > 0 ? <span className="text-rose-700 dark:text-rose-300">{s.hibas} hibás</span> : ''}
                </span>
              </li>
            ))}
          </ul>
          {fuggo.foglaltSorszamok > 0 && (
            <p className="mt-2 text-muted-foreground">
              {fuggo.foglaltSorszamok} sorszám van lefoglalva a tárcákban (offline rögzítéshez).
            </p>
          )}

          {hibasSorok.length > 0 && (
            <div className="mt-3 border-t border-border pt-2">
              <p className="mb-1 font-semibold">Hibás / ütközött sorok</p>
              <ul className="max-h-56 space-y-2 overflow-y-auto">
                {hibasSorok.map((row) => {
                  const utk = outboxSorUtkozes(row)
                  return (
                    <li key={row.id} className="rounded-md border border-border bg-background p-2">
                      <p className="font-medium">
                        {OUTBOX_TABLA_CIMKE[row.target_table] ?? row.target_table} · {row.op} · #{row.target_id ?? '—'}
                      </p>
                      <p className="break-words text-muted-foreground">{row.last_error ?? 'ismeretlen hiba'}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {utk && userId ? (
                          <button
                            type="button"
                            className="min-h-9 rounded-md bg-primary px-2 font-medium text-primary-foreground hover:opacity-90"
                            onClick={() => setUtkozes(row)}
                          >
                            Döntés az ütközésről
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="min-h-9 rounded-md bg-primary px-2 font-medium text-primary-foreground hover:opacity-90"
                            onClick={() => void muvelet(() => retryOutboxRow(row.id))}
                          >
                            Újra
                          </button>
                        )}
                        <button
                          type="button"
                          className="min-h-9 rounded-md border border-rose-500/40 px-2 font-medium text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
                          onClick={() => {
                            if (window.confirm('Biztosan elveted ezt a sort? A gépeden rögzített változás végleg elvész.')) {
                              void muvelet(() => dismissOutboxRow(row.id))
                            }
                          }}
                        >
                          Elvetés
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {muveletHiba && (
            <p role="alert" className="mt-2 text-rose-700 dark:text-rose-300">
              {muveletHiba}
            </p>
          )}
        </div>
      )}

      {utkozes && userId && (
        <OutboxConflictDialog
          row={utkozes}
          userId={userId}
          onClose={() => setUtkozes(null)}
          onResolved={() => void refresh()}
        />
      )}
    </div>
  )
}
