import { InventoryMain } from '@/components/inventory/inventory-main-v3'
import { ModuleAdminImportTabV2 } from '@/components/shared/module-admin-import-tab-v2'
import { Leltar343ImportWizard } from '@/components/inventory/leltar343-import-wizard'
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

// 2026-08-26 (Leltar 3_43 kör): a korábbi három kártya közül kettő
// ('categories', 'values') KITALÁLT, DB-hez nem kötött scaffold volt — ilyen
// tábla/akció nem létezik, a kártyájuk csak félrevezetett. A megmaradt kártya
// oszlopai a VALÓDI import-profil ('inventory_items') fejléceit mutatják.
const LELTAR_IMPORT_PROFILES = [
  {
    value: 'items',
    label: 'Leltári tételek',
    description: 'Egyszerű leltár-lista feltöltése (egy sor = egy tétel). A hivatalos Leltar 3_43 munkafüzetet a fenti varázsló fogadja.',
    columns: ['Megnevezés', 'Kategória', 'Leltári szám', 'Helyszín', 'Felelős', 'Beszerzés dátuma', 'Beszerzési érték', 'Mennyiség'],
    hints: [
      'A kategória magyarul vagy románul is megadható (pl. „Alapeszközök")',
      'A leltári szám üresen hagyható — a rendszer automatikusan sorszámoz',
      'A már létező leltári számú sorokat kihagyjuk (nem írunk felül)',
    ],
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
          <div className="space-y-4">
            {/* 2026-08-26 (Leltar 3_43 kör, Endre hibajelzése): eddig CSAK a
                dekoratív előkészítő felület élt itt — `importProfiles` és
                `importModule` nélkül a ModuleAdminImportTabV2 `hasProcessor`
                kapcsolója hamis volt, tehát az „Import indítása" gomb SOHA nem
                renderelődött. Most (1) a hivatalos Leltar 3_43 munkafüzetnek
                dedikált kártyája van, (2) az egyszerű listákat a közös
                multi-sheet út dolgozza fel a VALÓDI 'inventory_items' profillal. */}
            <Leltar343ImportWizard />
            <ModuleAdminImportTabV2
              moduleKey="inventory"
              moduleLabel="Leltár"
              title="Leltári laborimport az aktuális gyülekezethez"
              description="Egyszerű leltár-listák (Excel/CSV) védett rendszergazdai importja. A hivatalos Leltar 3_43 munkafüzetet a fenti varázsló fogadja."
              congregationName={congregationName}
              isGodMode={godMode.active}
              isDelegatedImport={delegatedImport.active}
              delegatedExpiresAt={delegatedImport.expiresAt}
              profiles={LELTAR_IMPORT_PROFILES}
              importProfiles={INVENTORY_PROFILES}
              importModule="inventory"
            />
          </div>
        }
      />
    </div>
  )
}
