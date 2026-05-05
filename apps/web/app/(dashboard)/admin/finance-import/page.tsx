import { Wallet } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { FinanceImportTabs } from '@/components/finance/finance-import/finance-import-tabs'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'

export default async function Page() {
  const godMode = await getGodModeStatus()

  return (
    <>
      <AdminPageHeader
        title="Pénzügyi import"
        description="Az éves könyvelés betöltése a Kartotéka rendszerbe. Két út: a teljes Kassza-fájl (bevétel + kiadás) vagy az egyházfenntartási befizetések egyeztetése (xlsx + xml két forrásból)."
        icon={Wallet}
        gradient="from-emerald-500 to-teal-600"
      />
      <div className="space-y-4">
        {godMode.active ? (
          <FinanceImportTabs />
        ) : (
          <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50/80 p-5 text-sm text-amber-900">
            <p className="font-semibold">A pénzügyi import rendszergazdai módban érhető el.</p>
            <p className="mt-1">
              Aktiváld a rendszergazdai (god) módot, hogy a könyvelési adatok
              importjához hozzáférj a wizardokhoz.
            </p>
          </div>
        )}
      </div>
    </>
  )
}
