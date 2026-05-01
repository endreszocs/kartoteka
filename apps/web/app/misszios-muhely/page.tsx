'use client'

/**
 * Missziós Műhely — home / landing oldal (Sprint R F3 · v0.8.5).
 *
 * A `layout.tsx` (sor 12) kezeli az auth-gate-et — itt CSAK a UI render.
 * A teljes UI a `packages/ui-app/src/missziosmuhely/`-ben van shared
 * komponensként (MissionWorkshop), web és desktop pixel-egyezően.
 *
 * Az aloldalak (segedanyagok, forum, jutalmak, profil) érintetlen maradnak —
 * a felhasználó kérése szerint a táblázatos szerkezet változatlan, csak a
 * home oldal kapja meg az új design-nyelvet.
 *
 * A meglévő `loadHomePageData` / `loadWhatsNew` server actionök és az
 * `MuhelyHero/Encouragement/QuickStats/RecentActivity/WhatsNew` MVP
 * komponensek a `apps/web/components/muhely/home/`-ban érintetlenek
 * maradnak — ha valaki később a régi MVP-re akar visszanézni, ott vannak.
 */

import { useRouter } from 'next/navigation'
import { MissionWorkshop } from '@kartoteka/ui-app'

export default function MissziosMuhelyPage() {
  const router = useRouter()
  return (
    <MissionWorkshop
      assetBase="/misszios-muhely"
      onNavigate={(href) => router.push(href)}
    />
  )
}
