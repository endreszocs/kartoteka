import { Download } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { TagnyilvantartasImportWizard } from '@/components/members/tagnyilvantartas-import-wizard'
import { ImportLogList } from '@/components/admin/import-log-list'

// Endre kérése (2026-05-04): a god mode aktiválás kivéve. Az admin layout
// (requireAdminAccess) már garantálja, hogy csak rendszergazda léphet ide be —
// duplán védelmezés-kötelezve nincs szükség. A wizard azonnal használható.
export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Import"
        description="Tagnyilvántartás importálása. A wizard végigvezet a fájl-feltöltésen és az adatok ellenőrzésén."
        icon={Download}
      />
      <div className="card-raised p-4 sm:p-5">
        <div className="space-y-6">
          <TagnyilvantartasImportWizard mode="admin" />
          <ImportLogList />
        </div>
      </div>
    </>
  )
}
