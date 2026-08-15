import { redirect } from 'next/navigation'
import { AlertCircle, Eye } from 'lucide-react'

import { ScopeHero } from '@/components/dashboard/scope-dashboard-sections'
import { DioceseDashboardTabs } from '@/components/dashboard/diocese/diocese-dashboard-tabs'
import { DioceseSetupAutoOpen } from '@/components/dashboard/diocese/diocese-setup-auto-open'
import { getHomePathForScope } from '@/lib/auth/active-ui-scope'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  canReadDioceseScope,
  canWriteDioceseScope,
  resolveDioceseScopeId,
} from '@/lib/auth/level-scope'
import { formatEgyhazmegyeNev } from '@/lib/format/egyhazmegye-nev'
import { getCongregationOverviewData } from './actions'
import { getSubmissionMatrix } from './document-actions'
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
 *
 * SCOPE (2026-08-09 diagnosztika):
 *   A hatókör az AKTÍV profile_role scope_id-jából oldódik fel (a skalár
 *   profiles.diocese_id csak fallback) — lásd lib/auth/level-scope.ts.
 *   FAIL-CLOSED: NULL-scope egyházmegyei felhasználó magyarázó kártyát kap,
 *   NEM szűretlen (egész egyházas) nézetet. Kerületi admin diocese-scope
 *   nélkül a kerületi irányítópultra kerül. A szűretlen, összesített nézet
 *   KIZÁRÓLAG a rendszergazdáé/masteré (explicit ág).
 *
 * SZÁMVEVŐ (2026-08-11):
 *   Az `egyhazmegyei_szamvevo` eddig a `!esperes` kapun kiesett, pedig az
 *   alkalmazás máshol (level-scope, finance-scope, profilváltó) elfogadta a
 *   megyei szerepét — ezért kapott üres képernyőt, illetve pattant vissza.
 *   Mostantól BELÉP, de OLVASÓ (ellenőri) nézetben: minden látszik, a
 *   módosító műveletek viszont ELŐRE le vannak tiltva, magyarázattal — nem
 *   egy néma, 0 sort érintő mentés után derül ki, hogy nem volt jogosultsága.
 *   Az adatbázis-oldali párja: migration-docs/sql/2026-08-11-szamvevo-megyei-
 *   hozzaferes.sql.
 */
