'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

import { PublicThemeRoot } from '@/components/public/public-theme-root'

interface PublicRouteFrameProps {
  children: ReactNode
  memberDashboardPath: string
  presetKey: string
  publicFooter: ReactNode
  publicHeader: ReactNode
}

export function PublicRouteFrame({
  children,
  memberDashboardPath,
  presetKey,
  publicFooter,
  publicHeader,
}: PublicRouteFrameProps) {
  const pathname = usePathname()
  const isMemberDashboard =
    pathname === memberDashboardPath ||
    pathname.startsWith(`${memberDashboardPath}/`)

  if (isMemberDashboard) return children

  return (
    <PublicThemeRoot presetKey={presetKey}>
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
