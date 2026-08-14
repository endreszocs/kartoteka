'use client'

/**
 * Admin „Támogatás" fül — beérkezett támogatási jegyek kezelése.
 *
 * 2026-07-11 admin-redesign:
 *  - a kézzel írt fixed-overlay modált a közös Dialog primitív váltja
 *    (fókusz-csapda, Escape, aria — a régiben semmi nem volt);
 *  - státusz-szűrő fülek (Nyitott / Új / Lezárt / Mind) — korábban minden
 *    jegy egyetlen időrendi listában volt;
 *  - a lezárás megerősítést kér (AdminConfirmDialog) — korábban egy
 *    kattintás a listasorban azonnal lezárt;
 *  - a válasz-piszkozat jegy-váltáskor ürül (nem szivárog át másik jegyhez);
 *  - válasz után a jegy „Megválaszolva" státuszt kap (nem „Olvasott"-at);
 *  - StatusBadge / AdminSkeleton / AdminEmptyState, token-színek, mobil-first.
 */

import { useCallback, useEffect, useState } from 'react'
import { Inbox, LifeBuoy, RefreshCw, Send } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StatusBadge, type StatusIntent } from '@/components/admin/_shared/status-badge'
import { AdminSkeleton } from '@/components/admin/_shared/admin-skeleton'
import { AdminEmptyState } from '@/components/admin/_shared/admin-empty-state'
import { AdminConfirmDialog } from './admin-confirm-dialog'

import {
  closeSupportTicket,
  getSupportTickets,
  replySupportTicket,
} from '@/app/(dashboard)/admin/actions'

interface Ticket {
  id: string
  user_id: string
  subject: string
  content: string
  type: string
  status: string
  created_at: string
  profiles: { full_name: string | null; email: string } | null
}

type StatusFilter = 'open' | 'new' | 'closed' | 'all'

const STATUS_META: Record<string, { label: string; intent: StatusIntent }> = {
  new: { label: 'Új', intent: 'warning' },
  read: { label: 'Olvasott', intent: 'info' },
  replied: { label: 'Megválaszolva', intent: 'success' },
  closed: { label: 'Lezárt', intent: 'neutral' },
}

function ticketStatusBadge(status: string) {
  const meta = STATUS_META[status]
  if (!meta) return <StatusBadge intent="neutral">{status}</StatusBadge>
  return (
    <StatusBadge intent={meta.intent} dot>
      {meta.label}
    </StatusBadge>
  )
}

