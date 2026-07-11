import { UserCog } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { UsersPageTabs } from '@/components/admin/users/users-page-tabs'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const initialTab = tab === 'konyvelok' ? 'konyvelok' : 'users'

  return (
    <>
      <AdminPageHeader
        title="Felhasználók és szerepkörök"
        description="Aktív, várakozó és elutasított felhasználók, szerepkörök kiosztása, valamint a könyvelői/számvevői hozzárendelések — egy helyen. Egy várakozó fiók a szerepkör hozzáadásával egyúttal aktiválódik is."
        icon={UserCog}
      />
      <UsersPageTabs initialTab={initialTab} />
    </>
  )
}
