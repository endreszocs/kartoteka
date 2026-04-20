import { initFinance } from './actions'
import { checkOblioDeadline } from './oblio-ellenorzes-actions'
import { FinanceTabs } from '@/components/finance/finance-tabs'
import { ModuleAdminWorkspace } from '@/components/shared/module-admin-workspace'
import { YearlySettingsDialog } from '@/components/modals/yearly-settings-dialog'
import { getDelegatedImportStatus } from '@/app/(dashboard)/delegated-import/actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { FINANCE_PROFILES } from '@/lib/import/import-profiles'
import { ensureDioceseBealitasForYear } from '@/app/(dashboard)/dashboard-egyhazmegye/diocese-actions'

export default async function PenzugyPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) return null

  // 2026-04-18 SCOPE-AWARE: diocese módban az activeProfileRole.scope_id a fontos.
  // Congregation módban az effectiveCongregationId. Mindkettő hiányánál guard.
  const isDioceseScope =
    access.activeProfileRole?.scope === 'diocese' && access.activeProfileRole.scopeId
  const scope: 'congregation' | 'diocese' = isDioceseScope ? 'diocese' : 'congregation'
  const scopeId = isDioceseScope
    ? (access.activeProfileRole!.scopeId as string)
    : access.effectiveCongregationId

  if (!scopeId) return null

  const godMode = access.master ? await getGodModeStatus() : { active: false }
  const delegatedImport = await getDelegatedImportStatus('finance')

  // ANAF SPV 60 napos határidő figyelő — csak congregation scope-ban releváns
  if (scope === 'congregation') {
    void checkOblioDeadline().catch(() => {
      /* csendes — nem kritikus */
    })
  }

  const currentYear = new Date().getFullYear()
  let data = await initFinance(currentYear)

  if (!data) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center text-muted-foreground">
        <p className="text-lg">Nincs elérhető pénzügyi adat. Ellenőrizze a profil beállításokat.</p>
      </div>
    )
  }

  // 2026-04-19: scope-aware settings kezelés
  if (!data.settings) {
    if (scope === 'diocese') {
      // Egyházmegyei módban NINCS éves egyházfenntartás beállítás!
      // Automatikusan létrehozunk egy üres `diocese_bealitas` sort az évre,
      // és azonnal újratöltünk — a lelkész nem lát külön dialógust.
      const ensure = await ensureDioceseBealitasForYear(scopeId, currentYear)
      if (ensure.error) {
        return (
          <div className="bg-white rounded-xl border p-8 text-center text-muted-foreground">
            <p className="text-lg">Nem sikerült létrehozni az éves konfigurációt: {ensure.error}</p>
          </div>
        )
      }
      // Újratöltjük az adatokat — most már van `settings`
      data = await initFinance(currentYear)
      if (!data || !data.settings) {
        return (
          <div className="bg-white rounded-xl border p-8 text-center text-muted-foreground">
            <p className="text-lg">A pénzügyi inicializáció nem járt sikerrel. Próbáld újra.</p>
          </div>
        )
      }
    } else {
      // Gyülekezeti módban marad az éves beállítások dialóg (járulék + határidő)
      return <YearlySettingsDialog year={currentYear} />
    }
  }

  return (
    <div className="space-y-4">
      <ModuleAdminWorkspace
        moduleKey="finance"
        moduleLabel="Pénzügy"
        mainTabLabel="Pénzügyi munkafelület"
        importTitle="Pénzügyi laborimport az aktuális gyülekezethez"
        importDescription="Itt készíthető elő a bevételek, kiadások, bankszámla-mozgások, monetár tételek és belső mozgások Excel/CSV alapú, védett rendszergazdai importja."
        congregationName={data.congregationName}
        isGodMode={godMode.active}
        isDelegatedImport={delegatedImport.active}
        delegatedExpiresAt={delegatedImport.expiresAt}
        hideTabsUntilPrivileged
        importProfiles={FINANCE_PROFILES}
        importModule="finance"
        profiles={[
          {
            value: 'income',
            label: 'Bevételek',
            description: 'Befizetések, adományok és egyházfenntartási bevételek előkészített importja.',
            columns: ['datum', 'osszeg', 'befizeto', 'celkod', 'iratszam', 'penztar_vagy_bankszamla'],
            hints: ['Az összegek legyenek pozitív számok', 'A célkódok igazodjanak az EREK pénzügyi rendhez', 'A befizető neve vagy azonosítója legyen egyértelmű'],
          },
          {
            value: 'expenses',
            label: 'Kiadások',
            description: 'Számlák, szolgáltatások és egyéb kiadási tételek strukturált feltöltése.',
            columns: ['datum', 'osszeg', 'kedvezmenyezett', 'celkod', 'iratszam', 'megjegyzes'],
            hints: ['Az iratszámok ne ismétlődjenek', 'A kedvezményezett mező legyen kitöltve', 'A kiadási célkódok legyenek pontosak'],
          },
          {
            value: 'bank',
            label: 'Bankszámla kivonatok',
            description: 'Bankszámlamozgások laborimportja a számlák közötti egyeztetéshez.',
            columns: ['datum', 'bankszamla', 'tipus', 'osszeg', 'partner', 'megjegyzes'],
            hints: ['A bankszámla neve egyezzen a törzsadattal', 'A típus legyen bevétel vagy kiadás', 'A partner mező segíti a párosítást'],
          },
          {
            value: 'monetary',
            label: 'Monetár számolás',
            description: 'Kasszaellenőrzéshez címletenkénti induló adatok feltöltésének előkészítése.',
            columns: ['cimlet', 'darab', 'megjegyzes'],
            hints: ['Minden címlet külön sorban szerepeljen', 'Az 1 RON bankjegyként kezelendő', 'A darabszámok egész számok legyenek'],
          },
          {
            value: 'transfers',
            label: 'Belső mozgások',
            description: 'Kassza és bank közti belső mozgások kontrollált import-előkészítése.',
            columns: ['datum', 'forras', 'cel', 'osszeg', 'megjegyzes'],
            hints: ['A forrás és cél számla legyen meglévő tétel', 'Az összeg ne legyen negatív', 'A megjegyzésben szerepeljen a mozgás oka'],
          },
        ]}
      >
        <FinanceTabs
          settings={data.settings}
          szamadasiCellek={data.szamadasiCellek}
          bevCelMap={data.bevCelMap}
          kiaCelMap={data.kiaCelMap}
          bmBevCelIds={data.bmBevCelIds}
          bmKiaCelIds={data.bmKiaCelIds}
          bankAccounts={data.bankAccounts}
          internalTransfers={data.internalTransfers}
          initialIncome={data.initialIncome}
          initialExpense={data.initialExpense}
          carryoverCash={data.carryoverCash}
          carryoverBank={data.carryoverBank}
          congregationName={data.congregationName}
          congregationId={scopeId}
          debtCalcMode={data.debtCalcMode}
          yearlyFees={data.yearlyFees}
          debtRows={data.debtRows}
          receiptHealth={data.receiptHealth}
          currentYear={data.currentYear}
          isGodMode={godMode.active}
          scope={scope}
        />
      </ModuleAdminWorkspace>
    </div>
  )
}
