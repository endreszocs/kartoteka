'use client'

/**
 * Kiadás-soros Oblio SPV státusz ikon — a Tranzakciók fülön a kiadásoknál
 * jelzi, hogy a kifizetéshez tartozik-e SPV-be feltöltött e-Factura.
 *
 * Adatforrás: a parent komponens átadja a `matched: boolean` értéket
 * (a teljes `oblio_kiadas_match` listából előre kiszámolva).
 *
 * Színek/ikonok:
 *   - 🟢 ✓ Match van: hover „SPV-ben rendben" + kattintás → kiadás részletei
 *   - 🟡 ! Nincs match: hover „SPV-ben nincs — figyelem!" — figyelmezteti a lelkészt
 *   - ⚪ ? Még nem ellenőrizve: hover „Frissítsd az Oblio mappát"
 *
 * A fő cél: a lelkész a kifizetés ELŐTT lássa, ha SPV-ben nincs számla.
 */

import { CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react'

type Props = {
  /** A kiadás párosítva van-e SPV-ben levő számlához (DB-ben). */
  matched: boolean
  /** Még nem futott le a scan ebben a session-ben — ne vészjelezzünk. */
  notYetScanned?: boolean
  /** Kattintás akció (pl. „menj a Oblio ellenőrzés fülre"). */
  onClick?: () => void
}

export function OblioExpenseStatusIcon({ matched, notYetScanned, onClick }: Props) {
  if (notYetScanned) {
    return (
      <span
        className="inline-flex size-5 items-center justify-center text-slate-300"
        title="Az Oblio mappa még nincs frissítve — Pénzügy → Oblio ellenőrzés fülön kattints a Frissítés gombra"
      >
        <HelpCircle className="size-4" />
      </span>
    )
  }

  if (matched) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex size-5 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 transition-colors"
        title="SPV-ben rendben — kapcsolódó e-Factura megtalálva"
      >
        <CheckCircle2 className="size-4" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex size-5 items-center justify-center rounded-full text-amber-600 hover:bg-amber-100 hover:text-amber-700 transition-colors"
      title="Figyelem: SPV-ben NINCS e-Factura ehhez a kifizetéshez. Ellenőrizd, hogy a beszállító feltöltötte-e!"
    >
      <AlertCircle className="size-4" />
    </button>
  )
}
