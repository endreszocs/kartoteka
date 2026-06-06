'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface DeleteUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userName: string
  userEmail: string
  isPending: boolean
  onConfirm: () => void
}

export function DeleteUserDialog({
  open,
  onOpenChange,
  userName,
  userEmail,
  isPending,
  onConfirm,
}: DeleteUserDialogProps) {
  const [confirmText, setConfirmText] = useState('')
  const ready = confirmText.trim() === 'TÖRLÉS'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-rose-100 bg-rose-50/40">
          <DialogTitle className="font-heading text-xl text-slate-800 flex items-center gap-2">
            <AlertTriangle className="size-5 text-rose-600" />
            Felhasználó törlése
          </DialogTitle>
        </DialogHeader>
        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-900">
            <p className="font-semibold">Ez a művelet visszafordíthatatlan!</p>
            <p className="mt-1 text-rose-800">
              A felhasználó <strong>személyes adatai</strong> (név, email, telefon)
              véglegesen <strong>anonimizálódnak</strong>, és a <strong>belépése
              megszűnik</strong>. A kiosztott szerepkörök visszavonódnak.
            </p>
            <p className="mt-2 text-rose-800">
              A <strong>gyülekezet adatai</strong> (tagok, pénzügy, anyakönyv) és a
              <strong> lelkészi szolgálati napló</strong> NEM törlődnek — a
              gyülekezetet más veszi át. A naplóban a korábbi szolgálat
              (a névvel) megmarad, lezárva.
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900">
            Törlés után az <strong>email-cím felszabadul</strong> — ha hiba miatt
            kell, az illető <strong>újra regisztrálhat</strong> ugyanazzal a címmel.
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-800">{userName || '(nincs név)'}</p>
            <p className="text-xs text-slate-500 mt-0.5">{userEmail}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">
              A megerősítéshez írja be: <strong>TÖRLÉS</strong>
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-zinc-50 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
              autoComplete="off"
              autoFocus
              disabled={isPending}
            />
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Mégse
          </Button>
          <Button
            onClick={() => {
              if (ready) onConfirm()
            }}
            disabled={!ready || isPending}
            className="bg-rose-600 hover:bg-rose-700 text-white gap-2"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Végleges törlés
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
