'use client'

import Link from 'next/link'
import { ArrowRight, FileSearch, Sparkles } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'

import { getDb } from '@/lib/offline/db'

/**
 * Kis belépő kártya az /offline oldalon → /offline/import navigáció.
 *
 * Megmutatja, ha van bármilyen gyanús változás (Excel watcher state-je
 * a _sync_meta táblából), és amúgy is egy „kezdő" gombként szolgál.
 */
export function ExcelImportLinkCard() {
  // A _sync_meta-ban lévő excel_watch_* kulcsok alapján tudjuk, észleltünk-e
  // változást a legutóbbi scan óta. Egyszerű tájékoztató jelzés.
  const watchCount = useLiveQuery(async () => {
    try {
      const db = getDb()
      const all = await db._sync_meta.toArray()
      return all.filter(m => m.table.startsWith('excel_watch_')).length
    } catch {
      return 0
    }
  })

  const hasDetections = (watchCount || 0) > 0

  return (
    <Link
      href="/offline/import"
      className="card-raised group overflow-hidden transition-shadow hover:shadow-xl"
    >
      <div className="flex items-start gap-4 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200">
          <FileSearch className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-base font-semibold text-slate-800">
              Excel változások áttekintése
            </h3>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
              Fázis 4 — ÚJ
            </span>
            {hasDetections && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                <Sparkles className="h-3 w-3" />
                Változás észlelve
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Ha kézzel módosítottál az Excel fájlokban, itt átnézheted és
            visszaszinkronizálhatod a változásokat a szerverre.
          </p>
          <div className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 group-hover:text-indigo-700">
            Megnyitás
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </Link>
  )
}
