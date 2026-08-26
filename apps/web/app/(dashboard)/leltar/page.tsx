import { InventoryMain } from '@/components/inventory/inventory-main-v3'
import { Leltar343ImportWizard } from '@/components/inventory/leltar343-import-wizard'
import { LeltarImportAccessBanner } from '@/components/inventory/leltar-import-access-banner'
import { INVENTORY_PROFILES } from '@/lib/import/import-profiles'
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
          <div className="space-y-4">
            {/* 2026-08-27 (Endre 5. pontja) — EGYETLEN IMPORTÁLÓ.
                Korábban itt a varázsló ALATT egy teljes második import-keret
                is állt (ModuleAdminImportTabV2), benne SAJÁT fájlfeltöltővel:
                a fülön így három hely látszott, ahova fájlt lehet húzni.
                A varázsló mostantól MINDKÉT fajtát fogadja — a hivatalos
                Leltar 3_43 munkafüzetet és az egyszerű Excel/CSV listát is —,
                és a fajtát a SZERVER ismeri fel. */}
            <LeltarImportAccessBanner
              isGodMode={godMode.active}
              isDelegatedImport={delegatedImport.active}
              delegatedExpiresAt={delegatedImport.expiresAt}
              congregationName={congregationName}
            />
            <Leltar343ImportWizard importProfiles={INVENTORY_PROFILES} importModule="inventory" />
          </div>
        }
      />
    </div>
  )
}
