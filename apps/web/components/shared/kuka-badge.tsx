'use client'

import Link from 'next/link'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'

import { getDb } from '@/lib/offline/db'
import {
  TABLE_REGISTRY,
  type ModuleKey,
} from '@/lib/offline/table-registry'

/**
 * Per-modul Kuka badge — egy kis link, ami megmutatja a modul Kuka
 * tartalmának elemszámát, és linkel a globális /kuka oldalra.
 *
 * Használat (pl. sirhely oldalon):
 *   <KukaBadge module="sirhely" />
 *
 * Ha a modul Kuka-ja üres, a badge el van rejtve.
 */
export function KukaBadge({
  module,
  variant = 'chip',
}: {
  module: ModuleKey
  variant?: 'chip' | 'button'
}) {
  // Ennek a modulnak a soft-delete táblái
  const softDeleteTables = TABLE_REGISTRY.filter(
    t => t.module === module && t.softDelete,
  ).map(t => t.dexieTable)

  const count = useLiveQuery(
    async () => {
      if (softDeleteTables.length === 0) return 0
      try {
        const db = getDb()
        let total = 0
        for (const tbl of softDeleteTables) {
          const rows = await db
            .table(tbl)
            .filter(r => {
              const rec = r as Record<string, unknown>
              return (
                (rec.deleted as boolean) === true ||
                (rec._pendingDelete as boolean) === true
              )
            })
            .count()
          total += rows
        }
        return total
      } catch {
        return 0
      }
    },
    [softDeleteTables.join(',')],
    0,
  )

  if (softDeleteTables.length === 0) return null
  if (count === 0) return null

  if (variant === 'button') {
    return (
      <Link
        href="/kuka"
        className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Kuka ({count})
      </Link>
    )
  }

  // Default chip
  return (
    <Link
      href="/kuka"
      className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-100"
    >
      <Trash2 className="h-3 w-3" />
      Kuka · {count}
    </Link>
  )
}
