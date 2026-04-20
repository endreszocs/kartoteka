'use client'

import { useCallback, useEffect, useState } from 'react'
import { UserCheck, Phone, MapPin, Edit2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { getPresbyters, deletePresbyter, type PresbiterRow } from '@/app/(dashboard)/tagnyilvantartas/presbyter-actions'
import { PresbiterFormDialog } from '@/components/modals/presbyter-form-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ageFromDate } from '@/lib/utils/date'

export function PresbytersTab() {
  const [presbiters, setPresbiters] = useState<PresbiterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editSzemelId, setEditSzemelId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const data = await getPresbyters()
    setPresbiters(data)
    setLoading(false)
  }, [])

  const refreshPresbyters = useCallback(() => {
    setLoading(true)
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        void load()
      }
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const byPerson: Record<number, { szemely: PresbiterRow['szemely']; tisztseg: string; korzetek: { id: number; nev: string }[] }> = {}
  presbiters.forEach((presbyter) => {
    const key = presbyter.szemely?.id
    if (!key) return
    if (!byPerson[key]) {
      byPerson[key] = {
        szemely: presbyter.szemely,
        tisztseg: presbyter.tisztseg || 'Presbiter',
        korzetek: [],
      }
    }
    if (presbyter.csoport) byPerson[key].korzetek.push(presbyter.csoport)
  })
  const rows = Object.values(byPerson)

  async function handleDelete(szemelId: number, nev: string) {
    if (!confirm(`Biztosan törli ${nev} presbiteri bejegyzéseit?`)) return
    const result = await deletePresbyter(szemelId)
    if (result.error) toast.error(result.error)
    else {
      toast.success('Presbiter törölve.')
      refreshPresbyters()
    }
  }

  function handleFormClose() {
    setFormOpen(false)
    setEditSzemelId(null)
    refreshPresbyters()
  }

  return (
    <div className="space-y-4">
      <div className="card-raised flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex items-center gap-3">
          <div className="icon-raised h-10 w-10 bg-gradient-to-br from-amber-500 to-amber-600">
            <UserCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">{rows.length} presbiter</p>
            <p className="text-xs text-slate-400">A gyülekezet presbitériuma</p>
          </div>
        </div>
        <Button
          size="sm"
          className="rounded-lg shadow-sm"
          onClick={() => {
            setEditSzemelId(null)
            setFormOpen(true)
          }}
        >
          + Új presbiter
        </Button>
      </div>

      {loading ? (
        <div className="animate-pulse py-12 text-center text-sm text-slate-400">Betöltés...</div>
      ) : rows.length === 0 ? (
        <div className="card-raised p-8 text-center">
          <UserCheck className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-slate-500">Még nincs presbiter rögzítve.</p>
          <p className="mt-1 text-xs text-slate-400">Kattintson az &quot;+ Új presbiter&quot; gombra a hozzáadáshoz.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => {
            const szemely = row.szemely!
            const nev = `${szemely.csaladnev || ''} ${szemely.k_nev || ''}`.trim()
            const age = ageFromDate(szemely.sz_datum)

            return (
              <div key={szemely.id} className="card-raised p-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white ${szemely.ferfi ? 'bg-gradient-to-br from-blue-500 to-blue-600' : 'bg-gradient-to-br from-pink-500 to-rose-500'}`}
                    style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}
                  >
                    {szemely.ferfi ? '♂' : '♀'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-700">{nev}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge className="border-0 bg-amber-100 text-[10px] text-amber-700">{row.tisztseg}</Badge>
                      {age !== null && <span className="text-[11px] text-slate-400">{age} éves</span>}
                    </div>
                  </div>
                </div>

                {row.korzetek.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {row.korzetek.map((korzet) => (
                      <span key={korzet.id} className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] text-cyan-700">
                        <MapPin className="h-3 w-3" /> {korzet.nev}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-white/60 pt-3">
                  {szemely.telefon ? (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <Phone className="h-3 w-3" /> {szemely.telefon}
                    </span>
                  ) : (
                    <span />
                  )}

                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-slate-400 hover:text-blue-600"
                      onClick={() => {
                        setEditSzemelId(szemely.id)
                        setFormOpen(true)
                      }}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                      onClick={() => handleDelete(szemely.id, nev)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <PresbiterFormDialog
        open={formOpen}
        onOpenChange={handleFormClose}
        editSzemelId={editSzemelId}
        presbiters={presbiters}
      />
    </div>
  )
}
