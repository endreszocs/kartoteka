import { FilingMain } from '@/components/filing/filing-main'
import { ModuleAdminImportTabV2 } from '@/components/shared/module-admin-import-tab-v2'
import { CongregationOnlyNotice } from '@/components/layout/congregation-only-notice'
import { getDelegatedImportStatus } from '@/app/(dashboard)/delegated-import/actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { FILING_PROFILES } from '@/lib/import/import-profiles'

const IKTATO_IMPORT_PROFILES = [
  {
    value: 'incoming',
    label: 'Érkező iratok',
    description: 'Bejövő levelek és dokumentumok strukturált feltöltésének előkészítése.',
    columns: ['kelt', 'subject', 'sender_or_recipient', 'file_folder', 'targykivonat'],
    hints: ['A tárgy mező legyen kitöltve', 'Az iktatás dátuma ne hiányozzon', 'A mappakód legyen szabványos'],
  },
  {
    value: 'outgoing',
    label: 'Kimenő iratok',
    description: 'Kimenő dokumentumok és válaszlevelek laborimportja.',
    columns: ['kelt', 'subject', 'sender_or_recipient', 'file_folder', 'irattarijel'],
    hints: ['A címzett külön mezőben szerepeljen', 'Az irattári jel legyen pontos', 'A tárgykivonat segíti a visszakeresést'],
  },
  {
    value: 'archive',
    label: 'Irattári besorolás',
    description: 'Korábbi iktatott dokumentumok mappa- és irattári jel korrekciójához.',
    columns: ['year', 'sequence_number', 'file_folder', 'irattarijel', 'megjegyzes'],
    hints: ['Az év és sorszám együtt azonosítja a tételt', 'A mappa rövidítése egyezzen a rendszerrel', 'A megjegyzésben rögzíthető a módosítás oka'],
  },
]

export default async function IktatoPage() {
  const access = await getEffectiveAccessContext()
  const { user, effectiveCongregationId, congregationName } = access
  if (!user) return null
  if (!effectiveCongregationId) {
    const scope = access.activeProfileRole?.scope === 'diocese' ? 'diocese'
      : access.activeProfileRole?.scope === 'district' ? 'district'
      : (access.admin || access.master) ? 'admin' : 'other'
    return <CongregationOnlyNotice module="Az Iktató modul" currentScope={scope} />
  }
  const godMode = access.master ? await getGodModeStatus() : { active: false }
  const delegatedImport = await getDelegatedImportStatus('filing')

  // 2026-05-25: a tabok a FilingMain Hero-ja ALATT jelennek meg
  // (Tagnyilvántartás minta — ModuleAdminWorkspace wrapper eltávolítva).
  const showAdminImport = godMode.active || delegatedImport.active

  return (
    <div className="space-y-4">
      <FilingMain
        congregationName={congregationName || ''}
        showAdminImport={showAdminImport}
        adminImportContent={
          <ModuleAdminImportTabV2
            moduleKey="filing"
            moduleLabel="Iktató"
            title="Iktatási laborimport az aktuális gyülekezethez"
            description="Itt készíthető elő a bejövő és kimenő iratok, iktatószámok és irattári besorolások Excel/CSV alapú, védett rendszergazdai importja."
            congregationName={congregationName}
            isGodMode={godMode.active}
            isDelegatedImport={delegatedImport.active}
            delegatedExpiresAt={delegatedImport.expiresAt}
            profiles={IKTATO_IMPORT_PROFILES}
            embedded
            importProfiles={FILING_PROFILES}
            importModule="filing"
          />
        }
      />
    </div>
  )
}
