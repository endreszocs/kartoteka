'use server'

import { revalidatePath } from 'next/cache'
import {
  getEffectiveAccessContext,
  type EffectiveAccessContext,
} from '@/lib/auth/effective-access'
import { logAuditEvent } from '@/lib/audit/log'
import { getProfileDisplayNames } from '@/lib/profiles/officials'

/**
 * Lelkészi jóváhagyási workflow actions.
 *
 * Alapelv (gyülekezeti autonómia):
 * A gyülekezet lelkésze kizárólagosan jogosult eldönteni, hogy ki férhet hozzá
 * a gyülekezete adataihoz (könyvelő vagy egyházmegyei számvevő). A rendszer
 * értesíti, ha új kérés érkezik; ő jóváhagyja vagy elutasítja.
 *
 * A rendszergazda (admin) és a kerületi admin csak **kezdeményezhet** kérést,
 * de nem írhatja felül a lelkész döntését.
 */

/**
 * 2026-08-11 (K5-#13) — SKALÁR ⇄ PROFILE_ROLES DIVERGENCIA JAVÍTÁSA
 * ─────────────────────────────────────────────────────────────────
 * MI VOLT A HIBA: mind a négy action a SKALÁR `profiles.role`-ra
 * (`access.role !== 'lelkesz'`) és a SKALÁR `profiles.congregation_id`-ra
 * (`access.profile?.congregation_id`) épült, miközben a rendszerben a
 * ténylegesen aktív hatókört a profilváltóval kiválasztott `profile_roles` sor
 * adja (`access.effectiveCongregationId`). Két konkrét következmény:
 *
 *  (a) KÉT GYÜLEKEZETET SZOLGÁLÓ LELKÉSZ: a skalár szerint „A" gyülekezet, a
 *      profilváltóval viszont „B"-re váltott. Minden más modul B-t mutatta, ez
 *      a felület viszont A pending könyvelő-/számvevő-kéréseit listázta, és a
 *      jóváhagyás NÉMÁN A-ra írt. Rossz gyülekezethez adott hozzáférés.
 *  (b) TÁRS-LELKÉSZ, akinek csak `profile_roles` sora van (a skalár NULL):
 *      „Nincs gyülekezet hozzárendelve." — soha nem tudta jóváhagyni senki
 *      hozzáférését a SAJÁT gyülekezetéhez.
 *
 * MIÉRT HELYES: a `lib/auth/level-scope.ts` fejléce pontosan ezt a
 * hibaosztályt írja le, és a helyes feloldási sorrendet is: AKTÍV szerep →
 * profile_roles → skalár (csak fallback). Az `effectiveCongregationId` ezt már
 * elvégzi (effective-access.ts). FAIL-CLOSED marad: ha nincs feloldható
 * gyülekezet vagy nem lelkészi szerepben járunk el, a művelet elutasul.
 */
async function getPastorApprovalScope(): Promise<
  | { access: EffectiveAccessContext; userId: string; congregationId: string }
  | { error: string }
> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  const userId = access.user.id

  // Az AKTÍV szerepkör dönt; a legacy skalár csak akkor, ha nincs profile_roles sor.
  const activeRole = access.activeProfileRole?.role ?? null
  const isPastor = activeRole ? activeRole === 'lelkesz' : access.role === 'lelkesz'
  if (!isPastor) {
    return {
      error:
        'Ezt a hozzáférési kérést csak a gyülekezet lelkésze kezelheti. ' +
        'Ha több szerepköröd is van, válts vissza a lelkészi profilodra a fejléc profilváltójával.',
    }
  }

  const congregationId = access.effectiveCongregationId
  if (!congregationId) {
    return {
      error:
        'Nincs kiválasztott gyülekezet, ezért nem tudjuk, melyik gyülekezet nevében járnál el. ' +
        'Válaszd ki a gyülekezetet a fejléc profilváltójával, majd próbáld újra.',
    }
  }

  return { access, userId, congregationId }
}

