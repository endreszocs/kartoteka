import { redirect } from 'next/navigation'
import {
  AlertCircle,
  Building2,
  CalendarClock,
  FileCheck,
  HandHeart,
  Layers,
} from 'lucide-react'

import { ScopeHero } from '@/components/dashboard/scope-dashboard-sections'
// 2026-08-09: a FinalizedDocumentsList + DeadlineCard helyett a közös
// dokumentumközpont (teljességi mátrix + snapshot-néző + átvétel-igazolás).
import { DocumentCenter } from '@/components/dashboard/document-center'
import { getHomePathForScope } from '@/lib/auth/active-ui-scope'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { resolveDistrictScopeIds } from '@/lib/auth/level-scope'
import { getSubmissionMatrix } from '@/app/(dashboard)/dashboard-egyhazmegye/document-actions'
import { documentSeasonYear } from '@/lib/constants/documents'

/**
 * Egyházkerületi dashboard.
 *
 * ALAPELV (2026-04-17):
 *   Az egyházkerület CSAK a véglegesített és továbbított dokumentumokat
 *   (`document_submissions.forwarded_to_kerulet=true` és `status='finalized'`)
 *   láthatja. NEM kérdezhet közvetlenül a `befizetes`, `kiadas`, `szemely`,
 *   `keresztseg`, `hazassag`, `temetes`, `konfirmalas` táblákból.
 *
 *   Ezért NEM hívjuk a `getScopeDashboardData`, `getScopeFinancialData`,
 *   `getScopeVitalStats` függvényeket — azok megsértenék az alapelvet.
 *
 * SCOPE (2026-08-09 diagnosztika):
 *   A kerület-hatókör az aktív profile_role-ból oldódik fel (a skalár
 *   profiles.district_id csak fallback) — lásd lib/auth/level-scope.ts.
 *   Korábban a dioceses/congregations lekérdezés SZŰRETLEN volt (a RLS
 *   USING(true) miatt az egész ország látszott), és a districtId az ábécé
 *   szerinti ELSŐ egyházmegye sorából lett kitalálva — a hero akár a MÁSIK
 *   kerület nevét mutatta. FAIL-CLOSED: hatókör nélkül magyarázó kártya;
 *   a mindent-látó ág KIZÁRÓLAG a masteré/rendszergazdáé (explicit, feliratozva).
 */
