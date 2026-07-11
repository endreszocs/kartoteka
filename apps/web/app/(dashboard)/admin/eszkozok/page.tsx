import { Database } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { DevicesLicensesTab } from '@/components/admin/devices-licenses-tab'

export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Eszközök és napló"
        description="Asztali eszközök regisztrációja, licensz-kulcsok és teljes audit-napló. A naplóbejegyzések sosem törölhetők."
        icon={Database}
      />
      <div className="card-raised p-4 sm:p-5">
        <DevicesLicensesTab />
      </div>
    </>
  )
}
