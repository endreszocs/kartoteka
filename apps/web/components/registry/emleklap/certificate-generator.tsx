'use client'

import { useMemo, useRef, useState } from 'react'
import { Printer, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  EMLEKLAP_TEMPLATES,
  EMLEKLAP_SAMPLE_DATA,
  type EmleklapTemplate,
  type EmleklapType,
} from '@/lib/constants/emleklap-templates'
import { CertificateRenderer } from './certificate-renderer'

/**
 * Emléklap-stúdió: a 6 sablon közül választás + adat-űrlap + élő előnézet +
 * print/PDF export.
 *
 * Használat az Anyakönyv modulból: a megfelelő sablon-típus (`kereszteles` /
 * `esketes` / `konfirmacio`) átadható, és a sablon adatai (pl. személy neve,
 * születési dátum) `initialData` propként előtöltődnek a anyakönyvi
 * bejegyzésből.
 */

interface CertificateGeneratorProps {
  /** Alapértelmezett típus (anyakönyvi bejegyzés alapján). */
  initialType?: EmleklapType
  /** Alapértelmezett variáns. */
  initialVariant?: 'erek' | 'kerek'
  /** Az anyakönyvi bejegyzésből származó adatok (a placeholder-helyettesítéshez). */
  initialData?: Record<string, string | undefined>
  /** Vissza-callback (pl. dialog bezárás). */
  onClose?: () => void
}

export function CertificateGenerator({
  initialType = 'kereszteles',
  initialVariant = 'erek',
  initialData,
  onClose,
}: CertificateGeneratorProps) {
  // Az aktív sablon a típus + variáns alapján
  const [selectedType, setSelectedType] = useState<EmleklapType>(initialType)
  const [selectedVariant, setSelectedVariant] = useState<'erek' | 'kerek'>(initialVariant)

  const activeTemplate: EmleklapTemplate = useMemo(() => {
    const id = `${selectedType === 'konfirmacio' ? 'konfirmacio' : selectedType}-${selectedVariant}`
    return EMLEKLAP_TEMPLATES.find((t) => t.id === id) ?? EMLEKLAP_TEMPLATES[0]
  }, [selectedType, selectedVariant])

  // Adat-state — az aktív sablon mezőinek megfelelő alapértékek + initialData
  const [data, setData] = useState<Record<string, string>>(() => {
    const fromSample = EMLEKLAP_SAMPLE_DATA[selectedType] ?? {}
    const merged: Record<string, string> = { ...fromSample }
    if (initialData) {
      for (const [k, v] of Object.entries(initialData)) {
        if (v != null) merged[k] = v
      }
    }
    return merged
  })

  function resetToSample() {
    const fromSample = EMLEKLAP_SAMPLE_DATA[selectedType] ?? {}
    setData({ ...fromSample })
  }

  // A sablon mezői által hivatkozott placeholder-kulcsok (egyedi, sorrendben)
  const placeholderKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const field of activeTemplate.fields) {
      const matches = field.defaultValue.matchAll(/\{\{(\w+)\}\}/g)
      for (const m of matches) keys.add(m[1])
    }
    return Array.from(keys)
  }, [activeTemplate])

  const printRef = useRef<HTMLDivElement>(null)

  function handlePrint() {
    // A renderert új ablakba másoljuk és kinyomtatjuk
    if (!printRef.current) return
    const html = printRef.current.outerHTML
    const win = window.open('', '_blank', 'width=900,height=1200')
    if (!win) {
      alert('A böngésző blokkolta a popup-ot. Engedélyezd a felugró ablakokat.')
      return
    }
    win.document.write(`<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>Emléklap nyomtatás</title>
      <style>
        @page { size: A4 portrait; margin: 0; }
        html, body { margin: 0; padding: 0; background: white; }
        body { display: flex; align-items: center; justify-content: center; }
        .certificate-renderer { width: 210mm !important; height: 297mm !important; max-width: 210mm !important; aspect-ratio: 210/297 !important; }
        .certificate-renderer img { width: 100% !important; height: 100% !important; }
        @media print {
          html, body { width: 210mm; height: 297mm; }
          .certificate-renderer { box-shadow: none !important; }
        }
      </style>
    </head><body>${html}<script>window.onload = () => { setTimeout(() => window.print(), 200); };</script></body></html>`)
    win.document.close()
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
      {/* ─── Bal panel: szerkesztő űrlap ─── */}
      <aside className="card-raised p-4 lg:max-h-[80vh] lg:overflow-y-auto">
        <h3 className="font-heading text-lg text-slate-800">Emléklap szerkesztő</h3>

        {/* Sablon-választó */}
        <div className="mt-4 space-y-3">
          <div>
            <Label className="text-xs">Sablon típusa</Label>
            <select
              value={selectedType}
              onChange={(e) => {
                const next = e.target.value as EmleklapType
                setSelectedType(next)
                // Adatokat újratöltjük az új típus mintájával
                const fromSample = EMLEKLAP_SAMPLE_DATA[next] ?? {}
                setData({ ...fromSample })
              }}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="kereszteles">Keresztelői emléklap</option>
              <option value="esketes">Házasságkötési emléklap</option>
              <option value="konfirmacio">Konfirmációi emléklap</option>
            </select>
          </div>

          <div>
            <Label className="text-xs">Egyházkerület-variáns</Label>
            <div className="mt-1 flex gap-2">
              <Button
                type="button"
                variant={selectedVariant === 'erek' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setSelectedVariant('erek')}
              >
                EREK
              </Button>
              <Button
                type="button"
                variant={selectedVariant === 'kerek' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setSelectedVariant('kerek')}
              >
                KEREK
              </Button>
            </div>
          </div>
        </div>

        {/* Placeholder-mezők */}
        <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Változó adatok
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={resetToSample} className="h-7 px-2 text-xs">
              <RotateCcw className="size-3 mr-1" />
              Minta-adatok
            </Button>
          </div>
          {placeholderKeys.length === 0 ? (
            <p className="text-xs text-slate-500">A sablon nem tartalmaz placeholder-mezőket.</p>
          ) : (
            placeholderKeys.map((key) => (
              <div key={key}>
                <Label className="text-xs" htmlFor={`f-${key}`}>{key}</Label>
                <Input
                  id={`f-${key}`}
                  value={data[key] ?? ''}
                  onChange={(e) => setData({ ...data, [key]: e.target.value })}
                  placeholder={`{{${key}}}`}
                  className="mt-1 h-8 text-sm"
                />
              </div>
            ))
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2 border-t border-slate-200 pt-4">
          <Button type="button" onClick={handlePrint} className="bg-teal-600 hover:bg-teal-700">
            <Printer className="size-4 mr-1.5" />
            Nyomtatás / PDF-export
          </Button>
          {onClose && (
            <Button type="button" variant="outline" onClick={onClose}>
              Bezárás
            </Button>
          )}
        </div>
      </aside>

      {/* ─── Jobb panel: élő előnézet ─── */}
      <main className="flex flex-col items-center justify-start gap-3">
        <p className="text-xs text-slate-500">Élő előnézet — a változó adatok azonnal frissülnek</p>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-inner">
          <CertificateRenderer
            ref={printRef}
            template={activeTemplate}
            data={data}
            previewWidth={520}
          />
        </div>
        <p className="text-xs text-slate-400">
          A4 álló · {activeTemplate.fields.length} szövegréteg
        </p>
      </main>
    </div>
  )
}
