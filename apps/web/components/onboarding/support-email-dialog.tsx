'use client'

/**
 * Support e-mail dialog (2026-05-05c).
 *
 * A welcome wizard "Probléma van? Írj e-mailt a rendszergazdának" gombja
 * nyitja. A felhasználó kitölti a tárgyat és üzenetet, majd a "Küldés" gomb
 * a saját levelezőjével (mailto: protokoll) nyitja meg az új levelet —
 * előre kitöltött címzettel, tárggyal és törzzsel.
 *
 * Miért mailto és nem SMTP-server action? Mert:
 *   1. Nincs különálló konfig (Brevo, SES) — egyszerű, "bárhonnan működik"
 *   2. A felhasználó tudja, mi a feladó-cím (saját) — nem zavaró
 *   3. A levelezőkliens-előzmények és aláírások automatikusan beépülnek
 *
 * Pasztorális hangnem: a "rendszergazda" nevet mondjuk (nem direkt
 * email-címet) — a részletes cím az ablakban szerepel.
 */

import { useState } from 'react'
import { Mail, Send, X, AtSign } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const SUPPORT_EMAIL = 'endreszocs@gmail.com'
const SUPPORT_NAME = 'Endre (rendszergazda)'

interface SupportEmailDialogProps {
  open: boolean
  onClose: () => void
  /** Default tárgy — ahonnan a modalt nyitjuk (pl. "Welcome wizard segítség"). */
  defaultSubject?: string
}

export function SupportEmailDialog({
  open,
  onClose,
  defaultSubject = 'Kartotéka — segítség kérése',
}: SupportEmailDialogProps) {
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState('')

  if (!open) return null

  function handleSend() {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    // window.location.href = url; ez új ablakot/levelezőt nyit
    window.location.href = url
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-slate-100 p-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-violet-50 ring-1 ring-violet-100">
            <Mail className="size-6 text-violet-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-xl text-slate-800">
              Üzenet a rendszergazdának
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Írj röviden, hogy mire akadtál el — Endre személyesen
              végigvezet a beállításon.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Bezárás"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-900">
            <p className="flex items-start gap-2">
              <AtSign className="mt-0.5 size-4 shrink-0" />
              <span>
                A levél a saját leveleződdel (Outlook, Gmail, Apple Mail stb.)
                fog megnyílni. Ott a "Küldés" gombra kell még egyszer kattintanod
                — ez biztonságos és így te döntöd el, mit küldesz el.
              </span>
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="support-to">Címzett</Label>
            <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
              {SUPPORT_NAME} &lt;{SUPPORT_EMAIL}&gt;
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="support-subject">Tárgy</Label>
            <Input
              id="support-subject"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Pl. Nem értem a járulék határidőt"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="support-body">Üzenet</Label>
            <textarea
              id="support-body"
              className="w-full min-h-[140px] resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Írd le röviden, mire akadtál el — pl. melyik mezővel nem boldogulsz, vagy mi a probléma. Endre 1-2 napon belül válaszol."
              value={body}
              onChange={e => setBody(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              Ne írj jelszót vagy egyéb érzékeny adatot az üzenetbe.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 p-4">
          <Button variant="ghost" onClick={onClose}>
            Mégse
          </Button>
          <Button onClick={handleSend} className="gap-2">
            <Send className="size-4" />
            Küldés a levelezőből
          </Button>
        </div>
      </div>
    </div>
  )
}
