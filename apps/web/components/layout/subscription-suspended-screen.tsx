'use client'

import { useState, useTransition } from 'react'
import { Building2, LifeBuoy, LogOut, PauseCircle } from 'lucide-react'

import { signOut } from '@/app/(dashboard)/actions'
import { SupportDialog } from '@/components/layout/support-dialog'
import { Button } from '@/components/ui/button'

interface SubscriptionSuspendedScreenProps {
  /** A gyülekezet neve (a fejléc-chiphez). Ismeretlen esetén null. */
  congregationName: string | null
  /** A leállítás indoklása (`suspend_reason`), ha a rendszergazda megadta. */
  reason: string | null
}

/**
 * Előfizetés-szünet képernyő — a DashboardLayout ezt rendereli a modulok HELYETT,
 * ha a gyülekezet előfizetése `suspended` állapotban van (funkció-gating).
 *
 * Hangnem: nyugodt, NEM riasztó, lelkész-barát. Nem tartalmaz fizetési/banki
 * funkciót — azt a rendszergazda kezeli; ez a képernyő csak tájékoztat és két
 * biztonságos kimenetet ad: segítségkérés (beépített kapcsolat-űrlap) és
 * kijelentkezés.
 *
 * Fontos: a „kapcsolat" szándékosan a beépített {@link SupportDialog} modál (mint
 * a /pending képernyőn), NEM a /support útvonal — az ugyanígy a dashboard-layout
 * mögött van, tehát egy suspended usernél újra ezt a képernyőt adná (kör). A modál
 * kör nélkül, megbízhatóan működik.
 */
export function SubscriptionSuspendedScreen({
  congregationName,
  reason,
}: SubscriptionSuspendedScreenProps) {
  const [supportOpen, setSupportOpen] = useState(false)
  const [isSigningOut, startSignOut] = useTransition()

  function handleSignOut() {
    startSignOut(async () => {
      await signOut()
    })
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="card-raised w-full max-w-lg p-6 text-center sm:p-8">
        {/* Ikon — PauseCircle (szünet, nem hiba): borostyán, dark-párral. */}
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <PauseCircle className="size-8" />
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Előfizetés
        </p>
        <h1 className="mt-2 font-heading text-2xl text-foreground sm:text-3xl">
          Az előfizetés jelenleg szünetel
        </h1>

        {congregationName && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium text-foreground">
            <Building2 className="size-3.5 text-muted-foreground" />
            {congregationName}
          </div>
        )}

        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          A gyülekezet előfizetése átmenetileg szünetel, ezért a Kartotéka moduljai
          most nem érhetők el. Az adatok biztonságban vannak, semmi nem veszett el.
          A hozzáférés visszaállításához kérjük, vegye fel a kapcsolatot a
          rendszergazdával.
        </p>

        {reason && (
          <div className="mx-auto mt-4 max-w-md rounded-xl border border-border bg-muted/50 px-4 py-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Indoklás
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">{reason}</p>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            size="lg"
            className="h-11 gap-2"
            onClick={() => setSupportOpen(true)}
          >
            <LifeBuoy className="size-4" />
            Segítségkérés
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-11 gap-2"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            <LogOut className="size-4" />
            {isSigningOut ? 'Kijelentkezés…' : 'Kijelentkezés'}
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          A díjazást és a hozzáférés visszaállítását a rendszergazda intézi.
        </p>

        <SupportDialog open={supportOpen} onOpenChange={setSupportOpen} />
      </div>
    </div>
  )
}
