import { InventoryMain } from '@/components/inventory/inventory-main-v3'
import { ModuleAdminWorkspace } from '@/components/shared/module-admin-workspace'
import { CongregationOnlyNotice } from '@/components/layout/congregation-only-notice'
import { getDelegatedImportStatus } from '@/app/(dashboard)/delegated-import/actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

export default async function LeltarPage() {
  const access = await getEffectiveAccessContext()
  const { user, effectiveCongregationId, congregationName } = access
  if (!user) return null
  if (!effectiveCongregationId) {
    const scope = access.activeProfileRole?.scope === 'diocese' ? 'diocese'
      : access.activeProfileRole?.scope === 'district' ? 'district'
      : (access.admin || access.master) ? 'admin' : 'other'
    return <CongregationOnlyNotice module="A Leltár modul" currentScope={scope} />
  }
  const godMode = access.master ? await getGodModeStatus() : { active: false }
  const delegatedImport = await getDelegatedImportStatus('inventory')

  return (
    <div className="space-y-4">
      <ModuleAdminWorkspace
        moduleKey="inventory"
        moduleLabel="Leltár"
        mainTabLabel="Leltári munkafelület"
        importTitle="Leltári laborimport az aktuális gyülekezethez"
        importDescription="Itt készíthető elő a leltári tételek, kategóriák, értékek és felelősök Excel/CSV alapú, védett rendszergazdai importja."
        congregationName={congregationName}
        isGodMode={godMode.active}
        isDelegatedImport={delegatedImport.active}
        delegatedExpiresAt={delegatedImport.expiresAt}
        hideTabsUntilPrivileged
        profiles={[
          {
            value: 'items',
            label: 'Leltári tételek',
            description: 'Eszközök, tárgyak és berendezések strukturált feltöltésének előkészítése.',
            columns: ['leltari_szam', 'megnevezes', 'kategoria', 'beszerzes_erteke', 'helyszin', 'felelos_nev'],
            hints: ['A leltári szám legyen egyedi', 'Az érték számszerű legyen', 'A kategória egyezzen a leltári törzzsel'],
          },
          {
            value: 'categories',
            label: 'Kategóriák',
            description: 'Leltári kategóriák és csoportosítások laborimportja.',
            columns: ['kategoria_kod', 'megnevezes', 'megjegyzes'],
            hints: ['A kategóriakód legyen stabil', 'A megnevezés legyen rövid és egyértelmű', 'A meglévő kategóriákat ne duplikáld'],
          },
          {
            value: 'values',
            label: 'Értékhelyreállítás',
            description: 'Korábbi tételek értékeinek tömeges korrekciójához szükséges előkészítés.',
            columns: ['leltari_szam', 'uj_ertek', 'datum', 'megjegyzes'],
            hints: ['A leltári szám pontosan egyezzen', 'Az új érték pozitív szám legyen', 'A módosítás okát érdemes megadni'],
          },
        ]}
      >
        <InventoryMain congregationName={congregationName || ''} />
      </ModuleAdminWorkspace>
    </div>
  )
}
