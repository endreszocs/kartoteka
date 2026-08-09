'use server'

/**
 * Prezentáció Studio — adatgyűjtő action.
 *
 * A lelkész év végi beszámolójához összeállítja az adatokat:
 *   - Gyülekezet összetétele (tagszám, családok, férfi/nő, kor-eloszlás)
 *   - Tagság változása (3-5 év)
 *   - Anyakönyvi adatok (keresztelő, konfirmáció, esketés, temetés)
 *   - Istentiszteleti / katekétikai jelenlét, úrvacsorázók (munkanapló)
 *   - Pénzügyi adatok (bevétel, kiadás, kategóriák, egyházfenntartás)
 *   - Leltár (egyházi vagyon pillanatkép)
 *   - Programok száma / teljesülés
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { categorizeWorklogEntry } from '@/lib/constants/worklog'
import type { GoalRow } from './goals-actions'


/**
 * 2026-07-25 (F6.3): LAPOZOTT lekérés — a többéves összesítők (5 év × több száz
 * tétel) rég túlnőttek a szerver implicit sor-plafonján, ami NÉMÁN levágta a
 * bevétel/kiadás összegeket az éves jelentésben. Csak az ÜRES lap a biztos stop.
 */
async function fetchAllPagedRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  pageSize = 1000,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ data: any[]; error: { message: string } | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; ) {
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) return { data: out, error }
    const page = data ?? []
    out.push(...page)
    if (page.length === 0) break
    from += page.length
  }
  return { data: out, error: null }
}

// 2026-08-10 (P1 #11 JAVÍTÁS): eddig CSAK a befizetés/kiadás volt lapozva — a
// szemely, haztartas, munkanaplo, a 4+4 anyakönyv- és a 4 mozgás-lekérdezés
// NEM. Egy 1400 fős gyülekezet így „1000 fő" lélekszámot jelentett, az 5 éves
// munkanapló pedig a legrégebbi éveket NÉMÁN 0-ra vágta. Mostantól minden
// többsoros lekérdezés ezen a helperen megy át.

/** 2026-08-10: a nem aktív tagsági állapotok — a hivatalos éves jelentéssel
 *  azonos lista (lib/annual-report/generator.ts). */
const INACTIVE_MEMBER_STATUSES = ['elhunyt', 'elköltözött', 'elkoltozott', 'kitért', 'kitert', 'törölt', 'torolt']

export interface PresentationData {
  year: number
  /** Igaz, ha a jelentés éve az aktuális naptári év (a „jelenlegi" szó
   *  használható); múltbeli évnél a pillanatkép-jellegű mezőket jelölni kell. */
  isCurrentYear: boolean
  congregation: {
    id: string
    name: string
    cimer_url: string | null
  }
  members: {
    /** A nyilvántartás MAI aktív létszáma (látható, élő, el nem költözött). */
    totalActive: number
    /** A jelentés ÉVÉRE visszaszámolt lélekszám (a mozgás-eseményekből). */
    totalAtYear: number
    families: number
    male: number
    female: number
    /** Kor-eloszlás a JELENTÉS ÉVÉNEK végére számolva (nem a mai dátumra). */
    ageGroups: { label: string; count: number }[]
    /** Felnőtt (18+) tagok a jelentés évének végén. */
    adults: number
    /** Évenkénti lélekszám — a tagság-mozgás esemény-tábláiból visszamenőleg
     *  rekonstruálva (becsült, ha hiányos az esemény-történet). */
    yearOverYear: { year: number; count: number }[]
    /** A yearOverYear becslés-e (hiányos esemény-történet esetén). */
    estimated: boolean
    /** Természetes + vándorlási változás évenként (megmaradás pillére). */
    flowByYear: {
      year: number
      births: number
      deaths: number
      movedIn: number
      movedOut: number
      natural: number // births - deaths
      net: number // összes változás (be - ki)
    }[]
  }
  anyakonyv: {
    keresztelo: number
    konfirmacio: number
    esketes: number
    temetes: number
    byYear: {
      year: number
      keresztelo: number
      konfirmacio: number
      esketes: number
      temetes: number
    }[]
    // Név-listák az adott évre (a SZÁMADÁS PDF mintájára, 2026-04-21r)
    nameLists: {
      keresztelesek: Array<{ name: string; date: string; isMale: boolean | null }>
      konfirmaciok: Array<{ name: string; date: string; isMale: boolean | null }>
      esketesek: Array<{ ferfiName: string; noName: string; date: string }>
      temetesek: Array<{ name: string; temetesDate: string; halalDate: string | null; isMale: boolean | null; ageAtDeath: number | null }>
    }
  }
  /** Istentisztelet-számok — 2026-08-10 óta a MUNKANAPLÓBÓL (a korábbi forrás,
   *  a `gyulekezeti_programok` widget-tábla, a gyülekezetek töredékénél van
   *  csak kitöltve, ezért „0 istentisztelet" jelent meg a vetítőn). */
  worship: {
    totalServices: number
    /** Alkalom-szám jelleg szerint (munkanapló `jellege`). */
    byType: Record<string, number>
  }
  /** Istentiszteleti / katekétikai látogatottság a MUNKANAPLÓ valós jelenléti
   *  adataiból (Pillér 2 — lelki élet). */
  attendance: {
    hasData: boolean
    /** Istentiszteleti alkalmak (szolgálat kategória, kazuáliák nélkül). */
    worshipOccasions: number
    worshipTotal: number
    worshipAvg: number
    /** Katekétikai alkalmak (vallásóra, ifjúsági, gyermek, kátéóra…). */
    catechesisOccasions: number
    catechesisTotal: number
    /** Pásztori látogatások (család-, beteg-, kórházlátogatás). */
    visitOccasions: number
    /** Gyermek-jelenlét összesen (ifjúság/gyerekmunka mérőszáma). */
    childrenTotal: number
    /** Perselypénz összesen a munkanaplóból. */
    persely: number
    /** Úrvacsorával élők — templomban / betegnél / összesen. */
    uvTemplomban: number
    uvBetegnel: number
    uvTotal: number
    /** Van-e egyáltalán rögzített úrvacsora-adat (a 0 és a „nem vezetik" közti
     *  különbség — enélkül hamis következtetés születne). */
    hasUvData: boolean
    /** Bontás alkalom-jelleg szerint (istentisztelet, vallásóra, ifjúsági óra,
     *  gyermek foglalkozás, nőszövetségi bibliaóra…). */
    byType: { jellege: string; occasions: number; total: number; avg: number }[]
    /** 5 éves trend — látogatottság, gyermek-jelenlét, úrvacsora, persely. */
    byYear: {
      year: number
      worshipAvg: number
      worshipTotal: number
      worshipOccasions: number
      catechesisOccasions: number
      childrenTotal: number
      uvTotal: number
      persely: number
    }[]
  }
  finance: {
    totalIncome: number
    totalExpense: number
    surplus: number
    byYear: { year: number; income: number; expense: number }[]
    incomeByCategory: { name: string; amount: number }[]
    expenseByCategory: { name: string; amount: number }[]
    /** Adományjellegű bevétel összege és aránya (adomány, persely, céladomány, gyűjtés). */
    donationTotal: number
    donationRatio: number // 0..100
    /** Adomány-arány évenként (a már betöltött 5 éves befizetés-ablakból). */
    donationByYear: { year: number; donation: number; income: number; ratio: number }[]
    egyhazfenntartas: {
      activeMembers: number
      /** Felnőtt (18+) aktív tagok — az egyházfenntartás reálisabb nevezője. */
      activeAdults: number
      paidMembers: number
      /** 0..100-ra vágott arány (a megjelenítéshez). */
      paymentRate: number
      /** A nyers, vágatlan arány — 100 fölött adat-egyeztetési jelzés. */
      paymentRateRaw: number
      /** Fizetők száma évenként (kötelezettségi év szerint). */
      paidByYear: { year: number; paidMembers: number }[]
    }
  }
  /** Leltár / egyházi vagyon — pillanatkép (a táblának nincs év-dimenziója). */
  leltar: {
    hasData: boolean
    itemCount: number
    totalValue: number
    /** Hány tételnél hiányzik a beszerzési érték (adatminőség-jelzés). */
    missingValueCount: number
    byCategory: { name: string; count: number; value: number }[]
  }
  programs: {
    total: number
    completed: number
    completionRate: number
    byType: { type: string; count: number }[]
    byYear: { year: number; total: number; completed: number }[]
  }
  /** Jövőbeli célok (gyulekezeti_celok tábla) — üres, ha a tábla még nincs. */
  goals: GoalRow[]
}

