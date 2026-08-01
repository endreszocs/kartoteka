import { ageFromDate } from '@/lib/utils/date'
import { HU_MONTHS_SHORT } from '@/lib/constants/dashboard'
import { HeroBannerScriptureV2 } from '@/components/dashboard/hero-banner-scripture-v2'
import { KpiCards } from '@/components/dashboard/kpi-cards'
import { Celebrations } from '@/components/dashboard/celebrations'
import { CurrentYearFeeBanner } from '@/components/dashboard/current-year-fee-banner'
import { AgeDistributionCard, FinanceOverviewChart } from '@/components/dashboard/chart-panels'
import { ProgramScheduler } from '@/components/dashboard/program-scheduler'
import { RecentActivity } from '@/components/dashboard/recent-activity'
import { BottomStats } from '@/components/dashboard/bottom-stats'
// PublicSiteWidget eltávolítva (2026-04-21o) — a publikus oldal státusz a KPI-kártyán látszik, külön dobozra nincs szükség
import { CongregationSetupAutoOpen } from '@/components/dashboard/congregation-setup-auto-open'
import { CongregationOnlyNotice } from '@/components/layout/congregation-only-notice'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { checkCongregationSetupStatus } from '@/app/(dashboard)/congregation/actions'
import { formatNameWithPrefix } from '@/lib/utils/member-helpers'

interface Member {
  id: string
  csaladnev: string | null
  k_nev: string | null
  namepattern: string | null
  /** 2026-08-01 (PR-19): az özv./elv. előtaghoz */
  allapot: string | null
  sz_datum: string | null
  ferfi: boolean | null
}

interface NamedayRow {
  nev1: string | null
  nev2: string | null
  nev3: string | null
  honap: string
  nap: string
}

interface ActivityRow {
  idopont: string | null
  jellege: string | null
  cim: string | null
  created_at: string
}

