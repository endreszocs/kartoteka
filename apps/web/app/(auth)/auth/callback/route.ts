import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isMasterAdmin } from '@/lib/auth/roles'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Session kész — profil ellenőrzés
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, status, role, congregation_id')
          .eq('id', user.id)
          .single()

        // Nincs profil → kiegészítő adatbekérés
        if (!profile) {
          return NextResponse.redirect(`${origin}/oauth-complete`)
        }

        const master = isMasterAdmin(user.email)
        const isActive = profile.status === 'active'

        if (!master && !isActive) {
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/login?error=pending`)
        }

        return NextResponse.redirect(`${origin}/`)
      }
    }
  }

  // Hiba → vissza a login-ra
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
