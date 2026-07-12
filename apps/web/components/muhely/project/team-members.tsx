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
    <section className="py-5 sm:py-6" aria-labelledby="team-title">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-[#647a52]" />
        <h3 id="team-title" className="font-heading text-xl text-[#26382f]">
          Akik az asztal körül ülnek
          <span className="ml-2 font-sans text-xs font-normal text-[#7a8077]">
            ({collaborators.length} {collaborators.length === 1 ? 'tag' : 'tag'})
          </span>
        </h3>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {owner && <MemberCard member={owner} />}
        {others.map(member => (
          <MemberCard key={member.user_id} member={member} />
        ))}
      </div>

      {collaborators.length === 0 && (
        <p className="py-3 text-sm italic text-[#7a8077]">
          Még nincs csapattag — az ötletgazdán kívül várjuk a csatlakozókat.
        </p>
      )}
    </section>
  )
}

function MemberCard({ member }: { member: ProjectCollaborator }) {
  return (
    <div
      className={`relative flex w-full min-w-0 items-center gap-3 rounded-[0.9rem_0.7rem_1rem_0.75rem] border px-3 py-2.5 shadow-[0_7px_18px_-17px_rgba(52,43,31,.8)] transition hover:-translate-y-0.5 sm:w-auto sm:min-w-[180px] motion-reduce:transition-none ${
        member.isOwner
          ? 'border-[#dfc48f] bg-[#fbf0d8]'
          : 'border-[#d8cbb8] bg-[#fffdf7]'
      }`}
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full ${
          member.isOwner ? 'bg-[#efd9aa]' : 'bg-[#e8eee4]'
        }`}
      >
        {member.isOwner ? (
          <Crown className="h-5 w-5 text-[#9a6d2f]" />
        ) : (
          <UserCircle2 className="h-5 w-5 text-[#647a52]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[#35443a]">
          {member.full_name || 'Ismeretlen'}
          {member.isOwner && (
            <span className="ml-1.5 rounded-full bg-[#efd9aa] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#835e2c]">
              Ötletgazda
            </span>
          )}
        </p>
        {member.congregation_name && (
          <p className="truncate text-xs text-[#747b72]">{member.congregation_name}</p>
        )}
        {!member.isOwner && member.joined_at && (
          <p className="truncate text-[10px] text-[#8d9188]">
            Csatlakozott: {formatJoinedDate(member.joined_at)}
          </p>
        )}
      </div>
    </div>
  )
}
