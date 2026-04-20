'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

/**
 * Kijelentkezés a /pending oldalról.
 * A sign-out után átirányít a login-ra.
 */
export async function signOutFromPending() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
