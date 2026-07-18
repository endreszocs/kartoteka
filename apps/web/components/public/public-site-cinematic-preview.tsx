import type { PublicPostListItem, PublicSiteData } from '@/lib/public-site/site-loader'
import { CINEMATIC_PUBLIC_THEME_KEY } from '@/lib/public-site/visual-theme-registry'

import { PublicCinematicHome } from './public-cinematic-home'
import { PublicThemeRoot } from './public-theme-root'

interface PublicSiteCinematicPreviewProps {
  site: PublicSiteData
  recentPosts?: readonly PublicPostListItem[]
}

/**
 * Fejlesztői keret ugyanahhoz az adatvezérelt filmes kezdőlaphoz, amelyet a
 * valódi /gy/[slug] útvonal is használ. Így az előnézet nem tud elszakadni az
 * éles sablontól.
 */
export function PublicSiteCinematicPreview({
  site,
  recentPosts = [],
}: PublicSiteCinematicPreviewProps) {
  return (
    <PublicThemeRoot presetKey={CINEMATIC_PUBLIC_THEME_KEY}>
      <PublicCinematicHome
        site={site}
        recentPosts={recentPosts}
        memberPortalEnabled
      />
    </PublicThemeRoot>
  )
}
