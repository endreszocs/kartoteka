import { redirect } from 'next/navigation'
import { AiChatWidgetLazy } from '@/components/ai/ai-chat-widget-lazy'
import { DashboardLayoutClient } from '@/components/layout/dashboard-layout-client'
import { SyncProvider } from '@/components/offline/sync-provider'
import { WalkthroughClient } from '@/components/onboarding/walkthrough/walkthrough-client'
import { SubscriptionSuspendedScreen } from '@/components/layout/subscription-suspended-screen'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getCongregationAccessStatus, shouldGateUser } from '@/lib/auth/subscription-access'
import { touchLastSeen } from '@/lib/auth/touch-last-seen'
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

  // 2026-07-10 (S4-avatar): a beállított profilfotó a headerbe. Elsődleges forrás
  // az auth user_metadata (a fotó-mentés szinkronizálja, Google OAuth is ide ír) —
  // NINCS extra DB-lekérés. Fallback: a monorepo ELŐTT beállított fotók csak a
  // pastor_profiles.photo_url-ban élnek, azokat egy párhuzamos lekérés hozza be.
  const metadataAvatarUrl =
    (user.user_metadata?.avatar_url as string | undefined) ||
    (user.user_metadata?.picture as string | undefined) ||
    null

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
    fallbackPhotoUrl,
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
    // S4-avatar fallback: csak akkor fut, ha a metadata-ban NINCS fotó (legacy fotók).
    metadataAvatarUrl
      ? Promise.resolve(null as string | null)
      : supabase
          .from('pastor_profiles')
          .select('photo_url')
          .eq('user_id', user.id)
          .maybeSingle()
          .then((res) => ((res.data as { photo_url: string | null } | null)?.photo_url ?? null)),
    // "Utoljára aktív" heartbeat — throttled (max óránként ír), a párhuzamos
    // fetch-ekkel együtt fut, így nem ad extra kört. A visszatérése nincs
    // destrukturálva (a fenti 6 név után a 7. elem szándékosan ignorált).
    touchLastSeen(user.id),
  ])

  // 4. Redirect az onboarding-state alapján (csak a párhuzamos fetch UTÁN dobható).
  if (onboardingState.redirectTo) redirect(onboardingState.redirectTo)

  const { shouldStartWalkthrough, walkthroughFirstName } = onboardingState
  const isGodMode = godMode.active

  // 4b. Előfizetés-gating — UTOLSÓ ellenőrzés a modul-render ELŐTT, minden auth-
  //     és onboarding-redirect (welcome/pending/onboarding) UTÁN.
  //     BIZTONSÁGOS DEFAULT: a DB-lekérés CSAK gyülekezeti scope-ú, NEM admin/
  //     master/kerületi/egyházmegyei usernél fut (shouldGateUser) — így az admin-
  //     jellegű felhasználók normál betöltését nem lassítja, és SOHA nem is
  //     blokkolja. A lekérés BÁRMILYEN hibája engedélyező (try/catch → tovább).
  //     Kizárólag explicit 'suspended' DB-státusz vezet a leállított képernyőhöz.
  //     2026-08-11: a JSX MÁR NEM a try/catch-en BELÜL épül (react-hooks/
  //     error-boundaries). A React nem a JSX létrehozásakor rendereli a
  //     komponenst, így a renderelés közben dobott hibát ez a catch úgysem
  //     kapná el — viszont a látszat megtévesztő. Ezért a try/catch CSAK a
  //     DB-lekérést fogja körül, és a képernyő a blokkon KÍVÜL tér vissza.
  let subscriptionBlocked = false
  let subscriptionBlockReason: string | null = null
  if (shouldGateUser({ master, admin, egyhazkeruletiAdmin, activeScope: activeProfileRole?.scope })) {
    try {
      const subscriptionAccess = await getCongregationAccessStatus(access.effectiveCongregationId)
      subscriptionBlocked = subscriptionAccess.isBlocked
      subscriptionBlockReason = subscriptionAccess.reason
    } catch {
      // A gating-lekérés hibája SOHA nem törheti el a layoutot → engedünk tovább.
    }
  }
  if (subscriptionBlocked) {
    return (
      <SubscriptionSuspendedScreen
        congregationName={congregationName}
        reason={subscriptionBlockReason}
      />
    )
  }

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
      {/* 2026-08-11: a lebegő szinkron-pirula MEGSZŰNT. `fixed top-2 right-2
          z-50`-ként pontosan a fejléc jobb oldali ikonsorára került (súgó,
          harang, avatár), és `pointer-events-none` híján a kattintást is
          elnyelte — szinkron közben a lelkész nem érte el a kijelentkezést sem.
          A jelző mostantól a fejléc ikonsorának RENDES tagja:
          `components/offline/sync-status-button.tsx`. */}
      <DashboardLayoutClient
        profile={profile}
        avatarUrl={metadataAvatarUrl || fallbackPhotoUrl}
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
        deferSetupForWalkthrough={shouldStartWalkthrough}
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
