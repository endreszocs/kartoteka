import { InventoryMain } from '@/components/inventory/inventory-main-v3'
import { ModuleAdminImportTabV2 } from '@/components/shared/module-admin-import-tab-v2'
import { CongregationOnlyNotice } from '@/components/layout/congregation-only-notice'
import { getDelegatedImportStatus } from '@/app/(dashboard)/delegated-import/actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
// 2026-08-15 (egyházmegyei szint, S3): diocese-módban a MEGLÉVŐ leltár-felület
// fut a megye adataival (scope-oszlopos modell).
// 2026-08-17 (kerületi S5, K2): UGYANEZ a felület szolgálja ki az
// EGYHÁZKERÜLETET is (district_id scope-oszlop) — a CongregationOnlyNotice így
// már csak a feloldhatatlan hatókörnek és az admin/master profiloknak marad.
import { getModuleScopeContext } from '@/lib/auth/module-scope'

const LELTAR_IMPORT_PROFILES = [
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
]

export default async function LeltarPage() {
  const access = await getEffectiveAccessContext()
  const { user, effectiveCongregationId, congregationName } = access
  if (!user) return null
  if (!effectiveCongregationId) {
    // 2026-08-15 (S3): diocese-scope-ban a module-scope helper oldja fel a
    // megyét — ugyanaz a felület fut, megyei adatokkal.
    //
    // 2026-08-17 (kerületi S5): a kapu `!== 'congregation'` lett. A korábbi
    // `=== 'diocese'` alaknál a kerületi adminisztrátor — akinek a module-scope
    // helper MÁR feloldotta a kerületét — némán a CongregationOnlyNotice
    // kártyára esett volna („a Leltár modul gyülekezeti modul"), vagyis a saját,
    // megépített kerületi leltárát nem érte volna el. Az admin/master profil és
    // a feloldhatatlan hatókör továbbra is a magyarázó kártyát kapja —
    // fail-closed, sosem szűretlen lista.
    const moduleScope = await getModuleScopeContext()
    if (!('error' in moduleScope) && moduleScope.scope !== 'congregation') {
      // Tartalék felirat, ha a törzsadatban nincs név — a SZINTET nevezze meg,
      // különben a kerületi felhasználó „Egyházmegye" címet látna.
      const szintNev = moduleScope.scope === 'district' ? 'Egyházkerület' : 'Egyházmegye'
      return (
        <div className="space-y-4">
          <InventoryMain
            congregationName={moduleScope.scopeName || szintNev}
            // 2026-08-22 (6. pont): a hatókör hivatalos ROMÁN neve — a
            // „Registru inventar" / „Lista de inventariere" ROMÁN íveken eddig
            // csak a magyar név állt. Ha nincs `nev_ro`, `undefined` megy át,
            // és a magyar név marad EGYEDÜL (kitalált román nevet soha nem
            // írunk a lapra; a hiányt a varázslón kell pótolni).
            congregationNameRo={moduleScope.scopeNameRo || undefined}
            scope={moduleScope.scope}
            canWrite={moduleScope.canWrite}
            readOnlyReason={moduleScope.readOnlyReason}
          />
        </div>
      )
    }
    const scope = access.activeProfileRole?.scope === 'diocese' ? 'diocese'
      : access.activeProfileRole?.scope === 'district' ? 'district'
      : (access.admin || access.master) ? 'admin' : 'other'
    return <CongregationOnlyNotice module="A Leltár modul" currentScope={scope} />
  }
  // 2026-08-11 (K5 P3 #8) — JAVÍTVA: a két, egymástól teljesen független
  // jogosultság-lekérés eddig egymás UTÁN futott, így a /leltar minden
  // megnyitása egy fölösleges soros DB-körfordulót (~100-200 ms) fizetett,
  // mielőtt az oldal elkezdhetett volna renderelni. Most egy hullámban megy —
  // ugyanaz a minta, mint a penzugy/page.tsx:51 Promise.all-jában.
  const [godMode, delegatedImport] = await Promise.all([
    access.master ? getGodModeStatus() : Promise.resolve({ active: false }),
    getDelegatedImportStatus('inventory'),
  ])

  const showAdminImport = godMode.active || delegatedImport.active

  return (
    <div className="space-y-4">
      <InventoryMain
        congregationName={congregationName || ''}
        showAdminImport={showAdminImport}
        adminImportContent={
          <ModuleAdminImportTabV2
            moduleKey="inventory"
            moduleLabel="Leltár"
            title="Leltári laborimport az aktuális gyülekezethez"
            description="Itt készíthető elő a leltári tételek, kategóriák, értékek és felelősök Excel/CSV alapú, védett rendszergazdai importja."
            congregationName={congregationName}
            isGodMode={godMode.active}
            isDelegatedImport={delegatedImport.active}
            delegatedExpiresAt={delegatedImport.expiresAt}
            profiles={LELTAR_IMPORT_PROFILES}
          />
        }
      />
    </div>
  )
}
