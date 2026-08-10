/**
 * Egyházmegyei / kerületi pénzügyi aggregáció a dashboardokhoz (B4.5).
 *
 * A funkcióját a `lib/dashboard/scope-overview.ts` egészíti ki: ott a
 * tagszám / szerepkör / adatminőség adatok aggregálódnak, itt pedig a
 * pénzügyi forgalom (bevétel, kiadás, egyenleg) — egyházmegyénként és
 * gyülekezetenként.
 *
 * Az aggregáció JS-oldalon történik (NEM Postgres view-val), mert:
 * - A meglévő `scope-overview.ts` is JS-aggregációt használ
 * - Egy egyházmegyénél ritkán van >100 gyülekezet, és a befizetes/kiadas
 *   sorok éves szinten kezelhetők (sokmillió helyett kb. 10-20k sor)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ScopeFinancialCongregationRow {
  congregationId: string
  congregationName: string
  dioceseId: string | null
  dioceseName: string | null
  bevetel: number
  kiadas: number
  egyenleg: number
}

export interface ScopeFinancialDioceseRow {
  dioceseId: string | null
  dioceseName: string
  congregationCount: number
  bevetel: number
  kiadas: number
  egyenleg: number
}

export interface ScopeFinancialData {
  /** Az adott évre vonatkozó teljes aggregátum a vizsgált gyülekezetekre. */
  total: {
    bevetel: number
    kiadas: number
    egyenleg: number
    congregationCount: number
  }
  /** Egyházmegyénkénti bontás (kerületi nézethez hasznos). */
  byDiocese: ScopeFinancialDioceseRow[]
  /** Gyülekezetenkénti részletes bontás. */
  byCongregation: ScopeFinancialCongregationRow[]
  /** Az aggregáció éve (egyezzen az UI-ban kijelzettel). */
  year: number
}

interface BefitetesAggRow {
  congregation_id: string | null
  osszeg: number | string
  /** RON-ekvivalens: devizás banki tételnél az átváltott lej-érték. */
  osszeg_ron?: number | string | null
}

interface KiadasAggRow {
  congregation_id: string | null
  osszeg: number | string
  osszeg_ron?: number | string | null
}

/**
 * 2026-08-11 (K5-#10): LAPOZÓ segéd. A fájl saját fejléc-kommentje 10-20 ezer
 * sorral számol — ez a PostgREST 1000-es implicit plafonjának 10-20-szorosa,
 * vagyis a lekérdezések eddig NÉMÁN csonkolódtak. A hívónak KÖTELEZŐ
 * determinisztikus rendezést (`.order('id')`) adnia.
 */
async function fetchAllPagedRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  pageSize = 1000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = []
  for (let from = 0; ; ) {
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) return { data: out, error }
    const page = (data ?? []) as T[]
    out.push(...page)
    if (page.length === 0) break
    from += page.length
  }
  return { data: out, error: null }
}

interface CongregationLite {
  id: string
  name: string | null
  nev_hu?: string | null
  diocese_id: string | null
}

interface DioceseLite {
  id: string
  name: string
}

/**
 * Pénzügyi aggregáció a dashboardhoz.
 *
 * @param supabase       Supabase kliens (server-side)
 * @param congregationIds A vizsgált gyülekezetek ID-jai (egyházmegyei nézetnél
 *                        szűkebb, kerületinél tágabb)
 * @param year            Az aggregáció éve (pl. 2025)
 * @param congregations   Opcionális: már lekérdezett gyülekezet metaadatok
 *                        (név + diocese_id). Ha nem adott meg, lekérdezi.
 * @param dioceses        Opcionális: már lekérdezett egyházmegye metaadatok
 */
