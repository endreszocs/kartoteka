import { Key } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { ProfileRolesTab } from '@/components/admin/profile-roles-tab'

export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Szerepkörök"
        description="Profile-szerepkörök kiosztása és kezelése. A szerepkör határozza meg, milyen modulokhoz fér hozzá a felhasználó."
        icon={Key}
        gradient="from-indigo-500 to-blue-600"
      />
      <div className="card-raised p-4 sm:p-5">
        <ProfileRolesTab />
      </div>
    </>
  )
}
