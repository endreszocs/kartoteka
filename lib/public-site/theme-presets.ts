// Publikus oldal téma presetek — szinkronban a DB seed-del
// (2026-04-12-public-site-tables.sql)

export interface ThemeColors {
  primary: string
  accent: string
  surface: string
  ink: string
  muted: string
  soft: string
}

export interface ThemeTypography {
  heading_font: string
  body_font: string
}

export type HeroStyle = 'photo' | 'pattern' | 'crest' | 'gradient'

export interface PublicSiteTheme {
  id: string
  preset_key: string
  display_name: string
  description: string | null
  colors: ThemeColors
  typography: ThemeTypography
  hero_style: HeroStyle
  border_radius: string
  sort_order: number
  is_active: boolean
}

// Fallback default — ha a DB-ből nem sikerül betölteni
export const FALLBACK_THEME: PublicSiteTheme = {
  id: 'fallback',
  preset_key: 'klasszikus-maros',
  display_name: 'Klasszikus Maros',
  description: 'Hagyományos református dizájn',
  colors: {
    primary: '#14514b',
    accent: '#d4a04a',
    surface: '#fffdf8',
    ink: '#294853',
    muted: '#66848c',
    soft: '#edf6f1',
  },
  typography: {
    heading_font: 'Cormorant Garamond',
    body_font: 'DM Sans',
  },
  hero_style: 'crest',
  border_radius: '1rem',
  sort_order: 10,
  is_active: true,
}

// Megengedett font-ok whitelist — senki ne adjon hozzá tetszőleges font-ot
export const ALLOWED_FONTS = new Set([
  'Cormorant Garamond',
  'DM Sans',
  'Fraunces',
  'Inter',
  'Lora',
])

export function isAllowedFont(font: string): boolean {
  return ALLOWED_FONTS.has(font)
}

/**
 * CSS változókat generál egy témából, amelyet a layout.tsx `<style>` blokkba
 * illeszt. Opcionális custom color felülírások.
 */
export function buildThemeCssVariables(
  theme: PublicSiteTheme,
  customPrimary?: string | null,
  customAccent?: string | null,
): string {
  const primary = customPrimary || theme.colors.primary
  const accent = customAccent || theme.colors.accent

  return `
    --public-primary: ${primary};
    --public-accent: ${accent};
    --public-surface: ${theme.colors.surface};
    --public-ink: ${theme.colors.ink};
    --public-muted: ${theme.colors.muted};
    --public-soft: ${theme.colors.soft};
    --public-heading-font: ${theme.typography.heading_font}, Georgia, serif;
    --public-body-font: ${theme.typography.body_font}, system-ui, sans-serif;
    --public-radius: ${theme.border_radius};
  `.trim()
}

/**
 * Google Fonts URL-t épít a téma alapján. A whitelist biztosítja, hogy
 * csak biztonságos font-ok töltődnek be.
 */
export function buildGoogleFontsUrl(theme: PublicSiteTheme): string | null {
  const fonts = new Set<string>()
  if (isAllowedFont(theme.typography.heading_font)) {
    fonts.add(theme.typography.heading_font)
  }
  if (isAllowedFont(theme.typography.body_font)) {
    fonts.add(theme.typography.body_font)
  }
  if (fonts.size === 0) return null

  const families = Array.from(fonts)
    .map(f => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${families}&display=swap`
}
