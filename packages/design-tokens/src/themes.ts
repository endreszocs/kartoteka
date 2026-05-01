/**
 * Kartotéka — 3 vizuális téma SSOT.
 *
 * Származás: Anthropic Design Handoff `shared/themes.jsx` portja TS-be.
 * Ez a fájl az **egyetlen igazság forrása** a 3 téma (Csendes parókia,
 * Kerített kert, Zsoltáros) színeihez, tipográfiájához és metrikáihoz.
 *
 * Két fogyasztó:
 *   1. `packages/ui/src/themes.css` — a CSS-vars értékek innen vannak átszedve
 *      (kézzel, mert Tailwind 4 inline `@theme` build-script overhead nélkül).
 *   2. Komponensek (motívum SVG-k, ThemePicker) — közvetlenül importálják:
 *      `import { themes, type ThemeName } from '@kartoteka/design-tokens'`
 *
 * Mindegyik téma `themes[name]` formában elérhető. A `darken(theme)` helper
 * a sötét variánst adja vissza (azonos szerkezet, sötétített háttér + szöveg).
 */

// ─────────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────────

export type ThemeName = 'parokia' | 'kert' | 'zsoltaros'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface ThemeTokens {
  // Identitás
  readonly name: string

  // Színek
  readonly bg: string
  readonly text: string
  readonly muted: string
  readonly accent: string
  readonly accent2: string
  readonly accentText: string
  readonly divider: string

  // Sidebar
  readonly sidebarWidth: number
  readonly sidebarBg: string
  readonly sidebarText: string
  readonly sidebarMuted: string
  readonly navHoverBg: string
  readonly navActiveBg: string
  readonly navActiveText: string
  readonly navActiveAccent: string
  readonly navRadius: number
  readonly logoBg: string
  readonly logoShadow: string

  // Header / form
  readonly headerBg: string
  readonly headerBorder: string
  readonly inputBg: string
  readonly inputBorder: string
  readonly inputRadius: number
  readonly iconBtnBg: string
  readonly onlineBg: string
  readonly onlineText: string
  readonly offlineBg: string
  readonly offlineText: string

  // Avatar
  readonly avatarBg: string
  readonly avatarText: string

  // Kártyák
  readonly cardBg: string
  readonly cardBorder: string
  readonly cardRadius: number
  readonly cardShadow: string
  readonly cardShadowHover: string

  // Statisztika kártyák
  readonly statBg: string
  readonly statBorder: string
  readonly statRadius: string | number
  readonly statArch: boolean

  // Modulok
  readonly modBg: string
  readonly modHoverBg: string
  readonly modBorder: string
  readonly modRadius: number

  // Tipográfia
  readonly fontDisplay: string
  readonly fontBody: string
  readonly h1Size: number
  readonly h1Weight: number
  readonly h1Spacing: number
  readonly h3Size: number
  readonly h3Weight: number
}

// ─────────────────────────────────────────────────────────────────────
// 1. Csendes parókia — meleg, lelkipásztori, klasszikus serif
// ─────────────────────────────────────────────────────────────────────

