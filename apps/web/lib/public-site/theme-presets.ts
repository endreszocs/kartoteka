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

// Kizárólag a globális design-rendszerben már self-hostolt fontokat adjuk
// vissza. A régi presetek DM Sans/Lora neveit kompatibilis helyi családokra
// képezzük, így a publikus oldal nem indít külső Google Fonts kérést.
const LOCAL_FONT_STACKS: Readonly<Record<string, string>> = {
  'Cormorant Garamond': '"Cormorant Garamond", Georgia, serif',
  'DM Sans': '"Inter", "Geist Variable", system-ui, sans-serif',
  Fraunces: '"Fraunces", Georgia, serif',
  Inter: '"Inter", "Geist Variable", system-ui, sans-serif',
  Lora: '"Cormorant Garamond", Georgia, serif',
  'Roboto Slab': '"Roboto Slab", Georgia, serif',
  'Geist Variable': '"Geist Variable", "Inter", system-ui, sans-serif',
}
function localFontStack(font: string, kind: 'heading' | 'body'): string {
  return LOCAL_FONT_STACKS[font]
    ?? (kind === 'heading'
      ? '"Cormorant Garamond", Georgia, serif'
      : '"Inter", "Geist Variable", system-ui, sans-serif')
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

const DEFAULT_PRIMARY = '#14514b'
const DEFAULT_ACCENT = '#d4a04a'
const DEFAULT_SURFACE = '#fffdf8'
const DEFAULT_INK = '#294853'
const DEFAULT_MUTED = '#66848c'
const DEFAULT_SOFT = '#edf6f1'

export interface ResolvedThemeColors {
  primary: string
  primaryOnSurface: string
  accent: string
  accentOnSurface: string
  accentStrong: string
  surface: string
  ink: string
  muted: string
  mutedOnSurface: string
  soft: string
}

function safeHexColor(value: string | null | undefined, fallback: string): string {
  return value && HEX_COLOR.test(value) ? value.toLowerCase() : fallback
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4
  })

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)

  return (lighter + 0.05) / (darker + 0.05)
}

export function hasMinimumHexContrast(
  foreground: string,
  background: string,
  minimum = 4.5,
): boolean {
  if (!HEX_COLOR.test(foreground) || !HEX_COLOR.test(background)) return false

  return contrastRatio(foreground.toLowerCase(), background.toLowerCase()) >= minimum
}

function accessibleColor(
  preferred: string,
  background: string,
  fallbacks: readonly string[],
): string {
  return [preferred, ...fallbacks, '#000000', '#ffffff'].find(
    (candidate) => contrastRatio(candidate, background) >= 4.5,
  ) ?? '#000000'
}

/**
 * A DB-ből érkező színeket egyetlen renderelési határon oldja fel.
 * Minden visszaadott érték pontosan #RRGGBB formátumú; a szöveges
 * szerepű tokenek a saját hátterükön legalább 4.5:1 kontrasztúak.
 */
export function resolveThemeColors(
  theme: { colors?: Partial<ThemeColors> | null },
  customPrimary?: string | null,
  customAccent?: string | null,
): ResolvedThemeColors {
  const themeColors = theme.colors ?? {}
  const preferredPrimary = safeHexColor(
    customPrimary || themeColors.primary,
    DEFAULT_PRIMARY,
  )
  const accent = safeHexColor(
    customAccent || themeColors.accent,
    DEFAULT_ACCENT,
  )
  const surface = safeHexColor(themeColors.surface, DEFAULT_SURFACE)
  const inkCandidate = safeHexColor(themeColors.ink, DEFAULT_INK)
  const mutedCandidate = safeHexColor(themeColors.muted, DEFAULT_MUTED)
  const soft = safeHexColor(themeColors.soft, DEFAULT_SOFT)

  // A primary fehér feliratú gombok és hátterek színe is, ezért itt
  // nem engedünk tovább olyan egyedi árnyalatot, amely nem olvasható.
  const primary = accessibleColor(preferredPrimary, '#ffffff', [
    safeHexColor(themeColors.primary, DEFAULT_PRIMARY),
    inkCandidate,
    DEFAULT_PRIMARY,
  ])
  const ink = accessibleColor(inkCandidate, surface, [primary, DEFAULT_INK])
  const primaryOnSurface = accessibleColor(primary, surface, [ink, DEFAULT_INK])
  const mutedOnSurface = accessibleColor(mutedCandidate, surface, [
    ink,
    primaryOnSurface,
    DEFAULT_MUTED,
  ])
  const accentOnSurface = accessibleColor(accent, surface, [
    primaryOnSurface,
    ink,
  ])
  const accentStrong = accessibleColor(accent, '#ffffff', [primary, ink])

  return {
    primary,
    primaryOnSurface,
    accent,
    accentOnSurface,
    accentStrong,
    surface,
    ink,
    muted: mutedOnSurface,
    mutedOnSurface,
    soft,
  }
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
  const colors = resolveThemeColors(theme, customPrimary, customAccent)
  const radius = typeof theme.border_radius === 'string'
    && /^\d+(?:\.\d+)?(?:rem|px)$/.test(theme.border_radius)
    ? theme.border_radius
    : '1rem'
  const headingFont = typeof theme.typography?.heading_font === 'string'
    ? theme.typography.heading_font
    : ''
  const bodyFont = typeof theme.typography?.body_font === 'string'
    ? theme.typography.body_font
    : ''

  return `
    --public-primary: ${colors.primary};
    --public-primary-on-surface: ${colors.primaryOnSurface};
    --public-accent: ${colors.accent};
    --public-accent-on-surface: ${colors.accentOnSurface};
    --public-accent-strong: ${colors.accentStrong};
    --public-surface: ${colors.surface};
    --public-ink: ${colors.ink};
    --public-muted: ${colors.muted};
    --public-muted-on-surface: ${colors.mutedOnSurface};
    --public-soft: ${colors.soft};
    --public-heading-font: ${localFontStack(headingFont, 'heading')};
    --public-body-font: ${localFontStack(bodyFont, 'body')};
    --public-radius: ${radius};
  `.trim()
}
