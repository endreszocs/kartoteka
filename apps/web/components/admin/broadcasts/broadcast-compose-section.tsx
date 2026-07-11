'use client'

/**
 * Új üzenet írása — kézi körüzenet a felhasználóknak.
 *
 * 2026-07-11 admin-redesign: saját, izolált célzás-állapot (nem közös a
 * changelog-szekcióval); token-színek; mobil-first űrlap; a „Mégse" csak
 * ezt az űrlapot üríti.
 *
 * 2026-07-11 olvashatósági kör: a külső kártya-héjat a BroadcastSectionCard
 * adja; az űrlap három, jól elkülönülő lépésre tagolódik (tartalom →
 * címzettek → küldés módja), minden mező felett látható címkével.
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
    <div className="space-y-5">
      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
        Saját, egyedi üzenet a felhasználóknak (pl. jogszabályi változás, fontos hír). Add meg a
        tartalmat, válaszd ki a címzetteket, és küldd ki.
      </p>

      {/* 1. Az üzenet tartalma */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Az üzenet tartalma
        </legend>
        <div className="space-y-1.5">
          <Label htmlFor="compose-cim">Cím</Label>
          <Input
            id="compose-cim"
            value={cim}
            onChange={(e) => setCim(e.target.value)}
            placeholder="Pl.: Új funkció: automata számla-párosítás"
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="compose-uzenet">Üzenet</Label>
          <Textarea
            id="compose-uzenet"
            value={uzenet}
            onChange={(e) => setUzenet(e.target.value)}
            placeholder="A részletes üzenet szövege…"
            rows={5}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="compose-tipus">Típus</Label>
            <select
              id="compose-tipus"
              value={tipus}
              onChange={(e) => setTipus(e.target.value as BroadcastTipus)}
              className="min-h-11 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground"
            >
              {(Object.keys(BROADCAST_TIPUS_LABELS) as BroadcastTipus[]).map((t) => (
                <option key={t} value={t}>
                  {BROADCAST_TIPUS_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="compose-hivatkozas">
              Hivatkozás{' '}
              <span className="font-normal text-muted-foreground">(opcionális)</span>
            </Label>
            <Input
              id="compose-hivatkozas"
              value={hivatkozas}
              onChange={(e) => setHivatkozas(e.target.value)}
              placeholder="pl. /penzugy"
            />
            <p className="text-xs text-muted-foreground">
              App-on belüli útvonal (/penzugy) vagy https:// link.
            </p>
          </div>
        </div>
      </fieldset>

      {/* 2. Címzettek */}
      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="sr-only">Címzettek</legend>
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
      </fieldset>

      {/* 3. Küldés módja + gombok */}
      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="sr-only">Küldés módja</legend>
        <EmailOptIn checked={sendEmail} onChange={setSendEmail} />
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Button variant="outline" onClick={resetForm} disabled={isPending} className="min-h-9">
            Űrlap törlése
          </Button>
          <Button
            onClick={handleSend}
            disabled={isPending || !cim.trim() || !uzenet.trim() || incompleteTarget}
            className="min-h-9 gap-2"
          >
            <Send className="size-4" aria-hidden />
            Elküldés
          </Button>
        </div>
      </fieldset>
    </div>
  )
}
