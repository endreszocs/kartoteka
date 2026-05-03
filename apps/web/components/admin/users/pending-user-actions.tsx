'use client'

import { UserCheck, UserX } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface PendingUserActionsProps {
  isPending: boolean
  onQuickApprove: () => void
  onReject: () => void
}

/**
 * Pending fiók akciói. A "+ Új szerepkör" popover egyetlen kattintással
 * már aktivál + gyülekezet-hozzárendelést is végez (D6, activate-on-role-assign),
 * ezért az "Aktiválás gyülekezettel" külön gombra nincs szükség.
 *
 * Két út marad:
 * - "Felhasználó aktiválása" — gyülekezet/szerepkör nélkül aktivál (ritka eset)
 * - "Elutasítás" — pending → rejected
 */
export function PendingUserActions({
  isPending,
  onQuickApprove,
  onReject,
}: PendingUserActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        size="sm"
        onClick={onQuickApprove}
        disabled={isPending}
        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
        title="A fiók aktiválódik, de nem rendelünk hozzá gyülekezetet vagy szerepkört. A szerepkör-kiosztással ugyanezt egyetlen kattintással elérhetjük."
      >
        <UserCheck className="size-3.5" />
        Felhasználó aktiválása
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onReject}
        disabled={isPending}
        className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 gap-1"
      >
        <UserX className="size-3.5" />
        Elutasítás
      </Button>
    </div>
  )
}
