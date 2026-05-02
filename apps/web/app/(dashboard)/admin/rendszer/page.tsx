import { ShieldAlert } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { SecuritySettingsTabV2 } from '@/components/admin/security-settings-tab-v2'

export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Rendszer"
        description="Biztonsági beállítások, audit-konfiguráció, rendszerszintű paraméterek. Csak rendkívüli esetben módosíts!"
        icon={ShieldAlert}
        gradient="from-red-500 to-rose-600"
      />
      <div className="card-raised p-4 sm:p-5">
        <SecuritySettingsTabV2 />
      </div>
    </>
  )
}
