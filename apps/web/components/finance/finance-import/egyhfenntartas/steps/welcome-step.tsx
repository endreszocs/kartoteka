'use client'

/**
 * Egyházfenntartás-import — 1. lépés: Üdvözlő + 2 dropzone + év-detekció.
 *
 * 2026-05-06.
 */

import { useState } from 'react'
import { ArrowRight, FileSpreadsheet, FileCode, Info, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface WelcomeStepProps {
  xlsxFile: File | null
  xmlFile: File | null
  selectedYear: number | null
  onXlsxFileSelected: (file: File | null) => void
  onXmlFileSelected: (file: File | null) => void
  onYearChange: (year: number | null) => void
  onContinue: () => void
  isParsing: boolean
}

export function WelcomeStep({
  xlsxFile,
  xmlFile,
  selectedYear,
  onXlsxFileSelected,
  onXmlFileSelected,
  onYearChange,
  onContinue,
  isParsing,
}: WelcomeStepProps) {
  const [yearInput, setYearInput] = useState(
    selectedYear ? String(selectedYear) : String(new Date().getFullYear()),
  )

  function handleYearChange(value: string) {
    setYearInput(value)
    const n = parseInt(value, 10)
    onYearChange(Number.isFinite(n) && n >= 2000 && n <= 2100 ? n : null)
  }

  function handleFileSelect(
    event: React.ChangeEvent<HTMLInputElement>,
    setter: (file: File | null) => void,
  ) {
    const file = event.target.files?.[0]
    if (file) setter(file)
    event.target.value = ''
  }

  const canContinue = xlsxFile && xmlFile && selectedYear && !isParsing

  return (
    <div className="space-y-6 p-5 md:p-6">
      <header className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-100">
          <FileSpreadsheet className="size-6 text-emerald-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-2xl text-slate-800">
            Egyházfenntartás-import
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Két forrásfájlból dolgozunk: a teljes éves Kassza-xlsx (csak az
            egyházfenntartás-sorokat olvassuk be) és a részletes bevételek-xml
            (név + utca + házszám). A kettőt összevetjük, kiszűrjük a
            duplikációkat, és minden sort párosítunk a tagnyilvántartással.
          </p>
        </div>
      </header>

      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-900">
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>A két fájl viszonya:</strong> mindkettő ugyanannak az évnek
            a befizetéseit tartalmazza. A kassza-xlsx-ben a bevételek + kiadások
            mind szerepelnek, az xml-ben csak a részletes bevételek (utcával,
            házszámmal). A wizard csak az "Egyházfenntartói járulék" cél
            kategóriájú sorokat dolgozza fel — a többi (adományok, segélyek
            stb.) érintetlen.
          </span>
        </p>
      </div>

      <div className="space-y-2 max-w-xs">
        <Label htmlFor="import-year">Importálandó év</Label>
        <Input
          id="import-year"
          type="number"
          min={2000}
          max={2100}
          placeholder="2025"
          value={yearInput}
          onChange={e => handleYearChange(e.target.value)}
        />
        <p className="text-xs text-slate-500">
          A fájlokból auto-detektáljuk, de itt felülírható. Több évet egyenként
          importálj — minden év önálló futás.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Xlsx dropzone */}
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-5 transition-colors hover:border-emerald-400 hover:bg-emerald-50/30">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
              <FileSpreadsheet className="size-5 text-emerald-700" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-slate-800">
                Kassza-xlsx (Adatok_YYYY.xlsx)
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                A teljes éves könyvelési fájl — Kassza-sheettel.
              </p>
            </div>
          </div>

          {xlsxFile ? (
            <div className="mt-3 rounded-md border border-emerald-200 bg-white p-2 text-xs text-emerald-900">
              <p className="font-medium">{xlsxFile.name}</p>
              <p className="text-emerald-700">{(xlsxFile.size / 1024).toFixed(0)} KB</p>
              <button
                type="button"
                onClick={() => onXlsxFileSelected(null)}
                className="mt-1 text-emerald-700 underline hover:no-underline"
              >
                Eltávolítás
              </button>
            </div>
          ) : (
            <label className="mt-3 flex cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700">
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => handleFileSelect(e, onXlsxFileSelected)}
              />
              <span>Fájl tallózása…</span>
            </label>
          )}
        </div>

        {/* XML dropzone */}
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-5 transition-colors hover:border-violet-400 hover:bg-violet-50/30">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-100">
              <FileCode className="size-5 text-violet-700" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-slate-800">
                Bevételek-xml (bevételek YYYY.xml)
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                A részletes bevételi-lista (utcával, házszámmal).
              </p>
            </div>
          </div>

          {xmlFile ? (
            <div className="mt-3 rounded-md border border-violet-200 bg-white p-2 text-xs text-violet-900">
              <p className="font-medium">{xmlFile.name}</p>
              <p className="text-violet-700">{(xmlFile.size / 1024).toFixed(0)} KB</p>
              <button
                type="button"
                onClick={() => onXmlFileSelected(null)}
                className="mt-1 text-violet-700 underline hover:no-underline"
              >
                Eltávolítás
              </button>
            </div>
          ) : (
            <label className="mt-3 flex cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-600 transition-colors hover:bg-violet-50 hover:text-violet-700">
              <input
                type="file"
                accept=".xml"
                className="hidden"
                onChange={e => handleFileSelect(e, onXmlFileSelected)}
              />
              <span>Fájl tallózása…</span>
            </label>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end border-t border-slate-100 pt-4">
        <Button
          size="lg"
          className="gap-2 rounded-xl px-6"
          disabled={!canContinue}
          onClick={onContinue}
        >
          {isParsing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowRight className="size-4" />
          )}
          {isParsing ? 'Parsolás folyamatban…' : 'Áttekintés'}
        </Button>
      </div>
    </div>
  )
}
