import 'server-only'

/**
 * 2026-08-11 — HIVATALOS TISZTSÉGVISELŐK FELOLDÁSA RPC-N KERESZTÜL
 *
 * MIÉRT LÉTEZIK EZ A FÁJL
 * ───────────────────────
 * A `profiles` tábla RLS-policy-ja (`profiles_read`) 2026-08-10-ig
 * `USING (true)` volt: BÁRMELYIK bejelentkezett felhasználó elolvashatta az
 * ORSZÁG MINDEN profilját. A 2026-08-10-nyitott-rls-policyk-takaritas.sql ezt
 * lecserélte egy tíz ágú, hatókör-alapú feltételre — de a (10) ágat
 * SZÁNDÉKOSAN tágra hagyta: az aktív tisztségviselői profilok (lelkész,
 * esperes, megyei/kerületi admin, rendszergazda) továbbra is országosan
 * olvashatók maradtak, mert hat élő funkció épült rájuk, és mind NÉMÁN
 * degradálódott volna (üres címzettlista, üres név — nem hibaüzenet).
 *
 * Ez a modul azokat a hívásokat gyűjti egy helyre, és SECURITY DEFINER
 * RPC-kre vezeti vissza őket, amelyek CSAK a minimálisan szükséges oszlopokat
 * adják vissza (azonosító + megjelenítendő név + szerepkör — E-MAILT NEM).
 * Ezzel a (10) ág kivehető: migration-docs/sql/2026-08-11-profiles-szukites-rpc.sql
 *
 * DEPLOY-SORREND-FÜGGETLENSÉG
 * ───────────────────────────
 * Az RPC-k csak az SQL lefuttatása UTÁN léteznek. Amíg nincsenek meg, a
 * PostgREST „nincs ilyen függvény" hibát ad (PGRST202 / 42883). Ilyenkor a
 * függvények VISSZAESNEK a korábbi közvetlen `profiles`-lekérdezésre, amit a
 * még élő (10) ág kiszolgál. Így az app és az SQL bármilyen sorrendben
 * élesíthető. A minta forrása:
 * apps/web/app/(dashboard)/admin/egyeztetesek-actions.ts:30-34
 * (`isMissingFunctionError`).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** A PostgREST „nincs ilyen függvény" hibája = az SQL még nincs lefuttatva. */
export function isMissingRpcError(
  error: { code?: string; message?: string } | null | undefined,
  fnName: string,
): boolean {
  if (!error) return false
  if (error.code === 'PGRST202' || error.code === '42883') return true
  const m = (error.message || '').toLowerCase()
  return (
    m.includes(fnName.toLowerCase()) &&
    (m.includes('could not find') ||
      m.includes('does not exist') ||
      m.includes('schema cache'))
  )
}

export interface OfficialRow {
  /** profiles.id — az `ertesitesek.user_id`-be ez kerül. */
  userId: string
  /** Megjelenítendő név (lehet null, ha a profil még nem töltötte ki). */
  fullName: string | null
  /** profiles.role — 'lelkesz' | 'esperes' | 'egyhazmegyei_admin' | … */
  role: string | null
}

type RawOfficialRow = {
  user_id: string
  full_name: string | null
  role: string | null
}

/**
 * Egy MEGADOTT gyülekezet aktív, hivatalos tisztségviselői.
 *
 * Kiváltja a korábbi, nyitott `profiles`-olvasást ezeken a helyeken:
 *  · iktato/atadas-actions.ts               (a CÉL gyülekezet lelkészei)
 *  · lib/notifications/transfer-notifications-actions.ts (a FORRÁS gyülekezeté)
 *  · lib/annual-report/generator.ts         (a gyülekezet lelkipásztora)
 *  · penzugy/tva-actions.ts                 (a gyülekezet saját lelkészei)
 *
 * A visszaadott halmaz KÉT lábon áll (a `profiles.congregation_id` skalár és a
 * `profile_roles(scope='congregation')` szerepkör-hozzárendelés), így a csak
 * profile_roles-szal kötött társ-lelkész sem esik ki.
 *
 * FALLBACK (amíg az RPC nem létezik): a régi közvetlen lekérdezés — pontosan
 * az, ami eddig futott, beleértve a `profile_roles` külön kérdezését is.
 */
export async function getCongregationOfficials(
  supabase: SupabaseClient,
  congregationId: string,
  roles: string[] = ['lelkesz'],
): Promise<OfficialRow[]> {
  if (!congregationId) return []

  const { data, error } = await supabase.rpc('get_congregation_officials', {
    p_congregation_id: congregationId,
    p_roles: roles,
  })

  if (!error) {
    return ((data || []) as RawOfficialRow[]).map((r) => ({
      userId: r.user_id,
      fullName: r.full_name,
      role: r.role,
    }))
  }

  if (!isMissingRpcError(error, 'get_congregation_officials')) {
    // Valódi hiba (jogosultság, hálózat) — best-effort hívók üres listát várnak.
    console.warn('[officials] get_congregation_officials hiba:', error.message)
    return []
  }

  // ── FALLBACK: a 2026-08-11 ELŐTTI viselkedés, változatlanul ──
  const [profRes, roleRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('congregation_id', congregationId)
      .in('role', roles)
      .eq('status', 'active'),
    supabase
      .from('profile_roles')
      .select('profile_id')
      .eq('scope', 'congregation')
      .eq('scope_id', congregationId)
      .in('role', roles)
      .eq('approval_status', 'approved')
      .eq('active', true),
  ])

  const byId = new Map<string, OfficialRow>()
  for (const r of (profRes.data || []) as Array<{
    id: string
    full_name: string | null
    role: string | null
  }>) {
    byId.set(r.id, { userId: r.id, fullName: r.full_name, role: r.role })
  }
  for (const r of (roleRes.data || []) as Array<{ profile_id: string }>) {
    if (!byId.has(r.profile_id)) {
      byId.set(r.profile_id, { userId: r.profile_id, fullName: null, role: null })
    }
  }
  return Array.from(byId.values())
}

