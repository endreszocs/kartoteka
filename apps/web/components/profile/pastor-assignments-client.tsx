'use client'

// 2026-09-05 (profil-kör, sötét mód): a `bg-*-100 text-*-800` jelvények és a
// `text-slate-*` szövegek sötétben világos-a-világoson lettek — mostantól
// téma-tokenek és `dark:` párok (a pastoral-calendar-card mintája).

import { useState } from 'react'
import { CheckCircle2, Clock, ShieldCheck, ShieldOff, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatTimestampHu } from '@/lib/utils/date'
import {
  approveAssignment,
  rejectAssignment,
  revokeAssignmentByPastor,
  type PastorAssignmentRow,
} from '@/app/(dashboard)/profile/kapcsolatok/actions'

interface Props {
  initialAssignments: PastorAssignmentRow[]
}

function roleLabel(scope: PastorAssignmentRow['role_scope']) {
  return scope === 'konyvelo' ? 'Könyvelő' : 'Egyházmegyei számvevő'
}

function statusBadge(status: PastorAssignmentRow['approval_status']) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
          <Clock className="size-3" /> Függőben
        </Badge>
      )
    case 'approved':
      return (
        <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100">
          <CheckCircle2 className="size-3" /> Jóváhagyva
        </Badge>
      )
    case 'rejected':
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="size-3" /> Elutasítva
        </Badge>
      )
    case 'revoked':
      return (
        <Badge variant="secondary" className="gap-1">
          <ShieldOff className="size-3" /> Visszavonva
        </Badge>
      )
  }
}

// 2026-09-05: EGY formázó (Bukarest szerinti naptári nap) — a `toLocaleDateString`
// `timeZone` nélkül a futtató gép zónáját vette.
function formatDate(iso: string | null) {
  return formatTimestampHu(iso) || '—'
}

