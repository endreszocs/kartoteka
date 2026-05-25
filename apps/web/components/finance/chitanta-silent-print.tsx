'use client'

/**
 * Csendes (dialog nélküli) chitanță nyomtatás.
 *
 * A kassza táblában a már kiállított nyugta sorában egy kattintásra
 * indul a nyomtatás — nincs közbeiktatott előnézet dialog.
 *
 * Hogyan:
 *   1. A parent komponens beállítja a `chitantaId`-t
 *   2. Ez a komponens fetcheli az adatot
 *   3. Rendereli a nyomtatási sablont egy láthatatlan div-ben
 *   4. Kiváltja a `window.print()`-et
 *   5. A nyomtatás után visszahívja az `onDone`-t
 *
 * A nyomtatási sablon `@media print` CSS-e gondoskodik arról, hogy
 * csak a sablon látszódjon (a UI többi része el van rejtve).
 */

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { getChitantaForPrint } from '@/app/(dashboard)/penzugy/chitanta-actions'
import type { ChitantaPrintData } from '@kartoteka/validations'
import { ChitantaPrintTemplate } from '@/components/finance/chitanta-print-template'

interface Props {
  /** A nyomtatandó chitanță ID. Null = nincs nyomtatás. */
  chitantaId: string | null
  /** A nyomtatás befejeztekor hívjuk (a parent reset-eli a chitantaId-t). */
  onDone: () => void
}

export function ChitantaSilentPrint({ chitantaId, onDone }: Props) {
  const [data, setData] = useState<ChitantaPrintData | null>(null)
  const hasPrintedRef = useRef<string | null>(null)

  // 1) Adat fetch, amikor új chitantaId érkezik
  useEffect(() => {
    if (!chitantaId) {
      setData(null)
      hasPrintedRef.current = null
      return
    }
    // Megelőzzük a duplikált nyomtatást ugyanazon chitantaId-ra
    if (hasPrintedRef.current === chitantaId) return

    let cancelled = false
    getChitantaForPrint(chitantaId)
      .then((res) => {
        if (cancelled) return
        if (res.error) {
          toast.error(`Nyugta betöltése sikertelen: ${res.error}`)
          onDone()
          return
        }
        if (res.data) setData(res.data)
      })
      .catch((e) => {
        if (cancelled) return
        toast.error(`Hiba: ${e instanceof Error ? e.message : String(e)}`)
        onDone()
      })
    return () => {
      cancelled = true
    }
  }, [chitantaId, onDone])

  // 2) Amikor az adat megérkezett, DOM frissül → egy frame-et várunk és nyomtatunk
  useEffect(() => {
    if (!data || !chitantaId) return
    if (hasPrintedRef.current === chitantaId) return
    hasPrintedRef.current = chitantaId

    // requestAnimationFrame-re várunk, hogy a React renderelje a sablont
    const raf = requestAnimationFrame(() => {
      // Még egy timeout, hogy a CSS (különösen a @media print) biztosan be legyen töltve
      setTimeout(() => {
        try {
          window.print()
        } catch (e) {
          toast.error(`Nyomtatás sikertelen: ${e instanceof Error ? e.message : String(e)}`)
        } finally {
          // Kis késleltetéssel reset-eljük az állapotot, hogy a print dialog
          // bezárása után is vizuálisan stabil legyen
          setTimeout(() => {
            setData(null)
            onDone()
          }, 500)
        }
      }, 80)
    })

    return () => cancelAnimationFrame(raf)
  }, [data, chitantaId, onDone])

  if (!data) return null

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none chitanta-silent-print-wrapper">
      {/* A sablon már self-contained print CSS-sel rendelkezik — csak akkor
          látszik papíron, amikor window.print() meghívódik. */}
      <ChitantaPrintTemplate data={data} copyWatermark dualMode />
    </div>
  )
}
