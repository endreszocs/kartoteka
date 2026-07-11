'use server'

import { createClient } from '@/lib/supabase/server'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { revalidatePath } from 'next/cache'

export async function exitAdminOverride() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 2026-07-11 fix: az override-ot az enterCongregation (requireAdminAccess,
  // allowDistrictAdmin: true) admin ÉS kerületi admin számára is kiosztja, a
  // kilépés viszont eddig csak a master admint engedte át — egy nem-master
  // admin így SOHA nem tudott kilépni a saját override-jából ('Nincs
  // jogosultsága'), a banner gombja pedig örökre 'Kilépés...' állapotban
  // ragadt. A guard mostantól tükrözi a belépését; a lekérdezés amúgy is
  // csak a SAJÁT (admin_user_id = user.id) override-okat zárja le.
  if (!user) {
    return { error: 'Nincs bejelentkezve.' }
  }
  const access = await getEffectiveAccessContext()
  if (!access.master && !access.admin && !access.egyhazkeruletiAdmin) {
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
