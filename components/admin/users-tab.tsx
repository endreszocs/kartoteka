'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getPendingUsers, getActiveUsers, getDioceses, approveUser, updateUserRole } from '@/app/(dashboard)/admin/actions'
import { toast } from 'sonner'

interface PendingUser {
  id: string
  full_name: string | null
  email: string
  status: string
  created_at: string
  congregation_name_input: string | null
}

interface ActiveUser {
  id: string
  full_name: string | null
  email: string
  role: string
  status: string
  congregation_id: string | null
  congregations: { nev_hu: string | null; name: string | null } | null
}

interface Diocese { id: string; name: string }

const ROLES = [
  { value: 'lelkesz', label: 'Lelkész' },
  { value: 'esperes', label: 'Esperes' },
  { value: 'egyhazmegyei_admin', label: 'Egyházmegyei admin' },
  { value: 'egyhazkeruleti_admin', label: 'Egyházkerületi admin' },
  { value: 'admin', label: 'Rendszergazda' },
  { value: 'konyvelo', label: 'Könyvelő' },
  { value: 'egyhazmegyei_szamvevo', label: 'Egyházmegyei számvevő' },
]

export function UsersTab() {
  const [pending, setPending] = useState<PendingUser[]>([])
  const [active, setActive] = useState<ActiveUser[]>([])
  const [dioceses, setDioceses] = useState<Diocese[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Jóváhagyás állapotok
  const [approveId, setApproveId] = useState<string | null>(null)
  const [selectedDiocese, setSelectedDiocese] = useState('')
  const [approving, setApproving] = useState(false)

  useEffect(() => {
    Promise.all([getPendingUsers(), getActiveUsers(), getDioceses()])
      .then(([pRes, aRes, dRes]) => {
        if ('data' in pRes) setPending(pRes.data as unknown as PendingUser[])
        if ('data' in aRes) setActive(aRes.data as unknown as ActiveUser[])
        setDioceses(dRes)
      })
      .catch(() => toast.error('Hiba a felhasználók betöltésekor'))
      .finally(() => setLoading(false))
  }, [])

  const filteredActive = useMemo(() => {
    if (!search.trim()) return active
    const q = search.toLowerCase()
    return active.filter(u =>
      (u.full_name || '').toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    )
  }, [active, search])

  async function handleApprove(userId: string, congNameInput: string | null) {
    if (!selectedDiocese) { toast.error('Válasszon egyházmegyét!'); return }
    setApproving(true)
    const res = await approveUser(userId, selectedDiocese, congNameInput || 'Ismeretlen gyülekezet')
    if ('error' in res && res.error) {
      toast.error(res.error)
    } else {
      toast.success('Felhasználó jóváhagyva!')
      setPending(prev => prev.filter(u => u.id !== userId))
      setApproveId(null)
      setSelectedDiocese('')
      // Frissítjük az aktív listát
      const aRes = await getActiveUsers()
      if ('data' in aRes) setActive(aRes.data as unknown as ActiveUser[])
    }
    setApproving(false)
  }

  async function handleRoleChange(userId: string, newRole: string) {
    const res = await updateUserRole(userId, newRole)
    if ('error' in res && res.error) {
      toast.error(res.error)
    } else {
      toast.success('Szerepkör módosítva!')
      setActive(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
    }
  }

  if (loading) return <div className="py-12 text-center text-muted-foreground">Betöltés...</div>

  return (
    <div className="space-y-6 mt-4">
      {/* Függő regisztrációk */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Függő regisztrációk ({pending.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length === 0 && (
            <p className="text-sm text-muted-foreground">Nincs függő regisztráció.</p>
          )}
          {pending.map(u => (
            <div key={u.id} className="border-b last:border-0 py-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-sm">{u.full_name || 'Névtelen'}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Regisztráció: {new Date(u.created_at).toLocaleDateString('hu-HU')}
                    {u.congregation_name_input && ` · Gyülekezet: ${u.congregation_name_input}`}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => {
                  if (approveId === u.id) { setApproveId(null) }
                  else { setApproveId(u.id); setSelectedDiocese('') }
                }}>
                  {approveId === u.id ? 'Mégse' : 'Jóváhagyás'}
                </Button>
              </div>

              {approveId === u.id && (
                <div className="mt-3 p-3 bg-slate-50 rounded-lg space-y-2">
                  <div>
                    <label className="text-xs font-medium">Egyházmegye *</label>
                    <select
                      value={selectedDiocese}
                      onChange={e => setSelectedDiocese(e.target.value)}
                      className="w-full mt-1 rounded-md border px-3 py-2 text-sm"
                    >
                      <option value="">Válasszon...</option>
                      {dioceses.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Gyülekezet neve</label>
                    <p className="text-sm mt-1 bg-white border rounded-md px-3 py-2">
                      {u.congregation_name_input || 'Nem adta meg'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleApprove(u.id, u.congregation_name_input)}
                    disabled={approving || !selectedDiocese}
                  >
                    {approving ? 'Jóváhagyás...' : 'Jóváhagyás véglegesítés'}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Aktív felhasználók */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aktív felhasználók ({active.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Keresés név vagy e-mail szerint..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-w-md"
          />

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 font-medium">Név</th>
                  <th className="py-2 font-medium">E-mail</th>
                  <th className="py-2 font-medium">Gyülekezet</th>
                  <th className="py-2 font-medium">Szerepkör</th>
                </tr>
              </thead>
              <tbody>
                {filteredActive.map(u => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-2">{u.full_name || '—'}</td>
                    <td className="py-2 text-muted-foreground">{u.email}</td>
                    <td className="py-2 text-muted-foreground">
                      {(u.congregations as { nev_hu?: string; name?: string } | null)?.nev_hu ||
                       (u.congregations as { nev_hu?: string; name?: string } | null)?.name || '—'}
                    </td>
                    <td className="py-2">
                      <select
                        value={u.role}
                        onChange={e => handleRoleChange(u.id, e.target.value)}
                        className="rounded-md border px-2 py-1 text-sm"
                      >
                        {ROLES.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
