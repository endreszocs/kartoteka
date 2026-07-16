'use client'

import { useState, useTransition } from 'react'
import {
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  ListTodo,
  Pencil,
  Plus,
  Timer,
  Trash2,
  UserCircle2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useRewardCelebration } from '@/components/muhely/rewards/use-reward-celebration'
import { deleteTask, updateTaskStatus } from '@/app/misszios-muhely/project-actions'
import {
  TASK_STATUS_COLORS,
  TASK_STATUS_LABELS,
  calculateProjectProgress,
  type ProjectCollaborator,
  type ProjectTask,
  type TaskStatus,
} from '@/lib/missions/project'
import { TaskDialog } from './task-dialog'

interface TaskListProps {
  ideaId: string
  tasks: ProjectTask[]
  collaborators: ProjectCollaborator[]
  canEdit: boolean
  canUpdateStatus: boolean
  canDelete: boolean
  currentUserId: string | null
  onChange: () => void
}

function formatDeadline(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function isOverdue(iso: string | null, status: TaskStatus): boolean {
  if (!iso || status === 'kesz') return false
  try {
    return new Date(iso).getTime() < Date.now()
  } catch {
    return false
  }
}

function nextStatusFor(status: TaskStatus): TaskStatus {
  if (status === 'fuggeben') return 'folyamatban'
  if (status === 'folyamatban') return 'kesz'
  return 'fuggeben'
}

export function TaskList({
  ideaId,
  tasks,
  collaborators,
  canEdit,
  canUpdateStatus,
  canDelete,
  currentUserId,
  onChange,
}: TaskListProps) {
  const celebrateReward = useRewardCelebration()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null)
  const [isPending, startTransition] = useTransition()

  const progress = calculateProjectProgress(tasks)
  const doneCount = tasks.filter(t => t.statusz === 'kesz').length

  function openNew() {
    setEditingTask(null)
    setDialogOpen(true)
  }

  function openEdit(task: ProjectTask) {
    setEditingTask(task)
    setDialogOpen(true)
  }

  function cycleStatus(task: ProjectTask) {
    // fuggeben → folyamatban → kesz → fuggeben
    const next = nextStatusFor(task.statusz)

    startTransition(async () => {
      const result = await updateTaskStatus({
        taskId: task.id,
        newStatus: next,
        expectedStatus: task.statusz,
        expectedRevision: task.revision,
      })
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      if (next === 'kesz' && task.felelos_id) {
        if (result.reward?.applied) {
          if (task.felelos_id === currentUserId) {
            celebrateReward(result.reward)
          } else {
            toast.success(`Feladat elvégezve! ${task.felelos_nev || 'A felelős'} +${result.reward.points} pontot kapott.`)
          }
        } else {
          toast.success('Feladat elvégezve!')
        }
      } else {
        toast.success(`Státusz: ${TASK_STATUS_LABELS[next]}`)
      }
      onChange()
    })
  }

  function handleDelete(task: ProjectTask) {
    if (!confirm(`Biztosan törlöd a(z) „${task.cim}" feladatot?`)) return

    startTransition(async () => {
      const result = await deleteTask(task.id)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Feladat törölve.')
      onChange()
    })
  }

  return (
    <section className="py-5 sm:py-6" aria-labelledby="tasks-title">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <ListTodo className="h-5 w-5 text-[#647a52]" />
          <div>
            <h3 id="tasks-title" className="font-heading text-xl text-[#26382f]">Következő lépések</h3>
            <p className="text-xs text-[#747b72]">
              {tasks.length === 0
                ? 'Még nincs feladat'
                : `${doneCount} / ${tasks.length} kész — ${progress}% kidolgozottság`}
            </p>
          </div>
        </div>

        {canEdit && (
          <Button
            size="sm"
            className="min-h-11 w-full rounded-full bg-[#314b3b] text-white shadow-sm hover:bg-[#26382f] sm:w-auto"
            onClick={openNew}
          >
            <Plus className="mr-1 h-4 w-4" />
            Új feladat
          </Button>
        )}
      </div>

      {/* Progressbar */}
      {tasks.length > 0 && (
        <div className="mb-4">
          <div className="h-2.5 w-full overflow-hidden rounded-full border border-[#ded1be] bg-[#eee6da] p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#647a52] via-[#8da075] to-[#d3a45e] transition-all duration-500 motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-label="Projektfeladatok készültsége"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            />
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#d8cbb8] bg-[#f8f2e9] py-8 text-center text-sm italic text-[#858a80]">
          {canEdit
            ? 'Még nincs feladat — tervezd meg az első lépést!'
            : 'A csapat még nem rögzített feladatokat.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {tasks.map(task => {
            const overdue = isOverdue(task.hatarido, task.statusz as TaskStatus)
            const canCycle =
              canUpdateStatus &&
              (task.felelos_id === currentUserId || // a felelős
                canDelete) // vagy az ötletgazda/admin

            return (
              <li
                key={task.id}
                className={`flex flex-wrap gap-3 rounded-[0.95rem_0.75rem_1.05rem_0.8rem] border p-3 transition hover:-translate-y-0.5 hover:shadow-sm min-[390px]:flex-nowrap motion-reduce:transition-none ${
                  task.statusz === 'kesz'
                    ? 'border-[#b9c8b0] bg-[#edf2e9]'
                    : 'border-[#ded2c0] bg-[#fffdf7]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => canCycle && cycleStatus(task)}
                  disabled={!canCycle || isPending}
                  className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#9a9e95] transition hover:scale-110 hover:text-[#647a52] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/60 motion-reduce:transition-none"
                  title={canCycle ? 'Státusz váltása' : 'Csak a felelős vagy az ötletgazda módosíthat'}
                  aria-label={
                    canCycle
                      ? `${task.cim}: jelenleg ${TASK_STATUS_LABELS[task.statusz]}, következő ${TASK_STATUS_LABELS[nextStatusFor(task.statusz)]}`
                      : `${task.cim} állapota nem módosítható`
                  }
                >
                  {task.statusz === 'kesz' ? (
                    <CheckCircle2 className="h-5 w-5 text-[#58734f]" />
                  ) : task.statusz === 'folyamatban' ? (
                    <Timer className="h-5 w-5 text-[#b27c38]" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium ${
                      task.statusz === 'kesz' ? 'text-[#7e857b] line-through' : 'text-[#35443a]'
                    }`}
                  >
                    {task.cim}
                  </p>
                  {task.leiras && (
                    <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[#687066]">{task.leiras}</p>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        TASK_STATUS_COLORS[task.statusz as TaskStatus]
                      }`}
                    >
                      {TASK_STATUS_LABELS[task.statusz as TaskStatus]}
                    </span>
                    {task.felelos_nev && (
                      <span className="inline-flex items-center gap-1 text-[#70776e]">
                        <UserCircle2 className="h-3 w-3" />
                        {task.felelos_nev}
                      </span>
                    )}
                    {task.hatarido && (
                      <span
                        className={`inline-flex items-center gap-1 ${
                          overdue ? 'text-[#ad4f3b]' : 'text-[#70776e]'
                        }`}
                      >
                        {overdue ? (
                          <Clock className="h-3 w-3" />
                        ) : (
                          <Calendar className="h-3 w-3" />
                        )}
                        {formatDeadline(task.hatarido)}
                        {overdue && ' — lejárt'}
                      </span>
                    )}
                  </div>
                </div>

                {canEdit && (
                  <div className="ml-14 flex basis-full justify-end gap-1 min-[390px]:ml-0 min-[390px]:basis-auto">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 rounded-full text-[#8b8f87] hover:bg-[#edf2e9] hover:text-[#526943]"
                      onClick={() => openEdit(task)}
                      disabled={isPending}
                      title="Szerkesztés"
                      aria-label={`${task.cim} szerkesztése`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 rounded-full text-[#8b8f87] hover:bg-[#f7e9e3] hover:text-[#a7523f]"
                        onClick={() => handleDelete(task)}
                        disabled={isPending}
                        title="Törlés"
                        aria-label={`${task.cim} törlése`}
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

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ideaId={ideaId}
        collaborators={collaborators}
        existing={editingTask}
        onSaved={onChange}
      />
    </section>
  )
}
