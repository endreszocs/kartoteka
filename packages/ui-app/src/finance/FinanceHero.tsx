'use client'

/**
 * FinanceHero — a Pénzügy oldal fejléce (web ⇄ desktop KÖZÖS, 2026-06-10 B-hullám).
 *
 * Pixel-forrás: a web `finance-tabs.tsx` inline hero markupja (card-raised +
 * gradient-blobok + cím + chip-sor + akció-gombok). A web és a desktop egyaránt
 * ezt rendereli → azonos komponens = azonos megjelenés.
 *
 * Adatfogadás props-on (nincs server-action, nincs hook): a chipeket és az
 * akció-gombokat a hívó tölti. Az akciók opcionálisak — ahol egy platform még
 * nem támogat egy műveletet (pl. desktop read-only fázisban), egyszerűen nem
 * adja át az adott callbacket, és a gomb nem jelenik meg.
 */

import type { ReactNode } from 'react'
import { Building2, CalendarRange, Wallet, ShieldCheck, Printer } from 'lucide-react'

export interface FinanceHeroProps {
  congregationName: string
  currentYear: number
  /** Tartozásszámítási mód címke (pl. „akkori évi járulék"). */
  debtModeLabel?: string | null
  isGodMode?: boolean
  /** Tetszőleges extra chip (pl. web OblioStatusChip). */
  extraChips?: ReactNode
  /** Akció-gombok — csak a megadottak jelennek meg. */
  onAddEntry?: () => void
  onDecont?: () => void
  onDispozitie?: () => void
  onPrint?: () => void
  /** Tetszőleges extra akció a gomb-sorban. */
  extraActions?: ReactNode
}

export function FinanceHero({
  congregationName,
  currentYear,
  debtModeLabel,
  isGodMode = false,
  extraChips,
  onAddEntry,
  onDecont,
  onDispozitie,
  onPrint,
  extraActions,
}: FinanceHeroProps) {
  return (
    <div className="card-raised relative mb-4 overflow-hidden p-5 sm:p-6">
      <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-amber-200/35 blur-3xl" />
      <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-teal-200/30 blur-3xl" />

      <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">Pénzügy</p>
          <h2 className="font-heading text-3xl text-slate-800">Áttekintés és költségvetés</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            A bevételek, kiadások, kassza, bank és éves számadás egy helyen, áttekinthetően és barátságosan kezelhető.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
              <Building2 className="size-3.5 text-teal-600" />
              {congregationName}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm">
              <CalendarRange className="size-3.5" />
              {currentYear}. költségvetési év
            </span>
            {debtModeLabel && (
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 shadow-sm">
                <Wallet className="size-3.5" />
                Tartozásszámítás: {debtModeLabel}
              </span>
            )}
            {extraChips}
            {isGodMode && (
              <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600 shadow-sm">
                <ShieldCheck className="size-3.5" />
                Rendszergazdai mód aktív
              </span>
            )}
          </div>
        </div>

        {(onAddEntry || onDecont || onDispozitie || onPrint || extraActions) && (
          <div className="flex flex-wrap gap-2">
            {onAddEntry && (
              <button
                type="button"
                className="rounded-xl bg-teal-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-teal-700"
                onClick={onAddEntry}
              >
                + Tétel rögzítése
              </button>
            )}
            {onDecont && (
              <button
                type="button"
                className="rounded-xl border border-violet-200 px-3 py-1.5 text-sm font-medium text-violet-700 transition hover:bg-violet-50"
                onClick={onDecont}
              >
                Decont
              </button>
            )}
            {onDispozitie && (
              <button
                type="button"
                className="rounded-xl border border-amber-200 px-3 py-1.5 text-sm font-medium text-amber-700 transition hover:bg-amber-50"
                onClick={onDispozitie}
              >
                Dispoziție
              </button>
            )}
            {onPrint && (
              <button
                type="button"
                className="inline-flex items-center rounded-xl border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
                onClick={onPrint}
              >
                <Printer className="mr-1 size-3.5" />
                Nyomtatási központ
              </button>
            )}
            {extraActions}
          </div>
        )}
      </div>
    </div>
  )
}
