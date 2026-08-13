'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Download, Printer, Sparkles, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ModalField } from '@/components/ui/modal-field'
import {
  generateNextIratszam,
  getAutoPlaceholderContext,
} from '@/app/(dashboard)/iktato/template-actions'
import {
  PLACEHOLDER_DOCS,
  buildAutoValues,
  extractPlaceholders,
  renderTemplate,
  type FilingTemplate,
} from '@/lib/filing/templates'
import { sanitizeFilingHtml } from '@/lib/public-site/sanitize'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'

interface FilingTemplateGeneratorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: FilingTemplate | null
}

/**
 * A template generator — a user kiválasztotta egy sablont, itt
 * kitölti a placeholdereket és letölti PDF-ként vagy nyomtatja.
 *
 * Az automatikus placeholderek (gyulekezet, lelkipasztor, iratszam,
 * datum, ev, helyseg) az oldal betöltésekor előtöltődnek.
 */
export function FilingTemplateGenerator({
  open,
  onOpenChange,
  template,
}: FilingTemplateGeneratorProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  // 2026-08-10 (K4 iktatószám-diagnosztika #3): a VÁRHATÓ szám csak HINT-ként
  // jelenik meg; a nyomtatványba nem sütjük bele (lásd az effektus doksiját).
  const [previewIratszam, setPreviewIratszam] = useState('')

  const placeholders = useMemo(
    () => (template ? extractPlaceholders(template.tartalom) : []),
    [template],
  )

  const autoKeys = useMemo(() => {
    const set = new Set<string>()
    for (const p of PLACEHOLDER_DOCS) if (p.auto) set.add(p.key)
    return set
  }, [])

  // Előtöltés: automatikus placeholderek
  useEffect(() => {
    if (!open || !template) return
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setValues({})
      void (async () => {
        const [ctxRes, iratszamRes] = await Promise.all([
          getAutoPlaceholderContext(),
          generateNextIratszam(new Date().getFullYear()),
        ])

        if (cancelled) return

        // 2026-08-10 (K4 iktatószám-diagnosztika #3): a sablon-generátor CSAK
        // nyomtat/PDF-be ment — NEM iktat. Korábban mégis beleírta a
        // nem-foglalt előnézeti számot a `{{iratszam}}` helyére, így a
        // kinyomtatott, hivatalos külsejű irat olyan számot viselt, amit a
        // rendszer később MÁSIK iratnak osztott ki (két dokumentum ugyanazzal
        // a hivatalos számmal). Mostantól kitöltő-vonal kerül a helyére — a
        // várható szám csak tájékoztató hintként látszik, és a mező kézzel
        // felülírható (ha a lelkész az iktatókönyvből tudja a valódi számot).
        const auto = buildAutoValues({
          gyulekezet: ctxRes.data?.gyulekezet,
          lelkipasztor: ctxRes.data?.lelkipasztor,
          helyseg: ctxRes.data?.helyseg,
          iratszam: '__________',
        })

        setPreviewIratszam(iratszamRes.iratszam || '')
        setValues(auto)
        setLoading(false)
      })()
    })

    return () => {
      cancelled = true
    }
  }, [open, template])

  if (!template) return null

  function setValue(key: string, v: string) {
    setValues(prev => ({ ...prev, [key]: v }))
  }

  function buildFullHtml(): string {
    const rendered = renderTemplate(template!.tartalom, values)
    return `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="utf-8" />
  <title>${template!.nev}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    body { margin: 0; background: #fff; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  ${rendered}
</body>
</html>`
  }

  function handleExportPdf() {
    startTransition(async () => {
      try {
        const html = buildFullHtml()
        const safeName = template!.nev.replaceAll(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ_ -]/g, '_')
        await printToPdf(html, `${safeName}.pdf`, { orientation: 'portrait' })
        toast.success('PDF letöltve.')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'A PDF exportálás sikertelen.')
      }
    })
  }

  function handlePrint() {
    startTransition(async () => {
      try {
        const html = buildFullHtml()
        await printToBrowser(html)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'A nyomtatás nem indítható.')
      }
    })
  }

  function getPlaceholderLabel(key: string): string {
    const doc = PLACEHOLDER_DOCS.find(p => p.key === key)
    return doc?.label || key
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 2026-08-11 (K5-#13): `showCloseButton={false}` — a DialogContent alapból
          renderel egy saját, 28px-es „Close" (angol!) bezáró gombot, ami a
          színes fejléc fölé csúszott, tehát a felhasználó KÉT bezáró gombot
          kapott, az egyiket angol névvel. Marad a fejléc saját gombja, immár
          44px-es koppintási felülettel és magyar aria-label-lel. */}
      <DialogContent showCloseButton={false} className="sm:max-w-4xl max-h-[92dvh] overflow-y-auto p-0">
        <DialogHeader className="flex flex-row items-center gap-3 border-b border-slate-100 bg-gradient-to-br from-indigo-500 to-violet-600 px-5 py-4 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <Wand2 className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <DialogTitle className="font-heading text-lg text-white">
              {template.nev}
            </DialogTitle>
            <p className="text-xs text-white/80">
              {template.leiras || 'Tölts ki minden mezőt, majd töltsd le vagy nyomtasd ki.'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 text-white hover:bg-white/20"
            onClick={() => onOpenChange(false)}
            title="Bezárás"
            aria-label={`${template.nev} sablon generálójának bezárása`}
          >
            <X className="h-5 w-5" />
          </Button>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,380px)_1fr]">
          {/* BAL: mezők */}
          <div className="border-b border-slate-100 bg-slate-50/40 p-5 lg:border-b-0 lg:border-r">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Sparkles className="h-6 w-6 animate-pulse text-indigo-500" />
              </div>
            ) : placeholders.length === 0 ? (
              <p className="py-6 text-center text-sm italic text-slate-400">
                Ebben a sablonban nincsenek placeholderek. Csak töltsd le vagy nyomtasd.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Placeholder értékek
                </p>
                {placeholders.map(key => {
                  const isAuto = autoKeys.has(key)
                  // 2026-08-10: az iratszám itt SZÁNDÉKOSAN kitöltő-vonal — ez a
                  // generátor nem iktat, tehát nem oszthat ki hivatalos számot.
                  const isIratszam = key === 'iratszam'
                  return (
                    <ModalField
                      key={key}
                      label={getPlaceholderLabel(key)}
                      hint={
                        isIratszam
                          ? 'Ez az ablak NEM iktat — a szám nincs lefoglalva'
                          : isAuto
                            ? 'Automatikusan előtöltve — szerkeszthető'
                            : undefined
                      }
                    >
                      <input
                        type="text"
                        value={values[key] || ''}
                        onChange={e => setValue(key, e.target.value)}
                        placeholder={isAuto ? '' : `(${key})`}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                      {isIratszam && (
                        <p className="mt-1 text-[11px] leading-snug text-amber-700">
                          {previewIratszam
                            ? `Várható szám a következő iktatáskor: ${previewIratszam}.`
                            : 'A várható számot nem sikerült lekérni.'}{' '}
                          Ez az ablak csak nyomtat/PDF-be ment — hivatalos iktatószámot az
                          „Igazolás / levél kiállítása” ablakban kap az irat. Csak akkor írj
                          ide számot, ha az irat MÁR szerepel az iktatókönyvben.
                        </p>
                      )}
                    </ModalField>
                  )
                })}
              </div>
            )}
          </div>

          {/* JOBB: előnézet */}
          <div className="p-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Élő előnézet
            </p>
            <div className="max-h-[65dvh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
              {/* DIAGNOSTICS P1-3b: a sablon-tartalom admin/lelkész által szerkesztett —
                  sanitizeFilingHtml-en keresztül, hogy script/iframe-injection ne menjen át.
                  A renderTemplate user-input értékeket már escape-eli, így a sanitize csak
                  a sablon-tartalmat (admin-szerkesztett) szűri. */}
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeFilingHtml(renderTemplate(template.tartalom, values)) }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Mégse
          </Button>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={handlePrint}
            disabled={isPending}
          >
            <Printer className="mr-1.5 h-4 w-4" />
            Nyomtatás
          </Button>
          <Button
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
            onClick={handleExportPdf}
            disabled={isPending}
          >
            <Download className="mr-1.5 h-4 w-4" />
            PDF letöltése
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
