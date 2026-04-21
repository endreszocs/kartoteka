'use client'

import { useState, useTransition } from 'react'
import {
  ExternalLink,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Files,
  Pencil,
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
      return { Icon: FileText, color: 'text-red-600 bg-red-50' }
    case 'kep':
      return { Icon: FileImage, color: 'text-purple-600 bg-purple-50' }
    case 'doc':
      return { Icon: FileText, color: 'text-blue-600 bg-blue-50' }
    case 'tabla':
      return { Icon: FileSpreadsheet, color: 'text-emerald-600 bg-emerald-50' }
    default:
      return { Icon: File, color: 'text-slate-500 bg-slate-50' }
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
  const [editing, setEditing] = useState<ProjectDocument | null>(null)
  const [isPending, startTransition] = useTransition()

  function openNew() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(d: ProjectDocument) {
    setEditing(d)
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <Files className="h-5 w-5 text-cyan-600" />
          <div>
            <h3 className="font-heading text-lg text-slate-800">Dokumentumok</h3>
            <p className="text-xs text-slate-500">
              {documents.length === 0
                ? 'Még nincsenek dokumentumok'
                : `${documents.length} ${documents.length === 1 ? 'fájl' : 'fájl'} megosztva`}
            </p>
          </div>
        </div>

        {canEdit && (
          <Button
            size="sm"
            className="rounded-xl bg-cyan-600 hover:bg-cyan-700"
            onClick={openNew}
          >
            <Plus className="mr-1 h-4 w-4" />
            Új dokumentum
          </Button>
        )}
      </div>

      {documents.length === 0 ? (
        <p className="py-8 text-center text-sm italic text-slate-400">
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
                className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 transition hover:border-cyan-200 hover:shadow-sm"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}
                >
                  <Icon className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-1.5 text-sm font-medium text-slate-800 hover:text-cyan-700"
                  >
                    <span className="truncate">{d.nev}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:opacity-100" />
                  </a>

                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
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

                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-cyan-600"
                      onClick={() => openEdit(d)}
                      disabled={isPending}
                      title="Szerkesztés"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {canDeleteThis && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-red-600"
                        onClick={() => handleDelete(d)}
                        disabled={isPending}
                        title="Törlés"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
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
        existing={editing}
        onSaved={onChange}
      />
    </div>
  )
}
