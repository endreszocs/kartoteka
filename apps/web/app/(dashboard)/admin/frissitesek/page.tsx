import { Bell } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { BroadcastsTab } from '@/components/admin/broadcasts-tab'

export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Frissítések"
        description="Fejlesztési hírek és saját üzenetek kiküldése a felhasználóknak — értesítésként vagy e-mailben, hírlevél-szerkesztővel."
        icon={Bell}
      />
      {/* 2026-07-11 olvashatósági redesign: a szekciók maguk kártyák
          (BroadcastSectionCard), ezért a korábbi külső card-raised héj
          (kártya-a-kártyában) kikerült. */}
      <BroadcastsTab />
    </>
  )
}
