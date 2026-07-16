import { MemberTabsV4 } from '@/components/members/member-tabs-v4'
import { AdminImportLazy } from '@/components/members/admin-import-lazy'
import { getDelegatedImportStatus } from '@/app/(dashboard)/delegated-import/actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getFamilyGraphUnlockState } from './family-graph-actions'
import { getMemberOverviewSnapshot } from './overview-actions'
import { getMembersPage } from './registry-list-actions'

export default async function TagnyilvantartasPage() {
  const access = await getEffectiveAccessContext()
  const master = access.master

  // A jogosultsági státuszok, az áttekintési snapshot és az első 50 személy
  // egymástól függetlenül tölthetők. A teljes személylista nem kerül a kliensre.
  const [godMode, delegatedImport, overviewSnapshot, initialMemberPage, familyGraphUnlock] = await Promise.all([
    master ? getGodModeStatus() : Promise.resolve({ active: false }),
    getDelegatedImportStatus('members'),
    getMemberOverviewSnapshot(),
    getMembersPage({ status: 'aktív', sort: 'id', direction: 'desc' }),
    getFamilyGraphUnlockState(),
  ])

  // 2026-05-25: a "Rendszergazdai importáló" mostantól a MemberTabsV4 belső
  // tab-listájának VÉGÉN jelenik meg (Áttekintés / Személyek /
  // Presbiterek / Körzetek / Választók / Hibák / Rendszergazdai importáló),
  // nem külön ModuleAdminWorkspace wrapperrel a tetején. Jogosultság:
  // CSAK aktív god mode vagy delegated import (2026-05-29: admin szerepkör
  // önmagában már nem mutatja — csak ha a Rendszergazdai mód be is van kapcsolva).
  const showAdminImport = godMode.active || delegatedImport.active

  return (
    <div className="space-y-4">
      <MemberTabsV4
        overviewSnapshot={overviewSnapshot}
        initialMemberPage={initialMemberPage}
        isGodMode={godMode.active}
        congregationId={access.effectiveCongregationId}
        userId={access.userId}
        familyGraphUnlock={familyGraphUnlock}
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
