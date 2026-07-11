import { Inbox } from 'lucide-react'

import { AccessRequestsTab } from '@/components/admin/access-requests-tab'
import { AdminPageHeader } from '@/components/admin/admin-page-header'

export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Hozzáférés-kérelmek"
        description="Új regisztrációk és felhasználói kérelmek elbírálása. Jóváhagyás után a felhasználó megkapja a rendszer használatának jogát."
        icon={Inbox}
      />
      <div className="card-raised p-4 sm:p-5">
        <AccessRequestsTab />
      </div>
    </>
  )
}
