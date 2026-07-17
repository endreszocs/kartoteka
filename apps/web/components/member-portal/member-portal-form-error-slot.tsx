import { AlertCircle } from 'lucide-react'

import styles from './member-portal-auth.module.css'

interface MemberPortalFormErrorSlotProps {
  message?: string
}

export function MemberPortalFormErrorSlot({
  message,
}: MemberPortalFormErrorSlotProps) {
  return (
    <div
      className={styles.formErrorSlot}
      data-empty={!message || undefined}
      aria-live="polite"
      aria-atomic="true"
    >
      {message ? (
        <div className={styles.formError} role="alert">
          <AlertCircle aria-hidden="true" />
          <span>{message}</span>
        </div>
      ) : null}
    </div>
  )
}
