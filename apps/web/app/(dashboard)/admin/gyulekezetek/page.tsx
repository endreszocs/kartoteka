import { Church } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { CongregationsTab } from '@/components/admin/congregations-tab'

export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Gyülekezetek"
        description="A rendszerhez kapcsolt gyülekezetek listája. Áttekintés, részletes adatok, gyülekezetbe való belépés rendszergazdai módban."
        icon={Church}
      />
      <div className="card-raised p-4 sm:p-5">
        <CongregationsTab />
      </div>
    </>
  )
}
