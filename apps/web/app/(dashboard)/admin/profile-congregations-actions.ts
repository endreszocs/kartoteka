'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  assertCongregationInScope,
  darabolIdListat,
  getAdminDistrictScope,
  getScopedCongregationIdsResult,
} from '@/lib/auth/admin-scope'
import { canReadDioceseScope, resolveDioceseReadScopeIds } from '@/lib/auth/level-scope'
import { feladoMezok } from '@/lib/notifications/felado'
import { insertErtesites } from '@/lib/notifications/ertesites-insert'

/**
 * profile_congregations hozzárendelések kezelése — admin / kerületi admin oldali actions.
 *
 * Alapelv (gyülekezeti autonómia):
 * Az admin/kerületi admin **kezdeményezhet** könyvelő vagy számvevő hozzárendelést egy
 * gyülekezethez, de a hozzáférés `pending` státusszal jön létre. A gyülekezet lelkésze
 * az /profile/kapcsolatok oldalon jóváhagyja vagy elutasítja a kérést.
 *
 * A lelkész explicit jóváhagyása nélkül az érintett könyvelő/számvevő NEM lát adatot.
 */

export type AssignmentRoleScope = 'konyvelo' | 'egyhazmegyei_szamvevo'

export type AssignmentRow = {
  id: string
  profile_id: string
  congregation_id: string
  role_scope: AssignmentRoleScope
  approval_status: 'pending' | 'approved' | 'rejected' | 'revoked'
  approval_reason: string | null
  assigned_by: string
  assigned_at: string
  approved_at: string | null
  approved_by: string | null
  active: boolean
  revoked_at: string | null
  revoked_by: string | null
  revoked_reason: string | null
  // JOIN-ok
  profile_full_name: string | null
  profile_email: string | null
  profile_role: string
  congregation_name: string | null
}

/**
 * Lista minden hozzárendelésről, opcionális szűréssel.
 * Jogosultság: admin, egyházkerületi admin, esperes, egyházmegyei admin (CSAK olvasás).
 * A szerepkör KIOSZTÁSA viszont csak admin / egyházkerületi admin jogosultsága
 * (lásd `createAssignment`, `revokeAssignment`).
 */
