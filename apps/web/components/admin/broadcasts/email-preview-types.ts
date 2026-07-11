/**
 * E-mail előnézet — közös típusok (2026-07-11, admin-redesign 2. kör).
 *
 * Külön fájlban van, mert a broadcasts-actions.ts 'use server' fájl, és onnan
 * típus nem exportálható (runtime ReferenceError) — a szerver akció és a
 * kliens-dialógus is innen importálja (type-only, futásidőben nem létezik).
 */

import type { BroadcastTipus } from '@/lib/broadcasts/types'

export interface BroadcastEmailPreview {
  /** Az e-mail tárgya (a broadcast címe). */
  subject: string
  /** A teljes e-mail HTML — ugyanazzal a sablonnal, amivel a tényleges küldés megy. */
  html: string
  /** True = még el nem küldött (vázlat) tétel — az „Így fog kinézni" előnézete. */
  draft: boolean
  meta: {
    tipus: BroadcastTipus
    tipusLabel: string
    /** Mikor ment ki (null, ha vázlat). */
    sentAt: string | null
    /** Hány címzett kapta (null, ha vázlat). */
    recipientCount: number | null
    /** Címzés emberi nyelven (null, ha vázlat). */
    scopeLabel: string | null
    /** Volt-e e-mail kérve a kiküldéskor. */
    emailRequested: boolean
    emailSentAt: string | null
    emailError: string | null
  }
}
