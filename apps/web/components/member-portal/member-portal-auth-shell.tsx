import Image from 'next/image'
import { Church, ShieldCheck } from 'lucide-react'

import styles from './member-portal-auth.module.css'
import type { MemberPortalCongregationIdentity } from './types'

interface MemberPortalAuthShellProps
  extends MemberPortalCongregationIdentity {
  children: React.ReactNode
  visualEyebrow?: string
  visualTitle?: string
  visualDescription?: string
}

export function MemberPortalAuthShell({
  congregationName,
  location,
  denomination = 'Református gyülekezeti tagi tér',
  children,
  visualEyebrow = 'A közösség online otthona',
  visualTitle = 'Közelebb a gyülekezethez. Biztonságban az adatai.',
  visualDescription =
    'Személyes hírek, családi kapcsolatok és befizetések egy védett, gyülekezethez kötött felületen.',
}: MemberPortalAuthShellProps) {
  return (
    <div className={styles.authPage}>
      <aside className={styles.visualPanel} aria-label="Bemutatkozás">
        <Image
          src="/member-portal/auth-background.png"
          alt=""
          fill
          preload
          sizes="(min-width: 960px) 58vw, 100vw"
          className={styles.visualImage}
        />
        <div className={styles.visualVeil} aria-hidden="true" />
        <div className={styles.visualCopy}>
          <p className={styles.visualEyebrow}>{visualEyebrow}</p>
          <p className={styles.visualTitle}>{visualTitle}</p>
          <p className={styles.visualDescription}>{visualDescription}</p>
        </div>
      </aside>

      <section
        className={styles.formPanel}
        aria-label={`${congregationName} tagi portál`}
      >
        <div className={styles.formPanelInner}>
          <header className={styles.brandHeader}>
            <div className={styles.brandMark} aria-hidden="true">
              <Church />
            </div>
            <div className={styles.brandCopy}>
              <p className={styles.brandOverline}>Tagi portál</p>
              <p className={styles.brandName}>{congregationName}</p>
              {(location || denomination) && (
                <p className={styles.brandMeta}>
                  {[location, denomination].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </header>

          <div className={styles.authCard}>{children}</div>

          <footer className={styles.privacyNote}>
            <ShieldCheck aria-hidden="true" />
            <span>
              A tagi fiók elkülönül a lelkipásztori kezelőfelülettől. Személyes
              adatai csak jóváhagyás után válnak elérhetővé.
            </span>
          </footer>
        </div>
      </section>
    </div>
  )
}
