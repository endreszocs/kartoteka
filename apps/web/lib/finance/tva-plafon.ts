/**
 * TVA (ÁFA) plafon figyelő — számítási logika.
 *
 * Ez a modul server-oldalon hívható. A UI a `tva-actions.ts` Server Action
 * alapján fogja majd elérni.
 *
 * ALAPELV: naptári éves kumulált forgalom (Codul fiscal art. 310). A rendszer
 * csak azokat a bevételeket számolja, amelyek `szamadasicel.tva_plafonba_szamit = true`
 * flag-gel vannak ellátva (seed: 2026-04-16-wc1-2-tva-seed.sql).
 *
 * COMODAT kivétel: a berleti_szerzodes.jogi_tipus = 'comodat' szerződések
 * definíció szerint nem generálnak befizetést (osszeg=0), így a szűrésben
 * automatikusan nem jelennek meg. A jogi_tipus mező inkább az e-Factura
 * kiállítás és a UI jelzésekhez fontos (WC-2).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  TVA_PLAFON_RON,
  tvaFigyelmeztetesSzint,
  type TvaBeszamitoTetel,
  type TvaPlafonResult,
} from './tva-plafon-constants'

/**
 * 2026-08-11 (K5-#9): LAPOZÓ segéd. A PostgREST NÉMÁN 1000 sorra vágja a
 * választ — egy nagyobb gyülekezetnél a plafonba számító befizetések éves
 * sorszáma ezt átlépheti, és a küszöb ALULMÉRŐDNE (a jogszabályi
 * bejelentési kötelezettséget pont a magas érték váltaná ki). A hívónak
 * KÖTELEZŐ determinisztikus rendezést (`.order('id')`) adnia, különben a
 * lapok átfedhetnek vagy kihagyhatnak sorokat.
 * Minta: lib/dashboard/scope-financial.ts (2026-08-11, K5-#10).
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

/**
 * Kiszámítja a TVA-plafon felé történő gyülekezeti forgalmat egy adott évre.
 *
 * @param supabase Server-side Supabase kliens
 * @param congregationId A cél gyülekezet UUID-ja
 * @param year Az év, amelyre számolunk. Alapértelmezett: aktuális naptári év.
 * @returns `TvaPlafonResult` — összesített adat a UI-nak
 */
