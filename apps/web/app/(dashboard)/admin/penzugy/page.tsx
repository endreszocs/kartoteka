import { PiggyBank } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { SystemFinanceTab } from '@/components/admin/system-finance-tab'

export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Rendszer pénzügyei"
        description="Előfizetések, könyvelés és árfolyamok egy helyen: gyülekezetenként állíthatod be a hozzáférést, a díjat és a felárat, rögzítheted a bevételeket és a költségeket."
        icon={PiggyBank}
      />
      <div className="card-raised p-4 sm:p-5">
        <SystemFinanceTab />
      </div>
    </>
  )
}
