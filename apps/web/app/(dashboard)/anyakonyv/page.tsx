import { RegistryTabs } from '@/components/registry/registry-tabs'
import { RegistryImportWizard } from '@/components/registry/registry-import-wizard'
import { ModuleAdminWorkspace } from '@/components/shared/module-admin-workspace'
import { CongregationOnlyNotice } from '@/components/layout/congregation-only-notice'
import { getDelegatedImportStatus } from '@/app/(dashboard)/delegated-import/actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { REGISTRY_PROFILES } from '@/lib/import/import-profiles'

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

  return (
    <div className="space-y-4">
      <ModuleAdminWorkspace
        moduleKey="registry"
        moduleLabel="Anyakönyv"
        mainTabLabel="Anyakönyvi munkafelület"
        importTitle="Anyakönyvi laborimport az aktuális gyülekezethez"
        importDescription="Itt készíthető elő a keresztelési, konfirmációs, esketési, temetési és tagmozgási Excel/CSV import az aktuális gyülekezet számára."
        congregationName={congregationName}
        isGodMode={godMode.active}
        isDelegatedImport={delegatedImport.active}
        delegatedExpiresAt={delegatedImport.expiresAt}
        hideTabsUntilPrivileged
        importProfiles={REGISTRY_PROFILES}
        importModule="registry"
        customImportTab={
          <RegistryImportWizard
            mode="module"
            congregationId={effectiveCongregationId}
            congregationName={congregationName}
          />
        }
        profiles={[
          {
            value: 'baptism',
            label: 'Keresztelések',
            description: 'Keresztelési anyakönyvi adatok strukturált előkészítése.',
            columns: ['datum', 'okirat', 'szemely_nev', 'szuletesi_datum', 'lelkesz', 'megjegyzes'],
            hints: ['A személynév egyezzen a tagnyilvántartással', 'Az okiratszám legyen egyedi', 'A dátumok legyenek egységesek'],
          },
          {
            value: 'confirmation',
            label: 'Konfirmációk',
            description: 'Konfirmációs bejegyzések laborimportja.',
            columns: ['datum', 'szemely_nev', 'szuletesi_datum', 'lelkesz', 'megjegyzes'],
            hints: ['A személyek legyenek beazonosíthatók', 'A konfirmáció dátuma legyen kitöltve', 'A lelkipásztor neve külön oszlopban szerepeljen'],
          },
          {
            value: 'marriage',
            label: 'Esketések',
            description: 'Házasságkötési adatok ellenőrzött feltöltésének előkészítése.',
            columns: ['datum', 'volegeny_nev', 'menyasszony_nev', 'tanuk', 'lelkesz', 'megjegyzes'],
            hints: ['A két fél külön oszlopban legyen', 'A tanúk legyenek külön mezőben', 'Az esemény dátuma kötelező'],
          },
          {
            value: 'burial',
            label: 'Temetések',
            description: 'Haláleseti és temetési bejegyzések strukturált előkészítése.',
            columns: ['halalozas_datum', 'temetes_datum', 'szemely_nev', 'halal_oka', 'lelkesz'],
            hints: ['A halálozás és a temetés külön oszlopban legyen', 'A név és dátum együtt könnyíti a párosítást', 'A halál oka opcionális, de hasznos'],
          },
          {
            value: 'movement',
            label: 'Tagmozgások',
            description: 'Beköltözött, elköltözött, áttért és kitért bejegyzések előkészítése.',
            columns: ['tipus', 'datum', 'szemely_nev', 'felekezet', 'igazolas', 'megjegyzes'],
            hints: ['A típus legyen szabványos érték', 'A személy neve pontosan szerepeljen', 'Az igazolás mező külön oszlopban legyen'],
          },
        ]}
      >
        <RegistryTabs
          congregationId={effectiveCongregationId}
          congregationName={congregationName || ''}
        />
      </ModuleAdminWorkspace>
    </div>
  )
}
