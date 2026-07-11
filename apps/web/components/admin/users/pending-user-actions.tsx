'use client'

import { UserCheck, UserX } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface PendingUserActionsProps {
  isPending: boolean
  /**
   * Van-e regisztrációs kérelme a felhasználónak. Ha igen, a jóváhagyás a
   * TELJES kérelem-elbírálást futtatja (aktiválás + kért gyülekezet
   * hozzárendelése + email) — a gombfelirat ezt tükrözi. (2026-07-11 fix: a
   * korábbi tooltip épp az ellenkezőjét állította.)
   */
  hasRequest?: boolean
  onQuickApprove: () => void
  onReject: () => void
}

/**
 * Pending fiók akciói. A "+ Új szerepkör" választó egyetlen kattintással
 * már aktivál + gyülekezet-hozzárendelést is végez (D6, activate-on-role-assign),
 * ezért az "Aktiválás gyülekezettel" külön gombra nincs szükség.
 *
 * Két út marad:
 * - Jóváhagyás — kérelemmel: teljes elbírálás; kérelem nélkül: sima aktiválás
 * - "Elutasítás" — pending → rejected
 */
export function PendingUserActions({
  isPending,
  hasRequest = false,
  onQuickApprove,
  onReject,
}: PendingUserActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        size="sm"
        onClick={onQuickApprove}
        disabled={isPending}
        className="min-h-9 gap-1 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
        title={
          hasRequest
            ? 'A kérelem jóváhagyása egy lépésben: aktiválja a fiókot, hozzárendeli a kért gyülekezetet és értesítő emailt küld.'
            : 'A fiók aktiválódik gyülekezet és szerepkör nélkül. Gyülekezetet és szerepkört a „+ Új szerepkör” gombbal rendelhet hozzá (az egyúttal aktivál is).'
        }
      >
        <UserCheck className="size-3.5" />
        {hasRequest ? 'Jóváhagyás és aktiválás' : 'Felhasználó aktiválása'}
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
