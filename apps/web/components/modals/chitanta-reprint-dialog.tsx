'use client'

/**
 * Chitanță (papír nyugta) újranyomtatási dialog.
 *
 * Egy meglévő chitanță utólagos újranyomtatására szolgál — pl. ha a
 * felhasználó elveszítette az eredetit, vagy másolatot kell készíteni.
 * A megjelenített nyugtán „MÁSOLAT" vízjel látszik.
 */

import { useEffect, useState } from 'react'
import { Loader2, Printer } from 'lucide-react'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getChitantaForPrint } from '@/app/(dashboard)/penzugy/chitanta-actions'
import type { ChitantaPrintData } from '@kartoteka/validations'
import { ChitantaPrintTemplate } from '@/components/finance/chitanta-print-template'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  chitantaId: string | null
}

export function ChitantaReprintDialog({ open, onOpenChange, chitantaId }: Props) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ChitantaPrintData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !chitantaId) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setData(null)
      setError(null)
      getChitantaForPrint(chitantaId)
        .then((res) => {
          if (cancelled) return
          if (res.error) setError(res.error)
          else if (res.data) setData(res.data)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })
    return () => { cancelled = true }
  }, [open, chitantaId])

  function handlePrint() {
    window.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[calc(100%-1.5rem)] sm:w-full
          sm:max-w-2xl md:max-w-3xl
          max-h-[90vh] overflow-y-auto
          border border-amber-200 bg-gradient-to-br from-white via-white to-amber-50/30
          p-0 gap-0 rounded-2xl
        "
      >
        <DialogHeader className="border-b border-amber-100 bg-white/70 px-6 py-5 sm:px-8 sm:py-6 rounded-t-2xl chitanta-no-print">
          <DialogTitle className="font-heading text-xl sm:text-2xl text-slate-800 flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-sm">
              <Printer className="size-5" />
            </span>
            Nyugta újranyomtatás
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            A nyugtán &bdquo;MÁSOLAT&rdquo; vízjel jelzi, hogy ez nem az eredeti nyomtatás.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 sm:px-8 sm:py-6 space-y-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-8">
              <Loader2 className="size-4 animate-spin" /> Nyugta betöltése…
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 chitanta-no-print">
              {error}
            </div>
          )}

          {data && (
            <>
              {/* A5 méretű DUAL layout — két nyugta egymás alatt szaggatott
                  vágóvonallal. Egyik az átvevőnek, másik az irattárba. */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <ChitantaPrintTemplate data={data} copyWatermark dualMode />
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 chitanta-no-print">
                <Button
                  className="rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                  onClick={handlePrint}
                >
                  <Printer className="mr-1.5 size-4" /> Nyomtatás
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
                  Bezárás
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
