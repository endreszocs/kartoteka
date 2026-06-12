/**
 * Éves jelentés (C1 modul) automatikus aggregátor.
 *
 * A 10 szekciós hivatalos lelkészi éves jelentés adatait gyűjti össze a
 * meglévő modulokból egyetlen `AnnualReportSnapshot` struktúrába. A user a
 * UI-ban átnézheti, módosíthatja, és jóváhagyhatja.
 *
 * SZEKCIÓK:
 *   I.    Gyülekezet adatai (congregations + profiles)
 *   II.   Istentiszteleti élet (munkanaplo: kategoria='szolgalat')
 *   III.  Kazuáliák (keresztseg, hazassag, temetes, konfirmalas)
 *   IV.   Lelki élet (felhasználói szöveg + munkanaplo katekézis)
 *   V.    Katekézis (munkanaplo: kategoria='katekezis')
 *   VI.   Pénzügyi helyzet (befizetes, kiadas)
 *   VII.  Presbitérium (presbiter + szemely JOIN)
 *   VIII. Egyházi vagyon (leltar_tetelek)
 *   IX.   Iskolaügy (egyelőre üres — nincs iskola modul)
 *   X.    Egyéb (felhasználói szabad szöveg)
 *
 * A meglévő aggregátorokat újrahasználjuk:
 *  - lib/dashboard/scope-financial.ts → VI. szekció
 *  - lib/dashboard/scope-vital.ts → III. szekció
 *  - Közvetlen DB lekérdezés a többiekhez
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { calculateRentalDebts } from '@/lib/finance/rental-calculation'
import { getScopeFinancialData } from '@/lib/dashboard/scope-financial'
import { getScopeVitalStats } from '@/lib/dashboard/scope-vital'

// ─────────────────────────────────────────────────────────────────────
// Snapshot típus — ez kerül a annual_reports.snapshot_data jsonb mezőbe
// ─────────────────────────────────────────────────────────────────────

export interface AnnualReportSnapshot {
  // I. Gyülekezet adatai
  szekcio1_gyulekezet: {
    name: string
    nev_hu: string | null
    nev_ro: string | null
    cim: string | null
    email: string | null
    telefon: string | null
    egyhazmegye: string | null
    diocese_name: string | null
    lelkipasztor: string | null
    esperes: string | null
    /** 2026-06-10 (átvilágítás P2-1): aktív nyilvántartott tagok száma a tagnyilvántartásból */
    lelekszam: number | null
  }

  // II. Istentiszteleti élet
  szekcio2_istentisztelet: {
    osszesAlkalom: number
    atlagJelenlet: number
    perselyOsszesen: number
    typusBontas: Array<{ tipus: string; alkalom: number; jelenlet: number; persely: number }>
    havibontas: Array<{ honap: number; alkalom: number; jelenlet: number; persely: number }>
  }

  // III. Kazuáliák
  szekcio3_kazualiak: {
    keresztseg: number
    hazassag: number
    temetes: number
    konfirmalas: number
    osszes: number
  }

  // IV. Lelki élet (szabadszöveges + statisztika a katekézis-konfirmáció előtti felkészülésről)
  szekcio4_lelkielet: {
    szoveg: string | null
    konfirmaltakSzama: number // = szekcio3.konfirmalas
  }

  // V. Katekézis
  szekcio5_katekezis: {
    osszesAlkalom: number
    osszesJelenlet: number
    typusBontas: Array<{ tipus: string; alkalom: number; jelenlet: number }>
  }

  // VI. Pénzügyi helyzet
  szekcio6_penzugy: {
    bevetel: number
    kiadas: number
    egyenleg: number
  }

  // VII. Presbitérium
  szekcio7_presbiterium: {
    presbiterekSzama: number
    nevek: Array<{ nev: string; tisztseg: string }>
  }

  // VIII. Egyházi vagyon
  szekcio8_vagyon: {
    teljesertek: number
    teteleSzama: number
    kategoriaBontas: Array<{ kategoria: string; tetel: number; ertek: number }>
  }

  // IX. Iskolaügy (egyelőre nincs)
  szekcio9_iskolaUgy: {
    szoveg: string | null
  }

  // X. Egyéb (felhasználói szabadszöveg)
  szekcio10_egyeb: {
    szoveg: string | null
  }

  // Metaadat
  meta: {
    year: number
    generatedAt: string // ISO timestamp
    note: string // pl. "Auto-generated, please review"
  }
}

