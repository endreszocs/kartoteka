'use client'

/**
 * 1. lépés — forrástípus választás + fájl feltöltés.
 *
 * A v1-ben **csak a Kassza** kártya választható, a többi (XML egyházfenntartás,
 * Bank A RON, Bank B EUR) szürkítve "Hamarosan" jelzéssel — a felhasználó már
 * látja a roadmapot, de még nem tud rájuk kattintani.
 *
 * 2026-05-02 (Fázis 4): első verzió.
 */

import { CheckCircle2, FileSpreadsheet, FileText, Landmark, ScrollText, Sparkles } from 'lucide-react'

import { FileDropZone } from '@/components/import-shared/file-drop-zone'
import type { FinanceImportSourceType } from '../types'

interface SourceTypeStepProps {
  selectedSourceType: FinanceImportSourceType
  onSourceTypeChange: (type: FinanceImportSourceType) => void
  selectedFile: File | null
  onFileSelected: (file: File) => void
  onClearFile: () => void
  onContinue: () => void
  isParsing: boolean
}

interface SourceCard {
  type: FinanceImportSourceType
  label: string
  description: string
  icon: React.ReactNode
  available: boolean
  badge?: string
}

const SOURCE_CARDS: SourceCard[] = [
  {
    type: 'kassza',
    label: 'EREK kasszakönyv',
    description:
      'A hivatalos EREK könyvelési Excel "Kassza" füle — bevételek és kiadások egy táblázatban.',
    icon: <FileSpreadsheet className="size-5" />,
    available: true,
  },
  {
    type: 'xml-egyhazfenntartas',
    label: 'Egyházfenntartás (XML)',
    description: 'Külön exportált bevétel-XML egyházfenntartói járulékokkal — duplikáció-ellenőrzéssel.',
    icon: <ScrollText className="size-5" />,
    available: false,
    badge: 'Hamarosan',
  },
  {
    type: 'bank-ron',
    label: 'Bankszámla — RON (A lap)',
    description: 'A hivatalos kassza-program "A" füle — a román lej bankszámla mozgásai.',
    icon: <Landmark className="size-5" />,
    available: false,
    badge: 'Hamarosan',
  },
  {
    type: 'bank-eur',
    label: 'Bankszámla — EUR (B lap)',
    description: 'A hivatalos kassza-program "B" füle — az eurós bankszámla mozgásai (árfolyammal).',
    icon: <FileText className="size-5" />,
    available: false,
    badge: 'Hamarosan',
  },
]

export function SourceTypeStep({
  selectedSourceType,
  onSourceTypeChange,
  selectedFile,
  onFileSelected,
  onClearFile,
  onContinue,
  isParsing,
}: SourceTypeStepProps) {
  return (
    <div className="space-y-4">
      {/* Forrástípus választó kártyák */}
      <div className="rounded-[1.5rem] bg-white/85 p-5 ring-1 ring-emerald-100 shadow-[0_18px_40px_-30px_rgba(15,118,110,0.25)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
          Mit szeretnél importálni?
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Válassz egy forrástípust a fájl feltöltése előtt. A v1-ben csak a Kassza
          fül érhető el — a többit a következő iterációkban kapcsoljuk be.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {SOURCE_CARDS.map((card) => {
            const active = card.available && card.type === selectedSourceType
            const disabled = !card.available
            return (
              <button
                key={card.type}
                type="button"
                disabled={disabled}
                onClick={() => card.available && onSourceTypeChange(card.type)}
                className={`relative rounded-2xl border p-4 text-left transition ${
                  disabled
                    ? 'cursor-not-allowed border-slate-100 bg-slate-50/50 opacity-60'
                    : active
                      ? 'border-emerald-300 bg-emerald-50/80 shadow-[0_8px_20px_-14px_rgba(5,150,105,0.5)]'
                      : 'border-slate-200 bg-white/85 hover:border-emerald-200 hover:bg-emerald-50/30'
                }`}
              >
                {card.badge && (
                  <span className="absolute right-3 top-3 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">
                    {card.badge}
                  </span>
                )}
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${
                      active
                        ? 'bg-emerald-100 text-emerald-700'
                        : disabled
                          ? 'bg-slate-100 text-slate-400'
                          : 'bg-emerald-50 text-emerald-600'
                    }`}
                  >
                    {card.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`text-sm font-semibold ${
                          disabled
                            ? 'text-slate-500'
                            : active
                              ? 'text-emerald-700'
                              : 'text-slate-800'
                        }`}
                      >
                        {card.label}
                      </p>
                      {active && (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {card.description}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Pasztorális tipp */}
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 text-xs text-emerald-800">
        <p className="flex items-start gap-2 font-semibold">
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          Tipp
        </p>
        <p className="mt-1 leading-relaxed">
          A Kassza füllel kezdjük — a wizard végigvezet, és minden lépés előtt
          mutatja, hogy mit fog tenni. Ha bármi nem stimmel, mindig vissza tudsz
          lépni az adatok importja előtt.
        </p>
      </div>

      {/* Közös fájl-feltöltő */}
      <FileDropZone
        selectedFile={selectedFile}
        onFileSelected={onFileSelected}
        onClearFile={onClearFile}
        onContinue={onContinue}
        isParsing={isParsing}
        continueButtonLabel="Tovább a fül-választáshoz"
        acceptedExtensions={['xlsx', 'xls']}
        acceptAttribute=".xlsx,.xls"
      />
    </div>
  )
}
