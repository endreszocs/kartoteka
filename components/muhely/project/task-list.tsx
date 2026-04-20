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

export function TaskList({
  ideaId,
  tasks,
  collaborators,
  canEdit,
  canDelete,
  currentUserId,
  onChange,
}: TaskListProps) {
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
    const next: TaskStatus =
      task.statusz === 'fuggeben'
        ? 'folyamatban'
        : task.statusz === 'folyamatban'
        ? 'kesz'
        : 'fuggeben'

    startTransition(async () => {
      const result = await updateTaskStatus({ taskId: task.id, newStatus: next })
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      if (next === 'kesz' && task.felelos_id) {
        toast.success(`Feladat elvégezve! ${task.felelos_nev || 'A felelős'} +10 pontot kapott.`)
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <ListTodo className="h-5 w-5 text-violet-600" />
          <div>
            <h3 className="font-heading text-lg text-slate-800">Feladatok</h3>
            <p className="text-xs text-slate-500">
              {tasks.length === 0
                ? 'Még nincs feladat'
                : `${doneCount} / ${tasks.length} kész — ${progress}% kidolgozottság`}
            </p>
          </div>
        </div>

        {canEdit && (
          <Button
            size="sm"
            className="rounded-xl bg-violet-600 hover:bg-violet-700"
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
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="py-8 text-center text-sm italic text-slate-400">
          {canEdit
            ? 'Még nincs feladat — tervezd meg az első lépést!'
            : 'A csapat még nem rögzített feladatokat.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {tasks.map(task => {
            const overdue = isOverdue(task.hatarido, task.statusz as TaskStatus)
            const canCycle =
              canEdit &&
              (task.felelos_id === currentUserId || // a felelős
                canDelete) // vagy az ötletgazda/admin

            return (
              <li
                key={task.id}
                className={`flex gap-3 rounded-xl border bg-white p-3 transition hover:shadow-sm ${
                  task.statusz === 'kesz'
                    ? 'border-emerald-100 bg-emerald-50/30'
                    : 'border-slate-100'
                }`}
              >
                <button
                  type="button"
                  onClick={() => canCycle && cycleStatus(task)}
                  disabled={!canCycle || isPending}
                  className="mt-0.5 shrink-0 text-slate-400 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
                  title={canCycle ? 'Státusz váltása' : 'Csak a felelős vagy az ötletgazda módosíthat'}
                >
                  {task.statusz === 'kesz' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : task.statusz === 'folyamatban' ? (
                    <Timer className="h-5 w-5 text-amber-600" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium ${
                      task.statusz === 'kesz' ? 'text-slate-500 line-through' : 'text-slate-800'
                    }`}
                  >
                    {task.cim}
                  </p>
                  {task.leiras && (
                    <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">{task.leiras}</p>
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
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <UserCircle2 className="h-3 w-3" />
                        {task.felelos_nev}
                      </span>
                    )}
                    {task.hatarido && (
                      <span
                        className={`inline-flex items-center gap-1 ${
                          overdue ? 'text-red-600' : 'text-slate-500'
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
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-violet-600"
                      onClick={() => openEdit(task)}
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
                        onClick={() => handleDelete(task)}
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

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ideaId={ideaId}
        collaborators={collaborators}
        existing={editingTask}
        onSaved={onChange}
      />
    </div>
  )
}
