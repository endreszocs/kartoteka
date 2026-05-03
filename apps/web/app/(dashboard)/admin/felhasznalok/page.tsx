import { UserCog } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { UnifiedUsersTab } from '@/components/admin/users/unified-users-tab'

export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Felhasználók és szerepkörök"
        description="Aktív, várakozó és elutasított felhasználók, szerepkörök kiosztása egy helyen. Egy várakozó fiók a szerepkör hozzáadásával egyúttal aktiválódik is."
        icon={UserCog}
        gradient="from-violet-500 to-indigo-600"
      />
      <div className="card-raised p-4 sm:p-5">
        <UnifiedUsersTab />
      </div>
    </>
  )
}
