import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { MemberDashboard } from '@/components/member-portal/member-dashboard'
import {
  loadMemberChangeRequests,
  loadMemberNewsletterPreferences,
  loadMemberOverview,
} from '@/lib/member-portal/member-data'
import { loadPublicSiteBySlug } from '@/lib/public-site/site-loader'
import { createClient } from '@/lib/supabase/server'

import { isMemberPortalAuthEnabled } from '../tagi-portal/auth-enabled'
import {
  classifyMemberPortalAccess,
  readCurrentMemberRequestState,
} from '../tagi-portal/member-state'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Tagi fiók',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function MemberAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!isMemberPortalAuthEnabled()) redirect('/')

  const [{ slug }, query] = await Promise.all([params, searchParams])
  const site = await loadPublicSiteBySlug(slug)
  if (!site) notFound()

  const publicPath = `/gy/${site.slug}`
  const portalPath = `${publicPath}/tagi-portal`
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) redirect(portalPath)

  const stateResult = await readCurrentMemberRequestState(supabase)
  if (
    !stateResult.ok ||
    classifyMemberPortalAccess(
      stateResult.state,
      site.congregation_id,
    ).kind !== 'active'
  ) {
    redirect(portalPath)
  }

  const [overview, preferences, changeRequests] = await Promise.all([
    loadMemberOverview(supabase),
    loadMemberNewsletterPreferences(supabase),
    loadMemberChangeRequests(supabase),
  ])

  if (
    !overview ||
    !preferences ||
    overview.account.congregation_id !== site.congregation_id ||
    preferences.member_account_id !== overview.account.member_account_id
  ) {
    redirect(publicPath)
  }

  const notice = typeof query.notice === 'string' ? query.notice : undefined

  return (
    <MemberDashboard
      congregationName={site.display_name}
      slug={site.slug}
      themeKey={site.theme.preset_key}
      overview={overview}
      preferences={preferences}
      changeRequests={changeRequests}
      notice={notice}
    />
  )
}