export async function getPresentationData(year: number): Promise<{
  data: PresentationData | null
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.effectiveCongregationId) {
    return { data: null, error: 'Nincs bejelentkezett felhasználó vagy aktív gyülekezet.' }
  }

  const { supabase, effectiveCongregationId } = access

  // Gyülekezet adatai
  const { data: cong } = await supabase
    .from('congregations')
    .select('id, name, nev_hu, cimer_url')
    .eq('id', effectiveCongregationId)
    .maybeSingle()

  if (!cong) return { data: null, error: 'Gyülekezet nem található.' }

  // 5 év visszamenőleg (a diagramok ablaka)
  const years = Array.from({ length: 5 }, (_, i) => year - 4 + i)

  // 2026-08-10 (P1 #7 JAVÍTÁS): a lélekszám-görbét eddig a MAI létszámhoz
  // horgonyoztuk a KIVÁLASZTOTT év utolsó pontján — 2020-at nézve a 2020-as
  // pont a 2026-os létszámot mutatta. A rekonstrukció horgonya mostantól
  // mindig az AKTUÁLIS naptári év, és a mozgás-eseményeket a mai évig kérjük,
  // hogy vissza tudjunk lépkedni a jelentés évéig.
  const nowYear = new Date().getFullYear()
  const histStart = Math.min(years[0], nowYear)
  const histEnd = Math.max(year, nowYear)
  const histYears = Array.from({ length: histEnd - histStart + 1 }, (_, i) => histStart + i)

  // Dátumtartomány az adott évre (a keresztseg stb. táblákhoz)
  // 2026-08-10 (P2 #21 JAVÍTÁS): a timestamp-oszlopokon a `lte 'YYYY-12-31'`
  // 00:00-ra konvertálódik, így a december 31-i délelőtti temetés/kiadás
  // NÉMÁN kimaradt az évből. Mindenhol félig nyitott intervallum:
  // `>= YYYY-01-01` és `< (YYYY+1)-01-01`.
  const yearStart = `${year}-01-01`
  const nextYearStart = `${year + 1}-01-01`
  const trendStart = `${histStart}-01-01`
  const trendEndExclusive = `${histEnd + 1}-01-01`

  // ─── Párhuzamos lekérdezések ───
  // 2026-04-21t diagnózis: az `anyakonyv` tábla NEM LÉTEZIK a DB-ben —
  // eltávolítva, a trend-adatokat 5 évre lekérdezzük a valódi táblákból
  // (keresztseg, konfirmalas, hazassag, temetes).
  // A `kiadas` korábbi `szamadasicel(name)` join is rossz volt — a helyes:
  // `kiadascel:id_kiadascel(nev)` (kiadás-cél a `kiadascel` táblában).
  const [
    membersResult,
    familiesResult,
    befizetesResult,
    kiadasResult,
    programsResult,
    keresztelesekTrendResult,
    konfirmaciokTrendResult,
    esketesekTrendResult,
    temetesekTrendResult,
    keresztelesekResult,
    konfirmaciokResult,
    esketesekResult,
    temetesekResult,
    munkanaploResult,
    bekoltozottResult,
    attertResult,
    elkoltozottResult,
    kitertResult,
    leltarResult,
    celokResult,
  ] = await Promise.all([
    // 2026-08-10 (P0 #4 JAVÍTÁS): eddig NEM szűrtünk `isvisible`-re és
    // `member_status`-ra — a prezentáció 800 főt vetített, míg az esperesnek
    // küldött hivatalos jelentés 650-et. Most a generator.ts szabálya érvényes.
    fetchAllPagedRows(
      supabase
        .from('szemely')
        .select('id, sz_datum, ferfi, meghalt, member_status')
        .eq('congregation_id', effectiveCongregationId)
        .eq('isvisible', true)
        .order('id', { ascending: true }),
    ),
    // 2026-06-01 (hibrid család-modell Fázis 2): az ÚJ haztartas táblát olvassuk
    fetchAllPagedRows(
      supabase
        .from('haztartas')
        .select('id')
        .eq('congregation_id', effectiveCongregationId)
        .eq('isaktiv', true)
        .is('ervenyes_ig', null)
        .order('id', { ascending: true }),
    ),
    // 2026-07-25 (F6.3, M1): a lekérdezés KÉT szemantikát szolgál ki — a
    // bevétel-összesítők a PÉNZTÁRI NAP (datum), a „fizetett tagok" aránya a
    // KÖTELEZETTSÉGI ÉV (fizetettev) szerint szűrnek. Eddig CSAK datum-ablakkal
    // töltöttünk, így egy 2026 januárjában rendezett 2025-ös hátralék kiesett →
    // a 2025-ös fizetési arány NÉMÁN alulszámolt. Most a KÉT ablak UNIÓJÁT
    // töltjük, és minden aggregáció a saját oszlopával szűr (lásd lent).
    // Lapozva is: 5 év × ~470 tétel bőven a szerver sor-plafonja felett van.
    // 2026-08-10: `osszeg_ron` is kell (deviza-tételek), lásd a P0 #5 leletet.
    fetchAllPagedRows(
      supabase
        .from('befizetes')
        .select('osszeg, osszeg_ron, datum, fizetettev, id_szemely, id_befizetescel, befizetescel(nev)')
        .eq('congregation_id', effectiveCongregationId)
        .eq('deleted', false)
        .eq('stornozott', false)
        .or(
          `and(datum.gte.${years[0]}-01-01,datum.lt.${nextYearStart}),and(fizetettev.gte.${years[0]},fizetettev.lte.${year})`,
        )
        .order('id', { ascending: true }),
    ),
    // 2026-08-10 (P1 #6 JAVÍTÁS): a `stornozott` szűrő HIÁNYZOTT a kiadásról,
    // miközben a bevételen ott volt — a sztornózott és újra kiállított kiadás
    // kétszer számított, fantom-hiányt mutatva a Számadás dián.
    fetchAllPagedRows(
      supabase
        .from('kiadas')
        .select('osszeg, osszeg_ron, datum, kiadascel:id_kiadascel(nev)')
        .eq('congregation_id', effectiveCongregationId)
        .eq('deleted', false)
        .eq('stornozott', false)
        .gte('datum', `${years[0]}-01-01`)
        .lt('datum', nextYearStart)
        .order('id', { ascending: true }),
    ),
    // Programok — 2026-08-10: 5 éves ablak (a következtetésekhez trend kell)
    fetchAllPagedRows(
      supabase
        .from('gyulekezeti_programok')
        .select('datum, tipus, teljesitett')
        .eq('congregation_id', effectiveCongregationId)
        .gte('datum', `${years[0]}-01-01`)
        .lt('datum', nextYearStart)
        .order('id', { ascending: true }),
    ),
    // Kereszteltek trend — a mai évig (a lélekszám-rekonstrukcióhoz is kell)
    fetchAllPagedRows(
      supabase
        .from('keresztseg')
        .select('datum')
        .eq('congregation_id', effectiveCongregationId)
        .gte('datum', trendStart)
        .lt('datum', trendEndExclusive)
        .order('id', { ascending: true }),
    ),
    fetchAllPagedRows(
      supabase
        .from('konfirmalas')
        .select('datum')
        .eq('congregation_id', effectiveCongregationId)
        .gte('datum', trendStart)
        .lt('datum', trendEndExclusive)
        .order('id', { ascending: true }),
    ),
    fetchAllPagedRows(
      supabase
        .from('hazassag')
        .select('datum')
        .eq('congregation_id', effectiveCongregationId)
        .gte('datum', trendStart)
        .lt('datum', trendEndExclusive)
        .order('id', { ascending: true }),
    ),
    fetchAllPagedRows(
      supabase
        .from('temetes')
        .select('tdatum')
        .eq('congregation_id', effectiveCongregationId)
        .gte('tdatum', trendStart)
        .lt('tdatum', trendEndExclusive)
        .order('id', { ascending: true }),
    ),
    // Az adott évi RÉSZLETES adatok (név-listákkal)
    fetchAllPagedRows(
      supabase
        .from('keresztseg')
        .select('datum, szemely:id_szemely(csaladnev, k_nev, namepattern, ferfi, sz_datum)')
        .eq('congregation_id', effectiveCongregationId)
        .gte('datum', yearStart)
        .lt('datum', nextYearStart)
        .order('datum', { ascending: true })
        .order('id', { ascending: true }),
    ),
    // Konfirmáltak
    fetchAllPagedRows(
      supabase
        .from('konfirmalas')
        .select('datum, szemely:id_szemely(csaladnev, k_nev, namepattern, ferfi, sz_datum)')
        .eq('congregation_id', effectiveCongregationId)
        .gte('datum', yearStart)
        .lt('datum', nextYearStart)
        .order('datum', { ascending: true })
        .order('id', { ascending: true }),
    ),
    // Esketések — kétszer join (férfi + nő)
    fetchAllPagedRows(
      supabase
        .from('hazassag')
        .select('datum, ferfi:id_ferfi(csaladnev, k_nev, namepattern), no:id_no(csaladnev, k_nev, namepattern)')
        .eq('congregation_id', effectiveCongregationId)
        .gte('datum', yearStart)
        .lt('datum', nextYearStart)
        .order('datum', { ascending: true })
        .order('id', { ascending: true }),
    ),
    // Temetések — tdatum a tényleges temetés dátuma
    fetchAllPagedRows(
      supabase
        .from('temetes')
        .select('tdatum, hdatum, szemely:id_szemely(csaladnev, k_nev, namepattern, ferfi, sz_datum)')
        .eq('congregation_id', effectiveCongregationId)
        .gte('tdatum', yearStart)
        .lt('tdatum', nextYearStart)
        .order('tdatum', { ascending: true })
        .order('id', { ascending: true }),
    ),
    // ── Munkanapló (valós jelenlét, 5 év) — Pillér 2 látogatottság ──
    // 2026-08-10: `jelenlet_osszesen` (P0 #3) + úrvacsorázók. Az uv_* oszlopok
    // a 2026-07-11-F1 migrációval jöttek — ha egy DB-n még nincs meg, a
    // lekérdezés hibára futna és ELTŰNNE a teljes látogatottság, ezért
    // fallback-kel kérjük (a generator.ts `deleted`-mintája szerint).
    (async () => {
      const build = (withUv: boolean) =>
        supabase
          .from('munkanaplo')
          .select(
            withUv
              ? 'idopont, jellege, kategoria, jelenlet_ferfi, jelenlet_no, jelenlet_gyermek, jelenlet_osszesen, persely, uv_templomban, uv_betegnel'
              : 'idopont, jellege, kategoria, jelenlet_ferfi, jelenlet_no, jelenlet_gyermek, jelenlet_osszesen, persely',
          )
          .eq('congregation_id', effectiveCongregationId)
          .eq('deleted', false)
          .gte('idopont', `${years[0]}-01-01`)
          .lt('idopont', nextYearStart)
          .order('id', { ascending: true })
      const res = await fetchAllPagedRows(build(true))
      if (res.error && /uv_|column/i.test(res.error.message || '')) return fetchAllPagedRows(build(false))
      return res
    })(),
    // ── Tagság-mozgás esemény-táblák — a mai évig (rekonstrukcióhoz) ──
    fetchAllPagedRows(supabase.from('bekoltozott').select('mikor').eq('congregation_id', effectiveCongregationId).gte('mikor', trendStart).lt('mikor', trendEndExclusive).order('id', { ascending: true })),
    fetchAllPagedRows(supabase.from('attert').select('mikor').eq('congregation_id', effectiveCongregationId).gte('mikor', trendStart).lt('mikor', trendEndExclusive).order('id', { ascending: true })),
    fetchAllPagedRows(supabase.from('elkoltozott').select('mikor').eq('congregation_id', effectiveCongregationId).gte('mikor', trendStart).lt('mikor', trendEndExclusive).order('id', { ascending: true })),
    fetchAllPagedRows(supabase.from('kitert').select('mikor').eq('congregation_id', effectiveCongregationId).gte('mikor', trendStart).lt('mikor', trendEndExclusive).order('id', { ascending: true })),
    // ── Leltár (egyházi vagyon) — pillanatkép, nincs év-dimenziója ──
    // 2026-08-10: a prezentációban EDDIG EGYÁLTALÁN NEM volt vagyon-adat,
    // pedig a hivatalos jelentés VIII. szekciója erre épül.
    fetchAllPagedRows(
      supabase
        .from('leltar_tetelek')
        .select('kategoria, beszerzesi_ertek, mennyiseg, is_deleted, torles_datuma')
        .eq('congregation_id', effectiveCongregationId)
        .order('id', { ascending: true }),
    ),
    // Jövőbeli célok (ha a tábla még nincs, error → üres lista)
    supabase.from('gyulekezeti_celok').select('id, piller, metrika, celertek, szoveg').eq('congregation_id', effectiveCongregationId).eq('ev', year),
  ])

  // ─── Tagok ───
  const allMembers = (membersResult.data || []) as Array<{
    id: number
    sz_datum: string | null
    ferfi: boolean | null
    meghalt: boolean | null
    member_status: string | null
  }>
  const activeMembers = allMembers.filter(
    (m) => !m.meghalt && !INACTIVE_MEMBER_STATUSES.includes((m.member_status || '').trim()),
  )
  const male = activeMembers.filter((m) => m.ferfi === true).length
  const female = activeMembers.filter((m) => m.ferfi === false).length

  /** Betöltött életkor egy adott referencia-napra (a születésnapot is figyelembe véve). */
  function ageOn(birthIso: string | null | undefined, referenceIso: string): number | null {
    if (!birthIso) return null
    const b = new Date(birthIso)
    const r = new Date(referenceIso)
    if (isNaN(b.getTime()) || isNaN(r.getTime())) return null
    let age = r.getFullYear() - b.getFullYear()
    const mdiff = r.getMonth() - b.getMonth()
    if (mdiff < 0 || (mdiff === 0 && r.getDate() < b.getDate())) age--
    return age
  }

  // Kor-eloszlás
  // 2026-08-10 (P1 #8 JAVÍTÁS): a korcsoportok és a 18+ nevező a MAI dátummal
  // számoltak, ráadásul puszta évkivonással (a születésnap nélkül). Egy 2023-as
  // beszámoló 2026-ban vetítve mindenkit 3 évvel öregebbnek mutatott. Mostantól
  // a referencia-nap a JELENTÉS ÉVÉNEK utolsó napja.
  const ageReference = `${year}-12-31`
  const ageGroups = [
    { label: '0-18', count: 0 },
    { label: '19-40', count: 0 },
    { label: '41-65', count: 0 },
    { label: '66+', count: 0 },
  ]
  activeMembers.forEach((m) => {
    const age = ageOn(m.sz_datum, ageReference)
    if (age === null || age < 0) return
    if (age <= 18) ageGroups[0].count++
    else if (age <= 40) ageGroups[1].count++
    else if (age <= 65) ageGroups[2].count++
    else ageGroups[3].count++
  })

  // ── Évenkénti lélekszám — visszamenőleges rekonstrukció (2026-06-08) ──
  // A MAI aktív létszámból indulunk, és évről évre visszafelé korrigálunk a
  // tagság-mozgás esemény-táblái alapján: count(Y-1) = count(Y) − nettó-változás(Y).
  // Becsült: a régi importok nem feltétlenül tartalmazzák a teljes esemény-történetet.
  const yearNum = (s: string | null | undefined): number | null => {
    if (!s) return null
    const m = /^(\d{4})/.exec(s)
    return m ? Number(m[1]) : null
  }
  const countByMikorYear = (rows: Array<{ mikor: string }>, y: number): number =>
    rows.filter((r) => yearNum(r.mikor) === y).length

  const birthsRows = (keresztelesekTrendResult.data || []) as Array<{ datum: string }>
  const deathRows = (temetesekTrendResult.data || []) as Array<{ tdatum: string }>
  const bekoltRows = (bekoltozottResult.data || []) as Array<{ mikor: string }>
  const attertRows = (attertResult.data || []) as Array<{ mikor: string }>
  const elkoltRows = (elkoltozottResult.data || []) as Array<{ mikor: string }>
  const kitertRows = (kitertResult.data || []) as Array<{ mikor: string }>

  const flowAll = histYears.map((y) => {
    const births = birthsRows.filter((r) => yearNum(r.datum) === y).length
    const deaths = deathRows.filter((r) => yearNum(r.tdatum) === y).length
    const movedIn = countByMikorYear(bekoltRows, y) + countByMikorYear(attertRows, y)
    const movedOut = countByMikorYear(elkoltRows, y) + countByMikorYear(kitertRows, y)
    return { year: y, births, deaths, movedIn, movedOut, natural: births - deaths, net: births + movedIn - deaths - movedOut }
  })

  // Horgony: az AKTUÁLIS év (ekkori a nyilvántartás állapota)
  const anchorIdx = Math.max(0, Math.min(histYears.length - 1, nowYear - histStart))
  const countsAll: number[] = new Array(histYears.length).fill(0)
  countsAll[anchorIdx] = activeMembers.length
  let clamped = false
  for (let i = anchorIdx - 1; i >= 0; i--) {
    const raw = countsAll[i + 1] - flowAll[i + 1].net
    if (raw < 0) clamped = true
    countsAll[i] = Math.max(0, raw)
  }
  for (let i = anchorIdx + 1; i < histYears.length; i++) {
    countsAll[i] = Math.max(0, countsAll[i - 1] + flowAll[i].net)
  }
  const countForYear = (y: number): number => countsAll[y - histStart] ?? 0
  const yearOverYear = years.map((y) => ({ year: y, count: countForYear(y) }))
  const flowByYear = years.map((y) => flowAll[y - histStart] ?? { year: y, births: 0, deaths: 0, movedIn: 0, movedOut: 0, natural: 0, net: 0 })

  // 2026-08-10 (P2 #20 JAVÍTÁS): a „becsült" jelölés ROSSZ ÉVEKET vizsgált
  // (slice(0,-1) ↔ a felhasznált [1..4] indexek), ezért egy teljesen
  // visszaszámolt, lapos vonal valós mérésként jelent meg. Mostantól:
  // becsült, ha a megjelenített ablak bármelyik (nem horgony) évében NINCS
  // egyetlen rögzített mozgás-esemény sem, vagy ha a visszaszámolás negatívba
  // fordult (levágtuk 0-ra).
  const membersEstimated =
    clamped ||
    years.some((y) => {
      if (y === nowYear) return false
      const f = flowAll[y - histStart]
      return !f || f.births + f.deaths + f.movedIn + f.movedOut === 0
    })

  // Családok
  const families = (familiesResult.data || []).length

  // ─── Befizetések ───
  // 2026-07-25 (F6.3 review): a lapozás hibája RÉSZLEGES adatot adna vissza —
  // ez plauzibilis, de csonka pénzügyi számokat jelentene a jelentésben.
  // Legalább HANGOSAN naplózzuk (a néma-csonkolás hibaosztály elleni védelem).
  if (befizetesResult.error || kiadasResult.error) {
    console.error(
      '[eves-jelentes] a pénzügyi lekérdezés HIBÁZOTT — a jelentés összegei csonkák lehetnek:',
      befizetesResult.error?.message || kiadasResult.error?.message,
    )
  }
  if (membersResult.error || munkanaploResult.error) {
    console.error(
      '[eves-jelentes] a tag- vagy munkanapló-lekérdezés HIBÁZOTT — a jelentés adatai csonkák lehetnek:',
      membersResult.error?.message || munkanaploResult.error?.message,
    )
  }

  const befizetesek = (befizetesResult.data || []) as Array<{
    osszeg: number
    osszeg_ron: number | null
    datum: string
    fizetettev: number
    id_szemely: number
    befizetescel: { nev: string } | { nev: string }[] | null
  }>

  // 2026-08-10 (P0 #5 JAVÍTÁS): a deviza-tételeket eddig `osszeg`-ként adtuk
  // össze és RON-ként címkéztük — egy 500 EUR (= 2485 RON) adomány „500 RON"-ként
  // jelent meg. A könyvelés kanonikus szabálya: `osszeg_ron ?? osszeg`.
  const ronOf = (r: { osszeg: number | null; osszeg_ron: number | null }): number =>
    Number(r.osszeg_ron ?? r.osszeg ?? 0)

  const kiadasokAll = (kiadasResult.data || []) as Array<{
    osszeg: number
    osszeg_ron: number | null
    datum: string
    kiadascel: { nev: string } | { nev: string }[] | null
  }>

  // PÉNZMOZGÁS-szemantika: a bevétel/kiadás összesítők a PÉNZTÁRI NAP (datum)
  // szerint sorolnak évhez — ez a számadás/kassza logikája.
  // 2026-08-10 (P2 #29 JAVÍTÁS): `new Date(...).getFullYear()` helyett a fájlban
  // már meglévő, időzóna-független `yearNum()` string-prefix helper — UTC mögötti
  // szerver-időzónában a január 1-i tételek az előző évbe csúsztak.
  const financeByYear = years.map((y) => {
    const income = befizetesek.filter((b) => yearNum(b.datum) === y).reduce((s, b) => s + ronOf(b), 0)
    const expense = kiadasokAll.filter((k) => yearNum(k.datum) === y).reduce((s, k) => s + ronOf(k), 0)
    return { year: y, income, expense }
  })

  const totalIncome = financeByYear.find((f) => f.year === year)?.income || 0
  const totalExpense = financeByYear.find((f) => f.year === year)?.expense || 0

  // Bevétel/kiadás kategória szerint (a kiválasztott évben)
  const celNev = (raw: { nev: string } | { nev: string }[] | null): string => {
    const cel = Array.isArray(raw) ? raw[0] : raw
    return cel?.nev || 'Egyéb'
  }
  const yearBefizetesek = befizetesek.filter((b) => yearNum(b.datum) === year)
  const incomeByCategory: Record<string, number> = {}
  yearBefizetesek.forEach((b) => {
    const name = celNev(b.befizetescel)
    incomeByCategory[name] = (incomeByCategory[name] || 0) + ronOf(b)
  })

  const yearKiadasok = kiadasokAll.filter((k) => yearNum(k.datum) === year)
  const expenseByCategory: Record<string, number> = {}
  yearKiadasok.forEach((k) => {
    const name = celNev(k.kiadascel)
    expenseByCategory[name] = (expenseByCategory[name] || 0) + ronOf(k)
  })

  // Egyházfenntartás (aki fizetett erre az évre)
  // 2026-06-08: a nevező a FELNŐTT (18+) aktív tagok — a gyerekek nem fizetnek
  // egyházfenntartást, így a korábbi „összes aktív" nevező torzított (alacsony rátát adott).
  const activeAdults = activeMembers.filter((m) => {
    const age = ageOn(m.sz_datum, ageReference)
    if (age === null) return true // ismeretlen kor → felnőttnek vesszük (konzervatív)
    return age >= 18
  }).length
  // KÖTELEZETTSÉGI-ÉV szemantika: „ki rendezte a(z) N. évet" — ez mindig a
  // fizetettev, függetlenül attól, mikor folyt be (hátralék-rendezés).
  //
  // ⚠️ TUDATOS KORLÁT (2026-07-25, F6.3 review): ez egy PREZENTÁCIÓS
  // becslés, NEM a Tartozások fül hiteles számítása:
  //   - a NULL id_szemely (tisztán családi tétel) sorokat KIHAGYJA — a családi
  //     befizetés tagokra osztása (allocateFamilyPayments) itt nem fut le,
  //     ezért az ilyen családok tagjai nem számítanak „fizetőnek";
  //   - jogcímre nem szűr: minden fizetettev=év tétel beszámít.
  // A hiteles, tagonkénti kép a Pénzügy → Tartozások fülön van.
  const paidIdsFor = (y: number): Set<number> =>
    new Set(befizetesek.filter((b) => b.fizetettev === y && b.id_szemely != null).map((b) => b.id_szemely))
  const paidMemberIds = paidIdsFor(year)
  // 2026-08-10 (P2 #19 JAVÍTÁS): az arány 100% fölé mehetett (gyerekek/elhunytak
  // saját id_szemely-lel fizetnek) — a kör-diagram tele volt, a szám mégis
  // „110%"-ot írt. A megjelenített arány vágva, a nyers érték külön mezőben
  // marad, hogy a következtetés adat-egyeztetést tudjon javasolni.
  const paymentRateRaw = activeAdults > 0 ? (paidMemberIds.size / activeAdults) * 100 : 0
  const egyhazfenntartas = {
    activeMembers: activeMembers.length,
    activeAdults,
    paidMembers: paidMemberIds.size,
    paymentRate: Math.min(100, paymentRateRaw),
    paymentRateRaw,
    paidByYear: years.map((y) => ({ year: y, paidMembers: paidIdsFor(y).size })),
  }

  // Adományjellegű bevételek aránya (a kategórianevek alapján)
  const DONATION_RE = /adom|persely|c[ée]ladom|offert|gy[űu]jt|h[áa]laad/i
  let donationTotal = 0
  Object.entries(incomeByCategory).forEach(([name, amt]) => {
    if (DONATION_RE.test(name)) donationTotal += Number(amt)
  })
  const donationRatio = totalIncome > 0 ? (donationTotal / totalIncome) * 100 : 0
  const donationByYear = years.map((y) => {
    const rows = befizetesek.filter((b) => yearNum(b.datum) === y)
    const income = rows.reduce((s, b) => s + ronOf(b), 0)
    const donation = rows.filter((b) => DONATION_RE.test(celNev(b.befizetescel))).reduce((s, b) => s + ronOf(b), 0)
    return { year: y, donation, income, ratio: income > 0 ? (donation / income) * 100 : 0 }
  })

  // ─── Anyakönyvi események (4 valódi táblából, 5 év trend) ───
  // 2026-04-21t: az `anyakonyv` tábla NEM létezik — a trend-adatokat
  // a négy valódi anyakönyv-táblából gyűjtjük (keresztseg, konfirmalas,
  // hazassag, temetes). Csak dátum kell a trend-számításhoz.
  const keresztelesekTrend = (keresztelesekTrendResult.data || []) as Array<{ datum: string }>
  const konfirmaciokTrend = (konfirmaciokTrendResult.data || []) as Array<{ datum: string }>
  const esketesekTrend = (esketesekTrendResult.data || []) as Array<{ datum: string }>
  const temetesekTrend = (temetesekTrendResult.data || []) as Array<{ tdatum: string }>

  const countByYear = (rows: Array<{ datum: string }>, y: number): number =>
    rows.filter((r) => yearNum(r.datum) === y).length

  const anyakonyvByYear = years.map((y) => ({
    year: y,
    keresztelo: countByYear(keresztelesekTrend, y),
    konfirmacio: countByYear(konfirmaciokTrend, y),
    esketes: countByYear(esketesekTrend, y),
    temetes: temetesekTrend.filter((t) => yearNum(t.tdatum) === y).length,
  }))

  const anyakonyvYearCur = anyakonyvByYear.find((a) => a.year === year) || {
    year,
    keresztelo: 0,
    konfirmacio: 0,
    esketes: 0,
    temetes: 0,
  }

  // ─── Név-listák az adott évre (SZÁMADÁS-stílusú részletesség) ───
  interface JoinedPerson {
    csaladnev: string | null
    k_nev: string | null
    namepattern: string | null
    ferfi?: boolean | null
    sz_datum?: string | null
  }
  function formatPersonName(p: JoinedPerson | null | undefined): string {
    if (!p) return '—'
    // 2026-08-01 (PR-19 BUGFIX): a namepattern csak ELŐTAG (id./ifj.) — a
    // korábbi `namepattern || név` minta a nevet ELDOBTA, és csak az előtag
    // jelent meg az éves jelentés névlistáiban.
    const base = `${p.csaladnev || ''} ${p.k_nev || ''}`.trim()
    if (!base) return '—'
    const np = (p.namepattern || '').trim()
    const isPrefix = np.length > 0 && np.length <= 6 && np.endsWith('.') && !/\s/.test(np)
    return isPrefix ? `${np} ${base}` : base
  }
  function extractPerson(raw: unknown): JoinedPerson | null {
    if (!raw) return null
    if (Array.isArray(raw)) return (raw[0] as JoinedPerson) || null
    return raw as JoinedPerson
  }

  const keresztelesekList = ((keresztelesekResult.data || []) as Array<{
    datum: string
    szemely: unknown
  }>).map((row) => {
    const p = extractPerson(row.szemely)
    return {
      name: formatPersonName(p),
      date: row.datum,
      isMale: p?.ferfi ?? null,
    }
  })

  const konfirmaciokList = ((konfirmaciokResult.data || []) as Array<{
    datum: string
    szemely: unknown
  }>).map((row) => {
    const p = extractPerson(row.szemely)
    return {
      name: formatPersonName(p),
      date: row.datum,
      isMale: p?.ferfi ?? null,
    }
  })

  const esketesekList = ((esketesekResult.data || []) as Array<{
    datum: string
    ferfi: unknown
    no: unknown
  }>).map((row) => ({
    ferfiName: formatPersonName(extractPerson(row.ferfi)),
    noName: formatPersonName(extractPerson(row.no)),
    date: row.datum,
  }))

  const temetesekList = ((temetesekResult.data || []) as Array<{
    tdatum: string
    hdatum: string | null
    szemely: unknown
  }>).map((row) => {
    const p = extractPerson(row.szemely)
    const ageAtDeath = ageOn(p?.sz_datum, row.hdatum || row.tdatum)
    return {
      name: formatPersonName(p),
      temetesDate: row.tdatum,
      halalDate: row.hdatum,
      isMale: p?.ferfi ?? null,
      ageAtDeath,
    }
  })

  // ─── Programok (gyülekezeti_programok widget-tábla) ───
  const programsAll = (programsResult.data || []) as Array<{
    datum: string
    tipus: string
    teljesitett: boolean | null
  }>
  const yearPrograms = programsAll.filter((p) => yearNum(p.datum) === year)
  const byType: Record<string, number> = {}
  yearPrograms.forEach((p) => {
    byType[p.tipus] = (byType[p.tipus] || 0) + 1
  })
  const programsByYear = years.map((y) => {
    const rows = programsAll.filter((p) => yearNum(p.datum) === y)
    return { year: y, total: rows.length, completed: rows.filter((p) => p.teljesitett).length }
  })

  // ─── Munkanapló-alapú látogatottság (Pillér 2 — valós jelenlét) ───
  const worklog = (munkanaploResult.data || []) as Array<{
    idopont: string | null
    jellege: string | null
    kategoria: string | null
    jelenlet_ferfi: number | null
    jelenlet_no: number | null
    jelenlet_gyermek: number | null
    jelenlet_osszesen: number | null
    persely: number | null
    uv_templomban?: number | null
    uv_betegnel?: number | null
  }>
  // 2026-08-10 (P0 #3 JAVÍTÁS): a jelenlét eddig CSAK a férfi+nő+gyermek
  // oszlopokat adta össze, a `jelenlet_osszesen`-t figyelmen kívül hagyta —
  // az Excelből importált munkanaplók KIZÁRÓLAG ezt töltik ki, így a vetített
  // átlagos jelenlét „0 fő/alkalom" volt, miközben a hivatalos jelentés 80-at
  // írt. Ugyanaz a szabály, mint a generator.ts / lelkészi jelentés esetén.
  const wlAtt = (e: typeof worklog[number]) => {
    const ossz = Number(e.jelenlet_osszesen || 0)
    if (ossz > 0) return ossz
    return Number(e.jelenlet_ferfi || 0) + Number(e.jelenlet_no || 0) + Number(e.jelenlet_gyermek || 0)
  }

  // 2026-08-10 (P1 #10 JAVÍTÁS): a saját, ad-hoc kategorizálás a `kategoria`
  // DB-DEFAULT ('szolgalat') miatt MINDEN legacy sort istentiszteletnek vett,
  // a családlátogatásokat pedig katekézisnek. Mostantól a kanonikus
  // `categorizeWorklogEntry()` dönt (lib/constants/worklog.ts), és az
  // istentiszteleti átlagból kimaradnak a kazuáliák és a testületi alkalmak
  // (temetés 200 fővel korábban felhúzta az „átlagos istentiszteleti jelenlétet").
  const NON_WORSHIP_SZOLGALAT = new Set([
    'Presbiteri gyűlés', 'Keresztelő', 'Esketés', 'Temetés', 'Konfirmáció',
    'Bibliaóra', 'Nőszövetségi összejövetel', 'Vallásos ünnepély', 'Egyéb szolgálat',
  ])
  const isWorship = (e: typeof worklog[number]) =>
    categorizeWorklogEntry(e) === 'szolgalat' && !NON_WORSHIP_SZOLGALAT.has((e.jellege || '').trim())
  const isCatechesis = (e: typeof worklog[number]) => categorizeWorklogEntry(e) === 'katekezis'
  const isVisit = (e: typeof worklog[number]) => categorizeWorklogEntry(e) === 'latogatas'

  const uvOf = (e: typeof worklog[number]) => Number(e.uv_templomban || 0) + Number(e.uv_betegnel || 0)

  const yearWorklog = worklog.filter((e) => yearNum(e.idopont) === year)
  const yearWorship = yearWorklog.filter(isWorship)
  const yearCatech = yearWorklog.filter(isCatechesis)
  const worshipTotal = yearWorship.reduce((s, e) => s + wlAtt(e), 0)
  const worshipOccasions = yearWorship.length
  const catechesisTotal = yearCatech.reduce((s, e) => s + wlAtt(e), 0)
  const childrenTotal = yearWorklog.reduce((s, e) => s + Number(e.jelenlet_gyermek || 0), 0)
  const perselyTotal = yearWorklog.reduce((s, e) => s + Number(e.persely || 0), 0)
  const uvTemplomban = yearWorklog.reduce((s, e) => s + Number(e.uv_templomban || 0), 0)
  const uvBetegnel = yearWorklog.reduce((s, e) => s + Number(e.uv_betegnel || 0), 0)
  const hasUvData = worklog.some((e) => e.uv_templomban != null || e.uv_betegnel != null)

  // Bontás alkalom-jelleg szerint (istentisztelet, vallásóra, ifjúsági óra,
  // gyermek foglalkozás, nőszövetségi bibliaóra… — amit a munkanapló tartalmaz)
  const attByTypeMap: Record<string, { occasions: number; total: number }> = {}
  yearWorklog.forEach((e) => {
    const key = (e.jellege && e.jellege.trim()) || 'Egyéb alkalom'
    if (!attByTypeMap[key]) attByTypeMap[key] = { occasions: 0, total: 0 }
    attByTypeMap[key].occasions++
    attByTypeMap[key].total += wlAtt(e)
  })
  const attendanceByType = Object.entries(attByTypeMap)
    .map(([jellege, v]) => ({
      jellege,
      occasions: v.occasions,
      total: v.total,
      avg: v.occasions > 0 ? Math.round(v.total / v.occasions) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  const attendanceByYear = years.map((y) => {
    const rows = worklog.filter((e) => yearNum(e.idopont) === y)
    const w = rows.filter(isWorship)
    const total = w.reduce((s, e) => s + wlAtt(e), 0)
    const occ = w.length
    return {
      year: y,
      worshipTotal: total,
      worshipOccasions: occ,
      worshipAvg: occ > 0 ? Math.round(total / occ) : 0,
      catechesisOccasions: rows.filter(isCatechesis).length,
      childrenTotal: rows.reduce((s, e) => s + Number(e.jelenlet_gyermek || 0), 0),
      uvTotal: rows.reduce((s, e) => s + uvOf(e), 0),
      persely: rows.reduce((s, e) => s + Number(e.persely || 0), 0),
    }
  })

  // 2026-08-10 (P1 #9 JAVÍTÁS): az „Istentiszteletek száma" eddig a
  // `gyulekezeti_programok` widget-táblából jött (dokumentáltan NEM önálló
  // modul), ezért a vetítőn „0" jelent meg, míg a következő dia 52 alkalmat
  // mutatott a munkanaplóból. Egyetlen forrás: a munkanapló.
  const worshipByType: Record<string, number> = {}
  yearWorklog.filter(isWorship).forEach((e) => {
    const key = (e.jellege && e.jellege.trim()) || 'Egyéb alkalom'
    worshipByType[key] = (worshipByType[key] || 0) + 1
  })

  // ─── Leltár (egyházi vagyon) ───
  const leltarRows = ((leltarResult.data || []) as Array<{
    kategoria: string | null
    beszerzesi_ertek: number | null
    mennyiseg: number | null
    is_deleted: boolean | null
    torles_datuma: string | null
  }>).filter((r) => !r.is_deleted && !r.torles_datuma)
  const leltarMap: Record<string, { count: number; value: number }> = {}
  let leltarTotal = 0
  let leltarMissing = 0
  leltarRows.forEach((r) => {
    const cat = (r.kategoria || 'Egyéb').trim() || 'Egyéb'
    const value = Number(r.beszerzesi_ertek || 0) * (Number(r.mennyiseg) || 1)
    if (!r.beszerzesi_ertek) leltarMissing++
    if (!leltarMap[cat]) leltarMap[cat] = { count: 0, value: 0 }
    leltarMap[cat].count++
    leltarMap[cat].value += value
    leltarTotal += value
  })

  return {
    data: {
      year,
      isCurrentYear: year === nowYear,
      congregation: {
        id: cong.id as string,
        name: (cong.nev_hu as string | null) || (cong.name as string | null) || 'Gyülekezet',
        cimer_url: (cong.cimer_url as string | null) || null,
      },
      members: {
        totalActive: activeMembers.length,
        totalAtYear: countForYear(year),
        families,
        male,
        female,
        ageGroups,
        adults: activeAdults,
        yearOverYear,
        estimated: membersEstimated,
        flowByYear,
      },
      anyakonyv: {
        // A név-listák elsődleges forrás, de a meglévő anyakonyv tábla is backup
        keresztelo: keresztelesekList.length || anyakonyvYearCur.keresztelo,
        konfirmacio: konfirmaciokList.length || anyakonyvYearCur.konfirmacio,
        esketes: esketesekList.length || anyakonyvYearCur.esketes,
        temetes: temetesekList.length || anyakonyvYearCur.temetes,
        byYear: anyakonyvByYear,
        nameLists: {
          keresztelesek: keresztelesekList,
          konfirmaciok: konfirmaciokList,
          esketesek: esketesekList,
          temetesek: temetesekList,
        },
      },
      worship: {
        totalServices: worshipOccasions,
        byType: worshipByType,
      },
      attendance: {
        // 2026-08-10: a jelentés ÉVÉRE nézzük (korábban az 5 éves ablak
        // bármelyik sora „van adat"-ot jelentett, így a tárgyévi üres állapot
        // helyett csupa 0 jelent meg a dián).
        hasData: yearWorklog.length > 0,
        worshipOccasions,
        worshipTotal,
        worshipAvg: worshipOccasions > 0 ? Math.round(worshipTotal / worshipOccasions) : 0,
        catechesisOccasions: yearCatech.length,
        catechesisTotal,
        visitOccasions: yearWorklog.filter(isVisit).length,
        childrenTotal,
        persely: perselyTotal,
        uvTemplomban,
        uvBetegnel,
        uvTotal: uvTemplomban + uvBetegnel,
        hasUvData,
        byType: attendanceByType,
        byYear: attendanceByYear,
      },
      finance: {
        totalIncome,
        totalExpense,
        surplus: totalIncome - totalExpense,
        byYear: financeByYear,
        // MINDEN kategória (nem csak Top 8) — a SZÁMADÁS-stílusú slide-hoz
        // minden tétel kell, ahol bármilyen mozgás volt.
        // 2026-08-10 (P2 #28 JAVÍTÁS): a korábbi `amount > 0` szűrő a NEGATÍV
        // (korrekciós) tételeket elrejtette a listából, de bent hagyta az
        // összesenben — a kinyomtatott Számadás nem jött ki.
        incomeByCategory: Object.entries(incomeByCategory)
          .map(([name, amount]) => ({ name, amount }))
          .filter((item) => item.amount !== 0)
          .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
        expenseByCategory: Object.entries(expenseByCategory)
          .map(([name, amount]) => ({ name, amount }))
          .filter((item) => item.amount !== 0)
          .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
        donationTotal,
        donationRatio,
        donationByYear,
        egyhazfenntartas,
      },
      leltar: {
        hasData: leltarRows.length > 0,
        itemCount: leltarRows.length,
        totalValue: leltarTotal,
        missingValueCount: leltarMissing,
        byCategory: Object.entries(leltarMap)
          .map(([name, v]) => ({ name, count: v.count, value: v.value }))
          .sort((a, b) => b.value - a.value),
      },
      programs: {
        total: yearPrograms.length,
        completed: yearPrograms.filter((p) => p.teljesitett).length,
        completionRate: yearPrograms.length > 0
          ? (yearPrograms.filter((p) => p.teljesitett).length / yearPrograms.length) * 100
          : 0,
        byType: Object.entries(byType)
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count),
        byYear: programsByYear,
      },
      goals: (celokResult.error ? [] : (celokResult.data || [])) as GoalRow[],
    },
  }
}
