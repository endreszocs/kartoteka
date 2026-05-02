import { Wallet } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { PenzugyImportWizard } from '@/components/finance/finance-import/penzugy-import-wizard'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'

export default async function Page() {
  const godMode = await getGodModeStatus()

  return (
    <>
      <AdminPageHeader
        title="Pénzügyi import"
        description="A hivatalos EREK könyvelési Excel Kassza fülét tölti be a Kartotéka rendszerbe — a wizard végigvezet a fájl-feltöltésen, az adatok ellenőrzésén és az importáláson."
        icon={Wallet}
        gradient="from-emerald-500 to-teal-600"
      />
      <div className="card-raised p-4 sm:p-5">
        {godMode.active ? (
          <PenzugyImportWizard />
        ) : (
          <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50/80 p-5 text-sm text-amber-900">
            <p className="font-semibold">A pénzügyi import rendszergazdai módban érhető el.</p>
            <p className="mt-1">
              Aktiváld a rendszergazdai (god) módot, hogy a könyvelési adatok
              importjához hozzáférj a wizardhoz.
            </p>
          </div>
        )}
      </div>
    </>
  )
}