// ─────────────────────────────────────────────────────────────────────
// Belső típusok
// ─────────────────────────────────────────────────────────────────────

interface MunkanaploRow {
  idopont: string | null
  jellege: string | null
  kategoria: string | null
  jelenlet_ferfi: number | null
  jelenlet_no: number | null
  jelenlet_gyermek: number | null
  jelenlet_osszesen: number | null
  persely: number | null
}

interface PresbiterJoinRow {
  tisztseg: string
  szemely: { csaladnev: string | null; k_nev: string | null } | { csaladnev: string | null; k_nev: string | null }[] | null
}

interface LeltarRow {
  kategoria: string
  beszerzesi_ertek: number | null
  mennyiseg: number | null
}

interface CongregationFullRow {
  id: string
  name: string
  nev_hu: string | null
  nev_ro: string | null
  cim: string | null
  email: string | null
  telefon: string | null
  egyhazmegye: string | null
  diocese_id: string | null
}

interface ProfileLite {
  full_name: string | null
  role: string | null
  congregation_id: string | null
  diocese_id: string | null
}

// ─────────────────────────────────────────────────────────────────────
// Fő aggregátor függvény
// ─────────────────────────────────────────────────────────────────────

export async function buildAnnualReportData(
  supabase: SupabaseClient,
  congregationId: string,
  year: number,
  options?: {
    /** Egy meglévő snapshot — ha létezik, a felhasználói szabadszövegeket
     *  átveszi (szekcio4, szekcio9, szekcio10). */
    previousSnapshot?: Partial<AnnualReportSnapshot>
  },
): Promise<AnnualReportSnapshot> {
  const yearStart = `${year}-01-01`
  const yearEndExclusive = `${year + 1}-01-01`

  // 1) Párhuzamos lekérdezések
  const [
    congregationRes,
    profilesRes,
    munkanaploRes,
    presbiterRes,
    leltarRes,
    financialData,
    vitalStats,
    szemelyRes,
  ] = await Promise.all([
    // Gyülekezet
    supabase
      .from('congregations')
      .select('id, name, nev_hu, nev_ro, cim, email, telefon, egyhazmegye, diocese_id')
      .eq('id', congregationId)
      .maybeSingle(),
    // Profilok (lelkipásztor + esperes)
    supabase
      .from('profiles')
      .select('full_name, role, congregation_id, diocese_id')
      .or(`congregation_id.eq.${congregationId},role.in.(esperes,egyhazmegyei_admin)`),
    // Munkanapló (szolgalat + katekezis)
    // 2026-06-12 (Endre #3 munkanapló): a soft-delete-elt sorok kizárása —
    // korábban a törölt bejegyzések is beszámítottak az éves jelentésbe.
    // Fallback: ha a `deleted` oszlop még nem létezik (2026-06-12c SQL előtt),
    // szűrő nélkül kérdezünk.
    (async () => {
      const base = () => supabase
        .from('munkanaplo')
        .select('idopont, jellege, kategoria, jelenlet_ferfi, jelenlet_no, jelenlet_gyermek, jelenlet_osszesen, persely')
        .eq('congregation_id', congregationId)
        .gte('idopont', yearStart)
        .lt('idopont', yearEndExclusive)
      const res = await base().eq('deleted', false)
      if (res.error && (res.error.message || '').toLowerCase().includes('deleted')) {
        return base()
      }
      return res
    })(),
    // Presbitérium
    supabase
      .from('presbiter')
      .select('tisztseg, szemely:szemely!presbiter_id_szemely_fk(csaladnev, k_nev)')
      .eq('szemely.congregation_id', congregationId),
    // Leltár (jelenlegi állapot, nem évhez kötött)
    supabase
      .from('leltar_tetelek')
      .select('kategoria, beszerzesi_ertek, mennyiseg')
      .eq('congregation_id', congregationId),
    // Pénzügyi (a B4.5-ös aggregátorral)
    getScopeFinancialData(supabase, [congregationId], year),
    // Kazuáliák (a B4.5-ös aggregátorral)
    getScopeVitalStats(supabase, [congregationId], year),
    // Lélekszám (2026-06-10, átvilágítás P2-1): aktív nyilvántartott tagok
    supabase
      .from('szemely')
      .select('meghalt, elkoltozott, member_status')
      .eq('congregation_id', congregationId)
      .eq('isvisible', true),
  ])

  // 2) Diocese név (ha van diocese_id)
  let dioceseName: string | null = null
  if (congregationRes.data?.diocese_id) {
    const { data: dio } = await supabase
      .from('dioceses')
      .select('name')
      .eq('id', congregationRes.data.diocese_id)
      .maybeSingle()
    dioceseName = dio?.name || null
  }

  const congregation = (congregationRes.data || null) as CongregationFullRow | null
  const profiles = (profilesRes.data || []) as ProfileLite[]

  // I. Gyülekezet adatai
  const lelkipasztor = profiles.find(
    p => p.congregation_id === congregationId && p.role === 'lelkesz',
  )
  const esperes = profiles.find(
    p => p.role === 'esperes' && p.diocese_id === congregation?.diocese_id,
  )

  // Lélekszám (2026-06-10, átvilágítás P2-1): élő, el nem költözött, ki nem
  // tért, nem törölt látható tagok száma — az I. szekció hivatalos rubrikája.
  type SzemelyLite = { meghalt: boolean | null; elkoltozott: boolean | null; member_status: string | null }
  const lelekszam = ((szemelyRes.data || []) as SzemelyLite[]).filter(s =>
    !s.meghalt
    && !s.elkoltozott
    && !['elhunyt', 'elköltözött', 'elkoltozott', 'kitért', 'törölt'].includes(s.member_status || ''),
  ).length

  const szekcio1: AnnualReportSnapshot['szekcio1_gyulekezet'] = {
    name: congregation?.name || 'Ismeretlen gyülekezet',
    nev_hu: congregation?.nev_hu || null,
    nev_ro: congregation?.nev_ro || null,
    cim: congregation?.cim || null,
    email: congregation?.email || null,
    telefon: congregation?.telefon || null,
    egyhazmegye: congregation?.egyhazmegye || dioceseName,
    diocese_name: dioceseName,
    lelkipasztor: lelkipasztor?.full_name || null,
    esperes: esperes?.full_name || null,
    lelekszam,
  }

  // II + V. Munkanapló bontás
  const munkanaploRows = (munkanaploRes.data || []) as MunkanaploRow[]
  const szolgalatRows = munkanaploRows.filter(m => m.kategoria === 'szolgalat')
  const katekezisRows = munkanaploRows.filter(m => m.kategoria === 'katekezis')

  const szekcio2 = aggregateWorklogCategory(szolgalatRows)
  const szekcio5_typus = aggregateWorklogTypeOnly(katekezisRows)
  const szekcio2_havibontas = aggregateWorklogMonthly(szolgalatRows, year)

  const szekcio2_istentisztelet: AnnualReportSnapshot['szekcio2_istentisztelet'] = {
    osszesAlkalom: szekcio2.osszesAlkalom,
    atlagJelenlet: szekcio2.atlagJelenlet,
    perselyOsszesen: szekcio2.perselyOsszesen,
    typusBontas: szekcio2.typusBontas,
    havibontas: szekcio2_havibontas,
  }

  const szekcio5_katekezis: AnnualReportSnapshot['szekcio5_katekezis'] = {
    osszesAlkalom: szekcio5_typus.reduce((sum, t) => sum + t.alkalom, 0),
    osszesJelenlet: szekcio5_typus.reduce((sum, t) => sum + t.jelenlet, 0),
    typusBontas: szekcio5_typus,
  }

  // III. Kazuáliák (a vital aggregátorból)
  const vitalForCong = vitalStats.byCongregation.find(c => c.congregationId === congregationId)
  const szekcio3_kazualiak: AnnualReportSnapshot['szekcio3_kazualiak'] = {
    keresztseg: vitalForCong?.keresztseg || 0,
    hazassag: vitalForCong?.hazassag || 0,
    temetes: vitalForCong?.temetes || 0,
    konfirmalas: vitalForCong?.konfirmalas || 0,
    osszes: vitalForCong?.total || 0,
  }

  // IV. Lelki élet (felhasználói szöveg)
  const szekcio4_lelkielet: AnnualReportSnapshot['szekcio4_lelkielet'] = {
    szoveg: options?.previousSnapshot?.szekcio4_lelkielet?.szoveg || null,
    konfirmaltakSzama: szekcio3_kazualiak.konfirmalas,
  }

  // VI. Pénzügyi (a financial aggregátorból)
  const finForCong = financialData.byCongregation.find(c => c.congregationId === congregationId)
  const szekcio6_penzugy: AnnualReportSnapshot['szekcio6_penzugy'] = {
    bevetel: finForCong?.bevetel || 0,
    kiadas: finForCong?.kiadas || 0,
    egyenleg: finForCong?.egyenleg || 0,
  }

  // VII. Presbitérium
  const presbiterRows = (presbiterRes.data || []) as PresbiterJoinRow[]
  const presbiterNevek: Array<{ nev: string; tisztseg: string }> = []
  for (const p of presbiterRows) {
    const sz = Array.isArray(p.szemely) ? p.szemely[0] : p.szemely
    if (!sz) continue
    const nev = `${sz.csaladnev || ''} ${sz.k_nev || ''}`.trim()
    if (nev) {
      presbiterNevek.push({ nev, tisztseg: p.tisztseg })
    }
  }
  const szekcio7_presbiterium: AnnualReportSnapshot['szekcio7_presbiterium'] = {
    presbiterekSzama: presbiterNevek.length,
    nevek: presbiterNevek.sort((a, b) => a.nev.localeCompare(b.nev, 'hu')),
  }

  // VIII. Leltár
  const leltarRows = (leltarRes.data || []) as LeltarRow[]
  const kategoriaMap = new Map<string, { tetel: number; ertek: number }>()
  let leltarOsszesertek = 0
  for (const item of leltarRows) {
    const cat = item.kategoria || 'Egyéb'
    const ertek = (Number(item.beszerzesi_ertek) || 0) * (Number(item.mennyiseg) || 1)
    let agg = kategoriaMap.get(cat)
    if (!agg) {
      agg = { tetel: 0, ertek: 0 }
      kategoriaMap.set(cat, agg)
    }
    agg.tetel += 1
    agg.ertek += ertek
    leltarOsszesertek += ertek
  }
  const szekcio8_vagyon: AnnualReportSnapshot['szekcio8_vagyon'] = {
    teljesertek: leltarOsszesertek,
    teteleSzama: leltarRows.length,
    kategoriaBontas: Array.from(kategoriaMap.entries())
      .map(([kategoria, { tetel, ertek }]) => ({ kategoria, tetel, ertek }))
      .sort((a, b) => b.ertek - a.ertek),
  }

  // IX + X. Felhasználói szövegek
  const szekcio9_iskolaUgy: AnnualReportSnapshot['szekcio9_iskolaUgy'] = {
    szoveg: options?.previousSnapshot?.szekcio9_iskolaUgy?.szoveg || null,
  }
  const szekcio10_egyeb: AnnualReportSnapshot['szekcio10_egyeb'] = {
    szoveg: options?.previousSnapshot?.szekcio10_egyeb?.szoveg || null,
  }

  return {
    szekcio1_gyulekezet: szekcio1,
    szekcio2_istentisztelet,
    szekcio3_kazualiak,
    szekcio4_lelkielet,
    szekcio5_katekezis,
    szekcio6_penzugy,
    szekcio7_presbiterium,
    szekcio8_vagyon,
    szekcio9_iskolaUgy,
    szekcio10_egyeb,
    meta: {
      year,
      generatedAt: new Date().toISOString(),
      note: 'Automatikusan generálva. Kérjük, ellenőrizze és módosítsa szükség szerint.',
    },
  }
}

