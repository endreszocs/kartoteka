'use client'

/**
 * Presbiteri/közgyűlési jegyzőkönyvek lista — keresés, szűrés, év választó.
 */

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Search, Check, Edit3, Clock, BookOpen, Printer } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getMinutesList, searchMinutes, getMinutesById } from '@/app/(dashboard)/jegyzokonyvek/actions'
import { MinutesPrintDialog } from './minutes-print-dialog'
import { buildMinutesPrintHtml, type MinutesPrintData } from '@/lib/minutes/print'
import { EmptyFirstRecord } from '@/components/ui/empty-first-record'
import { toast } from 'sonner'

interface MinutesEntry {
  id: string
  ev: number
  ules_sorszam: number
  datum: string
  hely: string | null
  allapot: string
  elnok_neve: string | null
}

interface MinutesListProps {
  initialMinutes: MinutesEntry[]
  currentYear: number
  congregationName?: string
}

const STATUS_MAP: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  draft: { label: 'Piszkozat', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: Edit3 },
  veglegesitett: { label: 'Véglegesítve', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Check },
  hitelesitett: { label: 'Hitelesítve', className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Check },
}

export function MinutesList({ initialMinutes, currentYear, congregationName = 'Református Egyházközség' }: MinutesListProps) {
  const [minutes, setMinutes] = useState(initialMinutes)
  const [year, setYear] = useState(currentYear)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ hatarozat_szam: string; szoveg: string; datum: string; ules_sorszam: number; ev: number; jegyzokonyv_id: string }>>([])
  const [searching, setSearching] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [printData, setPrintData] = useState<Record<string, unknown> | null>(null)

  async function handleYearChange(newYear: number) {
    setYear(newYear)
    const data = await getMinutesList(newYear)
    setMinutes(data as MinutesEntry[])
  }

  async function handlePrint(id: string) {
    const data = await getMinutesById(id)
    if (!data) { toast.error('Nem sikerült betölteni a jegyzőkönyvet.'); return }
    setPrintData(data)
    setPrintOpen(true)
  }

  // ⚠️ 2026-08-24 (biztonsági kör, B3 — tárolt XSS): a nyomtatvány HTML-je
  // a KÖZÖS `@/lib/minutes/print` modulban épül, ahol MINDEN felhasználói
  // mező escape-elődik. ⛔ Ide NE kerüljön vissza nyers sablon-interpoláció.
  const generatePrintHtml = useCallback(
    (type: string): string => {
      if (!printData) return '<p>Nincs adat.</p>'
      return buildMinutesPrintHtml(type, {
        ...(printData as unknown as MinutesPrintData),
        congregationName,
      })
    },
    [printData, congregationName],
  )

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearching(true)
    const results = await searchMinutes(searchQuery.trim())
    setSearchResults(results)
    setSearching(false)
    if (results.length === 0) toast.info('Nincs találat a határozatokban.')
  }

  return (
    <div className="space-y-4">
      {/* Szűrők és keresés */}
      <div className="card-raised p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <select
              value={year}
              onChange={(e) => void handleYearChange(Number(e.target.value))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
            >
              {Array.from({ length: 8 }, (_, i) => currentYear - i).map((y) => (
                <option key={y} value={y}>{y}. év</option>
              ))}
            </select>
            <Badge variant="secondary" className="text-xs">{minutes.length} jegyzőkönyv</Badge>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <Input
              placeholder="Keresés határozatokban..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch() }}
              className="rounded-xl"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleSearch()}
              disabled={searching}
              className="rounded-xl shrink-0"
            >
              <Search className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Keresési eredmények */}
      {searchResults.length > 0 && (
        <div className="card-raised p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">
              Keresési eredmények ({searchResults.length})
            </p>
            <Button size="sm" variant="ghost" className="text-xs text-slate-400" onClick={() => setSearchResults([])}>
              Bezárás
            </Button>
          </div>
          <div className="space-y-2">
            {searchResults.map((r, i) => (
              <Link
                key={i}
                href={`/jegyzokonyvek/${r.jegyzokonyv_id}`}
                className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/30 p-3 hover:bg-indigo-50/60 transition"
              >
                <Badge className="bg-indigo-100 text-indigo-700 shrink-0">{r.hatarozat_szam}</Badge>
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 line-clamp-2">{r.szoveg}</p>
                  <p className="text-xs text-slate-400 mt-1">{r.ev}/{r.ules_sorszam}. ülés — {r.datum}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Jegyzőkönyv lista */}
      {minutes.length === 0 ? (
        <EmptyFirstRecord
          accent="indigo"
          icon={BookOpen}
          title="Még nincs jegyzőkönyv"
          description={`A ${year}. évre még nincs rögzített jegyzőkönyv. Rögzítsd az elsőt — a presbiteri és közgyűlési határozatok így egy helyen, kereshetően maradnak.`}
          ctaLabel="Rögzítsd az első jegyzőkönyvet"
          ctaHref="/jegyzokonyvek/uj"
        />
      ) : (
        <div className="space-y-2">
          {minutes.map((m) => {
            const status = STATUS_MAP[m.allapot] || STATUS_MAP.draft
            const StatusIcon = status.icon

            return (
              <Link
                key={m.id}
                href={`/jegyzokonyvek/${m.id}`}
                className="card-raised flex items-center gap-4 p-4 transition hover:shadow-md hover:border-indigo-200/60"
              >
                {/* Sorszám */}
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
                  <span className="text-lg font-bold">{m.ules_sorszam}.</span>
                </div>

                {/* Tartalom */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">
                      {m.ev}/{m.ules_sorszam}. presbiteri gyűlés
                    </p>
                    <Badge variant="outline" className={`text-[10px] ${status.className}`}>
                      <StatusIcon className="mr-0.5 size-3" />
                      {status.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {m.datum}
                    {m.hely ? ` · ${m.hely}` : ''}
                    {m.elnok_neve ? ` · Elnök: ${m.elnok_neve}` : ''}
                  </p>
                </div>

                {/* Nyomtatás gomb véglegesített jegyzőkönyvekhez */}
                <div className="flex items-center gap-2 shrink-0">
                  {(m.allapot === 'veglegesitett' || m.allapot === 'hitelesitett') && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handlePrint(m.id) }}
                      className="p-2 rounded-lg text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 transition"
                      title="Nyomtatási központ"
                    >
                      <Printer className="size-4" />
                    </button>
                  )}
                  <div className="text-slate-300">→</div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Nyomtatási központ dialógus */}
      {printData && (
        <MinutesPrintDialog
          open={printOpen}
          onOpenChange={(open) => { setPrintOpen(open); if (!open) setPrintData(null) }}
          generateHtml={generatePrintHtml}
          year={year}
        />
      )}
    </div>
  )
}
