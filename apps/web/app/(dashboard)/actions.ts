'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { logAuditEvent } from '@/lib/audit/log'
import { SESSION_MODE_COOKIE } from '@/lib/auth/session-mode'

export async function signOut() {
  const supabase = await createClient()
  // 2026-08-15 (8. pont D): a kijelentkezés is audit-esemény — a signOut ELŐTT
  // naplózunk, amíg az auth.uid() még a felhasználót adja.
  await logAuditEvent({ action: 'logout' }, supabase)
  await supabase.auth.signOut()
  // session-mode cookie törlése (egyébként a következő login-ig megmaradna a böngészőben)
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_MODE_COOKIE)
  redirect('/login')
}
