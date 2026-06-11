/**
 * DesktopStornoConfirmDialog — a megosztott `CashbookTab.stornoConfirmDialogSlot`
 * desktop megvalósítása (C-hullám C1b).
 *
 * A `befizetes-page` / `kiadas-page` inline sztornó-paneljének logikáját hozza a
 * Kassza-fülre: kötelező indoklás (≥5 karakter) → `stornoIncomeUseCase` /
 * `stornoExpenseUseCase` (a desktop SAJÁT, bevált sztornó-útja, a kapcsolt
 * chitanták és a belső mozgás párja kaszkád-sztornójával). A sikeres sztornó
 * után az `onStornoed` callback frissíti a Kassza-listát.
 */

import { useState } from 'react'
import { AlertCircle, Ban } from 'lucide-react'

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from '@kartoteka/ui'
import { stornoExpenseUseCase, stornoIncomeUseCase } from '@kartoteka/core'

import { errorMessage } from '../lib/error'
import { enqueueStornoReversal } from '../lib/excel-enqueue'
import { getDesktopSupabase } from '../lib/supabase'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: 'befizetes' | 'kiadas'
  id: number | null
  summary?: string
  isInternalTransfer?: boolean
  onStornoed: () => void | Promise<void>
  congregationId: string
  userId: string
}

export function DesktopStornoConfirmDialog({
  open,
  onOpenChange,
  type,
  id,
  summary,
  isInternalTransfer,
  onStornoed,
  congregationId,
  userId,
}: Props) {
  const [indok, setIndok] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setIndok('')
    setError(null)
  }

  async function handleSubmit() {
    setError(null)
    if (indok.trim().length < 5) {
      setError('A sztornó indoklás legalább 5 karakter legyen.')
      return
    }
    if (id == null) {
      setError('Hiányzó azonosító — a sor nem sztornózható.')
      return
    }
    setSubmitting(true)
    try {
      const supabase = getDesktopSupabase()
      const result =
        type === 'befizetes'
          ? await stornoIncomeUseCase(
              { congregationId, befizetesId: id, indok: indok.trim() },
              { supabase, runtime: 'desktop', userId },
            )
          : await stornoExpenseUseCase(
              { congregationId, kiadasId: id, indok: indok.trim() },
              { supabase, runtime: 'desktop', userId },
            )
      if (!result.success) {
        setError(result.error)
        return
      }
      // E3: ha a tétel az Excel-útvonalon volt, ellenelőjeles SZTORNÓ tükör-sor
      // kerül a várólistára (append-only — a hivatalos könyv nettóz, az audit-
      // nyom megmarad). No-throw helper, a sztornó sikerét nem érinti.
      void enqueueStornoReversal({
        type,
        serverId: id,
        congregationId,
        indok: indok.trim(),
      })
      await onStornoed()
      reset()
      onOpenChange(false)
    } catch (err) {
      setError(`Sztornó-hiba: ${errorMessage(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Ban className="size-4 text-red-600" />
            {type === 'befizetes' ? 'Befizetés' : 'Kiadás'} sztornózása
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {summary && (
            <p className="rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
              {summary}
            </p>
          )}
          <p className="text-xs italic text-slate-500">
            A sztornózott tétel nem törlődik — áthúzva, indoklással marad a nyilvántartásban.
            {isInternalTransfer
              ? ' A belső mozgás párja is sztornózódik.'
              : ' A kapcsolt nyugták (ha vannak) automatikusan sztornózódnak.'}
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="storno-indok" className="text-xs">
              Indoklás (legalább 5 karakter) *
            </Label>
            <Input
              id="storno-indok"
              maxLength={500}
              value={indok}
              onChange={(e) => setIndok(e.currentTarget.value)}
              disabled={submitting}
              placeholder="Pl. Tévesen rögzítettem."
            />
          </div>

          {error && (
            <p className="text-xs text-rose-700">
              <AlertCircle className="mr-1 inline-block size-3.5" />
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Mégse
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {submitting ? 'Sztornózás…' : 'Sztornó jóváhagyása'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
