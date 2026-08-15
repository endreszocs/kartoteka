'use server'

import { revalidatePath } from 'next/cache'

import { getEffectiveAccessContext, getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import {
  canReadDioceseScope,
  resolveDioceseReadScopeIds,
  resolveDioceseScopeIds,
} from '@/lib/auth/level-scope'
import {
  buildAnnualReportData,
  type AnnualReportSnapshot,
} from '@/lib/annual-report/generator'

// ─────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────

export interface AnnualReportRow {
  id: string
  congregation_id: string
  year: number
  status: 'draft' | 'submitted' | 'received' | 'reviewed' | 'finalized'
  members_count: number
  services_count: number
  total_income: number
  pastor_note: string | null
  snapshot_data: AnnualReportSnapshot
  submitted_at: string | null
  submitted_by: string | null
  received_at: string | null
  received_by: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  review_notes: string | null
  finalized_at: string | null
  finalized_by: string | null
  forwarded_to_kerulet: boolean
  forwarded_at: string | null
  updated_at: string | null
  deleted: boolean
}

// ─────────────────────────────────────────────────────────────────
// Saját gyülekezeti műveletek
// ─────────────────────────────────────────────────────────────────

/**
 * Az aktuális gyülekezet éves jelentésének LEKÉRDEZÉSE adott évre.
 * Ha még nincs, null jön vissza (a UI majd a generate-et hívja).
 */
export async function getAnnualReport(year: number): Promise<{ data?: AnnualReportRow | null; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data, error } = await supabase
    .from('annual_reports')
    .select('*')
    .eq('congregation_id', congregationId)
    .eq('year', year)
    .eq('deleted', false)
    .maybeSingle()

  if (error) return { error: `Lekérés sikertelen: ${error.message}` }
  return { data: (data as AnnualReportRow | null) ?? null }
}

/**
 * A gyülekezet historikus éves jelentéseinek LISTÁZÁSA.
 * Visszaadja az összes nem törölt jelentést év szerint csökkenő sorrendben.
 */
export async function listAnnualReports(): Promise<{ data?: AnnualReportRow[]; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data, error } = await supabase
    .from('annual_reports')
    .select('*')
    .eq('congregation_id', congregationId)
    .eq('deleted', false)
    .order('year', { ascending: false })

  if (error) return { error: `Lekérés sikertelen: ${error.message}` }
  return { data: (data || []) as AnnualReportRow[] }
}

/**
 * Az éves jelentés AUTO-GENERÁLÁSA a meglévő modulokból.
 *
 * Nem ír DB-be — csak a snapshot adatait számolja és adja vissza.
 * A felhasználó a UI-ban szerkesztheti, majd a `saveAnnualReport`-tel menti.
 *
 * Ha létezik korábbi (mentett) jelentés erre az évre, a felhasználói
 * szöveges szekciók (IV, IX, X) azokból átvevődnek.
 */
export async function generateAnnualReportPreview(
  year: number,
): Promise<{ snapshot?: AnnualReportSnapshot; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  // Nézzük meg, van-e már korábbi mentés (a user szövegeit átvesszük belőle)
  const { data: existing } = await supabase
    .from('annual_reports')
    .select('snapshot_data')
    .eq('congregation_id', congregationId)
    .eq('year', year)
    .eq('deleted', false)
    .maybeSingle()

  try {
    const snapshot = await buildAnnualReportData(supabase, congregationId, year, {
      previousSnapshot: (existing?.snapshot_data || undefined) as Partial<AnnualReportSnapshot> | undefined,
    })
    return { snapshot }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Aggregálás sikertelen.' }
  }
}

/**
 * Az éves jelentés MENTÉSE — DRAFT vagy SUBMITTED státusszal.
 *
 * - status 'draft': belső mentés, még szerkeszthető
 * - status 'submitted': beküldés esperesnek (értesítés a workflow-ban)
 *
 * UPSERT a (congregation_id, year) UNIQUE constraint alapján.
 */
