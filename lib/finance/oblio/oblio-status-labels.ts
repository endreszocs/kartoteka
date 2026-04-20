/**
 * Oblio e-Factura státusz → magyar UI címke és szín mapper.
 *
 * Az Oblio API hivatalos státuszai ROMÁN szavak — ezeket fordítjuk
 * magyar címkére és színre a UI megjelenítéshez.
 */

import type { OblioEinvoiceStatus } from './oblio-types'

export type OblioStatusVisual = {
  label: string
  description: string
  colorClass: string // Tailwind osztály szint-alapú színezéshez
  badgeClass: string // Tailwind badge-szerű kinézethez
}

const STATUS_MAP: Record<OblioEinvoiceStatus, OblioStatusVisual> = {
  nepreluat: {
    label: 'Még nincs SPV-re küldve',
    description:
      'A számla kiállítva az Oblio-ban, de még nem került az ANAF e-Factura rendszerébe. Rövidesen automatikusan feltöltődik.',
    colorClass: 'text-slate-500',
    badgeClass: 'bg-slate-100 text-slate-700',
  },
  in_prelucrare: {
    label: 'SPV-n, feldolgozás alatt',
    description:
      'A számla feltöltve az ANAF SPV rendszerbe. Feldolgozás alatt, rövidesen visszaigazolás vagy elutasítás.',
    colorClass: 'text-amber-600',
    badgeClass: 'bg-amber-100 text-amber-800',
  },
  ok: {
    label: 'SPV-n elfogadva',
    description: 'Az ANAF e-Factura SPV elfogadta a számlát. Véglegesen feldolgozott.',
    colorClass: 'text-emerald-600',
    badgeClass: 'bg-emerald-100 text-emerald-800',
  },
  nok: {
    label: 'SPV visszautasította',
    description:
      'Az ANAF e-Factura SPV visszautasította a számlát (pl. hibás CUI vagy formátum). Javítás szükséges.',
    colorClass: 'text-red-600',
    badgeClass: 'bg-red-100 text-red-800',
  },
}

const NOT_APPLICABLE: OblioStatusVisual = {
  label: 'Nem érvényes',
  description: 'Papír chitanță típus — nem megy SPV-re.',
  colorClass: 'text-slate-400',
  badgeClass: 'bg-slate-100 text-slate-500',
}

/**
 * Egy Oblio státuszhoz visszaadja a magyar címkét és színt.
 */
export function getOblioStatusVisual(status: string | null | undefined): OblioStatusVisual {
  if (!status || status === 'not_applicable') return NOT_APPLICABLE
  if (status in STATUS_MAP) return STATUS_MAP[status as OblioEinvoiceStatus]
  // Ismeretlen státusz — alapértelmezés
  return {
    label: status,
    description: `Ismeretlen állapot: ${status}`,
    colorClass: 'text-slate-500',
    badgeClass: 'bg-slate-100 text-slate-600',
  }
}