export default async function DashboardPage() {
  const access = await getEffectiveAccessContext()
  const { supabase, effectiveCongregationId, congregationName, congregationLogo, fullName } = access

  // 2026-04-19: ha admin / esperes / kerületi scope-ban jön valaki direkt URL-lel,
  // ne üres oldalt, hanem informatív tájékoztatót mutassunk.
  if (!effectiveCongregationId) {
    const scope =
      access.activeProfileRole?.scope === 'diocese'
        ? 'diocese'
        : access.activeProfileRole?.scope === 'district'
          ? 'district'
          : access.admin || access.master
            ? 'admin'
            : 'other'
    return <CongregationOnlyNotice module="A gyülekezeti irányítópult" currentScope={scope} />
  }

  const today = new Date()
  const curYear = today.getFullYear()
  const curMonth = today.getMonth() + 1
  const curDay = today.getDate()
  const chartStartDate = `${curYear - 1}-${String(curMonth).padStart(2, '0')}-01`

  // ── Minden lekérdezés EGYETLEN párhuzamos hullámban ───────────────────────
  // 2026-06-30 (perf): a setup-status + walkthrough korábban SZEKVENCIÁLISAN
  // futott a fő blokk előtt (3 külön körútnyi latency). Egyik sem függ a
  // többitől, ezért egyetlen Promise.all-ba vonjuk össze → 1 körút.
  const [
    setupStatus,
    walkthroughResult,
    szemResult,
    elkoltozottResult,
    csaladResult,
    befizetesResult,
    kiadasResult,
    payersResult,
    presbResult,
    nevnapResult,
    publicSiteResult,
    publicPostsResult,
    recentResult,
    congregationFeeResult,
    annualFeeCurrentYearResult,
  ] = await Promise.all([
    // Gyülekezeti setup status — ha hiányosak az adatok, auto-open wizard
    checkCongregationSetupStatus(effectiveCongregationId),
    // 2026-06-05: ha a bevezető körbevezetés (walkthrough) még nem futott le, a
    // setup-wizard csak ANNAK befejezése után nyíljon (ne fedjék egymást).
    supabase.from('profiles').select('walkthrough_completed').eq('id', access.userId ?? '').maybeSingle(),
    // 2026-06-30 (perf): a cím-joinok (adrstreet/adrlocality) + c_szam/c_szcim
    // KIKERÜLTEK innen — azok csak a születésnap-lista modálban, a „Lakhely"
    // kapcsoló mögött kellenek, ezért kérésre töltődnek (getBirthdayListAddresses).
    // 2026-08-01 (PR-19): LAPOZOTT lekérés — a Supabase alap 1000-es plafonja
    // felett a lista (és a születésnaposok) némán csonkolódott volna.
    (async () => {
      const all: Member[] = []
      const PAGE = 1000
      for (let fromIdx = 0; ; fromIdx += PAGE) {
        const { data, error } = await supabase
          .from('szemely')
          .select('id, csaladnev, k_nev, namepattern, allapot, sz_datum, ferfi')
          .eq('congregation_id', effectiveCongregationId)
          .eq('meghalt', false)
          .order('id', { ascending: true })
          .range(fromIdx, fromIdx + PAGE - 1)
        if (error) return { data: all, error }
        const page = (data || []) as Member[]
        all.push(...page)
        if (page.length < PAGE) break
      }
      return { data: all, error: null }
    })(),
    (async () => {
      const all: { id_szemely: string }[] = []
      const PAGE = 1000
      for (let fromIdx = 0; ; fromIdx += PAGE) {
        const { data, error } = await supabase
          .from('elkoltozott')
          .select('id_szemely')
          .eq('congregation_id', effectiveCongregationId)
          .order('id_szemely', { ascending: true })
          .range(fromIdx, fromIdx + PAGE - 1)
        if (error) return { data: all, error }
        const page = (data || []) as { id_szemely: string }[]
        all.push(...page)
        if (page.length < PAGE) break
      }
      return { data: all, error: null }
    })(),
    // 2026-06-01 (hibrid család-modell Fázis 2): az ÚJ `haztartas` táblát
    // olvassuk — congregation_id direkt szűr, és a tagság aktív tagjai a
    // `haztartas_tag`-ban élnek (csaladfo/hazastars szerepekkel).
    supabase.from('haztartas')
      .select('id, isaktiv, tagok:haztartas_tag(id_szemely, szerep)')
      .eq('congregation_id', effectiveCongregationId)
      .eq('isaktiv', true)
      .is('ervenyes_ig', null),
    // deleted/stornozott törölt tételek kizárva — 2026-04-21t
    supabase.from('befizetes').select('osszeg, datum').eq('congregation_id', effectiveCongregationId).eq('deleted', false).eq('stornozott', false).gte('datum', chartStartDate),
    supabase.from('kiadas').select('osszeg, datum').eq('congregation_id', effectiveCongregationId).eq('deleted', false).gte('datum', chartStartDate),
    // 2026-06-30 (perf): csak a sorszám kell (head:true) — korábban az összes
    // id_szemely-t lehúzta pusztán a .length-hez.
    supabase.from('befizetes').select('*', { count: 'exact', head: true }).eq('congregation_id', effectiveCongregationId).eq('fizetettev', curYear),
    // 2026-06-30 (perf + scope): gyülekezetre szűrt presbiterek a bevált
    // szemely!inner join-mintával (korábban az EGÉSZ presbiter táblát lehúzta).
    supabase.from('presbiter').select('id, szemely:szemely!inner(congregation_id, meghalt)').eq('szemely.congregation_id', effectiveCongregationId).eq('szemely.meghalt', false),
    // 2026-06-30 (perf): csak a mai nap névnapja kell — korábban a teljes
    // (~366 soros) nevnap táblát lehúzta, hogy aztán JS-ben keressen.
    supabase.from('nevnap').select('nev1, nev2, nev3, honap, nap').eq('honap', String(curMonth)).eq('nap', String(curDay)),
    supabase.from('public_sites').select('is_published').eq('congregation_id', effectiveCongregationId).maybeSingle(),
    supabase.from('public_posts').select('*', { count: 'exact', head: true }).eq('congregation_id', effectiveCongregationId).eq('status', 'published'),
    supabase.from('munkanaplo').select('idopont, jellege, cim, created_at').eq('congregation_id', effectiveCongregationId)
      .order('created_at', { ascending: false }).limit(10),
    // Januári banner-hez (2026-04-21k): van-e aktuális évi díj?
    supabase.from('congregations').select('eves_jarulek').eq('id', effectiveCongregationId).maybeSingle(),
    supabase.from('congregation_annual_fees').select('year').eq('congregation_id', effectiveCongregationId).eq('year', curYear).maybeSingle(),
  ])

  const deferSetupForWalkthrough = !(
    walkthroughResult.data as { walkthrough_completed?: boolean | null } | null
  )?.walkthrough_completed

  // ── Shared adatobjektum ───────────────────────────────────
  const allMembers: Member[] = (szemResult.data || []) as Member[]
  const elkoltozottIds = new Set((elkoltozottResult.data || []).map((e: { id_szemely: string }) => e.id_szemely))
  const activeMembers = allMembers.filter(m => !elkoltozottIds.has(m.id))
  // 2026-04-19 JAVÍTÁS: csak az AKTÍV tagok alapján szűrjük a családokat
  // (elköltözötteket + meghaltakat kizárjuk). Így a „rendezve" családszám
  // a ténylegesen gyülekezethez tartozó családokat tükrözi.
  const activeMemberIds = new Set(activeMembers.map(member => Number(member.id)))
  // 2026-06-01 (hibrid család-modell): a háztartást aktívnak vesszük, ha
  // legalább egy családfő/házastárs aktív tagja a gyülekezetnek.
  const familyCount = ((csaladResult.data || []) as Array<{
    id: string; isaktiv: boolean;
    tagok: Array<{ id_szemely: number; szerep: string }> | null;
  }>).filter(h => {
    const tagok = h.tagok || []
    return tagok.some(t =>
      (t.szerep === 'csaladfo' || t.szerep === 'hazastars') &&
      activeMemberIds.has(t.id_szemely)
    )
  }).length
  // 2026-06-30: a presbiter-lekérdezés már gyülekezetre szűrt (szemely!inner:
  // csak ennek a gyülekezetnek az ÉLŐ tagjai), így a sorok száma = a
  // presbiterek száma — nincs szükség kliens-oldali szűrésre.
  const presbCount = (presbResult.data || []).length

  const allBefizetes = (befizetesResult.data || []) as { osszeg: number; datum: string }[]
  const allKiadas = (kiadasResult.data || []) as { osszeg: number; datum: string }[]
  const allNevnapok = (nevnapResult.data || []) as NamedayRow[]

  // ── KPI számítások ────────────────────────────────────────
  const monthStart = `${curYear}-${String(curMonth).padStart(2, '0')}-01`
  const yearStart = `${curYear}-01-01`
  const monthlyIncome = allBefizetes
    .filter(r => r.datum >= monthStart)
    .reduce((s, r) => s + (Number(r.osszeg) || 0), 0)

  const monthlyExpense = allKiadas
    .filter(r => r.datum >= monthStart)
    .reduce((s, r) => s + (Number(r.osszeg) || 0), 0)

  // Éves bevétel/kiadás — az aktuális évtől (2026-04-21t: havi 0 gyakori,
  // éves sokkal informatívabb; a dashboard kártyán mindkettő látszódjon)
  const yearlyIncome = allBefizetes
    .filter(r => r.datum >= yearStart)
    .reduce((s, r) => s + (Number(r.osszeg) || 0), 0)

  const yearlyExpense = allKiadas
    .filter(r => r.datum >= yearStart)
    .reduce((s, r) => s + (Number(r.osszeg) || 0), 0)

  // ── Születésnap / névnap ──────────────────────────────────
  const mmDd = today.toISOString().slice(5, 10)
  // 2026-08-01 (PR-19): kanonikus név-formázás — a namepattern csak akkor
  // előtag, ha tényleg az; az özv./elv. az allapot-ból jön.
  const todayBirthdays = activeMembers
    .filter(m => m.sz_datum && m.sz_datum.slice(5, 10) === mmDd)
    .map(m => ({
      name: formatNameWithPrefix(m),
      age: ageFromDate(m.sz_datum),
    }))

  const namesRow = allNevnapok.find(
    n => n.honap === String(today.getMonth() + 1) && n.nap === String(today.getDate())
  )
  const todayNamedayNames = namesRow
    ? [namesRow.nev1, namesRow.nev2, namesRow.nev3].filter(Boolean) as string[]
    : []

  const todayNamedayMembers = todayNamedayNames.length > 0
    ? activeMembers
        .filter(m => m.k_nev && todayNamedayNames.includes(m.k_nev))
        .map(m => formatNameWithPrefix(m))
    : []

  // ── Következő 14 nap születésnapok ────────────────────────
  const todayMs = new Date(curYear, today.getMonth(), today.getDate()).getTime()
  const upcomingBirthdays = activeMembers
    .filter(m => m.sz_datum)
    .map(m => {
      const b = new Date(m.sz_datum!)
      let nextBday = new Date(curYear, b.getMonth(), b.getDate())
      if (nextBday.getTime() <= todayMs) nextBday = new Date(curYear + 1, b.getMonth(), b.getDate())
      const diffDays = Math.round((nextBday.getTime() - todayMs) / 86400000)
      if (diffDays <= 0 || diffDays > 14) return null
      return {
        name: formatNameWithPrefix(m),
        age: nextBday.getFullYear() - b.getFullYear(),
        diffDays,
        month: nextBday.getMonth(),
        day: nextBday.getDate(),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a!.diffDays - b!.diffDays) as {
      name: string; age: number; diffDays: number; month: number; day: number
    }[]

  // ── Diagramok adatai ──────────────────────────────────────
  const monthlyData: { month: string; income: number; expense: number }[] = []
  for (let i = 7; i >= 0; i--) {
    const d = new Date(curYear, today.getMonth() - i, 1)
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    const endStr = endDate.toISOString().slice(0, 10)
    const income = allBefizetes.filter(r => r.datum >= start && r.datum <= endStr).reduce((s, r) => s + (Number(r.osszeg) || 0), 0)
    const expense = allKiadas.filter(r => r.datum >= start && r.datum <= endStr).reduce((s, r) => s + (Number(r.osszeg) || 0), 0)
    monthlyData.push({ month: `${HU_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`, income: Math.round(income), expense: Math.round(expense) })
  }

  const ageGroups: Record<string, number> = { '0–17': 0, '18–35': 0, '36–60': 0, '61–80': 0, '80+': 0 }
  // 10-éves bontás kor-piramis + részletes nézethez (2026-04-21u)
  // Minden csoportnak férfi + nő bontása is van — vizuális demográfia
  const AGE_BUCKETS = [
    { key: '0–9', min: 0, max: 9 },
    { key: '10–19', min: 10, max: 19 },
    { key: '20–29', min: 20, max: 29 },
    { key: '30–39', min: 30, max: 39 },
    { key: '40–49', min: 40, max: 49 },
    { key: '50–59', min: 50, max: 59 },
    { key: '60–69', min: 60, max: 69 },
    { key: '70–79', min: 70, max: 79 },
    { key: '80–89', min: 80, max: 89 },
    { key: '90+', min: 90, max: 200 },
  ] as const
  const detailedAgeGroups: Array<{ range: string; male: number; female: number; total: number }> =
    AGE_BUCKETS.map((b) => ({ range: b.key, male: 0, female: 0, total: 0 }))
  const ageList: number[] = []
  activeMembers.forEach(m => {
    const age = ageFromDate(m.sz_datum)
    if (age === null) return
    ageList.push(age)
    if (age < 18) ageGroups['0–17']++
    else if (age < 36) ageGroups['18–35']++
    else if (age < 61) ageGroups['36–60']++
    else if (age < 81) ageGroups['61–80']++
    else ageGroups['80+']++
    // Részletes (10-éves) bucket
    const bucketIdx = AGE_BUCKETS.findIndex((b) => age >= b.min && age <= b.max)
    if (bucketIdx >= 0) {
      const bucket = detailedAgeGroups[bucketIdx]
      bucket.total++
      if (m.ferfi === true) bucket.male++
      else if (m.ferfi === false) bucket.female++
    }
  })

  // Statisztikák a kor-eloszláshoz: legfiatalabb, legidősebb, átlag, medián (2026-04-21u)
  const ageStats = ageList.length > 0
    ? {
        youngest: Math.min(...ageList),
        oldest: Math.max(...ageList),
        average: Math.round(ageList.reduce((s, n) => s + n, 0) / ageList.length),
        median: (() => {
          const sorted = [...ageList].sort((a, b) => a - b)
          const mid = Math.floor(sorted.length / 2)
          return sorted.length % 2 === 0
            ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
            : sorted[mid]
        })(),
        count: ageList.length,
      }
    : { youngest: 0, oldest: 0, average: 0, median: 0, count: 0 }

  // ── Alsó statisztikák ─────────────────────────────────────
  let men = 0, women = 0, children = 0, ageSum = 0, ageCount = 0
  activeMembers.forEach(m => {
    const age = ageFromDate(m.sz_datum)
    if (age !== null) { ageSum += age; ageCount++ }
    if (age !== null && age < 18) children++
    else if (m.ferfi === true) men++
    else women++
  })
  const avgAge = ageCount > 0 ? Math.round(ageSum / ageCount) : 0
  const balance = allBefizetes.reduce((s, r) => s + (Number(r.osszeg) || 0), 0)
    - allKiadas.reduce((s, r) => s + (Number(r.osszeg) || 0), 0)

  // ── Januári banner adatok (2026-04-21k) ───────────────────
  const congregationYearAmount = (congregationFeeResult.data?.eves_jarulek as number | null) ?? null
  const hasAnnualFeeCurrentYear = !!annualFeeCurrentYearResult.data

  // ── Profil adatok a Hero Banner-hez ───────────────────────
  return (
    <div className="space-y-4 md:space-y-5">
      {/* Januári figyelmeztetés — ha az aktuális év díja nincs beállítva */}
      <CurrentYearFeeBanner
        currentYearAmount={congregationYearAmount}
        hasAnnualFeeRow={hasAnnualFeeCurrentYear}
      />

      <HeroBannerScriptureV2
        fullName={fullName || ''}
        congregationName={congregationName || ''}
        todayNamedays={todayNamedayNames}
      />

      <KpiCards
        activeMemberCount={activeMembers.length}
        familyCount={familyCount}
        monthlyIncome={monthlyIncome}
        monthlyExpense={monthlyExpense}
        yearlyIncome={yearlyIncome}
        yearlyExpense={yearlyExpense}
        currentYear={curYear}
        publicSiteStatus={publicSiteResult.data ? { isPublished: !!publicSiteResult.data.is_published, postCount: publicPostsResult.count ?? 0 } : null}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.08fr_1fr_0.94fr]">
        <Celebrations
          todayBirthdays={todayBirthdays}
          todayNamedayMembers={todayNamedayMembers}
          todayNamedayNames={todayNamedayNames}
          upcomingBirthdays={upcomingBirthdays}
          allMembers={activeMembers}
          congregationName={congregationName || 'Gyülekezet'}
          congregationLogo={congregationLogo}
        />

        <ProgramScheduler
          initialYear={curYear}
          congregationName={congregationName || ''}
          congregationLogo={congregationLogo}
        />

        <AgeDistributionCard
          ageGroups={ageGroups}
          detailedAgeGroups={detailedAgeGroups}
          stats={ageStats}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <FinanceOverviewChart monthlyData={monthlyData} />
        <RecentActivity activities={(recentResult.data || []) as ActivityRow[]} />
      </div>

      <BottomStats
        men={men}
        women={women}
        childrenCount={children}
        avgAge={avgAge}
        payersCount={payersResult.count ?? 0}
        presbCount={presbCount}
        balance={balance}
      />

      {/* Auto-open setup wizard, ha a gyülekezeti alapadatok hiányosak */}
      <CongregationSetupAutoOpen
        congregationId={setupStatus.congregationId}
        needsSetup={setupStatus.needsSetup}
        deferForWalkthrough={deferSetupForWalkthrough}
      />
    </div>
  )
}
