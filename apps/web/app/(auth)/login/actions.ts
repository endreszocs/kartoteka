'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { loginSchema, type LoginInput } from '@/lib/validations/auth'
import { isMasterAdmin } from '@/lib/auth/roles'

export async function signIn(data: LoginInput) {
  const parsed = loginSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    // Hibakódok fordítása
    if (error.message.includes('Email not confirmed')) {
      return { error: 'Kérem, erősítse meg az e-mail címét a fiókjába küldött linkkel!' }
    }
    return { error: 'Érvénytelen e-mail cím vagy jelszó.' }
  }

  // Profil ellenőrzés
  const { data: profile } = await supabase
    .from('profiles')
    .select('status, role, congregation_id')
    .eq('id', authData.user.id)
    .single()

  const master = isMasterAdmin(authData.user.email)
  const isActive = profile?.status === 'active'

  if (!master && !isActive) {
    await supabase.auth.signOut()
    return { error: 'Fiókja még jóváhagyásra vár a kerületi SzuperAdmin által!' }
  }

  // A root oldal egységesen az aktív profil-scope alapján dönt.
  redirect('/')
}
