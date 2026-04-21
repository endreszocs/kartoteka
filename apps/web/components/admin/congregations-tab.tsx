'use client'

import { useEffect, useMemo, useState } from 'react'

import { enterCongregation, getCongregationDetails, getCongregations } from '@/app/(dashboard)/admin/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface Congregation {
  id: string
  nev_hu: string | null
  name: string | null
  diocese_id: string | null
  dioceses: { name: string } | null
}

interface CongregationDetails {
  members: { id: string; csaladnev: string | null; k_nev: string | null; ferfi: boolean | null; sz_datum: string | null }[]
  memberCount: number
  users: { id: string; full_name: string; email: string; role: string; status: string }[]
  finance: { income: number; expense: number; balance: number }
}

export function CongregationsTab() {
  const [congregations, setCongregations] = useState<Congregation[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [details, setDetails] = useState<CongregationDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  useEffect(() => {
    getCongregations()
      .then(result => {
        if ('data' in result) setCongregations(result.data as unknown as Congregation[])
      })
      .catch(() => toast.error('A gyülekezetek betöltése sikertelen.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return congregations
    const query = search.toLowerCase()
    return congregations.filter(congregation =>
      (congregation.nev_hu || congregation.name || '').toLowerCase().includes(query) ||
      (congregation.dioceses?.name || '').toLowerCase().includes(query)
    )
  }, [congregations, search])

  async function openDetails(id: string) {
    setSelectedId(id)
    setDetails(null)
    setDetailsLoading(true)
    try {
      const result = await getCongregationDetails(id)
      setDetails(result)
    } catch {
      toast.error('A részletek betöltése sikertelen.')
    }
    setDetailsLoading(false)
  }

  async function handleEnter(congregationId: string, congregationName: string) {
    const reason = window.prompt(
      `Miért szeretnél hozzáférést kérni a(z) "${congregationName}" gyülekezethez?`,
      'Rendszerellenőrzés és támogatás'
    )

    if (reason === null) return

    const result = await enterCongregation(congregationId, reason)
    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }

    if (result.mode === 'approved') {
      toast.success(result.message || 'A hozzáférés aktív. Átirányítalak a gyülekezeti nézetbe.')
      window.location.href = '/dashboard'
      return
    }

    toast.success(result.message || 'A hozzáférési kérelem elküldve.')
  }

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">Betöltés...</div>
  }

  return (
    <div className="mt-4 space-y-4">
      <Input
        placeholder="Keresés gyülekezet vagy egyházmegye szerint..."
        value={search}
        onChange={event => setSearch(event.target.value)}
        className="max-w-md"
      />

      <p className="text-sm text-muted-foreground">{filtered.length} gyülekezet</p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Gyülekezet</th>
              <th className="px-4 py-3 font-medium">Egyházmegye</th>
              <th className="px-4 py-3 text-right font-medium">Műveletek</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(congregation => (
              <tr key={congregation.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{congregation.nev_hu || congregation.name || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{congregation.dioceses?.name || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => openDetails(congregation.id)}>Részletek</Button>
                    <Button
                      size="sm"
                      onClick={() => handleEnter(congregation.id, congregation.nev_hu || congregation.name || 'Gyülekezet')}
                    >
                      Hozzáférés
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedId(null)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">
                {congregations.find(congregation => congregation.id === selectedId)?.nev_hu || 'Gyülekezet'} — Részletek
              </h3>
              <button onClick={() => setSelectedId(null)} className="text-lg text-muted-foreground hover:text-foreground">×</button>
            </div>

            {detailsLoading && <p className="text-sm text-muted-foreground">Betöltés...</p>}

            {!detailsLoading && details && (
              <div className="space-y-4">
                <Card>
                  <CardHeader><CardTitle className="text-sm">Pénzügyi összesítés ({new Date().getFullYear()})</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-muted-foreground">Bevétel</p>
                      <p className="font-bold text-green-600">{details.finance.income.toLocaleString('hu-HU')} RON</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Kiadás</p>
                      <p className="font-bold text-red-600">{details.finance.expense.toLocaleString('hu-HU')} RON</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Egyenleg</p>
                      <p className={`font-bold ${details.finance.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {details.finance.balance.toLocaleString('hu-HU')} RON
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm">Felhasználók ({details.users.length})</CardTitle></CardHeader>
                  <CardContent>
                    {details.users.length === 0 && <p className="text-sm text-muted-foreground">Nincs aktív felhasználó.</p>}
                    {details.users.map(user => (
                      <div key={user.id} className="flex justify-between border-b py-1 text-sm last:border-0">
                        <span>{user.full_name || user.email}</span>
                        <span className="text-muted-foreground">{user.role}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm">Tagok ({details.memberCount})</CardTitle></CardHeader>
                  <CardContent>
                    {details.members.length === 0 && <p className="text-sm text-muted-foreground">Nincs tag.</p>}
                    <div className="max-h-60 space-y-1 overflow-y-auto">
                      {details.members.map(member => (
                        <div key={member.id} className="flex justify-between border-b py-1 text-sm last:border-0">
                          <span>{[member.csaladnev, member.k_nev].filter(Boolean).join(' ') || '—'}</span>
                          <span className="text-muted-foreground">{member.ferfi === true ? 'Férfi' : member.ferfi === false ? 'Nő' : '—'}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
