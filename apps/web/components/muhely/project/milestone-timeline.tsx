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
  MILESTONE_STATE_LABELS,
  getMilestoneState,
  type MilestoneState,
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

const MILESTONE_STYLES: Record<MilestoneState, string> = {
  teljesitve: 'border-[#aebfa5] bg-[#e8efe4] text-[#526943]',
  lejart: 'border-[#dbb1a3] bg-[#f7e7e1] text-[#a4513c]',
  kozelgo: 'border-[#dfc48f] bg-[#fbf0d8] text-[#8c6634]',
  nyitott: 'border-[#d6cec1] bg-[#f2efe9] text-[#72746e]',
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
      const result = await toggleMilestoneCompleted({
        id: m.id,
        expectedCompleted: m.teljesitve,
        expectedRevision: m.revision,
      })
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
    <section className="py-5 sm:py-6" aria-labelledby="milestones-title">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <Flag className="h-5 w-5 text-[#c08a43]" />
          <div>
            <h3 id="milestones-title" className="font-heading text-xl text-[#26382f]">Mérföldkövek az ösvényen</h3>
            <p className="text-xs text-[#747b72]">
              {milestones.length === 0
                ? 'Még nincsenek mérföldkövek'
                : `${completedCount} / ${milestones.length} teljesítve`}
            </p>
          </div>
        </div>

        {canEdit && (
          <Button
            size="sm"
            className="min-h-11 w-full rounded-full bg-[#b77d35] text-white shadow-sm hover:bg-[#996527] sm:w-auto"
            onClick={openNew}
          >
            <Plus className="mr-1 h-4 w-4" />
            Új mérföldkő
          </Button>
        )}
      </div>

      {milestones.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#d8cbb8] bg-[#f8f2e9] py-8 text-center text-sm italic text-[#858a80]">
          {canEdit
            ? 'Még nincs mérföldkő — add meg a projekt első kulcspontját!'
            : 'A csapat még nem határozta meg a mérföldköveket.'}
        </p>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute bottom-2 left-[10px] top-2 w-0.5 bg-gradient-to-b from-[#d3a45e] via-[#8fa27e] to-[#d8cbb8]" />

          <ul className="space-y-3">
            {milestones.map(m => {
              const state = getMilestoneState(m)

              return (
                <li key={m.id} className="relative pl-12">
                  {/* Timeline dot */}
                  <button
                    type="button"
                    onClick={() => canEdit && handleToggle(m)}
                    disabled={!canEdit || isPending}
                    className="absolute -left-[11px] -top-2 z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fffdf7] transition hover:scale-110 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/60 motion-reduce:transition-none"
                    title={canEdit ? 'Státusz váltása' : undefined}
                    aria-label={canEdit ? `${m.cim} teljesítési állapotának váltása` : `${m.cim} mérföldkő`}
                  >
                    {m.teljesitve ? (
                      <CheckCircle2 className="h-5 w-5 text-[#58734f]" />
                    ) : state === 'lejart' ? (
                      <AlertTriangle className="h-5 w-5 text-[#b35b45]" />
                    ) : state === 'kozelgo' ? (
                      <Circle className="h-5 w-5 text-[#c08a43]" strokeWidth={3} />
                    ) : (
                      <Circle className="h-5 w-5 text-[#b8b7ae]" />
                    )}
                  </button>

                  {/* Card */}
                  <div
                    className={`rounded-[0.95rem_0.75rem_1.05rem_0.8rem] border px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-sm motion-reduce:transition-none ${
                      m.teljesitve
                        ? 'border-[#b9c8b0] bg-[#edf2e9]'
                        : state === 'lejart'
                        ? 'border-[#dbb1a3] bg-[#f9ece7]'
                        : state === 'kozelgo'
                        ? 'border-[#dfc99e] bg-[#fbf3e4]'
                        : 'border-[#ded2c0] bg-[#fffdf7]'
                    }`}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${MILESTONE_STYLES[state]}`}
                      >
                        {MILESTONE_STATE_LABELS[state]}
                      </span>
                      {m.hatarido && (
                        <span className="inline-flex items-center gap-1 text-xs text-[#70776e]">
                          <Calendar className="h-3 w-3" />
                          {formatDate(m.hatarido)}
                        </span>
                      )}
                      {m.teljesitve && m.teljesitve_datum && (
                        <span className="inline-flex items-center gap-1 text-xs text-[#526943]">
                          <CheckCircle2 className="h-3 w-3" />
                          Teljesítve: {formatDate(m.teljesitve_datum.split('T')[0] || m.teljesitve_datum)}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-start justify-between gap-2 min-[390px]:flex-nowrap">
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-medium ${
                            m.teljesitve ? 'text-[#7e857b] line-through' : 'text-[#35443a]'
                          }`}
                        >
                          {m.cim}
                        </p>
                        {m.leiras && (
                          <p className="mt-1 whitespace-pre-line text-xs leading-5 text-[#687066]">
                            {m.leiras}
                          </p>
                        )}
                      </div>

                      {canEdit && (
                        <div className="flex basis-full justify-end gap-1 min-[390px]:basis-auto">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 rounded-full text-[#8b8f87] hover:bg-[#fbf0d8] hover:text-[#996527]"
                            onClick={() => openEdit(m)}
                            disabled={isPending}
                            title="Szerkesztés"
                            aria-label={`${m.cim} mérföldkő szerkesztése`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 rounded-full text-[#8b8f87] hover:bg-[#f7e9e3] hover:text-[#a7523f]"
                              onClick={() => handleDelete(m)}
                              disabled={isPending}
                              title="Törlés"
                              aria-label={`${m.cim} mérföldkő törlése`}
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
    </section>
  )
}
