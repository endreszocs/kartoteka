'use client'

import { CheckCircle2, Loader2, Send } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { contactSysadmin } from '@/app/(public)/hozzaferes-kerese/contact-actions'

interface ContactSysadminDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Előre kitöltött email-cím (a hozzáférés-kérelem űrlapjáról). */
  defaultEmail?: string
  /** Előre kitöltött név. */
  defaultName?: string
}

export function ContactSysadminDialog({
  open,
  onOpenChange,
  defaultEmail = '',
  defaultName = '',
}: ContactSysadminDialogProps) {
  const [pending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState(defaultEmail)
  const [name, setName] = useState(defaultName)
  const [message, setMessage] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await contactSysadmin({
        fromEmail: email.trim(),
        fromName: name.trim(),
        message: message.trim(),
      })
      if (res.success) {
        setSent(true)
        toast.success('Üzenetét sikeresen elküldtük a rendszergazdának.')
      } else {
        toast.error(res.error || 'Hiba történt az üzenet küldésekor.')
      }
    })
  }

  function handleClose() {
    onOpenChange(false)
    // Apró delay hogy ne ugorjon vissza átmenet közben
    setTimeout(() => {
      setSent(false)
      setMessage('')
    }, 200)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {sent ? 'Üzenet elküldve' : 'Kapcsolatfelvétel a rendszergazdával'}
          </DialogTitle>
          {!sent && (
            <DialogDescription>
              Írja le röviden, miben segíthet Önnek a rendszergazda. Az üzenet
              közvetlenül Szőcs Endre lelkipásztorhoz kerül.
            </DialogDescription>
          )}
        </DialogHeader>

        {sent ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="size-7 text-emerald-600" />
            </div>
            <p className="text-sm text-slate-700">
              Üzenetét megkapta a rendszergazda. Általában <strong>1-2 munkanap</strong> alatt válaszol
              közvetlenül a megadott email-címére.
            </p>
            <Button onClick={handleClose} className="mt-6">
              Bezárás
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="contact-name">
                Név <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pl. Kovács János"
                required
                minLength={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contact-email">
                Email <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pelda@gyulekezet.hu"
                required
              />
              <p className="text-xs text-muted-foreground">
                A rendszergazda erre az email-címre fog válaszolni.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contact-message">
                Üzenet <span className="text-rose-500">*</span>
              </Label>
              <textarea
                id="contact-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Pl. Nem kaptam meg a visszaigazoló emailt 10 perc után sem..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[120px] resize-y"
                required
                minLength={10}
                maxLength={5000}
              />
              <p className="text-xs text-muted-foreground">
                Min. 10 karakter, max. 5000.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={pending}>
                Mégse
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Send className="mr-2 size-4" />
                )}
                Üzenet küldése
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
