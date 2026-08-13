'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setConfirmText('')
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8 font-heading text-lg text-foreground">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="size-5" />
            </span>
            Felhasználó törlése
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[65dvh] space-y-4 overflow-y-auto">
          <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            <p className="font-semibold">Ez a művelet visszafordíthatatlan!</p>
            <p className="mt-1">
              A felhasználó <strong>személyes adatai</strong> (név, email, telefon)
              véglegesen <strong>anonimizálódnak</strong>, és a <strong>belépése
              megszűnik</strong>. A kiosztott szerepkörök visszavonódnak.
            </p>
            <p className="mt-2">
              A <strong>gyülekezet adatai</strong> (tagok, pénzügy, anyakönyv) és a
              <strong> lelkészi szolgálati napló</strong> NEM törlődnek — a
              gyülekezetet más veszi át. A naplóban a korábbi szolgálat
              (a névvel) megmarad, lezárva.
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            Törlés után az <strong>email-cím felszabadul</strong> — ha hiba miatt
            kell, az illető <strong>újra regisztrálhat</strong> ugyanazzal a címmel.
          </div>
          <div className="rounded-xl bg-muted/60 p-3 text-sm ring-1 ring-border">
            <p className="font-semibold text-foreground">{userName || '(nincs név)'}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{userEmail}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="delete-confirm" className="text-xs font-medium text-muted-foreground">
              A megerősítéshez írja be: <strong className="text-foreground">TÖRLÉS</strong>
            </Label>
            <Input
              id="delete-confirm"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              autoFocus
              disabled={isPending}
            />
          </div>
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
              if (ready) onConfirm()
            }}
            disabled={!ready || isPending}
            className="min-h-9 gap-2 bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Végleges törlés
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
