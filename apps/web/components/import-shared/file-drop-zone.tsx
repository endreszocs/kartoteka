'use client'

/**
 * Közös fájl-feltöltő drag-drop zóna import-folyamatokhoz.
 *
 * 2026-05-02-én vált közössé — eredetileg a tagnyilvántartás-import
 * `file-upload-step.tsx`-ében élt monolitikusan együtt a tagnyilvántartás-
 * specifikus mode-selectorrel. A pénzügyi import-wizard miatt szétválasztottuk:
 * itt csak a generikus drag-drop + fájlkártya + tovább gomb él.
 *
 * A modulspecifikus választók (importMode, source-type, stb.) az adott modul
 * step-komponensében maradnak, és külön rendereldnek a FileDropZone fölé/alá.
 */

import { useCallback, useRef, useState } from 'react'
import {
  FileSpreadsheet,
  FileText,
  FileUp,
  Loader2,
  UploadCloud,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

const DEFAULT_ACCEPTED_EXTS = ['xlsx', 'xls', 'csv', 'xml'] as const
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024

export interface FileDropZoneProps {
  /** Az aktuálisan kiválasztott fájl, vagy null. */
  selectedFile: File | null
  /** Visszahívás új fájl elfogadásánál (validáció után). */
  onFileSelected: (file: File) => void
  /** Visszahívás a fájl eltávolításához. */
  onClearFile: () => void
  /** Visszahívás a "Tovább" gomb megnyomására. */
  onContinue: () => void
  /** Ha igaz, a "Tovább" gomb spinner-be vált és tiltott. */
  isParsing: boolean
  /** Tovább gomb felirata (alapértelmezett: "Tovább"). */
  continueButtonLabel?: string
  /** Maximum byte (alapértelmezett: 10 MB). */
  maxBytes?: number
  /** Engedélyezett kiterjesztések (alapértelmezett: xlsx/xls/csv/xml). */
  acceptedExtensions?: readonly string[]
  /** Az "accept" attribute az input mezőn (alapértelmezett: ".xlsx,.xls,.csv,.xml"). */
  acceptAttribute?: string
}

function getExt(name: string): string {
  return name.toLowerCase().split('.').pop() || ''
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function describeExt(ext: string): { label: string; Icon: typeof FileSpreadsheet } {
  switch (ext) {
    case 'xlsx':
    case 'xls':
      return { label: 'Excel táblázat', Icon: FileSpreadsheet }
    case 'csv':
      return { label: 'CSV táblázat', Icon: FileText }
    case 'xml':
      return { label: 'Excel XML (SpreadsheetML)', Icon: FileText }
    default:
      return { label: 'Ismeretlen', Icon: FileText }
  }
}

export function FileDropZone({
  selectedFile,
  onFileSelected,
  onClearFile,
  onContinue,
  isParsing,
  continueButtonLabel = 'Tovább',
  maxBytes = DEFAULT_MAX_BYTES,
  acceptedExtensions = DEFAULT_ACCEPTED_EXTS,
  acceptAttribute = '.xlsx,.xls,.csv,.xml',
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const validateAndAccept = useCallback(
    (file: File) => {
      const ext = getExt(file.name)
      if (!acceptedExtensions.includes(ext)) {
        toast.error(`Nem támogatott fájltípus (.${ext}). Elfogadott: ${acceptedExtensions.map((e) => `.${e}`).join(', ')}`)
        return
      }
      if (file.size > maxBytes) {
        const limitMb = (maxBytes / 1024 / 1024).toFixed(0)
        toast.error(`A fájl mérete meghaladja a ${limitMb} MB-os limitet.`)
        return
      }
      onFileSelected(file)
    },
    [onFileSelected, acceptedExtensions, maxBytes],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) validateAndAccept(file)
    },
    [validateAndAccept],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) validateAndAccept(file)
    },
    [validateAndAccept],
  )

  const ext = selectedFile ? getExt(selectedFile.name) : ''
  const meta = ext ? describeExt(ext) : null
  const FileIcon = meta?.Icon || FileSpreadsheet

  const formattedExtList = acceptedExtensions
    .map((e) => `.${e}`)
    .join(' / ')
  const limitMb = (maxBytes / 1024 / 1024).toFixed(0)

  return (
    <div className="space-y-4">
      {/* Drag-drop terület */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`group relative cursor-pointer overflow-hidden rounded-[1.5rem] border-2 border-dashed bg-white/80 px-6 py-10 text-center transition ${
          dragOver
            ? 'border-emerald-400 bg-emerald-50/60'
            : 'border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttribute}
          className="hidden"
          onChange={handleInputChange}
        />

        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_18px_36px_-22px_rgba(5,150,105,0.55)]">
          <UploadCloud className="size-7" />
        </div>
        <p className="mt-4 text-base font-semibold text-slate-800">
          Húzd ide a fájlt, vagy kattints a tallózáshoz
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Engedélyezett formátumok: <span className="font-mono text-xs">{formattedExtList}</span> — maximum {limitMb} MB
        </p>
      </div>

      {/* Kiválasztott fájl-kártya */}
      {selectedFile && (
        <div className="rounded-[1.5rem] bg-white/85 p-5 ring-1 ring-emerald-100 shadow-[0_18px_40px_-30px_rgba(15,118,110,0.35)]">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <FileIcon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">
                {selectedFile.name}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {meta?.label || 'Táblázat'} · {formatBytes(selectedFile.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onClearFile()
              }}
              className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Fájl eltávolítása"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              onClick={onContinue}
              disabled={isParsing}
              className="rounded-full bg-emerald-600 hover:bg-emerald-700"
            >
              {isParsing ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  Elemzés…
                </>
              ) : (
                <>
                  <FileUp className="mr-1.5 size-4" />
                  {continueButtonLabel}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
