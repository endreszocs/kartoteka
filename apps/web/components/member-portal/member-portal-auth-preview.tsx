'use client'

import { useState } from 'react'

import { MemberPortalAuthFlow } from './member-portal-auth-flow'
import styles from './member-portal-auth.module.css'
import {
  MEMBER_PORTAL_AUTH_VIEWS,
  type MemberPortalAuthView,
  type MemberPortalFormErrors,
  type MemberPortalLoginField,
  type MemberPortalRegistrationField,
} from './types'

const VIEW_LABELS: Record<MemberPortalAuthView, string> = {
  login: 'Belépés',
  registration: 'Regisztráció',
  'email-verification': 'E-mailre vár',
  'pastor-approval': 'Jóváhagyásra vár',
}

const LOGIN_ERRORS: MemberPortalFormErrors<MemberPortalLoginField> = {
  form: 'A bemutató hibaállapota aktív. Ellenőrizze a megadott adatokat.',
  email: 'Adjon meg egy érvényes e-mail-címet.',
  password: 'A jelszó nem megfelelő.',
}

const REGISTRATION_ERRORS: MemberPortalFormErrors<MemberPortalRegistrationField> = {
  form: 'A kérelem még nem küldhető el. Javítsa a megjelölt mezőket.',
  email: 'Ehhez az e-mail-címhez már tartozik csatlakozási kérelem.',
  privacyConsent: 'A kérelem ellenőrzéséhez szükség van a hozzájárulásra.',
}

export function MemberPortalAuthPreview() {
  const [view, setView] = useState<MemberPortalAuthView>('login')
  const [emailAddress, setEmailAddress] = useState('anna.kovacs@pelda.hu')
  const [showErrors, setShowErrors] = useState(false)

  function changeView(nextView: MemberPortalAuthView) {
    setView(nextView)
    setShowErrors(false)
  }

  return (
    <>
      <MemberPortalAuthFlow
        congregationName="Kertvárosi Református Egyházközség"
        location="Kolozsvár"
        view={view}
        onViewChange={changeView}
        login={{
          defaultValues: {
            email: 'anna.kovacs@pelda.hu',
            rememberMe: false,
          },
          errors: showErrors ? LOGIN_ERRORS : undefined,
          onSubmit: () => setShowErrors(true),
          onForgotPassword: () => setShowErrors(false),
        }}
        registration={{
          defaultValues: {
            fullName: 'Kovács Anna',
            email: 'anna.kovacs@pelda.hu',
          },
          errors: showErrors ? REGISTRATION_ERRORS : undefined,
          onSubmit: (formData) => {
            const submittedEmail = formData.get('email')
            if (typeof submittedEmail === 'string' && submittedEmail.trim()) {
              setEmailAddress(submittedEmail.trim())
            }
            changeView('email-verification')
          },
        }}
        emailVerification={{
          emailAddress,
          onResend: () => undefined,
          onChangeEmail: () => changeView('registration'),
        }}
        pastorApproval={{
          referenceCode: 'TAG-2026-0717',
          submittedAtLabel: '2026. július 17.',
          onReturnToLogin: () => changeView('login'),
        }}
      />

      <nav className={styles.previewSwitcher} aria-label="Fejlesztői állapotválasztó">
        {MEMBER_PORTAL_AUTH_VIEWS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={styles.previewButton}
            data-active={view === candidate || undefined}
            aria-pressed={view === candidate}
            onClick={() => changeView(candidate)}
          >
            {VIEW_LABELS[candidate]}
          </button>
        ))}
        <button
          type="button"
          className={styles.previewErrorButton}
          data-active={showErrors || undefined}
          aria-pressed={showErrors}
          onClick={() => setShowErrors((current) => !current)}
        >
          Hiba minta
        </button>
      </nav>
    </>
  )
}
