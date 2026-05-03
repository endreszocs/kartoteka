'use client'

import { UserCheck, UserX } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface PendingUserActionsProps {
  isPending: boolean
  onQuickApprove: () => void
  onDetailedApprove: () => void
  onReject: () => void
}

export function PendingUserActions({
  isPending,
  onQuickApprove,
  onDetailedApprove,
  onReject,
}: PendingUserActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        size="sm"
        onClick={onQuickApprove}
        disabled={isPending}
        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
        title="A fiók azonnal aktiválódik, gyülekezet hozzárendelése nélkül"
      >
        <UserCheck className="size-3.5" />
        Felhasználó aktiválása
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onDetailedApprove}
        disabled={isPending}
        title="Aktiválás egyházmegye- és gyülekezet-választással"
      >
        Aktiválás gyülekezettel…
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
