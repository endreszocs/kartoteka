import 'server-only'

/**
 * Broadcast címzettek lekérdezése a target_scope alapján.
 *
 * Minden fgv visszaadja a címzett profilok listáját: `{ id, email | null }`.
 * A `user_id` kerül a `ertesitesek.user_id`-be, az `email` a Resend-re.
 *
 * FIGYELEM: ez a fájl 'server-only' — csak szerveroldali kódból importálható.
 * A `ROLE_OPTIONS` konstans a `./types.ts`-ben található (kliens-biztos).
 */

import { createClient } from '@/lib/supabase/server'
import type { BroadcastComposeInput } from './types'

export interface RecipientRow {
  id: string
  email: string | null
}

export async function resolveBroadcastRecipients(
  input: BroadcastComposeInput,
): Promise<RecipientRow[]> {
  const supabase = await createClient()

  let query = supabase
    .from('profiles')
    .select('id, email')
    .eq('status', 'active')

  switch (input.targetScope) {
    case 'all':
      // Minden aktív felhasználó
      break
    case 'role':
      if (!input.targetRole) return []
      query = query.eq('role', input.targetRole)
      break
    case 'congregation':
      if (!input.targetCongregationIds || input.targetCongregationIds.length === 0) return []
      query = query.in('congregation_id', input.targetCongregationIds)
      break
    case 'diocese':
      if (!input.targetDioceseIds || input.targetDioceseIds.length === 0) return []
      // Két forrásból: profiles.diocese_id + congregations.diocese_id join személyekre
      // Egyszerűbb: két lekérdezés, unió a kliensen
      return await resolveDioceseRecipients(input.targetDioceseIds)
    case 'district':
      if (!input.targetDistrictIds || input.targetDistrictIds.length === 0) return []
      return await resolveDistrictRecipients(input.targetDistrictIds)
  }

  const { data, error } = await query
  if (error) {
    console.error('[broadcasts] recipients lekérdezés hiba:', error.message)
    return []
  }
  return (data || []) as RecipientRow[]
}

async function resolveDioceseRecipients(dioceseIds: string[]): Promise<RecipientRow[]> {
  const supabase = await createClient()

  // 1) profiles.diocese_id közvetlen (esperes, egyházmegyei admin)
  const { data: directDiocese } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('status', 'active')
    .in('diocese_id', dioceseIds)

  // 2) Az adott egyházmegyé(k)hez tartozó gyülekezetek lelkészei
  const { data: congsInDiocese } = await supabase
    .from('congregations')
    .select('id')
    .in('diocese_id', dioceseIds)

  const congIds = (congsInDiocese || []).map((c) => c.id as string)
  let fromCongregations: RecipientRow[] = []
  if (congIds.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('status', 'active')
      .in('congregation_id', congIds)
    fromCongregations = (data || []) as RecipientRow[]
  }

  return dedupe([...(directDiocese || []), ...fromCongregations] as RecipientRow[])
}

async function resolveDistrictRecipients(districtIds: string[]): Promise<RecipientRow[]> {
  const supabase = await createClient()

  // 1) profiles.district_id közvetlen (egyházkerületi admin)
  const { data: directDistrict } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('status', 'active')
    .in('district_id', districtIds)

  // 2) A kerület alá tartozó egyházmegyék
  const { data: diocesesInDistrict } = await supabase
    .from('dioceses')
    .select('id')
    .in('district_id', districtIds)

  const dioceseIds = (diocesesInDistrict || []).map((d) => d.id as string)
  const fromDiocese = dioceseIds.length > 0 ? await resolveDioceseRecipients(dioceseIds) : []

  return dedupe([...(directDistrict || []), ...fromDiocese] as RecipientRow[])
}

function dedupe(rows: RecipientRow[]): RecipientRow[] {
  const map = new Map<string, RecipientRow>()
  for (const r of rows) {
    if (r.id) map.set(r.id, r)
  }
  return [...map.values()]
}

