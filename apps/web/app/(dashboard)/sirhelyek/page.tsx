import { CemeteryMain } from '@/components/cemetery/cemetery-main'
import { SirhelyekHelp } from '@/components/cemetery/sirhelyek-help'
import { ModuleAdminWorkspace } from '@/components/shared/module-admin-workspace'
import { CongregationOnlyNotice } from '@/components/layout/congregation-only-notice'
import { getDelegatedImportStatus } from '@/app/(dashboard)/delegated-import/actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

export default async function SirhelyekPage() {
  const access = await getEffectiveAccessContext()
  const { user, effectiveCongregationId, congregationName } = access
  if (!user) return null
  if (!effectiveCongregationId) {
    const scope = access.activeProfileRole?.scope === 'diocese' ? 'diocese'
      : access.activeProfileRole?.scope === 'district' ? 'district'
      : (access.admin || access.master) ? 'admin' : 'other'
    return <CongregationOnlyNotice module="A Sírhelyek modul" currentScope={scope} />
  }
  const godMode = access.master ? await getGodModeStatus() : { active: false }
  const delegatedImport = await getDelegatedImportStatus('cemetery')

  return (
    <div className="space-y-4">
      <ModuleAdminWorkspace
        moduleKey="cemetery"
        moduleLabel="Sírhelyek"
        mainTabLabel="Sírhelyi munkafelület"
        importTitle="Sírhelyi laborimport az aktuális gyülekezethez"
        importDescription="Itt készíthető elő a temetők, sírhelyek, bérletek és elhunytak Excel/CSV alapú, védett rendszergazdai importja."
        congregationName={congregationName}
        isGodMode={godMode.active}
        isDelegatedImport={delegatedImport.active}
        delegatedExpiresAt={delegatedImport.expiresAt}
        alwaysAllowAdminImport={access.admin}
        helpContent={<SirhelyekHelp />}
        profiles={[
          {
            value: 'cemeteries',
            label: 'Temetők',
            description: 'Temető-alapadatok laborimportja.',
            columns: ['nev', 'cim', 'megjegyzes'],
            hints: ['A temető neve legyen egyedi', 'A cím külön mezőben szerepeljen', 'A megjegyzés opcionális'],
          },
          {
            value: 'plots',
            label: 'Sírhelyek',
            description: 'Parcellák, sorok és számok strukturált feltöltése.',
            columns: ['temeto', 'parcella', 'sor', 'szam', 'allapot'],
            hints: ['A temető megnevezése egyezzen a törzsadattal', 'Az állapot legyen szabványos (szabad/foglalt/lejart/zart/fenntartott)', 'A parcella-sor-szám együtt azonosítson'],
          },
          {
            value: 'rentals',
            label: 'Bérletek',
            description: 'Sírhelybérleti adatok előkészített importja.',
            columns: ['sirhely', 'berlo', 'megvaltas', 'lejarata', 'osszeg'],
            hints: ['A sírhely legyen beazonosítható', 'A megváltás (kezdet) dátum kötelező', 'Az összeg RON-ban szerepeljen'],
          },
          {
            value: 'deceased',
            label: 'Elhunytak',
            description: 'Elhunyt személyek és temetési adatok laborimportja.',
            columns: ['sirhely', 'nev', 'sz_datum', 'hdatum', 'tdatum'],
            hints: ['A név legyen pontos', 'A sírhely azonosítója kötelező', 'A halál (hdatum) és temetés (tdatum) dátuma külön oszlopban legyen'],
          },
        ]}
      >
        <CemeteryMain congregationName={congregationName || ''} />
      </ModuleAdminWorkspace>
    </div>
  )
}
