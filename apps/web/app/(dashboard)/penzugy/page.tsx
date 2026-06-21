import { createYearlySettings, initFinance, listFinanceYears } from './actions'
import { checkOblioDeadline } from './oblio-ellenorzes-actions'
import { FinanceTabs } from '@/components/finance/finance-tabs'
import { getDelegatedImportStatus } from '@/app/(dashboard)/delegated-import/actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { ensureDioceseBealitasForYear } from '@/app/(dashboard)/dashboard-egyhazmegye/diocese-actions'

export default async function PenzugyPage({
  searchParams,
}: {
  searchParams?: Promise<{ year?: string }>
}) {
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

  // A megjelenített év a `?year=` URL-paraméterből (hero-beli év-választó); ha nincs
  // vagy érvénytelen, az aktuális év. Így visszamenőleg is megnézhető bármely év.
  const params = (await searchParams) || {}
  const realYear = new Date().getFullYear()
  const parsedYear = Number(params.year)
  const selectedYear =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= realYear + 1
      ? parsedYear
      : realYear
  let data = await initFinance(selectedYear)
  // A hero év-választóhoz: csak az adattal bíró évek (+ folyó év).
  const availableYears = await listFinanceYears()

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
      const ensure = await ensureDioceseBealitasForYear(scopeId, selectedYear)
      if (ensure.error) {
        return (
          <div className="bg-white rounded-xl border p-8 text-center text-muted-foreground">
            <p className="text-lg">Nem sikerült létrehozni az éves konfigurációt: {ensure.error}</p>
          </div>
        )
      }
      // Újratöltjük az adatokat — most már van `settings`
      data = await initFinance(selectedYear)
      if (!data || !data.settings) {
        return (
          <div className="bg-white rounded-xl border p-8 text-center text-muted-foreground">
            <p className="text-lg">A pénzügyi inicializáció nem járt sikerrel. Próbáld újra.</p>
          </div>
        )
      }
    } else {
      // Gyülekezeti módban a wizardban már bekért éves alapadatokból próbáljuk
      // automatikusan létrehozni a hiányzó `bealitas` sort, külön dialóg nélkül.
      const { data: congregationDefaults } = await access.supabase
        .from('congregations')
        .select('eves_jarulek, jarulek_hatarid')
        .eq('id', scopeId)
        .maybeSingle()

      const yearlyFee = Number(congregationDefaults?.eves_jarulek) || 0
      const deadline = congregationDefaults?.jarulek_hatarid || '07-01'

      if (yearlyFee > 0) {
        // Render közben NEM revalidálunk (Next 16); az alábbi initFinance úgyis újratölt.
        const ensure = await createYearlySettings(selectedYear, yearlyFee, deadline, {
          revalidate: false,
        })
        if (!ensure.error) {
          data = await initFinance(selectedYear)
        }
      }

      if (!data?.settings) {
        return (
          <div className="rounded-xl border bg-white p-8 text-center text-muted-foreground">
            <p className="text-lg font-medium text-slate-700">
              A {selectedYear}. évi pénzügyi beállítás nem hozható létre automatikusan.
            </p>
            <p className="mt-2 text-sm">
              A welcome wizardban rögzített éves járulék vagy fizetési határidő hiányzik,
              vagy az éves `bealitas` sor létrehozása nem sikerült. Kérem, ellenőrizze a
              gyülekezeti alapadatokat, vagy küldjön segítségkérést az adminnak.
            </p>
          </div>
        )
      }
    }
  }

  // 2026-05-25: a "Rendszergazdai importáló" fül a FinanceTabs belső tab-listájának
  // VÉGÉN jelenik meg (Súgó után, red-prominent színnel), nem külön ModuleAdminWorkspace
  // wrapperrel a tetején. Jogosultság: CSAK aktív god mode vagy delegated import
  // (2026-05-29: admin szerepkör önmagában már nem mutatja).
  const showAdminImport = godMode.active || delegatedImport.active

  return (
    <div className="space-y-4">
      <FinanceTabs
        // Év-váltáskor (hero-beli év-választó → ?year=) a kliens-komponens újratöltése,
        // hogy a tételek (useState-ben tárolt initialIncome/Expense) a kiválasztott
        // ÉV adatára frissüljenek — különben a régi (alapértelmezett évi) sorok ragadnának bent.
        key={selectedYear}
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
        congregationNameRo={data.congregationNameRo}
        congregationId={scopeId}
        debtCalcMode={data.debtCalcMode}
        yearlyFees={data.yearlyFees}
        debtRows={data.debtRows}
        receiptHealth={data.receiptHealth}
        currentYear={data.currentYear}
        availableYears={availableYears}
        isGodMode={godMode.active}
        scope={scope}
        showAdminImport={showAdminImport}
      />
    </div>
  )
}
