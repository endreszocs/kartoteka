'use client'

import dynamic from 'next/dynamic'

/**
 * Wrapper a `ExcelImportReview`-hez, ami **csak kliens-oldalon** renderelődik
 * (`ssr: false`).
 *
 * Miért? A komponens File System Access API-t használ, ami csak böngészőben
 * létezik. Ugyanaz a minta mint az `ExcelExportPanelClient`-ben.
 */
export const ExcelImportReviewClient = dynamic(
  () =>
    import('./excel-import-review').then(m => ({
      default: m.ExcelImportReview,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="card-raised overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-indigo-50/40 px-5 py-3">
          <div className="h-4 w-4 rounded bg-indigo-200" />
          <h3 className="font-heading text-lg text-slate-800">
            Excel változások áttekintése
          </h3>
        </div>
        <div className="py-8 text-center text-sm italic text-slate-400">
          Betöltés...
        </div>
      </div>
    ),
  },
)
