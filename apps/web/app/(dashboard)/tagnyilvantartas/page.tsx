import { getMembers } from './actions'
import { MemberTabsV4 } from '@/components/members/member-tabs-v4'
import { AdminImportLazy } from '@/components/members/admin-import-lazy'
import { getDelegatedImportStatus } from '@/app/(dashboard)/delegated-import/actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

export default async function TagnyilvantartasPage() {
  const access = await getEffectiveAccessContext()
  const master = access.master

  // 2026-06-30 (perf): a godMode + delegatedImport + getMembers FÜGGETLENEK
  // egymástól (mind a cache-elt access-kontextusra épülnek), ezért egyetlen
  // párhuzamos hullámban futnak — a getMembers (a legdrágább) mellé a két
  // státusz-lekérdezés így nem ad külön körutat.
  const [godMode, delegatedImport, membersData] = await Promise.all([
    master ? getGodModeStatus() : Promise.resolve({ active: false }),
    getDelegatedImportStatus('members'),
    getMembers(),
  ])

  const {
    members,
    paidPersonIds,
    paidFamilyIds,
    exemptPersonIds,
    exemptFamilyIds,
    personToFamilyMap,
  } = membersData

  // 2026-05-25: a "Rendszergazdai importáló" mostantól a MemberTabsV4 belső
  // tab-listájának VÉGÉN jelenik meg (Áttekintés / Személyek / Családok /
  // Presbiterek / Körzetek / Választók / Hibák / Rendszergazdai importáló),
  // nem külön ModuleAdminWorkspace wrapperrel a tetején. Jogosultság:
  // CSAK aktív god mode vagy delegated import (2026-05-29: admin szerepkör
  // önmagában már nem mutatja — csak ha a Rendszergazdai mód be is van kapcsolva).
  const showAdminImport = godMode.active || delegatedImport.active

  return (
    <div className="space-y-4">
      <MemberTabsV4
        initialMembers={members}
        paidPersonIds={paidPersonIds}
        paidFamilyIds={paidFamilyIds}
        exemptPersonIds={exemptPersonIds}
        exemptFamilyIds={exemptFamilyIds}
        personToFamilyMap={personToFamilyMap}
        isGodMode={godMode.active}
        showAdminImport={showAdminImport}
        adminImportContent={
          showAdminImport ? (
            <AdminImportLazy
              congregationId={access.effectiveCongregationId}
              congregationName={access.congregationName}
            />
          ) : null
        }
      />
    </div>
  )
}
