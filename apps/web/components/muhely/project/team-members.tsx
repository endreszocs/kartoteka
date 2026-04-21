'use client'

import { Crown, UserCircle2, Users } from 'lucide-react'

import type { ProjectCollaborator } from '@/lib/missions/project'

interface TeamMembersProps {
  collaborators: ProjectCollaborator[]
}

function formatJoinedDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('hu-HU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

export function TeamMembers({ collaborators }: TeamMembersProps) {
  const owner = collaborators.find(c => c.isOwner)
  const others = collaborators.filter(c => !c.isOwner)

  return (
    <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/50 to-fuchsia-50/40 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-violet-600" />
        <h3 className="font-heading text-lg text-slate-800">
          Csapat
          <span className="ml-2 text-sm font-normal text-slate-500">
            ({collaborators.length} {collaborators.length === 1 ? 'tag' : 'tag'})
          </span>
        </h3>
      </div>

      <div className="flex flex-wrap gap-3">
        {owner && <MemberCard member={owner} />}
        {others.map(member => (
          <MemberCard key={member.user_id} member={member} />
        ))}
      </div>

      {collaborators.length === 0 && (
        <p className="text-sm text-slate-500 italic">
          Még nincs csapattag — az ötletgazdán kívül várjuk a csatlakozókat.
        </p>
      )}
    </div>
  )
}

function MemberCard({ member }: { member: ProjectCollaborator }) {
  return (
    <div
      className={`flex min-w-[180px] items-center gap-3 rounded-xl border px-3 py-2 ${
        member.isOwner
          ? 'border-amber-200 bg-amber-50/80'
          : 'border-slate-200 bg-white/70'
      }`}
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full ${
          member.isOwner ? 'bg-amber-100' : 'bg-violet-100'
        }`}
      >
        {member.isOwner ? (
          <Crown className="h-5 w-5 text-amber-600" />
        ) : (
          <UserCircle2 className="h-5 w-5 text-violet-600" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">
          {member.full_name || 'Ismeretlen'}
          {member.isOwner && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              Ötletgazda
            </span>
          )}
        </p>
        {member.congregation_name && (
          <p className="truncate text-xs text-slate-500">{member.congregation_name}</p>
        )}
        {!member.isOwner && member.joined_at && (
          <p className="truncate text-[10px] text-slate-400">
            Csatlakozott: {formatJoinedDate(member.joined_at)}
          </p>
        )}
      </div>
    </div>
  )
}
