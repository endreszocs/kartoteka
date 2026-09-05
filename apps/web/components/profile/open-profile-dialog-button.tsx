'use client'

/**
 * „Adatok szerkesztése" gomb a /profile hero-jában (2026-09-05, profil-kör D10).
 *
 * A profil-dialógus a dashboard-shellben él (a fejléc nyitja); ez az oldal a
 * shell MEGLÉVŐ ablak-esemény mintáján át kéri a megnyitást
 * (`kartoteka:open-congregation-dialog` testvére) — így nem kell a dialógust
 * másodszor is beépíteni ide.
 */

import { PencilLine } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { OPEN_PROFILE_DIALOG_EVENT } from '@/app/(dashboard)/profile/profile-dialog-shared'

export function OpenProfileDialogButton() {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 gap-2"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_PROFILE_DIALOG_EVENT))}
    >
      <PencilLine className="size-4" />
      Adatok szerkesztése
    </Button>
  )
}
