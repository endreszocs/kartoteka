import { Calculator } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { ProfileCongregationsTab } from '@/components/admin/profile-congregations-tab'

export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Könyvelők és számvevők"
        description="A pénzügyi feladatkörök kiosztása gyülekezetenként. A könyvelők és számvevők a kijelölt gyülekezetek pénzügyeit kezelhetik."
        icon={Calculator}
        gradient="from-teal-500 to-cyan-600"
      />
      <div className="card-raised p-4 sm:p-5">
        <ProfileCongregationsTab />
      </div>
    </>
  )
}
