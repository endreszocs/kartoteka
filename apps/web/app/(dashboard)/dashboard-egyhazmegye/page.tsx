import { redirect } from 'next/navigation'

import { ScopeHero } from '@/components/dashboard/scope-dashboard-sections'
import { DioceseDashboardTabs } from '@/components/dashboard/diocese/diocese-dashboard-tabs'
import { DioceseSetupAutoOpen } from '@/components/dashboard/diocese/diocese-setup-auto-open'
import { getHomePathForScope } from '@/lib/auth/active-ui-scope'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getCongregationOverviewData } from './actions'
import { getDioceseSubmissions } from './document-actions'
import { checkDioceseSetupStatus } from './diocese-actions'
import { getDioceseAnnualReports } from '@/app/(dashboard)/eves-jelentes/actions'
import { listAssignments } from '@/app/(dashboard)/admin/profile-congregations-actions'

/**
 * Egyházmegyei dashboard.
 *
 * ALAPELV (2026-04-17):
 *   Az egyházmegye CSAK a gyülekezetek által kötelezően leadott évi
 *   dokumentumokat (költségvetés, számadás, vagyonleltár, választók névjegyzéke)
 *   láthatja. NEM kérdezhet közvetlenül a `befizetes`, `kiadas`, `szemely`,
 *   `keresztseg`, `hazassag`, `temetes`, `konfirmalas` táblákból.
 *
 *   Ezért NEM hívjuk a `getScopeDashboardData`, `getScopeFinancialData`,
 *   `getScopeVitalStats` függvényeket — azok megsértenék az alapelvet.
 */
export default async function EgyhazmegyeDashboardPage() {
  const access = await getEffectiveAccessContext()
  const { supabase, user, esperes, admin, master, profile, egyhazkeruletiAdmin, activeProfileRole } = access

  if (!user) redirect('/login')
  if (!esperes && !admin && !master) redirect('/dashboard')
  if (activeProfileRole && activeProfileRole.scope !== 'diocese') {
    redirect(getHomePathForScope(activeProfileRole.scope))
  }

  const dioceseId = profile?.diocese_id || null
  const currentYear = new Date().getFullYear()
  // Januárban-februárban inkább az előző év jelentéseit kell nézni
  const annualReportYear = new Date().getMonth() < 3 ? currentYear - 1 : currentYear

  // Egyházmegye setup status (auto-open wizard-hoz)
  const dioceseSetupStatus = dioceseId
    ? await checkDioceseSetupStatus(dioceseId)
    : { needsSetup: false, missingFields: [] as string[], dioceseId: null as string | null }

  // Egyházmegye metaadatok
  const { data: dioceseRow } = dioceseId
    ? await supabase.from('dioceses').select('id, name, district_id').eq('id', dioceseId).maybeSingle()
    : { data: null }

  // Egyházkerület név (chip-hez)
  let districtName: string | null = null
  if (dioceseRow?.district_id) {
    const { data: dr } = await supabase
      .from('districts')
      .select('name')
      .eq('id', dioceseRow.district_id)
      .maybeSingle()
    districtName = dr?.name ?? null
  }

  // Gyülekezetek darabszáma — csak az alapadatok lekérdezése (nev, id), NEM tagstatisztika
  const congregationsQuery = dioceseId
    ? supabase.from('congregations').select('id', { count: 'exact', head: true }).eq('diocese_id', dioceseId)
    : supabase.from('congregations').select('id', { count: 'exact', head: true })
  const { count: congregationCount } = await congregationsQuery

  // Engedélyezett adatforrások (gyülekezet-szintű részletek nélkül)
  const [
    congregationOverview,
    docSubmissions,
    annualReportsRes,
    pendingAssignmentsRes,
  ] = await Promise.all([
    getCongregationOverviewData(),
    getDioceseSubmissions(currentYear),
    getDioceseAnnualReports(annualReportYear),
    listAssignments({ status: 'pending' }),
  ])

  const annualReports = annualReportsRes.data || []
  const pendingAssignments = pendingAssignmentsRes.data || []
  const totalRequests = congregationOverview.reduce((s, c) => s + c.unlockRequests.length, 0)

  // Szerepkör-adás jogosultság: CSAK admin (rendszergazda) és egyházkerületi admin
  const canManageRoles = !!egyhazkeruletiAdmin
  // Admin Override jogosultság: csak admin/master
  const canOverride = !!admin || !!master

  return (
    <div className="space-y-5">
      <ScopeHero
        eyebrow="Egyházmegyei irányítópult"
        title={dioceseRow?.name ? `${dioceseRow.name} Református Egyházmegye` : 'Egyházmegyei áttekintés'}
        description={
          dioceseRow?.name
            ? 'A gyülekezetek leadott dokumentumai, kérelmei és az egyházmegyei élet összefoglalása. A gyülekezet pénzügyi részletei a lelkészi felületen érhetők el — egyházmegyei szinten csak a kötelező évi dokumentumok láthatók.'
            : 'Ehhez a felhasználóhoz nincs konkrét egyházmegye hozzárendelve, összesített áttekintés látszik.'
        }
        chips={[
          districtName ? `Egyházkerület: ${districtName}` : 'Kerületi kapcsolat nélkül',
          `${(congregationCount ?? 0).toLocaleString('hu-HU')} gyülekezet`,
          `${docSubmissions.length.toLocaleString('hu-HU')} beküldött dokumentum`,
          totalRequests > 0 ? `${totalRequests} aktív kérelem` : undefined,
        ].filter(Boolean) as string[]}
      />

      <DioceseDashboardTabs
        dioceseId={dioceseId}
        congregationCount={congregationCount ?? 0}
        congregationOverview={congregationOverview}
        docSubmissions={docSubmissions}
        annualReports={annualReports}
        pendingAssignments={pendingAssignments}
        currentYear={currentYear}
        annualReportYear={annualReportYear}
        canManageRoles={canManageRoles}
        canOverride={canOverride}
      />

      {/* Auto-open setup wizard, ha az egyházmegye alapadatai hiányosak */}
      <DioceseSetupAutoOpen
        dioceseId={dioceseSetupStatus.dioceseId}
        needsSetup={dioceseSetupStatus.needsSetup}
      />
    </div>
  )
}
