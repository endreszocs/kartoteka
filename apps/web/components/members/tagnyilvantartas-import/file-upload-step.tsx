'use client'

/**
 * Tagnyilvántartás-import fájl-feltöltő lépés.
 *
 * 2026-05-02: a generikus drag-drop részt kiemeltük közös `FileDropZone`
 * komponensbe (apps/web/components/import-shared/file-drop-zone.tsx), és
 * a tagnyilvántartás-specifikus import-mode-választó itt maradt felette.
 * A pénzügyi import-wizard a sajat source-type-választóját használja
 * ugyanezen a `FileDropZone`-on.
 */

import { CheckCircle2, Link2, UserPlus } from 'lucide-react'

import { FileDropZone } from '@/components/import-shared/file-drop-zone'

export type ImportMode = 'new_persons' | 'families_from_existing'

interface FileUploadStepProps {
  selectedFile: File | null
  onFileSelected: (file: File) => void
  onClearFile: () => void
  onContinue: () => void
  isParsing: boolean
  /** Új: import mód választó */
  importMode: ImportMode
  onImportModeChange: (mode: ImportMode) => void
}

function ModeOption({
  mode,
  active,
  onSelect,
  icon,
  title,
  desc,
}: {
  mode: ImportMode
  active: boolean
  onSelect: (m: ImportMode) => void
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      className={`rounded-2xl border p-3 text-left transition ${
        active
          ? 'border-emerald-300 bg-emerald-50/80 shadow-[0_8px_20px_-14px_rgba(5,150,105,0.5)]'
          : 'border-slate-200 bg-white/85 hover:border-emerald-200 hover:bg-emerald-50/30'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={active ? 'text-emerald-600' : 'text-slate-500'}>{icon}</span>
          <p className={`text-sm font-semibold ${active ? 'text-emerald-700' : 'text-slate-800'}`}>
            {title}
          </p>
        </div>
        {active && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{desc}</p>
    </button>
  )
}

export function FileUploadStep({
  selectedFile,
  onFileSelected,
  onClearFile,
  onContinue,
  isParsing,
  importMode,
  onImportModeChange,
}: FileUploadStepProps) {
  return (
    <div className="space-y-4">
      {/* Import mód választó — tagnyilvántartás-specifikus */}
      <div className="rounded-[1.5rem] bg-white/85 p-5 ring-1 ring-emerald-100 shadow-[0_18px_40px_-30px_rgba(15,118,110,0.25)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
          Importálási mód
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Mit szeretnél importálni? Válassz, mielőtt a fájlt feltöltöd.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <ModeOption
            mode="new_persons"
            active={importMode === 'new_persons'}
            onSelect={onImportModeChange}
            icon={<UserPlus className="size-5" />}
            title="Új tagok importálása"
            desc="A fájlból új személyek és családok kerülnek be (alapértelmezett)."
          />
          <ModeOption
            mode="families_from_existing"
            active={importMode === 'families_from_existing'}
            onSelect={onImportModeChange}
            icon={<Link2 className="size-5" />}
            title="Csak családokká szervezés"
            desc="A személyek már fent vannak — csak családi rekordokat (házastárs, gyerekek) hozok létre."
          />
        </div>
      </div>

      {/* Közös fájl-feltöltő drag-drop zóna */}
      <FileDropZone
        selectedFile={selectedFile}
        onFileSelected={onFileSelected}
        onClearFile={onClearFile}
        onContinue={onContinue}
        isParsing={isParsing}
        continueButtonLabel="Tovább az oszlop-párosításhoz"
      />
    </div>
  )
}
