'use client'

import { KeyRound, LoaderCircle, MailCheck, RotateCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import styles from './member-portal-auth.module.css'
import { MemberPortalStatusStep } from './member-portal-status-step'
import type { MemberPortalEmailVerificationOptions } from './types'

export function MemberPortalEmailVerification({
  emailAddress,
  isConditionalDeliveryNotice = false,
  isResending = false,
  onResend,
  onChangeEmail,
  onReturnToLogin,
}: MemberPortalEmailVerificationOptions) {
  return (
    <div className={cn(styles.panelBody, styles.statusPanel)}>
      <div className={styles.statusIcon} data-tone="mail">
        <MailCheck aria-hidden="true" />
      </div>
      <div className={styles.panelHeading}>
        <p className={styles.panelEyebrow}>Már csak egy lépés</p>
        <h1 id="member-portal-email-heading">Erősítse meg az e-mail-címét</h1>
        <p>
          {isConditionalDeliveryNotice
            ? 'Ha a megadott e-mail-címhez létrehozható tagi fiók, a megerősítő hivatkozást erre a címre küldjük:'
            : 'Elküldtük a megerősítő hivatkozást a következő címre:'}
          <strong className={styles.emailAddress}>{emailAddress}</strong>
        </p>
      </div>

      <div className={styles.statusInfo}>
        <KeyRound aria-hidden="true" />
        <p>
          A hivatkozás megnyitása után a csatlakozási kérelem automatikusan a
          lelkipásztorhoz kerül. Addig személyes adat nem válik elérhetővé.
        </p>
      </div>

      <ol className={styles.statusSteps} aria-label="A regisztráció állapota">
        <MemberPortalStatusStep
          state="complete"
          title="Fiókadatok megadva"
          description="A csatlakozási kérelem elkészült."
        />
        <MemberPortalStatusStep
          state="current"
          title="E-mail megerősítése"
          description="Nyissa meg a levélben kapott hivatkozást."
        />
        <MemberPortalStatusStep
          state="upcoming"
          title="Lelkipásztori jóváhagyás"
          description="A kérelem ellenőrzése csak ezután indul."
        />
      </ol>

      <div className={styles.statusActions}>
        {onResend ? (
          <Button
            type="button"
            size="lg"
            className={styles.primaryAction}
            disabled={isResending}
            onClick={() => void onResend()}
          >
            {isResending ? (
              <LoaderCircle className={styles.spinner} aria-hidden="true" />
            ) : (
              <RotateCw aria-hidden="true" />
            )}
            {isResending ? 'Küldés folyamatban…' : 'Megerősítő levél újraküldése'}
          </Button>
        ) : null}
        {onChangeEmail ? (
          <Button
            type="button"
            size="lg"
            variant="outline"
            className={styles.secondaryAction}
            onClick={onChangeEmail}
          >
            Másik e-mail-címet adok meg
          </Button>
        ) : null}
        {onReturnToLogin ? (
          <Button
            type="button"
            size="lg"
            variant="outline"
            className={styles.secondaryAction}
            onClick={onReturnToLogin}
          >
            Vissza a belépéshez
          </Button>
        ) : null}
      </div>
      <p className={styles.statusFineprint}>
        Nem találja a levelet? Ellenőrizze a levélszemét és a promóciók mappát is.
      </p>
    </div>
  )
}
