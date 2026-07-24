export const MEMBER_PORTAL_AUTH_VIEWS = [
  'login',
  'registration',
  'email-verification',
  'pastor-approval',
] as const

export type MemberPortalAuthView = (typeof MEMBER_PORTAL_AUTH_VIEWS)[number]

export type MemberPortalSubmitHandler = (
  formData: FormData
) => void | Promise<void>

export type MemberPortalFormErrors<FieldName extends string> = Partial<
  Record<FieldName | 'form', string>
>

export type MemberPortalLoginField = 'email' | 'password'

export type MemberPortalRegistrationField =
  | 'fullName'
  | 'email'
  | 'phone'
  | 'birthDate'
  | 'applicantMessage'
  | 'password'
  | 'passwordConfirmation'
  | 'privacyConsent'

export interface MemberPortalCongregationIdentity {
  congregationName: string
  location?: string
  denomination?: string
}

export interface MemberPortalLoginDefaults {
  email?: string
  rememberMe?: boolean
}

export interface MemberPortalRegistrationDefaults {
  fullName?: string
  email?: string
  phone?: string
  birthDate?: string
  applicantMessage?: string
}

export interface MemberPortalLoginOptions {
  defaultValues?: MemberPortalLoginDefaults
  errors?: MemberPortalFormErrors<MemberPortalLoginField>
  isPending?: boolean
  onSubmit?: MemberPortalSubmitHandler
  onForgotPassword?: () => void
  showRememberMe?: boolean
}

export interface MemberPortalRegistrationOptions {
  defaultValues?: MemberPortalRegistrationDefaults
  errors?: MemberPortalFormErrors<MemberPortalRegistrationField>
  isPending?: boolean
  onSubmit?: MemberPortalSubmitHandler
}

export interface MemberPortalEmailVerificationOptions {
  emailAddress: string
  isConditionalDeliveryNotice?: boolean
  isResending?: boolean
  onResend?: () => void | Promise<void>
  onChangeEmail?: () => void
  onReturnToLogin?: () => void
}

export interface MemberPortalPastorApprovalOptions {
  referenceCode?: string
  submittedAtLabel?: string
  onReturnToLogin?: () => void
}

export interface MemberPortalAuthFlowProps
  extends MemberPortalCongregationIdentity {
  view: MemberPortalAuthView
  onViewChange: (view: MemberPortalAuthView) => void
  login?: MemberPortalLoginOptions
  registration?: MemberPortalRegistrationOptions
  emailVerification: MemberPortalEmailVerificationOptions
  pastorApproval?: MemberPortalPastorApprovalOptions
}
