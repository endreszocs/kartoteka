import { selectAllPaged } from '@kartoteka/supabase-client'
// 2026-08-11 (6. kör): a „Pénzkészlet" csempe a KANONIKUS nyitó-feloldásra
// épül — ugyanarra, amiből a Pénzügy modul carryoverCash/carryoverBank értéke
// származik. Nincs külön irányítópult-változat.
//
// MÉLY import, NEM a `@kartoteka/core` barrel: az a bank-import indexén át
// statikusan behúzná az `xlsx` csomagot erre a legtöbbet látogatott útvonalra.
// A `resolve-nyito.ts`-nek csak `import type` függősége van, tehát ez a
// bekötés semmit nem visz magával.
import { resolveNyitoEgyenlegekUseCase } from '@kartoteka/core/src/finance/bank-import/resolve-nyito'
import { ageFromDate } from '@/lib/utils/date'
import { HU_MONTHS_SHORT } from '@/lib/constants/dashboard'
import { HeroBannerScriptureV2 } from '@/components/dashboard/hero-banner-scripture-v2'
import { KpiCards } from '@/components/dashboard/kpi-cards'
import { Celebrations } from '@/components/dashboard/celebrations'
import { CurrentYearFeeBanner } from '@/components/dashboard/current-year-fee-banner'
// 2026-08-11 (5. kör, P2-#21): a két recharts-panel LAZY töltődik — a ~381 KB-os
// charting-köteg többé nem blokkolja az irányítópult első megjelenítését.
import { AgeDistributionCardLazy, FinanceOverviewChartLazy } from '@/components/dashboard/chart-panels-lazy'
import { ProgramScheduler } from '@/components/dashboard/program-scheduler'
import { RecentActivity } from '@/components/dashboard/recent-activity'
import { BottomStats } from '@/components/dashboard/bottom-stats'
// 2026-08-11: lejárat-radar — sírhely-bérletek és bérleti szerződések, amiket
// a rendszer eddig TÁROLT, de soha nem számolt ki („hamarosan lejár").
import { ExpiryRadarCard } from '@/components/dashboard/expiry-radar-card'
import { getExpiryRadar } from '@/lib/dashboard/expiry-radar'
// 2026-08-11 (6. kör): az alsó „Egyenleg" csempe 24 havi nettó FORGALMAT
// mutatott nyitó egyenleg nélkül. A levezetés a közös adapterbe került.
import {
  deriveCongregationBalance,
  type BalanceLedgerRow,
} from '@/lib/dashboard/congregation-balance'
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

/**
 * Egy befizetés/kiadás sor abban a MINIMÁLIS alakban, amit ez az oldal használ
 * (2026-08-11, 6. kör). Szerkezetileg megfelel a `BalanceLedgerRow`-nak
 * (= `@kartoteka/core` `PeriodRow`), ezért a kanonikus egyenleg-levezetésbe
 * kasztolás nélkül átadható.
 *
 * FIGYELEM a `datum` típusára: a `befizetes.datum` DATE ('2026-08-11'), a
 * `kiadas.datum` viszont TIMESTAMP ('2026-08-11T00:00:00'). Ezért ezen az
 * oldalon dátumot NYERSEN összehasonlítani TILOS — mindig a napra vágott
 * (`.slice(0, 10)`) alakkal dolgozunk. A régi kód emiatt ejtette ki a hónap
 * UTOLSÓ napján kelt kiadásokat a grafikonból (`r.datum <= '2026-08-31'`
 * hamis a '2026-08-31T00:00:00' értékre).
 */
