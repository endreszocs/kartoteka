'use client'

import { useState } from 'react'

import { MemberPortalAuthFlow } from '@/components/member-portal/member-portal-auth-flow'
import type {
  MemberPortalAuthView,
  MemberPortalFormErrors,
  MemberPortalLoginDefaults,
  MemberPortalLoginField,
  MemberPortalRegistrationDefaults,
  MemberPortalRegistrationField,
} from '@/components/member-portal/types'

import {
  memberPortalLogin,
  memberPortalRegister,
  memberPortalSignOut,
} from './actions'
import type {
  MemberPortalApprovalDetails,
  MemberPortalInitialState,
} from './types'

interface MemberPortalAuthControllerProps {
  congregationName: string
  slug: string
  initialState: MemberPortalInitialState
}

function formString(formData: FormData, name: string): string | undefined {
  const value = formData.get(name)
  if (typeof value !== 'string') return undefined
  return value
}

export function MemberPortalAuthController({
  congregationName,
  slug,
  initialState,
}: MemberPortalAuthControllerProps) {
  const [view, setView] = useState<MemberPortalAuthView>(initialState.view)
  const [loginErrors, setLoginErrors] = useState<
    MemberPortalFormErrors<MemberPortalLoginField> | undefined
  >(initialState.loginError ? { form: initialState.loginError } : undefined)
  const [registrationErrors, setRegistrationErrors] = useState<
    MemberPortalFormErrors<MemberPortalRegistrationField> | undefined
  >()
  const [loginDefaults, setLoginDefaults] =
    useState<MemberPortalLoginDefaults>()
  const [registrationDefaults, setRegistrationDefaults] =
    useState<MemberPortalRegistrationDefaults>()
  const [verificationEmail, setVerificationEmail] = useState('')
  const [approval, setApproval] = useState<MemberPortalApprovalDetails>(
    initialState.approval ?? {},
  )

  function changeView(nextView: MemberPortalAuthView) {
    setLoginErrors(undefined)
    setRegistrationErrors(undefined)
    setView(nextView)
  }

  async function handleLogin(formData: FormData) {
    setLoginErrors(undefined)
    setLoginDefaults({ email: formString(formData, 'email') })

    const result = await memberPortalLogin(slug, formData)
    if (result.kind === 'error') {
      setLoginErrors(result.errors)
      return
    }

    setApproval({
      referenceCode: result.referenceCode,
      submittedAtLabel: result.submittedAtLabel,
    })
    setView('pastor-approval')
  }

  async function handleRegistration(formData: FormData) {
    setRegistrationErrors(undefined)
    setRegistrationDefaults({
      fullName: formString(formData, 'fullName'),
      email: formString(formData, 'email'),
      phone: formString(formData, 'phone'),
      birthDate: formString(formData, 'birthDate'),
      applicantMessage: formString(formData, 'applicantMessage'),
    })

    const result = await memberPortalRegister(slug, formData)
    if (result.kind === 'error') {
      setRegistrationErrors(result.errors)
      return
    }

    setVerificationEmail(result.emailAddress)
    setView('email-verification')
  }

  async function signOutAndReturnToLogin() {
    await memberPortalSignOut()
    changeView('login')
  }

  return (
    <MemberPortalAuthFlow
      congregationName={congregationName}
      view={view}
      onViewChange={changeView}
      login={{
        defaultValues: loginDefaults,
        errors: loginErrors,
        onSubmit: handleLogin,
        showRememberMe: false,
      }}
      registration={{
        defaultValues: registrationDefaults,
        errors: registrationErrors,
        onSubmit: handleRegistration,
      }}
      emailVerification={{
        emailAddress: verificationEmail,
        isConditionalDeliveryNotice: true,
        onChangeEmail: () => changeView('registration'),
        onReturnToLogin: signOutAndReturnToLogin,
      }}
      pastorApproval={{
        ...approval,
        onReturnToLogin: signOutAndReturnToLogin,
      }}
    />
  )
}
