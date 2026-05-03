'use client'

import { useState } from 'react'
import { Loader2, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface RejectPendingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userName: string
  userEmail: string
  isPending: boolean
  onConfirm: (reason: string) => void
}

export function RejectPendingDialog({
  open,
  onOpenChange,
  userName,
  userEmail,
  isPending,
  onConfirm,
}: RejectPendingDialogProps) {
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
        <DialogHeader className="px-6 py-4 border-b border-rose-100 bg-rose-50/40">
          <DialogTitle className="font-heading text-xl text-slate-800 flex items-center gap-2">
            <XCircle className="size-5 text-rose-600" />
            Hozzáférés-kérelem elutasítása
          </DialogTitle>
        </DialogHeader>
        <div className="p-6 space-y-4">
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-800">{userName || '(nincs név)'}</p>
            <p className="text-xs text-slate-500 mt-0.5">{userEmail}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">
              Indoklás (legalább 5 karakter, kötelező)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Pl.: A regisztráció nem felel meg az egyházkerületi tagjelölési rendnek…"
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-zinc-50 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 resize-none"
              autoFocus
              disabled={isPending}
            />
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Az indoklás bekerül az értesítésbe, amit a felhasználó kap. Pasztorális hangnemben fogalmazza meg.
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
            className="bg-rose-600 hover:bg-rose-700 text-white gap-2"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
            Elutasítás
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
