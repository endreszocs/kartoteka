'use server'

/**
 * profile_roles CRUD — admin / egyházkerületi admin számára.
 *
 * Alapelv (7): szerepkört CSAK admin / egyházkerületi admin oszthat ki.
 * A gyülekezeti lelkészi hozzárendelés (konyvelo, titkar, custom gyülekezeti
 * scope-ra) PENDING státuszban jön létre — a lelkész jóváhagyja a saját
 * /profile/kapcsolatok oldalán.
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { ROLE_TEMPLATES } from '@/lib/profile-roles/permissions'
import type {
  Permissions,
  ProfileRoleRow,
  ProfileRoleScope,
  ProfileRoleType,
} from '@/lib/profile-roles/types'

export interface CreateProfileRoleInput {
  profileId: string
  scope: ProfileRoleScope
  scopeId: string | null
  role: ProfileRoleType
  customLabel?: string | null
  /** Ha NEM adott, a ROLE_TEMPLATES[role] alapértelmezettje kerül mentésre */
  permissions?: Permissions
  reason?: string
}

function canManage(access: Awaited<ReturnType<typeof getEffectiveAccessContext>>): boolean {
  return !!access.admin || !!access.master || !!access.egyhazkeruletiAdmin
}

// ---------------------------------------------------------------------------
// Listázók
// ---------------------------------------------------------------------------

export async function listProfileRoles(): Promise<{ data?: ProfileRoleRow[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canManage(access)) return { error: 'Nincs jogosultsága.' }

  const { data, error } = await access.supabase
    .from('profile_roles')
    .select('*')
    .order('granted_at', { ascending: false })

  if (error) return { error: error.message }
  return { data: (data || []) as ProfileRoleRow[] }
}

export async function listAssignableProfiles(): Promise<{
  data?: Array<{ id: string; full_name: string | null; email: string | null; role: string; status?: string }>
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canManage(access)) return { error: 'Nincs jogosultsága.' }

  // 2026-05-02 (v0.9.41) — Felhasználó panasza: az új regisztrált+elfogadott
  // user nem jelenik meg a Szerepkörök fülön. Az ok: az `eq('status', 'active')`
  // szűrő kizárja a 'pending' user-eket — még akkor is, ha őket az admin az
  // /admin/hozzaferes-kerelmek-ben elfogadta (mert ott csak az access_request
  // státusz változik, nem feltétlenül a profile.status).
  //
  // Most engedjük át a 'pending' és 'active' user-eket egyaránt — az UI
  // jelölje meg melyik a pending. A 'denied'/'rejected' továbbra is kihagyva.
  const { data, error } = await access.supabase
    .from('profiles')
    .select('id, full_name, email, role, status')
    .in('status', ['active', 'pending'])
    .order('full_name', { nullsFirst: false })

  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function listScopeOptions(): Promise<{
  data?: {
    congregations: Array<{ id: string; name: string; diocese_id: string | null }>
    dioceses: Array<{ id: string; name: string; district_id: string | null }>
    districts: Array<{ id: string; name: string }>
  }
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canManage(access)) return { error: 'Nincs jogosultsága.' }

  const [congs, dioceses, districts] = await Promise.all([
    access.supabase.from('congregations').select('id, name, nev_hu, diocese_id').order('nev_hu'),
    access.supabase.from('dioceses').select('id, name, district_id').order('name'),
    access.supabase.from('districts').select('id, name').order('name'),
  ])

  return {
    data: {
      congregations: (congs.data || []).map((c) => ({
        id: c.id as string,
        name: (c.nev_hu as string | null) || (c.name as string | null) || '—',
        diocese_id: (c.diocese_id as string | null) || null,
      })),
      dioceses: (dioceses.data || []) as Array<{ id: string; name: string; district_id: string | null }>,
      districts: (districts.data || []) as Array<{ id: string; name: string }>,
    },
  }
}

// ---------------------------------------------------------------------------
// Új kiosztás
// ---------------------------------------------------------------------------

