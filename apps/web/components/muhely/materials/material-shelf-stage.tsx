import Image from 'next/image'
import type { ReactNode } from 'react'

import styles from './materials-studio.module.css'

interface MaterialShelfStageProps {
  children: ReactNode
  busy?: boolean
}

export function MaterialShelfStage({ children, busy = false }: MaterialShelfStageProps) {
  return (
    <section
      className={`${styles.shelfStage} ${busy ? styles.filterPending : ''}`}
      aria-label="Segédanyagok polca"
    >
      <div className={styles.shelfBackdrop} aria-hidden="true">
        <Image
          src="/misszios-muhely/workshop-shelf-stage-bg-v1.webp"
          alt=""
          fill
          sizes="(min-width: 1380px) 1380px, 100vw"
          className={styles.shelfBackdropImage}
        />
      </div>
      <div className={styles.shelfVeil} aria-hidden="true" />
      <div className={styles.shelfGlow} aria-hidden="true" />
      <div className={styles.shelfGrid}>{children}</div>
      <div className={styles.shelfLip} aria-hidden="true" />
    </section>
  )
}
