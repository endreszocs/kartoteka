'use client'

/**
 * CurrentYearFeeBanner — figyelmezteti a lelkészt, ha az aktuális évi
 * egyházfenntartási díj még nincs beállítva.
 *
 * Megjelenési feltétel:
 *   - `congregations.eves_jarulek` = 0 VAGY null
 *   - A `congregation_annual_fees` sem tartalmaz sort az aktuális évre
 *
 * A banner localStorage-es dismiss-t kap évente egyszer — legalább január 31-ig
 * újra megjelenik, aztán csak akkor, ha a user törli a dismiss-t.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface Props {
  /** Jelenleg beállított éves díj a congregations táblából */
  currentYearAmount: number | null
  /** Van-e az aktuális évre rekord a congregation_annual_fees-ben */
  hasAnnualFeeRow: boolean
}

export function CurrentYearFeeBanner({
  currentYearAmount,
  hasAnnualFeeRow,
}: Props) {
  const currentYear = new Date().getFullYear()
  const [dismissed, setDismissed] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Megjelenítési feltétel
  const needsSetting = (currentYearAmount ?? 0) <= 0 && !hasAnnualFeeRow

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true)
      const key = `fee-banner-dismissed-${currentYear}`
      setDismissed(localStorage.getItem(key) === '1')
    }, 0)
    return () => clearTimeout(timer)
  }, [currentYear])

  function handleDismiss() {
    const key = `fee-banner-dismissed-${currentYear}`
    localStorage.setItem(key, '1')
    setDismissed(true)
  }

  if (!mounted || !needsSetting || dismissed) return null

  return (
    <div className="relative overflow-hidden rounded-[1.5rem] border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-amber-50/90 to-orange-50 p-4 shadow-[0_18px_40px_-28px_rgba(245,158,11,0.4)]">
      <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-amber-300/30 blur-2xl" />
      <div className="absolute bottom-0 left-0 h-16 w-16 rounded-full bg-orange-300/20 blur-2xl" />

      <div className="relative flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
          <AlertTriangle className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700/90">
            Új év
          </p>
          <h3 className="mt-0.5 font-heading text-lg leading-tight text-amber-950 sm:text-xl">
            Állítsd be a {currentYear}-es egyházfenntartás díját!
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-amber-900/85">
            Az aktuális év díját még nem állítottad be. Amíg nincs érték, a rendszer nem tud
            tartozást számolni a tagoknak. Néhány kattintás, és kész.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                // Globális esemény → a DashboardShell elkapja és megnyitja a modalt
                window.dispatchEvent(new CustomEvent('kartoteka:open-congregation-dialog'))
              }}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Beállítom most
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="text-amber-800 hover:bg-amber-100"
            >
              Emlékeztess később
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded-full p-1.5 text-amber-700 hover:bg-amber-100"
          aria-label="Bezárás"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