export function PastorAssignmentsClient({ initialAssignments }: Props) {
  const [items, setItems] = useState<PastorAssignmentRow[]>(initialAssignments)
  const [busy, setBusy] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const pending = items.filter((i) => i.approval_status === 'pending')
  const approved = items.filter((i) => i.approval_status === 'approved')
  const history = items.filter((i) => i.approval_status === 'rejected' || i.approval_status === 'revoked')

  async function handleApprove(assignment: PastorAssignmentRow) {
    setBusy(assignment.id)
    const res = await approveAssignment(assignment.id)
    setBusy(null)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Hozzáférés jóváhagyva.')
    setItems((prev) =>
      prev.map((a) =>
        a.id === assignment.id
          ? { ...a, approval_status: 'approved', approved_at: new Date().toISOString(), revoked_at: null, revoked_reason: null }
          : a,
      ),
    )
  }

  async function handleReject(assignment: PastorAssignmentRow) {
    if (!reason.trim() || reason.trim().length < 5) {
      toast.error('Kérlek, írj egy rövid indoklást (legalább 5 karakter).')
      return
    }
    setBusy(assignment.id)
    const res = await rejectAssignment(assignment.id, reason)
    setBusy(null)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Kérés elutasítva.')
    setItems((prev) =>
      prev.map((a) =>
        a.id === assignment.id
          ? { ...a, approval_status: 'rejected', approval_reason: reason.trim() }
          : a,
      ),
    )
    setRejectingId(null)
    setReason('')
  }

  async function handleRevoke(assignment: PastorAssignmentRow) {
    if (!reason.trim() || reason.trim().length < 5) {
      toast.error('Kérlek, írj egy rövid indoklást (legalább 5 karakter).')
      return
    }
    setBusy(assignment.id)
    const res = await revokeAssignmentByPastor(assignment.id, reason)
    setBusy(null)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Hozzáférés visszavonva.')
    setItems((prev) =>
      prev.map((a) =>
        a.id === assignment.id
          ? { ...a, approval_status: 'revoked', revoked_at: new Date().toISOString(), revoked_reason: reason.trim() }
          : a,
      ),
    )
    setRevokingId(null)
    setReason('')
  }

  return (
    <div className="space-y-6">
      {/* Függőben lévő kérések — ezek kapják a fő figyelmet */}
      <Section
        title="Függőben lévő kérések"
        count={pending.length}
        emptyText="Jelenleg nincs függőben lévő hozzáférési kérés."
      >
        {pending.map((a) => (
          <Card key={a.id} className="border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/30">
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {a.target_full_name || a.target_email || 'Ismeretlen felhasználó'}
                  </p>
                  <p className="text-xs text-muted-foreground">{a.target_email || ''}</p>
                  <p className="text-xs text-muted-foreground">
                    Kezdeményezte: <span className="font-medium text-foreground">{a.initiator_full_name || 'admin'}</span> ·{' '}
                    {formatDate(a.assigned_at)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {statusBadge(a.approval_status)}
                  <Badge variant="outline" className="text-xs">
                    {roleLabel(a.role_scope)}
                  </Badge>
                </div>
              </div>

              {a.approval_reason && (
                <div className="rounded-2xl border border-amber-200 bg-card/60 p-3 dark:border-amber-900 text-sm text-foreground">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Indoklás</p>
                  <p className="mt-1 leading-relaxed">{a.approval_reason}</p>
                </div>
              )}

              {rejectingId === a.id ? (
                <div className="space-y-2 rounded-2xl border border-red-200 bg-red-50/50 p-3 dark:border-red-900 dark:bg-red-950/30">
                  <label className="text-xs font-medium text-foreground">
                    Indoklás a kérelmező számára
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-red-400 focus:outline-none"
                    placeholder="Pl. „Köszönöm, de már van másik könyvelő kapcsolatom."
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRejectingId(null)
                        setReason('')
                      }}
                      disabled={busy === a.id}
                    >
                      Mégsem
                    </Button>
                    <Button
                      size="sm"
                      className="bg-red-600 text-white hover:bg-red-700"
                      onClick={() => handleReject(a)}
                      disabled={busy === a.id}
                    >
                      Elutasítás küldése
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => handleApprove(a)}
                    disabled={busy === a.id}
                  >
                    <ShieldCheck className="size-4" /> Jóváhagyás
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                    onClick={() => {
                      setRejectingId(a.id)
                      setReason('')
                    }}
                    disabled={busy !== null}
                  >
                    <XCircle className="size-4" /> Elutasítás
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </Section>

      {/* Aktív hozzáférések — visszavonhatók */}
      <Section
        title="Aktív hozzáférések"
        count={approved.length}
        emptyText="Jelenleg nincs aktív külső hozzáférés a gyülekezet adataihoz."
      >
        {approved.map((a) => (
          <Card key={a.id} className="border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/30">
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {a.target_full_name || a.target_email || 'Ismeretlen felhasználó'}
                  </p>
                  <p className="text-xs text-muted-foreground">{a.target_email || ''}</p>
                  <p className="text-xs text-muted-foreground">
                    Jóváhagyva: {formatDate(a.approved_at)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {statusBadge(a.approval_status)}
                  <Badge variant="outline" className="text-xs">
                    {roleLabel(a.role_scope)}
                  </Badge>
                </div>
              </div>

              {revokingId === a.id ? (
                <div className="space-y-2 rounded-2xl border border-orange-200 bg-orange-50/50 p-3 dark:border-orange-900 dark:bg-orange-950/30">
                  <label className="text-xs font-medium text-foreground">
                    Visszavonás indoklása
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-orange-400 focus:outline-none"
                    placeholder="Pl. „Véget ért a könyvelői megbízatás.”"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRevokingId(null)
                        setReason('')
                      }}
                      disabled={busy === a.id}
                    >
                      Mégsem
                    </Button>
                    <Button
                      size="sm"
                      className="bg-orange-600 text-white hover:bg-orange-700"
                      onClick={() => handleRevoke(a)}
                      disabled={busy === a.id}
                    >
                      Visszavonás
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-950/40"
                    onClick={() => {
                      setRevokingId(a.id)
                      setReason('')
                    }}
                    disabled={busy !== null}
                  >
                    <ShieldOff className="size-4" /> Hozzáférés visszavonása
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </Section>

      {/* Korábbi döntések — csak olvasható */}
      <Section
        title="Korábbi döntések"
        count={history.length}
        emptyText="Még nincs korábbi elutasítás vagy visszavonás."
      >
        {history.map((a) => (
          <Card key={a.id} className="border-border bg-muted/40">
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {a.target_full_name || a.target_email || 'Ismeretlen felhasználó'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {roleLabel(a.role_scope)} · {formatDate(a.revoked_at || a.assigned_at)}
                  </p>
                </div>
                {statusBadge(a.approval_status)}
              </div>
              {(a.approval_reason || a.revoked_reason) && (
                <p className="text-xs italic leading-relaxed text-muted-foreground">
                  &bdquo;{a.revoked_reason || a.approval_reason}&rdquo;
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </Section>
    </div>
  )
}

function Section({
  title,
  count,
  emptyText,
  children,
}: {
  title: string
  count: number
  emptyText: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-heading text-xl text-foreground">{title}</h2>
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
          {count}
        </span>
      </div>
      {count === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </section>
  )
}