export const ThemeParokia: ThemeTokens = {
  name: 'Csendes parókia',
  bg: '#faf6ed',
  text: '#22332e',
  muted: '#6b7669',
  accent: '#1f3a3a',
  accent2: '#5a8a48',
  accentText: '#faf6ed',
  divider: 'rgba(31,58,58,.08)',

  sidebarWidth: 232,
  sidebarBg: '#1f3a3a',
  sidebarText: 'rgba(247,243,234,.85)',
  sidebarMuted: 'rgba(247,243,234,.55)',
  navHoverBg: 'rgba(247,243,234,.06)',
  navActiveBg: 'rgba(247,243,234,.1)',
  navActiveText: '#faf6ed',
  navActiveAccent: '#a4c98a',
  navRadius: 9,
  logoBg: '#f4ecd8',
  logoShadow: '0 4px 14px rgba(0,0,0,.25), inset 0 0 0 4px rgba(31,58,58,.06)',

  headerBg: 'transparent',
  headerBorder: '1px solid rgba(31,58,58,.07)',
  inputBg: 'rgba(31,58,58,.05)',
  inputBorder: '1px solid transparent',
  inputRadius: 10,
  iconBtnBg: 'rgba(31,58,58,.06)',
  onlineBg: 'rgba(127,176,105,.12)',
  onlineText: '#3d6a2c',
  offlineBg: 'rgba(217,152,106,.18)',
  offlineText: '#a3551c',

  avatarBg: '#1f3a3a',
  avatarText: '#f4ecd8',

  cardBg: '#fffdf7',
  cardBorder: '1px solid rgba(31,58,58,.06)',
  cardRadius: 16,
  cardShadow: '0 1px 2px rgba(31,58,58,.04), 0 8px 24px rgba(31,58,58,.06)',
  cardShadowHover: '0 1px 2px rgba(31,58,58,.04), 0 14px 32px rgba(31,58,58,.1)',

  statBg: 'rgba(31,58,58,.025)',
  statBorder: '1px solid rgba(31,58,58,.05)',
  statRadius: '50% 50% 14px 14px / 30% 30% 14px 14px',
  statArch: true,

  modBg: 'rgba(31,58,58,.025)',
  modHoverBg: 'rgba(31,58,58,.05)',
  modBorder: '1px solid rgba(31,58,58,.05)',
  modRadius: 14,

  fontDisplay: '"Cormorant Garamond", "Source Serif Pro", Georgia, serif',
  fontBody: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
  h1Size: 38,
  h1Weight: 500,
  h1Spacing: -0.5,
  h3Size: 18,
  h3Weight: 500,
}

// ─────────────────────────────────────────────────────────────────────
// 2. Kerített kert — modern SaaS, hűvösebb, geometrikus (DEFAULT)
// ─────────────────────────────────────────────────────────────────────

export const ThemeKert: ThemeTokens = {
  name: 'Kerített kert',
  bg: '#f3f1ec',
  text: '#1c2a26',
  muted: '#6e7a72',
  accent: '#264e4a',
  accent2: '#6b8e4e',
  accentText: '#fff',
  divider: 'rgba(28,42,38,.08)',

  sidebarWidth: 220,
  sidebarBg: '#143030',
  sidebarText: 'rgba(228,232,222,.85)',
  sidebarMuted: 'rgba(228,232,222,.5)',
  navHoverBg: 'rgba(228,232,222,.05)',
  navActiveBg: 'rgba(107,142,78,.18)',
  navActiveText: '#e4e8de',
  navActiveAccent: '#9bbf6e',
  navRadius: 7,
  logoBg: '#fff',
  logoShadow: '0 2px 10px rgba(0,0,0,.25)',

  headerBg: 'rgba(255,255,255,.55)',
  headerBorder: '1px solid rgba(28,42,38,.07)',
  inputBg: '#fff',
  inputBorder: '1px solid rgba(28,42,38,.1)',
  inputRadius: 8,
  iconBtnBg: 'rgba(255,255,255,.7)',
  onlineBg: '#e8f0db',
  onlineText: '#3d6a2c',
  offlineBg: '#f5e0cd',
  offlineText: '#a3551c',

  avatarBg: '#264e4a',
  avatarText: '#fff',

  cardBg: '#fff',
  cardBorder: '1px solid rgba(28,42,38,.08)',
  cardRadius: 12,
  cardShadow: '0 1px 2px rgba(28,42,38,.04)',
  cardShadowHover: '0 2px 4px rgba(28,42,38,.06), 0 8px 24px rgba(28,42,38,.06)',

  statBg: '#f7f5f0',
  statBorder: '1px solid rgba(28,42,38,.06)',
  statRadius: 12,
  statArch: false,

  modBg: '#f7f5f0',
  modHoverBg: '#f0eee7',
  modBorder: '1px solid rgba(28,42,38,.06)',
  modRadius: 10,

  fontDisplay: '"Fraunces", "Source Serif Pro", Georgia, serif',
  fontBody: '"Geist Variable", "Inter", system-ui, sans-serif',
  h1Size: 34,
  h1Weight: 500,
  h1Spacing: -0.6,
  h3Size: 16,
  h3Weight: 600,
}

