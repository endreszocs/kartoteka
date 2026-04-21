/**
 * React Router `Link` adapter a `@kartoteka/ui` `SidebarLinkComponent`-hez.
 *
 * A `@kartoteka/ui` a `{ href, children, onClick, className, ...aria, ... }`
 * interfészt várja (Next.js-like). A react-router-dom `Link` viszont `to`
 * propot használ, nem `href`-et. Ez a komponens átalakítja.
 */

import { forwardRef } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import type { SidebarLinkProps } from '@kartoteka/ui'

export const DesktopLink = forwardRef<HTMLAnchorElement, SidebarLinkProps>(
  function DesktopLink(
    {
      href,
      children,
      onClick,
      title,
      'aria-label': ariaLabel,
      'data-walkthrough': dataWalkthrough,
      suppressHydrationWarning,
      className,
    },
    ref,
  ) {
    return (
      <RouterLink
        ref={ref}
        to={href}
        onClick={onClick}
        title={title}
        aria-label={ariaLabel}
        data-walkthrough={dataWalkthrough}
        suppressHydrationWarning={suppressHydrationWarning}
        className={className}
      >
        {children}
      </RouterLink>
    )
  },
)
