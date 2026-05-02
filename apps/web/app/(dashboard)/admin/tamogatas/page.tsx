import { LifeBuoy } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { SupportTab } from '@/components/admin/support-tab'

export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Támogatás"
        description="Beérkezett támogatási kérdések és nyitott esetek kezelése. A felhasználók innen kapnak segítséget a rendszergazdától."
        icon={LifeBuoy}
        gradient="from-yellow-500 to-amber-600"
      />
      <div className="card-raised p-4 sm:p-5">
        <SupportTab />
      </div>
    </>
  )
}
