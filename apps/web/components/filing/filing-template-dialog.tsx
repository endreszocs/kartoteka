'use client'

import { useEffect, useState, useTransition } from 'react'
import { FileText, Info, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ModalField } from '@/components/ui/modal-field'
import { Textarea } from '@/components/ui/textarea'
import { saveFilingTemplate } from '@/app/(dashboard)/iktato/template-actions'
import {
  PLACEHOLDER_DOCS,
  TEMPLATE_TYPES,
  TEMPLATE_TYPE_LABELS,
  extractPlaceholders,
  type FilingTemplate,
  type TemplateType,
} from '@/lib/filing/templates'

interface FilingTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existing?: FilingTemplate | null
  onSaved: () => void
}

export function FilingTemplateDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: FilingTemplateDialogProps) {
  const [nev, setNev] = useState('')
  const [tipus, setTipus] = useState<TemplateType>('igazolas')
  const [leiras, setLeiras] = useState('')
  const [tartalom, setTartalom] = useState('')
  const [aktiv, setAktiv] = useState(true)
  const [showHelp, setShowHelp] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setNev(existing?.nev || '')
      setTipus(existing?.tipus || 'igazolas')
      setLeiras(existing?.leiras || '')
      setTartalom(existing?.tartalom || '')
      setAktiv(existing?.aktiv ?? true)
      setShowHelp(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, existing])

  const detectedPlaceholders = extractPlaceholders(tartalom)

  function handleSubmit() {
    if (!nev.trim()) {
      toast.error('A sablon neve kötelező.')
      return
    }
    if (!tartalom.trim()) {
      toast.error('A sablon tartalma kötelező.')
      return
    }

    startTransition(async () => {
      const result = await saveFilingTemplate({
        id: existing?.id,
        nev: nev.trim(),
        tipus,
        leiras: leiras.trim() || null,
        tartalom,
        aktiv,
      })

      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }

      toast.success(existing ? 'Sablon módosítva.' : 'Sablon létrehozva.')
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 2026-08-11 (K5-#13): `showCloseButton={false}` — a DialogContent alapból
          renderel egy saját, 28px-es „Close" (angol!) bezáró gombot, ami a
          színes fejléc fölé csúszott, tehát a felhasználó KÉT bezáró gombot
          kapott, az egyiket angol névvel. Marad a fejléc saját gombja, immár
          44px-es koppintási felülettel és magyar aria-label-lel. */}
      <DialogContent showCloseButton={false} className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="flex flex-row items-center gap-3 border-b border-slate-100 bg-gradient-to-br from-teal-500 to-emerald-600 px-5 py-4 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <DialogTitle className="font-heading text-lg text-white">
              {existing ? 'Sablon szerkesztése' : 'Új sablon létrehozása'}
            </DialogTitle>
            <p className="text-xs text-white/80">
              HTML sablon placeholderekkel — pl. {'{{'}nev{'}}'}, {'{{'}datum{'}}'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 text-white hover:bg-white/20"
            onClick={() => onOpenChange(false)}
            title="Bezárás"
            aria-label={existing ? 'Sablon szerkesztésének bezárása' : 'Új sablon űrlapjának bezárása'}
          >
            <X className="h-5 w-5" />
          </Button>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ModalField label="Sablon neve" required>
              <input
                type="text"
                value={nev}
                onChange={e => setNev(e.target.value)}
                placeholder="Pl. Keresztelési igazolás"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
                maxLength={200}
              />
            </ModalField>

            <ModalField label="Típus" required>
              <select
                value={tipus}
                onChange={e => setTipus(e.target.value as TemplateType)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
              >
                {TEMPLATE_TYPES.map(t => (
                  <option key={t} value={t}>
                    {TEMPLATE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </ModalField>
          </div>

          <ModalField label="Leírás (opcionális)">
            <input
              type="text"
              value={leiras}
              onChange={e => setLeiras(e.target.value)}
              placeholder="Rövid leírás, mikor használható"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
              maxLength={500}
            />
          </ModalField>

          <ModalField
            label="Sablon tartalma (HTML)"
            required
            hint="Használj {{placeholderek}} a változó adatokhoz. Pl. {{nev}}, {{datum}}."
          >
            <Textarea
              value={tartalom}
              onChange={e => setTartalom(e.target.value)}
              rows={14}
              placeholder={'<p>Tisztelt {{nev}}!</p>\n<p>A {{datum}} napján...</p>'}
              className="font-mono text-xs"
            />
          </ModalField>

          {/* Placeholder segítség */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/60">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100/60"
              onClick={() => setShowHelp(s => !s)}
            >
              <span className="inline-flex items-center gap-2">
                <Info className="h-4 w-4 text-teal-600" />
                Elérhető placeholderek
              </span>
              <span className="text-xs text-slate-500">
                {showHelp ? 'Elrejt' : 'Mutat'}
              </span>
            </button>
            {showHelp && (
              <div className="border-t border-slate-200 bg-white p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PLACEHOLDER_DOCS.map(p => (
                    <div key={p.key} className="text-xs">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-800">
                        {'{{'}
                        {p.key}
                        {'}}'}
                      </code>
                      {p.auto && (
                        <span className="ml-1.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700">
                          Auto
                        </span>
                      )}
                      <span className="ml-2 text-slate-600">— {p.description}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Az <strong>Auto</strong> placeholderek automatikusan kitöltődnek generáláskor.
                  A többit a user tölti ki.
                </p>
              </div>
            )}
          </div>

          {/* Detektált placeholderek */}
          {detectedPlaceholders.length > 0 && (
            <div className="rounded-lg bg-teal-50/60 px-3 py-2 text-xs">
              <p className="mb-1 font-semibold text-teal-900">
                Sablonban talált placeholderek ({detectedPlaceholders.length}):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {detectedPlaceholders.map(key => (
                  <code
                    key={key}
                    className="rounded-full bg-white px-2 py-0.5 font-mono text-teal-800 ring-1 ring-teal-200"
                  >
                    {'{{'}
                    {key}
                    {'}}'}
                  </code>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={aktiv}
              onChange={e => setAktiv(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500"
            />
            Aktív sablon (megjelenik a generátorban)
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Mégse
          </Button>
          <Button
            className="rounded-xl bg-teal-600 hover:bg-teal-700"
            onClick={handleSubmit}
            disabled={isPending || !nev.trim() || !tartalom.trim()}
          >
            {isPending ? 'Mentés…' : existing ? 'Módosítás mentése' : 'Sablon létrehozása'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
