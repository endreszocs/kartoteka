'use client'

import { ClipboardCheck, UserX } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface PendingUserActionsProps {
  isPending: boolean
  /** Az „Elbírálás" gomb a kétlépéses aktiváló wizardot nyitja meg. */
  onElbiral: () => void
  /** Gyors elutasítás — közvetlenül az elutasító dialógust nyitja. */
  onReject: () => void
}

/**
 * Pending fiók akciói (2026-07-11 admin-redesign 2. kör).
 *
 * A FŐ akció az „Elbírálás" — kétlépéses wizard: 1) a regisztrációs kérelem
 * áttekintése, 2) aktiválás + szerepkör-kiosztás egy lépésben. Az „Elutasítás"
 * gyors út a pending → rejected váltáshoz (ugyanez a wizard 1. lépéséből is
 * elérhető).
 */
export function PendingUserActions({ isPending, onElbiral, onReject }: PendingUserActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        size="sm"
        onClick={onElbiral}
        disabled={isPending}
        className="min-h-9 gap-1 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
        title="Kétlépéses elbírálás: a kérelem áttekintése, majd aktiválás és szerepkör-kiosztás egy lépésben."
      >
        <ClipboardCheck className="size-3.5" />
        Elbírálás
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={onReject}
        disabled={isPending}
        className="min-h-9 gap-1"
      >
        <UserX className="size-3.5" />
        Elutasítás
      </Button>
    </div>
  )
}
