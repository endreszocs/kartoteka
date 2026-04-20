'use client'

import dynamic from 'next/dynamic'

/**
 * SSR-safe wrapper a `RecycleBinView`-hez. A Dexie/useLiveQuery csak kliens-oldalon
 * érhető el, ezért `ssr: false`-szal betöltjük.
 */
export const RecycleBinViewClient = dynamic(
  () =>
    import('./recycle-bin-view').then(m => ({
      default: m.RecycleBinView,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="card-raised p-8 text-center text-sm italic text-slate-400">
        Kuka betöltése...
      </div>
    ),
  },
)
