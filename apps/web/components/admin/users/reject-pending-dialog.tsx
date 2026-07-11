'use client'

import { useState } from 'react'
import { Loader2, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

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
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8 font-heading text-lg text-foreground">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <XCircle className="size-5" />
            </span>
            Hozzáférés-kérelem elutasítása
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto">
          <div className="rounded-xl bg-muted/60 p-3 text-sm ring-1 ring-border">
            <p className="font-semibold text-foreground">{userName || '(nincs név)'}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{userEmail}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="reject-reason" className="text-xs font-medium text-muted-foreground">
              Indoklás (legalább 5 karakter, kötelező)
            </Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Pl.: A regisztráció nem felel meg az egyházkerületi tagjelölési rendnek…"
              rows={3}
              className="resize-none"
              autoFocus
              disabled={isPending}
            />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Az indoklás bekerül az értesítésbe, amit a felhasználó kap. Pasztorális hangnemben
            fogalmazza meg.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="min-h-9"
          >
            Mégse
          </Button>
          <Button
            onClick={() => {
              if (ready) onConfirm(reason.trim())
            }}
            disabled={!ready || isPending}
            className="min-h-9 gap-2 bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
            Elutasítás
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
