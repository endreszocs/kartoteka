'use client'

import { useCallback, useRef, useState } from 'react'
import { FileSpreadsheet, FileText, FileUp, Loader2, UploadCloud, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

const ACCEPT = '.xlsx,.xls,.csv,.xml'
const ACCEPTED_EXTS = ['xlsx', 'xls', 'csv', 'xml']
const MAX_BYTES = 10 * 1024 * 1024

interface FileUploadStepProps {
  selectedFile: File | null
  onFileSelected: (file: File) => void
  onClearFile: () => void
  onContinue: () => void
  isParsing: boolean
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

export function FileUploadStep({
  selectedFile,
  onFileSelected,
  onClearFile,
  onContinue,
  isParsing,
}: FileUploadStepProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const validateAndAccept = useCallback(
    (file: File) => {
      const ext = getExt(file.name)
      if (!ACCEPTED_EXTS.includes(ext)) {
        toast.error(`Nem támogatott fájltípus (.${ext}). Elfogadott: .xlsx, .xls, .csv, .xml`)
        return
      }
      if (file.size > MAX_BYTES) {
        toast.error('A fájl mérete meghaladja a 10 MB-os limitet.')
        return
      }
      onFileSelected(file)
    },
    [onFileSelected],
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
          accept={ACCEPT}
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
          Excel <span className="font-mono text-xs">.xlsx / .xls</span>, CSV{' '}
          <span className="font-mono text-xs">.csv</span> vagy Excel XML{' '}
          <span className="font-mono text-xs">.xml</span> — maximum 10 MB
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
                  Tovább az oszlop-párosításhoz
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
