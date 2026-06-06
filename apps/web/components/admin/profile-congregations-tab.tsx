'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock, ShieldCheck, ShieldOff, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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

function statusBadge(status: AssignmentRow['approval_status']) {
  switch (status) {
    case 'pending':
      return <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100"><Clock className="size-3" /> Függőben</Badge>
    case 'approved':
      return <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="size-3" /> Aktív</Badge>
    case 'rejected':
      return <Badge className="gap-1 bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="size-3" /> Elutasítva</Badge>
    case 'revoked':
      return <Badge className="gap-1 bg-slate-200 text-slate-700 hover:bg-slate-200"><ShieldOff className="size-3" /> Visszavonva</Badge>
  }
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return iso
  }
}

export function ProfileCongregationsTab() {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [users, setUsers] = useState<AssignableUser[]>([])
  const [congs, setCongs] = useState<AssignableCongregation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Új hozzárendelés form
  const [formOpen, setFormOpen] = useState(false)
  const [formUser, setFormUser] = useState('')
  const [formCong, setFormCong] = useState('')
  const [formReason, setFormReason] = useState('')
  const [formBusy, setFormBusy] = useState(false)

  // Visszavonás form
  const [revokeId, setRevokeId] = useState<string | null>(null)
  const [revokeReason, setRevokeReason] = useState('')

  function reload() {
    setLoading(true)
    return Promise.all([
      listAssignments(),
      listAssignableUsers(),
      listCongregationsForAssignment(),
    ])
      .then(([aRes, uRes, cRes]) => {
        if (aRes.data) setAssignments(aRes.data)
        if (uRes.data) setUsers(uRes.data)
        if (cRes.data) setCongs(cRes.data)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    Promise.all([
      listAssignments(),
      listAssignableUsers(),
      listCongregationsForAssignment(),
    ])
      .then(([aRes, uRes, cRes]) => {
        if (aRes.data) setAssignments(aRes.data)
        if (uRes.data) setUsers(uRes.data)
        if (cRes.data) setCongs(cRes.data)
      })
      .finally(() => setLoading(false))
  }, [])

  const selectedUser = useMemo(() => users.find((u) => u.id === formUser) ?? null, [users, formUser])
  const roleScope: AssignmentRoleScope | null = useMemo(() => {
    if (!selectedUser) return null
    return selectedUser.role === 'konyvelo' ? 'konyvelo' : selectedUser.role === 'egyhazmegyei_szamvevo' ? 'egyhazmegyei_szamvevo' : null
  }, [selectedUser])

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
    const res = await createAssignment({
      profileId: formUser,
      congregationId: formCong,
      roleScope,
      reason: formReason.trim(),
    })
    setFormBusy(false)
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
    await reload()
  }

  async function submitRevoke(id: string) {
    if (revokeReason.trim().length < 5) {
      toast.error('Az indoklás legalább 5 karakter legyen.')
      return
    }
    const res = await revokeAssignment({ assignmentId: id, reason: revokeReason.trim() })
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Hozzáférés visszavonva.')
    setRevokeId(null)
    setRevokeReason('')
    await reload()
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Betöltés...</div>
  }

  return (
    <div className="mt-4 space-y-6">
      {/* Autonómia emlékeztető */}
      <Card className="border-teal-200 bg-teal-50/50">
        <CardContent className="p-4">
          <p className="text-sm leading-relaxed text-teal-900">
            <strong>Fontos:</strong> a hozzárendelés létrehozása után a gyülekezet lelkészének
            jóváhagyása szükséges. A lelkész explicit beleegyezése nélkül a könyvelő vagy
            egyházmegyei számvevő <strong>nem lát adatot</strong>. Minden gyülekezet önálló
            és autonóm.
          </p>
        </CardContent>
      </Card>

      {/* Új hozzárendelés */}
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-lg text-slate-800">Hozzárendelések</h3>
        <Button onClick={() => setFormOpen((v) => !v)} variant={formOpen ? 'outline' : 'default'}>
          {formOpen ? 'Mégsem' : '+ Új hozzárendelés'}
        </Button>
      </div>

      {formOpen && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-slate-700">Felhasználó *</label>
                <select
                  value={formUser}
                  onChange={(e) => setFormUser(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Válassz...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {(u.full_name || u.email || '(névtelen)')} — {roleLabel(u.role as AssignmentRoleScope)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Gyülekezet *</label>
                <select
                  value={formCong}
                  onChange={(e) => setFormCong(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Válassz...</option>
                  {congs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nev_hu || c.name || c.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">
                Indoklás a lelkész számára * (legalább 10 karakter)
              </label>
              <textarea
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Pl. „Szücs János könyvelő kéri a hozzáférést a negyedéves áttekintéshez."
              />
              <p className="mt-1 text-xs text-slate-500">
                Ezt az üzenetet a lelkész fogja elolvasni a döntés előtt. Légy konkrét és tiszteletteljes.
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={submitNew} disabled={formBusy} className="bg-teal-600 hover:bg-teal-700">
                {formBusy ? 'Küldés...' : 'Kérés küldése a lelkésznek'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Keresőmező */}
      <Input
        placeholder="Keresés név, email, gyülekezet szerint..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {/* Lista */}
      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
          Nincs találat.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <Card key={a.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-800">
                      {a.profile_full_name || a.profile_email || 'Ismeretlen'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {a.profile_email || ''} · {roleLabel(a.role_scope)}
                    </p>
                    <p className="text-xs text-slate-500">
                      Gyülekezet: <span className="font-medium text-slate-700">{a.congregation_name || '—'}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Kezdeményezve: {formatDate(a.assigned_at)}
                      {a.approved_at && ` · Jóváhagyva: ${formatDate(a.approved_at)}`}
                      {a.revoked_at && ` · Visszavonva: ${formatDate(a.revoked_at)}`}
                    </p>
                  </div>
                  {statusBadge(a.approval_status)}
                </div>

                {a.approval_reason && (
                  <div className="rounded-xl bg-slate-50 p-2 text-xs italic text-slate-600">
                    &bdquo;{a.approval_reason}&rdquo;
                  </div>
                )}

                {a.approval_status === 'approved' && (
                  revokeId === a.id ? (
                    <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50 p-3">
                      <label className="text-xs font-medium">Visszavonás indoklása</label>
                      <textarea
                        value={revokeReason}
                        onChange={(e) => setRevokeReason(e.target.value)}
                        rows={2}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setRevokeId(null); setRevokeReason('') }}>
                          Mégsem
                        </Button>
                        <Button size="sm" className="bg-orange-600 text-white hover:bg-orange-700" onClick={() => submitRevoke(a.id)}>
                          Visszavonás
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 border-orange-200 text-orange-700 hover:bg-orange-50"
                      onClick={() => { setRevokeId(a.id); setRevokeReason('') }}
                    >
                      <ShieldOff className="size-4" /> Visszavonás
                    </Button>
                  )
                )}

                {a.approval_status === 'pending' && (
                  <p className="text-xs italic text-amber-700">
                    <ShieldCheck className="mr-1 inline size-3" />
                    Várakozás a lelkész döntésére. A gyülekezeti autonómia alapján csak ő dönthet.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
