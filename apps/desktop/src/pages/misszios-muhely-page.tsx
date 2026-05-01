/**
 * Missziós Műhely — desktop home (Sprint R F3 · v0.8.2).
 *
 * A közös `MissionWorkshop` komponenst (`packages/ui-app/src/missziosmuhely/`)
 * használja — webbel pixel-egyenértékűen. Az `onNavigate` callback a desktop
 * react-router-dom `useNavigate`-tel megy.
 *
 * Az aloldalak (segedanyagok, forum) még nincsenek desktop-portolva — a CTA-k
 * `PlaceholderPage`-re mutatnak, amíg a Sprint S+ fázisokban el nem készülnek.
 */

import { useNavigate } from 'react-router-dom'
import { MissionWorkshop } from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'

export function MissziosMuhelyPage() {
  const navigate = useNavigate()
  return (
    <DesktopShell>
      <MissionWorkshop
        assetBase="/misszios-muhely"
        onNavigate={(href) => navigate(href)}
      />
    </DesktopShell>
  )
}
