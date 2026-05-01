'use client'

/**
 * Missziós Műhely — home / landing oldal (Sprint R F3 · v0.8.2).
 *
 * A `(dashboard)` layout adja a sidebar-t és topbar-ot, ide CSAK a home tartalom
 * kerül. Az aloldalak (segedanyagok, forum, jutalmak, profil) későbbi fázisokban
 * kapnak external route-okat — most a CTA-k oda navigálnak (404 redirect-tel
 * a meglévő placeholder-ekre, amíg azok el nem készülnek).
 *
 * A teljes UI a `packages/ui-app/src/missziosmuhely/`-ben él (body-pattern,
 * `assetBase` + `onNavigate` callback) — desktop-on ugyanaz a komponens fut.
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
