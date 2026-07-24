import type { ReactNode } from 'react'
import { getPublicVisualTheme } from '@/lib/public-site/visual-theme-registry'
import styles from './public-theme-root.module.css'

interface PublicThemeRootProps {
  children: ReactNode
  presetKey: string
}

export function PublicThemeRoot({ children, presetKey }: PublicThemeRootProps) {
  const visualTheme = getPublicVisualTheme(presetKey)

  return (
    <div
      className={`public-site-root min-h-screen flex flex-col ${styles.root}`}
      data-public-theme={visualTheme?.key ?? presetKey}
    >
      {children}
    </div>
  )
}
