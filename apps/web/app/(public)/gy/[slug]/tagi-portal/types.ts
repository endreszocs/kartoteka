import type {
  MemberPortalAuthView,
  MemberPortalFormErrors,
  MemberPortalLoginField,
  MemberPortalRegistrationField,
} from '@/components/member-portal/types'

export interface MemberPortalApprovalDetails {
  referenceCode?: string
  submittedAtLabel?: string
}

export type MemberPortalLoginActionResult =
  | {
      kind: 'error'
      errors: MemberPortalFormErrors<MemberPortalLoginField>
    }
  | ({ kind: 'pastor-approval' } & MemberPortalApprovalDetails)

export type MemberPortalRegistrationActionResult =
  | {
      kind: 'error'
      errors: MemberPortalFormErrors<MemberPortalRegistrationField>
    }
  | {
      kind: 'email-verification'
      emailAddress: string
    }

export interface MemberPortalInitialState {
  view: MemberPortalAuthView
  loginError?: string
  approval?: MemberPortalApprovalDetails
}
