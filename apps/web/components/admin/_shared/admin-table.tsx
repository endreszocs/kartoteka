import type { ReactNode } from 'react'

import { AdminSkeleton } from './admin-skeleton'
import { cn } from '@/lib/utils'

export interface AdminTableColumn {
  key: string
  label: ReactNode
  /** Extra osztály a th/td cellákra (pl. szélesség, tabular-nums) */
  className?: string
  /** A megadott töréspont ALATT az oszlop rejtett (táblázat-nézetben) */
  hideBelow?: 'sm' | 'md' | 'lg'
  align?: 'left' | 'right' | 'center'
}

const HIDE_CLASSES: Record<NonNullable<AdminTableColumn['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
}

const ALIGN_CLASSES: Record<NonNullable<AdminTableColumn['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

interface AdminTableProps<Row> {
  columns: AdminTableColumn[]
  rows: Row[]
  rowKey: (row: Row) => string
  renderCell: (row: Row, columnKey: string) => ReactNode
  /**
   * Mobil kártya-nézet (md alatt) — ha megadod, a táblázat md alatt eltűnik,
   * és soronként ez a kártya renderelődik. Enélkül a táblázat mobilon
   * vízszintesen görgethető marad.
   */
  renderMobileCard?: (row: Row) => ReactNode
  /** Üres állapot — tipikusan <AdminEmptyState/> */
  empty: ReactNode
  loading?: boolean
  skeletonRows?: number
  /** A görgethető táblázat minimális szélessége (pl. 'min-w-[640px]') */
  minWidthClass?: string
  onRowClick?: (row: Row) => void
  className?: string
}

/**
 * Reszponzív admin-adattáblázat (2026-07-11 redesign).
 *
 * Desktopon: egységes fejléc (uppercase, muted), zebra-sorok, hover.
 * Mobilon: `renderMobileCard`-dal kártya-lista, anélkül görgethető táblázat.
 * A betöltés (kt-skeleton) és az üres állapot egy helyen kezelt, így a
 * korábbi fájlonként eltérő <table>-minták kiválthatók.
 */
export function AdminTable<Row>({
  columns,
  rows,
  rowKey,
  renderCell,
  renderMobileCard,
  empty,
  loading = false,
  skeletonRows = 5,
  minWidthClass,
  onRowClick,
  className,
}: AdminTableProps<Row>) {
  if (loading) return <AdminSkeleton rows={skeletonRows} className="py-2" />
  if (rows.length === 0) return <>{empty}</>

  const table = (
    <div className={cn('overflow-x-auto rounded-xl ring-1 ring-border', renderMobileCard && 'hidden md:block')}>
      <table className={cn('w-full border-collapse text-sm', minWidthClass)}>
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground first:pl-4 last:pr-4',
                  col.hideBelow && HIDE_CLASSES[col.hideBelow],
                  col.align && ALIGN_CLASSES[col.align],
                  col.className,
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={cn(
                'border-b border-border/60 last:border-b-0 odd:bg-transparent even:bg-muted/30 hover:bg-muted/50',
                onRowClick && 'cursor-pointer',
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-3 py-2.5 align-middle text-foreground first:pl-4 last:pr-4',
                    col.hideBelow && HIDE_CLASSES[col.hideBelow],
                    col.align && ALIGN_CLASSES[col.align],
                    col.className,
                  )}
                >
                  {renderCell(row, col.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  if (!renderMobileCard) return table

  return (
    <div className={className}>
      {table}
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)}>{renderMobileCard(row)}</li>
        ))}
      </ul>
    </div>
  )
}
