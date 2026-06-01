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
import type { SupabaseClient } from '@supabase/supabase-js'

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

/**
 * 2026-06-01 — Layout-fetch párhuzamosítás:
 * a 3 scope-tábla (congregations, dioceses, districts) lekérdezése
 * egyszerre, mert egymástól függetlenek. Korábban szekvenciálisan futottak,
 * ami minden sidebar-kattintást ~200 ms-mal lassított.
 */
async function loadScopeNames(
  supabase: SupabaseClient,
  profileRoles: Array<{ scope: string | null; scope_id: string | null }>,
): Promise<Record<string, string>> {
  const scopeNames: Record<string, string> = {}
  if (profileRoles.length === 0) return scopeNames
  const congIds = Array.from(new Set(profileRoles.filter((r) => r.scope === 'congregation' && r.scope_id).map((r) => r.scope_id!)))
  const dioceseIds = Array.from(new Set(profileRoles.filter((r) => r.scope === 'diocese' && r.scope_id).map((r) => r.scope_id!)))
  const districtIds = Array.from(new Set(profileRoles.filter((r) => r.scope === 'district' && r.scope_id).map((r) => r.scope_id!)))

  const [congs, dioceses, districts] = await Promise.all([
    congIds.length > 0
      ? supabase.from('congregations').select('id, name, nev_hu').in('id', congIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null; nev_hu: string | null }>, error: null }),
    dioceseIds.length > 0
      ? supabase.from('dioceses').select('id, name').in('id', dioceseIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }>, error: null }),
    districtIds.length > 0
      ? supabase.from('districts').select('id, name').in('id', districtIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }>, error: null }),
  ])
  for (const c of (congs.data as Array<{ id: string; name: string | null; nev_hu: string | null }> | null) || []) {
    scopeNames[c.id] = c.nev_hu || c.name || '—'
  }
  for (const d of (dioceses.data as Array<{ id: string; name: string | null }> | null) || []) {
    scopeNames[d.id] = d.name || '—'
  }
  for (const d of (districts.data as Array<{ id: string; name: string | null }> | null) || []) {
    scopeNames[d.id] = d.name || '—'
  }
  return scopeNames
}

/**
 * 2026-06-01 — Onboarding-state lekérdezése.
 * Skip-feltétel: ha a profile-on már megvan az `onboarding_completed_at` ÉS
 * a `walkthrough_completed`, NEM kell sem az onboardCheck query, sem a
 * welcomeStatus lekérdezés. Ez a "normál" eset minden bejelentkezett user-nél
 * az első napok után — vagyis a navigációs-overhead nagy részét elhozza.
 */
async function loadOnboardingState(
  supabase: SupabaseClient,
  userId: string,
  effectiveCongregationId: string,
): Promise<{
  redirectTo: string | null
  shouldStartWalkthrough: boolean
  walkthroughFirstName: string
}> {
  const { data: onboardCheck } = await supabase
    .from('profiles')
    .select('onboarding_completed_at, walkthrough_completed, full_name, congregation_id')
    .eq('id', userId)
    .maybeSingle()

  const welcomeStatus = await getWelcomeWizardStatus(
    supabase,
    onboardCheck,
    effectiveCongregationId,
  )

  if (welcomeStatus.required) {
    return { redirectTo: '/welcome', shouldStartWalkthrough: false, walkthroughFirstName: 'Lelkipásztor' }
  }

  if (onboardCheck && !onboardCheck.walkthrough_completed) {
    return {
      redirectTo: null,
      shouldStartWalkthrough: true,
      walkthroughFirstName: extractFirstName(onboardCheck.full_name) || 'Lelkipásztor',
    }
  }
  return { redirectTo: null, shouldStartWalkthrough: false, walkthroughFirstName: 'Lelkipásztor' }
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
  const role = access.role

  // 1. Auth ellenőrzések — sorrendben, mielőtt párhuzamos fetch-eket indítunk.
  if (!user) redirect('/login')
  if (!profile) redirect('/login')
  if (profile.status === 'pending' && !master) redirect('/pending')
  if (profile.status !== 'active' && !master) {
    await supabase.auth.signOut()
    redirect('/login')
  }
  if (missingPrimaryRole && !master) redirect('/pending?reason=no-role')

  // 2. Skip-feltételek számítása (a párhuzamos fetch előtt) — minden olyan
  //    query, ami feltételhez kötött, itt resolválódik.
  const isCongregationScope =
    activeProfileRole == null || activeProfileRole.scope === 'congregation'

  // 2026-06-01: ha a profile-on már onboarding_completed_at ÉS walkthrough_completed,
  // a teljes onboarding-check-block elhagyható. Ez a normál eset minden user-nél
  // a 2-3. naptól; -300-500 ms minden sidebar-navigáción.
  const profileOnboardingDone = Boolean(
    profile.onboarding_completed_at && profile.walkthrough_completed,
  )

  const needsOnboardingCheck =
    !master &&
    isCongregationScope &&
    Boolean(access.effectiveCongregationId) &&
    !profileOnboardingDone

  // 3. Párhuzamos fetch — minden ami egymástól független:
  //    - scope-tábla nevek (3 query egymás között Promise.all-ban)
  //    - onboarding state (csak ha kell)
  //    - god mode (csak master esetén)
  //    - diocese setup (csak diocese scope)
  //    - congregation setup (csak congregation scope)
  const [
    scopeNames,
    onboardingState,
    godMode,
    dioceseSetupStatus,
    congregationSetupStatus,
  ] = await Promise.all([
    loadScopeNames(supabase, profileRoles),
    needsOnboardingCheck
      ? loadOnboardingState(supabase, user.id, access.effectiveCongregationId!)
      : Promise.resolve({ redirectTo: null as string | null, shouldStartWalkthrough: false, walkthroughFirstName: 'Lelkipásztor' }),
    master ? getGodModeStatus() : Promise.resolve({ active: false, expiresAt: null }),
    activeProfileRole?.scope === 'diocese' && activeProfileRole.scopeId
      ? checkDioceseSetupStatus(activeProfileRole.scopeId)
      : Promise.resolve({ needsSetup: false, missingFields: [] as string[], dioceseId: null as string | null }),
    access.effectiveCongregationId && (activeProfileRole == null || activeProfileRole.scope === 'congregation')
      ? checkCongregationSetupStatus(access.effectiveCongregationId)
      : Promise.resolve({ needsSetup: false, missingFields: [] as string[], congregationId: null as string | null }),
  ])

  // 4. Redirect az onboarding-state alapján (csak a párhuzamos fetch UTÁN dobható).
  if (onboardingState.redirectTo) redirect(onboardingState.redirectTo)

  const { shouldStartWalkthrough, walkthroughFirstName } = onboardingState
  const isGodMode = godMode.active

  // 5. AI widget
  const hasAiApiKey = !!(
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.GEMINI_API_KEY
  )

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
