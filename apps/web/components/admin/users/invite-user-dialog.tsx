'use client'

/**
 * Meghívó-küldő dialógus (2026-08-09) — /admin/felhasznalok.
 *
 * Kétoszlopos, reszponzív elrendezés (Endre kérése): nagy képernyőn balra az
 * űrlap + a „mi történik ezután" lépések, jobbra a levél TELJES élő előnézete
 * (a megszólítás és a személyes üzenet gépelés közben frissül); mobilon a két
 * oszlop egymás alá kerül, egy görgethető felületen. A levél a fejlesztő-
 * lelkipásztor (Szőcs Endre) nevében szól, „Békesség Istentől!" köszöntéssel,
 * és emojikkal kategorizált rendszerbemutatót tartalmaz — az előnézet
 * ugyanabból a közös listából épül, mint maga az e-mail
 * (meghivo-shared.ts INVITE_FEATURE_CATEGORIES).
 */

import { useState, useTransition } from 'react'
import { Loader2, MailPlus, Send, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { sendKartotekaInvite } from '@/app/(dashboard)/admin/meghivo-actions'
import {
  INVITE_FEATURE_CATEGORIES,
  INVITE_MESSAGE_MAX,
  INVITE_NAME_MAX,
  isValidInviteEmail,
} from '@/app/(dashboard)/admin/meghivo-shared'

interface InviteUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STEPS: Array<{ title: string; desc: string }> = [
  {
    title: 'Meghívó e-mail érkezik',
    desc: 'A címzett szép, személyes levelet kap — „Békesség Istentől!" köszöntéssel, a rendszer részletes bemutatásával.',
  },
  {
    title: 'Hozzáférés-kérelem',
    desc: 'A gombbal a hivatalos regisztrációs oldalra jut, és kitölti a rövid kérelmet.',
  },
  {
    title: 'Jóváhagyás után belépés',
    desc: 'A kérelmet itt, a Felhasználók oldalon hagyja jóvá — utána a meghívott beléphet.',
  },
]

export function InviteUserDialog({ open, onOpenChange }: InviteUserDialogProps) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const emailTrimmed = email.trim()
  const emailValid = isValidInviteEmail(emailTrimmed)
  const showEmailError = emailTrimmed.length > 0 && !emailValid

  function reset() {
    setEmail('')
    setName('')
    setMessage('')
  }

  function handleSubmit() {
    if (!emailValid || isPending) return
    startTransition(async () => {
      const res = await sendKartotekaInvite({
        email: emailTrimmed,
        name: name.trim() || undefined,
        personalMessage: message.trim() || undefined,
      })
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success(`Meghívó elküldve: ${emailTrimmed}`, {
        description: 'A címzett a levélből a hozzáférés-kérelem oldalra jut.',
      })
      reset()
      onOpenChange(false)
    })
  }

  const greeting = name.trim() ? `Békesség Istentől, kedves ${name.trim()}!` : 'Békesség Istentől!'

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isPending) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="flex max-h-[92vh] w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl lg:max-w-5xl">
        {/* ── Fejléc ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-border px-5 pb-4 pt-5 sm:px-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8 font-heading text-lg text-foreground">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[var(--primary)]">
                <MailPlus className="size-5" />
              </span>
              Meghívó küldése a Kartotékába
            </DialogTitle>
            <DialogDescription className="text-left text-sm leading-relaxed text-muted-foreground">
              A levél Szőcs Endre barátosi lelkipásztor — a Kartotéka fejlesztője — nevében szól,
              és részletesen, lelkészbarát módon mutatja be a rendszert. Jobbra az élő előnézet.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* ── Törzs: mobilon egy görgethető oszlop, lg+ két külön görgethető oszlop ── */}
        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:overflow-hidden">
          {/* Bal: űrlap + lépések */}
          <div className="space-y-4 px-5 py-4 sm:px-6 lg:h-full lg:min-h-0 lg:overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email" className="text-xs font-medium text-muted-foreground">
                A meghívott e-mail-címe <span className="text-destructive">*</span>
              </Label>
              <Input
                id="invite-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pl. lelkesz@gyulekezet.ro"
                autoFocus
                disabled={isPending}
                aria-invalid={showEmailError}
              />
              {showEmailError && (
                <p className="text-xs text-destructive">
                  Az e-mail-cím formátuma nem tűnik érvényesnek.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-name" className="text-xs font-medium text-muted-foreground">
                A meghívott neve{' '}
                <span className="normal-case text-muted-foreground/70">(opcionális — a megszólításhoz)</span>
              </Label>
              <Input
                id="invite-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, INVITE_NAME_MAX))}
                placeholder="pl. Nagy Sándor"
                disabled={isPending}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="invite-message" className="text-xs font-medium text-muted-foreground">
                  Személyes üzenet <span className="normal-case text-muted-foreground/70">(opcionális)</span>
                </Label>
                <span className="text-[10px] tabular-nums text-muted-foreground/70">
                  {message.length}/{INVITE_MESSAGE_MAX}
                </span>
              </div>
              <Textarea
                id="invite-message"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, INVITE_MESSAGE_MAX))}
                placeholder="Pl.: Kedves Sándor, örülnénk, ha a gyülekezeti nyilvántartást mostantól te is a Kartotékában vezetnéd…"
                rows={4}
                className="resize-none"
                disabled={isPending}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Az üzenet idézetként jelenik meg a levélben — egy-két meleg mondat sokat számít.
              </p>
            </div>

            <div className="rounded-2xl bg-muted/60 p-3.5 ring-1 ring-border">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Mi történik ezután?
              </p>
              <ol className="space-y-2">
                {STEPS.map((s, i) => (
                  <li key={s.title} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-[var(--primary)]">
                      {i + 1}
                    </span>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <span className="font-semibold text-foreground">{s.title}</span> — {s.desc}
                    </p>
                  </li>
                ))}
              </ol>
            </div>

            {/* Mobilon az előnézet a lépések után következik (lg-n külön oszlop) */}
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:hidden">
              <Sparkles className="size-3.5" aria-hidden />
              Így fog kinézni a levél
            </p>
          </div>

          {/* Jobb: a levél TELJES élő előnézete (saját görgetéssel lg-n) */}
          <div className="border-t border-border bg-muted/40 px-5 py-4 sm:px-6 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
            <p className="mb-2 hidden items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:flex">
              <Sparkles className="size-3.5" aria-hidden />
              Élő levél-előnézet
            </p>
            {/* A minta a valódi e-mailt utánozza — az e-mail mindig világos,
                ezért itt szándékosan fix (nem téma-token) színek vannak. */}
            <div className="overflow-hidden rounded-2xl shadow-sm ring-1 ring-border">
              <div
                className="flex items-center gap-2.5 px-4 py-3"
                style={{ background: 'linear-gradient(135deg,#115e59 0%,#0f766e 55%,#14b8a6 100%)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/kartoteka-logo.png"
                  alt=""
                  className="size-8 shrink-0 rounded-lg bg-white/20 p-1"
                />
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/85">
                    Kartotéka rendszer
                  </p>
                  <p className="truncate font-serif text-sm font-semibold text-white">
                    Egyházi nyilvántartó
                  </p>
                </div>
              </div>
              <div className="space-y-3 bg-white px-4 py-4">
                <span className="inline-block rounded-full bg-teal-50 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-teal-900">
                  Személyes meghívó
                </span>
                <p className="font-serif text-base font-semibold leading-snug text-slate-900">
                  Szeretettel hívlak a Kartotékába
                </p>
                <p className="text-sm font-bold text-slate-900">{greeting}</p>
                <p className="text-xs leading-relaxed text-slate-600">
                  <span className="font-semibold text-slate-900">Szőcs Endre</span> vagyok, a barátosi
                  református gyülekezet lelkipásztora. A{' '}
                  <span className="font-semibold text-slate-900">Kartotéka</span> az én fejlesztésem:
                  lelkészként pontosan tudom, mennyi időt visznek el a nyilvántartások, a könyvelés
                  és a hivatalos nyomtatványok — ezért készítettem el ezt a rendszert, hogy mindez{' '}
                  <span className="font-semibold text-slate-900">egy helyen, egyszerűen és magyarul</span>{' '}
                  intézhető legyen. Szeretettel hívlak, hogy a gyülekezeted is használja!
                </p>
                {message.trim() && (
                  <div className="rounded-r-lg border-l-2 border-teal-700 bg-teal-50/70 px-3 py-2">
                    <p className="whitespace-pre-wrap text-xs italic leading-relaxed text-teal-950">
                      „{message.trim()}"
                    </p>
                  </div>
                )}

                <p className="pt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                  Mit tud a Kartotéka?
                </p>
                <div className="space-y-2.5">
                  {INVITE_FEATURE_CATEGORIES.map((c) => (
                    <div key={c.title}>
                      <p className="text-xs font-bold text-slate-900">
                        <span className="mr-1 text-sm">{c.emoji}</span> {c.title}
                      </p>
                      <ul className="mt-0.5 space-y-0.5 pl-4">
                        {c.items.map((item) => (
                          <li key={item} className="list-disc text-[11px] leading-relaxed text-slate-600 marker:text-teal-700">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                <div className="pt-1 text-center">
                  <span className="inline-block rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white shadow-sm">
                    Csatlakozom a Kartotékához →
                  </span>
                </div>

                <p className="text-xs leading-relaxed text-slate-600">
                  Áldás, békesség!
                  <br />
                  <span className="font-semibold text-slate-900">Szőcs Endre</span>
                  <br />
                  <span className="text-[11px] text-slate-500">
                    barátosi lelkipásztor, a Kartotéka fejlesztője
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Lábléc ──────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3 sm:px-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="min-h-10"
          >
            Mégse
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!emailValid || isPending}
            className="min-h-10 gap-2"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Meghívó küldése
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