interface LedgerRow extends BalanceLedgerRow {
  id: number
  belso_mozgas_xkey: string | null
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
  // 2026-08-11 (6. kör): a mai nap HELYI idő szerint. A `toISOString()` UTC-re
  // vált, ami a román (UTC+2/+3) időzónában a nap első óráiban EGY NAPPAL
  // korábbi dátumot ad — a pénzkészlet így hajnalban „visszaugrana".
  const todayIso = `${curYear}-${String(curMonth).padStart(2, '0')}-${String(curDay).padStart(2, '0')}`

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
    expiryRadarResult,
    nyitoResult,
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
    // 2026-08-11 (5. kör, P3 #15): a kézzel írt ciklus helyett a KÖZÖS
    // `selectAllPaged`. A régi `page.length < PAGE` stop-feltétel HIBÁS volt:
    // leszállított szerver-plafonnál (Max Rows < 1000) az ELSŐ lap után kilépett,
    // és a taglista némán a felét mutatta. A rendezést (`id` ASC) és a lapok
    // közti dedupot a helper adja.
    selectAllPaged<Member>(
      supabase
        .from('szemely')
        .select('id, csaladnev, k_nev, namepattern, allapot, sz_datum, ferfi')
        .eq('congregation_id', effectiveCongregationId)
        .eq('meghalt', false),
    ),
    // A rendezés az EGYEDI id oszlopon — a nem egyedi id_szemely szerinti
    // lapozás lapfordulónál sort veszthetett (2026-08-02 review-fix).
    selectAllPaged<{ id_szemely: string }>(
      supabase
        .from('elkoltozott')
        .select('id, id_szemely')
        .eq('congregation_id', effectiveCongregationId),
    ),
    // 2026-06-01 (hibrid család-modell Fázis 2): az ÚJ `haztartas` táblát
    // olvassuk — congregation_id direkt szűr, és a tagság aktív tagjai a
    // `haztartas_tag`-ban élnek (csaladfo/hazastars szerepekkel).
    supabase.from('haztartas')
      .select('id, isaktiv, tagok:haztartas_tag(id_szemely, szerep)')
      .eq('congregation_id', effectiveCongregationId)
      .eq('isaktiv', true)
      .is('ervenyes_ig', null),
    // deleted/stornozott törölt tételek kizárva — 2026-04-21t
    // 2026-08-11 (K5-#30): LAPOZOTT lekérés. A `szemely`/`elkoltozott` ág már
    // lapozott volt, ez a kettő viszont nem: 2 év adata, `.range()` és `.limit()`
    // nélkül, ezért a PostgREST 1000-es plafonja némán levágta. Évi ~470 tételnél
    // a 24 hónapos ablak ~940 sor — egy közepes gyülekezet már idén átlépi, és
    // onnantól a Havi/Éves bevétel-kiadás KPI és a pénzügyi grafikon TÚL ALACSONY
    // számot mutatott, hibaüzenet nélkül. Rendezés (`id` ASC) nélkül ráadásul az
    // sem volt determinisztikus, MELYIK hónapok esnek ki.
    // 2026-08-11 (6. kör): a lekérdezés SZÉLESEBB lett, de EGY maradt. Az alsó
    // „Pénzkészlet" csempéhez nem új ledger-letöltés kell — az idei év sorai
    // amúgy is részhalmaza ennek a 24 hónapos ablaknak —, csak az a négy
    // oszlop, ami nélkül eddig HIBÁS volt minden itteni pénzügyi szám:
    //   · `osszeg_ron` — a könyvelés RON-ban folyik; a nyers `osszeg` egy
    //     1000 EUR-s banki tételt 1000 lejnek látott;
    //   · `bankszamla_id` — enélkül nincs kassza/bank bontás (NULL = kassza;
    //     SOHA nem az `irattipus` szövegmező alapján);
    //   · `belso_mozgas_xkey` — a kassza→bank letét NEM bevétel és NEM kiadás,
    //     csak átvezetés (lásd a FOLYAM-nézetet lentebb);
    //   · `id` — enélkül a `selectAllPaged` lapok közti DEDUPJA kimarad (a
    //     helper a kulcs-oszlop hiányában csendben átugorja), így egy lapfordulón
    //     kétszer visszaadott sor duplán számított volna.
    selectAllPaged<LedgerRow>(
      supabase
        .from('befizetes')
        .select('id, osszeg, osszeg_ron, datum, bankszamla_id, belso_mozgas_xkey')
        .eq('congregation_id', effectiveCongregationId)
        .eq('deleted', false)
        .eq('stornozott', false)
        .gte('datum', chartStartDate),
    ),
    // 2026-08-11 (6. kör): a `.eq('stornozott', false)` a KIADÁS ágról hiányzott,
    // pedig a bevétel ágon ott volt. Egy ÉRVÉNYTELENÍTETT kiadás így csökkentette
    // az irányítópult kiadás-KPI-ját és egyenlegét, miközben a Pénzügy modulból,
    // a Számadásból és a Registru-ból ki van zárva — két hivatalos szám ugyanarra
    // az évre, egymásnak ellentmondva.
    selectAllPaged<LedgerRow>(
      supabase
        .from('kiadas')
        .select('id, osszeg, osszeg_ron, datum, bankszamla_id, belso_mozgas_xkey')
        .eq('congregation_id', effectiveCongregationId)
        .eq('deleted', false)
        .eq('stornozott', false)
        .gte('datum', chartStartDate),
    ),
    // 2026-06-30 (perf): csak a sorszám kell (head:true) — korábban az összes
    // id_szemely-t lehúzta pusztán a .length-hez.
    supabase.from('befizetes').select('*', { count: 'exact', head: true }).eq('congregation_id', effectiveCongregationId).eq('fizetettev', curYear),
    // 2026-06-30 (perf + scope): gyülekezetre szűrt presbiterek a bevált
    // szemely!inner join-mintával (korábban az EGÉSZ presbiter táblát lehúzta).
    // 2026-08-26 (5. kör): a mandátum-oszlopokkal — a csempe csak az AKTÍV
    // presbitereket számolja; migráció előtt a régi mezőkészlettel esik vissza.
    (async () => {
      const res = await supabase.from('presbiter').select('id, kezdete, vege, szemely:szemely!inner(congregation_id, meghalt)').eq('szemely.congregation_id', effectiveCongregationId).eq('szemely.meghalt', false)
      if (res.error && /kezdete|vege/.test(res.error.message || '')) {
        return supabase.from('presbiter').select('id, szemely:szemely!inner(congregation_id, meghalt)').eq('szemely.congregation_id', effectiveCongregationId).eq('szemely.meghalt', false)
      }
      return res
    })(),
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
    // 2026-08-11: lejárat-radar. A hibát a függvény MAGA fogja el és
    // hibaüzenetként adja vissza — ha kibukna, a Promise.all az egész
    // irányítópultot ledöntené egy másodlagos doboz miatt. A kártya a hibát
    // LÁTHATÓAN mutatja, tehát nem néma degradáció.
    getExpiryRadar(),
    // 2026-08-11 (6. kör): az idei NYITÓ egyenleg feloldása (kassza +
    // számlánként a bank). Ez a hiányzó tétel a bejelentett hibában — nélküle
    // a csempe pusztán forgalmat mutatott.
    //
    // TELJESÍTMÉNY: ugyanebbe az EGY párhuzamos hullámba kerül, tehát nem
    // mélyíti a körutak számát. A tipikus esetben (van az idei évre rögzített
    // vagy carryover nyitó-sor) három APRÓ, indexelt lekérdezés az egész
    // (`bankszamlak`, `keszpenz_nyito_egyenleg`, `bankszamla_nyito_egyenleg`),
    // és a use-case ilyenkor EGYETLEN forgalmi sort sem tölt le. Csak akkor
    // olvas korábbi évek forgalmát, ha az idei nyitó nincs rögzítve — ott a
    // láncolás az ára a helyes számnak. A use-case a hibát MAGA fogja el
    // (`success: false`), így a Promise.all-t nem döntheti le.
    resolveNyitoEgyenlegekUseCase(
      { congregationId: effectiveCongregationId, eve: curYear },
      { supabase, runtime: 'web' },
    ),
  ])

  const deferSetupForWalkthrough = !(
    walkthroughResult.data as { walkthrough_completed?: boolean | null } | null
  )?.walkthrough_completed

  // ── Shared adatobjektum ───────────────────────────────────
  // 2026-08-02 (PR-19 review-fix): a lapozott lekérés RÉSZLEGES hibája nem
  // mehet át némán — az N×1000 tagnál elvágott lista hihető KPI-kat mutatna.
  // Hibánál inkább a Next hibahatárra dobunk (újratöltéssel helyreáll).
  if (szemResult.error || elkoltozottResult.error) {
    throw new Error('A tagsági adatok betöltése nem sikerült — töltsd újra az oldalt.')
  }
  // 2026-08-11 (K5-#30): ugyanez a szabály a pénzügyi soroknál — egy részlegesen
  // betöltött (vagy hibára futott) lekérésből számolt bevétel/kiadás KPI hihető,
  // de HAMIS számot mutatna a lelkésznek. Inkább hangos hiba.
  if (befizetesResult.error || kiadasResult.error) {
    throw new Error('A pénzügyi adatok betöltése nem sikerült — töltsd újra az oldalt.')
  }
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
  // csak ennek a gyülekezetnek az ÉLŐ tagjai). 2026-08-26 (5. kör): a lezárt
  // mandátumú (régi ciklusbeli) sorok NEM számítanak — a csempe az aktív
  // presbitériumot mutatja.
  const presbMa = new Date().toISOString().slice(0, 10)
  const presbCount = ((presbResult.data || []) as Array<{ kezdete?: string | null; vege?: string | null }>)
    .filter(p => (!p.kezdete || p.kezdete <= presbMa) && (!p.vege || p.vege >= presbMa)).length

  const allBefizetes = (befizetesResult.data || []) as LedgerRow[]
  const allKiadas = (kiadasResult.data || []) as LedgerRow[]
  const allNevnapok = (nevnapResult.data || []) as NamedayRow[]

  // ── A KÉT SZABÁLY, AMIT SOHA NEM SZABAD ÖSSZEKEVERNI ──────
  // (2026-08-11, 6. kör — a `period-balances.ts` doktrínája, szó szerint
  //  ugyanaz a megkülönböztetés, csak az irányítópultra alkalmazva.)
  //
  //  · FOLYAM-szabály (bevétel / kiadás KPI + grafikon): a BELSŐ MOZGÁS KINT
  //    van. Egy 50 000 lejes kassza→bank letét egy kiadás- ÉS egy bevétel-sort
  //    hoz létre; ha bent hagynánk, az irányítópult 50 000 lejjel több
  //    bevételt ÉS kiadást mutatna, mint a Pénzügy modul és a Számadás
  //    ugyanarra az évre. Ez ITT eddig pontosan így is volt.
  //  · EGYENLEG-szabály (Pénzkészlet csempe): a belső mozgás BENNE VAN — a
  //    letét valóban csökkenti a kasszát és növeli a bankot. Ezt a
  //    `computePeriodBalances` intézi, lásd lentebb.
  //
  // Az összeg MINDIG a RON-ekvivalens (`osszeg_ron ?? osszeg`), a dátum MINDIG
  // napra vágva (a `kiadas.datum` TIMESTAMP, a `befizetes.datum` DATE).
  //
  // MARADÉK (tudatosan, a `scope-financial.ts` már bevált kompromisszuma): a
  // `calculateBalances` a belső mozgást az xkey MELLETT a belső CÉL-KÓD
  // (3xx/4xx, legacy 100.xx) alapján is kizárja. Itt csak az xkey-t nézzük,
  // mert a kód-szűréshez `befizetescel`/`kiadascel` join kellene — két további
  // lekérdezés a legtöbbet látogatott útvonalon. A régi, IMPORTÁLT (xkey
  // nélküli) belső sorok ezért még benne maradhatnak a FOLYAM-számokban.
  interface FlowRow { day: string; ron: number }
  const toFlowRows = (rows: LedgerRow[]): FlowRow[] => {
    const out: FlowRow[] = []
    for (const r of rows) {
      if (r.belso_mozgas_xkey) continue
      const day = (r.datum || '').slice(0, 10)
      if (!day) continue
      out.push({ day, ron: Number(r.osszeg_ron ?? r.osszeg) || 0 })
    }
    return out
  }
  const incomeFlow = toFlowRows(allBefizetes)
  const expenseFlow = toFlowRows(allKiadas)
  /** Összeg a [from, to] NAP-intervallumon (a `to` elhagyva = nyitott vég). */
  const sumFlow = (rows: FlowRow[], from: string, to?: string): number => {
    let sum = 0
    for (const r of rows) {
      if (r.day < from) continue
      if (to !== undefined && r.day > to) continue
      sum += r.ron
    }
    return sum
  }

  // ── KPI számítások ────────────────────────────────────────
  const monthStart = `${curYear}-${String(curMonth).padStart(2, '0')}-01`
  const yearStart = `${curYear}-01-01`
  const monthlyIncome = sumFlow(incomeFlow, monthStart)
  const monthlyExpense = sumFlow(expenseFlow, monthStart)

  // Éves bevétel/kiadás — az aktuális évtől (2026-04-21t: havi 0 gyakori,
  // éves sokkal informatívabb; a dashboard kártyán mindkettő látszódjon)
  const yearlyIncome = sumFlow(incomeFlow, yearStart)
  const yearlyExpense = sumFlow(expenseFlow, yearStart)

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
    // 2026-08-11 (6. kör): a hónap utolsó napja HELYI idő szerint. A korábbi
    // `endDate.toISOString().slice(0, 10)` UTC-re váltott, ami a román
    // (UTC+2/+3) időzónában eggyel korábbi napot adott — a hónap UTOLSÓ napján
    // kelt tételek kiestek a grafikonból. (A `.datum <= endStr` nyers
    // összehasonlítás a TIMESTAMP típusú `kiadas.datum`-on ugyanezt a napot
    // még egyszer kiejtette; a `sumFlow` már napra vágott értékkel dolgozik.)
    const endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
    const income = sumFlow(incomeFlow, start, endStr)
    const expense = sumFlow(expenseFlow, start, endStr)
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

  // ── Pénzkészlet (2026-08-11, 6. kör) ──────────────────────
  // ELŐTTE (a bejelentett hiba):
  //     const balance = Σ allBefizetes.osszeg − Σ allKiadas.osszeg
  // vagyis a 24 hónapos GRAFIKON-ablak nettó forgalma, „Egyenleg" felirattal,
  // nyitó egyenleg nélkül, RON-átváltás nélkül, a stornózott kiadásokkal
  // együtt. A lelkész −25 665,24 RON-t látott ott, ahol pénzkészletet várt.
  //
  // MOST: a kanonikus `computePeriodBalances` (részszámadás-mag) vezeti le a
  // MAI pénzkészletet az idei nyitóból, ugyanazokból a sorokból — MÁSODIK
  // ledger-letöltés nélkül. Az évet megelőző sorok automatikusan kiesnek,
  // mert a `periodFrom` az év első napja (lásd az adapter fejlécét).
  const balance = deriveCongregationBalance({
    nyito: nyitoResult,
    income: allBefizetes,
    expense: allKiadas,
    year: curYear,
    asOf: todayIso,
  })

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

      {/* 2026-08-10 (user-kérés): a három csempe („Ma köszöntjük", „Gyülekezeti
          programok", „Koreloszlás") EGY MÉRETŰ sort alkot. A `.kt-dash-trio`
          rács `align-items: stretch` + közös minimum sormagasság, a csempék
          `h-full` + flex-oszlop felépítésűek, és egyikben SINCS belső görgetés
          (a túlcsordulást „+N további" gombok kezelik). Mobilon egymás alá
          rendeződnek, változatlan szabályokkal. */}
      <div className="kt-dash-trio">
        {/* 2026-08-11 (5. kör, P2-#18): a TELJES aktív taglista már NEM kerül bele
            az oldal RSC-csomagjába. 2500 tagnál ez ~325 KB volt MINDEN
            irányítópult-megnyitáskor — egy modálhoz, amit a lelkész többnyire ki
            sem nyit. Csak a darabszám megy át (ettől látszik a „Lista" és a
            „+N további" gomb); a lista a modál első megnyitásakor töltődik. */}
        <Celebrations
          todayBirthdays={todayBirthdays}
          todayNamedayMembers={todayNamedayMembers}
          todayNamedayNames={todayNamedayNames}
          upcomingBirthdays={upcomingBirthdays}
          memberCount={activeMembers.length}
          congregationName={congregationName || 'Gyülekezet'}
          congregationLogo={congregationLogo}
        />

        <ProgramScheduler
          initialYear={curYear}
          congregationName={congregationName || ''}
          congregationLogo={congregationLogo}
        />

        <AgeDistributionCardLazy
          ageGroups={ageGroups}
          detailedAgeGroups={detailedAgeGroups}
          stats={ageStats}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <FinanceOverviewChartLazy monthlyData={monthlyData} />
        <RecentActivity activities={(recentResult.data || []) as ActivityRow[]} />
      </div>

      {/* 2026-08-11: Lejárat-figyelő — egy lejáró sírhely-bérlet egyszerre
          bevétel (megújítás) és pasztorális alkalom; egy lejáró bérleti
          szerződés jogi kockázat. Eddig mindkettő papíron/fejből élt. */}
      <ExpiryRadarCard result={expiryRadarResult} />

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
