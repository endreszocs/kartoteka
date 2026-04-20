'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import {
  Eye,
  EyeOff,
  FileText,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  deleteFilingTemplate,
  listFilingTemplates,
  seedDefaultFilingTemplates,
  toggleFilingTemplateActive,
} from '@/app/(dashboard)/iktato/template-actions'
import {
  TEMPLATE_TYPE_COLORS,
  TEMPLATE_TYPE_LABELS,
  extractPlaceholders,
  type FilingTemplate,
} from '@/lib/filing/templates'
import { FilingTemplateDialog } from './filing-template-dialog'
import { FilingTemplateGenerator } from './filing-template-generator'

export function FilingTemplatesTab() {
  const [templates, setTemplates] = useState<FilingTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<FilingTemplate | null>(null)
  const [generatorOpen, setGeneratorOpen] = useState(false)
  const [generatingTemplate, setGeneratingTemplate] = useState<FilingTemplate | null>(null)
  const [isPending, startTransition] = useTransition()

  const load = useCallback(async () => {
    setLoading(true)
    const result = await listFilingTemplates({ includeInactive: showInactive })
    setLoading(false)
    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }
    setTemplates(result.data || [])
  }, [showInactive])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  function openNew() {
    setEditingTemplate(null)
    setEditorOpen(true)
  }

  function openEdit(t: FilingTemplate) {
    setEditingTemplate(t)
    setEditorOpen(true)
  }

  function openGenerator(t: FilingTemplate) {
    setGeneratingTemplate(t)
    setGeneratorOpen(true)
  }

  function handleDelete(t: FilingTemplate) {
    if (!confirm(`Biztosan törlöd a(z) "${t.nev}" sablont?`)) return

    startTransition(async () => {
      const result = await deleteFilingTemplate(t.id)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Sablon törölve.')
      void load()
    })
  }

  function handleToggle(t: FilingTemplate) {
    startTransition(async () => {
      const result = await toggleFilingTemplateActive(t.id)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t.aktiv ? 'Sablon inaktiválva.' : 'Sablon aktiválva.')
      void load()
    })
  }

  function handleSeed() {
    if (!confirm('Behúzod az alapértelmezett sablonokat? (Keresztelési-, Konfirmációs-, Esketési-, Tagsági igazolás)')) return

    startTransition(async () => {
      const result = await seedDefaultFilingTemplates()
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      const inserted = result.inserted || 0
      const skipped = result.skipped || 0
      if (inserted > 0) {
        toast.success(
          `${inserted} új sablon betöltve${skipped > 0 ? ` (${skipped} már létezett)` : ''}.`,
        )
      } else {
        toast.info('Minden alapértelmezett sablon már létezik.')
      }
      void load()
    })
  }

  const active = templates.filter(t => t.aktiv)
  const inactive = templates.filter(t => !t.aktiv)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-xl text-slate-800">Irat-sablonok</h2>
          <p className="text-sm text-slate-500">
            Hivatalos dokumentum-sablonok — placeholderekkel, PDF letöltéssel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {templates.length === 0 && !loading && (
            <Button
              variant="outline"
              className="rounded-xl border-teal-200 text-teal-700 hover:bg-teal-50"
              onClick={handleSeed}
              disabled={isPending}
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              Alapsablonok betöltése
            </Button>
          )}
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => setShowInactive(s => !s)}
          >
            {showInactive ? (
              <>
                <EyeOff className="mr-1.5 h-4 w-4" />
                Csak aktív
              </>
            ) : (
              <>
                <Eye className="mr-1.5 h-4 w-4" />
                Inaktívak is
              </>
            )}
          </Button>
          <Button
            className="rounded-xl bg-teal-600 hover:bg-teal-700"
            onClick={openNew}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Új sablon
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="card-raised flex items-center justify-center py-12">
          <Sparkles className="h-6 w-6 animate-pulse text-teal-500" />
        </div>
      ) : templates.length === 0 ? (
        <div className="card-raised p-8 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">
            Még nincs irat-sablon rögzítve.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Töltsd be az alapértelmezett igazolás-sablonokat, vagy hozz létre sajátot.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button
              variant="outline"
              className="rounded-xl border-teal-200 text-teal-700 hover:bg-teal-50"
              onClick={handleSeed}
              disabled={isPending}
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              Alapsablonok betöltése
            </Button>
            <Button
              className="rounded-xl bg-teal-600 hover:bg-teal-700"
              onClick={openNew}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Üres sablon
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Aktív sablonok */}
          {active.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {active.map(t => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onGenerate={() => openGenerator(t)}
                  onEdit={() => openEdit(t)}
                  onToggle={() => handleToggle(t)}
                  onDelete={() => handleDelete(t)}
                  disabled={isPending}
                />
              ))}
            </div>
          )}

          {/* Inaktív sablonok */}
          {showInactive && inactive.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Inaktív sablonok ({inactive.length})
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {inactive.map(t => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onGenerate={() => openGenerator(t)}
                    onEdit={() => openEdit(t)}
                    onToggle={() => handleToggle(t)}
                    onDelete={() => handleDelete(t)}
                    disabled={isPending}
                    faded
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <FilingTemplateDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        existing={editingTemplate}
        onSaved={load}
      />

      <FilingTemplateGenerator
        open={generatorOpen}
        onOpenChange={setGeneratorOpen}
        template={generatingTemplate}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TemplateCard
// ─────────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: FilingTemplate
  onGenerate: () => void
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
  disabled: boolean
  faded?: boolean
}

function TemplateCard({
  template,
  onGenerate,
  onEdit,
  onToggle,
  onDelete,
  disabled,
  faded,
}: TemplateCardProps) {
  const placeholders = extractPlaceholders(template.tartalom)

  return (
    <div
      className={`flex flex-col rounded-2xl border bg-white p-4 transition hover:shadow-md ${
        faded ? 'border-slate-100 opacity-60' : 'border-slate-200'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="font-heading text-base text-slate-800">{template.nev}</h3>
          {template.leiras && (
            <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{template.leiras}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
            TEMPLATE_TYPE_COLORS[template.tipus]
          }`}
        >
          {TEMPLATE_TYPE_LABELS[template.tipus]}
        </span>
      </div>

      {placeholders.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {placeholders.slice(0, 6).map(p => (
            <code
              key={p}
              className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700"
            >
              {'{{'}
              {p}
              {'}}'}
            </code>
          ))}
          {placeholders.length > 6 && (
            <span className="text-[10px] text-slate-400">
              +{placeholders.length - 6} további
            </span>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-slate-100 pt-3">
        <Button
          size="sm"
          className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700"
          onClick={onGenerate}
          disabled={disabled || !template.aktiv}
        >
          <Wand2 className="mr-1 h-3.5 w-3.5" />
          Generálás
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-500 hover:text-teal-600"
          onClick={onEdit}
          disabled={disabled}
          title="Szerkesztés"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-500 hover:text-amber-600"
          onClick={onToggle}
          disabled={disabled}
          title={template.aktiv ? 'Inaktiválás' : 'Aktiválás'}
        >
          {template.aktiv ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-500 hover:text-red-600"
          onClick={onDelete}
          disabled={disabled}
          title="Törlés"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
