'use client'

import { useState, useEffect } from 'react'
import { BookOpen } from 'lucide-react'

interface VerseData {
  verse: string
  reference: string
  date: string
}

export function DailyVerse() {
  const [data, setData] = useState<VerseData | null>(null)

  useEffect(() => {
    fetch('/api/daily-verse')
      .then(r => r.json())
      .then(setData)
      .catch(() => setData({
        verse: 'Bízzál az Úrban teljes szíveddel, és ne a magad eszére támaszkodj!',
        reference: 'Példabeszédek 3:5',
        date: new Date().toISOString().split('T')[0],
      }))
  }, [])

  return (
    <div className="card-raised relative flex h-full flex-col overflow-hidden">
      <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-indigo-100/60 blur-3xl" />
      {/* Fejléc */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-3 shrink-0">
        <div className="icon-raised w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600">
          <BookOpen className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800 text-sm">Mai Ige</h3>
          <p className="text-[11px] text-slate-400">Napi igei gondolat</p>
        </div>
      </div>

      {/* Tartalom */}
      <div className="flex-1 px-5 pb-5 flex flex-col justify-center">
        {!data ? (
          <div className="animate-pulse space-y-3 py-4">
            <div className="h-3 bg-slate-100 rounded-full w-3/4" />
            <div className="h-3 bg-slate-100 rounded-full w-full" />
            <div className="h-3 bg-slate-100 rounded-full w-2/3" />
          </div>
        ) : (
          <div className="py-2">
            {/* Ige szöveg */}
            <div className="relative">
              <span className="absolute -top-3 -left-1 text-4xl text-indigo-200 font-serif leading-none select-none">&ldquo;</span>
              <p className="text-sm sm:text-base text-slate-700 leading-relaxed italic pl-4 pr-2">
                {data.verse}
              </p>
              <span className="absolute -bottom-2 right-0 text-4xl text-indigo-200 font-serif leading-none select-none">&rdquo;</span>
            </div>

            {/* Hivatkozás */}
            {data.reference && (
              <div className="mt-5 flex items-center gap-2">
                <div className="h-px flex-1 bg-gradient-to-r from-indigo-100 to-transparent" />
                <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                  {data.reference}
                </span>
                <div className="h-px flex-1 bg-gradient-to-l from-indigo-100 to-transparent" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
