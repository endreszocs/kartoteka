'use client'

/**
 * Pénzügyi adatok csatolása egy jegyzőkönyvi ponthoz.
 * Számadás, költségvetés vagy vagyonleltári összesítő beágyazása.
 */

import { useState, useTransition } from 'react'
import { BarChart3, Wallet, Package, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getFinancialSummaryForAttachment } from '@/app/(dashboard)/jegyzokonyvek/actions'
import { toast } from 'sonner'

type AttachmentType = 'szamadas' | 'koltsegvetes' | 'vagyonleltar'

interface FinancialAttachmentProps {
  year: number
  onInsert: (html: string) => void
  disabled?: boolean
}

const OPTIONS: Array<{ type: AttachmentType; label: string; icon: typeof BarChart3; color: string }> = [
  { type: 'szamadas', label: 'Számadás', icon: BarChart3, color: 'text-blue-600 bg-blue-50' },
  { type: 'koltsegvetes', label: 'Költségvetés', icon: Wallet, color: 'text-amber-600 bg-amber-50' },
  { type: 'vagyonleltar', label: 'Vagyonleltár', icon: Package, color: 'text-teal-600 bg-teal-50' },
]

function fmtNum(n: number): string {
  return n.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function FinancialAttachment({ year, onInsert, disabled }: FinancialAttachmentProps) {
  const [expanded, setExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [inserted, setInserted] = useState<Set<AttachmentType>>(new Set())

  function handleAttach(type: AttachmentType) {
    startTransition(async () => {
      const data = await getFinancialSummaryForAttachment(year)
      if (!data) { toast.error('Nem sikerült betölteni az adatokat.'); return }

      let html = ''

      if (type === 'szamadas' && data.szamadas) {
        const { totalIncome, totalExpense, balance } = data.szamadas
        const barWidth = (val: number, max: number) => max > 0 ? Math.round((val / max) * 100) : 0
        const maxVal = Math.max(totalIncome, totalExpense)

        html = `\n\n━━━ ${year}. évi SZÁMADÁS összesítő ━━━\n` +
          `Bevételek összesen: ${fmtNum(totalIncome)} RON\n` +
          `Kiadások összesen: ${fmtNum(totalExpense)} RON\n` +
          `Egyenleg: ${fmtNum(balance)} RON\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`

      } else if (type === 'koltsegvetes' && data.koltsegvetes) {
        const { totalIncome, totalExpense, balance } = data.koltsegvetes
        html = `\n\n━━━ ${year}. évi KÖLTSÉGVETÉS összesítő ━━━\n` +
          `Tervezett bevétel: ${fmtNum(totalIncome)} RON\n` +
          `Tervezett kiadás: ${fmtNum(totalExpense)} RON\n` +
          `Tervezett egyenleg: ${fmtNum(balance)} RON\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`

      } else if (type === 'vagyonleltar' && data.vagyonleltar) {
        const { itemCount, totalValue, categories } = data.vagyonleltar as { itemCount: number; totalValue: number; categories?: Array<{ name: string; count: number; value: number }> }
        let catLines = ''
        if (categories && categories.length > 0) {
          catLines = categories.map((c) => `  ${c.name}: ${c.count} db — ${fmtNum(c.value)} RON`).join('\n')
        }
        html = `\n\n━━━ ${year}. évi VAGYONLELTÁRI összesítő ━━━\n` +
          `Leltári tételek száma: ${itemCount} db\n` +
          `Összes leltári érték: ${fmtNum(totalValue)} RON\n` +
          (catLines ? `\nKategóriánkénti bontás:\n${catLines}\n` : '') +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
      }

      if (html) {
        onInsert(html)
        setInserted((prev) => new Set(prev).add(type))
        toast.success(`${OPTIONS.find((o) => o.type === type)?.label} adatok beillesztve!`)
      }
    })
  }

  if (disabled) return null

  return (
    <div className="mt-2">
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition"
        >
          + Pénzügyi adatok csatolása
        </button>
      ) : (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-3">
          <p className="text-xs font-semibold text-indigo-700 mb-2">Pénzügyi összesítő beillesztése ({year}. év):</p>
          <div className="flex flex-wrap gap-2">
            {OPTIONS.map((opt) => {
              const Icon = opt.icon
              const isInserted = inserted.has(opt.type)
              return (
                <Button
                  key={opt.type}
                  size="sm"
                  variant="outline"
                  className={`rounded-xl text-xs ${isInserted ? 'border-emerald-200 text-emerald-700' : ''}`}
                  onClick={() => handleAttach(opt.type)}
                  disabled={isPending}
                >
                  {isPending ? <Loader2 className="size-3 mr-1 animate-spin" /> : isInserted ? <Check className="size-3 mr-1" /> : <Icon className="size-3 mr-1" />}
                  {opt.label}
                </Button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
