'use client'

/**
 * Hozzáférés-kérő űrlap (publikus, anon elérhető) — M0.2.
 *
 * Szerver action: `submitAccessRequest()` — rate-limit + INSERT + emailek.
 * UX:
 *   - Visszacsatolás in-place (toast + sikeres/hibás üzenet)
 *   - Sikeres beküldés után köszönőoldal inline
 *   - Kötelező mezők: email, teljes név, szerepkör. Opcionális: gyülekezet, telefon, indoklás
 */

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Send, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  submitAccessRequest,
  type AccessRequestRole,
} from '@/app/(public)/hozzaferes-kerese/actions'

const ROLES: { value: AccessRequestRole; label: string; description: string }[] = [
  { value: 'lelkesz', label: 'Lelkész', description: 'Gyülekezet vezető lelkésze' },
  { value: 'esperes', label: 'Esperes', description: 'Egyházmegye elöljárója' },
  { value: 'egyhazmegyei_admin', label: 'Egyházmegyei admin', description: 'Egyházmegyei hivatalvezető' },
  { value: 'egyhazkeruleti_admin', label: 'Egyházkerületi admin', description: 'EREK hivatalvezető' },
  { value: 'konyvelo', label: 'Könyvelő', description: 'Gyülekezeti/egyházmegyei könyvelő' },
  { value: 'egyhazmegyei_szamvevo', label: 'Egyházmegyei számvevő', description: 'Egyházmegyei pénzügyi ellenőr' },
]

export function AccessRequestForm() {
  const [isPending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState('')

  const [form, setForm] = useState({
    email: '',
    full_name: '',
    requested_role: 'lelkesz' as AccessRequestRole,
    congregation_slug: '',
    phone: '',
    justification: '',
    referrer: '',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await submitAccessRequest({
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        requested_role: form.requested_role,
        congregation_slug: form.congregation_slug.trim() || undefined,
        phone: form.phone.trim() || undefined,
        justification: form.justification.trim() || undefined,
        referrer: form.referrer.trim() || undefined,
      })

      if (res.success) {
        setSubmittedEmail(form.email.trim())
        setSubmitted(true)
        toast.success('Kérelmét rögzítettük — email-t kapott.')
      } else if (res.rateLimited) {
        toast.error(res.error || 'Túl sok kérelem ebből az eszközből.')
      } else {
        toast.error(res.error || 'Hiba történt a kérelem rögzítése során.')
      }
    })
  }

  if (submitted) {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="size-7 text-emerald-600" />
        </div>
        <h2 className="font-heading text-2xl font-bold text-slate-900">Kérelmét rögzítettük</h2>
        <p className="mt-3 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
          Visszaigazoló emailt küldtünk a{' '}
          <strong className="text-slate-900">{submittedEmail}</strong> címre. A rendszergazda
          rövidesen átnézi a kérelmét — általában <strong>1-3 munkanap</strong> alatt válaszolunk.
        </p>
        <div className="mt-6 rounded-xl bg-amber-50/60 p-4 ring-1 ring-amber-200/60 max-w-md mx-auto text-left">
          <p className="text-[13px] text-amber-900/80 leading-relaxed">
            <strong>Nem kapja meg az emailt?</strong> Ellenőrizze a spam mappát is. Ha 10 percen
            belül sem érkezik meg, kérjük lépjen kapcsolatba az egyházkerületi hivatallal.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ar-name">
            Teljes név <span className="text-rose-500">*</span>
          </Label>
          <Input
            id="ar-name"
            required
            minLength={3}
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="pl. Szőcs Endre"
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ar-email">
            Email-cím <span className="text-rose-500">*</span>
          </Label>
          <Input
            id="ar-email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="pl. lelkesz@example.com"
            disabled={isPending}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>
          Szerepkör <span className="text-rose-500">*</span>
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ROLES.map((r) => {
            const isActive = form.requested_role === r.value
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setForm({ ...form, requested_role: r.value })}
                disabled={isPending}
                className={`rounded-xl border-2 px-3 py-2 text-left transition ${
                  isActive
                    ? 'border-teal-500 bg-teal-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className={`text-sm font-semibold ${isActive ? 'text-teal-900' : 'text-slate-800'}`}>
                  {r.label}
                </p>
                <p className={`mt-0.5 text-[11px] ${isActive ? 'text-teal-700/80' : 'text-slate-500'}`}>
                  {r.description}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ar-congregation">Gyülekezet</Label>
          <Input
            id="ar-congregation"
            value={form.congregation_slug}
            onChange={(e) => setForm({ ...form, congregation_slug: e.target.value })}
            placeholder="pl. Kolozsvár-Belváros"
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ar-phone">Telefonszám (opcionális)</Label>
          <Input
            id="ar-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="pl. +40 720 123 456"
            disabled={isPending}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ar-justification">Rövid indoklás (opcionális)</Label>
        <textarea
          id="ar-justification"
          rows={3}
          value={form.justification}
          onChange={(e) => setForm({ ...form, justification: e.target.value })}
          placeholder="Pl. A gyülekezet új lelkésze vagyok, a nyilvántartáshoz szeretnék hozzáférést."
          disabled={isPending}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ar-referrer">Honnan hallott rólunk? (opcionális)</Label>
        <Input
          id="ar-referrer"
          value={form.referrer}
          onChange={(e) => setForm({ ...form, referrer: e.target.value })}
          placeholder="Pl. esperesi körlevél, kollégám ajánlása"
          disabled={isPending}
        />
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          A kérelem rögzítésével Ön elfogadja, hogy az EREK a megadott adatait a jóváhagyás
          céljából kezelje (GDPR-alap: jogos érdek).
        </p>
        <Button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-teal-600 text-white hover:bg-teal-700 gap-1.5 shrink-0"
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Küldés…
            </>
          ) : (
            <>
              <Send className="size-4" />
              Kérelem elküldése
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
