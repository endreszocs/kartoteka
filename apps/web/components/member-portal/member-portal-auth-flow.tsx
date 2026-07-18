'use client'

import { useEffect, useRef } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import styles from './member-portal-auth.module.css'
import { MemberPortalEmailVerification } from './member-portal-email-verification'
import { MemberPortalLoginForm } from './member-portal-login-form'
import { MemberPortalPastorApproval } from './member-portal-pastor-approval'
import { MemberPortalRegistrationForm } from './member-portal-registration-form'
import type { MemberPortalAuthFlowProps, MemberPortalAuthView } from './types'

function isAuthTabView(
  view: MemberPortalAuthView
): view is 'login' | 'registration' {
  return view === 'login' || view === 'registration'
}

export function MemberPortalAuthFlow({
  congregationName,
  view,
  onViewChange,
  login,
  registration,
  emailVerification,
  pastorApproval,
}: MemberPortalAuthFlowProps) {
  const loginTabRef = useRef<HTMLButtonElement>(null)
  const registrationTabRef = useRef<HTMLButtonElement>(null)
  const statusPanelRef = useRef<HTMLElement>(null)
  const previousViewRef = useRef<MemberPortalAuthView>(view)
  const authTabView = isAuthTabView(view)

  useEffect(() => {
    const previousView = previousViewRef.current
    if (previousView === view) return

    if (isAuthTabView(view) && !isAuthTabView(previousView)) {
      const target =
        view === 'login' ? loginTabRef.current : registrationTabRef.current
      target?.focus()
    } else if (!isAuthTabView(view)) {
      statusPanelRef.current?.focus()
    }

    previousViewRef.current = view
  }, [view])

  if (authTabView) {
    return (
      <Tabs
        value={view}
        onValueChange={(nextValue) => {
          if (nextValue === 'login' || nextValue === 'registration') {
            onViewChange(nextValue)
          }
        }}
        className={styles.authFlow}
      >
        <TabsList className={styles.authTabs} aria-label="Tagi fiók">
          <TabsTrigger
            ref={loginTabRef}
            value="login"
            className={styles.authTab}
          >
            Belépés
          </TabsTrigger>
          <TabsTrigger
            ref={registrationTabRef}
            value="registration"
            className={styles.authTab}
          >
            Regisztráció
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="login"
          className={styles.authPanel}
        >
          <MemberPortalLoginForm
            {...login}
            onRegister={() => onViewChange('registration')}
          />
        </TabsContent>
        <TabsContent
          value="registration"
          className={styles.authPanel}
        >
          <MemberPortalRegistrationForm
            {...registration}
            congregationName={congregationName}
            onLogin={() => onViewChange('login')}
          />
        </TabsContent>
      </Tabs>
    )
  }

  const headingId =
    view === 'email-verification'
      ? 'member-portal-email-heading'
      : 'member-portal-approval-heading'

  return (
    <section
      key={view}
      ref={statusPanelRef}
      className={styles.authPanel}
      role="region"
      aria-labelledby={headingId}
      aria-live="polite"
      tabIndex={-1}
    >
      {view === 'email-verification' ? (
        <MemberPortalEmailVerification
          {...emailVerification}
          onChangeEmail={
            emailVerification.onChangeEmail ??
            (() => onViewChange('registration'))
          }
        />
      ) : (
        <MemberPortalPastorApproval
          {...pastorApproval}
          congregationName={congregationName}
          onReturnToLogin={
            pastorApproval?.onReturnToLogin ?? (() => onViewChange('login'))
          }
        />
      )}
    </section>
  )
}
