import { Database } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { DevicesLicensesTab } from '@/components/admin/devices-licenses-tab'

export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Eszközök és napló"
        description="Asztali eszközök regisztrációja, licenc-kibocsátás és -kezelés, valamint a teljes audit-napló. A naplóbejegyzések sosem törölhetők."
        icon={Database}
      />
      <DevicesLicensesTab />
    </>
  )
}