export type PastorAssignmentRow = {
  id: string
  profile_id: string
  role_scope: 'konyvelo' | 'egyhazmegyei_szamvevo'
  approval_status: 'pending' | 'approved' | 'rejected' | 'revoked'
  approval_reason: string | null
  assigned_at: string
  assigned_by: string
  approved_at: string | null
  revoked_at: string | null
  revoked_reason: string | null
  target_full_name: string | null
  target_email: string | null
  initiator_full_name: string | null
}

/**
 * Lelkész saját gyülekezete érintő hozzáférési kéréseinek listája.
 * A RLS `profile_congregations_lelkesz_select` policy-ja biztosítja a szűrést,
 * de itt is explicit szűrünk a saját congregation_id-ra.
 */
export async function listMyCongregationAssignments(): Promise<{
  data?: PastorAssignmentRow[]
  error?: string
}> {
  const scope = await getPastorApprovalScope()
  if ('error' in scope) return { error: scope.error }
  const { access, congregationId } = scope

  const { data, error } = await access.supabase
    .from('profile_congregations')
    .select(`
      id, profile_id, role_scope, approval_status, approval_reason,
      assigned_at, assigned_by, approved_at, revoked_at, revoked_reason,
      target:profiles!profile_congregations_profile_id_fkey(full_name, email),
      initiator:profiles!profile_congregations_assigned_by_fkey(full_name)
    `)
    .eq('congregation_id', congregationId)
    .order('assigned_at', { ascending: false })

  if (error) return { error: error.message }

  type Row = {
    id: string
    profile_id: string
    role_scope: PastorAssignmentRow['role_scope']
    approval_status: PastorAssignmentRow['approval_status']
    approval_reason: string | null
    assigned_at: string
    assigned_by: string
    approved_at: string | null
    revoked_at: string | null
    revoked_reason: string | null
    target: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null
    initiator: { full_name: string | null } | { full_name: string | null }[] | null
  }

  const rawRows = (data ?? []) as unknown as Row[]

  // 2026-08-11 (K5) — ÜRES NÉV JAVÍTÁSA A `profiles` RLS SZŰKÍTÉSE UTÁN
  // ──────────────────────────────────────────────────────────────────
  // A `profil_lathato_e()` (2026-08-10 + 2026-08-11 migráció) egyetlen ága sem
  // engedi a lelkésznek egy `konyvelo` / `egyhazmegyei_szamvevo` profil
  // olvasását: a „hivatalos tisztségviselői névsor" ág felsorolása
  // (`lelkesz`, `esperes`, `egyhazmegyei_admin`, `egyhazkeruleti_admin`,
  // `admin`) NEM tartalmazza őket, a „azonos gyülekezet" ágak pedig a
  // `profiles.congregation_id`-t nézik — ami a könyvelőnél tipikusan NULL,
  // hiszen őt éppen a `profile_congregations` köti a gyülekezethez.
  // Ugyanez igaz a KEZDEMÉNYEZŐRE, ha az egy szervezeti mező nélküli
  // rendszergazda. Következmény: a PostgREST a beágyazott `target`/`initiator`
  // objektumot `null`-lal adja vissza, a felület pedig „Ismeretlen felhasználó"
  // feliratot mutat — a lelkésznek ismeretlen nevű embernek kellene hozzáférést
  // adnia a gyülekezete pénzügyeihez. Ez elfogadhatatlan döntési helyzet.
  //
  // MEGOLDÁS: a hiányzó neveket a `get_profile_display_names` SECURITY DEFINER
  // RPC-ből pótoljuk (nevet ad, e-mailt SZÁNDÉKOSAN nem). Ha az RPC még nincs
  // élesítve, a helper visszaesik a közvetlen lekérdezésre; ha úgy sem jön
  // név, beszédes magyar feliratot teszünk a helyére a néma üresség helyett.
  const hianyzoNevIdk = new Set<string>()
  for (const r of rawRows) {
    const target = Array.isArray(r.target) ? r.target[0] : r.target
    const init = Array.isArray(r.initiator) ? r.initiator[0] : r.initiator
    if (!target?.full_name) hianyzoNevIdk.add(r.profile_id)
    if (!init?.full_name && r.assigned_by) hianyzoNevIdk.add(r.assigned_by)
  }

  let potoltNevek = new Map<string, { fullName: string | null }>()
  if (hianyzoNevIdk.size > 0) {
    try {
      potoltNevek = await getProfileDisplayNames(access.supabase, Array.from(hianyzoNevIdk))
    } catch (e) {
      // A pótlás best-effort — a lista ettől még megjelenik (beszédes felirattal).
      console.warn('[kapcsolatok] a hiányzó nevek pótlása nem sikerült:', e)
    }
  }

  const NEV_NEM_LATHATO =
    'A kérelmező neve nem jeleníthető meg — kérd a rendszergazdától a beazonosítást'

  const rows: PastorAssignmentRow[] = rawRows.map((r) => {
    const target = Array.isArray(r.target) ? r.target[0] : r.target
    const init = Array.isArray(r.initiator) ? r.initiator[0] : r.initiator
    const targetNev =
      target?.full_name ?? potoltNevek.get(r.profile_id)?.fullName ?? null
    const initNev =
      init?.full_name ?? (r.assigned_by ? potoltNevek.get(r.assigned_by)?.fullName ?? null : null)
    return {
      id: r.id,
      profile_id: r.profile_id,
      role_scope: r.role_scope,
      approval_status: r.approval_status,
      approval_reason: r.approval_reason,
      assigned_at: r.assigned_at,
      assigned_by: r.assigned_by,
      approved_at: r.approved_at,
      revoked_at: r.revoked_at,
      revoked_reason: r.revoked_reason,
      // A felület sorrendje `target_full_name || target_email || 'Ismeretlen
      // felhasználó'` — ezért a beszédes feliratot CSAK akkor tesszük be, ha
      // e-mail sincs, különben az e-mail a jobb azonosító.
      target_full_name: targetNev ?? (target?.email ? null : NEV_NEM_LATHATO),
      target_email: target?.email ?? null,
      initiator_full_name: initNev,
    }
  })

  return { data: rows }
}

