import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'
import { feladoMezok } from '@/lib/notifications/felado'
import { insertErtesites } from '@/lib/notifications/ertesites-insert'
import {
  ROLE_LABELS,
  SCOPE_LABELS,
  type ProfileRoleScope,
  type ProfileRoleType,
} from '@/lib/profile-roles/types'

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
  /** A kiosztott szerepkör — az értesítő üzenethez (opcionális, best-effort). */
  role?: ProfileRoleType,
  /** Egyedi szerepkör-címke (ha role === 'custom'). */
  customLabel?: string | null,
): Promise<ActivationResult> {
  const supabase = client ?? (await createClient())

  // A scope-szerinti propagálandó mezők előkészítése (a SECURITY DEFINER RPC
  // COALESCE-szel csak akkor írja át, ha NEM null).
  let p_congregation_id: string | null = null
  let p_diocese_id: string | null = null
  let p_district_id: string | null = null
  // Az értesítő üzenethez: a hely (gyülekezet/egyházmegye/egyházkerület) neve.
  let scopeName: string | null = null

  if (scope === 'congregation' && scopeId) {
    p_congregation_id = scopeId
    try {
      const { data: cong } = await supabase
        .from('congregations')
        .select('nev_hu, name, diocese_id, dioceses:diocese_id(district_id)')
        .eq('id', scopeId)
        .maybeSingle()
      scopeName =
        (cong?.nev_hu as string | null) || (cong?.name as string | null) || null
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
        .select('name, district_id')
        .eq('id', scopeId)
        .maybeSingle()
      scopeName = (dio?.name as string | null) || null
      p_district_id = (dio?.district_id as string | null) || null
    } catch {
      // best-effort
    }
  } else if (scope === 'district' && scopeId) {
    p_district_id = scopeId
    try {
      const { data: dis } = await supabase
        .from('districts')
        .select('name')
        .eq('id', scopeId)
        .maybeSingle()
      scopeName = (dis?.name as string | null) || null
    } catch {
      // best-effort
    }
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

  const setFields: ActivationResult['setFields'] = {}
  if (p_congregation_id) setFields.congregation_id = p_congregation_id
  if (p_diocese_id) setFields.diocese_id = p_diocese_id
  if (p_district_id) setFields.district_id = p_district_id

  // 2026-08-09 (scope-divergencia diagnosztika): a 2026-07-01-es
  // admin_activate_user már AKTÍV fióknál is beírja a megadott org-mezőket
  // (profiles.diocese_id / district_id skalár-szinkron) — ez zárja a
  // "szerepkör kiosztva, de a skalár NULL/régi maradt" hibaosztályt, ami a
  // diocese/district felületeken szűretlen lekérdezéshez vezetett (lásd
  // lib/auth/level-scope.ts). Ilyenkor was_updated=true, de NEM történt
  // aktiválás — üdvözlő értesítést NEM küldünk, csak a setFields-et
  // jelentjük vissza.
  if (result.previous_status !== 'pending') {
    return { activated: false, previousStatus: result.previous_status, setFields }
  }

  // Sikeres aktiválás — pasztorális, személyre szabott értesítés (best-effort).
  // Tartalmazza: a felhasználó nevét + üdvözlést, a kiosztott szerepkört és a
  // helyet, és ha több profilja van, a profilváltás helyét (header).
  try {
    // Felhasználó neve + profilok száma (a profilváltás-tipphez)
    const [{ data: prof }, { count: roleCount }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', profileId).maybeSingle(),
      supabase
        .from('profile_roles')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId),
    ])

    const fullName = (prof?.full_name as string | null)?.trim() || null
    const greetingName = fullName || 'Testvérünk'

    const roleLabel =
      role === 'custom'
        ? customLabel?.trim() || ROLE_LABELS.custom
        : role
          ? ROLE_LABELS[role]
          : null
    const scopeKind = scope !== 'system' ? SCOPE_LABELS[scope] : null

    // A szerepkör + hely sor összeállítása
    let roleLine = ''
    if (roleLabel && scopeName && scopeKind) {
      roleLine = `\n\nA fiókjához rendelt szerepkör: ${roleLabel} — ${scopeKind}: ${scopeName}.`
    } else if (roleLabel) {
      roleLine = `\n\nA fiókjához rendelt szerepkör: ${roleLabel}.`
    }

    const hasMultipleProfiles = (roleCount ?? 0) > 1
    const profileSwitchLine = hasMultipleProfiles
      ? '\n\nMivel több hozzáférése (szerepköre) is van, a fejlécben — jobbra fent, a nevére kattintva — bármikor válthat a profiljai között.'
      : ''

    const uzenet =
      `Kedves ${greetingName}! Szeretettel üdvözöljük a Kartotéka rendszer felhasználói között! 🎉\n\n` +
      `A rendszergazda jóváhagyta a hozzáférését, és szerepkört rendelt a fiókjához — mostantól bejelentkezhet és használhatja a rendszert.` +
      roleLine +
      profileSwitchLine

    // A feladó a kiosztó rendszergazda (a hívó kliens felhasználója) — best-effort:
    // ha nem oldható fel, a „Rendszergazda" címke marad, azonosító nélkül.
    let admin: { id: string; nev: string | null } | null = null
    try {
      const {
        data: { user: kioszto },
      } = await supabase.auth.getUser()
      if (kioszto?.id) {
        const { data: adminProfil } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', kioszto.id)
          .maybeSingle()
        admin = { id: kioszto.id, nev: (adminProfil?.full_name as string | null) ?? null }
      }
    } catch {
      // A feladó neve nem kritikus.
    }

    await insertErtesites(
      supabase,
      {
        user_id: profileId,
        tipus: 'success',
        cim: 'Üdvözöljük a Kartotékában! 🎉',
        uzenet,
        olvasva: false,
        ...feladoMezok('rendszergazda', admin?.nev ?? null, admin?.id ?? null),
      },
      { forras: 'aktivalas-szerepkorrel' },
    )
  } catch (e) {
    // A fő aktiválás sikeres — de a hallgatás tilos.
    console.warn('[activate-on-role-assign] az üdvözlő értesítés nem ment ki:', e instanceof Error ? e.message : e)
  }

  return { activated: true, previousStatus: result.previous_status, setFields }
}
