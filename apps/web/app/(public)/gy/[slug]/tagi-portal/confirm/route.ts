import type { EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

import {
  classifyMemberPortalAccess,
  readCurrentMemberRequestState,
} from '../member-state'
import { loadMemberPortalPublicCongregation } from '../public-congregation'
import { resolvePublicAppOrigin } from '../public-origin'
import { isMemberPortalAuthEnabled } from '../auth-enabled'

export const dynamic = 'force-dynamic'

function noStoreRedirect(url: URL) {
  const response = NextResponse.redirect(url)
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Pragma', 'no-cache')
  return response
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const site = await loadMemberPortalPublicCongregation(slug)
  const origin = resolvePublicAppOrigin(request.headers)

  if (!site || !origin || !isMemberPortalAuthEnabled()) {
    return new NextResponse('A tagi megerősítés nem érhető el.', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }

  const portalUrl = new URL(`/gy/${site.slug}/tagi-portal`, origin)
  const invalidUrl = new URL(portalUrl)
  invalidUrl.searchParams.set('auth', 'invalid')

  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const otpType = request.nextUrl.searchParams.get('type')
  const code = request.nextUrl.searchParams.get('code')
  const validOtpType =
    otpType === 'email' || otpType === 'signup'
      ? (otpType as EmailOtpType)
      : null

  const supabase = await createClient()
  let verificationError = true

  if (tokenHash && validOtpType) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: validOtpType,
    })
    verificationError = Boolean(error)
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    verificationError = Boolean(error)
  }

  if (verificationError) {
    await supabase.auth.signOut({ scope: 'local' })
    return noStoreRedirect(invalidUrl)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    await supabase.auth.signOut({ scope: 'local' })
    return noStoreRedirect(invalidUrl)
  }

  const stateResult = await readCurrentMemberRequestState(supabase)
  if (!stateResult.ok) {
    await supabase.auth.signOut({ scope: 'local' })
    return noStoreRedirect(invalidUrl)
  }

  const decision = classifyMemberPortalAccess(
    stateResult.state,
    site.congregationId,
  )

  if (decision.kind === 'active') {
    return noStoreRedirect(
      new URL(`/gy/${site.slug}/tagi-fiok`, origin),
    )
  }

  if (decision.kind === 'pastor-approval') {
    return noStoreRedirect(portalUrl)
  }

  await supabase.auth.signOut({ scope: 'local' })
  return noStoreRedirect(invalidUrl)
}
