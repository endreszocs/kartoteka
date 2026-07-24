import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { MemberPortalAuthShell } from '@/components/member-portal/member-portal-auth-shell'
import { createClient } from '@/lib/supabase/server'

import {
  buildApprovalDetails,
  classifyMemberPortalAccess,
  readCurrentMemberRequestState,
} from './member-state'
import { MemberPortalAuthController } from './member-portal-auth-controller'
import { loadMemberPortalPublicCongregation } from './public-congregation'
import type { MemberPortalInitialState } from './types'
import { isMemberPortalAuthEnabled } from './auth-enabled'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Tagi portál',
  robots: {
    index: false,
    follow: false,
  },
}

const GENERIC_SESSION_ERROR =
  'A tagi fiók ehhez a gyülekezethez most nem nyitható meg. Lépjen be a saját tagi adataival.'

export default async function MemberPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  if (!isMemberPortalAuthEnabled()) notFound()
  const site = await loadMemberPortalPublicCongregation(slug)
  if (!site) notFound()

  let initialState: MemberPortalInitialState = {
    view: 'login',
    loginError: query.auth === 'invalid' ? GENERIC_SESSION_ERROR : undefined,
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user && isMemberPortalAuthEnabled()) {
    const stateResult = await readCurrentMemberRequestState(supabase)
    if (!stateResult.ok) {
      initialState = {
        view: 'login',
        loginError: GENERIC_SESSION_ERROR,
      }
    } else {
      const decision = classifyMemberPortalAccess(
        stateResult.state,
        site.congregationId,
      )

      if (decision.kind === 'active') {
        redirect(`/gy/${site.slug}/tagi-fiok`)
      }

      if (decision.kind === 'pastor-approval') {
        initialState = {
          view: 'pastor-approval',
          approval: buildApprovalDetails(decision),
        }
      } else {
        // A /gy publikus felület puszta megnyitása ne jelentkeztesse ki
        // csendben a lelkészi vagy másik gyülekezethez tartozó sessiont.
        // Tényleges tagi belépéskor/regisztrációkor a Server Action
        // explicit sessionváltást végez.
        initialState = {
          view: 'login',
          loginError: GENERIC_SESSION_ERROR,
        }
      }
    }
  }

  return (
    <MemberPortalAuthShell
      congregationName={site.displayName}
      denomination="Biztonságos gyülekezeti tagi tér"
    >
      <MemberPortalAuthController
        congregationName={site.displayName}
        slug={site.slug}
        initialState={initialState}
      />
    </MemberPortalAuthShell>
  )
}
