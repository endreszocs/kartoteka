'use client'

/**
 * Új üzenet írása — kézi körüzenet a felhasználóknak.
 *
 * 2026-07-11 admin-redesign: saját, izolált célzás-állapot (nem közös a
 * changelog-szekcióval); token-színek; mobil-first űrlap; a „Mégse" csak
 * ezt az űrlapot üríti.
 */

import { useState, useTransition } from 'react'
import { Send } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { sendBroadcast } from '@/app/(dashboard)/admin/broadcasts-actions'
import {
  BROADCAST_TIPUS_LABELS,
  type BroadcastComposeInput,
  type BroadcastTipus,
} from '@/lib/broadcasts/types'

import {
  DEFAULT_TARGET,
  TargetPicker,
  targetIsIncomplete,
  targetToActionArgs,
  type CongLite,
  type DioceseLite,
  type DistrictLite,
  type TargetSelection,
} from './broadcast-target-picker'
import { EmailOptIn } from './email-opt-in'

export function BroadcastComposeSection({
  congregations,
  dioceses,
  districts,
  onSent,
}: {
  congregations: CongLite[]
  dioceses: DioceseLite[]
  districts: DistrictLite[]
  onSent: () => void
}) {
  const [isPending, startTransition] = useTransition()

  const [cim, setCim] = useState('')
  const [uzenet, setUzenet] = useState('')
  const [tipus, setTipus] = useState<BroadcastTipus>('info')
  const [hivatkozas, setHivatkozas] = useState('')
  const [target, setTarget] = useState<TargetSelection>(DEFAULT_TARGET)
  const [sendEmail, setSendEmail] = useState(false)

  const incompleteTarget = targetIsIncomplete(target)

  function resetForm() {
    setCim('')
    setUzenet('')
    setTipus('info')
    setHivatkozas('')
    setTarget(DEFAULT_TARGET)
    setSendEmail(false)
  }

  function handleSend() {
    const input: BroadcastComposeInput = {
      cim,
      uzenet,
      tipus,
      hivatkozas: hivatkozas.trim() || null,
      ...targetToActionArgs(target),
      sendEmail,
    }
    startTransition(async () => {
      const result = await sendBroadcast(input)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`Üzenet elküldve ${result.recipientCount} címzettnek.`)
      resetForm()
      onSent()
    })
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-4 sm:px-5">
        <Send className="size-4 text-primary" aria-hidden />
        <h3 className="font-heading text-base text-foreground">Új üzenet a felhasználóknak</h3>
      </header>
      <div className="space-y-4 p-4 sm:p-5">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Saját, egyedi üzenet a felhasználóknak (pl. jogszabályi változás, fontos hír). Add meg a
          tartalmat, válaszd ki a címzetteket, és küldd ki.
        </p>

        <div className="space-y-4">
          <div>
            <Label htmlFor="compose-cim">Cím</Label>
            <Input
              id="compose-cim"
              value={cim}
              onChange={(e) => setCim(e.target.value)}
              placeholder="Pl.: Új funkció: automata számla-párosítás"
              maxLength={120}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="compose-uzenet">Üzenet</Label>
            <Textarea
              id="compose-uzenet"
              value={uzenet}
              onChange={(e) => setUzenet(e.target.value)}
              placeholder="A részletes üzenet szövege…"
              rows={5}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="compose-tipus">Típus</Label>
              <select
                id="compose-tipus"
                value={tipus}
                onChange={(e) => setTipus(e.target.value as BroadcastTipus)}
                className="mt-1 min-h-11 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground"
              >
                {(Object.keys(BROADCAST_TIPUS_LABELS) as BroadcastTipus[]).map((t) => (
                  <option key={t} value={t}>
                    {BROADCAST_TIPUS_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="compose-hivatkozas">
                Hivatkozás{' '}
                <span className="font-normal text-muted-foreground">(opcionális)</span>
              </Label>
              <Input
                id="compose-hivatkozas"
                value={hivatkozas}
                onChange={(e) => setHivatkozas(e.target.value)}
                placeholder="pl. /penzugy"
                className="mt-1"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                App-on belüli útvonal (/penzugy) vagy https:// link.
              </p>
            </div>
          </div>
          <EmailOptIn checked={sendEmail} onChange={setSendEmail} />
        </div>

        <TargetPicker
          value={target}
          onChange={setTarget}
          congregations={congregations}
          dioceses={dioceses}
          districts={districts}
        />

        {incompleteTarget && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            A kiválasztott címzés-módhoz még nincs kijelölt elem — a küldés addig nem indítható.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={resetForm} disabled={isPending}>
            Űrlap törlése
          </Button>
          <Button
            onClick={handleSend}
            disabled={isPending || !cim.trim() || !uzenet.trim() || incompleteTarget}
            className="gap-2"
          >
            <Send className="size-4" aria-hidden />
            Elküldés
          </Button>
        </div>
      </div>
    </section>
  )
}
