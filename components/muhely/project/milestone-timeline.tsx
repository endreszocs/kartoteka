'use client'

import { useState, useTransition } from 'react'
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Circle,
  Flag,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  deleteMilestone,
  toggleMilestoneCompleted,
} from '@/app/misszios-muhely/project-actions'
import {
  MILESTONE_STATE_COLORS,
  MILESTONE_STATE_LABELS,
  getMilestoneState,
  type ProjectMilestone,
} from '@/lib/missions/project'
import { MilestoneDialog } from './milestone-dialog'

interface MilestoneTimelineProps {
  ideaId: string
  milestones: ProjectMilestone[]
  canEdit: boolean
  canDelete: boolean
  onChange: () => void
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
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

export function MilestoneTimeline({
  ideaId,
  milestones,
  canEdit,
  canDelete,
  onChange,
}: MilestoneTimelineProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectMilestone | null>(null)
  const [isPending, startTransition] = useTransition()

  function openNew() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(m: ProjectMilestone) {
    setEditing(m)
    setDialogOpen(true)
  }

  function handleToggle(m: ProjectMilestone) {
    startTransition(async () => {
      const result = await toggleMilestoneCompleted(m.id)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success(m.teljesitve ? 'Mérföldkő visszavonva.' : 'Mérföldkő teljesítve! 🎉')
      onChange()
    })
  }

  function handleDelete(m: ProjectMilestone) {
    if (!confirm(`Biztosan törlöd a(z) „${m.cim}" mérföldkövet?`)) return

    startTransition(async () => {
      const result = await deleteMilestone(m.id)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Mérföldkő törölve.')
      onChange()
    })
  }

  const completedCount = milestones.filter(m => m.teljesitve).length

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <Flag className="h-5 w-5 text-amber-600" />
          <div>
            <h3 className="font-heading text-lg text-slate-800">Mérföldkövek</h3>
            <p className="text-xs text-slate-500">
              {milestones.length === 0
                ? 'Még nincsenek mérföldkövek'
                : `${completedCount} / ${milestones.length} teljesítve`}
            </p>
          </div>
        </div>

        {canEdit && (
          <Button
            size="sm"
            className="rounded-xl bg-amber-600 hover:bg-amber-700"
            onClick={openNew}
          >
            <Plus className="mr-1 h-4 w-4" />
            Új mérföldkő
          </Button>
        )}
      </div>

      {milestones.length === 0 ? (
        <p className="py-8 text-center text-sm italic text-slate-400">
          {canEdit
            ? 'Még nincs mérföldkő — add meg a projekt első kulcspontját!'
            : 'A csapat még nem határozta meg a mérföldköveket.'}
        </p>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[10px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-amber-200 via-slate-200 to-slate-100" />

          <ul className="space-y-3">
            {milestones.map(m => {
              const state = getMilestoneState(m)

              return (
                <li key={m.id} className="relative pl-8">
                  {/* Timeline dot */}
                  <button
                    type="button"
                    onClick={() => canEdit && handleToggle(m)}
                    disabled={!canEdit || isPending}
                    className="absolute left-0 top-1 z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-white transition hover:scale-110 disabled:cursor-not-allowed"
                    title={canEdit ? 'Státusz váltása' : undefined}
                  >
                    {m.teljesitve ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : state === 'lejart' ? (
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                    ) : state === 'kozelgo' ? (
                      <Circle className="h-5 w-5 text-amber-500" strokeWidth={3} />
                    ) : (
                      <Circle className="h-5 w-5 text-slate-300" />
                    )}
                  </button>

                  {/* Card */}
                  <div
                    className={`rounded-xl border px-4 py-3 transition ${
                      m.teljesitve
                        ? 'border-emerald-100 bg-emerald-50/30'
                        : state === 'lejart'
                        ? 'border-red-100 bg-red-50/30'
                        : state === 'kozelgo'
                        ? 'border-amber-100 bg-amber-50/30'
                        : 'border-slate-100 bg-white'
                    }`}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${MILESTONE_STATE_COLORS[state]}`}
                      >
                        {MILESTONE_STATE_LABELS[state]}
                      </span>
                      {m.hatarido && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <Calendar className="h-3 w-3" />
                          {formatDate(m.hatarido)}
                        </span>
                      )}
                      {m.teljesitve && m.teljesitve_datum && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Teljesítve: {formatDate(m.teljesitve_datum.split('T')[0] || m.teljesitve_datum)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-medium ${
                            m.teljesitve ? 'text-slate-500 line-through' : 'text-slate-800'
                          }`}
                        >
                          {m.cim}
                        </p>
                        {m.leiras && (
                          <p className="mt-1 text-xs text-slate-600 whitespace-pre-line">
                            {m.leiras}
                          </p>
                        )}
                      </div>

                      {canEdit && (
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-amber-600"
                            onClick={() => openEdit(m)}
                            disabled={isPending}
                            title="Szerkesztés"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-red-600"
                              onClick={() => handleDelete(m)}
                              disabled={isPending}
                              title="Törlés"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <MilestoneDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ideaId={ideaId}
        existing={editing}
        onSaved={onChange}
      />
    </div>
  )
}
