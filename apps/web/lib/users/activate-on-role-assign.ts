import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'
import type { ProfileRoleScope } from '@/lib/profile-roles/types'

export interface ActivationResult {
  activated: boolean
  previousStatus: string | null
  setFields: {
    congregation_id?: string
    diocese_id?: string
    district_id?: string
  }
}

export async function activateAccountOnRoleAssign(
  profileId: string,
  scope: ProfileRoleScope,
  scopeId: string | null,
  client?: SupabaseClient,
): Promise<ActivationResult> {
  const supabase = client ?? (await createClient())

  // FIX 2026-05-04 (RLS-bug): a profiles status-update-eket service-role klienssel
  // végezzük, mert a regular session-kliens a kerületi adminnak gyakran nem ad
  // engedélyt másik user status-mezőjének írására (RLS policy szigorítás miatt).
  // A JS-szintű requireMasterAdmin / requireAdminAccess már védett.
  let writeClient: SupabaseClient
  try {
    writeClient = getSupabaseAdminClient()
  } catch {
    writeClient = supabase // fallback ha service-role kulcs nincs
  }

  const { data: profile, error: readErr } = await supabase
    .from('profiles')
    .select('status, full_name, email, congregation_id, diocese_id, district_id')
    .eq('id', profileId)
    .maybeSingle()

  if (readErr || !profile) {
    return { activated: false, previousStatus: null, setFields: {} }
  }

  const previousStatus = (profile.status as string | null) ?? null

  if (previousStatus !== 'pending') {
    return { activated: false, previousStatus, setFields: {} }
  }

  const setFields: ActivationResult['setFields'] = {}

  if (scope === 'congregation' && scopeId) {
    setFields.congregation_id = scopeId
    try {
      const { data: cong } = await supabase
        .from('congregations')
        .select('diocese_id, dioceses:diocese_id(district_id)')
        .eq('id', scopeId)
        .maybeSingle()
      const dioceseId = (cong?.diocese_id as string | null) || null
      const districtId =
        ((cong?.dioceses as { district_id?: string | null } | null)?.district_id as string | null) ||
        null
      if (dioceseId) setFields.diocese_id = dioceseId
      if (districtId) setFields.district_id = districtId
    } catch {
      // best-effort, a fő status='active' attól függetlenül megtörténik
    }
  } else if (scope === 'diocese' && scopeId) {
    setFields.diocese_id = scopeId
    try {
      const { data: dio } = await supabase
        .from('dioceses')
        .select('district_id')
        .eq('id', scopeId)
        .maybeSingle()
      const districtId = (dio?.district_id as string | null) || null
      if (districtId) setFields.district_id = districtId
    } catch {
      // best-effort
    }
  } else if (scope === 'district' && scopeId) {
    setFields.district_id = scopeId
  }

  const updatePayload: Record<string, unknown> = { status: 'active', ...setFields }

  // FONTOS: a Supabase JS SDK 2.x alapértelmezetten NEM ad vissza count-ot az
  // .update()-nél. A `.select('id')` viszont visszaadja a frissített sorokat,
  // így pontosan tudjuk, hogy az update tényleg végrehajtódott-e (a filter
  // matchelt-e). A korábbi `if (!count)` mindig `true`-t adott (count: undefined),
  // így az activate flow csendben failelt — pedig az update lefutott.
  const { error: updateErr, data: updated } = await writeClient
    .from('profiles')
    .update(updatePayload)
    .eq('id', profileId)
    .eq('status', 'pending')
    .select('id')

  if (updateErr) {
    console.warn(`[ACTIVATE] profile-update hibája (${profileId}): ${updateErr.message}`)
    return { activated: false, previousStatus, setFields: {} }
  }

  if (!updated || updated.length === 0) {
    // A filter nem matchelt — pl. a status időközben már nem 'pending'
    return { activated: false, previousStatus, setFields: {} }
  }

  try {
    await supabase.from('ertesitesek').insert({
      user_id: profileId,
      tipus: 'success',
      cim: 'Hozzáférése aktiválva',
      uzenet:
        'A rendszergazda jóváhagyta hozzáférését, és szerepkört is rendelt a fiókjához. Mostantól bejelentkezhet a Kartoteka rendszerbe.',
      olvasva: false,
    })
  } catch {
    // ertesitesek best-effort — a fő aktiválás sikeres
  }

  return { activated: true, previousStatus, setFields }
}
