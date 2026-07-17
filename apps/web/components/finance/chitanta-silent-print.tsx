'use client'

/**
 * Chitanță nyomtatási ELŐNÉZET (2026-07-17, F2 — Q3 user-döntés).
 *
 * Korábban „csendes" nyomtatás volt (kattintás → azonnal window.print), de:
 *   1. a globális prezentációs print-CSS miatt ÜRES LAPOT adott (F2-1 P0 —
 *      a kartoteka.css scope-olásával javítva),
 *   2. a „— másolat —" vízjel feltétel nélkül minden nyomatra rákerült,
 *   3. a címer-kép betöltését semmi nem várta meg (időzítési verseny).
 *
 * Az új viselkedés (Q3): kattintásra ELŐNÉZET nyílik a nyugtáról,
 *   - a „— másolat —" vízjel alapból RAJTA van, de egy kis X-szel levehető,
 *   - a háttér-címer egyházkerület-függő (EREK/KEREK — a sablon dönt),
 *   - a Nyomtatás gombra indul a tényleges window.print() (addigra a képek
 *     garantáltan betöltődtek, mert az előnézetben látszanak).
 *
 * A panel `createPortal`-lal közvetlenül a document.body alá kerül, és a
 * print-CSS a saját wrapper-eiről minden transformot/vágást/pozicionálást
 * levesz — így a sablon `position:absolute; top:0` print-elhelyezését semmi
 * nem torzítja (ez volt a régi reprint-dialógus hibaosztálya).
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { toast } from 'sonner'
import { getChitantaForPrint } from '@/app/(dashboard)/penzugy/chitanta-actions'
import type { ChitantaPrintData } from '@kartoteka/validations'
import { Button } from '@/components/ui/button'
import { ChitantaPrintTemplate } from '@/components/finance/chitanta-print-template'

interface Props {
  /** A nyomtatandó chitanță ID. Null = nincs előnézet. */
  chitantaId: string | null
  /** Az előnézet bezárásakor hívjuk (a parent reset-eli a chitantaId-t). */
  onDone: () => void
}

export function ChitantaSilentPrint({ chitantaId, onDone }: Props) {
  const [data, setData] = useState<ChitantaPrintData | null>(null)
  // Q3: a vízjel alapból BE — az X-szel az adott nyomtatásra levehető.
  const [copyWatermark, setCopyWatermark] = useState(true)
  // A szülő minden renderén új onDone-referencia jön — a ref-guard nélkül a
  // fetch feleslegesen újrafutna ugyanarra a chitantaId-ra.
  const fetchedIdRef = useRef<string | null>(null)

  // Adat fetch, amikor új chitantaId érkezik
  useEffect(() => {
    if (!chitantaId) {
      setData(null)
      fetchedIdRef.current = null
      return
    }
    if (fetchedIdRef.current === chitantaId) return
    fetchedIdRef.current = chitantaId
    setCopyWatermark(true)
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

  if (!data || !chitantaId || typeof document === 'undefined') return null

  return createPortal(
    <div className="chitanta-preview-overlay fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Print alatt a saját wrappereink nem vághatnak/transzformálhatnak —
          a sablon body*{visibility:hidden} + absolute top:0 trükkje így torzítás
          nélkül érvényesül. A vezérlősor a .chitanta-no-print osztállyal tűnik el. */}
      <style jsx global>{`
        @media print {
          .chitanta-preview-overlay,
          .chitanta-preview-panel,
          .chitanta-preview-scroll,
          .chitanta-preview-scale {
            position: static !important;
            transform: none !important;
            overflow: visible !important;
            max-height: none !important;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            background: transparent !important;
            inset: auto !important;
          }
          .chitanta-preview-backdrop {
            display: none !important;
          }
        }
      `}</style>

      <div
        className="chitanta-preview-backdrop absolute inset-0 bg-slate-900/50"
        onClick={onDone}
        aria-hidden
      />

      <div className="chitanta-preview-panel relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Vezérlősor — nyomtatásban nem látszik */}
        <div className="chitanta-no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">
              Nyugta nyomtatása — Seria {data.sorozat} nr. {data.nyomdaiSzam ?? data.szam}
            </span>
            {copyWatermark ? (
              <button
                type="button"
                onClick={() => setCopyWatermark(false)}
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-200"
                title="A „— másolat —” jelölés levétele erről a nyomtatásról"
              >
                — másolat — vízjel
                <X className="size-3" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCopyWatermark(true)}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-200"
                title="A „— másolat —” jelölés visszatétele"
              >
                vízjel visszakapcsolása
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="mr-2 size-4" />
              Nyomtatás
            </Button>
            <Button variant="outline" size="sm" onClick={onDone}>
              Bezárás
            </Button>
          </div>
        </div>

        {/* Előnézet — kicsinyítve, görgethetően; printben a resetek érvényesülnek */}
        <div className="chitanta-preview-scroll flex-1 overflow-auto bg-slate-100 p-4">
          <div
            className="chitanta-preview-scale mx-auto w-fit origin-top bg-white shadow-md"
            style={{ transform: 'scale(0.82)' }}
          >
            <ChitantaPrintTemplate data={data} copyWatermark={copyWatermark} dualMode />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
