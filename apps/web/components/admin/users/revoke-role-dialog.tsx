'use client'

import { useState } from 'react'
import { Loader2, ShieldOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface RevokeRoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roleLabel: string
  scopeName: string | null
  userName: string
  isPending: boolean
  onConfirm: (reason: string) => void
}

export function RevokeRoleDialog({
  open,
  onOpenChange,
  roleLabel,
  scopeName,
  userName,
  isPending,
  onConfirm,
}: RevokeRoleDialogProps) {
  const [reason, setReason] = useState('')
  const ready = reason.trim().length >= 5

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason('')
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-md bg-white p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-amber-100 bg-amber-50/40">
          <DialogTitle className="font-heading text-xl text-slate-800 flex items-center gap-2">
            <ShieldOff className="size-5 text-amber-600" />
            Szerepkör visszavonása
          </DialogTitle>
        </DialogHeader>
        <div className="p-6 space-y-4">
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-800">{userName}</p>
            <p className="text-xs text-slate-600 mt-0.5">
              {roleLabel}
              {scopeName ? ` — ${scopeName}` : ''}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">
              Indoklás (legalább 5 karakter, kötelező)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Pl.: A lelkipásztor másik gyülekezetbe költözött…"
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-zinc-50 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 resize-none"
              autoFocus
              disabled={isPending}
            />
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Az indoklás bekerül a rendszer naplójába, hogy később vissza tudjuk követni, ki és miért vonta vissza ezt a szerepkört.
          </p>
        </div>
        <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Mégse
          </Button>
          <Button
            onClick={() => {
              if (ready) onConfirm(reason.trim())
            }}
            disabled={!ready || isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldOff className="size-4" />}
            Visszavonás
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
