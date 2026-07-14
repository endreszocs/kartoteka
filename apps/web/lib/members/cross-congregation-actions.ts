'use server'

/**
 * Cross-congregation matching server actions a tagnyilvántartáshoz.
 *
 * 4 export:
 *   - findPotentialCrossMatch: új vagy módosítandó tagra azonnali check
 *   - listMyNotifications: a bejelentkezett user gyülekezetéhez tartozó nyitott notifications
 *   - resolveNotification: döntés rögzítése (same_person / different_person / dismissed)
 *   - markNotificationSeen: "láttam" jelölés (a felugró ablak bezárása után)
 *
 * Adatvédelem (`feedback_gyulekezeti_autonomia`):
 * - A return type SZIGORÚAN limitált — gyülekezet név + CNP + tag-név
 * - Más gyülekezet egyéb adatait sose adjuk vissza
 */

import { revalidatePath } from 'next/cache'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'

// ─── Típusok ─────────────────────────────────────────────────────────────

export type CrossMatchConfidence = 'name_phone' | 'name_birth' | 'phone_only' | 'name_only'

export interface CrossMatchCandidate {
  matched_szemely_id: number
  matched_congregation_id: string
  matched_congregation_name: string
  egyhazi_cnp: string
  matched_csaladnev: string
  matched_k_nev: string
  confidence: CrossMatchConfidence
}

/** A másik gyülekezet LELKÉSZÉNEK hivatalos elérhetősége (kapcsolatfelvételhez). */
export interface CrossMatchPastorContact {
  congregation_id: string
  congregation_name: string
  pastor_name: string | null
  pastor_email: string | null
  pastor_phone: string | null
  congregation_email: string | null
  congregation_phone: string | null
}

export interface CrossMatchNotification {
  id: string
  notification_type: 'new_member' | 'update_match'
  triggering_szemely_id: number
  triggering_congregation_id: string
  triggering_congregation_name: string | null
  triggering_szemely_name: string | null
  matched_szemely_id: number
  matched_congregation_id: string
  matched_congregation_name: string | null
  matched_szemely_name: string | null
  matched_egyhazi_cnp: string | null
  confidence: CrossMatchConfidence
  resolution: 'same_person' | 'different_person' | 'dismissed' | null
  resolved_at: string | null
  seen_by_triggering_user_at: string | null
  seen_by_matched_user_at: string | null
  created_at: string
}

// ─── 1. find_potential_cross_congregation_match wrapper ──────────────────