export default async function KeruletDashboardPage() {
  const access = await getEffectiveAccessContext()
  const { supabase, user, egyhazkeruletiAdmin, admin, master, activeProfileRole } = access

  if (!user) redirect('/login')
  if (!egyhazkeruletiAdmin) redirect('/dashboard')
  if (activeProfileRole && activeProfileRole.scope !== 'district') {
    redirect(getHomePathForScope(activeProfileRole.scope))
  }

  // 2026-08-09: aktív szerep → profile_roles district sorok → profiles.district_id
  const districtIds = resolveDistrictScopeIds(access)
  const isSystemAdmin = !!admin || !!master
  // Explicit, feliratozott "minden kerület" ág — CSAK master/rendszergazda,
  // akinek nincs saját kerület-hatóköre.
  const showAllDistricts = isSystemAdmin && districtIds.length === 0

  if (districtIds.length === 0 && !isSystemAdmin) {
    // FAIL-CLOSED: kerületi admin feloldható kerület nélkül — magyarázó üres
    // állapot, NEM országos lista.
    return <MissingDistrictScopeNotice />
  }

  const currentYear = new Date().getFullYear()

  // Egyházmegyék lekérdezése (csak metaadatok) — a saját kerület(ek)re szűrve
  let dioQuery = supabase
    .from('dioceses')
    .select('id, name, district_id')
    .order('name')
  if (!showAllDistricts) {
    dioQuery = dioQuery.in('district_id', districtIds)
  }
  const { data: dioceses } = await dioQuery

  // Hero-név: a SAJÁT hatókör elsődleges kerülete a districts táblából —
  // NEM az első egyházmegye sorából kitalálva.
  const districtId = districtIds[0] ?? null
  let districtName: string | null = null
  if (districtId) {
    const { data: dr } = await supabase
      .from('districts')
      .select('name')
      .eq('id', districtId)
      .maybeSingle()
    districtName = dr?.name || null
  }

  // Gyülekezetek darabszáma egyházmegyénként — a kerület egyházmegyéire szűrve
  const dioceseIds = (dioceses || []).map((d) => d.id)
  let congRows: Array<{ id: string; diocese_id: string | null }> = []
  if (showAllDistricts) {
    const { data } = await supabase
      .from('congregations')
      .select('id, diocese_id')
    congRows = data || []
  } else if (dioceseIds.length > 0) {
    const { data } = await supabase
      .from('congregations')
      .select('id, diocese_id')
      .in('diocese_id', dioceseIds)
    congRows = data || []
  }

  const congByDiocese = new Map<string, number>()
  for (const c of congRows) {
    if (c.diocese_id) {
      congByDiocese.set(c.diocese_id, (congByDiocese.get(c.diocese_id) || 0) + 1)
    }
  }
  const totalCongregations = congRows.length

  // 2026-08-11 (Endre döntése): TAGLÉTSZÁM-ÖSSZESÍTŐ a kerületnek.
  //
  // ⚠️ FONTOS: NEM a `szemely` táblát kérdezzük — az sértené a fenti alapelvet.
  // A `district_member_counts()` SECURITY DEFINER függvény KIZÁRÓLAG darabszámot
  // ad vissza (gyülekezetenként), személyes adat nélkül.
  // Amíg a 2026-08-11-kerulet-letszam-osszesito.sql nincs lefuttatva, a hívás
  // hibázik — ilyenkor NEM mutatunk hamis nullát, hanem elhagyjuk a számokat.
  const memberByDiocese = new Map<string, number>()
  let totalMembers: number | null = null
  {
    const { data: countRows, error: countErr } = await supabase.rpc('district_member_counts', {
      p_district_id: showAllDistricts ? null : districtId,
    })
    if (!countErr && Array.isArray(countRows)) {
      let sum = 0
      for (const row of countRows as Array<{ diocese_id: string | null; member_count: number | string }>) {
        const n = Number(row.member_count) || 0
        sum += n
        if (row.diocese_id) {
          memberByDiocese.set(row.diocese_id, (memberByDiocese.get(row.diocese_id) || 0) + n)
        }
      }
      totalMembers = sum
    }
  }

  // Dokumentumközpont-adatcsomag (engedélyezett adatforrás): MINDEN év
  // véglegesített/továbbított dokumentumai + a kerület TELJES gyülekezet-
  // listája a teljességi mátrixhoz (2026-08-09).
  const documentCenter = await getSubmissionMatrix('district')
  const seasonYear = documentSeasonYear()
  const seasonDocs = documentCenter.submissions.filter((d) => d.year === seasonYear)

  return (
    <div className="space-y-5">
      <ScopeHero
        eyebrow="Egyházkerületi irányítópult"
        title={
          districtName ||
          (showAllDistricts ? 'Egyházkerületi áttekintés' : 'Erdélyi Református Egyházkerület')
        }
        description="A kerület kizárólag a véglegesített és továbbított hivatalos dokumentumokat látja. Az egyházmegyék és gyülekezetek belső adataihoz a kerület — a gyülekezeti és egyházmegyei autonómia jegyében — nem fér hozzá."
        chips={[
          showAllDistricts ? 'Rendszergazdai nézet: minden egyházkerület' : undefined,
          `${(dioceses?.length ?? 0).toLocaleString('hu-HU')} egyházmegye`,
          `${totalCongregations.toLocaleString('hu-HU')} gyülekezet`,
          documentCenter.submissions.length > 0
            ? `${documentCenter.submissions.length.toLocaleString('hu-HU')} hivatalos dokumentum (archívum)`
            : 'nincs még véglegesített dokumentum',
        ].filter(Boolean) as string[]}
      />

      {/* KPI sor — alapelv-konform */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<Layers className="size-5 text-violet-600" />}
          label="Egyházmegye"
          value={(dioceses?.length ?? 0).toLocaleString('hu-HU')}
          tone="violet"
        />
        <KpiCard
          icon={<Building2 className="size-5 text-sky-600" />}
          label="Gyülekezet"
          value={totalCongregations.toLocaleString('hu-HU')}
          tone="sky"
        />
        <KpiCard
          icon={<FileCheck className="size-5 text-emerald-600" />}
          label="Beérkezett dok."
          value={seasonDocs.length.toLocaleString('hu-HU')}
          tone="emerald"
          hint={`${seasonYear}. beszámolási évre`}
        />
        <KpiCard
          icon={<CalendarClock className="size-5 text-amber-600" />}
          label="Aktuális év"
          value={String(currentYear)}
          tone="amber"
          hint="januári + májusi határidők"
        />
      </div>

      {/* Egyházmegyei bontás — gyülekezet-darabszám + (2026-08-11) taglétszám */}
      <DioceseBreakdown
        dioceses={dioceses || []}
        congByDiocese={congByDiocese}
        memberByDiocese={memberByDiocese}
        totalMembers={totalMembers}
      />

      {/* 2026-08-09: dokumentumközpont — teljességi mátrix (a kerület MINDEN
          gyülekezete), év/típus-szűrés, snapshot-néző + nyomtatás, kerületi
          átvétel-igazolás. A régi DeadlineCard + FinalizedDocumentsList helyett. */}
      <DocumentCenter level="district" data={documentCenter} />

      {/* Autonómia tájékoztató */}
      <div className="rounded-2xl border border-slate-100 bg-slate-50/40 p-5">
        <div className="flex items-start gap-3">
          <HandHeart className="size-5 text-slate-500 mt-0.5" />
          <div className="text-sm text-slate-600 leading-relaxed">
            <p className="font-semibold text-slate-700 mb-1">A gyülekezeti és egyházmegyei autonómia védett</p>
            <p>
              A kerület CSAK a véglegesített és továbbított dokumentumokat láthatja.
              A gyülekezetek pénzügyi és személyes adataihoz a lelkészi felületen, az egyházmegyei
              belső adatokhoz az egyházmegyei vezetésnél lehet hozzáférni — minden esetben
              a megfelelő autonómia tiszteletben tartásával.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Belső komponensek
// ---------------------------------------------------------------------------

/**
 * 2026-08-09: fail-closed üres állapot — kerületi admin, akinek NEM oldható
 * fel az egyházkerület-hatóköre (se aktív szerep, se profile_roles district
 * sor, se profiles.district_id). Korábban ez az eset némán az ORSZÁGOS
 * egyházmegye- és gyülekezet-listát mutatta.
 */
function MissingDistrictScopeNotice() {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="card-raised p-6 bg-gradient-to-br from-amber-50/40 via-white to-orange-50/30 border-amber-200">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <AlertCircle className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-heading text-lg text-slate-800">
              Nincs egyházkerület rendelve a fiókjához
            </h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Az egyházkerületi irányítópult csak akkor tud adatot mutatni, ha a
              szerepköréhez konkrét egyházkerület tartozik. Jelenleg a fiókjához
              nem sikerült egyházkerületet feloldani, ezért — az egyházmegyei és
              gyülekezeti adatok védelme érdekében — nem jelenítünk meg listát.
            </p>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Kérjük, jelezze a rendszergazdának, hogy rendelje hozzá a
              szerepköréhez a megfelelő egyházkerületet, vagy — ha több profilja
              van — váltson profilt a fejlécben.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  tone: 'violet' | 'sky' | 'emerald' | 'amber'
}) {
  const toneClasses: Record<string, string> = {
    violet: 'border-violet-200 bg-violet-50/60',
    sky: 'border-sky-200 bg-sky-50/60',
    emerald: 'border-emerald-200 bg-emerald-50/60',
    amber: 'border-amber-200 bg-amber-50/60',
  }
  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-bold text-slate-800 leading-tight">{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

function DioceseBreakdown({
  dioceses,
  congByDiocese,
  memberByDiocese,
  totalMembers,
}: {
  dioceses: { id: string; name: string }[]
  congByDiocese: Map<string, number>
  /** 2026-08-11: egyházmegyénkénti taglétszám (üres, ha a migráció még nem futott). */
  memberByDiocese: Map<string, number>
  /** Kerületi összlétszám — null, ha nem elérhető (migráció hiánya). */
  totalMembers: number | null
}) {
  const hasMemberCounts = totalMembers !== null
  return (
    <div className="card-raised overflow-hidden">
      <div className="bg-slate-50 px-5 py-4 border-b border-slate-200/60">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-heading text-lg text-slate-800">Egyházmegyei bontás</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Felügyelt egyházmegyék, gyülekezeteik és taglétszámuk.
            </p>
          </div>
          {hasMemberCounts ? (
            <p className="text-right">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Kerületi összlétszám
              </span>
              <span className="font-heading text-xl tabular-nums text-slate-800">
                {totalMembers.toLocaleString('hu-HU')} fő
              </span>
            </p>
          ) : null}
        </div>
      </div>
      {dioceses.length === 0 ? (
        <p className="p-6 text-sm text-slate-500 text-center italic">Nincs felügyelt egyházmegye.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {dioceses.map((d) => {
            const congCount = congByDiocese.get(d.id) ?? 0
            const memberCount = memberByDiocese.get(d.id)
            return (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-3">
                <p className="text-sm font-medium text-slate-800">{d.name}</p>
                <p className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="tabular-nums">{congCount.toLocaleString('hu-HU')} gyülekezet</span>
                  {hasMemberCounts ? (
                    <>
                      <span aria-hidden className="text-slate-300">·</span>
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium tabular-nums text-teal-800">
                        {(memberCount ?? 0).toLocaleString('hu-HU')} fő
                      </span>
                    </>
                  ) : null}
                </p>
              </li>
            )
          })}
        </ul>
      )}
      {!hasMemberCounts ? (
        <p className="border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-xs leading-relaxed text-slate-500">
          A taglétszám-összesítő megjelenítéséhez futtatni kell a{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5">2026-08-11-kerulet-letszam-osszesito.sql</code>{' '}
          migrációt. A kerület ekkor is CSAK összesített darabszámot lát — a tagnyilvántartás
          sorai zárva maradnak.
        </p>
      ) : null}
    </div>
  )
}

// 2026-08-09: a DeadlineCard kikerült — a határidő/teljesség-áttekintést a
// DocumentCenter teljességi mátrixa adja (minden gyülekezettel, hiányzókkal).

