'use client'

import { CalendarPlus, Printer } from 'lucide-react'

/**
 * Az éves program letöltése (2026-08-27).
 *
 * Endre kérése: „le is tölthető a teljes éves program".
 *
 * KÉT ÚT, MERT KÉT KÜLÖNBÖZŐ IGÉNY:
 *  · Nyomtatás / PDF — a hirdetőtáblára, a szórólapra, a presbiteri ülésre.
 *    A böngésző saját nyomtatási párbeszéde adja a PDF-et is („Mentés
 *    PDF-ként"), tehát nem kell PDF-motort behúzni egy PUBLIKUS oldalra —
 *    a látogatónak nem szabad megfizetnie a betöltését.
 *  · Naptár (.ics) — a telefon naptárába. Ez az, amit a gyülekezeti tag
 *    tényleg használ: felveszi az alkalmakat, és emlékeztet rájuk.
 *
 * A nyomtatás-gomb kliens-komponens (window.print), az .ics egy sima link —
 * így JS nélkül is működik.
 */
export function PublicProgramLetoltes({
  icsHref,
  ev,
}: {
  icsHref: string
  ev: number
}) {
  return (
    <div className="public-no-print flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => window.print()}
        className="public-btn public-btn-primary"
      >
        <Printer className="size-4" aria-hidden="true" />
        A(z) {ev}. évi program nyomtatása
      </button>
      <a href={icsHref} className="public-btn public-btn-outline" download>
        <CalendarPlus className="size-4" aria-hidden="true" />
        Naptárba (.ics)
      </a>
    </div>
  )
}
