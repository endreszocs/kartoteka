import { WorklogTabs } from '@/components/worklog/worklog-tabs'
import { ModuleAdminImportTabV2 } from '@/components/shared/module-admin-import-tab-v2'
import { CongregationOnlyNotice } from '@/components/layout/congregation-only-notice'
import { getDelegatedImportStatus } from '@/app/(dashboard)/delegated-import/actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { WORKLOG_PROFILES } from '@/lib/import/import-profiles'

const MUNKANAPLO_IMPORT_PROFILES = [
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
]

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

  const showAdminImport = godMode.active || delegatedImport.active || access.admin

  return (
    <div className="space-y-4">
      <WorklogTabs
        congregationName={congregationName || ''}
        showAdminImport={showAdminImport}
        adminImportContent={
          <ModuleAdminImportTabV2
            moduleKey="worklog"
            moduleLabel="Munkanapló"
            title="Munkanapló laborimport az aktuális gyülekezethez"
            description="Itt készíthető elő az igehirdetési, katekázis, látogatási és havi jelentési adatok Excel/CSV alapú, védett rendszergazdai importja."
            congregationName={congregationName}
            isGodMode={godMode.active}
            isDelegatedImport={delegatedImport.active}
            delegatedExpiresAt={delegatedImport.expiresAt}
            profiles={MUNKANAPLO_IMPORT_PROFILES}
            importProfiles={WORKLOG_PROFILES}
            importModule="worklog"
          />
        }
      />
    </div>
  )
}
