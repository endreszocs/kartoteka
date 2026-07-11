import { Bell } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { BroadcastsTab } from '@/components/admin/broadcasts-tab'

export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Frissítések"
        description="Broadcast üzenetek és hírlevél szerkesztése. Új release esetén a changelog-bejegyzések közzétehetők a felhasználóknak."
        icon={Bell}
      />
      <div className="card-raised p-4 sm:p-5">
        <BroadcastsTab />
      </div>
    </>
  )
}
