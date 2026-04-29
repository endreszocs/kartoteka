'use server'

/**
 * Átjelentkezési értesítések (member_transfer_notifications) server actions.
 *
 * 2026-04-30 — Endre kérése: ha kiköltözés-import történik, a célgyülekezet
 * lelkésze rendszerüzenetet kap, és el/elutasíthatja az átjelentkezési kérelmet.
 *
 * Workflow:
 *   1. A forrás-gyülekezet lelkésze importálja az elkoltozott rekordot
 *      `hova_congregation_id` mezővel
 *   2. AFTER INSERT trigger generál egy pending member_transfer_notification-t
 *   3. A célgyülekezet lelkésze az inboxában látja (listInbound)
 *   4. Eldönti: respondToTransferNotification('accepted'|'rejected')
 *      - accepted: a tag congregation_id-je az új gyülekezetre vált
 *      - rejected: a tag marad az eredeti gyülekezetnél
 *   5. Mindkét esetben a forrás-lelkész egy ertesitesek üzenetet kap
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'

// ─── Típusok ─────────────────────────────────────────────────────────────

export interface MemberSnapshot {
  csaladnev: string | null
  k_nev: string | null
  szcs_nev: string | null
  sz_datum: string | null
  ferfi: boolean | null
  cnp: string | null
  cim: string | null
  megjegyzes: string | null
  mikor: string | null
}

export interface TransferNotification {
  id: string
  source_congregation_id: string
  target_congregation_id: string
  szemely_id: number
  elkoltozott_id: number
  member_snapshot: MemberSnapshot
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  read_at: string | null
  responded_at: string | null
  responded_by: string | null
  response_note: string | null
  source_congregation?: { name: string | null; nev_hu: string | null } | null
  target_congregation?: { name: string | null; nev_hu: string | null } | null
}

// ─── 1. listInbound — a célgyülekezet inboxa ─────────────────────────────

export async function listInboundTransferNotifications(options: {
  status?: 'pending' | 'accepted' | 'rejected' | 'all'
  limit?: number
} = {}): Promise<{ data?: TransferNotification[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!access.effectiveCongregationId) {
    return { error: 'Az átjelentkezési értesítések csak gyülekezeti scope-ban érhetők el.' }
  }

  const supabase = await createClient()
  const status = options.status || 'pending'
  const limit = options.limit || 50

  let query = supabase
    .from('member_transfer_notifications')
    .select(`
      *,
      source_congregation:congregations!source_congregation_id(name, nev_hu),
      target_congregation:congregations!target_congregation_id(name, nev_hu)
    `)
    .eq('target_congregation_id', access.effectiveCongregationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) return { error: `Lekérési hiba: ${error.message}` }
  return { data: (data as TransferNotification[]) || [] }
}

// ─── 2. listOutbound — a forrás-gyülekezet által küldött kérelmek ─────────

export async function listOutboundTransferNotifications(options: {
  status?: 'pending' | 'accepted' | 'rejected' | 'all'
  limit?: number
} = {}): Promise<{ data?: TransferNotification[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!access.effectiveCongregationId) {
    return { error: 'Az átjelentkezési értesítések csak gyülekezeti scope-ban érhetők el.' }
  }

  const supabase = await createClient()
  const status = options.status || 'all'
  const limit = options.limit || 50

  let query = supabase
    .from('member_transfer_notifications')
    .select(`
      *,
      source_congregation:congregations!source_congregation_id(name, nev_hu),
      target_congregation:congregations!target_congregation_id(name, nev_hu)
    `)
    .eq('source_congregation_id', access.effectiveCongregationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) return { error: `Lekérési hiba: ${error.message}` }
  return { data: (data as TransferNotification[]) || [] }
}

// ─── 3. count — a header badge-hez ───────────────────────────────────────

export async function countPendingTransferNotifications(): Promise<{ count: number; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { count: 0, error: 'Nincs bejelentkezett felhasználó.' }
  if (!access.effectiveCongregationId) return { count: 0 }

  const supabase = await createClient()
  const { count, error } = await supabase
    .from('member_transfer_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('target_congregation_id', access.effectiveCongregationId)
    .eq('status', 'pending')

  if (error) return { count: 0, error: error.message }
  return { count: count || 0 }
}

// ─── 4. markRead — a célgyülekezet lelkésze megnyitotta ──────────────────

export async function markTransferNotificationRead(
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('member_transfer_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null) // Csak első megnyitáskor

  if (error) return { error: `Frissítési hiba: ${error.message}` }
  return { success: true }
}

// ─── 5. respond — accepted / rejected ────────────────────────────────────

const respondSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['accepted', 'rejected']),
  note: z.string().max(500).optional(),
})

export async function respondToTransferNotification(input: {
  id: string
  status: 'accepted' | 'rejected'
  note?: string
}): Promise<{ success?: boolean; error?: string }> {
  const parsed = respondSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!access.effectiveCongregationId) {
    return { error: 'Az átjelentkezés válaszát csak gyülekezeti scope-ban lehet megadni.' }
  }

  const supabase = await createClient()

  // Lekérjük a notifikációt — ellenőrizzük, hogy a célgyülekezet lelkésze válaszol
  const { data: notif, error: fetchError } = await supabase
    .from('member_transfer_notifications')
    .select('*, source_congregation:congregations!source_congregation_id(name, nev_hu)')
    .eq('id', parsed.data.id)
    .single()

  if (fetchError || !notif) return { error: 'Nem található átjelentkezési kérelem.' }

  if (notif.target_congregation_id !== access.effectiveCongregationId) {
    return { error: 'Csak a célgyülekezet lelkésze válaszolhat erre az értesítésre.' }
  }

  if (notif.status !== 'pending') {
    return { error: `Erre az értesítésre már válaszoltak (státusz: ${notif.status}).` }
  }

  // 1. UPDATE notification → accepted/rejected
  const { error: updateError } = await supabase
    .from('member_transfer_notifications')
    .update({
      status: parsed.data.status,
      responded_at: new Date().toISOString(),
      responded_by: access.user.id,
      response_note: parsed.data.note || null,
    })
    .eq('id', parsed.data.id)

  if (updateError) return { error: `Frissítési hiba: ${updateError.message}` }

  // 2. ELFOGADÁS esetén: a tag congregation_id-je az új gyülekezetre vált
  if (parsed.data.status === 'accepted') {
    const { error: szemelyError } = await supabase
      .from('szemely')
      .update({ congregation_id: notif.target_congregation_id })
      .eq('id', notif.szemely_id)
    if (szemelyError) {
      // Ne állítsuk vissza a notifikáció státuszt — Endre megnézi külön
      return { error: `Tag áthelyezés hiba: ${szemelyError.message}` }
    }
  }

  // 3. Visszaigazolás a forrás-gyülekezet lelkészének (ertesitesek táblába)
  const sourceCongName = (notif.source_congregation as { nev_hu?: string | null; name?: string | null } | null)?.nev_hu
    || (notif.source_congregation as { name?: string | null } | null)?.name
    || 'Forrás gyülekezet'
  const memberName = `${notif.member_snapshot?.csaladnev || ''} ${notif.member_snapshot?.k_nev || ''}`.trim() || 'tag'
  const statusText = parsed.data.status === 'accepted' ? 'elfogadta' : 'elutasította'

  await supabase.from('ertesitesek').insert([{
    congregation_id: notif.source_congregation_id,
    cim: `Átjelentkezési kérelem ${statusText === 'elfogadta' ? 'elfogadva' : 'elutasítva'}: ${memberName}`,
    uzenet: `A célgyülekezet ${statusText} ${memberName} átjelentkezési kérelmét.${
      parsed.data.note ? ' Megjegyzés: ' + parsed.data.note : ''
    }`,
    tipus: parsed.data.status === 'accepted' ? 'info' : 'warning',
    user_id: null,
    hivatkozas: `/notifications/sent#${parsed.data.id}`,
  }])

  revalidatePath('/notifications')
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}