/**
 * Kérés jóváhagyása.
 * A lelkész explicit jóváhagyásával lép hatályba a hozzáférés.
 */
export async function approveAssignment(
  assignmentId: string,
): Promise<{ success?: boolean; error?: string }> {
  const scope = await getPastorApprovalScope()
  if ('error' in scope) return { error: scope.error }
  const { access, userId, congregationId } = scope

  // Biztonsági ellenőrzés: csak a saját gyülekezeted kérését hagyhatod jóvá
  const { data: existing } = await access.supabase
    .from('profile_congregations')
    .select('id, congregation_id, approval_status, profile_id')
    .eq('id', assignmentId)
    .maybeSingle()

  if (!existing) return { error: 'Kérés nem található.' }
  if (existing.congregation_id !== congregationId) {
    return { error: 'Csak a saját gyülekezeted kéréseit kezelheted.' }
  }
  if (existing.approval_status === 'approved') {
    return { error: 'Ez a kérés már jóvá van hagyva.' }
  }

  const { error } = await access.supabase
    .from('profile_congregations')
    .update({
      approval_status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: userId,
      active: true,
      // ha korábban rejected/revoked volt, ezeket nullázzuk
      revoked_at: null,
      revoked_by: null,
      revoked_reason: null,
    })
    .eq('id', assignmentId)

  if (error) return { error: `Hiba: ${error.message}` }

  // Értesítés az érintett könyvelőnek / számvevőnek
  await access.supabase.from('ertesitesek').insert({
    user_id: existing.profile_id,
    congregation_id: existing.congregation_id,
    cim: 'Hozzáférés jóváhagyva',
    uzenet:
      'A lelkész jóváhagyta a hozzáférésedet a gyülekezethez. Most már dolgozhatsz a pénzügyi modulban.',
    tipus: 'success',
    hivatkozas: '/penzugy',
  })

  await logAuditEvent({
    action: 'profile_congregation.approve',
    targetTable: 'profile_congregations',
    targetId: assignmentId,
    metadata: {
      profile_id: existing.profile_id,
      congregation_id: existing.congregation_id,
    },
  })

  revalidatePath('/profile/kapcsolatok')
  return { success: true }
}

/**
 * Kérés elutasítása (nem aktív, nem enged hozzáférést).
 */
