import { History } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AuditLogTab } from '@/components/admin/audit-log-tab'

/**
 * Tevékenység-napló admin-aloldal (2026-07-11, admin-redesign).
 *
 * A rekord-szintű audit-megtekintő (AuditLogTab, get_record_audit RPC) a régi,
 * halott AdminTabsV3 kivezetésével elérhetetlenné vált — ez az oldal éleszti
 * újra a per-oldalas /admin/<slug> architektúrában. A jogosultságot az admin
 * layout (requireAdminAccess) + az RPC RLS-aware szűrése együtt kezeli.
 */
export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Tevékenység-napló"
        description="Rekord-szintű módosítás-történet: ki, mikor, mit hozott létre, módosított vagy törölt a kulcstáblákon (pénzügy, tagok, jogosultságok) — a régi és új értékekkel együtt."
        icon={History}
      />
      <div className="card-raised p-4 sm:p-5">
        <AuditLogTab />
      </div>
    </>
  )
}
