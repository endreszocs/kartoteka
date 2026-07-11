import { PiggyBank } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { SystemFinanceTab } from '@/components/admin/system-finance-tab'

export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Rendszer pénzügyei"
        description="A platform pénzügyi forgalma, számlázás és határidős fizetések. A gyülekezetek éves díjai egy helyen."
        icon={PiggyBank}
      />
      <div className="card-raised p-4 sm:p-5">
        <SystemFinanceTab />
      </div>
    </>
  )
}
