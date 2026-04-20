'use server'

import { createClient } from '@/lib/supabase/server'
import { isMasterAdmin } from '@/lib/auth/roles'
import { revalidatePath } from 'next/cache'

export async function exitAdminOverride() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !isMasterAdmin(user.email)) {
    return { error: 'Nincs jogosultsága ehhez a művelethez.' }
  }

  // Összes aktív override lejárttá állítása
  const { error } = await supabase
    .from('admin_access_requests')
    .update({ status: 'expired', expires_at: new Date().toISOString() })
    .eq('admin_user_id', user.id)
    .eq('status', 'approved')

  if (error) {
    return { error: `Hiba: ${error.message}` }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}
