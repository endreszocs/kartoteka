'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Calculator,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AdminConfirmDialog } from './admin-confirm-dialog'
import { AdminEmptyState } from './_shared/admin-empty-state'
import { AdminSkeleton } from './_shared/admin-skeleton'
import { StatusBadge, type StatusIntent } from './_shared/status-badge'
import {
  createAssignment,
  listAssignableUsers,
  listAssignments,
  listCongregationsForAssignment,
  revokeAssignment,
  type AssignmentRoleScope,
  type AssignmentRow,
} from '@/app/(dashboard)/admin/profile-congregations-actions'

type AssignableUser = { id: string; full_name: string | null; email: string | null; role: string }
type AssignableCongregation = { id: string; nev_hu: string | null; name: string | null; diocese_id: string | null }

function roleLabel(scope: AssignmentRoleScope) {
  return scope === 'konyvelo' ? 'Könyvelő' : 'Egyházmegyei számvevő'
}

const STATUS_META: Record<
  AssignmentRow['approval_status'],
  { intent: StatusIntent; label: string; icon: LucideIcon }
> = {
  pending: { intent: 'warning', label: 'Függőben', icon: Clock },
  approved: { intent: 'success', label: 'Aktív', icon: CheckCircle2 },
  rejected: { intent: 'danger', label: 'Elutasítva', icon: XCircle },
  revoked: { intent: 'neutral', label: 'Visszavonva', icon: ShieldOff },
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  // A JS Date érvénytelen ISO-ra nem dob kivételt, hanem Invalid Date-et ad —
  // ezért getTime()-ot ellenőrzünk a korábbi (hatástalan) try/catch helyett.
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function ProfileCongregationsTab() {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [users, setUsers] = useState<AssignableUser[]>([])
  const [congs, setCongs] = useState<AssignableCongregation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Új hozzárendelés form
  const [formOpen, setFormOpen] = useState(false)
  const [formUser, setFormUser] = useState('')
  const [formCong, setFormCong] = useState('')
  const [formReason, setFormReason] = useState('')
  const [formBusy, setFormBusy] = useState(false)

  // Visszavonás — egységes megerősítő dialógus (a korábbi inline doboz helyett)
  const [revokeTarget, setRevokeTarget] = useState<AssignmentRow | null>(null)
  const [revokeBusy, setRevokeBusy] = useState(false)

  // 2026-07-11: a congregations-tab 2026-06-07-es mintája — a betöltési hiba
  // NEM tűnik el csendben: hiba-állapot + "Újrapróbálom" gomb, .catch a láncon.
  // A useEffect ugyanezt a load-ot hívja (nincs többé duplikált törzs).
  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    return Promise.all([
      listAssignments(),
      listAssignableUsers(),
      listCongregationsForAssignment(),
    ])
      .then(([aRes, uRes, cRes]) => {
        const firstError = aRes.error || uRes.error || cRes.error
        if (firstError) {
          setError(firstError)
          return
        }
        if (aRes.data) setAssignments(aRes.data)
        if (uRes.data) setUsers(uRes.data)
        if (cRes.data) setCongs(cRes.data)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ismeretlen hiba a betöltés közben.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // requestAnimationFrame — a setState-t egy frame-re kitoljuk (a synchronous
    // setState-in-effect lint elkerülésére).
    const raf = requestAnimationFrame(() => {
      void load()
    })
    return () => cancelAnimationFrame(raf)
  }, [load])

  const selectedUser = useMemo(() => users.find((u) => u.id === formUser) ?? null, [users, formUser])
  const roleScope: AssignmentRoleScope | null = useMemo(() => {
    if (!selectedUser) return null
    return selectedUser.role === 'konyvelo' ? 'konyvelo' : selectedUser.role === 'egyhazmegyei_szamvevo' ? 'egyhazmegyei_szamvevo' : null
  }, [selectedUser])

  // Betűrendbe rendezett választólisták (hu locale), hogy a hosszú listákban
  // is megtalálható legyen a keresett név / gyülekezet.
  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) =>
        (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '', 'hu'),
      ),
    [users],
  )
  const sortedCongs = useMemo(
    () =>
      [...congs].sort((a, b) =>
        (a.nev_hu || a.name || '').localeCompare(b.nev_hu || b.name || '', 'hu'),
      ),
    [congs],
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return assignments
    const q = search.toLowerCase()
    return assignments.filter((a) =>
      (a.profile_full_name || '').toLowerCase().includes(q) ||
      (a.profile_email || '').toLowerCase().includes(q) ||
      (a.congregation_name || '').toLowerCase().includes(q),
    )
  }, [assignments, search])

  async function submitNew() {
    if (!formUser || !formCong || !roleScope) {
      toast.error('Tölts ki minden kötelező mezőt.')
      return
    }
    if (formReason.trim().length < 10) {
      toast.error('A hozzárendelés indoklása legalább 10 karakter legyen.')
      return
    }
    setFormBusy(true)
    try {
      const res = await createAssignment({
        profileId: formUser,
        congregationId: formCong,
        roleScope,
        reason: formReason.trim(),
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      if (res.warning) {
        // A hozzárendelés sikeres, de az értesítés nem ment ki — jelezzük az adminnak.
        toast.warning(res.warning, { duration: 7000 })
      } else {
        toast.success('Kérés elküldve a gyülekezet lelkészének.')
      }
      setFormOpen(false)
      setFormUser('')
      setFormCong('')
      setFormReason('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nem sikerült elküldeni a kérést.')
    } finally {
      setFormBusy(false)
    }
  }

  async function submitRevoke(reason: string) {
    if (!revokeTarget) return
    if (reason.trim().length < 5) {
      toast.error('Az indoklás legalább 5 karakter legyen.')
      return
    }
    setRevokeBusy(true)
    try {
      const res = await revokeAssignment({ assignmentId: revokeTarget.id, reason: reason.trim() })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Hozzáférés visszavonva.')
      setRevokeTarget(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nem sikerült a visszavonás.')
    } finally {
      setRevokeBusy(false)
    }
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center dark:border-rose-900 dark:bg-rose-950/30">
        <p className="font-semibold text-rose-800 dark:text-rose-200">
          A hozzárendelések betöltése nem sikerült
        </p>
        <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{error}</p>
        <Button onClick={() => void load()} variant="outline" className="mt-3 gap-2">
          <RefreshCw className="size-4" />
          Újrapróbálom
        </Button>
      </div>
    )
  }

  if (loading) {
    return <AdminSkeleton rows={5} className="py-4" />
  }

  return (
    <div className="space-y-5">
      {/* Autonómia emlékeztető */}
      <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/30">
        <p className="text-sm leading-relaxed text-sky-900 dark:text-sky-200">
          <strong>Fontos:</strong> a hozzárendelés létrehozása után a gyülekezet lelkészének
          jóváhagyása szükséges. A lelkész explicit beleegyezése nélkül a könyvelő vagy
          egyházmegyei számvevő <strong>nem lát adatot</strong>. Minden gyülekezet önálló
          és autonóm.
        </p>
      </div>

      {/* Fejléc-sor + Új hozzárendelés gomb */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading text-lg text-foreground">Hozzárendelések</h3>
        <Button onClick={() => setFormOpen((v) => !v)} variant={formOpen ? 'outline' : 'default'} className="gap-1.5">
          {formOpen ? 'Mégsem' : (
            <>
              <Plus className="size-4" />
              Új hozzárendelés
            </>
          )}
        </Button>
      </div>

      {formOpen && (
        <div className="space-y-4 rounded-2xl border border-border bg-muted/30 p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pc-user" className="text-xs font-medium text-foreground">
                Felhasználó *
              </Label>
              <select
                id="pc-user"
                value={formUser}
                onChange={(e) => setFormUser(e.target.value)}
                disabled={formBusy}
                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">Válassz...</option>
                {sortedUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {(u.full_name || u.email || '(névtelen)')} — {roleLabel(u.role as AssignmentRoleScope)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="pc-cong" className="text-xs font-medium text-foreground">
                Gyülekezet *
              </Label>
              <select
                id="pc-cong"
                value={formCong}
                onChange={(e) => setFormCong(e.target.value)}
                disabled={formBusy}
                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">Válassz...</option>
                {sortedCongs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nev_hu || c.name || c.id}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="pc-reason" className="text-xs font-medium text-foreground">
              Indoklás a lelkész számára * (legalább 10 karakter)
            </Label>
            <Textarea
              id="pc-reason"
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
              rows={3}
              disabled={formBusy}
              className="mt-1"
              placeholder="Pl. „Szücs János könyvelő kéri a hozzáférést a negyedéves áttekintéshez.”"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Ezt az üzenetet a lelkész fogja elolvasni a döntés előtt. Légy konkrét és tiszteletteljes.
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void submitNew()} disabled={formBusy} className="w-full sm:w-auto">
              {formBusy ? 'Küldés...' : 'Kérés küldése a lelkésznek'}
            </Button>
          </div>
        </div>
      )}

      {/* Keresőmező */}
      <div className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Keresés név, email, gyülekezet szerint..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        assignments.length === 0 ? (
          <AdminEmptyState
            icon={Calculator}
            title="Még nincs egyetlen hozzárendelés sem"
            hint="Az „Új hozzárendelés” gombbal oszthatsz ki könyvelői vagy egyházmegyei számvevői hozzáférést egy gyülekezethez. A hozzáférés a lelkész jóváhagyása után lép életbe."
            action={
              !formOpen ? (
                <Button onClick={() => setFormOpen(true)} className="gap-1.5">
                  <Plus className="size-4" />
                  Új hozzárendelés
                </Button>
              ) : undefined
            }
          />
        ) : (
          <AdminEmptyState
            icon={Search}
            title="Nincs találat a keresésre"
            hint="Próbálj rövidebb vagy másképp írt nevet, email-címet vagy gyülekezetnevet."
            action={
              <Button variant="outline" onClick={() => setSearch('')}>
                Keresés törlése
              </Button>
            }
          />
        )
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const status = STATUS_META[a.approval_status]
            return (
              <div key={a.id} className="space-y-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {a.profile_full_name || a.profile_email || 'Ismeretlen'}
                    </p>
                    <p className="break-words text-xs text-muted-foreground">
                      {a.profile_email || ''} · {roleLabel(a.role_scope)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Gyülekezet:{' '}
                      <span className="font-medium text-foreground">{a.congregation_name || '—'}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Kezdeményezve: {formatDate(a.assigned_at)}
                      {a.approved_at && ` · Jóváhagyva: ${formatDate(a.approved_at)}`}
                      {a.revoked_at && ` · Visszavonva: ${formatDate(a.revoked_at)}`}
                    </p>
                  </div>
                  <StatusBadge intent={status.intent} icon={status.icon}>
                    {status.label}
                  </StatusBadge>
                </div>

                {a.approval_reason && (
                  <div className="rounded-xl bg-muted/50 p-2.5 text-xs italic text-muted-foreground">
                    &bdquo;{a.approval_reason}&rdquo;
                  </div>
                )}

                {a.approval_status === 'revoked' && a.revoked_reason && (
                  <div className="rounded-xl bg-rose-50 p-2.5 text-xs text-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                    Visszavonás indoka: &bdquo;{a.revoked_reason}&rdquo;
                  </div>
                )}

                {a.approval_status === 'approved' && (
                  <Button
                    variant="destructive"
                    className="gap-2"
                    onClick={() => setRevokeTarget(a)}
                  >
                    <ShieldOff className="size-4" /> Visszavonás
                  </Button>
                )}

                {a.approval_status === 'pending' && (
                  <p className="text-xs italic text-amber-700 dark:text-amber-300">
                    <ShieldCheck className="mr-1 inline size-3" />
                    Várakozás a lelkész döntésére. A gyülekezeti autonómia alapján csak ő dönthet.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Visszavonás megerősítő — egységes admin-dialógus a korábbi inline doboz
          helyett; a loading prop véd a dupla kattintás (dupla RPC) ellen. */}
      <AdminConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open && !revokeBusy) setRevokeTarget(null)
        }}
        title="Hozzáférés visszavonása"
        tone="danger"
        description={
          revokeTarget ? (
            <>
              Visszavonod{' '}
              <strong>{revokeTarget.profile_full_name || revokeTarget.profile_email || 'a felhasználó'}</strong>{' '}
              hozzáférését a(z) <strong>{revokeTarget.congregation_name || '—'}</strong> gyülekezethez.
              A felhasználó ezután nem lát adatot ebből a gyülekezetből.
            </>
          ) : null
        }
        reasonLabel="A visszavonás indoklása"
        reasonPlaceholder="Pl. a megbízatás lejárt…"
        reasonRequired
        reasonMinLength={5}
        confirmLabel="Visszavonás"
        loading={revokeBusy}
        onConfirm={(reason) => void submitRevoke(reason || '')}
      />
    </div>
  )
}
