import { CemeteryMain } from '@/components/cemetery/cemetery-main'
import { ModuleAdminImportTabV2 } from '@/components/shared/module-admin-import-tab-v2'
import { CongregationOnlyNotice } from '@/components/layout/congregation-only-notice'
import { getDelegatedImportStatus } from '@/app/(dashboard)/delegated-import/actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

const SIRHELYEK_IMPORT_PROFILES = [
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
    hints: ['A temető megnevezése egyezzen a törzsadattal', 'Az állapot legyen szabványos', 'A parcella-sor-szám együtt azonosítson'],
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
    hints: ['A név legyen pontos', 'A sírhely azonosítója kötelező', 'A halál és temetés dátuma külön oszlopban'],
  },
]

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

  // 2026-05-25: a tabok a CemeteryMain Hero-ja ALATT jelennek meg
  // (Tagnyilvántartás minta — ModuleAdminWorkspace wrapper eltávolítva).
  const showAdminImport = godMode.active || delegatedImport.active

  return (
    <div className="space-y-4">
      <CemeteryMain
        congregationName={congregationName || ''}
        showAdminImport={showAdminImport}
        adminImportContent={
          <ModuleAdminImportTabV2
            moduleKey="cemetery"
            moduleLabel="Sírhelyek"
            title="Sírhelyi laborimport az aktuális gyülekezethez"
            description="Itt készíthető elő a temetők, sírhelyek, bérletek és elhunytak Excel/CSV alapú, védett rendszergazdai importja."
            congregationName={congregationName}
            isGodMode={godMode.active}
            isDelegatedImport={delegatedImport.active}
            delegatedExpiresAt={delegatedImport.expiresAt}
            profiles={SIRHELYEK_IMPORT_PROFILES}
            embedded
          />
        }
      />
    </div>
  )
}
