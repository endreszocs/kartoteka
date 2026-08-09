/**
 * Forraskodban kezelt vizualis reteg a publikus oldal temaihoz.
 *
 * A DB marad a tema szineinek es tipografiajanak igazsagforrasa. Ez a registry
 * csak azokat a prezentacios reszleteket tartalmazza, amelyek nem illenek a
 * public_site_themes JSON mezoihez (generalt kepek, hero fokusz, kontraszt).
 * A kulcsok kozvetlenul a public_site_themes.preset_key ertekeivel egyeznek.
 */

export const CINEMATIC_PUBLIC_THEME_KEY = 'filmszeru-tortenet' as const

export const PUBLIC_VISUAL_THEME_KEYS = [
  CINEMATIC_PUBLIC_THEME_KEY,
  'elo-kert',
  'csendes-parokia',
  'zsoltaros-orokseg',
] as const

export type PublicVisualThemeKey = (typeof PUBLIC_VISUAL_THEME_KEYS)[number]

export interface PublicVisualThemeAssets {
  /**
   * Teljes szelessegu, generalt hero hatter — kizarolag DEKORATIV textura
   * (mindig eros sotet fatyol alatt, `alt=""`). Csak akkor kerul elo, ha a
   * gyulekezet nem toltott fel sajat hero-kepet.
   *
   * 2026-08-10: a korabbi `community` / `heritage` / `invitation` mezok
   * megszuntek. Azok Baratosi-specifikus, AI-generalt fotok voltak, amelyek
   * MINDEN gyulekezet kezdolapjan „Hangulati illusztracio a mi kozossegunkrol"
   * ertelemben jelentek meg — hitelesseg-rombolo egy egyhazi oldalon.
   * Sajat fotok helyett a tortenet-blokk most tervezett, nem fotografikus
   * felulettel dolgozik (lasd PublicHomeVisualStory).
   */
  hero: string
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
  [CINEMATIC_PUBLIC_THEME_KEY]: {
    key: CINEMATIC_PUBLIC_THEME_KEY,
    displayName: 'Filmszerű történet',
    // A filmszeru temanak nincs sajat hero.png-je; a meglevo, sotet fatyol
    // ala kerulo texturat hasznalja, amig sajat asset nem keszul.
    assets: {
      hero: '/public-site/themes/elo-kert/baratosi-hero-v2.png',
    },
    adminPreview: {
      eyebrow: 'Nagyképes történetmesélés',
      summary: 'Magával ragadó, finoman animált és filmszerű gyülekezeti honlap.',
    },
    hero: {
      backgroundPosition: '63% center',
      overlay:
        'linear-gradient(180deg, rgba(4, 14, 11, 0.5) 0%, rgba(4, 15, 11, 0.9) 100%)',
    },
  },
  'elo-kert': {
    key: 'elo-kert',
    displayName: 'Élő kert',
    assets: themeAssets('elo-kert'),
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
