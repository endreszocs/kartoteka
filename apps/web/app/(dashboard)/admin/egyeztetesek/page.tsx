import { Link2 } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { CrossMatchTab } from '@/components/admin/cross-match-tab'

/**
 * Kereszt-gyülekezeti egyeztetés admin-aloldal (2026-08-09).
 *
 * A MÁR BENT LÉVŐ adatok egyeztetése: minden olyan tag-pár, amely két külön
 * gyülekezetben nagy valószínűséggel ugyanaz a személy (név + születési dátum
 * vagy név + telefon). Az admin innen vizsgálja át a teljes állományt, és
 * innen értesíti a két érintett lelkészt (e-mail + app-értesítés).
 * A jogosultságot az admin layout (requireAdminAccess) + az RPC-k kettős
 * ellenőrzése kezeli (kerületi admin csak a saját kerületét látja).
 */
export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Tag-egyeztetések"
        description="Kereszt-gyülekezeti egyezések: ugyanaz a személy több gyülekezetben. Teljes-állomány átvizsgálás, lelkész-értesítés és döntés-rögzítés egy helyen."
        icon={Link2}
      />
      <div className="card-raised p-4 sm:p-5">
        <CrossMatchTab />
      </div>
    </>
  )
}
