/**
 * @kartoteka/design-tokens — közös design tokenek.
 *
 * Sprint R · Vizuális megújulás (v0.8.0+) — a 3 vizuális téma (Csendes parókia,
 * Kerített kert, Zsoltáros) szín-, tipográfia- és metrika-tokenjeinek SSOT-ja.
 * A CSS-vars értékek a `packages/ui/src/themes.css`-ben vannak (kézi sync),
 * a komponensek (motívum SVG-k, ThemePicker) pedig közvetlenül innen importálnak.
 */

export {
  themes,
  ThemeParokia,
  ThemeKert,
  ThemeZsoltaros,
  DEFAULT_THEME,
  darken,
  type ThemeName,
  type ThemeMode,
  type ThemeTokens,
} from './themes'
