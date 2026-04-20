'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

/**
 * profile_congregations hozzárendelések kezelése — admin / kerületi admin oldali actions.
 *
 * Alapelv (gyülekezeti autonómia):
 * Az admin/kerületi admin **kezdeményezhet** könyvelő vagy számvevő hozzárendelést egy
 * gyülekezethez, de a hozzáférés `pending` státusszal jön létre. A gyülekezet lelkésze
 * az /profile/kapcsolatok oldalon jóváhagyja vagy elutasítja a kérést.
 *
 * A lelkész explicit jóváhagyása nélkül az érintett könyvelő/számvevő NEM lát adatot.
 */

export type AssignmentRoleScope = 'konyvelo' | 'egyhazmegyei_szamvevo'

export type AssignmentRow = {
  id: string
  profile_id: string
  congregation_id: string
  role_scope: AssignmentRoleScope
  approval_status: 'pending' | 'approved' | 'rejected' | 'revoked'
  approval_reason: string | null
  assigned_by: string
  assigned_at: string
  approved_at: string | null
  approved_by: string | null
  active: boolean
  revoked_at: string | null
  revoked_by: string | null
  revoked_reason: string | null
  // JOIN-ok
  profile_full_name: string | null
  profile_email: string | null
  profile_role: string
  congregation_name: string | null
}

/**
 * Lista minden hozzárendelésről, opcionális szűréssel.
 * Jogosultság: admin, egyházkerületi admin, esperes, egyházmegyei admin (CSAK olvasás).
 * A szerepkör KIOSZTÁSA viszont csak admin / egyházkerületi admin jogosultsága
 * (lásd `createAssignment`, `revokeAssignment`).
 */
export async function listAssignments(options?: {
  congregationId?: string
  profileId?: string
  status?: 'pending' | 'approved' | 'rejected' | 'revoked'
}): Promise<{ data?: AssignmentRow[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  const role = access.profile?.role
  const isDioceseLevel = role === 'esperes' || role === 'egyhazmegyei_admin'
  if (!access.admin && !access.egyhazkeruletiAdmin && !isDioceseLevel) {
    return { error: 'Nincs jogosultsága a listázáshoz.' }
  }

  const supabase = access.supabase

  let query = supabase
    .from('profile_congregations')
    .select(`
      id, profile_id, congregation_id, role_scope, approval_status, approval_reason,
      assigned_by, assigned_at, approved_at, approved_by, active,
      revoked_at, revoked_by, revoked_reason,
      profile:profiles!profile_congregations_profile_id_fkey(full_name, email, role),
      congregation:congregations(nev_hu, name)
    `)
    .order('assigned_at', { ascending: false })

  if (options?.congregationId) query = query.eq('congregation_id', options.congregationId)
  if (options?.profileId) query = query.eq('profile_id', options.profileId)
  if (options?.status) query = query.eq('approval_status', options.status)

  const { data, error } = await query
  if (error) return { error: error.message }

  type Row = {
    id: string
    profile_id: string
    congregation_id: string
    role_scope: AssignmentRoleScope
    approval_status: AssignmentRow['approval_status']
    approval_reason: string | null
    assigned_by: string
    assigned_at: string
    approved_at: string | null
    approved_by: string | null
    active: boolean
    revoked_at: string | null
    revoked_by: string | null
    revoked_reason: string | null
    profile: { full_name: string | null; email: string | null; role: string } | { full_name: string | null; email: string | null; role: string }[] | null
    congregation: { nev_hu: string | null; name: string | null } | { nev_hu: string | null; name: string | null }[] | null
  }

  const rows: AssignmentRow[] = ((data ?? []) as unknown as Row[]).map((row) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile
    const cong = Array.isArray(row.congregation) ? row.congregation[0] : row.congregation
    return {
      id: row.id,
      profile_id: row.profile_id,
      congregation_id: row.congregation_id,
      role_scope: row.role_scope,
      approval_status: row.approval_status,
      approval_reason: row.approval_reason,
      assigned_by: row.assigned_by,
      assigned_at: row.assigned_at,
      approved_at: row.approved_at,
      approved_by: row.approved_by,
      active: row.active,
      revoked_at: row.revoked_at,
      revoked_by: row.revoked_by,
      revoked_reason: row.revoked_reason,
      profile_full_name: profile?.full_name ?? null,
      profile_email: profile?.email ?? null,
      profile_role: profile?.role ?? '',
      congregation_name: cong?.nev_hu || cong?.name || null,
    }
  })

  return { data: rows }
}

/**
 * Új hozzárendelés kezdeményezése (pending).
 * Értesítés jön létre a gyülekezet lelkészének.
 */