export async function createProfileRole(
  input: CreateProfileRoleInput,
): Promise<{ success?: boolean; error?: string; id?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canManage(access)) return { error: 'Nincs jogosultsága szerepkört kiosztani.' }

  // Validáció
  if (!input.profileId) return { error: 'Válasszon felhasználót.' }
  if (!input.role) return { error: 'Válasszon szerepkört.' }

  if (input.scope === 'system' && input.scopeId) {
    return { error: 'System scope-nál nem adhat meg scope_id-t.' }
  }
  if (input.scope !== 'system' && !input.scopeId) {
    return { error: 'A kiválasztott scope-hoz tartozó egységet (gyülekezet / egyházmegye / egyházkerület) adja meg.' }
  }

  if (input.role === 'custom' && !input.customLabel?.trim()) {
    return { error: 'Egyedi szerepkörnél a nevet meg kell adni.' }
  }
  if (input.role !== 'custom' && input.customLabel) {
    return { error: 'Csak egyedi szerepkörnél adható meg név.' }
  }

  // Scope és role kompatibilitás
  if (input.scope === 'system' && input.role !== 'admin') {
    return { error: 'System scope-hoz csak admin szerep rendelhető.' }
  }
  if (input.scope === 'district' && !['egyhazkeruleti_admin', 'custom'].includes(input.role)) {
    return { error: 'Egyházkerületi scope-hoz csak egyházkerületi admin vagy egyedi szerep rendelhető.' }
  }
  if (input.scope === 'diocese' && !['egyhazmegyei_admin', 'esperes', 'egyhazmegyei_szamvevo', 'custom'].includes(input.role)) {
    return { error: 'Egyházmegyei scope-hoz csak esperes, egyházmegyei admin/számvevő vagy egyedi szerep rendelhető.' }
  }
  if (input.scope === 'congregation' && !['lelkesz', 'konyvelo', 'custom'].includes(input.role)) {
    return { error: 'Gyülekezeti scope-hoz csak lelkész, könyvelő vagy egyedi szerep rendelhető.' }
  }

  // Engedélyek — ha nincs megadva, a sablon használása
  const permissions = input.permissions ?? (input.role === 'custom' ? {} : ROLE_TEMPLATES[input.role])

  // Gyülekezeti scope-nál lelkészi jóváhagyás kell (pending state)
  const pastorApprovalNeeded = input.scope === 'congregation' && input.role !== 'lelkesz'
  const approvalStatus = pastorApprovalNeeded ? 'pending' : 'approved'

  const { supabase, user } = access
  const { data: inserted, error } = await supabase
    .from('profile_roles')
    .insert({
      profile_id: input.profileId,
      scope: input.scope,
      scope_id: input.scopeId,
      role: input.role,
      custom_label: input.customLabel?.trim() || null,
      permissions,
      approval_status: approvalStatus,
      approval_reason: input.reason?.trim() || null,
      granted_by: user.id,
      approved_by: pastorApprovalNeeded ? null : user.id,
      approved_at: pastorApprovalNeeded ? null : new Date().toISOString(),
      active: !pastorApprovalNeeded,
    })
    .select('id')
    .single()

  if (error) return { error: `Hiba: ${error.message}` }

  // Ha pending (lelkészi jóváhagyás kell), értesítés a gyülekezet lelkészeinek
  if (pastorApprovalNeeded && input.scopeId) {
    try {
      const { data: pastors } = await supabase
        .from('profiles')
        .select('id')
        .eq('congregation_id', input.scopeId)
        .eq('status', 'active')

      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', input.profileId)
        .maybeSingle()

      const targetName = targetProfile?.full_name || targetProfile?.email || 'Egy felhasználó'
      const roleLabel = input.role === 'custom' ? input.customLabel : input.role

      for (const p of pastors || []) {
        if (!p.id) continue
        await supabase.from('ertesitesek').insert({
          user_id: p.id,
          congregation_id: input.scopeId,
          cim: `Új hozzáférési kérés: ${roleLabel}`,
          uzenet: `${targetName} ${roleLabel} szerepkörrel szeretne hozzáférést kapni a gyülekezethez. A saját profilján tudja jóváhagyni vagy elutasítani.`,
          tipus: 'info',
          hivatkozas: '/profile/kapcsolatok',
        })
      }
    } catch {
      // Csendes — a létrehozás már sikeres
    }
  }

  revalidatePath('/admin')
  revalidatePath('/', 'layout')
  return { success: true, id: inserted?.id }
}

// ---------------------------------------------------------------------------
// Visszavonás
// ---------------------------------------------------------------------------

export async function revokeProfileRole(args: {
  profileRoleId: string
  reason: string
}): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canManage(access)) return { error: 'Nincs jogosultsága visszavonni.' }

  if (!args.reason?.trim() || args.reason.trim().length < 5) {
    return { error: 'A visszavonás indoklása legalább 5 karakter legyen.' }
  }

  const { error } = await access.supabase
    .from('profile_roles')
    .update({
      approval_status: 'revoked',
      active: false,
      revoked_at: new Date().toISOString(),
      revoked_by: access.user.id,
      revoked_reason: args.reason.trim(),
    })
    .eq('id', args.profileRoleId)

  if (error) return { error: `Hiba: ${error.message}` }

  revalidatePath('/admin')
  revalidatePath('/', 'layout')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Permissions frissítés (x-elés)
// ---------------------------------------------------------------------------

export async function updateProfileRolePermissions(args: {
  profileRoleId: string
  permissions: Permissions
}): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canManage(access)) return { error: 'Nincs jogosultsága.' }

  const { error } = await access.supabase
    .from('profile_roles')
    .update({ permissions: args.permissions })
    .eq('id', args.profileRoleId)

  if (error) return { error: `Hiba: ${error.message}` }

  revalidatePath('/admin')
  revalidatePath('/', 'layout')
  return { success: true }
}
