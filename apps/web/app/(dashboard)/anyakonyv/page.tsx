import { RegistryTabs } from '@/components/registry/registry-tabs'
import { RegistryImportWizard } from '@/components/registry/registry-import-wizard'
import { CongregationOnlyNotice } from '@/components/layout/congregation-only-notice'
import { getDelegatedImportStatus } from '@/app/(dashboard)/delegated-import/actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

export default async function AnyakonyvPage() {
  const access = await getEffectiveAccessContext()
  const { user, effectiveCongregationId, congregationName } = access
  if (!user) return null
  if (!effectiveCongregationId) {
    const scope = access.activeProfileRole?.scope === 'diocese' ? 'diocese'
      : access.activeProfileRole?.scope === 'district' ? 'district'
      : (access.admin || access.master) ? 'admin' : 'other'
    return <CongregationOnlyNotice module="Az Anyakönyv modul" currentScope={scope} />
  }
  const godMode = access.master ? await getGodModeStatus() : { active: false }
  const delegatedImport = await getDelegatedImportStatus('registry')

  // 2026-05-25: a Súgó és Rendszergazdai importáló tabok a RegistryTabs belső
  // tab-listájának VÉGÉN (Tagnyilvántartás / Pénzügy minta).
  const showAdminImport = godMode.active || delegatedImport.active

  return (
    <div className="space-y-4">
      <RegistryTabs
        congregationId={effectiveCongregationId}
        congregationName={congregationName || ''}
        showAdminImport={showAdminImport}
        adminImportContent={
          <RegistryImportWizard
            mode="module"
            congregationId={effectiveCongregationId}
            congregationName={congregationName}
          />
        }
      />
    </div>
  )
}
