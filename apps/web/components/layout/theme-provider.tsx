'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ComponentProps } from 'react'
import { ThemeStyleProvider } from '@kartoteka/ui-app'

/**
 * Téma-provider wrapper — két rétegben.
 *
 * 1. `next-themes` (attribute="class") — világos / sötét / rendszer mód a
 *    `<html class="dark">` osztályon keresztül; a Tailwind `dark:` variáns ezt nézi.
 * 2. `ThemeStyleProvider` (Sprint R · v0.8.1) — a 3 vizuális téma
 *    (Csendes parókia / Kerített kert / Zsoltáros) `<html data-theme="...">`
 *    attr-rel + `kartoteka-theme-style-v1` localStorage-szal.
 *
 * A két réteg **ortogonális**: a felhasználó bármelyik mód × bármelyik
 * stílus kombinációt választhat. A CSS-vars átfedését a
 * `packages/ui/src/themes.css` `[data-theme="X"].dark` szelektorai oldják meg.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <ThemeStyleProvider>{children}</ThemeStyleProvider>
    </NextThemesProvider>
  )
}