export async function saveAnnualReport(input: {
  year: number
  snapshot: AnnualReportSnapshot
  pastorNote: string | null
  asStatus: 'draft' | 'submitted'
}): Promise<{ success?: true; reportId?: string; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  // Cache mezők: a snapshotból kiolvassuk a fő számokat
  const members_count = input.snapshot.szekcio7_presbiterium.presbiterekSzama // proxy: presbiterek
  const services_count = input.snapshot.szekcio2_istentisztelet.osszesAlkalom
  const total_income = input.snapshot.szekcio6_penzugy.bevetel

  // Először nézzük, létezik-e már sor (csak nem törölt)
  const { data: existing } = await supabase
    .from('annual_reports')
    .select('id, status')
    .eq('congregation_id', congregationId)
    .eq('year', input.year)
    .eq('deleted', false)
    .maybeSingle()

  // submitted_at és submitted_by csak akkor frissül, ha a státusz most submitted lesz
  // (vagy korábban draft volt és most submitted-re vált)
  const becomesSubmitted = input.asStatus === 'submitted' && (!existing || existing.status === 'draft')

  const payload: Record<string, unknown> = {
    congregation_id: congregationId,
    year: input.year,
    status: input.asStatus,
    members_count,
    services_count,
    total_income,
    pastor_note: input.pastorNote,
    snapshot_data: input.snapshot,
  }

  if (becomesSubmitted) {
    payload.submitted_at = new Date().toISOString()
    payload.submitted_by = user.id
  }

  if (existing) {
    // UPDATE
    const { error } = await supabase
      .from('annual_reports')
      .update(payload)
      .eq('id', existing.id)
    if (error) return { error: `Mentés sikertelen: ${error.message}` }
    revalidatePath('/eves-jelentes')
    return { success: true, reportId: existing.id }
  }

  // INSERT — az új sornál a submitted_* mezőket akkor töltjük, ha azonnal submitted
  if (input.asStatus === 'submitted') {
    payload.submitted_at = new Date().toISOString()
    payload.submitted_by = user.id
  }

  const { data: inserted, error } = await supabase
    .from('annual_reports')
    .insert(payload)
    .select('id')
    .single()

  if (error) return { error: `Mentés sikertelen: ${error.message}` }
  revalidatePath('/eves-jelentes')
  return { success: true, reportId: inserted.id }
}

// ─────────────────────────────────────────────────────────────────
// Esperesi műveletek
// ─────────────────────────────────────────────────────────────────

/**
 * Az adott egyházmegyébe tartozó beérkezett éves jelentések LISTÁZÁSA.
 *
 * Csak esperes / egyházmegyei admin / admin / master láthatja.
 */
export async function getDioceseAnnualReports(
  year: number,
): Promise<{ data?: Array<AnnualReportRow & { congregation_name: string | null }>; error?: string }> {
  // A teljes access context kell a hatókör-feloldáshoz
  const access = await getEffectiveAccessContext()
  const { supabase, admin, master } = access

  // 2026-08-11 (számvevő-kör) + 2026-08-15 (S1): OLVASÓ kapu — a korábbi
  // esperes/admin/master feltétel szigorú BŐVÍTÉSE az egyházmegyei számvevővel
  // (az adatbázis is engedi: annual_reports_szamvevo_select).
  if (!canReadDioceseScope(access)) {
    return { error: 'Nincs jogosultsága az egyházmegyei jelentések megtekintéséhez.' }
  }

  // 2026-08-15 FIX (S1 biztonsági szelet, 0.3): SZEREP-SZŰRT olvasói hatókör a
  // tág feloldó helyett. A tág változat a kerületi admin elavult
  // `profiles.diocese_id` skalárját szerep nélkül is elfogadta — így akár MÁSIK
  // kerület megyéjének éves jelentéseit listázta. FAIL-CLOSED: feloldható
  // hatókör nélkül ÜRES lista; szűretlenül csak a master/rendszergazda láthat.
  const dioceseIds = resolveDioceseReadScopeIds(access)
  if (dioceseIds.length === 0 && !master && !admin) {
    return { data: [] }
  }

  let query = supabase
    .from('annual_reports')
    .select('*, congregations(name, nev_hu)')
    .eq('year', year)
    .eq('deleted', false)
    .neq('status', 'draft') // esperes csak a beküldött, fogadott, ellenőrzött, véglegesített jelentéseket látja
    .order('submitted_at', { ascending: false })

  // Nem master/rendszergazda: csak a saját (szerep-szűrt) egyházmegye-hatókör
  // gyülekezetei — több megyés tisztségviselőnél az unió.
  if (!master && !admin) {
    const { data: congs } = await supabase
      .from('congregations')
      .select('id')
      .in('diocese_id', dioceseIds)
    const congIds = (congs || []).map(c => c.id)
    if (congIds.length === 0) return { data: [] }
    query = query.in('congregation_id', congIds)
  }

  const { data, error } = await query
  if (error) return { error: `Lekérés sikertelen: ${error.message}` }

  // Lapostegy a congregations.name-et
  const enriched = (data || []).map(row => {
    type WithCong = AnnualReportRow & { congregations?: { name: string | null; nev_hu: string | null } | null }
    const r = row as WithCong
    return {
      ...(row as AnnualReportRow),
      congregation_name: r.congregations?.nev_hu || r.congregations?.name || null,
    }
  })

  return { data: enriched }
}

