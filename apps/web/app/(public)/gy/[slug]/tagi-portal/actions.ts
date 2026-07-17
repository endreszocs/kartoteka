'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import type {
  MemberPortalFormErrors,
  MemberPortalLoginField,
  MemberPortalRegistrationField,
} from '@/components/member-portal/types'
import { createClient } from '@/lib/supabase/server'

import {
  buildApprovalDetails,
  classifyMemberPortalAccess,
  readCurrentMemberRequestState,
} from './member-state'
import { loadMemberPortalPublicCongregation } from './public-congregation'
import { resolvePublicAppOrigin } from './public-origin'
import type {
  MemberPortalLoginActionResult,
  MemberPortalRegistrationActionResult,
} from './types'
import { isMemberPortalAuthEnabled } from './auth-enabled'

const LOGIN_GENERIC_ERROR =
  'A belépés nem sikerült. Ellenőrizze az e-mail-címet és a jelszót, majd próbálja újra.'
const REGISTRATION_GENERIC_ERROR =
  'A kérelmet most nem lehet biztonságosan elküldeni. Kérjük, próbálja meg később.'

const loginFormSchema = z.object({
  email: z
    .string({ error: 'Az e-mail-cím megadása kötelező.' })
    .trim()
    .min(1, 'Az e-mail-cím megadása kötelező.')
    .max(320, 'Az e-mail-cím túl hosszú.')
    .email('Adjon meg érvényes e-mail-címet.')
    .transform((value) => value.toLowerCase()),
  password: z
    .string({ error: 'A jelszó megadása kötelező.' })
    .min(1, 'A jelszó megadása kötelező.')
    .max(1024, 'A jelszó nem megfelelő.'),
})

function isValidBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return false
  if (date.toISOString().slice(0, 10) !== value) return false
  const today = new Date().toISOString().slice(0, 10)
  return value >= '1900-01-01' && value <= today
}

const registrationFormSchema = z
  .object({
    fullName: z
      .string({ error: 'A teljes név megadása kötelező.' })
      .trim()
      .min(2, 'A teljes név legalább 2 karakter legyen.')
      .max(200, 'A teljes név legfeljebb 200 karakter lehet.'),
    email: z
      .string({ error: 'Az e-mail-cím megadása kötelező.' })
      .trim()
      .min(1, 'Az e-mail-cím megadása kötelező.')
      .max(320, 'Az e-mail-cím túl hosszú.')
      .email('Adjon meg érvényes e-mail-címet.')
      .transform((value) => value.toLowerCase()),
    phone: z
      .string({ error: 'Érvénytelen telefonszám.' })
      .trim()
      .max(64, 'A telefonszám legfeljebb 64 karakter lehet.')
      .refine(
        (value) => value.length === 0 || value.length >= 3,
        'A telefonszám legalább 3 karakter legyen.',
      )
      .transform((value) => value || undefined),
    birthDate: z
      .string({ error: 'A születési dátum megadása kötelező.' })
      .refine(
        isValidBirthDate,
        'Adjon meg 1900. január 1. és a mai nap közötti valós dátumot.',
      ),
    applicantMessage: z
      .string({ error: 'Az üzenet nem megfelelő.' })
      .trim()
      .max(2000, 'Az üzenet legfeljebb 2000 karakter lehet.')
      .transform((value) => value || undefined),
    password: z
      .string({ error: 'A jelszó megadása kötelező.' })
      .min(8, 'A jelszó legalább 8 karakter legyen.')
      .max(128, 'A jelszó legfeljebb 128 karakter lehet.'),
    passwordConfirmation: z.string({
      error: 'A jelszó megerősítése kötelező.',
    }),
    privacyConsent: z.literal('accepted', {
      error: 'A kérelem ellenőrzéséhez el kell fogadnia a feltételeket.',
    }),
  })
  .superRefine((value, context) => {
    if (value.password !== value.passwordConfirmation) {
      context.addIssue({
        code: 'custom',
        message: 'A két jelszó nem egyezik.',
        path: ['passwordConfirmation'],
      })
    }
  })

