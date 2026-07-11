'use client'

/**
 * Betöltés-állapot a Felhasználók oldalhoz (2026-07-11 redesign).
 *
 * A közös AdminSkeleton (kt-skeleton) csíkjaira épül, de a rács-nézet
 * tényleges elrendezését tükrözi (xl-en két oszlop, kártyánként avatar+sorok),
 * hogy betöltés után ne "ugorjon" a layout.
 */

import { AdminSkeleton } from '@/components/admin/_shared/admin-skeleton'

interface UserCardSkeletonProps {
  count?: number
}

export function UserCardSkeleton({ count = 4 }: UserCardSkeletonProps) {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-raised p-4 sm:p-5">
          <AdminSkeleton rows={2} />
        </div>
      ))}
    </div>
  )
}
