'use client'

/**
 * 2. lépés — sheet kiválasztása.
 *
 * A `parseAndPreviewFinance` action visszaadja a fájlból az összes sheet-et,
 * mi pedig megmutatjuk őket egy listában. A v1-ben **csak a "Kassza"** sheet
 * választható (a többi szürkítve, "Hamarosan" jelzéssel) — a Monetar mint
 * diagnosztikai panel csak a 7. lépésen jelenik meg, ott automatikusan.
 *
 * Auto-pick: ha a fájlban pontosan egyetlen "Kassza" sheet van, a "Tovább"
 * gomb azonnal aktív. Ha nincs Kassza fül, hibajelzés.
 *
 * 2026-05-02 (Fázis 4): első verzió.
 */

import { ArrowLeft, ArrowRight, AlertTriangle, CheckCircle2, FileSpreadsheet, Layers } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { FinanceSheetPreview } from '@/app/(dashboard)/penzugy/finance-import-types'

interface SheetPickStepProps {
  fileName: string
  sheets: FinanceSheetPreview[]
  selectedSheetName: string | null
  onSheetSelected: (sheetName: string) => void
  onBack: () => void
  onContinue: () => void
}

export function SheetPickStep({
  fileName,
  sheets,
  selectedSheetName,
  onSheetSelected,
  onBack,
  onContinue,
}: SheetPickStepProps) {
  const kasszaSheet = sheets.find((s) => s.isKasszaSheet)
  const hasKassza = !!kasszaSheet

  return (
    <div className="space-y-4">
      {/* Fájl-info */}
      <div className="rounded-[1.5rem] bg-white/85 p-5 ring-1 ring-emerald-100">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
          Beolvasott fájl
        </p>
        <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <FileSpreadsheet className="size-4 shrink-0 text-emerald-600" />
          <span className="truncate">{fileName}</span>
        </p>
        <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <Layers className="size-3.5 shrink-0" />
          {sheets.length} fül a fájlban
        </p>
      </div>

      {/* Hibajelzés ha nincs Kassza */}
      {!hasKassza && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          <p className="flex items-start gap-2 font-semibold">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Nincs &quot;Kassza&quot; nevű fül a fájlban
          </p>
          <p className="mt-1 leading-relaxed">
            A pénzügyi import-wizard csak a hivatalos EREK könyvelési Excel
            &quot;Kassza&quot; fülét tudja kezelni. Ellenőrizd, hogy a fájl ezt
            a sablont követi-e, vagy lépj vissza, és válassz másik fájlt.
          </p>
        </div>
      )}

      {/* Sheet-lista */}
      <div className="rounded-[1.5rem] bg-white/85 p-5 ring-1 ring-emerald-100">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
          Munkalapok
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Válaszd ki, melyik munkalapot dolgozza fel a wizard. A v1-ben csak a
          Kassza fül érhető el — a többit a következő iterációkban kapcsoljuk be.
        </p>
        <div className="mt-3 space-y-2">
          {sheets.map((sheet) => {
            const active = sheet.sheetName === selectedSheetName
            const enabled = sheet.isKasszaSheet
            return (
              <button
                key={sheet.sheetName}
                type="button"
                disabled={!enabled}
                onClick={() => enabled && onSheetSelected(sheet.sheetName)}
                className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${
                  !enabled
                    ? 'cursor-not-allowed border-slate-100 bg-slate-50/40 opacity-60'
                    : active
                      ? 'border-emerald-300 bg-emerald-50/80 shadow-[0_8px_20px_-14px_rgba(5,150,105,0.5)]'
                      : 'border-slate-200 bg-white/85 hover:border-emerald-200 hover:bg-emerald-50/30'
                }`}
              >
                <span
                  className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl ${
                    active
                      ? 'bg-emerald-100 text-emerald-700'
                      : enabled
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <FileSpreadsheet className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`text-sm font-semibold ${
                        !enabled
                          ? 'text-slate-500'
                          : active
                            ? 'text-emerald-700'
                            : 'text-slate-800'
                      }`}
                    >
                      {sheet.sheetName}
                    </p>
                    {active && (
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                    )}
                    {!enabled && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">
                        v2
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {sheet.headers.length} oszlop · {sheet.rowCount} sor
                  </p>
                  {sheet.isKasszaSheet && (
                    <p className="mt-1 text-[11px] leading-relaxed text-emerald-700">
                      Hivatalos EREK kasszakönyv-fül — bevételek és kiadások
                      egy táblázatban.
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Vissza/Tovább gombok */}
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="rounded-full text-slate-600 hover:text-slate-800"
        >
          <ArrowLeft className="mr-1.5 size-4" />
          Vissza
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={!selectedSheetName || !hasKassza}
          className="rounded-full bg-emerald-600 hover:bg-emerald-700"
        >
          Tovább az oszlop-párosításhoz
          <ArrowRight className="ml-1.5 size-4" />
        </Button>
      </div>
    </div>
  )
}
