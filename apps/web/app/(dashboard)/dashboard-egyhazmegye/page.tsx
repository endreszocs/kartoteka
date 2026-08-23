import { redirect } from 'next/navigation'
import { Eye, ShieldCheck } from 'lucide-react'

import { ScopeHero } from '@/components/dashboard/scope-dashboard-sections'
import { DioceseDashboardTabs } from '@/components/dashboard/diocese/diocese-dashboard-tabs'
import { DioceseSetupAutoOpen } from '@/components/dashboard/diocese/diocese-setup-auto-open'
// 2026-08-15 (S5–S6): belépő kártyák az irat-archívumba és az összesítőbe +
// a KÖZÖS „nincs hatókör" kártya (a megyei alútvonalak ugyanezt mutatják).
import { DioceseBelepoKartyak } from '@/components/dashboard/diocese/diocese-belepo-kartyak'
import { MissingDioceseScopeNotice } from '@/components/dashboard/diocese/diocese-scope-notice'
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
// 2026-08-23 (kisebb rések, 3.): a megye VALÓDI szerepkör-listája. A szerver
// action hatókör-kapuja fail-closed, és a MEGYEI OLVASÓT (esperes / megyei
// admin / megyei számvevő) is beengedi — lásd profile-roles-actions.ts.
import { listProfileRolesForDiocese } from '@/app/(dashboard)/admin/profile-roles-actions'
import { APPROVAL_STATUS_LABELS, ROLE_LABELS, SCOPE_LABELS } from '@/lib/profile-roles/types'

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
    // 2026-08-15: a KÉPERNYŐN LÁTHATÓ egyházmegyét adjuk át kontextusként —
    // enélkül a lista rendszergazdánál szűretlenül az ORSZÁG összes
    // gyülekezetét hozta (783), miközben a hero helyesen 36-ot írt.
    getCongregationOverviewData(dioceseId),
    getSubmissionMatrix('diocese'),
    getDioceseAnnualReports(annualReportYear),
    listAssignments({ status: 'pending' }),
  ])

  const annualReports = annualReportsRes.data || []
  const pendingAssignments = pendingAssignmentsRes.data || []
  const totalRequests = congregationOverview.reduce((s, c) => s + c.unlockRequests.length, 0)

  // ── 2026-08-23 (kisebb rések, 3.): a „LÁTHATJA" és a „KIOSZTHATJA" KÉT JOG ──
  //
  // MI VOLT A ROSSZ: egyetlen `canManageRoles = !!egyhazkeruletiAdmin` zászló
  // döntött MINDKETTŐRŐL, ezért a „👥 Szerepkörök és hozzárendelések" fül CSAK a
  // rendszergazdának és a kerületi adminnak jelent meg. Az ESPERES — aki a saját
  // egyházmegyéjét vezeti — nem látta, KI dolgozik szerepkörrel a megyéjében,
  // pedig a `listProfileRolesForDiocese` hatókör-kapuja őt (és a megyei
  // számvevőt) SZÁNDÉKOSAN beengedi olvasásra.
  //
  // A KETTŐ SZÉTVÁLASZTVA:
  //   · `canManageRoles` — KIOSZTHATJA: hozzárendelést hoz létre / von vissza.
  //     Ehhez a `createAssignment` / `revokeAssignment` / `listAssignableUsers`
  //     szerver-oldali kapuja `admin || egyhazkeruletiAdmin`-t követel
  //     (profile-congregations-actions.ts) — a zászló EZT tükrözi, nem tágít.
  //   · `canViewRoles` — LÁTHATJA: csak olvassa a megye szerepkör-listáját.
  //     Meglévő hatókör-helperrel (`canReadDioceseScope`), nem újjal.
  //
  // FAIL-CLOSED: a `canReadDioceseScope` ugyanaz a kapu, ami feljebb a teljes
  // oldalt őrzi — aki nem jut be, ide sem jut el; a szerver action pedig a
  // KONKRÉT egyházmegyére is újraellenőriz (és hibát ad, nem üres listát).
  const canManageRoles = !!egyhazkeruletiAdmin
  const canViewRoles = canManageRoles || canReadDioceseScope(access)
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

      {/* 2026-08-15 (S5–S6): a két legfontosabb megyei felület — az iratok
          archívuma és az összesítő — JÓL LÁTHATÓ belépője, közvetlenül a hero
          alatt. Fülbe rejtve épp az veszne el, amit az esperes a legtöbbet
          használ. Rendszergazdai (hatókör nélküli) nézetben nincs értelme,
          ezért csak feloldott egyházmegyénél jelenik meg. */}
      {dioceseId && <DioceseBelepoKartyak ev={annualReportYear} />}

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

      {/* 2026-08-23 (kisebb rések, 3.): CSAK OLVASÓ szerepkör-lista annak, aki
          LÁTHATJA, de nem oszthatja ki (esperes, megyei admin, megyei számvevő).
          A kiosztásra jogosult ugyanezt a listát a „👥 Szerepkörök és
          hozzárendelések" fülön kapja, a hozzárendelés-kezelővel EGYÜTT —
          ezért a kettő KÖLCSÖNÖSEN KIZÁRÓ (`!canManageRoles`), soha nem
          jelenik meg egyszerre két lista ugyanarról. */}
      {canViewRoles && !canManageRoles && dioceseId && (
        <DioceseRolesReadOnlySection dioceseId={dioceseId} />
      )}

      {/* Auto-open setup wizard, ha az egyházmegye alapadatai hiányosak */}
      <DioceseSetupAutoOpen
        dioceseId={dioceseSetupStatus.dioceseId}
        needsSetup={dioceseSetupStatus.needsSetup}
      />
    </div>
  )
}

