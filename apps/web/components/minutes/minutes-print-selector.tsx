'use client'

/**
 * Nyomtatási központ a jegyzőkönyvek főoldalán.
 * Kinyitható kártya — kiválasztható bármelyik mentett jegyzőkönyv, majd nyomtatási központ.
 */

import { useState, useCallback } from 'react'
import { Printer, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getMinutesById } from '@/app/(dashboard)/jegyzokonyvek/actions'
import { MinutesPrintDialog } from './minutes-print-dialog'
import { buildMinutesPrintHtml, type MinutesPrintData } from '@/lib/minutes/print'
import { toast } from 'sonner'

interface MinutesEntry {
  id: string
  ev: number
  ules_sorszam: number
  datum: string
  allapot: string
}

interface MinutesPrintSelectorProps {
  minutes: MinutesEntry[]
  congregationName: string
  /** Ha true, egy gombként jelenik meg (a hero sávban), nem kártyaként */
  inline?: boolean
}

export function MinutesPrintSelector({ minutes, congregationName, inline }: MinutesPrintSelectorProps) {
  const [expanded, setExpanded] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [printData, setPrintData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  async function handleSelect(id: string) {
    setLoading(id)
    const data = await getMinutesById(id)
    setLoading(null)
    if (!data) { toast.error('Nem sikerült betölteni.'); return }
    setPrintData(data)
    setPrintOpen(true)
  }

  // ⚠️ 2026-08-24 (biztonsági kör, B3 — tárolt XSS): a nyomtatvány HTML-je
  // a KÖZÖS `@/lib/minutes/print` modulban épül, ahol MINDEN felhasználói
  // mező escape-elődik. ⛔ Ide NE kerüljön vissza nyers sablon-interpoláció.
  const generatePrintHtml = useCallback(
    (type: string): string => {
      if (!printData) return '<p>Nincs adat.</p>'
      return buildMinutesPrintHtml(type, {
        ...(printData as unknown as MinutesPrintData),
        congregationName,
      })
    },
    [printData, congregationName],
  )

  const printableMinutes = minutes.filter((m) => m.allapot === 'veglegesitett' || m.allapot === 'hitelesitett')

  // Normál mód: ha nincs adat, nem jelenünk meg. Inline módban mindig megjelenünk.
  if (!inline && printableMinutes.length === 0 && minutes.length === 0) return null

  // ── Inline mód: gomb a hero sávban ──
  if (inline) {
    return (
      <>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-4 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
        >
          <Printer className="size-4" />
          Nyomtatási központ
        </button>

        {/* Jegyzőkönyv választó dialógus */}
        <Dialog open={expanded} onOpenChange={setExpanded}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nyomtatási központ</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-slate-500 -mt-2 mb-3">Válassz egy véglegesített jegyzőkönyvet</p>
            <div className="space-y-2 max-h-[60dvh] overflow-y-auto">
              {printableMinutes.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Nincs véglegesített jegyzőkönyv.</p>
              ) : (
                printableMinutes.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setExpanded(false); void handleSelect(m.id) }}
                    disabled={loading === m.id}
                    className="w-full flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-indigo-200 hover:bg-indigo-50/30 transition"
                  >
                    <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-bold shrink-0">
                      {m.ules_sorszam}.
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{m.ev}/{m.ules_sorszam}. gyűlés</p>
                      <p className="text-xs text-slate-400">{m.datum}</p>
                    </div>
                    <Badge className="bg-emerald-50 text-emerald-700 text-[10px] shrink-0">Végleges</Badge>
                  </button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        {printData && (
          <MinutesPrintDialog
            open={printOpen}
            onOpenChange={(open) => { setPrintOpen(open); if (!open) setPrintData(null) }}
            generateHtml={generatePrintHtml}
            year={new Date((printData as { datum: string }).datum).getFullYear()}
          />
        )}
      </>
    )
  }

  // ── Normál mód: teljes kártya ──
  return (
    <>
      {printData && (
        <MinutesPrintDialog
          open={printOpen}
          onOpenChange={(open) => { setPrintOpen(open); if (!open) setPrintData(null) }}
          generateHtml={generatePrintHtml}
          year={printData ? new Date((printData as { datum: string }).datum).getFullYear() : new Date().getFullYear()}
        />
      )}
    </>
  )
}