// ─────────────────────────────────────────────────────────────────────
// Segédfüggvények
// ─────────────────────────────────────────────────────────────────────

function attendanceFor(row: MunkanaploRow): number {
  // Ha az `osszesen` ki van töltve, azt használjuk; egyébként összeadjuk a
  // férfi/nő/gyermek értékeket
  if (row.jelenlet_osszesen) return Number(row.jelenlet_osszesen)
  return (
    (Number(row.jelenlet_ferfi) || 0) +
    (Number(row.jelenlet_no) || 0) +
    (Number(row.jelenlet_gyermek) || 0)
  )
}

function aggregateWorklogCategory(rows: MunkanaploRow[]) {
  const typusMap = new Map<string, { alkalom: number; jelenlet: number; persely: number }>()
  let osszesAlkalom = 0
  let osszesJelenlet = 0
  let perselyOsszesen = 0

  for (const row of rows) {
    const tipus = row.jellege || 'Egyéb'
    const att = attendanceFor(row)
    const persely = Number(row.persely) || 0

    osszesAlkalom += 1
    osszesJelenlet += att
    perselyOsszesen += persely

    let agg = typusMap.get(tipus)
    if (!agg) {
      agg = { alkalom: 0, jelenlet: 0, persely: 0 }
      typusMap.set(tipus, agg)
    }
    agg.alkalom += 1
    agg.jelenlet += att
    agg.persely += persely
  }

  const atlagJelenlet = osszesAlkalom > 0 ? Math.round(osszesJelenlet / osszesAlkalom) : 0
  const typusBontas = Array.from(typusMap.entries())
    .map(([tipus, agg]) => ({ tipus, ...agg }))
    .sort((a, b) => b.alkalom - a.alkalom)

  return { osszesAlkalom, atlagJelenlet, perselyOsszesen, typusBontas }
}