export async function listAssignments(options?: {
  congregationId?: string
  profileId?: string
  status?: 'pending' | 'approved' | 'rejected' | 'revoked'
  /**
   * 2026-08-22 (4/D): a KÉPERNYŐN LÁTOTT egyházmegyére szűrés.
   *
   * A megyei irányítópult „Szerepkörök" füle eddig PARAMÉTER NÉLKÜL hívta ezt a
   * listázót, ezért egy kerületi admin egy MEGYEI képernyőn a TELJES kerülete
   * hozzárendeléseit látta — a felirat és a tartalom széthúzott.
   *
   * Ez a szűrő SZŰKÍT, nem tágít: a hatókör-szűrővel METSZETET képez, tehát
   * idegen megye azonosítójával sem lehet vele több adathoz jutni.
   */
  dioceseId?: string
}): Promise<{ data?: AssignmentRow[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  // 2026-08-15 FIX (S1 biztonsági szelet, 0.5): a megyei szint eddig CSAK a
  // skalár profiles.role-ból dőlt el — a profile_roles-only esperes (akinek a
  // skalárja pl. `lelkesz`) hibát kapott, és a megyei dashboard függő
  // hozzárendelés-listája némán üres maradt (fail-closed divergencia, nem
  // szivárgás). A canReadDioceseScope a skalár ÉS a profile_roles lábat is
  // ismeri, és a számvevőt is beengedi (csak listázás — a kiosztás/visszavonás
  // továbbra is admin / kerületi admin joga, lásd createAssignment).
  const isDioceseLevel = canReadDioceseScope(access)
  if (!access.admin && !access.egyhazkeruletiAdmin && !isDioceseLevel) {
    return { error: 'Nincs jogosultsága a listázáshoz.' }
  }

  const supabase = access.supabase

  /**
   * A lekérdezés ÚJRAÉPÍTHETŐ formában — a PostgREST-builder egyszer használatos,
   * a 414-védelmi darabolás viszont darabonként egy-egy friss lekérdezést kér.
   */
  const buildQuery = (congIds?: string[]) => {
    let q = supabase
      .from('profile_congregations')
      .select(`
        id, profile_id, congregation_id, role_scope, approval_status, approval_reason,
        assigned_by, assigned_at, approved_at, approved_by, active,
        revoked_at, revoked_by, revoked_reason,
        profile:profiles!profile_congregations_profile_id_fkey(full_name, email, role),
        congregation:congregations(nev_hu, name)
      `)
    if (options?.congregationId) q = q.eq('congregation_id', options.congregationId)
    if (options?.profileId) q = q.eq('profile_id', options.profileId)
    if (options?.status) q = q.eq('approval_status', options.status)
    // ⚠️ ÜRES tömbbel SOHA nem hívjuk (a hívó előbb kizárja): az `.in([])`
    // lefutna, 0 sort adna, és HIBA NÉLKÜL néma üres listát mutatna. Fail-closed:
    // ha valaha mégis idejutna, HANGOSAN dobunk, nem hazudunk „nincs adat"-ot.
    if (congIds !== undefined) {
      if (congIds.length === 0) {
        throw new Error('Belső hiba: üres gyülekezet-szűrővel indult a hozzárendelés-lekérdezés.')
      }
      q = q.in('congregation_id', congIds)
    }
    return q.order('assigned_at', { ascending: false })
  }

  /**
   * A gyülekezet-szűrő. `null` = NINCS szűrés (korlátlan admin).
   *
   * ⚠️ HIBAOSZTÁLY, amit itt javítunk (2026-08-22): a korábbi kód
   * `if (scopedCongIds) query = query.in(...)` volt. Az ÜRES TÖMB JS-ben
   * TRUTHY, tehát az `.in([])` LEFUTOTT, 0 sort adott — HIBA NÉLKÜL. A képernyő
   * azt állította, hogy „nincs hozzárendelés", miközben a valóság az volt, hogy
   * a hatókört nem sikerült feloldani. Ezért az üres tömböt mostantól KÜLÖN
   * kezeljük, és az okot BESZÉDES hibaüzenetben adjuk vissza.
   */
  let congIdFilter: string[] | null = null

  // #2: a KERÜLETI admin (de nem a teljes admin / nem az esperes-szintű) csak a
  // saját egyházkerülete gyülekezeteinek hozzárendeléseit lássa.
  if (access.egyhazkeruletiAdmin && !access.admin) {
    const keruletiScope = await getScopedCongregationIdsResult(access)
    if (!keruletiScope.feloldhato) {
      return {
        error:
          'Az egyházkerületi hatókörét most nem sikerült feloldani, ezért nem tudjuk megmutatni a hozzárendeléseket. ' +
          'Próbálja újra; ha újra előjön, jelezze a rendszergazdának.' +
          (keruletiScope.hiba ? ` (Részlet: ${keruletiScope.hiba})` : ''),
      }
    }
    if (keruletiScope.indok === 'nincs_kerulet') {
      return {
        error:
          'Nincs feloldható egyházkerületi hatóköre, ezért nem listázhatók a hozzárendelések. ' +
          'Kérje a rendszergazdát, hogy állítsa be az egyházkerületét.',
      }
    }
    if (keruletiScope.ids && keruletiScope.ids.length === 0) {
      return {
        error:
          'Az egyházkerületéhez jelenleg egyetlen gyülekezet sincs hozzárendelve, ezért nincs mit listázni.',
      }
    }
    congIdFilter = metszHatokort(congIdFilter, keruletiScope.ids)
  } else if (isDioceseLevel && !access.admin) {
    // 2026-08-09: az esperes / egyházmegyei admin ág eddig SZŰRETLENÜL futott
    // (csak az RLS korlátozta, ami bármikor elcsúszhat) — mostantól explicit
    // a feloldott egyházmegye gyülekezeteire szűrünk. FAIL-CLOSED: feloldható
    // egyházmegye nélkül üres lista, nem szűretlen lekérdezés.
    // 2026-08-15 (S1, 0.3): a hatókör a SZEREP-SZŰRT olvasói feloldóból jön —
    // a tág feloldó az elavult skalárt szerep nélkül is bevette volna.
    // 2026-08-22: a néma üres lista helyett BESZÉDES üzenet (lásd fent).
    const dioceseIds = resolveDioceseReadScopeIds(access)
    if (dioceseIds.length === 0) {
      return {
        error:
          'Nincs feloldható egyházmegyei hatóköre, ezért nem listázhatók a hozzárendelések. ' +
          'Kérje a rendszergazdát, hogy állítsa be az egyházmegyéjét.',
      }
    }
    const { data: congs, error: congErr } = await supabase
      .from('congregations')
      .select('id')
      .in('diocese_id', dioceseIds)
    if (congErr) return { error: congErr.message }
    const congIds = (congs ?? []).map((c) => c.id as string)
    if (congIds.length === 0) {
      return {
        error: 'Az egyházmegyéjéhez jelenleg egyetlen gyülekezet sincs hozzárendelve, ezért nincs mit listázni.',
      }
    }
    congIdFilter = metszHatokort(congIdFilter, congIds)
  }

  // A KÉPERNYŐN LÁTOTT egyházmegye (opcionális) — METSZET a hatókörrel.
  if (options?.dioceseId) {
    const { data: megyeCongs, error: megyeErr } = await supabase
      .from('congregations')
      .select('id')
      .eq('diocese_id', options.dioceseId)
    if (megyeErr) return { error: megyeErr.message }
    const megyeIds = (megyeCongs ?? []).map((c) => c.id as string)
    // Itt az üres lista TÉNY, nem „nem tudjuk": a lekérdezés sikerült, és az
    // egyházmegyéhez nem tartozik gyülekezet.
    if (megyeIds.length === 0) return { data: [] }
    congIdFilter = metszHatokort(congIdFilter, megyeIds)
  }

  // 414-VÉDELEM: a `.in()` szűrő az URL-be kerül, ezért 80-asával darabolunk, és
  // a darabok eredményét fűzzük össze. Enélkül a fenti szűkítés a NÉMA ÜRES
  // LISTÁT egy nagy kerületben 414-es HIBÁRA fordította volna át.
  const nyersSorok: unknown[] = []
  if (congIdFilter === null) {
    const { data, error } = await buildQuery()
    if (error) return { error: error.message }
    nyersSorok.push(...(data ?? []))
  } else {
    if (congIdFilter.length === 0) return { data: [] }
    for (const darab of darabolIdListat(congIdFilter)) {
      const { data, error } = await buildQuery(darab)
      if (error) return { error: error.message }
      nyersSorok.push(...(data ?? []))
    }
  }

  type Row = {
    id: string
    profile_id: string
    congregation_id: string
    role_scope: AssignmentRoleScope
    approval_status: AssignmentRow['approval_status']
    approval_reason: string | null
    assigned_by: string
    assigned_at: string
    approved_at: string | null
    approved_by: string | null
    active: boolean
    revoked_at: string | null
    revoked_by: string | null
    revoked_reason: string | null
    profile: { full_name: string | null; email: string | null; role: string } | { full_name: string | null; email: string | null; role: string }[] | null
    congregation: { nev_hu: string | null; name: string | null } | { nev_hu: string | null; name: string | null }[] | null
  }

  const rows: AssignmentRow[] = (nyersSorok as Row[]).map((row) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile
    const cong = Array.isArray(row.congregation) ? row.congregation[0] : row.congregation
    return {
      id: row.id,
      profile_id: row.profile_id,
      congregation_id: row.congregation_id,
      role_scope: row.role_scope,
      approval_status: row.approval_status,
      approval_reason: row.approval_reason,
      assigned_by: row.assigned_by,
      assigned_at: row.assigned_at,
      approved_at: row.approved_at,
      approved_by: row.approved_by,
      active: row.active,
      revoked_at: row.revoked_at,
      revoked_by: row.revoked_by,
      revoked_reason: row.revoked_reason,
      profile_full_name: profile?.full_name ?? null,
      profile_email: profile?.email ?? null,
      profile_role: profile?.role ?? '',
      congregation_name: cong?.nev_hu || cong?.name || null,
    }
  })

  // A darabolás után a sorrendet ÚJRA elő kell állítani: az egyes darabok
  // önmagukban rendezettek, az összefűzött lista viszont nem.
  rows.sort((a, b) => (b.assigned_at || '').localeCompare(a.assigned_at || ''))

  return { data: rows }
}

