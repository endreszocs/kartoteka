'use client'

/**
 * 1. lépés — Üdvözlő képernyő + fájl-feltöltés.
 *
 * Egyetlen oldal: pasztorális köszöntő + 4 magyarázó kártya ("Mit fog
 * csinálni a rendszer?") + drag-drop fájl-feltöltő. A felhasználó nem lát
 * lépés-számokat, csak egy szép, egyszerű oldalt.
 *
 * 2026-05-03 (átdolgozott v2 — felhasználói visszajelzés alapján).
 */

import { useCallback, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
  UserCheck,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

interface WelcomeStepProps {
  selectedFile: File | null
  onFileSelected: (file: File) => void
  onClearFile: () => void
  onContinue: () => void
  isParsing: boolean
  /** Opcionális bevételek-XML referencia (Adatkezelő-export) — pontosítja a
   *  bevételeket (Befizetett év + hivatalos iratszám). */
  xmlFile?: File | null
  onXmlFileSelected?: (file: File) => void
  onClearXmlFile?: () => void
}

const ACCEPTED_EXTS = ['xlsx', 'xls']
const ACCEPTED_XML_EXTS = ['xml']
const MAX_BYTES = 10 * 1024 * 1024
const MAX_XML_BYTES = 50 * 1024 * 1024

function getExt(name: string): string {
  return name.toLowerCase().split('.').pop() || ''
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function WelcomeStep({
  selectedFile,
  onFileSelected,
  onClearFile,
  onContinue,
  isParsing,
  xmlFile,
  onXmlFileSelected,
  onClearXmlFile,
}: WelcomeStepProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const xmlInputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const validateAndAccept = useCallback(
    (file: File) => {
      const ext = getExt(file.name)
      if (!ACCEPTED_EXTS.includes(ext)) {
        toast.error(`Csak Excel-fájlt fogadunk el (.xlsx vagy .xls).`)
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

  const validateAndAcceptXml = useCallback(
    (file: File) => {
      if (!ACCEPTED_XML_EXTS.includes(getExt(file.name))) {
        toast.error('A referencia-fájl csak .xml lehet (bevételek YYYY.xml).')
        return
      }
      if (file.size > MAX_XML_BYTES) {
        toast.error('Az XML-referencia mérete meghaladja az 50 MB-ot.')
        return
      }
      onXmlFileSelected?.(file)
    },
    [onXmlFileSelected],
  )

  return (
    <div className="space-y-5">
      {/* Magyarázó kártyák — vizuálisan elmondja, mit fog a rendszer csinálni */}
      <div className="rounded-[1.75rem] bg-card p-6 shadow-[0_36px_90px_-40px_rgba(14,52,48,0.38)] ring-1 ring-border">
        <div className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full blur-3xl"
            style={{ background: 'color-mix(in oklab, var(--accent) 30%, transparent)' }}
          />
          <div
            className="pointer-events-none absolute -left-6 bottom-0 h-24 w-24 rounded-full blur-3xl"
            style={{ background: 'color-mix(in oklab, var(--primary) 25%, transparent)' }}
          />

          <p className="relative text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700/80">
            Mit fog csinálni
          </p>
          <h2 className="relative mt-2 font-serif text-2xl text-foreground sm:text-[1.65rem]">
            A Kartotéka beolvassa a könyvelési Excel Kassza fülét, és minden
            tételt a megfelelő helyre rögzít.
          </h2>
          <p className="relative mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Egy gombnyomással megy be minden — bevétel és kiadás együtt, ahogy
            a kasszakönyvedben szerepel. A wizard végigvezet, és minden lépés
            előtt látod, mi fog történni.
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ExplainTile
            icon={<ArrowDownToLine className="size-5" />}
            iconBg="from-emerald-500 to-green-600"
            label="Bevételek"
            description={'A „Bev. - Összeg" oszlop tételei a befizetés táblába kerülnek.'}
          />
          <ExplainTile
            icon={<ArrowUpFromLine className="size-5" />}
            iconBg="from-rose-500 to-red-600"
            label="Kiadások"
            description={'A „Kiad. - Összeg" oszlop tételei a kiadás táblába kerülnek.'}
          />
          <ExplainTile
            icon={<UserCheck className="size-5" />}
            iconBg="from-blue-500 to-indigo-600"
            label="Befizetők"
            description="A neveket megpróbáljuk a tagnyilvántartásban azonosítani."
          />
          <ExplainTile
            icon={<Building2 className="size-5" />}
            iconBg="from-violet-500 to-purple-600"
            label="Cégek"
            description={'A szervezeteket („SRL", „KFT") szöveges forrásként mentjük.'}
          />
        </div>
      </div>

      {/* Drag-drop terület */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const file = e.dataTransfer.files?.[0]
          if (file) validateAndAccept(file)
        }}
        onClick={() => inputRef.current?.click()}
        className={`group relative cursor-pointer overflow-hidden rounded-[1.75rem] border-2 border-dashed bg-card px-6 py-12 text-center transition ${
          dragOver
            ? 'border-emerald-400 bg-emerald-50/60'
            : 'border-border hover:border-emerald-300 hover:bg-emerald-50/30'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) validateAndAccept(file)
          }}
        />

        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_18px_36px_-22px_rgba(5,150,105,0.55)]">
          <UploadCloud className="size-8" />
        </div>
        <p className="mt-4 font-serif text-lg text-foreground">
          Húzd ide a kasszakönyv Excel-fájlt
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          vagy kattints a tallózáshoz · <span className="font-mono text-xs">.xlsx</span> /{' '}
          <span className="font-mono text-xs">.xls</span> · maximum 10 MB
        </p>
      </div>

      {/* Opcionális: bevételek XML referencia (pontosítás) */}
      {onXmlFileSelected && (
        <div className="rounded-[1.5rem] bg-card p-4 ring-1 ring-sky-100">
          <input
            ref={xmlInputRef}
            type="file"
            accept=".xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) validateAndAcceptXml(f)
              e.target.value = ''
            }}
          />
          {!xmlFile ? (
            <button
              type="button"
              onClick={() => xmlInputRef.current?.click()}
              className="flex w-full items-center gap-3 text-left"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <FileSpreadsheet className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Opcionális: bevételek XML referencia <span className="text-sky-600">(pontosítás)</span>
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Az Adatkezelő-export bevételek-XML fájlja a bevételeket pontosítja: a tényleges{' '}
                  <strong>befizetett évet</strong> (több-éves hátralék) és a hivatalos iratszámot is átveszi.
                </p>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <FileSpreadsheet className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{xmlFile.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  XML referencia · {formatBytes(xmlFile.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={onClearXmlFile}
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="XML referencia eltávolítása"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Kiválasztott fájl-kártya + Tovább gomb */}
      {selectedFile && (
        <div className="rounded-[1.5rem] bg-card p-5 ring-1 ring-emerald-100 shadow-[0_18px_40px_-30px_rgba(15,118,110,0.35)]">
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <FileSpreadsheet className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{selectedFile.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Excel táblázat · {formatBytes(selectedFile.size)}
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

          <div className="mt-5 flex justify-end">
            <Button
              type="button"
              onClick={onContinue}
              disabled={isParsing}
              size="lg"
              className="rounded-full bg-emerald-600 px-6 text-white shadow-md hover:bg-emerald-700"
            >
              {isParsing ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Beolvasás…
                </>
              ) : (
                <>
                  Tovább a tételek áttekintéséhez
                  <ArrowDownToLine className="ml-2 size-4 -rotate-90" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Magyarázó kártya — egy "mit fogunk csinálni" doboz
// ────────────────────────────────────────────────────────────────────────

interface ExplainTileProps {
  icon: React.ReactNode
  iconBg: string
  label: string
  description: string
}

function ExplainTile({ icon, iconBg, label, description }: ExplainTileProps) {
  return (
    <div className="rounded-2xl bg-card/60 p-4 ring-1 ring-border">
      <div
        className={`mb-3 flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${iconBg} text-white shadow-md`}
      >
        {icon}
      </div>
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}
