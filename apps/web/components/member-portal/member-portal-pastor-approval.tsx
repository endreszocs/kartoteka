'use client'

import { Link2, UserRoundCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import styles from './member-portal-auth.module.css'
import { MemberPortalStatusStep } from './member-portal-status-step'
import type { MemberPortalPastorApprovalOptions } from './types'

interface MemberPortalPastorApprovalProps
  extends MemberPortalPastorApprovalOptions {
  congregationName: string
}

export function MemberPortalPastorApproval({
  congregationName,
  referenceCode,
  submittedAtLabel,
  onReturnToLogin,
}: MemberPortalPastorApprovalProps) {
  return (
    <div className={cn(styles.panelBody, styles.statusPanel)}>
      <div className={styles.statusIcon} data-tone="approval">
        <UserRoundCheck aria-hidden="true" />
      </div>
      <div className={styles.panelHeading}>
        <p className={styles.panelEyebrow}>Kérelem beérkezett</p>
        <h1 id="member-portal-approval-heading">Lelkipásztori jóváhagyásra vár</h1>
        <p>
          A(z) <strong>{congregationName}</strong> lelkipásztora ellenőrzi a
          kérelmet és megkeresi a nyilvántartásban szereplő személyes adatlapját.
        </p>
      </div>

      {(referenceCode || submittedAtLabel) && (
        <dl className={styles.requestMeta}>
          {referenceCode ? (
            <div>
              <dt>Kérelem azonosítója</dt>
              <dd>{referenceCode}</dd>
            </div>
          ) : null}
          {submittedAtLabel ? (
            <div>
              <dt>Beküldve</dt>
              <dd>{submittedAtLabel}</dd>
            </div>
          ) : null}
        </dl>
      )}

      <ol className={styles.statusSteps} aria-label="A csatlakozási kérelem állapota">
        <MemberPortalStatusStep
          state="complete"
          title="E-mail-cím megerősítve"
          description="A fiók elérhetősége ellenőrzött."
        />
        <MemberPortalStatusStep
          state="current"
          title="Lelkipásztori ellenőrzés"
          description="A kérelem és a nyilvántartás egyeztetése folyamatban van."
        />
        <MemberPortalStatusStep
          state="upcoming"
          title="Személyes adatlap összekapcsolása"
          description="Sikeres jóváhagyás után megnyílik a tagi portál."
        />
      </ol>

      <div className={styles.statusInfo}>
        <Link2 aria-hidden="true" />
        <p>
          A jóváhagyásról e-mailben értesítjük. Nincs szükség újabb kérelem
          beküldésére; az ismételt regisztráció lassíthatja az ellenőrzést.
        </p>
      </div>

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
  )
}
