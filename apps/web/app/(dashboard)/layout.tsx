import { redirect } from 'next/navigation'
import { AiChatWidgetLazy } from '@/components/ai/ai-chat-widget-lazy'
import { DashboardLayoutClient } from '@/components/layout/dashboard-layout-client'
import { SyncProvider } from '@/components/offline/sync-provider'
import { SyncStatusBar } from '@/components/offline/sync-status-bar'
import { WalkthroughClient } from '@/components/onboarding/walkthrough/walkthrough-client'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { checkDioceseSetupStatus } from '@/app/(dashboard)/dashboard-egyhazmegye/diocese-actions'
import { checkCongregationSetupStatus } from '@/app/(dashboard)/congregation/actions'
import { getWelcomeWizardStatus } from '@/lib/onboarding/welcome-status'

/**
 * Magyar név keresztnév-kinyerés — "Nt. Kovács János" → "János"
 * Ha nem tudjuk felismerni, null-t ad vissza, a fallback az "Lelkipásztor".
 */
function extractFirstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null
  const parts = fullName
    .trim()
    .replace(/^(Nt\.|Ft\.|Főt\.|Rev\.|Pál\.)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return null
  return parts[parts.length - 1]
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const access = await getEffectiveAccessContext()
  const {
    supabase,
    user,
    profile,
    role,
    master,
    admin,
    egyhazkeruletiAdmin,
    esperes,
    konyvelo,
    szamvevo,
    hasCongregation,
    assignedCongregations,
    congregationName,
    congregationLogo,
    congregationDioceseName,
    override,
    missingPrimaryRole,
    profileRoles,
    activeProfileRole,
  } = access

  // Scope nevek feloldása a profile switcher-hez (gyülekezet / egyházmegye / kerület)
  const scopeNames: Record<string, string> = {}
  if (profileRoles.length > 0) {
    const congIds = Array.from(new Set(profileRoles.filter((r) => r.scope === 'congregation' && r.scope_id).map((r) => r.scope_id!)))
    const dioceseIds = Array.from(new Set(profileRoles.filter((r) => r.scope === 'diocese' && r.scope_id).map((r) => r.scope_id!)))
    const districtIds = Array.from(new Set(profileRoles.filter((r) => r.scope === 'district' && r.scope_id).map((r) => r.scope_id!)))

    if (congIds.length > 0) {
      const { data } = await supabase.from('congregations').select('id, name, nev_hu').in('id', congIds)
      for (const c of data || []) {
        scopeNames[c.id as string] = (c.nev_hu as string | null) || (c.name as string | null) || '—'
      }
    }
    if (dioceseIds.length > 0) {
      const { data } = await supabase.from('dioceses').select('id, name').in('id', dioceseIds)
      for (const d of data || []) {
        scopeNames[d.id as string] = (d.name as string | null) || '—'
      }
    }
    if (districtIds.length > 0) {
      const { data } = await supabase.from('districts').select('id, name').in('id', districtIds)
      for (const d of data || []) {
        scopeNames[d.id as string] = (d.name as string | null) || '—'
      }
    }
  }

  // 1. Auth ellenőrzés
  if (!user) redirect('/login')

  // 2. Profil lekérdezés
  if (!profile) redirect('/login')

  // Pending user → várakozó képernyőre (ne signOut, ne login)
  if (profile.status === 'pending' && !master) {
    redirect('/pending')
  }

  // Egyéb nem-active status (pl. banned) → signOut + login
  if (profile.status !== 'active' && !master) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  if (missingPrimaryRole && !master) {
    redirect('/pending?reason=no-role')
  }

  // 2b. Onboarding wizard guard (2026-04-20)
  // A gyülekezeti kontextusban dolgozó (nem Master Admin + congregation scope +
  // van hozzárendelt gyülekezet) lelkészt, akinek a wizard még nincs kész,
  // a /welcome-ra tereljük. A wizard végén completeWizard() beállítja az
  // onboarding_completed_at-ot, utána már nem redirect-el.
  const isCongregationScope =
    activeProfileRole == null || activeProfileRole.scope === 'congregation'

  let shouldStartWalkthrough = false
  let walkthroughFirstName = 'Lelkipásztor'

  if (
    !master &&
    isCongregationScope &&
    access.effectiveCongregationId
  ) {
    const { data: onboardCheck } = await supabase
      .from('profiles')
      .select('onboarding_completed_at, walkthrough_completed, full_name, congregation_id')
      .eq('id', user.id)
      .maybeSingle()

    const welcomeStatus = await getWelcomeWizardStatus(
      supabase,
      onboardCheck,
      access.effectiveCongregationId,
    )

    if (welcomeStatus.required) {
      redirect('/welcome')
    }

    // Onboard kész → ellenőrizzük, kell-e a walkthrough
    if (onboardCheck && !onboardCheck.walkthrough_completed) {
      shouldStartWalkthrough = true
      walkthroughFirstName = extractFirstName(onboardCheck.full_name) || 'Lelkipásztor'
    }
  }

  // 3. Szerepkör számítás

  // 4. Gyülekezet adatok



  // 5. God Mode ellenőrzés
  const godMode = master ? await getGodModeStatus() : { active: false, expiresAt: null }
  const isGodMode = godMode.active

  // 6. Admin Override ellenőrzés



  // 7. AI widget
  const hasAiApiKey = !!(
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.GEMINI_API_KEY
  )

  // 8. Egyházmegye setup status (csak diocese scope-ban releváns)
  // Ha az aktív profile_role scope='diocese' és a diocese alapadatok hiányosak,
  // a layout-ban globális banner jelenik meg minden oldalon.
  const dioceseSetupStatus =
    activeProfileRole?.scope === 'diocese' && activeProfileRole.scopeId
      ? await checkDioceseSetupStatus(activeProfileRole.scopeId)
      : { needsSetup: false, missingFields: [] as string[], dioceseId: null as string | null }

  // 9. Gyülekezeti setup status (csak congregation scope-ban vagy a default lelkészi kontextusban)
  // Admin/esperes/kerületi módban (scope !== 'congregation' + van activeProfileRole) nincs.
  const congregationSetupStatus =
    access.effectiveCongregationId &&
    (activeProfileRole == null || activeProfileRole.scope === 'congregation')
      ? await checkCongregationSetupStatus(access.effectiveCongregationId)
      : { needsSetup: false, missingFields: [] as string[], congregationId: null as string | null }

  return (
    <SyncProvider
      congregationId={access.effectiveCongregationId}
      congregationName={congregationName}
    >
      <SyncStatusBar />
      <DashboardLayoutClient
        profile={profile}
        congregationId={access.effectiveCongregationId}
        role={role}
        master={master}
        admin={admin}
        egyhazkeruletiAdmin={egyhazkeruletiAdmin}
        esperes={esperes}
        konyvelo={konyvelo}
        szamvevo={szamvevo}
        hasCongregation={hasCongregation}
        assignedCongregationsCount={assignedCongregations.length}
        isGodMode={isGodMode}
        godModeExpiresAt={godMode.expiresAt}
        congregationName={congregationName}
        congregationLogo={congregationLogo}
        congregationDioceseName={congregationDioceseName}
        override={override}
        profileRoles={profileRoles}
        activeProfileRoleId={activeProfileRole?.id ?? null}
        scopeNames={scopeNames}
        activeScope={activeProfileRole?.scope ?? null}
        dioceseSetupNeeded={dioceseSetupStatus.needsSetup}
        dioceseSetupId={dioceseSetupStatus.dioceseId}
        dioceseSetupMissing={dioceseSetupStatus.missingFields}
        congregationSetupNeeded={congregationSetupStatus.needsSetup}
        congregationSetupId={congregationSetupStatus.congregationId}
        congregationSetupMissing={congregationSetupStatus.missingFields}
      >
        {children}
      </DashboardLayoutClient>
      <AiChatWidgetLazy hasApiKey={hasAiApiKey} />
      <WalkthroughClient
        firstName={walkthroughFirstName}
        shouldStart={shouldStartWalkthrough}
      />
    </SyncProvider>
  )
}