export async function createAssignment(args: {
  profileId: string
  congregationId: string
  roleScope: AssignmentRoleScope
  reason: string
}): Promise<{ success?: boolean; error?: string; assignmentId?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  // ALAPELV (2026-04-17): szerepkört CSAK admin (rendszergazda) vagy egyházkerületi admin
  // oszthat ki. Egyházmegyei admin / esperes NEM kezdeményezhet hozzárendelést.
  if (!access.admin && !access.egyhazkeruletiAdmin) {
    return { error: 'Szerepkör kiosztása csak rendszergazdai vagy egyházkerületi admin jogosultsággal lehetséges.' }
  }

  const reason = (args.reason || '').trim()
  if (reason.length < 10) {
    return { error: 'A hozzárendelés indoklása legalább 10 karakter legyen.' }
  }

  const supabase = access.supabase

  // 1. Ellenőrzés: a user megfelelő szerepkörben van (konyvelo / szamvevo)?
  const { data: targetProfile, error: profErr } = await supabase
    .from('profiles')
    .select('id, role, full_name, email, status')
    .eq('id', args.profileId)
    .maybeSingle()

  if (profErr || !targetProfile) return { error: 'A felhasználó nem található.' }

  if (targetProfile.role !== 'konyvelo' && targetProfile.role !== 'egyhazmegyei_szamvevo') {
    return { error: 'Csak könyvelő vagy egyházmegyei számvevő szerepkörhöz rendelhető gyülekezet.' }
  }

  if (targetProfile.status !== 'active') {
    return { error: 'A felhasználó még nem aktív.' }
  }

  // 2. A role_scope egyezzen a user szerepkörével
  if (args.roleScope !== targetProfile.role) {
    return { error: `A szerepkör (${targetProfile.role}) nem egyezik a kiválasztott hatókörrel (${args.roleScope}).` }
  }

  // 3. Duplikáció ellenőrzés
  const { data: existing } = await supabase
    .from('profile_congregations')
    .select('id, approval_status')
    .eq('profile_id', args.profileId)
    .eq('congregation_id', args.congregationId)
    .eq('role_scope', args.roleScope)
    .maybeSingle()

  if (existing) {
    if (existing.approval_status === 'pending') {
      return { error: 'Már van függőben lévő kérés ugyanehhez a felhasználóhoz és gyülekezethez.' }
    }
    if (existing.approval_status === 'approved') {
      return { error: 'A felhasználó már aktív hozzáféréssel rendelkezik ehhez a gyülekezethez.' }
    }
    // Ha rejected vagy revoked → újra tudjuk kezdeményezni, de UPDATE-ként
    const { error: updErr } = await supabase
      .from('profile_congregations')
      .update({
        approval_status: 'pending',
        approval_reason: reason,
        assigned_by: access.user.id,
        assigned_at: new Date().toISOString(),
        approved_at: null,
        approved_by: null,
        active: false,
        revoked_at: null,
        revoked_by: null,
        revoked_reason: null,
      })
      .eq('id', existing.id)

    if (updErr) return { error: `Hiba az újra-kezdeményezéskor: ${updErr.message}` }

    await sendPastorNotification(supabase, {
      congregationId: args.congregationId,
      assignmentId: existing.id,
      targetFullName: targetProfile.full_name,
      targetEmail: targetProfile.email,
      roleScope: args.roleScope,
      reason,
    })

    revalidatePath('/admin')
    return { success: true, assignmentId: existing.id }
  }

  // 4. Új sor létrehozása
  const { data: inserted, error: insErr } = await supabase
    .from('profile_congregations')
    .insert({
      profile_id: args.profileId,
      congregation_id: args.congregationId,
      role_scope: args.roleScope,
      approval_reason: reason,
      assigned_by: access.user.id,
      approval_status: 'pending',
      active: false,
    })
    .select('id')
    .maybeSingle()

  if (insErr || !inserted) {
    return { error: `Hiba a hozzárendelés létrehozásakor: ${insErr?.message || 'ismeretlen'}` }
  }

  // 5. Értesítés a lelkésznek
  await sendPastorNotification(supabase, {
    congregationId: args.congregationId,
    assignmentId: inserted.id,
    targetFullName: targetProfile.full_name,
    targetEmail: targetProfile.email,
    roleScope: args.roleScope,
    reason,
  })

  revalidatePath('/admin')
  return { success: true, assignmentId: inserted.id }
}

/**
 * Admin visszavonása egy approved hozzárendelésnek.
 * A lelkészi oldal is tud visszavonni, de az admin is visszavonhatja (pl. kilépett könyvelő).
 */
