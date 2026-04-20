'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { getUserTickets, sendSupportTicket } from '@/app/(dashboard)/support/actions'
import { toast } from 'sonner'
import { Send, MessageSquare } from 'lucide-react'

interface Ticket {
  id: string
  subject: string
  content: string
  status: string
  type: string
  created_at: string
  parent_id?: string | null
}

const statusLabels: Record<string, { label: string; className: string }> = {
  new: { label: 'Elküldve', className: 'bg-blue-100 text-blue-700' },
  read: { label: 'Olvasva', className: 'bg-amber-100 text-amber-700' },
  replied: { label: 'Megválaszolva', className: 'bg-emerald-100 text-emerald-700' },
  closed: { label: 'Lezárva', className: 'bg-slate-100 text-slate-500' },
}

export function SupportMain() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    getUserTickets()
      .then(res => { if ('data' in res) setTickets(res.data as Ticket[]) })
      .catch(() => toast.error('Hiba'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSend() {
    if (!subject.trim() || !content.trim()) return
    setSending(true)
    const res = await sendSupportTicket(subject, content)
    if ('error' in res && res.error) {
      toast.error(res.error)
    } else {
      toast.success('Üzenet elküldve!')
      setSubject('')
      setContent('')
      const fresh = await getUserTickets()
      if ('data' in fresh) setTickets(fresh.data as Ticket[])
    }
    setSending(false)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Új jegy form */}
      <div className="lg:col-span-2 card-raised p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="icon-raised w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-600">
            <Send className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-semibold text-sm text-slate-800">Új üzenet</h3>
        </div>

        <div className="space-y-3">
          <Input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Tárgy"
            className="h-11"
          />
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Írja le részletesen a kérdését vagy problémáját..."
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[120px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button onClick={handleSend} disabled={sending || !subject.trim() || !content.trim()} className="w-full h-11">
            {sending ? 'Küldés...' : 'Üzenet küldése'}
          </Button>
        </div>
      </div>

      {/* Korábbi jegyek */}
      <div className="lg:col-span-3 card-raised p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="icon-raised w-9 h-9 bg-gradient-to-br from-violet-500 to-violet-600">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-semibold text-sm text-slate-800">Korábbi üzenetek</h3>
        </div>

        {loading && <p className="text-sm text-muted-foreground py-4">Betöltés...</p>}

        {!loading && tickets.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">Még nem küldött üzenetet.</p>
        )}

        {!loading && tickets.length > 0 && (
          <div className="divide-y divide-slate-100">
            {tickets.filter(t => t.type === 'request').map(t => {
              const st = statusLabels[t.status] || statusLabels.new
              const replies = tickets.filter(r => r.type === 'reply' && r.parent_id === t.id)
              return (
                <div key={t.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{t.subject}</p>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{t.content}</p>
                      <p className="text-[11px] text-slate-400 mt-1">{new Date(t.created_at).toLocaleDateString('hu-HU')}</p>
                    </div>
                    <Badge className={`shrink-0 text-[10px] border-0 ${st.className}`}>{st.label}</Badge>
                  </div>
                  {replies.length > 0 && (
                    <div className="mt-2 ml-4 pl-3 border-l-2 border-blue-200 space-y-1">
                      {replies.map(r => (
                        <div key={r.id} className="text-xs text-slate-600 bg-blue-50 rounded-lg p-2">
                          <p className="font-medium text-blue-700 mb-0.5">Válasz:</p>
                          {r.content}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
