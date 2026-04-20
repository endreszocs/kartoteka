'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ComponentProps } from 'react'

/**
 * Téma-provider wrapper.
 * Használat: a root layout-ban körbeöleli az egész alkalmazást.
 * A next-themes `attribute="class"` módszert használja — a `<html>` elemre
 * kerül `.dark` vagy `.light` class, és a Tailwind `dark:` variáns működik.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
