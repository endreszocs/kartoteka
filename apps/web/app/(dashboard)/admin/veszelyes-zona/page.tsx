import { Flame } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { DataWipeTab } from '@/components/admin/data-wipe-tab'

export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Veszélyes zóna"
        description="Adattisztítás, tömeges törlés. Ezek a műveletek visszafordíthatatlanok! Csak megfontoltan használd!"
        icon={Flame}
        gradient="from-red-600 to-red-800"
      />
      <div className="card-raised p-4 sm:p-5">
        <DataWipeTab />
      </div>
    </>
  )
}