export function SupportTab() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [filter, setFilter] = useState<StatusFilter>('open')
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)

  // 2026-06-07: a betöltési hiba most NEM tűnik el csendben — külön hiba-állapot
  // + "Újrapróbálom" gomb (a visszaadott { error }-t is kezeljük, nem csak a dobottat).
  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    getSupportTickets()
      .then((res) => {
        if ('error' in res && res.error) {
          setError(res.error)
        } else if ('data' in res) {
          setTickets(res.data as unknown as Ticket[])
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ismeretlen hiba.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const raf = requestAnimationFrame(() => load())
    return () => cancelAnimationFrame(raf)
  }, [load])

  const selected = tickets.find((t) => t.id === selectedId) ?? null

  /** Jegy megnyitása — a piszkozat ürül, hogy ne szivárogjon át másik jegyhez. */
  function openTicket(id: string) {
    setSelectedId(id)
    setReply('')
  }

  async function handleReply() {
    if (!selectedId || !reply.trim()) return
    setSending(true)
    const res = await replySupportTicket(selectedId, reply)
    if ('error' in res && res.error) {
      toast.error(res.error)
    } else {
      toast.success('Válasz elküldve!')
      setReply('')
      // FIX 2026-07-11: a szerver 'replied'-re állítja a jegyet — a lista is
      // ezt mutassa ('Megválaszolva'), ne 'Olvasott'-at.
      setTickets((prev) =>
        prev.map((t) => (t.id === selectedId ? { ...t, status: 'replied' } : t)),
      )
    }
    setSending(false)
  }

  async function handleClose(ticketId: string) {
    setClosing(true)
    const res = await closeSupportTicket(ticketId)
    if ('error' in res && res.error) {
      toast.error(res.error)
    } else {
      toast.success('Jegy lezárva.')
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: 'closed' } : t)),
      )
      if (selectedId === ticketId) setSelectedId(null)
    }
    setClosing(false)
    setConfirmCloseId(null)
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center dark:border-rose-900 dark:bg-rose-950/30"
      >
        <p className="font-semibold text-rose-800 dark:text-rose-300">
          A támogatási jegyek betöltése nem sikerült
        </p>
        <p className="mt-1 text-sm text-rose-700 dark:text-rose-400">{error}</p>
        <Button onClick={load} variant="outline" className="mt-3 gap-2">
          <RefreshCw className="size-4" aria-hidden />
          Újrapróbálom
        </Button>
      </div>
    )
  }

  if (loading) return <AdminSkeleton rows={5} className="py-2" />

  const counts = {
    all: tickets.length,
    open: tickets.filter((t) => t.status !== 'closed').length,
    new: tickets.filter((t) => t.status === 'new').length,
    closed: tickets.filter((t) => t.status === 'closed').length,
  }

  const filtered = tickets.filter((t) => {
    if (filter === 'all') return true
    if (filter === 'open') return t.status !== 'closed'
    return t.status === filter
  })

  const FILTERS: Array<{ id: StatusFilter; label: string }> = [
    { id: 'open', label: `Nyitott (${counts.open})` },
    { id: 'new', label: `Új (${counts.new})` },
    { id: 'closed', label: `Lezárt (${counts.closed})` },
    { id: 'all', label: `Mind (${counts.all})` },
  ]

  const ticketPerson = (t: Ticket) =>
    t.profiles?.full_name || t.profiles?.email || 'Ismeretlen'

  return (
    <div className="space-y-4">
      {/* Szűrősor + frissítés */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.id
          return (
            <Button
              key={f.id}
              type="button"
              variant="outline"
              onClick={() => setFilter(f.id)}
              aria-pressed={active}
              className={`min-h-11 rounded-xl px-3 ${
                active
                  ? 'border-transparent bg-primary/10 font-medium text-primary ring-1 ring-primary/30 hover:bg-primary/15'
                  : 'text-muted-foreground'
              }`}
            >
              {f.label}
            </Button>
          )
        })}
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          onClick={load}
          aria-label="Lista frissítése"
          className="ml-auto text-muted-foreground"
        >
          <RefreshCw className="size-4" aria-hidden />
        </Button>
      </div>

      {tickets.length === 0 ? (
        <AdminEmptyState
          icon={LifeBuoy}
          title="Nincs beérkezett jegy"
          hint="Amikor egy felhasználó támogatási kérdést küld, itt jelenik meg."
        />
      ) : filtered.length === 0 ? (
        <AdminEmptyState
          icon={Inbox}
          title="Nincs jegy ebben a szűrésben"
          hint={'Válassz másik szűrőt fent — a „Mind” minden jegyet mutat.'}
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => (
            <li key={t.id}>
              {/* Teljes-soros jegy-gomb (engedélyezett wrapper-kivétel) */}
              <button
                type="button"
                onClick={() => openTicket(t.id)}
                className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border bg-card px-4 py-3 text-left transition hover:border-primary/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {t.subject}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {ticketPerson(t)} · {new Date(t.created_at).toLocaleDateString('hu-HU')}
                  </span>
                </span>
                {ticketStatusBadge(t.status)}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Részletek + válasz — közös Dialog primitív (fókusz-csapda, Escape, aria) */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="gap-0 overflow-hidden bg-card p-0 sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader className="border-b border-border bg-muted/30 px-5 py-4 pr-12">
                <DialogTitle className="flex flex-wrap items-center gap-2 text-foreground">
                  <span className="min-w-0 break-words">{selected.subject}</span>
                  {ticketStatusBadge(selected.status)}
                </DialogTitle>
              </DialogHeader>

              <div className="max-h-[65dvh] space-y-4 overflow-y-auto p-5">
                <p className="text-xs text-muted-foreground">
                  {ticketPerson(selected)}
                  {selected.profiles?.email ? ` (${selected.profiles.email})` : ''} ·{' '}
                  {new Date(selected.created_at).toLocaleString('hu-HU')}
                </p>

                <div className="whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-3 text-sm text-foreground">
                  {selected.content}
                </div>

                {selected.status !== 'closed' ? (
                  <div className="space-y-2">
                    <Label htmlFor="support-reply">Válasz a felhasználónak</Label>
                    <Textarea
                      id="support-reply"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="A válasz szövege…"
                      rows={4}
                      className="resize-none"
                    />
                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                      <Button
                        variant="outline"
                        onClick={() => setConfirmCloseId(selected.id)}
                        disabled={sending}
                      >
                        Jegy lezárása
                      </Button>
                      <Button
                        onClick={handleReply}
                        disabled={sending || !reply.trim()}
                        className="gap-1.5"
                      >
                        <Send className="size-3.5" aria-hidden />
                        {sending ? 'Küldés…' : 'Válasz küldése'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    Ez a jegy le van zárva.
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Lezárás-megerősítés — korábban egy kattintásra, kérdés nélkül zárt */}
      <AdminConfirmDialog
        open={!!confirmCloseId}
        onOpenChange={(o) => !o && setConfirmCloseId(null)}
        title="Jegy lezárása"
        description={
          <>
            A jegy lezárása után nem lehet rá válaszolni, és újranyitni sem lehet. A beküldő nem
            kap külön értesítést a lezárásról.
          </>
        }
        confirmLabel="Lezárás"
        tone="danger"
        loading={closing}
        onConfirm={() => {
          if (confirmCloseId) void handleClose(confirmCloseId)
        }}
      />
    </div>
  )
}
