import { Users } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { UsersTab } from '@/components/admin/users-tab'

export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Felhasználók"
        description="A rendszer aktív és függő felhasználóinak listája. Profil-szerkesztés, státuszváltás, gyülekezethez rendelés."
        icon={Users}
        gradient="from-violet-500 to-purple-600"
      />
      <div className="card-raised p-4 sm:p-5">
        <UsersTab />
      </div>
    </>
  )
}
