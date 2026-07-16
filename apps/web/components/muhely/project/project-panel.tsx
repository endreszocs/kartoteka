'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Hammer, PartyPopper, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { markIdeaRealized } from '@/app/misszios-muhely/community-actions'
import { getProjectData } from '@/app/misszios-muhely/project-actions'
import { useRewardCelebration } from '@/components/muhely/rewards/use-reward-celebration'
import { Button } from '@/components/ui/button'
import type { ProjectData } from '@/lib/missions/project'
import { DocumentList } from './document-list'
import { MilestoneTimeline } from './milestone-timeline'
import { TaskList } from './task-list'
import { TeamMembers } from './team-members'

interface ProjectPanelProps {
  ideaId: string
  ideaStatus: string | null
  currentUserId: string | null
  isOwner: boolean
  isMember: boolean
  isAdmin: boolean
}

const WOOD_GRAIN_STYLE = {
  backgroundImage:
    'repeating-linear-gradient(3deg, transparent 0, transparent 15px, rgba(74,47,29,.25) 16px, transparent 17px)',
}

/**
 * A projekt-réteg panel egy ötlet "Közös Munka" állapotában.
 *
 * Megjeleníti:
 *  - Csapattagok (TeamMembers)
 *  - Feladatok (TaskList + TaskDialog)
 *  - Mérföldkövek (MilestoneTimeline + MilestoneDialog)
 *  - Dokumentumok (DocumentList + DocumentDialog)
 *
 * Csak akkor rendereli a teljes panelt, ha az ötlet státusza
 * `kozos_munka` vagy `megvalosult`. Egyéb állapotban (uj, szavazas,
 * archivalt) nem mutatkozik.
 */
