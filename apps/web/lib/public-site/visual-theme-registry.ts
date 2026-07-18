/**
 * Forraskodban kezelt vizualis reteg a publikus oldal temaihoz.
 *
 * A DB marad a tema szineinek es tipografiajanak igazsagforrasa. Ez a registry
 * csak azokat a prezentacios reszleteket tartalmazza, amelyek nem illenek a
 * public_site_themes JSON mezoihez (generalt kepek, hero fokusz, kontraszt).
 * A kulcsok kozvetlenul a public_site_themes.preset_key ertekeivel egyeznek.
 */

export const PUBLIC_VISUAL_THEME_KEYS = [
  'elo-kert',
  'csendes-parokia',
  'zsoltaros-orokseg',
] as const

export type PublicVisualThemeKey = (typeof PUBLIC_VISUAL_THEME_KEYS)[number]

export interface PublicVisualThemeAssets {
  /** Teljes szelessegu, 16:9-es vagy szelesebb generalt hero hatter. */
  hero: string
  /** Opcionális, generált közösségi életkép a kezdőlap történeti blokkjához. */
  community?: string
  /** Opcionális, generált örökségi kép a kezdőlap történeti blokkjához. */
  heritage?: string
  /** Opcionális, generált széles kép a találkozási felhíváshoz. */
  invitation?: string
}

export interface PublicVisualThemeDefinition {
  key: PublicVisualThemeKey
  displayName: string
  assets: PublicVisualThemeAssets
  adminPreview: {
    eyebrow: string
    summary: string
  }
  hero: {
    backgroundPosition: string
    overlay: string
  }
}

function themeAssets(key: PublicVisualThemeKey): PublicVisualThemeAssets {
  return {
    hero: `/public-site/themes/${key}/hero.png`,
  }
}

export const PUBLIC_VISUAL_THEMES: Readonly<
  Record<PublicVisualThemeKey, PublicVisualThemeDefinition>
> = {
  'elo-kert': {
    key: 'elo-kert',
    displayName: 'Élő kert',
    assets: {
      ...themeAssets('elo-kert'),
      community: '/public-site/themes/elo-kert/baratosi-community-v2.png',
      heritage: '/public-site/themes/elo-kert/baratosi-heritage-v2.png',
      invitation: '/public-site/themes/elo-kert/baratosi-hero-v2.png',
    },
    adminPreview: {
      eyebrow: 'Élő közösség',
      summary: 'Friss, közösségi és eseményközpontú megjelenés.',
    },
    hero: {
      backgroundPosition: 'center 46%',
      overlay:
        'linear-gradient(180deg, rgba(8, 40, 31, 0.2) 0%, rgba(6, 31, 26, 0.82) 100%)',
    },
  },
  'csendes-parokia': {
    key: 'csendes-parokia',
    displayName: 'Csendes parókia',
    assets: themeAssets('csendes-parokia'),
    adminPreview: {
      eyebrow: 'Meleg és bizalomteljes',
      summary: 'Nyugodt, emberközeli felület finom, otthonos részletekkel.',
    },
    hero: {
      backgroundPosition: 'center 48%',
      overlay:
        'linear-gradient(180deg, rgba(48, 30, 18, 0.18) 0%, rgba(39, 25, 17, 0.76) 100%)',
    },
  },
  'zsoltaros-orokseg': {
    key: 'zsoltaros-orokseg',
    displayName: 'Zsoltáros örökség',
    assets: themeAssets('zsoltaros-orokseg'),
    adminPreview: {
      eyebrow: 'Hagyomány és méltóság',
      summary: 'Szerkesztőségi ritmusú, elegáns és örökségközpontú stílus.',
    },
    hero: {
      backgroundPosition: 'center 42%',
      overlay:
        'linear-gradient(180deg, rgba(18, 25, 35, 0.26) 0%, rgba(12, 19, 27, 0.86) 100%)',
    },
  },
}

export function isPublicVisualThemeKey(value: string): value is PublicVisualThemeKey {
  return (PUBLIC_VISUAL_THEME_KEYS as readonly string[]).includes(value)
}

/**
 * Ismeretlen vagy regi presetnel null-t ad vissza, igy a jelenlegi temak
 * valtozatlanul a legacy megjelenitest hasznaljak.
 */
export function getPublicVisualTheme(
  presetKey: string | null | undefined,
): PublicVisualThemeDefinition | null {
  if (!presetKey || !isPublicVisualThemeKey(presetKey)) return null
  return PUBLIC_VISUAL_THEMES[presetKey]
}
