import { Check, Clock3 } from 'lucide-react'

import styles from './member-portal-auth.module.css'

interface MemberPortalStatusStepProps {
  state: 'complete' | 'current' | 'upcoming'
  title: string
  description: string
}

export function MemberPortalStatusStep({
  state,
  title,
  description,
}: MemberPortalStatusStepProps) {
  return (
    <li className={styles.statusStep} data-state={state}>
      <span className={styles.statusStepMarker} aria-hidden="true">
        {state === 'complete' ? <Check /> : state === 'current' ? <Clock3 /> : null}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </li>
  )
}
