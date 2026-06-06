'use client'

import { useCallback, useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getSupportTickets, replySupportTicket, closeSupportTicket } from '@/app/(dashboard)/admin/actions'
import { toast } from 'sonner'

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

export function SupportTab() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  // 2026-06-07: a betöltési hiba most NEM tűnik el csendben — külön hiba-állapot
  // + "Újrapróbálom" gomb (a visszaadott { error }-t is kezeljük, nem csak a dobottat).
  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    getSupportTickets()
      .then(res => {
        if ('error' in res && res.error) {
          setError(res.error)
        } else if ('data' in res) {
          setTickets(res.data as unknown as Ticket[])
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Ismeretlen hiba.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const raf = requestAnimationFrame(() => load())
    return () => cancelAnimationFrame(raf)
  }, [load])

  const selected = tickets.find(t => t.id === selectedId)

  async function handleReply() {
    if (!selectedId || !reply.trim()) return
    setSending(true)
    const res = await replySupportTicket(selectedId, reply)
    if ('error' in res && res.error) {
      toast.error(res.error)
    } else {
      toast.success('Válasz elküldve!')
      setReply('')
      setTickets(prev => prev.map(t => t.id === selectedId ? { ...t, status: 'read' } : t))
    }
    setSending(false)
  }

  async function handleClose(ticketId: string) {
    const res = await closeSupportTicket(ticketId)
    if ('error' in res && res.error) {
      toast.error(res.error)
    } else {
      toast.success('Jegy lezárva.')
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: 'closed' } : t))
      if (selectedId === ticketId) setSelectedId(null)
    }
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center">
        <p className="font-semibold text-rose-800">A támogatási jegyek betöltése nem sikerült</p>
        <p className="mt-1 text-sm text-rose-700">{error}</p>
        <Button onClick={load} variant="outline" className="mt-3 gap-2">
          <RefreshCw className="size-4" />
          Újrapróbálom
        </Button>
      </div>
    )
  }

  if (loading) return <div className="py-12 text-center text-muted-foreground">Betöltés...</div>

  const statusLabel = (s: string) => {
    if (s === 'new') return <span className="text-orange-600 font-medium">Új</span>
    if (s === 'read') return <span className="text-blue-600">Olvasott</span>
    if (s === 'replied') return <span className="text-emerald-600">Megválaszolva</span>
    if (s === 'closed') return <span className="text-muted-foreground">Lezárt</span>
    return <span>{s}</span>
  }

  return (
    <div className="space-y-4 mt-4">
      <p className="text-sm text-muted-foreground">{tickets.length} támogatási jegy</p>

      {tickets.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nincs beérkezett jegy.</CardContent></Card>
      )}

      <div className="space-y-2">
        {tickets.map(t => (
          <Card key={t.id} className={`cursor-pointer hover:bg-slate-50 transition ${selectedId === t.id ? 'ring-2 ring-blue-500' : ''}`}>
            <CardContent className="py-3 px-4" onClick={() => setSelectedId(selectedId === t.id ? null : t.id)}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-sm">{t.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {(t.profiles as { full_name?: string; email: string } | null)?.full_name || (t.profiles as { full_name?: string; email: string } | null)?.email || 'Ismeretlen'} ·{' '}
                    {new Date(t.created_at).toLocaleDateString('hu-HU')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {statusLabel(t.status)}
                  {t.status !== 'closed' && (
                    <Button size="sm" variant="ghost" className="text-xs" onClick={e => { e.stopPropagation(); handleClose(t.id) }}>
                      Lezárás
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Részletek + válasz modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSelectedId(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">{selected.subject}</h3>
              <button onClick={() => setSelectedId(null)} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
            </div>

            <p className="text-xs text-muted-foreground mb-2">
              {(selected.profiles as { full_name?: string; email: string } | null)?.full_name} ({(selected.profiles as { full_name?: string; email: string } | null)?.email}) ·{' '}
              {new Date(selected.created_at).toLocaleString('hu-HU')}
            </p>

            <div className="bg-slate-50 rounded-lg p-3 text-sm mb-4 whitespace-pre-wrap">{selected.content}</div>

            {selected.status !== 'closed' && (
              <div className="space-y-2">
                <textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  placeholder="Válasz szövege..."
                  className="w-full rounded-lg border px-3 py-2 text-sm resize-none min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleReply} disabled={sending || !reply.trim()}>
                    {sending ? 'Küldés...' : 'Válasz küldés'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleClose(selected.id)}>
                    Jegy lezárás
                  </Button>
                </div>
              </div>
            )}

            {selected.status === 'closed' && (
              <p className="text-sm text-muted-foreground italic">Ez a jegy le van zárva.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