/**
 * 2026-08-23 (kisebb rések, 3.): AZ EGYHÁZMEGYE SZEREPKÖREI — CSAK OLVASÁS.
 *
 * KINEK: annak, aki `canViewRoles`, de NEM `canManageRoles` — vagyis az
 * esperesnek, a megyei adminnak és a megyei számvevőnek. Aki kioszthat
 * (rendszergazda, egyházkerületi admin), ugyanezt a listát a fülön kapja, a
 * hozzárendelés-kezelővel együtt.
 *
 * ⛔ MIÉRT NINCS ITT EGYETLEN SZERKESZTŐ VEZÉRLŐ SEM: a kiosztás/visszavonás
 * szerver-oldali kapuja `admin || egyhazkeruletiAdmin`-t követel
 * (`createAssignment` / `revokeAssignment`, profile-congregations-actions.ts).
 * Egy itt megjelenő gomb tehát KATTINTHATÓNAK LÁTSZANA, és „Nincs jogosultsága"
 * hibával halna el — a projekt szerint ez rosszabb, mint a gomb hiánya.
 *
 * A HIBA SOHA NEM NÉMA: betöltési hibánál látható magyar magyarázat áll a
 * listában, nem üres állapot („nincs adat" ≠ „nem tudjuk").
 */
async function DioceseRolesReadOnlySection({ dioceseId }: { dioceseId: string }) {
  // A szerver action hatókör-kaput futtat és `{ data | error }`-t ad. A
  // try/catch a VÁRATLAN dobásra van (pl. hiányzó tábla, 42P01): ilyenkor is
  // magyarázó kártya jelenjen meg, ne piros hibaoldal az egész irányítópult
  // helyett.
  let rows: Awaited<ReturnType<typeof listProfileRolesForDiocese>>['data'] = []
  let hiba: string | null = null
  try {
    const res = await listProfileRolesForDiocese(dioceseId)
    if (res.error) hiba = res.error
    else rows = res.data ?? []
  } catch (e) {
    hiba =
      'A szerepkörök most nem tölthetők be. ' +
      (e instanceof Error && e.message ? `(Részlet: ${e.message})` : '')
  }

  return (
    <section className="card-raised p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300">
          <ShieldCheck className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-base text-foreground sm:text-lg">
            Az egyházmegye szerepkörei
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Ki milyen szerepkörrel dolgozik ebben az egyházmegyében és a
            gyülekezeteiben. <strong>Csak megtekintés</strong> — a szerepkörök
            kiosztása és visszavonása az egyházkerületi admin, illetve a
            rendszergazda hatásköre.
          </p>
        </div>
      </div>

      <div className="mt-4">
        {hiba ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-900 dark:bg-rose-950/30">
            <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">
              A szerepkörök betöltése nem sikerült
            </p>
            <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{hiba}</p>
            <p className="mt-2 text-xs text-rose-700/80 dark:text-rose-300/80">
              Ez nem azt jelenti, hogy nincs szerepkör — csak azt, hogy most nem
              tudtuk lekérdezni. Frissítsd az oldalt, és ha újra ezt írja, jelezd
              a rendszergazdának.
            </p>
          </div>
        ) : (rows ?? []).length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            Ehhez az egyházmegyéhez és a gyülekezeteihez még nincs rögzített
            szerepkör.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <ul className="divide-y divide-border">
              {(rows ?? []).map((r) => {
                const nev = r.profile_full_name || r.profile_email || 'Névtelen felhasználó'
                const szerep =
                  r.role === 'custom' ? r.custom_label || ROLE_LABELS.custom : ROLE_LABELS[r.role]
                const aktiv = r.active && r.approval_status === 'approved'
                return (
                  <li
                    key={r.id}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{nev}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {szerep}
                        {' · '}
                        {SCOPE_LABELS[r.scope]}
                        {r.scope_name ? `: ${r.scope_name}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={
                          'rounded-full px-2 py-0.5 text-[11px] font-medium ' +
                          (aktiv
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                            : 'bg-muted text-muted-foreground')
                        }
                      >
                        {APPROVAL_STATUS_LABELS[r.approval_status]}
                      </span>
                      {!r.active && r.approval_status === 'approved' && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Inaktív
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
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
 * 2026-08-15 (S5): a „nincs feloldható egyházmegye" fail-closed kártya a
 * KÖZÖS `components/dashboard/diocese/diocese-scope-notice.tsx`-be költözött —
 * a megyei alútvonalak (iratok archívuma, összesítő) ugyanazt mutatják.
 * Széthúzó másolat helyett egy szöveg, egy viselkedés.
 */
