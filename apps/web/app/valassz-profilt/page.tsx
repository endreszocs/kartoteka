import { redirect } from 'next/navigation'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { resolveDefaultDashboardPath } from '@/app/(dashboard)/profile/profile-preferences-actions'
import { getWelcomeWizardStatus } from '@/lib/onboarding/welcome-status'

import { ProfileChooser } from './profile-chooser'

export const dynamic = 'force-dynamic'

export default async function ValasszProfiltPage() {
  const access = await getEffectiveAccessContext()

  if (!access.user) redirect('/login')

  // Pending fiók → várakozó képernyő
  if (!access.master && access.profile?.status === 'pending') {
    redirect('/pending')
  }

  // Banned / egyéb státusz → kijelentkezés (a setup layout-tal konzisztens)
  if (!access.master && access.profile && access.profile.status !== 'active') {
    redirect('/login')
  }

  // Nincs jóváhagyott elsődleges szerepkör
  if (!access.master && access.missingPrimaryRole) {
    redirect('/pending?reason=no-role')
  }

  // Onboarding wizard guard — csak gyülekezeti kontextusban, ha van congregation_id.
  // Ha a wizard még kell, oda visszük; egyéb kontextusokban (admin/diocese/district)
  // nincs ilyen ellenőrzés.
  if (!access.master && access.effectiveCongregationId) {
    const { data: onboardCheck } = await access.supabase
      .from('profiles')
      .select('onboarding_completed_at, full_name, congregation_id')
      .eq('id', access.user.id)
      .maybeSingle()

    const welcomeStatus = await getWelcomeWizardStatus(
      access.supabase,
      onboardCheck,
      access.effectiveCongregationId,
    )

    if (welcomeStatus.required) {
      redirect('/welcome')
    }
  }

  // Ha csak 0 vagy 1 jóváhagyott szerepkör van, nincs mit választani → default redirect
  if (access.profileRoles.length <= 1) {
    const path = await resolveDefaultDashboardPath()
    redirect(path)
  }

  // 2+ szerepkör → scope nevek feloldása a kártyákhoz
  const congIds = Array.from(
    new Set(
      access.profileRoles
        .filter((r) => r.scope === 'congregation' && r.scope_id)
        .map((r) => r.scope_id!),
    ),
  )
  const dioceseIds = Array.from(
    new Set(
      access.profileRoles
        .filter((r) => r.scope === 'diocese' && r.scope_id)
        .map((r) => r.scope_id!),
    ),
  )
  const districtIds = Array.from(
    new Set(
      access.profileRoles
        .filter((r) => r.scope === 'district' && r.scope_id)
        .map((r) => r.scope_id!),
    ),
  )

  const scopeNames: Record<string, string> = {}

  if (congIds.length > 0) {
    const { data } = await access.supabase
      .from('congregations')
      .select('id, name, nev_hu')
      .in('id', congIds)
    for (const c of data || []) {
      scopeNames[c.id as string] =
        (c.nev_hu as string | null) || (c.name as string | null) || '—'
    }
  }
  if (dioceseIds.length > 0) {
    const { data } = await access.supabase
      .from('dioceses')
      .select('id, name')
      .in('id', dioceseIds)
    for (const d of data || []) {
      scopeNames[d.id as string] = (d.name as string | null) || '—'
    }
  }
  if (districtIds.length > 0) {
    const { data } = await access.supabase
      .from('districts')
      .select('id, name')
      .in('id', districtIds)
    for (const d of data || []) {
      scopeNames[d.id as string] = (d.name as string | null) || '—'
    }
  }

  return (
    <ProfileChooser
      profileRoles={access.profileRoles}
      activeProfileRoleId={access.activeProfileRole?.id ?? null}
      scopeNames={scopeNames}
      fullName={access.fullName}
    />
  )
}
