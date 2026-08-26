'use client'

/**
 * Lapozható, az ablakhoz ILLESZTETT nyomtatási előnézet (2026-08-27).
 *
 * ⛔ MI VOLT A HIBA (Endre jelezte):
 *   „nem osztja fel az előnézet oldalakra és nem ad oldalszámot" +
 *   „az előnézetnél scrollolni kell, nem fit az ablakban".
 * A régi előnézet egyetlen `<iframe srcDoc>` volt, 1:1 méretben: a FEKVŐ
 * nyomtatvány (297 mm ≈ 1123 px) egy ~700 px-es oszlopba került, tehát
 * vízszintesen is görgetni kellett, és a dokumentum egyetlen, végtelen
 * „lapként" folyt.
 *
 * MEGOLDÁS: a dokumentum már valódi A4-es `.page` dobozokból áll
 * (lib/inventory/print-layout.ts). Itt EGYSZERRE EGY lapot mutatunk, az
 * elérhető helyre kicsinyítve — így egy teljes lap mindig kifér, és a lapok
 * között lapozni lehet.
 *
 * ⚠️ MIÉRT transform ÉS a wrapper KÉZI mérete: a CSS Transforms NEM változtatja
 * a layout-méretet — a szülő és a görgetősáv a skálázatlan méretet látja
 * (W3C CSSWG #23466). Ezért a burkoló dobozt MI méretezzük a skálázott
 * méretre. (A `zoom` is járható út, de az iframe belső dokumentumára is hatna,
 * és a nyomtatásnál külön vissza kellene állítani — a transform itt
 * kockázatmentesebb, mert a nyomtatás sosem ezt az elemet használja.)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** A4 méretek CSS-pixelben, 96 dpi mellett (a lap-magasság 296 mm-es ráhagyással). */
const LAP_PX = {
  portrait: { w: 794, h: 1119 },
  landscape: { w: 1123, h: 790 },
} as const

export function PrintPreviewFrame({
  html,
  orientation,
  lapszam,
  cim,
  szelektor = '.page',
}: {
  html: string
  orientation: 'portrait' | 'landscape'
  lapszam: number
  cim: string
  /** A lap-doboz CSS-szelektora (a fişă `.sheet`-et használ, a nyomtatványok `.page`-et). */
  szelektor?: string
}) {
  const kontenerRef = useRef<HTMLDivElement | null>(null)
  const [meret, setMeret] = useState({ w: 0, h: 0 })
  const [oldal, setOldal] = useState(1)

  const mer = useCallback(() => {
    const el = kontenerRef.current
    if (!el) return
    setMeret({ w: el.clientWidth, h: el.clientHeight })
  }, [])

  useEffect(() => {
    mer()
    const el = kontenerRef.current
    if (!el || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', mer)
      return () => window.removeEventListener('resize', mer)
    }
    const ro = new ResizeObserver(mer)
    ro.observe(el)
    return () => ro.disconnect()
  }, [mer])

  // A lapszám változhat (más nyomtatvány, más év) — a látható oldalt RENDER
  // közben szorítjuk a tartományba, nem effect-tel. (Az effect-es változat
  // fölösleges újrarenderelést és lint-figyelmeztetést okozott.)
  const osszesLap = Math.max(1, lapszam)
  const aktualisOldal = Math.min(Math.max(1, oldal), osszesLap)

  const lap = LAP_PX[orientation]
  const scale = meret.w > 0 && meret.h > 0 ? Math.min(1, meret.w / lap.w, meret.h / lap.h) : 0

  /**
   * Az előnézeti HTML: csak a KIVÁLASZTOTT lap látszik.
   *
   * A stílust a dokumentum végére fűzzük — a nyomtatásra és a PDF-re NEM hat,
   * mert azok az EREDETI `html`-t kapják (a dialógus a `report.html`-t adja
   * tovább), nem ezt az előnézeti változatot.
   */
  const elonezetHtml = beszurElonezetStilus(html, aktualisOldal, szelektor)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-1.5">
        <span className="truncate text-xs font-medium text-muted-foreground">{cim}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOldal(o => Math.max(1, Math.min(osszesLap, o) - 1))}
            disabled={aktualisOldal <= 1}
            aria-label="Előző oldal"
            className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-[4.5rem] text-center text-xs font-semibold tabular-nums text-foreground">
            {aktualisOldal} / {osszesLap} oldal
          </span>
          <button
            type="button"
            onClick={() => setOldal(o => Math.min(osszesLap, Math.max(1, o) + 1))}
            disabled={aktualisOldal >= osszesLap}
            aria-label="Következő oldal"
            className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:bg-muted disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div
        ref={kontenerRef}
        className="flex min-h-[320px] flex-1 items-start justify-center overflow-hidden rounded-2xl border border-border bg-muted/60 p-3"
      >
        {scale > 0 && (
          <div
            className="overflow-hidden rounded-lg bg-white shadow-md"
            style={{ width: lap.w * scale, height: lap.h * scale }}
          >
            <iframe
              title={`${cim} — ${aktualisOldal}. oldal`}
              srcDoc={elonezetHtml}
              // Mélységi védelem: az előnézet sosem hív print()-et és nem
              // olvassuk a contentDocument-jét — a repó máshol is így teszi.
              sandbox=""
              style={{
                width: lap.w,
                height: lap.h,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                border: 0,
                background: 'white',
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/** CSAK az előnézetre ható stílus: egyetlen lap, árnyék és háttér nélkül. */
function beszurElonezetStilus(html: string, oldal: number, szelektor: string): string {
  const stilus =
    '<style id="kartoteka-elonezet">' +
    'body{background:#fff !important;padding:0 !important;margin:0 !important}' +
    `${szelektor}{display:none !important;margin:0 !important;box-shadow:none !important}` +
    `${szelektor}:nth-of-type(${Math.max(1, oldal)}){display:block !important}` +
    '</style>'
  return html.includes('</head>') ? html.replace('</head>', `${stilus}</head>`) : `${stilus}${html}`
}
