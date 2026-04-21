'use client'

import dynamic from 'next/dynamic'

/**
 * Wrapper a `ExcelExportPanel`-hez, ami **csak kliens-oldalon** renderelődik
 * (`ssr: false`).
 *
 * Miért? A komponens File System Access API-t használ, ami csak böngészőben
 * létezik. SSR-en a `'showDirectoryPicker' in window` vizsgálat hamis értéket
 * ad, ami hydration mismatch-hez vezet, akár a mount-guard pattern mellett is
 * (Turbopack HMR cache corruption).
 *
 * A `next/dynamic` + `ssr: false` tiszta megoldás: a szerver **semmit** nem
 * renderel, a kliens a React lifecycle-ön belül mount-olja.
 */
export const ExcelExportPanelClient = dynamic(
  () =>
    import('./excel-export-panel').then(m => ({
      default: m.ExcelExportPanel,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="card-raised overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-teal-50/40 px-5 py-3">
          <div className="h-4 w-4 rounded bg-teal-200" />
          <h3 className="font-heading text-lg text-slate-800">Excel export</h3>
        </div>
        <div className="py-8 text-center text-sm italic text-slate-400">
          Betöltés...
        </div>
      </div>
    ),
  },
)
