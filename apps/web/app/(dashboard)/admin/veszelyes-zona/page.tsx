import { Flame } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { DataWipeTab } from '@/components/admin/data-wipe-tab'
import { RestoreTab } from '@/components/admin/restore/restore-tab'

export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Veszélyes zóna"
        description="Adattisztítás, tömeges törlés, visszaállítás mentésből. Ezek a műveletek visszafordíthatatlanok! Csak megfontoltan használd!"
        icon={Flame}
        tone="danger"
      />
      <div className="card-raised p-4 sm:p-5">
        <DataWipeTab />
      </div>
      {/* 2026-08-11: adat-visszaállítás. Szándékosan ITT van, a törlés MELLETT
          — ugyanaz a lelki készenlét kell hozzá, és ugyanaz a felelősség. */}
      <div className="card-raised mt-5 p-4 sm:p-5">
        <RestoreTab />
      </div>
    </>
  )
}
