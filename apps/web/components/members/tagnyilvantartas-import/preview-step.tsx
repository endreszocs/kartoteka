'use client'

import { useMemo } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { ImportProfile } from '@/lib/import/import-profiles'

interface PreviewStepProps {
  /** A teljes Excel sorlista (a parser-ből) */
  rows: Array<Record<string, string | number | null>>
  /** A fejlécek (Excel-fejléc nevek) */
  headers: string[]
  /** A választott profil (a DB oszlopok meghatározásához) */
  profile: ImportProfile
  /** A mapping, ami az oszlop-párosítás lépés után jött ki */
  mapping: Record<string, string | null> // excelHeader → dbColumn (vagy null = kihagyás)
  /** Az importálandó sorok teljes száma (a previeben csak az első 10 jelenik meg) */
  totalRows: number
  /** Cél gyülekezet neve (csak megjelenítéshez) */
  congregationName: string
  /** Hány sorral fog ténylegesen importálni (kötelező-mező-szűrés után, becslés) */
  importableCount: number
  /** Hány sor hiányos / hibás (lemenne) */
  skippedCount: number
  /** Vissza/tovább */
  onBack: () => void
  onConfirmImport: () => void
  isImporting: boolean
}

export function PreviewStep({
  rows,
  headers,
  profile,
  mapping,
  totalRows,
  congregationName,
  importableCount,
  skippedCount,
  onBack,
  onConfirmImport,
  isImporting,
}: PreviewStepProps) {
  // Az aktívan használt fejlécek (mapping-elt = nem null)
  const activeHeaders = useMemo(() => {
    return headers.filter((h) => mapping[h] !== null && mapping[h] !== undefined)
  }, [headers, mapping])

  // Csak az első 10 sor előnézethez
  const sampleRows = useMemo(() => rows.slice(0, 10), [rows])

  return (
    <div className="space-y-4">
      {/* Összefoglaló kártyák */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Importálandó sorok"
          value={importableCount}
          subtitle={totalRows > importableCount ? `${totalRows} összesen` : 'mindegyik teljes'}
          tone="emerald"
        />
        <SummaryCard
          label="Kihagyott sorok"
          value={skippedCount}
          subtitle={skippedCount > 0 ? 'hiányzó kötelező mező' : 'nincs ilyen'}
          tone={skippedCount > 0 ? 'amber' : 'slate'}
        />
        <SummaryCard
          label="Cél gyülekezet"
          value={congregationName}
          subtitle="ide kerülnek a sorok"
          tone="indigo"
          isText
        />
      </div>

      {/* Profil-info kártya */}
      <div className="rounded-2xl bg-emerald-50/60 p-4 text-sm text-emerald-900 ring-1 ring-emerald-100">
        <p className="flex items-start gap-2 font-semibold">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          {profile.label}
        </p>
        <p className="mt-1 leading-relaxed">{profile.description}</p>
        {profile.hints.length > 0 && (
          <ul className="mt-2 space-y-1 pl-5 leading-relaxed marker:text-emerald-400">
            {profile.hints.map((h) => (
              <li key={h} className="list-disc text-xs">
                {h}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Előnézet táblázat */}
      <div className="overflow-hidden rounded-[1.5rem] bg-white/85 ring-1 ring-emerald-100 shadow-[0_18px_40px_-30px_rgba(15,118,110,0.35)]">
        <div className="border-b border-emerald-100 bg-emerald-50/50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700/80">
            Előnézet — első {sampleRows.length} sor a {totalRows}-ból
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-[0.14em] text-slate-500">
                <th className="border-b border-slate-100 px-3 py-2 font-semibold">#</th>
                {activeHeaders.map((h) => (
                  <th
                    key={h}
                    className="border-b border-slate-100 px-3 py-2 font-semibold"
                  >
                    <p className="text-slate-700">{h}</p>
                    <p className="mt-0.5 text-[9px] font-mono text-emerald-600">
                      → {mapping[h]}
                    </p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-emerald-50/30">
                  <td className="border-b border-slate-50 px-3 py-2 text-slate-400">
                    {idx + 1}
                  </td>
                  {activeHeaders.map((h) => {
                    const value = row[h]
                    return (
                      <td
                        key={h}
                        className="max-w-[180px] truncate border-b border-slate-50 px-3 py-2 text-slate-600"
                        title={value !== null && value !== undefined ? String(value) : ''}
                      >
                        {value === null || value === undefined || value === ''
                          ? <span className="italic text-slate-300">—</span>
                          : String(value)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CTA — nagy import gomb */}
      <div className="rounded-[1.5rem] bg-gradient-to-br from-emerald-50 to-teal-50 p-5 text-center ring-1 ring-emerald-100">
        <CheckCircle2 className="mx-auto size-8 text-emerald-500" />
        <p className="mt-2 text-base font-semibold text-slate-800">
          Készen áll az importálás
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {importableCount} sor kerül beolvasásra a(z) <strong>{congregationName}</strong>{' '}
          gyülekezet adatbázisába.
          {skippedCount > 0 && (
            <>
              {' '}
              <span className="text-amber-700">{skippedCount} hibás sor</span> kihagyásra
              kerül.
            </>
          )}
        </p>
        <Button
          type="button"
          onClick={onConfirmImport}
          disabled={isImporting || importableCount === 0}
          className="mt-4 rounded-full bg-emerald-600 px-6 py-2.5 text-base hover:bg-emerald-700"
          size="lg"
        >
          {isImporting ? (
            <>
              <Loader2 className="mr-2 size-5 animate-spin" />
              Importálás folyamatban…
            </>
          ) : (
            <>
              Import indítása ({importableCount} sor)
              <ArrowRight className="ml-2 size-5" />
            </>
          )}
        </Button>
      </div>

      {/* Vissza */}
      <div className="flex">
        <Button type="button" variant="outline" onClick={onBack} className="rounded-full" disabled={isImporting}>
          <ArrowLeft className="mr-1.5 size-4" />
          Vissza az oszlop-párosításhoz
        </Button>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  subtitle,
  tone,
  isText = false,
}: {
  label: string
  value: number | string
  subtitle: string
  tone: 'emerald' | 'amber' | 'slate' | 'indigo'
  isText?: boolean
}) {
  const toneClasses = {
    emerald: 'bg-emerald-50/80 ring-emerald-100',
    amber: 'bg-amber-50/80 ring-amber-100',
    slate: 'bg-slate-50/80 ring-slate-100',
    indigo: 'bg-indigo-50/80 ring-indigo-100',
  } as const
  const valueColor = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    slate: 'text-slate-700',
    indigo: 'text-indigo-700',
  } as const

  return (
    <div className={`rounded-2xl px-4 py-3 ring-1 ${toneClasses[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className={`mt-1 ${isText ? 'text-base font-semibold' : 'text-2xl font-bold'} ${valueColor[tone]} truncate`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
    </div>
  )
}
