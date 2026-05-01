/**
 * Tagnyilvántartás — loading state (Sprint S F5 · v0.9.4).
 *
 * Next.js 15 App Router conventional `loading.tsx` — a Suspense fallback-ként
 * automatikusan mountolódik amíg a route-szegmens server-side fetch-el.
 * A `SkeletonTable` shared komponens témára-érzékeny shimmer animációt ad.
 */

import { SkeletonTable } from '@kartoteka/ui-app'

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="card-raised p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="space-y-2">
            <div className="kt-skeleton h-6 w-48 rounded-md" />
            <div className="kt-skeleton h-4 w-64 rounded-md" />
          </div>
          <div className="kt-skeleton h-10 w-32 rounded-xl" />
        </div>
        <SkeletonTable rows={10} columns={6} />
      </div>
    </div>
  )
}
