'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

import { PublicThemeRoot } from '@/components/public/public-theme-root'
import { CINEMATIC_PUBLIC_THEME_KEY } from '@/lib/public-site/visual-theme-registry'

interface PublicRouteFrameProps {
  children: ReactNode
  publicHomePath: string
  memberDashboardPath: string
  presetKey: string
  publicFooter: ReactNode
  publicHeader: ReactNode
  publicThemeBase: ReactNode
}

export function PublicRouteFrame({
  children,
  publicHomePath,
  memberDashboardPath,
  presetKey,
  publicFooter,
  publicHeader,
  publicThemeBase,
}: PublicRouteFrameProps) {
  const pathname = usePathname()
  const isMemberDashboard =
    pathname === memberDashboardPath ||
    pathname.startsWith(`${memberDashboardPath}/`)
  const isCinematicHome =
    presetKey === CINEMATIC_PUBLIC_THEME_KEY && pathname === publicHomePath

  if (isMemberDashboard) return children

  if (isCinematicHome) {
    return (
      <PublicThemeRoot presetKey={presetKey}>
        {publicThemeBase}
        {children}
      </PublicThemeRoot>
    )
  }

  return (
    <PublicThemeRoot presetKey={presetKey}>
      {publicThemeBase}
      {publicHeader}
      <main
        id="public-main-content"
        tabIndex={-1}
        className="flex-1 focus:outline-none"
      >
        {children}
      </main>
      {publicFooter}
    </PublicThemeRoot>
  )
}
