'use client'

/**
 * Access Request elfogadási dialógus.
 *
 * FIGYELEM (M0.1): ez a dialog CSAK a status-váltást végzi (pending → approved).
 * Az invite-email + auth.users létrehozás az M0.3 fázis része lesz.
 *
 * Admin láthatja: email, név, szerepkör, és egy admin-megjegyzést adhat hozzá.
 */

import { useState, useTransition } from 'react'
import { CheckCircle2, Info, Mail } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ModalField } from '@/components/ui/modal-field'
import { Input } from '@/components/ui/input'

import { approveAccessRequest } from '@/app/(dashboard)/admin/access-requests-actions'
import type { AccessRequest } from '@/app/(dashboard)/admin/access-requests-shared'
import { ROLE_LABELS } from '@/app/(dashboard)/admin/access-requests-shared'

interface ApproveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: AccessRequest | null
  onApproved: () => void
}

export function AccessRequestApproveDialog({
  open,
  onOpenChange,
  request,
  onApproved,
}: ApproveDialogProps) {
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleApprove() {
    if (!request) return

    startTransition(async () => {
      const res = await approveAccessRequest({
        id: request.id,
        admin_notes: notes.trim() || null,
      })
      if (res.error) {
        toast.error(`Hiba: ${res.error}`)
        return
      }
      toast.success(`${request.full_name} kérelme elfogadva.`)
      setNotes('')
      onApproved()
      onOpenChange(false)
    })
  }

  if (!request) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(560px,96vw)] rounded-2xl border-emerald-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 font-heading text-2xl">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
              <CheckCircle2 className="size-5" />
            </span>
            Hozzáférés-kérelem elfogadása
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Kérelmező adatai */}
          <div className="rounded-xl bg-emerald-50/60 border border-emerald-100 p-4 space-y-2">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-700/70">
                Kérelmező
              </p>
              <p className="mt-0.5 text-base font-semibold text-slate-800">{request.full_name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="font-medium text-slate-500">Email:</p>
                <p className="text-slate-800 font-mono">{request.email}</p>
              </div>
              <div>
                <p className="font-medium text-slate-500">Szerepkör:</p>
                <p className="text-slate-800">{ROLE_LABELS[request.requested_role]}</p>
              </div>
              {request.phone && (
                <div>
                  <p className="font-medium text-slate-500">Telefon:</p>
                  <p className="text-slate-800">{request.phone}</p>
                </div>
              )}
              {request.congregation_slug && (
                <div>
                  <p className="font-medium text-slate-500">Gyülekezet:</p>
                  <p className="text-slate-800">{request.congregation_slug}</p>
                </div>
              )}
            </div>
            {request.justification && (
              <div className="border-t border-emerald-100 pt-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-700/70">
                  Indoklás
                </p>
                <p className="mt-1 text-xs text-slate-700 whitespace-pre-wrap">
                  „{request.justification}"
                </p>
              </div>
            )}
          </div>

          {/* Admin megjegyzés */}
          <ModalField label="Admin megjegyzés (opcionális, csak belső használatra)">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Pl. esperes jóváhagyta telefonon"
              disabled={isPending}
            />
          </ModalField>

          {/* M0.1 figyelmeztetés */}
          <div className="rounded-xl bg-amber-50/60 border border-amber-200 p-3">
            <div className="flex items-start gap-2">
              <Info className="size-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-900 leading-relaxed">
                <p className="font-medium">M0.1 fázis — email még NEM küldődik automatikusan</p>
                <p className="mt-1">
                  A jelenlegi verzióban csak a kérelem státusza változik <code className="bg-amber-100 px-1 rounded">approved</code>-ra.
                  Az invite-emailt az M0.3 fázisban fogjuk implementálni (a profiles.status workflow-hoz).
                  Addig az admin köteles{' '}
                  <a href={`mailto:${request.email}`} className="underline font-medium">
                    kézzel értesíteni
                  </a>{' '}
                  a kérelmezőt (Mail ikon → email kliens).
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end border-t border-slate-100 pt-3 -mx-6 px-6">
          <Button
            variant="outline"
            onClick={() => {
              setNotes('')
              onOpenChange(false)
            }}
            disabled={isPending}
          >
            Mégse
          </Button>
          <a
            href={`mailto:${request.email}?subject=Kartotéka hozzáférés-kérelem elfogadva&body=Tisztelt ${request.full_name}!%0D%0A%0D%0AÖrömmel értesítem, hogy a Kartotéka-rendszerbe benyújtott hozzáférés-kérelmét elfogadtuk.%0D%0A%0D%0AKérem, használja az alábbi linket a regisztráció befejezéséhez:%0D%0A[Regisztrációs link — M0.3-tól automatikus lesz]%0D%0A%0D%0AÜdvözlettel:%0D%0AKartotéka rendszer`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Mail className="size-4" />
            Email nyitása
          </a>
          <Button
            onClick={handleApprove}
            disabled={isPending}
            className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 gap-1.5"
          >
            <CheckCircle2 className="size-4" />
            {isPending ? 'Elfogadás…' : 'Elfogadom'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
