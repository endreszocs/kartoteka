'use server'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { revalidatePath } from 'next/cache'

async function getNotificationAccess() {
  const { supabase, userId, congregationId } = await getEffectiveCongregationContext()
  return { supabase, userId, congId: congregationId }
}

export async function approveAdminAccess(requestId: string, hours: number = 24) {
  const { supabase, userId, congId } = await getNotificationAccess()
  if (!userId || !congId) return { error: 'Nincs bejelentkezett felhasználó.' }

  // Kérelem lekérdezés
  const { data: request } = await supabase.from('admin_access_requests').select('id, admin_user_id, congregation_id, status').eq('id', requestId).single()
  if (!request) return { error: 'A kérelem nem található.' }
  if (request.status !== 'pending') return { error: 'A kérelem már elbírálásra került.' }
  if (request.congregation_id !== congId) return { error: 'Nincs jogosultsága ehhez a kérelemhez.' }

  // Jóváhagyás
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
  const { error } = await supabase.from('admin_access_requests').update({
    status: 'approved', approved_at: new Date().toISOString(), expires_at: expiresAt,
  }).eq('id', requestId)
  if (error) return { error: `Hiba: ${error.message}` }

  // Értesítés a kérelmezőnek
  await supabase.from('ertesitesek').insert([{
    user_id: request.admin_user_id, tipus: 'success',
    cim: 'Hozzáférés jóváhagyva',
    uzenet: `A hozzáférési kérelme jóváhagyásra került. ${hours} órán belül hozzáférhet a gyülekezet adataihoz.`,
    olvasva: false,
  }])

  revalidatePath('/', 'layout')
  return { success: true }
}

export async function denyAdminAccess(requestId: string) {
  const { supabase, userId, congId } = await getNotificationAccess()
  if (!userId || !congId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { data: request } = await supabase.from('admin_access_requests').select('id, admin_user_id, congregation_id, status').eq('id', requestId).single()
  if (!request) return { error: 'A kérelem nem található.' }
  if (request.status !== 'pending') return { error: 'A kérelem már elbírálásra került.' }
  if (request.congregation_id !== congId) return { error: 'Nincs jogosultsága ehhez a kérelemhez.' }

  const { error } = await supabase.from('admin_access_requests').update({
    status: 'denied', denied_at: new Date().toISOString(),
  }).eq('id', requestId)
  if (error) return { error: `Hiba: ${error.message}` }

  await supabase.from('ertesitesek').insert([{
    user_id: request.admin_user_id, tipus: 'danger',
    cim: 'Hozzáférés elutasítva',
    uzenet: 'A hozzáférési kérelme elutasításra került.',
    olvasva: false,
  }])

  revalidatePath('/', 'layout')
  return { success: true }
}
