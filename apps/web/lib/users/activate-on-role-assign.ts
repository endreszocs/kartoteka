import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'
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

  // A scope-szerinti propagálandó mezők előkészítése (a SECURITY DEFINER RPC
  // COALESCE-szel csak akkor írja át, ha NEM null).
  let p_congregation_id: string | null = null
  let p_diocese_id: string | null = null
  let p_district_id: string | null = null

  if (scope === 'congregation' && scopeId) {
    p_congregation_id = scopeId
    try {
      const { data: cong } = await supabase
        .from('congregations')
        .select('diocese_id, dioceses:diocese_id(district_id)')
        .eq('id', scopeId)
        .maybeSingle()
      p_diocese_id = (cong?.diocese_id as string | null) || null
      p_district_id =
        ((cong?.dioceses as { district_id?: string | null } | null)?.district_id as string | null) ||
        null
    } catch {
      // best-effort
    }
  } else if (scope === 'diocese' && scopeId) {
    p_diocese_id = scopeId
    try {
      const { data: dio } = await supabase
        .from('dioceses')
        .select('district_id')
        .eq('id', scopeId)
        .maybeSingle()
      p_district_id = (dio?.district_id as string | null) || null
    } catch {
      // best-effort
    }
  } else if (scope === 'district' && scopeId) {
    p_district_id = scopeId
  }

  // FIX 2026-05-04: SECURITY DEFINER RPC használata a GRANT/RLS megkerüléséhez.
  const { data: rpcRes, error: rpcErr } = await supabase
    .rpc('admin_activate_user', {
      p_user_id: profileId,
      p_congregation_id,
      p_diocese_id,
      p_district_id,
    })
    .single()

  if (rpcErr) {
    console.warn(`[ACTIVATE] admin_activate_user RPC hiba (${profileId}): ${rpcErr.message}`)
    return { activated: false, previousStatus: null, setFields: {} }
  }

  const result = rpcRes as
    | { user_id: string; previous_status: string; new_status: string; was_updated: boolean }
    | null

  if (!result || !result.was_updated) {
    return { activated: false, previousStatus: result?.previous_status ?? null, setFields: {} }
  }

  // Sikeres aktiválás — pasztorális értesítés (best-effort)
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

  const setFields: ActivationResult['setFields'] = {}
  if (p_congregation_id) setFields.congregation_id = p_congregation_id
  if (p_diocese_id) setFields.diocese_id = p_diocese_id
  if (p_district_id) setFields.district_id = p_district_id

  return { activated: true, previousStatus: result.previous_status, setFields }
}