function aggregateWorklogTypeOnly(rows: MunkanaploRow[]) {
  const typusMap = new Map<string, { alkalom: number; jelenlet: number }>()
  for (const row of rows) {
    const tipus = row.jellege || 'Egyéb'
    const att = attendanceFor(row)
    let agg = typusMap.get(tipus)
    if (!agg) {
      agg = { alkalom: 0, jelenlet: 0 }
      typusMap.set(tipus, agg)
    }
    agg.alkalom += 1
    agg.jelenlet += att
  }
  return Array.from(typusMap.entries())
    .map(([tipus, agg]) => ({ tipus, ...agg }))
    .sort((a, b) => b.alkalom - a.alkalom)
}

function aggregateWorklogMonthly(rows: MunkanaploRow[], year: number) {
  const result: Array<{ honap: number; alkalom: number; jelenlet: number; persely: number }> = []
  for (let m = 1; m <= 12; m++) {
    const monthPrefix = `${year}-${String(m).padStart(2, '0')}`
    const monthRows = rows.filter(r => (r.idopont || '').startsWith(monthPrefix))
    if (monthRows.length === 0) continue
    result.push({
      honap: m,
      alkalom: monthRows.length,
      jelenlet: monthRows.reduce((sum, r) => sum + attendanceFor(r), 0),
      persely: monthRows.reduce((sum, r) => sum + (Number(r.persely) || 0), 0),
    })
  }
  return result
}

// Re-export hogy a calculateRentalDebts is elérhető legyen ha kell
export { calculateRentalDebts }
