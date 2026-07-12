'use client'

import { useState, useTransition } from 'react'
import {
  ExternalLink,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Files,
  Plus,
  Trash2,
  UserCircle2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { deleteDocument } from '@/app/misszios-muhely/project-actions'
import {
  categorizeDocumentType,
  formatFileSize,
  type DocumentCategory,
  type ProjectDocument,
} from '@/lib/missions/project'
import { DocumentDialog } from './document-dialog'

interface DocumentListProps {
  ideaId: string
  documents: ProjectDocument[]
  canEdit: boolean
  currentUserId: string | null
  isOwnerOrAdmin: boolean
  onChange: () => void
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('hu-HU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

function getIconAndColor(category: DocumentCategory) {
  switch (category) {
    case 'pdf':
      return { Icon: FileText, color: 'border-[#d9b0a2] text-[#a7523f] bg-[#f7e9e3]' }
    case 'kep':
      return { Icon: FileImage, color: 'border-[#cfc0cf] text-[#735f73] bg-[#f2edf2]' }
    case 'doc':
      return { Icon: FileText, color: 'border-[#b9c7b2] text-[#526943] bg-[#edf2e9]' }
    case 'tabla':
      return { Icon: FileSpreadsheet, color: 'border-[#aebfa5] text-[#526943] bg-[#e8efe4]' }
    default:
      return { Icon: File, color: 'border-[#d6cec1] text-[#72746e] bg-[#f2efe9]' }
  }
}

export function DocumentList({
  ideaId,
  documents,
  canEdit,
  currentUserId,
  isOwnerOrAdmin,
  onChange,
}: DocumentListProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function openNew() {
    setDialogOpen(true)
  }

  function handleDelete(d: ProjectDocument) {
    if (!confirm(`Biztosan törlöd a(z) „${d.nev}" dokumentumot?`)) return

    startTransition(async () => {
      const result = await deleteDocument(d.id)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Dokumentum törölve.')
      onChange()
    })
  }

  return (
    <section className="py-5 sm:py-6" aria-labelledby="documents-title">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <Files className="h-5 w-5 text-[#735f73]" />
          <div>
            <h3 id="documents-title" className="font-heading text-xl text-[#26382f]">Közös irattartó</h3>
            <p className="text-xs text-[#747b72]">
              {documents.length === 0
                ? 'Még nincsenek dokumentumok'
                : `${documents.length} ${documents.length === 1 ? 'fájl' : 'fájl'} megosztva`}
            </p>
          </div>
        </div>

        {canEdit && (
          <Button
            size="sm"
            className="min-h-11 w-full rounded-full bg-[#735f73] text-white shadow-sm hover:bg-[#5f4d5f] sm:w-auto"
            onClick={openNew}
          >
            <Plus className="mr-1 h-4 w-4" />
            Új dokumentum
          </Button>
        )}
      </div>

      {documents.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#d8cbb8] bg-[#f8f2e9] py-8 text-center text-sm italic text-[#858a80]">
          {canEdit
            ? 'Még nincs dokumentum — oszd meg az első anyagot a csapattal!'
            : 'A csapat még nem osztott meg dokumentumokat.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {documents.map(d => {
            const category = categorizeDocumentType(d.tipus)
            const { Icon, color } = getIconAndColor(category)
            const canDeleteThis =
              isOwnerOrAdmin || d.feltolto_id === currentUserId

            return (
              <li
                key={d.id}
                className="flex flex-wrap items-start gap-3 rounded-[0.95rem_0.75rem_1.05rem_0.8rem] border border-[#ded2c0] bg-[#fffdf7] p-3 transition hover:-translate-y-0.5 hover:border-[#b8a5b8] hover:shadow-sm min-[390px]:flex-nowrap motion-reduce:transition-none"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${color}`}
                >
                  <Icon className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex min-h-11 max-w-full items-center gap-1.5 text-sm font-semibold text-[#35443a] hover:text-[#735f73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/60"
                  >
                    <span className="truncate">{d.nev}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:opacity-100" />
                  </a>

                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#747b72]">
                    {d.feltolto_nev && (
                      <span className="inline-flex items-center gap-1">
                        <UserCircle2 className="h-3 w-3" />
                        {d.feltolto_nev}
                      </span>
                    )}
                    <span>• {formatDate(d.created_at)}</span>
                    {d.meret > 0 && <span>• {formatFileSize(d.meret)}</span>}
                  </div>
                </div>

                {canEdit && canDeleteThis && (
                  <div className="ml-[3.25rem] flex basis-full justify-end gap-1 min-[390px]:ml-0 min-[390px]:basis-auto">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 rounded-full text-[#8b8f87] hover:bg-[#f7e9e3] hover:text-[#a7523f]"
                      onClick={() => handleDelete(d)}
                      disabled={isPending}
                      title="Törlés és új link feltöltése"
                      aria-label={`${d.nev} dokumentum törlése`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <DocumentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ideaId={ideaId}
        onSaved={onChange}
      />
    </section>
  )
}
