'use client'

/**
 * Pénzügy Súgó PDF-könyvtár.
 *
 * 3 letölthető referenciadokumentum:
 *   1. Pénzügyi gyorsreferencia
 *   2. Nyugtatömb kezelés gyakorlati útmutató
 *   3. Év végi zárás checklist
 *
 * A PDF-ek a kliens oldalon generálódnak dinamikusan (print-engine-v2) —
 * nincs szükség Supabase Storage-ra, mindig a legfrissebb tartalmat adjuk.
 */

import { useState } from 'react'
import { Download, FileText, Loader2, Printer } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { GUIDE_PDFS, buildGuidePdfHtml, type GuidePdf } from '@/lib/finance/guide-pdfs'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'

const ICONS: Record<GuidePdf['id'], string> = {
  gyorsreferencia: '📋',
  nyugtatomb: '🧾',
  evvegi: '✅',
}

const TONES: Record<GuidePdf['id'], string> = {
  gyorsreferencia: 'from-blue-500 to-indigo-600',
  nyugtatomb: 'from-emerald-500 to-teal-600',
  evvegi: 'from-amber-500 to-orange-600',
}

export function FinancePdfLibrary() {
  const [busyId, setBusyId] = useState<string | null>(null)

  async function handleDownload(pdf: GuidePdf) {
    setBusyId(`${pdf.id}-pdf`)
    try {
      const html = buildGuidePdfHtml(pdf.id)
      await printToPdf(html, pdf.filename, {
        orientation: 'portrait',
        margin: [15, 15],
        format: 'a4',
      })
      toast.success(`${pdf.title} letöltve.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A PDF mentése nem sikerült.')
    } finally {
      setBusyId(null)
    }
  }

  async function handlePreview(pdf: GuidePdf) {
    setBusyId(`${pdf.id}-preview`)
    try {
      const html = buildGuidePdfHtml(pdf.id)
      await printToBrowser(html)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A nyomtatás nem sikerült.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="card-raised p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-sm shrink-0">
          <FileText className="size-5 text-white" />
        </div>
        <div>
          <h3 className="font-heading text-xl text-slate-800">
            Letölthető PDF referenciák
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Nyomtasd ki és tartsd a kezed alatt. Mindig a legfrissebb verzió
            generálódik — a rendszer frissítésével együtt változik.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {GUIDE_PDFS.map((pdf) => {
          const gradient = TONES[pdf.id]
          const icon = ICONS[pdf.id]
          const pdfBusy = busyId === `${pdf.id}-pdf`
          const previewBusy = busyId === `${pdf.id}-preview`
          return (
            <div
              key={pdf.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-md transition-shadow flex flex-col"
            >
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-xl mb-2 shadow-sm`}>
                <span>{icon}</span>
              </div>
              <h4 className="font-heading text-base text-slate-800 leading-tight">
                {pdf.title}
              </h4>
              <p className="text-xs font-medium text-teal-700 mt-0.5">
                {pdf.subtitle}
              </p>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed flex-1">
                {pdf.description}
              </p>

              <div className="mt-3 flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 rounded-xl text-xs"
                  onClick={() => void handlePreview(pdf)}
                  disabled={previewBusy || pdfBusy}
                >
                  {previewBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <>
                      <Printer className="mr-1 size-3.5" />
                      Nyomtatás
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  className="flex-1 rounded-xl text-xs bg-teal-600 text-white hover:bg-teal-700"
                  onClick={() => void handleDownload(pdf)}
                  disabled={pdfBusy || previewBusy}
                >
                  {pdfBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <>
                      <Download className="mr-1 size-3.5" />
                      PDF
                    </>
                  )}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