/**
 * Egy MEGADOTT egyházmegye aktív, hivatalos tisztségviselői
 * (alapértelmezésben: esperes + egyházmegyei admin).
 *
 * Kiváltja:
 *  · lib/annual-report/generator.ts  (az esperes neve az I. szekcióban)
 *  · penzugy/tva-actions.ts          (a TVA-riasztás megyei címzettjei)
 *
 * FALLBACK (amíg az RPC nem létezik): a régi, `diocese_id`-ra szűrt közvetlen
 * lekérdezés. ⚠️ A TVA-nál a RÉGI kód `diocese_id.not.is.null`-lal az ORSZÁG
 * minden esperesét bevette; a fallback itt már a megyére szűr — ez szándékos
 * javítás, lásd a migrációs fájl (B) megjegyzését.
 */
export async function getDioceseOfficials(
  supabase: SupabaseClient,
  dioceseId: string,
  roles: string[] = ['esperes', 'egyhazmegyei_admin'],
): Promise<OfficialRow[]> {
  if (!dioceseId) return []

  const { data, error } = await supabase.rpc('get_diocese_officials', {
    p_diocese_id: dioceseId,
    p_roles: roles,
  })

  if (!error) {
    return ((data || []) as RawOfficialRow[]).map((r) => ({
      userId: r.user_id,
      fullName: r.full_name,
      role: r.role,
    }))
  }

  if (!isMissingRpcError(error, 'get_diocese_officials')) {
    console.warn('[officials] get_diocese_officials hiba:', error.message)
    return []
  }

  // ── FALLBACK: a 2026-08-11 ELŐTTI viselkedés ──
  const { data: rows } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('diocese_id', dioceseId)
    .in('role', roles)
    .eq('status', 'active')

  return ((rows || []) as Array<{
    id: string
    full_name: string | null
    role: string | null
  }>).map((r) => ({ userId: r.id, fullName: r.full_name, role: r.role }))
}

export interface DisplayNameRow {
  userId: string
  fullName: string | null
  congregationId: string | null
  congregationName: string | null
}

type RawDisplayNameRow = {
  user_id: string
  full_name: string | null
  congregation_id: string | null
  congregation_name: string | null
}

/**
 * Megjelenítendő nevek egy azonosító-listához — E-MAIL NÉLKÜL.
 *
 * A Missziós Műhely (szándékosan országos, közösségi modul) ranglistáihoz és
 * projekt-csapataihoz. A hívó CSAK olyan azonosítókra kérdez, amelyeket az
 * `mm_*` közösségi táblákból már megkapott.
 *
 * FALLBACK (amíg az RPC nem létezik): a régi, kétlépcsős lekérdezés
 * (profiles → congregations).
 */
export async function getProfileDisplayNames(
  supabase: SupabaseClient,
  profileIds: string[],
): Promise<Map<string, DisplayNameRow>> {
  const unique = Array.from(new Set(profileIds.filter(Boolean)))
  const out = new Map<string, DisplayNameRow>()
  if (unique.length === 0) return out

  const { data, error } = await supabase.rpc('get_profile_display_names', {
    p_profile_ids: unique,
  })

  if (!error) {
    for (const r of (data || []) as RawDisplayNameRow[]) {
      out.set(r.user_id, {
        userId: r.user_id,
        fullName: r.full_name,
        congregationId: r.congregation_id,
        congregationName: r.congregation_name,
      })
    }
    return out
  }

  if (!isMissingRpcError(error, 'get_profile_display_names')) {
    console.warn('[officials] get_profile_display_names hiba:', error.message)
    return out
  }

  // ── FALLBACK: a 2026-08-11 ELŐTTI viselkedés ──
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, congregation_id')
    .in('id', unique)

  const rows = (profiles || []) as Array<{
    id: string
    full_name: string | null
    congregation_id: string | null
  }>
  const congIds = Array.from(
    new Set(rows.map((p) => p.congregation_id).filter((v): v is string => Boolean(v))),
  )
  const congMap = new Map<string, string>()
  if (congIds.length > 0) {
    const { data: congs } = await supabase
      .from('congregations')
      .select('id, nev_hu, name')
      .in('id', congIds)
    for (const c of (congs || []) as Array<{
      id: string
      nev_hu: string | null
      name: string | null
    }>) {
      congMap.set(c.id, c.nev_hu || c.name || '')
    }
  }

  for (const p of rows) {
    out.set(p.id, {
      userId: p.id,
      fullName: p.full_name,
      congregationId: p.congregation_id,
      congregationName: p.congregation_id ? congMap.get(p.congregation_id) ?? null : null,
    })
  }
  return out
}