/**
 * Az éves jelentés státusz előrelépés (esperesi workflow):
 *   submitted → received → reviewed → finalized
 *
 * Csak esperes / egyházmegyei admin / admin / master hívhatja.
 */
export async function updateAnnualReportStatus(input: {
  id: string
  newStatus: 'received' | 'reviewed' | 'finalized'
  reviewNotes?: string | null
}): Promise<{ success?: true; error?: string }> {
  const access = await getEffectiveAccessContext()
  const { supabase, esperes, admin, master } = access
  if (!esperes && !admin && !master) {
    return { error: 'Nincs jogosultsága a státusz módosításához.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  // 2026-08-09: tulajdon-ellenőrzés — a kliens által küldött jelentés-id
  // gyülekezetének a hívó (feloldott) egyházmegyéjébe kell tartoznia
  // (master/rendszergazda kivétel). Korábban bármely esperes bármely
  // gyülekezet jelentésének státuszát átállíthatta (az RLS állapotától függően).
  if (!master && !admin) {
    // 2026-08-09 (review-fix): a teljes hatókör-unió (két egyházmegyés tisztségviselő)
    const dioceseIds = resolveDioceseScopeIds(access)
    if (dioceseIds.length === 0) {
      return { error: 'Nincs egyházmegye rendelve a fiókjához — a státusz nem módosítható.' }
    }
    const { data: report, error: reportErr } = await supabase
      .from('annual_reports')
      .select('congregation_id, congregations!inner(diocese_id)')
      .eq('id', input.id)
      .maybeSingle()
    if (reportErr) return { error: `Hiba a jelentés ellenőrzésekor: ${reportErr.message}` }
    if (!report) return { error: 'A jelentés nem található.' }
    const congRel = (report as { congregations?: { diocese_id: string | null } | { diocese_id: string | null }[] | null }).congregations
    const reportDioceseId = Array.isArray(congRel)
      ? congRel[0]?.diocese_id ?? null
      : congRel?.diocese_id ?? null
    if (!reportDioceseId || !dioceseIds.includes(reportDioceseId)) {
      return { error: 'Ez a jelentés nem az Ön egyházmegyéjének gyülekezetéhez tartozik.' }
    }
  }

  const now = new Date().toISOString()
  const payload: Record<string, unknown> = {
    status: input.newStatus,
  }

  if (input.newStatus === 'received') {
    payload.received_at = now
    payload.received_by = user.id
  } else if (input.newStatus === 'reviewed') {
    payload.reviewed_at = now
    payload.reviewed_by = user.id
    if (input.reviewNotes !== undefined) {
      payload.review_notes = input.reviewNotes
    }
  } else if (input.newStatus === 'finalized') {
    payload.finalized_at = now
    payload.finalized_by = user.id
  }

  // 2026-08-09: 0-soros update (RLS-elnyelés) = hiba, nem hamis siker
  const { data: updated, error } = await supabase
    .from('annual_reports')
    .update(payload)
    .eq('id', input.id)
    .select('id')

  if (error) return { error: `Státusz módosítás sikertelen: ${error.message}` }
  if (!updated || updated.length === 0) {
    return { error: 'A státusz módosítás nem történt meg — a jelentés nem található, vagy nincs jogosultsága hozzá.' }
  }

  revalidatePath('/eves-jelentes')
  revalidatePath('/dashboard-egyhazmegye')
  return { success: true }
}

/**
 * Véglegesített éves jelentés továbbítása az egyházkerület felé.
 */
export async function forwardAnnualReportToKerulet(
  id: string,
): Promise<{ success?: true; error?: string }> {
  const { supabase, esperes, admin, master } = await getEffectiveCongregationContext()
  if (!esperes && !admin && !master) {
    return { error: 'Nincs jogosultsága a továbbításhoz.' }
  }

  const { error } = await supabase
    .from('annual_reports')
    .update({
      forwarded_to_kerulet: true,
      forwarded_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'finalized') // csak véglegesített jelentés továbbítható

  if (error) return { error: `Továbbítás sikertelen: ${error.message}` }

  revalidatePath('/dashboard-egyhazmegye')
  revalidatePath('/dashboard-kerulet')
  return { success: true }
}