export async function getScopeFinancialData(
  supabase: SupabaseClient,
  congregationIds: string[],
  year: number,
  congregations?: CongregationLite[],
  dioceses?: DioceseLite[],
): Promise<ScopeFinancialData> {
  if (congregationIds.length === 0) {
    return emptyData(year)
  }

  // 1) Bevétel és kiadás párhuzamos lekérdezése az adott évre
  const yearStart = `${year}-01-01`
  const yearEndExclusive = `${year + 1}-01-01`

  // 2026-08-11 (K5-#10): a lekérdezés átvette a `calculateBalances`
  // (packages/ui-app/src/finance/helpers.ts) szemantikáját. Korábban CSAK a
  // `deleted`-re szűrt, ezért:
  //   (a) a STORNÓZOTT (érvénytelenített) tétel is beleszámított — egy stornózott
  //       8 000 lejes nyugta bevételként szerepelt a NYOMTATOTT Éves jelentés VI.
  //       szekciójában, miközben minden más hivatalos kimutatásból ki van zárva;
  //   (b) a BELSŐ MOZGÁS duplán számítódott — 50 000 lej kassza→bank átvezetés
  //       (1 kiadás + 1 bevétel) 50 000 lejjel több bevételt ÉS 50 000 lejjel több
  //       kiadást mutatott, mint a Pénzügy modul ugyanarra az évre;
  //   (c) a nyers `osszeg` (deviza!) összegződött a RON-ekvivalens helyett;
  //   (d) lapozatlan volt (lásd `fetchAllPagedRows`).
  // MARADÉK (tudatosan): a `calculateBalances` a belső mozgást a `belso_mozgas_xkey`
  // MELLETT a belső CÉL-KÓD (3xx/4xx, legacy 100.xx) alapján is kizárja. Az itteni
  // szűrő csak az xkey-t nézi, mert a kód-szűréshez cél-join kellene; a régi,
  // IMPORTÁLT (xkey nélküli, csak kód-alapú) belső mozgások ezért még benne
  // maradhatnak. Ha ez előjön, itt kell befizetescel/kiadascel embed-et bevezetni.
  const [bevRes, kiaRes, congRes, dioRes] = await Promise.all([
    fetchAllPagedRows<BefitetesAggRow>(
      supabase
        .from('befizetes')
        .select('id, congregation_id, osszeg, osszeg_ron')
        .in('congregation_id', congregationIds)
        .gte('datum', yearStart)
        .lt('datum', yearEndExclusive)
        .or('deleted.eq.false,deleted.is.null')
        .eq('stornozott', false)
        .is('belso_mozgas_xkey', null)
        .order('id', { ascending: true }),
    ),
    fetchAllPagedRows<KiadasAggRow>(
      supabase
        .from('kiadas')
        .select('id, congregation_id, osszeg, osszeg_ron')
        .in('congregation_id', congregationIds)
        .gte('datum', yearStart)
        .lt('datum', yearEndExclusive)
        .or('deleted.eq.false,deleted.is.null')
        .eq('stornozott', false)
        .is('belso_mozgas_xkey', null)
        .order('id', { ascending: true }),
    ),
    congregations
      ? Promise.resolve({ data: congregations, error: null })
      : supabase
          .from('congregations')
          .select('id, name, nev_hu, diocese_id')
          .in('id', congregationIds),
    dioceses
      ? Promise.resolve({ data: dioceses, error: null })
      : supabase.from('dioceses').select('id, name'),
  ])

  // 2026-08-11 (K5-#10): a néma 0 HELYETT hangos hiba. Ez az aggregátor táplálja a
  // NYOMTATOTT Éves jelentés VI. „Pénzügyi helyzet" szekcióját — egy csendes
  // nullás táblázat aláírt hivatalos dokumentumba kerülhetne. A hívó
  // (`generateAnnualReportPreview`) try/catch-ben van, tehát a lelkész ezt a
  // szöveget kapja hibaüzenetként.
  if (bevRes.error || kiaRes.error || congRes.error) {
    const detail = bevRes.error?.message || kiaRes.error?.message || congRes.error?.message || ''
    throw new Error(
      `A pénzügyi adatok összesítése nem sikerült, ezért az Éves jelentés VI. szekciója nem készíthető el. ` +
        `Próbáld újra néhány perc múlva; ha újra hibázik, jelezd a rendszergazdának${detail ? ` (részlet: ${detail})` : ''}.`,
    )
  }
  if (dioRes.error) {
    // Az egyházmegye-nevek csak CÍMKÉK — a hiányuk nem torzít összeget, ezért
    // ettől nem buktatjuk el a jelentést („Egyházmegye nélkül" felirat marad).
    console.warn('[scope-financial] az egyházmegye-nevek lekérdezése hibázott:', dioRes.error.message)
  }

  // 2) Aggregáció gyülekezet-szintre
  const bevByCong = aggregateByCongregation(bevRes.data as BefitetesAggRow[])
  const kiaByCong = aggregateByCongregation(kiaRes.data as KiadasAggRow[])

  const dioMap = new Map<string, string>()
  for (const d of (dioRes.data as DioceseLite[]) || []) {
    dioMap.set(d.id, d.name)
  }

  // 3) Gyülekezet-szintű sorok
  const byCongregation: ScopeFinancialCongregationRow[] = []
  for (const c of (congRes.data as CongregationLite[]) || []) {
    const bev = bevByCong.get(c.id) || 0
    const kia = kiaByCong.get(c.id) || 0
    byCongregation.push({
      congregationId: c.id,
      congregationName: c.nev_hu || c.name || 'Ismeretlen gyülekezet',
      dioceseId: c.diocese_id,
      dioceseName: c.diocese_id ? dioMap.get(c.diocese_id) || null : null,
      bevetel: bev,
      kiadas: kia,
      egyenleg: bev - kia,
    })
  }

  // Csökkenő sorrend: a legtöbb bevétellel kezdve
  byCongregation.sort((a, b) => b.bevetel - a.bevetel)

  // 4) Egyházmegye-szintű bontás
  const dioAgg = new Map<string, ScopeFinancialDioceseRow>()
  for (const row of byCongregation) {
    const key = row.dioceseId || '__none__'
    let agg = dioAgg.get(key)
    if (!agg) {
      agg = {
        dioceseId: row.dioceseId,
        dioceseName: row.dioceseName || 'Egyházmegye nélkül',
        congregationCount: 0,
        bevetel: 0,
        kiadas: 0,
        egyenleg: 0,
      }
      dioAgg.set(key, agg)
    }
    agg.congregationCount += 1
    agg.bevetel += row.bevetel
    agg.kiadas += row.kiadas
    agg.egyenleg += row.egyenleg
  }
  const byDiocese = Array.from(dioAgg.values()).sort((a, b) => b.bevetel - a.bevetel)

  // 5) Teljes aggregátum
  const total = byCongregation.reduce(
    (acc, r) => {
      acc.bevetel += r.bevetel
      acc.kiadas += r.kiadas
      acc.egyenleg += r.egyenleg
      return acc
    },
    { bevetel: 0, kiadas: 0, egyenleg: 0, congregationCount: byCongregation.length },
  )

  return { total, byDiocese, byCongregation, year }
}

function aggregateByCongregation(
  rows: Array<{ congregation_id: string | null; osszeg: number | string; osszeg_ron?: number | string | null }>,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const r of rows) {
    if (!r.congregation_id) continue
    // 2026-08-11 (K5-#10): a könyvelés RON-ban folyik — a RON-ekvivalenst
    // (`osszeg_ron`) adjuk össze, nem a nyers deviza-összeget. RON-számlán a
    // kettő azonos, ezért a fallback bit-azonos a korábbi viselkedéssel.
    const value = Number(r.osszeg_ron ?? r.osszeg) || 0
    map.set(r.congregation_id, (map.get(r.congregation_id) || 0) + value)
  }
  return map
}

function emptyData(year: number): ScopeFinancialData {
  return {
    total: { bevetel: 0, kiadas: 0, egyenleg: 0, congregationCount: 0 },
    byDiocese: [],
    byCongregation: [],
    year,
  }
}