export default async function EgyhazmegyeDashboardPage() {
  const access = await getEffectiveAccessContext()
  const { supabase, user, admin, master, egyhazkeruletiAdmin, activeProfileRole } = access

  if (!user) redirect('/login')
  // 2026-08-11: OLVASÁSI kapu — az esperes/megyei admin mellett a számvevőt is
  // beengedi. A `custom` megyei szerepek SZÁNDÉKOSAN kimaradnak: az RLS a
  // `permissions` JSONB-t nem tudja értelmezni, tehát ott az adatbázis úgyis
  // üres listát adna (a mai tünet reprodukálódna).
  if (!canReadDioceseScope(access)) redirect('/dashboard')
  if (activeProfileRole && activeProfileRole.scope !== 'diocese') {
    redirect(getHomePathForScope(activeProfileRole.scope))
  }

  // Írhat-e a hívó? A számvevő nem — a felület ennek megfelelően viselkedik.
  const canWrite = canWriteDioceseScope(access)

  // 2026-08-09: aktív szerep → profile_roles → profiles.diocese_id sorrendű feloldás
  const dioceseId = resolveDioceseScopeId(access)
  const isSystemAdmin = !!admin || !!master

  if (!dioceseId && !isSystemAdmin) {
    // 2026-08-09: kerületi admin (tipikusan legacy-role, profile_roles nélkül —
    // ekkor activeProfileRole=null) diocese-scope híján NE lásson globális
    // egyházmegyei nézetet — a saját kerületi irányítópultjára kerül. Az
    // activeProfileRole-feltétel a redirect-hurkot zárja ki (aktív diocese-szerep
    // scope_id nélkül → alább a fail-closed kártya, nem oda-vissza redirect).
    if (egyhazkeruletiAdmin && !activeProfileRole) {
      redirect('/dashboard-kerulet')
    }
    // Egyházmegyei szintű felhasználó feloldható egyházmegye nélkül:
    // magyarázó üres állapot (fail-closed), NEM szűretlen adat.
    return <MissingDioceseScopeNotice />
  }

  const currentYear = new Date().getFullYear()
  // Januárban-februárban inkább az előző év jelentéseit kell nézni
  const annualReportYear = new Date().getMonth() < 3 ? currentYear - 1 : currentYear

  // Egyházmegye setup status (auto-open wizard-hoz)
  // 2026-08-11 (számvevő-kör): a wizard MENTENI akar — ellenőri nézetben ezért
  // el sem indítjuk. Enélkül a számvevőnek automatikusan felugrana egy űrlap,
  // amit kitölthet, de elmenteni sosem tudna.
  const dioceseSetupStatus =
    dioceseId && canWrite
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

  // Gyülekezetek darabszáma — csak az alapadatok lekérdezése (nev, id), NEM tagstatisztika.
  // 2026-08-09: a szűretlen (egész egyházas) számláló KIZÁRÓLAG a rendszergazdai/master
  // összesített ágon fut — ide NULL dioceseId-vel csak isSystemAdmin juthat el.
  const congregationsQuery = dioceseId
    ? supabase.from('congregations').select('id', { count: 'exact', head: true }).eq('diocese_id', dioceseId)
    : supabase.from('congregations').select('id', { count: 'exact', head: true })
  const { count: congregationCount } = await congregationsQuery

  // Engedélyezett adatforrások (gyülekezet-szintű részletek nélkül).
  // 2026-08-09: a dokumentumközpont-adatcsomag a hatókör TELJES gyülekezet-
  // listáját hozza a teljességi mátrixhoz.
  // 2026-08-11 (5. kör, P2-#19): a beküldés-sorok alapból a RELEVÁNS év-ablakra
  // korlátozódnak (beszámolási szezon éve + előző év + naptári év — így a
  // year-1 kulcsú vagyonleltár és a januári számadás továbbra is látszik), és
  // a jsonb-pillanatkép nem utazik velük. A régebbi éveket az év-választó, a
  // pillanatképet a snapshot-néző kéri le.
  const [
    congregationOverview,
    documentCenter,
    annualReportsRes,
    pendingAssignmentsRes,
  ] = await Promise.all([
    getCongregationOverviewData(),
    getSubmissionMatrix('diocese'),
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
        // 2026-08-15 (4.2): a dioceses.name MÁR tartalmazza a „Református
        // Egyházmegye" toldatot — a sablonos hozzáfűzés „…Egyházmegye
        // Református Egyházmegye" címet írt. A duplázás-védő KÖZÖS helperben
        // él (a lelkészi jelentés nyomtatója is azt hívja).
        title={formatEgyhazmegyeNev(dioceseRow?.name) || 'Egyházmegyei áttekintés'}
        description={
          dioceseRow?.name
            ? 'A gyülekezetek leadott dokumentumai, kérelmei és az egyházmegyei élet összefoglalása. A gyülekezet pénzügyi részletei a lelkészi felületen érhetők el — egyházmegyei szinten csak a kötelező évi dokumentumok láthatók.'
            : 'Rendszergazdai összesített nézet: nincs konkrét egyházmegye kiválasztva, minden egyházmegye adatai látszanak.'
        }
        chips={[
          districtName ? `Egyházkerület: ${districtName}` : 'Kerületi kapcsolat nélkül',
          `${(congregationCount ?? 0).toLocaleString('hu-HU')} gyülekezet`,
          // 2026-08-11 (P2-#19): a TELJES archívum darabszáma (olcsó
          // darabszám-lekérdezésből), nem a betöltött év-ablak mérete.
          `${(documentCenter.totalCount ?? documentCenter.submissions.length).toLocaleString('hu-HU')} beküldött dokumentum (archívum)`,
          totalRequests > 0 ? `${totalRequests} aktív kérelem` : undefined,
          !canWrite ? 'Ellenőri (csak megtekintés) nézet' : undefined,
        ].filter(Boolean) as string[]}
      />

      {!canWrite && <ReadOnlyDioceseNotice />}

      <DioceseDashboardTabs
        dioceseId={dioceseId}
        congregationCount={congregationCount ?? 0}
        congregationOverview={congregationOverview}
        documentCenter={documentCenter}
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

/**
 * 2026-08-11 (számvevő-kör): ellenőri (csak megtekintés) sáv.
 *
 * MIÉRT VAN ITT, ÉS MIÉRT ELŐRE: a számvevő mostantól belép a megyei
 * felületre, de az adatbázis csak olvasást enged neki. Enélkül a sáv nélkül a
 * gombok kattinthatónak LÁTSZANÁNAK, a mentés pedig vagy néma 0 sort érintene,
 * vagy nyers RLS-hibát dobna — mindkettő rossz. Ez a sáv és a szerver akciók
 * beszédes `{ error }`-a ugyanazt mondja, hogy a felhasználó ne találgasson.
 */
function ReadOnlyDioceseNotice() {
  return (
    // 2026-08-15 (4.3): sötét módban a hardcode-olt világos gradient fehér
    // lapként világított — dark:-on a gradient lekapcsol (bg-none), és a
    // card-raised saját sötét háttere + sötét-barát szövegszínek élnek.
    <div className="card-raised border-sky-200 bg-gradient-to-br from-sky-50/60 via-white to-slate-50/40 p-4 sm:p-5 dark:border-sky-400/25 dark:bg-none">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">
          <Eye className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-base text-slate-800 sm:text-lg dark:text-slate-100">
            Ellenőri nézet — mindent látsz, de nem módosíthatsz
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Egyházmegyei számvevőként az egyházmegye gyülekezeteinek beküldött
            dokumentumait, éves jelentéseit és az egyházmegye saját pénzügyi
            könyveit <strong>megtekintheted</strong>. Az iratok átvétele,
            véglegesítése, visszaküldése, a feloldási kérelmek elbírálása és a
            pénzügyi rögzítés az esperes, illetve az egyházmegyei
            adminisztrátor feladata.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Ez szándékos: az ellenőrzés és a rögzítés két külön kézben van. Ha
            hibát találsz, jelezd az esperesnek — a módosító gombok ezért
            nem működnek nálad.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * 2026-08-09: fail-closed üres állapot — egyházmegyei szintű felhasználó,
 * akinek NEM oldható fel az egyházmegye-hatóköre (se aktív szerep, se
 * profile_roles diocese sor, se profiles.diocese_id). Korábban ez az eset
 * némán a TELJES egyház gyülekezet-listáját mutatta.
 */
function MissingDioceseScopeNotice() {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      {/* 2026-08-15 (4.3): sötét módban a világos gradient bg-none-nal lekapcsol. */}
      <div className="card-raised p-6 bg-gradient-to-br from-amber-50/40 via-white to-orange-50/30 border-amber-200 dark:border-amber-400/25 dark:bg-none">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
            <AlertCircle className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-heading text-lg text-slate-800 dark:text-slate-100">
              Nincs egyházmegye rendelve a fiókjához
            </h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed dark:text-slate-300">
              Az egyházmegyei irányítópult csak akkor tud adatot mutatni, ha a
              szerepköréhez konkrét egyházmegye tartozik. Jelenleg a fiókjához
              nem sikerült egyházmegyét feloldani, ezért — az egyházmegyei
              adatok védelme érdekében — nem jelenítünk meg gyülekezeti listát.
            </p>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed dark:text-slate-300">
              Kérjük, jelezze a rendszergazdának, hogy rendelje hozzá a
              szerepköréhez a megfelelő egyházmegyét, vagy — ha több profilja
              van — váltson profilt a fejlécben.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