// ─────────────────────────────────────────────────────────────────────
// 3. Zsoltáros — klasszikus, méltóságteljes, slab serif
// ─────────────────────────────────────────────────────────────────────

export const ThemeZsoltaros: ThemeTokens = {
  name: 'Zsoltáros',
  bg: '#f6efe1',
  text: '#2a2218',
  muted: '#7a6e58',
  accent: '#2c4a3e',
  accent2: '#a3551c',
  accentText: '#f6efe1',
  divider: 'rgba(42,34,24,.1)',

  sidebarWidth: 240,
  sidebarBg: '#2a2218',
  sidebarText: 'rgba(246,239,225,.85)',
  sidebarMuted: 'rgba(246,239,225,.55)',
  navHoverBg: 'rgba(246,239,225,.05)',
  navActiveBg: 'rgba(163,85,28,.2)',
  navActiveText: '#f6efe1',
  navActiveAccent: '#c97a3f',
  navRadius: 4,
  logoBg: '#f6efe1',
  logoShadow: '0 4px 18px rgba(0,0,0,.4), 0 0 0 6px rgba(246,239,225,.06)',

  headerBg: '#f6efe1',
  headerBorder: '2px solid rgba(42,34,24,.1)',
  inputBg: 'rgba(255,255,255,.5)',
  inputBorder: '1px solid rgba(42,34,24,.1)',
  inputRadius: 4,
  iconBtnBg: 'rgba(42,34,24,.05)',
  onlineBg: 'rgba(44,74,62,.1)',
  onlineText: '#1f3528',
  offlineBg: 'rgba(163,85,28,.15)',
  offlineText: '#7a3f12',

  avatarBg: '#2c4a3e',
  avatarText: '#f6efe1',

  cardBg: '#fdf9ed',
  cardBorder: '1px solid rgba(42,34,24,.1)',
  cardRadius: 6,
  cardShadow: '0 1px 0 rgba(42,34,24,.04), 0 4px 14px rgba(42,34,24,.06)',
  cardShadowHover: '0 1px 0 rgba(42,34,24,.04), 0 8px 22px rgba(42,34,24,.1)',

  statBg: '#f6efe1',
  statBorder: '1px solid rgba(42,34,24,.1)',
  statRadius: 6,
  statArch: false,

  modBg: '#f6efe1',
  modHoverBg: '#efe6d2',
  modBorder: '1px solid rgba(42,34,24,.1)',
  modRadius: 6,

  fontDisplay: '"Roboto Slab", "Source Serif Pro", Georgia, serif',
  fontBody: '"Inter", system-ui, sans-serif',
  h1Size: 36,
  h1Weight: 500,
  h1Spacing: -0.3,
  h3Size: 17,
  h3Weight: 600,
}

// ─────────────────────────────────────────────────────────────────────
// Téma-mapping + sötét variáns
// ─────────────────────────────────────────────────────────────────────

export const themes: Record<ThemeName, ThemeTokens> = {
  parokia: ThemeParokia,
  kert: ThemeKert,
  zsoltaros: ThemeZsoltaros,
}

export const DEFAULT_THEME: ThemeName = 'kert'

/**
 * Sötét variáns gyors konvertálással. Eredeti `themes.jsx`-ből.
 * A téma legtöbb tokenét megtartja, csak a háttér / szöveg / kártya színek
 * cserélődnek mély-sötét palettára.
 */
export function darken(theme: ThemeTokens): ThemeTokens {
  return {
    ...theme,
    bg: '#1a1f1d',
    text: '#e8e1d2',
    muted: '#8a8474',
    divider: 'rgba(232,225,210,.08)',
    cardBg: '#22282a',
    cardBorder: '1px solid rgba(232,225,210,.06)',
    inputBg: 'rgba(232,225,210,.05)',
    iconBtnBg: 'rgba(232,225,210,.06)',
    statBg: 'rgba(232,225,210,.03)',
    statBorder: '1px solid rgba(232,225,210,.05)',
    modBg: 'rgba(232,225,210,.03)',
    modHoverBg: 'rgba(232,225,210,.06)',
    modBorder: '1px solid rgba(232,225,210,.05)',
    headerBg: 'transparent',
    headerBorder: '1px solid rgba(232,225,210,.06)',
  }
}