export async function revokeAssignment(args: {
  assignmentId: string
  reason: string
}): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  // ALAPELV (2026-04-17): szerepkör visszavonása CSAK admin (rendszergazda) vagy egyházkerületi
  // admin jogosultsággal. Egyházmegyei admin / esperes NEM vonhat vissza.
  if (!access.admin && !access.egyhazkeruletiAdmin) {
    return { error: 'Szerepkör visszavonása csak rendszergazdai vagy egyházkerületi admin jogosultsággal lehetséges.' }
  }

  const reason = (args.reason || '').trim()
  if (reason.length < 5) {
    return { error: 'A visszavonás indoklása legalább 5 karakter legyen.' }
  }

  const supabase = access.supabase

  const { error } = await supabase
    .from('profile_congregations')
    .update({
      approval_status: 'revoked',
      active: false,
      revoked_at: new Date().toISOString(),
      revoked_by: access.user.id,
      revoked_reason: reason,
    })
    .eq('id', args.assignmentId)

  if (error) return { error: `Hiba: ${error.message}` }

  revalidatePath('/admin')
  revalidatePath('/dashboard-egyhazmegye')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Értesítés helper — a lelkésznek, amikor új pending kérés érkezik
// ---------------------------------------------------------------------------

type Supabase = Awaited<ReturnType<typeof createClient>>

async function sendPastorNotification(
  supabase: Supabase,
  args: {
    congregationId: string
    assignmentId: string
    targetFullName: string | null
    targetEmail: string | null
    roleScope: AssignmentRoleScope
    reason: string
  },
) {
  // 1. Gyülekezet lelkésze (első találat)
  const { data: pastor } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('congregation_id', args.congregationId)
    .eq('role', 'lelkesz')
    .eq('status', 'active')
    .maybeSingle()

  if (!pastor?.id) return // nincs lelkész — az értesítés kihagyható

  const targetName = args.targetFullName || args.targetEmail || 'Egy új felhasználó'
  const roleLabel = args.roleScope === 'konyvelo' ? 'könyvelő' : 'egyházmegyei számvevő'

  await supabase.from('ertesitesek').insert({
    user_id: pastor.id,
    congregation_id: args.congregationId,
    cim: `Hozzáférési kérés: ${roleLabel}`,
    uzenet:
      `${targetName} ${roleLabel} szerepkörben szeretne hozzáférni a gyülekezeted pénzügyi adataihoz. ` +
      `Indok: "${args.reason}". ` +
      `A te engedélyed nélkül nem fogja látni a gyülekezet adatait. ` +
      `Nézd át a kérést a Profilom oldaladon.`,
    tipus: 'info',
    hivatkozas: '/profile/kapcsolatok',
  })
}

// ---------------------------------------------------------------------------
// Segéd: konyvelo és szamvevo szerepkörű aktív felhasználók listája
// ---------------------------------------------------------------------------

export async function listAssignableUsers(): Promise<{
  data?: Array<{ id: string; full_name: string | null; email: string | null; role: string }>
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  // Csak admin / egyházkerületi admin oszthat szerepkört (új ALAPELV 2026-04-17)
  if (!access.admin && !access.egyhazkeruletiAdmin) {
    return { error: 'Nincs jogosultsága.' }
  }

  const { data, error } = await access.supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .in('role', ['konyvelo', 'egyhazmegyei_szamvevo'])
    .eq('status', 'active')
    .order('full_name')

  if (error) return { error: error.message }
  return { data: data ?? [] }
}

/**
 * Gyülekezetek listája a hozzárendelés-formhoz. Ha kerületi admin, csak a saját
 * kerülete alatti gyülekezetek (a RLS is szűri, de explicit jobb).
 */
export async function listCongregationsForAssignment(): Promise<{
  data?: Array<{ id: string; nev_hu: string | null; name: string | null; diocese_id: string | null }>
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  // Csak admin / egyházkerületi admin oszthat szerepkört (új ALAPELV 2026-04-17)
  if (!access.admin && !access.egyhazkeruletiAdmin) {
    return { error: 'Nincs jogosultsága.' }
  }

  // Egyházkerületi admin: csak a saját kerülete alatti gyülekezetek
  if (access.egyhazkeruletiAdmin && !access.admin && access.profile?.district_id) {
    const { data, error } = await access.supabase
      .from('congregations')
      .select('id, nev_hu, name, diocese_id, dioceses!inner(district_id)')
      .eq('dioceses.district_id', access.profile.district_id)
      .order('nev_hu')

    if (error) return { error: error.message }
    return { data: (data ?? []).map((c) => ({ id: c.id, nev_hu: c.nev_hu, name: c.name, diocese_id: c.diocese_id })) }
  }

  // Admin vagy master — minden
  const { data, error } = await access.supabase
    .from('congregations')
    .select('id, nev_hu, name, diocese_id')
    .order('nev_hu')

  if (error) return { error: error.message }
  return { data: data ?? [] }
}
