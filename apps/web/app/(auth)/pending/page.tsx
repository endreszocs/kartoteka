import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { isMasterAdmin } from '@/lib/auth/roles'
import { PendingApprovalClient } from '@/components/auth/pending-approval-client'

/**
 * /pending — várakozó képernyő regisztráció után.
 *
 * A lelkész ide érkezik, ha a regisztrált fiókja még nincs jóváhagyva
 * (`profiles.status === 'pending'`). A bejelentkezett pending user
 * bármely védett oldalra lép, a dashboard / setup layout ide tereli vissza.
 *
 * Logika:
 *  - nincs bejelentkezve → /login
 *  - status === 'pending' → render PendingApprovalClient
 *  - status === 'active' (vagy Master Admin) → /dashboard (ő már el tud menni)
 *  - egyéb status → signOut + /login
 */
export default async function PendingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Master Admin — mindig aktív, egyenesen dashboard
  if (isMasterAdmin(user.email)) {
    redirect('/dashboard')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('status, full_name, email')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) {
    // Nincs profil rekord — kijelentkezés, vissza login-ra
    await supabase.auth.signOut()
    redirect('/login')
  }

  if (profile.status === 'active') {
    redirect('/dashboard')
  }

  if (profile.status !== 'pending') {
    // banned vagy egyéb
    await supabase.auth.signOut()
    redirect('/login')
  }

  // Keresztnév kinyerése ("Nt. Kovács János" → "János")
  const fullName = profile.full_name || ''
  const firstName = extractFirstName(fullName) || 'Lelkipásztor'

  return (
    <PendingApprovalClient
      firstName={firstName}
      fullName={fullName || null}
      email={profile.email || user.email || ''}
    />
  )
}

/**
 * Magyar név parsing — "Nt. Kovács János" → "János" (keresztnév az utolsó).
 * Ha nem tudjuk felismerni, visszaad null-t, a fallback az "Lelkipásztor".
 */
function extractFirstName(fullName: string): string | null {
  if (!fullName) return null
  const parts = fullName
    .trim()
    .replace(/^(Nt\.|Ft\.|Főt\.|Rev\.|Pál\.)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return null
  // Magyar név: Vezetéknév Keresztnév — az utolsó tag a keresztnév
  return parts[parts.length - 1]
}
