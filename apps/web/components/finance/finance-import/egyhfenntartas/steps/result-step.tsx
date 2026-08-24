'use client'

import { CheckCircle2, AlertTriangle, Download, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { csvCella } from '@/lib/utils/csv'
import type {
  ExecuteImportResult,
  PreviewMatchedRow,
} from '@/app/(dashboard)/penzugy/egyhfenntartas-import-actions'

interface ResultStepProps {
  result: ExecuteImportResult
  matched: PreviewMatchedRow[]
  selectedYear: number
  onNewImport: () => void
}

export function ResultStep({ result, matched, selectedYear, onNewImport }: ResultStepProps) {
  const hasErrors = result.errors.length > 0
  const success = result.insertedCount > 0 && !hasErrors

  // CSV-generálás a "tag nem található" sorokról
  function downloadNoTagCSV() {
    const noTagRows = matched.filter(
      m =>
        m.szemely.matchMode === 'not-found' || m.szemely.matchMode === 'multiple',
    )
    const lines = [
      'Forrása,Összeg,Dátum,Iratszám,Befizetett év,Megjegyzés',
      // 2026-08-24 (B14): minden cella a KÖZÖS `csvCella()`-n megy át — a
      // `forrasa`, a `datum` és az `iratszam` a beolvasott (idegen) fájlból
      // jön, tehát kezdődhet `=`-lel, és ezt a CSV-t utána valaki Excelben
      // nyitja meg. A tisztán szám alakú `osszeg`/`fizetettev` érintetlen
      // marad (a helper kivétele) — a táblázatban továbbra is szám.
      ...noTagRows.map(r => {
        const fr = r.finalRow
        return [
          csvCella(fr.forrasa),
          csvCella(fr.osszeg),
          csvCella(fr.datum),
          csvCella(fr.iratszam),
          csvCella(fr.fizetettev),
          csvCella(fr.megjegyzes || ''),
        ].join(',')
      }),
    ]
    const csv = '﻿' + lines.join('\n') // BOM for Excel UTF-8
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `egyhf-uj-tagok-${selectedYear}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5 p-5 md:p-6">
      <div
        className={`rounded-2xl border-2 p-5 ${
          success
            ? 'border-emerald-200 bg-emerald-50/60'
            : hasErrors
              ? 'border-rose-200 bg-rose-50/60'
              : 'border-amber-200 bg-amber-50/60'
        }`}
      >
        <div className="flex items-start gap-3">
          {success ? (
            <CheckCircle2 className="size-8 text-emerald-600" />
          ) : (
            <AlertTriangle className="size-8 text-amber-600" />
          )}
          <div>
            <h2 className="font-heading text-2xl text-slate-800">
              {success
                ? 'Sikeres importálás!'
                : hasErrors
                  ? 'Hiba(k) történt(ek) az importálás során'
                  : 'Importálás befejezve'}
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              {success
                ? `${result.insertedCount} egyházfenntartási tétel rögzítve a ${selectedYear}-es év befizetései közé.`
                : 'Lásd a részleteket lent.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wider text-emerald-700">Sikeresen mentve</p>
          <p className="mt-1 font-heading text-3xl text-emerald-700">{result.insertedCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wider text-slate-600">Duplikáció (skipped)</p>
          <p className="mt-1 font-heading text-3xl text-slate-700">
            {result.skippedDuplicateCount}
          </p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wider text-rose-700">Hibák</p>
          <p className="mt-1 font-heading text-3xl text-rose-700">{result.errors.length}</p>
        </div>
      </div>

      {result.errors.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
          <h3 className="text-sm font-semibold text-rose-900">Hibák részletei:</h3>
          <ul className="mt-2 space-y-1 text-xs text-rose-800">
            {result.errors.slice(0, 20).map((err, i) => (
              <li key={i}>• {err}</li>
            ))}
            {result.errors.length > 20 && (
              <li className="font-medium">+ {result.errors.length - 20} további hiba</li>
            )}
          </ul>
        </div>
      )}

      {/* Tag-nem-talált CSV-export */}
      {matched.some(
        m => m.szemely.matchMode === 'not-found' || m.szemely.matchMode === 'multiple',
      ) && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-4">
          <h3 className="text-sm font-semibold text-sky-900">
            Új tagok — fel kell venni a tagnyilvántartásba
          </h3>
          <p className="mt-1 text-xs text-sky-800">
            Letöltheted azokat a befizetőket, akiket a tagnyilvántartásban nem találtunk
            meg vagy bizonytalan az egyezés. Vedd fel őket a tagnyilvántartásba, aztán
            újra importáld a fájlokat.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 gap-2"
            onClick={downloadNoTagCSV}
          >
            <Download className="size-4" />
            Új tagok CSV exportálása
          </Button>
        </div>
      )}

      <div className="flex items-center justify-end border-t border-slate-100 pt-4">
        <Button onClick={onNewImport} className="gap-2" size="lg">
          <RotateCcw className="size-4" />
          Új import indítása
        </Button>
      </div>
    </div>
  )
}
