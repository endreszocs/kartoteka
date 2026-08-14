'use client'

/**
 * Körzet-nyomtatási dialógus (2026-07-24, PR-10, 3. észrevétel).
 * Élő előnézet + két nézet: tömör névsor-táblázat VAGY családi (vizuális)
 * kártyás nézet; Direkt nyomtatás + PDF-mentés a bevált print-engine-nel.
 */

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getDistrictPrintData, type DistrictPrintData } from '@/app/(dashboard)/tagnyilvantartas/district-print-actions'
import { buildDistrictReport } from '@/lib/members/district-reporting'
import { printToBrowser } from '@/lib/utils/print-engine-v2'

interface DistrictPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  districtId: number | null
  districtName: string
}

export function DistrictPrintDialog({ open, onOpenChange, districtId, districtName }: DistrictPrintDialogProps) {
  const [data, setData] = useState<DistrictPrintData | null>(null)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'list' | 'visual'>('visual')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open || districtId == null) return
    let cancelled = false
    setLoading(true)
    setData(null)
    getDistrictPrintData(districtId)
      .then((result) => {
        if (cancelled) return
        setData(result)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setLoading(false)
        toast.error(e instanceof Error ? e.message : 'A körzet-névsor betöltése nem sikerült.')
      })
    return () => { cancelled = true }
  }, [open, districtId])

  const report = useMemo(() => (data ? buildDistrictReport(data, view) : null), [data, view])

  async function handlePrint() {
    if (!report) return
    setSending(true)
    try {
      await printToBrowser(report.html)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A nyomtatás nem sikerült.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96dvh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>&bdquo;{districtName}&rdquo; — körzeti névsor nyomtatása</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-3">
            {data && (
              <div className="card-raised space-y-1 p-4 text-sm">
                <p><strong>{data.stats.families}</strong> család · <strong>{data.stats.people}</strong> fő</p>
                <p className="text-xs text-muted-foreground">
                  Egyedülálló: {data.stats.standalone} (ebből özvegy {data.stats.widowed}, elvált {data.stats.divorced})
                </p>
              </div>
            )}

            <div className="card-raised space-y-2 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nézet</p>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name="district-view" checked={view === 'visual'} onChange={() => setView('visual')} />
                Családi (vizuális) — a családok kártyákon, tagokkal
              </label>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name="district-view" checked={view === 'list'} onChange={() => setView('list')} />
                Tömör névsor — A4 táblázat oldalszámokkal
              </label>
            </div>

            {/* 2026-07-25 (PR-15): PDF a böngésző beépített útján — Nyomtatás →
                Cél: „Mentés PDF-ként" (a raszteres mentés kivezetve). */}
            <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs leading-5 text-blue-900">
              <p className="font-semibold">💡 PDF-be mentés</p>
              <p className="mt-1">
                A <strong>Nyomtatás</strong> gomb után a <strong>Cél / Nyomtató</strong>{' '}
                listából válaszd a <strong>&bdquo;Mentés PDF-ként&rdquo;</strong> lehetőséget —
                így éles, kereshető szövegű PDF-et kapsz minden oldallal.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Button className="min-h-11 rounded-xl" onClick={() => void handlePrint()} disabled={!report || sending || loading}>
                {sending ? 'Nyomtatás…' : 'Nyomtatás / Mentés PDF-ként'}
              </Button>
              <Button variant="ghost" className="min-h-11 rounded-xl" onClick={() => onOpenChange(false)}>Bezárás</Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-[22px] border border-border bg-muted/40 p-2">
            {loading ? (
              <div className="flex h-[70dvh] items-center justify-center text-sm text-muted-foreground">Névsor betöltése…</div>
            ) : report ? (
              <iframe title={report.title} srcDoc={report.html} className="h-[70dvh] min-h-[500px] w-full rounded-[16px] bg-white" />
            ) : (
              <div className="flex h-[70dvh] items-center justify-center text-sm text-muted-foreground">Nincs megjeleníthető adat.</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