/**
 * Két hatókör-lista METSZETE. `null` = „nincs szűrés ezen a lábon", tehát a
 * másik láb dönt. SOHA nem tágít — ez a szabály a legkönnyebben esik vissza egy
 * későbbi refaktorban („logikusnak" tűnik uniózni).
 */
function metszHatokort(a: string[] | null, b: string[] | null): string[] | null {
  if (a === null) return b === null ? null : [...b]
  if (b === null) return [...a]
  const halmaz = new Set(b)
  return a.filter((x) => halmaz.has(x))
}

/**
 * Új hozzárendelés kezdeményezése (pending).
 * Értesítés jön létre a gyülekezet lelkészének.
 *
 * FIX 2026-05-04: az insert/update most SECURITY DEFINER RPC-n
 * (admin_create_or_reinit_assignment) megy, hogy a kerületi admin is
 * tudjon szerepkört kiosztani RLS/GRANT problémák nélkül. A validációk
 * az RPC-ben történnek; a TS oldalon csak a target profile lekérdezés
 * (read-only) marad az értesítés-küldéshez.
 */
// 2026-06-07: a `warning` mezővel jelezzük, ha a hozzárendelés sikeres volt, de
// a lelkész értesítése nem ment ki (best-effort) — az admin tudjon róla.
export async function createAssignment(args: {
  profileId: string
  congregationId: string
  roleScope: AssignmentRoleScope
  reason: string
}): Promise<{ success?: boolean; error?: string; assignmentId?: string; warning?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  // JS-szintű előzetes check (a végleges védelem az RPC-ben)
  if (!access.admin && !access.egyhazkeruletiAdmin) {
    return { error: 'Szerepkör kiosztása csak rendszergazdai vagy egyházkerületi admin jogosultsággal lehetséges.' }
  }
  // #2: kerületi admin csak a saját kerülete gyülekezetéhez rendelhet könyvelőt/számvevőt.
  try {
    await assertCongregationInScope(access, args.congregationId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nincs jogosultsága ehhez a gyülekezethez.' }
  }

  const supabase = access.supabase

  // SECURITY DEFINER RPC — minden validáció és UPSERT egy hívásban
  const { data: rpcRes, error: rpcErr } = await supabase
    .rpc('admin_create_or_reinit_assignment', {
      p_profile_id: args.profileId,
      p_congregation_id: args.congregationId,
      p_role_scope: args.roleScope,
      p_reason: args.reason,
    })
    .single()

  if (rpcErr) return { error: `Hiba: ${rpcErr.message}` }

  const result = rpcRes as
    | { assignment_id: string; action: string; was_reactivated: boolean }
    | null

  if (!result?.assignment_id) {
    return { error: 'Az RPC nem adott vissza assignment_id-t.' }
  }

  // Értesítés a lelkésznek (best-effort, read-only target profile)
  let warning: string | undefined
  try {
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', args.profileId)
      .maybeSingle()

    const notif = await sendPastorNotification(supabase, {
      congregationId: args.congregationId,
      assignmentId: result.assignment_id,
      targetProfileId: args.profileId,
      targetFullName: targetProfile?.full_name ?? null,
      targetEmail: targetProfile?.email ?? null,
      roleScope: args.roleScope,
      reason: args.reason.trim(),
    })
    if (!notif.ok) {
      warning =
        'A hozzárendelés létrejött, de a lelkész értesítése nem ment ki — érdemes személyesen szólni neki.'
    }
  } catch {
    warning =
      'A hozzárendelés létrejött, de a lelkész értesítése nem ment ki — érdemes személyesen szólni neki.'
  }

  revalidatePath('/admin')
  return { success: true, assignmentId: result.assignment_id, warning }
}

/**
 * Admin visszavonása egy approved hozzárendelésnek.
 * A lelkészi oldal is tud visszavonni, de az admin is visszavonhatja (pl. kilépett könyvelő).
 *
 * FIX 2026-05-04: SECURITY DEFINER RPC (admin_revoke_assignment) — kerületi
 * admin is használhatja RLS/GRANT problémák nélkül.
 */
export async function revokeAssignment(args: {
  assignmentId: string
  reason: string
}): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  // JS-szintű előzetes check (a végleges védelem az RPC-ben)
  if (!access.admin && !access.egyhazkeruletiAdmin) {
    return { error: 'Szerepkör visszavonása csak rendszergazdai vagy egyházkerületi admin jogosultsággal lehetséges.' }
  }

  const supabase = access.supabase

  // #2: kerületi admin csak a saját kerülete gyülekezetéből vonhat vissza
  // hozzárendelést — előbb feloldjuk az assignment gyülekezetét.
  try {
    const { data: assignmentRow } = await supabase
      .from('profile_congregations')
      .select('congregation_id')
      .eq('id', args.assignmentId)
      .maybeSingle()
    if (!assignmentRow?.congregation_id) return { error: 'A hozzárendelés nem található.' }
    await assertCongregationInScope(access, assignmentRow.congregation_id as string)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nincs jogosultsága ehhez a hozzárendeléshez.' }
  }

  const { data: rpcRes, error: rpcErr } = await supabase
    .rpc('admin_revoke_assignment', {
      p_assignment_id: args.assignmentId,
      p_reason: args.reason,
    })
    .single()

  if (rpcErr) return { error: `Hiba: ${rpcErr.message}` }

  const result = rpcRes as { assignment_id: string; was_revoked: boolean } | null
  if (!result) {
    return { error: 'Az RPC nem adott vissza eredményt.' }
  }

  revalidatePath('/admin')
  revalidatePath('/dashboard-egyhazmegye')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Értesítés helper — a lelkésznek, amikor új pending kérés érkezik
// ---------------------------------------------------------------------------

type Supabase = Awaited<ReturnType<typeof createClient>>

async function sendPastorNotification(
  supabase: Supabase,
  args: {
    congregationId: string
    assignmentId: string
    /** A hozzáférést kérő profil — ő az üzenet FELADÓJA (2026-09-05). */
    targetProfileId: string
    targetFullName: string | null
    targetEmail: string | null
    roleScope: AssignmentRoleScope
    reason: string
  },
) {
  // 1. Gyülekezet lelkésze (első találat)
  const { data: pastor } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('congregation_id', args.congregationId)
    .eq('role', 'lelkesz')
    .eq('status', 'active')
    .maybeSingle()

  if (!pastor?.id) return { ok: true } // nincs lelkész — az értesítés kihagyható (nem hiba)

  const targetName = args.targetFullName || args.targetEmail || 'Egy új felhasználó'
  const roleLabel = args.roleScope === 'konyvelo' ? 'könyvelő' : 'egyházmegyei számvevő'

  // 2026-06-07: az insert HIBÁJÁT is ellenőrizzük — eddig némán elbukhatott
  // (a lelkész nem kapott értesítést, és senki nem tudott róla). Most a hívó
  // figyelmeztetést tud adni az adminnak.
  const ertesites = await insertErtesites(
    supabase,
    {
      user_id: pastor.id,
      congregation_id: args.congregationId,
      cim: `Hozzáférési kérés: ${roleLabel}`,
      uzenet:
        `${targetName} ${roleLabel} szerepkörben szeretne hozzáférni a gyülekezeted pénzügyi adataihoz. ` +
        `Indok: "${args.reason}". ` +
        `A te engedélyed nélkül nem fogja látni a gyülekezet adatait. ` +
        `Nézd át a kérést a Profilom oldaladon.`,
      tipus: 'info',
      hivatkozas: '/profile/kapcsolatok',
      // A feladó a hozzáférést kérő felhasználó (a nevében kéri az admin).
      ...feladoMezok('felhasznalo', targetName, args.targetProfileId),
    },
    { forras: 'admin-hozzarendeles' },
  )
  if (ertesites.error) return { ok: false }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Segéd: konyvelo és szamvevo szerepkörű aktív felhasználók listája
// ---------------------------------------------------------------------------

export async function listAssignableUsers(): Promise<{
  data?: Array<{ id: string; full_name: string | null; email: string | null; role: string }>
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  // Csak admin / egyházkerületi admin oszthat szerepkört (új ALAPELV 2026-04-17)
  if (!access.admin && !access.egyhazkeruletiAdmin) {
    return { error: 'Nincs jogosultsága.' }
  }

  const { data, error } = await access.supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .in('role', ['konyvelo', 'egyhazmegyei_szamvevo'])
    .eq('status', 'active')
    .order('full_name')

  if (error) return { error: error.message }
  return { data: data ?? [] }
}

/**
 * Gyülekezetek listája a hozzárendelés-formhoz. Ha kerületi admin, csak a saját
 * kerülete alatti gyülekezetek (a RLS is szűri, de explicit jobb).
 */
export async function listCongregationsForAssignment(): Promise<{
  data?: Array<{ id: string; nev_hu: string | null; name: string | null; diocese_id: string | null }>
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  // Csak admin / egyházkerületi admin oszthat szerepkört (új ALAPELV 2026-04-17)
  if (!access.admin && !access.egyhazkeruletiAdmin) {
    return { error: 'Nincs jogosultsága.' }
  }

  // Egyházkerületi admin: csak a saját kerülete alatti gyülekezetek.
  // 2026-08-09 FIX: a hatókör a feloldott district-scope (profile_roles +
  // profiles.district_id fallback, getAdminDistrictScope) — korábban a NULL
  // profiles.district_id-s kerületi admin átcsúszott a korlátlan admin ágra
  // és a TELJES gyülekezet-listát kapta. FAIL-CLOSED: hatókör nélkül üres lista.
  if (access.egyhazkeruletiAdmin && !access.admin) {
    const { districtIds } = getAdminDistrictScope(access)
    if (districtIds.length === 0) return { data: [] }

    const { data, error } = await access.supabase
      .from('congregations')
      .select('id, nev_hu, name, diocese_id, dioceses!inner(district_id)')
      .in('dioceses.district_id', districtIds)
      .order('nev_hu')

    if (error) return { error: error.message }
    return { data: (data ?? []).map((c) => ({ id: c.id, nev_hu: c.nev_hu, name: c.name, diocese_id: c.diocese_id })) }
  }

  // Admin vagy master — minden
  const { data, error } = await access.supabase
    .from('congregations')
    .select('id, nev_hu, name, diocese_id')
    .order('nev_hu')

  if (error) return { error: error.message }
  return { data: data ?? [] }
}