export async function findPotentialCrossMatch(input: {
  csaladnev: string
  k_nev: string
  telefon?: string | null
  szDatum?: string | null  // YYYY-MM-DD
  excludeSzemelyId?: number | null
  excludeCongregationId?: string | null
}): Promise<{ data?: CrossMatchCandidate[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  if (!input.csaladnev?.trim() || !input.k_nev?.trim()) {
    return { data: [] }  // kötelező mezők hiányoznak — sose találunk
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('find_potential_cross_congregation_match', {
    p_csaladnev: input.csaladnev,
    p_k_nev: input.k_nev,
    p_telefon: input.telefon ?? null,
    p_sz_datum: input.szDatum ?? null,
    p_exclude_szemely_id: input.excludeSzemelyId ?? null,
    p_exclude_congregation_id: input.excludeCongregationId ?? access.effectiveCongregationId,
  })

  if (error) {
    return { error: `A cross-congregation keresés sikertelen: ${error.message}` }
  }

  return { data: (data as CrossMatchCandidate[]) || [] }
}

// ─── 1b. Lelkész-elérhetőség a talált gyülekezet(ek)hez ───────────────────

export async function getCrossMatchPastorContacts(
  congregationIds: string[],
): Promise<{ data?: CrossMatchPastorContact[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const ids = Array.from(new Set(congregationIds.filter(Boolean)))
  if (ids.length === 0) return { data: [] }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_cross_match_pastor_contacts', {
    p_congregation_ids: ids,
  })

  if (error) {
    return { error: `A lelkész-elérhetőség lekérdezése sikertelen: ${error.message}` }
  }

  return { data: (data as CrossMatchPastorContact[]) || [] }
}

// ─── 1c. Nyitott kereszt-gyülekezeti egyezések száma egy gyülekezethez ─────
// Import-utáni összefoglalóhoz: a DB-trigger importkor rögzíti a strong
// egyezéseket; itt megszámoljuk a gyülekezethez tartozó, még el nem döntött
// (resolution IS NULL) értesítőket. RLS-graceful: hiba esetén 0, sose blokkol.

export async function countOpenCrossMatchesForCongregation(
  congregationId: string,
): Promise<{ data?: number; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { data: 0 }

  const supabase = await createClient()
  const { count, error } = await supabase
    .from('cross_congregation_match_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('triggering_congregation_id', congregationId)
    .is('resolution', null)

  if (error) return { data: 0 } // graceful — RLS/egyéb hiba ne blokkolja az importot
  return { data: count ?? 0 }
}

// ─── 2. listMyNotifications — a saját gyülekezethez tartozó nyitott találatok ────

export async function listMyNotifications(): Promise<{
  data?: CrossMatchNotification[]
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const supabase = await createClient()

  // RLS automatikusan szűri a saját gyülekezet (triggering OR matched) alapján
  const { data: rawNotifs, error } = await supabase
    .from('cross_congregation_match_notifications')
    .select('*')
    .is('resolution', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return { error: `Notifikációk lekérdezése sikertelen: ${error.message}` }
  }

  if (!rawNotifs || rawNotifs.length === 0) {
    return { data: [] }
  }

  // Enrichment: csatoljuk a gyülekezet-neveket és tag-neveket
  const congIds = Array.from(
    new Set([
      ...rawNotifs.map((n) => n.triggering_congregation_id),
      ...rawNotifs.map((n) => n.matched_congregation_id),
    ]),
  )
  const szemelyIds = Array.from(
    new Set([
      ...rawNotifs.map((n) => n.triggering_szemely_id),
      ...rawNotifs.map((n) => n.matched_szemely_id),
    ]),
  )

  const [congRes, szemRes] = await Promise.all([
    supabase
      .from('congregations')
      .select('id, name, nev_hu')
      .in('id', congIds),
    supabase
      .from('szemely')
      .select('id, csaladnev, k_nev, cnp')
      .in('id', szemelyIds),
  ])

  const congMap = new Map<string, string>()
  ;((congRes.data || []) as Array<{ id: string; name: string | null; nev_hu: string | null }>).forEach(
    (c) => congMap.set(c.id, c.nev_hu || c.name || 'Ismeretlen gyülekezet'),
  )

  const szemMap = new Map<number, { name: string; cnp: string }>()
  ;((szemRes.data || []) as Array<{
    id: number
    csaladnev: string | null
    k_nev: string | null
    cnp: string | null
  }>).forEach((s) =>
    szemMap.set(s.id, {
      name: `${s.csaladnev || ''} ${s.k_nev || ''}`.trim(),
      cnp: s.cnp || '',
    }),
  )

  const enriched: CrossMatchNotification[] = rawNotifs.map((n) => ({
    id: n.id,
    notification_type: n.notification_type,
    triggering_szemely_id: n.triggering_szemely_id,
    triggering_congregation_id: n.triggering_congregation_id,
    triggering_congregation_name: congMap.get(n.triggering_congregation_id) ?? null,
    triggering_szemely_name: szemMap.get(n.triggering_szemely_id)?.name ?? null,
    matched_szemely_id: n.matched_szemely_id,
    matched_congregation_id: n.matched_congregation_id,
    matched_congregation_name: congMap.get(n.matched_congregation_id) ?? null,
    matched_szemely_name: szemMap.get(n.matched_szemely_id)?.name ?? null,
    matched_egyhazi_cnp: szemMap.get(n.matched_szemely_id)?.cnp ?? null,
    confidence: n.confidence,
    resolution: n.resolution,
    resolved_at: n.resolved_at,
    seen_by_triggering_user_at: n.seen_by_triggering_user_at,
    seen_by_matched_user_at: n.seen_by_matched_user_at,
    created_at: n.created_at,
  }))

  return { data: enriched }
}

// ─── 3. resolveNotification — döntés rögzítése ────────────────────────────

export async function resolveCrossNotification(
  notificationId: string,
  resolution: 'same_person' | 'different_person' | 'dismissed',
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('resolve_cross_congregation_match', {
    p_notification_id: notificationId,
    p_resolution: resolution,
  })

  if (error) {
    return { error: `Döntés rögzítése sikertelen: ${error.message}` }
  }

  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

// ─── 4. markNotificationSeen — "láttam" jelölés ───────────────────────────

export async function markNotificationSeen(
  notificationId: string,
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const supabase = await createClient()

  // Ellenőrizzük, hogy a user a triggering vagy matched congregation tagja-e
  const { data: notif, error: fetchError } = await supabase
    .from('cross_congregation_match_notifications')
    .select('triggering_congregation_id, matched_congregation_id')
    .eq('id', notificationId)
    .maybeSingle()

  if (fetchError || !notif) {
    return { error: 'Ismeretlen notifikáció.' }
  }

  const userCongregationId = access.effectiveCongregationId
  const isTrigger = notif.triggering_congregation_id === userCongregationId
  const isMatched = notif.matched_congregation_id === userCongregationId

  if (!isTrigger && !isMatched) {
    return { error: 'Nincs jogosultság ehhez a notifikációhoz.' }
  }

  const updateField = isTrigger
    ? 'seen_by_triggering_user_at'
    : 'seen_by_matched_user_at'

  const { error: updateError } = await supabase
    .from('cross_congregation_match_notifications')
    .update({ [updateField]: new Date().toISOString() })
    .eq('id', notificationId)

  if (updateError) {
    return { error: `"Láttam" jelölés sikertelen: ${updateError.message}` }
  }

  return { success: true }
}

// ─── 5. countUnseenNotifications — bell-ikon számoláshoz ──────────────────

export async function countUnseenCrossNotifications(): Promise<{
  data?: number
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!access.effectiveCongregationId) return { data: 0 }

  const supabase = await createClient()

  // RLS automatikusan szűri — itt csak a "nem látta még" rész marad
  const { count, error } = await supabase
    .from('cross_congregation_match_notifications')
    .select('id', { count: 'exact', head: true })
    .is('resolution', null)
    .or(
      `and(triggering_congregation_id.eq.${access.effectiveCongregationId},seen_by_triggering_user_at.is.null),` +
        `and(matched_congregation_id.eq.${access.effectiveCongregationId},seen_by_matched_user_at.is.null)`,
    )

  if (error) {
    return { error: `Számolás sikertelen: ${error.message}` }
  }

  return { data: count ?? 0 }
}
