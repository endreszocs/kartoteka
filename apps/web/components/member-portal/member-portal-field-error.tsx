import styles from './member-portal-auth.module.css'

interface MemberPortalFieldErrorProps {
  id: string
  message?: string
}

export function MemberPortalFieldError({
  id,
  message,
}: MemberPortalFieldErrorProps) {
  if (!message) return null

  return (
    <p id={id} className={styles.fieldError} role="alert">
      {message}
    </p>
  )
}