function buildFormErrors<FieldName extends string>(
  error: z.ZodError,
): MemberPortalFormErrors<FieldName> {
  const errors: MemberPortalFormErrors<FieldName> = {}

  for (const issue of error.issues) {
    const rawField = issue.path[0]
    const field =
      typeof rawField === 'string'
        ? (rawField as FieldName)
        : ('form' as const)
    if (!errors[field]) errors[field] = issue.message
  }

  return errors
}

async function failClosedSignOut() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
}

export async function memberPortalLogin(
  slug: string,
  formData: FormData,
): Promise<MemberPortalLoginActionResult> {
  const parsed = loginFormSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return {
      kind: 'error',
      errors: buildFormErrors<MemberPortalLoginField>(parsed.error),
    }
  }

  const site = await loadMemberPortalPublicCongregation(slug)
  if (!site || !isMemberPortalAuthEnabled()) {
    return { kind: 'error', errors: { form: LOGIN_GENERIC_ERROR } }
  }

  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (signInError) {
    return { kind: 'error', errors: { form: LOGIN_GENERIC_ERROR } }
  }

  const stateResult = await readCurrentMemberRequestState(supabase)
  if (!stateResult.ok) {
    await supabase.auth.signOut({ scope: 'local' })
    return { kind: 'error', errors: { form: LOGIN_GENERIC_ERROR } }
  }

  const decision = classifyMemberPortalAccess(
    stateResult.state,
    site.congregationId,
  )

  if (decision.kind === 'active') {
    redirect(`/gy/${site.slug}/tagi-fiok`)
  }

  if (decision.kind === 'pastor-approval') {
    return { kind: 'pastor-approval', ...buildApprovalDetails(decision) }
  }

  await supabase.auth.signOut({ scope: 'local' })
  return { kind: 'error', errors: { form: LOGIN_GENERIC_ERROR } }
}

export async function memberPortalRegister(
  slug: string,
  formData: FormData,
): Promise<MemberPortalRegistrationActionResult> {
  const parsed = registrationFormSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? '',
    birthDate: formData.get('birthDate'),
    applicantMessage: formData.get('applicantMessage') ?? '',
    password: formData.get('password'),
    passwordConfirmation: formData.get('passwordConfirmation'),
    privacyConsent: formData.get('privacyConsent'),
  })

  if (!parsed.success) {
    return {
      kind: 'error',
      errors: buildFormErrors<MemberPortalRegistrationField>(parsed.error),
    }
  }

  const site = await loadMemberPortalPublicCongregation(slug)
  const requestHeaders = await headers()
  const origin = resolvePublicAppOrigin(requestHeaders)
  if (!site || !origin || !isMemberPortalAuthEnabled()) {
    return { kind: 'error', errors: { form: REGISTRATION_GENERIC_ERROR } }
  }

  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })

  try {
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${origin}/gy/${site.slug}/tagi-portal/confirm`,
        data: {
          registration_flow: 'member_portal_v1',
          congregation_id: site.congregationId,
          display_name: parsed.data.fullName,
          birth_date: parsed.data.birthDate,
          ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
          ...(parsed.data.applicantMessage
            ? { applicant_message: parsed.data.applicantMessage }
            : {}),
          preferred_locale: 'hu',
          terms_accepted: true,
          privacy_notice_version: '2026-07-17-v1',
        },
      },
    })

    if (error) {
      // A publikus válasz szándékosan azonos egy már létező e-mail
      // és egy új kérelem esetén; részlet csak a szervernaplóba kerül.
      console.error('[member-portal] Auth signUp sikertelen:', error.code)
    }

    // Ha a projektben véletlenül ki van kapcsolva az e-mail-confirmation,
    // se adjunk eltérő publikus választ. A felhasználó a belépési
    // űrlapon tud továbblépni; a frissen kapott sessiont itt lezárjuk.
    if (data.session) {
      await supabase.auth.signOut({ scope: 'local' })
    }
  } catch (error) {
    console.error(
      '[member-portal] Auth signUp váratlan hiba:',
      error instanceof Error ? error.name : 'unknown',
    )
  }

  return {
    kind: 'email-verification',
    emailAddress: parsed.data.email,
  }
}

export async function memberPortalSignOut(): Promise<void> {
  await failClosedSignOut()
}
