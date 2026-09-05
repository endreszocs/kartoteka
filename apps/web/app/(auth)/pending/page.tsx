import { redirect } from 'next/navigation'

import { PendingApprovalClient } from '@/components/auth/pending-approval-client'
import { isKnownRole, isMasterAdmin } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
// 2026-09-05 (profil-kör D7): a keresztnév-kinyerő EGY helyen él — a helyi
// másolat (Dr./Prof. előtag nélkül) „Dr. Kovács János"-ból „János" helyett
// mást adott volna, mint a fejléc.
import { extractFirstName } from '@/lib/utils/name'

/**
 * /pending — várakozó képernyő két esetre:
 *  - a fiók még jóváhagyásra vár (`status = pending`)
 *  - a fiók aktív, de nincs érvényes szerepkör rendelve hozzá
 */
export default async function PendingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  if (isMasterAdmin(user.email)) {
    redirect('/dashboard')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('status, full_name, email, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  const hasPrimaryRole = isKnownRole(profile.role)
  const waitReason =
    profile.status === 'pending'
      ? 'approval'
      : profile.status === 'active' && !hasPrimaryRole
        ? 'no-role'
        : null

  if (profile.status === 'active' && hasPrimaryRole) {
    redirect('/dashboard')
  }

  if (!waitReason) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  const fullName = profile.full_name || ''
  const firstName = extractFirstName(fullName) || 'Lelkipásztor'

  return (
    <PendingApprovalClient
      firstName={firstName}
      fullName={fullName || null}
      email={profile.email || user.email || ''}
      waitReason={waitReason}
    />
  )
}
