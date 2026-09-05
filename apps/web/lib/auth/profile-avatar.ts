import 'server-only'

import { cache } from 'react'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { resolveAvatarUrl } from '@/lib/auth/profile-avatar-shared'

export { resolveAvatarUrl, normalizeAvatarUrl, isAvatarSource } from '@/lib/auth/profile-avatar-shared'
export type { AvatarSource, AvatarForrasok } from '@/lib/auth/profile-avatar-shared'

/**
 * A bejelentkezett felhasználó megjelenítési célú profilfotója.
 *
 * 2026-09-05 (profil-kör D5): a feloldás EGY helyen él
 * (`profile-avatar-shared.ts` → `resolveAvatarUrl`), a
 * `pastor_profiles.avatar_source` döntéséből indulva. Korábban a metaadat
 * (Google `picture`) MEGELŐZTE a saját feltöltést, és a képet nem lehetett
 * eltávolítani — a részleteket lásd a shared modul fejlécében.
 *
 * FAIL-SOFT: ha a `pastor_profiles` nem olvasható (RLS, hiányzó tábla, a még
 * le nem futott `avatar_source` oszlop), az örökölt szabállyal — a metaadatból
 * — oldunk. Az érték SOHA nem használható jogosultsági döntéshez.
 */
export const getProfileAvatarUrl = cache(async (): Promise<string | null> => {
  const { user, supabase } = await getEffectiveAccessContext()
  if (!user) return null

  const metadataAvatarUrl = user.user_metadata?.avatar_url as string | undefined
  const picture = user.user_metadata?.picture as string | undefined

  // A `select('*')` szándékos: ha az `avatar_source` oszlop még nem létezik
  // élesben (a 2026-09-05-ös SQL előtt), egy nevesített select 400-at adna, és
  // a fejléc kép nélkül maradna. Így csak a mező hiányzik, a szabály az
  // örökölt ágra esik.
  const { data, error } = await supabase
    .from('pastor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  const row = error ? null : (data as { photo_url?: string | null; avatar_source?: string | null } | null)

  return resolveAvatarUrl({
    source: row?.avatar_source ?? null,
    photoUrl: row?.photo_url ?? null,
    metadataAvatarUrl,
    picture,
  })
})
