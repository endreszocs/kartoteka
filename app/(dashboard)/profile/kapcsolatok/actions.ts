'use server'

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

/**
 * Lelkészi jóváhagyási workflow actions.
 *
 * Alapelv (gyülekezeti autonómia):
 * A gyülekezet lelkésze kizárólagosan jogosult eldönteni, hogy ki férhet hozzá
 * a gyülekezete adataihoz (könyvelő vagy egyházmegyei számvevő). A rendszer
 * értesíti, ha új kérés érkezik; ő jóváhagyja vagy elutasítja.
 *
 * A rendszergazda (admin) és a kerületi admin csak **kezdeményezhet** kérést,
 * de nem írhatja felül a lelkész döntését.
 */

export type PastorAssignmentRow = {
  id: string
  profile_id: string
  role_scope: 'konyvelo' | 'egyhazmegyei_szamvevo'
  approval_status: 'pending' | 'approved' | 'rejected' | 'revoked'
  approval_reason: string | null
  assigned_at: string
  assigned_by: string
  approved_at: string | null
  revoked_at: string | null
  revoked_reason: string | null
  target_full_name: string | null
  target_email: string | null
  initiator_full_name: string | null
}

/**
 * Lelkész saját gyülekezete érintő hozzáférési kéréseinek listája.
 * A RLS `profile_congregations_lelkesz_select` policy-ja biztosítja a szűrést,
 * de itt is explicit szűrünk a saját congregation_id-ra.
 */
export async function listMyCongregationAssignments(): Promise<{
  data?: PastorAssignmentRow[]
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (access.role !== 'lelkesz') return { error: 'Csak lelkész férhet hozzá.' }
  if (!access.profile?.congregation_id) return { error: 'Nincs gyülekezet hozzárendelve.' }

  const { data, error } = await access.supabase
    .from('profile_congregations')
    .select(`
      id, profile_id, role_scope, approval_status, approval_reason,
      assigned_at, assigned_by, approved_at, revoked_at, revoked_reason,
      target:profiles!profile_congregations_profile_id_fkey(full_name, email),
      initiator:profiles!profile_congregations_assigned_by_fkey(full_name)
    `)
    .eq('congregation_id', access.profile.congregation_id)
    .order('assigned_at', { ascending: false })

  if (error) return { error: error.message }

  type Row = {
    id: string
    profile_id: string
    role_scope: PastorAssignmentRow['role_scope']
    approval_status: PastorAssignmentRow['approval_status']
    approval_reason: string | null
    assigned_at: string
    assigned_by: string
    approved_at: string | null
    revoked_at: string | null
    revoked_reason: string | null
    target: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null
    initiator: { full_name: string | null } | { full_name: string | null }[] | null
  }

  const rows: PastorAssignmentRow[] = ((data ?? []) as unknown as Row[]).map((r) => {
    const target = Array.isArray(r.target) ? r.target[0] : r.target
    const init = Array.isArray(r.initiator) ? r.initiator[0] : r.initiator
    return {
      id: r.id,
      profile_id: r.profile_id,
      role_scope: r.role_scope,
      approval_status: r.approval_status,
      approval_reason: r.approval_reason,
      assigned_at: r.assigned_at,
      assigned_by: r.assigned_by,
      approved_at: r.approved_at,
      revoked_at: r.revoked_at,
      revoked_reason: r.revoked_reason,
      target_full_name: target?.full_name ?? null,
      target_email: target?.email ?? null,
      initiator_full_name: init?.full_name ?? null,
    }
  })

  return { data: rows }
}

/**
 * Kérés jóváhagyása.
 * A lelkész explicit jóváhagyásával lép hatályba a hozzáférés.
 */
