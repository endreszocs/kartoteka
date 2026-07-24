import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

const applicationSchema = z.object({
  id: z.string().uuid(),
  congregation_id: z.string().uuid(),
  status: z.string(),
  submitted_at: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  withdrawn_at: z.string().nullable(),
  decision_message: z.string().nullable(),
})

const linkSchema = z.object({
  id: z.string().uuid(),
  congregation_id: z.string().uuid(),
  status: z.string(),
  linked_at: z.string().nullable(),
  suspended_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  status_message: z.string().nullable(),
})

const requestStateSchema = z.object({
  has_member_account: z.boolean(),
  member_account_id: z.string().uuid().optional(),
  account_status: z.string().nullable(),
  email_confirmed: z.boolean(),
  latest_application: applicationSchema.nullable(),
  latest_link: linkSchema.nullable(),
})

export type MemberPortalRequestState = z.infer<typeof requestStateSchema>

export type MemberPortalAccessDecision =
  | { kind: 'active' }
  | {
      kind: 'pastor-approval'
      applicationId: string
      submittedAt: string | null
    }
  | { kind: 'email-verification' }
  | { kind: 'cross-congregation' }
  | { kind: 'invalid' }

export async function readCurrentMemberRequestState(
  supabase: SupabaseClient,
): Promise<
  | { ok: true; state: MemberPortalRequestState }
  | { ok: false }
> {
  const { data, error } = await supabase.rpc('member_portal_my_request_state')
  if (error) {
    console.error('[member-portal] Saját státusz RPC sikertelen:', error.code)
    return { ok: false }
  }

  const parsed = requestStateSchema.safeParse(data)
  if (!parsed.success) {
    console.error('[member-portal] Saját státusz RPC válasza eltér a contracttól.')
    return { ok: false }
  }

  return { ok: true, state: parsed.data }
}

export function classifyMemberPortalAccess(
  state: MemberPortalRequestState,
  congregationId: string,
): MemberPortalAccessDecision {
  if (!state.has_member_account) return { kind: 'invalid' }

  const relatedCongregationIds = [
    state.latest_application?.congregation_id,
    state.latest_link?.congregation_id,
  ].filter((value): value is string => Boolean(value))

  if (relatedCongregationIds.some((value) => value !== congregationId)) {
    return { kind: 'cross-congregation' }
  }

  if (
    state.account_status === 'active' &&
    state.latest_link?.congregation_id === congregationId &&
    state.latest_link.status === 'active'
  ) {
    return { kind: 'active' }
  }

  if (!state.email_confirmed || state.account_status === 'pending_email') {
    return { kind: 'email-verification' }
  }

  if (
    state.latest_application?.congregation_id === congregationId &&
    ['pending_review', 'approved'].includes(state.latest_application.status)
  ) {
    return {
      kind: 'pastor-approval',
      applicationId: state.latest_application.id,
      submittedAt: state.latest_application.submitted_at,
    }
  }

  return { kind: 'invalid' }
}

export function buildApprovalDetails(
  decision: Extract<MemberPortalAccessDecision, { kind: 'pastor-approval' }>,
) {
  const submittedAt = decision.submittedAt
    ? new Date(decision.submittedAt)
    : null

  return {
    referenceCode: `TAG-${decision.applicationId.slice(0, 8).toUpperCase()}`,
    submittedAtLabel:
      submittedAt && !Number.isNaN(submittedAt.getTime())
        ? new Intl.DateTimeFormat('hu-HU', {
            dateStyle: 'long',
            timeZone: 'Europe/Bucharest',
          }).format(submittedAt)
        : undefined,
  }
}
