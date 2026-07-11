'use server'

/**
 * Támogatás-KPI szerver akció az admin főoldalhoz (2026-07-11, admin-redesign 2. kör).
 *
 * A nehéz getAdminOverview lekérdezéstől függetlenül, gyorsan visszaadja a
 * nyitott támogatási jegyek számát — a „Mi vár ma?" fókusz-kártyához.
 *
 * Jogosultság: ugyanaz a guard-minta, mint a broadcasts-actions.ts-ben
 * (admin / master / egyházkerületi admin).
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getOpenSupportTicketCount } from '@/lib/support/messages'

function canView(access: Awaited<ReturnType<typeof getEffectiveAccessContext>>): boolean {
  return !!access.admin || !!access.master || !!access.egyhazkeruletiAdmin
}

export async function getOpenSupportTicketCountAction(): Promise<{
  data?: { open: number }
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canView(access)) return { error: 'Nincs jogosultsága.' }

  try {
    const open = await getOpenSupportTicketCount(access.supabase)
    return { data: { open } }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : 'A nyitott támogatási jegyek számát nem sikerült lekérdezni.',
    }
  }
}

/**
 * Rendszer-szintű admin-e a bejelentkezett néző (master vagy `admin` szerepkör).
 *
 * A kerületi admin (csak `egyhazkeruleti_admin`) NEM rendszer-szintű — neki a
 * főoldali modul-rácsban a „Rendszer" és „Veszélyes zóna" kártya rejtve marad,
 * ugyanúgy, ahogy a bal oldalsó menü is elrejti (sidebar-adaptive-v4.tsx:
 * DISTRICT_ADMIN_HIDDEN). Az `access.admin` már magában foglalja a master
 * admint is (lib/auth/roles.ts → isAdminRole).
 */
export async function getViewerIsSystemAdmin(): Promise<{
  data?: { isSystemAdmin: boolean }
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canView(access)) return { error: 'Nincs jogosultsága.' }

  return { data: { isSystemAdmin: !!access.admin || !!access.master } }
}
