import { WorklogTabs } from '@/components/worklog/worklog-tabs'
import { ModuleAdminWorkspace } from '@/components/shared/module-admin-workspace'
import { CongregationOnlyNotice } from '@/components/layout/congregation-only-notice'
import { getDelegatedImportStatus } from '@/app/(dashboard)/delegated-import/actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { WORKLOG_PROFILES } from '@/lib/import/import-profiles'

export default async function MunkanaploPage() {
  const access = await getEffectiveAccessContext()
  const { user, effectiveCongregationId, congregationName } = access
  if (!user) return null
  if (!effectiveCongregationId) {
    const scope = access.activeProfileRole?.scope === 'diocese' ? 'diocese'
      : access.activeProfileRole?.scope === 'district' ? 'district'
      : (access.admin || access.master) ? 'admin' : 'other'
    return <CongregationOnlyNotice module="A Munkanapló modul" currentScope={scope} />
  }
  const godMode = access.master ? await getGodModeStatus() : { active: false }
  const delegatedImport = await getDelegatedImportStatus('worklog')

  return (
    <div className="space-y-4">
      <ModuleAdminWorkspace
        moduleKey="worklog"
        moduleLabel="Munkanapló"
        mainTabLabel="Munkanapló munkafelület"
        importTitle="Munkanapló laborimport az aktuális gyülekezethez"
        importDescription="Itt készíthető elő az igehirdetési, katekázis, látogatási és havi jelentési adatok Excel/CSV alapú, védett rendszergazdai importja."
        congregationName={congregationName}
        isGodMode={godMode.active}
        isDelegatedImport={delegatedImport.active}
        delegatedExpiresAt={delegatedImport.expiresAt}
        hideTabsUntilPrivileged
        importProfiles={WORKLOG_PROFILES}
        importModule="worklog"
        profiles={[
          {
            value: 'services',
            label: 'Igehirdetések',
            description: 'Istentiszteleti és szolgálati naplóbejegyzések import-előkészítése.',
            columns: ['idopont', 'jellege', 'cim', 'igehely', 'szolgalatvezeto', 'persely'],
            hints: ['Az időpont legyen pontos dátum', 'A szolgálati típus legyen szabványos', 'A persely mező számszerű legyen'],
          },
          {
            value: 'catechesis',
            label: 'Katekézis',
            description: 'Hittan, konfirmációs és ifjúsági alkalmak strukturált feltöltése.',
            columns: ['idopont', 'jellege', 'cim', 'resztvevok_ferfi', 'resztvevok_no', 'resztvevok_gyermek'],
            hints: ['A részvevőszámok külön oszlopban legyenek', 'A jellege mező legyen egységes', 'A dátum ne maradjon üresen'],
          },
          {
            value: 'visits',
            label: 'Látogatások',
            description: 'Családlátogatási és egyéb látogatási adatok laborimportja.',
            columns: ['idopont', 'jellege', 'cim', 'megjegyzes', 'szolgalatvezeto'],
            hints: ['A megjegyzésben szerepelhet a látogatás célja', 'A szolgálatvezető legyen kitöltve', 'A cím vagy téma mező segítsen visszakeresni'],
          },
          {
            value: 'report',
            label: 'Havi jelentés',
            description: 'Havi összegző munkanapló-adatok előkészítése további egyeztetéshez.',
            columns: ['honap', 'osszes_alkalom', 'osszes_jelenlet', 'osszes_persely', 'megjegyzes'],
            hints: ['A hónap YYYY-MM formátumú legyen', 'Az összesítés ellenőrizhető legyen a részletes sorokból', 'A pénzügyi értékek RON-ban szerepeljenek'],
          },
        ]}
      >
        <WorklogTabs congregationName={congregationName || ''} />
      </ModuleAdminWorkspace>
    </div>
  )
}
