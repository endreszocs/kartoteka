'use client'

import { useState } from 'react'
import { Download, ExternalLink, FileDown, FileText, LoaderCircle, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  recordMaterialDownload,
  type WorkshopMaterial,
} from '@/app/misszios-muhely/community-actions'
import {
  downloadMaterialAsPdf,
  downloadMaterialAsWord,
} from '@/lib/missions/material-export'

function safeHttpUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : null
  } catch {
    return null
  }
}

interface MaterialActionBarProps {
  material: WorkshopMaterial
  canEdit: boolean
  pending: boolean
  onEdit: () => void
  onArchive: () => void
  onDownloaded?: (downloadCount: number) => void
}

export function MaterialActionBar({
  material,
  canEdit,
  pending,
  onEdit,
  onArchive,
  onDownloaded,
}: MaterialActionBarProps) {
  const [exporting, setExporting] = useState<'pdf' | 'word' | null>(null)
  const sourceUrl = safeHttpUrl(material.forras_url)
  const attachmentUrl = safeHttpUrl(material.csatolmany_url)

  async function registerDownload() {
    try {
      const result = await recordMaterialDownload(material.id)
      if ('error' in result) {
        console.warn('[material-export] Download counter update failed:', result.error)
        return
      }
      onDownloaded?.(result.downloadCount)
    } catch (error) {
      // A számláló hibája nem teheti semmissé a már elkészült dokumentumot.
      console.warn('[material-export] Download counter update failed', error)
    }
  }

  async function handlePdfExport() {
    setExporting('pdf')
    try {
      await downloadMaterialAsPdf(material)
      toast.success('A PDF dokumentum elkészült.')
      void registerDownload()
    } catch (error) {
      console.error('[material-export] PDF export failed', error)
      toast.error('A PDF mentése most nem sikerült. Kérlek, próbáld újra!')
    } finally {
      setExporting(null)
    }
  }

  function handleWordExport() {
    setExporting('word')
    try {
      downloadMaterialAsWord(material)
      toast.success('A Word dokumentum elkészült.')
      void registerDownload()
    } catch (error) {
      console.error('[material-export] Word export failed', error)
      toast.error('A Word dokumentum mentése most nem sikerült. Kérlek, próbáld újra!')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div
      className="flex flex-col gap-2 border-t border-dashed border-[#d8cbb8] pt-4 sm:flex-row sm:flex-wrap sm:items-center"
      data-material-action-bar
    >
      <button
        type="button"
        onClick={handleWordExport}
        disabled={pending || exporting !== null}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#314b3b] px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#26382f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e] disabled:cursor-wait disabled:opacity-60 sm:w-auto motion-reduce:transition-none"
      >
        {exporting === 'word' ? (
          <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <FileText className="h-4 w-4" aria-hidden="true" />
        )}
        Word mentése
      </button>

      <button
        type="button"
        onClick={handlePdfExport}
        disabled={pending || exporting !== null}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#8fa080] bg-[#eef3e9] px-5 py-2.5 text-sm font-semibold text-[#314b3b] transition hover:-translate-y-0.5 hover:border-[#647a52] hover:bg-[#e4eddd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#647a52]/55 disabled:cursor-wait disabled:opacity-60 sm:w-auto motion-reduce:transition-none"
      >
        {exporting === 'pdf' ? (
          <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <FileDown className="h-4 w-4" aria-hidden="true" />
        )}
        PDF mentése
      </button>

      {attachmentUrl && (
        <a
          href={attachmentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#314b3b] px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#26382f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e] sm:w-auto motion-reduce:transition-none"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Eredeti fájl
        </a>
      )}

      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#b8c2ad] bg-white px-5 py-2.5 text-sm font-semibold text-[#405444] transition hover:border-[#849674] hover:bg-[#f5f8f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#647a52]/55 sm:w-auto"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Forrás megnyitása
        </a>
      )}

      {canEdit && (
        <>
          <button
            type="button"
            onClick={onEdit}
            disabled={pending}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#d1b780] bg-[#fbf1dc] px-4 py-2.5 text-sm font-semibold text-[#74582d] transition hover:bg-[#f5e4c0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/60 sm:ml-auto sm:w-auto"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Szerkesztés
          </button>
          <button
            type="button"
            onClick={onArchive}
            disabled={pending}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-[#85877f] transition hover:bg-[#f7e9e3] hover:text-[#a7523f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87552]/50 sm:w-auto"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Archiválás
          </button>
        </>
      )}
    </div>
  )
}
