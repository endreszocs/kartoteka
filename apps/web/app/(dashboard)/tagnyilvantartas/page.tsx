import { getMembers } from './actions'
import { MemberTabsV4 } from '@/components/members/member-tabs-v4'
import { TagnyilvantartasImportWizard } from '@/components/members/tagnyilvantartas-import-wizard'
import { getDelegatedImportStatus } from '@/app/(dashboard)/delegated-import/actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

export default async function TagnyilvantartasPage() {
  const access = await getEffectiveAccessContext()
  const master = access.master
  const godMode = master ? await getGodModeStatus() : { active: false }
  const delegatedImport = await getDelegatedImportStatus('members')

  const {
    members,
    paidPersonIds,
    paidFamilyIds,
    exemptPersonIds,
    exemptFamilyIds,
    personToFamilyMap,
  } = await getMembers()

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
          <TagnyilvantartasImportWizard
            mode="module"
            congregationId={access.effectiveCongregationId}
            congregationName={access.congregationName}
          />
        }
      />
    </div>
  )
}
