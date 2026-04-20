'use client'

import dynamic from 'next/dynamic'

/**
 * SSR-safe wrapper a `FullBackupPanel`-hez. A JSZip + Dexie csak kliens-oldalon
 * érhető el, ezért `ssr: false`-szal töltjük be.
 */
export const FullBackupPanelClient = dynamic(
  () =>
    import('./full-backup-panel').then(m => ({
      default: m.FullBackupPanel,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="card-raised overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-purple-50/40 px-5 py-3">
          <div className="h-4 w-4 rounded bg-purple-200" />
          <h3 className="font-heading text-lg text-slate-800">
            Teljes biztonsági mentés
          </h3>
        </div>
        <div className="py-8 text-center text-sm italic text-slate-400">
          Betöltés...
        </div>
      </div>
    ),
  },
)
