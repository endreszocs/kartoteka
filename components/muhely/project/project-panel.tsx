'use client'

import { useCallback, useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

import { getProjectData } from '@/app/misszios-muhely/project-actions'
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
  const [data, setData] = useState<ProjectData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const result = await getProjectData(ideaId)
    setLoading(false)
    if ('error' in result && result.error) {
      setError(result.error)
      return
    }
    if (result.data) {
      setData(result.data)
      setError(null)
    }
  }, [ideaId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (ideaStatus === 'kozos_munka' || ideaStatus === 'megvalosult') {
        void loadData()
      } else {
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
      <div className="rounded-2xl border border-violet-100 bg-violet-50/30 p-8 text-center">
        <Sparkles className="mx-auto h-6 w-6 animate-pulse text-violet-500" />
        <p className="mt-2 text-sm text-violet-700">A projekt adatai betöltődnek...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
        Hiba: {error}
      </div>
    )
  }

  if (!data) return null

  const canEdit = isOwner || isMember || isAdmin
  const canDelete = isOwner || isAdmin // csak ötletgazda vagy admin törölhet

  return (
    <div className="space-y-5">
      {/* Project header */}
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-amber-50/40 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-heading text-xl text-slate-800">
              {ideaStatus === 'megvalosult' ? 'Megvalósult projekt' : 'Közös Munka'}
            </h2>
            <p className="text-sm text-slate-600">
              {ideaStatus === 'megvalosult'
                ? 'Az ötlet megvalósult — örülünk, hogy részesei lehettünk!'
                : canEdit
                ? 'Itt tervezhetitek meg együtt a projekt lépéseit és rögzíthetitek a fejlődést.'
                : 'Itt követheted a csapat munkáját: feladatok, mérföldkövek, dokumentumok.'}
            </p>
          </div>
        </div>
      </div>

      {/* Csapattagok */}
      <TeamMembers collaborators={data.collaborators} />

      {/* Feladatok */}
      <TaskList
        ideaId={ideaId}
        tasks={data.tasks}
        collaborators={data.collaborators}
        canEdit={canEdit}
        canDelete={canDelete}
        currentUserId={currentUserId}
        onChange={loadData}
      />

      {/* Mérföldkövek */}
      <MilestoneTimeline
        ideaId={ideaId}
        milestones={data.milestones}
        canEdit={canEdit}
        canDelete={canDelete}
        onChange={loadData}
      />

      {/* Dokumentumok */}
      <DocumentList
        ideaId={ideaId}
        documents={data.documents}
        canEdit={canEdit}
        currentUserId={currentUserId}
        isOwnerOrAdmin={isOwner || isAdmin}
        onChange={loadData}
      />
    </div>
  )
}
