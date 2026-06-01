'use server'

/**
 * Prezentáció Studio — adatgyűjtő action.
 *
 * A lelkész év végi beszámolójához összeállítja az adatokat:
 *   - Gyülekezet összetétele (tagszám, családok, férfi/nő, kor-eloszlás)
 *   - Tagság változása (3-5 év)
 *   - Anyakönyvi adatok (keresztelő, konfirmáció, esketés, temetés)
 *   - Pénzügyi adatok (bevétel, kiadás, kategóriák, egyházfenntartás)
 *   - Programok száma / teljesülés
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

export interface PresentationData {
  year: number
  congregation: {
    id: string
    name: string
    cimer_url: string | null
  }
  members: {
    totalActive: number
    families: number
    male: number
    female: number
    ageGroups: { label: string; count: number }[]
    yearOverYear: { year: number; count: number }[]
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
  /** Istentisztelet + egyéb alkalom-számok (programokból származtatva) */
  worship: {
    totalServices: number
    byType: Record<string, number>
  }
  finance: {
    totalIncome: number
    totalExpense: number
    surplus: number
    byYear: { year: number; income: number; expense: number }[]
    incomeByCategory: { name: string; amount: number }[]
    expenseByCategory: { name: string; amount: number }[]
    egyhazfenntartas: {
      activeMembers: number
      paidMembers: number
      paymentRate: number // 0..100
    }
  }
  programs: {
    total: number
    completed: number
    completionRate: number
    byType: { type: string; count: number }[]
  }
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

  // 5 év visszamenőleg
  const years = Array.from({ length: 5 }, (_, i) => year - 4 + i)

  // Dátumtartomány az adott évre (a keresztseg stb. táblákhoz)
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`

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
  ] = await Promise.all([
    supabase
      .from('szemely')
      .select('id, sz_datum, ferfi, meghalt')
      .eq('congregation_id', effectiveCongregationId),
    // 2026-06-01 (hibrid család-modell Fázis 2): az ÚJ haztartas táblát olvassuk
    supabase
      .from('haztartas')
      .select('id')
      .eq('congregation_id', effectiveCongregationId)
      .eq('isaktiv', true)
      .is('ervenyes_ig', null),
    supabase
      .from('befizetes')
      .select('osszeg, datum, fizetettev, id_szemely, id_befizetescel, befizetescel(nev)')
      .eq('congregation_id', effectiveCongregationId)
      .eq('deleted', false)
      .eq('stornozott', false)
      .gte('datum', `${years[0]}-01-01`)
      .lte('datum', `${year}-12-31`),
    supabase
      .from('kiadas')
      .select('osszeg, datum, kiadascel:id_kiadascel(nev)')
      .eq('congregation_id', effectiveCongregationId)
      .eq('deleted', false)
      .gte('datum', `${years[0]}-01-01`)
      .lte('datum', `${year}-12-31`),
    supabase
      .from('gyulekezeti_programok')
      .select('datum, tipus, teljesitett')
      .eq('congregation_id', effectiveCongregationId)
      .gte('datum', `${year}-01-01`)
      .lte('datum', `${year}-12-31`),
    // Kereszteltek trend — 5 év csak dátummal (nem kell join)
    supabase
      .from('keresztseg')
      .select('datum')
      .eq('congregation_id', effectiveCongregationId)
      .gte('datum', `${years[0]}-01-01`)
      .lte('datum', `${year}-12-31`),
    supabase
      .from('konfirmalas')
      .select('datum')
      .eq('congregation_id', effectiveCongregationId)
      .gte('datum', `${years[0]}-01-01`)
      .lte('datum', `${year}-12-31`),
    supabase
      .from('hazassag')
      .select('datum')
      .eq('congregation_id', effectiveCongregationId)
      .gte('datum', `${years[0]}-01-01`)
      .lte('datum', `${year}-12-31`),
    supabase
      .from('temetes')
      .select('tdatum')
      .eq('congregation_id', effectiveCongregationId)
      .gte('tdatum', `${years[0]}-01-01`)
      .lte('tdatum', `${year}-12-31`),
    // Az adott évi RÉSZLETES adatok (név-listákkal)
    supabase
      .from('keresztseg')
      .select('datum, szemely:id_szemely(csaladnev, k_nev, namepattern, ferfi, sz_datum)')
      .eq('congregation_id', effectiveCongregationId)
      .gte('datum', yearStart)
      .lte('datum', yearEnd)
      .order('datum'),
    // Konfirmáltak
    supabase
      .from('konfirmalas')
      .select('datum, szemely:id_szemely(csaladnev, k_nev, namepattern, ferfi, sz_datum)')
      .eq('congregation_id', effectiveCongregationId)
      .gte('datum', yearStart)
      .lte('datum', yearEnd)
      .order('datum'),
    // Esketések — kétszer join (férfi + nő)
    supabase
      .from('hazassag')
      .select('datum, ferfi:id_ferfi(csaladnev, k_nev, namepattern), no:id_no(csaladnev, k_nev, namepattern)')
      .eq('congregation_id', effectiveCongregationId)
      .gte('datum', yearStart)
      .lte('datum', yearEnd)
      .order('datum'),
    // Temetések — tdatum a tényleges temetés dátuma
    supabase
      .from('temetes')
      .select('tdatum, hdatum, szemely:id_szemely(csaladnev, k_nev, namepattern, ferfi, sz_datum)')
      .eq('congregation_id', effectiveCongregationId)
      .gte('tdatum', yearStart)
      .lte('tdatum', yearEnd)
      .order('tdatum'),
  ])

  // ─── Tagok ───
  const allMembers = (membersResult.data || []) as Array<{
    id: string
    sz_datum: string | null
    ferfi: boolean | null
    meghalt: boolean | null
  }>
  const activeMembers = allMembers.filter((m) => !m.meghalt)
  const male = activeMembers.filter((m) => m.ferfi === true).length
  const female = activeMembers.filter((m) => m.ferfi === false).length

  // Kor-eloszlás
  const now = new Date()
  const currentYear = now.getFullYear()
  const ageGroups = [
    { label: '0-18', count: 0 },
    { label: '19-40', count: 0 },
    { label: '41-65', count: 0 },
    { label: '66+', count: 0 },
  ]
  activeMembers.forEach((m) => {
    if (!m.sz_datum) return
    const bd = new Date(m.sz_datum)
    if (isNaN(bd.getTime())) return
    const age = currentYear - bd.getFullYear()
    if (age <= 18) ageGroups[0].count++
    else if (age <= 40) ageGroups[1].count++
    else if (age <= 65) ageGroups[2].count++
    else ageGroups[3].count++
  })

  // Évenkénti tagszám (becsült: jelenlegi aktív tagok száma, az előző évek pontos
  // számát nem tudjuk megbízhatóan rekonstruálni; az MVP ugyanazt mutatja)
  const yearOverYear = years.map((y) => ({
    year: y,
    count: y === currentYear ? activeMembers.length : activeMembers.length, // MVP
  }))

  // Családok
  const families = (familiesResult.data || []).length

  // ─── Befizetések ───
  const befizetesek = (befizetesResult.data || []) as Array<{
    osszeg: number
    datum: string
    fizetettev: number
    id_szemely: number
    befizetescel: { nev: string } | { nev: string }[] | null
  }>

  const financeByYear = years.map((y) => {
    const yearIncome = befizetesek
      .filter((b) => new Date(b.datum).getFullYear() === y)
      .reduce((s, b) => s + Number(b.osszeg || 0), 0)
    const kiadasok = (kiadasResult.data || []) as Array<{ osszeg: number; datum: string }>
    const yearExpense = kiadasok
      .filter((k) => new Date(k.datum).getFullYear() === y)
      .reduce((s, k) => s + Number(k.osszeg || 0), 0)
    return { year: y, income: yearIncome, expense: yearExpense }
  })

  const totalIncome = financeByYear.find((f) => f.year === year)?.income || 0
  const totalExpense = financeByYear.find((f) => f.year === year)?.expense || 0

  // Bevétel/kiadás kategória szerint (a kiválasztott évben)
  const yearBefizetesek = befizetesek.filter((b) => new Date(b.datum).getFullYear() === year)
  const incomeByCategory: Record<string, number> = {}
  yearBefizetesek.forEach((b) => {
    const cel = Array.isArray(b.befizetescel) ? b.befizetescel[0] : b.befizetescel
    const name = cel?.nev || 'Egyéb'
    incomeByCategory[name] = (incomeByCategory[name] || 0) + Number(b.osszeg || 0)
  })

  const kiadasokAll = (kiadasResult.data || []) as Array<{
    osszeg: number
    datum: string
    kiadascel: { nev: string } | { nev: string }[] | null
  }>
  const yearKiadasok = kiadasokAll.filter((k) => new Date(k.datum).getFullYear() === year)
  const expenseByCategory: Record<string, number> = {}
  yearKiadasok.forEach((k) => {
    const cel = Array.isArray(k.kiadascel) ? k.kiadascel[0] : k.kiadascel
    const name = cel?.nev || 'Egyéb'
    expenseByCategory[name] = (expenseByCategory[name] || 0) + Number(k.osszeg || 0)
  })

  // Egyházfenntartás (aki fizetett erre az évre)
  const paidMemberIds = new Set(
    befizetesek.filter((b) => b.fizetettev === year).map((b) => b.id_szemely),
  )
  const egyhazfenntartas = {
    activeMembers: activeMembers.length,
    paidMembers: paidMemberIds.size,
    paymentRate: activeMembers.length > 0 ? (paidMemberIds.size / activeMembers.length) * 100 : 0,
  }

  // ─── Anyakönyvi események (4 valódi táblából, 5 év trend) ───
  // 2026-04-21t: az `anyakonyv` tábla NEM létezik — a trend-adatokat
  // a négy valódi anyakönyv-táblából gyűjtjük (keresztseg, konfirmalas,
  // hazassag, temetes). Csak dátum kell a trend-számításhoz.
  const keresztelesekTrend = (keresztelesekTrendResult.data || []) as Array<{ datum: string }>
  const konfirmaciokTrend = (konfirmaciokTrendResult.data || []) as Array<{ datum: string }>
  const esketesekTrend = (esketesekTrendResult.data || []) as Array<{ datum: string }>
  const temetesekTrend = (temetesekTrendResult.data || []) as Array<{ tdatum: string }>

  const countByYear = (rows: Array<{ datum: string }>, y: number): number =>
    rows.filter((r) => r.datum && new Date(r.datum).getFullYear() === y).length

  const anyakonyvByYear = years.map((y) => ({
    year: y,
    keresztelo: countByYear(keresztelesekTrend, y),
    konfirmacio: countByYear(konfirmaciokTrend, y),
    esketes: countByYear(esketesekTrend, y),
    temetes: temetesekTrend.filter((t) => t.tdatum && new Date(t.tdatum).getFullYear() === y).length,
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
    return p.namepattern || `${p.csaladnev || ''} ${p.k_nev || ''}`.trim() || '—'
  }
  function extractPerson(raw: unknown): JoinedPerson | null {
    if (!raw) return null
    if (Array.isArray(raw)) return (raw[0] as JoinedPerson) || null
    return raw as JoinedPerson
  }
  function calcAge(birthIso: string | null | undefined, referenceIso: string): number | null {
    if (!birthIso) return null
    const b = new Date(birthIso)
    const r = new Date(referenceIso)
    if (isNaN(b.getTime()) || isNaN(r.getTime())) return null
    let age = r.getFullYear() - b.getFullYear()
    const mdiff = r.getMonth() - b.getMonth()
    if (mdiff < 0 || (mdiff === 0 && r.getDate() < b.getDate())) age--
    return age
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
    const ageAtDeath = calcAge(p?.sz_datum, row.hdatum || row.tdatum)
    return {
      name: formatPersonName(p),
      temetesDate: row.tdatum,
      halalDate: row.hdatum,
      isMale: p?.ferfi ?? null,
      ageAtDeath,
    }
  })

  // ─── Programok + istentisztelet-statisztika ───
  const programs = (programsResult.data || []) as Array<{
    datum: string
    tipus: string
    teljesitett: boolean | null
  }>
  const byType: Record<string, number> = {}
  programs.forEach((p) => {
    byType[p.tipus] = (byType[p.tipus] || 0) + 1
  })
  // A worship-statisztika ugyanabból a programs adatból jön
  const worshipByType: Record<string, number> = { ...byType }
  const totalServices = worshipByType['istentisztelet'] || 0

  return {
    data: {
      year,
      congregation: {
        id: cong.id as string,
        name: (cong.nev_hu as string | null) || (cong.name as string | null) || 'Gyülekezet',
        cimer_url: (cong.cimer_url as string | null) || null,
      },
      members: {
        totalActive: activeMembers.length,
        families,
        male,
        female,
        ageGroups,
        yearOverYear,
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
        totalServices,
        byType: worshipByType,
      },
      finance: {
        totalIncome,
        totalExpense,
        surplus: totalIncome - totalExpense,
        byYear: financeByYear,
        // MINDEN kategória (nem csak Top 8) — a SZÁMADÁS-stílusú slide-hoz
        // minden tétel kell, ahol bármilyen mozgás volt
        incomeByCategory: Object.entries(incomeByCategory)
          .map(([name, amount]) => ({ name, amount }))
          .filter((item) => item.amount > 0)
          .sort((a, b) => b.amount - a.amount),
        expenseByCategory: Object.entries(expenseByCategory)
          .map(([name, amount]) => ({ name, amount }))
          .filter((item) => item.amount > 0)
          .sort((a, b) => b.amount - a.amount),
        egyhazfenntartas,
      },
      programs: {
        total: programs.length,
        completed: programs.filter((p) => p.teljesitett).length,
        completionRate: programs.length > 0
          ? (programs.filter((p) => p.teljesitett).length / programs.length) * 100
          : 0,
        byType: Object.entries(byType)
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count),
      },
    },
  }
}