export async function approveAssignment(
  assignmentId: string,
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (access.role !== 'lelkesz') return { error: 'Csak lelkész hagyhat jóvá kérést.' }
  if (!access.profile?.congregation_id) return { error: 'Nincs gyülekezet.' }

  // Biztonsági ellenőrzés: csak a saját gyülekezeted kérését hagyhatod jóvá
  const { data: existing } = await access.supabase
    .from('profile_congregations')
    .select('id, congregation_id, approval_status, profile_id')
    .eq('id', assignmentId)
    .maybeSingle()

  if (!existing) return { error: 'Kérés nem található.' }
  if (existing.congregation_id !== access.profile.congregation_id) {
    return { error: 'Csak a saját gyülekezeted kéréseit kezelheted.' }
  }
  if (existing.approval_status === 'approved') {
    return { error: 'Ez a kérés már jóvá van hagyva.' }
  }

  const { error } = await access.supabase
    .from('profile_congregations')
    .update({
      approval_status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: access.user.id,
      active: true,
      // ha korábban rejected/revoked volt, ezeket nullázzuk
      revoked_at: null,
      revoked_by: null,
      revoked_reason: null,
    })
    .eq('id', assignmentId)

  if (error) return { error: `Hiba: ${error.message}` }

  // Értesítés az érintett könyvelőnek / számvevőnek
  await access.supabase.from('ertesitesek').insert({
    user_id: existing.profile_id,
    congregation_id: existing.congregation_id,
    cim: 'Hozzáférés jóváhagyva',
    uzenet:
      'A lelkész jóváhagyta a hozzáférésedet a gyülekezethez. Most már dolgozhatsz a pénzügyi modulban.',
    tipus: 'success',
    hivatkozas: '/penzugy',
  })

  revalidatePath('/profile/kapcsolatok')
  return { success: true }
}

/**
 * Kérés elutasítása (nem aktív, nem enged hozzáférést).
 */
export async function rejectAssignment(
  assignmentId: string,
  reason: string,
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (access.role !== 'lelkesz') return { error: 'Csak lelkész utasíthat el kérést.' }
  if (!access.profile?.congregation_id) return { error: 'Nincs gyülekezet.' }

  const trimmed = (reason || '').trim()
  if (trimmed.length < 5) {
    return { error: 'Az elutasítás indoklása legalább 5 karakter legyen (a kérelmező számára).' }
  }

  const { data: existing } = await access.supabase
    .from('profile_congregations')
    .select('id, congregation_id, profile_id, approval_status')
    .eq('id', assignmentId)
    .maybeSingle()

  if (!existing) return { error: 'Kérés nem található.' }
  if (existing.congregation_id !== access.profile.congregation_id) {
    return { error: 'Csak a saját gyülekezeted kéréseit kezelheted.' }
  }

  const { error } = await access.supabase
    .from('profile_congregations')
    .update({
      approval_status: 'rejected',
      active: false,
      approval_reason: trimmed,  // az elutasítás indoklása ide kerül
    })
    .eq('id', assignmentId)

  if (error) return { error: `Hiba: ${error.message}` }

  await access.supabase.from('ertesitesek').insert({
    user_id: existing.profile_id,
    congregation_id: existing.congregation_id,
    cim: 'Hozzáférés elutasítva',
    uzenet: `A lelkész elutasította a hozzáférési kérést. Indok: "${trimmed}".`,
    tipus: 'warning',
    hivatkozas: '/profile',
  })

  revalidatePath('/profile/kapcsolatok')
  return { success: true }
}

/**
 * Korábban jóváhagyott hozzáférés visszavonása.
 * A lelkész bármikor visszavonhatja, amit korábban engedélyezett.
 */
export async function revokeAssignmentByPastor(
  assignmentId: string,
  reason: string,
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (access.role !== 'lelkesz') return { error: 'Csak lelkész vonhat vissza hozzáférést.' }
  if (!access.profile?.congregation_id) return { error: 'Nincs gyülekezet.' }

  const trimmed = (reason || '').trim()
  if (trimmed.length < 5) {
    return { error: 'A visszavonás indoklása legalább 5 karakter legyen.' }
  }

  const { data: existing } = await access.supabase
    .from('profile_congregations')
    .select('id, congregation_id, profile_id, approval_status')
    .eq('id', assignmentId)
    .maybeSingle()

  if (!existing) return { error: 'Kérés nem található.' }
  if (existing.congregation_id !== access.profile.congregation_id) {
    return { error: 'Csak a saját gyülekezeted kéréseit kezelheted.' }
  }
  if (existing.approval_status !== 'approved') {
    return { error: 'Csak jóváhagyott hozzáférést lehet visszavonni.' }
  }

  const { error } = await access.supabase
    .from('profile_congregations')
    .update({
      approval_status: 'revoked',
      active: false,
      revoked_at: new Date().toISOString(),
      revoked_by: access.user.id,
      revoked_reason: trimmed,
    })
    .eq('id', assignmentId)

  if (error) return { error: `Hiba: ${error.message}` }

  await access.supabase.from('ertesitesek').insert({
    user_id: existing.profile_id,
    congregation_id: existing.congregation_id,
    cim: 'Hozzáférés visszavonva',
    uzenet: `A lelkész visszavonta a korábban adott hozzáférést. Indok: "${trimmed}".`,
    tipus: 'warning',
    hivatkozas: '/profile',
  })

  revalidatePath('/profile/kapcsolatok')
  return { success: true }
}