export async function calculateTvaPlafon(
  supabase: SupabaseClient,
  congregationId: string,
  year: number = new Date().getFullYear(),
): Promise<TvaPlafonResult> {
  const yearStart = `${year}-01-01`
  const yearEndExclusive = `${year + 1}-01-01`

  // 1. Lekérdezés a gyülekezetről — már TVA-alany-e?
  // 2026-08-11 (K5-#9): az `error` eddig el volt dobva, így egy hibás lekérdezés
  // némán „még nem TVA-alany"-t adott, és a figyelő fölöslegesen riasztott volna
  // egy már bejelentkezett gyülekezetnél. A modul többi lekérdezése is dob —
  // a hívó (`penzugy/tva-actions.ts`) try/catch-ben van, és magyar hibaszöveget mutat.
  const { data: congregationRow, error: congError } = await supabase
    .from('congregations')
    .select('tva_alany')
    .eq('id', congregationId)
    .maybeSingle()

  if (congError) {
    throw new Error(
      `A gyülekezet TVA-státuszát nem sikerült lekérdezni, ezért a plafon-figyelő adata félrevezető lenne. ` +
        `Próbáld újra néhány perc múlva; ha újra hibázik, jelezd a rendszergazdának (részlet: ${congError.message}).`,
    )
  }

  const maris_tva_alany = Boolean(congregationRow?.tva_alany)

  // 2. A `befizetescel` sorokat JOIN-oljuk a `szamadasicel`-lel, hogy csak a
  //    plafonba számító kódokat nézzük. A befizetescel.id_szamadasicel →
  //    szamadasicel.id (FK). Csak ott, ahol tva_plafonba_szamit = true.
  const { data: plafonbaCelek, error: celError } = await supabase
    .from('befizetescel')
    .select('id, id_szamadasicel, szamadasicel:szamadasicel(id, nev, tva_plafonba_szamit, tva_mentesseg_hivatkozas)')
    .eq('aktiv', true)

  if (celError) {
    throw new Error(`Hiba a befizetescel lekérdezésekor: ${celError.message}`)
  }

  type CelRow = {
    id: number
    id_szamadasicel: string
    szamadasicel:
      | { id: string; nev: string; tva_plafonba_szamit: boolean; tva_mentesseg_hivatkozas: string | null }
      | { id: string; nev: string; tva_plafonba_szamit: boolean; tva_mentesseg_hivatkozas: string | null }[]
      | null
  }

  // Kiszűrjük a plafonba számítókat
  const celekPlafonba = ((plafonbaCelek ?? []) as unknown as CelRow[])
    .map((row) => {
      const sc = Array.isArray(row.szamadasicel) ? row.szamadasicel[0] : row.szamadasicel
      if (!sc || !sc.tva_plafonba_szamit) return null
      return {
        befizetescelId: row.id,
        szamadasicelKod: sc.id,
        celNev: sc.nev,
        jogszabalyiHivatkozas: sc.tva_mentesseg_hivatkozas,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  // Ha nincs plafonba számító célkód (pl. nem futott a seed), üres eredmény
  if (celekPlafonba.length === 0) {
    return {
      year,
      szamoltForgalomRon: 0,
      tvaPlafonRon: TVA_PLAFON_RON,
      szazalek: 0,
      szint: 'nyugodt',
      beszamitoTetelek: [],
      utolsoFrissites: new Date().toISOString(),
      maris_tva_alany,
    }
  }

  const befizetescelIds = celekPlafonba.map((c) => c.befizetescelId)

  // 3. Befizetések lekérdezése az adott évre, congregation-ra, csak a plafonba
  //    számító célkódokon. A `datum` mezőt használjuk (naptári év), nem a
  //    `fizetettev` mezőt — a Codul fiscal a teljesítés éve alapján számol.
  //
  // 2026-08-11 (K5-#9) HÁROM JAVÍTÁS EGY LEKÉRDEZÉSBEN:
  //  (a) STORNÓ: eddig csak a `deleted`-re szűrt, ezért az érvénytelenített
  //      (stornózott) tétel is beleszámított a 300 000 lejes küszöbbe. Egy
  //      stornózott 60 000 lejes bérleti számla „kritikus" szintre vitte a
  //      jelzést, és HAMIS TVA-regisztrációs riasztást adott.
  //  (b) DEVIZA: a nyers `osszeg` olvasása devizás számlánál ALULMÉRT —
  //      3 000 EUR/hó bérleti díj 36 000-ként számolódott ~179 000 lej helyett,
  //      vagyis a gyülekezet 12%-ot látott 60% helyett, és elmulaszthatta a
  //      jogszabályi bejelentést. A hivatalos lej-érték az `osszeg_ron`
  //      (RON-számlán a kettő azonos → a fallback bit-azonos a régi értékkel).
  //  (c) LAPOZÁS: a lekérdezés lapozatlan volt (lásd `fetchAllPagedRows`).
  type BefRow = {
    id_befizetescel: number
    osszeg: number | string
    /** RON-ekvivalens: devizás tételnél az átváltott (hivatalos) lej-érték. */
    osszeg_ron?: number | string | null
  }

  const { data: befizetesek, error: befError } = await fetchAllPagedRows<BefRow>(
    supabase
      .from('befizetes')
      .select('id, id_befizetescel, osszeg, osszeg_ron')
      .eq('congregation_id', congregationId)
      .eq('deleted', false)
      .eq('stornozott', false)
      .gte('datum', yearStart)
      .lt('datum', yearEndExclusive)
      .in('id_befizetescel', befizetescelIds)
      .order('id', { ascending: true }),
  )

  if (befError) {
    throw new Error(`Hiba a befizetes lekérdezésekor: ${befError.message}`)
  }

  // 4. Összesítés kategóriánként
  const osszesitoMap = new Map<number, number>()
  for (const row of befizetesek) {
    const ossz = Number(row.osszeg_ron ?? row.osszeg) || 0
    const prev = osszesitoMap.get(row.id_befizetescel) ?? 0
    osszesitoMap.set(row.id_befizetescel, prev + ossz)
  }

  const beszamitoTetelek: TvaBeszamitoTetel[] = []
  let szamoltForgalomRon = 0

  for (const cel of celekPlafonba) {
    const osszesen = osszesitoMap.get(cel.befizetescelId) ?? 0
    if (osszesen === 0) continue // üres kategóriákat kihagyjuk
    beszamitoTetelek.push({
      szamadasicelKod: cel.szamadasicelKod,
      celNev: cel.celNev,
      osszesen,
      jogszabalyiHivatkozas: cel.jogszabalyiHivatkozas,
    })
    szamoltForgalomRon += osszesen
  }

  // Nagyság szerint sorba rendezés — a UI a legnagyobb kategóriát mutassa elől
  beszamitoTetelek.sort((a, b) => b.osszesen - a.osszesen)

  const szazalek = TVA_PLAFON_RON > 0
    ? Math.round((szamoltForgalomRon / TVA_PLAFON_RON) * 1000) / 10
    : 0

  const szint = tvaFigyelmeztetesSzint(szazalek)

  return {
    year,
    szamoltForgalomRon,
    tvaPlafonRon: TVA_PLAFON_RON,
    szazalek,
    szint,
    beszamitoTetelek,
    utolsoFrissites: new Date().toISOString(),
    maris_tva_alany,
  }
}

/**
 * Segéd függvény: lekérdezi a plafonba számító szamadasicel kódok listáját
 * egyetlen lekérdezéssel (ha csak a célok kellenek, nem a konkrét összegek).
 *
 * A UI "Beállítások" szekció használhatja például egy választó legördülőhöz.
 */
export async function getTvaPlafonbaSzamitoCelok(
  supabase: SupabaseClient,
): Promise<Array<{ id: string; nev: string; tva_mentesseg_hivatkozas: string | null }>> {
  const { data, error } = await supabase
    .from('szamadasicel')
    .select('id, nev, tva_mentesseg_hivatkozas')
    .eq('tva_plafonba_szamit', true)
    .order('id')

  if (error) throw new Error(`Hiba a szamadasicel lekérdezésekor: ${error.message}`)
  return data ?? []
}
