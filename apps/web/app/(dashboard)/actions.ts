'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SESSION_MODE_COOKIE } from '@/lib/auth/session-mode'

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  // session-mode cookie törlése (egyébként a következő login-ig megmaradna a böngészőben)
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_MODE_COOKIE)
  redirect('/login')
}
