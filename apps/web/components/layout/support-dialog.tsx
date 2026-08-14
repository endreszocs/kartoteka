'use client'

/**
 * Segítség és támogatás felugró ablak.
 * A header-ből nyílik, nem külön oldalra navigál.
 */

import { useState, useEffect, useTransition, useRef } from 'react'
import { HelpCircle, Send, Camera, Upload, Clock, Loader2, Bug, Lightbulb, MessageCircle, Settings } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { sendSupportTicket, getUserTickets, uploadSupportScreenshot } from '@/app/(dashboard)/support/actions'
import { toast } from 'sonner'

interface SupportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TICKET_TYPES = [
  { value: 'bug', label: 'Hiba bejelentés', icon: Bug, color: 'text-red-600 bg-red-50' },
  { value: 'feature', label: 'Fejlesztési javaslat', icon: Lightbulb, color: 'text-amber-600 bg-amber-50' },
  { value: 'question', label: 'Kérdés', icon: MessageCircle, color: 'text-blue-600 bg-blue-50' },
  { value: 'general', label: 'Általános', icon: Settings, color: 'text-slate-600 bg-slate-50' },
]

const PRIORITIES = [
  { value: 'low', label: 'Alacsony', className: 'bg-slate-100 text-slate-600' },
  { value: 'normal', label: 'Normál', className: 'bg-blue-100 text-blue-700' },
  { value: 'high', label: 'Magas', className: 'bg-amber-100 text-amber-700' },
  { value: 'urgent', label: 'Sürgős', className: 'bg-red-100 text-red-700' },
]

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  new: { label: 'Új', className: 'bg-blue-50 text-blue-700' },
  open: { label: 'Nyitott', className: 'bg-blue-50 text-blue-700' },
  read: { label: 'Olvasva', className: 'bg-amber-50 text-amber-700' },
  replied: { label: 'Válaszolva', className: 'bg-emerald-50 text-emerald-700' },
  closed: { label: 'Lezárva', className: 'bg-slate-100 text-slate-500' },
  sent: { label: 'Válasz', className: 'bg-violet-50 text-violet-700' },
}

type Tab = 'new' | 'history'

export function SupportDialog({ open, onOpenChange }: SupportDialogProps) {
  const [tab, setTab] = useState<Tab>('new')
  const [type, setType] = useState('general')
  const [priority, setPriority] = useState('normal')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [tickets, setTickets] = useState<Array<{ id: string; subject: string; content: string; status: string; created_at: string; type: string }>>([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Korábbi jegyek betöltése
  useEffect(() => {
    if (!open || tab !== 'history') return
    let cancelled = false
    void (async () => {
      const result = await getUserTickets()
      if (cancelled) return
      if ('data' in result && result.data) {
        setTickets(result.data as typeof tickets)
      }
      setTicketsLoading(false)
    })()
    return () => { cancelled = true }
  }, [open, tab])

  function resetForm() {
    setType('general')
    setPriority('normal')
    setSubject('')
    setDescription('')
    setScreenshotUrl(null)
  }

  function handleSubmit() {
    if (!subject.trim()) {
      toast.error('A tárgy mező kötelező.')
      return
    }
    if (!description.trim()) {
      toast.error('A leírás mező kötelező.')
      return
    }

    startTransition(async () => {
      const result = await sendSupportTicket(subject, description, {
        type,
        priority,
        screenshotUrl,
      })
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success('A kérésed sikeresen elküldve! Hamarosan válaszolunk.')
        resetForm()
        setTab('history')
      }
    })
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    const result = await uploadSupportScreenshot(formData)
    setUploading(false)

    if ('error' in result && result.error) {
      toast.error(result.error)
    } else if (result.url) {
      setScreenshotUrl(result.url)
      toast.success('Képernyőkép feltöltve!')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="size-5 text-emerald-600" />
            Segítség és támogatás
          </DialogTitle>
        </DialogHeader>

        {/* Tabok */}
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTab('new')}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${tab === 'new' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Új kérés
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${tab === 'history' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Korábbi kéréseim
          </button>
        </div>

        {tab === 'new' ? (
          <div className="space-y-4">
            {/* Típus választó */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                Milyen jellegű a kérésed?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TICKET_TYPES.map((t) => {
                  const Icon = t.icon
                  const active = type === t.value
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition ${active ? 'border-emerald-300 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                      <div className={`flex size-8 items-center justify-center rounded-lg ${t.color}`}>
                        <Icon className="size-4" />
                      </div>
                      <span className={`font-medium ${active ? 'text-emerald-800' : 'text-slate-700'}`}>{t.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Prioritás */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                Prioritás
              </label>
              <div className="flex gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${priority === p.value ? p.className + ' ring-2 ring-offset-1 ring-slate-300' : 'bg-slate-50 text-slate-400'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tárgy */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Tárgy *
              </label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Rövid összefoglalás..."
                className="rounded-xl"
              />
            </div>

            {/* Leírás */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Leírás *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Részletes leírás... Mi a probléma? Mit várnál? Hogyan reprodukálható?"
                rows={4}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>

            {/* Képernyőkép */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                Képernyőkép (opcionális)
              </label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Upload className="mr-1 size-3.5" />}
                  {uploading ? 'Feltöltés...' : 'Kép feltöltése'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                {screenshotUrl && (
                  <Badge variant="secondary" className="text-xs text-emerald-700">
                    <Camera className="mr-1 size-3" /> Képernyőkép csatolva
                  </Badge>
                )}
              </div>
            </div>

            {/* Beküldés */}
            <Button
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSubmit}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 size-4" />
              )}
              {isPending ? 'Küldés...' : 'Kérés elküldése'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {ticketsLoading ? (
              <div className="py-8 text-center text-sm text-slate-400">
                <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                Betöltés...
              </div>
            ) : tickets.length === 0 ? (
              <div className="py-8 text-center">
                <HelpCircle className="mx-auto mb-2 size-8 text-slate-300" />
                <p className="text-sm text-slate-500">Még nincs korábbi kérésed.</p>
              </div>
            ) : (
              tickets.filter((t) => t.type === 'request').map((ticket) => {
                const statusInfo = STATUS_MAP[ticket.status] || STATUS_MAP.open
                const reply = tickets.find((t) => t.type === 'reply' && t.id === `${ticket.id}-reply`)
                return (
                  <div key={ticket.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{ticket.subject}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {new Date(ticket.created_at).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${statusInfo.className}`}>
                        {statusInfo.label}
                      </Badge>
                    </div>
                    {ticket.content && (
                      <p className="mt-2 text-xs text-slate-600 line-clamp-2">{ticket.content}</p>
                    )}
                    {reply && (
                      <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2">
                        <p className="text-xs font-semibold text-emerald-700">Rendszergazdai válasz:</p>
                        <p className="mt-0.5 text-xs text-emerald-600">{reply.content}</p>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
