import { getMembers } from './actions'
import { MemberTabsV4 } from '@/components/members/member-tabs-v4'
import { MEMBER_IMPORT_PROFILES } from '@/components/members/member-import-profiles'
import { ModuleAdminWorkspace } from '@/components/shared/module-admin-workspace'
import { TagnyilvantartasImportWizard } from '@/components/members/tagnyilvantartas-import-wizard'
import { getDelegatedImportStatus } from '@/app/(dashboard)/delegated-import/actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { MEMBER_PROFILES } from '@/lib/import/import-profiles'

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

  return (
    <div className="space-y-4">
      <ModuleAdminWorkspace
        moduleKey="members"
        moduleLabel="Tagnyilvántartás"
        mainTabLabel="Tagnyilvántartási munkafelület"
        importTitle="Tagnyilvántartási laborimport az aktuális gyülekezethez"
        importDescription="Itt készíthető elő a személyek, családok, presbiterek, körzetek és választói adatok védett Excel/CSV alapú importja az aktuális gyülekezet számára."
        congregationName={access.congregationName}
        isGodMode={godMode.active}
        isDelegatedImport={delegatedImport.active}
        delegatedExpiresAt={delegatedImport.expiresAt}
        hideTabsUntilPrivileged
        importProfiles={MEMBER_PROFILES}
        importModule="members"
        profiles={MEMBER_IMPORT_PROFILES.map((profile) => ({
          ...profile,
          columns: [...profile.columns],
          hints: [...profile.hints],
        }))}
        customImportTab={
          <TagnyilvantartasImportWizard
            mode="module"
            congregationId={access.effectiveCongregationId}
            congregationName={access.congregationName}
          />
        }
      >
        <MemberTabsV4
          initialMembers={members}
          paidPersonIds={paidPersonIds}
          paidFamilyIds={paidFamilyIds}
          exemptPersonIds={exemptPersonIds}
          exemptFamilyIds={exemptFamilyIds}
          personToFamilyMap={personToFamilyMap}
          isGodMode={godMode.active}
        />
      </ModuleAdminWorkspace>
    </div>
  )
}