export function ProjectPanel({
  ideaId,
  ideaStatus,
  currentUserId,
  isOwner,
  isMember,
  isAdmin,
}: ProjectPanelProps) {
  const router = useRouter()
  const celebrateReward = useRewardCelebration()
  const [data, setData] = useState<ProjectData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isClosing, startClosing] = useTransition()
  const requestSequence = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      requestSequence.current += 1
    }
  }, [])

  const loadData = useCallback(async () => {
    const requestId = ++requestSequence.current
    if (mounted.current) setLoading(true)

    try {
      const result = await getProjectData(ideaId)
      if (!mounted.current || requestId !== requestSequence.current) return

      if ('error' in result && result.error) {
        setError(result.error)
        return
      }
      if (result.data) {
        setData(result.data)
        setError(null)
      }
    } catch {
      if (mounted.current && requestId === requestSequence.current) {
        setError('A projektadatok betöltése váratlanul megszakadt. Próbáld újra.')
      }
    } finally {
      if (mounted.current && requestId === requestSequence.current) {
        setLoading(false)
      }
    }
  }, [ideaId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (ideaStatus === 'kozos_munka' || ideaStatus === 'megvalosult') {
        void loadData()
      } else {
        requestSequence.current += 1
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [ideaStatus, loadData])

  // Csak kozos_munka vagy megvalosult státuszban mutatjuk
  if (ideaStatus !== 'kozos_munka' && ideaStatus !== 'megvalosult') {
    return null
  }

  if (loading) {
    return (
      <div className="rounded-[1.5rem_1rem_1.7rem_1.2rem] border border-[#d8c9b4] bg-[#fffdf7] p-8 text-center shadow-sm" aria-live="polite">
        <Sparkles className="mx-auto h-6 w-6 animate-pulse text-[#d3a45e] motion-reduce:animate-none" />
        <p className="mt-2 text-sm text-[#647a52]">A közös műhelyasztalt előkészítjük...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[#ddb8a9] bg-[#f8e9e3] p-4 text-sm text-[#944c38]" role="alert">
        Hiba: {error}
      </div>
    )
  }

  if (!data) return null

  const projectIsOpen = ideaStatus === 'kozos_munka'
  const canManagePlan = projectIsOpen && (isOwner || isAdmin)
  const canContributeDocuments = projectIsOpen && (isOwner || isMember || isAdmin)
  const canUpdateTaskStatus = projectIsOpen
  const canDelete = canManagePlan
  const doneTaskCount = data.tasks.filter((task) => task.statusz === 'kesz').length
  const isReadyToClose = data.tasks.length > 0 && doneTaskCount === data.tasks.length

  function handleMarkRealized() {
    startClosing(async () => {
      const result = await markIdeaRealized(ideaId)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }

      toast.success('A szolgálat gyümölcsöt termett!', {
        description: 'A közös műhelymunka megvalósult emlékké vált.',
      })
      if (isOwner) celebrateReward(result.reward)
      router.refresh()
    })
  }

  return (
    <section
      className="relative overflow-hidden rounded-[1.4rem] border-[5px] border-[#8a6043] bg-[#cfa77f] p-1.5 shadow-[inset_0_0_0_2px_rgba(255,255,255,.16),0_26px_48px_-30px_rgba(54,38,25,.9)] sm:border-[9px] sm:p-4"
      aria-labelledby="project-table-title"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        aria-hidden="true"
        style={WOOD_GRAIN_STYLE}
      />
      <div className="relative overflow-hidden rounded-[1rem_0.75rem_1.2rem_0.85rem] border border-[#b98e69] bg-[#fffdf7] shadow-[0_10px_24px_-16px_rgba(51,38,26,.75)]">
        <header className="relative overflow-hidden border-b border-dashed border-[#d6c8b5] bg-[#f4ebdd] p-5 sm:p-6">
          <Sparkles className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 text-[#d3a45e]/10" aria-hidden="true" />
          <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#b9c4af] bg-[#edf2e9] text-[#526943] shadow-sm">
            <Hammer className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9a7950]">
              {ideaStatus === 'megvalosult' ? 'A közös út emléke' : 'Tervezzünk együtt'}
            </span>
            <h2 id="project-table-title" className="font-heading text-2xl text-[#26382f] sm:text-3xl">
              {ideaStatus === 'megvalosult' ? 'Megvalósult szolgálat' : 'Közös műhelyasztal'}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#626b63]">
              {ideaStatus === 'megvalosult'
                ? 'Az ötlet megvalósult — örülünk, hogy részesei lehettünk!'
                : canContributeDocuments
                ? 'Itt egyetlen közös lapon látjátok a társakat, a következő lépéseket, a mérföldköveket és a megosztott anyagokat.'
                : 'Itt követheted, hogyan lesz az ötletből közös szolgálat: lépésről lépésre.'}
            </p>
          </div>
          </div>
        </header>

        {projectIsOpen ? (
          <div className="border-b border-dashed border-[#d9cdbb] bg-[linear-gradient(135deg,#f8f1e6,#fffdf7)] px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-4 rounded-[1.15rem_0.85rem_1.25rem_0.95rem] border border-[#d8c6aa] bg-[#fffaf1] p-4 shadow-[0_12px_30px_-26px_rgba(59,44,27,.9)] sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex min-w-0 items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#bfd0b5] bg-[#eaf1e6] text-[#526943]">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="font-heading text-lg text-[#2d4135]">Készen áll a megvalósításra?</p>
                  <p className="mt-1 text-sm leading-6 text-[#687066]" aria-live="polite">
                    {data.tasks.length === 0
                      ? 'A lezáráshoz előbb tervezzetek meg legalább egy feladatot.'
                      : isReadyToClose
                        ? `Mind a(z) ${data.tasks.length} feladat elkészült — itt az ünnepi pillanat.`
                        : `${doneTaskCount} / ${data.tasks.length} feladat kész. A nyitott lépések még várnak rátok.`}
                  </p>
                </div>
              </div>

              {isOwner || isAdmin ? (
                <Button
                  type="button"
                  onClick={handleMarkRealized}
                  disabled={!isReadyToClose || isClosing}
                  className="h-auto min-h-12 w-full shrink-0 whitespace-normal rounded-full border border-[#78906c] bg-gradient-to-r from-[#526943] to-[#71865f] px-3 py-2.5 text-center text-xs font-semibold leading-5 text-white shadow-[0_12px_24px_-16px_rgba(54,82,50,.9)] transition hover:-translate-y-0.5 hover:from-[#465c3a] hover:to-[#647a52] disabled:translate-y-0 disabled:border-[#d7d0c4] disabled:bg-none disabled:bg-[#e9e4dc] disabled:text-[#8a8b84] sm:w-auto sm:px-5 sm:text-sm motion-reduce:transition-none"
                >
                  <PartyPopper className="mr-2 h-4 w-4" aria-hidden="true" />
                  {isClosing ? 'Lezárjuk…' : 'Megvalósultként lezárom'}
                </Button>
              ) : (
                <p className="rounded-full border border-[#ded1be] bg-white/80 px-4 py-2.5 text-center text-xs font-medium text-[#74776f]">
                  A lezárást az ötletgazda indítja.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 border-b border-dashed border-[#d9cdbb] bg-[#eaf1e6] px-4 py-4 text-sm text-[#526943] sm:px-6">
            <PartyPopper className="h-5 w-5 shrink-0" aria-hidden="true" />
            <p><strong>Megvalósult.</strong> A projektlap emlékként megmarad, tartalma már nem módosítható.</p>
          </div>
        )}

        <div className="divide-y divide-dashed divide-[#d9cdbb] px-4 sm:px-6">
          <TeamMembers collaborators={data.collaborators} />

          <TaskList
            ideaId={ideaId}
            tasks={data.tasks}
            collaborators={data.collaborators}
            canEdit={canManagePlan}
            canUpdateStatus={canUpdateTaskStatus}
            canDelete={canDelete}
            currentUserId={currentUserId}
            onChange={loadData}
          />

          <MilestoneTimeline
            ideaId={ideaId}
            milestones={data.milestones}
            canEdit={canManagePlan}
            canDelete={canDelete}
            onChange={loadData}
          />

          <DocumentList
            ideaId={ideaId}
            documents={data.documents}
            canEdit={canContributeDocuments}
            currentUserId={currentUserId}
            isOwnerOrAdmin={isOwner || isAdmin}
            onChange={loadData}
          />
        </div>
      </div>
    </section>
  )
}
