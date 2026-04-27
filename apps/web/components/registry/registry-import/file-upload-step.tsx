'use client'

/**
 * Anyakönyvi import wizard 1. lépés — fájl feltöltés + anyakönyv-típus választás.
 *
 * A fájlnévből auto-detect: keresztelok.xml → baptism, konfirmalasok.xml → confirmation,
 * esketesek.xml → marriage, temetesek.xml → burial, bekoltozott/elkoltozott/
 * egyhazunkba_tert/egyhazunkbol_kitert.xml → 4 mozgás-típus.
 *
 * A felhasználó manuálisan felülbírálhatja a választást a drop-down-ban.
 */

import { useCallback, useRef, useState } from 'react'
import {
  BookOpen,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  FileUp,
  Loader2,
  UploadCloud,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { REGISTRY_PROFILES } from '@/lib/import/import-profiles'

const ACCEPT = '.xlsx,.xls,.csv,.xml'
const ACCEPTED_EXTS = ['xlsx', 'xls', 'csv', 'xml']
const MAX_BYTES = 10 * 1024 * 1024

interface RegistryFileUploadStepProps {
  selectedFile: File | null
  onFileSelected: (file: File) => void
  onClearFile: () => void
  onContinue: () => void
  isParsing: boolean
  /** Az aktuálisan kiválasztott profil (auto-detected vagy manuális) */
  selectedProfileKey: string
  onProfileChange: (key: string) => void
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

/**
 * Fájlnévből próbál profil-kulcsot auto-detect-elni.
 * pl. "keresztelok.xml" → 'baptism'
 */
export function detectRegistryProfileFromFilename(fileName: string): string | null {
  const lower = fileName.toLowerCase()
  for (const profile of REGISTRY_PROFILES) {
    if (profile.sheetHints?.some((hint) => lower.includes(hint.toLowerCase()))) {
      return profile.key
    }
  }
  return null
}

export function RegistryFileUploadStep({
  selectedFile,
  onFileSelected,
  onClearFile,
  onContinue,
  isParsing,
  selectedProfileKey,
  onProfileChange,
}: RegistryFileUploadStepProps) {
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
      // Auto-detect a profilt
      const detected = detectRegistryProfileFromFilename(file.name)
      if (detected && detected !== selectedProfileKey) {
        onProfileChange(detected)
        const profile = REGISTRY_PROFILES.find((p) => p.key === detected)
        if (profile) {
          toast.info(`Anyakönyv-típus felismerve: ${profile.label}`)
        }
      }
    },
    [onFileSelected, onProfileChange, selectedProfileKey],
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
  const activeProfile = REGISTRY_PROFILES.find((p) => p.key === selectedProfileKey)

  return (
    <div className="space-y-4">
      {/* Anyakönyv-típus választó */}
      <div className="rounded-[1.5rem] bg-white/85 p-5 ring-1 ring-violet-100 shadow-[0_18px_40px_-30px_rgba(124,58,237,0.25)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600">
          Anyakönyv típusa
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Mit szeretnél importálni? Ha a fájl neve felismerhető (pl. <code className="rounded bg-slate-100 px-1 text-xs">keresztelok.xml</code>),
          a rendszer automatikusan választ.
        </p>
        <select
          value={selectedProfileKey}
          onChange={(e) => onProfileChange(e.target.value)}
          className="mt-3 h-11 w-full rounded-2xl border border-violet-200 bg-white px-4 text-sm text-slate-700 shadow-sm transition focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
        >
          <option value="">— Válassz anyakönyv-típust —</option>
          {REGISTRY_PROFILES.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        {activeProfile && (
          <p className="mt-2 flex items-center gap-1 text-xs text-violet-600">
            <CheckCircle2 className="size-3" />
            {activeProfile.description}
          </p>
        )}
      </div>

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
            ? 'border-violet-400 bg-violet-50/60'
            : 'border-slate-200 hover:border-violet-300 hover:bg-violet-50/40'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={handleInputChange}
        />

        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-[0_18px_36px_-22px_rgba(124,58,237,0.55)]">
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
        <div className="rounded-[1.5rem] bg-white/85 p-5 ring-1 ring-violet-100 shadow-[0_18px_40px_-30px_rgba(124,58,237,0.35)]">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <FileIcon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">
                {selectedFile.name}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {meta?.label || 'Táblázat'} · {formatBytes(selectedFile.size)}
                {activeProfile && (
                  <>
                    {' '}·{' '}
                    <span className="inline-flex items-center gap-1 text-violet-600">
                      <BookOpen className="size-3" />
                      {activeProfile.label}
                    </span>
                  </>
                )}
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
              disabled={isParsing || !selectedProfileKey}
              className="rounded-full bg-violet-600 hover:bg-violet-700"
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
