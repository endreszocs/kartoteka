import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { MissionLevel } from '@/lib/missions/gamification'

interface MuhelyUserBadgeProps {
  fullName: string
  avatarUrl: string | null
  level: MissionLevel
  points: number
  percent: number
}

function getInitials(fullName: string) {
  const nameParts = fullName.trim().split(/\s+/).filter(Boolean)

  if (nameParts.length === 0) return 'M'

  return nameParts
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toLocaleUpperCase('hu-HU')
}

export function MuhelyUserBadge({
  fullName,
  avatarUrl,
  level,
  points,
  percent,
}: MuhelyUserBadgeProps) {
  const safePercent = Math.max(0, Math.min(100, percent))

  return (
    <Link
      href="/misszios-muhely/profil"
      className="muhely-user-badge"
      aria-label={`${fullName} profilja. ${level.name}, ${points} pont.`}
    >
      <Avatar className="muhely-user-avatar" aria-hidden="true">
        {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
        <AvatarFallback className="muhely-user-avatar-fallback">
          {getInitials(fullName)}
        </AvatarFallback>
      </Avatar>

      <span className="muhely-user-copy">
        <span className="muhely-user-name">{fullName}</span>
        <span className="muhely-user-level-row">
          <span className="muhely-user-level">{level.name}</span>
          <span className="muhely-user-points">· {points} pont</span>
        </span>
        <span
          className="muhely-progress-track"
          role="progressbar"
          aria-label="Haladás a következő műhelyszint felé"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={safePercent}
        >
          <span className="muhely-progress-fill" style={{ width: `${safePercent}%` }} />
        </span>
      </span>

      <ChevronRight className="muhely-user-chevron" aria-hidden="true" />
    </Link>
  )
}