export async function rejectAssignment(
  assignmentId: string,
  reason: string,
): Promise<{ success?: boolean; error?: string }> {
  const scope = await getPastorApprovalScope()
  if ('error' in scope) return { error: scope.error }
  const { access, congregationId } = scope

  const trimmed = (reason || '').trim()
  if (trimmed.length < 5) {
    return { error: 'Az elutasítás indoklása legalább 5 karakter legyen (a kérelmező számára).' }
  }

  const { data: existing } = await access.supabase
    .from('profile_congregations')
    .select('id, congregation_id, profile_id, approval_status')
    .eq('id', assignmentId)
    .maybeSingle()

  if (!existing) return { error: 'Kérés nem található.' }
  if (existing.congregation_id !== congregationId) {
    return { error: 'Csak a saját gyülekezeted kéréseit kezelheted.' }
  }

  const { error } = await access.supabase
    .from('profile_congregations')
    .update({
      approval_status: 'rejected',
      active: false,
      approval_reason: trimmed,  // az elutasítás indoklása ide kerül
    })
    .eq('id', assignmentId)

  if (error) return { error: `Hiba: ${error.message}` }

  await access.supabase.from('ertesitesek').insert({
    user_id: existing.profile_id,
    congregation_id: existing.congregation_id,
    cim: 'Hozzáférés elutasítva',
    uzenet: `A lelkész elutasította a hozzáférési kérést. Indok: "${trimmed}".`,
    tipus: 'warning',
    hivatkozas: '/profile',
  })

  await logAuditEvent({
    action: 'profile_congregation.reject',
    targetTable: 'profile_congregations',
    targetId: assignmentId,
    metadata: {
      profile_id: existing.profile_id,
      congregation_id: existing.congregation_id,
      reason: trimmed,
    },
  })

  revalidatePath('/profile/kapcsolatok')
  return { success: true }
}

/**
 * Korábban jóváhagyott hozzáférés visszavonása.
 * A lelkész bármikor visszavonhatja, amit korábban engedélyezett.
 */
export async function revokeAssignmentByPastor(
  assignmentId: string,
  reason: string,
): Promise<{ success?: boolean; error?: string }> {
  const scope = await getPastorApprovalScope()
  if ('error' in scope) return { error: scope.error }
  const { access, userId, congregationId } = scope

  const trimmed = (reason || '').trim()
  if (trimmed.length < 5) {
    return { error: 'A visszavonás indoklása legalább 5 karakter legyen.' }
  }

  const { data: existing } = await access.supabase
    .from('profile_congregations')
    .select('id, congregation_id, profile_id, approval_status')
    .eq('id', assignmentId)
    .maybeSingle()

  if (!existing) return { error: 'Kérés nem található.' }
  if (existing.congregation_id !== congregationId) {
    return { error: 'Csak a saját gyülekezeted kéréseit kezelheted.' }
  }
  if (existing.approval_status !== 'approved') {
    return { error: 'Csak jóváhagyott hozzáférést lehet visszavonni.' }
  }

  const { error } = await access.supabase
    .from('profile_congregations')
    .update({
      approval_status: 'revoked',
      active: false,
      revoked_at: new Date().toISOString(),
      revoked_by: userId,
      revoked_reason: trimmed,
    })
    .eq('id', assignmentId)

  if (error) return { error: `Hiba: ${error.message}` }

  await access.supabase.from('ertesitesek').insert({
    user_id: existing.profile_id,
    congregation_id: existing.congregation_id,
    cim: 'Hozzáférés visszavonva',
    uzenet: `A lelkész visszavonta a korábban adott hozzáférést. Indok: "${trimmed}".`,
    tipus: 'warning',
    hivatkozas: '/profile',
  })

  await logAuditEvent({
    action: 'profile_congregation.revoke',
    targetTable: 'profile_congregations',
    targetId: assignmentId,
    metadata: {
      profile_id: existing.profile_id,
      congregation_id: existing.congregation_id,
      reason: trimmed,
      revoked_by: 'pastor',
    },
  })

  revalidatePath('/profile/kapcsolatok')
  return { success: true }
}
